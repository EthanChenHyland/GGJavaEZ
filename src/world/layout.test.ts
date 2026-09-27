import { describe, expect, it } from 'vitest'
import type { TraceDocument } from '../contracts/runtime'
import { createLayout } from './layout'

describe('createLayout', () => {
  it('reserves stable anchors independent of playback cursor', () => {
    const trace: TraceDocument = {
      schemaVersion: 1, demoId: 'test', sourceFiles: [], events: [
        { eventId: 'e0', seq: 0, source: null, label: 'enter main', importance: 'major', type: 'ENTER_METHOD', frameId: 'main', callerFrameId: null, className: 'Main', methodName: 'main', locals: [] },
        { eventId: 'e1', seq: 1, source: null, label: 'allocate', importance: 'major', type: 'ALLOCATE_OBJECT', objectId: 'person', displayId: 17, className: 'Person', fields: [] },
      ],
    }
    const first = createLayout(trace)
    const second = createLayout(trace)
    expect(first).toEqual(second)
    expect(first.anchors.main.position[2]).not.toBe(first.anchors.person.position[2])
  })
})
