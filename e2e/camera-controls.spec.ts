import {expect,test,type Page} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {browserErrors,follow,home,ready,seekCursor,selectEntity} from './reference/harness'

const pose=(page:Page)=>page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
const facts=(page:Page)=>page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene();return{recording:scene.recordingId,cursor:scene.cursor,anchors:Object.fromEntries(Object.entries(scene.entities).map(([id,node])=>[id,node.anchor])),references:scene.references}})
async function open(page:Page){
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/examples?qa=1')
 await page.waitForFunction(()=>typeof window.__ggjavaezQA?.ready==='function');await ready(page)
 await seekCursor(page,18);await home(page)
 expect(await page.getByRole('slider',{name:'Recorded execution position'}).getAttribute('aria-valuemax')).toBe('21')
}

test('native zoom and Home preserve the recorded state and manual input overrides Follow',async({page})=>{
 const errors=browserErrors(page);await open(page)
 const before=await facts(page),baseline=await pose(page),projection=await page.evaluate(()=>window.__ggjavaezWorld!.worldProjection())
 await follow(page);const guided=await pose(page)
 await page.locator('.world-canvas').focus();await page.keyboard.press('+');await ready(page)
 const manual=await pose(page);expect(manual).not.toEqual(guided)
 await seekCursor(page,19);expect(await pose(page)).toEqual(manual)
 await seekCursor(page,18);expect(await pose(page)).toEqual(manual)
 await page.locator('.world-canvas').focus()
 for(let i=0;i<12;i++){await page.keyboard.press('+');await ready(page)}
 for(let i=0;i<20;i++){await page.keyboard.press('-');await ready(page)}
 expect(await pose(page)).not.toEqual(baseline)
 await home(page)
 const restored=await pose(page)
 await writeFile(test.info().outputPath('home-geometry.json'),JSON.stringify({before,baseline,guided,manual,restored,projection,restoredProjection:await page.evaluate(()=>window.__ggjavaezWorld!.worldProjection())},null,2)+'\n')
 for(const key of ['position','target']as const)for(let axis=0;axis<3;axis++)expect(restored[key][axis]).toBeCloseTo(baseline[key][axis],7)
 expect(await facts(page)).toEqual(before)
 await expect(page.getByRole('slider',{name:'Recorded execution position'})).toHaveAttribute('aria-valuenow','18')
 for(const retired of ['Classic','Spatial','Theater'])await expect(page.getByRole('button',{name:retired,exact:true})).toHaveCount(0)
 expect(errors).toEqual([])
})

test('native object and reference picking share Inspector and retain the viewport',async({page})=>{
 const errors=browserErrors(page);await open(page)
 const before=await facts(page),baseline=await pose(page)
 const target=await page.evaluate(()=>{
  const scene=window.__ggjavaezWorld!.scene(),object=Object.values(scene.entities).find(node=>node.kind==='object'&&node.displayId===17)!
  const reference=scene.references.find(reference=>reference.targetId===object.id&&(()=>{const source=scene.entities[reference.sourceId];return source.kind==='frame'&&source.rows.some(row=>row.slotId===reference.sourceSlotId&&row.name==='p')})())!
  return{objectId:object.id,reference}
 })
 await selectEntity(page,target.objectId)
 const inspector=page.getByRole('complementary',{name:'Selection inspector'})
 await expect(inspector).toContainText('#17');expect(await pose(page)).toEqual(baseline)
 await inspector.getByRole('button',{name:'Close inspector',exact:true}).click();await ready(page)
 const points=await page.evaluate(async id=>{
  const path='/src/camera/projection.ts',{projectionCamera,screenPoint}=await import(path),pose=window.__ggjavaezQA!.cameraPose()
  const rect=document.querySelector('.world-canvas canvas')!.getBoundingClientRect(),delta=pose.position.map((v,i)=>v-pose.target[i]),distance=Math.hypot(...delta)
  const camera=projectionCamera({target:pose.target,distance,yawDeg:Math.atan2(delta[0],delta[2])*180/Math.PI,pitchDeg:-Math.asin(delta[1]/distance)*180/Math.PI},rect)
  const curve=window.__ggjavaezWorld!.plan().curves.find(curve=>curve.id===id)!,safe=window.__ggjavaezQA!.shellRects().safeFrame
  return curve.points.slice(1).flatMap((to,index)=>{
   const from=curve.points[index],point=from.map((v,i)=>(v+to[i])/2),p=screenPoint(point,camera,rect),x=rect.x+p.x,y=rect.y+p.y
   return p.z>-1&&p.z<1&&x>safe.x&&x<safe.x+safe.width&&y>safe.y&&y<safe.y+safe.height?[{x,y}]:[]
  })
 },target.reference.id)
 expect(points.length).toBeGreaterThan(0)
 let picked=false
 for(const point of points){
  await page.mouse.click(point.x,point.y)
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await ready(page)
  picked=await page.evaluate(id=>window.__ggjavaezQA!.selection()?.kind==='reference'&&window.__ggjavaezQA!.selection()?.id===id,target.reference.id)
  if(picked)break
  if(await inspector.count())await inspector.getByRole('button',{name:'Close inspector',exact:true}).click()
 }
 expect(picked,'The recorded main-frame p reference is picked through the actual depth-tested curve').toBe(true)
 await expect(inspector).toContainText(`Recorded reference · ${target.reference.sourceSlotId} → ${target.objectId}`)
 expect(await pose(page)).toEqual(baseline);expect(await facts(page)).toEqual(before)
 await inspector.getByRole('button',{name:'Close inspector',exact:true}).click();await ready(page)
 await page.locator('.world-canvas').focus();await page.keyboard.press('-');await ready(page)
 const moved=await pose(page);expect(moved).not.toEqual(baseline)
 await selectEntity(page,target.objectId);await ready(page)
 expect(await pose(page)).toEqual(moved);expect(await facts(page)).toEqual(before)
 expect(errors).toEqual([])
})
