import { describe, expect, it } from 'vitest'
import type { SceneIo } from '../contracts/world'
import { ioPortPreview } from './ioPortText'

type PreviewInput = Pick<SceneIo, 'id' | 'preview' | 'consumedText'>
const input = (id: SceneIo['id'], preview: string, consumedText: string | null = null): PreviewInput => Object.freeze({ id, preview, consumedText })

describe('I/O captured preview content contract', () => {
  it('treats null stdin as unavailable and never substitutes the last consumed line', () => {
    expect(ioPortPreview(input('stdin', 'old consumed line', null))).toEqual({
      text: '', capturedText: '', displayText: '', sourceTruncated: false, available: false,
    })
    expect(ioPortPreview(input('stdin', 'stale preview', 'current edge'))).toEqual({
      text: 'current edge', capturedText: 'current edge', displayText: 'current edge', sourceTruncated: false, available: true,
    })
    expect(ioPortPreview(input('stdin', 'old consumed line', null)).available).toBe(false)
  })

  it('distinguishes captured empty stdin from absent consumption, with no invented placeholder', () => {
    expect(ioPortPreview(input('stdin', 'unrelated summary', ''))).toEqual({
      text: '', capturedText: '', displayText: '', sourceTruncated: false, available: true,
    })
  })

  it.each(['stdout', 'stderr'] as const)('keeps empty %s available and leaves the exact upstream preview untouched', id => {
    expect(ioPortPreview(input(id, '', 'stdin data must not leak'))).toEqual({
      text: '', capturedText: '', displayText: '', sourceTruncated: false, available: true,
    })
    expect(ioPortPreview(input(id, '  exact whitespace  ', 'ignored'))).toEqual({
      text: '  exact whitespace  ', capturedText: '  exact whitespace  ', displayText: '  exact whitespace  ', sourceTruncated: false, available: true,
    })
  })

  it('preserves exactly 60 raw code points and truncates only when the consuming edge has a 61st', () => {
    const sixty = 'x'.repeat(59) + '😀'
    const exact = ioPortPreview(input('stdin', 'ignored', sixty))
    expect(exact).toEqual({ text: sixty, capturedText: sixty, displayText: 'x'.repeat(59) + '\\ud83d\\ude00', sourceTruncated: false, available: true })
    const bounded = ioPortPreview(input('stdin', 'ignored', sixty + 'not in prefix'))
    expect(bounded).toEqual({ text: sixty + '…', capturedText: sixty, displayText: 'x'.repeat(59) + '\\ud83d\\ude00…', sourceTruncated: true, available: true })
    expect(Array.from(bounded.capturedText)).toHaveLength(60)
    expect(bounded.capturedText.length).toBe(61) // UTF-16 length is not the source budget.
    expect(bounded.capturedText.endsWith('😀')).toBe(true)
  })

  it.each(['stdout', 'stderr'] as const)('recognizes the derived 61st code point on %s without dropping a captured ellipsis', id => {
    const captured = '😀'.repeat(59) + '…'
    const exact = ioPortPreview(input(id, captured))
    expect(exact.text).toBe(captured)
    expect(exact.capturedText).toBe(captured)
    expect(exact.sourceTruncated).toBe(false)
    const bounded = ioPortPreview(input(id, captured + '…'))
    expect(bounded.text).toBe(captured + '…')
    expect(bounded.capturedText).toBe(captured)
    expect(bounded.displayText).toBe('\\ud83d\\ude00'.repeat(59) + '……')
    expect(bounded.sourceTruncated).toBe(true)
    expect(Array.from(bounded.capturedText)).toHaveLength(60)
  })

  it('does not mistake a short literal ellipsis or 60th-position ellipsis for the source marker', () => {
    for (const preview of ['…', 'literal…', 'x'.repeat(59) + '…']) {
      const result = ioPortPreview(input('stdout', preview))
      expect(result.capturedText).toBe(preview)
      expect(result.text).toBe(preview)
      expect(result.sourceTruncated).toBe(false)
    }
    const consumed = ioPortPreview(input('stdin', '', 'x'.repeat(59) + '…' + 'more'))
    expect(consumed.capturedText).toBe('x'.repeat(59) + '…')
    expect(consumed.text).toBe('x'.repeat(59) + '……')
    expect(consumed.sourceTruncated).toBe(true)
  })

  it('escapes controls, quotes and backslashes only in displayText and keeps exact copy bytes', () => {
    const raw = ' \t\r\n\b\f\u0000\u000b\u0085"\\'
    const display = ' \\t\\r\\n\\b\\f\\u0000\\u000b\\u0085\\"\\\\'
    for (const id of ['stdin', 'stdout', 'stderr'] as const) {
      expect(ioPortPreview(input(id, raw, raw))).toEqual({
        text: raw, capturedText: raw, displayText: display, sourceTruncated: false, available: true,
      })
    }
  })

  it('takes the 60-code-point source bound before Java escaping expands controls', () => {
    const raw = '\n'.repeat(60)
    const result = ioPortPreview(input('stdin', '', raw + '\tremaining'))
    expect(result.capturedText).toBe(raw)
    expect(result.text).toBe(raw + '…')
    expect(result.displayText).toBe('\\n'.repeat(60) + '…')
    expect(result.sourceTruncated).toBe(true)
  })

  it('preserves combining characters and lone surrogates rather than normalizing captured text', () => {
    const raw = 'e\u0301\ud800'
    expect(ioPortPreview(input('stdin', '', raw))).toEqual({
      text: raw, capturedText: raw, displayText: 'e\u0301\\ud800', sourceTruncated: false, available: true,
    })
    // Source contract counts code points, not grapheme clusters; no NFC coercion.
    expect(ioPortPreview(input('stdin', '', 'e\u0301'.repeat(31))).capturedText).toBe('e\u0301'.repeat(30))
  })

  it('refreshes same-line-count stdout content without retaining a previous preview', () => {
    const old = Object.freeze({ ...input('stdout', 'earlier partial line'), lines: 7 })
    const next = Object.freeze({ ...input('stdout', 'later partial line'), lines: 7 })
    expect(ioPortPreview(old).capturedText).toBe('earlier partial line')
    expect(ioPortPreview(next).capturedText).toBe('later partial line')
    expect(old.lines).toBe(next.lines)
    expect(ioPortPreview(old).capturedText).toBe('earlier partial line')
  })

  it('keeps the upstream 60 bound separate from any later face fit', () => {
    const captured = 'W'.repeat(60)
    const source = input('stdout', captured + '…')
    const result = ioPortPreview(source)
    // A caller may show a much shorter face, but that is not captured/copy text.
    const faceText = result.displayText.slice(0, 4) + '…'
    expect(faceText).not.toBe(result.text)
    expect(result).toEqual({ text: captured + '…', capturedText: captured, displayText: captured + '…', sourceTruncated: true, available: true })
    expect(ioPortPreview(input('stdout', 'short')).sourceTruncated).toBe(false)
    expect(source.preview).toBe(captured + '…')
    expect(Object.isFrozen(source)).toBe(true)
  })
})
