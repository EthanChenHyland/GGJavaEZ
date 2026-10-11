import { describe, expect, it } from 'vitest'
import { ConsoleLineIndex, type ConsoleChunk } from './consoleLineIndex'

const chunk = (key: string, text: string, channel: ConsoleChunk['channel'] = 'stdout'): ConsoleChunk => ({ key, text, channel })
const rows = (index: ConsoleLineIndex) => Array.from({ length: index.count }, (_, row) => index.row(row))
describe('captured Console line offsets', () => {
  it('joins adjacent stream chunks without adding characters, preserving CRLF, blanks and an unterminated tail', () => {
    const index = new ConsoleLineIndex()
    index.update([chunk('a', 'α\r'), chunk('b', '\n\n😀'), chunk('c', ' tail')])
    expect(rows(index).map(row => row.text)).toEqual(['α\r\n', '\n', '😀 tail'])
    expect(rows(index).map(row => row.text).join('')).toBe('α\r\n\n😀 tail')
    expect(index.row(2, 2)).toEqual({ channel: 'stdout', text: '😀', length: 7 })
  })
  it('keeps proven channel boundaries and repeated equal text; empty submitted input remains reachable', () => {
    const index = new ConsoleLineIndex()
    index.update([chunk('a', 'same'), chunk('b', 'same', 'stderr'), chunk('c', '', 'stdin'), chunk('d', 'same')])
    expect(rows(index)).toEqual([{ channel: 'stdout', text: 'same', length: 4 }, { channel: 'stderr', text: 'same', length: 4 },
      { channel: 'stdin', text: '', length: 0 }, { channel: 'stdout', text: 'same', length: 4 }])
  })
  it('scans only the appended pipe suffix and advances its existing partial line', () => {
    const index = new ConsoleLineIndex()
    index.update([chunk('pipe', 'first\npar')])
    index.update([chunk('pipe', 'first\npartial\nlast')])
    expect(index.scannedCharacters).toBe('tial\nlast'.length)
    expect(rows(index).map(row => row.text)).toEqual(['first\n', 'partial\n', 'last'])
    index.update([chunk('pipe', 'first\npartial\nlast')])
    expect(index.scannedCharacters).toBe(0)
  })
  it('keeps consecutive input submissions distinct without inventing newline characters', () => {
    const index = new ConsoleLineIndex()
    index.update([chunk('input-1', '12', 'stdin'), chunk('input-2', '13', 'stdin')])
    expect(rows(index).map(row => row.text)).toEqual(['12', '13'])
  })
  it('binds exact detail to its displayed text before a later cache update or retirement', () => {
    const index = new ConsoleLineIndex()
    index.update([chunk('a', 'shown'), chunk('b', '\r\n')])
    const readDisplayed = index.capture(0)
    index.update([chunk('a', 'future\n')]); index.update([])
    expect(readDisplayed()).toEqual({channel:'stdout',text:'shown\r\n'})
  })
  it('reconstructs an earlier prefix and replacement chunks without retaining future characters', () => {
    const index = new ConsoleLineIndex(), first = [chunk('a', 'hel'), chunk('b', 'lo\nnext')]
    index.update(first); expect(rows(index).map(row => row.text)).toEqual(['hello\n', 'next'])
    index.update(first.slice(0, 1)); expect(rows(index).map(row => row.text)).toEqual(['hel'])
    index.update([first[0], chunk('c', 'p\n', 'stderr')])
    expect(rows(index).map(row => [row.channel, row.text])).toEqual([['stdout', 'hel'], ['stderr', 'p\n']])
    index.update([chunk('different-session', 'replacement')])
    expect(rows(index).map(row => row.text)).toEqual(['replacement'])
    index.update([]); expect(index.count).toBe(0); expect(() => index.row(0)).toThrow(RangeError)
  })
  it('indexes a million terminated lines with direct first/last lookup and no synthetic trailing row', () => {
    const index = new ConsoleLineIndex()
    const text = 'first\n' + 'middle\n'.repeat(999998) + 'last\n'
    index.update([chunk('million', text)])
    expect(index.count).toBe(1000000)
    expect(index.row(0).text).toBe('first\n'); expect(index.row(999999).text).toBe('last\n')
    index.update([chunk('million', text + 'tail')])
    expect(index.scannedCharacters).toBe(4); expect(index.count).toBe(1000001)
    expect(index.row(1000000).text).toBe('tail')
  })
})
