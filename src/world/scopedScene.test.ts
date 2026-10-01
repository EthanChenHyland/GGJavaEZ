import { describe, expect, it } from 'vitest'
import { seek } from '../runtime'
import { loadControlTrace } from '../examples/traces'
import { layoutForTrace as createLayout } from '../app/layoutForTrace'
import { buildSceneModel } from './sceneModel'
import { sceneHomePose } from '../navigation/cameraMotion'
import { detailDistanceForScene, distance } from '../navigation/navigation'

const trace = loadControlTrace()
const layout = createLayout(trace)
describe('persistent scope world', () => {
  it('reserves one navigable composition and genuine inset solids before execution', () => {
    expect(layout.layoutKind).toBe('scoped')
    expect(layout.theater).toBeUndefined()
    expect(createLayout(trace)).toEqual(layout)
    for (const scope of Object.values(layout.scopes!)) {
      expect(scope.anchor.size.every((value) => value > 0)).toBe(true)
      const frame = layout.anchors[scope.frameId]
      if (scope.depth) expect(scope.anchor.position[2]).toBeGreaterThan(frame.position[2] + frame.size[2] / 2)
      for (const id of scope.slotIds) expect(scope.anchor.ports[id]).toBe(frame.ports[id])
    }
  })
  it('restores exact live scopes, values, identities and XYZ ports at every cursor', () => {
    for (let cursor = trace.events.length; cursor >= 0; cursor--) {
      const state = seek(trace, cursor)
      const scene = buildSceneModel(state, layout, 'meso')
      expect(scene.bounds).toBe(layout.bounds)
      for (const frame of scene.frames) {
        expect(frame.anchor).toBe(layout.anchors[frame.id])
        expect(frame.scopes!.map((scope) => scope.id).sort()).toEqual(Object.values(state.scopes).filter((scope) => scope.frameId === frame.id && scope.status === 'active').map((scope) => scope.id).sort())
        for (const slot of frame.slots.filter((slot) => slot.role !== 'return')) {
          expect(slot.port).toBe(layout.anchors[frame.id].ports[slot.id])
          expect(state.scopes[slot.scopeId!].status).toBe('active')
          expect(slot.value).toEqual(state.frames[frame.id].locals[slot.id].value)
        }
      }
    }
  })
  it('keeps Home stable at all timeline positions and exposes locals at canonical zoom', () => {
    for (const aspect of [1,1.5,2.1]) {
      const home = sceneHomePose({ bounds:layout.bounds,stackDepth:layout.stackDepth,layoutKind:layout.layoutKind },layout.homeTarget,{verticalFov:41,aspect})
      expect(home.position.every(Number.isFinite)).toBe(true)
      expect(detailDistanceForScene(distance(home.position,home.target),home,{ bounds:layout.bounds,stackDepth:layout.stackDepth,layoutKind:layout.layoutKind })).toBeLessThan(20)
    }
    const final = buildSceneModel(seek(trace,trace.events.length),layout,'meso')
    expect(final.frames).toHaveLength(4)
    expect(final.frames.every((frame) => frame.invocationStatus === 'completed')).toBe(true)
    expect(final.objects.map((node) => node.className)).toEqual(['Scanner'])
  })
})
