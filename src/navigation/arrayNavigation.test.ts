import { beforeEach, describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import type { CameraPose } from '../contracts/interaction'
import { arrayElementSlotId, type RuntimeState, type ScalarValue, type TraceDocument, type TraceEvent } from '../contracts/runtime'
import type { SceneModel, Vec3 } from '../contracts/world'
import { seek } from '../runtime'
import { createLayout } from '../world/layout'
import { buildSceneModel } from '../world/sceneModel'
import { cameraCollisionBoxes, cameraSegmentHit, collisionSafeRoute, constrainCameraPose, limitsForOverview } from './cameraConstraints'
import { arrayInspectionContext, eventFocusAnchor, guidedCameraAction, inspectorFocusPose, representationTransition, sceneHomePose } from './cameraMotion'
import { collisionAnchorsForScene, defaultHomePose, detailDistanceForScene, detailLevelAtDistance, distance, navigationActions, navigationWorldForScene, selectionPoint, useNavigationStore } from './navigation'

const int = (value: number): ScalarValue => ({ kind: 'primitive', javaType: 'int', value })
const objectId = 'array:numbers'
const base = { eventId: 'allocate', seq: 2, source: null, label: 'Allocate numbers', importance: 'major' as const }
const allocate: TraceEvent = { ...base, type: 'ALLOCATE_ARRAY', objectId, displayId: 23, elementType: 'int', elements: [3, 8, 1, 6, 2].map(int) }
const trace: TraceDocument = { schemaVersion: 1, demoId: 'navigation-array', sourceFiles: [], events: [
  { ...base, eventId: 'start', seq: 0, type: 'PROGRAM_START' },
  { ...base, eventId: 'enter', seq: 1, type: 'ENTER_METHOD', frameId: 'main', callerFrameId: null, className: 'Main', methodName: 'main', locals: [] },
  allocate,
] }
const layout = createLayout(trace)
// Construct the allocated snapshot from the locked runtime contract. These tests
// exercise the actual layout/projection pipeline independently of reducer work.
const runtime: RuntimeState = { ...seek(trace, 2), cursor: 3, lastEventId: allocate.eventId, arrayActivity: null, arrayMutations: [], objects: {
  [objectId]: { id: objectId, displayId: 23, className: 'int[]', fields: {}, allocatedAt: allocate.eventId,
    array: { elementType: 'int', length: 5, elements: [3, 8, 1, 6, 2].map((value, index) => ({
      id: arrayElementSlotId(objectId, index), name: `[${index}]`, javaType: 'int', value: int(value),
    })) } },
} }
const spatial = buildSceneModel(runtime, layout, 'meso', 'spatial')
const theater = buildSceneModel(runtime, layout, 'meso', 'theater')
const viewFor = (aspect: number) => ({ verticalFov: 41 * Math.PI / 180, aspect })
const offset = (pose: CameraPose) => new Vector3(...pose.position).sub(new Vector3(...pose.target)).normalize()

function expectFits(pose: CameraPose, points: readonly Vec3[], aspect: number) {
  const camera = new PerspectiveCamera(41, aspect, 0.1, 200)
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

beforeEach(() => {
  useNavigationStore.setState({ mode: 'HOME', pose: defaultHomePose, previousPose: null, previousMode: null,
    detailLevel: 'meso', followEnabled: false, selection: null, traceReferenceId: null, intent: null, intentRevision: 0 })
})

describe('array world composition', () => {
  it.each([0.8, 1.1, 1.54, 2.4])('fits the trace-reserved array and heading bounds at aspect %s', (aspect) => {
    for (const scene of [spatial, theater]) {
      expect(scene.layoutKind).toBe('array')
      expect(scene.stackDepth).toBe(0)
      const home = sceneHomePose(scene, undefined, viewFor(aspect))
      expectFits(home, scene.bounds!.points!, aspect)
      const world = navigationWorldForScene(scene)
      const boxes = cameraCollisionBoxes(collisionAnchorsForScene(scene), 0.1, viewFor(aspect).verticalFov, aspect)
      expect(constrainCameraPose(home, home, boxes, world.homeTarget, limitsForOverview(home, scene.bounds!.size))).toEqual(home)
    }
  })

  it('collides with physical cells and the identity header while leaving stage gaps open', () => {
    const physical = collisionAnchorsForScene(theater)
    const parent = theater.objects[0].anchor
    const header = physical.find((anchor) => anchor.entityId === objectId)!
    expect(header.size[0]).toBeLessThan(parent.size[0])
    expect(header.size[1]).toBeLessThan(parent.size[1])
    const boxes = cameraCollisionBoxes(physical, 0.1, viewFor(1.54).verticalFov, 1.54)
    for (const cell of theater.objects[0].array!.cells) {
      expect(boxes.some((box) => box.containsPoint(new Vector3(...cell.anchor.position)))).toBe(true)
    }
    const [first, second] = theater.objects[0].array!.cells
    const gap = new Vector3((first.anchor.position[0] + second.anchor.position[0]) / 2, 0.95, -0.65)
    expect(boxes.some((box) => box.containsPoint(gap))).toBe(false)
  })

  it('keeps Home fixed before allocation, after allocation and after values change', () => {
    const home = sceneHomePose(spatial, undefined, viewFor(1.54))
    const changed: RuntimeState = { ...runtime, objects: { [objectId]: { ...runtime.objects[objectId], array: {
      ...runtime.objects[objectId].array!, elements: runtime.objects[objectId].array!.elements.map((slot, index) => ({ ...slot, value: int(index + 1) })),
    } } } }
    for (const snapshot of [seek(trace, 0), seek(trace, 2), runtime, changed]) {
      expect(sceneHomePose(buildSceneModel(snapshot, layout, 'meso'), undefined, viewFor(1.54))).toEqual(home)
    }
  })

  it.each([0.8, 1.54])('keeps the Theater comparison caption inside cell inspection at aspect %s', (aspect) => {
    const array = theater.objects[0]
    const cell = array.array!.cells[1]
    const explaining: SceneModel = { ...theater, arrayActivity: { kind: 'compare', eventId: 'compare', objectId,
      indices: [0, 1], values: [int(3), int(8)], operator: '>', result: false } }
    const context = arrayInspectionContext({ kind: 'slot', id: cell.id }, explaining)
    expect(context.some((anchor) => anchor.entityId === 'navigation:array-explanation')).toBe(true)
    const height = 616
    const home = sceneHomePose(explaining, undefined, viewFor(aspect))
    const focused = inspectorFocusPose(cell.anchor.position, cell.anchor.size, home, context, viewFor(aspect), { width: height * aspect, height })
    const caption = context.find((anchor) => anchor.entityId === 'navigation:array-explanation')!
    const camera = new PerspectiveCamera(41, aspect, 0.1, 200)
    camera.position.set(...focused.position)
    camera.lookAt(...focused.target)
    camera.updateMatrixWorld()
    const projected = new Vector3(...caption.position).project(camera)
    expect(projected.y).toBeLessThan(1 - 2 * 64 / height)
    expect(projected.y).toBeGreaterThan(-1 + 2 * 190 / height)
    expect(Math.abs(projected.x)).toBeLessThan(1)
  })

  it('retains local detail at array Home with relative macro/micro zoom', () => {
    for (const scene of [spatial, theater]) {
      const home = sceneHomePose(scene, undefined, viewFor(1.54))
      const range = distance(home.position, home.target)
      expect(detailLevelAtDistance(detailDistanceForScene(range, home, scene), 'meso')).toBe('meso')
      expect(detailLevelAtDistance(detailDistanceForScene(range * 2, home, scene), 'meso')).toBe('macro')
      expect(detailLevelAtDistance(detailDistanceForScene(range / 2, home, scene), 'meso')).toBe('micro')
    }
  })

  it('focuses the selected indexed volume rather than its front port or its parent', () => {
    for (const scene of [spatial, theater]) {
      const cell = scene.objects[0].array!.cells[3]
      const world = navigationWorldForScene(scene)
      expect(selectionPoint({ kind: 'slot', id: cell.id }, world)).toEqual({ position: cell.anchor.position, size: cell.anchor.size })
      expect(world.anchors[cell.id]).toBe(cell.anchor)
      expect(selectionPoint({ kind: 'slot', id: 'missing' }, world)).toBeNull()
    }
  })

  it('keeps camera routes clear of the expanded physical cells', () => {
    const view = viewFor(1.54)
    const world = navigationWorldForScene(theater)
    const home = sceneHomePose(theater, undefined, view)
    const boxes = cameraCollisionBoxes(collisionAnchorsForScene(theater), 0.1, view.verticalFov, view.aspect)
    const limits = limitsForOverview(home, theater.bounds!.size)
    const parent = theater.objects[0].anchor
    const from: CameraPose = { position: [parent.position[0], parent.position[1], parent.position[2] - 8], target: parent.position }
    const to: CameraPose = { position: [parent.position[0], parent.position[1], parent.position[2] + 8], target: parent.position }
    const blocked = constrainCameraPose(to, from, boxes, world.homeTarget, limits)
    expect(blocked.position[2]).toBeLessThan(parent.position[2] - parent.size[2] / 2)
    const route = collisionSafeRoute(from, to, boxes, world.homeTarget, limits)
    expect(route.at(-1)).toEqual(to)
    let previous = new Vector3(...from.position)
    for (const pose of route) {
      const next = new Vector3(...pose.position)
      for (const box of boxes) expect(cameraSegmentHit(previous, next, box)).toBeNull()
      previous = next
    }
  })
})

describe('Spatial and Theater navigation continuity', () => {
  it.each([0.8, 1.54, 2.4])('fits the expanded stage retaining the user orientation at aspect %s', (aspect) => {
    const userPose: CameraPose = { position: [-8, 9, 17], target: [-1, 0.5, -0.4] }
    const entered = representationTransition('theater', { presentation: 'spatial', spatialPose: null }, userPose, theater, undefined, viewFor(aspect))
    expect(entered.memory.spatialPose).toEqual(userPose)
    expect(offset(entered.pose!).distanceTo(offset(userPose))).toBeLessThan(1e-10)
    expectFits(entered.pose!, theater.bounds!.points!, aspect)
    const restored = representationTransition('spatial', entered.memory, entered.pose!, spatial, undefined, viewFor(aspect))
    expect(restored.pose).toEqual(userPose)
    expect(restored.memory.spatialPose).toBeNull()
  })

  it('restores Spatial after Theater Focus replaces ordinary navigation memory', () => {
    const userPose: CameraPose = { position: [3, 6, 18], target: [-1, 0.5, 0] }
    const entered = representationTransition('theater', { presentation: 'spatial', spatialPose: null }, userPose, theater, undefined, viewFor(1.54))
    navigationActions.setRepresentation('theater')
    useNavigationStore.getState().setPose(entered.pose!)
    navigationActions.focus({ kind: 'slot', id: arrayElementSlotId(objectId, 2) })
    expect(useNavigationStore.getState().previousPose).toEqual(entered.pose)
    navigationActions.setRepresentation('spatial')
    const restored = representationTransition('spatial', entered.memory, entered.pose!, spatial, undefined, viewFor(1.54))
    expect(restored.pose).toEqual(userPose)
    expect(useNavigationStore.getState().previousPose).toBeNull()
    expect(useNavigationStore.getState().followEnabled).toBe(false)
  })

  it('defers an intent until its matching scene arrives and ignores repeated representation selection', () => {
    const memory = { presentation: 'spatial' as const, spatialPose: null }
    expect(representationTransition('theater', memory, defaultHomePose, spatial, undefined, viewFor(1.54))).toEqual({ memory, pose: null })
    const entered = representationTransition('theater', memory, defaultHomePose, theater, undefined, viewFor(1.54))
    expect(representationTransition('theater', entered.memory, entered.pose!, theater, undefined, viewFor(1.54))).toEqual({ memory: entered.memory, pose: null })
  })

  it('issues representation intents and immediately invalidates them on user input', () => {
    navigationActions.followExecution()
    navigationActions.setRepresentation('theater')
    const revision = useNavigationStore.getState().intentRevision
    expect(useNavigationStore.getState().mode).toBe('THEATER')
    expect(useNavigationStore.getState().intent).toEqual({ kind: 'representation', presentation: 'theater' })
    expect(useNavigationStore.getState().followEnabled).toBe(false)
    navigationActions.freeExplore()
    expect(useNavigationStore.getState().intentRevision).toBeGreaterThan(revision)
    expect(useNavigationStore.getState().intent).toBeNull()
    navigationActions.setRepresentation('spatial')
    expect(useNavigationStore.getState().mode).toBe('FREE_EXPLORE')
    expect(useNavigationStore.getState().intent).toEqual({ kind: 'representation', presentation: 'spatial' })
  })
})

describe('array event attention', () => {
  it('fits allocation Home only when Follow is enabled', () => {
    expect(guidedCameraAction(allocate, true)).toBe('home')
    expect(guidedCameraAction(allocate, false)).toBeNull()
    expect(eventFocusAnchor(allocate, theater)).toEqual(theater.objects[0].anchor)
  })

  it('targets reads and writes at the exact cell, and comparisons at the array', () => {
    const events: TraceEvent[] = [
      { ...base, type: 'ARRAY_READ', frameId: 'main', objectId, index: 2, value: int(1) },
      { ...base, type: 'ARRAY_WRITE', frameId: 'main', objectId, index: 2, value: int(8), from: { kind: 'element', index: 1 } },
    ]
    for (const event of events) expect(eventFocusAnchor(event, theater, 'main')).toEqual(theater.objects[0].array!.cells[2].anchor)
    const compared: TraceEvent = { ...base, type: 'ARRAY_COMPARE', frameId: 'main', objectId, indices: [1, 2], values: [int(8), int(1)], operator: '>', result: true }
    expect(eventFocusAnchor(compared, theater, 'main')).toEqual(theater.objects[0].anchor)
    const absent: SceneModel = { ...theater, objects: [] }
    expect(eventFocusAnchor(events[0], absent, 'main')).toBeNull()
  })
})
