import { describe, expect, it } from 'vitest'
import { Box3, PerspectiveCamera, Vector3 } from 'three'
import type { CameraPose } from '../contracts/interaction'
import type { DetailLevel, SceneClassNode, SceneModel, SceneObjectNode, Vec3, WorldAnchor } from '../contracts/world'
import { stackHeadingPosition } from '../world/runtimeHeadings'
import { cameraCollisionBoxes, constrainCameraPose, limitsForOverview } from './cameraConstraints'
import { guidedCameraAction, sceneHomePose, traceWaypoints } from './cameraMotion'
import { spatial2DetailExtent, spatial2DetailLevel, spatial2FocusPose, spatial2HomePose, spatial2Viewport } from './cameraSpatial2'
import { collisionAnchorsForScene, navigationActions, navigationWorldForScene, selectionPoint, useNavigationStore } from './navigation'

const view = { verticalFov: 41 * Math.PI / 180, aspect: 1.5 }
const anchor = (entityId: string, position: Vec3, size: Vec3 = [3.8, 2.5, 1.7], region: WorldAnchor['region'] = 'heap'): WorldAnchor => ({
  entityId, position, size, region, ports: {}, bodyPort: position,
})
const object = (id: string, position: Vec3): SceneObjectNode => ({ kind: 'object', id, label: id, className: 'Account', displayId: 1, fields: [], anchor: anchor(id, position) })
const storage: SceneClassNode = { kind: 'class', id: 'class:Registry', className: 'Registry', label: 'Registry', initialization: 'observed',
  fields: [{ id: 'Registry.current', name: 'current', javaType: 'Account', value: { kind: 'reference', javaType: 'Account', objectId: 'account' }, port: [-4, 0, 1] }],
  anchor: { ...anchor('class:Registry', [-5, 0, 0], [3.8, 2.5, 1.7], 'class'), ports: { 'Registry.current': [-4, 0, 1] } } }
const scene: SceneModel = { layoutKind: 'spatial2', frames: [], objects: [object('account', [1, 0, 0]), object('neighbor', [5, 1, -1])],
  classes: [storage], references: [{ id: 'ref:static', source: { kind: 'class', classId: storage.id, slotId: 'Registry.current' },
    targetObjectId: 'account', from: [-4, 0, 1], to: [1, 0, 1] }], activeEventId: null, detailLevel: 'meso' }

const corners = (body: WorldAnchor): Vec3[] => [-1, 1].flatMap((x): Vec3[] => [-1, 1].flatMap((y): Vec3[] => [-1, 1].map((z) => [
  body.position[0] + x * body.size[0] / 2, body.position[1] + y * body.size[1] / 2, body.position[2] + z * body.size[2] / 2,
])))
function project(pose: CameraPose, point: Vec3, aspect = view.aspect) {
  const camera = new PerspectiveCamera(41, aspect, 0.1, 100000)
  camera.position.set(...pose.position); camera.lookAt(...pose.target); camera.updateMatrixWorld()
  return new Vector3(...point).project(camera)
}

describe('Spatial 2.0 represented Home', () => {
  it.each([0.8, 1.5, 2.4])('fits tiny and large represented worlds with real XYZ at aspect %s', aspect => {
    for (const size of [[4, 3, 2], [400, 180, 230]] as Vec3[]) {
      const bounds = { center: [100, -40, -80] as Vec3, size }
      const pose = sceneHomePose({ layoutKind: 'spatial2', bounds }, [-900, 500, 400], { ...view, aspect })
      expect(pose.target).toEqual(bounds.center)
      for (const point of corners(anchor('bounds', bounds.center, size))) {
        const p = project(pose, point, aspect)
        expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1)
      }
      expect(constrainCameraPose(pose, pose, [], bounds.center, limitsForOverview(pose, size))).toEqual(pose)
    }
  })

  it('fits the supplied represented envelope rather than a hidden invocation catalog', () => {
    const represented = { ...scene, bounds: { center: [0, 0, 0] as Vec3, size: [18, 7, 8] as Vec3 } }
    const full = { ...scene, bounds: { center: [0, -2200, -950] as Vec3, size: [18, 4400, 1900] as Vec3 } }
    const home = sceneHomePose(represented, full.bounds.center, view)
    expect(home.target).toEqual(represented.bounds.center)
    expect(new Vector3(...home.position).distanceTo(new Vector3(...home.target))).toBeLessThan(40)
    expect(sceneHomePose({ ...represented, stackDepth: 1000 }, undefined, view)).toEqual(home)
  })

  it('fits occupied corners of sparse worlds and retains the envelope fallback for an empty point list', () => {
    const bodies = [anchor('low', [-18, -9, -10]), anchor('high', [18, 9, 10])]
    const points = bodies.flatMap(corners)
    const box = new Box3().setFromPoints(points.map(point => new Vector3(...point)))
    const bounds = { center: box.getCenter(new Vector3()).toArray() as unknown as Vec3, size: box.getSize(new Vector3()).toArray() as unknown as Vec3 }
    const viewport = spatial2Viewport(1440, 900, false)
    const framing = { ...view, aspect: viewport.width / viewport.height }
    const occupied = spatial2HomePose({ ...bounds, points }, framing, viewport)
    const envelope = spatial2HomePose(bounds, framing, viewport)
    expect(spatial2HomePose({ ...bounds, points: [] }, framing, viewport)).toEqual(envelope)
    const range = (pose: CameraPose) => new Vector3(...pose.position).distanceTo(new Vector3(...pose.target))
    expect(range(occupied)).toBeLessThan(range(envelope))
    for (const point of points) {
      const p = project(occupied, point, framing.aspect)
      expect((p.x + 1) * viewport.width / 2).toBeGreaterThan(20)
      expect((p.x + 1) * viewport.width / 2).toBeLessThan(viewport.width - 20)
      expect((1 - p.y) * viewport.height / 2).toBeGreaterThan(94)
      expect((1 - p.y) * viewport.height / 2).toBeLessThan(viewport.height - 100)
    }
  })

  it('array allocation is entity attention rather than a generic Home command', () => {
    const event = { type: 'ALLOCATE_ARRAY' as const, eventId: 'allocate', seq: 1, source: null, label: 'Allocation', importance: 'major' as const,
      objectId: 'array', displayId: 1, elementType: 'int', elements: [] }
    expect(guidedCameraAction(event, true, 'spatial2')).toBe('event')
    expect(guidedCameraAction(event, false, 'spatial2')).toBeNull()
    expect(guidedCameraAction(event, true, 'array')).toBe('home')
  })
})

describe('Spatial 2.0 selection and inspection', () => {
  it('includes represented IO solids in Home framing and in Home/Focus collision geometry', () => {
    const io = [{ id: 'stdout' as const, observations: 3, preview: 'Result',
      anchor: anchor('stdout', [-6, -5, 2], [3, 1.2, 0.8]) }]
    const represented = { ...scene, io }
    const focus = { ...represented, objects: [scene.objects[0]], classes: [] }
    for (const geometry of [represented, focus]) {
      expect(navigationWorldForScene(geometry).anchors.stdout).toBe(io[0].anchor)
      const boxes = cameraCollisionBoxes(collisionAnchorsForScene(geometry), 0.1, view.verticalFov, view.aspect)
      expect(boxes.some(box => box.containsPoint(new Vector3(...io[0].anchor.position)))).toBe(true)
      const inside: CameraPose = { position: io[0].anchor.position, target: [0, 0, 0] }
      const safe = constrainCameraPose(inside, inside, boxes)
      expect(boxes.some(box => box.containsPoint(new Vector3(...safe.position)))).toBe(false)
    }
    // The presentation worker supplies this IO-inclusive represented envelope.
    const envelope = new Box3().setFromPoints(collisionAnchorsForScene(represented).flatMap(body => corners(body).map(point => new Vector3(...point))))
    const center = envelope.getCenter(new Vector3()).toArray() as unknown as Vec3
    const size = envelope.getSize(new Vector3()).toArray() as unknown as Vec3
    const viewport = spatial2Viewport(1440, 900, true)
    const framing = { ...view, aspect: viewport.width / viewport.height }
    const home = spatial2HomePose({ center, size }, framing, viewport)
    for (const point of corners(io[0].anchor)) {
      const p = project(home, point, framing.aspect)
      expect((p.x + 1) * viewport.width / 2).toBeGreaterThan(20)
      expect((p.x + 1) * viewport.width / 2).toBeLessThan(viewport.width - 300)
      expect((1 - p.y) * viewport.height / 2).toBeGreaterThan(94)
      expect((1 - p.y) * viewport.height / 2).toBeLessThan(viewport.height - 100)
    }
  })

  it('reveals side/top depth while preserving a readable selected front face at desktop size', () => {
    const target = scene.objects[0]
    const viewport = spatial2Viewport(1440, 900, true)
    const framing = { ...view, aspect: viewport.width / viewport.height }
    const pose = spatial2FocusPose({ kind: 'object', id: target.id }, target.anchor, scene, framing, viewport)
    const subjectOnly = spatial2FocusPose({ kind: 'object', id: target.id }, target.anchor,
      { ...scene, objects: [target], classes: [], references: [] }, framing, viewport)
    const range = (value: CameraPose) => new Vector3(...value.position).distanceTo(new Vector3(...value.target))
    expect(range(pose)).toBeLessThanOrEqual(range(subjectOnly) * 1.15)
    const direction = new Vector3(...pose.position).sub(new Vector3(...pose.target))
    expect(direction.x / direction.z).toBeCloseTo(0.32)
    expect(direction.y / direction.z).toBeCloseTo(0.18)
    const front = corners(target.anchor).filter(point => point[2] > target.anchor.position[2])
      .map(point => project(pose, point, framing.aspect))
    const width = (Math.max(...front.map(point => point.x)) - Math.min(...front.map(point => point.x))) * viewport.width / 2
    expect(width).toBeGreaterThanOrEqual(250)
    for (const point of corners(target.anchor)) {
      const p = project(pose, point, framing.aspect)
      expect((p.x + 1) * viewport.width / 2).toBeGreaterThan(20)
      expect((p.x + 1) * viewport.width / 2).toBeLessThan(viewport.width - 300)
      expect((1 - p.y) * viewport.height / 2).toBeGreaterThan(94)
      expect((1 - p.y) * viewport.height / 2).toBeLessThan(viewport.height - 100)
    }
  })

  it('provides actual class storage anchors, field ports and physical collisions', () => {
    const world = navigationWorldForScene(scene)
    expect(selectionPoint({ kind: 'class', id: storage.id }, world)?.position).toEqual(storage.anchor.position)
    expect(selectionPoint({ kind: 'slot', id: 'Registry.current' }, world)?.position).toEqual([-4, 0, 1])
    const boxes = cameraCollisionBoxes(collisionAnchorsForScene(scene), 0.1, view.verticalFov, view.aspect)
    expect(boxes.some(box => box.containsPoint(new Vector3(...storage.anchor.position)))).toBe(true)
    const waypoints = traceWaypoints(scene.references[0], { position: [0, 8, 20], target: [0, 0, 0] }, world.anchors, view)
    expect(waypoints).toHaveLength(3)
    for (const pose of waypoints.map(waypoint => waypoint.pose)) for (const point of corners(storage.anchor)) {
      const p = project(pose, point)
      expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1)
    }
  })

  it('refuses departed slots even when the layout retains reserved ports', () => {
    const prior = { ...scene, classes: [{ ...storage, fields: [] }] }
    expect(selectionPoint({ kind: 'slot', id: 'Registry.current' }, navigationWorldForScene(prior))).toBeNull()
    expect(selectionPoint({ kind: 'object', id: 'unrepresented' }, navigationWorldForScene(scene))).toBeNull()
  })

  it('focuses observed overflow locals, instance fields and statics at their actual owner without reserving fake ports', () => {
    const value = { kind: 'primitive' as const, javaType: 'int' as const, value: 9 }
    const slots = Array.from({ length: 10 }, (_, index) => ({ id: `overflow:${index}`, name: `v${index}`, javaType: 'int', value, port: [0, 0, 0] as Vec3 }))
    const owners = [
      { ...scene.objects[0], fields: slots },
      { ...storage, fields: slots, anchor: { ...storage.anchor, ports: {} as WorldAnchor['ports'] } },
      { kind: 'frame' as const, id: 'many-locals', label: 'work()', active: true, depth: 0, slots, anchor: anchor('many-locals', [3, -4, 8], [5, 3, 2], 'stack') },
    ]
    for (const node of owners) {
      const live: SceneModel = { ...scene, frames: node.kind === 'frame' ? [node] : [], objects: node.kind === 'object' ? [node] : [], classes: node.kind === 'class' ? [node] : [], references: [] }
      const world = navigationWorldForScene(live)
      expect(selectionPoint({ kind: 'slot', id: slots[9].id }, world)).toEqual({ position: node.anchor.position, size: node.anchor.size })
      expect(node.anchor.ports[slots[9].id]).toBeUndefined()
      expect(selectionPoint({ kind: 'slot', id: 'not-observed' }, world)).toBeNull()
      const pose = spatial2FocusPose({ kind: 'slot', id: slots[9].id }, selectionPoint({ kind: 'slot', id: slots[9].id }, world)!, live, view, spatial2Viewport(1440, 900, true))
      for (const point of corners(node.anchor)) {
        const p = project(pose, point)
        expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1)
      }
    }
  })

  it('focuses sparse indexed cells at their observed anchors', () => {
    const cellAnchor = anchor('array:999', [30, 2, -7], [1.1, 1.15, 1.15])
    const array = { ...object('array', [20, 0, 0]), array: { elementType: 'int', length: 1000, cells: [{
      id: 'array:999', index: 999, name: '[999]', javaType: 'int', value: { kind: 'primitive' as const, javaType: 'int' as const, value: 18 },
      port: [30, 2, -6.4] as Vec3, anchor: cellAnchor,
    }] } }
    expect(selectionPoint({ kind: 'slot', id: 'array:999' }, navigationWorldForScene({ ...scene, objects: [array] })))
      .toEqual({ position: cellAnchor.position, size: cellAnchor.size })
  })

  it('keeps the selected body inside the inspector safe rectangle without fitting a remote neighbor', () => {
    const viewport = spatial2Viewport(1050, 700, true)
    const target = scene.objects[0]
    const remote = object('remote', [4000, -100, 800])
    const full = { ...scene, objects: [...scene.objects, remote], references: [...scene.references, {
      id: 'ref:remote', source: { kind: 'object' as const, objectId: target.id, slotId: 'remote' }, targetObjectId: remote.id,
      from: target.anchor.bodyPort, to: remote.anchor.bodyPort,
    }] }
    const pose = spatial2FocusPose({ kind: 'object', id: target.id }, target.anchor, full, view, viewport)
    for (const point of corners(target.anchor)) {
      const p = project(pose, point)
      expect((p.x + 1) * viewport.width / 2).toBeGreaterThan(20)
      expect((p.x + 1) * viewport.width / 2).toBeLessThan(viewport.width - 300)
      expect((1 - p.y) * viewport.height / 2).toBeGreaterThan(94)
      expect((1 - p.y) * viewport.height / 2).toBeLessThan(viewport.height - 100)
    }
    expect(new Vector3(...pose.position).distanceTo(new Vector3(...pose.target))).toBeLessThan(20)
  })

  it('retains focus selection on manual input and invalidates every pending camera move', () => {
    navigationActions.focus({ kind: 'class', id: storage.id })
    const before = useNavigationStore.getState().intentRevision
    navigationActions.freeExplore()
    expect(useNavigationStore.getState().intentRevision).toBeGreaterThan(before)
    expect(useNavigationStore.getState().intent).toBeNull()
    expect(useNavigationStore.getState().isolatedSelection).toEqual({ kind: 'class', id: storage.id })
    navigationActions.home()
  })
})

describe('Spatial 2.0 projection detail', () => {
  const rangeFor = (coverage: number, height = 2.5) => height / (2 * Math.tan(view.verticalFov / 2) * coverage)
  it('settles at each zoom threshold independently of the LOD population', () => {
    const bodies = (height: number, count: number) => Array.from({ length: count }, (_, index) => ({
      ...object(`body:${index}`, [index * 4, 0, 0]),
      anchor: anchor(`body:${index}`, [index * 4, 0, 0], [3.8, height, 1.7]),
    }))
    const catalog: SceneModel = { ...scene, objects: bodies(3.6, 11), classes: [], references: [] }
    const populations: Record<DetailLevel, SceneModel> = {
      macro: { ...catalog, objects: bodies(3.6, 2), detailLevel: 'macro' },
      meso: { ...catalog, objects: bodies(1.15, 7), detailLevel: 'meso' },
      micro: { ...catalog, objects: bodies(0.6, 1), detailLevel: 'micro' },
    }
    const range = rangeFor(0.13, 3.6)
    // Reproduce the feedback at one fixed camera pose if representation were
    // incorrectly used as the source: macro -> meso -> macro indefinitely.
    expect(spatial2DetailLevel(range, spatial2DetailExtent(populations.macro), view, 'macro')).toBe('meso')
    expect(spatial2DetailLevel(range, spatial2DetailExtent(populations.meso), view, 'meso')).toBe('macro')

    let current: DetailLevel = 'macro'
    for (const [coverage, expected] of [[0.13, 'meso'], [0.5, 'micro'], [0.32, 'meso'], [0.07, 'macro']] as const) {
      for (let render = 0; render < 6; render++) {
        const geometryScene = populations[current]
        // RuntimeCanvas supplies the unchanged catalog separately from each
        // new represented population; only detailLevel changes on the catalog.
        const sceneModel = { ...catalog, detailLevel: current }
        const extent = spatial2DetailExtent(sceneModel)
        expect(extent).toBe(3.6)
        expect(geometryScene.objects).not.toBe(sceneModel.objects)
        current = spatial2DetailLevel(rangeFor(coverage, 3.6), extent, view, current)
        expect(current).toBe(expected)
      }
    }
    const nextGeneration = { ...catalog, objects: bodies(1.15, 11) }
    expect(spatial2DetailExtent(nextGeneration)).toBe(1.15)
    expect(spatial2DetailLevel(range, spatial2DetailExtent(nextGeneration), view, 'meso')).toBe('macro')
  })

  it('changes detail with projected coverage and hysteresis independently of landscape size', () => {
    expect(spatial2DetailLevel(rangeFor(0.07), 2.5, view, 'meso')).toBe('macro')
    expect(spatial2DetailLevel(rangeFor(0.1), 2.5, view, 'macro')).toBe('macro')
    expect(spatial2DetailLevel(rangeFor(0.13), 2.5, view, 'macro')).toBe('meso')
    expect(spatial2DetailLevel(rangeFor(0.5), 2.5, view, 'meso')).toBe('micro')
    expect(spatial2DetailLevel(rangeFor(0.4), 2.5, view, 'micro')).toBe('micro')
    expect(spatial2DetailLevel(rangeFor(0.32), 2.5, view, 'micro')).toBe('meso')
    expect(spatial2DetailLevel(rangeFor(0.2, 250), 250, view, 'meso')).toBe('meso')
  })

  it('places generic STACK headings at actual represented invocation extents', () => {
    const frame = { kind: 'frame' as const, id: 'call', label: 'call()', active: true, depth: 0, slots: [],
      anchor: anchor('call', [-30, -100, -20], [5, 3, 2], 'stack') }
    expect(stackHeadingPosition({ ...scene, frames: [frame], stackDepth: 1000 })).toEqual([-32.5, -97.85, -18.9])
  })
})
