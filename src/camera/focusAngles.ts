import type { WorldAnchor } from '../contracts/world'
import type { Rect } from '../shell/shellLayout'
import { camera as tokens } from '../theme/tokens'
import type { Size } from './projection'

/** Solid information faces are in the local +Z plane. Inspect from the
 * opposite side of the nearest related body to preserve that relationship,
 * and favor the outward side of structural proxies so dollying stays clear. */
export function focusAngles(
  anchor: WorldAnchor,
  neighbours: readonly WorldAnchor[],
  structuralCluster = false,
  composition?: { area: Rect; viewport: Size },
) {
  const baseYaw = Math.abs(tokens.focus.yaw)
  if (structuralCluster) {
    const outward = anchor.region === 'stack' || anchor.region === 'class' ? -1 : 1
    return { yaw: outward * baseYaw, pitch: tokens.focus.pitch }
  }
  const [x, y, z] = anchor.position
  const [width, height, depth] = anchor.size
  const reach = 3 * Math.hypot(width, height, depth)
  let side = -1, nearest = reach
  for (const neighbour of neighbours) {
    const [nx, ny, nz] = neighbour.position
    const distance = Math.hypot(nx - x, ny - y, nz - z)
    if (distance < nearest && Math.abs(nx - x) >= .1 * width) {
      side = nx < x ? 1 : -1
      nearest = distance
    }
  }
  const wide = width > 2.5 * height
  const viewYaw = side * baseYaw * (wide ? 1.13 : 1.55)
  const viewPitch = tokens.focus.pitch * (wide ? 1.7 : 2.25)
  if (!composition) return { yaw: viewYaw, pitch: viewPitch }
  const { area, viewport } = composition
  const focalPixels = viewport.height / (2 * Math.tan(tokens.fov * Math.PI / 360))
  const angle = (offset: number) => Math.atan(offset / focalPixels) * 180 / Math.PI
  if (focalPixels <= 0) return { yaw: viewYaw, pitch: viewPitch }
  // A target off the optical axis lies on a different sight line from the
  // view direction. Account for the shell offset so it still shows depth.
  const yaw = viewYaw + angle(area.x + area.width / 2 - viewport.width / 2)
  const pitch = viewPitch - angle(viewport.height / 2 - area.y - area.height / 2)
  return { yaw: Math.max(-60, Math.min(60, yaw)), pitch: Math.max(-36, Math.min(-4, pitch)) }
}
