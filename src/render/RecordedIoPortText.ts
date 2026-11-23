import type { SceneIo } from '../contracts/world'
import { ioPortPreview } from '../world/ioPortText'
import { escapeJava } from '../world/valueText'
import { localFontText, textAdvance } from './text/textSystem'

export const ioFaceTextSize = .32
export const ioFaceTextInset = .09
const shortChannel = { stdin: 'in', stdout: 'out', stderr: 'err' } as const
const countUnits = ['k', 'M', 'B', 'T', 'P'] as const

/** Bounded ink for the existing two-row port. The dialog uses ioPortPreview
 * directly, so a fitted ellipsis or compact count cannot enter copied data. */
export function recordedIoPortText(io: Pick<SceneIo, 'id' | 'lines' | 'preview' | 'consumedText'>, width: number): [string, string] {
  const fittedWidth = width - 2 * ioFaceTextInset - .012
  const fits = (text: string) => textAdvance(text, 500) * ioFaceTextSize <= fittedWidth
  const preview = ioPortPreview(io)
  const fullHeader = `${io.id} ${io.lines}`
  let header = fullHeader
  if (!fits(header)) {
    const short = shortChannel[io.id]
    header = `${short} ${io.lines}`
    for (let unit = 0; !fits(header) && unit < countUnits.length; unit++) {
      const magnitude = Math.floor(io.lines / 1000 ** (unit + 1))
      if (magnitude === 0) break
      header = `${short} ${magnitude}${countUnits[unit]}+`
    }
  }

  if (!preview.available) return [header, '—']
  if (preview.capturedText === '') return [header, '""']
  const complete = localFontText(preview.displayText, 500)
  if (fits(complete)) return [header, complete]

  // Fit whole raw characters after escaping, so a clipped control or surrogate
  // pair never appears to be partially captured. Only this face adds the marker.
  let prefix = ''
  for (const char of preview.capturedText) {
    const next = prefix + localFontText(escapeJava(char), 500)
    if (!fits(next + '…')) break
    prefix = next
  }
  if (!prefix.trim() && !preview.sourceTruncated) {
    // A long leading escape can hide the entire prefix. A suffix is truthful
    // only when the source contains the complete latest line or consumption.
    let suffix = ''
    for (const char of Array.from(preview.capturedText).reverse()) {
      const next = localFontText(escapeJava(char), 500) + suffix
      if (!fits('…' + next)) break
      suffix = next
    }
    return [header, '…' + suffix]
  }
  return [header, prefix + '…']
}
