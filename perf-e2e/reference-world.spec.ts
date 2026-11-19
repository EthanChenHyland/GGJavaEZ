import {withinMillisecondBudget} from '../src/qa/millisecondBudget'
import {expect, test, type APIRequestContext, type Page} from '@playwright/test'
import {createHash, randomUUID} from 'node:crypto'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {performance} from 'node:perf_hooks'
import {resolve} from 'node:path'
import type {ExecutionSession} from '../src/execution/contracts'
import type {FramePerformanceSample} from '../src/qa/framePerformance'
import type {} from '../src/qa/worldObservation'
import {normalizeTrace} from '../src/instrumentation/normalize'
import {historyForTrace} from '../src/runtime/history'
import {browserErrors, home, ready, seekCursor, selectEntity} from '../e2e/reference/harness'

// Opt-in, serial, real-JVM browser evidence. Never route/fulfill backend responses,
// import old events, or invoke runtime/camera/selection/clock setters.
const output = resolve('.ggjavaez/qa/reference-exact')
const sourcePayload = '.ggjavaez/qa/v12-p5_5/payloads/02-arrays-cycles-collections.json'
const sourceHash = '97e6a390f5349cb8a474d5ff2f5de3104bad8c3f86f46fea43ad4b9e841b10da'
const viewports = [
  {width:1728,height:1117}, {width:1440,height:900}, {width:1280,height:800},
  {width:760,height:900}, {width:1440,height:650},
] as const
const activePhases = ['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED']
type Source = ExecutionSession['sourceManifest']['sources'][number]
type Status = 'PENDING'|'PASS'|'BUDGET_EXCEEDED'|'NOT_MEASURED'
interface Budget {
  id:string; stage:string; budget:number; unit:string; baseline:number|null
  requiredForBrowserGate:boolean; status:Status; measured:number|null
  reason:string|null; cause:string|null; mitigationDecision:string|null
}
interface ActionSample {ms:number; cursor?:number; targetId?:string; rendererFrame:number; timing?:{commandMs:number;uiCommitMs:number;compositionMs:number}}
interface ResourceObservation {url:string;type:string;status:number|null;contentLength:string|null;failure:string|null}

function distribution(values:readonly number[]) {
  const sorted = [...values].sort((a,b)=>a-b)
  const percentile = (fraction:number) => sorted[Math.max(0,Math.ceil(sorted.length*fraction)-1)] ?? null
  return {samples:sorted.length,p50Ms:percentile(.5),p95Ms:percentile(.95),minMs:sorted[0]??null,maxMs:sorted.at(-1)??null}
}
async function mountedReady(page:Page) {
  await expect.poll(()=>page.evaluate(()=>typeof window.__ggjavaezQA?.ready==='function'
    && typeof window.__ggjavaezWorld?.framePerformance==='function'),{timeout:60_000}).toBe(true)
  await ready(page)
}
// Matches the baseline command/UI/two-rAF boundary. It does not claim physical
// display presentation or wait for the 600–1200 ms camera choreography.
async function firstCompositionBoundary(page:Page) {
  return page.evaluate(()=>new Promise<{cursor:number;rendererFrame:number;focusId:string|null;selectionId:string|null}>(done=>
    requestAnimationFrame(()=>requestAnimationFrame(()=>done({
      cursor:window.__ggjavaezWorld!.scene().cursor,
      rendererFrame:window.__ggjavaezWorld!.renderer().frame,
      focusId:window.__ggjavaezQA!.focusTarget()?.targetId??null,
      selectionId:window.__ggjavaezWorld!.selection()?.id??null,
    }))),
  ))
}
function observeResources(page:Page) {
  const records:ResourceObservation[] = []
  const requests = new Map<import('@playwright/test').Request,ResourceObservation>()
  page.on('request',request=>{
    const record={url:request.url(),type:request.resourceType(),status:null,contentLength:null,failure:null}
    records.push(record);requests.set(request,record)
  })
  page.on('response',response=>{
    const record=requests.get(response.request())
    if(record){record.status=response.status();record.contentLength=response.headers()['content-length']??null}
  })
  page.on('requestfailed',request=>{const record=requests.get(request);if(record)record.failure=request.failure()?.errorText??'unknown'})
  return records
}
async function metadata(request:APIRequestContext):Promise<ExecutionSession|null> {
  const response=await request.get('/api/execution/current?transport=delta')
  expect(response.ok()).toBe(true);return response.json()
}
async function retainedWorld(page:Page,session:ExecutionSession,normalizedCount?:number) {
  await expect.poll(()=>page.evaluate(()=>typeof window.__ggjavaezQA?.ready==='function'),{timeout:60_000}).toBe(true)
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA?.appState().dimensions.view.recordingId??null),{timeout:60_000})
    .toBe(`execution:${session.id}`)
  const slider=page.getByRole('slider',{name:'Recorded execution position',exact:true})
  await expect(slider).toHaveAttribute('aria-valuemax',normalizedCount===undefined?/^[1-9]\d*$/:String(normalizedCount),{timeout:60_000})
  await mountedReady(page)
  await slider.focus();await page.keyboard.press('End')
  await expect.poll(()=>page.evaluate(()=>{const scene=window.__ggjavaezWorld?.scene();return !!scene&&scene.cursor===scene.liveHead&&scene.liveHead>0})).toBe(true)
  await ready(page)
  const head=await page.evaluate(()=>{
    const world=window.__ggjavaezWorld!,scene=world.scene()
    return {recordingId:scene.recordingId,cursor:scene.cursor,liveHead:scene.liveHead,
      normalizedEvents:world.recordedEvents().length,quality:world.quality(),probeAvailable:world.framePerformance()!==null,
      counts:{frames:scene.order.frames.length,objects:scene.order.objects.length,classes:scene.order.classes.length}}
  })
  expect(head.recordingId).toBe(`execution:${session.id}`);expect(head.cursor).toBe(head.normalizedEvents)
  expect(head.quality.setting).toBe('INTERACTIVE');expect(head.quality.active).toBe('INTERACTIVE');expect(head.probeAvailable).toBe(true)
  return head
}
async function closeInspector(page:Page) {
  const close=page.getByRole('complementary',{name:'Selection inspector',exact:true}).getByRole('button',{name:'Close inspector',exact:true})
  if(await close.count())await close.click()
}
async function timedSeek(page:Page,cursor:number,maximum:number):Promise<ActionSample> {
  await ready(page)
  const slider=page.getByRole('slider',{name:'Recorded execution position',exact:true})
  const started=performance.now()
  // The Phase 5.5 baseline fills the actual public HTML range control. This
  // keeps one seek command rather than adding pixel-rounding keyboard seeks.
  await slider.fill(String(cursor))
  const commanded=performance.now()
  await expect(slider).toHaveAttribute('aria-valuenow',String(cursor))
  await expect(page.getByRole('region',{name:'Execution timeline',exact:true})).toHaveAttribute('data-cursor',String(cursor))
  const committed=performance.now(),boundary=await firstCompositionBoundary(page),finished=performance.now(),ms=finished-started
  expect(boundary.cursor).toBe(cursor)
  expect(Number(await slider.getAttribute('aria-valuemax'))).toBe(maximum)
  return {cursor,ms,rendererFrame:boundary.rendererFrame,timing:{commandMs:commanded-started,uiCommitMs:committed-commanded,compositionMs:finished-committed}}
}

/** Actual accessible catalog -> optional actual Cluster member -> Inspector.
 * A hidden/off-screen body must be reached through native exploration. */
async function selectArrayOwner(page:Page,id:string) {
  await home(page)
  for(let attempt=0;attempt<16;attempt++){
    const choices=await page.evaluate(owner=>{
      const plan=window.__ggjavaezWorld!.plan()
      return {direct:plan.entities.get(owner)?.pickable===true,
        clusters:plan.clusters.filter(cluster=>cluster.pickable&&cluster.memberIds.includes(owner)).map(cluster=>cluster.id)}
    },id)
    const candidates=[...(choices.direct?[id]:[]),...choices.clusters]
    for(const candidate of candidates){
      // Only use a candidate currently offered by the real keyboard catalog.
      // First Tab selects its first actual item; ArrowDown exposes virtual pages.
      await page.locator('.world-canvas').focus();await page.keyboard.press('Escape')
      await page.locator('.world-canvas').focus();await page.keyboard.press('Tab')
      const list=page.getByRole('listbox',{name:'Runtime entities',exact:true})
      if(!await list.evaluate(node=>node===document.activeElement))continue
      const maximum=Number(await list.getByRole('option').first().getAttribute('aria-setsize'))
      for(let index=0;index<maximum;index++){
        const offered=await list.locator(`[id="world-entity-${encodeURIComponent(candidate)}"]`).count()
        if(offered){await selectEntity(page,candidate);await ready(page);break}
        await page.keyboard.press('ArrowDown');await firstCompositionBoundary(page)
      }
      if(await page.evaluate(target=>window.__ggjavaezWorld!.selection()?.id===target,candidate)){
        if(candidate!==id){
          const sceneNode=await page.evaluate(owner=>window.__ggjavaezWorld!.scene().entities[owner],id)
          if(sceneNode.kind!=='array')throw new Error('Captured array owner is no longer present')
          const members=page.getByRole('list',{name:'Cluster members',exact:true})
          const member=members.getByRole('button',{name:`Select ${sceneNode.title} #${sceneNode.displayId}`,exact:true})
          for(let scroll=0;!await member.count()&&scroll<32;scroll++){
            await members.hover();await page.mouse.wheel(0,208);await firstCompositionBoundary(page)
          }
          await member.click();await ready(page)
        }
        expect(await page.evaluate(()=>window.__ggjavaezWorld!.selection()?.id)).toBe(id)
        return
      }
    }
    await closeInspector(page);await page.locator('.world-canvas').focus();await page.keyboard.press('-');await ready(page)
  }
  throw new Error(`Captured array ${id} cannot be reached through actual visible bodies/clusters and native exploration`)
}
async function revealCapturedCell(page:Page,index:number,slotId:string) {
  const inspector=page.getByRole('complementary',{name:'Selection inspector',exact:true})
  const list=inspector.getByRole('list',{name:'Recorded values',exact:true})
  const reveal=list.getByRole('button',{name:`Reveal index ${index}`,exact:true})
  for(let attempt=0;!await reveal.count()&&attempt<32;attempt++){
    // Read physical scroll position, then scroll with real wheel input. No DOM
    // scrollTop assignments and no synthesized selection or unobserved cell.
    const position=await list.evaluate(node=>{
      const row=node.querySelector('[role="listitem"]')!
      return {top:node.scrollTop,rowHeight:row.getBoundingClientRect().height}
    })
    await list.hover();await page.mouse.wheel(0,Math.max(-520,Math.min(520,index*position.rowHeight-position.top)))
    await firstCompositionBoundary(page)
  }
  await reveal.click();await ready(page)
  expect(await page.evaluate(()=>window.__ggjavaezWorld!.selection())).toEqual({kind:'slot',id:slotId})
}
async function boundarySnapshot(page:Page) {
  return page.evaluate(()=>{
    const world=window.__ggjavaezWorld!,scene=world.scene(),atMs=performance.now(),probe=world.framePerformance()
    if(!probe)throw new Error('Whole-owner frame probe is unavailable; perf=1 and guarded root integration are required')
    return {atMs,probe,quality:world.quality(),pose:window.__ggjavaezQA!.cameraPose(),
      facts:{recordingId:scene.recordingId,cursor:scene.cursor,liveHead:scene.liveHead,
        anchors:Object.fromEntries(Object.entries(scene.entities).map(([id,node])=>[id,node.anchor]))}}
  })
}
async function orbitWindow(page:Page,minimumMs:number) {
  await ready(page)
  const surface=await page.evaluate(()=>{
    const safe=window.__ggjavaezQA!.shellRects().safeFrame
    const point={x:safe.x+safe.width*.6,y:safe.y+safe.height*.6}
    return {safe,point,hitWorld:!!document.elementFromPoint(point.x,point.y)?.closest('.world-canvas'),dpr:devicePixelRatio}
  })
  expect(surface.hitWorld,'Safe Frame orbit point must reach the actual World').toBe(true)
  const amplitudeX=Math.min(70,surface.safe.width*.12),amplitudeY=Math.min(18,surface.safe.height*.1)
  expect(amplitudeX).toBeGreaterThan(4)
  await page.mouse.move(surface.point.x,surface.point.y)
  const start=await boundarySnapshot(page),started=performance.now()
  let moves=0,end:Awaited<ReturnType<typeof boundarySnapshot>>|null=null
  await page.mouse.down()
  try {
    // Each move is native pointer input. Do not serialize a separate rAF RPC
    // after it: that would throttle event delivery to roughly every other
    // display frame. Actual render-owner samples still define frame cadence.
    // The additional 500 ms allows the actual first-to-last window to reach the
    // required duration. A short measured span still fails; it is not waived.
    while(performance.now()-started<minimumMs+500){
      moves++
      const elapsed=performance.now()-started
      await page.mouse.move(surface.point.x+Math.sin(elapsed*.0036)*amplitudeX,surface.point.y+Math.sin(elapsed*.00219)*amplitudeY)
    }
    end=await boundarySnapshot(page)
  } finally {await page.mouse.up()}
  const samples=end.probe.samples.filter(sample=>sample.id>start.probe.submittedFrames
    && sample.frameStartedAtMs>=start.atMs&&sample.frameStartedAtMs<=end.atMs)
  const first=samples[0],last=samples.at(-1)
  const intervals=samples.slice(1).flatMap(sample=>sample.displayFrameIntervalMs===null?[]:[sample.displayFrameIntervalMs])
  // Preserve every CPU/GPU/call record. Only the first interval, whose previous
  // display frame lies outside the active gesture, is excluded from percentiles.
  return {minimumMs,surface,start,end,moves,hostGestureMs:performance.now()-started,samples,
    firstFrameAtMs:first?.frameStartedAtMs??null,lastFrameAtMs:last?.frameStartedAtMs??null,
    measuredFrameSpanMs:first&&last?last.frameStartedAtMs-first.frameStartedAtMs:0,
    firstIntervalExcluded:first?{id:first.id,intervalMs:first.displayFrameIntervalMs,reason:'Previous display frame is outside the explicit native gesture window'}:null,
    expectedSubmissions:end.probe.submittedFrames-start.probe.submittedFrames,
    intervals:distribution(intervals),cpu:distribution(samples.map(sample=>sample.cpuSubmissionMs)),
    calls:{maximum:samples.length?Math.max(...samples.map(sample=>sample.calls)):null,
      violations:samples.filter(sample=>sample.calls>250).map(sample=>({id:sample.id,calls:sample.calls}))},
    gpu:{resolved:samples.filter(sample=>sample.gpu.status==='measured').length,
      pending:samples.filter(sample=>sample.gpu.status==='pending').length,
      unavailable:samples.filter(sample=>sample.gpu.status==='unavailable').length,
      durations:distribution(samples.flatMap(sample=>sample.gpu.durationMs===null?[]:[sample.gpu.durationMs])),
      omissions:Object.fromEntries([...new Set(samples.flatMap(sample=>sample.gpu.reason?[sample.gpu.reason]:[]))]
        .map(reason=>[reason,samples.filter(sample=>sample.gpu.reason===reason).length]))},
    displayFrameGaps:samples.slice(1).flatMap((sample,index)=>sample.displayFrameId===samples[index].displayFrameId+1?[]:
      [{previous:samples[index].displayFrameId,next:sample.displayFrameId}]),
    nonContinuousSamples:samples.filter(sample=>!sample.continuous).map(sample=>sample.id),
    resourceRanges:Object.fromEntries((['geometries','textures','programs','triangles'] as const).map(key=>
      [key,{min:samples.length?Math.min(...samples.map(sample=>sample[key])):null,max:samples.length?Math.max(...samples.map(sample=>sample[key])):null}])),
  }
}

test('modern native Dense_Sample browser performance — fixed full measurement gates',async({page,request,browser,browserName},testInfo)=>{
  test.setTimeout(600_000)
  await mkdir(output,{recursive:true})
  const errors=browserErrors(page),resources=observeResources(page),budgets:Budget[]=[],stageFailures:{stage:string;reason:string}[]=[]
  const stages:Record<string,{status:string;startedAt:string;finishedAt?:string;reason?:string}>={}
  const latency={seek:[] as ActionSample[],focus:[] as ActionSample[],home:[] as ActionSample[]}
  const coldLoads:{iteration:number;ms:number|null;status:string;reason?:string;head?:unknown;requests:ResourceObservation[];errors:string[]}[]=[]
  const windows:Record<string,Awaited<ReturnType<typeof orbitWindow>>>={}
  const report={version:1,recordedAt:new Date().toISOString(),runId:randomUUID(),workload:'Dense_Sample',
    sourcePayload,sourceHash,browser:{name:browserName,version:browser.version(),platform:process.platform,arch:process.arch,
      configuredChannel:testInfo.project.use.channel??null,headless:testInfo.project.use.headless??true},
    deviceScaleFactor:1,thresholdsAreFixed:true,
    millisecondComparison:{precisionNanoseconds:1,rawSamplesUnchanged:true,reason:'Remove binary subtraction roundoff below browser clock resolution; fixed budgets are unchanged'},jdt:'Actual language service remains enabled; no request routing or fake responses',
    methodology:'Native commands + UI cursor/mode commit + two real rAF callbacks for first composition; readiness outside command windows. Whole-owner submitted frames during continuous native pointer input; snapshots only at window boundaries. No physical-display FPS claim.',
    baseline:{seekP50Ms:50.45,seekP95Ms:101.24,focusP95Ms:110.97,homeP95Ms:138.49,cpuP95Ms:3.70,
      coldLoadMs:4816,coldLoadBaselineSamples:1,coldLoadBaselineExcludedJdt:true,richSemanticMiB:354.56},
    budgets,stages,stageFailures,latency,coldLoads,windows,errors,requests:resources,
    sourceEvidence:null as unknown,session:null as unknown,initialWorld:null as unknown,
    focusTargets:null as unknown,soak:null as unknown,commandProfile:null as unknown,seekProfile:null as unknown,
    overallPerformanceApproval:'INCOMPLETE',browserGate:'PENDING',completed:false,
  }
  const save=async()=>writeFile(resolve(output,'browser-world-performance.json'),JSON.stringify(report,null,2)+'\n')
  const addBudget=(id:string,stage:string,budget:number,unit:string,baseline:number|null,requiredForBrowserGate=true)=>{
    budgets.push({id,stage,budget,unit,baseline,requiredForBrowserGate,status:'PENDING',measured:null,reason:'Stage has not completed',cause:null,mitigationDecision:null})
  }
  addBudget('seek-p50','seek',55,'ms',50.45);addBudget('seek-p95','seek',112,'ms',101.24)
  addBudget('focus-p95','focus-home',125,'ms',110.97);addBudget('home-p95','focus-home',152,'ms',138.49)
  addBudget('cold-load-median','cold-load',5300,'ms',4816)
  for(const viewport of viewports){const stage=`orbit-${viewport.width}x${viewport.height}`
    addBudget(`${stage}-median`,stage,16.7,'ms',null);addBudget(`${stage}-p95`,stage,33.3,'ms',null)
    addBudget(`${stage}-calls`,stage,250,'calls/every frame',null);addBudget(`${stage}-cpu-p95`,stage,6,'ms',3.70)
  }
  addBudget('soak-frame-drift','soak',10,'percent absolute median drift',null)
  addBudget('soak-post-gc-heap-growth','soak',5,'percent whole frontend heap growth',null)
  // These remain explicit failures/incomplete product evidence, but are owned
  // by separate semantic/production probes, not falsely attributed to CDP heap.
  for(const [id,budget,unit,baseline,reason] of [
    ['rich-semantic-retention',390,'MiB',354.56,'Browser whole-frontend heap does not isolate rich semantic retention; run the semantic retention probe'],
    ['presentation-retention-ratio',25,'percent of same-session semantic retention',null,'CDP whole-frontend heap cannot attribute SceneModel/presentation retention; separate same-session probe required'],
    ['single-event-20k-to-1k-ratio',2,'median ratio, >=100 batches per size',null,'Browser actions do not isolate SceneModel update cost; modern CPU benchmark owns this gate'],
    ['production-entry-gzip',500,'kB gzip',null,'DEV network responses are not production build artifacts; root must measure the production build and lazy chunks'],
  ] as const){addBudget(id,'external-evidence',budget,unit,baseline,false);const item=budgets.at(-1)!
    item.status='NOT_MEASURED';item.reason=reason;item.cause='Outside this browser measurement boundary';item.mitigationDecision='Keep whole-product approval incomplete until the independent root gate supplies actual evidence'}
  const measure=(id:string,value:number|null,sufficient:boolean,reason:string)=>{
    const item=budgets.find(budget=>budget.id===id)!
    item.measured=value;item.status=!sufficient||value===null||!Number.isFinite(value)?'NOT_MEASURED':(item.unit==='ms'?withinMillisecondBudget(value,item.budget):value<=item.budget)?'PASS':'BUDGET_EXCEEDED'
    item.reason=item.status==='PASS'?null:reason
    item.cause=item.status==='PASS'?null:item.status==='NOT_MEASURED'?'Required measurement or sample count was not obtained':'Observed value exceeds the unchanged fixed budget'
    item.mitigationDecision=item.status==='PASS'?null:'Root must investigate the recorded evidence and rerun after a measured fix; do not reduce sample counts or relax thresholds'
  }
  const stage=async(name:string,run:()=>Promise<void>)=>{
    stages[name]={status:'RUNNING',startedAt:new Date().toISOString()};await save()
    try{await run();stages[name].status='COMPLETED'}
    catch(error){const reason=error instanceof Error?error.stack??error.message:String(error)
      stages[name].status='FAILED';stages[name].reason=reason;stageFailures.push({stage:name,reason})
      for(const item of budgets.filter(item=>item.stage===name&&item.status==='PENDING')){
        item.status='NOT_MEASURED';item.reason=reason;item.cause='Stage crashed, timed out, or an actual interaction was unavailable'
        item.mitigationDecision='Repair the actual stage failure and rerun the full fixed gate'
      }
    }finally{stages[name].finishedAt=new Date().toISOString();await save()}
  }
  let projectId:string|null=null,session:ExecutionSession|null=null,maximum=0
  try {
    await stage('fresh-jvm',async()=>{
      const previous=await metadata(request)
      if(previous&&activePhases.includes(previous.phase))throw new Error(`Bridge has an unrelated active JVM ${previous.id}; this harness will not stop it`)
      // Only ordinary sources are reused. The old ID/raw events never enter the
      // app, transport, RuntimeState, scene, or timing pipeline.
      const preserved=JSON.parse(await readFile(resolve(sourcePayload),'utf8')) as {id:string;sourceManifest:{sources:Source[]}}
      const sources=preserved.sourceManifest.sources
      expect(sources).toHaveLength(1);expect(sources[0].fileId).toBe('Topology.java')
      expect(Buffer.byteLength(sources[0].content,'utf8')).toBe(1287)
      for(const source of sources){expect(createHash('sha256').update(source.content,'utf8').digest('hex')).toBe(source.sha256);expect(source.sha256).toBe(sourceHash)}
      report.sourceEvidence={previousSessionId:preserved.id,files:sources.map(source=>({fileId:source.fileId,name:source.name,sha256:source.sha256,bytes:Buffer.byteLength(source.content,'utf8')}))}
      const imported=await request.post('/api/projects/import',{data:{name:`Dense_Sample native performance ${randomUUID()}`,files:sources.map(source=>({path:source.fileId,content:source.content}))}})
      expect(imported.ok(),await imported.text()).toBe(true);projectId=(await imported.json()).id as string
      await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),projectId)
      await page.goto('/?qa=1&perf=1')
      const run=page.getByRole('button',{name:'Run',exact:true})
      await expect(run).toHaveAttribute('aria-disabled','false',{timeout:60_000})
      const pending=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${projectId}/execution`&&response.request().method()==='POST')
      const startedAt=performance.now();await run.click()
      const startedResponse=await pending;expect(startedResponse.ok(),await startedResponse.text()).toBe(true)
      const started=await startedResponse.json() as ExecutionSession
      expect(started.projectId).toBe(projectId);expect(started.kind).toBe('run');expect(started.id).not.toBe(preserved.id)
      report.session={id:started.id,projectId,phase:started.phase,actualRunClicked:true};await save()
      await expect.poll(async()=>{const current=await metadata(request);return current?.id===started.id?current.phase:null},
        {timeout:90_000,intervals:[200,500]}).toMatch(/^(COMPLETED|FAILED|STOPPED)$/)
      const full=await request.get('/api/execution/current');expect(full.ok()).toBe(true)
      session=await full.json() as ExecutionSession
      await writeFile(resolve(output,`browser-world-fresh-session-${session.id}.json`),JSON.stringify(session)+'\n')
      report.session={id:session.id,projectId:session.projectId,phase:session.phase,rawEvents:session.rawEvents.length,
        rawEventCount:session.rawEventCount??session.rawEvents.length,recording:session.recording,sourceManifest:session.sourceManifest,
        stdout:session.stdout,stderr:session.stderr,exitCode:session.exitCode,build:session.build,
        runToCompletedMs:performance.now()-startedAt,actualRunClicked:true,snapshot:`.ggjavaez/qa/reference-exact/browser-world-fresh-session-${session.id}.json`}
      await save()
      expect(session.id).toBe(started.id);expect(session.projectId).toBe(projectId);expect(session.phase).toBe('COMPLETED')
      expect(session.stdout).toBe('TOPOLOGY 73 100 1000 3 true\n');expect(session.stderr).toBe('');expect(session.exitCode).toBe(0)
      expect(session.build?.success).toBe(true);expect(session.terminalStatus).toBe('complete');expect(session.recording?.state).toBe('FULL')
      expect(session.rawEvents.length).toBeGreaterThan(0)
      expect(session.rawEventCount??session.rawEvents.length).toBe(session.rawEvents.length)
      expect(session.sourceManifest.sources).toEqual(sources)
      for(const mapping of session.sourceManifest.classes.filter(mapping=>mapping.status==='resolved'))expect(mapping.sourceSha256).toBe(sourceHash)
      // A completed backend can precede bounded frontend catch-up. Compute the
      // count from this fresh session's actual facts independently; never accept
      // the first small published prefix as the complete Dense_Sample world.
      const oracle=normalizeTrace(session.rawEvents,session.sourceManifest,{
        status:session.terminalStatus!,exitCode:session.exitCode,diagnostic:session.diagnostic,
        ...(session.recording?{recording:session.recording}:{}),
        ...(session.capability?{capability:session.capability}:{}),
      },`execution:${session.id}`)
      maximum=oracle.trace.events.length;historyForTrace(oracle.trace).dispose()
      const head=await retainedWorld(page,session,maximum);report.initialWorld={...head,runToWorldMs:performance.now()-startedAt}
      await home(page);await closeInspector(page);await ready(page)
      await page.screenshot({path:resolve(output,'browser-world-dense-interactive-1440x900.png')})
      expect(resources.filter(item=>/cinematicMaterials|cinematicPasses/.test(item.url))).toEqual([])
    })
    if(stages['fresh-jvm'].status==='COMPLETED'&&session){
      const actualSession=session as ExecutionSession
      await stage('cold-load',async()=>{
        // Keep the same actual backend recording; all five frontend/browser
        // contexts are fresh. JDT is deliberately real, unlike the old probe.
        for(let iteration=1;iteration<=5;iteration++){
          const current=await metadata(request);expect(current?.id).toBe(actualSession.id);expect(current?.phase).toBe('COMPLETED')
          const context=await browser.newContext({baseURL:new URL(page.url()).origin,viewport:{width:1440,height:900},deviceScaleFactor:1})
          const cold=await context.newPage(),observed=observeResources(cold),coldErrors=browserErrors(cold)
          const sample:{iteration:number;ms:number|null;status:string;reason?:string;head?:unknown;requests:ResourceObservation[];errors:string[]}=
            {iteration,ms:null,status:'RUNNING',requests:observed,errors:coldErrors}
          coldLoads.push(sample)
          try {
            await cold.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),projectId!)
            const started=performance.now();await cold.goto('/?qa=1&perf=1')
            const head=await retainedWorld(cold,actualSession,maximum)
            sample.ms=performance.now()-started;sample.head=head;sample.status='COMPLETED'
            expect(coldErrors).toEqual([]);expect(observed.filter(item=>/cinematicMaterials|cinematicPasses/.test(item.url))).toEqual([])
          }catch(error){sample.status='FAILED';sample.reason=String(error);stageFailures.push({stage:'cold-load',reason:`Cold load ${iteration}: ${String(error)}`})}
          finally{await context.close();await save()}
        }
        const measured=coldLoads.flatMap(sample=>sample.ms===null||sample.status!=='COMPLETED'?[]:[sample.ms])
        measure('cold-load-median',distribution(measured).p50Ms,measured.length>=5,'Five independent fresh frontend loads required; JDT is real and this differs from the historical excluded-JDT baseline')
      })
      await stage('seek',async()=>{
        await closeInspector(page);await home(page)
        // 100 evenly spread positions, deterministically permuted. The stride
        // 37 is coprime to 100, so every position is used once, including ends.
        const positions=Array.from({length:100},(_,index)=>Math.round(maximum*index/99))
        expect(new Set(positions).size).toBe(100)
        for(let index=0;index<100;index++){
          const cursor=positions[index*37%100]
          latency.seek.push(await timedSeek(page,cursor,maximum));await save()
        }
        const stats=distribution(latency.seek.map(sample=>sample.ms))
        measure('seek-p50',stats.p50Ms,latency.seek.length>=100,'Seek p50 or required 100 spread native samples failed')
        measure('seek-p95',stats.p95Ms,latency.seek.length>=100,'Seek p95 or required 100 spread native samples failed')
        if(process.env.VJ_PERF_BROWSER_PROFILE==='1'){
          const cdp=await page.context().newCDPSession(page),cursors=Array.from({length:10},(_,index)=>positions[index*37%100])
          await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start')
          try{for(const cursor of cursors)await timedSeek(page,cursor,maximum)}
          finally{
            const captured=await cdp.send('Profiler.stop'),path=resolve(output,'browser-world-seek.cpuprofile')
            await writeFile(path,JSON.stringify(captured.profile)+'\n')
            report.seekProfile={path,intervalUs:1000,cursors,
              boundary:'Ten additional native public-range seeks after all 100 required samples; separate diagnostics, not budget samples'}
            await cdp.detach();await save()
          }
        }
      })
      await stage('focus-home',async()=>{
        await seekCursor(page,maximum);await home(page)
        const captured=await page.evaluate(()=>Object.values(window.__ggjavaezWorld!.scene().entities)
          .filter(node=>node.kind==='array').map(node=>({id:node.id,length:node.length,title:node.title,
            cells:node.cells.filter(cell=>cell.value.kind==='reference').map(cell=>({index:cell.index,slotId:cell.slotId,value:cell.value}))})))
        const inbound=captured.find(node=>node.length===100&&node.cells.length===100&&node.cells.every(cell=>cell.value.kind==='reference'
          && cell.value.targetId===(node.cells[0].value.kind==='reference'?node.cells[0].value.targetId:null)))
        expect(inbound,'Fresh captured 100-cell inbound array is required').toBeDefined()
        const cells=[...inbound!.cells].sort((a,b)=>a.index-b.index),targets=Array.from({length:50},(_,index)=>cells[Math.floor(index*cells.length/50)])
        expect(new Set(targets.map(cell=>cell.slotId)).size).toBe(50)
        report.focusTargets={ownerId:inbound!.id,ownerLength:inbound!.length,allTargetsCaptured:true,
          targets:targets.map(cell=>({index:cell.index,id:cell.slotId,value:cell.value}))};await save()
        await selectArrayOwner(page,inbound!.id)
        for(const cell of targets){
          await revealCapturedCell(page,cell.index,cell.slotId)
          const focus=page.getByRole('complementary',{name:'Selection inspector',exact:true}).getByRole('button',{name:'Focus selection',exact:true})
          await expect(focus).toHaveAttribute('aria-disabled','false');await ready(page)
          const started=performance.now();await focus.click()
          const commanded=performance.now()
          await expect(page.getByRole('button',{name:'Focus',exact:true})).toHaveAttribute('aria-pressed','true')
          const committed=performance.now(),boundary=await firstCompositionBoundary(page),finished=performance.now(),ms=finished-started
          latency.focus.push({targetId:cell.slotId,ms,rendererFrame:boundary.rendererFrame,timing:{commandMs:commanded-started,uiCommitMs:committed-commanded,compositionMs:finished-committed}});await save()
          expect(boundary.focusId).toBe(cell.slotId);expect(boundary.selectionId).toBe(cell.slotId)
          // Choreography/readiness is outside the first-frame latency window.
          await ready(page)
          expect(await page.evaluate(({owner,id})=>window.__ggjavaezWorld!.plan().cellWindows.get(owner)?.mapping.has(id)??false,
            {owner:inbound!.id,id:cell.slotId})).toBe(true)
          const homeStarted=performance.now();await page.getByRole('button',{name:'Home',exact:true}).click()
          const homeCommanded=performance.now()
          await expect(page.getByRole('button',{name:'Home',exact:true})).toHaveAttribute('aria-pressed','true')
          const homeCommitted=performance.now(),homeBoundary=await firstCompositionBoundary(page),homeFinished=performance.now(),homeMs=homeFinished-homeStarted
          latency.home.push({targetId:cell.slotId,ms:homeMs,rendererFrame:homeBoundary.rendererFrame,timing:{commandMs:homeCommanded-homeStarted,uiCommitMs:homeCommitted-homeCommanded,compositionMs:homeFinished-homeCommitted}});await save()
          expect(homeBoundary.focusId).toBeNull();await ready(page)
        }
        measure('focus-p95',distribution(latency.focus.map(sample=>sample.ms)).p95Ms,
          latency.focus.length>=50&&new Set(latency.focus.map(sample=>sample.targetId)).size>=50,'Focus requires >=50 distinct actual captured targets and unchanged 125 ms p95 budget')
        measure('home-p95',distribution(latency.home.map(sample=>sample.ms)).p95Ms,latency.home.length>=50,'Home requires >=50 actual commands and unchanged 152 ms p95 budget')
        if(process.env.VJ_PERF_BROWSER_PROFILE==='1'){
          // Independent diagnostics AFTER all fixed latency samples. Profiling
          // never runs in their timing windows or supplies replacement samples.
          const cdp=await page.context().newCDPSession(page)
          await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start')
          try{
            for(const cell of targets.slice(0,10)){
              await revealCapturedCell(page,cell.index,cell.slotId)
              await page.getByRole('complementary',{name:'Selection inspector',exact:true}).getByRole('button',{name:'Focus selection',exact:true}).click()
              await ready(page);await home(page)
            }
          }finally{
            const captured=await cdp.send('Profiler.stop'),path=resolve(output,'browser-world-command.cpuprofile')
            await writeFile(path,JSON.stringify(captured.profile)+'\n')
            report.commandProfile={path,intervalUs:1000,targets:targets.slice(0,10).map(cell=>cell.slotId),
              boundary:'Ten additional native Focus/Home pairs after all 50 measured pairs; separate diagnostics, not budget samples'}
            await cdp.detach();await save()
          }
        }
      })
      for(const viewport of viewports){const name=`orbit-${viewport.width}x${viewport.height}`
        await stage(name,async()=>{
          await page.setViewportSize(viewport);await seekCursor(page,maximum);await closeInspector(page);await home(page)
          const measured=await orbitWindow(page,30_000);windows[name]=measured;await save()
          const complete=measured.measuredFrameSpanMs>=30_000&&measured.samples.length===measured.expectedSubmissions
            &&measured.intervals.samples===measured.samples.length-1&&measured.displayFrameGaps.length===0
          measure(`${name}-median`,measured.intervals.p50Ms,complete,'Continuous 30 s full-frame window or median frame budget failed')
          measure(`${name}-p95`,measured.intervals.p95Ms,complete,'Continuous 30 s full-frame window or p95 frame budget failed')
          measure(`${name}-calls`,measured.calls.maximum,complete,'Every actual submitted frame, including the first transition frame, must stay <=250 calls')
          measure(`${name}-cpu-p95`,measured.cpu.p95Ms,complete,'Every actual whole-render-owner CPU sample in a continuous >=30 s window is required')
          expect(measured.end.facts).toEqual(measured.start.facts);expect(measured.end.pose).not.toEqual(measured.start.pose)
          expect(measured.samples.every(sample=>sample.tier==='INTERACTIVE')).toBe(true)
          expect(measured.end.probe.lifecycleIssues).toEqual({});expect(measured.end.probe.contextLost).toBe(false)
          expect(measured.end.probe.pendingGpuQueries).toBeLessThanOrEqual(8)
        })
      }
      await stage('soak',async()=>{
        await page.setViewportSize({width:1440,height:900});await seekCursor(page,maximum);await closeInspector(page);await home(page)
        const cdp=await page.context().newCDPSession(page)
        await cdp.send('Performance.enable');await cdp.send('HeapProfiler.enable')
        const heap=async()=>{
          await cdp.send('HeapProfiler.collectGarbage')
          const observed=await cdp.send('Performance.getMetrics')
          const values=Object.fromEntries(observed.metrics.filter(metric=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','JSEventListeners'].includes(metric.name)).map(metric=>[metric.name,metric.value]))
          return {explicitCdpGc:true,values,at:new Date().toISOString(),attribution:'whole frontend; not semantic, presentation-only, or GPU bytes'}
        }
        try {
          const before=await heap(),measured=await orbitWindow(page,60_000)
          // End GC follows pointer release directly, with no readiness traversal,
          // screenshots or another workload before taking the after sample.
          const after=await heap(),first=measured.samples[0],last=measured.samples.at(-1)
          const intervalIn=(sample:FramePerformanceSample,lower:number,upper:number)=>sample.displayFrameIntervalMs!==null
            &&sample.frameStartedAtMs-sample.displayFrameIntervalMs>=lower&&sample.frameStartedAtMs<=upper
          const firstTen=first?measured.samples.filter(sample=>intervalIn(sample,first.frameStartedAtMs,first.frameStartedAtMs+10_000)):[]
          const lastTen=last?measured.samples.filter(sample=>intervalIn(sample,last.frameStartedAtMs-10_000,last.frameStartedAtMs)):[]
          const firstStats=distribution(firstTen.map(sample=>sample.displayFrameIntervalMs!)),lastStats=distribution(lastTen.map(sample=>sample.displayFrameIntervalMs!))
          const drift=firstStats.p50Ms!==null&&firstStats.p50Ms>0&&lastStats.p50Ms!==null?100*Math.abs(lastStats.p50Ms/firstStats.p50Ms-1):null
          const heapBefore=before.values.JSHeapUsedSize,heapAfter=after.values.JSHeapUsedSize
          const heapGrowth=heapBefore>0&&Number.isFinite(heapAfter)?100*(heapAfter/heapBefore-1):null
          report.soak={measured,before,after,firstTen:{...firstStats,sampleIds:firstTen.map(sample=>sample.id)},
            lastTen:{...lastStats,sampleIds:lastTen.map(sample=>sample.id)},absoluteMedianDriftPercent:drift,wholeFrontendHeapGrowthPercent:heapGrowth}
          await save()
          const complete=measured.measuredFrameSpanMs>=60_000&&measured.samples.length===measured.expectedSubmissions
            &&measured.displayFrameGaps.length===0&&measured.intervals.samples===measured.samples.length-1
          measure('soak-frame-drift',drift,complete&&firstTen.length>1&&lastTen.length>1,'Actual >=60 s continuous frame window and complete first/last 10 s samples are required')
          measure('soak-post-gc-heap-growth',heapGrowth,complete&&Number.isFinite(heapBefore)&&Number.isFinite(heapAfter),'Explicit CDP GC whole-frontend heap growth must stay <=5%; isolated semantic memory is not measured here')
          expect(measured.end.facts).toEqual(measured.start.facts);expect(measured.end.pose).not.toEqual(measured.start.pose)
          expect(measured.samples.every(sample=>sample.tier==='INTERACTIVE')).toBe(true)
          expect(measured.end.probe.lifecycleIssues).toEqual({})
        }finally{await cdp.detach()}
      })
    }
  }finally{
    for(const item of budgets.filter(item=>item.status==='PENDING')){
      item.status='NOT_MEASURED';item.reason='Required stage did not reach completion; see saved stage failures'
      item.cause='Dependent real-JVM/interaction/measurement work was unavailable or the run terminated'
      item.mitigationDecision='Investigate the failed stage and rerun without lowering its fixed requirements'
    }
    report.completed=true
    report.browserGate=stageFailures.length===0&&errors.length===0&&budgets.filter(item=>item.requiredForBrowserGate).every(item=>item.status==='PASS')?'PASS':'FAIL'
    // External NOT_MEASURED rows are always retained as incomplete product
    // evidence. A browser PASS cannot become whole-product performance approval.
    await save()
    const current=projectId?await metadata(request).catch(()=>null):null
    if(current?.projectId===projectId&&activePhases.includes(current.phase))await request.post(`/api/execution/${current.id}/stop?transport=delta`,{data:{}})
  }
  await testInfo.attach('modern-native-dense-performance',{path:resolve(output,'browser-world-performance.json'),contentType:'application/json'})
  expect(stageFailures,'Actual failed stages are saved; unavailable interactions are not bypassed').toEqual([])
  expect(errors,'Actual browser errors are saved').toEqual([])
  expect(budgets.filter(item=>item.requiredForBrowserGate&&item.status!=='PASS'),
    'Every required browser measurement must complete and meet its unchanged budget; report saved before assertion').toEqual([])
})
