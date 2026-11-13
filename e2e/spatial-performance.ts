import { expect, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { home, seekCursor } from './reference/harness'
import { clearTortureSelection, pickTortureEntity } from './reference/tortureNavigation'

const frames = (page:Page)=>page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
function distribution(samples:number[]) {
  const sorted=[...samples].sort((a,b)=>a-b)
  return {samples:samples.length,p50Ms:sorted[Math.ceil(sorted.length*.5)-1],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],minMs:sorted[0],maxMs:sorted.at(-1)}
}

export async function selectGraphNode(page: Page) {
  const target = await page.evaluate(() => {
    const events = window.__ggjavaezWorld!.recordedEvents()
    const index = events.findIndex(event => event.type === 'ALLOCATE_OBJECT' && /(?:^|\$|\.)Node$/.test(event.className))
    const allocation = events[index]
    if (allocation?.type !== 'ALLOCATE_OBJECT') throw new Error('The recorded prefix contains no Node allocation')
    return { id: allocation.objectId, cursor: index + 1 }
  })
  await clearTortureSelection(page)
  await seekCursor(page, target.cursor)
  await home(page)
  await pickTortureEntity(page, target.id)
  expect(await page.evaluate(() => window.__ggjavaezQA!.selection()?.id)).toBe(target.id)
  return target.id
}
/** Same accepted execution/session as the dense-world regression. No new Java
 * workload, trace substitution or application instrumentation is performed. */
export async function measureSpatialWorld(page:Page,output:string,loadMs:number,max:number,sessionId:string) {
  const scrub=page.getByRole('slider',{name:'Recorded execution position',exact:true})
  const samples:Array<{cursor:number;ms:number}>=[]
  let seed=173
  for(let index=0;index<30;index++) {
    seed=(seed*1664525+1013904223)>>>0
    const cursor=1+seed%Math.max(1,max-1),start=performance.now()
    await scrub.fill(String(cursor))
    await expect(scrub).toHaveAttribute('aria-valuenow',String(cursor))
    await frames(page)
    samples.push({cursor,ms:performance.now()-start})
  }
  const selected = await selectGraphNode(page)
  await seekCursor(page,max);await frames(page)
  await home(page)
  expect(await page.evaluate(() => window.__ggjavaezQA!.selection()?.id)).toBe(selected)
  const commands:Array<{kind:string;commitAndTwoFramesMs:number;settledMs:number}>=[]
  for(let index=0;index<10;index++) {
    const kind=index%2?'home':'focus',start=performance.now()
    const button=kind==='home'?page.getByRole('button',{name:'Home',exact:true}):page.getByRole('complementary',{name:'Selection inspector'}).getByRole('button',{name:'Focus selection',exact:true})
    await button.click();await frames(page)
    const commitAndTwoFramesMs=performance.now()-start
    // Include the deliberately animated choreography separately from CPU/UI latency.
    await page.waitForTimeout(800)
    commands.push({kind,commitAndTwoFramesMs,settledMs:performance.now()-start})
  }
  const canvas=page.locator('.world-canvas canvas'),box=(await canvas.boundingBox())!
  const orbit:number[]=[]
  for(let index=0;index<30;index++) {
    await page.mouse.move(box.x+box.width*.3,box.y+box.height*.45)
    const start=performance.now()
    await page.mouse.down();await page.mouse.move(box.x+box.width*.3+12,box.y+box.height*.45+6,{steps:2});await page.mouse.up();await frames(page)
    orbit.push(performance.now()-start)
  }
  const measurements=await page.evaluate(()=>{const memory=(performance as unknown as {memory?:{usedJSHeapSize:number,totalJSHeapSize:number}}).memory;return {renderer:window.__ggjavaezWorld!.renderer(),heap:memory?{usedJSHeapSize:memory.usedJSHeapSize,totalJSHeapSize:memory.totalJSHeapSize}:null}})
  await writeFile(`${output}/spatial-performance.json`,JSON.stringify({sessionId,viewport:{width:1440,height:900},loadMs,normalizedEvents:max,
    baseline:{loadMs:3214,seeksMs:[741,493,482]},seek:distribution(samples.map(item=>item.ms)),seekSamples:samples,
    orbit:distribution(orbit),orbitSamples:orbit,
    focus:distribution(commands.filter(item=>item.kind==='focus').map(item=>item.commitAndTwoFramesMs)),
    home:distribution(commands.filter(item=>item.kind==='home').map(item=>item.commitAndTwoFramesMs)),commands,...measurements,
    metric:'Playwright action/UI commit plus two animation frames; not physical GPU presentation. Command settledMs includes a fixed 800 ms choreography wait, not detected GPU completion. Browser heap includes transport, accepted recording, Monaco and renderer. One cold load; 30 seeded seeks and 30 drag samples; five Focus and five Home samples. No population-wide cold-load percentile claim.'},null,2)+'\n')
}
