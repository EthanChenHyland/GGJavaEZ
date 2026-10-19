import {expect,it} from 'vitest'
import fc from 'fast-check'
import type {TraceEvent} from '../contracts/runtime'
import {normalizeTrace} from '../instrumentation/normalize'
import {seek} from '../runtime'
import {generateRawTrace} from '../testing/traceGen'
import {createLayoutEngine} from '../world/layoutEngine'
import {createSceneProjector} from '../world/sceneProjector'
import {planPresentation} from '../world/presentationPlanner'
import {anchorCorners} from '../world/presentationPlanner'
import {exceptionPanelAnchor,exceptionPanelFor} from '../world/exceptionPanelPlacement'
import type {SceneExceptionPath} from '../contracts/world'
import {followInvocations,guidedFollow,isFollowSubjectEvent} from './guidedFollow'
import {projectionCamera,screenPoint,type OrbitPose} from './projection'
const raw=generateRawTrace({seed:17,rawEvents:80,callRate:.95,maxDepth:9,allocateRate:.1})
const trace=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace
const layout=createLayoutEngine();layout.append(trace.events)
function fixture(depth:number){
 const event=trace.events.find(event=>event.type==='ENTER_METHOD'&&seek(trace,event.seq+1).activeFrameIds.length>=depth)!
 expect(event).toBeTruthy()
 const scene=createSceneProjector(trace).project(seek(trace,event.seq+1),layout.state,{sessionEnded:false,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
 const plan=planPresentation({scene,layout:layout.state,detailLevel:'CLOSE',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})
 return{scene,plan,event}
}
const current:OrbitPose={target:[4,-2,0],distance:100,yawDeg:8,pitchDeg:-13}
it('Property 51: recursive Follow fits the four actual nearest callers and preserves monotone screen centres (100 viewports)',()=>{
 const{scene,plan,event}=fixture(7),before=JSON.stringify(scene),chain=followInvocations(scene)
 fc.assert(fc.property(fc.integer({min:760,max:1920}),fc.integer({min:650,max:1117}),(width,height)=>{
  const viewport={width,height},safe={x:width*.3,y:height*.1,width:width*.65,height:height*.73}
  const next=guidedFollow(scene,plan,event,current,safe,viewport,null),pose=next.pose!,camera=projectionCamera(pose,viewport)
  expect(next.recursion).toBe(true);expect(next.ids).toEqual(chain.slice(-4))
  expect(pose.yawDeg).toBe(18);expect(pose.pitchDeg).toBe(-16)
  for(const point of next.points){const p=screenPoint(point,camera,viewport);expect(p.x).toBeGreaterThanOrEqual(safe.x);expect(p.x).toBeLessThanOrEqual(safe.x+safe.width);expect(p.y).toBeGreaterThanOrEqual(safe.y);expect(p.y).toBeLessThanOrEqual(safe.y+safe.height)}
  const centres=next.ids.map(id=>screenPoint(scene.entities[id].anchor.position,camera,viewport))
  const xSteps=centres.slice(1).map((point,index)=>point.x-centres[index].x)
  // Off-centre perspective can reverse the horizontal direction. Requirement
  // 10.2 requires monotonicity, not a prescribed left-to-right direction.
  expect(xSteps.every(step=>step>=0)||xSteps.every(step=>step<=0)).toBe(true)
  for(let i=1;i<centres.length;i++)expect(centres[i].y).toBeGreaterThan(centres[i-1].y)
 }),{numRuns:100})
 expect(JSON.stringify(scene)).toBe(before)
})
it('does not move again when the recursive subjects already fit, and returns to Hero angles after depth decreases',()=>{
 const deep=fixture(7),viewport={width:1440,height:900},safe={x:430,y:90,width:970,height:660}
 const first=guidedFollow(deep.scene,deep.plan,deep.event,current,safe,viewport,null)
 expect(guidedFollow(deep.scene,deep.plan,deep.event,first.pose!,safe,viewport,true).pose).toBeNull()
 const shallow=fixture(3),next=guidedFollow(shallow.scene,shallow.plan,shallow.event,first.pose!,safe,viewport,true)
 expect(next.recursion).toBe(false);expect(next.pose?.yawDeg).toBe(8);expect(next.pose?.pitchDeg).toBe(-13)
 for(const point of next.points){const p=screenPoint(point,projectionCamera(next.pose!,viewport),viewport);expect(p.x).toBeGreaterThanOrEqual(safe.x);expect(p.x).toBeLessThanOrEqual(safe.x+safe.width);expect(p.y).toBeGreaterThanOrEqual(safe.y);expect(p.y).toBeLessThanOrEqual(safe.y+safe.height)}
})
it('includes a captured important object mutation, ignores future events, and leaves already included subjects untouched',()=>{
 const{scene,plan,event}=fixture(2),id=scene.order.objects[0],mutation={...event,type:'SET_FIELD',objectId:id,slotId:'captured-field',value:{kind:'primitive',javaType:'int',value:18},importance:'major'} as TraceEvent
 const observed={...scene,cursorEvent:{...scene.cursorEvent!,subjects:[id]}}
 const viewport={width:1440,height:900},safe={x:430,y:90,width:970,height:660}
 const next=guidedFollow(observed,plan,mutation,{...current,distance:4},safe,viewport,false)
 expect(next.ids).toContain(id)
 for(const point of anchorCorners(scene.entities[id].anchor)){const p=screenPoint(point,projectionCamera(next.pose!,viewport),viewport);expect(p.x).toBeGreaterThanOrEqual(safe.x);expect(p.x).toBeLessThanOrEqual(safe.x+safe.width);expect(p.y).toBeGreaterThanOrEqual(safe.y);expect(p.y).toBeLessThanOrEqual(safe.y+safe.height)}
 expect(guidedFollow(observed,plan,mutation,next.pose!,safe,viewport,false).pose).toBeNull()
 expect(guidedFollow(observed,plan,{...mutation,seq:scene.cursor},current,safe,viewport,false).ids).not.toContain(id)
 expect(isFollowSubjectEvent({...mutation,importance:'quiet'})).toBe(false)
})
it('includes captured throwing-frame and Throwable evidence with the structural panel after the live stack has unwound',()=>{
 const{scene}=fixture(7),throwFrameId=scene.liveStack.at(-1)!,exceptionId=scene.order.objects[0]
 expect(exceptionId).toBeTruthy()
 const unavailable={kind:'unavailable' as const,introducedSeq:null,changedSeq:null,eventIds:[],unavailableReason:'not captured'}
 const exception:SceneExceptionPath={exceptionId,throwFrameId,className:'sample.Failure',simpleName:'Failure',message:'captured message',unwound:[throwFrameId],catchFrameId:null,uncaught:true,causes:[],complete:true,throwLine:null,stack:[],stackEvidence:unavailable,causeEvidence:unavailable,evidence:scene.entities[throwFrameId].evidence}
 const terminal={...scene,liveHead:scene.cursor,liveStack:[],exception}
 const panel=exceptionPanelFor(terminal)!,plan=planPresentation({scene:terminal,layout:layout.state,detailLevel:'CLOSE',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})
 const before=JSON.stringify(terminal),viewport={width:760,height:900},safe={x:16,y:100,width:728,height:620}
 const next=guidedFollow(terminal,plan,null,{...current,distance:4},safe,viewport,true)
 expect(next.ids).toEqual([throwFrameId,exceptionId]);expect(next.recursion).toBe(false)
 expect(next.pose?.yawDeg).toBe(8);expect(next.pose?.pitchDeg).toBe(-13)
 const points=[...next.ids.flatMap(id=>anchorCorners(scene.entities[id].anchor)),...anchorCorners(exceptionPanelAnchor(panel,scene.recording))]
 for(const point of points){const p=screenPoint(point,projectionCamera(next.pose!,viewport),viewport);expect(p.x).toBeGreaterThanOrEqual(safe.x);expect(p.x).toBeLessThanOrEqual(safe.x+safe.width);expect(p.y).toBeGreaterThanOrEqual(safe.y);expect(p.y).toBeLessThanOrEqual(safe.y+safe.height)}
 expect(guidedFollow(terminal,plan,null,next.pose!,safe,viewport,false).pose).toBeNull()
 expect(JSON.stringify(terminal)).toBe(before)
})
