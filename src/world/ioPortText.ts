import type { SceneIo } from '../contracts/world'
import { escapeJava } from './valueText'

/** Content only. Face fitting is a separate presentation bound and must not
 * replace these fields or mistake its own ellipsis for source truncation.
 * stdout/stderr preview already follows SceneIo's 60-code-point + marker contract.
 */
export function ioPortPreview(io: Pick<SceneIo, 'id' | 'preview' | 'consumedText'>): {
  text: string
  capturedText: string
  displayText: string
  sourceTruncated: boolean
  available: boolean
} {
  if (io.id === 'stdin') {
    if (io.consumedText === null) return { text: '', capturedText: '', displayText: '', sourceTruncated: false, available: false }
    // Read at most 61 code points, even when the captured input edge is large.
    // Bound raw content before escaping, so a surrogate pair or control escape
    // never consumes several positions in the source's 60-code-point budget.
    let capturedText = '', count = 0, sourceTruncated = false
    for (const char of io.consumedText) {
      if (count === 60) { sourceTruncated = true; break }
      capturedText += char
      count++
    }
    const marker = sourceTruncated ? '…' : ''
    return { text: capturedText + marker, capturedText, displayText: escapeJava(capturedText) + marker, sourceTruncated, available: true }
  }

  // A literal captured ellipsis at <=60 code points is content. Only the
  // producer's 61st-code-point marker is derived and excluded from copying.
  const chars = Array.from(io.preview)
  const sourceTruncated = chars.length === 61 && chars[60] === '…'
  const capturedText = sourceTruncated ? chars.slice(0, 60).join('') : io.preview
  return { text: io.preview, capturedText, displayText: escapeJava(capturedText) + (sourceTruncated ? '…' : ''), sourceTruncated, available: true }
}
