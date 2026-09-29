import { createContext } from 'react'
import { Vector3, type Camera } from 'three'
import { typography } from '../../theme/tokens'
export { preloadRuntimeText, runtimeCharacters } from '../../theme/runtimeFont'

export interface FrameLabelPolicy {
  enabled: boolean
  density: 'compact' | 'full'
  pixelsPerUnit: number
  priority: boolean
}
export const RuntimeLabelPolicy = createContext<{ current: FrameLabelPolicy } | null>(null)

// Inter's cap height is about 0.73 em. The visible glyph, rather than its em
// box, determines readability. Projection includes camera FOV and viewport.
const capHeight = 0.73
const lower = new Vector3()
const upper = new Vector3()
export function projectedTextPixels(camera: Camera, viewport: { width: number; height: number }, position: readonly number[], fontSize: number): number {
  lower.set(position[0], position[1], position[2]).project(camera)
  upper.set(position[0], position[1] + fontSize * capHeight, position[2]).project(camera)
  if (lower.z < -1 || lower.z > 1) return 0
  return Math.hypot((upper.x - lower.x) * viewport.width / 2, (upper.y - lower.y) * viewport.height / 2)
}

export function frameLabelDensity(rowPixels: number, previous: FrameLabelPolicy['density'], priority = false): FrameLabelPolicy['density'] {
  // Separate entry/exit thresholds prevent flickering during slow dolly/orbit.
  return rowPixels >= (previous === 'full' ? typography.runtimeMicroPx - (priority ? 2 : 1) : typography.runtimeMicroPx + (priority ? 0 : 1)) ? 'full' : 'compact'
}

export function identityLabelScale(size: number, pixelsPerUnit: number, contentWidth: number, availableWidth: number, priority: boolean): number {
  if (pixelsPerUnit <= 0) return 1
  const desired = (typography.runtimeMicroPx + (priority ? 2 : 0)) / (size * pixelsPerUnit)
  // Only identity headings grow. Rows remain their original world size. Keep
  // the heading on its information face, including long JVM method names.
  return Math.max(1, Math.min(desired, 0.9 / size, availableWidth / Math.max(contentWidth, 0.001)))
}
