import {expect,test} from '@playwright/test'
import {PerspectiveCamera,Vector3} from 'three'
import {writeFile} from 'node:fs/promises'
import {browserErrors,home,ready,runFixture,stopOwnedSession} from './harness'
test.afterEach(async({request})=>stopOwnedSession(request))
for(const viewport of[{width:1440,height:900},{width:760,height:900}])test(`actual connector hover shows captured endpoints without selection or camera changes ${viewport.width}x${viewport.height}`,async({page,request})=>{
 const errors=browserErrors(page);await page.setViewportSize(viewport)
 const session=await runFixture(page,request,'domain');await home(page)
 const observeWorld=()=>page.evaluate(()=>{
  const world=window.__ggjavaezWorld!,scene=world.scene(),pose=window.__ggjavaezQA!.cameraPose()
  const curves=world.plan().curves.flatMap(curve=>{
   const ref=scene.references.find(reference=>reference.id===curve.id),source=ref?scene.entities[ref.sourceId]:null,target=ref?scene.entities[ref.targetId]:null
   if(!ref||!source||!target||source.kind!=='frame'&&source.kind!=='object'||target.kind==='class'||target.kind==='frame')return[]
   const rows=source.kind==='frame'?source.rows:source.groups.flatMap(group=>group.rows),row=rows.find(row=>row.slotId===ref.sourceSlotId)
   return row?[{id:curve.id,points:curve.points,sourceKind:source.kind,sourceTitle:source.title,name:row.name,targetTitle:target.title,targetId:target.displayId}]:[]
  })
  return{curves,pose,safe:window.__ggjavaezQA!.shellRects().safeFrame,before:{recordingId:scene.recordingId,cursor:scene.cursor,selection:window.__ggjavaezQA!.selection(),pose}}
 })
 type Observed=Awaited<ReturnType<typeof observeWorld>>
 const candidatesFor=(observed:Observed,sourceKind:'frame'|'object')=>{
  const camera=new PerspectiveCamera(36,viewport.width/viewport.height,.05,10000);camera.position.set(...observed.pose.position);camera.lookAt(...observed.pose.target);camera.updateMatrixWorld()
  const project=(point:readonly[number,number,number])=>{const p=new Vector3(...point).project(camera);return{x:(p.x+1)*viewport.width/2,y:(1-p.y)*viewport.height/2,z:p.z}}
  return observed.curves.filter(curve=>curve.sourceKind===sourceKind).flatMap(curve=>curve.points.slice(1).flatMap((point,index)=>{
   const a=project(curve.points[index]),b=project(point),length=Math.hypot(b.x-a.x,b.y-a.y)
   if(length<20||a.z>1||b.z>1)return[]
   return[.35,.5,.65].map(t=>({curve,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,nx:-(b.y-a.y)/length,ny:(b.x-a.x)/length,length}))
  })).filter(point=>point.x>observed.safe.x+8&&point.x<observed.safe.x+observed.safe.width-8&&point.y>observed.safe.y+8&&point.y<observed.safe.y+observed.safe.height-8).sort((a,b)=>b.length-a.length)
 }
 // Home is a bounded readable composition, rather than a fit of every heap
 // object. Reach both actual reference kinds with native exploration before
 // measuring hover; all hover invariance/timing checks start after this setup.
 let observed=await observeWorld(),nativeDollySteps=0
 while((!candidatesFor(observed,'frame').length||!candidatesFor(observed,'object').length)&&nativeDollySteps<24){
  await page.locator('.world-canvas').focus();await page.keyboard.press('-');await ready(page)
  nativeDollySteps++;observed=await observeWorld()
 }
 const restoreExploration=async()=>{
  await home(page)
  for(let step=0;step<nativeDollySteps;step++){await page.locator('.world-canvas').focus();await page.keyboard.press('-');await ready(page)}
 }
 const tip=page.locator('[data-connector-tooltip]'),captures=[]
 for(const sourceKind of ['frame','object']as const){
  const candidates=candidatesFor(observed,sourceKind)
  let found:typeof candidates[number]|undefined,halo=false,showMs=0
  for(const candidate of candidates.slice(0,120)){
   const start=performance.now();await page.mouse.move(candidate.x,candidate.y);await page.waitForTimeout(25)
   if(!await tip.count()||await tip.getAttribute('data-connector-tooltip')!==candidate.curve.id)continue
   showMs=performance.now()-start;expect(showMs).toBeLessThanOrEqual(200)
   await expect(tip).toContainText(candidate.curve.sourceTitle);await expect(tip).toContainText(candidate.curve.name);await expect(tip).toContainText(candidate.curve.targetTitle);await expect(tip).toContainText(`#${candidate.curve.targetId}`)
   for(const sign of [-1,1]){
    await page.mouse.move(candidate.x+candidate.nx*3*sign,candidate.y+candidate.ny*3*sign);await page.waitForTimeout(25)
    if(await tip.count()&&await tip.getAttribute('data-connector-tooltip')===candidate.curve.id){halo=true;break}
   }
   if(halo){found=candidate;break}
  }
  expect(found,`A visible ${sourceKind} reference core and its 3 px halo offset must be native-hoverable`).toBeDefined()
  const after=await page.evaluate(()=>({recordingId:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor,selection:window.__ggjavaezQA!.selection(),pose:window.__ggjavaezQA!.cameraPose()}))
  expect(after).toEqual(observed.before);captures.push({sourceKind,referenceId:found!.curve.id,name:found!.curve.name,showMs,haloOffsetPx:3,point:[found!.x,found!.y]})
  const bounds=(await tip.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width);expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height)
  await ready(page);await page.screenshot({path:`.ggjavaez/qa/reference-exact/connector-hover-${sourceKind}-${viewport.width}x${viewport.height}.png`})
  const start=performance.now();await page.mouse.move(25,25);await expect(tip).toHaveCount(0,{timeout:200});expect(performance.now()-start).toBeLessThanOrEqual(200)
 }
 const last=captures.at(-1)!
 await page.mouse.move(last.point[0],last.point[1]);await expect(tip).toHaveAttribute('data-connector-tooltip',last.referenceId,{timeout:200})
 await page.mouse.wheel(0,60);await expect(tip).toHaveCount(0,{timeout:200});await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).not.toEqual(observed.before.pose)
 await restoreExploration();await page.mouse.move(last.point[0],last.point[1]);await expect(tip).toHaveAttribute('data-connector-tooltip',last.referenceId,{timeout:200})
 await page.locator('.world-canvas').focus();await page.keyboard.press('+');await expect(tip).toHaveCount(0,{timeout:200});await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).not.toEqual(observed.before.pose)
 await restoreExploration();await page.mouse.click(last.point[0],last.point[1]);await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'reference',id:last.referenceId})
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().cursor)).toBe(observed.before.cursor)
 await writeFile(`.ggjavaez/qa/reference-exact/connector-hover-${viewport.width}x${viewport.height}.json`,JSON.stringify({sessionId:session.id,nativeDollySteps,before:observed.before,captures,errors},null,2)+'\n');expect(errors).toEqual([])
})
