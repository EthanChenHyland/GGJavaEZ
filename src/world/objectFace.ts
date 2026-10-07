/** Existing heap-face spacing. Bounded observations never resize or move a solid. */
export function objectFaceRowCount(height: number, fields: number): number {
  const capacity = Math.max(0, Math.floor((height - 1.5) / 0.52) + 1)
  return Math.min(6, capacity, fields)
}
