import {expect,test} from '@playwright/test'
import {PerspectiveCamera,Vector3} from 'three'
import {browserErrors,home,ready,runFixture,stopOwnedSession} from './harness'
import {far,clickCluster} from './clusterInteractions'
test.afterEach(async({request})=>stopOwnedSession(request))

const scenarios=[{width:1728,height:1117},{width:1440,height:900},{width:1280,height:800},{width:760,height:900},{width:1440,height:650},{width:1440,height:900,reduced:true},{width:1440,height:900,heap:true},{width:760,height:900,heap:true}]
for(const scenario of scenarios)test(`cluster double-click travels without changing runtime or Focus ${scenario.width}x${scenario.height}${'reduced'in scenario?' reduced':''}${'heap'in scenario?' heap':''}`,async({page,request})=>{
 test.setTimeout(60000);await page.setViewportSize(scenario);await page.emulateMedia({reducedMotion:'no-preference'})
 const errors=browserErrors(page);await runFixture(page,request,'dense');await home(page);await far(page)
 if(scenario.width===1440&&scenario.height===900&&!('reduced'in scenario)){
  await clickCluster(page)
  if('heap'in scenario)await page.getByRole('complementary',{name:'Selection inspector'}).getByRole('list',{name:'Cluster members'}).getByRole('button').first().click()
  await page.locator('.world-canvas').focus();await page.keyboard.press('Enter');await ready(page)
  await expect(page.getByRole('button',{name:'Focus',exact:true})).toHaveAttribute('aria-pressed','true');await far(page)
  if('heap'in scenario)expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget()?.kind)).toBe('frame')
 }
 const facts=()=>page.evaluate(()=>({recording:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor,anchors:Object.fromEntries(Object.entries(window.__ggjavaezWorld!.scene().entities).map(([id,node])=>[id,node.anchor])),overlays:window.__ggjavaezQA!.appState().overlays,focus:window.__ggjavaezQA!.focusTarget()}))
 const before=await facts(),start=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
 if('reduced'in scenario)await page.emulateMedia({reducedMotion:'reduce'})
 const step=async(ms:number)=>page.evaluate(async ms=>{window.__ggjavaezQA!.clock.step(ms);await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));return window.__ggjavaezQA!.cameraPose()},ms)
 const region='heap'in scenario?'heap' as const:undefined
 await step(0);const cluster=await clickCluster(page,true,region);await step(0)
 if(region)expect(cluster.anchor.region).toBe(region)
 if(!('reduced'in scenario)){
  const middle=await step(450);expect(middle).not.toEqual(start);await step(449);await step(1)
 }
 await ready(page)
 const result=await page.evaluate(ids=>({pose:window.__ggjavaezQA!.cameraPose(),plan:window.__ggjavaezQA!.planStats(),shell:window.__ggjavaezQA!.shellRects(),members:ids.filter(id=>window.__ggjavaezWorld!.plan().entities.get(id)?.mode==='detailed').map(id=>({id,bounds:window.__ggjavaezWorld!.worldProjection().entities.find(body=>body.id===id)?.bounds}))}),cluster.memberIds)
 await test.info().attach('actual-cluster-destination',{body:JSON.stringify({cluster,result}),contentType:'application/json'})
 expect(result.pose).not.toEqual(start);expect(result.plan!.detailLevel).toBe(cluster.key.kind==='ownership'?'CLOSE':'MEDIUM')
 const safe={...result.shell.safeFrame}
 if(scenario.width<1024&&result.shell.inspector)safe.height=Math.min(safe.y+safe.height,result.shell.inspector.y-scenario.height*.01)-safe.y
 const finalCamera=new PerspectiveCamera(36,scenario.width/scenario.height,.05,10000)
 finalCamera.position.set(...result.pose.position);finalCamera.lookAt(...result.pose.target);finalCamera.updateMatrixWorld()
 const arrival=cluster.key.kind==='ownership'?result.members.find(({bounds:b})=>b&&b.x>=safe.x-.01&&b.y>=safe.y-.01&&b.x+b.width<=safe.x+safe.width+.01&&b.y+b.height<=safe.y+safe.height+.01):undefined
 const arrivalAnchor=arrival?before.anchors[arrival.id].position:cluster.anchor.position
 const p=new Vector3(...arrivalAnchor).project(finalCamera),x=(p.x+1)*scenario.width/2,y=(1-p.y)*scenario.height/2
 expect(p.z).toBeGreaterThan(-1);expect(p.z).toBeLessThan(1)
 expect(x).toBeGreaterThanOrEqual(safe.x-.01);expect(x).toBeLessThanOrEqual(safe.x+safe.width+.01)
 expect(y).toBeGreaterThanOrEqual(safe.y-.01);expect(y).toBeLessThanOrEqual(safe.y+safe.height+.01)
 expect(result.members.some(({bounds:b})=>b&&b.x>=safe.x-.01&&b.y>=safe.y-.01&&b.x+b.width<=safe.x+safe.width+.01&&b.y+b.height<=safe.y+safe.height+.01)).toBe(true)
 expect(await facts()).toEqual(before)
 if(!await page.evaluate(id=>window.__ggjavaezWorld!.plan().clusters.some(cluster=>cluster.id===id),cluster.id))await expect(page.getByRole('complementary',{name:'Selection inspector'}).locator('p').first()).toHaveText('Cluster is not in the current presentation')
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/cluster-travel-${scenario.width}x${scenario.height}${'reduced'in scenario?'-reduced':''}${'heap'in scenario?'-heap':''}.png`})
 if(!('reduced'in scenario)){
  await page.evaluate(()=>window.__ggjavaezQA!.clock.resume())
  // A distant ownership member can leave its stable proxy off-screen after
  // zooming out. Use native Home to establish this independent cancellation
  // interaction when there is no Focus to preserve; do not teleport via QA.
  if(!before.focus){await page.getByRole('complementary',{name:'Selection inspector'}).getByRole('button',{name:'Close inspector'}).click();await home(page)}
  await far(page);expect(await facts()).toEqual(before);await step(0);await clickCluster(page,true,region);await step(200)
  const selection=await page.evaluate(()=>window.__ggjavaezQA!.selection())
  await page.locator('.world-canvas').focus();await page.keyboard.press('ArrowRight');const cancelled=await step(0)
  expect(await step(2000)).toEqual(cancelled);expect(await facts()).toEqual(before)
  expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual(selection)
  if(scenario.height===650){
   await page.evaluate(()=>window.__ggjavaezQA!.clock.resume());await far(page);await step(0);await clickCluster(page,true);await step(200)
   const slider=page.getByRole('slider',{name:'Recorded execution position'});await slider.focus();await page.keyboard.press('Home')
   await expect(slider).toHaveAttribute('aria-valuenow','0');const retired=await step(0)
   expect(await step(2000)).toEqual(retired)
   expect(await page.evaluate(()=>window.__ggjavaezWorld!.plan().pinned.size)).toBe(0)
   expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget())).toEqual(before.focus)
  }
 }
 await page.evaluate(()=>window.__ggjavaezQA!.clock.resume());await ready(page);expect(errors).toEqual([])
})
