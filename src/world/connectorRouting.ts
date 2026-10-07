import type { Vec3, WorldAnchor } from '../contracts/world'

/** Connect real ports through exterior side/roof channels. Geometry, IDs and
 * values are untouched; the detour protects information faces from crossings. */
export function surfaceConnectorPoints(from: Vec3, to: Vec3, source: WorldAnchor, target: WorldAnchor): Vec3[] {
  const outward = (point: Vec3, anchor: WorldAnchor) => {
    const side = point[0] >= anchor.position[0] ? 1 : -1
    return anchor.position[0] + side * (anchor.size[0] / 2 + 0.5)
  }
  const exitX = outward(from, source), entryX = outward(to, target)
  const roof = Math.max(source.position[1] + source.size[1] / 2, target.position[1] + target.size[1] / 2) + 0.65
  const front = Math.max(from[2], to[2]) + 0.08
  return [from, [exitX, from[1], from[2]], [exitX, roof, front],
    [entryX, roof, front], [entryX, to[1], to[2]], to]
}
