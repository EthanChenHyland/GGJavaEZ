import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import type { TraceDocument, TraceEvent, RuntimeSlot } from '../contracts/runtime'
import type { Vec3, WorldAnchor } from '../contracts/worldV2'
import { seek } from '../runtime'
import { createFlowCatalog } from '../world/flowCatalog'
import { projectTrace } from '../testing/projectTrace'
import { planPresentation, anchorCorners } from '../world/presentationPlanner'
import { inspectorEntity } from '../render/inspection'
import { faceRowPort } from '../world/faceRows'
import { homeFraming } from './homeFraming'
import { focusFraming } from './focusFraming'
import { followPathFraming } from './followPathFraming'
import { fitToSafeFrame, projectionCamera, screenPoint, frontFace, representativeFaceHeight, nextDetailLevel } from './projection'
import { cameraCollisionAnchors, cameraCollisionBoxes, constrainCameraPose, limitsForOverview } from './cameraConstraints'
import { guidedFollow, isFollowSubjectEvent } from './guidedFollow'
import { useCameraStore } from './cameraStore'
import { useInteractionStore } from '../interaction/interactionStore'
import { cameraPosition } from './projection'
import { camera as tokens } from '../theme/tokens'

type Input<T = TraceEvent> = T extends TraceEvent ? Omit<T, 'eventId' | 'seq' | 'source' | 'label' | 'importance'> : never
const int = (value: number) => ({ kind: 'primitive' as const, javaType: 'int' as const, value })
const field = (id: string): RuntimeSlot => ({ id, name: id, javaType: 'int', value: int(9) })
const allocation = (id: string, fields: RuntimeSlot[] = []): Input => ({ type: 'ALLOCATE_OBJECT', objectId: id, displayId: 1, className: 'Account', fields, metadata: { ownership: 'PROJECT', runtimeType: 'Account', packageName: '' } })
function rig(inputs: Input[]) {
 const events = [{ type: 'PROGRAM_START' as const }, ...inputs].map((event, seq) => ({ ...event, ...('displayId' in event ? { displayId: seq } : {}), eventId: `unit/camera/${seq}`, seq, source: null, label: 'Explicit normalized camera fixture', importance: 'major' as const }))
 const trace: TraceDocument = { schemaVersion: 2, demoId: 'unit/camera', sourceFiles: [], events }, projection = projectTrace(trace), scene = projection.project(events.length)
 const graph = seek(trace, events.length).executionGraph, flows = createFlowCatalog()
 if (graph) flows.extend(graph, trace)
 return { trace, projection, scene, flows }
}
const r = rig([allocation('account'), allocation('neighbor'), { type: 'CLASS_OBSERVE', classId: 'jvm:class:Registry', className: 'Registry', initialization: 'observed', fields: [{ id: 'Registry.current', name: 'current', javaType: 'Account', value: { kind: 'reference', javaType: 'Account', objectId: 'account' } }] },
 { type: 'SET_STATIC', classId: 'jvm:class:Registry', slotId: 'Registry.current', value: { kind: 'reference', javaType: 'Account', objectId: 'account' } },
 { type: 'EXECUTION_FACT', fact: { kind: 'write', target: { id: 'Registry.current', kind: 'static', ownerId: 'jvm:class:Registry', name: 'current', javaType: 'Account' }, value: { kind: 'reference', javaType: 'Account', objectId: 'account' }, origin: { kind: 'unknown' }, context: { owner: 'Registry', name: 'write', descriptor: '()V', frameId: null, site: 1, rawSeq: 91, source: null } } }])
const viewport = { width: 1440, height: 900 }, safe = { x: 20, y: 94, width: 1100, height: 706 }
const plan = (data = r, focusTargetId: string | null = null) => planPresentation({ scene: data.scene, flows: data.flows, layout: data.projection.layout, detailLevel: 'CLOSE', selection: null, focusTargetId, trace: { active: false, scope: 'relevant' } })
const geometry = (id: string, position: Vec3, size: Vec3): WorldAnchor => ({ entityId: id, region: 'heap', position, size, ports: {}, bodyPort: position })
function fits(points: readonly Vec3[], pose: Parameters<typeof projectionCamera>[0], area = safe, size = viewport) {
 const camera = projectionCamera(pose, size)
 for (const point of points) { const p = screenPoint(point, camera, size); expect(p.x).toBeGreaterThanOrEqual(area.x - 1e-6); expect(p.x).toBeLessThanOrEqual(area.x + area.width + 1e-6); expect(p.y).toBeGreaterThanOrEqual(area.y - 1e-6); expect(p.y).toBeLessThanOrEqual(area.y + area.height + 1e-6) }
}

describe('production world framing', () => {
 it.each([.8, 1.5, 2.4])('fits the original tiny and large physical envelopes at aspect %s', aspect => {
  for (const size of [[4, 3, 2], [400, 180, 230]] as Vec3[]) {
   const body = geometry('unit/envelope', [100, -40, -80], size), view = { width: aspect * 900, height: 900 }, area = { x: 20, y: 94, width: view.width - 40, height: 706 }
   const points = anchorCorners(body), pose = fitToSafeFrame(points, tokens.hero, area, view)
   fits(points, pose, area, view)
   const eye = { position: cameraPosition(pose), target: pose.target }
   expect(constrainCameraPose(eye, eye, [], body.position, limitsForOverview(eye, size))).toEqual(eye)
  }
 })
 it('fits supplied physical points without a hidden invocation catalog or unrelated target', () => {
  const body = geometry('represented', [0, 0, 0], [18, 7, 8]), points = anchorCorners(body), first = fitToSafeFrame(points, tokens.hero, safe, viewport)
  expect(fitToSafeFrame([...points], tokens.hero, safe, viewport)).toEqual(first)
  expect(first.distance).toBeLessThan(40); fits(points, first)
 })
 it('uses occupied corners in sparse worlds and keeps the empty-world fallback finite', () => {
  const bodies = [geometry('low', [-18, -9, -10], [3.8, 2.5, 1.7]), geometry('high', [18, 9, 10], [3.8, 2.5, 1.7])], points = bodies.flatMap(anchorCorners), box = new Box3().setFromPoints(points.map(point => new Vector3(...point)))
  const envelope = geometry('envelope', box.getCenter(new Vector3()).toArray() as unknown as Vec3, box.getSize(new Vector3()).toArray() as unknown as Vec3)
  const occupied = fitToSafeFrame(points, tokens.hero, safe, viewport), full = fitToSafeFrame(anchorCorners(envelope), tokens.hero, safe, viewport)
  expect(occupied.distance).toBeLessThan(full.distance); fits(points, occupied)
  const empty = fitToSafeFrame([], tokens.hero, safe, viewport); expect([...empty.target, empty.distance].every(Number.isFinite)).toBe(true)
 })
 it('recognizes actual array allocation as Follow subject attention without a separate array camera', () => {
  const current = rig([{ type: 'ENTER_METHOD', frameId: 'allocating', callerFrameId: null, className: 'Unit', methodName: 'run', locals: [] }, { type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 1, elementType: 'int', elements: [] }]), event = current.trace.events.at(-1)!
  expect(isFollowSubjectEvent(event)).toBe(true)
  const result = guidedFollow(current.scene, plan(current), event, useCameraStore.getInitialState().pose, safe, viewport, null)
  expect(result.ids).toContain('array'); expect(result.points).toEqual([...anchorCorners(current.scene.entities.allocating.anchor), ...anchorCorners(current.scene.entities.array.anchor)])
 })
})

describe('production selection and inspection framing', () => {
 it('includes actual I/O solids in camera collision geometry while keeping the same catalog under Focus', () => {
  const current = rig([allocation('a'), { type: 'CONSOLE_WRITE', frameId: null, channel: 'stdout', text: 'Result\n' }]), io = current.scene.io[0]
  expect(io.anchor).toBe(current.projection.layout.anchors.stdout)
  for (const focus of [null, 'a']) {
   const cut = plan(current, focus); expect(cut.accounting.total).toBe(1)
   const boxes = cameraCollisionBoxes(cameraCollisionAnchors(current.scene), .1, tokens.fov * Math.PI / 180, 1.5)
   expect(boxes.some(box => box.containsPoint(new Vector3(...io.anchor.position)))).toBe(true)
   const inside = { position: io.anchor.position, target: [0, 0, 0] as Vec3 }, escaped = constrainCameraPose(inside, inside, boxes)
   expect(boxes.some(box => box.containsPoint(new Vector3(...escaped.position)))).toBe(false)
   const points = [...Object.values(current.scene.entities).flatMap(node => anchorCorners(node.anchor)), ...anchorCorners(io.anchor)]
   fits(points, fitToSafeFrame(points, tokens.hero, safe, viewport))
  }
 })
 it('reveals side/top depth with the prescribed readable focused front face', () => {
  const body = r.scene.entities.account.anchor, pose = focusFraming(body, tokens.focus, safe, viewport), camera = projectionCamera(pose, viewport)
  const face = frontFace(body).map(point => screenPoint(point, camera, viewport)), height = Math.max(...face.map(point => point.y)) - Math.min(...face.map(point => point.y))
  expect(height / viewport.height).toBeGreaterThanOrEqual(.38); expect(height / viewport.height).toBeLessThanOrEqual(.52)
  expect(pose.yawDeg).toBe(21); expect(pose.pitchDeg).toBe(-8); fits(frontFace(body), pose)
 })
 it('keeps written class storage ports and physical collisions at their actual identity', () => {
  const node = r.scene.entities['jvm:class:Registry'], cut = plan(), reference = r.scene.references[0]
  expect(inspectorEntity(r.scene, { kind: 'class', id: node.id })).toBe(node)
  expect(inspectorEntity(r.scene, { kind: 'slot', id: 'Registry.current' })).toBe(node)
  const curve = cut.curves.find(curve => curve.id === reference.id)!
  expect(curve.points[0]).toEqual(faceRowPort(node, cut.entities.get(node.id)!, 'Registry.current'))
  const boxes = cameraCollisionBoxes(Object.values(r.scene.entities).map(node => node.anchor), .1, tokens.fov * Math.PI / 180, 1.5)
  expect(boxes.some(box => box.containsPoint(new Vector3(...node.anchor.position)))).toBe(true)
  expect(followPathFraming(curve, safe, viewport)).toEqual([]) // Persistent bindings are not provenance travel.
  const graph = seek(r.trace, r.trace.events.length).executionGraph!, edge = graph.edges.find(edge => edge.kind === 'REFERENCE_BIND' && edge.from === 'Registry.current')!, flow = cut.curves.find(curve => curve.id === edge.id)!
  expect(flow.kind).toBe('flow')
  const travel = followPathFraming(flow, safe, viewport)
  expect(travel.length).toBeGreaterThan(1)
 })
 it('refuses retired storage even when permanent canonical ports remain reserved', () => {
  const current = rig([{ type: 'ENTER_METHOD', frameId: 'frame', callerFrameId: null, className: 'Unit', methodName: 'run', locals: [field('retired')] }, { type: 'REMOVE_LOCAL', frameId: 'frame', slotId: 'retired' }])
  expect(current.projection.layout.anchors.frame.ports.retired).toBeDefined()
  expect(inspectorEntity(current.scene, { kind: 'slot', id: 'retired' })).toBeNull()
  expect(inspectorEntity(current.scene, { kind: 'object', id: 'unrecorded' })).toBeNull()
 })
 it('focuses captured overflow locals, fields and statics at their actual owner without inventing permanent ports', () => {
  const fields = Array.from({ length: 20 }, (_, index) => field(`overflow:${index}`))
  for (const kind of ['frame', 'object', 'class'] as const) {
   const inputs: Input[] = kind === 'object' ? [allocation('owner', fields)] : kind === 'frame' ? [{ type: 'ENTER_METHOD', frameId: 'owner', callerFrameId: null, className: 'Unit', methodName: 'run', locals: [] }, ...fields.map(slot => ({ type: 'DECLARE_LOCAL' as const, frameId: 'owner', slot }))] : [{ type: 'CLASS_OBSERVE', classId: 'jvm:class:Owner', className: 'Owner', initialization: 'observed', fields }, ...fields.map(slot => ({ type: 'SET_STATIC' as const, classId: 'jvm:class:Owner', slotId: slot.id, value: int(9) }))]
   const current = rig(inputs), owner = inspectorEntity(current.scene, { kind: 'slot', id: fields[19].id })!
   expect(owner.kind).toBe(kind); expect(owner.anchor.ports[fields[19].id]).toBeUndefined()
   expect(inspectorEntity(current.scene, { kind: 'slot', id: 'not observed' })).toBeNull()
   const cut = plan(current, fields[19].id); expect(cut.framing.focus?.targetId).toBe(owner.id)
   const pose = focusFraming(owner.anchor, tokens.focus, safe, viewport)
   expect([...pose.target, pose.distance].every(Number.isFinite)).toBe(true)
  }
 })
 it('focuses the exact current sparse array-window cell rather than a fabricated global cell anchor', () => {
  const current = rig([{ type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 1, elementType: 'int', length: 1000, observed: true, elements: [] }, { type: 'OBJECT_OBSERVE', objectId: 'array', arrayElements: [{ index: 999, value: int(18) }] }]), id = 'array:element:999', cut = plan(current, id), cell = cut.cellWindows.get('array')!.mapping.get(id)!
  expect(cell.index).toBe(999); expect(current.projection.layout.anchors[id]).toBeUndefined()
  expect(inspectorEntity(current.scene, { kind: 'slot', id })).toBe(current.scene.entities.array)
  fits(frontFace(cell.anchor), focusFraming(cell.anchor, tokens.focus, safe, viewport))
 })
 it('fits the selected front face inside the Inspector safe frame independently of a remote neighbor', () => {
  const target = r.scene.entities.account.anchor, narrow = { width: 1050, height: 700 }, area = { x: 20, y: 94, width: 730, height: 506 }
  const first = focusFraming(target, tokens.focus, area, narrow)
  const current = rig([allocation('account'), ...Array.from({ length: 1000 }, (_, index) => allocation(`remote${index}`))]), selected = current.scene.entities.account.anchor
  expect(focusFraming(selected, tokens.focus, area, narrow)).toEqual(first)
  fits(frontFace(target), first, area, narrow)
 })
 it('keeps Focus and selection on manual input while invalidating pending movement', () => {
  useCameraStore.setState(useCameraStore.getInitialState()); useInteractionStore.setState(useInteractionStore.getInitialState())
  const camera = useCameraStore.getState(); camera.focus({ kind: 'class', id: 'jvm:class:Registry' }); const before = useCameraStore.getState().intentRevision
  camera.userInput(); expect(useCameraStore.getState().intentRevision).toBeGreaterThan(before); expect(useCameraStore.getState().intent).toBeNull()
  expect(useInteractionStore.getState().focus?.targetId).toBe('jvm:class:Registry'); camera.home()
 })
})

describe('canonical projection detail', () => {
 it('settles at each threshold using the full canonical scene independently of represented populations', () => {
  const current = rig(Array.from({ length: 11 }, (_, index) => allocation(`body${index}`, Array.from({ length: 2 }, (_, fieldIndex) => field(`field:${index}:${fieldIndex}`))))), canonical = current.scene, camera = projectionCamera(useCameraStore.getInitialState().pose, viewport)
  const height = representativeFaceHeight(canonical, camera, viewport)
  for (const level of ['FAR', 'MEDIUM', 'CLOSE'] as const) {
   const cut = planPresentation({ scene: canonical, layout: current.projection.layout, detailLevel: level, selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
   expect(cut.accounting.total).toBe(11); expect(representativeFaceHeight(canonical, camera, viewport)).toBe(height)
  }
  for (const coverage of [.04, .08, .2, .14, .13]) {
   let level = 'FAR' as 'FAR' | 'MEDIUM' | 'CLOSE'
   for (let render = 0; render < 6; render++) level = nextDetailLevel(level, coverage * 900, 900)
   expect(nextDetailLevel(level, coverage * 900, 900)).toBe(level)
  }
 })
 it('uses absolute projected coverage and hysteresis independently of landscape size', () => {
  expect(nextDetailLevel('MEDIUM', .04 * 900, 900)).toBe('FAR'); expect(nextDetailLevel('FAR', .055 * 900, 900)).toBe('FAR')
  expect(nextDetailLevel('FAR', .06 * 900, 900)).toBe('MEDIUM'); expect(nextDetailLevel('MEDIUM', .2 * 900, 900)).toBe('CLOSE')
  expect(nextDetailLevel('CLOSE', .14 * 900, 900)).toBe('CLOSE'); expect(nextDetailLevel('CLOSE', .13 * 900, 900)).toBe('MEDIUM')
 })
 it('keeps central STACK heading geometry attached to canonical first invocation geography', () => {
  const current = rig([{ type: 'ENTER_METHOD', frameId: 'call', callerFrameId: null, className: 'Unit', methodName: 'call', locals: [] }]), cut = plan(current), heading = cut.headings.find(heading => heading.id === 'STACK')!
  expect(heading.position).toBe(current.projection.layout.headings.stack)
  const framing = homeFraming(current.scene, cut, safe, viewport, current.projection.layout)
  expect(framing.ids).toContain('call'); fits(framing.points, framing.pose)
 })
})
