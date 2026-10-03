import { describe, expect, it } from 'vitest'
import type { RuntimeState, TraceDocument, TraceEvent, TraceEventBase } from '../contracts/runtime'
import { applyEvent, createInitialState } from './state'
import { loadArrayTrace, loadControlTrace, loadPersonTrace, loadRecursionTrace } from '../examples/traces'
import { seek } from './seek'

import { ExecutionHistory, historyForTrace } from './history'

const int = (value: number) => ({ kind: 'primitive' as const, javaType: 'int' as const, value })
type EventPayload = {
  [Type in TraceEvent['type']]: Omit<Extract<TraceEvent, { type: Type }>, keyof TraceEventBase>
}[TraceEvent['type']]
function stressTrace(): TraceDocument {
  const events: TraceEvent[] = []
  const emit = (event: EventPayload) => {
    const seq = events.length
    events.push({ eventId: `event:${seq}`, seq, source: event.type === 'LINE_EXECUTE' ? { fileId: 'stress.java', line: 1 } : null, label: 'Stress event', importance: 'normal', ...event } as TraceEvent)
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
  return { schemaVersion: 2, demoId: 'seek-stress', sourceFiles: [{ fileId: 'stress.java', name: 'stress.java', content: '// stress' }], events }
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

    const cache = historyForTrace(trace)
    const assertBound = () => expect(cache.stats.retainedStateRoots).toBeLessThanOrEqual(256)

    const beforeWork = cache.stats.replayedEvents
    expect(seek(trace, trace.events.length)).toEqual(expected.get(trace.events.length))
    expect(cache.stats.replayedEvents - beforeWork).toBe(0)
    assertBound()
    expect(cache.stats.checkpointCount).toBeGreaterThan(1)
    for (const cursor of [6304, 205, 10001, 8, 12607, 130, 2048, ...[...cursors].reverse()]) {
      const beforeWork = cache.stats.replayedEvents
      expect(seek(trace, cursor)).toEqual(expected.get(cursor))
      expect(cache.stats.replayedEvents - beforeWork).toBeLessThan(cache.stats.checkpointInterval)
      assertBound()
    }
    // Cursor 205 is not periodic: its rolling snapshot must accelerate cursor 206.
    const at205 = seek(trace, 205)
    const at206 = applyEvent(at205, trace.events[205])
    const beforeSequential = cache.stats.replayedEvents
    expect(seek(trace, 206)).toEqual(at206)
    expect(cache.stats.replayedEvents - beforeSequential).toBe(1)
    assertBound()

    const mutable = seek(trace, 12607)
    expect(() => { mutable.frames.main.locals.result.value = int(-1) }).toThrow()
    expect(() => { mutable.frames['call:0'].locals['local:0'].name = 'changed' }).toThrow()
    expect(() => { mutable.objects['object:0'].fields['field:0'].value = int(-1) }).toThrow()
    expect(() => { mutable.returns[0].destination!.slotId = 'changed' }).toThrow()
    expect(() => { mutable.returns[0].value = int(-1) }).toThrow()
    expect(() => mutable.activeFrameIds.push('changed')).toThrow()
    expect(seek(trace, 12607)).toEqual(expected.get(12607))
    expect(seek(trace, 12608)).toEqual(expected.get(12608))
    expect(seek(trace, 204)).toEqual(expected.get(204))
    assertBound()
  })

  it('bounds roots while adapting spacing and keeps append checkpoints', () => {
    const trace = stressTrace()
    const history = new ExecutionHistory({ checkpointInterval: 8, maxCheckpoints: 64 })
    history.append(trace.events.slice(0, 496))
    const saved = history.materialize(495)
    expect(history.stats.retainedStateRoots).toBeLessThanOrEqual(64)
    history.append(trace.events.slice(496))
    expect(history.stats.checkpointInterval).toBeGreaterThan(8)
    expect(history.stats.retainedStateRoots).toBeLessThanOrEqual(64)
    expect(history.materialize(495)).toEqual(saved)
    expect(history.state).toEqual(trace.events.reduce(applyEvent, createInitialState()))
    history.dispose()
    expect(history.stats.retainedStateRoots).toBe(1)
    expect(() => history.materialize(0)).toThrow('disposed')
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
    expect(() => { copy.status = 'aborted' }).toThrow()
    expect(seek(trace, 0)).toEqual(createInitialState())
  })

  it.each([-1, 0.5, NaN, Infinity, 1000])('rejects an invalid cursor: %s', (cursor) => {
    expect(() => seek(loadPersonTrace(), cursor)).toThrow(RangeError)
  })
})
