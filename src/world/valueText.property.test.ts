import fc from 'fast-check'
import { expect, it } from 'vitest'
import type { RuntimeObject, RuntimeValue } from '../contracts/runtime'
import { stringValueText, titleWithIdentity, truncateFrameText, valueText } from './valueText'

const capturedString = fc.array(fc.integer({ min: 0, max: 0xffff }), { maxLength: 100 }).map((codes) => codes.map((code) => String.fromCharCode(code)).join(''))
const scalar: fc.Arbitrary<RuntimeValue> = fc.oneof(
  fc.integer().map((value) => ({ kind: 'primitive' as const, javaType: 'int' as const, value })),
  fc.bigInt({ min: -9223372036854775808n, max: 9223372036854775807n }).map((value) => ({ kind: 'primitive' as const, javaType: 'long' as const, value: value.toString() })),
  fc.oneof(fc.double(), fc.constantFrom(-0, NaN, Infinity, -Infinity)).map((value) => ({ kind: 'primitive' as const, javaType: 'double' as const, value })),
  fc.boolean().map((value) => ({ kind: 'primitive' as const, javaType: 'boolean' as const, value })),
  fc.integer({ min: 0, max: 0xffff }).map((code) => ({ kind: 'primitive' as const, javaType: 'char' as const, value: String.fromCharCode(code) })),
  capturedString.map((value) => ({ kind: 'stringSummary' as const, javaType: 'String' as const, value })),
  fc.constant({ kind: 'null' as const }), fc.constant({ kind: 'uninitialized' as const }),
  fc.string().map((reason) => ({ kind: 'unavailable' as const, reason })),
)

function decodeChar(literal: string): string {
  const escapes: Record<string, string> = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', "'": "'", '"': '"', '\\': '\\' }
  return literal.slice(1, -1).replace(/\\(u[0-9a-f]{4}|[btnfr'"\\])/g, (_, escaped: string) => escaped.startsWith('u') ? String.fromCharCode(parseInt(escaped.slice(1), 16)) : escapes[escaped])
}

it('Property 30: exact values preserve captured distinctions and all String content, never an unobserved suffix (100 runs)', () => {
  fc.assert(fc.property(scalar, capturedString, fc.nat(10_000), fc.boolean(), (value, captured, omitted, truncated) => {
    const before = structuredClone(value)
    const text = valueText(value)
    expect(value).toEqual(before)
    if (value.kind === 'stringSummary') expect(JSON.parse(text.exact)).toBe(value.value)
    else if (value.kind === 'primitive') {
      if (value.javaType === 'char') expect(decodeChar(text.exact)).toBe(value.value)
      else if (typeof value.value === 'number') expect(Object.is(Number(text.exact), value.value)).toBe(true)
      else expect(text.exact).toBe(String(value.value))
      expect(text.observation).toBe('OBSERVED')
    } else if (value.kind === 'null') expect(text).toMatchObject({ kind: 'null', exact: 'null', observation: 'OBSERVED' })
    else expect(text).toMatchObject({ kind: 'not-recorded', exact: '⟨not recorded⟩', observation: 'UNAVAILABLE' })
    const length = captured.length + omitted
    const string = stringValueText({ value: captured, length, truncated })
    expect(JSON.parse(string.exact)).toBe(captured)
    expect(string.observation).toBe(truncated ? 'TRUNCATED' : 'OBSERVED')
    expect(string.recordedLength).toBe(length)
    expect(stringValueText({ value: captured })).not.toHaveProperty('recordedLength')
    const target: RuntimeObject = { id: `id$${omitted}`, displayId: omitted, className: 'pkg.Runtime$Type', fields: {}, allocatedAt: 'observed' }
    const ref: RuntimeValue = { kind: 'reference', objectId: target.id, javaType: 'Object' }
    expect(valueText(ref, { target })).toMatchObject({ kind: 'reference', targetId: target.id, targetType: target.className, exact: `Runtime$Type #${omitted}` })
    expect(valueText(ref)).toMatchObject({ kind: 'not-recorded', observation: 'UNAVAILABLE' })
  }), { numRuns: 100 })
})

const longText = fc.array(fc.oneof(fc.integer({ min: 65, max: 90 }), fc.integer({ min: 0x1f600, max: 0x1f64f })), { minLength: 29, maxLength: 150 }).map((codes) => codes.map((code) => String.fromCodePoint(code)).join(''))
it('Property 31: middle truncation has exactly 28 characters and never truncates identity (100 runs)', () => {
  fc.assert(fc.property(longText, fc.nat(1_000_000), (title, id) => {
    const shown = truncateFrameText(title)
    const original = Array.from(title), chars = Array.from(shown)
    expect(chars).toHaveLength(28)
    expect(chars.filter((char) => char === '…')).toHaveLength(1)
    expect(chars[0]).toBe(original[0])
    expect(chars.at(-1)).toBe(original.at(-1))
    expect(chars.slice(0, 14)).toEqual(original.slice(0, 14))
    expect(chars.slice(-13)).toEqual(original.slice(-13))
    const identity = `#${id}`
    expect(titleWithIdentity(title, identity)).toEqual({ title: shown, exactTitle: title, identity })
    expect(truncateFrameText('short')).toBe('short')
    const object: RuntimeObject = { id: `canonical$${id}`, displayId: id, className: title, fields: {}, allocatedAt: 'allocation' }
    const ref: RuntimeValue = { kind: 'reference', javaType: 'Object', objectId: object.id }
    expect(valueText(ref, { target: object, context: 'frame' })).toMatchObject({ text: `${shown} ${identity}`, exact: `${title} ${identity}`, targetId: object.id })
  }), { numRuns: 100 })
})
