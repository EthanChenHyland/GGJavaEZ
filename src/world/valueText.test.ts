import { describe, expect, it } from 'vitest'
import type { RuntimeObject, RuntimeValue } from '../contracts/runtime'
import { escapeJava, stringValueText, titleWithIdentity, truncateFrameText, valueText } from './valueText'

const object = (extra: Partial<RuntimeObject> = {}): RuntimeObject => ({ id: 'canonical$object:17', displayId: 17, className: 'pkg.Runtime$Type', fields: {}, allocatedAt: 'allocation', ...extra })
describe('valueText', () => {
  it.each([
    ['int', 18, '18'], ['byte', -128, '-128'], ['short', 32767, '32767'], ['long', '9223372036854775807', '9223372036854775807'],
    ['boolean', false, 'false'], ['double', -0, '-0.0'], ['float', 1, '1.0'], ['double', NaN, 'NaN'], ['double', Infinity, 'Infinity'], ['float', -Infinity, '-Infinity'],
    ['char', '\n', "'\\n'"], ['char', '\u0000', "'\\u0000'"], ['char', "'", "'\\''"], ['char', '\\', "'\\\\'"],
  ] as const)('formats captured %s %s as a Java literal', (javaType, value, exact) => {
    expect(valueText({ kind: 'primitive', javaType, value })).toMatchObject({ kind: 'primitive', exact, text: exact, observation: 'OBSERVED' })
  })

  it('keeps unavailable distinct from null, zero, false and an observed empty String', () => {
    for (const value of [undefined, { kind: 'uninitialized' } as RuntimeValue, { kind: 'unavailable', reason: 'Observer stopped' } as RuntimeValue]) {
      expect(valueText(value)).toMatchObject({ kind: 'not-recorded', text: '⟨not recorded⟩', observation: 'UNAVAILABLE' })
    }
    expect(valueText({ kind: 'null' })).toMatchObject({ kind: 'null', text: 'null', observation: 'OBSERVED' })
    expect(stringValueText({ value: '' })).toMatchObject({ kind: 'string', exact: '""', observation: 'OBSERVED' })
    expect(stringValueText(undefined).observation).toBe('UNAVAILABLE')
  })

  it('escapes every captured String code unit and never claims unrecorded length', () => {
    const captured = 'quote " slash \\\n\r\t\b\f\u0000\ud800😀'
    const formatted = valueText({ kind: 'stringSummary', javaType: 'String', value: captured })
    expect(JSON.parse(formatted.exact)).toBe(captured)
    expect(formatted).not.toHaveProperty('recordedLength')
    expect(escapeJava('\u0000')).toBe('\\u0000')
  })

  it('separates face preview truncation from recorder truncation; exact exposes captured content only', () => {
    const captured = 'a'.repeat(60)
    const face = stringValueText({ value: captured, length: 100, truncated: true })
    expect(face).toMatchObject({ text: `"${'a'.repeat(48)}…" (100 chars)`, exact: `"${captured}"`, observation: 'TRUNCATED', recordedLength: 100 })
    expect(stringValueText({ value: captured }).observation).toBe('OBSERVED')
    expect(stringValueText({ value: captured }, { context: 'exact' }).text).toBe(`"${captured}"`)
    expect(Array.from(stringValueText({ value: captured }, { context: 'frame' }).text)).toHaveLength(28)
  })

  it('uses recorded target runtime type and display identity instead of the reference static type', () => {
    const target = object()
    const ref: RuntimeValue = { kind: 'reference', javaType: 'java.lang.Object', objectId: target.id }
    expect(valueText(ref, { target })).toMatchObject({ kind: 'reference', text: 'Runtime$Type #17', targetId: target.id, targetType: 'pkg.Runtime$Type' })
    expect(valueText(ref)).toMatchObject({ kind: 'not-recorded', observation: 'UNAVAILABLE' })
    expect(valueText(ref, { target: object({ id: 'wrong-object' }) }).observation).toBe('UNAVAILABLE')
  })

  it('keeps String reference identity and every captured character while marking recorder truncation', () => {
    const target = object({ className: 'java.lang.String', string: { value: 'part\n', length: 40, truncated: true } })
    expect(valueText({ kind: 'reference', javaType: 'String', objectId: target.id }, { target })).toMatchObject({
      kind: 'reference', text: '"part\\n" (40 chars) #17', exact: '"part\\n" · String #17', targetId: target.id, observation: 'TRUNCATED', recordedLength: 40,
    })
  })

  it('shows collection counts and array lengths only when recorded, preserving partial observation', () => {
    const ref: RuntimeValue = { kind: 'reference', javaType: 'Object', objectId: 'canonical$object:17' }
    const list = object({ className: 'java.util.ArrayList', library: { kind: 'LIST', size: 3, items: [{ kind: 'null' }], truncated: true } })
    expect(valueText(ref, { target: list })).toMatchObject({ text: 'List · size 3 #17', observation: 'PARTIALLY_OBSERVED' })
    expect(valueText(ref, { target: object({ library: { kind: 'LIST' } }) }).text).toBe('List · size not recorded #17')
    const array = object({ array: { elementType: 'int[]', length: 2, elements: [], truncated: true } })
    expect(valueText(ref, { target: array })).toMatchObject({ text: 'int[2][] #17', observation: 'PARTIALLY_OBSERVED' })
  })

  it('truncates frame text in the middle and truncates titles before an unabridged identity', () => {
    const title = 'Front' + 'x'.repeat(60) + 'Back'
    expect(truncateFrameText(title)).toHaveLength(28)
    expect(truncateFrameText(title)).toMatch(/^Front.*….*Back$/)
    expect(titleWithIdentity(title, '#12345678901234567890')).toEqual({ title: truncateFrameText(title), exactTitle: title, identity: '#12345678901234567890' })
    const target = object({ className: title })
    expect(valueText({ kind: 'reference', javaType: 'Object', objectId: target.id }, { target, context: 'frame' }).text).toBe(`${truncateFrameText(title)} #17`)
  })
})
