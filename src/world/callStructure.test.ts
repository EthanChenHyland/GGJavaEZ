import { describe, expect, it } from 'vitest'
import { seek } from '../runtime'
import { loadPersonTrace, loadRecursionTrace } from '../examples/traces'
import { layoutForTrace as createLayout } from '../app/layoutForTrace'
import { buildSceneModel } from './sceneModel'
import { callEdgesForScene, connectorBackPlane } from './callStructure'

describe('retained call structure', () => {
  it('connects each Person invocation to its real caller without linking siblings', () => {
    const trace = { ...loadPersonTrace(), demoId: 'execution:call-tree' }
    const scene = buildSceneModel(seek(trace, trace.events.length), createLayout(trace), 'meso')
    const edges = callEdgesForScene(scene)
    expect(edges.map(({ callerId, calleeId }) => [callerId, calleeId])).toEqual([
      ['frame:main:1', 'frame:person-constructor:1'],
      ['frame:main:1', 'frame:person-setAge:1'],
    ])
    const back = connectorBackPlane(scene)
    expect(edges.every(edge => edge.points.slice(1, -1).every(point => point[2] > Math.max(edge.points[0][2], edge.points.at(-1)![2])))).toBe(true)
    expect(edges.every((edge) => edge.points[0][2] > back && edge.points.at(-1)![2] > back)).toBe(true)
    expect(scene.frames.every((frame) => back < frame.anchor.position[2] - frame.anchor.size[2] / 2)).toBe(true)
  })

  it('does not draw a direct call from an observed ancestor across opaque code', () => {
    const trace = loadPersonTrace()
    const scene = buildSceneModel(seek(trace, trace.events.length), createLayout(trace), 'meso')
    const frame = scene.frames[1]
    const guarded = { ...scene, frames: scene.frames.map(node => node.id === frame.id ? { ...node, callerEvidence: 'unavailable' as const } : node) }
    expect(callEdgesForScene(guarded).some(edge => edge.calleeId === frame.id)).toBe(false)
    expect(callEdgesForScene(guarded)).toHaveLength(1)
  })

  it('uses the same observed parent relationship in deeper recursion', () => {
    const trace = { ...loadRecursionTrace(), demoId: 'execution:recursion-calls' }
    const scene = buildSceneModel(seek(trace, trace.events.length), createLayout(trace), 'meso')
    const edges = callEdgesForScene(scene)
    expect(edges).toHaveLength(scene.frames.length - 1)
    for (const edge of edges) expect(scene.frames.find((frame) => frame.id === edge.calleeId)?.callerFrameId).toBe(edge.callerId)
  })
})
