import { expect, it } from 'vitest'
import { frameIdentity, frameTitle } from './frameTitle'

it('uses captured declaration order, never local-row order or argument values', () => {
  const frame = { className: 'pkg.Main', methodName: 'work' }
  expect(frameTitle(frame, { method: { owner: 'pkg/Main', name: 'work', descriptor: '(I[Ljava/lang/String;)V' } })).toBe('Main.work(int, String[])')
  expect(frameTitle(frame, { parameterTypes: [] })).toBe('Main.work()')
  expect(frameTitle(frame)).toBe('Main.work(⟨parameters not recorded⟩)')
})
it('names constructors and static initializers without changing binary identity', () => {
  expect(frameTitle({ className: 'pkg.Person', methodName: '<init>' }, { parameterTypes: ['int'] })).toBe('Person.Person(int)')
  expect(frameTitle({ className: 'pkg.Outer$Inner', methodName: '<init>' }, { parameterTypes: [], typeDisplay: { sourceName: 'Outer.Inner' } })).toBe('Outer.Inner.Inner()')
  expect(frameTitle({ className: 'pkg.Outer$1', methodName: '<clinit>' })).toBe('Outer$1.<clinit>()')
  expect(frameTitle({ className: 'I', methodName: 'work' }, { parameterTypes: [] })).toBe('I.work()')
})
it('uses the stable invocation number supplied by the Recording index', () => {
  expect(frameIdentity(17)).toBe('#17')
  expect(frameIdentity(1)).toBe('#1')
})
