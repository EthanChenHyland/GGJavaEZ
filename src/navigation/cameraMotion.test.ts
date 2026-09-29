import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import type { CameraPose } from '../contracts/interaction'
import type { TraceEvent } from '../contracts/runtime'
import type { SceneReferenceEdge, Vec3, WorldAnchor } from '../contracts/world'
import { motionMs } from '../theme/tokens'
import { stackHeadingFootprint } from '../world/runtimeHeadings'
import { contextPose, guidedCameraAction, inspectorFocusPose, responsiveHomePose, sampleCameraMove, sceneHomePose, traceWaypoints } from './cameraMotion'
import type { CameraMove } from './cameraMotion'
import { defaultHomePose, midpoint } from './navigation'

const source: WorldAnchor = {
  entityId: 'main', region: 'stack', position: [-4, 0, 0], size: [5.1, 1.7, 1.25], ports: {}, bodyPort: [-1.45, 0, 0.7],
}
const destination: WorldAnchor = {
  entityId: 'person', region: 'heap', position: [4, 1.5, -2], size: [3.8, 2.5, 1.7], ports: {}, bodyPort: [2.1, 1.5, -1],
}
const edge: SceneReferenceEdge = {
  id: 'ref:p', source: { kind: 'frame', frameId: 'main', slotId: 'p' },
  targetObjectId: 'person', from: source.bodyPort, to: destination.bodyPort,
}
const anchors = { main: source, person: destination }
const view = { verticalFov: Math.PI / 4, aspect: 1.65 }

function moveFor(reference = edge): CameraMove {
  const waypoints = traceWaypoints(reference, defaultHomePose, anchors, view)
  return { from: defaultHomePose, to: waypoints[2].pose, waypoints, elapsedMs: 0, revision: 1 }
}

function expectInView(pose: CameraPose, points: Vec3[], aspect: number) {
  const camera = new PerspectiveCamera(45, aspect, 0.1, 200)
  camera.position.set(...pose.position)
  camera.lookAt(...pose.target)
  camera.updateMatrixWorld()
  for (const point of points) {
    const projected = new Vector3(...point).project(camera)
    expect(Math.abs(projected.x)).toBeLessThan(1)
    expect(Math.abs(projected.y)).toBeLessThan(1)
    expect(projected.z).toBeGreaterThan(-1)
    expect(projected.z).toBeLessThan(1)
  }
}

const corners = Object.values(anchors).flatMap((anchor) => {
  const points: Vec3[] = []
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push([
    anchor.position[0] + x * anchor.size[0] / 2,
    anchor.position[1] + y * anchor.size[1] / 2,
    anchor.position[2] + z * anchor.size[2] / 2,
  ])
  return points
})

it.each([[1, 760 / 400], [1, 934 / 340], [2, 760 / 400], [2, 934 / 340]])('debugger Home includes the reserved STACK heading and solids, depth %s aspect %s', (stackDepth, aspect) => {
  const scene = { stackDepth, bounds: { center: [0, 0, 0] as Vec3, size: [14, 4, 4] as Vec3, points: corners } }
  const pose = sceneHomePose(scene, scene.bounds.center, { ...view, aspect }, true)
  expect(pose.target).toEqual(scene.bounds.center)
  expectInView(pose, [...corners, ...stackHeadingFootprint(scene)], aspect)
  // Curated shallow Home retains its established pose.
  if (stackDepth === 1) expect(sceneHomePose(scene, undefined, { ...view, aspect })).toEqual(responsiveHomePose(undefined, aspect))
})

describe('Trace Path choreography', () => {
  it('visits source, moves the pivot along the edge, reaches destination, then settles to context', () => {
    const move = moveFor()
    move.elapsedMs = motionMs.quick
    expect(sampleCameraMove(move).pose.target).toEqual(edge.from)
    move.elapsedMs += motionMs.deliberate / 2
    const sample = sampleCameraMove(move)
    // Cubic easing has progressed 7/8 of the way along the source-to-destination segment.
    expect(sample.pose.target[0]).toBeCloseTo(edge.from[0] + (edge.to[0] - edge.from[0]) * 0.875)
    expect(sample.pose.target[1]).toBeCloseTo(edge.from[1] + (edge.to[1] - edge.from[1]) * 0.875)
    expect(sample.done).toBe(false)
    move.elapsedMs = motionMs.quick + motionMs.deliberate
    expect(sampleCameraMove(move).pose.target).toEqual(edge.to)
    move.elapsedMs += motionMs.standard
    expect(sampleCameraMove(move)).toEqual({ pose: move.to, done: true })
    expect(move.to.target).toEqual(midpoint(edge.from, edge.to))
  })

  it.each([0.8, 1.65])('keeps both endpoint bodies in view through travel and at rest, aspect %s', (aspect) => {
    const waypoints = traceWaypoints(edge, defaultHomePose, anchors, { ...view, aspect })
    const move = { ...moveFor(), waypoints, to: waypoints[2].pose }
    for (let time = motionMs.quick; time <= motionMs.quick + motionMs.deliberate + motionMs.standard; time += 20) {
      expectInView(sampleCameraMove({ ...move, elapsedMs: time }).pose, [...corners, edge.from, edge.to], aspect)
    }
    expectInView(move.to, corners, aspect)
  })

  it('handles coincident endpoints without invalid coordinates or a spurious orbit', () => {
    const move = moveFor({ ...edge, to: edge.from })
    for (const waypoint of move.waypoints) {
      expect([...waypoint.pose.position, ...waypoint.pose.target].every(Number.isFinite)).toBe(true)
      expect(waypoint.pose.target).toEqual(edge.from)
    }
  })

  it('ends exactly at the resting pose even if a frame spans multiple stages', () => {
    const move = moveFor()
    expect(sampleCameraMove({ ...move, elapsedMs: 2000 })).toEqual({ pose: move.to, done: true })
    expect(sampleCameraMove({ ...move, elapsedMs: 0 }).pose).toEqual(defaultHomePose)
  })
})

describe('Guided Follow', () => {
  it('settles PROGRAM_END Home only while follow is enabled, regardless of importance', () => {
    const event: TraceEvent = {
      type: 'PROGRAM_END', eventId: 'end', seq: 99, source: null, label: 'End', importance: 'normal',
    }
    expect(guidedCameraAction(event, true)).toBe('home')
    expect(guidedCameraAction(event, false)).toBeNull()
    expect(guidedCameraAction({ ...event, type: 'PROGRAM_START', importance: 'quiet' }, true)).toBeNull()
    expect(guidedCameraAction({ ...event, type: 'PROGRAM_START', importance: 'major' }, true)).toBe('event')
  })

  it('frames the surrounding world while biasing its pivot toward the active entity', () => {
    const pivot = midpoint(defaultHomePose.target, destination.position)
    const pose = contextPose(pivot, defaultHomePose, Object.values(anchors), [edge.from, edge.to], view)
    expect(pose.target).toEqual(pivot)
    expectInView(pose, corners, view.aspect)
  })
})

describe('inspector shelf safe rectangle', () => {
  const viewport = { width: 944, height: 724 }
  const shelfView = { verticalFov: 41 * Math.PI / 180, aspect: viewport.width / viewport.height }

  const expectAboveShelf = (pose: CameraPose, points: Vec3[]) => {
    const camera = new PerspectiveCamera(41, shelfView.aspect, 0.1, 200)
    camera.position.set(...pose.position)
    camera.lookAt(...pose.target)
    camera.updateMatrixWorld()
    for (const point of points) {
      const projected = new Vector3(...point).project(camera)
      const x = (projected.x + 1) * viewport.width / 2
      const y = (1 - projected.y) * viewport.height / 2
      expect(x).toBeGreaterThan(20)
      expect(x).toBeLessThan(viewport.width - 20)
      expect(y).toBeGreaterThan(64)
      expect(y).toBeLessThan(viewport.height - 190)
    }
  }

  it('keeps the selected body and caption space above the shelf without forcing a whole-world macro view', () => {
    const pivot = midpoint(defaultHomePose.target, destination.position)
    const pose = inspectorFocusPose(pivot, destination.size, defaultHomePose,
      [], shelfView, viewport, destination.position)
    expectAboveShelf(pose, [...corners.slice(8),
      [destination.position[0], destination.position[1] + destination.size[1] / 2 + 1.2, destination.position[2]],
    ])
    expect(new Vector3(...pose.position).distanceTo(new Vector3(...pose.target))).toBeGreaterThanOrEqual(8.5)
  })

  it('reserves the shelf throughout reference travel and in the resting composition', () => {
    const waypoints = traceWaypoints(edge, defaultHomePose, anchors, shelfView, viewport)
    const move = { ...moveFor(), waypoints, to: waypoints[2].pose }
    for (let time = motionMs.quick; time <= motionMs.quick + motionMs.deliberate + motionMs.standard; time += 20) {
      expectAboveShelf(sampleCameraMove({ ...move, elapsedMs: time }).pose, corners)
    }
    expectAboveShelf(move.to, corners)
  })
})

describe('persistent Home composition', () => {
  it('scales the fixed camera offset at narrow aspect ratios without using cursor or live bounds', () => {
    const wide = responsiveHomePose(undefined, 1.65)
    expect(wide).toEqual(defaultHomePose)
    const narrow = responsiveHomePose(undefined, 760 / 678)
    expect(narrow.target).toEqual(wide.target)
    const scale = 1.3 / (760 / 678)
    for (let axis = 0; axis < 3; axis++) {
      expect(narrow.position[axis] - narrow.target[axis]).toBeCloseTo(
        (wide.position[axis] - wide.target[axis]) * scale,
      )
    }
    expectInView(narrow, corners, 760 / 678)
  })
})
