import { describe, expect, it } from 'vitest'
import type { RuntimeLibrarySummary, RuntimeObject, RuntimeValue, TraceEvent } from '../contracts/runtime'
import type { WorldAnchor } from '../contracts/world'
import { collectionSummary, type CollectionSummaryContext } from './collectionSummary'

const int = (value: number): RuntimeValue => ({ kind: 'primitive', javaType: 'int', value })
const ref = (objectId: string): RuntimeValue => ({ kind: 'reference', javaType: 'Object', objectId })
const anchor: WorldAnchor = {
  entityId: 'c', region: 'heap', position: [8, -4, 2], size: [5.2, 9.93, 2.3], ports: {}, bodyPort: [8, -4, 3.15],
}
function object(library?: RuntimeLibrarySummary, overrides: Partial<RuntimeObject> = {}): RuntimeObject {
  return { id: 'c', displayId: 17, className: 'java.util.ArrayList', fields: {}, allocatedAt: 'allocation',
    observedAt: 'observation', library, ...overrides }
}
function context(objects: CollectionSummaryContext['objects'] = {}): CollectionSummaryContext {
  const events: Readonly<Record<string, number>> = { allocation: 1, observation: 3, write: 2, future: 5 }
  return { cursor: 5, eventSeq: id => events[id] ?? null, objects }
}

describe('collectionSummary captured projection', () => {
  it.each([
    ['LIST', 'List'], ['SET', 'Set'], ['QUEUE', 'Queue'], ['DEQUE', 'Deque'],
  ] as const)('preserves %s captured order and canonical position slots', (kind, expected) => {
    const projected = collectionSummary(object({ kind, size: 3, order: 'unordered', items: [int(8), int(2), int(8)] }), anchor, context())!
    expect(projected.collectionKind).toBe(expected)
    expect(projected.entries.map(entry => entry.value.exact)).toEqual(['8', '2', '8'])
    expect(projected.entries.map(entry => entry.slotId)).toEqual(['c:summary:item:0', 'c:summary:item:1', 'c:summary:item:2'])
    expect(projected).toMatchObject({ id: 'c', displayId: 17, title: 'ArrayList', size: 3, recordedEntries: 3, mutation: null })
    expect(projected.anchor).toBe(anchor)
  })
  it('map key/value order and identities stay distinct even for equal values', () => {
    const result = collectionSummary(object({ kind: 'MAP', size: 2, entries: [
      { key: int(7), value: int(7) }, { key: int(1), value: int(9) },
    ] }), anchor, context())!
    expect(result.entries.map(entry => [entry.key!.exact, entry.value.exact])).toEqual([['7', '7'], ['1', '9']])
    expect(result.entries.map(entry => entry.slotId)).toEqual(['c:summary:entry:0:value', 'c:summary:entry:1:value'])
  })
  it('keeps captured references including duplicate targets; key-only references have no value port', () => {
    const target = object(undefined, { id: 'target', displayId: 22, className: 'demo.Node' })
    const result = collectionSummary(object({ kind: 'MAP', size: 3, entries: [
      { key: ref('target'), value: { kind: 'null' } },
      { key: int(0), value: ref('target') }, { key: ref('target'), value: ref('target') },
    ] }), anchor, context({ target }))!
    expect(result.entries[0].key).toMatchObject({ kind: 'reference', targetId: 'target' })
    expect(result.entries[0].value.kind).toBe('null')
    expect(result.entries[0].port).toBeNull()
    expect(result.entries[1].value).toMatchObject({ kind: 'reference', targetId: 'target' })
    expect(result.entries[1].port).not.toBeNull()
    expect(result.entries[2].slotId).not.toBe(result.entries[1].slotId)
  })
  it('formats captured boxed scalars, truncated strings and missing targets honestly', () => {
    const boxed = object({ kind: 'BOXED', value: int(18) }, { id: 'boxed' })
    const text = object(undefined, { id: 'text', className: 'java.lang.String', string: { value: 'ab\n', length: 100, truncated: true } })
    const emptyBox = object({ kind: 'BOXED' }, { id: 'emptyBox' })
    const result = collectionSummary(object({ kind: 'LIST', size: 5,
      items: [ref('boxed'), ref('text'), ref('missing'), ref('emptyBox'), { kind: 'unavailable', reason: 'capture bound' }],
    }), anchor, context({ boxed, text, emptyBox }))!
    expect(result.entries[0].value).toMatchObject({ kind: 'primitive', exact: '18', observation: 'OBSERVED' })
    expect(result.entries[0].port).toBeNull()
    expect(result.entries[1].value).toMatchObject({ kind: 'reference', observation: 'TRUNCATED', recordedLength: 100 })
    expect(result.entries[1].value.exact).toContain('"ab\\n"')
    for (const index of [2, 3, 4]) {
      expect(result.entries[index].value.kind).toBe('not-recorded')
      expect(result.entries[index].port).toBeNull()
    }
  })
  it('captures only observed entries and retains unrecorded/truncated remainder', () => {
    const result = collectionSummary(object({ kind: 'LIST', size: 200, items: [int(1)], truncated: true, reason: '32-entry capture limit' }), anchor, context())!
    expect(result.entries).toHaveLength(1)
    expect(result.size - result.recordedEntries).toBe(199)
    expect(result.evidence.unavailableReason).toBe('32-entry capture limit')
    expect(result.evidence.derivation).toContain('truncated')
    expect(collectionSummary(object({ kind: 'LIST', size: 0, items: [] }), anchor, context())!.entries).toEqual([])
  })
  it('only the first 24 captured reference positions get face ports', () => {
    const target = object(undefined, { id: 'target' })
    const result = collectionSummary(object({ kind: 'LIST', size: 100, items: Array.from({ length: 32 }, () => ref('target')) }), anchor, context({ target }))!
    expect(result.recordedEntries).toBe(32)
    expect(result.entries.filter(entry => entry.port)).toHaveLength(24)
    expect(result.entries[24].port).toBeNull()
    const first = result.entries[0].port!, second = result.entries[1].port!, column2 = result.entries[12].port!
    expect(first[1] - second[1]).toBeCloseTo(0.56)
    expect(first[0]).toBeCloseTo(6.7)
    expect(column2[0]).toBeCloseTo(9.3)
    expect(column2[1]).toBe(first[1])
    expect(first[2]).toBeCloseTo(3.15+.06) // exposed chip-front port
    expect(first[1]).toBeCloseTo(-4 + 9.93 / 2 - 1.5 - 0.7 - 0.28)
  })
  it('never manufactures operation history from observation labels, method names or field writes', () => {
    const mutationEvent: TraceEvent = { type: 'OBJECT_OBSERVE', objectId: 'c', library: { kind: 'LIST', size: 1, items: [int(2)] },
      eventId: 'observation', seq: 3, source: null, importance: 'major', label: 'add put remove poll' }
    const result = collectionSummary(object(mutationEvent.library), anchor, { ...context(), mutationEvent })!
    expect(result.mutation).toBeNull()
    expect(result.entries[0].evidence.introducedSeq).toBeNull()
    expect(result.entries[0].evidence.changedSeq).toBeNull()
    expect(result.entries[0].evidence.eventIds).toEqual(['observation'])
  })
  it('uses exact slot observation/write evidence without guessing first observation', () => {
    const obj = object({ kind: 'LIST', size: 1, items: [int(4)] })
    obj.fields['c:summary:item:0'] = { id: 'c:summary:item:0', name: '[0]', javaType: 'int', value: int(4), observedAt: 'observation', changedAt: 'write' }
    const result = collectionSummary(obj, anchor, context())!
    expect(result.entries[0].evidence).toMatchObject({ introducedSeq: null, changedSeq: 2, eventIds: ['observation', 'write'] })
    expect(result.evidence).toMatchObject({ kind: 'observed', introducedSeq: 1, changedSeq: null })
    expect(result.mutation).toBeNull()
  })
  it('does not cross the applied-prefix boundary or invent missing event provenance', () => {
    const obj = object({ kind: 'LIST', size: 1, items: [int(4)] })
    expect(collectionSummary(obj, anchor, { ...context(), cursor: 0 })).toBeNull()
    expect(collectionSummary(obj, anchor, { ...context(), cursor: 3 })).toBeNull()
    expect(collectionSummary({ ...obj, allocatedAt: 'future' }, anchor, context())).toBeNull()
    const result = collectionSummary(obj, anchor, { ...context(), eventSeq: () => null })!
    expect(result.evidence.kind).toBe('unavailable')
    expect(result.entries[0].evidence.eventIds).toEqual([])
    expect(result.entries[0].evidence.introducedSeq).toBeNull()
    const futureTarget = object(undefined, { id: 'target', allocatedAt: 'future' })
    const reference = collectionSummary(object({ kind: 'LIST', size: 1, items: [ref('target')] }), anchor, context({ target: futureTarget }))!
    expect(reference.entries[0].value.kind).toBe('not-recorded')
  })
  it.each([
    undefined, { kind: 'OPAQUE' }, { kind: 'BOXED', value: int(2) }, { kind: 'LIST' },
    { kind: 'LIST', size: -1 }, { kind: 'LIST', size: NaN }, { kind: 'LIST', size: 1.5 },
    { kind: 'LIST', size: 0, items: [int(1)] }, { kind: 'MAP', size: 1, items: [int(1)] },
    { kind: 'LIST', size: 1, entries: [{ key: int(1), value: int(2) }] },
  ] satisfies (RuntimeLibrarySummary | undefined)[])('returns fallback null for unsupported or inconsistent summary %j', summary => {
    expect(collectionSummary(object(summary), anchor, context())).toBeNull()
  })
  it('does not mutate the runtime object, anchor or captured values', () => {
    const obj = object({ kind: 'LIST', size: 2, items: [int(1)], truncated: true })
    const before = structuredClone({ obj, anchor })
    collectionSummary(obj, anchor, context())
    expect({ obj, anchor }).toEqual(before)
  })
})

it('Map keys have their own reference port even when the associated value is primitive',()=>{
 const target=object(undefined,{id:'target',displayId:22,className:'demo.Node'})
 const projected=collectionSummary(object({kind:'MAP',size:1,entries:[{key:ref('target'),value:int(3)}]}),anchor,context({target}))!
 expect(projected.entries[0].port).toBeNull();expect(projected.entries[0].keySlotId).toBe('c:summary:entry:0:key');expect(projected.entries[0].keyPort).not.toBeNull()
})
it('summary references without space inside the reserved body remain structural evidence',()=>{
 const target=object(undefined,{id:'target',displayId:22,className:'demo.Node'})
 const projected=collectionSummary(object({kind:'LIST',size:1,items:[ref('target')]}),{...anchor,size:[4.2,2.4,1.6]},context({target}))!
 expect(projected.entries[0].value).toMatchObject({kind:'reference',targetId:'target'});expect(projected.entries[0].port).toBeNull()
})
