import {expect,it} from 'vitest'
import fc from 'fast-check'
import type {SceneModel} from '../contracts/world'
import {normalizeTrace} from '../instrumentation/normalize'
import {generateRawTrace} from '../testing/traceGen'
import {seek} from '../runtime'
import {createLayoutEngine} from '../world/layoutEngine'
import {createSceneProjector} from '../world/sceneProjector'
import {planPresentation} from '../world/presentationPlanner'
import {homeFraming} from './homeFraming'
import {heroFraming} from './heroFraming'
import {anchorCorners} from '../world/presentationPlanner'
import {projectionCamera,screenPoint} from './projection'
const full={state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false} as const
function world(seed:number):{scene:SceneModel;layout:ReturnType<typeof createLayoutEngine>['state']}{
 const raw=generateRawTrace({seed,rawEvents:40,classes:1,callRate:.15,allocateRate:1,maxDepth:2}),trace=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace
 const event=[...trace.events].reverse().find(event=>event.type==='SET_FIELD')??[...trace.events].reverse().find(event=>event.type==='ENTER_METHOD')!
 const cursor=event.seq+1,layout=createLayoutEngine();layout.append(trace.events)
 const scene=createSceneProjector(trace).project(seek(trace,cursor),layout.state,{sessionEnded:false,pausedAtLiveHead:false,liveHead:trace.events.length,recording:full})
 return{scene,layout:layout.state}
}
it('Home keeps every chosen representative inside Safe Frame without moving world anchors (100 viewports)',()=>{
 fc.assert(fc.property(fc.integer({min:1,max:100}),fc.integer({min:1024,max:1728}),fc.integer({min:650,max:1117}),(seed,width,height)=>{
  const{scene,layout}=world(seed),before=Object.values(scene.entities).map(node=>node.anchor)
  const plan=planPresentation({scene,layout,detailLevel:'MEDIUM',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})
  const safe={x:Math.max(340,width*.25)+width*.02,y:height*.1,width:width*.985-Math.max(340,width*.25)-width*.02,height:height*.75}
  const home=homeFraming(scene,plan,safe,{width,height},layout),camera=projectionCamera(home.pose,{width,height})
  for(const point of home.points){const p=screenPoint(point,camera,{width,height});expect(p.x).toBeGreaterThanOrEqual(safe.x-1e-5);expect(p.x).toBeLessThanOrEqual(safe.x+safe.width+1e-5);expect(p.y).toBeGreaterThanOrEqual(safe.y-1e-5);expect(p.y).toBeLessThanOrEqual(safe.y+safe.height+1e-5)}
  expect(Object.values(scene.entities).map(node=>node.anchor)).toEqual(before)
  const groups=home.ids.filter(id=>scene.entities[id].anchor.region!=='stack').map(id=>JSON.stringify(layout.placement[id].clusterPath))
  expect(new Set(groups).size).toBe(groups.length)
  for(const id of home.ids)expect(anchorCorners(scene.entities[id].anchor)).toHaveLength(8)
 }),{numRuns:100})
})
it('Hero contains live frames and mandatory evidence without changing the scene or layout (100 viewports)',()=>{
 fc.assert(fc.property(fc.integer({min:1,max:100}),fc.integer({min:760,max:1728}),fc.integer({min:650,max:1117}),(seed,width,height)=>{
  const{scene,layout}=world(seed),before=JSON.stringify(scene),anchors=layout.anchors
  const plan=planPresentation({scene,layout,detailLevel:'MEDIUM',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})
  const left=width<1024?40:Math.max(340,width*.25)+width*.02,safe={x:left,y:height*.1,width:width*.985-left,height:height*.75}
  const pose=heroFraming(scene,plan,safe,{width,height}),camera=projectionCamera(pose,{width,height})
  for(const id of new Set([...scene.liveStack,...plan.pinned]))for(const point of anchorCorners(scene.entities[id].anchor)){
   const p=screenPoint(point,camera,{width,height});expect(p.x).toBeGreaterThanOrEqual(safe.x-1e-5);expect(p.x).toBeLessThanOrEqual(safe.x+safe.width+1e-5);expect(p.y).toBeGreaterThanOrEqual(safe.y-1e-5);expect(p.y).toBeLessThanOrEqual(safe.y+safe.height+1e-5)
  }
  expect(JSON.stringify(scene)).toBe(before);expect(layout.anchors).toBe(anchors)
 }),{numRuns:100})
})
