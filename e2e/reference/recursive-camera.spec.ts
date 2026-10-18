import {expect,test,type Page} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {browserErrors,follow,home,ready,runFixture,seekCursor,stopOwnedSession} from './harness'
test.afterEach(async({request})=>stopOwnedSession(request))
async function angles(page:Page){return page.evaluate(()=>{
 const{position,target}=window.__ggjavaezQA!.cameraPose(),d=position.map((v,i)=>v-target[i])
 return{yaw:Math.atan2(d[0],d[2])*180/Math.PI,pitch:-Math.atan2(d[1],Math.hypot(d[0],d[2]))*180/Math.PI}
})}
for(const viewport of[{width:1728,height:1117},{width:1440,height:900},{width:1280,height:800},{width:760,height:900},{width:1440,height:650}])test(`actual recursive Follow frames nearest ancestors, yields to manual input and returns to Hero angles ${viewport.width}x${viewport.height}`,async({page,request})=>{
 test.setTimeout(60000);await page.setViewportSize(viewport)
 const errors=browserErrors(page)
 await runFixture(page,request,'recursion')
 const positions=await page.evaluate(()=>{
  const events=window.__ggjavaezWorld!.recordedEvents(),deep=events.filter(event=>event.type==='ENTER_METHOD').at(-1)!.seq+1
  const live=new Set<string>();let shallow:number|null=null
  for(const event of events){
   if(event.type==='ENTER_METHOD')live.add(event.frameId)
   if(event.type==='EXIT_METHOD'||event.type==='UNWIND_EXCEPTION')live.delete(event.frameId)
   if(event.seq+1>deep&&live.size===3){shallow=event.seq+1;break}
  }
  return{deep,shallow}
 })
 expect(positions.shallow).not.toBeNull()
 await seekCursor(page,positions.deep);await home(page)
 expect(await angles(page)).toEqual({yaw:expect.closeTo(8,6),pitch:expect.closeTo(-13,6)})
 const homeHeadings=await page.evaluate(()=>({labels:window.__ggjavaezWorld!.structuralLabels(),planned:window.__ggjavaezWorld!.plan().headings,safe:window.__ggjavaezQA!.shellRects().safeFrame,pose:window.__ggjavaezQA!.cameraPose()}))
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/recursion-home-headings-${viewport.width}x${viewport.height}.png`})
 await writeFile(`.ggjavaez/qa/reference-exact/recursion-home-headings-${viewport.width}x${viewport.height}.json`,JSON.stringify(homeHeadings,null,2)+'\n')
 if(homeHeadings.labels.some(label=>['STACK','HEAP'].includes(label.id)&&!label.visible)){
  const diagnostic=await page.evaluate(async()=>{
   const framingPath='/src/camera/homeFraming.ts',projectionPath='/src/camera/projection.ts',labelsPath='/src/render/text/structuralLabelLayout.ts',solidsPath='/src/render/SolidBatch.tsx'
   const [{homeFraming},{projectionCamera,cameraPosition},{placeStructuralLabels,projectStructuralObstacle,regionHeadingSpec},{buildSolidBatch}]=await Promise.all([import(framingPath),import(projectionPath),import(labelsPath),import(solidsPath)])
   const world=window.__ggjavaezWorld!,scene=world.scene(),plan=world.plan(),safe=window.__ggjavaezQA!.shellRects().safeFrame,viewport={width:innerWidth,height:innerHeight},fitted=homeFraming(scene,plan,safe,viewport),camera=projectionCamera(fitted.pose,viewport)
   const blocked=buildSolidBatch(scene,plan).filter((solid:{role:string})=>solid.role!=='face').flatMap((solid:{anchor:import('../../src/contracts/worldV2').WorldAnchor})=>{const obstacle=projectStructuralObstacle(solid.anchor,camera,viewport);return obstacle?[obstacle]:[]})
   return{scene,plan:{...plan,entities:[...plan.entities],pinned:[...plan.pinned],cellWindows:[...plan.cellWindows]},fitted,eye:{position:cameraPosition(fitted.pose),target:fitted.pose.target},labels:placeStructuralLabels(plan.headings.slice(0,2).map(heading=>regionHeadingSpec(heading.id,heading.position)),camera,viewport,safe,blocked)}
  })
  await writeFile(test.info().outputPath('home-heading-current-cut.json'),JSON.stringify(diagnostic,null,2)+'\n')
 }
 for(const id of['STACK','HEAP']){
  const label=homeHeadings.labels.find(label=>label.id===id)!,s=homeHeadings.safe
  expect(label,`${id} is actually visible after Home in the deepest captured prefix`).toMatchObject({visible:true})
  expect(label.minimumFontPixels).toBeGreaterThanOrEqual(12)
  const r=label.bounds!;expect(r.x).toBeGreaterThanOrEqual(s.x);expect(r.y).toBeGreaterThanOrEqual(s.y)
  expect(r.x+r.width).toBeLessThanOrEqual(s.x+s.width);expect(r.y+r.height).toBeLessThanOrEqual(s.y+s.height)
 }
 const before=await page.evaluate(()=>({cursor:window.__ggjavaezQA!.cursor(),selection:window.__ggjavaezQA!.selection(),anchors:Object.values(window.__ggjavaezWorld!.scene().entities).map(node=>node.anchor)}))
 await follow(page)
 expect(await angles(page)).toEqual({yaw:expect.closeTo(18,6),pitch:expect.closeTo(-16,6)})
 const observation=await page.evaluate(()=>({scene:window.__ggjavaezWorld!.scene(),world:window.__ggjavaezQA!.worldProjection()!,safe:window.__ggjavaezQA!.shellRects().safeFrame,cursor:window.__ggjavaezQA!.cursor(),selection:window.__ggjavaezQA!.selection()}))
 expect(observation.cursor).toEqual(before.cursor);expect(observation.selection).toEqual(before.selection)
 expect(Object.values(observation.scene.entities).map(node=>node.anchor)).toEqual(before.anchors)
 const nearest=observation.scene.liveStack.slice(-4).map(id=>observation.world.entities.find(body=>body.id===id)!)
 expect(nearest).toHaveLength(4)
 for(const body of nearest){const r=body.bounds!,s=observation.safe;expect(r.x).toBeGreaterThanOrEqual(s.x-1e-5);expect(r.y).toBeGreaterThanOrEqual(s.y-1e-5);expect(r.x+r.width).toBeLessThanOrEqual(s.x+s.width+1e-5);expect(r.y+r.height).toBeLessThanOrEqual(s.y+s.height+1e-5)}
 const centres=nearest.map(body=>({x:body.face!.x+body.face!.width/2,y:body.face!.y+body.face!.height/2})),xSteps=centres.slice(1).map((p,i)=>p.x-centres[i].x)
 expect(xSteps.every(d=>d>=0)||xSteps.every(d=>d<=0)).toBe(true)
 for(let i=1;i<centres.length;i++)expect(centres[i].y).toBeGreaterThan(centres[i-1].y)
 await page.locator('.world-canvas').focus();await page.keyboard.press('ArrowRight');await ready(page)
 const manual=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
 await seekCursor(page,positions.deep+1)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(manual)
 await follow(page);await seekCursor(page,positions.shallow!);await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().liveStack.length)).toBe(3)
 expect(await angles(page)).toEqual({yaw:expect.closeTo(8,6),pitch:expect.closeTo(-13,6)})
 expect(errors).toEqual([])
})
