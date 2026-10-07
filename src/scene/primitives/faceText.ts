/** Keep a centered glyph line inside its plate, including mutation emphasis. */
export function fitFaceTextHeight(preferredSize: number, rowHeight: number): number {
  return Math.min(preferredSize, rowHeight * 0.8)
}

/** Display-only summary. Runtime truth and Inspector values remain untouched. */
export function summarizeFaceValue(value: string, characters: number): string {
  const points = Array.from(value)
  const limit = Math.max(2, Math.floor(characters))
  return points.length > limit ? `${points.slice(0, limit - 1).join('')}…` : value
}

/** Three bounded columns shared by local, instance-field and static-field rows. */
export function faceColumns(width: number) {
  const left = -width / 2 + 0.26
  const available = Math.max(0.3, width - 0.52)
  const gap = Math.min(0.08, available * 0.04)
  const content = available - gap * 2
  const nameWidth = content * 0.34
  const typeWidth = content * 0.23
  const valueWidth = content * 0.43
  const typeX = left + nameWidth + gap
  const valueX = typeX + typeWidth + gap
  return { left, nameWidth, typeX, typeWidth, valueX, valueWidth }
}

/** Mark overflow explicitly instead of making an arbitrarily long value tiny. */
export function fitFaceValue(value: string, preferredSize: number, width: number) {
  const minimumSize = Math.min(preferredSize, 0.18)
  const text = summarizeFaceValue(value, Math.max(2, Math.floor(width / (minimumSize * 0.6))))
  return { text, size: Math.min(preferredSize, width / Math.max(1, Array.from(text).length * 0.6)) }
}
