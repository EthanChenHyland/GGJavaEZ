import { expect, it } from 'vitest'
import { fitFaceTextHeight, summarizeFaceValue } from './faceText'
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
