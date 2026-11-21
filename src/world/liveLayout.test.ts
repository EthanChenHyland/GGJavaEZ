import { describe, expect, it } from 'vitest'
import type { RuntimeSlot, TraceDocument, TraceEvent } from '../contracts/runtime'
import { loadArrayTrace, loadPersonTrace, loadRecursionTrace, loadControlTrace } from '../examples/traces'
import { createLayoutEngine } from './layoutEngine'
import { world } from '../theme/tokens'
import { projectTrace } from '../testing/projectTrace'
import { faceRows } from './faceRows'

// Unit fixture tags exercise recording wrappers; they are not fresh JVM evidence.
const capture = { origin: 'jvm' as const, sourceHashes: {}, recordedAt: '2026-09-29T00:00:00Z' }
const createLayout = (trace: TraceDocument) => { const engine = createLayoutEngine(); engine.append(trace.events); return engine.state }
const gap = (a: ReturnType<typeof createLayout>['anchors'][string], b: typeof a) => Math.max(...[0, 1, 2].map(axis => Math.abs(a.position[axis] - b.position[axis]) - (a.size[axis] + b.size[axis]) / 2))

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
    expect(gap(left, right)).toBeGreaterThanOrEqual(world.frame.deckGapZ - 1e-8)
    for (const frameId of siblings) {
      const enter = trace.events.findIndex((event) => event.type === 'ENTER_METHOD' && event.frameId === frameId)
      const prefix = createLayout({ ...trace, events: trace.events.slice(0, enter + 1) })
      expect(prefix.anchors[frameId].position).toEqual(layout.anchors[frameId].position)
    }
  })

  it('uses one canonical geography regardless of demo names or recording wrappers', () => {
    for (const fixture of [loadPersonTrace(), loadArrayTrace()]) {
      const canonical = createLayout(fixture)
      for (const trace of [{ ...fixture, demoId: 'debug:misleading' }, { ...fixture, demoId: 'unit/no-prefix', capture }]) {
        expect(createLayout(trace)).toEqual(canonical)
      }
      expect(Object.values(canonical.anchors).some(anchor => anchor.region === 'stack')).toBe(true)
      expect(Object.values(canonical.anchors).some(anchor => anchor.region === 'heap' || anchor.region === 'library')).toBe(true)
    }
  })

  it('reserves nonoverlapping heap solids and bounds visible field rows as a capture grows', () => {
    const fields = (objectId: string, count: number): RuntimeSlot[] => Array.from({ length: count }, (_, index) => ({
      id: `${objectId}:field:${index}`, name: `field${index}`, javaType: 'int', value: { kind: 'primitive', javaType: 'int', value: index },
    }))
    const allocation = (seq: number, objectId: string, count: number): TraceEvent => ({
      eventId: `event:${seq}`, seq, source: null, label: 'allocate', importance: 'major',
      type: 'ALLOCATE_OBJECT', objectId, displayId: seq + 1, className: 'Example', fields: fields(objectId, count), metadata: { ownership: 'PROJECT', runtimeType: 'Example', packageName: '' },
    })
    const trace: TraceDocument = {
      schemaVersion: 2, demoId: 'jvm-layout', sourceFiles: [], capture,
      events: [allocation(0, 'object:one', 2), allocation(1, 'object:many', 7), allocation(2, 'object:three', 4)],
    }
    const complete = createLayout(trace)
    const ids = ['object:one', 'object:many', 'object:three']
    expect(complete.anchors['object:one'].size).toEqual([world.object.w, world.object.header + world.object.pad + 2 * world.object.row, world.object.depth])
    expect(complete.anchors['object:one'].region).toBe('heap')
    expect(complete.anchors['object:one'].position[2]).toBe(world.regions.heapFrontZ)
    for (let cursor = 1; cursor <= trace.events.length; cursor++) {
      const prefix = createLayout({ ...trace, events: trace.events.slice(0, cursor) })
      for (const id of ids.slice(0, cursor)) expect(prefix.anchors[id]).toEqual(complete.anchors[id])
    }
    for (const [index, id] of ids.entries()) {
      const anchor = complete.anchors[id]
      const recording = { ...trace, events: [
        { eventId: 'start', seq: 0, source: null, label: 'start', importance: 'major' as const, type: 'PROGRAM_START' as const },
        ...trace.events.map(event => ({ ...event, seq: event.seq + 1 })),
      ] }
      const scene = projectTrace(recording).project(recording.events.length), node = scene.entities[id]
      const visible = faceRows(node, { detail: 'CLOSE' }).visible
      expect(visible).toHaveLength([2, 7, 4][index])
      const lowestRow = anchor.position[1] + anchor.size[1] / 2 - world.object.header - visible.length * world.object.row
      expect(lowestRow).toBeGreaterThanOrEqual(anchor.position[1] - anchor.size[1] / 2 + world.object.pad - 1e-8)
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
      type: 'ALLOCATE_OBJECT', objectId: 'first', displayId: 1, className: 'Example', fields: [], metadata: { ownership: 'PROJECT', runtimeType: 'Example', packageName: '' } }
    const array: TraceEvent = { eventId: 'array', seq: 1, source: null, label: 'array', importance: 'major',
      type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 2, elementType: 'int', metadata: { ownership: 'PROJECT', runtimeType: 'int[]', packageName: '' }, elements: [{ kind: 'primitive', javaType: 'int', value: 1 }] }
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
    const builder = createLayoutEngine()
    for (let cursor = 0; cursor <= full.events.length; cursor++) {
      builder.append(full.events.slice(0, cursor))
      const expected = createLayout({ ...full, events: full.events.slice(0, cursor) })
      expect(builder.state).toEqual(expected)
      expect(JSON.stringify(builder.state)).toBe(JSON.stringify(expected))
    }
  })

  it('preserves old snapshots and shares bodies and region bounds on declaration and value updates', () => {
    const source = loadRecursionTrace(), engine = createLayoutEngine()
    const declaration = source.events.findIndex(event => event.type === 'DECLARE_LOCAL')
    expect(declaration).toBeGreaterThan(0)
    const events = source.events.slice(0, declaration)
    engine.append(events)
    const before = engine.state, frozen = JSON.stringify(before)
    const declare = source.events[declaration]
    if (declare.type !== 'DECLARE_LOCAL') throw new Error('Expected declaration')
    events.push(declare); engine.append(events)
    const after = engine.state
    expect(after).toEqual(createLayout({ ...source, events }))
    expect(JSON.stringify(before)).toBe(frozen)
    expect(after.anchors[declare.frameId].position).toBe(before.anchors[declare.frameId].position)
    expect(after.anchors[declare.frameId].size).toBe(before.anchors[declare.frameId].size)
    expect(after.anchors[declare.frameId].ports).not.toBe(before.anchors[declare.frameId].ports)
    expect(after.regions.stack).toBe(before.regions.stack)
    const unrelated = Object.keys(before.anchors).find(id => id !== declare.frameId)
    if (unrelated) expect(after.anchors[unrelated]).toBe(before.anchors[unrelated])
    expect(engine.state).toBe(after)
    events.push({ eventId: 'layout-line', seq: events.length, source: null, importance: 'normal', label: 'line', type: 'LINE_EXECUTE', frameId: declare.frameId })
    engine.append(events)
    expect(engine.state.anchors).toBe(after.anchors)
    expect(engine.state.placement).toBe(after.placement)
    expect(engine.state.regions.stack).toBe(after.regions.stack)
    expect(JSON.stringify(after)).toBe(JSON.stringify(createLayout({ ...source, events })))
  })

  it('does not revisit prior semantic events on stable trace growth', () => {
    const source = loadPersonTrace()
    const trace = { ...source, capture, events: source.events.slice(0, 8) }
    const engine = createLayoutEngine(); engine.append(trace.events)
    const first = engine.state
    // Cache boundary reads are permitted; all earlier interior reads fail.
    for (let index = 1; index < trace.events.length - 1; index++) {
      Object.defineProperty(trace.events, index, { get() { throw new Error('Rescanned prior semantic prefix') }, configurable: true })
    }
    trace.events.push(source.events[8])
    engine.append(trace.events)
    const result = engine.state
    expect(result).toEqual(createLayout({ ...source, capture, events: source.events.slice(0, 9) }))
    expect(first.anchors).not.toBeUndefined()
  })

  it('rejects truncation of accepted history and starts replacement recordings with a fresh engine', () => {
    for (const source of [loadPersonTrace(), loadRecursionTrace(), loadArrayTrace(), loadControlTrace()]) {
      const engine = createLayoutEngine(); engine.append(source.events.slice(0, 10))
      const retained = engine.state, saved = JSON.stringify(retained)
      expect(() => engine.append(source.events.slice(0, 2))).toThrow('cannot discard accepted events')
      expect(() => engine.append(source.events, 0)).toThrow('Layout append expected')
      expect(engine.state).toBe(retained)
      const replacement = createLayoutEngine()
      for (let cursor = 0; cursor <= source.events.length; cursor++) {
        const events = source.events.slice(0, cursor).map(event => ({ ...event }))
        replacement.append(events)
        expect(replacement.state).toEqual(createLayout({ ...source, events }))
      }
      expect(JSON.stringify(retained)).toBe(saved)
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
      add({ ...allocation, objectId: `object:${index}`, displayId: index + 1, fields: Array.from({ length: index }, (_, field) => ({
        id: `field:${index}:${field}`, name: `field${field}`, javaType: 'int', value: { kind: 'uninitialized' },
      })) })
      if (index % 3 === 0) add({ eventId: '', seq: 0, source: null, label: 'array', importance: 'major',
        type: 'ALLOCATE_ARRAY', objectId: `array:${index}`, displayId: 100 + index, elementType: 'int',
        elements: Array.from({ length: index }, () => ({ kind: 'primitive', javaType: 'int', value: 1 })) })
    }
    const builder = createLayoutEngine()
    const trace = { ...source, capture, events: [] as TraceEvent[] }
    for (const event of events) {
      const prior = JSON.stringify(builder.state)
      const retained = builder.state
      trace.events.push(event)
      builder.append(trace.events)
      expect(JSON.stringify(builder.state)).toBe(JSON.stringify(createLayout(trace)))
      expect(JSON.stringify(retained)).toBe(prior)
    }
  })
})
