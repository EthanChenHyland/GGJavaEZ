import { beforeEach, describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import type { TraceDocument, TraceEvent } from '../contracts/runtime'
import { arrayElementSlotId } from '../contracts/runtime'
import { projectTrace } from '../testing/projectTrace'
import { seek } from '../runtime'
import { planPresentation, anchorCorners } from '../world/presentationPlanner'
import { homeFraming } from './homeFraming'
import { focusFraming } from './focusFraming'
import { guidedFollow, isFollowSubjectEvent } from './guidedFollow'
import { frontFace, projectionCamera, screenPoint, representativeFaceHeight, nextDetailLevel } from './projection'
import { cameraCollisionBoxes, cameraSegmentHit, collisionSafeRoute, constrainCameraPose } from './cameraConstraints'
import { useCameraStore } from './cameraStore'
import { useInteractionStore } from '../interaction/interactionStore'
import { camera as tokens } from '../theme/tokens'
import { inspectorEntity } from '../render/inspection'

const objectId = 'array:numbers', int = (value: number) => ({ kind: 'primitive' as const, javaType: 'int' as const, value })
const inputs = [
 { type: 'PROGRAM_START' },
 { type: 'ENTER_METHOD', frameId: 'main', callerFrameId: null, className: 'Main', methodName: 'main', locals: [] },
 { type: 'ALLOCATE_ARRAY', objectId, displayId: 23, elementType: 'int', elements: [3, 8, 1, 6, 2].map(int), metadata: { ownership: 'PROJECT', runtimeType: 'int[]', packageName: '' } },
 { type: 'DECLARE_LOCAL', frameId: 'main', slot: { id: 'main:nums', name: 'nums', javaType: 'int[]', value: { kind: 'reference', javaType: 'int[]', objectId } } },
 { type: 'DECLARE_LOCAL', frameId: 'main', slot: { id: 'main:temp', name: 'temp', javaType: 'int', value: int(8) } },
 { type: 'ARRAY_COMPARE', frameId: 'main', objectId, indices: [1, 2], values: [int(8), int(1)], operator: '>', result: true },
 { type: 'ARRAY_WRITE', frameId: 'main', objectId, index: 1, value: int(1), from: { kind: 'element', index: 2 } },
 { type: 'ARRAY_WRITE', frameId: 'main', objectId, index: 2, value: int(8), from: { kind: 'slot', frameId: 'main', slotId: 'main:temp' } },
 { type: 'ARRAY_READ', frameId: 'main', objectId, index: 3, value: int(6) },
]
const trace: TraceDocument = { schemaVersion: 2, demoId: 'unit/array-navigation', sourceFiles: [], events: inputs.map((event, seq) => ({ ...event, seq, eventId: `unit/array/${seq}`, source: null, label: 'Explicit captured array record', importance: 'major' })) as TraceEvent[] }
const projection = projectTrace(trace)
const cut = (cursor = 5, focusTargetId: string | null = null) => { const scene = projection.project(cursor); return { scene, plan: planPresentation({ scene, layout: projection.layout, detailLevel: 'CLOSE', selection: null, focusTargetId, trace: { active: false, scope: 'relevant' } }) } }
const framing = (cursor = 5, aspect = 1.54) => { const { scene, plan } = cut(cursor), viewport = { width: aspect * 900, height: 900 }, safe = { x: 20, y: 94, width: viewport.width - 40, height: 706 }; return { ...homeFraming(scene, plan, safe, viewport, projection.layout), viewport, safe, scene, plan } }
const fits = (pose: Parameters<typeof projectionCamera>[0], points: readonly (readonly [number, number, number])[], viewport: { width: number; height: number }, safe: { x: number; y: number; width: number; height: number }) => {
 const camera = projectionCamera(pose, viewport)
 for (const point of points) { const p = screenPoint(point, camera, viewport); expect(p.x).toBeGreaterThanOrEqual(safe.x - 1e-6); expect(p.x).toBeLessThanOrEqual(safe.x + safe.width + 1e-6); expect(p.y).toBeGreaterThanOrEqual(safe.y - 1e-6); expect(p.y).toBeLessThanOrEqual(safe.y + safe.height + 1e-6) }
}
beforeEach(() => { useCameraStore.setState(useCameraStore.getInitialState()); useInteractionStore.setState(useInteractionStore.getInitialState()) })

describe('one canonical typed array world', () => {
 it.each([.8, 1.1, 1.54, 2.4])('fits actual array/frame bodies and heading points at aspect %s', aspect => {
  const home = framing(5, aspect); expect(home.ids).toContain(objectId); expect(home.ids).toContain('main')
  fits(home.pose, home.points, home.viewport, home.safe)
  expect(home.plan.cellWindows.get(objectId)!.mapping.size).toBe(5)
  for (const cell of home.plan.cellWindows.get(objectId)!.mapping.values()) fits(home.pose, anchorCorners(cell.anchor), home.viewport, home.safe)
 })
 it('collides with reserved physical array/cell depth without adding a second theater geography', () => {
  const { scene, plan } = cut(), node = scene.entities[objectId], cells = [...plan.cellWindows.get(objectId)!.mapping.values()], boxes = cameraCollisionBoxes([node.anchor], .05, tokens.fov * Math.PI / 180, 1.54)
  expect(cells).toHaveLength(5)
  for (const cell of cells) expect(boxes.some(box => box.containsPoint(new Vector3(...cell.anchor.position)))).toBe(true)
  expect(new Set(cells.map(cell => cell.anchor.position.join(','))).size).toBe(5)
  expect(plan.entities.get(objectId)?.pickable).toBe(true)
 })
 it('keeps allocated body/cell geography and Home fixed across writes while excluding future allocation at earlier prefixes', () => {
  expect(projection.project(2).entities[objectId]).toBeUndefined()
  const home = framing(5)
  for (const cursor of [3, 5, 7, 8, 9, 5]) {
   const current = framing(cursor); expect(current.scene.entities[objectId].anchor).toBe(home.scene.entities[objectId].anchor); expect(current.pose).toEqual(home.pose)
   for (const [id, cell] of current.plan.cellWindows.get(objectId)!.mapping) expect(cell.anchor).toEqual(home.plan.cellWindows.get(objectId)!.mapping.get(id)!.anchor)
  }
 })
 it.each([.8, 1.54])('preserves comparison evidence while focusing the actual indexed face at aspect %s', aspect => {
  const home = framing(6, aspect), id = arrayElementSlotId(objectId, 1), current = cut(6, id), cell = current.plan.cellWindows.get(objectId)!.mapping.get(id)!
  expect(seek(trace, 6).arrayActivity).toMatchObject({ kind: 'compare', indices: [1, 2], result: true })
  expect(current.scene.entities[objectId].kind).toBe('array')
  fits(focusFraming(cell.anchor, tokens.focus, home.safe, home.viewport), frontFace(cell.anchor), home.viewport, home.safe)
 })
 it('uses canonical projected coverage and stable hysteresis instead of an array-specific relative zoom band', () => {
  const home = framing(), camera = projectionCamera(home.pose, home.viewport), height = representativeFaceHeight(home.scene, camera, home.viewport)
  expect(height).not.toBeNull()
  let level = nextDetailLevel('MEDIUM', height, home.viewport.height)
  for (let i = 0; i < 6; i++) { const next = nextDetailLevel(level, height, home.viewport.height); expect(next).toBe(level); level = next }
  expect(nextDetailLevel('MEDIUM', 20, 900)).toBe('FAR'); expect(nextDetailLevel('MEDIUM', 300, 900)).toBe('CLOSE')
 })
 it('focuses the selected cell volume while its Inspector owner remains the exact present array', () => {
  const id = arrayElementSlotId(objectId, 3), home = framing(), current = cut(5, id), cell = current.plan.cellWindows.get(objectId)!.mapping.get(id)!
  expect(inspectorEntity(current.scene, { kind: 'slot', id })).toBe(current.scene.entities[objectId])
  expect(cell.anchor.position).toEqual(projection.layout.anchors[id].position); expect(cell.anchor.size).toEqual(projection.layout.anchors[id].size); expect(cell.port).toEqual(projection.layout.anchors[id].bodyPort); expect(cell.anchor.position).not.toEqual(current.scene.entities[objectId].anchor.position)
  expect(inspectorEntity(current.scene, { kind: 'slot', id: 'missing' })).toBeNull()
  fits(focusFraming(cell.anchor, tokens.focus, home.safe, home.viewport), frontFace(cell.anchor), home.viewport, home.safe)
 })
 it('routes camera motion around actual reserved array depth without tunneling through cells', () => {
  const home = framing(), anchor = home.scene.entities[objectId].anchor, boxes = cameraCollisionBoxes([anchor], .05, tokens.fov * Math.PI / 180, 1.54), diagonal = Math.hypot(...projection.layout.bounds!.size), limits = { minDistance: tokens.minDistance, maxDistance: 3 * diagonal, pan: [diagonal, diagonal, diagonal] as const }
  const from = { position: [anchor.position[0], anchor.position[1], anchor.position[2] - 8] as const, target: anchor.position }, to = { position: [anchor.position[0], anchor.position[1], anchor.position[2] + 8] as const, target: anchor.position }
  expect(constrainCameraPose(to, from, boxes, projection.layout.bounds!.center, limits).position[2]).toBeLessThan(anchor.position[2] - anchor.size[2] / 2)
  const route = collisionSafeRoute(from, to, boxes, projection.layout.bounds!.center, limits)
  expect(route.at(-1)).toEqual(to)
  let previous = new Vector3(...from.position)
  for (const pose of route) { const next = new Vector3(...pose.position); for (const box of boxes) expect(cameraSegmentHit(previous, next, box)).toBeNull(); previous = next }
 })
})

describe('continuous array navigation and Focus memory', () => {
 it.each([.8, 1.54, 2.4])('returns to the exact saved camera and canonical array after cell Focus at aspect %s', aspect => {
  const home = framing(5, aspect), id = arrayElementSlotId(objectId, 2), cell = home.plan.cellWindows.get(objectId)!.mapping.get(id)!, camera = useCameraStore.getState()
  camera.setPose(home.pose); camera.focus({ kind: 'slot', id }); camera.setPose(focusFraming(cell.anchor, tokens.focus, home.safe, home.viewport)); camera.exitFocus()
  expect(useCameraStore.getState().intent).toMatchObject({ kind: 'exitFocus', pose: home.pose })
  expect(useInteractionStore.getState().selection).toEqual({ kind: 'slot', id })
  expect(projection.project(5).entities[objectId].anchor).toBe(home.scene.entities[objectId].anchor)
 })
 it('keeps the original return pose when another array cell is focused during Focus', () => {
  const camera = useCameraStore.getState(), original = camera.pose
  camera.focus({ kind: 'slot', id: arrayElementSlotId(objectId, 1) }); camera.setPose({ ...original, distance: 9 }); camera.focus({ kind: 'slot', id: arrayElementSlotId(objectId, 2) })
  expect(useInteractionStore.getState().preFocus?.pose).toBe(original); camera.exitFocus()
  expect(useCameraStore.getState().intent).toMatchObject({ kind: 'exitFocus', pose: original })
 })
 it('keeps an absent focused cell unavailable until its matching captured array prefix arrives', () => {
  const id = arrayElementSlotId(objectId, 2), before = cut(2, id), present = cut(3, id)
  expect(before.plan.framing.focus).toBeNull(); expect(before.plan.cellWindows.has(objectId)).toBe(false)
  expect(before.plan.structural.some(item => item.text === 'Not present at this point in time')).toBe(true)
  expect(present.plan.cellWindows.get(objectId)!.mapping.get(id)?.index).toBe(2)
 })
 it('invalidates pending array travel and Follow on user input without dropping Focus or selection', () => {
  const camera = useCameraStore.getState(), id = arrayElementSlotId(objectId, 2)
  camera.enableFollow(); camera.focus({ kind: 'slot', id }); const revision = useCameraStore.getState().intentRevision; camera.userInput()
  expect(useCameraStore.getState()).toMatchObject({ mode: 'FOCUS', follow: false, intent: null })
  expect(useCameraStore.getState().intentRevision).toBeGreaterThan(revision)
  expect(useInteractionStore.getState()).toMatchObject({ selection: { kind: 'slot', id }, focus: { targetId: id } })
 })
})

describe('recorded array event attention', () => {
 it('recognizes actual allocation as a Follow subject while manual input keeps Follow disabled', () => {
  const scene = projection.project(3), event = trace.events[2], home = framing(3), current = cut(3)
  expect(isFollowSubjectEvent(event)).toBe(true)
  expect(guidedFollow(scene, current.plan, event, { ...home.pose, distance: 4 }, home.safe, home.viewport, null).ids).toContain(objectId)
  useCameraStore.getState().enableFollow(); useCameraStore.getState().userInput(); expect(useCameraStore.getState().follow).toBe(false)
 })
 it('retains exact current read/write indices and no stale activity or fabricated comparison cells', () => {
  for (const [cursor, kind, index] of [[7, 'write', 1], [8, 'write', 2], [9, 'read', 3]] as const) {
   const current = cut(cursor), node = current.scene.entities[objectId]
   if (node.kind !== 'array') throw new Error('Expected array')
   expect(node.activity).toMatchObject({ kind, index })
   expect(current.plan.cellWindows.get(objectId)!.mapping.has(arrayElementSlotId(objectId, index))).toBe(true)
  }
  const before = projection.project(5).entities[objectId]
  if (before.kind !== 'array') throw new Error('Expected array')
  expect(before.activity).toBeNull()
  expect(before.cells.map(cell => cell.value.exact)).toEqual(['3', '8', '1', '6', '2'])
 })
})
