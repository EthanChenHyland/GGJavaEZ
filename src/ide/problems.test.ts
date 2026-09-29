import { describe, expect, it } from 'vitest'
import { mergeProblems } from './problems'
import type { CompileDiagnostic } from './contracts'

const diagnostic: CompileDiagnostic = { id: 'compiler', location: { path: 'src/Main.java', line: 3, column: 9 }, severity: 'error', message: 'Cannot resolve symbol', raw: 'genuine javac output' }
describe('combined Problems provenance', () => {
  it('preserves compiler text and distinguishes meaningful language problems', () => {
    const result = mergeProblems([diagnostic], [{ ...diagnostic, id: 'language', provider: 'language', message: 'Cannot  resolve symbol', raw: 'LSP' }, { ...diagnostic, id: 'different', provider: 'language', message: 'Wrong return type', raw: 'LSP' }])
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ provider: 'compiler', raw: 'genuine javac output' })
    expect(result[1].provider).toBe('language')
  })
  it('does not collapse differing positions or severities', () => {
    expect(mergeProblems([diagnostic], [{ ...diagnostic, location: { ...diagnostic.location, column: 10 }, provider: 'language' }, { ...diagnostic, severity: 'warning', provider: 'language' }])).toHaveLength(3)
  })
})
