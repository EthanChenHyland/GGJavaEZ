import { describe, expect, it } from 'vitest'
import { seek } from '../runtime'
import { loadControlTrace } from '../examples/traces'
import { projectTrace } from '../testing/projectTrace'
import { planPresentation } from './presentationPlanner'
import { faceRows, faceRowPort } from './faceRows'
import { homeFraming } from '../camera/homeFraming'
import { projectionCamera, screenPoint } from '../camera/projection'
import { world } from '../theme/tokens'

const trace = loadControlTrace(), projection = projectTrace(trace), layout = projection.layout

describe('captured scopes through one production runtime world', () => {
  it('keeps one composition and places recorded dividers inside existing frame geometry', () => {
    expect(JSON.stringify(projectTrace(trace).layout)).toBe(JSON.stringify(layout))
    const head = seek(trace, trace.events.length)
    for (const id of Object.keys(head.scopes)) expect(layout.anchors[id]).toBeUndefined()
    let dividers = 0
    for (let cursor = 1; cursor <= trace.events.length; cursor++) {
      const scene = projection.project(cursor)
      for (const id of scene.order.frames) {
        const frame = scene.entities[id]
        if (frame.kind !== 'frame') throw new Error('Expected frame')
        for (const row of frame.rows.filter(row => (row.scopeDepth ?? 0) > 0)) {
          const plan = planPresentation({ scene, layout, detailLevel: 'CLOSE', selection: { kind: 'slot', id: row.slotId }, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
          const face = faceRows(frame, plan.entities.get(id)!)
          expect(face.visible.some(item => item.slotId === row.slotId)).toBe(true)
          for (const divider of face.scopes?.dividers ?? []) {
            dividers++
            expect(frame.scopeDividers?.some(actual => actual.label === divider.label && actual.depth === divider.depth)).toBe(true)
            const top = frame.anchor.position[1] + frame.anchor.size[1] / 2
            const y = top - face.header - divider.offset
            expect(y + world.frame.scopeDivider / 2).toBeLessThanOrEqual(top - face.header + 1e-6)
            expect(y - world.frame.scopeDivider / 2).toBeGreaterThan(frame.anchor.position[1] - frame.anchor.size[1] / 2 + world.frame.pad)
          }
          expect(face.visible.length * face.pitch + (face.scopes?.extraHeight ?? 0)).toBeLessThanOrEqual(frame.anchor.size[1] - face.header - world.frame.pad + 1e-6)
          expect(frame.anchor).toBe(layout.anchors[id])
        }
      }
    }
    expect(dividers).toBeGreaterThan(0)
  })

  it('restores exact active scopes, values, identities and presented ports at every cursor', () => {
    const before = JSON.stringify(layout)
    for (let cursor = trace.events.length; cursor >= 0; cursor--) {
      const state = seek(trace, cursor), scene = projection.project(cursor)
      for (const id of scene.order.frames) {
        const frame = scene.entities[id]
        if (frame.kind !== 'frame') throw new Error('Expected frame')
        expect(frame.anchor).toBe(layout.anchors[id])
        for (const row of frame.rows) {
          const slot = state.frames[id].locals[row.slotId]
          expect(slot).toBeDefined()
          if (slot.scopeId) {
            const scope = state.scopes[slot.scopeId]
            expect(scope.status).toBe('active')
            expect(row.scopeDepth).toBe(scope.depth)
          }
          if (slot.value.kind === 'primitive') expect(row.value.exact).toBe(String(slot.value.value))
          else if (slot.value.kind === 'reference') expect(row.value).toMatchObject({ kind: 'reference', targetId: slot.value.objectId })
          const plan = planPresentation({ scene, layout, detailLevel: 'CLOSE', selection: { kind: 'slot', id: row.slotId }, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
          const point = faceRowPort(frame, plan.entities.get(id)!, row.slotId)!
          expect(point).not.toBeNull()
          expect(point[1]).toBeGreaterThan(frame.anchor.position[1] - frame.anchor.size[1] / 2 + world.frame.pad)
        }
        for (const divider of frame.scopeDividers ?? []) expect(Object.values(state.scopes).some(scope => scope.frameId === id && scope.status === 'active' && scope.depth === divider.depth && scope.label === divider.label)).toBe(true)
      }
    }
    expect(JSON.stringify(layout)).toBe(before)
  })

  it('fits the retained frame/heap world at all original aspect ratios without a second scoped camera', () => {
    const scene = projection.project(trace.events.length)
    const plan = planPresentation({ scene, layout, detailLevel: 'CLOSE', selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
    for (const aspect of [1, 1.5, 2.1]) {
      const viewport = { width: aspect * 1000, height: 1000 }, safe = { x: 12, y: 72, width: viewport.width - 24, height: 816 }
      const home = homeFraming(scene, plan, safe, viewport, layout), camera = projectionCamera(home.pose, viewport)
      expect(camera.position.toArray().every(Number.isFinite)).toBe(true)
      for (const point of home.points) {
        const screen = screenPoint(point, camera, viewport)
        expect(screen.x).toBeGreaterThanOrEqual(safe.x - 1)
        expect(screen.x).toBeLessThanOrEqual(safe.x + safe.width + 1)
        expect(screen.y).toBeGreaterThanOrEqual(safe.y - 1)
        expect(screen.y).toBeLessThanOrEqual(safe.y + safe.height + 1)
      }
    }
    expect(scene.order.frames).toHaveLength(4)
    expect(scene.order.frames.every(id => scene.entities[id].kind === 'frame' && !scene.entities[id].live)).toBe(true)
    expect(scene.order.objects.map(id => scene.entities[id].title)).toEqual(['Scanner'])
  })
})
