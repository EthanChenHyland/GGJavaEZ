import type { SceneModel, Vec3 } from '../contracts/world'
import { stackRegionLabel } from '../theme/tokens'

type StackRegion = Pick<SceneModel, 'stackDepth' | 'bounds' | 'layoutKind'> & Partial<Pick<SceneModel, 'frames'>>

/** Presentation coordinates only; runtime entities and their anchors are untouched. */
export function stackHeadingPosition(scene: StackRegion): Vec3 {
  if (scene.layoutKind === 'spatial2') {
    const anchors = scene.frames?.map(frame => frame.anchor) ?? []
    if (anchors.length) {
      let left = Infinity; let top = -Infinity; let front = -Infinity
      for (const anchor of anchors) {
        left = Math.min(left, anchor.position[0] - anchor.size[0] / 2)
        top = Math.max(top, anchor.position[1] + anchor.size[1] / 2)
        front = Math.max(front, anchor.position[2] + anchor.size[2] / 2)
      }
      return [left, top + 0.65, front + 0.1]
    }
    const bounds = scene.bounds
    return bounds ? [bounds.center[0] - bounds.size[0] / 2, bounds.center[1] + bounds.size[1] / 2 + 0.65, bounds.center[2]] : [0, 0.65, 0]
  }
  return (scene.stackDepth ?? 0) > 1 && scene.bounds
    ? [scene.bounds.center[0] - 4.5, scene.bounds.center[1] + scene.bounds.size[1] / 2 + 0.6, 2.5]
    : stackRegionLabel.position
}

export function stackHeadingFootprint(scene: StackRegion): Vec3[] {
  const [x, y, z] = stackHeadingPosition(scene)
  return [[x, y + 0.4, z], [x + 2, y + 0.4, z], [x, y - 0.4, z], [x + 2, y - 0.4, z]]
}
