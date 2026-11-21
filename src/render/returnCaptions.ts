import type {PresentedCurve,SceneModel,Vec3} from '../contracts/world'
import {fitWorldText,textAdvance} from './text/textSystem'
export const returnCaptionStyle={size:.5,operandRatio:.60,width:4.2} as const
export function returnCaptionLines(value:string,operands:string|null,width=returnCaptionStyle.width){
 const {size,operandRatio}=returnCaptionStyle,prefix='return '
 return{primary:prefix+fitWorldText(value,Math.max(.05,width-textAdvance(prefix,600)*size),size,600),
  operands:operands?fitWorldText(operands,width,size*operandRatio,400):null}
}
/** Captions belong to already drawable graph Flows. Recorded candidates supply
 * optional expression text, never another curve or an inferred operand. */
export function returnCaptions(scene:Pick<SceneModel,'returnFlows'>,curves:readonly PresentedCurve[]){
 const captured=new Map(scene.returnFlows.map(flow=>[flow.id,flow]))
 return curves.filter(curve=>curve.kind==='return'&&curve.label!==undefined&&curve.points.length>1).map(curve=>{
  let position=curve.points[0],span=-1
  for(let i=1;i<curve.points.length;i++){
   const a=curve.points[i-1],b=curve.points[i],x=Math.max(a[0],b[0]),length=Math.hypot(...a.map((v,axis)=>v-b[axis]))
   if(x>position[0]+1e-6||Math.abs(x-position[0])<1e-6&&length>span){position=[x,(a[1]+b[1])/2,Math.max(a[2],b[2])] as Vec3;span=length}
  }
  const lines=returnCaptionLines(curve.label!,captured.get(curve.id)?.operands??null),{size,operandRatio}=returnCaptionStyle
  const width=Math.min(returnCaptionStyle.width,Math.max(.6,textAdvance(lines.primary,600)*size,textAdvance(lines.operands??'',400)*size*operandRatio)+.04)
  return{id:`presentation:return-caption:${curve.id}`,flowId:curve.id,position:[position[0]+.18,position[1],position[2]+.02] as Vec3,size,width,operandSize:size*operandRatio,opacity:curve.opacity,...lines}
 })
}
