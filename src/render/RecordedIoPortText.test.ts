import { expect, it } from 'vitest'
import { world } from '../theme/tokens'
import { ioFaceTextInset, ioFaceTextSize, recordedIoPortText } from './RecordedIoPortText'
import { fitWorldText } from './text/textSystem'

const [width] = world.io.size

it('shows named channels and exact ordinary counts, without stale or invented input', () => {
  expect(recordedIoPortText({ id: 'stdout', lines: 142, preview: 'READY', consumedText: null }, width)).toEqual(['stdout 142', 'READY'])
  expect(recordedIoPortText({ id: 'stderr', lines: 23, preview: 'warn', consumedText: null }, width)).toEqual(['stderr 23', 'warn'])
  expect(recordedIoPortText({ id: 'stdin', lines: 1, preview: 'previous', consumedText: null }, width)).toEqual(['stdin 1', '—'])
  expect(recordedIoPortText({ id: 'stdin', lines: 1, preview: 'previous', consumedText: '' }, width)).toEqual(['stdin 1', '""'])
  expect(recordedIoPortText({ id: 'stdin', lines: 1, preview: 'previous', consumedText: '007' }, width)).toEqual(['stdin 1', '007'])
})

it('fits the latest excerpt without splitting an escape or adding another truncation in WorldText', () => {
  const fitted = (text: string) => fitWorldText(text, width - 2 * ioFaceTextInset, ioFaceTextSize, 500, 0, Infinity, 'end')
  for (const preview of ['note ' + 'A'.repeat(55) + '…', 'note ' + '\u0000'.repeat(15), 'note ' + '😀'.repeat(20)]) {
    const io = Object.freeze({ id: 'stderr' as const, lines: 10341, preview, consumedText: null })
    const [header, excerpt] = recordedIoPortText(io, width)
    expect(excerpt).toMatch(/^note (?:A+)?…$/)
    expect(fitted(header)).toBe(header)
    expect(fitted(excerpt)).toBe(excerpt)
    expect(io.preview).toBe(preview)
  }
  expect(recordedIoPortText({ id: 'stdout', lines: 12, preview: 'real…', consumedText: null }, width)[1]).toBe('real…')
  expect(recordedIoPortText({ id: 'stdout', lines: 12, preview: 'next', consumedText: null }, width)[1]).toBe('next')
})

it('uses a labeled lower bound only when a wider exact line count does not fit', () => {
  const source = Object.freeze({ id: 'stdout' as const, lines: 1234567, preview: 'latest', consumedText: null })
  const [header, excerpt] = recordedIoPortText(source, width)
  const count = header.match(/^out (\d+)(k|M)\+$/)
  expect(count).not.toBeNull()
  const unit = count![2] === 'k' ? 1000 : 1000000
  const lower = Number(count![1]) * unit
  expect(lower).toBeLessThanOrEqual(source.lines)
  expect(lower + unit).toBeGreaterThan(source.lines)
  expect(excerpt).toBe('latest')
})

it('may show a complete line’s useful tail when a leading escape would fill the face', () => {
  const result = (preview: string) => recordedIoPortText({ id: 'stdout', lines: 1, preview, consumedText: null }, width)[1]
  expect(result('😀 done')).toBe('… done')
  expect(result('😀' + 'a'.repeat(59) + '…')).toBe('…')
})
