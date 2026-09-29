import { describe, expect, it } from 'vitest'
import { loadRecursionTrace } from '../runtime'
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
})
