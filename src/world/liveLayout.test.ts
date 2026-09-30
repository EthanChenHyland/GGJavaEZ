import { describe, expect, it } from 'vitest'
import type { RuntimeSlot, TraceDocument, TraceEvent } from '../contracts/runtime'
import { loadArrayTrace, loadPersonTrace, loadRecursionTrace } from '../runtime'
import { worldUnits } from '../theme/tokens'
import { createLayout } from './layout'

const capture = { origin: 'jvm' as const, sourceHashes: {}, recordedAt: '2026-09-29T00:00:00Z' }

describe('live debug layout', () => {
  it('keeps frame XYZ, geometry and existing ports stable as a trace grows', () => {
    const source = loadRecursionTrace()
    const trace = { ...source, demoId: 'custom:stable-test', capture }
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
    const trace = { ...loadPersonTrace(), demoId: 'custom:siblings', capture }
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

  it('uses capture provenance instead of demoId prefixes to select live layout', () => {
    const fixture = loadPersonTrace()
    const curated = createLayout(fixture)
    const prefixed = createLayout({ ...fixture, demoId: 'debug:misleading' })
    const captured = createLayout({ ...fixture, demoId: 'person-without-prefix', capture })
    expect(prefixed.anchors).toEqual(curated.anchors)
    expect(captured.anchors['frame:main:1'].position).not.toEqual(curated.anchors['frame:main:1'].position)
    expect(curated.anchors['object:person:17'].position).toEqual([3.45, -0.05, -0.65])
    const arrayTrace = loadArrayTrace()
    const firstArray = arrayTrace.events.find((event) => event.type === 'ALLOCATE_ARRAY')
    expect(firstArray).toBeDefined()
    if (firstArray?.type === 'ALLOCATE_ARRAY') expect(createLayout(arrayTrace).anchors[firstArray.objectId].position).toEqual([3.45, -0.05, -0.65])
  })

  it('reserves nonoverlapping heap solids and contains every field row as a capture grows', () => {
    const fields = (objectId: string, count: number): RuntimeSlot[] => Array.from({ length: count }, (_, index) => ({
      id: `${objectId}:field:${index}`, name: `field${index}`, javaType: 'int', value: { kind: 'primitive', javaType: 'int', value: index },
    }))
    const allocation = (seq: number, objectId: string, count: number): TraceEvent => ({
      eventId: `event:${seq}`, seq, source: null, label: 'allocate', importance: 'major',
      type: 'ALLOCATE_OBJECT', objectId, displayId: seq, className: 'Example', fields: fields(objectId, count),
    })
    const trace: TraceDocument = {
      schemaVersion: 2, demoId: 'jvm-layout', sourceFiles: [], capture,
      events: [allocation(0, 'object:one', 2), allocation(1, 'object:many', 7), allocation(2, 'object:three', 4)],
    }
    const complete = createLayout(trace)
    const ids = ['object:one', 'object:many', 'object:three']
    expect(complete.anchors['object:one'].size).toEqual([...worldUnits.object])
    expect(complete.anchors['object:one'].position[0]).toBeCloseTo(3.45)
    expect(complete.anchors['object:one'].position[2]).toBeCloseTo(-0.65)
    for (let cursor = 1; cursor <= trace.events.length; cursor++) {
      const prefix = createLayout({ ...trace, events: trace.events.slice(0, cursor) })
      for (const id of ids.slice(0, cursor)) expect(prefix.anchors[id]).toEqual(complete.anchors[id])
    }
    for (const [index, id] of ids.entries()) {
      const anchor = complete.anchors[id]
      const count = [2, 7, 4][index]
      const lowestRow = anchor.position[1] + anchor.size[1] / 2 - 1.07 - (count - 1) * 0.52 - 0.22
      expect(lowestRow).toBeGreaterThan(anchor.position[1] - anchor.size[1] / 2 + 0.2)
      for (const port of Object.values(anchor.ports)) {
        expect(port[1]).toBeGreaterThan(anchor.position[1] - anchor.size[1] / 2)
        expect(port[1]).toBeLessThan(anchor.position[1] + anchor.size[1] / 2)
      }
      for (const otherId of ids.slice(index + 1)) {
        const other = complete.anchors[otherId]
        const gap = Math.max(...[0, 1, 2].map(axis => Math.abs(anchor.position[axis] - other.position[axis]) - (anchor.size[axis] + other.size[axis]) / 2))
        expect(gap).toBeGreaterThanOrEqual(0.8 - 1e-8)
      }
    }
  })

  it('reserves expanded array depth between live object allocations', () => {
    const first: TraceEvent = { eventId: 'first', seq: 0, source: null, label: 'first', importance: 'major',
      type: 'ALLOCATE_OBJECT', objectId: 'first', displayId: 1, className: 'Example', fields: [] }
    const array: TraceEvent = { eventId: 'array', seq: 1, source: null, label: 'array', importance: 'major',
      type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 2, elementType: 'int', elements: [{ kind: 'primitive', javaType: 'int', value: 1 }] }
    const last: TraceEvent = { ...first, eventId: 'last', seq: 2, objectId: 'last', displayId: 3 }
    const trace: TraceDocument = { schemaVersion: 2, demoId: 'mixed-heap', sourceFiles: [], capture, events: [first, array, last] }
    const layout = createLayout(trace)
    const expanded = layout.theater?.anchors.array
    expect(expanded).toBeDefined()
    if (!expanded) return
    for (const id of ['first', 'last']) {
      const object = layout.anchors[id]
      const gap = Math.max(...[0, 1, 2].map(axis => Math.abs(object.position[axis] - expanded.position[axis]) - (object.size[axis] + expanded.size[axis]) / 2))
      expect(gap).toBeGreaterThanOrEqual(0.8 - 1e-8)
    }
    expect(createLayout({ ...trace, events: [first] }).anchors.first).toEqual(layout.anchors.first)
    expect(createLayout({ ...trace, events: [first, array] }).anchors.array).toEqual(layout.anchors.array)
  })
})
