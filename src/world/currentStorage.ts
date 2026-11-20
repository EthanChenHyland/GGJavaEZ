import {arrayElementSlotId,type TraceEvent} from '../contracts/runtime'

/** Exact captured storage named by the current event. These are face-admission
 * hints, separate from owner history and from graph provenance/Flow creation. */
export function currentStorage(event:TraceEvent):readonly string[] {
 let ids:(string|undefined)[]=[]
 switch(event.type){
  case 'DECLARE_LOCAL':ids=[event.slot.id];break
  case 'ASSIGN_LOCAL':case 'REMOVE_LOCAL':case 'SET_FIELD':case 'SET_STATIC':ids=[event.slotId];break
  case 'CREATE_REFERENCE':case 'CLEAR_REFERENCE':ids=[event.sourceSlot.slotId];break
  case 'INPUT_READ':ids=[event.destinationSlotId];break
  case 'OUTPUT_WRITE':ids=[event.originSlotId];break
  case 'RETURN_VALUE':ids=[event.destination?.slotId];break
  case 'ARRAY_READ':ids=[arrayElementSlotId(event.objectId,event.index),event.destinationSlotId];break
  case 'ARRAY_WRITE':ids=[arrayElementSlotId(event.objectId,event.index),event.from?.kind==='slot'?event.from.slotId:event.from?.kind==='element'?arrayElementSlotId(event.objectId,event.from.index):undefined];break
  case 'EVALUATE_CONDITION':ids=event.operands.map(operand=>operand.slotId);break
  case 'EXECUTION_FACT':if('target'in event.fact)ids=[event.fact.target.id];else if(event.fact.kind==='receiver-ready')ids=[event.fact.slotId];break
 }
 return [...new Set(ids.filter((id):id is string=>id!==undefined))]
}
