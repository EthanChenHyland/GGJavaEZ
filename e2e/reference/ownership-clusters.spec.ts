import {expect,test,type Page} from '@playwright/test'
import {PerspectiveCamera,Vector3} from 'three'
import {writeFile} from 'node:fs/promises'
import {browserErrors,home,ready,runFixture,stopOwnedSession} from './harness'
import {clickCluster,far} from './clusterInteractions'
import {ownershipObservation} from '../../src/world/recordedOwnership'
test.afterEach(async({request})=>stopOwnedSession(request))
const snapshot=(page:Page)=>page.evaluate(async()=>{
 // Read the production row model in its browser environment (Vite owns the
 // token/font imports), rather than copying visibility math into this test.
 const modulePath='/src/world/faceRows.ts',shared=await import(modulePath)
 const scene=window.__ggjavaezWorld!.scene(),plan=window.__ggjavaezWorld!.plan(),visibleReferences:Record<string,string[]>={}
 for(const presented of plan.entities.values())if(presented.mode==='detailed')visibleReferences[presented.id]=shared.faceRows(scene.entities[presented.id],presented).visible.flatMap((row:{value:{kind:string;targetId?:string}})=>row.value.kind==='reference'&&row.value.targetId?[row.value.targetId]:[])
 return{scene,events:window.__ggjavaezWorld!.recordedEvents(),entities:[...plan.entities.values()],clusters:plan.clusters,pinned:[...plan.pinned],detail:plan.detailLevel,visibleReferences}
})
async function checkCut(page:Page){
 const data=await snapshot(page),owners=new Map(data.events.slice(0,data.scene.cursor).flatMap(event=>{const observation=ownershipObservation(event);return observation?[[observation.id,observation.value] as const]:[]}))
 const external=Object.keys(data.scene.entities).filter(id=>['JDK','LIBRARY'].includes(owners.get(id)??''))
 expect(external.length).toBeGreaterThan(0)
 const exempt=new Set(data.pinned)
 for(const presented of data.entities){
  const node=data.scene.entities[presented.id]
  if(presented.mode!=='detailed'||!(node.kind==='frame'||node.kind==='object'&&owners.get(node.id)==='PROJECT'))continue
  for(const target of data.visibleReferences[presented.id])exempt.add(target)
 }
 for(const id of external)if(!exempt.has(id)){
  expect(data.entities.find(entity=>entity.id===id),`Unexempt external identity ${id}`).toBeUndefined()
  const clusters=data.clusters.filter(cluster=>cluster.memberIds.includes(id));expect(clusters.length).toBe(1)
  expect(clusters[0].key).toEqual({kind:'ownership',value:owners.get(id)})
 }
 for(const cluster of data.clusters){
  expect(cluster.members).toBe(cluster.memberIds.length)
  if(cluster.key.kind==='ownership')for(const id of cluster.memberIds)expect(owners.get(id)).toBe(cluster.key.value)
 }
 const ids=[...data.entities.map(entity=>entity.id),...data.clusters.flatMap(cluster=>cluster.memberIds)]
 expect(ids.length).toBe(Object.keys(data.scene.entities).length);expect(new Set(ids).size).toBe(ids.length)
 return data
}
const scenarios=[{width:1728,height:1117},{width:1440,height:900},{width:1280,height:800},{width:760,height:900},{width:1440,height:650},{width:1440,height:900,reduced:true}]
for(const scenario of scenarios)test(`actual JVM ownership collapse and native CLOSE travel ${scenario.width}x${scenario.height}${'reduced'in scenario?' reduced':''}`,async({page,request})=>{
 test.setTimeout(60000);await page.setViewportSize(scenario);await page.emulateMedia({reducedMotion:'no-preference'})
 const errors=browserErrors(page),session=await runFixture(page,request,'dense');await home(page);await far(page)
 const initial=await checkCut(page)
 if(scenario.width===1440&&scenario.height===900&&!('reduced'in scenario))await writeFile('.ggjavaez/qa/reference-exact/ownership-travel-recorded-scene.json',JSON.stringify({realJvmExecuted:true,sessionId:session.id,...initial},null,2)+'\n')
 await page.locator('.world-canvas').focus()
 for(let i=0;i<30&&await page.evaluate(()=>window.__ggjavaezWorld!.plan().detailLevel==='FAR');i++){await page.waitForTimeout(210);await page.keyboard.press('+');await ready(page)}
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.plan().detailLevel)).toBe('MEDIUM');await checkCut(page);await far(page)
 if(scenario.width===1440&&scenario.height===900&&!('reduced'in scenario)){
  await clickCluster(page)
  await page.getByRole('complementary',{name:'Selection inspector'}).getByRole('list',{name:'Cluster members'}).getByRole('button').first().click()
  await page.locator('.world-canvas').focus();await page.keyboard.press('Enter');await ready(page);await far(page)
  expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget()?.kind)).toBe('frame')
 }
 const facts=()=>page.evaluate(()=>({recording:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor,anchors:Object.fromEntries(Object.entries(window.__ggjavaezWorld!.scene().entities).map(([id,node])=>[id,node.anchor])),focus:window.__ggjavaezQA!.focusTarget(),overlays:window.__ggjavaezQA!.appState().overlays}))
 const before=await facts(),start=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
 const selected=await clickCluster(page,false,undefined,true);expect(selected.key.kind).toBe('ownership')
 await ready(page);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(start)
 await expect(page.getByRole('list',{name:'Cluster members'})).toHaveAttribute('aria-label','Cluster members')
 if('reduced'in scenario)await page.emulateMedia({reducedMotion:'reduce'})
 const step=async(ms:number)=>page.evaluate(async ms=>{window.__ggjavaezQA!.clock.step(ms);await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));return window.__ggjavaezQA!.cameraPose()},ms)
 await step(0);const cluster=await clickCluster(page,true,undefined,true);await step(0)
 if(!('reduced'in scenario)){expect(await step(450)).not.toEqual(start);await step(450)}
 await ready(page);expect(await page.evaluate(()=>window.__ggjavaezWorld!.plan().detailLevel)).toBe('CLOSE')
 const result=await page.evaluate(ids=>({pose:window.__ggjavaezQA!.cameraPose(),shell:window.__ggjavaezQA!.shellRects(),members:ids.filter(id=>window.__ggjavaezWorld!.plan().entities.get(id)?.mode==='detailed').map(id=>({id,bounds:window.__ggjavaezWorld!.worldProjection().entities.find(body=>body.id===id)?.bounds}))}),cluster.memberIds)
 const safe={...result.shell.safeFrame};if(scenario.width<1024&&result.shell.inspector)safe.height=Math.min(safe.y+safe.height,result.shell.inspector.y-scenario.height*.01)-safe.y
 const camera=new PerspectiveCamera(36,scenario.width/scenario.height,.05,10000);camera.position.set(...result.pose.position);camera.lookAt(...result.pose.target);camera.updateMatrixWorld()
 const p=new Vector3(...cluster.anchor.position).project(camera),x=(p.x+1)*scenario.width/2,y=(1-p.y)*scenario.height/2
 expect(p.z).toBeGreaterThan(-1);expect(p.z).toBeLessThan(1);expect(x).toBeGreaterThanOrEqual(safe.x-.01);expect(x).toBeLessThanOrEqual(safe.x+safe.width+.01);expect(y).toBeGreaterThanOrEqual(safe.y-.01);expect(y).toBeLessThanOrEqual(safe.y+safe.height+.01)
 expect(result.members.some(({bounds:b})=>b&&b.x>=safe.x-.01&&b.y>=safe.y-.01&&b.x+b.width<=safe.x+safe.width+.01&&b.y+b.height<=safe.y+safe.height+.01)).toBe(true)
 expect(await facts()).toEqual(before)
 await test.info().attach('recorded-ownership-travel',{body:JSON.stringify({realJvmExecuted:true,sessionId:session.id,cluster,result}),contentType:'application/json'})
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/ownership-travel-${scenario.width}x${scenario.height}${'reduced'in scenario?'-reduced':''}.png`})
 await page.evaluate(()=>window.__ggjavaezQA!.clock.resume());await ready(page);expect(errors).toEqual([])
})
