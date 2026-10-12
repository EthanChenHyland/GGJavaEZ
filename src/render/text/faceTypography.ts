import type {SceneEntity,SceneRow,Vec3} from '../../contracts/worldV2'
/** The renderer and camera admission use the same physical title/identity
 * planes. These sizes never depend on the semantic zoom metric. */
export function faceHeading(node:SceneEntity){
 const {anchor}=node,[x,y,z]=anchor.position,[w,h,d]=anchor.size,top=y+h/2,face=z+d/2+.085
 return{title:{position:[x-w/2+.28,top-.45,face] as Vec3,size:anchor.region==='library'?.3:.4},
  identity:node.kind==='class'?null:{position:[x+w/2-.28,top-(node.kind==='array'?.66:.45),face] as Vec3,size:node.kind==='collection'?.34:.28}}
}
/** Preserve the bounded captured preview, including runtime reference type,
 * identity and known summary lengths. The type column is the declared type. */
export function rowValueLabel(value:SceneRow['value']):string{
 return value.text
}
export function faceColumns(width:number,detail:'FAR'|'MEDIUM'|'CLOSE'='CLOSE'){
 const available=Math.max(.2,width-.56)
 if(detail==='MEDIUM')return{name:available*.4-.1,type:0,value:available*.6-.1,typeOffset:0,valueOffset:available*.4}
 return{name:available*.27-.1,type:available*.29-.1,value:available*.44-.1,typeOffset:available*.27,valueOffset:available*.56}
}
