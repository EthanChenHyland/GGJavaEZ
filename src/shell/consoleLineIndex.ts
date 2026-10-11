export type ConsoleChannel = 'stdout' | 'stderr' | 'stdin' | 'exit'
export interface ConsoleChunk { key: string; channel: ConsoleChannel; text: string }
interface IndexedChunk extends ConsoleChunk {
  start: number; rowsBefore: number; previousEnd: number; partialBefore: boolean
}

/** Offsets into captured strings, never a million allocated line strings.
 * Adjacent writes to one stream join across chunk boundaries. A channel change
 * preserves the recorded boundary rather than inventing an interleaving. */
export class ConsoleLineIndex {
  private chunks: IndexedChunk[] = []
  private ends: number[] = []
  private channels: ConsoleChannel[] = []
  private length = 0
  private partial = false
  scannedCharacters = 0
  get count() { return this.ends.length }

  update(next: readonly ConsoleChunk[]): number {
    this.scannedCharacters = 0
    let common = 0
    while (common < next.length && common < this.chunks.length) {
      const old = this.chunks[common], value = next[common]
      if (old.key !== value.key || old.channel !== value.channel || old.text !== value.text) break
      common++
    }
    // Growing process-pipe strings reuse every already-scanned newline offset.
    const old = this.chunks[common], value = next[common]
    if (old && value && (value.channel === 'stdout' || value.channel === 'stderr') && common === this.chunks.length - 1 && old.key === value.key &&
      old.channel === value.channel && value.text.startsWith(old.text)) {
      const suffix = value.text.slice(old.text.length)
      old.text = value.text
      this.appendRows(suffix, value.channel)
      common++
    } else if (common < this.chunks.length) {
      const checkpoint = this.chunks[common]
      this.ends.length = checkpoint.rowsBefore
      this.channels.length = checkpoint.rowsBefore
      if (checkpoint.rowsBefore) this.ends[checkpoint.rowsBefore - 1] = checkpoint.previousEnd
      this.length = checkpoint.start
      this.partial = checkpoint.partialBefore
    }
    this.chunks.length = common
    for (let i = common; i < next.length; i++) {
      const chunk = next[i]
      this.chunks.push({ ...chunk, start: this.length, rowsBefore: this.count,
        previousEnd: this.ends.at(-1) ?? 0, partialBefore: this.partial })
      this.appendRows(chunk.text, chunk.channel)
    }
    return this.count
  }

  private appendRows(text: string, channel: ConsoleChannel) {
    this.scannedCharacters += text.length
    if (!text.length) {
      if (channel === 'stdin') { this.ends.push(this.length); this.channels.push(channel); this.partial = false }
      return
    }
    if (this.partial && this.channels.at(-1) === channel && (channel === 'stdout' || channel === 'stderr')) { this.ends.pop(); this.channels.pop() }
    const start = this.length
    let cursor = 0, newline = text.indexOf('\n')
    while (newline !== -1) {
      this.ends.push(start + newline + 1); this.channels.push(channel)
      cursor = newline + 1; newline = text.indexOf('\n', cursor)
    }
    this.length += text.length
    this.partial = cursor < text.length
    if (this.partial) { this.ends.push(this.length); this.channels.push(channel) }
  }

  row(index: number, limit = Infinity): { channel: ConsoleChannel; text: string; length: number } {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) throw new RangeError('Console row is outside the captured prefix')
    const start = index ? this.ends[index - 1] : 0, end = this.ends[index]
    const stop = Math.min(end, start + limit)
    return { channel: this.channels[index], text: this.spans(start, stop).map(span => span.text.slice(span.from, span.to)).join(''), length: end - start }
  }

  /** Bind detail to the displayed captured text even if React discards a later
   * render that has advanced the indexing cache before this row is clicked. */
  capture(index: number): () => { channel: ConsoleChannel; text: string } {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) throw new RangeError('Console row is outside the captured prefix')
    const start = index ? this.ends[index - 1] : 0, end = this.ends[index], channel = this.channels[index]
    const spans = this.spans(start, end)
    return () => ({ channel, text: spans.map(span => span.text.slice(span.from, span.to)).join('') })
  }

  private spans(start: number, stop: number) {
    let low = 0, high = this.chunks.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (this.chunks[middle].start + this.chunks[middle].text.length <= start) low = middle + 1
      else high = middle
    }
    const spans: { text: string; from: number; to: number }[] = []
    for (let i = low; i < this.chunks.length && this.chunks[i].start < stop; i++) {
      const chunk = this.chunks[i]
      spans.push({ text: chunk.text, from: Math.max(0, start - chunk.start), to: stop - chunk.start })
    }
    return spans
  }
}
