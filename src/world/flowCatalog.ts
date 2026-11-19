import type { RuntimeState, RuntimeValue, TraceDocument } from '../contracts/runtime'
import type { ExecutionGraph, GraphEdge } from '../contracts/executionGraph'
import type { Evidence, SceneModel } from '../contracts/world'
import { graphTransitionEndpoints, type FlowEndpoint } from '../motion/semanticTransition'
import { seek } from '../runtime'
import { valueText,hasRecordedValuePort } from './valueText'
import {collectionEntryFace} from './collectionFace'
import {consumingWriteDestination,recordedReturnDestination} from './returnEvidence'
import {acceptedEventIndex,type AcceptedEventIndex} from './acceptedEventIndex'
export type FlowKind='argument'|'receiver'|'local-field'|'field-read'|'assignment'|'reference'|'array-read'|'array-write'|'return'|'input'|'output'|'throw'|'unwind'|'catch'
export interface SceneFlow {id:string;edgeIndex:number;kind:FlowKind;from:FlowEndpoint|null;to:FlowEndpoint;evidenceEventIds:readonly string[];evidenceSeqs:readonly number[];valueText:string|null}
export interface RecordedFlow extends Omit<SceneFlow,'to'> {to:FlowEndpoint|null}
export interface RecordedProvenance {edgeId:string;edgeIndex:number;kind:GraphEdge['kind'];from:string;to:string;originSlotId:string|null;eventId:string;graphEvidence:GraphEdge['evidence'];evidence:Evidence;spatial:{drawable:boolean;reason:string|null}}
export interface FlowPriorityInput {selectedIds:ReadonlySet<string>;focusedIds:ReadonlySet<string>;currentIds:ReadonlySet<string>}
export interface FlowBundle {id:string;from:FlowEndpoint;to:FlowEndpoint;count:number;drawable:boolean;reason:string|null}
export interface FlowCatalog {
 extend(graph:ExecutionGraph,trace:TraceDocument):void
 query(input:{cursor:number;scene:SceneModel;priority:FlowPriorityInput;limit:number}):SceneFlow[]
 bundles(input:{cursor:number;scene:SceneModel;exclude:ReadonlySet<string>}):FlowBundle[]
 atEvent(cursor:number,scene:SceneModel):SceneFlow[]
 /** Complete supported-edge prefix, including evidence without spatial endpoints. */
 prefix(cursor:number,scene:SceneModel):readonly RecordedFlow[]
 /** One complete, ordered pass over the accepted edge boundary; no retained DTO list. */
 iteratePrefix(cursor:number,scene:SceneModel):Iterable<RecordedFlow>
 recordedProvenanceOf(valueOrSlotId:string,cursor:number):readonly RecordedProvenance[]
 drawableFlowsOf(valueOrSlotId:string,cursor:number,scene:SceneModel):readonly SceneFlow[]
}
interface Candidate {edgeIndex:number;edge:GraphEdge;seq:number;kind:FlowKind;value:RuntimeValue|undefined}
const endpointCode=(point:FlowEndpoint|null):number=>!point?0:point.kind==='slot'?1:point.kind==='frame'?2:point.kind==='object'?3:point.kind==='class'?4:point.id==='stdin'?5:point.id==='stdout'?6:7
const endpointFromCode=(code:number,id:string|null|undefined):FlowEndpoint|null=>code===1?{kind:'slot',id:id!}:code===2?{kind:'frame',id:id!}:code===3?{kind:'object',id:id!}:code===4?{kind:'class',id:id!}:code===5?{kind:'io',id:'stdin'}:code===6?{kind:'io',id:'stdout'}:code===7?{kind:'io',id:'stderr'}:null
const kinds:Partial<Record<GraphEdge['kind'],FlowKind>>={ARGUMENT_BIND:'argument',RECEIVER_BIND:'receiver',ASSIGN:'assignment',FIELD_WRITE:'local-field',STATIC_WRITE:'local-field',FIELD_READ:'field-read',STATIC_READ:'field-read',REFERENCE_BIND:'reference',ARRAY_READ:'array-read',ARRAY_WRITE:'array-write',RETURN:'return',INPUT_CONSUME:'input',OUTPUT:'output',THROW:'throw',UNWIND:'unwind',CATCH:'catch'}
/** Complete recorded adjacency is independent of drawable-flow filtering; all IDs are looked up explicitly. */
export function createFlowCatalog(initialTrace?:TraceDocument):FlowCatalog {
 let graph:ExecutionGraph|null=null,acceptedTrace:TraceDocument|null=null,indexedEvents=0,indexedEdges=0,lastScene:SceneModel|null=null
 // History owns retained semantic prefixes. Derived endpoint records belong
 // only to the currently resolved graph, rather than multiplying across every
 // retained checkpoint/recent root after scrubbing.
 const resolvedCache=new Map<number,{from:FlowEndpoint|null;to:FlowEndpoint|null}>()
 // Streamed plans retain opaque endpoint IDs and packed kind tags, rather than
 // a DTO list and an object pair for every edge. Bit 6 also caches null/null.
 let endpointTags=new Uint8Array(0),endpointFromIds:(string|null)[]=[],endpointToIds:(string|null)[]=[]
 let currentPrefix:{trace:TraceDocument;cursor:number;length:number;state:RuntimeState}|undefined
 const restorePrefix=(trace:TraceDocument,cursor:number,length:number):RuntimeState=>{
  const state=seek(trace,cursor)
  resolvedCache.clear()
  endpointTags=new Uint8Array(0);endpointFromIds=[];endpointToIds=[]
  currentPrefix={trace,cursor,length,state}
  return state
 }
 const stateAt=(cursor:number):RuntimeState|null=>{
  const trace=acceptedTrace
  if(!trace)return null
  const prefix=currentPrefix,length=trace.events.length
  return prefix?.cursor===cursor&&prefix.trace===trace&&prefix.length===length?prefix.state:restorePrefix(trace,cursor,length)
 }
 // Capture each supported edge's append-time value, and keep its event ordinal
 // beside the accepted graph's ordered edge vector. Keep opaque ID lookup for
 // selection without retaining a second edge DTO and per-event bucket.
 let eventIndex:AcceptedEventIndex|undefined=initialTrace?acceptedEventIndex(initialTrace):undefined
 const events={get:(id:string)=>{const event=eventIndex?.get(id);return event&&event.seq<indexedEvents?event:undefined}}
 const byId=new Map<string,number>(), capturedValues:(RuntimeValue|undefined)[]=[]
 let edgeEventOrdinals=new Uint32Array(0)
 const lowerBound=(cursor:number,limit=indexedEdges)=>{
  let low=0,high=limit
  while(low<high){
   const middle=low+Math.floor((high-low)/2)
   if(edgeEventOrdinals[middle]<cursor)low=middle+1
   else high=middle
  }
  return low
 }
 let prefixCache:{scene:SceneModel;cursor:number;indexedEdges:number;items:readonly RecordedFlow[]}|undefined
 const physical=(id:string,state:RuntimeState):FlowEndpoint|null=>{
  const storage=state.executionGraph?.storage[id]
  if(storage)return{kind:'slot',id}
  if(state.objects[id])return{kind:'object',id}
  if(state.classes?.[id])return{kind:'class',id}
  const item=state.executionGraph?.io[id]
  return item&&item.channel!=='file'&&(item.kind==='input-consume'||item.kind==='output')?{kind:'io',id:item.channel}:null
 }
 const mapped=(point:FlowEndpoint|null,scene:SceneModel):boolean=>{
  if(!point)return false
  if(point.kind==='io')return scene.io.some(io=>io.id===point.id)
  if(point.kind!=='slot')return !!scene.entities[point.id]
  const storage=stateAt(scene.cursor)?.executionGraph?.storage[point.id],owner=storage?scene.entities[storage.ownerId]:null
  if(!owner)return false
  if(owner.kind==='array')return owner.cells.some(cell=>cell.slotId===point.id&&hasRecordedValuePort(cell.value)) // actual window attachment is checked by the planner
  if(owner.kind==='collection')return owner.entries.some((entry,index)=>((entry.slotId===point.id&&hasRecordedValuePort(entry.value))||(entry.keySlotId===point.id&&!!entry.key&&hasRecordedValuePort(entry.key)))&&!!collectionEntryFace(owner.anchor,index,owner.collectionKind==='Map'))
  const rows=owner.kind==='frame'||owner.kind==='class'?owner.rows:owner.groups.flatMap(g=>g.rows)
  return rows.some(row=>row.slotId===point.id&&hasRecordedValuePort(row.value)&&(owner.kind==='frame'||row.port!==null)) // actual frame row windows are resolved by the planner
 }
 const formatted=(candidate:Candidate,scene:SceneModel,points=resolve(candidate,scene.cursor)):SceneFlow|null=>{
  if(!points.to)return null
  const value=candidate.value
  const target=value?.kind==='reference'?scene.entities[value.objectId]:null
  const text=value?.kind==='reference'?target?`${target.title} #${'displayId'in target?target.displayId:'?'}`:'⟨not recorded⟩':value?valueText(value).text:null
  return{id:candidate.edge.id,edgeIndex:candidate.edgeIndex,kind:candidate.kind,from:points.from,to:points.to,evidenceEventIds:[candidate.edge.eventId],evidenceSeqs:[candidate.seq],valueText:text}
 }
 const resolve=(candidate:Candidate,cursor:number,retain=true):{from:FlowEndpoint|null;to:FlowEndpoint|null}=>{
  const state=stateAt(cursor)
  if(!state||candidate.seq>=cursor)return{from:null,to:null}
  const prior=resolvedCache.get(candidate.edgeIndex);if(prior)return prior
  const tag=endpointTags[candidate.edgeIndex]
  if(tag){
   const result={from:endpointFromCode((tag>>3)&7,endpointFromIds[candidate.edgeIndex]),to:endpointFromCode(tag&7,endpointToIds[candidate.edgeIndex])}
   if(retain)resolvedCache.set(candidate.edgeIndex,result)
   return result
  }
  const prefix=state.executionGraph
  if(!prefix)return{from:null,to:null}
  const edge=candidate.edge
  let from:FlowEndpoint|null,to:FlowEndpoint|null
  if(edge.kind==='RETURN'){
   const returned=recordedReturnDestination(prefix,edge,events.get(edge.eventId)!,events)
   from=returned&&state.frames[returned.frameId]?{kind:'frame',id:returned.frameId}:null
   to=returned?{kind:'slot',id:returned.destination.id}:null
  }else if(edge.kind==='FIELD_READ'||edge.kind==='STATIC_READ'||edge.kind==='ARRAY_READ'||edge.kind==='INPUT_CONSUME'){
   from=physical(edge.from,state)
   const storage=consumingWriteDestination(prefix,edge.to,events)
   to=storage?{kind:'slot',id:storage.id}:null
  }else{
   const endpoints=graphTransitionEndpoints(events.get(edge.eventId)!,edge,state,prefix)
   from=endpoints.from??(edge.evidence==='unknown'?null:physical(edge.originSlotId??edge.from,state))
   to=endpoints.to??physical(edge.to,state)
  }
  if(from?.kind==='slot'&&from.id.startsWith('return:')){const id=from.id.slice('return:'.length),invocation=prefix.invocations[id];from=invocation?.returnValueId&&invocation.returnValueId===edge.from&&state.frames[id]?{kind:'frame',id}:null}
  if(from?.id===to?.id&&from?.kind===to?.kind)from=null
  const result={from:from??null,to:to??null}
  if(retain)resolvedCache.set(candidate.edgeIndex,result)
  else{
   if(candidate.edgeIndex>=endpointTags.length){const tags=new Uint8Array(Math.max(indexedEdges,candidate.edgeIndex+1));tags.set(endpointTags);endpointTags=tags}
   endpointFromIds[candidate.edgeIndex]=result.from?.id??null;endpointToIds[candidate.edgeIndex]=result.to?.id??null
   endpointTags[candidate.edgeIndex]=64|(endpointCode(result.from)<<3)|endpointCode(result.to)
  }
  return result
 }
 // Eager public snapshots retain their existing cache/identity contract. The
 // planner consumes this pass directly, so off-cut DTOs and endpoint pairs do
 // not become long-lived owners merely because a plan accounts for them.
 function* iterate(cursor:number,scene:SceneModel,retain:boolean,edgeLimit:number):IterableIterator<RecordedFlow>{
  lastScene=scene
  for(let index=0;index<edgeLimit&&edgeEventOrdinals[index]<cursor;index++){
   const candidate=candidateAt(index)
   if(!candidate)continue
   const points=resolve(candidate,cursor,retain),flow=formatted(candidate,scene,points)
   yield flow??{id:candidate.edge.id,edgeIndex:candidate.edgeIndex,kind:candidate.kind,from:points.from,to:points.to,evidenceEventIds:[candidate.edge.eventId],evidenceSeqs:[candidate.seq],valueText:null}
  }
 }
 const drawable=(candidate:Candidate,scene:SceneModel)=>{const points=resolve(candidate,scene.cursor);return mapped(points.from,scene)&&mapped(points.to,scene)}
 const adjacency=(ids:ReadonlySet<string>,result:Set<number>,tail:number,cursor=Infinity)=>{
  if(!graph)return
  for(const id of ids)for(const record of[graph.incoming,graph.outgoing]){
   // Opaque IDs may name Object.prototype members; only recorded entries count.
   const indices=Object.hasOwn(record,id)?record[id]:undefined
   if(!indices)continue
   let lo=0,hi=indices.length
   while(lo<hi){const mid=(lo+hi)>>>1,seq=events.get(graph.edges[indices[mid]].eventId)!.seq;if(seq<cursor)lo=mid+1;else hi=mid}
   for(let i=Math.max(0,lo-tail);i<lo;i++)result.add(indices[i])
  }
 }
 const candidateAt=(edgeIndex:number):Candidate|undefined=>{
  const edge=graph?.edges[edgeIndex],kind=edge?kinds[edge.kind]:undefined
  if(!edge||!kind||edgeIndex>=indexedEdges)return undefined
  return{edgeIndex,edge,seq:edgeEventOrdinals[edgeIndex],kind,value:capturedValues[edgeIndex]}
 }
 const api:FlowCatalog={
  extend(next,trace){
   if(next.edges.length<indexedEdges||trace.events.length<indexedEvents)throw new Error('FlowCatalog requires one append-only accepted recording')
   eventIndex??=acceptedEventIndex(trace)
   eventIndex=eventIndex.accept(trace.events,indexedEvents)
   indexedEvents=trace.events.length
   graph=next;acceptedTrace=trace
   if(indexedEdges===next.edges.length)return
   if(edgeEventOrdinals.length<next.edges.length){
    const ordinals=new Uint32Array(Math.max(next.edges.length,edgeEventOrdinals.length*2))
    ordinals.set(edgeEventOrdinals)
    edgeEventOrdinals=ordinals
   }
   for(;indexedEdges<next.edges.length;indexedEdges++){
    const edge=next.edges[indexedEdges],event=events.get(edge.eventId),kind=kinds[edge.kind]
    if(!event)throw new Error(`Graph edge lacks accepted event ${edge.eventId}`)
    edgeEventOrdinals[indexedEdges]=event.seq
    if(!kind)continue
    capturedValues[indexedEdges]=next.values[edge.from]?.value??next.values[edge.to]?.value??(event.type==='EXECUTION_FACT'&&'value'in event.fact?event.fact.value:undefined)
    byId.set(edge.id,indexedEdges)
   }
  },
  query({cursor,scene,priority,limit}){
   lastScene=scene
   if(limit<=0)return[]
   const tiers=[priority.selectedIds,priority.focusedIds,priority.currentIds],seen=new Set<number>(),result:SceneFlow[]=[]
   const add=(indices:Iterable<number>)=>{for(const index of[...indices].sort((a,b)=>b-a)){if(seen.has(index))continue;seen.add(index);const candidate=candidateAt(index);if(candidate&&candidate.seq<cursor&&drawable(candidate,scene)){const flow=formatted(candidate,scene);if(flow)result.push(flow)}if(result.length>=limit)return}}
   for(const ids of tiers){const indices=new Set<number>();for(const id of ids){const edgeIndex=byId.get(id);if(edgeIndex!==undefined)indices.add(edgeIndex)}adjacency(ids,indices,128,cursor);add(indices);if(result.length>=limit)return result.slice(0,limit)}
   const boundary=lowerBound(cursor)
   add(Array.from({length:Math.min(256,boundary)},(_,i)=>boundary-1-i))
   return result.slice(0,Math.max(0,limit))
  },
  atEvent(cursor,scene){
   lastScene=scene
   if(!cursor||!scene.cursorEvent)return[]
   const flows:SceneFlow[]=[],seq=cursor-1
   for(let index=lowerBound(seq);index<indexedEdges&&edgeEventOrdinals[index]===seq;index++){
    const candidate=candidateAt(index)
    if(candidate?.edge.eventId!==scene.cursorEvent.id||!drawable(candidate,scene))continue
    const flow=formatted(candidate,scene)
    if(flow)flows.push(flow)
   }
   return flows
  },
  prefix(cursor,scene){
   lastScene=scene
   if(prefixCache?.scene===scene&&prefixCache.cursor===cursor&&prefixCache.indexedEdges===indexedEdges)return prefixCache.items
   const result=Object.freeze([...iterate(cursor,scene,true,indexedEdges)]);prefixCache={scene,cursor,indexedEdges,items:result};return result
  },
  iteratePrefix(cursor,scene){
   lastScene=scene
   return prefixCache?.scene===scene&&prefixCache.cursor===cursor&&prefixCache.indexedEdges===indexedEdges?prefixCache.items:iterate(cursor,scene,false,indexedEdges)
  },
  bundles({cursor,scene,exclude}){
   lastScene=scene;const groups=new Map<string,FlowBundle>()
   for(const flow of api.prefix(cursor,scene)){
    if(exclude.has(flow.id)||!flow.from||!flow.to)continue
    const id=`presentation:flow-bundle:${JSON.stringify([scene.recordingId,flow.from.kind,flow.from.id,flow.to.kind,flow.to.id,flow.kind])}`,prior=groups.get(id)
    if(prior){prior.count++;continue}
    const canDraw=mapped(flow.from,scene)&&mapped(flow.to,scene)
    groups.set(id,{id,from:flow.from,to:flow.to,count:1,drawable:canDraw,reason:canDraw?null:'An endpoint is absent, retired or lacks a captured spatial mapping'})
   }
   return [...groups.values()]
  },
  recordedProvenanceOf(id,cursor){
   if(!graph)return[]
   const indices=new Set<number>();adjacency(new Set([id]),indices,Infinity)
   return[...indices].sort((a,b)=>a-b).flatMap(index=>{
    const edge=graph!.edges[index],event=events.get(edge.eventId);if(!event||event.seq>=cursor)return[]
    const candidate=candidateAt(index),canDraw=!!candidate&&lastScene?.cursor===cursor&&drawable(candidate,lastScene)
    return[{edgeId:edge.id,edgeIndex:index,kind:edge.kind,from:edge.from,to:edge.to,originSlotId:edge.originSlotId??null,eventId:edge.eventId,graphEvidence:edge.evidence,evidence:{kind:edge.evidence==='observed'?'observed' as const:edge.evidence==='bytecode-derived'?'derived' as const:'unavailable' as const,introducedSeq:event.seq,changedSeq:event.seq,eventIds:[edge.eventId],...(edge.evidence==='unknown'?{unavailableReason:'Recorder marks provenance unknown'}:{})},spatial:{drawable:canDraw,reason:canDraw?null:'Recorded evidence has no evaluated drawable mapping at this prefix'}}]
   })
  },
  drawableFlowsOf(id,cursor,scene){lastScene=scene;const indices=new Set<number>();adjacency(new Set([id]),indices,Infinity);return[...indices].sort((a,b)=>b-a).flatMap(index=>{const candidate=candidateAt(index);if(!candidate||candidate.seq>=cursor||!drawable(candidate,scene))return[];const flow=formatted(candidate,scene);return flow?[flow]:[]})},
 }
 return api
}
