import { describe, expect, expectTypeOf, it } from 'vitest'
import fc from 'fast-check'
import type { RuntimeSlot, RuntimeTypeMetadata, TraceEvent } from '../contracts/runtime'
import { world as worldTokens } from '../theme/tokens'
import type { WorldLayoutTokens } from './layoutEngine'
import { firstObjectPresentation } from './firstObjectPresentation'

// Typed, normalized synthetic unit fixtures; no real-JVM or visual acceptance evidence.
type ObjectAllocation = Extract<TraceEvent, { type: 'ALLOCATE_OBJECT' }>
type ArrayAllocation = Extract<TraceEvent, { type: 'ALLOCATE_ARRAY' }>
const source = { fileId: 'unit/Main.java', line: 7 }
const base = { seq: 0, eventId: 'unit/allocation', source: null, label: 'allocate', importance: 'normal' } as const
const field = (index: number, declaringClass?: string): RuntimeSlot => ({
  id: `unit/field/${index}`, name: `field${index}`, javaType: 'int',
  value: { kind: 'primitive', javaType: 'int', value: index }, declaringClass,
})
const object = (className = 'unit.Widget', extra: Partial<ObjectAllocation> = {}): ObjectAllocation => ({
  ...base, type: 'ALLOCATE_OBJECT', objectId: 'unit/object', displayId: 1, className, fields: [], ...extra,
})
const array = (extra: Partial<ArrayAllocation> = {}): ArrayAllocation => ({
  ...base, type: 'ALLOCATE_ARRAY', objectId: 'unit/array', displayId: 2, elementType: 'int', elements: [], ...extra,
})
const metadata = (ownership: RuntimeTypeMetadata['ownership'], runtimeType = 'unit.Widget'): RuntimeTypeMetadata =>
  ({ ownership, runtimeType, packageName: 'unit' })

const canonicalCollections = [
  'java.util.ArrayList', 'java.util.LinkedList', 'java.util.Vector', 'java.util.Stack',
  'java.util.HashSet', 'java.util.LinkedHashSet', 'java.util.TreeSet', 'java.util.HashMap',
  'java.util.LinkedHashMap', 'java.util.TreeMap', 'java.util.IdentityHashMap', 'java.util.WeakHashMap',
  'java.util.PriorityQueue', 'java.util.ArrayDeque', 'java.util.concurrent.ConcurrentHashMap',
  'java.util.concurrent.ConcurrentSkipListMap', 'java.util.concurrent.ConcurrentSkipListSet',
  'java.util.concurrent.ConcurrentLinkedQueue', 'java.util.concurrent.ConcurrentLinkedDeque',
  'java.util.concurrent.CopyOnWriteArrayList', 'java.util.concurrent.CopyOnWriteArraySet',
  'java.util.concurrent.ArrayBlockingQueue', 'java.util.concurrent.LinkedBlockingQueue',
  'java.util.concurrent.LinkedBlockingDeque', 'java.util.concurrent.PriorityBlockingQueue',
  'java.util.concurrent.DelayQueue', 'java.util.concurrent.SynchronousQueue', 'java.util.concurrent.LinkedTransferQueue',
]

describe('first allocation presentation reservation', () => {
  it.each(canonicalCollections)('reserves exactly 5.2 × 9.93 × 2.3 for %s without inventing entries', className => {
    const allocation = object(className, { metadata: metadata('JDK', className) })
    expect(firstObjectPresentation(allocation)).toEqual({ kind: 'collection', projectData: false, size: [5.2, 9.93, 2.3] })
    expect(firstObjectPresentation({ ...allocation, fields: Array.from({ length: 30 }, (_, index) => field(index, 'Internal')) }))
      .toEqual(firstObjectPresentation(allocation))
  })

  it.each([
    'ArrayList', 'HashMap', 'unit.ArrayList', 'foreign.java.util.HashMap',
    'java.util.ArrayListSubclass', 'java.util.ArrayList$Custom', 'java.util.ArrayList<Widget>',
    'java.util.List', 'java.util.Set', 'java.util.Map', 'java.util.Queue', 'java.util.AbstractList',
    'java.util.Collections$EmptyList', 'java.util.ImmutableCollections$ListN',
    'java.util.concurrent.ConcurrentMap', 'java.util.concurrent.BlockingQueue',
    'java.util.concurrent.CustomCollection', 'java.lang.StringBuilder', 'unit.String',
  ])('keeps unknown, foreign, interface and alias %s ordinary', className => {
    expect(firstObjectPresentation(object(className, { source, metadata: metadata('JDK', 'java.util.ArrayList') })))
      .toEqual({ kind: 'object', projectData: false, size: [5.2, 1.95, 2.3] })
  })

  it('uses PROJECT metadata for every reservation kind even without source', () => {
    for (const event of [object(), object('java.util.HashMap'), array()]) {
      expect(firstObjectPresentation({ ...event, metadata: metadata('PROJECT') }).projectData).toBe(true)
    }
  })

  it('requires captured first source for JDK arrays, known collections and exact String types', () => {
    for (const event of [array(), object('java.util.ArrayList'), object('java.lang.String'), object('String')]) {
      for (const ownership of ['JDK', 'LIBRARY', 'SYNTHETIC'] as const) {
        const allocation = { ...event, metadata: metadata(ownership) }
        expect(firstObjectPresentation(allocation).projectData).toBe(false)
        expect(firstObjectPresentation({ ...allocation, source }).projectData).toBe(true)
      }
      expect(firstObjectPresentation({ ...event, source }).projectData).toBe(true)
    }
    expect(firstObjectPresentation(object('unit.Widget', { source })).projectData).toBe(false)
    expect(firstObjectPresentation(array({ elementType: 'java.util.ArrayList' })).kind).toBe('array')
  })

  it('preserves ordinary zero-field and inherited field-group dimensions exactly', () => {
    expect(firstObjectPresentation(object()).size).toEqual([5.2, 1.95, 2.3])
    const fields = [field(0, 'Base'), field(1, 'Base'), field(2, 'Derived'), field(3), field(4, '')]
    expect(firstObjectPresentation(object('unit.Widget', { fields })).size)
      .toEqual([5.2, 1.5 + .45 + 1.05 * 5 + .6 * 2, 2.3])
    const many = Array.from({ length: 30 }, (_, index) => field(index, `Owner${index}`))
    expect(firstObjectPresentation(object('unit.Widget', { fields: many })).size)
      .toEqual([5.2, 1.5 + .45 + 1.05 * 13 + .6 * 30, 2.3])
  })

  it.each([0, 1, 4, 5, 16, 17, 128, 129, 1_000_000])('preserves legacy array geometry at length %i', length => {
    const cols = Math.max(4, Math.min(16, length))
    const rows = length > 128 ? 8 : Math.ceil(length / cols)
    expect(firstObjectPresentation(array({ length })).size).toEqual([
      Math.max(5.2, cols * (1.55 + .08) - .08),
      .9 + (rows ? rows * (1.55 + .08) + .5 : .45),
      1.55 + .12,
    ])
  })

  it('uses the recorded element count only when length is absent, preserving explicit zero', () => {
    const elements: ArrayAllocation['elements'] = [{ kind: 'null' }, { kind: 'unavailable', reason: 'not recorded' }]
    expect(firstObjectPresentation(array({ elements })).size).toEqual(firstObjectPresentation(array({ length: 2 })).size)
    expect(firstObjectPresentation(array({ elements, length: 0 })).size).toEqual(firstObjectPresentation(array()).size)
    expect(firstObjectPresentation(array({ elements, length: 129, truncated: true })).size)
      .toEqual(firstObjectPresentation(array({ length: 1_000_000 })).size)
  })

  it('uses supplied tokens for all reservations without applying the library block override', () => {
    const tokens: WorldLayoutTokens = { ...worldTokens,
      object: { ...worldTokens.object, w: 6, header: 2, row: 1.25, pad: .5, depth: 3, libraryW: 99 },
      collection: { ...worldTokens.collection, rows: 4, pitch: .75, sizeRow: 1 },
      array: { ...worldTokens.array, cell: 2, gap: .25, titlePlate: 1, backplate: .5, indexLabel: .75, cellsPerRowMin: 2, cellsPerRowMax: 3 },
    }
    expect(firstObjectPresentation(object('java.util.TreeMap'), tokens).size).toEqual([6, 7.25, 3])
    expect(firstObjectPresentation(object('unit.Widget', { fields: [field(0, 'Base')] }), tokens).size).toEqual([6, 4.35, 3])
    expect(firstObjectPresentation(array({ length: 7 }), tokens).size).toEqual([6.5, 8.5, 2.5])
  })

  it('preserves legacy ordinary and array formulas across normalized synthetic sizes', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 1_000_000 }), (count, length) => {
      const fields = Array.from({ length: count }, (_, index) => field(index, index % 3 ? `Group${index % 7}` : undefined))
      const groups = new Set(fields.map(item => item.declaringClass).filter(Boolean)).size
      expect(firstObjectPresentation(object('unit.Widget', { fields })).size)
        .toEqual([5.2, 1.5 + .45 + 1.05 * Math.min(count, 13) + .6 * groups, 2.3])
      const cols = Math.max(4, Math.min(16, length)), rows = length > 128 ? 8 : Math.ceil(length / cols)
      expect(firstObjectPresentation(array({ length })).size)
        .toEqual([Math.max(5.2, cols * (1.55 + .08) - .08), .9 + (rows ? rows * (1.55 + .08) + .5 : .45), 1.55 + .12])
    }), { numRuns: 100 })
  })

  it('accepts only allocation events and remains unchanged when later observations are appended', () => {
    expectTypeOf<typeof firstObjectPresentation>().parameter(0)
      .toEqualTypeOf<Extract<TraceEvent, { type: 'ALLOCATE_OBJECT' | 'ALLOCATE_ARRAY' }>>()
    expectTypeOf<Parameters<typeof firstObjectPresentation>>().toEqualTypeOf<[
      Extract<TraceEvent, { type: 'ALLOCATE_OBJECT' | 'ALLOCATE_ARRAY' }>, WorldLayoutTokens?,
    ]>()
    const allocation = object('java.util.ArrayList')
    const initial = firstObjectPresentation(allocation)
    const events: TraceEvent[] = [allocation]
    const observation: Extract<TraceEvent, { type: 'OBJECT_OBSERVE' }> = {
      ...base, type: 'OBJECT_OBSERVE', seq: 1, eventId: 'unit/later', objectId: allocation.objectId, source,
      metadata: metadata('PROJECT'), fields: [field(0, 'Later')], library: { kind: 'LIST', size: 1, items: [{ kind: 'null' }] },
    }
    events.push(observation)
    expect(events).toHaveLength(2)
    expect(firstObjectPresentation(allocation)).toEqual(initial)
    expect(initial).toEqual({ kind: 'collection', projectData: false, size: [5.2, 9.93, 2.3] })
  })

  it('does not mutate a frozen allocation, its fields, source or ownership metadata', () => {
    const allocation = object('unit.Widget', { source, fields: [field(0, 'Base')], metadata: metadata('PROJECT') })
    const before = JSON.stringify(allocation)
    Object.freeze(allocation.fields[0].value)
    Object.freeze(allocation.fields[0])
    Object.freeze(allocation.fields)
    Object.freeze(allocation.source)
    Object.freeze(allocation.metadata)
    Object.freeze(allocation)
    const first = firstObjectPresentation(allocation), again = firstObjectPresentation(allocation)
    expect(first).toEqual(again)
    expect(first.size).not.toBe(again.size)
    expect(JSON.stringify(allocation)).toBe(before)
  })
})
