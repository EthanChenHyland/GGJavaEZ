import { expect, it } from 'vitest'
import { describeType, displayType, methodParameterTypes } from './displayType'

it('keeps hidden-class names and their recorded VM suffix separate from package separators', () => {
  const canonical = 'pkg.Worker$$Lambda/0x000000010014ea68'
  expect(describeType(canonical)).toEqual({ canonical, display: 'Worker$$Lambda/0x000000010014ea68' })
  expect(displayType(canonical, { simple: false })).toBe(canonical)
  expect(displayType('pkg/Worker$$Lambda/0x000000010014ea68', { representation: 'binary' })).toBe('Worker$$Lambda/0x000000010014ea68')
  expect(displayType('[Lpkg/Worker$$Lambda/0x000000010014ea68;')).toBe('Worker$$Lambda/0x000000010014ea68[]')
  expect(displayType(canonical + '[][]')).toBe('Worker$$Lambda/0x000000010014ea68[][]')
  expect(displayType(canonical, { sourceName: 'RecordedWorker' })).toBe('RecordedWorker')
})

it('formats JVM arrays and objects without changing canonical identity', () => {
  expect(describeType('[[Lpkg/Outer$Inner;')).toEqual({ canonical: '[[Lpkg/Outer$Inner;', display: 'Outer$Inner[][]' })
  expect(displayType('[[I')).toBe('int[][]')
  expect(displayType('Ljava/lang/String;')).toBe('String')
  expect(displayType('I')).toBe('I') // Valid binary class name; descriptor spelling needs explicit provenance.
  expect(displayType('I', { representation: 'descriptor' })).toBe('int')
})
it('keeps dollar identifiers and anonymous names unless source metadata supplies a display spelling', () => {
  expect(displayType('pkg.Cash$Money')).toBe('Cash$Money')
  expect(displayType('pkg.Outer$1')).toBe('Outer$1')
  expect(describeType('pkg.Outer$Inner', { sourceName: 'Outer.Inner' })).toEqual({ canonical: 'pkg.Outer$Inner', display: 'Outer.Inner' })
})
it('adds generic arguments only from supplied captured metadata, never from an erased descriptor', () => {
  expect(displayType('Ljava/util/List;')).toBe('List')
  expect(displayType('Ljava/util/List;', { recordedGenericArguments: ['Ljava/lang/String;'] })).toBe('List<String>')
  expect(displayType('java.util.Map<String, Integer>')).toBe('Map<String, Integer>')
})
it('reads parameter descriptors in declaration order and rejects incomplete/malformed signatures', () => {
  expect(methodParameterTypes('(I[[Ljava/lang/String;J)Ljava/lang/Object;')).toEqual(['int', 'java.lang.String[][]', 'long'])
  expect(methodParameterTypes('()V')).toEqual([])
  for (const invalid of ['(V)V', '(I)', '(I)Vjunk', '(L;)V', '(Ljava/lang/String)V', 'I)V', '([V)V']) expect(methodParameterTypes(invalid)).toBeNull()
})
