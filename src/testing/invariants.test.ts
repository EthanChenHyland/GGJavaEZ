import { describe, expect, it } from 'vitest'
import type { RuntimeState, TraceDocument } from '../contracts/runtime'
import { loadArrayTrace, loadControlTrace, loadPersonTrace, loadRecursionTrace } from '../examples/traces'
import { normalizeTrace } from '../instrumentation/normalize'
import { deriveSemanticTransition, transitionsForTrace } from '../motion/semanticTransition'
import { applyEvent, createInitialState, seek, validateTrace } from '../runtime'
import { createQualityStore } from '../render/quality/qualityStore'
import { projectTrace } from './projectTrace'
import { generateRawTrace } from './traceGen'

/**
 * Spec task 0.8: invariant tests that already hold today. Coverage index (design §1):
 *   INV-1  one session / one JVM / never rerun ... server/execution-manager.test.mjs (lines 71, 126, 155)
 *   INV-3  RuntimeState is semantic truth only ...... here
 *   INV-4  state is a pure function of events ...... here (applyEvent fold == seek)
 *   INV-5  deterministic arbitrary scrub ........... here (random seek paths) + src/runtime/seek.test.ts
 *   INV-6  stable identities ....................... here
 *   INV-7  append-only anchors ..................... src/world/layoutEngine.test.ts + tests/golden/layoutEngineGolden.test.mjs
 *   INV-8  no provenance/name switch ............... lint (eslint/visual-java-rules.js) + acceptance invariance harness
 *   INV-10 history retained in place ............... here
 *   INV-12 user camera input wins .................. src/navigation/arrayNavigation.test.ts:189, e2e/unified-m10 orbit
 *   INV-14 motion is presentation; fresh quality .... here
 *   INV-15 generic ↛ examples imports .............. tests/guardrails/eslintGuardrails.test.mjs
 *   INV-2/9/11/13/16/17 are not true today; characterized in tests/characterization or targeted by phase.
 */
const capture = { origin: 'jvm' as const, sourceHashes: {}, recordedAt: '1970-01-01T00:00:00.000Z' }
function generated(rawEvents: number, seed: number): TraceDocument {
  const { rawEvents: raw, manifest } = generateRawTrace({ rawEvents, seed })
  const result = normalizeTrace(raw, manifest, { status: 'complete', exitCode: 0, diagnostic: null }, `generated:${seed}:${rawEvents}`)
  if (result.capability.diagnostics.length) throw new Error(`Generated trace failed normalization: ${result.capability.diagnostics[0]}`)
  const trace = validateTrace(result.trace)
  return { ...trace, capture }
}
const corpus = (): Array<[string, TraceDocument]> => [
  ['person', loadPersonTrace()], ['recursion', loadRecursionTrace()], ['arrays', loadArrayTrace()], ['control', loadControlTrace()],
  ['generated-a', generated(1500, 3)], ['generated-b', generated(2500, 11)],
]
function mulberry(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

describe('synthetic generator', () => {
  it('produces valid, complete, deterministic traces with no fixture names', () => {
    const a = generateRawTrace({ rawEvents: 3000, seed: 5 }), b = generateRawTrace({ rawEvents: 3000, seed: 5 })
    expect(a.rawEvents).toEqual(b.rawEvents)
    const trace = generated(3000, 5)
    expect(trace.events.at(-1)?.type).toBe('PROGRAM_END')
    expect(trace.events.length).toBeGreaterThan(3000)
    for (const seed of [1, 42, 99]) expect(generated(8000, seed).events.at(-1)?.type).toBe('PROGRAM_END')
    expect(JSON.stringify(a.rawEvents)).not.toMatch(/Person|factorial|bubble|swap/)
  })
})

describe('INV-3 RuntimeState holds semantic truth only', () => {
  const forbidden = /^(position|anchor|anchors|camera|pose|animation|motion|selection|selected|lod|detailLevel|ports|bounds|visible|opacity)$/i
  const walk = (value: unknown, path: string[], found: string[]) => {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.test(key)) found.push([...path, key].join('.'))
      walk(child, [...path, key], found)
    }
  }
  it.each(corpus())('%s: no presentation keys at any sampled cursor', (_name, trace) => {
    const found: string[] = []
    for (let cursor = 0; cursor <= trace.events.length; cursor += Math.max(1, Math.floor(trace.events.length / 17))) walk(seek(trace, cursor), [], found)
    walk(seek(trace, trace.events.length), [], found)
    expect(found).toEqual([])
  })
})

describe('INV-4/INV-5 pure, deterministic arbitrary scrub', () => {
  it.each(corpus())('%s: random seek paths equal a fresh left fold', (_name, trace) => {
    const fold: RuntimeState[] = [createInitialState()]
    for (const event of trace.events) fold.push(applyEvent(fold.at(-1)!, event))
    const random = mulberry(trace.events.length)
    for (let i = 0; i < 120; i++) {
      const cursor = Math.floor(random() * (trace.events.length + 1))
      expect(seek(trace, cursor)).toEqual(fold[cursor])
    }
    // An independent copy of the same trace (cold cache) agrees too.
    const copy = structuredClone(trace)
    expect(seek(copy, trace.events.length)).toEqual(fold.at(-1))
  })
})

describe('INV-6 stable runtime identities', () => {
  it.each(corpus())('%s: entities never change identity, class or display id once they exist', (_name, trace) => {
    const seen = new Map<string, string>()
    for (let cursor = 0; cursor <= trace.events.length; cursor++) {
      const state = seek(trace, cursor)
      for (const object of Object.values(state.objects)) {
        const key = `${object.className}#${object.displayId}@${object.allocatedAt}`
        expect(seen.get(object.id) ?? key).toBe(key); seen.set(object.id, key)
      }
      for (const frame of Object.values(state.frames)) {
        const key = `${frame.className}.${frame.methodName}<-${frame.callerFrameId}@${frame.enteredAt}`
        expect(seen.get(frame.id) ?? key).toBe(key); seen.set(frame.id, key)
      }
    }
  })
})

describe('INV-10 history is retained in place', () => {
  it.each(corpus().filter(([, trace]) => trace.capture))('%s: invocations never disappear or move, and completion only changes status', (_name, trace) => {
    const projection = projectTrace(trace)
    let previous = new Map<string, string>()
    for (let cursor = 0; cursor <= trace.events.length; cursor += 3) {
      const scene = projection.project(cursor)
      const now = new Map(scene.order.frames.map(id => [id, JSON.stringify(scene.entities[id].anchor.position)]))
      for (const [id, position] of previous) expect(now.get(id), `frame ${id} at cursor ${cursor}`).toBe(position)
      previous = now
    }
    const final = projection.project(trace.events.length)
    expect(final.order.frames.length).toBe(Object.keys(seek(trace, trace.events.length).frames).length)
    expect(final.order.frames.every(id => final.entities[id].kind === 'frame' && !final.entities[id].live)).toBe(true)
  })
})

describe('INV-14 motion is presentation only', () => {
  it.each(corpus())('%s: deriving every transition never mutates or alters runtime state', (_name, trace) => {
    const before = seek(trace, trace.events.length)
    const frozen = (state: RuntimeState) => JSON.stringify(state)
    let state = createInitialState()
    for (const event of trace.events) {
      const next = applyEvent(state, event)
      const snapshot = [frozen(state), frozen(next)]
      deriveSemanticTransition(state, event, next)
      expect([frozen(state), frozen(next)]).toEqual(snapshot)
      state = next
    }
    transitionsForTrace(trace)
    expect(seek(trace, trace.events.length)).toEqual(before)
  })
  it('fresh rendering is Interactive with motion enabled, and quality changes preserve the motion preference', async () => {
    const quality = createQualityStore()
    expect(quality.getState()).toMatchObject({ setting: 'INTERACTIVE', active: 'INTERACTIVE', reducedMotion: { os: false, inApp: false } })
    quality.getState().setReducedMotion(true)
    await quality.getState().selectQuality('INTERACTIVE')
    expect(quality.getState().reducedMotion).toEqual({ os: false, inApp: true })
  })
})
