import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { loadPersonTrace } from '../examples/traces'
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
