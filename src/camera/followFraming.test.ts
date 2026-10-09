import {expect,it} from 'vitest'
import {followFraming} from './followFraming'
import {projectionCamera,screenPoint,type OrbitPose} from './projection'
import type {Vec3} from '../contracts/worldV2'
const viewport={width:1440,height:900},safe={x:450,y:100,width:850,height:650}
const pose:OrbitPose={target:[0,0,0],distance:24,yawDeg:8,pitchDeg:-13}
it('leaves an already included subject untouched',()=>{expect(followFraming([[0,0,0]],pose,safe,viewport)).toBeNull()})
it('preserves orientation and distance when panning alone includes the subject',()=>{
 const points:Vec3[]=[[12,0,0],[13,-1,0]],next=followFraming(points,pose,safe,viewport)!
 expect(next).not.toBeNull();expect(next.distance).toBe(pose.distance);expect(next.yawDeg).toBe(pose.yawDeg);expect(next.pitchDeg).toBe(pose.pitchDeg)
 for(const point of points){const p=screenPoint(point,projectionCamera(next,viewport),viewport);expect(p.x).toBeGreaterThanOrEqual(safe.x-.01);expect(p.x).toBeLessThanOrEqual(safe.x+safe.width+.01);expect(p.y).toBeGreaterThanOrEqual(safe.y-.01);expect(p.y).toBeLessThanOrEqual(safe.y+safe.height+.01)}
})
it('dollies outward only when the subject cannot fit at the current distance',()=>{
 const points:Vec3[]=[[-25,-10,0],[25,10,0]],next=followFraming(points,pose,safe,viewport)!
 expect(next.distance).toBeGreaterThan(pose.distance);expect(next.yawDeg).toBe(pose.yawDeg)
 for(const point of points){const p=screenPoint(point,projectionCamera(next,viewport),viewport);expect(p.x).toBeGreaterThanOrEqual(safe.x-.01);expect(p.x).toBeLessThanOrEqual(safe.x+safe.width+.01)}
})
