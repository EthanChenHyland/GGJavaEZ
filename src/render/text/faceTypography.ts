import type {PresentedEntity,SceneEntity,SceneRow,Vec3} from '../../contracts/world'
import {compactLibraryFace} from '../../world/firstObjectPresentation'
import {faceRows} from '../../world/faceRows'
import {displayType} from '../../world/displayType'
import {world} from '../../theme/tokens'
import {fitWorldText,localFontText,textAdvance} from './textSystem'
import {truncateFrameText} from '../../world/valueText'
/** Preserve the qualified signature within the existing header before falling
 * back to a width summary. Break only between complete captured code points. */
export function frameTitleLines(title:string,width:number,size=.4):readonly string[]{
 const bounded=truncateFrameText(title),units=Array.from(bounded,char=>localFontText(char,600)),complete=units.join('')
 const fits=(text:string)=>textAdvance(text,600)*size<=Math.max(0,width-.012)
 if(fits(complete))return[complete]
 let best:{lines:string[];semantic:number;imbalance:number}|undefined
 for(let split=1;split<units.length;split++){
  const left=units.slice(0,split).join(''),right=units.slice(split).join('')
  if(!fits(left)||!fits(right))continue
  const semantic=left.endsWith('.')?0:1,imbalance=Math.abs(textAdvance(left,600)-textAdvance(right,600))
  if(!best||semantic<best.semantic||semantic===best.semantic&&imbalance<best.imbalance)best={lines:[left,right],semantic,imbalance}
 }
 return best?.lines??[fitWorldText(bounded,width,size,600,0,28)]
}
/** The renderer and camera admission use the same physical title/identity
 * planes. These sizes never depend on the semantic zoom metric. */
export function faceHeading(node:SceneEntity){
 const {anchor}=node,[x,y,z]=anchor.position,[w,h,d]=anchor.size,top=y+h/2,face=z+d/2+.085
 const size=compactLibraryFace(anchor)?.3:.4,identity=node.kind==='frame'?`#${node.invocationNumber}`:node.kind==='class'?'':`#${node.displayId}`
 const identitySize=node.kind==='collection'?.34:.28,identityWidth=identity?textAdvance(identity,500)*identitySize+.04:0
 const lengthLabel=node.kind==='array'?`length ${node.length}`:null,metadataWidth=Math.max(identityWidth,lengthLabel?textAdvance(lengthLabel)*.25+.04:0)
 const width=Math.max(.1,w-.56-metadataWidth-(metadataWidth?.2:0)),lines=node.kind==='frame'?frameTitleLines(node.title,width,size):undefined
 return{title:{position:[x-w/2+.28,top-(lines&&lines.length>1?.39:.45),face] as Vec3,size,width,lines},identityWidth,metadataWidth,
  identity:node.kind==='class'?null:{position:[x+w/2-.28,top-(node.kind==='array'?.66:.45),face] as Vec3,size:identitySize}}
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
