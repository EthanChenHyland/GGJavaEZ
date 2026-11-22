import {expect,it} from 'vitest'
import type {WorldAnchor} from '../contracts/world'
import {cameraPosition} from './projection'
import {cameraCollisionBoxes,constrainCameraPose} from './cameraConstraints'
import {focusFraming} from './focusFraming'
import {focusAngles} from './focusAngles'
import {clusterAnchor} from '../world/clusterAnchor'

const anchor=(id:string,x:number,z=0,region:WorldAnchor['region']='stack'):WorldAnchor=>({entityId:id,region,position:[x,-4,z],size:[4.8,7.5,2.4],ports:{},bodyPort:[x,-4,z+1.2]})
it('uses the nearest recorded neighbour to choose the exposed side and points structural proxies out of their region',()=>{
 const frame=anchor('frame',0)
 expect(focusAngles(frame,[]).yaw).toBeLessThan(-30)
 expect(focusAngles(frame,[anchor('left',-8)]).yaw).toBeGreaterThan(30)
 expect(focusAngles(frame,[anchor('right',8)]).yaw).toBeLessThan(-30)
 const neighbours=[anchor('left',-8),anchor('right',4),anchor('far-left',-12)]
 expect(focusAngles(frame,neighbours)).toEqual(focusAngles(frame,[neighbours[1]]))
 for(const region of ['stack','class','heap','library'] as const){
  expect(focusAngles({...frame,region},[],true)).toEqual({yaw:region==='stack'||region==='class'?-21:21,pitch:-8})
 }
})
it('preserves an oblique sight line when the shell shifts the body off-axis',()=>{
 const body=anchor('object',9,3,'heap')
 const viewports=[{width:1440,height:900},{width:760,height:900}]
 const areas=[{x:654,y:90,width:764,height:675},{x:24,y:60,width:713,height:561}]
 for(const [i,viewport] of viewports.entries()){
  const area=areas[i],angles=focusAngles(body,[anchor('companion',0)],false,{area,viewport})
  const pose=focusFraming(body,angles,area,viewport)
  const [x,y,z]=cameraPosition(pose).map((point,axis)=>point-body.position[axis])
  const yaw=Math.atan2(x,z)*180/Math.PI,pitch=Math.atan2(y,Math.hypot(x,z))*180/Math.PI
  expect(yaw).toBeGreaterThan(25);expect(yaw).toBeLessThan(40)
  expect(pitch).toBeGreaterThan(12);expect(pitch).toBeLessThan(24)
 }
})
it('leaves a stack-proxy Focus dolly outside the actual slab collision band',()=>{
 const frames=Array.from({length:30},(_,i)=>anchor(`frame-${i}`,0,i*3.8)),proxy=clusterAnchor('structural-group',frames[0])
 const boxes=cameraCollisionBoxes(frames,.05,36*Math.PI/180,1440/900)
 const pose=focusFraming(proxy,focusAngles(proxy,[],true),{x:330,y:90,width:770,height:690},{width:1440,height:900})
 let eye={position:cameraPosition(pose),target:pose.target}
 const limits={minDistance:1.7,maxDistance:500,pan:[500,500,500] as const}
 eye=constrainCameraPose(eye,eye,boxes,[0,-4,55],limits)
 for(let i=0;i<40;i++){
  const requested={target:eye.target,position:eye.position.map((value,axis)=>eye.target[axis]+(value-eye.target[axis])*1.1) as [number,number,number]}
  const next=constrainCameraPose(requested,eye,boxes,[0,-4,55],limits)
  expect(next.position[0]).toBeLessThan(-2.64)
  expect(next.position).toEqual(requested.position)
  eye=next
 }
})
