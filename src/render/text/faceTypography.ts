import type {PresentedEntity,SceneEntity,SceneRow,Vec3} from '../../contracts/world'
import {compactLibraryFace} from '../../world/firstObjectPresentation'
import {faceRows} from '../../world/faceRows'
import {displayType} from '../../world/displayType'
import {world} from '../../theme/tokens'
import {localFontText,textAdvance} from './textSystem'
/** The renderer and camera admission use the same physical title/identity
 * planes. These sizes never depend on the semantic zoom metric. */
export function faceHeading(node:SceneEntity){
 const {anchor}=node,[x,y,z]=anchor.position,[w,h,d]=anchor.size,top=y+h/2,face=z+d/2+.085
 return{title:{position:[x-w/2+.28,top-.45,face] as Vec3,size:compactLibraryFace(anchor)?.3:.4},
  identity:node.kind==='class'?null:{position:[x+w/2-.28,top-(node.kind==='array'?.66:.45),face] as Vec3,size:node.kind==='collection'?.34:.28}}
}
/** Preserve the bounded captured preview, including runtime reference type,
 * identity and known summary lengths. The type column is the declared type. */
export function rowValueLabel(value:SceneRow['value']):string{
 return value.text
}
export interface FaceColumnRow {name:string;type:string;indent?:number}
/** Text and value-chip geometry share the same measured, scoped column grid. */
export function faceRowColumns(node:SceneEntity,presented:Pick<PresentedEntity,'detail'>&Partial<Pick<PresentedEntity,'rowSlotIds'>>,model=faceRows(node,presented)){
 return faceColumns(node.anchor.size[0],presented.detail,model.visible.map(row=>({name:row.name,type:displayType(row.type),
  indent:node.kind==='frame'&&'scopeDepth'in row?(row.scopeDepth??0)*world.frame.scopeIndent:0})),!!compactLibraryFace(node.anchor))
}
export function faceColumns(width:number,detail:'FAR'|'MEDIUM'|'CLOSE'='CLOSE',rows:readonly FaceColumnRow[]=[],compact=false){
 const available=Math.max(.2,width-.56)
 if(rows.length&&available>=2){
  // One aligned grid per face, measured at the actual fixed fonts. Ordinary
  // names take priority over long type spellings; values retain at least 35%.
  const measure=(text:string,size:number,weight:400|500)=>textAdvance(localFontText(text,weight),weight)*size+.024
  const names=Math.max(...rows.map(row=>measure(row.name+(detail==='MEDIUM'?' →':''),compact?.23:.32,500)+(row.indent??0)))
  let name=Math.min(available*(detail==='MEDIUM'?.5:.36),Math.max(available*.2,names))
  if(detail==='MEDIUM')return{name,type:0,value:available-name-.2,typeOffset:0,valueOffset:name+.1}
  const budget=available*.65-.3
  name=Math.min(name,budget-available*.18)
  const types=Math.max(...rows.map(row=>measure(row.type,compact?.20:.27,400)))
  const type=Math.min(available*.3,Math.max(available*.18,types),budget-name)
  const typeOffset=name+.1,valueOffset=typeOffset+type+.1
  return{name,type,value:Math.max(available*.35,available-valueOffset-.1),typeOffset,valueOffset}
 }
 if(detail==='MEDIUM')return{name:available*.4-.1,type:0,value:available*.6-.1,typeOffset:0,valueOffset:available*.4}
 return{name:available*.27-.1,type:available*.29-.1,value:available*.44-.1,typeOffset:available*.27,valueOffset:available*.56}
}
