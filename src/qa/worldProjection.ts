import {Matrix4,Vector3,type Camera,type InstancedMesh} from 'three'
import type {WorldAnchor,Vec3,Region} from '../contracts/worldV2'
export interface ProjectedRect {x:number;y:number;width:number;height:number;visible:boolean}
export interface ProjectedBody {id:string;region:Region;live:boolean;bounds:ProjectedRect|null;face:ProjectedRect|null}
export interface WorldProjection {entities:readonly ProjectedBody[];stack:ProjectedRect|null;liveStack:ProjectedRect|null;heap:ProjectedRect|null;exception?:{bounds:ProjectedRect|null;throwFrame:ProjectedRect|null}|null}
export function projectRect(points:readonly Vec3[],camera:Camera,viewport:{width:number;height:number}):ProjectedRect|null {
 const values=points.map(point=>new Vector3(...point).project(camera))
 if(!values.length||values.some(point=>!Number.isFinite(point.x)||!Number.isFinite(point.y))||values.every(point=>point.z<-1||point.z>1))return null
 const left=Math.min(...values.map(point=>(point.x+1)*viewport.width/2)),right=Math.max(...values.map(point=>(point.x+1)*viewport.width/2))
 const top=Math.min(...values.map(point=>(1-point.y)*viewport.height/2)),bottom=Math.max(...values.map(point=>(1-point.y)*viewport.height/2))
 return{x:left,y:top,width:right-left,height:bottom-top,visible:right>=0&&left<=viewport.width&&bottom>=0&&top<=viewport.height}
}
export function unionProjection(rects:readonly (ProjectedRect|null)[]):ProjectedRect|null {
 const values=rects.filter((rect):rect is ProjectedRect=>!!rect)
 if(!values.length)return null
 const x=Math.min(...values.map(rect=>rect.x)),y=Math.min(...values.map(rect=>rect.y))
 return{x,y,width:Math.max(...values.map(rect=>rect.x+rect.width))-x,height:Math.max(...values.map(rect=>rect.y+rect.height))-y,visible:values.some(rect=>rect.visible)}
}
/** Read the rendered instance transform, including its parent world transform.
 * A stale/default instance matrix must fail QA instead of measuring a planned box. */
export function projectInstancedBody(mesh:InstancedMesh,index:number,camera:Camera,viewport:{width:number;height:number}):ProjectedRect|null {
 if(index<0||index>=mesh.count)return null
 mesh.updateWorldMatrix(true,false)
 const matrix=new Matrix4();mesh.getMatrixAt(index,matrix);matrix.premultiply(mesh.matrixWorld)
 const points=[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>new Vector3(x/2,y/2,z/2).applyMatrix4(matrix).toArray() as Vec3)))
 return projectRect(points,camera,viewport)
}
/** Accept the actual rendered bodies, including current array-window cells.
 * This observes the camera and geometry; it does not fit or move either. */
export function projectBodies(bodies:readonly {anchor:WorldAnchor;live:boolean}[],camera:Camera,viewport:{width:number;height:number}):WorldProjection {
 const entities=bodies.map(({anchor,live})=>{
  const points=[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>anchor.position.map((value,axis)=>value+[x,y,z][axis]*anchor.size[axis]/2) as unknown as Vec3)))
  const front=points.filter(point=>point[2]===anchor.position[2]+anchor.size[2]/2)
  return{id:anchor.entityId,region:anchor.region,live,bounds:projectRect(points,camera,viewport),face:projectRect(front,camera,viewport)}
 })
 return{entities,stack:unionProjection(entities.filter(body=>body.region==='stack').map(body=>body.bounds)),liveStack:unionProjection(entities.filter(body=>body.region==='stack'&&body.live).map(body=>body.bounds)),heap:unionProjection(entities.filter(body=>body.region==='heap').map(body=>body.bounds))}
}
