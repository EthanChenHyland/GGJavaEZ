import {expect,test,type Page,type APIRequestContext} from '@playwright/test'
import states from './states.json' with {type:'json'}
import {browserErrors,captureComparison,currentSession,home,ready,runFixture,seekCursor,selectEntity,startFixture,stopOwnedSession,type ReferenceState} from './harness'
import type {ExecutionSession} from '../../src/execution/contracts'
import type {DetailLevel} from '../../src/contracts/worldV2'
// Every case drives the production shell with an instrumented JVM. No mocked
// traces, fixture branches in production, or direct cursor/selection setters.
test.describe.configure({timeout:90000})
test.afterEach(async({page,request})=>{await page.evaluate(()=>window.__ggjavaezQA?.clock.resume()).catch(()=>undefined);await stopOwnedSession(request)})
async function zoom(page:Page,level:DetailLevel):Promise<void>{
 const ratio=level==='FAR'?.035:level==='MEDIUM'?.10:.20
 const anchors=await page.evaluate(()=>Object.values(window.__ggjavaezWorld!.scene().entities).filter(node=>node.anchor.region==='heap').map(node=>node.anchor))
 expect(anchors.length).toBeGreaterThan(0)
 const anchor=anchors[0],target=[...anchor.position] as [number,number,number]
 // Pose requests are actual camera intents. The renderer independently chooses
 // LOD from canonical faces with its real hysteresis; never force plan.detail.
 let distance=anchor.size[1]/(2*Math.tan(Math.PI/10)*ratio)
 for(let attempt=0;attempt<8;attempt++){
  await page.evaluate(({target,distance})=>{const yaw=8*Math.PI/180,pitch=13*Math.PI/180;window.__ggjavaezQA!.setCameraPose({target,position:[target[0]+Math.sin(yaw)*Math.cos(pitch)*distance,target[1]+Math.sin(pitch)*distance,target[2]+Math.cos(yaw)*Math.cos(pitch)*distance]})},{target,distance})
  // This advances the real camera/LOD clock, leaving execution unchanged.
  await page.evaluate(async()=>{window.__ggjavaezQA!.clock.step(250);await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))})
  const actual=await page.evaluate(()=>window.__ggjavaezQA!.planStats()!.detailLevel)
  if(actual===level){await page.evaluate(()=>window.__ggjavaezQA!.clock.resume());await ready(page);return}
  distance*=level==='FAR'?1.35:level==='CLOSE'?.75:actual==='FAR'?.8:1.2
 }
 throw new Error(`Actual semantic zoom never reached ${level}`)
}
async function prepare(page:Page,request:APIRequestContext,state:ReferenceState):Promise<ExecutionSession>{
 let session:ExecutionSession
 if(state.id==='debug'){
  const started=await startFixture(page,request,'debug','debug')
  await expect.poll(async()=>{const current=await currentSession(request);return current?.id===started.id?current.pause?.reason:null},{timeout:15000}).toBe('entry')
  await page.getByRole('button',{name:'Continue',exact:true}).click()
  await expect.poll(async()=>{const current=await currentSession(request);return current?.id===started.id?{phase:current.phase,reason:current.pause?.reason,line:current.pause?.line}:null},{timeout:15000}).toEqual({phase:'PAUSED',reason:'breakpoint',line:5})
  session=(await currentSession(request))!
  expect(session.build?.success).toBe(true);expect(session.rawEvents.length).toBeGreaterThan(0)
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA?.appState().execution)).toBe('DEBUG_PAUSED')
  await ready(page);await home(page)
  return session
 }
 session=await runFixture(page,request,state.fixture)
 const events=await page.evaluate(()=>window.__ggjavaezWorld!.recordedEvents())
 let cursor=events.length
 if(['runtime-hero','history'].includes(state.id)){
  const event=events.find(event=>event.type==='SET_FIELD'&&event.value.kind==='primitive'&&event.value.value===18)
  expect(event,'Recorded domain setter mutates a field to 18').toBeTruthy();cursor=event!.seq+1
 }
 if(state.id==='recursion'){
  const entries=events.filter(event=>event.type==='ENTER_METHOD');expect(entries.length).toBeGreaterThanOrEqual(6);cursor=entries.at(-1)!.seq+1
 }
 if(state.id==='return'){
  // The preserved JVM pipeline proves a destination when the returned value
  // is consumed by a write, after the return event. Legacy RETURN_VALUE can
  // legitimately have destination=null before this captured evidence exists.
  const event=events.find(event=>event.type==='EXECUTION_FACT'&&event.fact.kind==='write'&&event.fact.origin.kind==='call_result')
  expect(event,'Returned call result has a captured consuming write').toBeTruthy();cursor=event!.seq+1
 }
 if(state.id==='array-operation'){
  const event=events.find(event=>event.type==='ARRAY_WRITE'&&event.source?.line===11);expect(event,'Actual sorting-loop array write, after initialization').toBeTruthy();cursor=event!.seq+1
 }
 if(cursor!==events.length)await seekCursor(page,cursor)
 await home(page)
 if(state.id==='runtime-hero'){await page.evaluate(()=>window.__ggjavaezQA!.frameHero());await ready(page)}
 if(['focus','object-inspection'].includes(state.id)){
  const id=await page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene();return scene.order.objects.find(id=>scene.entities[id].kind==='object'&&scene.entities[id].ownership==='PROJECT')})
  expect(id).toBeTruthy();await selectEntity(page,id!)
  await page.getByRole('button',{name:'Focus',exact:true}).click();await ready(page)
  await expect(page.getByRole('complementary',{name:'Selection inspector'})).toBeVisible()
  expect(await page.evaluate(()=>window.__ggjavaezQA!.appState().overlays)).toContain('FOCUS')
 }
 if(state.id==='recursion')expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().liveStack.length)).toBeGreaterThanOrEqual(4)
 if(state.id==='return')expect(await page.evaluate(()=>window.__ggjavaezWorld!.plan().curves.filter(curve=>curve.kind==='return').length)).toBeGreaterThan(0)
 if(state.id==='array-operation')expect(await page.evaluate(()=>Object.values(window.__ggjavaezWorld!.scene().entities).some(node=>node.kind==='array'&&node.activity?.kind==='write'))).toBe(true)
 if(state.id==='array')expect(await page.evaluate(()=>window.__ggjavaezQA!.planStats()!.cells)).toBeGreaterThanOrEqual(5)
 if(state.id==='history'){
  expect(await page.evaluate(()=>window.__ggjavaezQA!.appState().overlays)).toContain('HISTORY')
  await expect(page.getByRole('button',{name:'Return to Live',exact:true})).toBeVisible()
 }
 if(state.id==='exception'){
  expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().exception?.uncaught)).toBe(true)
  expect(await page.evaluate(()=>window.__ggjavaezQA!.appState().failure)).toBe('uncaught-exception')
  // Missing forensic rendering is a failure, not a substitute completed view.
  expect(await page.evaluate(()=>window.__ggjavaezWorld!.plan().exceptionPanel)).not.toBeNull()
 }
 if(state.id==='io')expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().io.map(endpoint=>endpoint.id).sort())).toEqual(['stderr','stdin','stdout'])
 if(['far','medium','close'].includes(state.id))await zoom(page,state.id.toUpperCase() as DetailLevel)
 if(state.id==='free'){
  const before=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
  await page.locator('.world-canvas').focus();await page.keyboard.press('ArrowRight');await ready(page)
  expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).not.toEqual(before)
 }
 return session
}
for(const definition of states.states){
 const state=definition as ReferenceState
 for(const viewport of states.viewports){
  const label=`${viewport.width}x${viewport.height}`
  test(`${state.name} [${label}]`,async({page,request},testInfo)=>{
   const errors=browserErrors(page);await page.setViewportSize(viewport)
   const session=await prepare(page,request,state)
   await testInfo.attach('actual-jvm-session',{body:JSON.stringify({id:session.id,rawEvents:session.rawEvents.length,buildSuccess:session.build?.success}),contentType:'application/json'})
   const captureErrors:unknown[]=[]
   try{await captureComparison(page,request,state,session.id,label)}catch(error){captureErrors.push(error)}
   // One additional full-viewport native-resolution capture per state. Panel
   // references stay cropped only in the comparison, not in application capture.
   if(viewport===states.viewports[0]){
    await page.setViewportSize(state.native);await ready(page)
    if(['focus','object-inspection'].includes(state.id)){await page.getByRole('button',{name:'Focus selection',exact:true}).click();await ready(page)}else if(state.id==='runtime-hero'){await page.evaluate(()=>window.__ggjavaezQA!.frameHero());await ready(page)}else if(!['far','medium','close','free'].includes(state.id))await home(page)
    if(['far','medium','close'].includes(state.id))await zoom(page,state.id.toUpperCase() as DetailLevel)
    try{await captureComparison(page,request,state,session.id,'native')}catch(error){captureErrors.push(error)}
   }
   expect(errors).toEqual([])
   if(captureErrors.length)throw new AggregateError(captureErrors,`Reference captures failed: ${state.id} ${label}`)
  })
 }
}
