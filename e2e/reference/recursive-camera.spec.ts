import {expect,test,type Page} from '@playwright/test'
import {browserErrors,follow,home,ready,runFixture,seekCursor,stopOwnedSession} from './harness'
test.afterEach(async({request})=>stopOwnedSession(request))
async function angles(page:Page){return page.evaluate(()=>{
 const{position,target}=window.__ggjavaezQA!.cameraPose(),d=position.map((v,i)=>v-target[i])
 return{yaw:Math.atan2(d[0],d[2])*180/Math.PI,pitch:-Math.atan2(d[1],Math.hypot(d[0],d[2]))*180/Math.PI}
})}
test('actual recursive Follow frames nearest ancestors, yields to manual input and returns to Hero angles',async({page,request})=>{
 test.setTimeout(60000)
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
