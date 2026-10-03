import { describe, expect, it, vi } from 'vitest'
import type { TraceEvent } from '../contracts/runtime'
import { applyEvent, createInitialState } from '../runtime/state'
import { generateRawTrace } from '../testing/traceGen'
import type { RawRuntimeEvent, RecordingStatus } from './contracts'
import { normalizeTrace, TraceNormalizer, type InstrumentationSourceManifest, type NormalizationTerminal } from './normalize'

const manifest: InstrumentationSourceManifest = {
  sources: [{ fileId: 'G.java', name: 'G.java', content: '// 1\n// 2\n// 3', sha256: 'hash' }],
  classes: [{ className: 'G', sourceFile: 'G.java', fileId: 'G.java', sourceSha256: 'hash', status: 'resolved', candidates: [] }],
}
const complete: NormalizationTerminal = { status: 'complete', exitCode: 0, diagnostic: null }
const live: NormalizationTerminal = { status: 'live', exitCode: null, diagnostic: null }
const raw = (...items: Array<Record<string, unknown>>) => items.map((item, seq) => ({
  v: 1, seq, threadId: '1', frameId: 'a', className: 'G', methodName: 'main', descriptor: '()V', line: 1, site: seq, ...item,
})) as RawRuntimeEvent[]
const enter = { type: 'enter', callerFrameId: null, receiver: null, parameters: [] }
const local = { type: 'local', slot: 1, name: 'x', liveRange: 'x', descriptor: 'I', value: { kind: 'int', value: 2 } }
const stop = (seq: number | null, state: RecordingStatus['state'] = 'STOPPED_LIMIT'): RecordingStatus => ({
  state, reason: 'Observer stopped', budget: state === 'STOPPED_LIMIT' ? 'events' : null, lastRecordedSeq: seq, executionContinued: true,
})
type Fixture = { name: string; raw: RawRuntimeEvent[]; manifest: InstrumentationSourceManifest; terminal: NormalizationTerminal }
function fixtures(): Fixture[] {
  const cases: Array<[string, RawRuntimeEvent[], NormalizationTerminal?]> = [
    ['empty', []], ['empty-live', [], live], ['balanced', raw(enter, local, { type: 'exit' })],
    ['open-live', raw(enter, local), live], ['incomplete', raw(enter)],
    ['nonzero-complete', raw(enter, { type: 'exit' }), { ...complete, exitCode: 1 }],
    ...(['program_crashed', 'instrumentation_failed', 'limit_exceeded', 'unsupported'] as const).map(status =>
      [status, raw(enter, local), { status, exitCode: 1, diagnostic: 'Failure' }] as [string, RawRuntimeEvent[], NormalizationTerminal]),
    ['gap', raw(enter, { type: 'line', seq: 8 }, { type: 'exit' })],
    ['version', raw({ ...enter, v: 2 })], ['unknown', raw(enter, { type: 'mystery' })],
    ['invalid-descriptor', raw(enter, { ...local, descriptor: '?' })],
    ['bad-enter-after-emission', raw({ ...enter, parameters: [{ slot: 1, name: 'bad', liveRange: 'x', descriptor: '?' }] })],
    ['bad-array-read', raw(enter, { type: 'array', objectId: 'arr', elements: [3] }, { type: 'array_read', objectId: 'arr', index: 0, value: 8 })],
    ['mixed-threads', raw(enter, { type: 'line', threadId: '2' }, { type: 'exit' })],
    ['shutdown-console', raw(enter, { type: 'exit' }, { type: 'console', frameId: null, className: null, line: null, threadId: '2', channel: 'stderr', text: 'shutdown' })],
    ['references', raw(enter,
      { ...local, descriptor: 'LG;', value: { kind: 'ref', className: 'G', objectId: 'o' } },
      { type: 'object', objectId: 'o', fields: [{ owner: 'G', name: 'peer', descriptor: 'LG;', value: { kind: 'ref', className: 'G', objectId: 'p' } }] },
      { type: 'object', objectId: 'p', fields: [] },
      { ...local, descriptor: 'LG;', value: { kind: 'null' } }, { type: 'local_end', slot: 1, liveRange: 'x' }, { type: 'exit' })],
    ['unobserved-reference-update', raw(enter, { type: 'object', objectId: 'o', fields: [] },
      { ...local, descriptor: 'LG;', value: { kind: 'ref', className: 'G', objectId: 'o' } },
      { ...local, descriptor: 'LG;', value: { kind: 'ref', className: 'G', objectId: 'missing' } })],
    ['scalars', raw(enter, { ...local, descriptor: 'J', value: { kind: 'long', value: 1 } },
      { ...local, descriptor: 'J', value: { kind: 'long', value: 2 ** 54 } },
      { ...local, descriptor: 'J', value: { kind: 'unsupported', javaType: 'J' } }, { type: 'exit' })],
    ['arrays', raw(enter, { type: 'array', objectId: 'arr', elements: [3, 1] },
      { ...local, descriptor: '[I', value: { kind: 'ref', objectId: 'arr', className: '[I' } },
      { type: 'array_read', objectId: 'arr', index: 0, value: 3 },
      { type: 'branch', opcode: 163, left: { kind: 'int', value: 3 }, right: { kind: 'int', value: 1 }, taken: true },
      { type: 'array_write', objectId: 'arr', index: 0, value: 1 }, { type: 'exit' })],
    ['exceptions', raw(enter, { ...enter, frameId: 'b', callerFrameId: 'a' },
      { type: 'throw', frameId: 'b', objectId: 'ex', className: 'Failure', message: null, explicit: false },
      { type: 'finally', frameId: 'b', objectId: 'ex' },
      { type: 'throw', frameId: 'b', objectId: 'ex', className: 'Failure', message: null, explicit: true },
      { type: 'unwind', frameId: 'b', objectId: 'ex' }, { type: 'catch', objectId: 'ex' },
      { type: 'throw', objectId: 'ex', className: 'Failure', message: null, explicit: true },
      { type: 'catch', objectId: 'ex' }, { type: 'exit' })],
    ['returns', raw({ ...enter, descriptor: '()I' }, local,
      { type: 'return', value: { kind: 'int', value: 2 } }, { type: 'local_end', slot: 1, liveRange: 'x' }, { type: 'exit' })],
    ['unsupported-return', raw({ ...enter, descriptor: '()LG;' }, { type: 'return', value: { kind: 'ref', objectId: 'unseen', className: 'G' } }, { type: 'exit' })],
    ['console-input', raw(enter, { type: 'stdin_wait' }, { type: 'stdin_read', text: '42' }, { type: 'console', channel: 'stdout', text: 'done' }, { type: 'exit' })],
    ['source-unresolved', raw(enter, { type: 'line', line: 100 }, { type: 'line', className: 'Unknown' }, { type: 'exit' })],
    ['control-empty', raw({ type: 'capture_saturated', recording: stop(null) })],
    ['control-stop', raw(enter, local, { type: 'capture_saturated', threadId: 'control', recording: stop(1) }), live],
    ['control-bad-watermark', raw(enter, { type: 'capture_saturated', recording: stop(8) })],
    ['control-followed', raw(enter, { type: 'capture_saturated', recording: stop(0) }, { type: 'exit' })],
    ['control-followed-gap', raw(enter, { type: 'capture_saturated', recording: stop(0) }, { type: 'exit', seq: 100 })],
    ['sidecar-stop', raw(enter, local), { ...live, recording: stop(1) }],
    ['sidecar-error', raw(enter, local), { ...complete, recording: stop(1, 'STOPPED_ERROR') }],
    ['sidecar-bad-watermark', raw(enter), { ...complete, recording: stop(4) }],
  ]
  const result = cases.map(([name, events, terminal = complete]) => ({ name, raw: events, terminal, manifest }))
  for (const seed of [1, 7, 42]) {
    const generated = generateRawTrace({ rawEvents: 150, seed })
    result.push({ name: 'generated-' + seed, raw: generated.rawEvents, manifest: generated.manifest, terminal: complete })
  }
  const capability = normalizeTrace(raw(enter, { type: 'exit' }), manifest, complete).capability
  capability.diagnostics = ['provider', 'provider']
  capability.features.methods = { status: 'unsupported', reason: 'provider limitation', observedEvents: 0 }
  result.push({ name: 'provider-diagnostics', raw: raw(enter, { type: 'exit' }), manifest, terminal: { ...complete, capability } })
  return result
}

// Recorded at 14e2a17 before replacing the batch implementation. Hash the full JSON,
// including every event, label, diagnostic and capability counter.
it('preserves legacy batch output exactly', async () => {
  const hashes = await Promise.all(fixtures().map(async f => {
    const bytes = new TextEncoder().encode(JSON.stringify(normalizeTrace(f.raw, f.manifest, f.terminal)))
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return [f.name, Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')]
  }))
  expect(Object.fromEntries(hashes)).toMatchSnapshot()
})

describe('TraceNormalizer incremental boundary', () => {
  it.each(fixtures().filter(f => f.name !== 'provider-diagnostics'))('$name is invariant under every two-chunk partition', f => {
    const expected = normalizeTrace(f.raw, f.manifest, f.terminal)
    for (let cut = 0; cut <= f.raw.length; cut++) {
      const normalizer = new TraceNormalizer(f.manifest)
      const trace = normalizer.trace
      const storage = trace.events
      const deltas = [...normalizer.append(f.raw.slice(0, cut)), ...normalizer.append(f.raw.slice(cut))]
      const head = trace.events.length
      expect(deltas).toEqual(trace.events)
      const result = normalizer.finish(f.terminal)
      expect(result).toEqual(expected)
      expect(result.trace).toBe(trace)
      expect(result.trace.events).toBe(storage)
      expect([...deltas, ...storage.slice(head)]).toEqual(expected.trace.events)
      expect(normalizer.state).toEqual(expected.trace.events.reduce((state, event) => applyEvent(state, event), createInitialState()))
    }
  })

  it.each([1, 7, 42, 89, 312])('matches batch and reference state at sampled prefixes for seeded chunks %s', seed => {
    const generated = generateRawTrace({ rawEvents: 300, seed })
    const normalizer = new TraceNormalizer(generated.manifest, 'chunks')
    let cursor = 0
    let random = seed
    const deltas: TraceEvent[] = []
    while (cursor < generated.rawEvents.length) {
      random = (random * 1664525 + 1013904223) >>> 0
      const next = Math.min(generated.rawEvents.length, cursor + 1 + random % 23)
      const before = normalizer.trace.events.slice()
      const beforeState = normalizer.state
      const beforeJson = JSON.stringify(beforeState)
      const delta = normalizer.append(generated.rawEvents.slice(cursor, next))
      deltas.push(...delta)
      expect(delta).toEqual(normalizer.trace.events.slice(cursor === 0 ? 0 : before.length))
      before.forEach((event, i) => expect(normalizer.trace.events[i]).toBe(event))
      expect(JSON.stringify(beforeState)).toBe(beforeJson)
      expect(normalizer.snapshot(live)).toEqual(normalizeTrace(generated.rawEvents.slice(0, next), generated.manifest, live, 'chunks'))
      expect(normalizer.state).toEqual(normalizer.trace.events.reduce((state, event) => applyEvent(state, event), createInitialState()))
      cursor = next
    }
    const head = normalizer.trace.events.length
    expect(normalizer.finish(complete)).toEqual(normalizeTrace(generated.rawEvents, generated.manifest, complete, 'chunks'))
    expect([...deltas, ...normalizer.trace.events.slice(head)]).toEqual(normalizer.trace.events)
  })

  it('exposes start for initial root sync and returns it once from the first append', () => {
    const normalizer = new TraceNormalizer(manifest)
    const initial = normalizer.snapshot(live)
    expect(initial.trace.events.map(e => e.type)).toEqual(['PROGRAM_START'])
    expect(normalizer.state.status).toBe('running')
    const delta = normalizer.append(raw(enter))
    expect(delta[0]).toBe(initial.trace.events[0])
    expect(delta.filter(e => e.type === 'PROGRAM_START')).toHaveLength(1)
    expect(normalizer.append([])).toEqual([])
    expect(normalizer.snapshot(live).trace.events.filter(e => e.type === 'PROGRAM_START')).toHaveLength(1)
  })

  it('delivers start on an empty first append and never duplicates it on later batches', () => {
    const normalizer = new TraceNormalizer(manifest)
    expect(normalizer.append([]).map(e => e.type)).toEqual(['PROGRAM_START'])
    expect(normalizer.append(raw(enter)).map(e => e.type)).toEqual(['ENTER_METHOD'])
    expect(normalizer.append([])).toEqual([])
  })

  it('snapshots ahead-of-delivery completion and stop metadata without changing events or head', () => {
    const normalizer = new TraceNormalizer(manifest)
    const all = raw(enter, local, { type: 'exit' })
    normalizer.append(all.slice(0, 1))
    const head = normalizer.state
    const original = normalizer.trace.events.slice()
    const ahead = { ...live, recording: stop(1) }
    for (const metadata of [complete, ahead, { ...complete, recording: stop(1) }]) {
      const snapshot = normalizer.snapshot(metadata)
      expect(snapshot.trace.events).toEqual(original)
      expect(normalizer.state).toBe(head)
    }
    normalizer.append(all.slice(1))
    expect(normalizer.finish(complete)).toEqual(normalizeTrace(all, manifest, complete))
    expect(normalizer.state.status).toBe('ended')
  })

  it('defers a control terminal and rejects later input across an empty batch boundary', () => {
    const all = raw(enter, { type: 'capture_saturated', recording: stop(0) }, { type: 'exit' })
    const normalizer = new TraceNormalizer(manifest)
    normalizer.append(all.slice(0, 2))
    expect(normalizer.snapshot(live).trace.events.at(-1)?.type).toBe('ENTER_METHOD')
    expect(normalizer.append([])).toEqual([])
    expect(normalizer.append(all.slice(2))).toEqual([])
    expect(normalizer.finish(complete)).toEqual(normalizeTrace(all, manifest, complete))
    expect(normalizer.state.status).toBe('aborted')
    expect(normalizer.trace.events.some(e => e.type === 'CAPTURE_STOP')).toBe(false)
  })

  it.each(['STOPPED_LIMIT', 'STOPPED_UNSUPPORTED', 'STOPPED_ERROR'] as const)('finalizes %s once while Java continues and never fabricates an end at its later exit', state => {
    const all = raw(enter, local)
    const recording = stop(1, state)
    const normalizer = new TraceNormalizer(manifest)
    normalizer.append(all)
    const before = normalizer.state
    const finalized = normalizer.finish({ ...live, recording })
    expect(normalizer.state.status).toBe('partial')
    expect(normalizer.state.frames).toEqual(before.frames)
    const length = normalizer.trace.events.length
    expect(finalized).toEqual(normalizeTrace(all, manifest, { ...live, recording }))
    for (const terminal of [live, complete, { status: 'program_crashed' as const, exitCode: 1, diagnostic: 'later crash' }]) {
      expect(normalizer.finish({ ...terminal, recording })).toEqual(finalized)
      expect(normalizer.trace.events).toHaveLength(length)
      expect(normalizer.snapshot({ ...terminal, recording }).trace.events).toHaveLength(length)
    }
    expect(normalizer.append([])).toEqual([])
    expect(() => normalizer.append(raw({ type: 'exit', seq: 2 }))).toThrow('after normalization finished')
  })

  it.each(['complete', 'program_crashed', 'instrumentation_failed'] as const)('emits the %s tail only once', status => {
    const all = raw(enter, { type: 'exit' })
    const terminal = { status, exitCode: status === 'complete' ? 0 : 1, diagnostic: null }
    const normalizer = new TraceNormalizer(manifest)
    normalizer.append(all)
    const head = normalizer.trace.events.length
    const result = normalizer.finish(terminal)
    expect(result.trace.events).toHaveLength(head + 1)
    const json = JSON.stringify(result)
    expect(JSON.stringify(normalizer.finish(terminal))).toBe(json)
    expect(normalizer.snapshot(terminal).trace.events).toHaveLength(head + 1)
  })

  it('finish(live) remains open without emitting a premature program end', () => {
    const all = raw(enter, { type: 'exit' })
    const normalizer = new TraceNormalizer(manifest)
    normalizer.append(all.slice(0, 1))
    const head = normalizer.state
    expect(normalizer.finish(live).trace.events.at(-1)?.type).toBe('ENTER_METHOD')
    expect(normalizer.state).toBe(head)
    normalizer.append(all.slice(1))
    expect(normalizer.finish(complete).trace.events.at(-1)?.type).toBe('PROGRAM_END')
  })

  it('does not mutate previous capability snapshots when observations or provider metadata change', () => {
    const all = raw(enter, local, { type: 'exit' })
    const normalizer = new TraceNormalizer(manifest)
    const initial = normalizer.snapshot(live).capability
    const json = JSON.stringify(initial)
    normalizer.append(all.slice(0, 1))
    const provider = structuredClone(initial)
    provider.features.methods = { status: 'unsupported', reason: 'provider warning', observedEvents: 0 }
    const degraded = normalizer.snapshot({ ...live, capability: provider })
    expect(degraded.capability.features.methods.status).toBe('unsupported')
    expect(normalizer.snapshot(live).capability.features.methods.status).toBe('supported')
    normalizer.append(all.slice(1))
    expect(JSON.stringify(initial)).toBe(json)
    expect(normalizer.finish(complete).capability.features.locals.observedEvents).toBe(2)
  })

  it('bounds and deduplicates live diagnostics while the batch wrapper preserves legacy duplicates', () => {
    const all = raw(enter, { type: 'line', seq: 9 })
    const provider = normalizeTrace([], manifest, live).capability
    provider.diagnostics = Array.from({ length: 512 }, (_, i) => 'provider-' + Math.floor(i / 2))
    const terminal = { ...complete, capability: provider }
    const normalizer = new TraceNormalizer(manifest)
    normalizer.append(all)
    const result = normalizer.finish(terminal)
    expect(result.capability.diagnostics.length).toBeLessThanOrEqual(128)
    expect(new Set(result.capability.diagnostics).size).toBe(result.capability.diagnostics.length)
    expect(result.capability.diagnostics.at(-1)).toContain('Raw sequence gap')
    const again = normalizer.snapshot(terminal)
    expect(again.capability.diagnostics).toEqual(result.capability.diagnostics)
    const batch = normalizeTrace(all, manifest, terminal)
    expect(batch.capability.diagnostics.slice(0, provider.diagnostics.length)).toEqual(provider.diagnostics)
    expect(batch.capability.diagnostics.at(-1)).toContain('Raw sequence gap')
  })

  it('precomputes source line counts and copies only the newly emitted delta', () => {
    const normalizer = new TraceNormalizer(manifest)
    normalizer.append(raw(enter))
    const start = normalizer.trace.events.length
    const slice = vi.spyOn(normalizer.trace.events, 'slice')
    const split = vi.spyOn(String.prototype, 'split')
    try {
      const delta = normalizer.append(raw({ type: 'line', seq: 1 }, { type: 'exit', seq: 2 }))
      expect(slice.mock.calls).toEqual([[start]])
      expect(delta.map(e => e.type)).toEqual(['LINE_EXECUTE', 'EXIT_METHOD'])
      expect(split.mock.contexts).not.toContain(manifest.sources[0].content)
      normalizer.snapshot(live)
      normalizer.finish(complete)
      expect(slice.mock.calls).toEqual([[start]])
    } finally { slice.mockRestore(); split.mockRestore() }
  })
})
