import {expect,it} from 'vitest'
import type {TraceDocument,TraceEvent} from '../contracts/runtime'
import {acceptedEventIndex,createAcceptedEventIndex} from './acceptedEventIndex'
import {createRecordedReferenceBindings} from './recordedReferenceBindings'
import {createFlowCatalog} from './flowCatalog'
import {emptyExecutionGraph} from '../runtime/executionGraph'

function recording():TraceDocument {
 const events:TraceEvent[]=[
  {type:'PROGRAM_START',eventId:'opaque/start',seq:0,source:null,label:'start',importance:'normal'},
  {type:'ALLOCATE_OBJECT',eventId:'opaque/object',seq:1,source:null,label:'object',importance:'normal',objectId:'opaque/object-id',displayId:1,className:'Unit',fields:[]},
  {type:'PROGRAM_END',eventId:'opaque/end',seq:2,source:null,label:'end',importance:'normal'},
 ]
 return{schemaVersion:2,demoId:'same-label',sourceFiles:[],events}
}

it('shares only an exact document owner; equal recording IDs and event IDs stay independent',()=>{
 const a=recording(),b=recording(),first=acceptedEventIndex(a),other=acceptedEventIndex(b)
 expect(acceptedEventIndex(a)).toBe(first);expect(other).not.toBe(first)
 first.accept(a.events,0)
 expect(first.get(a.events[1].eventId)).toBe(a.events[1]);expect(other.get(a.events[1].eventId)).toBeUndefined()
 other.accept(b.events,0);expect(other.get(b.events[1].eventId)).toBe(b.events[1])
})

it('validates the whole envelope before publishing any new witness and can recover',()=>{
 const trace=recording(),index=createAcceptedEventIndex()
 index.accept(trace.events.slice(0,1),0)
 const duplicate=[...trace.events,{...trace.events[0],seq:3}]
 expect(()=>index.accept(duplicate,1)).toThrow();expect(index.length).toBe(1)
 expect(index.get(trace.events[1].eventId)).toBeUndefined()
 expect(()=>index.accept([...trace.events.slice(0,2),{...trace.events[2],seq:8}],1)).toThrow()
 expect(index.length).toBe(1);expect(index.get(trace.events[1].eventId)).toBeUndefined()
 index.accept(trace.events,1);expect(index.length).toBe(3)
 expect(index.get(trace.events[2].eventId)).toBe(trace.events[2])
})

it('allows lagging readers without shrinking the shared index or exposing their future suffix',()=>{
 const trace=recording(),shared=acceptedEventIndex(trace)
 const ahead=createRecordedReferenceBindings(trace.demoId,shared),behind=createRecordedReferenceBindings(trace.demoId,shared)
 const lookup=behind.events
 ahead.append(trace.events)
 expect(shared.length).toBe(3);expect(behind.length).toBe(0)
 expect(lookup.get(trace.events[0].eventId)).toBeUndefined()
 behind.append(trace.events.slice(0,1))
 expect(shared.length).toBe(3);expect(lookup.get(trace.events[0].eventId)).toBe(trace.events[0])
 expect(lookup.get(trace.events[1].eventId)).toBeUndefined()
 expect(()=>behind.append([...trace.events,{...trace.events[0],seq:3}])).toThrow()
 expect(behind.length).toBe(1);expect(lookup.get(trace.events[1].eventId)).toBeUndefined()
 behind.append(trace.events);expect(behind.events).toBe(lookup)
 expect(lookup.get(trace.events[2].eventId)).toBe(trace.events[2])
})

it('keeps a streaming compiler owner across wrappers and isolates replaced unconsumed witnesses',()=>{
 const trace=recording(),initial={...trace,events:trace.events.slice(0,1)},index=acceptedEventIndex(initial)
 index.accept(initial.events,0)
 const wrapped={...initial,events:trace.events.slice(0,2)}
 index.accept(wrapped.events,1)
 expect(index.length).toBe(2)
 const replaced={...trace.events[0],label:'replaced in an independent reader'}
 const branch=index.accept([replaced,...trace.events.slice(1)],0)
 expect(branch).not.toBe(index);expect(branch.get(replaced.eventId)).toBe(replaced)
 expect(index.get(replaced.eventId)).toBe(trace.events[0])
 expect(index.length).toBe(2);expect(index.get(trace.events[2].eventId)).toBeUndefined()
 index.accept(trace.events,2);expect(index.length).toBe(3)
})

it('keeps admitted witnesses when a mutable fixture replaces the consumed event object',()=>{
 const trace=recording(),shared=acceptedEventIndex(trace),first=createRecordedReferenceBindings(trace.demoId,shared)
 first.append(trace.events)
 const original=trace.events[2]
 trace.events[2]={...original,label:'late fixture enrichment'}
 expect(()=>first.append(trace.events)).not.toThrow()
 expect(first.events.get(original.eventId)).toBe(original)
 const second=createRecordedReferenceBindings(trace.demoId,shared)
 second.append(trace.events)
 expect(second.events.get(original.eventId)).toBe(trace.events[2])
 expect(first.events.get(original.eventId)).toBe(original)
})

it('cannot use another reader’s future witness to admit a graph edge and recovers after an invalid envelope',()=>{
 const trace=recording(),ahead=createRecordedReferenceBindings(trace.demoId,acceptedEventIndex(trace))
 ahead.append(trace.events)
 const catalog=createFlowCatalog(trace),prefix={...trace,events:trace.events.slice(0,1)},empty=emptyExecutionGraph()
 const id='opaque/object-id',edge={id:'opaque/edge',kind:'OBSERVE' as const,from:id,to:id,eventId:trace.events[1].eventId,evidence:'observed' as const,
  context:{owner:'Unit',name:'main',descriptor:'()V',frameId:null,site:null,rawSeq:1,source:null}}
 const graph={...empty,edges:[edge],incoming:{[id]:[0]},outgoing:{[id]:[0]}}
 expect(()=>catalog.extend(graph,prefix)).toThrow('Graph edge lacks accepted event')
 catalog.extend(empty,prefix)
 expect(()=>catalog.extend(empty,{...trace,events:[...trace.events,{...trace.events[0],seq:3}]})).toThrow()
 catalog.extend(graph,trace)
 expect(catalog.recordedProvenanceOf(id,1)).toEqual([])
 const facts=catalog.recordedProvenanceOf(id,2)
 expect(facts).toHaveLength(1);expect(facts[0].eventId).toBe(trace.events[1].eventId)
 expect(facts[0].evidence.introducedSeq).toBe(1)
 expect(facts[0].spatial.drawable).toBe(false)
})
