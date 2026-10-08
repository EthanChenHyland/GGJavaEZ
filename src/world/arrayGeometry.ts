import type { Vec3, WorldAnchor } from '../contracts/world'
import { worldUnits } from '../theme/tokens'

const headers = new WeakMap<WorldAnchor, WorldAnchor>()
/** The array anchor is its stable boundary, not a solid filling empty cells.
 * Rendering and reference attachment share the actual bounded identity solid. */
export function arrayHeaderAnchor(boundary: WorldAnchor): WorldAnchor {
  const cached = headers.get(boundary)
  if (cached) return cached
  const position: Vec3 = [boundary.position[0], boundary.position[1] + boundary.size[1] / 2 - worldUnits.arrayHeader.topInset, boundary.position[2]]
  const size: Vec3 = [Math.min(boundary.size[0], worldUnits.arrayHeader.maxWidth), worldUnits.arrayHeader.height, Math.min(boundary.size[2], worldUnits.arrayHeader.depth)]
  const header: WorldAnchor = { entityId: boundary.entityId, region: boundary.region, position, size, ports: {},
    bodyPort: [position[0] - size[0] / 2 + 0.16, position[1], position[2] + size[2] / 2 + 0.055] }
  headers.set(boundary, header)
  return header
}
