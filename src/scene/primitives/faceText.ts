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
