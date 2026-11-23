import { Vector3 } from 'three'
import type { Vec3, WorldAnchor } from '../contracts/world'
import type { Rect } from '../shell/shellLayout'
import { camera as tokens } from '../theme/tokens'
import { anchorCorners } from '../world/anchorGeometry'
import { frontFace, projectionCamera, type OrbitPose, type Size } from './projection'

const heightRange = [.38 + 1e-9, .52 - 1e-9] as const
const widthRange = [.25, .35] as const
const iterations = 40
// Stay inside the live camera's view depth. Only explicitly requested moves fit.
const maxDistance = 9000
export interface FocusContent { points: readonly Vec3[]; area: Rect }
export interface FocusFrame {
  anchorKey: string
  frameKey: string
  viewportKey: string
}
export interface PreviousFocusFrame extends FocusFrame {
  deadline: number
  interrupted?: boolean
}

/** Layout changes refit an approach that is still moving. A parked camera
 * keeps its pose through shell and viewport changes. */
export function focusRefit(previous: PreviousFocusFrame | null, frame: FocusFrame, moving: boolean) {
  if (!previous) return 'enter'
  if (previous.interrupted) return 'resume'
  if (previous.viewportKey !== frame.viewportKey) return moving ? 'resize' : null
  if (previous.anchorKey !== frame.anchorKey) return 'repack'
  if (previous.frameKey !== frame.frameKey && moving) return 'adjust'
  return null
}

/** Prefer a readable face at the shared target size, then fit its full physical
 * silhouette and any required caption inside the actual free World pixels. */
export function focusFraming(
  anchor: WorldAnchor,
  angles: { yaw: number; pitch: number },
  safe: Rect,
  viewport: Size,
  content?: FocusContent,
  neighbours: readonly WorldAnchor[] = [],
  contextPan = .12,
): OrbitPose {
  const fallback: OrbitPose = {
    target: anchor.position.every(Number.isFinite) ? [...anchor.position] : [0, 0, 0],
    distance: 24,
    yawDeg: Number.isFinite(angles.yaw) ? angles.yaw : tokens.focus.yaw,
    pitchDeg: Number.isFinite(angles.pitch) ? angles.pitch : tokens.focus.pitch,
  }
  if (![...anchor.position, ...anchor.size, safe.x, safe.y, safe.width, safe.height,
    viewport.width, viewport.height, angles.yaw, angles.pitch].every(Number.isFinite)
    || anchor.size.some(value => value <= 0) || safe.width <= 0 || safe.height <= 0
    || viewport.width <= 0 || viewport.height <= 0) return fallback

  const center = new Vector3(anchor.position[0], anchor.position[1], anchor.position[2] + anchor.size[2] / 2)
  const basis = projectionCamera({ ...fallback, target: center.toArray() }, viewport)
  const right = new Vector3().setFromMatrixColumn(basis.matrixWorld, 0)
  const up = new Vector3().setFromMatrixColumn(basis.matrixWorld, 1)
  const towardEye = new Vector3().setFromMatrixColumn(basis.matrixWorld, 2)
  const coordinates = (point: Vec3) => {
    const offset = new Vector3(...point).sub(center)
    return { x: offset.dot(right), y: offset.dot(up), z: offset.dot(towardEye) }
  }
  type Point = ReturnType<typeof coordinates>
  type Axis = 'x' | 'y'
  const face = frontFace(anchor).map(coordinates)
  const body = anchorCorners(anchor).map(coordinates)
  const annotation = content && content.area.width > 0 && content.area.height > 0
    && [content.area.x, content.area.y, content.area.width, content.area.height].every(Number.isFinite)
    && content.points.every(point => point.every(Number.isFinite))
    ? [{ points: content.points.map(coordinates), area: content.area }] : []
  const required = [{ points: body, area: safe }, ...annotation]
  const focalPixels = basis.projectionMatrix.elements[5] * viewport.height / 2
  const desiredX = (safe.x + safe.width / 2 - viewport.width / 2) / focalPixels
  const desiredY = (viewport.height / 2 - safe.y - safe.height / 2) / focalPixels
  const minDistance = Math.max(tokens.minDistance, ...required.flatMap(group => group.points.map(point => point.z + .055)))
  if (!Number.isFinite(minDistance) || minDistance >= maxDistance) return fallback

  // Center the projected front-face extrema on the desired screen coordinate.
  // At fixed screen center the span decreases monotonically as the eye recedes.
  const centerShift = (axis: Axis, desired: number, distance: number) => {
    let centered = -Infinity
    for (const a of face) {
      const depthA = distance - a.z
      const rootA = a[axis] - desired * depthA
      let firstNonpositive = Infinity
      for (const b of face) {
        const depthB = distance - b.z
        const rootB = b[axis] - desired * depthB
        const pairRoot = (rootA * depthB + rootB * depthA) / (depthA + depthB)
        firstNonpositive = Math.min(firstNonpositive, pairRoot)
      }
      centered = Math.max(centered, firstNonpositive)
    }
    return centered
  }
  const interval = (points: readonly Point[], area: Rect, axis: Axis, distance: number) => {
    const min = (axis === 'x' ? area.x - viewport.width / 2 : viewport.height / 2 - area.y - area.height) / focalPixels
    const max = (axis === 'x' ? area.x + area.width - viewport.width / 2 : viewport.height / 2 - area.y) / focalPixels
    return [
      Math.max(...points.map(point => point[axis] - max * (distance - point.z))),
      Math.min(...points.map(point => point[axis] - min * (distance - point.z))),
    ] as const
  }
  const intersect = (a: readonly [number, number], b: readonly [number, number]) => [Math.max(a[0], b[0]), Math.min(a[1], b[1])] as const
  const allowed = (axis: Axis, distance: number) => required.reduce(
    (range, { points, area }) => intersect(range, interval(points, area, axis, distance)),
    [-Infinity, Infinity] as readonly [number, number],
  )
  const contains = ([lower, upper]: readonly [number, number]) => lower <= upper
  const fits = (distance: number) => contains(allowed('x', distance)) && contains(allowed('y', distance))
  if (!fits(maxDistance)) return fallback
  const limit = (value: number, [lower, upper]: readonly [number, number]) =>
    Math.max(lower, Math.min(upper, value))
  const shiftFor = (axis: Axis, distance: number) =>
    limit(centerShift(axis, axis === 'x' ? desiredX : desiredY, distance), allowed(axis, distance))
  const bounds = (points: readonly Point[], axis: Axis, shift: number, distance: number) => {
    const values = points.map(point => (point[axis] - shift) / (distance - point.z))
    return [Math.min(...values), Math.max(...values)] as const
  }
  const span = (axis: Axis, shift: number, distance: number) => {
    const [lower, upper] = bounds(face, axis, shift, distance)
    return (upper - lower) * focalPixels
  }
  const closestMeeting = (test: (distance: number) => boolean, lo: number, hi: number) => {
    if (test(lo)) return lo
    if (!test(hi)) return hi
    for (let i = 0; i < iterations; i++) {
      const mid = (lo + hi) / 2
      if (test(mid)) hi = mid
      else lo = mid
    }
    return hi
  }
  // Shell and required overlays take precedence over the preferred face size.
  const physicalMinimum = closestMeeting(fits, minDistance, maxDistance)
  const measure = (axis: Axis, distance: number) => span(axis, shiftFor(axis, distance), distance)
  const distanceFor = (axis: Axis, pixels: number, lo: number, hi: number) =>
    closestMeeting(distance => measure(axis, distance) <= pixels, lo, hi)
  const near = distanceFor('y', heightRange[1] * viewport.height, physicalMinimum, maxDistance)
  const far = distanceFor('y', heightRange[0] * viewport.height, near, maxDistance)
  const widthNear = distanceFor('x', widthRange[1] * viewport.width, near, far)
  const widthFar = distanceFor('x', widthRange[0] * viewport.width, near, far)
  const preferred = distanceFor('y', tokens.focus.faceH * viewport.height, near, far)
  const distance = Math.max(widthNear, Math.min(widthFar, preferred))
  const xRange = allowed('x', distance), yRange = allowed('y', distance)
  let xShift = shiftFor('x', distance), yShift = shiftFor('y', distance)
  const baseHeight = span('y', yShift, distance)
  // Preserve one direct neighbour when there is already room at this scale.
  // Context can use a small pan and cannot shrink or crop the subject.
  const xTravel = safe.width * contextPan * distance / focalPixels
  const yTravel = safe.height * .08 * distance / focalPixels
  for (const neighbour of neighbours) {
    const points = anchorCorners(neighbour).map(coordinates)
    if (points.some(point => !Number.isFinite(point.z) || distance - point.z < .055)) continue
    const x = intersect(intersect(xRange, [xShift - xTravel, xShift + xTravel]), interval(points, safe, 'x', distance))
    const y = intersect(intersect(yRange, [yShift - yTravel, yShift + yTravel]), interval(points, safe, 'y', distance))
    if (!contains(x) || !contains(y)) continue
    const nextX = limit(xShift, x), nextY = limit(yShift, y)
    const nextHeight = span('y', nextY, distance)
    if (nextHeight < Math.min(baseHeight, heightRange[0] * viewport.height)
      || nextHeight > Math.max(baseHeight, heightRange[1] * viewport.height)) continue
    // An overlapping AABB is allowed across one axis, never both. The camera
    // should preserve readable context instead of stacking it over the face.
    if (contains(intersect(bounds(body, 'x', nextX, distance), bounds(points, 'x', nextX, distance)))
      && contains(intersect(bounds(body, 'y', nextY, distance), bounds(points, 'y', nextY, distance)))) continue
    xShift = nextX
    yShift = nextY
    break
  }

  const target = center.addScaledVector(right, xShift).addScaledVector(up, yShift).toArray()
  return [...target, distance].every(Number.isFinite)
    ? { target, distance, yawDeg: angles.yaw, pitchDeg: angles.pitch }
    : fallback
}
