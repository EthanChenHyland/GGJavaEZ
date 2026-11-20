import {expect,test,type Page} from '@playwright/test'
import {normalizeTrace} from '../../src/instrumentation/normalize'
import {historyForTrace} from '../../src/runtime/history'
import {browserErrors,ready,runFixture,seekCursor,stopOwnedSession} from './harness'
import {openDock} from './dockActions'
import {randomUUID} from 'node:crypto'
import type {ExecutionSession} from '../../src/execution/contracts'

test.describe.configure({timeout:90000})
test.afterEach(async({request})=>stopOwnedSession(request))
const boundary=(page:Page)=>page.evaluate(()=>({cursor:window.__ggjavaezQA!.cursor(),selection:window.__ggjavaezQA!.selection(),focus:window.__ggjavaezQA!.focusTarget(),pose:window.__ggjavaezQA!.cameraPose()}))

for(const viewport of[{width:1440,height:900},{width:760,height:900}])test(`Error Explorer evidence follows only the selected exception prefix ${viewport.width}x${viewport.height}`,async({page,request},info)=>{
 await page.setViewportSize(viewport)
 const errors=browserErrors(page),session=await runFixture(page,request,'exception')
 const {trace}=normalizeTrace(session.rawEvents,session.sourceManifest,{status:'program_crashed',exitCode:session.exitCode,diagnostic:session.diagnostic,recording:session.recording},`execution:${session.id}`)
 const history=historyForTrace(trace)!,head=trace.events.length
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().cursor)).toBe(head)
 await openDock(page,'Errors');await ready(page)
 const panel=page.getByRole('region',{name:'Error Explorer',exact:true})
 const thrown=trace.events.find(event=>event.type==='THROW_EXCEPTION')!
 expect(thrown).toBeTruthy()
 const lifecycle=trace.events.filter(event=>'exceptionId'in event&&event.exceptionId===(thrown as {exceptionId:string}).exceptionId)
 expect(lifecycle.filter(event=>event.type==='UNWIND_EXCEPTION').length).toBeGreaterThanOrEqual(2)
 const forward=[...new Set([0,thrown.seq,thrown.seq+1,thrown.seq+2,...lifecycle.flatMap(event=>[event.seq,event.seq+1]),head])]
 const cursors=[...forward,thrown.seq+1,0,head]
 for(const cursor of cursors){
  await seekCursor(page,cursor);await ready(page)
  const before=await boundary(page),state=history.materialize(cursor),failure=state.exceptions.at(-1)
  await expect(panel).toBeVisible()
  if(!failure){
   await page.screenshot({path:`.ggjavaez/qa/reference-exact/error-prefix-empty-${viewport.width}x${viewport.height}.png`})
   await expect(panel).toContainText('No exception has been observed at this Event')
   await expect(panel.locator('h2')).toHaveCount(0)
   await expect(panel.locator('.debug-source')).toHaveCount(0)
   await expect(panel.locator('.error-stack details summary button')).toHaveCount(0)
   await expect(panel.locator('.exception-path button')).toHaveCount(0)
   await expect(panel.getByRole('combobox',{name:'Exception episode'})).toHaveCount(0)
   await expect(panel).not.toContainText('failed shipment')
   await expect(panel).not.toContainText('RUN CRASHED')
  }else{
   const failureTab=panel.getByRole('button',{name:'Failure',exact:true});if(await failureTab.isVisible())await failureTab.click()
   await expect(panel.getByRole('heading',{name:failure.className.split('.').at(-1),exact:true})).toBeVisible()
   await expect(panel.locator('.error-summary')).toContainText(failure.className)
   if(failure.message!==null)await expect(panel.locator('.error-summary')).toContainText(failure.message)
   const stack=panel.getByRole('button',{name:'Stack & path',exact:true});if(await stack.isVisible())await stack.click()
   const expected=lifecycle.filter(event=>event.seq<cursor).map(event=>event.type==='THROW_EXCEPTION'?'Throw':event.type==='UNWIND_EXCEPTION'?'Unwind':event.type==='FINALLY_ENTER'?'Finally / cleanup handler':'Catch')
   expect(await panel.locator('.exception-path button').evaluateAll(buttons=>buttons.map(button=>button.firstChild?.textContent?.trim()))).toEqual(expected)
   const crashed=state.status==='aborted'&&!!state.abortReason?.startsWith('program_crashed:')
   if(crashed)await expect(panel).toContainText('RUN CRASHED');else await expect(panel).not.toContainText('RUN CRASHED')
   if(cursor===thrown.seq+1)await page.screenshot({path:`.ggjavaez/qa/reference-exact/error-prefix-throw-${viewport.width}x${viewport.height}.png`})
  }
  expect(await boundary(page),'Reading evidence or switching its section must not select, seek, Focus or move the camera').toEqual(before)
 }
 await info.attach('exception-prefix-boundaries',{body:JSON.stringify({sessionId:session.id,rawEvents:session.rawEvents.length,normalizedEvents:head,throwSeq:thrown.seq,lifecycle:lifecycle.map(event=>({id:event.eventId,seq:event.seq,type:event.type})),cursors}),contentType:'application/json'})
 expect(errors).toEqual([])
})

for(const viewport of[{width:1440,height:900},{width:760,height:900}])test(`explicit failure bookmark survives earlier caught evidence ${viewport.width}x${viewport.height}`,async({page,request},info)=>{
 await page.setViewportSize(viewport)
 const errors=browserErrors(page)
 const content=`public class Main {
 static void first() { throw new IllegalArgumentException("earlier caught"); }
 static void later(int captured) { throw new IllegalStateException("later failure"); }
 public static void main(String[] args) {
  try { first(); } catch (IllegalArgumentException expected) { System.out.println("caught earlier"); }
  later(19);
 }
}`
 const imported=await request.post('/api/projects/import',{data:{name:`Two exception bookmarks ${randomUUID()}`,files:[{path:'Main.java',content}]}})
 expect(imported.ok(),await imported.text()).toBe(true)
 const id=(await imported.json()).id as string
 await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),id)
 await page.goto('/?qa=1')
 await page.waitForFunction(id=>typeof window.__ggjavaezQA?.ready==='function'&&document.querySelector('[data-project-id]')?.getAttribute('data-project-id')===id,id)
 await page.getByRole('button',{name:'Run',exact:true}).click()
 let session:ExecutionSession|null=null
 try{
  await expect.poll(async()=>{session=await(await request.get('/api/execution/current')).json() as ExecutionSession|null;return session?.projectId===id?session.phase:null},{timeout:45000}).toBe('FAILED')
  session=await(await request.get('/api/execution/current')).json() as ExecutionSession
  expect(session.projectId).toBe(id);expect(session.build?.success).toBe(true)
  expect(session.terminalStatus).toBe('program_crashed');expect(session.recording?.state).toBe('FULL')
  expect(session.stdout).toBe('caught earlier\n');expect(session.stderr).toContain('IllegalStateException: later failure')
  const {trace}=normalizeTrace(session.rawEvents,session.sourceManifest,{status:'program_crashed',exitCode:session.exitCode,diagnostic:session.diagnostic,recording:session.recording},`execution:${session.id}`)
  const throws=trace.events.filter(event=>event.type==='THROW_EXCEPTION')
  expect(throws.map(event=>event.className)).toEqual(['java.lang.IllegalArgumentException','java.lang.IllegalStateException'])
  const entry=trace.events.filter(event=>event.type==='ENTER_METHOD').find(event=>event.methodName==='later')!
  const binding=trace.events.find(event=>event.type==='DECLARE_LOCAL'&&event.frameId===entry.frameId&&event.slot.name==='captured')!
  expect(binding).toBeTruthy()
  await info.attach('actual-jvm-session',{body:JSON.stringify({id:session.id,rawEvents:session.rawEvents.length,buildSuccess:true}),contentType:'application/json'})
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA?.appState().dimensions.view.recordingId)).toBe(`execution:${session.id}`)
  await seekCursor(page,trace.events.length);await openDock(page,'Errors');await ready(page)
  const panel=page.getByRole('region',{name:'Error Explorer',exact:true})
  const section=async(name:string)=>{const button=panel.getByRole('button',{name,exact:true});if(await button.isVisible())await button.click()}
  await section('Stack & path')
  await panel.locator('.error-stack .debug-value').filter({hasText:'captured'}).click();await ready(page)
  const throwBoundary=await boundary(page)
  await section('Cause');await panel.getByRole('button',{name:'Trace Cause',exact:true}).click()
  await panel.locator('.cause-list button').filter({hasText:'parameter binding: captured'}).click();await ready(page)
  const earlier=await boundary(page)
  expect(earlier.cursor.cursor).toBe(binding.seq+1);expect(earlier.cursor.cursor).toBeLessThan(throws[1].seq+1)
  await section('Failure');await expect(panel.getByRole('heading',{name:'IllegalArgumentException',exact:true})).toBeVisible()
  await expect(panel.locator('.error-summary > p')).toHaveText(['java.lang.IllegalArgumentException','earlier caught'])
  await expect(panel.locator('.error-causes')).not.toContainText('later failure')
  await expect(panel.locator('.error-summary details').filter({hasText:'Actual JVM stderr / stack trace'})).toContainText('Full process output · separate from recorded exception evidence')
  await section('Cause')
  const resume=panel.getByRole('button',{name:'Return to inspected failure',exact:true})
  await expect(resume).toBeVisible();await expect(panel.locator('.cause-list [aria-current="step"]')).toHaveCount(1)
  await panel.locator('.cause-list button').filter({hasText:'parameter binding: captured'}).click();await ready(page)
  await expect(resume).toBeVisible();expect(await boundary(page)).toEqual(earlier)
  await resume.hover()
  const buttonBounds=(await resume.boundingBox())!,causeBounds=(await panel.locator('.error-causes').boundingBox())!
  expect(buttonBounds.y).toBeGreaterThanOrEqual(causeBounds.y)
  expect(buttonBounds.y+buttonBounds.height).toBeLessThanOrEqual(causeBounds.y+causeBounds.height)
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/error-prefix-bookmark-${viewport.width}x${viewport.height}.png`})
  await resume.click();await ready(page)
  expect(await boundary(page),'Explicit return preserves the selected value, Focus and camera').toEqual(throwBoundary)
  await section('Failure');await expect(panel.getByRole('heading',{name:'IllegalStateException',exact:true})).toBeVisible()
  expect(errors).toEqual([])
 }finally{
  const current=await(await request.get('/api/execution/current')).json() as ExecutionSession|null
  if(current?.projectId===id&&['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(current.phase))expect((await request.post(`/api/execution/${current.id}/stop`,{data:{}})).ok()).toBe(true)
 }
})
