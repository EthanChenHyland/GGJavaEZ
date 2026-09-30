import { describe, expect, it, vi } from 'vitest'
import type { RuntimeState, TraceDocument, TraceEvent, TraceEventBase } from '../contracts/runtime'
import { applyEvent, createInitialState } from './state'
import { loadArrayTrace, loadControlTrace, loadPersonTrace, loadRecursionTrace } from './trace'
import { seek } from './seek'

// Count work without retaining every intermediate RuntimeState in a mock log.
const reducerWork = vi.hoisted(() => ({ calls: 0 }))
vi.mock(import('./state'), async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, applyEvent: (...args: Parameters<typeof actual.applyEvent>) => {
    reducerWork.calls++
    return actual.applyEvent(...args)
  } }
})

const int = (value: number) => ({ kind: 'primitive' as const, javaType: 'int' as const, value })
type EventPayload = {
  [Type in TraceEvent['type']]: Omit<Extract<TraceEvent, { type: Type }>, keyof TraceEventBase>
}[TraceEvent['type']]
type CacheStorage = { interval: number; snapshots: { cursor: number; state: RuntimeState }[]; recent: RuntimeState | null }

function captureCache(trace: TraceDocument): CacheStorage {
  // Inspect storage without exporting mutable cache state or a test-only API.
  const registration = vi.spyOn(WeakMap.prototype, 'set')
  try {
    seek(trace, 0)
    return registration.mock.calls.find(([key]) => key === trace)![1]
  } finally { registration.mockRestore() }
}

function stressTrace(): TraceDocument {
  const events: TraceEvent[] = []
  const emit = (event: EventPayload) => {
    const seq = events.length
    events.push({ eventId: `event:${seq}`, seq, source: null, label: 'Stress event', importance: 'normal', ...event } as TraceEvent)
  }
  emit({ type: 'PROGRAM_START' })
  emit({ type: 'ENTER_METHOD', frameId: 'main', callerFrameId: null, className: 'Main', methodName: 'main',
    locals: [{ id: 'result', name: 'result', javaType: 'int', value: int(0) }] })
  for (let index = 0; index < 128; index++) emit({ type: 'ALLOCATE_OBJECT', objectId: `object:${index}`,
    displayId: index + 1, className: 'Node', fields: [{ id: `field:${index}`, name: 'value', javaType: 'int', value: int(0) }] })
  for (let index = 0; index < 1755; index++) {
    const frameId = `call:${index}`
    emit({ type: 'ENTER_METHOD', frameId, callerFrameId: 'main', className: 'Worker', methodName: 'evaluate', returnType: 'int',
      locals: [{ id: `local:${index}`, name: 'input', javaType: 'int', value: int(index) }] })
    emit({ type: 'LINE_EXECUTE', frameId })
    emit({ type: 'ASSIGN_LOCAL', frameId, slotId: `local:${index}`, value: int(index + 1) })
    emit({ type: 'SET_FIELD', objectId: `object:${index % 128}`, slotId: `field:${index % 128}`, value: int(index + 1) })
    emit({ type: 'LINE_EXECUTE', frameId })
    emit({ type: 'RETURN_VALUE', frameId, value: int(index + 1), destination: { frameId: 'main', slotId: 'result' } })
    emit({ type: 'EXIT_METHOD', frameId })
  }
  while (events.length < 12606) emit({ type: 'SET_FIELD', objectId: 'object:0', slotId: 'field:0', value: int(events.length) })
  emit({ type: 'EXIT_METHOD', frameId: 'main' })
  emit({ type: 'PROGRAM_END' })
  return { schemaVersion: 2, demoId: 'seek-stress', sourceFiles: [], events }
}

describe('bounded seek checkpoints', () => {
  it.each([
    ['Person', loadPersonTrace], ['recursion', loadRecursionTrace],
    ['arrays', loadArrayTrace], ['scope and console', loadControlTrace],
  ] as const)('matches pure reduction at every cursor in arbitrary order: %s', (_, load) => {
    const trace = load()
    const states = [createInitialState()]
    for (const event of trace.events) states.push(applyEvent(states.at(-1)!, event))
    const cursors = states.map((_, cursor) => cursor)
    // Mix distant seeks before testing complete forward/backward replay.
    for (const cursor of [Math.floor(trace.events.length / 2), 8, trace.events.length,
      ...cursors, ...[...cursors].reverse()]) expect(seek(trace, cursor)).toEqual(states[cursor])
  })

  it('bounds a 12,608-event / 1,756-frame cache and replays exact large snapshots', () => {
    const trace = stressTrace()
    expect(trace.events).toHaveLength(12608)
    const cursors = [0, 1, 8, 129, 130, 131, 203, 204, 205, 409, 2048, 6304, 10001, 12606, 12607, 12608]
    const wanted = new Set(cursors)
    const expected = new Map<number, RuntimeState>([[0, createInitialState()]])
    let state = createInitialState()
    for (const event of trace.events) {
      state = applyEvent(state, event)
      if (wanted.has(state.cursor)) expected.set(state.cursor, state)
    }
    expect(Object.keys(state.frames)).toHaveLength(1756)

    const cache = captureCache(trace)
    const assertBound = () => expect(cache.snapshots.length + Number(cache.recent !== null)).toBeLessThanOrEqual(64)

    reducerWork.calls = 0
    expect(seek(trace, trace.events.length)).toEqual(expected.get(trace.events.length))
    expect(reducerWork.calls).toBe(trace.events.length)
    assertBound()
    expect(cache.snapshots.length).toBeGreaterThan(1)
    for (const cursor of [6304, 205, 10001, 8, 12607, 130, 2048, ...[...cursors].reverse()]) {
      reducerWork.calls = 0
      expect(seek(trace, cursor)).toEqual(expected.get(cursor))
      expect(reducerWork.calls).toBeLessThan(cache.interval)
      assertBound()
    }
    // Cursor 205 is not periodic: its rolling snapshot must accelerate cursor 206.
    const at205 = seek(trace, 205)
    const at206 = applyEvent(at205, trace.events[205])
    reducerWork.calls = 0
    expect(seek(trace, 206)).toEqual(at206)
    expect(reducerWork.calls).toBe(1)
    assertBound()

    const mutable = seek(trace, 12607)
    mutable.frames.main.locals.result.value = int(-1)
    mutable.frames['call:0'].locals['local:0'].name = 'changed'
    mutable.objects['object:0'].fields['field:0'].value = int(-1)
    mutable.returns[0].destination!.slotId = 'changed'
    mutable.returns[0].value = int(-1)
    mutable.activeFrameIds.push('changed')
    expect(seek(trace, 12607)).toEqual(expected.get(12607))
    expect(seek(trace, 12608)).toEqual(expected.get(12608))
    expect(seek(trace, 204)).toEqual(expected.get(204))
    assertBound()
  })

  it('includes cursor zero and the rolling snapshot in the exact 64-snapshot limit', () => {
    const trace = stressTrace()
    const complete = trace.events
    trace.events = complete.slice(0, 496)
    const cache = captureCache(trace)
    seek(trace, 496)
    expect(cache.snapshots).toHaveLength(63)
    seek(trace, 495)
    expect(cache.snapshots.length + Number(cache.recent !== null)).toBe(64)
    seek(trace, 494)
    expect(cache.snapshots.length + Number(cache.recent !== null)).toBe(64)
    const at496 = seek(trace, 496)
    trace.events = complete.slice(0, 512)
    const expected = trace.events.slice(496).reduce(applyEvent, at496)
    expect(seek(trace, 512)).toEqual(expected)
    expect(seek(trace, 496)).toEqual(at496)
  })

  it('isolates traces and resets spacing when the same trace grows or shrinks', () => {
    const trace = loadPersonTrace()
    const other = loadPersonTrace()
    const original = [...trace.events]
    const final = seek(trace, original.length)
    trace.events = original.slice(0, 9)
    expect(seek(trace, 9)).toEqual(seek({ ...other, events: other.events.slice(0, 9) }, 9))
    expect(seek(other, original.length)).toEqual(final)
    trace.events = original
    expect(seek(trace, original.length)).toEqual(final)
    const copy = seek(trace, 0)
    copy.status = 'aborted'
    expect(seek(trace, 0)).toEqual(createInitialState())
  })

  it.each([-1, 0.5, NaN, Infinity, 1000])('rejects an invalid cursor: %s', (cursor) => {
    expect(() => seek(loadPersonTrace(), cursor)).toThrow(RangeError)
  })
})
