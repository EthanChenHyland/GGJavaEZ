import { arrayBackplate,arrayTitlePlate } from '../world/arrayCellGeometry'
import {Box3,Vector3} from 'three'
import type {SceneEntity,SceneModel,Vec3,WorldAnchor} from '../contracts/world'
import {cameraSegmentHit} from './cameraConstraints'

/** Canonical solids conservatively rank sightlines, independently of the
 * semantic zoom metric. An array envelope is reserved space, not a solid:
 * only its actual title plate and backing participate here. Visible cells are verified
 * by native picking at the final production destination. */
const solidAnchor=(node:SceneEntity):WorldAnchor=>node.kind==='array'?arrayTitlePlate(node.anchor):node.anchor
export function createMemberVisibility(scene:Pick<SceneModel,'entities'>){
 const bodies=Object.values(scene.entities).flatMap(node=>{
  const body=solidAnchor(node),parts=node.kind==='array'?[body,arrayBackplate(node.anchor)]:[body]
  return parts.map(anchor=>({id:node.id,box:new Box3().setFromCenterAndSize(new Vector3(...anchor.position),new Vector3(...anchor.size))}))
 })
 return(node:SceneEntity,position:Vec3):{blocked:number;centreBlocked:boolean}=>{
  const anchor=solidAnchor(node),[x,y,z]=anchor.position,[w,h,d]=anchor.size,eye=new Vector3(...position)
  const results=[[0,0],[-.35,.35],[.35,.35],[-.35,-.35],[.35,-.35]].map(([u,v])=>{
   const point=new Vector3(x+u*w,y+v*h,z+d/2+.06)
   return eye.z<=point.z||bodies.some(body=>body.id!==node.id&&cameraSegmentHit(eye,point,body.box)!==null)
  })
  return{blocked:results.filter(Boolean).length,centreBlocked:results[0]}
 }
}
