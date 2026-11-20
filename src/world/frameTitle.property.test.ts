import fc from 'fast-check'
import { expect, it } from 'vitest'
import { frameIdentity, frameTitle } from './frameTitle'

const parameter = fc.constantFrom(
  { descriptor: 'I', display: 'int' }, { descriptor: '[I', display: 'int[]' },
  { descriptor: '[[Ljava/lang/String;', display: 'String[][]' }, { descriptor: 'J', display: 'long' },
  { descriptor: 'Lpkg/Outer$Inner;', display: 'Outer$Inner' }, { descriptor: 'Z', display: 'boolean' },
)
it('Property 29: titles preserve captured signature order and stable invocation identity (100 runs)', () => {
  fc.assert(fc.property(fc.nat(100_000), fc.array(parameter, { maxLength: 12 }), fc.constantFrom('work', '<init>', '<clinit>'), fc.integer({ min: 1, max: 100_000 }), (id, parameters, name, invocationNumber) => {
    const frame = { className: `pkg.Type$${id}`, methodName: name }
    const method = { owner: `pkg/Type$${id}`, name, descriptor: `(${parameters.map((p) => p.descriptor).join('')})V` }
    const before = structuredClone({ frame, method })
    const title = frameTitle(frame, { method })
    const type = `Type$${id}`
    expect(title).toBe(name === '<clinit>' ? `${type}.<clinit>()` : `${type}.${name === '<init>' ? type : name}(${parameters.map((p) => p.display).join(', ')})`)
    expect({ frame, method }).toEqual(before)
    // Rows/cursor are not title or identity inputs. Replay cannot renumber an Invocation.
    const replayed = { ...frame, cursor: 0, locals: {} }
    const later = { ...frame, cursor: 1000, locals: { newLocal: { name: 'newLocal', javaType: 'float' } } }
    expect(frameTitle(replayed, { method })).toBe(frameTitle(later, { method }))
    expect(frameIdentity(invocationNumber)).toBe(`#${invocationNumber}`)
    expect(frameIdentity(invocationNumber)).toBe(frameIdentity(invocationNumber))
    if (name !== '<clinit>') expect(frameTitle(frame)).toContain('⟨parameters not recorded⟩')
  }), { numRuns: 100 })
})
