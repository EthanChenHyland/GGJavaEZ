import { describe, expect, it } from 'vitest'
import type { RuntimeValue } from '../contracts/runtime'
import { assertAssignable, assertRuntimeValue, assertScalarValue, isLibrarySummary, isRuntimeValue, isScalarValue, isStringObservation, isTypeMetadata, runtimeValuesEqual } from './valueValidation'

const primitive = (javaType: string, value: unknown) => ({ kind: 'primitive', javaType, value })
describe('exact Java runtime values', () => {
  it.each([
    ['byte', -128], ['byte', 127], ['short', -32768], ['short', 32767],
    ['int', -2147483648], ['int', 2147483647],
    ['long', '-9223372036854775808'], ['long', '9223372036854775807'], ['long', '9007199254740993'],
    ['long', Number.MAX_SAFE_INTEGER], ['long', -Number.MAX_SAFE_INTEGER], ['long', '0'],
    ['float', 0.1], ['double', Number.MAX_VALUE], ['boolean', false], ['char', '\uD800'], ['char', '\uDC00'], ['char', '字'],
  ])('retains %s %s exactly through JSON', (javaType, v) => {
    const value = primitive(javaType as string, v)
    expect(isRuntimeValue(value)).toBe(true)
    expect(JSON.parse(JSON.stringify(value))).toEqual(value)
    expect(() => assertRuntimeValue(value)).not.toThrow()
  })
  it.each(['float', 'double'])('retains %s special labels', javaType => {
    for (const v of ['NaN', 'Infinity', '-Infinity', '-0.0']) {
      const value = primitive(javaType, v)
      expect(isRuntimeValue(value)).toBe(true)
      expect(JSON.parse(JSON.stringify(value))).toEqual(value)
    }
  })
  it.each([
    ['byte', -129], ['byte', 128], ['short', -32769], ['short', 32768], ['int', 2147483648], ['int', 1.5],
    ['long', '9223372036854775808'], ['long', '-9223372036854775809'], ['long', '01'], ['long', '-0'], ['long', '+1'],
    ['long', '1e3'], ['long', '1.0'], ['long', '9'.repeat(10000)], ['long', 9007199254740992], ['long', 1.5],
    ['float', 3.5e38], ['float', NaN], ['double', Infinity], ['double', '-0'], ['float', '+Infinity'], ['char', ''], ['char', '😀'], ['boolean', 0], ['void', 0],
  ])('rejects invalid %s %s', (javaType, v) => {
    const value = primitive(javaType as string, v)
    expect(isRuntimeValue(value)).toBe(false)
    expect(() => assertRuntimeValue(value)).toThrow('Invalid runtime value')
  })
  it('keeps unavailable distinct from uninitialized and enforces observed slot type', () => {
    const unavailable: RuntimeValue = { kind: 'unavailable', reason: 'not captured', javaType: 'long' }
    expect(isScalarValue(unavailable)).toBe(true)
    expect(runtimeValuesEqual(unavailable, { kind: 'uninitialized' })).toBe(false)
    expect(() => assertAssignable({ id: 'slot', javaType: 'long' }, unavailable)).not.toThrow()
    expect(() => assertAssignable({ id: 'slot', javaType: 'int' }, unavailable)).toThrow('Value type mismatch')
    expect(isRuntimeValue({ kind: 'unavailable', reason: '' })).toBe(false)
    const reference: RuntimeValue = { kind: 'reference', javaType: 'Base', objectId: 'child' }
    expect(() => assertAssignable({ id: 'slot', javaType: 'Base' }, reference)).not.toThrow()
    expect(() => assertAssignable({ id: 'slot', javaType: 'Child' }, reference)).toThrow('Value type mismatch')
    expect(() => assertScalarValue(reference)).toThrow('Invalid scalar value')
  })
  it('distinguishes signed zero and reference declared types without coercion', () => {
    expect(runtimeValuesEqual({ kind: 'primitive', javaType: 'double', value: -0 }, { kind: 'primitive', javaType: 'double', value: 0 })).toBe(false)
    expect(runtimeValuesEqual({ kind: 'primitive', javaType: 'long', value: '1' }, { kind: 'primitive', javaType: 'long', value: 1 })).toBe(false)
    expect(runtimeValuesEqual({ kind: 'unavailable', reason: 'a' }, { kind: 'unavailable', reason: 'b' })).toBe(false)
    expect(runtimeValuesEqual({ kind: 'reference', javaType: 'A', objectId: 'o' }, { kind: 'reference', javaType: 'B', objectId: 'o' })).toBe(false)
  })
  it('validates bounded observations and metadata', () => {
    expect(isLibrarySummary({ kind: 'LIST', size: 1000, items: Array(32).fill({ kind: 'null' }), truncated: true })).toBe(true)
    expect(isLibrarySummary({ kind: 'LIST', items: Array(33).fill({ kind: 'null' }) })).toBe(false)
    const entry = { key: { kind: 'null' }, value: { kind: 'null' } }
    expect(isLibrarySummary({ kind: 'MAP', size: 16, entries: Array(16).fill(entry) })).toBe(true)
    expect(isLibrarySummary({ kind: 'MAP', entries: Array(17).fill(entry) })).toBe(false)
    expect(isLibrarySummary({ kind: 'MAP', entries: Array(16).fill(entry), items: [{ kind: 'null' }] })).toBe(false)
    expect(isLibrarySummary({ kind: 'MAP', entries: [{ key: { kind: 'null' }, value: primitive('byte', 128) }] })).toBe(false)
    expect(isTypeMetadata({ ownership: 'PROJECT', runtimeType: 'p.Point', packageName: 'p', record: true, components: [{ name: 'x', javaType: 'int' }] })).toBe(true)
    expect(isTypeMetadata({ ownership: 'guess', runtimeType: 'Point', packageName: '' })).toBe(false)
    expect(isStringObservation({ value: 'abc', length: 1000, truncated: true })).toBe(true)
    expect(isStringObservation({ value: 'abc', length: 1000, truncated: false })).toBe(false)
    expect(isStringObservation({ value: 'abc', length: 1, truncated: true })).toBe(false)
  })
})
