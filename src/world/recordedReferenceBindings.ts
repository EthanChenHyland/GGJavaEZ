import {arrayElementSlotId,type RuntimeSlot,type RuntimeValue,type TraceEvent} from '../contracts/runtime'
import type {SceneReference} from '../contracts/world'
import {createReferenceBindingHistory,type BindingObservation} from './referenceBindingHistory'

/** Presentation index of accepted normalized slot facts. Graph value versions
 * and mirrored EXECUTION_FACT edges are deliberately not additional bindings.
 * No RuntimeState transition, writer, Java operation or future value is inferred.
 */
export function createRecordedReferenceBindings(recordingId:string){
 const history=createReferenceBindingHistory(recordingId)
 const fields=new Map<string,Set<string>>(),summaries=new Map<string,Set<string>>()
 const locals=new Map<string,Map<string,string|undefined>>()
 const eventIds=new Set<string>()
 let indexed=0,lastEventId:string|undefined
 return{
  get length(){return indexed},
  historical:history.historical,
  current:history.current,
  append(events:readonly TraceEvent[]){
   if(events.length<indexed||indexed&&events[indexed-1].eventId!==lastEventId)throw new Error('Reference bindings require one append-only accepted recording')
   // Validate this append's envelope before indexing any new event.
   const incoming=new Set<string>()
   for(let i=indexed;i<events.length;i++){
    const event=events[i]
    if(event.seq!==i||!event.eventId||eventIds.has(event.eventId)||incoming.has(event.eventId))throw new Error('Reference bindings require unique event IDs and contiguous normalized ordinals')
    incoming.add(event.eventId)
   }
   for(;indexed<events.length;indexed++){
    const event=events[indexed],observations=new Map<string,BindingObservation>()
    const add=(sourceId:string,sourceSlotId:string,value:RuntimeValue|null,role:SceneReference['role'],mode:BindingObservation['mode']='observe')=>observations.set(JSON.stringify([sourceId,sourceSlotId]),{sourceId,sourceSlotId,value,role,mode})
    const frame=(id:string,slot:RuntimeSlot)=>{
     const slots=locals.get(id)??new Map<string,string|undefined>();slots.set(slot.id,slot.scopeId);locals.set(id,slots)
     add(id,slot.id,slot.value,'frame-object')
    }
    const observedFields=(id:string,slots:readonly RuntimeSlot[],replace=false)=>{
     const prior=fields.get(id)??new Set<string>(),next=new Set(slots.map(slot=>slot.id))
     if(replace)for(const slot of prior)if(!next.has(slot))add(id,slot,null,'object-object','retire')
     fields.set(id,replace?next:new Set([...prior,...next]))
     for(const slot of slots)add(id,slot.id,slot.value,'object-object')
    }
    const closeLocals=(frameId:string,scopeId?:string)=>{
     const slots=locals.get(frameId)
     if(!slots)return
     for(const[slotId,scope]of slots)if(scope!==undefined&&(scopeId===undefined||scope===scopeId)){
      add(frameId,slotId,null,'frame-object','retire');slots.delete(slotId)
     }
    }
    switch(event.type){
     case 'ENTER_METHOD':for(const slot of event.locals)frame(event.frameId,slot);break
     case 'DECLARE_LOCAL':frame(event.frameId,event.slot);break
     case 'REMOVE_LOCAL':add(event.frameId,event.slotId,null,'frame-object','retire');locals.get(event.frameId)?.delete(event.slotId);break
     case 'EXIT_SCOPE':closeLocals(event.frameId,event.scopeId);break
     case 'EXIT_METHOD':case 'UNWIND_EXCEPTION':closeLocals(event.frameId);break
     case 'ASSIGN_LOCAL':add(event.frameId,event.slotId,event.value,'frame-object','write');break
     case 'CREATE_REFERENCE':{
      const owner=event.sourceSlot
      add(owner.kind==='frame'?owner.frameId:owner.objectId,owner.slotId,{kind:'reference',javaType:event.javaType,objectId:event.targetObjectId},owner.kind==='frame'?'frame-object':'object-object','write');break
     }
     case 'CLEAR_REFERENCE':{
      const owner=event.sourceSlot
      add(owner.kind==='frame'?owner.frameId:owner.objectId,owner.slotId,{kind:'null'},owner.kind==='frame'?'frame-object':'object-object','write');break
     }
     case 'ALLOCATE_OBJECT':observedFields(event.objectId,event.fields);break
     case 'ALLOCATE_ARRAY':event.elements.forEach((value,index)=>add(event.objectId,arrayElementSlotId(event.objectId,index),value,'object-object'));break
     case 'OBJECT_OBSERVE':{
      if(event.fields!==undefined)observedFields(event.objectId,event.fields,!!event.replaceFields)
      event.arrayElements?.forEach(({index,value})=>add(event.objectId,arrayElementSlotId(event.objectId,index),value,'object-object'))
      const library=event.library
      if(library&&['LIST','SET','MAP','QUEUE','DEQUE'].includes(library.kind)){
       // The canonical IDs are the normalized summary contract, not parsed
       // aliases. Library-only accepted snapshots also carry these values.
       const captured=new Map<string,RuntimeValue>()
       if(library.kind==='MAP')library.entries?.forEach((entry,index)=>{captured.set(`${event.objectId}:summary:entry:${index}:key`,entry.key);captured.set(`${event.objectId}:summary:entry:${index}:value`,entry.value)})
       else library.items?.forEach((value,index)=>captured.set(`${event.objectId}:summary:item:${index}`,value))
       for(const slot of summaries.get(event.objectId)??[])if(!captured.has(slot))add(event.objectId,slot,null,'object-object','retire')
       for(const[slot,value]of captured)add(event.objectId,slot,value,'object-object')
       summaries.set(event.objectId,new Set(captured.keys()))
      }
      break
     }
     case 'CLASS_OBSERVE':for(const slot of event.fields)add(event.classId,slot.id,slot.value,'class-object');break
     case 'SET_STATIC':add(event.classId,event.slotId,event.value,'class-object','write');break
     case 'SET_FIELD':add(event.objectId,event.slotId,event.value,'object-object','write');break
     case 'ARRAY_WRITE':add(event.objectId,arrayElementSlotId(event.objectId,event.index),event.value,'object-object','write');break
     case 'ARRAY_READ':{
      if(event.observed)add(event.objectId,arrayElementSlotId(event.objectId,event.index),event.value,'object-object')
      if(event.destinationSlotId)add(event.frameId,event.destinationSlotId,event.value,'frame-object','write')
      break
     }
     case 'INPUT_READ':add(event.frameId,event.destinationSlotId,event.value,'frame-object','write');break
     case 'RETURN_VALUE':if(event.destination)add(event.destination.frameId,event.destination.slotId,event.value,'frame-object','write');break
    }
    if(observations.size)history.append(event.seq,event.eventId,[...observations.values()])
    eventIds.add(event.eventId);lastEventId=event.eventId
   }
  },
 }
}
