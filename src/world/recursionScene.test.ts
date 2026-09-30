import { describe, expect, it } from 'vitest'
import { loadRecursionTrace, seek } from '../runtime'
import { createLayout } from './layout'
import { buildSceneModel } from './sceneModel'

const trace = loadRecursionTrace()
const layout = createLayout(trace)
const sceneAt = (cursor: number) => buildSceneModel(seek(trace, cursor), layout, 'meso')

describe('shared recursion scene and anchors', () => {
  it('reserves all six invocations in true XYZ space and keeps them fixed at every cursor', () => {
    expect(layout.stackDepth).toBe(5)
    expect(Object.keys(layout.anchors)).toHaveLength(6)
    const anchors = Object.values(layout.anchors)
    expect(new Set(anchors.map((anchor) => anchor.position[0])).size).toBe(6)
    expect(new Set(anchors.map((anchor) => anchor.position[1])).size).toBe(6)
    expect(new Set(anchors.map((anchor) => anchor.position[2])).size).toBe(6)
    for (let cursor = trace.events.length; cursor >= 0; cursor--) {
      const scene = sceneAt(cursor)
      expect(scene.bounds).toEqual(layout.bounds)
      expect(scene.stackDepth).toBe(5)
      expect(scene.objects).toEqual([])
      for (const frame of scene.frames) expect(frame.anchor).toEqual(layout.anchors[frame.id])
    }
    expect(sceneAt(19).frames.map((frame) => frame.label)).toEqual(['main()', 'factorial(5)', 'factorial(4)', 'factorial(3)', 'factorial(2)', 'factorial(1)'])
  })

  it('keeps return values in their reserved subdivisions and joins exact evaluation endpoints', () => {
    const pending = sceneAt(19).frames.find((frame) => frame.id === 'frame:factorial:1')!
    expect(pending.slots.find((slot) => slot.role === 'return')?.displayValue).toBe('pending')
    const returning = sceneAt(20)
    const row = returning.frames.find((frame) => frame.id === pending.id)!.slots.find((slot) => slot.role === 'return')!
    expect(row.value).toMatchObject({ value: 1 })
    expect(returning.returnFlow?.from).toEqual(row.port)
    const destination = returning.returnFlow!.destination!
    const caller = returning.frames.find((frame) => frame.id === destination.frameId)!
    expect(returning.returnFlow?.to).toEqual(caller.slots.find((slot) => slot.id === destination.slotId)!.port)
    expect(sceneAt(21).frames.find((frame) => frame.id === pending.id)?.invocationStatus).toBe('completed')
    expect(sceneAt(19).frames.find((frame) => frame.id === pending.id)?.anchor).toEqual(pending.anchor)
    expect(sceneAt(36).frames).toHaveLength(6)
    expect(sceneAt(36).frames.every((frame) => frame.invocationStatus === 'completed' && !frame.active)).toBe(true)
    expect(sceneAt(36).returnFlow?.value).toMatchObject({ value: 120 })
  })
})
