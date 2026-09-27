import { Vector3 } from 'three'
import type { CameraPose } from '../contracts/interaction'
import type { TraceEvent } from '../contracts/runtime'
import type { SceneReferenceEdge, Vec3, WorldAnchor } from '../contracts/world'
import { easeOutCubic, motionMs } from '../theme/tokens'
import { distance, homePose, midpoint } from './navigation'

export interface CameraWaypoint {
  pose: CameraPose
  durationMs: number
}

export interface CameraMove {
  from: CameraPose
  to: CameraPose
  waypoints: readonly CameraWaypoint[]
  elapsedMs: number
  /** A newer command or user input invalidates every remaining waypoint. */
  revision: number
}

export function interpolatePose(from: CameraPose, to: CameraPose, progress: number): CameraPose {
  const t = Math.max(0, Math.min(1, progress))
  const eased = easeOutCubic(t)
  const lerp = (a: Vec3, b: Vec3): Vec3 => [
    a[0] + (b[0] - a[0]) * eased,
    a[1] + (b[1] - a[1]) * eased,
    a[2] + (b[2] - a[2]) * eased,
  ]
  return { position: lerp(from.position, to.position), target: lerp(from.target, to.target) }
}

export function sampleCameraMove(move: CameraMove): { pose: CameraPose; done: boolean } {
  let remaining = Math.max(0, move.elapsedMs)
  let from = move.from
  for (const waypoint of move.waypoints) {
    if (remaining < waypoint.durationMs) {
      return { pose: interpolatePose(from, waypoint.pose, remaining / waypoint.durationMs), done: false }
    }
    remaining -= waypoint.durationMs
    from = waypoint.pose
  }
  return { pose: move.to, done: true }
}

export function guidedCameraAction(event: TraceEvent | null | undefined, followEnabled: boolean): 'home' | 'event' | null {
  if (!followEnabled || !event) return null
  if (event.type === 'PROGRAM_END') return 'home'
  return event.importance === 'major' ? 'event' : null
}

export interface ViewFraming {
  verticalFov: number
  aspect: number
}

export interface InspectorViewport {
  width: number
  height: number
}

/** Viewport changes scale a fixed composition, never the current runtime bounds. */
export function responsiveHomePose(target: Vec3 | undefined, aspect: number): CameraPose {
  const pose = homePose(target)
  const scale = Math.max(1, 1.3 / Math.max(0.1, aspect))
  return { target: pose.target, position: [
    pose.target[0] + (pose.position[0] - pose.target[0]) * scale,
    pose.target[1] + (pose.position[1] - pose.target[1]) * scale,
    pose.target[2] + (pose.position[2] - pose.target[2]) * scale,
  ] }
}

/** Fit focus and nearby runtime bodies above the bottom inspector shelf.
 * Shifting the optical target down places the semantic focus higher on screen,
 * while preserving the runtime's stable world anchors.
 */
export function inspectorFocusPose(
  pivot: Vec3,
  extent: Vec3,
  viewingPose: CameraPose,
  context: readonly WorldAnchor[],
  view: ViewFraming,
  viewport: InspectorViewport,
  selectedPosition: Vec3 = pivot,
): CameraPose {
  const width = Math.max(1, viewport.width)
  const height = Math.max(1, viewport.height)
  const left = 20
  const right = 20
  // Reserve runtime controls above and timeline/quality controls below.
  const top = Math.min(64, height * 0.2)
  const bottom = Math.min(190, height * 0.3)
  const xMin = -1 + 2 * left / width
  const xMax = 1 - 2 * right / width
  const yMin = -1 + 2 * bottom / height
  const yMax = 1 - 2 * top / height
  const centerX = (xMin + xMax) / 2
  const centerY = (yMin + yMax) / 2
  const direction = new Vector3(...viewingPose.position).sub(new Vector3(...viewingPose.target)).normalize()
  if (direction.lengthSq() === 0) direction.set(0.35, 0.25, 1).normalize()
  const rightAxis = new Vector3(0, 1, 0).cross(direction).normalize()
  if (rightAxis.lengthSq() === 0) rightAxis.set(1, 0, 0)
  const upAxis = direction.clone().cross(rightAxis).normalize()
  const tanY = Math.tan(view.verticalFov / 2)
  const tanX = tanY * view.aspect
  let range = 8.5
  const bodies = [
    ...context.map((anchor) => ({
      position: [anchor.position[0], anchor.position[1] + 0.4, anchor.position[2]] as Vec3,
      size: [anchor.size[0] + 0.6, anchor.size[1] + 0.8, anchor.size[2]] as Vec3,
    })),
    // Labels and mutation callouts project beyond the body, especially above it.
    { position: [selectedPosition[0], selectedPosition[1] + 0.4, selectedPosition[2]] as Vec3, size: [extent[0] + 1, extent[1] + 2, extent[2] + 0.6] as Vec3 },
  ]
  for (const body of bodies) {
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const relative = new Vector3(
        body.position[0] + x * body.size[0] / 2 - pivot[0],
        body.position[1] + y * body.size[1] / 2 - pivot[1],
        body.position[2] + z * body.size[2] / 2 - pivot[2],
      )
      const depth = relative.dot(direction)
      const horizontal = relative.dot(rightAxis) / tanX
      const vertical = relative.dot(upAxis) / tanY
      range = Math.max(range, depth + 0.5,
        (horizontal + xMax * depth) / Math.max(0.05, xMax - centerX),
        (-horizontal - xMin * depth) / Math.max(0.05, centerX - xMin),
        (vertical + yMax * depth) / Math.max(0.05, yMax - centerY),
        (-vertical - yMin * depth) / Math.max(0.05, centerY - yMin),
      )
    }
  }
  range *= 1.05
  const target = new Vector3(...pivot)
    .addScaledVector(rightAxis, -centerX * tanX * range)
    .addScaledVector(upAxis, -centerY * tanY * range)
  const position = target.clone().addScaledVector(direction, range)
  return { position: [position.x, position.y, position.z], target: [target.x, target.y, target.z] }
}

/** Fit real cuboid corners in the current camera orientation, including Z depth.
 * Framing uses the narrower viewport dimension, so both endpoint bodies remain in view.
 */
export function contextPose(
  pivot: Vec3,
  viewingPose: CameraPose,
  anchors: readonly WorldAnchor[],
  points: readonly Vec3[],
  view: ViewFraming,
  minimumDistance = 6,
): CameraPose {
  const direction = new Vector3(...viewingPose.position).sub(new Vector3(...viewingPose.target)).normalize()
  if (direction.lengthSq() === 0) direction.set(0.35, 0.25, 1).normalize()
  const right = new Vector3(0, 1, 0).cross(direction).normalize()
  if (right.lengthSq() === 0) right.set(1, 0, 0)
  const up = direction.clone().cross(right).normalize()
  const tanVertical = Math.tan(view.verticalFov / 2)
  const tanHorizontal = tanVertical * Math.max(0.01, view.aspect)
  let range = minimumDistance
  const include = (point: Vec3) => {
    const relative = new Vector3(...point).sub(new Vector3(...pivot))
    const depth = relative.dot(direction)
    // Margin leaves room for attached labels without inventing world positions.
    range = Math.max(range, depth + 1.15 * Math.max(
      Math.abs(relative.dot(right)) / tanHorizontal,
      Math.abs(relative.dot(up)) / tanVertical,
    ) + 0.5)
  }
  points.forEach(include)
  for (const anchor of anchors) {
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      include([
        anchor.position[0] + x * anchor.size[0] / 2,
        anchor.position[1] + y * anchor.size[1] / 2,
        anchor.position[2] + z * anchor.size[2] / 2,
      ])
    }
  }
  return {
    target: pivot,
    position: [pivot[0] + direction.x * range, pivot[1] + direction.y * range, pivot[2] + direction.z * range],
  }
}

export function traceWaypoints(
  edge: SceneReferenceEdge,
  viewingPose: CameraPose,
  anchors: Record<string, WorldAnchor>,
  view: ViewFraming,
  viewport?: InspectorViewport,
): readonly CameraWaypoint[] {
  const sourceId = edge.source.kind === 'frame' ? edge.source.frameId : edge.source.objectId
  const context = [anchors[sourceId], anchors[edge.targetObjectId]].filter((anchor) => anchor !== undefined)
  const points = [edge.from, edge.to]
  const frame = (pivot: Vec3) => viewport
    ? inspectorFocusPose(pivot, [0, 0, 0], viewingPose, context, view, viewport)
    : contextPose(pivot, viewingPose, context, points, view)
  const source = frame(edge.from)
  const destination = frame(edge.to)
  // Keep a constant viewing offset during reference traversal: pure translation,
  // no roll or rotation, and enough clearance for both ends for the entire path.
  const range = Math.max(distance(source.position, source.target), distance(destination.position, destination.target))
  const direction = new Vector3(...viewingPose.position).sub(new Vector3(...viewingPose.target)).normalize()
  if (direction.lengthSq() === 0) direction.set(0.35, 0.25, 1).normalize()
  const sourceOffset = new Vector3(...source.position).sub(new Vector3(...edge.from))
    .multiplyScalar(range / distance(source.position, source.target))
  const travelPose = (target: Vec3): CameraPose => ({
    target: viewport ? [
      target[0] + sourceOffset.x - direction.x * range,
      target[1] + sourceOffset.y - direction.y * range,
      target[2] + sourceOffset.z - direction.z * range,
    ] : target,
    position: [target[0] + sourceOffset.x, target[1] + sourceOffset.y, target[2] + sourceOffset.z],
  })
  return [
    { pose: travelPose(edge.from), durationMs: motionMs.quick },
    { pose: travelPose(edge.to), durationMs: motionMs.deliberate },
    { pose: frame(midpoint(edge.from, edge.to)), durationMs: motionMs.standard },
  ]
}
