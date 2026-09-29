import { Vector3 } from 'three'
import type { CameraPose, Selection } from '../contracts/interaction'
import type { TraceEvent } from '../contracts/runtime'
import type { SceneModel, SceneReferenceEdge, Vec3, WorldAnchor } from '../contracts/world'
import { easeOutCubic, motionMs, worldUnits } from '../theme/tokens'
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
  if (event.type === 'PROGRAM_END' || event.type === 'ALLOCATE_ARRAY') return 'home'
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

/** The full-trace envelope is independent of the currently visible frames.
 * Person deliberately retains its established composition; deeper stacks fit
 * their reserved geometry and attached headings at the same canonical yaw.
 */
export function sceneHomePose(scene: Pick<SceneModel, 'stackDepth' | 'bounds' | 'layoutKind'>, target: Vec3 | undefined, view: ViewFraming, fitShallow = false): CameraPose {
  // Curated single-frame scenes retain their established camera pose, even when
  // a caller supplies bounds. A live debugger may explicitly fit its reserved world.
  if (!scene.bounds || (!fitShallow && (scene.stackDepth ?? 0) <= 1 && scene.layoutKind !== 'array' && scene.layoutKind !== 'scoped')) return responsiveHomePose(target, view.aspect)
  return reservedWorldPose(scene.bounds, target, homePose(target ?? scene.bounds.center), view)
}

/** The reserved envelope fits both Spatial and expanded Theater at any yaw. */
function reservedWorldPose(bounds: NonNullable<SceneModel['bounds']>, target: Vec3 | undefined, viewingPose: CameraPose, view: ViewFraming): CameraPose {
  const { center, size } = bounds
  const pivot = target ?? center
  if (bounds.points) return contextPose(pivot, viewingPose, [], bounds.points, view)
  const envelope: WorldAnchor = {
    entityId: 'navigation:reserved-bounds', region: 'stack',
    position: [center[0], center[1] + 0.35, center[2]],
    size: [size[0] + 1.4, size[1] + 1.8, size[2] + 0.8], ports: {}, bodyPort: center,
  }
  return contextPose(pivot, viewingPose, [envelope], [], view)
}

/** Kept in the controller ref, independently of the transient Focus history. */
export interface RepresentationMemory {
  presentation: 'spatial' | 'theater'
  spatialPose: CameraPose | null
}

export function representationTransition(
  presentation: 'spatial' | 'theater',
  memory: RepresentationMemory,
  currentPose: CameraPose,
  scene: SceneModel,
  target: Vec3 | undefined,
  view: ViewFraming,
): { memory: RepresentationMemory; pose: CameraPose | null } {
  if ((scene.presentation ?? 'spatial') !== presentation) return { memory, pose: null }
  if (memory.presentation === presentation) return { memory, pose: null }
  if (presentation === 'theater') {
    const pose = scene.bounds ? reservedWorldPose(scene.bounds, target, currentPose, view) : currentPose
    return { memory: { presentation, spatialPose: currentPose }, pose }
  }
  return { memory: { presentation, spatialPose: null },
    pose: memory.spatialPose ?? sceneHomePose(scene, target, view) }
}

/** Resolve semantic attention after reduction: an exited frame is no longer a
 * valid focus target, and a return transfers attention to its direct caller.
 */
export function eventFocusAnchor(event: TraceEvent, scene: SceneModel, activeEntityId?: string | null): WorldAnchor | null {
  const anchorFor = (id: string | null | undefined) => scene.frames.find((node) => node.id === id)?.anchor
    ?? scene.objects.find((node) => node.id === id)?.anchor ?? null
  if (event.type === 'ALLOCATE_ARRAY' || event.type === 'ARRAY_COMPARE') return anchorFor(event.objectId)
  if (event.type === 'ARRAY_READ' || event.type === 'ARRAY_WRITE') {
    const array = scene.objects.find((node) => node.id === event.objectId)
    return array?.array?.cells.find((cell) => cell.index === event.index)?.anchor ?? array?.anchor ?? null
  }
  if (event.type === 'EXIT_METHOD') {
    return anchorFor(activeEntityId) ?? scene.frames.reduce<typeof scene.frames[number] | null>(
      (deepest, frame) => !deepest || frame.depth > deepest.depth ? frame : deepest, null,
    )?.anchor ?? null
  }
  if (event.type === 'RETURN_VALUE') return anchorFor(event.destination?.frameId) ?? anchorFor(event.frameId)
  if (activeEntityId && anchorFor(activeEntityId)) return anchorFor(activeEntityId)
  if ('frameId' in event) return anchorFor(event.frameId)
  if ('objectId' in event) return anchorFor(event.objectId)
  if (event.type === 'CREATE_REFERENCE') return anchorFor(event.targetObjectId)
  return null
}

/** Follow one invocation with its immediate callers/callees. This makes the
 * descent and unwind readable while retaining orientation and user ownership.
 */
export function invocationContextPose(anchor: WorldAnchor, scene: SceneModel, viewingPose: CameraPose, view: ViewFraming): CameraPose {
  const frame = scene.frames.find((node) => node.id === anchor.entityId)
  const neighbors = frame ? scene.frames.filter((node) => Math.abs(node.depth - frame.depth) <= 1).map((node) => node.anchor) : [anchor]
  const padded = neighbors.map((node) => ({ ...node,
    position: [node.position[0], node.position[1] + 0.3, node.position[2]] as Vec3,
    size: [node.size[0] + 0.8, node.size[1] + 1.2, node.size[2] + 0.4] as Vec3,
  }))
  const flow = scene.returnFlow
  const points = flow && (flow.frameId === anchor.entityId || flow.destination?.frameId === anchor.entityId)
    ? [flow.from, ...(flow.to ? [flow.to] : [])] : []
  return contextPose(anchor.position, viewingPose, padded, points, view, 12)
}

/** Array inspection retains identity and the visible algorithm explanation above a cell. */
export function arrayInspectionContext(selection: NonNullable<Selection>, scene: SceneModel): WorldAnchor[] {
  const array = scene.objects.find((node) => node.array &&
    (selection.kind === 'object' ? node.id === selection.id : selection.kind === 'slot' && node.array.cells.some((cell) => cell.id === selection.id)))
  if (!array?.array) return []
  const { position, size } = array.anchor
  const header = worldUnits.arrayHeader
  const context: WorldAnchor[] = [{ ...array.anchor,
    position: [position[0], position[1] + size[1] / 2 - header.topInset, position[2]],
    size: [Math.min(size[0], header.maxWidth), header.height, header.depth] }]
  if (scene.presentation === 'theater' && scene.arrayActivity?.objectId === array.id) {
    const activity = scene.arrayActivity
    if (activity.kind === 'compare') context.push(...array.array.cells.filter((cell) => activity.indices.includes(cell.index)).map((cell) => cell.anchor))
    context.push({ entityId: 'navigation:array-explanation', region: 'heap',
      position: [position[0], position[1] + size[1] / 2 + 0.93, position[2] + size[2] / 2 + 0.05],
      size: [Math.min(size[0], 6.6), 0.4, 0.1], ports: {}, bodyPort: position })
  }
  return context
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
