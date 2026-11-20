import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import type { TraceDocument } from '../contracts/runtime'
import type { Vec3 } from '../contracts/world'
import { projectTrace } from '../testing/projectTrace'
import { seek } from '../runtime'
import { createFlowCatalog } from '../world/flowCatalog'
import { planPresentation, anchorCorners } from '../world/presentationPlanner'
import { followPathFraming, sampleFlowPath } from './followPathFraming'
import { guidedTravel, travelPose } from './guidedTravel'
import { cameraPosition, frontFace, projectionCamera, screenPoint, type OrbitPose } from './projection'
import { homeFraming } from './homeFraming'
import { focusFraming } from './focusFraming'
import { followFraming } from './followFraming'
import { guidedFollow, isFollowSubjectEvent } from './guidedFollow'
import { camera as tokens } from '../theme/tokens'
import { useCameraStore } from './cameraStore'

const document: TraceDocument = { schemaVersion: 2, demoId: 'unit/camera-choreography', sourceFiles: [], events: [
 { type: 'PROGRAM_START', eventId: 'e0', seq: 0, source: null, label: 'start', importance: 'quiet' },
 { type: 'ENTER_METHOD', eventId: 'e1', seq: 1, source: null, label: 'caller', importance: 'major', frameId: 'main', callerFrameId: null, className: 'Unit', methodName: 'main', locals: [] },
 { type: 'ALLOCATE_OBJECT', eventId: 'e2', seq: 2, source: null, label: 'captured allocation', importance: 'major', objectId: 'target', displayId: 1, className: 'Item', fields: [], metadata: { ownership: 'PROJECT', runtimeType: 'Item', packageName: '' } },
 { type: 'ENTER_METHOD', eventId: 'e3', seq: 3, source: null, label: 'callee', importance: 'major', frameId: 'child', callerFrameId: 'main', className: 'Unit', methodName: 'work', locals: [{ id: 'child:p', name: 'p', javaType: 'Item', value: { kind: 'reference', javaType: 'Item', objectId: 'target' } }] },
 { type: 'EXECUTION_FACT', eventId: 'e4', seq: 4, source: null, label: 'actual binding graph', importance: 'major', fact: { kind: 'write', context: { owner: 'Unit', name: 'work', descriptor: '()V', frameId: 'child', site: 1, rawSeq: 91, source: null }, target: { id: 'child:p', kind: 'variable', ownerId: 'child', name: 'p', javaType: 'Item' }, value: { kind: 'reference', javaType: 'Item', objectId: 'target' }, origin: { kind: 'unknown' } } },
 { type: 'EXIT_METHOD', eventId: 'e5', seq: 5, source: null, label: 'exit child', importance: 'major', frameId: 'child' },
 { type: 'EXIT_METHOD', eventId: 'e6', seq: 6, source: null, label: 'exit main', importance: 'major', frameId: 'main' },
 { type: 'PROGRAM_END', eventId: 'e7', seq: 7, source: null, label: 'end', importance: 'normal' },
] }
const projection = projectTrace(document), scene = projection.project(5), flows = createFlowCatalog()
flows.extend(seek(document, document.events.length).executionGraph!, document)
const plan = planPresentation({ scene, flows, layout: projection.layout, detailLevel: 'CLOSE', selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
const graph = seek(document, 5).executionGraph!, edge = graph.edges.find(edge => edge.kind === 'REFERENCE_BIND' && edge.from === 'child:p')!, curve = plan.curves.find(curve => curve.id === edge.id)!
const initial = useCameraStore.getInitialState().pose, eye = { position: cameraPosition(initial), target: initial.target }
const limits = { minDistance: 1.7, maxDistance: 10000, pan: [10000, 10000, 10000] as Vec3 }
const viewport = { width: 1440, height: 900 }, safe = { x: 20, y: 94, width: 1100, height: 706 }
function fits(pose: OrbitPose, points: readonly Vec3[], area = safe, view = viewport) {
 const camera = projectionCamera(pose, view)
 for (const point of points) { const p = screenPoint(point, camera, view); expect(p.x).toBeGreaterThanOrEqual(area.x - 1e-6); expect(p.x).toBeLessThanOrEqual(area.x + area.width + 1e-6); expect(p.y).toBeGreaterThanOrEqual(area.y - 1e-6); expect(p.y).toBeLessThanOrEqual(area.y + area.height + 1e-6); expect(p.z).toBeGreaterThan(-1); expect(p.z).toBeLessThan(1) }
}

it.each([[1, 760 / 400], [1, 934 / 340], [2, 760 / 400], [2, 934 / 340]])('debugger Home fits actual headings and the nearest caller chain, %s frames at aspect %s', (count, aspect) => {
 const current = projection.project(count === 1 ? 2 : 4), cut = planPresentation({ scene: current, layout: projection.layout, detailLevel: 'CLOSE', selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } }), view = { width: aspect * 900, height: 900 }, area = { x: 20, y: 94, width: view.width - 40, height: 706 }, framing = homeFraming(current, cut, area, view, projection.layout)
 expect(framing.ids.filter(id => current.entities[id]?.kind === 'frame')).toHaveLength(count)
 fits(framing.pose, framing.points, area, view)
 expect(framing.points.length).toBeGreaterThan(count * 8) // Actual heading footprint as well as frame corners.
})

describe('graph-backed Follow Path choreography', () => {
 it('visits the exact source, ordered path samples and the entire proven destination', () => {
  expect(curve.kind).toBe('flow'); expect(curve.id).toBe(edge.id)
  const poses = followPathFraming(curve, safe, viewport), samples = sampleFlowPath(curve.points)
  expect(poses).toHaveLength(samples.length + 1)
  for (const [index, sample] of samples.entries()) {
   const pixel = screenPoint(sample, projectionCamera(poses[index], viewport), viewport)
   expect(pixel.x).toBeCloseTo(safe.x + safe.width / 2, 6); expect(pixel.y).toBeCloseTo(safe.y + safe.height / 2, 6)
  }
  expect(samples[0]).toEqual(curve.points[0]); for (const axis of [0, 1, 2]) expect(samples.at(-1)![axis]).toBeCloseTo(curve.points.at(-1)![axis], 12)
  fits(poses.at(-1)!, anchorCorners(curve.destinationAnchor!))
 })
 it.each([.8, 1.65])('keeps the actual traveled ports and complete resting destination in the safe frame at aspect %s', aspect => {
  const view = { width: aspect * 900, height: 900 }, area = { x: 20, y: 94, width: view.width - 40, height: 706 }, poses = followPathFraming(curve, area, view), samples = sampleFlowPath(curve.points)
  for (const [index, sample] of samples.entries()) fits(poses[index], [sample], area, view)
  fits(poses.at(-1)!, anchorCorners(curve.destinationAnchor!), area, view)
 })
 it('rejects a coincident path without invalid coordinates or a spurious orbit', () => {
  expect(sampleFlowPath([curve.points[0], curve.points[0]])).toEqual([])
  expect(followPathFraming({ ...curve, points: [curve.points[0], curve.points[0]] }, safe, viewport)).toEqual([])
 })
 it('ends exactly at the resting pose when a frame skips across multiple travel legs', () => {
  const poses = followPathFraming(curve, safe, viewport), travel = guidedTravel(eye, poses, [], undefined, limits)
  expect(travelPose(travel, 0)).toEqual(eye)
  expect(travelPose(travel, 1)).toEqual(travel.path.at(-1)); expect(travelPose(travel, 20)).toEqual(travel.path.at(-1))
  expect(travel.path.at(-1)!.position).toEqual(cameraPosition(poses.at(-1)!))
  for (const axis of [0, 1, 2]) expect(travel.path.at(-1)!.target[axis]).toBeCloseTo(poses.at(-1)!.target[axis], 12)
 })
})

describe('captured Guided Follow', () => {
 it('keeps completion as the same retained world and avoids inventing a terminal subject', () => {
  const completed = projection.project(document.events.length), cut = planPresentation({ scene: completed, layout: projection.layout, detailLevel: 'CLOSE', selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
  expect(completed.order.frames).toEqual(['main', 'child']); expect(completed.liveStack).toEqual([])
  const next = guidedFollow(completed, cut, document.events.at(-1)!, initial, safe, viewport, false)
  expect(next.pose).toBeNull(); expect(next.ids).toEqual([])
  expect(isFollowSubjectEvent(document.events[0])).toBe(false)
 })
 it('uses the smallest finite pan/dolly necessary to include actual subject geometry', () => {
  const points = anchorCorners(scene.entities.target.anchor), pose = followFraming(points, { ...initial, distance: 4 }, safe, viewport)!
  expect(pose.yawDeg).toBe(initial.yawDeg); expect(pose.pitchDeg).toBe(initial.pitchDeg)
  fits(pose, points); expect(followFraming(points, pose, safe, viewport)).toBeNull()
 })
})

describe('actual Inspector safe frame', () => {
 const view = { width: 944, height: 724 }, area = { x: 20, y: 64, width: 650, height: 470 }
 it('keeps a focused front face inside the available rectangle without fitting the whole world', () => {
  const body = scene.entities.target.anchor, pose = focusFraming(body, tokens.focus, area, view)
  fits(pose, frontFace(body), area, view)
  const face = frontFace(body).map(point => screenPoint(point, projectionCamera(pose, view), view)), height = Math.max(...face.map(p => p.y)) - Math.min(...face.map(p => p.y))
  expect(height / view.height).toBeGreaterThanOrEqual(.38); expect(height / view.height).toBeLessThanOrEqual(.52)
 })
 it('brings the actual selected front face closer than a complete Home composition', () => {
  const body = scene.entities.target.anchor, home = homeFraming(scene, plan, area, view, projection.layout), focus = focusFraming(body, tokens.focus, area, view)
  const faceWidth = (pose: OrbitPose) => { const x = frontFace(body).map(point => screenPoint(point, projectionCamera(pose, view), view).x); return Math.max(...x) - Math.min(...x) }
  expect(faceWidth(focus)).toBeGreaterThan(faceWidth(home.pose)); fits(focus, frontFace(body), area, view)
 })
 it('reserves the actual safe rectangle at every traveled port and the entire resting destination', () => {
  const poses = followPathFraming(curve, area, view), samples = sampleFlowPath(curve.points)
  for (const [index, point] of samples.entries()) fits(poses[index], [point], area, view)
  fits(poses.at(-1)!, anchorCorners(curve.destinationAnchor!), area, view)
 })
})

describe('canonical responsive Home', () => {
 it('fits unchanged physical geometry at narrow and wide aspects with the same prescribed Hero angles', () => {
  const poses = []
  for (const aspect of [1.65, 760 / 678]) {
   const view = { width: aspect * 900, height: 900 }, area = { x: 20, y: 94, width: view.width - 40, height: 706 }, framing = homeFraming(scene, plan, area, view, projection.layout)
   expect(framing.pose.yawDeg).toBe(8); expect(framing.pose.pitchDeg).toBe(-13); fits(framing.pose, framing.points, area, view); poses.push(framing.pose)
  }
  expect(new Vector3(...cameraPosition(poses[0])).distanceTo(new Vector3(...poses[0].target))).toBe(poses[0].distance)
  expect(poses[1].distance).toBeGreaterThan(poses[0].distance)
 })
})
