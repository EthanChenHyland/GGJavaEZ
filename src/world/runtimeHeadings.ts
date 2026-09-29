import type { SceneModel, Vec3 } from '../contracts/world'
import { stackRegionLabel } from '../theme/tokens'

type StackRegion = Pick<SceneModel, 'stackDepth' | 'bounds'>

/** Presentation coordinates only; runtime entities and their anchors are untouched. */
export function stackHeadingPosition(scene: StackRegion): Vec3 {
  return (scene.stackDepth ?? 0) > 1 && scene.bounds
    ? [scene.bounds.center[0] - 4.5, scene.bounds.center[1] + scene.bounds.size[1] / 2 + 0.6, 2.5]
    : stackRegionLabel.position
}

export function stackHeadingFootprint(scene: StackRegion): Vec3[] {
  const [x, y, z] = stackHeadingPosition(scene)
  return [[x, y + 0.4, z], [x + 2, y + 0.4, z], [x, y - 0.4, z], [x + 2, y - 0.4, z]]
}
