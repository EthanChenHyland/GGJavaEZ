import type { RuntimeState, RuntimeValue, TraceDocument, TraceEvent } from '../contracts/runtime'
import type { ExecutionGraph, GraphEdge } from '../contracts/executionGraph'
import type { Evidence, SceneModel } from '../contracts/worldV2'
import { graphTransition, type FlowEndpoint } from '../motion/semanticTransition'
import { seek } from '../runtime'
import { valueText } from './valueText'
export type FlowKind='argument'|'receiver'|'local-field'|'field-read'|'assignment'|'reference'|'array-read'|'array-write'|'return'|'input'|'output'|'throw'|'unwind'|'catch'
export interface SceneFlow {id:string;edgeIndex:number;kind:FlowKind;from:FlowEndpoint|null;to:FlowEndpoint;evidenceSeqs:readonly number[];valueText:string|null}
export interface RecordedProvenance {edgeId:string;edgeIndex:number;kind:GraphEdge['kind'];from:string;to:string;originSlotId:string|null;eventId:string;graphEvidence:GraphEdge['evidence'];evidence:Evidence;spatial:{drawable:boolean;reason:string|null}}
export interface FlowPriorityInput {selectedIds:ReadonlySet<string>;focusedIds:ReadonlySet<string>;currentIds:ReadonlySet<string>}
export interface FlowBundle {id:string;from:FlowEndpoint;to:FlowEndpoint;count:number;drawable:boolean;reason:string|null}
export interface FlowCatalog {
 extend(graph:ExecutionGraph,trace:TraceDocument):void
 query(input:{cursor:number;scene:SceneModel;priority:FlowPriorityInput;limit:number}):SceneFlow[]
 bundles(input:{cursor:number;scene:SceneModel;exclude:ReadonlySet<string>}):FlowBundle[]
 atEvent(cursor:number,scene:SceneModel):SceneFlow[]
 recordedProvenanceOf(valueOrSlotId:string,cursor:number):readonly RecordedProvenance[]
 drawableFlowsOf(valueOrSlotId:string,cursor:number,scene:SceneModel):readonly SceneFlow[]
}
interface Candidate {edgeIndex:number;edge:GraphEdge;seq:number;kind:FlowKind;from:FlowEndpoint|null;to:FlowEndpoint|null;value:RuntimeValue|undefined;bundleKey:string|null}
interface BundleIndex {items:Candidate[]}
const kinds:Partial<Record<GraphEdge['kind'],FlowKind>>={ARGUMENT_BIND:'argument',RECEIVER_BIND:'receiver',ASSIGN:'assignment',FIELD_WRITE:'local-field',STATIC_WRITE:'local-field',FIELD_READ:'field-read',STATIC_READ:'field-read',REFERENCE_BIND:'reference',ARRAY_READ:'array-read',ARRAY_WRITE:'array-write',RETURN:'return',INPUT_CONSUME:'input',OUTPUT:'output',THROW:'throw',UNWIND:'unwind',CATCH:'catch'}
function prefixCount(items:readonly Candidate[],cursor:number){let lo=0,hi=items.length;while(lo<hi){const mid=(lo+hi)>>>1;if(items[mid].seq<cursor)lo=mid+1;else hi=mid}return lo}
/** Complete recorded adjacency is independent of drawable-flow filtering; all IDs are looked up explicitly. */
export function createFlowCatalog():FlowCatalog {
 let graph:ExecutionGraph|null=null,acceptedTrace:TraceDocument|null=null,indexedEvents=0,indexedEdges=0,lastScene:SceneModel|null=null
 const resolvedCache=new WeakMap<ExecutionGraph,Map<number,{from:FlowEndpoint|null;to:FlowEndpoint|null}>>()
 const events=new Map<string,TraceEvent>(),candidates=new Map<number,Candidate>(),byId=new Map<string,Candidate>(),byEvent=new Map<string,Candidate[]>(),bundleIndex=new Map<string,BundleIndex>()
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
  const storage=acceptedTrace?seek(acceptedTrace,scene.cursor).executionGraph?.storage[point.id]:null,owner=storage?scene.entities[storage.ownerId]:null
  if(!owner)return false
  if(owner.kind==='array')return owner.cells.some(cell=>cell.slotId===point.id) // actual window attachment is checked by the planner
  const rows=owner.kind==='frame'||owner.kind==='class'?owner.rows:owner.kind==='object'?owner.groups.flatMap(g=>g.rows):owner.entries
  return rows.some(row=>row.slotId===point.id&&row.port!==null)
 }
 const formatted=(candidate:Candidate,scene:SceneModel):SceneFlow|null=>{
  const points=resolve(candidate,scene.cursor);if(!points.to)return null
  const value=candidate.value
  const target=value?.kind==='reference'?scene.entities[value.objectId]:null
  const text=value?.kind==='reference'?target?`${target.title} #${'displayId'in target?target.displayId:'?'}`:'⟨not recorded⟩':value?valueText(value).text:null
  return{id:candidate.edge.id,edgeIndex:candidate.edgeIndex,kind:candidate.kind,from:points.from,to:points.to,evidenceSeqs:[candidate.seq],valueText:text}
 }
 const resolve=(candidate:Candidate,cursor:number):{from:FlowEndpoint|null;to:FlowEndpoint|null}=>{
  if(!acceptedTrace)return{from:null,to:null}
  const state=seek(acceptedTrace,cursor),prefix=state.executionGraph,event=events.get(candidate.edge.eventId)!
  if(!prefix||candidate.seq>=cursor)return{from:null,to:null}
  const cached=resolvedCache.get(prefix)??new Map(),prior=cached.get(candidate.edgeIndex);if(prior)return prior
  const edge=candidate.edge,transition=graphTransition(event,edge,state,prefix,true)
  let from=transition?.from??(edge.evidence==='unknown'?null:physical(edge.originSlotId??edge.from,state)),to=transition?.to??physical(edge.to,state)
  const consumingDestination=(valueId:string)=>{
   for(const index of prefix.outgoing[valueId]??[]){const consumed=prefix.edges[index],factEvent=events.get(consumed.eventId),storage=prefix.storage[consumed.to];if(!storage||!['ASSIGN','FIELD_WRITE','STATIC_WRITE','ARRAY_WRITE'].includes(consumed.kind)||factEvent?.type!=='EXECUTION_FACT'||factEvent.fact.kind!=='write')continue
    const origin=factEvent.fact.origin;if(!['call_result','field_read','static_read','array_read'].includes(origin.kind))continue
    return{kind:'slot' as const,id:storage.id}
   }
   return null
  }
  if(edge.kind==='RETURN'){
   if(event.type==='EXECUTION_FACT'&&event.fact.kind==='return'&&!prefix.invocations[edge.from]&&!prefix.calls[edge.from]){from=state.frames[event.fact.invocationId]?{kind:'frame',id:event.fact.invocationId}:null;to=consumingDestination(edge.to)}
   else from=null // completion is evidence, not an additional value-transfer curve
  }else if(edge.kind==='FIELD_READ'||edge.kind==='STATIC_READ'||edge.kind==='ARRAY_READ'){from=physical(edge.from,state);to=consumingDestination(edge.to)}
  else if(edge.kind==='INPUT_CONSUME'){from=physical(edge.from,state);to=consumingDestination(edge.to)}
  if(from?.kind==='slot'&&from.id.startsWith('return:')){const id=from.id.slice('return:'.length),invocation=prefix.invocations[id];from=invocation?.returnValueId&&invocation.returnValueId===edge.from&&state.frames[id]?{kind:'frame',id}:null}
  if(from?.id===to?.id&&from?.kind===to?.kind)from=null
  const result={from:from??null,to:to??null};cached.set(candidate.edgeIndex,result);resolvedCache.set(prefix,cached);return result
 }
 const drawable=(candidate:Candidate,scene:SceneModel)=>{const points=resolve(candidate,scene.cursor);return mapped(points.from,scene)&&mapped(points.to,scene)}
 const adjacency=(ids:ReadonlySet<string>,result:Set<number>,tail:number,cursor=Infinity)=>{
  if(!graph)return
  for(const id of ids)for(const indices of[graph.incoming[id],graph.outgoing[id]])if(indices){
   let lo=0,hi=indices.length
   while(lo<hi){const mid=(lo+hi)>>>1,seq=events.get(graph.edges[indices[mid]].eventId)!.seq;if(seq<cursor)lo=mid+1;else hi=mid}
   for(let i=Math.max(0,lo-tail);i<lo;i++)result.add(indices[i])
  }
 }
 const api:FlowCatalog={
  extend(next,trace){
   if(next.edges.length<indexedEdges||trace.events.length<indexedEvents)throw new Error('FlowCatalog requires one append-only accepted recording')
   for(;indexedEvents<trace.events.length;indexedEvents++){const event=trace.events[indexedEvents];if(events.has(event.eventId)||event.seq!==indexedEvents)throw new Error('FlowCatalog requires unique event identities and semantic ordinals');events.set(event.eventId,event)}
   graph=next;acceptedTrace=trace
   if(indexedEdges===next.edges.length)return
   const state=seek(trace,trace.events.length)
   for(;indexedEdges<next.edges.length;indexedEdges++){
    const edge=next.edges[indexedEdges],event=events.get(edge.eventId),kind=kinds[edge.kind]
    if(!event)throw new Error(`Graph edge lacks accepted event ${edge.eventId}`)
    if(!kind)continue
    const transition=graphTransition(event,edge,state,next,true)
    const from=transition?.from??(edge.evidence==='unknown'?null:physical(edge.originSlotId??edge.from,state)),to=transition?.to??physical(edge.to,state)
    const mayGainPort=!!edge.originSlotId||['RETURN','INPUT_CONSUME','FIELD_READ','STATIC_READ','ARRAY_READ'].includes(edge.kind)||!!next.storage[edge.from]||!!next.objects[edge.from]||!!next.classes?.[edge.from]||!!next.values[edge.from]&&!['literal','computed','unknown'].includes(next.values[edge.from].kind);
    const bundleKey=from&&to||mayGainPort?`${edge.originSlotId??edge.from}>${edge.to}:${edge.kind}`:null
    const capturedValue=next.values[edge.from]?.value??next.values[edge.to]?.value??(event.type==='EXECUTION_FACT'&&'value'in event.fact?event.fact.value:undefined)
    const candidate:Candidate={edgeIndex:indexedEdges,edge,seq:event.seq,kind,from,to,value:capturedValue,bundleKey}
    candidates.set(indexedEdges,candidate);byId.set(edge.id,candidate)
    const eventItems=byEvent.get(event.eventId)??[];eventItems.push(candidate);byEvent.set(event.eventId,eventItems)
    if(bundleKey){const index=bundleIndex.get(bundleKey)??{items:[]};index.items.push(candidate);bundleIndex.set(bundleKey,index)}
   }
  },
  query({cursor,scene,priority,limit}){
   lastScene=scene
   if(limit<=0)return[]
   const tiers=[priority.selectedIds,priority.focusedIds,priority.currentIds],seen=new Set<number>(),result:SceneFlow[]=[]
   const add=(indices:Iterable<number>)=>{for(const index of[...indices].sort((a,b)=>b-a)){if(seen.has(index))continue;seen.add(index);const candidate=candidates.get(index);if(candidate&&candidate.seq<cursor&&drawable(candidate,scene)){const flow=formatted(candidate,scene);if(flow)result.push(flow)}if(result.length>=limit)return}}
   for(const ids of tiers){const indices=new Set<number>();for(const id of ids){const candidate=byId.get(id);if(candidate)indices.add(candidate.edgeIndex)}adjacency(ids,indices,128,cursor);add(indices);if(result.length>=limit)return result.slice(0,limit)}
   if(graph){let lo=0,hi=graph.edges.length;while(lo<hi){const mid=(lo+hi)>>>1;if(events.get(graph.edges[mid].eventId)!.seq<cursor)lo=mid+1;else hi=mid}add(Array.from({length:Math.min(256,lo)},(_,i)=>lo-1-i))}
   return result.slice(0,Math.max(0,limit))
  },
  atEvent(cursor,scene){lastScene=scene;if(!cursor||!scene.cursorEvent)return[];return(byEvent.get(scene.cursorEvent.id)??[]).filter(c=>c.seq===cursor-1&&drawable(c,scene)).flatMap(c=>{const flow=formatted(c,scene);return flow?[flow]:[]})},
  bundles({cursor,scene,exclude}){
   lastScene=scene;const result:FlowBundle[]=[],excluded=new Map<string,number>()
   for(const id of exclude){const item=byId.get(id);if(item?.bundleKey&&item.seq<cursor)excluded.set(item.bundleKey,(excluded.get(item.bundleKey)??0)+1)}
   for(const[key,index]of bundleIndex){const count=prefixCount(index.items,cursor)-(excluded.get(key)??0);if(!count)continue;const points=resolve(index.items[0],cursor);if(!points.from||!points.to)continue;const canDraw=mapped(points.from,scene)&&mapped(points.to,scene);result.push({id:`bundle:${key}`,from:points.from,to:points.to,count,drawable:canDraw,reason:canDraw?null:'An endpoint is absent, retired or lacks a captured spatial mapping'})}
   return result
  },
  recordedProvenanceOf(id,cursor){
   if(!graph)return[]
   const indices=new Set<number>();adjacency(new Set([id]),indices,Infinity)
   return[...indices].sort((a,b)=>a-b).flatMap(index=>{
    const edge=graph!.edges[index],event=events.get(edge.eventId);if(!event||event.seq>=cursor)return[]
    const candidate=candidates.get(index),canDraw=!!candidate&&lastScene?.cursor===cursor&&drawable(candidate,lastScene)
    return[{edgeId:edge.id,edgeIndex:index,kind:edge.kind,from:edge.from,to:edge.to,originSlotId:edge.originSlotId??null,eventId:edge.eventId,graphEvidence:edge.evidence,evidence:{kind:edge.evidence==='observed'?'observed' as const:edge.evidence==='bytecode-derived'?'derived' as const:'unavailable' as const,introducedSeq:event.seq,changedSeq:event.seq,eventIds:[edge.eventId],...(edge.evidence==='unknown'?{unavailableReason:'Recorder marks provenance unknown'}:{})},spatial:{drawable:canDraw,reason:canDraw?null:'Recorded evidence has no evaluated drawable mapping at this prefix'}}]
   })
  },
  drawableFlowsOf(id,cursor,scene){lastScene=scene;const indices=new Set<number>();adjacency(new Set([id]),indices,Infinity);return[...indices].sort((a,b)=>b-a).flatMap(index=>{const candidate=candidates.get(index);if(!candidate||candidate.seq>=cursor||!drawable(candidate,scene))return[];const flow=formatted(candidate,scene);return flow?[flow]:[]})},
 }
 return api
}
