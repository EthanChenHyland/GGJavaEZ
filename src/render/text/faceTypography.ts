import type {SceneRow} from '../../contracts/worldV2'
/** Captured literal/identity goes in the value chip; its recorded Java type has
 * a separate column. Full observation metadata remains in the Inspector. */
export function rowValueLabel(value:SceneRow['value']):string{
 if(value.kind==='string')return value.exact
 if(value.kind==='reference'){
  if(value.targetType==='java.lang.String'&&value.exact.startsWith('"'))return value.exact.slice(0,value.exact.lastIndexOf(' · '))
  return value.text.match(/#\d+$/u)?.[0]??value.text
 }
 return value.text
}
export function faceColumns(width:number){
 const available=Math.max(.2,width-.56)
 return{name:available*.27-.1,type:available*.29-.1,value:available*.44-.1,typeOffset:available*.27,valueOffset:available*.56}
}
