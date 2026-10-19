import {Vector3} from 'three'
import type {PresentedCurve,Vec3,WorldAnchor} from '../contracts/world'
import type {Rect} from '../shell/shellLayout'
import {camera as tokens} from '../theme/tokens'
import {cameraPosition,fitToSafeFrame,projectionCamera,type OrbitPose,type Size} from './projection'

const tuple=(point:Vector3):Vec3=>[point.x,point.y,point.z]
const corners=(anchor:WorldAnchor):Vec3[]=>[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>[anchor.position[0]+x*anchor.size[0]/2,anchor.position[1]+y*anchor.size[1]/2,anchor.position[2]+z*anchor.size[2]/2] as Vec3)))

/** Equal travelled distances, not array indices: routed curves have uneven samples. */
export function sampleFlowPath(points:readonly Vec3[],intervals=8):Vec3[] {
 if(points.length<2||points.some(point=>point.some(value=>!Number.isFinite(value))))return[]
 const lengths=points.slice(1).map((point,index)=>new Vector3(...point).distanceTo(new Vector3(...points[index]))),total=lengths.reduce((sum,length)=>sum+length,0)
 if(total<=1e-9)return[]
 const count=Math.max(1,Math.min(64,Math.floor(intervals)))
 return Array.from({length:count+1},(_,sample)=>{
  let distance=total*sample/count,index=0
  while(index<lengths.length-1&&distance>lengths[index]){distance-=lengths[index];index++}
  return tuple(new Vector3(...points[index]).lerp(new Vector3(...points[index+1]),lengths[index]?distance/lengths[index]:1))
 })
}

/** Put a real Port/sample at Safe Frame's centre, at a finite viewing distance. */
function framePoint(point:Vec3,distance:number,safe:Rect,viewport:Size):OrbitPose {
 const pose:OrbitPose={target:point,distance,yawDeg:tokens.focus.yaw,pitchDeg:tokens.focus.pitch},camera=projectionCamera(pose,viewport)
 const pixel=2*distance*Math.tan(tokens.fov*Math.PI/360)/viewport.height
 const shift=new Vector3().setFromMatrixColumn(camera.matrixWorld,0).multiplyScalar((viewport.width/2-safe.x-safe.width/2)*pixel)
  .add(new Vector3().setFromMatrixColumn(camera.matrixWorld,1).multiplyScalar((safe.y+safe.height/2-viewport.height/2)*pixel))
 return{...pose,target:tuple(new Vector3(...point).add(shift))}
}

/** Source Port → ordered curve samples → the entire proven destination body.
 * Missing geometry never triggers an inferred destination or a camera command.
 */
export function followPathFraming(curve:PresentedCurve|undefined,safe:Rect,viewport:Size):OrbitPose[] {
 if(!curve||!['flow','return','exception','binding-history'].includes(curve.kind)||!curve.sourceAnchor||!curve.destinationAnchor
  ||![safe.x,safe.y,safe.width,safe.height,viewport.width,viewport.height].every(Number.isFinite)||safe.width<=0||safe.height<=0||viewport.width<=0||viewport.height<=0)return[]
 const samples=sampleFlowPath(curve.points)
 if(!samples.length)return[]
 const source=fitToSafeFrame(corners(curve.sourceAnchor),tokens.focus,safe,viewport),destination=fitToSafeFrame(corners(curve.destinationAnchor),tokens.focus,safe,viewport)
 const poses=samples.map((point,index)=>framePoint(point,source.distance+(destination.distance-source.distance)*index/(samples.length-1),safe,viewport))
 poses.push(destination)
 return poses.every(pose=>[...pose.target,...cameraPosition(pose)].every(Number.isFinite))?poses:[]
}
