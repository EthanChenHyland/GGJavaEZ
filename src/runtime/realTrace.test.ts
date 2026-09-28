import { describe, expect, it } from 'vitest'
import type { TraceDocument, TraceEvent } from '../contracts/runtime'
import { applyEvent, createInitialState, loadArrayTrace, seek, validateTrace } from './index'

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
})
