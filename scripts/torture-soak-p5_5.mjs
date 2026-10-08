import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const base = 'http://127.0.0.1:5173';
const payload = JSON.parse(await readFile(process.env.VJ_SOAK_PAYLOAD ?? '.ggjavaez/qa/v12-p5_5/payloads/02-arrays-cycles-collections.json', 'utf8'));
const durationMs = Number(process.env.VJ_SOAK_MS ?? 180000);
const output = process.env.VJ_SOAK_OUTPUT ?? 'docs/checkpoints/v12-p5_5/soak';
const endpoint = `http://127.0.0.1:8787/api/execution/${payload.id}`;
const snapshot = await (await fetch(`${endpoint}?transport=delta`)).json();
if(snapshot.id!==payload.id||!['COMPLETED','FAILED'].includes(snapshot.phase)) throw new Error('An actual retained terminal backend session is required; this probe never builds or launches Java');
await mkdir(output,{recursive:true});
const distribution = values => {
  const sorted=[...values].sort((a,b)=>a-b);
  return {samples:sorted.length,p50Ms:sorted[Math.ceil(sorted.length*.5)-1]??null,p95Ms:sorted[Math.ceil(sorted.length*.95)-1]??null,minMs:sorted[0]??null,maxMs:sorted.at(-1)??null};
};
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),payload.projectId);
  await page.route('**/api/execution/current?transport=delta', async route=>route.fulfill({response:await route.fetch({url:`${endpoint}?transport=delta`})}));
  // Isolate world rendering from JDT provisioning/indexing. Raw transport and
  // source/tree reads still use the real retained session and managed project.
  await page.route(`**/api/projects/${payload.projectId}/language/**`, route=>route.fulfill({json:route.request().url().endsWith('/notify')?{ok:true}:{projectId:payload.projectId,generation:1,status:'unavailable',message:'Renderer probe excludes JDT',diagnostics:[],metrics:{}}}));
  const started=performance.now();await page.goto(`${base}/ide`);
  const slider=page.getByRole('slider',{name:'Scrub execution'}), picker=page.getByRole('combobox',{name:'Select runtime entity'});
  await expect(picker).toContainText(payload.recording.state==='FULL'?'main() · completed':'main() · last recorded',{timeout:60000});
  let previous='',stable=0;
  for(let i=0;i<60&&stable<4;i++){const value=await slider.getAttribute('max');stable=value===previous?stable+1:0;previous=value;await page.waitForTimeout(200)}
  if(stable<4)throw new Error('Timeline did not settle');
  const max=Number(previous),loadMs=performance.now()-started;
  await slider.fill(String(max));
  const close=page.getByRole('button',{name:'Collapse bottom panel',exact:true});if(await close.count())await close.click();
  const choices=await picker.locator('option').evaluateAll(nodes=>nodes.map(node=>({value:node.value,label:node.textContent??''})).filter(node=>node.value));
  const preferred=choices.filter(node=>/Node #|int\[\] #|ArrayList #/.test(node.label));
  const subjects=preferred.length?preferred:choices;
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('HeapProfiler.enable');
  async function heap(){await cdp.send('HeapProfiler.collectGarbage');const metrics=await cdp.send('Performance.getMetrics');return Object.fromEntries(metrics.metrics.filter(item=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','JSEventListeners','TaskDuration'].includes(item.name)).map(item=>[item.name,item.value]))}
  const memoryBefore=await heap();
  const twoFrames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const seeks=[],focus=[],home=[],snapshots=[];let seed=173;
  for(let i=0;i<30;i++){
    seed=(seed*1664525+1013904223)>>>0;const cursor=1+seed%Math.max(1,max-1),start=performance.now();
    await slider.fill(String(cursor));await expect(page.locator('.vj-timeline__count')).toContainText(`${cursor} / ${max}`);await twoFrames();seeks.push({cursor,ms:performance.now()-start});
  }
  await slider.fill(String(max));await page.getByRole('button',{name:'Overview',exact:true}).click();await page.waitForTimeout(800);
  await page.screenshot({path:`${output}/dense-overview-1440x900.png`});
  await page.evaluate(()=>{window.__VJ_QA_RENDER_METRICS__=false;window.__VJ_QA_FRAME_PROBE__=true});
  const soakStart=performance.now();let actions=0,commands=0;
  while(performance.now()-soakStart<durationMs){
    if(actions%12===0){
      await slider.fill(String(max));await picker.selectOption(subjects[commands%subjects.length].value);
      const start=performance.now();await page.getByRole('complementary',{name:'Runtime inspector'}).getByRole('button',{name:'Focus',exact:true}).click();await twoFrames();focus.push(performance.now()-start);
      await page.waitForTimeout(550);commands++;
    }else if(actions%12===6){
      const returnButton=page.getByRole('button',{name:'Return to world',exact:true});if(await returnButton.count())await returnButton.click();
      const start=performance.now();await page.getByRole('button',{name:'Overview',exact:true}).click();await twoFrames();home.push(performance.now()-start);await page.waitForTimeout(550);
    }else if(actions%12===9){
      seed=(seed*1664525+1013904223)>>>0;await slider.fill(String(1+seed%Math.max(1,max-1)));await twoFrames();
    }else {
      const box=await page.locator('.spatial-view canvas').boundingBox();
      await page.mouse.move(box.x+box.width*.25,box.y+box.height*.4);await page.mouse.down();
      await page.mouse.move(box.x+box.width*.25+(actions%2?24:-24),box.y+box.height*.4+8,{steps:4});await page.mouse.up();
      await page.mouse.wheel(0,actions%4<2?-50:50);await twoFrames();
    }
    actions++;
    if(actions%60===0){
      const frame=await page.evaluate(()=>window.__VJ_FRAME_PROBE__);
      snapshots.push({elapsedMs:performance.now()-soakStart,actions,renders:frame?.renders,renderer:frame?.renderer});
      console.log(JSON.stringify(snapshots.at(-1)));
    }
  }
  const measuredMs=performance.now()-soakStart,probe=await page.evaluate(()=>window.__VJ_FRAME_PROBE__);
  await page.evaluate(()=>{window.__VJ_QA_FRAME_PROBE__=false;window.__VJ_QA_RENDER_METRICS__=true});
  await slider.fill(String(max));await picker.selectOption('');const returnButton=page.getByRole('button',{name:'Return to world',exact:true});if(await returnButton.count())await returnButton.click();
  await page.getByRole('button',{name:'Overview',exact:true}).click();await page.waitForTimeout(800);
  const renderer=await page.evaluate(()=>window.__VJ_RENDER_METRICS__),memoryAfter=await heap();
  const resources=[];
  // Revisit the same accepted session without reexecuting Java. Reload release
  // is reported separately from within-page camera/LOD residency, not hidden.
  for(let i=0;i<5;i++){
    await page.reload();await expect(picker).toContainText('main() · completed',{timeout:60000});await slider.fill(String(max));
    await picker.selectOption(subjects[i%subjects.length].value);await page.getByRole('complementary',{name:'Runtime inspector'}).getByRole('button',{name:'Focus',exact:true}).click();await page.waitForTimeout(700);
    await page.evaluate(()=>{window.__VJ_QA_RENDER_METRICS__=true});
    await page.getByRole('complementary',{name:'Runtime inspector'}).getByRole('button',{name:'Focus',exact:true}).click();await twoFrames();
    await expect.poll(()=>page.evaluate(()=>Boolean(window.__VJ_RENDER_METRICS__)),{timeout:5000}).toBe(true);
    resources.push({iteration:i+1,heap:await heap(),renderer:await page.evaluate(()=>window.__VJ_RENDER_METRICS__)});
  }
  await page.screenshot({path:`${output}/dense-focus-1440x900.png`});
  const report={recordedAt:new Date().toISOString(),sessionId:payload.id,projectId:payload.projectId,rawEvents:snapshot.rawEventCount,normalizedEvents:max,recording:snapshot.recording,
    viewport:{width:1440,height:900,dpr:1},loadMs,measuredMs,actions,seek:distribution(seeks.map(item=>item.ms)),seekSamples:seeks,focus:distribution(focus),home:distribution(home),
    frame:probe?{renders:probe.renders,cpu:distribution(probe.cpuMs),demandIntervals:distribution(probe.intervalsMs),gpuTimer:probe.gpuTimer,gpu:distribution(probe.gpuMs),gpuDisjointDrops:probe.gpuDisjointDrops,renderer:probe.renderer}:null,
    snapshots,memoryBefore,memoryAfter,resources,renderer,errors,
    method:'Actual accepted terminal backend session, redirected only current-session discovery. No new Java or build. JDT excluded. 30 seeded action/UI/two-rAF seek samples; Focus/Home action timings exclude deliberate choreography settling. Continuous repeated orbit/dolly, Focus/Home and seeks for measuredMs. RendererMetrics traversal disabled during timing. Development render probe uses bounded 4096-entry rings and at most eight asynchronous GPU timer queries; no synchronous GPU waits. Render CPU is WebGL submission only, GPU query is elapsed GPU commands, neither measures physical presentation. Demand-render intervals include UI automation, intentional choreography and idle gaps and are not FPS. Explicit CDP GC reports whole frontend heap, not GPU bytes or isolated semantic retention. Five reloads exercise reload cleanup, not same-document session replacement. Resource counts are actual allocated objects, not texture-memory byte estimates.'};
  await writeFile(`${output}/performance.json`,JSON.stringify(report,null,2)+'\n');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({output,loadMs,measuredMs,actions,frame:report.frame,seek:report.seek,memoryBefore,memoryAfter}));
}finally{await browser.close()}
