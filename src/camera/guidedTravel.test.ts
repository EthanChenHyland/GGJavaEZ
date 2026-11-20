import {expect,it} from 'vitest'
import {Box3,Vector3} from 'three'
import {cameraSegmentHit,type CameraLimits} from './cameraConstraints'
import {cameraPosition,type OrbitPose} from './projection'
import {guidedTravel,travelPose} from './guidedTravel'
const limits:CameraLimits={minDistance:1.5,maxDistance:100,pan:[100,100,100]}
it('routes the lens around a solid while the target advances monotonically along its semantic leg',()=>{
 const box=new Box3(new Vector3(-1,-1,4),new Vector3(1,1,6)),from={position:[-4,0,5] as const,target:[-4,-.6958655,0] as const},destination:OrbitPose={target:[4,-.6958655,0],distance:5/Math.cos(8*Math.PI/180),yawDeg:0,pitchDeg:-8},before=JSON.stringify(from)
 const travel=guidedTravel(from,[destination],[box],[0,0,0],limits)
 expect(travel.path.length).toBeGreaterThan(2)
 for(let index=1;index<travel.path.length;index++){expect(cameraSegmentHit(new Vector3(...travel.path[index-1].position),new Vector3(...travel.path[index].position),box)).toBeNull();expect(travel.path[index].target[0]).toBeGreaterThanOrEqual(travel.path[index-1].target[0])}
 expect(travelPose(travel,1)).toEqual({position:cameraPosition(destination),target:destination.target})
 let previous=-Infinity
 for(let index=0;index<=100;index++){const pose=travelPose(travel,index/100);expect(pose.target[0]).toBeGreaterThanOrEqual(previous);previous=pose.target[0];expect([...pose.position,...pose.target].every(Number.isFinite)).toBe(true)}
 expect(JSON.stringify(from)).toBe(before)
})
it('finishes a target-only move and reaches the final waypoint even when earlier eye distances are zero',()=>{
 const from={position:[0,0,10] as const,target:[0,0,0] as const},destination:OrbitPose={target:[1,0,0],distance:Math.sqrt(101),yawDeg:-Math.atan(.1)*180/Math.PI,pitchDeg:0}
 const travel=guidedTravel(from,[{target:from.target,distance:10,yawDeg:0,pitchDeg:0},destination],[],[0,0,0],limits)
 expect(travel.total).toBeCloseTo(1,8)
 expect(travelPose(travel,.5).target[0]).toBeCloseTo(.5,8)
 expect(travelPose(travel,1).target).toEqual(destination.target)
 expect(travelPose(travel,1).position[2]).toBeCloseTo(10,8)
 expect(travelPose(guidedTravel(from,[],[],[0,0,0],limits),.5)).toEqual(from)
})
