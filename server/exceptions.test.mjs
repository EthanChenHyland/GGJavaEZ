import { describe, expect, it } from 'vitest'
import { parseRuntimeException } from './exceptions.mjs'

describe('parseRuntimeException', () => {
  it('locates sources under a source root only when the package suffix is unique', () => {
    const output = 'Exception in thread "main" java.lang.RuntimeException: bad\n\tat demo.Main.main(Main.java:3)'
    expect(parseRuntimeException(output, ['src/demo/Main.java']).frames[0].location?.path).toBe('src/demo/Main.java')
    expect(parseRuntimeException(output, ['src/demo/Main.java', 'test/demo/Main.java']).frames[0].location).toBeNull()
  })
  it('preserves the raw JVM trace and maps only known project source frames', () => {
    const stderr = [
      'diagnostic before the crash',
      'Exception in thread "main" java.lang.IllegalArgumentException: bad input',
      '\tat demo.Main.parse(Main.java:12)',
      '\tat demo.Main.main(Main.java:4)',
      '\tat java.base/java.lang.Thread.run(Thread.java:1583)',
      'unrelated stderr after the trace',
    ].join('\n')
    const exception = parseRuntimeException(stderr, ['demo/Main.java'])
    expect(exception.type).toBe('java.lang.IllegalArgumentException')
    expect(exception.message).toBe('bad input')
    expect(exception.rawStackTrace).toContain('Exception in thread "main"')
    expect(exception.rawStackTrace).not.toContain('unrelated stderr')
    expect(exception.frames[0]).toEqual({
      className: 'demo.Main', methodName: 'parse', fileName: 'Main.java', line: 12,
      location: { path: 'demo/Main.java', line: 12, column: null },
      raw: '\tat demo.Main.parse(Main.java:12)',
    })
    expect(exception.frames[2].location).toBeNull()
  })

  it('accepts caused-by and native/unknown-source frames without inventing locations', () => {
    const exception = parseRuntimeException([
      'Exception in thread "main" java.lang.ExceptionInInitializerError',
      '\tat demo.Main.main(Main.java:2)',
      'Caused by: java.lang.IllegalStateException: broken',
      '\tat demo.Helper.<clinit>(Helper.java:7)',
      '\tat java.base/java.lang.Class.forName0(Native Method)',
      '\t... 1 more',
    ].join('\n'), ['demo/Main.java', 'demo/Helper.java'])
    expect(exception.message).toBe('')
    expect(exception.frames.map((frame) => frame.line)).toEqual([2, 7, null])
    expect(exception.frames[1].location.path).toBe('demo/Helper.java')
    expect(exception.frames[2].fileName).toBeNull()
    expect(exception.rawStackTrace).toContain('Caused by:')
  })

  it('returns null for ordinary stderr and keeps bare uncaught exception output', () => {
    expect(parseRuntimeException('warning: something failed\n')).toBeNull()
    expect(parseRuntimeException('java.lang.RuntimeException: boom\n\tat Main.main(Main.java:3)')?.type)
      .toBe('java.lang.RuntimeException')
  })
})
