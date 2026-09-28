import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TraceDocument } from '../contracts/runtime'
import type { RawRuntimeEvent } from '../instrumentation/contracts'
import { filterTraceInspectorRows, traceInspectorRows, TraceInspector } from './TraceInspector'

const trace: TraceDocument = {
  schemaVersion: 2,
  demoId: 'real:sample',
  sourceFiles: [{ fileId: 'pkg/Main.java', name: 'Main.java', content: '' }],
  events: [
    { eventId: 'event-0', seq: 0, type: 'PROGRAM_START', source: null, label: 'Start', importance: 'major' },
    { eventId: 'event-1', seq: 1, type: 'ALLOCATE_OBJECT', source: { fileId: 'pkg/Main.java', line: 12 },
      label: 'Object born', importance: 'major', objectId: 'obj-17', displayId: 17, className: 'Person', fields: [] },
    { eventId: 'event-2', seq: 2, type: 'CREATE_REFERENCE', source: { fileId: 'pkg/Main.java', line: 13 },
      label: 'Attach', importance: 'normal', sourceSlot: { kind: 'object', objectId: 'obj-17', slotId: 'friend' },
      targetObjectId: 'obj-21', javaType: 'Person' },
  ],
}

const rawEvents: RawRuntimeEvent[] = [
  { v: 1, seq: 0, type: 'field', threadId: '42', frameId: 'frame-3', className: 'pkg.Person',
    methodName: 'setAge', descriptor: '(I)V', line: 8, site: 14, objectId: 'obj-17',
    owner: 'pkg.Person', name: 'age', value: { kind: 'int', value: 18 } },
  { v: 1, seq: 1, type: 'array_write', threadId: '42', frameId: 'frame-3', className: 'pkg.Person',
    methodName: 'setAge', descriptor: '(I)V', line: null, site: 16, objectId: 'array-2', index: 0, value: 3 },
]

describe('TraceInspector', () => {
  it('starts collapsed and stays a small developer disclosure', () => {
    const markup = renderToStaticMarkup(<TraceInspector trace={trace} rawEvents={rawEvents} />)
    expect(markup).toContain('<details class="trace-inspector"')
    expect(markup).toContain('TRACE')
    expect(markup).toContain('DEV')
    expect(markup).toContain('3 normalized events')
    expect(markup).not.toContain('<table>')
    expect(markup).not.toContain('obj-17')
  })

  it('projects normalized IDs and source without inventing a thread', () => {
    const rows = traceInspectorRows(trace.events, 'normalized')
    expect(rows[0]).toMatchObject({ seq: 0, type: 'PROGRAM_START', thread: '—', frame: '—', object: '—', source: '—' })
    expect(rows[1]).toMatchObject({ seq: 1, type: 'ALLOCATE_OBJECT', object: 'obj-17', source: 'pkg/Main.java:12' })
    expect(rows[2].object).toBe('obj-21, obj-17')
    expect(rows[2].payload).toContain('"sourceSlot"')
  })

  it('projects observed raw thread, frame, object, bytecode site and payload', () => {
    const rows = traceInspectorRows(rawEvents, 'raw')
    expect(rows[0]).toMatchObject({ seq: 0, type: 'field', thread: '42', frame: 'frame-3', object: 'obj-17', source: 'pkg.Person.setAge:8 @14' })
    expect(rows[0].payload).toContain('"value":18')
    expect(rows[1].source).toBe('pkg.Person.setAge @16')
  })

  it('filters by exact type and searches all columns case-insensitively', () => {
    const rows = traceInspectorRows(rawEvents, 'raw')
    expect(filterTraceInspectorRows(rows, 'field', 'FRAME-3')).toHaveLength(1)
    expect(filterTraceInspectorRows(rows, '', 'array-2')).toHaveLength(1)
    expect(filterTraceInspectorRows(rows, '', 'pkg.person.setage')).toHaveLength(2)
    expect(filterTraceInspectorRows(rows, '', '"index":0')).toHaveLength(1)
    expect(filterTraceInspectorRows(rows, 'field', 'array-2')).toHaveLength(0)
  })

  it('does not modify the supplied trace or raw events', () => {
    const events = Object.freeze([...trace.events])
    const raw = Object.freeze([...rawEvents])
    traceInspectorRows(events, 'normalized')
    traceInspectorRows(raw, 'raw')
    expect(events).toEqual(trace.events)
    expect(raw).toEqual(rawEvents)
  })
})
