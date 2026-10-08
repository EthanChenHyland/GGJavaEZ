import { expect, it } from 'vitest'
import { faceColumns, fitFaceTextHeight, fitFaceValue, singleLineFaceText, summarizeFaceValue } from './faceText'
it('bounds enlarged compact frame and heap text including mutation emphasis', () => {
  for (const height of [0.31, 0.44]) {
    expect(fitFaceTextHeight(0.29 * 1.55, height) * 1.06).toBeLessThan(height)
    expect(fitFaceTextHeight(0.16, height)).toBe(0.16)
  }
})
it('leaves fitting scalar/reference values exact and marks long summaries explicitly', () => {
  expect(summarizeFaceValue('18', 5)).toBe('18')
  expect(summarizeFaceValue('→ #17', 5)).toBe('→ #17')
  expect(summarizeFaceValue('"twelve observed fields"', 6)).toBe('"twel…')
})
it('truncates Unicode code points without broken surrogate glyphs', () => {
  expect(summarizeFaceValue('🟣🟦🟨🟥🟩', 4)).toBe('🟣🟦🟨…')
})
it('escapes multiline and invisible controls on compact faces without changing stored strings', () => {
  const original = 'a\nb\rc\td\u0000\u2028🟣'
  expect(singleLineFaceText(original)).toBe('a\\nb\\rc\\td\\u0000\\u2028🟣')
  for (const character of ['\n', '\r', '\t', '\u0000', '\u2028']) expect(summarizeFaceValue(original, 200)).not.toContain(character)
  expect(original).toContain('\n')
})
it('bounds arbitrary long identifiers and generic types with marked readable summaries', () => {
  for (const value of ['local'.repeat(40), 'Map<String,List<Map<Long,List<CharSequence>>>>']) {
    const fitted = fitFaceValue(value, 0.24, 1.2)
    expect(fitted.text.endsWith('…')).toBe(true)
    expect(fitted.size).toBeGreaterThanOrEqual(0.18)
    expect(Array.from(fitted.text).length * fitted.size * 0.6).toBeLessThanOrEqual(1.2)
  }
})
it('keeps a moderate nested class identity complete before abbreviating at the minimum font', () => {
  const fitted = fitFaceValue('DebugShape$Cell', 0.37, 3.12)
  expect(fitted.text).toBe('DebugShape$Cell')
  expect(fitted.size).toBeGreaterThanOrEqual(0.18)
  expect(fitted.size).toBeLessThan(0.37)
})
it.each([3.8, 5.1, 4.7])('keeps name/type/value columns disjoint on a %s-unit face', width => {
  const columns = faceColumns(width)
  expect(columns.left + columns.nameWidth).toBeLessThan(columns.typeX)
  expect(columns.typeX + columns.typeWidth).toBeLessThan(columns.valueX)
  expect(columns.valueX + columns.valueWidth).toBeLessThan(width / 2 - 0.14)
})
it('keeps short values exact and marks long values instead of shrinking them to illegible text', () => {
  expect(fitFaceValue('18', 0.24, 1.2)).toEqual({ text: '18', size: 0.24 })
  expect(fitFaceValue('→ #17', 0.24, 1.2).text).toBe('→ #17')
  const fitted = fitFaceValue('unavailable (local_capture_failed)', 0.29, 1.2)
  expect(fitted.text.endsWith('…')).toBe(true)
  expect(fitted.size).toBeGreaterThanOrEqual(0.18)
})
