import type {PresentedEntity,SceneEntity,SceneRow,Vec3} from '../../contracts/world'
import {compactLibraryFace} from '../../world/firstObjectPresentation'
import {faceRows} from '../../world/faceRows'
import {displayType} from '../../world/displayType'
import {typography,world} from '../../theme/tokens'
import {arrayTitlePlate} from '../../world/arrayCellGeometry'
import {fitWorldText,localFontText,textAdvance,type FontWeight} from './textSystem'
export const faceRowFont = {
 name: typography.world.row[0], compactName: .23,
 type: .25, compactType: .20,
 value: typography.world.value[0], compactValue: .25,
 changedValue: .41, compactChangedValue: .31,
} as const

const parametersNotRecorded = '⟨parameters not recorded⟩'
const javaStringPreview = /^"((?:[^"\\]|\\.)*)"/
const javaStringUnits = /\\ud[89ab][0-9a-f]{2}\\ud[c-f][0-9a-f]{2}|\\(?:u[0-9a-f]{4}|.)|[^\\]/gu

function fits(text: string, width: number, size: number, weight: FontWeight) {
 return textAdvance(localFontText(text,weight),weight)*size<=Math.max(0,width-.012)
}

/** The scene title still carries the captured owner and signature for inspection. */
function frameHeading(title: string, width: number, size: number, short: boolean) {
 const open = title.indexOf('(')
 const name = open < 0 ? title : title.slice(0,open)
 const text = fitWorldText(name.slice(name.lastIndexOf('.')+1),width,size,600,0,28,'end')
 if(open < 0 || !title.endsWith(')'))return {text,parameters:null}
 const offset = textAdvance(text,600)*size+.055
 const parameterWidth = width-offset, parameterSize = short ? size : .34

 const captured = title.slice(open+1,-1)
 const exact = `(${captured})`
 const fallback = captured === parametersNotRecorded ? '(?)' : '(…)'
 if(fits(exact,parameterWidth,parameterSize,400)){
  return {text,parameters:{text:exact,offset,width:parameterWidth,size:parameterSize}}
 }
 if(captured === '' || !fits(fallback,parameterWidth,parameterSize,400))return {text,parameters:null}

 const innerWidth = parameterWidth-textAdvance('()')*parameterSize-.024
 const summary = captured === parametersNotRecorded ? fallback : `(${fitWorldText(captured,innerWidth,parameterSize,400,0,Infinity,'end')})`
 const shown = fits(summary,parameterWidth,parameterSize,400)&&summary!=='()' ? summary : fallback
 return {text,parameters:{text:shown,offset,width:parameterWidth,size:parameterSize}}
}

/** Preserve the array suffix when the full recorded type exceeds its title area. */
function fitArrayTitle(title:string,suffix:string,width:number,size:number):string {
 const local=localFontText(title,600)
 if(textAdvance(local,600)*size<=width-.012)return local
 const base=title.slice(0,-suffix.length),available=width-textAdvance(suffix,600)*size-.024
 if(available>0){
  const shortened=fitWorldText(base,available,size,600)
  if(shortened&&textAdvance(shortened+suffix,600)*size<=width-.012)return shortened+suffix
 }
 return fitWorldText(local,width,size,600,0,Infinity,'middle')
}
/** The renderer and camera admission use the same physical title/identity
 * planes. These sizes never depend on the semantic zoom metric. */
export function faceHeading(node:SceneEntity,shortFrameTitle=false){
 const {anchor}=node,plate=node.kind==='array'?arrayTitlePlate(anchor):anchor
 const [x,y,z]=plate.position,[w,h,d]=plate.size,top=y+h/2,face=z+d/2+.085
 const short=node.kind==='frame'&&shortFrameTitle
 const size = short ? typography.world.shortFrameTitleSize
  : compactLibraryFace(anchor) ? .3
  : node.kind==='object' ? .38 : typography.world.title[0]
 const identity=node.kind==='frame'?`#${node.invocationNumber}`:node.kind==='class'?'':`#${node.displayId}`
 const identitySize=node.kind==='collection'?.34:.28,identityWidth=identity?textAdvance(identity,500)*identitySize+.04:0
 const lengthLabel=node.kind==='array'?`length = ${node.length}`:null,metadataWidth=Math.max(identityWidth,lengthLabel?textAdvance(lengthLabel)*.25+.04:0)
 const width=Math.max(.1,w-.56-metadataWidth-(metadataWidth?.2:0))
 const arraySuffix=node.kind==='array'?node.title.match(/(?:\[\])+$/)?.[0]:undefined
 const arrayTitle=arraySuffix?fitArrayTitle(node.title,arraySuffix,width,size):undefined
 const frame=node.kind==='frame'?frameHeading(node.title,width,size,short):null
 const lines=frame?[frame.text]:arrayTitle?[arrayTitle]:undefined
 // Place live names below the edge of a nearer recursive slab.
 const titleOffset=frame ? short ? .61 : .57 : node.kind==='array'&&node.length>16 ? .28 : .45
 const identityOffset=frame ? titleOffset : node.kind==='array' ? .65 : .45
 const position=[x-w/2+.28,top-titleOffset,face] as Vec3
 const parameters=frame?.parameters
 return{title:{position,size,width,lines},
  parameters:parameters?{...parameters,position:[position[0]+parameters.offset,position[1],position[2]] as Vec3}:null,identityWidth,
  length:lengthLabel?{text:lengthLabel,position:[x+w/2-.28,top-.25,face] as Vec3,size:.25,width:metadataWidth}:null,
  identity:node.kind==='class'?null:{position:[x+w/2-.28,top-identityOffset,face] as Vec3,size:identitySize}}
}

/** The value inset and its port stay at the shared face columns. Text leaves a
 * small margin inside the inset and can only use the resulting width. */
export const faceValueInset = .055

export function faceValueLayout(value: SceneRow['value'], columnWidth: number, compact: boolean, changed: boolean) {
 const width = Math.max(.1,columnWidth-2*faceValueInset)
 const base = compact ? faceRowFont.compactValue : faceRowFont.value
 const prominent = compact ? faceRowFont.compactChangedValue : faceRowFont.changedValue
 if(value.kind==='not-recorded'){
  const size = compact ? .21 : .27, weight = 500
  const label = fits(value.text,width,size,weight) ? value.text : 'unrecorded'
  return {text:fitWorldText(label,width,size,weight),width,size,weight} as const
 }
 const weight: FontWeight = changed || value.kind !== 'reference' ? 600 : 500
 const exact = value.kind === 'primitive' || value.kind === 'null' ? value.exact : value.text
 // A changed scalar may use a larger font when it still fits exactly.
 const size = changed && (
  fits(exact,width,prominent,weight) || !fits(exact,width,base,weight)
 ) ? prominent : base
 return {text:fitFaceValue(value,exact,width,size,weight),width,size,weight}
}

/** Keep both quotation marks and whole Java escapes in a bounded preview. */
function fitQuotedValue(content: string, width: number, size: number, weight: FontWeight): string | null {
 const exact = '"' + content + '"'
 if(fits(exact,width,size,weight))return exact
 if(!fits('"…"',width,size,weight))return null
 let prefix = ''
 for(const unit of content.match(javaStringUnits)??[]){
  if(!fits('"'+prefix+unit+'…"',width,size,weight))break
  prefix += unit
 }
 return '"'+prefix+'…"'
}

function fitFaceValue(value: SceneRow['value'], label: string, width: number, size: number, weight: FontWeight) {
 const fit = (text: string, truncation: 'middle' | 'end' = 'middle') => fitWorldText(text,width,size,weight,0,Infinity,truncation)
 const local = localFontText(label,weight)
 if(value.observation!=='TRUNCATED'&&textAdvance(local,weight)*size<=Math.max(0,width-.012))return local

 // A String literal comes from the formatter's quoted Java preview. Keep the
 // actual preview in the chip when identity/length metadata would cut it off.
 if(value.kind==='reference'||value.kind==='string'){
  const literal = javaStringPreview.exec(label)?.[1] ?? javaStringPreview.exec(value.exact.slice(0,300))?.[1]
  if(literal!==undefined){
   const content = value.observation==='TRUNCATED'&&!literal.endsWith('…') ? literal+'…' : literal
   const preview = fitQuotedValue(content,width,size,weight)
   if(preview)return preview
  }
 }
 if(value.kind==='reference'){
  const identity = / #([0-9]+)$/.exec(value.exact)?.[0]
  if(identity){
   const structure = value.exact.slice(0,-identity.length)
   const dimensions = displayType(value.targetType).endsWith('[]') ? /\[[0-9]+\](?:\[\])*$/.exec(structure)?.[0] : undefined
   const sizeLabel = /^(?:List|Set|Map|Queue|Deque) · (size (?:[0-9]+|not recorded))$/.exec(structure)?.[1]
   const metadata = dimensions ?? (sizeLabel==='size not recorded' ? 'size ?' : sizeLabel)
   const compact = metadata ? [metadata+identity,metadata] : [identity.trimStart()]
   const readable = compact.find(text=>fits(text,width,size,weight))
   if(readable)return readable
  }
 }
 return fit(label,value.kind==='string'?'end':'middle')
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
  // Keep the canonical column reservations independent of glyph emphasis.
  // Ordinary names take priority over long type spellings; values retain at least 35%.
  const measure=(text:string,size:number,weight:400|500)=>textAdvance(localFontText(text,weight),weight)*size+.024
  const names=Math.max(...rows.map(row=>measure(row.name+(detail==='MEDIUM'?' →':''),compact?faceRowFont.compactName:faceRowFont.name,500)+(row.indent??0)))
  let name=Math.min(available*(detail==='MEDIUM'?.5:.36),Math.max(available*.2,names))
  if(detail==='MEDIUM')return{name,type:0,value:available-name-.2,typeOffset:0,valueOffset:name+.1}
  const budget=available*.65-.3
  name=Math.min(name,budget-available*.18)
  const types=Math.max(...rows.map(row=>measure(row.type,compact?faceRowFont.compactType:typography.world.type[0],400)))
  const type=Math.min(available*.3,Math.max(available*.18,types),budget-name)
  const typeOffset=name+.1,valueOffset=typeOffset+type+.1
  return{name,type,value:Math.max(available*.35,available-valueOffset-.1),typeOffset,valueOffset}
 }
 if(detail==='MEDIUM')return{name:available*.4-.1,type:0,value:available*.6-.1,typeOffset:0,valueOffset:available*.4}
 return{name:available*.27-.1,type:available*.29-.1,value:available*.44-.1,typeOffset:available*.27,valueOffset:available*.56}
}
