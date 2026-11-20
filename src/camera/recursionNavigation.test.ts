import { describe, expect, it } from 'vitest'
import { loadPersonTrace, loadRecursionTrace } from '../examples/traces'
import { projectTrace } from '../testing/projectTrace'
import { planPresentation, anchorCorners } from '../world/presentationPlanner'
import { homeFraming } from './homeFraming'
import { focusFraming } from './focusFraming'
import { guidedFollow, followInvocations } from './guidedFollow'
import { cameraPosition, frontFace, projectionCamera, screenPoint, representativeFaceHeight, nextDetailLevel } from './projection'
import { cameraCollisionBoxes, constrainCameraPose, zoomPose } from './cameraConstraints'
import { useCameraStore } from './cameraStore'
import { camera as tokens } from '../theme/tokens'
import { seek } from '../runtime'

const trace = loadRecursionTrace(), projection = projectTrace(trace), deepest = projection.project(19)
const cut = (scene = deepest) => planPresentation({ scene, layout: projection.layout, detailLevel: 'CLOSE', selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
const framing = (scene = deepest, aspect = 1.54) => { const viewport = { width: aspect * 1000, height: 1000 }, safe = { x: 20, y: 80, width: viewport.width - 40, height: 800 }; return { ...homeFraming(scene, cut(scene), safe, viewport, projection.layout), viewport, safe } }
function fits(home: ReturnType<typeof framing>) {
 const camera = projectionCamera(home.pose, home.viewport)
 for (const point of home.points) { const p = screenPoint(point, camera, home.viewport); expect(p.x).toBeGreaterThanOrEqual(home.safe.x); expect(p.x).toBeLessThanOrEqual(home.safe.x + home.safe.width); expect(p.y).toBeGreaterThanOrEqual(home.safe.y); expect(p.y).toBeLessThanOrEqual(home.safe.y + home.safe.height) }
}

describe('canonical recursive camera composition', () => {
 it('renders the same nearest-context STACK heading that Home actually frames, without moving any runtime anchor',()=>{
  const saved=JSON.stringify(projection.layout),first=deepest.entities[deepest.liveStack.slice(-4)[0]],heading=cut().headings.find(heading=>heading.id==='STACK')!
  expect(heading.position).toEqual([first.anchor.position[0]+first.anchor.size[0]/2+.45,first.anchor.position[1]+first.anchor.size[1]/2+.75,first.anchor.position[2]+first.anchor.size[2]/2])
  expect(heading.position).not.toEqual(projection.layout.headings.stack)
  for(const aspect of[.8,1.1,1.54,2.4])expect(framing(deepest,aspect).points).toContainEqual(heading.position)
  for(const id of deepest.order.frames)expect(deepest.entities[id].anchor).toBe(projection.layout.anchors[id])
  expect(JSON.stringify(projection.layout)).toBe(saved)
 })
 it.each([.8, 1.1, 1.54, 2.4])('fits the most recent invocation and its three actual ancestors plus headings at aspect %s', aspect => {
  const home = framing(deepest, aspect)
  expect(home.ids).toEqual(deepest.liveStack.slice(-4)); expect(home.pose.yawDeg).toBe(8); expect(home.pose.pitchDeg).toBe(-13)
  fits(home)
  const eye = { position: cameraPosition(home.pose), target: home.pose.target }, boxes = cameraCollisionBoxes(Object.values(deepest.entities).map(node => node.anchor), .05, tokens.fov * Math.PI / 180, aspect), size = projection.layout.bounds!.size
  const limits = { minDistance: tokens.minDistance, maxDistance: 3 * Math.hypot(...size), pan: size.map(value => Math.max(12, Math.hypot(...size), value)) as [number, number, number] }
  expect(constrainCameraPose(eye, eye, boxes, projection.layout.bounds!.center, limits)).toEqual(eye)
 })
 it('preserves every recorded anchor while Home follows actual entry/exit prefixes instead of a future maximum depth', () => {
  const saved = JSON.stringify(projection.layout)
  for (const cursor of [0, 2, 8, 14, 19, 21, 27, 36, 19]) {
   const scene = projection.project(cursor), home = framing(scene)
   expect(home.ids.length).toBeLessThanOrEqual(4)
   for (const id of scene.order.frames) expect(scene.entities[id].anchor).toBe(projection.layout.anchors[id])
   if (scene.order.frames.length) expect(home.ids.at(-1)).toBe(scene.liveStack.at(-1) ?? scene.order.frames.at(-1))
   fits(home)
  }
  expect(JSON.stringify(projection.layout)).toBe(saved)
 })
 it('uses one framing pipeline and prescribed angles for shallow and recursive recordings at every original aspect', () => {
  const person = loadPersonTrace(), other = projectTrace(person), scene = other.project(person.events.length)
  for (const aspect of [.8, 1.1, 1.54, 2.4]) {
   const viewport = { width: 1000 * aspect, height: 1000 }, safe = { x: 20, y: 80, width: viewport.width - 40, height: 800 }, plan = planPresentation({ scene, layout: other.layout, detailLevel: 'CLOSE', selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
   const home = homeFraming(scene, plan, safe, viewport, other.layout)
   expect(home.pose.yawDeg).toBe(8); expect(home.pose.pitchDeg).toBe(-13)
   const camera = projectionCamera(home.pose, viewport)
   for (const point of home.points) { const p = screenPoint(point, camera, viewport); expect(p.x).toBeGreaterThanOrEqual(safe.x); expect(p.x).toBeLessThanOrEqual(safe.x + safe.width); expect(p.y).toBeGreaterThanOrEqual(safe.y); expect(p.y).toBeLessThanOrEqual(safe.y + safe.height) }
  }
 })
 it('uses captured prefix presence for a shallow world without admitting future recursive frames', () => {
  const scene = projection.project(8), home = framing(scene)
  expect(scene.order.frames).toHaveLength(3); expect(home.ids).toEqual(scene.liveStack)
  expect(home.ids).not.toContain(deepest.order.frames.at(-1)); fits(home)
 })
 it('bounds 100 repeated zoom requests with the production world-derived finite exploration limit', () => {
  const home = framing(deepest, .8), diagonal = Math.hypot(...projection.layout.bounds!.size), limits = { minDistance: tokens.minDistance, maxDistance: 3 * diagonal, pan: [diagonal, diagonal, diagonal] as const }
  let pose = { position: cameraPosition(home.pose), target: home.pose.target }
  for (let i = 0; i < 100; i++) pose = zoomPose(pose, 'out', limits)
  expect(Math.hypot(...pose.position.map((value, axis) => value - pose.target[axis]))).toBeCloseTo(limits.maxDistance)
  expect([...pose.position, ...pose.target].every(Number.isFinite)).toBe(true)
 })
 it('derives zoom from unchanged canonical face coverage rather than representation or invocation count', () => {
  const home = framing(), camera = projectionCamera(home.pose, home.viewport), height = representativeFaceHeight(deepest, camera, home.viewport)
  expect(height).not.toBeNull()
  let level = nextDetailLevel('MEDIUM', height, home.viewport.height)
  for (let i = 0; i < 6; i++) { expect(representativeFaceHeight(deepest, camera, home.viewport)).toBe(height); const next = nextDetailLevel(level, height, home.viewport.height); expect(next).toBe(level); level = next }
 })
 it('fits every actual selected front face above the Inspector shelf with the specified height priority', () => {
  const viewport = { width: 944, height: 612 }, safe = { x: 20, y: 64, width: 620, height: 400 }
  for (const id of deepest.order.frames) {
   const body = deepest.entities[id].anchor, pose = focusFraming(body, tokens.focus, safe, viewport), camera = projectionCamera(pose, viewport), projected = frontFace(body).map(point => screenPoint(point, camera, viewport))
   const height = Math.max(...projected.map(p => p.y)) - Math.min(...projected.map(p => p.y))
   expect(height / viewport.height).toBeGreaterThanOrEqual(.38); expect(height / viewport.height).toBeLessThanOrEqual(.52)
   for (const p of projected) { expect(p.x).toBeGreaterThanOrEqual(safe.x); expect(p.x).toBeLessThanOrEqual(safe.x + safe.width); expect(p.y).toBeGreaterThanOrEqual(safe.y); expect(p.y).toBeLessThanOrEqual(safe.y + safe.height) }
  }
 })
})

describe('captured recursive descent and return attention', () => {
 it('targets the actual innermost live invocation after entry/exit while completed calls remain retained', () => {
  const before = projection.project(19), after = projection.project(21)
  expect(followInvocations(before).at(-1)).toBe(before.liveStack.at(-1))
  expect(followInvocations(after).at(-1)).toBe(before.liveStack.at(-2))
  expect(after.entities[before.liveStack.at(-1)!].anchor).toBe(before.entities[before.liveStack.at(-1)!].anchor)
  expect(followInvocations(projection.project(36))).toEqual([])
 })
 it('retains exact captured caller storage without camera travel or a Flow unsupported by the graph', () => {
  const scene = projection.project(20), transfer = seek(trace,20).returns.find(item => item.frameId === deepest.order.frames.at(-1))!
  expect(transfer.destination).toEqual({ frameId: 'frame:factorial:2', slotId: 'slot:factorial:2:child' })
  const caller = scene.entities[transfer.destination!.frameId]
  if (caller.kind !== 'frame') throw new Error('Expected caller')
  expect(caller.rows.find(row => row.slotId === transfer.destination!.slotId)?.value.exact).toBe('1')
  expect(scene.returnFlows).toEqual([])
  expect(cut(scene).curves.filter(curve=>curve.kind==='return')).toEqual([])
  fits(framing(scene))
 })
 it('uses prescribed recursion angles and fits the four nearest actual frames during Follow', () => {
  const viewport = { width: 1540, height: 1000 }, safe = { x: 20, y: 80, width: 1500, height: 800 }
  for (const cursor of [14, 19, 21, 24]) {
   const scene = projection.project(cursor), next = guidedFollow(scene, cut(scene), trace.events[cursor - 1], useCameraStore.getInitialState().pose, safe, viewport, null)
   if (scene.liveStack.length < 4) continue
   expect(next.recursion).toBe(true); expect(next.ids).toEqual(scene.liveStack.slice(-4)); expect(next.pose?.yawDeg).toBe(tokens.recursion.yaw); expect(next.pose?.pitchDeg).toBe(tokens.recursion.pitch)
   const camera = projectionCamera(next.pose!, viewport)
   for (const point of next.ids.flatMap(id => anchorCorners(scene.entities[id].anchor))) { const p = screenPoint(point, camera, viewport); expect(p.x).toBeGreaterThanOrEqual(safe.x); expect(p.x).toBeLessThanOrEqual(safe.x + safe.width); expect(p.y).toBeGreaterThanOrEqual(safe.y); expect(p.y).toBeLessThanOrEqual(safe.y + safe.height) }
  }
 })
})
