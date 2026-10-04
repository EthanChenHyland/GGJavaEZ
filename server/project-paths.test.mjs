import { describe, expect, it } from 'vitest'
import { portableNameKey, projectPathParts, validatePortableComponent } from './project-paths.mjs'

describe('portable project path components (synthetic Windows rules on any host)', () => {
  it.each(['CON', 'con.java', 'PRN.txt', 'aux', 'NUL.tar.gz', 'COM1', 'COM9.txt', 'LPT1.java', 'lpt9', 'COM¹.txt', 'LPT²', 'COM³', 'CON .java', 'CONIN$', 'CONOUT$.log'])('rejects reserved Windows base %s', name => {
    expect(() => validatePortableComponent(name)).toThrowError(/reserved/)
  })

  it.each(['', '.', '..', 'trailing.', 'trailing ', 'name<', 'name>', 'a:b', 'a"b', 'a|b', 'a?b', 'a*b', 'a/b', 'a\\b', '\u0000', '\u001f', '\u007f', 'x'.repeat(256), 'é'.repeat(128), '.GGJAVAEZ-PROJECT.JSON', '.GGJAVAEZ-TMP-hidden'])('rejects illegal component %s', name => {
    expect(() => validatePortableComponent(name)).toThrowError()
    try { validatePortableComponent(name) } catch (error) { expect(error.status).toBe(400) }
  })

  it.each(['Main.java', 'COM0.java', 'COM10.txt', 'LPT10', 'connect', 'null.java', '.gitignore', 'a.b.c', 'λ.java', '😀.txt', ' space-prefix', 'with spaces.java', 'x'.repeat(255)])('preserves valid component %s exactly', name => {
    expect(validatePortableComponent(name)).toBe(name)
  })

  it('keeps confinement independent from portable validation for legacy imports and reads', () => {
    for (const value of ['src/CON.java', 'trailing./file ', 'a?/Main.java']) {
      expect(projectPathParts(value)).toEqual(value.split('/'))
      expect(() => projectPathParts(value, { portable: true })).toThrowError()
    }
    for (const value of ['/tmp/Main.java', 'C:/Main.java', 'src\\Main.java', '../Main.java', 'src/../Main.java', 'src//Main.java', './Main.java']) {
      expect(() => projectPathParts(value)).toThrowError()
    }
    expect(projectPathParts('src/main/java/org/demo/Main.java', { portable: true })).toEqual(['src', 'main', 'java', 'org', 'demo', 'Main.java'])
  })

  it('compares case and Unicode normalization conservatively without changing path spelling', () => {
    expect(portableNameKey('Main.java')).toBe(portableNameKey('MAIN.JAVA'))
    expect(portableNameKey('café')).toBe(portableNameKey('cafe\u0301'))
  })
})
