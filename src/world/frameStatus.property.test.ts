import fc from 'fast-check'
import { expect, it } from 'vitest'
import type { RuntimeFrame, RuntimeState, TraceDocument, TraceEvent } from '../contracts/runtime'
import type { FrameStatus } from '../contracts/world'
import type { RawRuntimeEvent } from '../instrumentation/contracts'
import { normalizeTrace } from '../instrumentation/normalize'
import { applyEvent, createInitialState } from '../runtime/state'
import { validateTrace } from '../runtime/trace'
import { generateRawTrace } from '../testing/traceGen'
import { frameStatus } from './frameStatus'

function recording(seed: number, mode: 'normal' | 'caught' | 'uncaught' | 'partial'): TraceDocument {
  const generated = generateRawTrace({ rawEvents: 12 + seed % 15, seed: seed + 1, maxDepth: 3, classes: 1, linesPerFile: 200 })
  if (mode === 'normal') return normalizeTrace(generated.rawEvents, generated.manifest, { status: 'complete', exitCode: 0, diagnostic: null }).trace
  const items: Record<string, unknown>[] = [
    { type: 'enter', frameId: 'a', methodName: 'main', callerFrameId: null, receiver: null, parameters: [] },
    { type: 'line', frameId: 'a' },
  ]
  if (mode !== 'partial') {
    items.push({ type: 'enter', frameId: 'b', methodName: 'work', callerFrameId: 'a', receiver: null, parameters: [] },
      { type: 'throw', frameId: 'b', objectId: 'ex', className: `gen.Failure${seed}`, message: null, explicit: true },
      { type: 'unwind', frameId: 'b', objectId: 'ex' })
    if (mode === 'caught') items.push({ type: 'catch', frameId: 'a', objectId: 'ex' }, { type: 'line', frameId: 'a' }, { type: 'exit', frameId: 'a' })
    else items.push({ type: 'unwind', frameId: 'a', objectId: 'ex' })
  }
  const raw = items.map((item, seq) => ({ v: 1, seq, threadId: '1', className: 'gen.G0', methodName: 'main',
    descriptor: '()V', line: 1 + (seed + seq) % 200, site: seq, ...item })) as RawRuntimeEvent[]
  return normalizeTrace(raw, generated.manifest, {
    status: mode === 'uncaught' ? 'program_crashed' : mode === 'partial' ? 'live' : 'complete',
    exitCode: mode === 'uncaught' ? 1 : mode === 'partial' ? null : 0, diagnostic: null,
    ...(mode === 'partial' ? { recording: { state: 'STOPPED_LIMIT' as const, reason: 'Event budget', budget: 'events' as const,
      lastRecordedSeq: raw.length - 1, executionContinued: true } } : {}),
  }).trace
}

/** Independent semantic oracle; no production formatting/status helper participates. */
function expectedKind(frame: RuntimeFrame, state: RuntimeState, event: TraceEvent | undefined, ended: boolean, paused: boolean, liveHead: number): FrameStatus['kind'] {
  if (event && ['RETURN_VALUE', 'EXIT_METHOD'].includes(event.type) && 'frameId' in event && event.frameId === frame.id) return 'returning'
  if (event?.type === 'EXECUTION_FACT' && 'invocationId' in event.fact && event.fact.invocationId === frame.id) {
    if (event.fact.kind === 'return' || event.fact.kind === 'exit') return 'returning'
    if (event.fact.kind === 'throw') return 'threw'
    if (event.fact.kind === 'catch') return 'caught'
    if (event.fact.kind === 'unwind') {
      const exceptionId = event.fact.exceptionId
      const origin = state.exceptions.find((exception) => exception.exceptionId === exceptionId)?.frameIds.at(-1)
      return origin === frame.id ? 'threw' : 'unwound'
    }
  }
  for (const exception of [...state.exceptions].reverse()) {
    if (event?.type === 'CATCH_EXCEPTION' && event.frameId === frame.id && event.exceptionId === exception.exceptionId) return 'caught'
    const origin = exception.frameIds.at(-1) === frame.id
    if (exception.unwoundFrameIds.includes(frame.id)) return origin ? 'threw' : 'unwound'
    if (origin && !exception.caughtBy) return 'threw'
  }
  if (frame.status === 'returned' || frame.returnValue !== undefined || state.returns.some((returned) => returned.frameId === frame.id)) return 'returned'
  if (frame.status === 'unwound') return 'unwound'
  if (ended && state.cursor === liveHead) return 'terminated'
  if (paused && state.cursor === liveHead && state.activeFrameIds.includes(frame.id)) return 'paused'
  return 'running'
}

it('Property 28: each normalized prefix has one correct status and only invocation-specific recorded lines (100 runs)', () => {
  fc.assert(fc.property(fc.nat(100_000), fc.constantFrom('normal' as const, 'caught' as const, 'uncaught' as const, 'partial' as const), fc.boolean(), fc.boolean(), (seed, mode, paused, atLive) => {
    const trace = validateTrace(recording(seed, mode))
    let state = createInitialState()
    let checked = 0
    for (const event of trace.events) {
      state = applyEvent(state, event)
      const ended = mode !== 'partial' && state.cursor === trace.events.length
      const liveHead = atLive && !ended ? state.cursor : trace.events.length
      for (const frame of Object.values(state.frames)) {
        const actual = frameStatus({ frame, state, cursorEvent: event, events: trace.events, context: { sessionEnded: ended, pausedAtLiveHead: paused, liveHead } })
        expect(actual.kind).toBe(expectedKind(frame, state, event, ended, paused, liveHead))
        expect(Object.keys(actual).filter((key) => key === 'kind')).toHaveLength(1)
        if ('line' in actual) {
          const prefix = trace.events.slice(0, state.cursor)
          const lines = prefix.filter((item) => item.source && ('frameId' in item ? item.frameId === frame.id : item.type === 'EXECUTION_FACT' && item.fact.context.frameId === frame.id))
          expect(actual.line).toBe(lines.at(-1)?.source?.line ?? null)
        }
        if ('exception' in actual) {
          const evidence = [...state.exceptions].reverse().find((exception) => exception.frameIds.includes(frame.id))
          if (evidence) expect(actual.exception).toBe(evidence.className.slice(evidence.className.lastIndexOf('.') + 1))
        }
        expect(frameStatus({ frame, state, cursorEvent: event, events: trace.events, context: { sessionEnded: ended, pausedAtLiveHead: paused, liveHead } })).toEqual(actual)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
    // Process termination is independent of an observer's stopped recording.
    if (mode === 'partial') {
      const frame = Object.values(state.frames)[0]
      expect(frameStatus({ frame, state, cursorEvent: trace.events.at(-1)!, events: trace.events,
        context: { sessionEnded: false, pausedAtLiveHead: false, liveHead: state.cursor } }).kind).toBe('running')
      expect(frameStatus({ frame, state, cursorEvent: trace.events.at(-1)!, events: trace.events,
        context: { sessionEnded: true, pausedAtLiveHead: false, liveHead: state.cursor } }).kind).toBe('terminated')
    }
  }), { numRuns: 100 })
})
