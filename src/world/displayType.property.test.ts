import fc from 'fast-check'
import { expect, it } from 'vitest'
import { describeType, displayType } from './displayType'

it('Property 32: canonical JVM keys remain byte-identical; only recorded metadata changes display (100 runs)', () => {
  fc.assert(fc.property(fc.nat(100_000), fc.integer({ min: 0, max: 4 }), fc.constantFrom('literal', 'nested', 'anonymous'), fc.boolean(), (id, dimensions, kind, recordedGenerics) => {
    const name = kind === 'anonymous' ? `Outer$${id}` : kind === 'nested' ? `Outer$Inner${id}` : `Money$Dollar${id}`
    const binary = `pkg.${name}`
    const canonical = dimensions ? '['.repeat(dimensions) + `Lpkg/${name};` : binary
    const before = canonical
    const plain = describeType(canonical)
    expect(plain.canonical).toBe(before)
    expect(plain.display).toBe(name + '[]'.repeat(dimensions))
    expect(plain.display).toContain('$')
    const options = recordedGenerics ? { recordedGenericArguments: ['Ljava/lang/String;'] } : {}
    expect(describeType(canonical, options)).toEqual({ canonical, display: name + (recordedGenerics ? '<String>' : '') + '[]'.repeat(dimensions) })
    const confirmed = describeType(canonical, { sourceName: 'Outer.Inner' })
    expect(confirmed.canonical).toBe(canonical)
    expect(confirmed.display).toBe('Outer.Inner' + '[]'.repeat(dimensions))
    // Equal labels do not imply equal canonical identity or a reversible name codec.
    expect(describeType(`other.${name}`, { sourceName: 'Outer.Inner' }).display).toBe('Outer.Inner')
    expect(describeType(`other.${name}`, { sourceName: 'Outer.Inner' }).canonical).not.toBe(canonical)
    expect(displayType('I', { representation: 'binary' })).toBe('I')
    expect(displayType('I', { representation: 'descriptor' })).toBe('int')
  }), { numRuns: 100 })
})
