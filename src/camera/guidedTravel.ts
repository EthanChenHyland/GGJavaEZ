import {Vector3,type Box3} from 'three'
import type {Vec3} from '../contracts/worldV2'
import {cameraPosition,type OrbitPose} from './projection'
import {collisionSafeRoute,type CameraLimits,type EyePose} from './cameraConstraints'
const tuple=(point:Vector3):Vec3=>[point.x,point.y,point.z]
export interface GuidedTravel {path:EyePose[];lengths:number[];total:number}

/** Collision detours preserve each semantic leg's target order. */
export function guidedTravel(from:EyePose,poses:readonly OrbitPose[],boxes:readonly Box3[],center:Vec3|undefined,limits:CameraLimits):GuidedTravel {
 const path=[from]
 for(const pose of poses){
  const start=path.at(-1)!,destination={position:cameraPosition(pose),target:pose.target},route=collisionSafeRoute(start,destination,boxes,center,limits)
  const endTarget=route.at(-1)!.target
  const legs=route.map((point,index)=>new Vector3(...point.position).distanceTo(new Vector3(...(index?route[index-1]:start).position))),total=legs.reduce((sum,length)=>sum+length,0)
  let travelled=0
  for(const[ index,point]of route.entries()){
   travelled+=legs[index]
   path.push({...point,target:tuple(new Vector3(...start.target).lerp(new Vector3(...endTarget),total?travelled/total:1))})
  }
 }
 const lengths=path.slice(1).map((point,index)=>Math.hypot(new Vector3(...point.position).distanceTo(new Vector3(...path[index].position)),new Vector3(...point.target).distanceTo(new Vector3(...path[index].target)))),total=lengths.reduce((sum,length)=>sum+length,0)
 return{path,lengths,total}
}

export function travelPose(travel:GuidedTravel,progress:number):EyePose {
 if(progress>=1||travel.path.length===1)return travel.path.at(-1)!
 let distance=Math.max(0,progress)*travel.total,index=0
 while(index<travel.lengths.length-1&&distance>travel.lengths[index]){distance-=travel.lengths[index];index++}
 const fraction=travel.lengths[index]?distance/travel.lengths[index]:1,from=travel.path[index],to=travel.path[index+1]
 return{position:tuple(new Vector3(...from.position).lerp(new Vector3(...to.position),fraction)),target:tuple(new Vector3(...from.target).lerp(new Vector3(...to.target),fraction))}
}
