import type {TraceDocument,TraceEvent} from '../contracts/runtime'

/** Presentation envelope witnesses only; semantic validation stays upstream. */
export interface AcceptedEventIndex {
 readonly length:number
 accept(events:readonly TraceEvent[],from:number):AcceptedEventIndex
 get(id:string):TraceEvent|undefined
}

export function createAcceptedEventIndex():AcceptedEventIndex {
 const byId=new Map<string,TraceEvent>()
 let length=0
 const invalid=()=>new Error('Presentation event index requires unique event IDs and contiguous normalized ordinals')
 const index:AcceptedEventIndex=Object.freeze({
  get length(){return length},
  get:(id:string)=>byId.get(id),
  accept(events:readonly TraceEvent[],from:number){
   if(!Number.isSafeInteger(from)||from<0||from>length||events.length<from)throw invalid()
   if(from&&byId.get(events[from-1].eventId)?.seq!==from-1)throw invalid()
   const incoming=new Set<string>()
   let fork=false
   // A lagging reader may admit a prefix already indexed by the other reader.
   // Validate its exact witnesses without duplicating the retained map.
   for(let i=from;i<events.length;i++){
    const event=events[i],prior=byId.get(event.eventId)
    if(event.seq!==i||typeof event.eventId!=='string'||!event.eventId||incoming.has(event.eventId)||prior&&prior.seq<from)throw invalid()
    if(i<length&&(prior!==event||prior.seq!==i))fork=true
    incoming.add(event.eventId)
   }
   if(fork){
    // Mutable normalized fixtures may replace unconsumed event objects. Keep
    // this reader's admitted witnesses, then give its new branch a private map.
    // The other reader's lookup and already-published snapshots stay unchanged.
    const branch:TraceEvent[]=[]
    for(const event of byId.values()){if(event.seq>=from)break;branch.push(event)}
    for(let i=from;i<events.length;i++)branch.push(events[i])
    return createAcceptedEventIndex().accept(branch,0)
   }
   for(let i=length;i<events.length;i++)byId.set(events[i].eventId,events[i])
   length=Math.max(length,events.length)
   return index
  },
 })
 return index
}

// No recording-ID interning or document back-reference: this owner disappears
// with its exact document and live consumers. Readers qualify lookup by their
// own admitted length, not this shared index's potentially later boundary.
const indexes=new WeakMap<TraceDocument,WeakRef<AcceptedEventIndex>>()
export function acceptedEventIndex(trace:TraceDocument):AcceptedEventIndex {
 let index=indexes.get(trace)?.deref()
 if(!index){index=createAcceptedEventIndex();indexes.set(trace,new WeakRef(index))}
 return index
}
