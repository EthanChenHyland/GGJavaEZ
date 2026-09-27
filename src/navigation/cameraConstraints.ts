import { Box3, Vector3 } from 'three'
import type { CameraPose } from '../contracts/interaction'
import type { Vec3, WorldAnchor } from '../contracts/world'
import { defaultHomePose } from './navigation'

export const cameraBounds = { minDistance: 1.7, maxDistance: 32, pan: [12, 8, 12] as Vec3 }
const clearance = 0.18
const epsilon = 0.0001
const tuple = (v: Vector3): Vec3 => [v.x, v.y, v.z]
const finite = (pose: CameraPose) => [...pose.position, ...pose.target].every(Number.isFinite)

/** A sphere enclosing the near-plane corners prevents the lens from cutting a face. */
export function cameraCollisionBoxes(anchors: readonly WorldAnchor[], near: number, verticalFov: number, aspect: number): Box3[] {
  const tan = Math.tan(verticalFov / 2)
  const margin = clearance + near * Math.sqrt(1 + tan * tan * (1 + aspect * aspect))
  return anchors.map((anchor) => new Box3().setFromCenterAndSize(
    new Vector3(...anchor.position), new Vector3(...anchor.size),
  ).expandByScalar(margin))
}

function inside(point: Vector3, box: Box3): boolean {
  return point.x > box.min.x && point.x < box.max.x
    && point.y > box.min.y && point.y < box.max.y
    && point.z > box.min.z && point.z < box.max.z
}

/** Recover when replay makes a new solid appear around the camera. */
function escape(point: Vector3, boxes: readonly Box3[]): Vector3 {
  const result = point.clone()
  for (let pass = 0; pass <= boxes.length; pass++) {
    let changed = false
    for (const box of boxes) {
      if (!inside(result, box)) continue
      const faces = (['x', 'y', 'z'] as const).flatMap((axis) => [
        { axis, value: box.min[axis] - epsilon, distance: result[axis] - box.min[axis] },
        { axis, value: box.max[axis] + epsilon, distance: box.max[axis] - result[axis] },
      ]).sort((a, b) => a.distance - b.distance)
      result[faces[0].axis] = faces[0].value
      changed = true
    }
    if (!changed) break
  }
  return result
}

/** Swept intersection avoids tunnelling on a large wheel delta or scripted step. */
export function cameraSegmentHit(from: Vector3, to: Vector3, box: Box3): number | null {
  let enter = 0
  let exit = 1
  for (const axis of ['x', 'y', 'z'] as const) {
    const delta = to[axis] - from[axis]
    if (Math.abs(delta) < 1e-10) {
      if (from[axis] <= box.min[axis] || from[axis] >= box.max[axis]) return null
      continue
    }
    const a = (box.min[axis] - from[axis]) / delta
    const b = (box.max[axis] - from[axis]) / delta
    enter = Math.max(enter, Math.min(a, b))
    exit = Math.min(exit, Math.max(a, b))
    if (exit <= enter) return null
  }
  return enter < 1 && exit > 0 ? enter : null
}

export function constrainCameraPose(
  requested: CameraPose,
  previous: CameraPose,
  boxes: readonly Box3[],
  center: Vec3 = defaultHomePose.target,
): CameraPose {
  const safePrevious = finite(previous) ? previous : defaultHomePose
  const pose = finite(requested) ? requested : safePrevious
  const rawTarget = new Vector3(...pose.target)
  const target = rawTarget.clone()
  ;(['x', 'y', 'z'] as const).forEach((axis, index) => {
    target[axis] = Math.max(center[index] - cameraBounds.pan[index], Math.min(center[index] + cameraBounds.pan[index], target[axis]))
  })
  const offset = new Vector3(...pose.position).sub(rawTarget)
  if (offset.lengthSq() < 1e-12) offset.copy(new Vector3(...defaultHomePose.position).sub(new Vector3(...defaultHomePose.target)))
  const rangeBefore = offset.length()
  const boundedRange = Math.max(cameraBounds.minDistance, Math.min(cameraBounds.maxDistance, rangeBefore))
  const eye = boundedRange === rangeBefore
    ? new Vector3(...pose.position).add(target.clone().sub(rawTarget))
    : target.clone().add(offset.setLength(boundedRange))
  let position = escape(eye, boxes)
  const from = escape(new Vector3(...safePrevious.position), boxes)
  let fraction = 1
  for (const box of boxes) {
    const hit = cameraSegmentHit(from, position, box)
    if (hit !== null) fraction = Math.min(fraction, Math.max(0, hit - epsilon / Math.max(1, from.distanceTo(position))))
  }
  if (fraction < 1) position = from.clone().lerp(position, fraction)
  // A blocked pan must not leave its pivot moving away while the eye is stationary.
  if (fraction < 1) target.lerpVectors(new Vector3(...safePrevious.target), target, fraction)
  const range = position.distanceTo(target)
  if (range < cameraBounds.minDistance || range > cameraBounds.maxDistance) {
    const direction = target.clone().sub(position)
    if (direction.lengthSq() < 1e-12) direction.copy(offset).negate()
    target.copy(position).add(direction.setLength(Math.max(cameraBounds.minDistance, Math.min(cameraBounds.maxDistance, range))))
  }
  return { position: tuple(position), target: tuple(target) }
}

export function zoomPose(pose: CameraPose, direction: 'in' | 'out'): CameraPose {
  const offset = new Vector3(...pose.position).sub(new Vector3(...pose.target))
  if (offset.lengthSq() < 1e-12) offset.set(0.35, 0.25, 1)
  const range = Math.max(cameraBounds.minDistance, Math.min(cameraBounds.maxDistance, offset.length() * (direction === 'in' ? 0.8 : 1.25)))
  return { target: pose.target, position: tuple(new Vector3(...pose.target).add(offset.setLength(range))) }
}

/** Route explicit commands around solid corners instead of stopping Reset behind a body. */
export function collisionSafeRoute(from: CameraPose, to: CameraPose, boxes: readonly Box3[]): CameraPose[] {
  const start = escape(new Vector3(...from.position), boxes)
  const end = escape(new Vector3(...to.position), boxes)
  const visible = (a: Vector3, b: Vector3) => boxes.every((box) => cameraSegmentHit(a, b, box) === null)
  if (visible(start, end)) return [{ ...to, position: tuple(end) }]
  const nodes = [start, end]
  for (const box of boxes) {
    for (const x of [box.min.x - epsilon * 4, box.max.x + epsilon * 4])
      for (const y of [box.min.y - epsilon * 4, box.max.y + epsilon * 4])
        for (const z of [box.min.z - epsilon * 4, box.max.z + epsilon * 4]) {
          const point = new Vector3(x, y, z)
          if (!boxes.some((other) => inside(point, other))) nodes.push(point)
        }
  }
  const ranges = nodes.map(() => Infinity)
  const parents = nodes.map(() => -1)
  const visited = new Set<number>()
  ranges[0] = 0
  for (let step = 0; step < nodes.length; step++) {
    let nearest = -1
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (nearest < 0 || ranges[i] < ranges[nearest])) nearest = i
    if (nearest < 0 || !Number.isFinite(ranges[nearest])) break
    if (nearest === 1) break
    visited.add(nearest)
    for (let i = 0; i < nodes.length; i++) {
      if (visited.has(i) || !visible(nodes[nearest], nodes[i])) continue
      const cost = ranges[nearest] + nodes[nearest].distanceTo(nodes[i])
      if (cost < ranges[i]) { ranges[i] = cost; parents[i] = nearest }
    }
  }
  if (parents[1] < 0) return [constrainCameraPose(to, from, boxes)]
  const path: number[] = []
  for (let i = 1; i !== 0; i = parents[i]) path.unshift(i)
  const viewingOffset = start.clone().sub(new Vector3(...from.target))
  return path.map((i) => i === 1 ? { ...to, position: tuple(end) } : {
    position: tuple(nodes[i]), target: tuple(nodes[i].clone().sub(viewingOffset)),
  })
}
