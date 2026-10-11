import {Vector3} from 'three'
import type {SceneModel,Vec3} from '../contracts/worldV2'
import type {Rect} from '../shell/shellLayout'
import {projectionCamera,screenPoint,type OrbitPose,type Size} from './projection'
import {anchorCorners} from '../world/presentationPlanner'
/** Solve a horizontal camera translation at one distance. The return value is
 * null when these actual canonical bounds cannot satisfy all frozen bands.
 * Home has its own closest-fit contract and does not call this hero solver. */
export function alignHeroBands(scene:SceneModel,pose:OrbitPose,points:readonly Vec3[],safe:Rect,viewport:Size):OrbitPose|null {
 if(viewport.width<1024||scene.liveStack.length===0||scene.liveStack.length>=4)return pose
 const stack=scene.liveStack.flatMap(id=>scene.entities[id]?anchorCorners(scene.entities[id].anchor):[])
 const heap=Object.values(scene.entities).filter(node=>node.anchor.region==='heap').flatMap(node=>anchorCorners(node.anchor))
 if(!stack.length||!heap.length)return pose
 const camera=projectionCamera(pose,viewport),scratch=new Vector3(),right=new Vector3().setFromMatrixColumn(camera.matrixWorld,0)
 const projected=(point:Vec3)=>{const screen=screenPoint(point,camera,viewport),depth=-scratch.set(...point).applyMatrix4(camera.matrixWorldInverse).z;return{screen,scale:viewport.height/(2*depth*Math.tan(camera.fov*Math.PI/360))}}
 let low=-Infinity,high=Infinity
 const range=(point:Vec3,min:number,max:number)=>{const {screen,scale}=projected(point);if(scale<=0||!Number.isFinite(scale)){low=Infinity;return}low=Math.max(low,(screen.x-max)/scale);high=Math.min(high,(screen.x-min)/scale)}
 for(const point of points)range(point,safe.x,safe.x+safe.width)
 for(const point of stack)range(point,.27*viewport.width,.52*viewport.width)
 for(const point of heap)range(point,.52*viewport.width,1.01*viewport.width)
 const extreme=(values:readonly Vec3[],direction:1|-1)=>values.reduce((best,point)=>direction*projected(point).screen.x>direction*projected(best).screen.x?point:best)
 range(extreme(stack,-1),-Infinity,.33*viewport.width)
 range(extreme(stack,1),.46*viewport.width,Infinity)
 range(extreme(heap,-1),-Infinity,.58*viewport.width)
 if(low>high||!Number.isFinite(low)||!Number.isFinite(high))return null
 // Prefer the smallest necessary pan and keep a subpixel margin at the bound.
 const shift=Math.max(low,Math.min(high,0)),margin=Math.min(.005,(high-low)/2)
 const pan=Math.max(low+margin,Math.min(high-margin,shift))
 if(Math.abs(pan)<1e-9)return pose
 return{...pose,target:pose.target.map((value,axis)=>value+right.getComponent(axis)*pan) as unknown as Vec3}
}
