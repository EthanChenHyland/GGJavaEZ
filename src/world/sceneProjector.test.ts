import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { loadArrayTrace, loadPersonTrace } from '../examples/traces'
import { normalizeTrace } from '../instrumentation/normalize'
import { createReductionEngine } from '../runtime/engine'
import { seek } from '../runtime'
import { generateRawTrace } from '../testing/traceGen'
import type { SceneModel } from '../contracts/world'
import type { TraceDocument, TraceEvent } from '../contracts/runtime'
import { createLayoutEngine } from './layoutEngine'
import { createSceneProjector, type ProjectionContext } from './sceneProjector'

function context(trace: TraceDocument): ProjectionContext {
  return { sessionEnded: false, pausedAtLiveHead: false, liveHead: trace.events.length,
    recording: { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false } }
}
function comparable(scene: SceneModel) { const { revision, ...semantic } = scene; void revision; return semantic }
function generated(seed: number, rawEvents = 20) {
  const raw = generateRawTrace({ seed, rawEvents, classes: 2, maxDepth: 3, callRate: .3, allocateRate: .7, provenance: seed % 2 === 0 })
  const trace=normalizeTrace(raw.rawEvents, raw.manifest, { status: 'complete', exitCode: 0, diagnostic: null }).trace
  return{...trace,events:trace.events.map((event,index)=>({...event,eventId:`opaque/${seed}/record-${index.toString(36)}`}))}
}

it('keeps a signature unavailable until its recorded entry fact reaches the cursor',()=>{
  const trace=generated(42,80),signature=trace.events.find(event=>event.type==='EXECUTION_FACT'&&event.fact.kind==='enter'&&event.fact.method.descriptor==='(I)I')
  if(signature?.type!=='EXECUTION_FACT'||signature.fact.kind!=='enter')throw Error('Generated fixture lacks its captured int signature')
  const frameId=signature.fact.invocationId,entry=trace.events.find((event):event is Extract<TraceEvent,{type:'ENTER_METHOD'}>=>event.type==='ENTER_METHOD'&&event.frameId===frameId)!
  expect(entry.locals).toHaveLength(0);expect(signature).toBeDefined()
  const layout=createLayoutEngine();layout.append(trace.events)
  const projector=createSceneProjector(trace)
  const before=projector.project(seek(trace,entry.seq+1),layout.state,context(trace)).entities[entry.frameId]
  const after=projector.project(seek(trace,signature.seq+1),layout.state,context(trace)).entities[entry.frameId]
  expect(before.title).toContain('⟨parameters not recorded⟩')
  expect(after.title).toContain('(int)')
  expect(after.id).toBe(before.id);expect(after.anchor).toBe(before.anchor)
})

it('reuses unchanged primitive array observations without visiting every captured member',()=>{
  const trace=loadArrayTrace(),event=trace.events.find((event):event is Extract<TraceEvent,{type:'ALLOCATE_ARRAY'}>=>event.type==='ALLOCATE_ARRAY')!
  const state=seek(trace,event.seq+1),array=state.objects[event.objectId]
  let reads=0
  const elements=new Proxy(array.array!.elements,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.get(target,key,receiver)}})
  const observed=Object.freeze({...array,array:Object.freeze({...array.array!,elements})})
  const cut=Object.freeze({...state,objects:Object.freeze({...state.objects,[array.id]:observed})})
  const layout=createLayoutEngine();layout.append(trace.events)
  const projector=createSceneProjector(trace),first=projector.project(cut,layout.state,context(trace))
  expect(reads).toBeGreaterThan(0)
  const node=first.entities[array.id]
  expect(node.kind).toBe('array');if(node.kind!=='array')throw Error('Missing observed array')
  expect(node.cells).toHaveLength(5)
  reads=0
  expect(projector.project(cut,layout.state,context(trace)).entities[array.id]).toBe(node)
  expect(reads,'Unchanged cache hits inspect reference targets, not all primitive members').toBe(0)
})

describe('complete prefix scene catalog', () => {
  it('refreshes collection observation evidence even when values and change ordinals are unchanged',()=>{
    const events:TraceEvent[]=[
      {type:'PROGRAM_START'},
      {type:'ENTER_METHOD',frameId:'main',callerFrameId:null,className:'Main',methodName:'main',locals:[]},
      {type:'ALLOCATE_OBJECT',objectId:'node',displayId:1,className:'Node',fields:[]},
      {type:'ALLOCATE_OBJECT',objectId:'list',displayId:2,className:'java.util.ArrayList',fields:[]},
      {type:'OBJECT_OBSERVE',objectId:'list',library:{kind:'LIST',size:1,items:[{kind:'reference',objectId:'node',javaType:'Node'}]}},
      {type:'LINE_EXECUTE',frameId:'main'},
      {type:'OBJECT_OBSERVE',objectId:'list',library:{kind:'LIST',size:1,items:[{kind:'reference',objectId:'node',javaType:'Node'}]}},
      {type:'LINE_EXECUTE',frameId:'main'},
      {type:'EXIT_METHOD',frameId:'main'},
      {type:'PROGRAM_END'},
    ].map((event,seq)=>({...event,eventId:`opaque-observation/${seq.toString(36)}`,seq,source:event.type==='LINE_EXECUTE'?{fileId:'Main.java',line:1}:null,label:'Recorded statement',importance:'quiet'} as TraceEvent))
    const trace:TraceDocument={schemaVersion:2,demoId:'reobserved-collection',sourceFiles:[{fileId:'Main.java',name:'Main.java',content:'class Main {}'}],events},layout=createLayoutEngine();layout.append(events)
    const incremental=createSceneProjector(trace),rebuilt=createSceneProjector(trace)
    let from=5,scene=incremental.project(seek(trace,from),layout.state,context(trace))
    const first=scene.references.find(ref=>ref.sourceId==='list')!
    expect(first.evidence).toMatchObject({introducedSeq:null,changedSeq:null,eventIds:[events[4].eventId]})
    for(const cursor of[7,10,0,5,10]){
      scene=incremental.advance(seek(trace,cursor),layout.state,events,from,cursor,context(trace));from=cursor
      expect(comparable(scene)).toEqual(comparable(rebuilt.project(seek(trace,cursor),layout.state,context(trace))))
      if(cursor>=7)expect(scene.references.find(ref=>ref.sourceId==='list')!.evidence.eventIds).toEqual([events[6].eventId])
    }
    expect(first.evidence.eventIds).toEqual([events[4].eventId])
  })
  it('shows the recorded receiver, reference and age mutation without changing runtime truth', () => {
    const trace = loadPersonTrace(), layout = createLayoutEngine(); layout.append(trace.events)
    const projector = createSceneProjector(trace)
    expect(projector.project(seek(trace, 0), layout.state, context(trace)).order).toEqual({ frames: [], objects: [], classes: [] })
    const before = projector.project(seek(trace, 17), layout.state, context(trace))
    const after = projector.project(seek(trace, 18), layout.state, context(trace))
    const a = before.entities['object:person:17'], b = after.entities['object:person:17']
    expect(a.kind).toBe('object'); expect(b.kind).toBe('object')
    if (a.kind !== 'object' || b.kind !== 'object') throw new Error('Missing recorded object')
    expect(a.groups.flatMap(g => g.rows).find(r => r.name === 'age')?.value.exact).toBe('0')
    expect(b.groups.flatMap(g => g.rows).find(r => r.name === 'age')?.value.exact).toBe('18')
    expect(b.mutation?.slotId).toContain('age')
    expect(b.anchor).toBe(a.anchor)
    expect(after.references.filter(r => r.targetId === b.id).map(r => r.sourceSlotId)).toEqual(expect.arrayContaining(['slot:frame:main:1:p', 'slot:frame:person-setAge:1:this']))
  })
  it('Property 25: projections are pure, seekable and use only prefix evidence (100 runs)', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100000 }), fc.nat(10000), (seed, offset) => {
      const trace = generated(seed), layout = createLayoutEngine(); layout.append(trace.events)
      const cursor = offset % (trace.events.length + 1), state = seek(trace, cursor)
      const before = JSON.stringify(state), projector = createSceneProjector(trace)
      const scene = projector.project(state, layout.state, context(trace))
      expect(JSON.stringify(state)).toBe(before)
      expect(comparable(projector.project(state, layout.state, context(trace)))).toEqual(comparable(scene))
      expect(scene.cursor).toBe(cursor)
      expect(scene.cursorEvent?.id ?? null).toBe(trace.events[cursor - 1]?.eventId ?? null)
      for (const node of Object.values(scene.entities)) {
        expect(node.anchor).toBe(layout.state.anchors[node.id])
        for (const seq of [node.evidence.introducedSeq, node.evidence.changedSeq]) if (seq !== null) expect(seq).toBeLessThan(cursor)
      }
    }), { numRuns: 100 })
  })
  it('Property 26: incremental advance equals reconstruction at every prefix (100 runs)', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100000 }), seed => {
      const trace = generated(seed), layout = createLayoutEngine(); layout.append(trace.events)
      const engine = createReductionEngine(), incremental = createSceneProjector(trace), rebuilt = createSceneProjector(trace)
      incremental.project(engine.state, layout.state, context(trace))
      for (const event of trace.events) {
        const from = engine.state.cursor; engine.apply(event)
        const scene = incremental.advance(engine.state, layout.state, trace.events, from, engine.state.cursor, context(trace))
        expect(comparable(scene)).toEqual(comparable(rebuilt.project(engine.state, layout.state, context(trace))))
      }
    }), { numRuns: 100 })
  })
  it('long forward jumps, single steps and reverse replay equal full prefix reconstruction (100 runs)',()=>{
    fc.assert(fc.property(fc.integer({min:1,max:100000}),seed=>{
      const trace=generated(seed,1000),layout=createLayoutEngine();layout.append(trace.events)
      const incremental=createSceneProjector(trace),rebuilt=createSceneProjector(trace),head=trace.events.length
      incremental.project(seek(trace,0),layout.state,context(trace))
      let from=0
      for(const to of[Math.floor(head*.7),Math.floor(head*.7)+1,Math.floor(head*.2),head,0,1,head]){
        const state=seek(trace,to),scene=incremental.advance(state,layout.state,trace.events,from,to,context(trace))
        expect(comparable(scene)).toEqual(comparable(rebuilt.project(state,layout.state,context(trace))))
        for(const node of Object.values(scene.entities))expect(node.anchor).toBe(layout.state.anchors[node.id])
        from=to
      }
    }),{numRuns:100,endOnFailure:true})
  },60000)
  it('Property 27: opaque event identity remains evidence and append never exposes future entities (100 runs)', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 100000 }), seed => {
      const trace = generated(seed), layout = createLayoutEngine(); layout.append(trace.events)
      const projector = createSceneProjector(trace), cursor = Math.floor(trace.events.length / 2)
      const scene = projector.project(seek(trace, cursor), layout.state, context(trace))
      const accepted = new Set(trace.events.slice(0, cursor).map(e => e.eventId))
      for (const node of Object.values(scene.entities)) for (const id of node.evidence.eventIds) expect(accepted.has(id)).toBe(true)
      const full = projector.project(seek(trace, trace.events.length), layout.state, context(trace))
      for (const id of Object.keys(scene.entities)) expect(full.entities[id].anchor).toBe(scene.entities[id].anchor)
      const stopped = projector.project(seek(trace, trace.events.length), layout.state, { ...context(trace), liveHead: cursor })
      expect(stopped.cursor).toBe(cursor)
      expect(comparable(stopped)).toEqual(comparable(projector.project(seek(trace, cursor), layout.state, { ...context(trace), liveHead: cursor })))
    }), { numRuns: 100 })
  })
})

it('keeps duplicate and distinct reference targets fresh as bindings are removed, restored and rewound',()=>{
const events:TraceEvent[]=[
 {type:'PROGRAM_START'},
 {type:'ENTER_METHOD',frameId:'main',callerFrameId:null,className:'Main',methodName:'main',locals:['a','b','c'].map(id=>({id,name:id,javaType:'String',role:'parameter',value:{kind:'null'}}))},
 {type:'ALLOCATE_OBJECT',objectId:'A',displayId:1,className:'java.lang.String',fields:[]},
 {type:'OBJECT_OBSERVE',objectId:'A',string:{value:'A0',length:2,truncated:false}},
 {type:'ALLOCATE_OBJECT',objectId:'B',displayId:2,className:'java.lang.String',fields:[]},
 {type:'OBJECT_OBSERVE',objectId:'B',string:{value:'B0',length:2,truncated:false}},
 ...(['a','b','c'] as const).map(id=>({type:'CREATE_REFERENCE',sourceSlot:{kind:'frame',frameId:'main',slotId:id},targetObjectId:id==='c'?'B':'A',javaType:'String'})),
 {type:'OBJECT_OBSERVE',objectId:'A',string:{value:'A1',length:2,truncated:false}},
 {type:'CLEAR_REFERENCE',sourceSlot:{kind:'frame',frameId:'main',slotId:'a'}},
 {type:'OBJECT_OBSERVE',objectId:'A',string:{value:'A2',length:2,truncated:false}},
 {type:'CLEAR_REFERENCE',sourceSlot:{kind:'frame',frameId:'main',slotId:'b'}},
 {type:'OBJECT_OBSERVE',objectId:'A',string:{value:'A3',length:2,truncated:false}},
 {type:'CLEAR_REFERENCE',sourceSlot:{kind:'frame',frameId:'main',slotId:'c'}},
 {type:'OBJECT_OBSERVE',objectId:'B',string:{value:'B1',length:2,truncated:false}},
 ...(['a','b','c'] as const).map(id=>({type:'CREATE_REFERENCE',sourceSlot:{kind:'frame',frameId:'main',slotId:id},targetObjectId:id==='c'?'A':'B',javaType:'String'})),
 {type:'OBJECT_OBSERVE',objectId:'B',string:{value:'B2',length:2,truncated:false}},
 {type:'CLEAR_REFERENCE',sourceSlot:{kind:'frame',frameId:'main',slotId:'a'}},
 {type:'OBJECT_OBSERVE',objectId:'B',string:{value:'B3',length:2,truncated:false}},
 {type:'CLEAR_REFERENCE',sourceSlot:{kind:'frame',frameId:'main',slotId:'b'}},
 {type:'OBJECT_OBSERVE',objectId:'B',string:{value:'B4',length:2,truncated:false}},
 {type:'OBJECT_OBSERVE',objectId:'A',string:{value:'A4',length:2,truncated:false}},
 {type:'CLEAR_REFERENCE',sourceSlot:{kind:'frame',frameId:'main',slotId:'c'}},
 {type:'OBJECT_OBSERVE',objectId:'A',string:{value:'A5',length:2,truncated:false}},
 {type:'EXIT_METHOD',frameId:'main'},
 {type:'PROGRAM_END'},
].map((event,seq)=>({...event,seq,eventId:`opaque/dependency/${seq}`,source:{fileId:'Main.java',line:1},label:'Captured statement',importance:'quiet'} as TraceEvent))
const trace:TraceDocument={schemaVersion:2,demoId:'dependency-rebinding',sourceFiles:[{fileId:'Main.java',name:'Main.java',content:'class Main {}'}],events}
 const layout=createLayoutEngine();layout.append(events)
 const projector=createSceneProjector(trace),reconstructed=createSceneProjector(trace)
 let previous=0,first:SceneModel|undefined
 for(let cursor=0;cursor<=events.length;cursor++){
  const scene=projector.advance(seek(trace,cursor),layout.state,events,previous,cursor,context(trace));previous=cursor
  expect(comparable(scene)).toEqual(comparable(reconstructed.project(seek(trace,cursor),layout.state,context(trace))))
  const frame=scene.entities.main
  if(frame?.kind!=='frame')continue
  const exact=(id:string)=>frame.rows.find(row=>row.slotId===id)!.value.exact
  if(cursor===10){first=scene;expect(exact('a')).toContain('A1');expect(exact('b')).toContain('A1')}
  if(cursor===12)expect(exact('b')).toContain('A2')
  if(cursor===20){expect(exact('a')).toContain('B2');expect(exact('b')).toContain('B2')}
  if(cursor===22)expect(exact('b')).toContain('B3')
  if(cursor===25)expect(exact('c')).toContain('A4')
 }
 for(const cursor of[10,22,0,25,events.length,12]){const scene=projector.advance(seek(trace,cursor),layout.state,events,previous,cursor,context(trace));previous=cursor;expect(comparable(scene)).toEqual(comparable(reconstructed.project(seek(trace,cursor),layout.state,context(trace))))}
 const original=first!.entities.main;if(original.kind!=='frame')throw new Error('Missing captured frame')
 expect(original.rows.find(row=>row.slotId==='b')!.value.exact).toContain('A1')
})
