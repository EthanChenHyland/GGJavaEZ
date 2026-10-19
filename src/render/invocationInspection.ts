import type {RuntimeState} from '../contracts/runtime'
import type {SceneFrame,SceneModel,ValueText} from '../contracts/worldV2'
import {valueText} from '../world/valueText'
import {inspectorEntityTitle} from './inspection'

/** Invocation metadata comes only from this applied snapshot. An observed
 * ancestor across opaque code is never promoted to a proven direct caller. */
export function invocationInspection(runtime:RuntimeState,scene:SceneModel,node:SceneFrame){
 const frame=runtime.frames[node.id],graph=runtime.executionGraph,invocation=graph?.invocations[node.id]
 const callerId=invocation?invocation.callerInvocationId??invocation.observedAncestorInvocationId??null:node.callerId
 const callerKind=invocation?.observedAncestorInvocationId&&!invocation.callerInvocationId?'Observed ancestor':'Caller'
 const caller=callerId?scene.entities[callerId]:undefined
 const callerTitle=caller?.kind==='frame'?inspectorEntityTitle(caller):null
 const receiverSlot=frame?Object.values(frame.locals).find(slot=>slot.name==='this'):undefined
 const receiverId=invocation?.receiverObjectId,receiverObject=receiverId?runtime.objects[receiverId]:undefined
 const call=invocation?.callId?graph?.calls[invocation.callId]:undefined
 const receiver:ValueText|null=receiverSlot?valueText(receiverSlot.value,{context:'exact',objects:runtime.objects}):receiverObject?valueText({kind:'reference',javaType:receiverObject.className,objectId:receiverObject.id},{context:'exact',objects:runtime.objects}):null
 const receiverState=receiver?'captured':call?.invokeKind==='static'?'none':'unavailable'
 let returned=frame?.returnValue
 if(returned===undefined&&invocation?.returnValueId)returned=graph?.values[invocation.returnValueId]?.value
 const completed=frame?.status==='returned'||node.status.kind==='returned'
 const returnValue=returned!==undefined?valueText(returned,{context:'exact',objects:runtime.objects}):null
 const returnState=returnValue?'captured':!completed?'pending':frame?.returnType==='void'||invocation?.method.descriptor.endsWith(')V')?'void':'unavailable'
 return{callerId,callerKind,callerTitle,receiver,receiverId:receiverId??(receiverSlot?.value.kind==='reference'?receiverSlot.value.objectId:null),receiverState,returnValue,returnState}as const
}
