import type {Vec3,WorldAnchor} from '../contracts/world'
import {world} from '../theme/tokens'
import {collectionEntryFace} from './collectionFace'
import {centredValueChipGeometry,centredValueChipReferencePort} from './valueChipGeometry'

const arrayWidth=1.3
/** Port diameter plus a small gap keeps the centred glyph span clear. */
const portTextReserve=.24
const front=(anchor:WorldAnchor):Vec3=>[anchor.position[0],anchor.position[1],anchor.position[2]+anchor.size[2]/2]
export function arrayReferenceChipGeometry(cell:WorldAnchor){
 return centredValueChipGeometry(front(cell),arrayWidth,world.frame.row)
}
export function arrayReferenceChipPort(cell:WorldAnchor):Vec3{
 return centredValueChipReferencePort(front(cell),arrayWidth)
}
export const arrayReferenceTextWidth=arrayWidth-portTextReserve

function collectionChip(anchor:WorldAnchor,index:number,map:boolean,key:boolean){
 const geometry=collectionEntryFace(anchor,index,map),point=key?geometry?.key:geometry?.value
 return geometry&&point?{centre:[point[0],point[1],anchor.position[2]+anchor.size[2]/2]as Vec3,width:geometry.valueWidth-.08}:null
}
export function collectionReferenceChipGeometry(anchor:WorldAnchor,index:number,map=false,key=false){
 const chip=collectionChip(anchor,index,map,key)
 return chip?centredValueChipGeometry(chip.centre,chip.width,world.collection.pitch):null
}
export function collectionReferenceChipPort(anchor:WorldAnchor,index:number,map=false,key=false):Vec3|null{
 const chip=collectionChip(anchor,index,map,key)
 return chip?centredValueChipReferencePort(chip.centre,chip.width):null
}
export function collectionReferenceTextWidth(anchor:WorldAnchor,index:number,map=false):number{
 return Math.max(0,(collectionChip(anchor,index,map,false)?.width??0)-portTextReserve)
}
