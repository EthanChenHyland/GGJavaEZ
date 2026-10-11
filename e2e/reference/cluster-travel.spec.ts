import {expect,test,type Page} from '@playwright/test'
import {PerspectiveCamera,Vector3} from 'three'
import {browserErrors,home,ready,runFixture,stopOwnedSession} from './harness'
import type {PresentedCluster} from '../../src/contracts/worldV2'
test.afterEach(async({request})=>stopOwnedSession(request))

async function far(page:Page){
 await page.locator('.world-canvas').focus()
 for(let index=0;index<40&&await page.evaluate(()=>window.__ggjavaezWorld!.plan().detailLevel!=='FAR');index++){
  await page.waitForTimeout(210);await page.keyboard.press('-');await ready(page)
 }
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.plan().detailLevel)).toBe('FAR')
}
async function clickCluster(page:Page,double=false,region?:'heap'):Promise<PresentedCluster>{
 const snapshot=await page.evaluate(()=>({pose:window.__ggjavaezQA!.cameraPose(),shell:window.__ggjavaezQA!.shellRects(),clusters:window.__ggjavaezWorld!.plan().clusters}))
 const viewport=page.viewportSize()!,camera=new PerspectiveCamera(36,viewport.width/viewport.height,.05,10000)
 camera.position.set(...snapshot.pose.position);camera.lookAt(...snapshot.pose.target);camera.updateMatrixWorld()
 for(const cluster of snapshot.clusters){
  if(region&&cluster.anchor.region!==region)continue
  const [x,y,z]=cluster.anchor.position,[w,h,d]=cluster.anchor.size
  for(const [u,v] of [[0,0],[-.3,0],[.3,0],[0,.3],[0,-.3]]){
   const p=new Vector3(x+u*w,y+v*h,z+d/2+.02).project(camera),point={x:(p.x+1)*viewport.width/2,y:(1-p.y)*viewport.height/2}
   const safe=snapshot.shell.safeFrame,inspector=snapshot.shell.inspector
   if(p.z<=-1||p.z>=1||point.x<safe.x||point.x>safe.x+safe.width||point.y<safe.y||point.y>safe.y+safe.height||inspector&&point.x>=inspector.x&&point.x<=inspector.x+inspector.width&&point.y>=inspector.y&&point.y<=inspector.y+inspector.height)continue
   await page.mouse.click(point.x,point.y)
   // Read-only observation after the real raycast selection has committed.
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
   if(await page.evaluate(id=>window.__ggjavaezQA!.selection()?.kind==='cluster'&&window.__ggjavaezQA!.selection()?.id===id,cluster.id)){
    if(double)await page.mouse.dblclick(point.x,point.y)
    return cluster
   }
  }
 }
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/cluster-travel-unreachable.png'})
 throw new Error('No actual cluster face was reachable by native pointer input')
}
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
 const p=new Vector3(...cluster.anchor.position).project(finalCamera),x=(p.x+1)*scenario.width/2,y=(1-p.y)*scenario.height/2
 expect(p.z).toBeGreaterThan(-1);expect(p.z).toBeLessThan(1)
 expect(x).toBeGreaterThanOrEqual(safe.x-.01);expect(x).toBeLessThanOrEqual(safe.x+safe.width+.01)
 expect(y).toBeGreaterThanOrEqual(safe.y-.01);expect(y).toBeLessThanOrEqual(safe.y+safe.height+.01)
 expect(result.members.some(({bounds:b})=>b&&b.x>=safe.x-.01&&b.y>=safe.y-.01&&b.x+b.width<=safe.x+safe.width+.01&&b.y+b.height<=safe.y+safe.height+.01)).toBe(true)
 expect(await facts()).toEqual(before)
 if(!await page.evaluate(id=>window.__ggjavaezWorld!.plan().clusters.some(cluster=>cluster.id===id),cluster.id))await expect(page.getByRole('complementary',{name:'Selection inspector'}).locator('p').first()).toHaveText('Cluster is not in the current presentation')
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/cluster-travel-${scenario.width}x${scenario.height}${'reduced'in scenario?'-reduced':''}${'heap'in scenario?'-heap':''}.png`})
 if(!('reduced'in scenario)){
  await page.evaluate(()=>window.__ggjavaezQA!.clock.resume());await far(page);await step(0);await clickCluster(page,true,region);await step(200)
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
