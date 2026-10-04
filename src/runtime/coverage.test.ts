import { describe, expect, it } from 'vitest'
import type { RuntimeState, RuntimeSlot, RuntimeValue, TraceEvent, TraceEventBase } from '../contracts/runtime'
import { arrayElementSlotId } from '../contracts/runtime'
import { applyEvent, createInitialState } from './state'
import { createReductionEngine } from './engine'
import { IncrementalTraceValidator } from './trace'
import { isExecutionFact } from './executionFactValidation'
import { loadArrayTrace, loadPersonTrace } from '../examples/traces'

type Payload = TraceEvent extends infer E ? E extends TraceEvent ? Omit<E, keyof TraceEventBase> : never : never
const primitive = (javaType: Extract<RuntimeValue, { kind: 'primitive' }>['javaType'], value: number | string | boolean): Extract<RuntimeValue, { kind: 'primitive' }> => ({ kind: 'primitive', javaType, value })
const int = (value: number) => primitive('int', value)
const slot = (id: string, javaType: string, value: RuntimeValue): RuntimeSlot => ({ id, name: id, javaType, value })
const reference = (javaType: string, objectId: string): RuntimeValue => ({ kind: 'reference', javaType, objectId })
function event(state: RuntimeState, payload: Payload): TraceEvent {
  return { eventId: `e:${state.cursor}`, seq: state.cursor, source: null, importance: 'normal', label: payload.type, ...payload } as TraceEvent
}
function apply(state: RuntimeState, payload: Payload): RuntimeState { return applyEvent(state, event(state, payload)) }
function initial(): RuntimeState {
  return apply(apply(createInitialState(), { type: 'PROGRAM_START' }), {
    type: 'ENTER_METHOD', frameId: 'main', callerFrameId: null, className: 'Main', methodName: 'main', locals: [],
  })
}
function allocated(elementType: string, elements: RuntimeValue[], length?: number): RuntimeState {
  return apply(initial(), { type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 1, elementType, elements, ...(length === undefined ? {} : { length, truncated: length > elements.length }) })
}
function freezeDeep(value: unknown): void {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeDeep); Object.freeze(value) }
}

describe('Phase 4 array reducer', () => {
  it.each([
    ['byte', primitive('byte', -128), primitive('byte', 127)], ['short', primitive('short', -32768), primitive('short', 32767)],
    ['int', int(-2147483648), int(2147483647)], ['long', primitive('long', '-9223372036854775808'), primitive('long', '9223372036854775807')],
    ['float', primitive('float', '-0.0'), primitive('float', 'NaN')], ['double', primitive('double', 'Infinity'), primitive('double', '-Infinity')],
    ['boolean', primitive('boolean', false), primitive('boolean', true)], ['char', primitive('char', '\uD800'), primitive('char', '字')],
  ] as const)('uses the same stable cell and history for %s[]', (javaType, beforeValue, afterValue) => {
    const before = allocated(javaType, [beforeValue])
    freezeDeep(before)
    const after = apply(before, { type: 'ARRAY_WRITE', frameId: 'main', objectId: 'array', index: 0, value: afterValue })
    expect(after.objects.array.array!.elements[0]).toMatchObject({ id: arrayElementSlotId('array', 0), javaType, value: afterValue })
    expect(before.objects.array.array!.elements[0].value).toEqual(beforeValue)
    expect(after.arrayMutations[0]).toMatchObject({ before: beforeValue, after: afterValue })
    const read = apply(after, { type: 'ARRAY_READ', frameId: 'main', objectId: 'array', index: 0, value: afterValue })
    expect(read.arrayMutations).toBe(after.arrayMutations)
    expect(read.arrayActivity).toMatchObject({ kind: 'read', value: afterValue })
  })
  it('stores an enormous array as a bounded prefix plus observed sparse cells', () => {
    const before = allocated('long', [primitive('long', '7')], 2147483647)
    const last = 2147483646
    const after = apply(before, { type: 'ARRAY_WRITE', frameId: 'main', objectId: 'array', index: last, value: primitive('long', '9007199254740993') })
    expect(after.objects.array.array!.elements).toBe(before.objects.array.array!.elements)
    expect(after.objects.array.array!.elements).toHaveLength(1)
    expect(Object.keys(after.objects.array.array!.sparseElements!)).toEqual([String(last)])
    expect(after.arrayMutations[0].before).toEqual({ kind: 'unavailable', javaType: 'long', reason: 'Array element not observed' })
    expect(after.objects.array.array!.sparseElements![last].id).toBe(arrayElementSlotId('array', last))
    expect(before.objects.array.array!.sparseElements).toBeUndefined()
    const read = apply(after, { type: 'ARRAY_READ', frameId: 'main', objectId: 'array', index: last - 1, value: primitive('long', '8'), observed: true })
    expect(read.objects.array.array!.elements).toBe(before.objects.array.array!.elements)
    expect(read.arrayMutations).toBe(after.arrayMutations)
  })
  it('refreshes observed reads changed by untracked Java operations without inventing a write', () => {
    const before = allocated('int', [int(1)])
    expect(() => apply(before, { type: 'ARRAY_READ', frameId: 'main', objectId: 'array', index: 0, value: int(8) })).toThrow('Observed array value mismatch')
    const after = apply(before, { type: 'ARRAY_READ', frameId: 'main', objectId: 'array', index: 0, value: int(8), observed: true })
    expect(after.objects.array.array!.elements[0]).toMatchObject({ value: int(8), observedAt: 'e:3' })
    expect(after.objects.array.array!.elements[0].changedAt).toBeUndefined()
    expect(after.arrayMutations).toBe(before.arrayMutations)
    expect(before.objects.array.array!.elements[0].value).toEqual(int(1))
  })
  it('preserves reference aliases, ragged child identities, nulls and slot declared types', () => {
    let state = allocated('int', [int(2)])
    state = apply(state, { type: 'ALLOCATE_ARRAY', objectId: 'grid', displayId: 2, elementType: 'int[]', elements: [reference('int[]', 'array'), { kind: 'null' }] })
    state = apply(state, { type: 'ALLOCATE_OBJECT', objectId: 'child', displayId: 3, className: 'Child', fields: [] })
    state = apply(state, { type: 'ALLOCATE_ARRAY', objectId: 'refs', displayId: 4, elementType: 'Base', elements: [reference('Base', 'child'), { kind: 'null' }] })
    state = apply(state, { type: 'DECLARE_LOCAL', frameId: 'main', slot: slot('x', 'Base[]', reference('Base[]', 'refs')) })
    state = apply(state, { type: 'DECLARE_LOCAL', frameId: 'main', slot: slot('y', 'Base[]', reference('Base[]', 'refs')) })
    expect(state.frames.main.locals.x.value).toEqual(state.frames.main.locals.y.value)
    expect(state.objects.grid.array!.elements.map(cell => cell.value)).toEqual([reference('int[]', 'array'), { kind: 'null' }])
    expect(state.objects.child.className).toBe('Child')
    expect(() => apply(state, { type: 'ARRAY_WRITE', frameId: 'main', objectId: 'refs', index: 1, value: reference('Child', 'child') })).toThrow('Value type mismatch')
    const after = apply(state, { type: 'ARRAY_WRITE', frameId: 'main', objectId: 'refs', index: 1, value: reference('Base', 'child'), from: { kind: 'element', index: 0 } })
    expect(after.objects.refs.array!.elements[1].value).toEqual(reference('Base', 'child'))
    expect(Object.keys(after.objects)).toHaveLength(4)
  })
  it('observes cyclic arrays before first entry and resolves cells without inventing reads or writes', () => {
    const start = apply(createInitialState(), { type: 'PROGRAM_START' })
    const allocation: Payload = { type: 'ALLOCATE_ARRAY', objectId: 'a', displayId: 1, elementType: 'Object', elements: [{ kind: 'uninitialized' }], length: 1000000, truncated: true }
    expect(() => apply(start, allocation)).toThrow('requires an active frame')
    const a = apply(start, { ...allocation, observed: true })
    const b = apply(a, { type: 'ALLOCATE_ARRAY', objectId: 'b', displayId: 2, elementType: 'Object', elements: [reference('Object', 'a')], observed: true })
    const refresh: Payload = { type: 'OBJECT_OBSERVE', objectId: 'a', arrayElements: [
      { index: 0, value: reference('Object', 'b') }, { index: 999999, value: reference('Object', 'a') },
    ] }
    freezeDeep(b)
    const after = apply(b, refresh)
    expect(after.activeFrameIds).toEqual([])
    expect(after.objects.a.array!.length).toBe(1000000)
    expect(after.objects.a.array!.elements).toHaveLength(1)
    expect(after.objects.a.array!.elements[0]).toMatchObject({ id: arrayElementSlotId('a', 0), value: reference('Object', 'b'), observedAt: 'e:3' })
    expect(after.objects.b.array!.elements[0].value).toEqual(reference('Object', 'a'))
    expect(after.objects.a.array!.sparseElements![999999].value).toEqual(reference('Object', 'a'))
    expect(b.objects.a.array!.elements[0].value).toEqual({ kind: 'uninitialized' })
    expect(b.objects.a.array!.sparseElements).toBeUndefined()
    expect(after.arrayMutations).toBe(b.arrayMutations)
    expect(after.arrayActivity).toBeNull()
    refresh.arrayElements![0].value = { kind: 'null' }
    expect(after.objects.a.array!.elements[0].value).toEqual(reference('Object', 'b'))
    const engine = createReductionEngine(b)
    expect(JSON.parse(JSON.stringify(engine.apply(event(b, { type: 'OBJECT_OBSERVE', objectId: 'a', arrayElements: [
      { index: 0, value: reference('Object', 'b') }, { index: 999999, value: reference('Object', 'a') },
    ] }))))).toEqual(after)
  })
  it('refreshes externally changed buffers while retaining sparse cells and proven write freshness', () => {
    let state = allocated('byte', [primitive('byte', 1)], 100)
    state = apply(state, { type: 'ARRAY_WRITE', frameId: 'main', objectId: 'array', index: 99, value: primitive('byte', 4) })
    const after = apply(state, { type: 'OBJECT_OBSERVE', objectId: 'array', arrayElements: [{ index: 0, value: primitive('byte', 8) }] })
    expect(after.objects.array.array!.sparseElements).toBe(state.objects.array.array!.sparseElements)
    expect(after.objects.array.array!.elements[0].value).toEqual(primitive('byte', 8))
    expect(after.arrayMutations).toBe(state.arrayMutations)
    expect(after.arrayActivity).toBeNull()
    const refreshedWrite = apply(after, { type: 'OBJECT_OBSERVE', objectId: 'array', arrayElements: [{ index: 99, value: primitive('byte', 9) }] })
    expect(refreshedWrite.objects.array.array!.sparseElements![99]).toMatchObject({ value: primitive('byte', 9), changedAt: 'e:3', observedAt: 'e:5' })
    expect(() => apply(after, { type: 'OBJECT_OBSERVE', objectId: 'array', arrayElements: [{ index: 100, value: primitive('byte', 1) }] })).toThrow('outside bounds')
    expect(() => apply(after, { type: 'OBJECT_OBSERVE', objectId: 'array', arrayElements: [{ index: 0, value: int(1) }] })).toThrow('Value type mismatch')
    expect(() => apply(after, { type: 'OBJECT_OBSERVE', objectId: 'array', arrayElements: [{ index: 0, value: primitive('byte', 1) }, { index: 0, value: primitive('byte', 2) }] })).toThrow('Duplicate observed array index')
    expect(() => apply(after, { type: 'OBJECT_OBSERVE', objectId: 'array', arrayElements: Array.from({ length: 33 }, (_, index) => ({ index, value: primitive('byte', 0) })) })).toThrow('unbounded')
    const validator = new IncrementalTraceValidator(2)
    const refresh = event(after, { type: 'OBJECT_OBSERVE', objectId: 'array', arrayElements: [{ index: 99, value: primitive('byte', 8) }] })
    expect(() => validator.check(refresh, after)).not.toThrow()
    expect(() => validator.check({ ...refresh, arrayElements: [{ index: -1, value: primitive('byte', 1) }] }, after)).toThrow('Malformed event')
  })
  it('keeps legacy int comparisons concrete and verifies write origins', () => {
    const state = allocated('double', [primitive('double', 1), primitive('double', 2)])
    expect(() => apply(state, { type: 'ARRAY_COMPARE', frameId: 'main', objectId: 'array', indices: [0, 1], values: [int(1), int(2)], operator: '>', result: false })).toThrow('concrete Java ints')
    expect(() => apply(state, { type: 'ARRAY_WRITE', frameId: 'main', objectId: 'array', index: 0, value: primitive('double', 9), from: { kind: 'element', index: 1 } })).toThrow('origin value mismatch')
    expect(() => allocated('int', [int(1)], -1)).toThrow('Invalid array length')
    expect(() => apply(state, { type: 'ARRAY_WRITE', frameId: 'main', objectId: 'array', index: 100, value: primitive('double', 9) })).toThrow('outside bounds')
  })
})

describe('Phase 4 class and object observations', () => {
  it('keeps static storage separate and preserves actual initialization and write freshness', () => {
    const classId = 'jvm:class:p.Counter'
    let state = apply(initial(), { type: 'CLASS_OBSERVE', classId, className: 'p.Counter', initialization: 'started', fields: [slot('total', 'int', int(0))] })
    expect(state.classes![classId].statics.total).toMatchObject({ static: true, declaringClass: 'p.Counter', observedAt: 'e:2' })
    expect(Object.keys(state.objects)).toEqual([])
    const before = state
    state = apply(state, { type: 'SET_STATIC', classId, slotId: 'total', value: int(8) })
    expect(before.classes![classId].statics.total.value).toEqual(int(0))
    state = apply(state, { type: 'CLASS_OBSERVE', classId, className: 'p.Counter', initialization: 'completed', fields: [slot('total', 'int', int(9))] })
    expect(state.classes![classId]).toMatchObject({ initialization: 'completed', initializedAt: 'e:4', observedAt: 'e:4' })
    expect(state.classes![classId].statics.total).toMatchObject({ value: int(9), changedAt: 'e:3', observedAt: 'e:4' })
    const next = apply(state, { type: 'CLASS_OBSERVE', classId, className: 'p.Counter', initialization: 'observed', fields: [] })
    expect(next.classes![classId].initialization).toBe('completed')
    expect(next.classes![classId].initializedAt).toBe('e:4')
    expect(() => apply(next, { type: 'CLASS_OBSERVE', classId, className: 'p.Counter', initialization: 'started', fields: [] })).toThrow('cannot restart')
  })
  it('copies bounded library/string/metadata payloads and preserves snapshots without fabricated writers', () => {
    const state = apply(initial(), { type: 'ALLOCATE_OBJECT', objectId: 'list', displayId: 1, className: 'java.util.ArrayList', fields: [] })
    const payload: Payload = { type: 'OBJECT_OBSERVE', objectId: 'list', fields: [slot('f', 'int', int(2))],
      library: { kind: 'LIST', size: 2, order: 'index', items: [reference('Object', 'list'), { kind: 'null' }] },
      metadata: { ownership: 'JDK', runtimeType: 'java.util.ArrayList', packageName: 'java.util', components: [{ name: 'x', javaType: 'int' }] },
    }
    const after = apply(state, payload)
    payload.library!.items![0] = int(99)
    payload.metadata!.components![0].name = 'mutated'
    payload.fields![0].value = int(99)
    expect(after.objects.list.library!.items![0]).toEqual(reference('Object', 'list'))
    expect(after.objects.list.metadata!.components![0].name).toBe('x')
    expect(after.objects.list.fields.f).toMatchObject({ value: int(2), observedAt: 'e:3' })
    expect(after.objects.list.fields.f.changedAt).toBeUndefined()
    expect(state.objects.list.library).toBeUndefined()
    const written = apply(after, { type: 'SET_FIELD', objectId: 'list', slotId: 'f', value: int(7) })
    const observed = apply(written, { type: 'OBJECT_OBSERVE', objectId: 'list', fields: [slot('f', 'int', int(8))] })
    expect(observed.objects.list.fields.f).toMatchObject({ value: int(8), changedAt: 'e:4', observedAt: 'e:5' })
    expect(observed.arrayMutations).toEqual([])
    expect(() => apply(after, { type: 'OBJECT_OBSERVE', objectId: 'list', library: { kind: 'LIST', items: Array(33).fill({ kind: 'null' }) } })).toThrow('unbounded')
    const string = apply(after, { type: 'ALLOCATE_OBJECT', objectId: 'text', displayId: 2, className: 'java.lang.String', fields: [] })
    const summarized = apply(string, { type: 'OBJECT_OBSERVE', objectId: 'text', string: { value: 'abc', length: 1000000, truncated: true } })
    expect(summarized.objects.text.string).toEqual({ value: 'abc', length: 1000000, truncated: true })
    expect(summarized.objects.text.fields).toEqual({})
  })
  it('replaces collection membership atomically while ordinary observations merge fields', () => {
    let state = apply(initial(), { type: 'ALLOCATE_OBJECT', objectId: 'a', displayId: 1, className: 'Item', fields: [] })
    state = apply(state, { type: 'ALLOCATE_OBJECT', objectId: 'b', displayId: 2, className: 'Item', fields: [] })
    state = apply(state, { type: 'ALLOCATE_OBJECT', objectId: 'list', displayId: 3, className: 'java.util.ArrayList', fields: [] })
    state = apply(state, { type: 'OBJECT_OBSERVE', objectId: 'list', replaceFields: true,
      fields: [slot('entry0', 'Object', reference('Object', 'a')), slot('entry1', 'Object', reference('Object', 'b'))],
      library: { kind: 'LIST', size: 2, items: [reference('Object', 'a'), reference('Object', 'b')] },
    })
    freezeDeep(state)
    const payload: Payload = { type: 'OBJECT_OBSERVE', objectId: 'list', replaceFields: true,
      fields: [slot('entry0', 'Object', reference('Object', 'b'))], library: { kind: 'LIST', size: 1, items: [reference('Object', 'b')] },
    }
    const after = apply(state, payload)
    expect(Object.keys(after.objects.list.fields)).toEqual(['entry0'])
    expect(after.objects.list.fields.entry0.value).toEqual(reference('Object', 'b'))
    expect(after.objects.list.library!.items).toEqual([reference('Object', 'b')])
    expect(Object.keys(state.objects.list.fields)).toEqual(['entry0', 'entry1'])
    expect(state.objects.list.fields.entry0.value).toEqual(reference('Object', 'a'))
    const engine = createReductionEngine(state)
    expect(JSON.parse(JSON.stringify(engine.apply(event(state, payload))))).toEqual(after)
    const emptied = apply(after, { type: 'OBJECT_OBSERVE', objectId: 'list', replaceFields: true, fields: [], library: { kind: 'LIST', size: 0, items: [] } })
    expect(emptied.objects.list.fields).toEqual({})
    const merged = apply(state, { type: 'OBJECT_OBSERVE', objectId: 'list', fields: [slot('entry0', 'Object', { kind: 'null' })] })
    expect(Object.keys(merged.objects.list.fields)).toEqual(['entry0', 'entry1'])
    const validator = new IncrementalTraceValidator(2)
    expect(() => validator.check(event(state, payload), state)).not.toThrow()
    expect(() => validator.check({ ...event(state, payload), replaceFields: 'true' }, state)).toThrow('Malformed event')
    expect(() => applyEvent(state, { ...event(state, payload), replaceFields: 'true' } as unknown as TraceEvent)).toThrow('Invalid field replacement flag')
    const context = { owner: 'X', name: 'main', descriptor: '()V', frameId: 'main', site: 1, rawSeq: 2, source: null }
    expect(isExecutionFact({ kind: 'observe', context, objectId: 'list', fields: [], replaceFields: true })).toBe(true)
    expect(isExecutionFact({ kind: 'observe', context, objectId: 'list', fields: [], replaceFields: 'true' })).toBe(false)
  })
  it('retains optional allocation metadata and unavailable fields exactly', () => {
    const metadata = { ownership: 'PROJECT' as const, runtimeType: 'p.Point', packageName: 'p', record: true, components: [{ name: 'x', javaType: 'int' }] }
    const value: RuntimeValue = { kind: 'unavailable', reason: 'not captured', javaType: 'int' }
    const state = apply(initial(), { type: 'ALLOCATE_OBJECT', objectId: 'record', displayId: 1, className: 'p.Point', fields: [slot('x', 'int', value)], metadata })
    expect(state.objects.record.metadata).toEqual(metadata)
    expect(state.objects.record.fields.x.value).toEqual(value)
    expect(createInitialState()).not.toHaveProperty('classes')
  })
})

describe('incremental validation and persistent seam', () => {
  it('validates all new semantic and graph shapes without relaxing malformed values', () => {
    const validator = new IncrementalTraceValidator(2)
    const state = initial()
    for (const payload of [
      { type: 'CLASS_OBSERVE', classId: 'jvm:class:X', className: 'X', fields: [], initialization: 'observed' },
      { type: 'OBJECT_OBSERVE', objectId: 'x', library: { kind: 'LIST', size: 1, items: [primitive('long', '9223372036854775807')] } },
      { type: 'ALLOCATE_ARRAY', objectId: 'a', displayId: 1, elementType: 'double', length: 100, truncated: true, elements: [primitive('double', 'NaN')] },
      { type: 'ARRAY_READ', frameId: 'main', objectId: 'a', index: 99, observed: true, value: primitive('double', '-0.0') },
      { type: 'SET_STATIC', classId: 'jvm:class:X', slotId: 'x', value: { kind: 'null' } },
    ] as Payload[]) expect(() => validator.check(event(state, payload), state)).not.toThrow()
    expect(() => validator.check(event(state, { type: 'OBJECT_OBSERVE', objectId: 'x', library: { kind: 'SET', items: Array(33).fill({ kind: 'null' }) } }), state)).toThrow('Malformed event')
    const context = { owner: 'X', name: 'main', descriptor: '()V', frameId: 'main', site: 1, rawSeq: 2, source: null }
    const target = { id: 'static', kind: 'static', ownerId: 'jvm:class:X', name: 'x', javaType: 'long' }
    expect(isExecutionFact({ kind: 'read', context, target, value: primitive('long', '9223372036854775807'), origin: { kind: 'static_read', site: 1 } })).toBe(true)
    expect(isExecutionFact({ kind: 'class', context, classId: 'jvm:class:X', className: 'X', fields: [], initialization: 'started' })).toBe(true)
    expect(isExecutionFact({ kind: 'observe', context, objectId: 'o', fields: [] })).toBe(true)
    expect(isExecutionFact({ kind: 'file', context, operation: 'read', path: null, text: 'abc', charCount: 3, truncated: false })).toBe(true)
    expect(isExecutionFact({ kind: 'file', context, operation: 'read', path: null, text: '', byteCount: -1 })).toBe(false)
    expect(isExecutionFact({ kind: 'object', context, objectId: 'o', className: 'X', fields: [], metadata: { ownership: 'guessed' } })).toBe(false)
  })
  it('validates summary flags and the agreed expanded initial prefix bound', () => {
    const context = { owner: 'X', name: 'main', descriptor: '()V', frameId: 'main', site: 1, rawSeq: 2, source: null }
    const fact = { kind: 'object', context, objectId: 'list', className: 'java.util.ArrayList', fields: [] }
    expect(isExecutionFact({ ...fact, boundedSummary: true })).toBe(true)
    expect(isExecutionFact({ ...fact, boundedSummary: false })).toBe(true)
    expect(isExecutionFact({ ...fact, boundedSummary: 1 })).toBe(false)
    const state = initial()
    const payload: Payload = { type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 1, elementType: 'int', elements: Array(33).fill(int(0)), observed: true }
    expect(() => apply(state, payload)).toThrow('Unbounded initial array observation')
    expect(() => new IncrementalTraceValidator(2).check(event(state, payload), state)).toThrow('Malformed event')
    const legacy = apply(state, { ...payload, observed: undefined })
    expect(legacy.objects.array.array!.elements).toHaveLength(33)
  })
  it('replays new state identically through pure and persistent reduction without changing old roots', () => {
    const engine = createReductionEngine()
    let pure = createInitialState()
    const payloads: Payload[] = [
      { type: 'PROGRAM_START' }, { type: 'ENTER_METHOD', frameId: 'main', callerFrameId: null, className: 'Main', methodName: 'main', locals: [] },
      { type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 1, elementType: 'char', elements: [primitive('char', 'a')], length: 1000000, truncated: true },
      { type: 'CLASS_OBSERVE', classId: 'jvm:class:X', className: 'X', initialization: 'observed', fields: [slot('x', 'int', int(0))] },
      { type: 'SET_STATIC', classId: 'jvm:class:X', slotId: 'x', value: int(2) },
      { type: 'ARRAY_WRITE', frameId: 'main', objectId: 'array', index: 999999, value: primitive('char', '\uD800') },
      { type: 'ARRAY_READ', frameId: 'main', objectId: 'array', index: 999998, value: primitive('char', '\uDC00'), observed: true },
      { type: 'EXIT_METHOD', frameId: 'main' }, { type: 'PROGRAM_END' },
    ]
    const roots: RuntimeState[] = []
    for (const payload of payloads) {
      const next = event(pure, payload)
      pure = applyEvent(pure, next)
      const persistent = engine.apply(next)
      expect(JSON.parse(JSON.stringify(persistent))).toEqual(pure)
      roots.push(persistent)
    }
    expect(roots[2].objects.array.array!.sparseElements).toBeUndefined()
    expect(roots[3].classes!['jvm:class:X'].statics.x.value).toEqual(int(0))
    expect(Object.keys(roots[6].objects.array.array!.sparseElements!)).toHaveLength(2)
  })
  it('preserves exact legacy snapshots through the existing seam', () => {
    for (const trace of [loadPersonTrace(), loadArrayTrace()]) {
      const engine = createReductionEngine()
      let pure = createInitialState()
      for (const e of trace.events) {
        pure = applyEvent(pure, e)
        expect(JSON.parse(JSON.stringify(engine.apply(e)))).toEqual(pure)
      }
      expect(pure).not.toHaveProperty('classes')
      for (const object of Object.values(pure.objects)) {
        expect(object).not.toHaveProperty('observedAt')
        if (object.array) expect(object.array).not.toHaveProperty('sparseElements')
      }
    }
  })
})
