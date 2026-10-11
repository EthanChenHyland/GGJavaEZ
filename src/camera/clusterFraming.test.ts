import { expect,it } from 'vitest'
import { generateRawTrace } from '../testing/traceGen'
import { normalizeTrace } from '../instrumentation/normalize'
import { seek } from '../runtime'
import { createLayoutEngine } from '../world/layoutEngine'
import { createSceneProjector } from '../world/sceneProjector'
import { planPresentation } from '../world/presentationPlanner'
import { anchorCorners } from '../world/presentationPlanner'
import { cameraCollisionBoxes,constrainCameraPose } from './cameraConstraints'
import { Vector3 } from 'three'
import type { OrbitPose } from './projection'
import { clusterFraming } from './clusterFraming'
import { cameraPosition,nextDetailLevel,projectionCamera,representativeFaceHeight,screenPoint } from './projection'

function catalog(){
  const raw=generateRawTrace({seed:17,rawEvents:1600,classes:1,callRate:.7,allocateRate:.9,maxDepth:8})
  const trace=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace
  const layout=createLayoutEngine();layout.append(trace.events)
  const scene=createSceneProjector(trace).project(seek(trace,trace.events.length),layout.state,{sessionEnded:true,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
  const plan=planPresentation({scene,layout:layout.state,detailLevel:'FAR',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})
  // Synthetic sources carry no project ownership evidence. Keep the actual
  // conservative library placement rather than reclassifying by their names.
  const cluster=plan.clusters.find(cluster=>cluster.memberIds.some(id=>scene.entities[id].kind==='object'))
  expect(cluster,JSON.stringify({generated:raw.stats,accounting:plan.accounting,groups:plan.clusters.map(c=>({region:c.anchor.region,members:c.members}))})).toBeTruthy()
  return{scene,cluster:cluster!,layout:layout.state}
}
function admitted(data:ReturnType<typeof catalog>,viewport:{width:number;height:number}){
  const boxes=cameraCollisionBoxes(Object.values(data.scene.entities).map(node=>node.anchor),.05,36*Math.PI/180,viewport.width/viewport.height)
  const diagonal=Math.hypot(...data.layout.bounds!.size),limits={minDistance:1.7,maxDistance:3*diagonal,pan:[diagonal,diagonal,diagonal] as [number,number,number]}
  return(pose:OrbitPose):OrbitPose=>{
    const eye={position:cameraPosition(pose),target:pose.target},safe=constrainCameraPose(eye,eye,boxes,data.layout.bounds!.center,limits)
    const delta=new Vector3(...safe.position).sub(new Vector3(...safe.target)),distance=delta.length()
    return{target:safe.target,distance,yawDeg:Math.atan2(delta.x,delta.z)*180/Math.PI,pitchDeg:-Math.asin(delta.y/distance)*180/Math.PI}
  }
}
it('reaches MEDIUM physically while framing the proxy anchor and an actual separate member in all five viewports',()=>{
  const data=catalog(),{scene,cluster}=data,before=JSON.stringify({scene,cluster});expect(cluster).toBeTruthy()
  for(const[width,height]of [[1728,1117],[1440,900],[1280,800],[760,900],[1440,650]]){
    const viewport={width,height},safe={x:width*.3,y:height*.1,width:width*.65,height:height*.65}
    const result=clusterFraming(scene,cluster,safe,viewport,undefined,admitted(data,viewport));expect(result,`${width}x${height}`).not.toBeNull()
    expect(cluster.memberIds).toContain(result!.memberId);expect(scene.entities[result!.memberId]).toBeTruthy()
    const camera=projectionCamera(result!.pose,viewport),metric=representativeFaceHeight(scene,camera,viewport)!
    for(const level of ['FAR','MEDIUM','CLOSE'] as const)expect(nextDetailLevel(level,metric,height)).toBe('MEDIUM')
    for(const value of [...anchorCorners(scene.entities[result!.memberId].anchor),cluster.anchor.position]){
      const point=screenPoint(value,camera,viewport)
      expect(point.z).toBeGreaterThan(-1);expect(point.z).toBeLessThan(1)
      expect(point.x).toBeGreaterThanOrEqual(safe.x);expect(point.x).toBeLessThanOrEqual(safe.x+safe.width)
      expect(point.y).toBeGreaterThanOrEqual(safe.y);expect(point.y).toBeLessThanOrEqual(safe.y+safe.height)
    }
  }
  expect(JSON.stringify({scene,cluster})).toBe(before)
})
it('measures CLOSE for an explicit ownership key without rewriting the scene ownership',()=>{
  const data=catalog(),before=JSON.stringify(data.scene)
  const cluster={...data.cluster,key:{kind:'ownership' as const,value:'LIBRARY'}}
  const viewport={width:1440,height:900},safe={x:432,y:90,width:936,height:585}
  const result=clusterFraming(data.scene,cluster,safe,viewport,undefined,admitted(data,viewport))
  expect(result).not.toBeNull();expect(result!.detailLevel).toBe('CLOSE')
  const height=representativeFaceHeight(data.scene,projectionCamera(result!.pose,viewport),viewport)
  for(const level of ['FAR','MEDIUM','CLOSE'] as const)expect(nextDetailLevel(level,height,viewport.height)).toBe('CLOSE')
  expect(JSON.stringify(data.scene)).toBe(before)
})
it('never substitutes a proxy or an absent member for runtime geometry',()=>{
  const {scene,cluster}=catalog(),safe={x:400,y:90,width:1000,height:600},viewport={width:1440,height:900}
  expect(clusterFraming(scene,{...cluster,memberIds:['absent']},safe,viewport)).toBeNull()
  expect(clusterFraming(scene,undefined,safe,viewport)).toBeNull()
  expect(clusterFraming(scene,cluster,{...safe,width:0},viewport)).toBeNull()
  expect(clusterFraming(scene,cluster,safe,viewport,undefined,pose=>({...pose,distance:NaN}))).toBeNull()
  expect(clusterFraming(scene,cluster,safe,viewport,undefined,pose=>({...pose,target:[1e9,1e9,1e9]}))).toBeNull()
})
it('accounts a travel member once, retires its pin, and never promotes a proxy or unknown slot',()=>{
  const {scene,cluster,layout}=catalog(),member=cluster.memberIds[0]
  const input={scene,layout,detailLevel:'MEDIUM' as const,selection:null,focusTargetId:null,trace:{active:false,scope:'relevant' as const}}
  const before=JSON.stringify(scene),plan=planPresentation({...input,clusterTravelMemberId:member})
  expect(plan.entities.get(member)).toMatchObject({mode:'detailed',pinned:true,pickable:true})
  expect(plan.clusters.flatMap(cluster=>cluster.memberIds)).not.toContain(member)
  const ids=[...plan.entities.keys(),...plan.clusters.flatMap(cluster=>cluster.memberIds)]
  expect(new Set(ids).size).toBe(Object.keys(scene.entities).length);expect(ids.length).toBe(Object.keys(scene.entities).length)
  const ordinary=planPresentation(input)
  expect(planPresentation({...input,clusterTravelMemberId:cluster.id})).toEqual(ordinary)
  expect(planPresentation({...input,clusterTravelMemberId:'absent-slot'})).toEqual(ordinary)
  expect(planPresentation(input,plan)).toEqual({...ordinary,revision:plan.revision+1});expect(JSON.stringify(scene)).toBe(before)
})
