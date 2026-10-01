import { describe, expect, it } from 'vitest'
import type { TraceDocument, TraceEvent } from '../contracts/runtime'
import { applyEvent, createInitialState, seek, validateTrace } from './index'
import { loadArrayTrace } from '../examples/traces'

const source = { fileId: 'src/Main.java', line: 1 }
type EventPayload = TraceEvent extends infer E ? E extends TraceEvent ? Omit<E, 'eventId' | 'seq' | 'source' | 'label' | 'importance'> : never : never
const event = (seq: number, value: EventPayload): TraceEvent => ({
  eventId: `real:${seq}`, seq, source, label: value.type, importance: 'normal', ...value,
} as TraceEvent)
const document = (events: TraceEvent[]): TraceDocument => ({
  schemaVersion: 2, demoId: 'real-test', sourceFiles: [{ fileId: source.fileId, name: 'Main.java', content: 'class Main {}' }], events,
})

describe('real trace schema v2', () => {
  it('reconstructs an observed array store without inventing its operand origin, then retains crash state', () => {
    const events = [
      event(0, { type: 'PROGRAM_START' }),
      event(1, { type: 'ENTER_METHOD', frameId: 'f1', callerFrameId: null, className: 'Main', methodName: 'main', locals: [] }),
      event(2, { type: 'ALLOCATE_ARRAY', objectId: 'a1', displayId: 1, elementType: 'int', elements: [{ kind: 'primitive', javaType: 'int', value: 0 }] }),
      event(3, { type: 'DECLARE_LOCAL', frameId: 'f1', slot: { id: 'f1:array', name: 'array', javaType: 'int[]', value: { kind: 'uninitialized' } } }),
      event(4, { type: 'CREATE_REFERENCE', sourceSlot: { kind: 'frame', frameId: 'f1', slotId: 'f1:array' }, targetObjectId: 'a1', javaType: 'int[]' }),
      event(5, { type: 'ARRAY_WRITE', frameId: 'f1', objectId: 'a1', index: 0, value: { kind: 'primitive', javaType: 'int', value: 5 } }),
      event(6, { type: 'BRANCH_EVALUATE', frameId: 'f1', opcode: 154, site: 3, left: { kind: 'primitive', javaType: 'int', value: 5 }, taken: true }),
      event(7, { type: 'THROW_EXCEPTION', frameId: 'f1', exceptionId: 'x1', className: 'java.lang.NullPointerException', message: null, explicit: false }),
      event(8, { type: 'PROGRAM_ABORT', reason: 'program_crashed', message: 'Uncaught NullPointerException' }),
    ]
    const trace = validateTrace(document(events))
    const sequential = [createInitialState()]
    for (const item of trace.events) sequential.push(applyEvent(sequential.at(-1)!, item))
    for (let cursor = events.length; cursor >= 0; cursor--) expect(seek(trace, cursor)).toEqual(sequential[cursor])
    const final = seek(trace, events.length)
    expect(final.status).toBe('aborted')
    expect(final.activeFrameIds).toEqual(['f1'])
    expect(final.objects.a1.array?.elements[0].value).toEqual({ kind: 'primitive', javaType: 'int', value: 5 })
    expect(final.arrayMutations[0].from).toBeUndefined()
    expect(final.exceptions[0]).toMatchObject({ exceptionId: 'x1', frameIds: ['f1'], explicit: false })
    expect(final.branch?.taken).toBe(true)
    expect(final.currentSource).toEqual(source)
  })

  it('retains a truthful scalar return when its caller destination is unknown', () => {
    const trace = validateTrace(document([
      event(0, { type: 'PROGRAM_START' }),
      event(1, { type: 'ENTER_METHOD', frameId: 'main', callerFrameId: null, className: 'Main', methodName: 'main', locals: [] }),
      event(2, { type: 'ENTER_METHOD', frameId: 'call', callerFrameId: 'main', className: 'Main', methodName: 'value', locals: [], returnType: 'int' }),
      event(3, { type: 'RETURN_VALUE', frameId: 'call', destination: null, value: { kind: 'primitive', javaType: 'int', value: 42 } }),
      event(4, { type: 'EXIT_METHOD', frameId: 'call' }),
      event(5, { type: 'EXIT_METHOD', frameId: 'main' }),
      event(6, { type: 'PROGRAM_END' }),
    ]))
    const state = seek(trace, trace.events.length)
    expect(state.status).toBe('ended')
    expect(state.returns[0]).toMatchObject({ frameId: 'call', destination: null, value: { value: 42 } })
    expect(state.frames.call.status).toBe('returned')
  })

  it('keeps authored v1 array origin validation strict', () => {
    const trace = loadArrayTrace()
    const changed = structuredClone(trace)
    const write = changed.events.find((item) => item.type === 'ARRAY_WRITE')
    if (!write || write.type !== 'ARRAY_WRITE') throw new Error('Missing authored array write')
    delete write.from
    expect(() => validateTrace(changed)).toThrow('Malformed event')
  })

  it('reconstructs finally, ordered console, catch and continuation at every reverse and shuffled cursor', () => {
    const trace = validateTrace(document([
      event(0, { type: 'PROGRAM_START' }),
      event(1, { type: 'ENTER_METHOD', frameId: 'main', callerFrameId: null, className: 'Main', methodName: 'main', locals: [] }),
      event(2, { type: 'ENTER_METHOD', frameId: 'call', callerFrameId: 'main', className: 'Main', methodName: 'fail', locals: [] }),
      event(3, { type: 'CONSOLE_WRITE', frameId: 'call', channel: 'stdout', text: 'start\n' }),
      event(4, { type: 'THROW_EXCEPTION', frameId: 'call', exceptionId: 'exception', className: 'java.lang.ArithmeticException', message: '/ by zero', explicit: false }),
      event(5, { type: 'FINALLY_ENTER', frameId: 'call', exceptionId: 'exception' }),
      event(6, { type: 'CONSOLE_WRITE', frameId: 'call', channel: 'stderr', text: 'cleanup\n' }),
      event(7, { type: 'UNWIND_EXCEPTION', frameId: 'call', exceptionId: 'exception' }),
      event(8, { type: 'CATCH_EXCEPTION', frameId: 'main', exceptionId: 'exception' }),
      event(9, { type: 'CONSOLE_WRITE', frameId: 'main', channel: 'stdout', text: 'continued\n' }),
      event(10, { type: 'EXIT_METHOD', frameId: 'main' }),
      event(11, { type: 'CONSOLE_WRITE', frameId: null, channel: 'stderr', text: 'shutdown\n' }),
      event(12, { type: 'PROGRAM_END' }),
    ]))
    const states = [createInitialState()]
    for (const item of trace.events) states.push(applyEvent(states.at(-1)!, item))
    for (const cursor of [13, 12, 8, 5, 0, 11, 6, 4, 7, 9, 2, 1, 10, 3]) expect(seek(trace, cursor)).toEqual(states[cursor])
    expect(states[5].exceptions[0].finallyFrameIds).toBeUndefined()
    expect(states[6].exceptions[0].finallyFrameIds).toEqual(['call'])
    expect(states[8].exceptions[0].unwoundFrameIds).toEqual(['call'])
    expect(states[9].exceptions[0].caughtBy).toBe('main')
    expect(states[7].console.map(entry => entry.text)).toEqual(['start\n', 'cleanup\n'])
    expect(states[13].console).toHaveLength(4)
    expect(states[13].status).toBe('ended')
  })

  it('rejects finally without an active episode and console naming an inactive frame', () => {
    const started = applyEvent(applyEvent(createInitialState(), event(0, { type: 'PROGRAM_START' })),
      event(1, { type: 'ENTER_METHOD', frameId: 'main', callerFrameId: null, className: 'Main', methodName: 'main', locals: [] }))
    expect(() => applyEvent(started, event(2, { type: 'FINALLY_ENTER', frameId: 'main', exceptionId: 'missing' })))
      .toThrow('Unknown active exception')
    expect(() => applyEvent(started, event(2, { type: 'CONSOLE_WRITE', frameId: 'gone', channel: 'stdout', text: 'wrong' })))
      .toThrow('Console written outside active frame')
    expect(started.console).toEqual([])
    expect(started.exceptions).toEqual([])
  })
})
