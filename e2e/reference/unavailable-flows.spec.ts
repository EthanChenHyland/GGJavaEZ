import {expect,test,type APIRequestContext,type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import type {ExecutionSession} from '../../src/execution/contracts'
import {normalizeTrace} from '../../src/instrumentation/normalize'
import {historyForTrace} from '../../src/runtime/history'
import {browserErrors,currentSession,home,ready,seekCursor,selectEntity} from './harness'

test.describe.configure({timeout:90000})
let ownedProject:string|null=null
test.afterEach(async({request})=>{
 const session=await currentSession(request)
 if(session?.projectId===ownedProject&&['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(session.phase)){
  const stopped=await request.post(`/api/execution/${session.id}/stop`,{data:{}});expect(stopped.ok()).toBe(true)
 }
 ownedProject=null
})
const boundary=(page:Page)=>page.evaluate(()=>({cursor:window.__ggjavaezQA!.cursor(),selection:window.__ggjavaezQA!.selection(),focus:window.__ggjavaezQA!.focusTarget(),pose:window.__ggjavaezQA!.cameraPose()}))
async function runTopology(page:Page,request:APIRequestContext){
 const source=readFileSync('fixtures/torture-v12-p5_5/02-arrays-cycles-collections/Topology.java','utf8')
 const imported=await request.post('/api/projects/import',{data:{name:`Unavailable Flow evidence ${randomUUID()}`,files:[{path:'Topology.java',content:source}]}})
 expect(imported.ok()).toBe(true);const projectId=(await imported.json()).id as string;ownedProject=projectId
 await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),projectId)
 await page.goto('/?qa=1')
 await page.waitForFunction(()=>typeof window.__ggjavaezQA?.ready==='function')
 await page.waitForFunction(id=>document.querySelector('[data-project-id]')?.getAttribute('data-project-id')===id,projectId)
 const run=page.getByRole('button',{name:'Run',exact:true});await expect(run).toHaveAttribute('aria-disabled','false')
 const pending=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${projectId}/execution`&&response.request().method()==='POST')
 await run.click();const response=await pending;expect(response.ok()).toBe(true)
 const started=await response.json() as ExecutionSession
 await expect.poll(async()=>{const current=await currentSession(request);return current?.id===started.id?current.phase:null},{timeout:45000}).toBe('COMPLETED')
 const session=(await currentSession(request))!
 expect(session.id).toBe(started.id);expect(session.build?.success).toBe(true);expect(session.exitCode).toBe(0)
 expect(session.recording?.state).toBe('FULL');expect(session.stdout).toBe('TOPOLOGY 73 100 1000 3 true\n')
 expect(session.rawEvents.length).toBeGreaterThan(0)
 const {trace}=normalizeTrace(session.rawEvents,session.sourceManifest,{status:'complete',exitCode:0,diagnostic:null},`execution:${session.id}`)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.appState().dimensions.view.recordingId)).toBe(`execution:${session.id}`)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.scene().liveHead)).toBe(trace.events.length)
 const slider=page.getByRole('slider',{name:'Recorded execution position'});await slider.focus();await slider.press('End')
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.scene().cursor)).toBe(trace.events.length)
 await ready(page);return{session,trace}
}

for(const viewport of[{width:1440,height:900},{width:760,height:900}])test(`complete unavailable Flow evidence pages to its recorded tail without changing time ${viewport.width}x${viewport.height}`,async({page,request},info)=>{
 await page.setViewportSize(viewport)
 const errors=browserErrors(page),{session,trace}=await runTopology(page,request)
 const graph=historyForTrace(trace)!.state.executionGraph!
 await info.attach('actual-jvm-session',{body:JSON.stringify({id:session.id,rawEvents:session.rawEvents.length,normalizedEvents:trace.events.length}),contentType:'application/json'})
 const target=await page.evaluate(()=>{const world=window.__ggjavaezWorld!,scene=world.scene();return scene.order.frames.find(id=>world.plan().entities.has(id))})
 expect(target).toBeTruthy()
 // A represented frame may be outside Hero's current viewport in this dense
 // world. Use real navigation before entering the viewport-bound catalog.
 const beforeHome=await page.evaluate(id=>({pose:window.__ggjavaezQA!.cameraPose(),point:window.__ggjavaezWorld!.projectedPoint(id)}),target!)
 await home(page)
 const afterHome=await page.evaluate(id=>({pose:window.__ggjavaezQA!.cameraPose(),point:window.__ggjavaezWorld!.projectedPoint(id)}),target!)
 expect(afterHome.point?.visible).toBe(true)
 await info.attach('native-frame-navigation',{body:JSON.stringify({sessionId:session.id,target,beforeHome,afterHome}),contentType:'application/json'})
 await selectEntity(page,target!);await ready(page)
 const card=page.getByRole('complementary',{name:'Selection inspector'})
 await card.locator('summary').filter({hasText:/^Flow presentation/}).click()
 const list=card.getByRole('list',{name:'Unavailable flow ports',exact:true})
 await expect(list).toBeVisible()
 const captured=await page.evaluate(()=>{const list=window.__ggjavaezWorld!.plan().flowPresentation.unavailable;return{count:list.length,last:list.at(-1)!}})
 expect(captured.count).toBeGreaterThan(4096)
 const edge=graph.edges.find(edge=>edge.id===captured.last.id)
 expect(edge).toBeTruthy();expect(trace.events.some(event=>event.eventId===edge!.eventId)).toBe(true)
 const before=await boundary(page)
 const jump=card.getByRole('spinbutton',{name:'Unavailable flow ports index',exact:true})
 await jump.fill(String(captured.count-1));await jump.press('Enter')
 const tail=list.getByRole('button',{name:`Inspect unavailable flow ${captured.last.id}`,exact:true})
 await expect(tail).toBeVisible();await expect(tail).toContainText(captured.last.reason)
 await tail.hover();await expect(tail).toBeInViewport({ratio:.9})
 await expect(tail.locator('..')).toHaveAttribute('aria-setsize',String(captured.count))
 await expect(tail.locator('..')).toHaveAttribute('aria-posinset',String(captured.count))
 expect(await card.getByRole('listitem').count()).toBeLessThanOrEqual(200)
 expect(await boundary(page)).toEqual(before)
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/unavailable-flow-tail-${viewport.width}x${viewport.height}.png`})
 await tail.click();await ready(page)
 const selected=await boundary(page)
 expect(selected.selection).toEqual({kind:'flow',id:captured.last.id})
 expect({...selected,selection:before.selection}).toEqual(before)
 await expect(card).toContainText('Recorded graph edge')
 await expect(card).toContainText(edge!.kind)
 await seekCursor(page,0)
 expect(await page.evaluate(()=>({recorded:window.__ggjavaezWorld!.plan().flowPresentation.counts.recorded,unavailable:window.__ggjavaezWorld!.plan().flowPresentation.unavailable.length}))).toEqual({recorded:0,unavailable:0})
 await expect(list).not.toBeVisible()
 await seekCursor(page,trace.events.length);await ready(page)
 expect((await boundary(page)).selection).toEqual(selected.selection)
 await expect(card).toContainText('Recorded graph edge')
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().recordingId)).toBe(`execution:${session.id}`)
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/unavailable-flow-selected-${viewport.width}x${viewport.height}.png`})
 await info.attach('unavailable-flow-evidence',{body:JSON.stringify({sessionId:session.id,captured,before,selected,edgeId:edge!.id,eventId:edge!.eventId}),contentType:'application/json'})
 expect(errors).toEqual([])
})
