import { describe, expect, it } from 'vitest'
import type { RuntimeSlot, ScalarValue, TraceDocument, TraceEvent, TraceEventBase } from '../contracts/runtime'
import { arrayElementSlotId } from '../contracts/runtime'
import { loadArrayTrace, loadPersonTrace, loadRecursionTrace } from '../examples/traces'
import { seek } from '../runtime/seek'
import { causeHistory, causeLimitations } from './causality'
import type { CauseTarget } from './causality'

type Payload<T extends TraceEvent = TraceEvent> = T extends TraceEvent ? Omit<T, keyof TraceEventBase> : never
const int = (value: number): ScalarValue => ({ kind: 'primitive', javaType: 'int', value })
const slot = (id: string, value = int(0)): RuntimeSlot => ({ id, name: id, javaType: 'int', value })
const local: CauseTarget = { kind: 'frame', frameId: 'main', slotId: 'x' }
function traceOf(payloads: Payload[]): TraceDocument {
  return { schemaVersion: 2, demoId: 'cause-test', sourceFiles: [], events: payloads.map((event, index) => ({
    ...event, eventId: `event:${index}`, seq: index, source: { fileId: index % 2 ? 'Main.java' : 'Helper.java', line: index + 1 },
    label: event.type, importance: 'normal',
  })) }
}
const enter = (locals: RuntimeSlot[] = []): Payload => ({ type: 'ENTER_METHOD', frameId: 'main', callerFrameId: null,
  className: 'Main', methodName: 'main', locals })

describe('deterministic causal history', () => {
  it('returns only applied observations, latest first, in either cursor direction', () => {
    const trace = traceOf([enter(), { type: 'DECLARE_LOCAL', frameId: 'main', slot: slot('x', int(3)) },
      { type: 'LINE_EXECUTE', frameId: 'main' }, { type: 'ASSIGN_LOCAL', frameId: 'main', slotId: 'x', value: int(7) }])
    for (const cursor of [0, 1, 2, 3, 4, 3, 2, 1, 0, 4]) {
      const nodes = causeHistory(trace, local, cursor)
      expect(nodes.map((node) => node.cursor)).toEqual(cursor === 4 ? [4, 2] : cursor >= 2 ? [2] : [])
      expect(nodes.every((node) => node.cursor <= cursor)).toBe(true)
      if (nodes.length) expect(nodes[0].label).toContain('Latest observation')
      if (nodes.length > 1) expect(nodes[1].label).toContain('Earlier write history')
    }
    expect(causeHistory(trace, local, 4)[0]).toMatchObject({ eventId: 'event:3', value: int(7),
      source: { fileId: 'Main.java', line: 4 }, selection: { kind: 'slot', id: 'x' }, relationship: 'write' })
  })

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2])('rejects invalid cursor %s', (cursor) => {
    expect(() => causeHistory(traceOf([enter()]), local, cursor)).toThrow(RangeError)
  })

  it('matches frame and stable lexical slot identity rather than name or recycled JVM slot', () => {
    const trace = traceOf([enter(), { type: 'DECLARE_LOCAL', frameId: 'main', slot: slot('x', int(1)) },
      { type: 'REMOVE_LOCAL', frameId: 'main', slotId: 'x' },
      { type: 'DECLARE_LOCAL', frameId: 'main', slot: { ...slot('other-lifetime', int(99)), name: 'x' } },
      { type: 'DECLARE_LOCAL', frameId: 'main', slot: slot('x', int(2)) },
      { type: 'DECLARE_LOCAL', frameId: 'callee', slot: slot('x', int(88)) }])
    expect(causeHistory(trace, local, 6).map((node) => node.value)).toEqual([int(2), int(1)])
    expect(causeHistory(trace, local, 6)[1].label).toContain('history')
    expect(causeHistory(trace, { ...local, slotId: 'other-lifetime' }, 6).map((node) => node.value)).toEqual([int(99)])
  })

  it('records object-field initialization and actual writes for the requested owner', () => {
    const target: CauseTarget = { kind: 'object', objectId: 'person', slotId: 'age' }
    const trace = traceOf([{ type: 'ALLOCATE_OBJECT', objectId: 'person', displayId: 17, className: 'Person', fields: [slot('age')] },
      { type: 'SET_FIELD', objectId: 'other', slotId: 'age', value: int(99) },
      { type: 'SET_FIELD', objectId: 'person', slotId: 'age', value: int(18) }])
    expect(causeHistory(trace, target, 3).map((node) => [node.relationship, node.value])).toEqual([
      ['write', int(18)], ['allocation', int(0)],
    ])
  })

  it('preserves reference-slot identity, null clears, and proven target allocation', () => {
    const owner = { kind: 'frame' as const, frameId: 'main', slotId: 'p' }
    const trace = traceOf([enter(), { type: 'DECLARE_LOCAL', frameId: 'main', slot: { id: 'p', name: 'p', javaType: 'Person', value: { kind: 'null' } } },
      { type: 'ALLOCATE_OBJECT', objectId: 'person', displayId: 17, className: 'Person', fields: [] },
      { type: 'CREATE_REFERENCE', sourceSlot: owner, targetObjectId: 'person', javaType: 'Person' },
      { type: 'CLEAR_REFERENCE', sourceSlot: owner }])
    expect(causeHistory(trace, owner, 4).map((node) => [node.cursor, node.selection.kind])).toEqual([[4, 'reference'], [3, 'object'], [2, 'slot']])
    expect(causeHistory(trace, owner, 4)[0].selection).toEqual({ kind: 'reference', id: 'ref:p' })
    expect(causeHistory(trace, owner, 5)[0]).toMatchObject({ value: { kind: 'null' }, selection: { kind: 'slot', id: 'p' } })
    // Old references remain history after clear; they do not explain the current null.
    expect(causeHistory(trace, owner, 5).some((node) => node.relationship === 'allocation')).toBe(false)
  })

  it('supports reference fields without confusing different objects sharing field labels', () => {
    const owner = { kind: 'object' as const, objectId: 'holder', slotId: 'child' }
    const trace = traceOf([{ type: 'CREATE_REFERENCE', sourceSlot: owner, targetObjectId: 'person', javaType: 'Person' },
      { type: 'CLEAR_REFERENCE', sourceSlot: { ...owner, objectId: 'other' } }, { type: 'CLEAR_REFERENCE', sourceSlot: owner }])
    expect(causeHistory(trace, owner, 3).map((node) => node.cursor)).toEqual([3, 1])
  })

  it('reports parameter and this bindings without inventing caller argument origins', () => {
    const trace = traceOf([enter([{ ...slot('n', int(5)), role: 'parameter' },
      { id: 'this', name: 'this', javaType: 'Person', value: { kind: 'null' } }, slot('x', int(9))]),
      { type: 'DECLARE_LOCAL', frameId: 'main', slot: { ...slot('later', int(8)), role: 'parameter' } }])
    for (const id of ['n', 'this', 'later']) {
      const nodes = causeHistory(trace, { ...local, slotId: id }, 2)
      expect(nodes).toHaveLength(1)
      expect(nodes[0].relationship).toBe('binding')
      expect(nodes[0].label).toContain('caller origin not recorded')
    }
    expect(causeHistory(trace, local, 2)[0].relationship).toBe('write')
  })

  it('follows return sources only for explicit destinations, never adjacent null assignments', () => {
    const trace = traceOf([{ type: 'RETURN_VALUE', frameId: 'callee', value: { kind: 'null' }, destination: null },
      { type: 'DECLARE_LOCAL', frameId: 'main', slot: { id: 'p', name: 'p', javaType: 'Person', value: { kind: 'null' } } },
      { type: 'RETURN_VALUE', frameId: 'proven', value: int(4), destination: { frameId: 'main', slotId: 'x' }, expression: 'n * 2' }])
    expect(causeHistory(trace, { ...local, slotId: 'p' }, 3).map((node) => node.eventId)).toEqual(['event:1'])
    expect(causeHistory(trace, local, 3)[0]).toMatchObject({ relationship: 'return', value: int(4), selection: { kind: 'frame', id: 'proven' } })
    expect(causeHistory(trace, local, 3)[0].label).toContain('Proven return')
    const returnNodes = causeHistory(trace, { kind: 'frame', frameId: 'callee', slotId: 'return:callee' }, 3)
    expect(returnNodes).toHaveLength(1)
    expect(returnNodes[0].label).toContain('caller destination not recorded')
  })

  it('follows recorded array element origins at the pre-write cursor and leaves unknown ones unknown', () => {
    const target: CauseTarget = { kind: 'array', objectId: 'array', index: 0 }
    const trace = traceOf([{ type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 7, elementType: 'int', elements: [int(1), int(2)] },
      { type: 'ARRAY_WRITE', frameId: 'main', objectId: 'array', index: 1, value: int(7) },
      { type: 'ARRAY_WRITE', frameId: 'main', objectId: 'array', index: 0, value: int(7), from: { kind: 'element', index: 1 } },
      { type: 'ARRAY_WRITE', frameId: 'main', objectId: 'array', index: 1, value: int(99) }])
    const nodes = causeHistory(trace, target, 4)
    expect(nodes.map((node) => node.cursor)).toEqual([3, 2, 1])
    expect(nodes[0].selection).toEqual({ kind: 'slot', id: arrayElementSlotId('array', 0) })
    expect(nodes[1].value).toEqual(int(7))
    expect(nodes[1].label).toContain('Proven source for event:2')
    expect(nodes[1].label).toContain('origin not recorded')
    expect(causeHistory(trace, { ...target, index: 1 }, 4).some((node) => node.label.startsWith('Proven source'))).toBe(false)
  })

  it('follows a recorded local-to-array write and an indexed-read binding transitively', () => {
    const trace = traceOf([{ type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 7, elementType: 'int', elements: [int(1), int(2)] },
      { type: 'DECLARE_LOCAL', frameId: 'main', slot: slot('temp', { kind: 'uninitialized' }) },
      { type: 'ARRAY_READ', frameId: 'main', objectId: 'array', index: 1, value: int(2), destinationSlotId: 'temp' },
      { type: 'ARRAY_WRITE', frameId: 'main', objectId: 'array', index: 0, value: int(2), from: { kind: 'slot', frameId: 'main', slotId: 'temp' } }])
    const nodes = causeHistory(trace, { kind: 'array', objectId: 'array', index: 0 }, 4)
    expect(nodes.map((node) => node.cursor)).toEqual([4, 3, 1, 1])
    expect(nodes[1].selection).toEqual({ kind: 'slot', id: 'temp' })
    expect(nodes[2].selection).toEqual({ kind: 'slot', id: arrayElementSlotId('array', 0) })
    expect(nodes[3].selection).toEqual({ kind: 'slot', id: arrayElementSlotId('array', 1) })
    expect(nodes[3].value).toEqual(int(2))
  })

  it('terminates self-copy origin chains and deduplicates the same selected observation', () => {
    const trace = traceOf([{ type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 7, elementType: 'int', elements: [int(2)] },
      { type: 'ARRAY_WRITE', frameId: 'main', objectId: 'array', index: 0, value: int(2), from: { kind: 'element', index: 0 } },
      { type: 'ARRAY_WRITE', frameId: 'main', objectId: 'array', index: 0, value: int(2), from: { kind: 'element', index: 0 } }])
    const nodes = causeHistory(trace, { kind: 'array', objectId: 'array', index: 0 }, 3)
    expect(nodes.map((node) => node.cursor)).toEqual([3, 2, 1])
    expect(nodes[1].label).toContain('Proven source for event:2')
    expect(nodes[2].label).toContain('Proven source for event:1')
  })

  it('preserves unresolved source and reports empty history without fabricated events', () => {
    const trace = traceOf([enter([slot('x')])])
    trace.events[0].source = null
    expect(causeHistory(trace, local, 1)[0].source).toBeNull()
    expect(causeHistory(trace, { ...local, slotId: 'missing' }, 1)).toEqual([])
    expect(causeHistory(trace, { kind: 'array', objectId: 'missing', index: 7 }, 1)).toEqual([])
  })

  it.each([-1, 0.2, Number.NaN])('rejects invalid target array index %s', (index) => {
    expect(() => causeHistory(traceOf([]), { kind: 'array', objectId: 'array', index }, 0)).toThrow(RangeError)
  })

  it('does not mutate the trace or expose value/source aliases', () => {
    const trace = traceOf([enter([slot('x', int(5))])])
    const before = structuredClone(trace)
    const nodes = causeHistory(trace, local, 1)
    nodes[0].source!.line = 99
    nodes[0].selection.id = 'changed'
    if (nodes[0].value?.kind === 'primitive') nodes[0].value.value = 100
    expect(trace).toEqual(before)
    expect(causeHistory(trace, local, 1)[0]).toMatchObject({ value: int(5), source: { line: 1 } })
    expect(Object.isFrozen(causeLimitations())).toBe(true)
  })

  it('agrees with Person, recursion, and array reducer state at every cursor in both directions', () => {
    for (const trace of [loadPersonTrace(), loadRecursionTrace(), loadArrayTrace()]) {
      for (const cursor of [...Array.from({ length: trace.events.length + 1 }, (_, index) => index),
        ...Array.from({ length: trace.events.length + 1 }, (_, index) => trace.events.length - index)]) {
        const state = seek(trace, cursor)
        const targets: Array<[CauseTarget, ScalarValue | RuntimeSlot['value']]> = []
        for (const frame of Object.values(state.frames)) for (const entry of Object.values(frame.locals))
          targets.push([{ kind: 'frame', frameId: frame.id, slotId: entry.id }, entry.value])
        for (const object of Object.values(state.objects)) {
          for (const entry of Object.values(object.fields)) targets.push([{ kind: 'object', objectId: object.id, slotId: entry.id }, entry.value])
          for (const [index, entry] of (object.array?.elements ?? []).entries()) targets.push([{ kind: 'array', objectId: object.id, index }, entry.value])
        }
        for (const [target, value] of targets) {
          const history = causeHistory(trace, target, cursor)
          expect(history[0]?.value).toEqual(value)
          expect(history.every((node) => node.cursor <= cursor)).toBe(true)
        }
      }
    }
  })
})
