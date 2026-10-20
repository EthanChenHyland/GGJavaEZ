import {expect,test} from '@playwright/test'
import {PerspectiveCamera,Vector3} from 'three'
import {writeFile} from 'node:fs/promises'
import {browserErrors,focusSelection,home,ready,runFixture,selectEntity,stopOwnedSession} from './harness'
test.afterEach(async({request})=>stopOwnedSession(request))
for(const viewport of[{width:1440,height:900},{width:760,height:900}])test(`actual reference value inset selects its captured slot and preserves Focus ${viewport.width}x${viewport.height}`,async({page,request})=>{
 const errors=browserErrors(page);await page.setViewportSize(viewport)
 const session=await runFixture(page,request,'domain');await home(page)
 const target=await page.evaluate(()=>{
  const scene=window.__ggjavaezWorld!.scene()
  for(const node of Object.values(scene.entities))if(node.kind==='object'&&node.ownership==='PROJECT'){
   const row=node.groups.flatMap(group=>group.rows).find(row=>row.value.kind==='reference'&&scene.entities[row.value.targetId])
   if(row)return{ownerId:node.id,slotId:row.slotId}
  }
  throw new Error('Actual execution has no project-owned reference field')
 })
 await selectEntity(page,target.ownerId);await focusSelection(page);await ready(page)
 const before=await page.evaluate(async target=>{
  const columnsPath='/src/render/text/faceTypography.ts',rowsPath='/src/world/faceRows.ts'
  const {faceRowColumns}=await import(columnsPath),{faceRows,faceRowPort}=await import(rowsPath)
  const world=window.__ggjavaezWorld!,scene=world.scene(),plan=world.plan(),node=scene.entities[target.ownerId],shown=plan.entities.get(node.id)!
  const columns=faceRowColumns(node,shown),row=faceRowPort(node,shown,target.slotId,faceRows(node,shown))
  if(!row)throw new Error('Captured reference row is not presented')
  return{pose:window.__ggjavaezQA!.cameraPose(),scene,point:[node.anchor.position[0]+node.anchor.size[0]/2-.28-columns.value/2,row[1],node.anchor.position[2]+node.anchor.size[2]/2+.081] as [number,number,number]}
 },target)
 const camera=new PerspectiveCamera(36,viewport.width/viewport.height,.01,100000)
 camera.position.set(...before.pose.position);camera.lookAt(...before.pose.target);camera.updateMatrixWorld()
 const projected=new Vector3(...before.point).project(camera),point={x:(projected.x+1)*viewport.width/2,y:(1-projected.y)*viewport.height/2}
 expect(point.x).toBeGreaterThan(0);expect(point.x).toBeLessThan(viewport.width);expect(point.y).toBeGreaterThan(0);expect(point.y).toBeLessThan(viewport.height)
 await page.mouse.click(point.x,point.y);await ready(page)
 const after=await page.evaluate(()=>({selection:window.__ggjavaezQA!.selection(),pose:window.__ggjavaezQA!.cameraPose(),scene:window.__ggjavaezWorld!.scene()}))
 expect(after.selection).toEqual({kind:'slot',id:target.slotId});expect(after.pose).toEqual(before.pose)
 expect(after.scene.recordingId).toBe(before.scene.recordingId);expect(after.scene.cursor).toBe(before.scene.cursor)
 expect(after.scene.entities).toEqual(before.scene.entities);expect(after.scene.references).toEqual(before.scene.references)
 await expect(page.getByRole('button',{name:'Focus',exact:true})).toHaveAttribute('aria-pressed','true')
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/reference-chip-picked-${viewport.width}x${viewport.height}.png`})
 await writeFile(test.info().outputPath('reference-chip-pick.json'),JSON.stringify({sessionId:session.id,target,point,before,after},null,2)+'\n')
 expect(errors).toEqual([])
})
