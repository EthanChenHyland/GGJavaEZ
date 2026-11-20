import { describe, expect, it } from 'vitest'
import type { TraceDocument } from '../contracts/runtime'
import { createLayoutEngine } from './layoutEngine'

describe('canonical production layout', () => {
  it('reserves stable anchors independent of playback cursor', () => {
    const trace: TraceDocument = {
      schemaVersion: 1, demoId: 'test', sourceFiles: [], events: [
        { eventId: 'e0', seq: 0, source: null, label: 'enter main', importance: 'major', type: 'ENTER_METHOD', frameId: 'main', callerFrameId: null, className: 'Main', methodName: 'main', locals: [] },
        { eventId: 'e1', seq: 1, source: null, label: 'allocate', importance: 'major', type: 'ALLOCATE_OBJECT', objectId: 'person', displayId: 17, className: 'Person', fields: [] },
      ],
    }
    const first = createLayoutEngine(), second = createLayoutEngine()
    first.append(trace.events); second.append(trace.events)
    expect(JSON.stringify(first.state)).toBe(JSON.stringify(second.state))
    expect(first.state.anchors.main.position[2]).not.toBe(first.state.anchors.person.position[2])
    const prefix = createLayoutEngine(); prefix.append(trace.events.slice(0, 1))
    const retained = prefix.state, saved = JSON.stringify(retained)
    prefix.append(trace.events)
    expect(prefix.state.anchors.main).toBe(retained.anchors.main)
    expect(JSON.stringify(retained)).toBe(saved)
    expect(JSON.stringify(prefix.state)).toBe(JSON.stringify(first.state))
  })
})
