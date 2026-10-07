import { describe, expect, it } from 'vitest'
import type { RuntimeSlot, TraceDocument, TraceEvent } from '../contracts/runtime'
import { loadArrayTrace, loadPersonTrace, loadRecursionTrace, loadControlTrace } from '../examples/traces'
import { createLayout as batchLayout, createLayoutBuilder } from './layout'
import { createCuratedLayout } from '../examples/curatedLayout'
import { createScopedLayout } from '../examples/scopedLayout'
import { worldUnits } from '../theme/tokens'
import { layoutForTrace as createLayout } from '../app/layoutForTrace'

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

  it('reserves nonoverlapping heap solids and bounds visible field rows as a capture grows', () => {
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
    expect(complete.anchors['object:one'].position[0]).toBeCloseTo(4.6)
    expect(complete.anchors['object:one'].position[2]).toBeCloseTo(-worldUnits.object[2] / 2)
    for (let cursor = 1; cursor <= trace.events.length; cursor++) {
      const prefix = createLayout({ ...trace, events: trace.events.slice(0, cursor) })
      for (const id of ids.slice(0, cursor)) expect(prefix.anchors[id]).toEqual(complete.anchors[id])
    }
    for (const [index, id] of ids.entries()) {
      const anchor = complete.anchors[id]
      const count = Math.min(6, [2, 7, 4][index])
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

  it('reserves a distinct typed array shelf beside object allocations', () => {
    const first: TraceEvent = { eventId: 'first', seq: 0, source: null, label: 'first', importance: 'major',
      type: 'ALLOCATE_OBJECT', objectId: 'first', displayId: 1, className: 'Example', fields: [] }
    const array: TraceEvent = { eventId: 'array', seq: 1, source: null, label: 'array', importance: 'major',
      type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 2, elementType: 'int', elements: [{ kind: 'primitive', javaType: 'int', value: 1 }] }
    const last: TraceEvent = { ...first, eventId: 'last', seq: 2, objectId: 'last', displayId: 3 }
    const trace: TraceDocument = { schemaVersion: 2, demoId: 'mixed-heap', sourceFiles: [], capture, events: [first, array, last] }
    const layout = createLayout(trace)
    const expanded = layout.anchors.array
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

describe('append-aware generic layout', () => {
  it.each([loadPersonTrace, loadRecursionTrace, loadArrayTrace, loadControlTrace])('matches every batch prefix, including exact JSON property and corner order (%#)', (load) => {
    const full = { ...load(), capture }
    const builder = createLayoutBuilder()
    for (let cursor = 0; cursor <= full.events.length; cursor++) {
      if (cursor) builder.append([full.events[cursor - 1]])
      const expected = batchLayout({ ...full, events: full.events.slice(0, cursor) })
      expect(builder.state).toEqual(expected)
      expect(JSON.stringify(builder.state)).toBe(JSON.stringify(expected))
    }
  })

  it('preserves old snapshots and shares solids/corners on declaration and value updates', () => {
    const source = loadRecursionTrace()
    const trace = { ...source, capture, events: [] as TraceEvent[] }
    const declaration = source.events.findIndex(event => event.type === 'DECLARE_LOCAL')
    expect(declaration).toBeGreaterThan(0)
    trace.events.push(...source.events.slice(0, declaration))
    const before = createLayout(trace)
    const frozen = JSON.stringify(before)
    trace.events.push(source.events[declaration])
    const after = createLayout(trace)
    expect(after).toEqual(batchLayout(trace))
    expect(JSON.stringify(before)).toBe(frozen)
    expect(after.bounds!.points).toBe(before.bounds!.points)
    const declare = source.events[declaration]
    if (declare.type !== 'DECLARE_LOCAL') throw new Error('Expected declaration')
    expect(after.anchors[declare.frameId].ports).not.toBe(before.anchors[declare.frameId].ports)
    const unrelated = Object.keys(before.anchors).find(id => id !== declare.frameId)
    if (unrelated) expect(after.anchors[unrelated]).toBe(before.anchors[unrelated])
    expect(createLayout(trace)).toBe(after)
    const event: TraceEvent = { eventId: 'layout-line', seq: trace.events.length, source: null, importance: 'normal', label: 'line', type: 'LINE_EXECUTE', frameId: declare.frameId }
    trace.events.push(event)
    expect(createLayout(trace)).toBe(after)
  })

  it('does not revisit prior semantic events on stable trace growth', () => {
    const source = loadPersonTrace()
    const trace = { ...source, capture, events: source.events.slice(0, 8) }
    const first = createLayout(trace)
    // Cache boundary reads are permitted; all earlier interior reads fail.
    for (let index = 1; index < trace.events.length - 1; index++) {
      Object.defineProperty(trace.events, index, { get() { throw new Error('Rescanned prior semantic prefix') }, configurable: true })
    }
    trace.events.push(source.events[8])
    const result = createLayout(trace)
    expect(result).toEqual(batchLayout({ ...source, capture, events: source.events.slice(0, 9) }))
    expect(first.anchors).not.toBeUndefined()
  })

  it('resets on replacement/truncation and preserves scoped/curated selection', () => {
    const source = loadPersonTrace()
    const trace = { ...source, capture, events: source.events.slice(0, 10) }
    createLayout(trace)
    trace.events = source.events.slice(0, 2)
    expect(createLayout(trace)).toEqual(batchLayout(trace))
    trace.events = source.events.slice(0, 10).map(event => ({ ...event }))
    expect(createLayout(trace)).toEqual(batchLayout(trace))
    const curated = { ...source, events: [] as TraceEvent[] }
    for (const event of source.events) {
      curated.events.push(event)
      expect(createLayout(curated)).toEqual(createCuratedLayout(curated))
    }
    const scopes = { ...loadControlTrace(), capture, events: [] as TraceEvent[] }
    let hasScopes = false
    for (const event of loadControlTrace().events) {
      scopes.events.push(event)
      hasScopes ||= event.type === 'ENTER_SCOPE'
      expect(createLayout(scopes)).toEqual(hasScopes ? createScopedLayout(scopes) : batchLayout(scopes))
    }
  })

  it('matches shelf wrapping, empty/large arrays, tall objects and interleaved methods', () => {
    const source = loadPersonTrace()
    const events: TraceEvent[] = []
    const add = (event: TraceEvent) => events.push({ ...event, eventId: `mixed:${events.length}`, seq: events.length })
    const method = source.events.find(event => event.type === 'ENTER_METHOD')!
    const allocation = source.events.find(event => event.type === 'ALLOCATE_OBJECT')!
    for (let index = 0; index < 12; index++) {
      if (method.type !== 'ENTER_METHOD' || allocation.type !== 'ALLOCATE_OBJECT') throw new Error('Expected fixtures')
      add({ ...method, frameId: `frame:${index}`, callerFrameId: index % 3 === 0 ? null : `frame:${index - 1}`, locals: [], returnType: 'int' })
      add({ ...allocation, objectId: `object:${index}`, displayId: index, fields: Array.from({ length: index }, (_, field) => ({
        id: `field:${index}:${field}`, name: `field${field}`, javaType: 'int', value: { kind: 'uninitialized' },
      })) })
      if (index % 3 === 0) add({ eventId: '', seq: 0, source: null, label: 'array', importance: 'major',
        type: 'ALLOCATE_ARRAY', objectId: `array:${index}`, displayId: 100 + index, elementType: 'int',
        elements: Array.from({ length: index }, () => ({ kind: 'primitive', javaType: 'int', value: 1 })) })
    }
    const builder = createLayoutBuilder()
    const trace = { ...source, capture, events: [] as TraceEvent[] }
    for (const event of events) {
      const prior = JSON.stringify(builder.state)
      const retained = builder.state
      trace.events.push(event)
      builder.append([event])
      expect(JSON.stringify(builder.state)).toBe(JSON.stringify(batchLayout(trace)))
      expect(JSON.stringify(retained)).toBe(prior)
    }
  })
})
