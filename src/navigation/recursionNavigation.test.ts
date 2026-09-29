import { describe, expect, it } from 'vitest'
import { loadRecursionTrace, seek } from '../runtime'
import { createLayout } from '../world/layout'
import { buildSceneModel } from '../world/sceneModel'
import { PerspectiveCamera, Vector3 } from 'three'
import type { CameraPose } from '../contracts/interaction'
import type { TraceEvent } from '../contracts/runtime'
import type { SceneModel, Vec3, WorldAnchor } from '../contracts/world'
import { cameraCollisionBoxes, constrainCameraPose, limitsForOverview, zoomPose } from './cameraConstraints'
import { eventFocusAnchor, inspectorFocusPose, invocationContextPose, responsiveHomePose, sceneHomePose } from './cameraMotion'
import { detailDistanceForScene, detailLevelAtDistance, distance } from './navigation'

const trace = loadRecursionTrace()
const scene = buildSceneModel(seek(trace, 19), createLayout(trace), 'meso')
const frames = scene.frames
const viewFor = (aspect: number) => ({ verticalFov: 41 * Math.PI / 180, aspect })

function corners(anchor: WorldAnchor, padding: Vec3 = [0, 0, 0]): Vec3[] {
  const points: Vec3[] = []
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push([
    anchor.position[0] + x * (anchor.size[0] + padding[0]) / 2,
    anchor.position[1] + y * (anchor.size[1] + padding[1]) / 2,
    anchor.position[2] + z * (anchor.size[2] + padding[2]) / 2,
  ])
  return points
}

function projections(pose: CameraPose, points: Vec3[], aspect: number) {
  const camera = new PerspectiveCamera(41, aspect, 0.1, 200)
  camera.position.set(...pose.position)
  camera.lookAt(...pose.target)
  camera.updateMatrixWorld()
  return points.map((point) => new Vector3(...point).project(camera))
}

const base = { eventId: 'event:return', seq: 24, source: null, label: 'Return', importance: 'major' as const }

describe('reserved recursive camera composition', () => {
  it.each([0.8, 1.1, 1.54, 2.4])('fits every frame and heading in Home at aspect %s', (aspect) => {
    const home = sceneHomePose(scene, scene.bounds!.center, viewFor(aspect))
    const limits = limitsForOverview(home, scene.bounds!.size)
    const boxes = cameraCollisionBoxes(frames.map((frame) => frame.anchor), 0.1, viewFor(aspect).verticalFov, aspect)
    const bounded = constrainCameraPose(home, home, boxes, scene.bounds!.center, limits)
    expect(bounded).toEqual(home)
    for (const point of projections(home, frames.flatMap((frame) => corners(frame.anchor, [0.8, 1.5, 0.4])), aspect)) {
      expect(Math.abs(point.x)).toBeLessThan(0.95)
      expect(Math.abs(point.y)).toBeLessThan(0.95)
      expect(point.z).toBeGreaterThan(-1)
      expect(point.z).toBeLessThan(1)
    }
    const direction = new Vector3(...home.position).sub(new Vector3(...home.target)).normalize()
    expect(direction.x).toBeGreaterThan(0.2)
    expect(direction.y).toBeGreaterThan(0.2)
    expect(direction.z).toBeGreaterThan(0.7)
  })

  it('returns exactly the same Home as live frames enter, exit, and disappear', () => {
    const home = sceneHomePose(scene, scene.bounds!.center, viewFor(1.54))
    for (const count of [0, 1, 3, 6, 2, 0]) {
      const snapshot: SceneModel = { ...scene, frames: frames.slice(0, count) }
      expect(sceneHomePose(snapshot, scene.bounds!.center, viewFor(1.54))).toEqual(home)
    }
  })

  it('preserves exact Person camera framing even when shallow bounds are supplied', () => {
    for (const aspect of [0.8, 1.1, 1.54, 2.4]) {
      expect(sceneHomePose({ ...scene, stackDepth: 1 }, undefined, viewFor(aspect))).toEqual(responsiveHomePose(undefined, aspect))
    }
    expect(limitsForOverview(responsiveHomePose(undefined, 1.54)).maxDistance).toBe(32)
  })

  it('fits a live shallow reserved world only when explicitly requested', () => {
    const shallow = { ...scene, stackDepth: 1 }
    const target = shallow.bounds!.center
    const fitted = sceneHomePose(shallow, target, viewFor(1.54), true)
    const reserved = sceneHomePose(scene, target, viewFor(1.54))
    expect(fitted.target).toEqual(reserved.target)
    expect(distance(fitted.position, fitted.target)).toBeCloseTo(distance(reserved.position, reserved.target) * 0.87)
    expect(fitted).not.toEqual(responsiveHomePose(target, 1.54))
  })

  it('bounds repeated zoom at the reserved overview limit without clipping Home', () => {
    const home = sceneHomePose(scene, undefined, viewFor(0.8))
    const limits = limitsForOverview(home, scene.bounds!.size)
    let pose = home
    for (let count = 0; count < 100; count++) pose = zoomPose(pose, 'out', limits)
    expect(new Vector3(...pose.position).distanceTo(new Vector3(...pose.target))).toBeCloseTo(limits.maxDistance)
    expect(limits.maxDistance).toBeGreaterThan(new Vector3(...home.position).distanceTo(new Vector3(...home.target)))
    expect([...pose.position, ...pose.target].every(Number.isFinite)).toBe(true)
  })

  it('retains local detail at Home and uses relative zoom bands for the larger world', () => {
    const home = sceneHomePose(scene, undefined, viewFor(1.54))
    const range = distance(home.position, home.target)
    expect(detailLevelAtDistance(detailDistanceForScene(range, home, scene), 'meso')).toBe('meso')
    expect(detailLevelAtDistance(detailDistanceForScene(range * 2, home, scene), 'meso')).toBe('macro')
    expect(detailLevelAtDistance(detailDistanceForScene(range / 2, home, scene), 'meso')).toBe('micro')
    for (const input of [8, 14, 23]) expect(detailDistanceForScene(input, home, { ...scene, stackDepth: 1 })).toBe(input)
  })

  it('fits focused invocations and headings above the inspector shelf', () => {
    const viewport = { width: 944, height: 612 }
    const view = viewFor(viewport.width / viewport.height)
    const home = sceneHomePose(scene, undefined, view)
    for (const frame of frames) {
      const focus = inspectorFocusPose(frame.anchor.position, frame.anchor.size, home, [], view, viewport, frame.anchor.position)
      for (const point of projections(focus, corners(frame.anchor, [0.8, 1.5, 0.4]), view.aspect)) {
        const x = (point.x + 1) * viewport.width / 2
        const y = (1 - point.y) * viewport.height / 2
        expect(x).toBeGreaterThan(20)
        expect(x).toBeLessThan(viewport.width - 20)
        expect(y).toBeGreaterThan(64)
        expect(y).toBeLessThan(viewport.height - 190)
      }
    }
  })
})

describe('semantic descent and return attention', () => {
  it('targets the entered invocation and the caller after reduction removes a callee', () => {
    const entered: TraceEvent = { ...base, type: 'ENTER_METHOD', frameId: frames[5].id, callerFrameId: frames[4].id, className: 'Main', methodName: 'factorial', locals: [] }
    expect(eventFocusAnchor(entered, scene)).toEqual(frames[5].anchor)
    const exited: TraceEvent = { ...base, type: 'EXIT_METHOD', frameId: frames[5].id }
    expect(eventFocusAnchor(exited, { ...scene, frames: frames.slice(0, 5) })).toEqual(frames[4].anchor)
    expect(eventFocusAnchor(exited, { ...scene, frames: [] })).toBeNull()
  })

  it('targets the direct return destination rather than an unrelated explicit active entity', () => {
    const returned: TraceEvent = { ...base, type: 'RETURN_VALUE', frameId: frames[5].id, destination: { frameId: frames[4].id, slotId: 'child:4' }, value: { kind: 'primitive', javaType: 'int', value: 1 } }
    expect(eventFocusAnchor(returned, scene, frames[0].id)).toEqual(frames[4].anchor)
  })

  it('preserves yaw and fits immediate caller/callee context through the depth chain', () => {
    const view = viewFor(1.54)
    const home = sceneHomePose(scene, undefined, view)
    const direction = new Vector3(...home.position).sub(new Vector3(...home.target)).normalize()
    for (const frame of frames) {
      const pose = invocationContextPose(frame.anchor, scene, home, view)
      expect(pose.target).toEqual(frame.anchor.position)
      expect(new Vector3(...pose.position).sub(new Vector3(...pose.target)).normalize().distanceTo(direction)).toBeLessThan(1e-10)
      const neighbors = frames.filter((other) => Math.abs(other.depth - frame.depth) <= 1)
      for (const point of projections(pose, neighbors.flatMap((other) => corners(other.anchor)), view.aspect)) {
        expect(Math.abs(point.x)).toBeLessThan(1)
        expect(Math.abs(point.y)).toBeLessThan(1)
      }
    }
  })
})
