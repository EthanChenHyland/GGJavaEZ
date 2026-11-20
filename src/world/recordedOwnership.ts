import type {TraceEvent} from '../contracts/runtime'
import type {LayoutState,Ownership} from '../contracts/world'

/** Only recorded metadata counts. Neither region nor a type-name prefix is
 * ownership evidence; missing metadata is deliberately left unknown. */
export function ownershipObservation(event:TraceEvent):{id:string;value:Ownership;seq:number}|null {
 if((event.type==='ALLOCATE_OBJECT'||event.type==='ALLOCATE_ARRAY'||event.type==='OBJECT_OBSERVE')&&event.metadata)return{id:event.objectId,value:event.metadata.ownership,seq:event.seq}
 if(event.type==='CLASS_OBSERVE'&&event.metadata)return{id:event.classId,value:event.metadata.ownership,seq:event.seq}
 if(event.type!=='EXECUTION_FACT')return null
 const fact=event.fact
 if(fact.kind==='enter'&&fact.metadata)return{id:fact.invocationId,value:fact.metadata.ownership,seq:event.seq}
 if((fact.kind==='object'||fact.kind==='observe')&&fact.metadata)return{id:fact.objectId,value:fact.metadata.ownership,seq:event.seq}
 if(fact.kind==='class'&&fact.metadata)return{id:fact.classId,value:fact.metadata.ownership,seq:event.seq}
 return null
}
export function recordedOwnership(layout:LayoutState,id:string,cursor:number):Ownership|undefined {
 const history=layout.placement[id]?.ownershipHistory??[]
 let low=0,high=history.length
 while(low<high){const mid=(low+high)>>>1;if(history[mid].seq<cursor)low=mid+1;else high=mid}
 return low?history[low-1].value:undefined
}
