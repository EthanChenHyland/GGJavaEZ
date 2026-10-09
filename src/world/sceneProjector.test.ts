import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { loadPersonTrace } from '../examples/traces'
import { normalizeTrace } from '../instrumentation/normalize'
import { createReductionEngine } from '../runtime/engine'
import { seek } from '../runtime'
import { generateRawTrace } from '../testing/traceGen'
import type { SceneModel } from '../contracts/worldV2'
import type { TraceDocument } from '../contracts/runtime'
import { createLayoutEngine } from './layoutEngine'
import { createSceneProjector, type ProjectionContext } from './sceneProjector'

function context(trace: TraceDocument): ProjectionContext {
  return { sessionEnded: false, pausedAtLiveHead: false, liveHead: trace.events.length,
    recording: { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false } }
}
function comparable(scene: SceneModel) { const { revision, ...semantic } = scene; void revision; return semantic }
function generated(seed: number) {
  const raw = generateRawTrace({ seed, rawEvents: 20, classes: 2, maxDepth: 3, callRate: .3, allocateRate: .7, provenance: seed % 2 === 0 })
  const trace=normalizeTrace(raw.rawEvents, raw.manifest, { status: 'complete', exitCode: 0, diagnostic: null }).trace
  return{...trace,events:trace.events.map((event,index)=>({...event,eventId:`opaque/${seed}/record-${index.toString(36)}`}))}
}

describe('complete prefix scene catalog', () => {
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
