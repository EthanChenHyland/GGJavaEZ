import type {SceneRow} from '../../contracts/worldV2'
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
