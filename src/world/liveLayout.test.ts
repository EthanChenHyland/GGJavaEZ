import { describe, expect, it } from 'vitest'
import { loadPersonTrace, loadRecursionTrace } from '../runtime'
import { createLayout } from './layout'

describe('live debug layout', () => {
  it('keeps frame XYZ, geometry and existing ports stable as a trace grows', () => {
    const source = loadRecursionTrace()
    const trace = { ...source, demoId: 'debug:stable-test' }
    const complete = createLayout(trace)
    for (let cursor = 1; cursor <= trace.events.length; cursor++) {
      const prefix = createLayout({ ...trace, events: trace.events.slice(0, cursor) })
      for (const [id, anchor] of Object.entries(prefix.anchors)) {
        expect(anchor.position).toEqual(complete.anchors[id].position)
        expect(anchor.size).toEqual(complete.anchors[id].size)
        for (const [slot, port] of Object.entries(anchor.ports)) expect(port).toEqual(complete.anchors[id].ports[slot])
      }
    }
  })
  it('places completed sibling invocations at distinct permanent XYZ anchors', () => {
    const trace = { ...loadPersonTrace(), demoId: 'execution:siblings' }
    const layout = createLayout(trace)
    const siblings = trace.events.flatMap((event) => event.type === 'ENTER_METHOD' && event.callerFrameId === 'frame:main:1' ? [event.frameId] : [])
    expect(siblings).toHaveLength(2)
    const anchors = siblings.map((id) => layout.anchors[id].position.join(','))
    expect(new Set(anchors).size).toBe(anchors.length)
    const [left, right] = siblings.map((id) => layout.anchors[id])
    expect(Math.abs(right.position[0] - left.position[0])).toBeGreaterThan((left.size[0] + right.size[0]) / 2 + 0.5)
    for (const frameId of siblings) {
      const enter = trace.events.findIndex((event) => event.type === 'ENTER_METHOD' && event.frameId === frameId)
      const prefix = createLayout({ ...trace, events: trace.events.slice(0, enter + 1) })
      expect(prefix.anchors[frameId].position).toEqual(layout.anchors[frameId].position)
    }
  })
})
