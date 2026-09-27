import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import type { CameraPose } from '../contracts/interaction'
import rawTrace from '../demos/person/person.trace.json'
import type { TraceDocument } from '../contracts/runtime'
const personTrace = rawTrace as TraceDocument
import { createLayout } from '../world/layout'
import { responsiveHomePose } from './cameraMotion'
import { cameraBounds, cameraCollisionBoxes, cameraSegmentHit, collisionSafeRoute, constrainCameraPose, zoomPose } from './cameraConstraints'

const box = new Box3(new Vector3(-2, -1, -1), new Vector3(2, 1, 1))
const front: CameraPose = { position: [0, 0, 8], target: [0, 0, 0] }

describe('bounded runtime navigation', () => {
  it('clamps repeated button zoom, keeping target and viewing direction', () => {
    let pose = front
    for (let i = 0; i < 100; i++) pose = zoomPose(pose, 'out')
    expect(pose.position).toEqual([0, 0, cameraBounds.maxDistance])
    for (let i = 0; i < 100; i++) pose = zoomPose(pose, 'in')
    expect(pose.position).toEqual([0, 0, cameraBounds.minDistance])
    expect(pose.target).toEqual(front.target)
  })

  it('bounds pan while preserving the viewing offset and rejects nonfinite input', () => {
    const result = constrainCameraPose({ position: [100, 100, 108], target: [100, 100, 100] }, front, [], [0, 0, 0])
    expect(result).toEqual({ position: [12, 8, 20], target: [12, 8, 12] })
    expect(constrainCameraPose({ position: [NaN, 0, 0], target: [0, 0, 0] }, front, [])).toEqual(front)
  })

  it('halts a large dolly before a solid, including when the proposed eye is beyond it', () => {
    const result = constrainCameraPose({ position: [0, 0, -8], target: [0, 0, 0] }, front, [box], [0, 0, 0])
    expect(result.position[2]).toBeGreaterThan(1)
    expect(box.containsPoint(new Vector3(...result.position))).toBe(false)
    expect(new Vector3(...result.position).distanceTo(new Vector3(...result.target))).toBeGreaterThanOrEqual(cameraBounds.minDistance)
  })

  it('includes near-plane corner clearance in actual anchor AABBs', () => {
    const anchors = Object.values(createLayout(personTrace).anchors)
    const boxes = cameraCollisionBoxes(anchors, 0.1, Math.PI / 4, 2)
    for (let i = 0; i < anchors.length; i++) {
      expect(boxes[i].min.x).toBeLessThan(anchors[i].position[0] - anchors[i].size[0] / 2 - 0.18)
      expect(boxes[i].max.z).toBeGreaterThan(anchors[i].position[2] + anchors[i].size[2] / 2 + 0.18)
    }
  })

  it('escapes allocation around the eye and allows subsequent motion away', () => {
    const enclosed: CameraPose = { position: [0, 0, 0], target: [0, 0, -8] }
    const escaped = constrainCameraPose(enclosed, enclosed, [box])
    expect(box.containsPoint(new Vector3(...escaped.position))).toBe(false)
    const away = constrainCameraPose({ position: [0, -3, 0], target: [0, -3, -8] }, escaped, [box])
    expect(away.position[1]).toBe(-3)
  })

  it('keeps tangential movement and retreat available at a wall', () => {
    expect(cameraSegmentHit(new Vector3(0, 0, 1), new Vector3(4, 0, 1), box)).toBeNull()
    expect(cameraSegmentHit(new Vector3(0, 0, 1), new Vector3(0, 0, 4), box)).toBeNull()
    expect(cameraSegmentHit(new Vector3(0, 0, 1), new Vector3(0, 0, 0), box)).toBe(0)
  })

  it('routes reset around geometry and ends at the canonical responsive pose', () => {
    const from: CameraPose = { position: [0, 0, -8], target: [0, 0, -10] }
    const canonical = responsiveHomePose(undefined, 1.5)
    const obstacle = new Box3(new Vector3(-3, -4, -1), new Vector3(3, 4, 1))
    const route = collisionSafeRoute(from, canonical, [obstacle])
    expect(route.length).toBeGreaterThan(1)
    expect(route.at(-1)).toEqual(canonical)
    let previous = new Vector3(...from.position)
    for (const pose of route) {
      const next = new Vector3(...pose.position)
      expect(cameraSegmentHit(previous, next, obstacle)).toBeNull()
      previous = next
    }
  })

  it('keeps finite wheel/pan extremes outside runtime solids across repeated exploration', () => {
    const boxes = cameraCollisionBoxes(Object.values(createLayout(personTrace).anchors), 0.1, 41 * Math.PI / 180, 1.5)
    let pose = responsiveHomePose(undefined, 1.5)
    let seed = 19
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
    for (let i = 0; i < 500; i++) {
      const requested: CameraPose = {
        target: [(random() - 0.5) * 120, (random() - 0.5) * 80, (random() - 0.5) * 120],
        position: [(random() - 0.5) * 200, (random() - 0.5) * 200, (random() - 0.5) * 200],
      }
      pose = constrainCameraPose(requested, pose, boxes)
      expect([...pose.target, ...pose.position].every(Number.isFinite)).toBe(true)
      pose.target.forEach((value, axis) => expect(Math.abs(value - responsiveHomePose(undefined, 1.5).target[axis])).toBeLessThanOrEqual(cameraBounds.pan[axis] + 1e-6))
      const range = new Vector3(...pose.position).distanceTo(new Vector3(...pose.target))
      expect(range).toBeGreaterThanOrEqual(cameraBounds.minDistance - 1e-6)
      expect(range).toBeLessThanOrEqual(cameraBounds.maxDistance + 1e-6)
      for (const box of boxes) expect(box.containsPoint(new Vector3(...pose.position))).toBe(false)
    }
  })

  it('leaves established overview framing unchanged at normal desktop aspects', () => {
    const boxes = cameraCollisionBoxes(Object.values(createLayout(personTrace).anchors), 0.1, 41 * Math.PI / 180, 1.5)
    for (const aspect of [1, 1.5, 2]) {
      const pose = responsiveHomePose(undefined, aspect)
      expect(constrainCameraPose(pose, pose, boxes)).toEqual(pose)
    }
  })
})
