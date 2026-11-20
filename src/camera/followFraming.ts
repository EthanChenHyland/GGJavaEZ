import {Vector3} from 'three'
import type {Vec3} from '../contracts/world'
import type {Rect} from '../shell/shellLayout'
import {camera as tokens} from '../theme/tokens'
import {projectionCamera,screenPoint,type OrbitPose,type Size} from './projection'

/** Include a subject with the smallest necessary pan; dolly only when its extents cannot fit. */
export function followFraming(points:readonly Vec3[],current:OrbitPose,safe:Rect,viewport:Size):OrbitPose|null {
 if(!points.length)return null
 const fits=(pose:OrbitPose)=>{const camera=projectionCamera(pose,viewport);return points.every(point=>{const p=screenPoint(point,camera,viewport);return p.z>-1&&p.z<1&&p.x>=safe.x&&p.x<=safe.x+safe.width&&p.y>=safe.y&&p.y<=safe.y+safe.height})}
 if(fits(current))return null
 const panAt=(distance:number)=>{
  let pose={...current,distance}
  for(let i=0;i<4;i++){
   const camera=projectionCamera(pose,viewport),projected=points.map(point=>screenPoint(point,camera,viewport))
   const left=Math.min(...projected.map(p=>p.x)),right=Math.max(...projected.map(p=>p.x)),top=Math.min(...projected.map(p=>p.y)),bottom=Math.max(...projected.map(p=>p.y))
   const dx=left<safe.x?left-safe.x:right>safe.x+safe.width?right-safe.x-safe.width:0
   const dy=top<safe.y?top-safe.y:bottom>safe.y+safe.height?bottom-safe.y-safe.height:0
   const pixel=2*distance*Math.tan(tokens.fov*Math.PI/360)/viewport.height
   const shift=new Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar(dx*pixel).add(new Vector3().setFromMatrixColumn(camera.matrixWorld,1).multiplyScalar(-dy*pixel))
   pose={...pose,target:pose.target.map((value,axis)=>value+shift.getComponent(axis)) as unknown as Vec3}
  }
  return pose
 }
 const translated=panAt(current.distance)
 if(fits(translated))return translated
 let lo=current.distance,hi=Math.max(current.distance*2,24)
 while(!fits(panAt(hi))&&hi<100000)hi*=2
 for(let i=0;i<28;i++){const mid=(lo+hi)/2;if(fits(panAt(mid)))hi=mid;else lo=mid}
 return panAt(hi*1.001)
}
