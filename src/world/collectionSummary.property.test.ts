import { expect, it } from 'vitest'
import fc from 'fast-check'
import type { RuntimeLibrarySummary, RuntimeObject, RuntimeValue } from '../contracts/runtime'
import type { WorldAnchor } from '../contracts/worldV2'
import { collectionSummary } from './collectionSummary'
import { valueText } from './valueText'

const anchor: WorldAnchor = { entityId: 'c', region: 'heap', position: [0, 0, 0], size: [5.2, 9.93, 2.3], ports: {}, bodyPort: [0, 0, 1.15] }
const captured: fc.Arbitrary<RuntimeValue> = fc.oneof(
  fc.integer().map(value => ({ kind: 'primitive' as const, javaType: 'int' as const, value })),
  fc.boolean().map(value => ({ kind: 'primitive' as const, javaType: 'boolean' as const, value })),
  fc.string().map(value => ({ kind: 'stringSummary' as const, javaType: 'String' as const, value })),
  fc.constant({ kind: 'null' as const }), fc.constant({ kind: 'unavailable' as const, reason: 'not captured' }),
)
const obj = (library: RuntimeLibrarySummary): RuntimeObject => ({ id: 'c', displayId: 17, className: 'demo.Captured',
  fields: {}, allocatedAt: 'allocation', observedAt: 'observation', library })
const context = { cursor: 5, eventSeq: (id: string) => id === 'allocation' ? 1 : id === 'observation' ? 3 : null, objects: {} }

it('Property 25 collection clauses: order/size/omission agree with captured RuntimeState (100 runs)', () => {
  fc.assert(fc.property(fc.constantFrom('LIST', 'SET', 'QUEUE', 'DEQUE'),
    fc.array(captured, { maxLength: 32 }), fc.nat(100000), (kind, items, omitted) => {
      const runtime = obj({ kind, size: items.length + omitted, items, truncated: omitted > 0 })
      const before = structuredClone(runtime)
      const scene = collectionSummary(runtime, anchor, context)!
      expect(scene.size).toBe(items.length + omitted)
      expect(scene.recordedEntries).toBe(items.length)
      expect(scene.size - scene.recordedEntries).toBe(omitted)
      expect(scene.entries.map(entry => entry.value)).toEqual(items.map(value => valueText(value, { context: 'object', objects: {} })))
      expect(new Set(scene.entries.map(entry => entry.slotId)).size).toBe(items.length)
      expect(scene.entries.every(entry => entry.port === null)).toBe(true)
      expect(scene.mutation).toBeNull()
      expect(runtime).toEqual(before)
    }), { numRuns: 100 })
})

it('Property 40 collection summary: map positions/keys/values never derive identity from equal content (100 runs)', () => {
  fc.assert(fc.property(fc.array(fc.record({ key: captured, value: captured }), { maxLength: 32 }),
    fc.nat(100000), (entries, omitted) => {
      const scene = collectionSummary(obj({ kind: 'MAP', size: entries.length + omitted, entries }), anchor, context)!
      expect(scene.recordedEntries).toBe(entries.length)
      expect(scene.entries.map(entry => entry.slotId)).toEqual(entries.map((_, index) => `c:summary:entry:${index}:value`))
      for (let index = 0; index < entries.length; index++) {
        expect(scene.entries[index].key).toEqual(valueText(entries[index].key, { context: 'object', objects: {} }))
        expect(scene.entries[index].value).toEqual(valueText(entries[index].value, { context: 'object', objects: {} }))
        expect(scene.entries[index].evidence).toMatchObject({ introducedSeq: null, changedSeq: null, eventIds: ['observation'] })
      }
      expect(scene.size - scene.recordedEntries).toBe(omitted)
    }), { numRuns: 100 })
})

it('Property 40 collection summary: fixed captured-position ports and structural-only overflow (100 runs)', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 32 }), fc.nat(100000), (count, omitted) => {
    const target: RuntimeObject = { ...obj({ kind: 'OPAQUE' }), id: 'target' }
    const items: RuntimeValue[] = Array.from({ length: count }, () => ({ kind: 'reference', javaType: 'Object', objectId: 'target' }))
    const runtime = obj({ kind: 'LIST', size: count + omitted, items })
    const scene = collectionSummary(runtime, anchor, { ...context, objects: { target } })!
    expect(scene.entries.filter(entry => entry.port !== null)).toHaveLength(Math.min(24, count))
    for (let index = 0; index < count; index++) {
      expect(scene.entries[index].value).toMatchObject({ kind: 'reference', targetId: 'target' })
      const port = scene.entries[index].port
      if (index >= 24) expect(port).toBeNull()
      else {
        expect(port![0]).toBeCloseTo(-2.6 + (Math.floor(index / 12) + 0.5) * 2.6)
        expect(port![1]).toBeCloseTo(9.93 / 2 - 1.5 - 0.7 - (index % 12 + 0.5) * 0.56)
        expect(port![2]).toBeCloseTo(1.15+.06) // actual chip front, not the covered body face
      }
    }
    expect(collectionSummary(runtime, anchor, { ...context, objects: { target } })).toEqual(scene)
  }), { numRuns: 100 })
})
