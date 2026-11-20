import type {PresentedEntity,SceneEntity,Vec3,WorldAnchor} from '../contracts/world'
import {faceRows,faceRowPosition} from './faceRows'
import {collectionEntryFace} from './collectionFace'

/** Physical visible chip geometry shared by picking and temporal emphasis.
 * These presentation subdivisions never become permanent runtime ports. */
export function facePlate(node:SceneEntity,presented:Pick<PresentedEntity,'detail'>&Partial<Pick<PresentedEntity,'rowSlotIds'>>,slotId:string,model=faceRows(node,presented)):WorldAnchor|null {
 if(node.kind==='array')return null
 const [x,y,z]=node.anchor.position,[w,h,d]=node.anchor.size,face=z+d/2+.025
 let position:Vec3,size:Vec3
 if(node.kind==='collection'){
  const index=node.entries.findIndex(entry=>entry.slotId===slotId||entry.keySlotId===slotId),entry=node.entries[index]
  if(!entry||!model.visible.some(row=>row.slotId===entry.slotId))return null
  const geometry=collectionEntryFace(node.anchor,index,node.collectionKind==='Map'),point=entry.keySlotId===slotId?geometry?.key:geometry?.value
  if(!geometry||!point)return null
  position=[point[0],point[1],face+.01];size=[geometry.valueWidth,geometry.height,.05]
 }else{
  const index=model.visible.findIndex(row=>row.slotId===slotId)
  if(index<0)return null
  const ry=faceRowPosition(node,presented,slotId,model)?.[1]??y+h/2-model.header-model.pitch*(index+.5)
  position=[x,ry,face+.01];size=[w-.45,model.pitch*.73,.05]
 }
 return{...node.anchor,entityId:slotId,position,size,ports:{},bodyPort:position}
}
