import { expect, it } from 'vitest'
import fc from 'fast-check'
import { generateRawTrace } from '../testing/traceGen'
import { normalizeTrace } from '../instrumentation/normalize'
import { seek } from '../runtime'
import { createLayoutEngine } from './layoutEngine'
import { createSceneProjector } from './sceneProjector'
import { createFlowCatalog } from './flowCatalog'

it('complete recorded adjacency survives non-drawable evidence and opaque IDs (100 runs)',()=>{
 fc.assert(fc.property(fc.integer({min:1,max:100000}),seed=>{
  const raw=generateRawTrace({seed,rawEvents:45,maxDepth:4,classes:3,callRate:.4,provenance:true}),trace=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace
  trace.events = trace.events.map((event,index)=>({...event,eventId:`opaque/${seed}/record-${index.toString(36)}`}))
  const live=seek(trace,trace.events.length),graph=live.executionGraph!
  const catalog=createFlowCatalog();catalog.extend(graph,trace)
  const eventSeq=new Map(trace.events.map(event=>[event.eventId,event.seq]))
  for(const cursor of[0,Math.floor(trace.events.length/2),trace.events.length]){
   for(const id of Object.keys(graph.storage)){
    const expected=graph.edges.filter(edge=>(edge.from===id||edge.to===id||edge.originSlotId===id)&&eventSeq.get(edge.eventId)!<cursor)
    const observed=catalog.recordedProvenanceOf(id,cursor)
    expect(observed.map(item=>item.edgeId)).toEqual(expected.map(edge=>edge.id))
    for(const item of observed){expect(item.evidence.eventIds).toEqual([item.eventId]);expect(item.evidence.introducedSeq).toBe(eventSeq.get(item.eventId));expect(item.kind).toBe(graph.edges[item.edgeIndex].kind)}
   }
  }
 }),{numRuns:100})
})
it('flow queries are bounded, current-only evidence is exact and bundle counts subtract exclusions (100 runs)',()=>{
 fc.assert(fc.property(fc.integer({min:1,max:100000}),fc.nat(10000),(seed,offset)=>{
  const raw=generateRawTrace({seed,rawEvents:60,maxDepth:4,classes:3,callRate:.4,provenance:true}),trace=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace
  const catalog=createFlowCatalog();catalog.extend(seek(trace,trace.events.length).executionGraph!,trace)
  const layout=createLayoutEngine();layout.append(trace.events)
  const cursor=offset%(trace.events.length+1),scene=createSceneProjector(trace).project(seek(trace,cursor),layout.state,{liveHead:trace.events.length,sessionEnded:false,pausedAtLiveHead:false,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
  const priorities={selectedIds:new Set<string>(),focusedIds:new Set<string>(),currentIds:new Set(scene.cursorEvent?.subjects??[])}
  const flows=catalog.query({cursor,scene,priority:priorities,limit:6})
  expect(flows.length).toBeLessThanOrEqual(6)
  expect(new Set(flows.map(flow=>flow.id)).size).toBe(flows.length)
  for(const flow of flows){expect(flow.evidenceEventIds).toEqual([seek(trace,cursor).executionGraph!.edges[flow.edgeIndex].eventId]);for(const seq of flow.evidenceSeqs)expect(seq).toBeLessThan(cursor)}
  for(const flow of catalog.atEvent(cursor,scene))expect(flow.evidenceSeqs).toEqual([cursor-1])
  const total=catalog.bundles({cursor,scene,exclude:new Set()}).reduce((sum,bundle)=>sum+bundle.count,0)
  const excluded=catalog.bundles({cursor,scene,exclude:new Set(flows.map(flow=>flow.id))}).reduce((sum,bundle)=>sum+bundle.count,0)
  expect(excluded).toBe(total-flows.length)
  if(!cursor){expect(flows).toEqual([]);expect(catalog.atEvent(cursor,scene)).toEqual([]);expect(total).toBe(0)}
 }),{numRuns:100})
})
it('append and replay keep complete flows, drawable endpoints and bundle membership equal to a fresh prefix (100 runs)',()=>{
 fc.assert(fc.property(fc.integer({min:1,max:100000}),seed=>{
  const raw=generateRawTrace({seed,rawEvents:80,maxDepth:4,classes:3,callRate:.4,allocateRate:.7,provenance:true})
  const full=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace
  const layout=createLayoutEngine();layout.append(full.events)
  const catalog=createFlowCatalog()
  for(const length of[Math.floor(full.events.length/2),full.events.length]){
   const accepted={...full,events:full.events.slice(0,length)},graph=seek(accepted,length).executionGraph!
   catalog.extend(graph,accepted)
   const projector=createSceneProjector(accepted)
   for(const cursor of[length,Math.floor(length/2),0,length]){
    const scene=projector.project(seek(accepted,cursor),layout.state,{liveHead:length,sessionEnded:false,pausedAtLiveHead:false,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
    const fresh=createFlowCatalog();fresh.extend(graph,accepted)
    const query={cursor,scene,priority:{selectedIds:new Set<string>(),focusedIds:new Set<string>(),currentIds:new Set(scene.cursorEvent?.subjects??[])},limit:40}
    expect(catalog.prefix(cursor,scene)).toEqual(fresh.prefix(cursor,scene))
    expect(catalog.query(query)).toEqual(fresh.query(query))
    expect(catalog.bundles({cursor,scene,exclude:new Set()})).toEqual(fresh.bundles({cursor,scene,exclude:new Set()}))
   }
  }
 }),{numRuns:100})
})
