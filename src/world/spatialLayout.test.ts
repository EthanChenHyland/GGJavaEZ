import { describe, expect, it } from 'vitest'
import type { TraceEvent, TraceDocument, RuntimeSlot } from '../contracts/runtime'
import { createLayout, createLayoutBuilder } from './layout'
import { buildSceneModel } from './sceneModel'
import { seek } from '../runtime'

const base = { eventId: '', seq: 0, source: null, label: 'observed', importance: 'major' as const }
const local = (id: string): RuntimeSlot => ({ id, name: id, javaType: 'int', value: { kind: 'primitive', javaType: 'int', value: 1 } })
const enter = (id: string, caller: string | null): TraceEvent => ({ ...base, type: 'ENTER_METHOD', frameId: id, callerFrameId: caller, className: 'app.Program', methodName: 'work', locals: [], returnType: 'int' })
const traceOf = (events: TraceEvent[]): TraceDocument => ({ schemaVersion: 2, demoId: 'spatial-contract', sourceFiles: [], events: [{ ...base, type: 'PROGRAM_START' } as TraceEvent, ...events].map((event, seq) => ({ ...event, seq, eventId: `e${seq}` })) })
const allocation = (id: string, type: string, fields = 2): TraceEvent => ({ ...base, type: 'ALLOCATE_OBJECT', objectId: id, displayId: id === 'a' ? 1 : id === 'b' ? 2 : 3, className: type, fields: Array.from({ length: fields }, (_, index) => local(`${id}:field:${index}`)) })

describe('Spatial 2.0 persistent runtime geography', () => {
  it('places descendants below and behind their actual caller; siblings do not overlap', () => {
    const trace = traceOf([enter('root', null), enter('left', 'root'), enter('deep', 'left'), enter('right', 'root')])
    const layout = createLayout(trace)
    expect(layout.layoutKind).toBe('spatial2')
    for (const [parent, child] of [['root', 'left'], ['left', 'deep'], ['root', 'right']]) {
      const a = layout.anchors[parent], b = layout.anchors[child]
      expect(b.position[1]).toBeLessThan(a.position[1] - (a.size[1] + b.size[1]) / 2)
      expect(b.position[2]).toBeLessThan(a.position[2])
    }
    expect(Math.abs(layout.anchors.left.position[0] - layout.anchors.right.position[0])).toBeGreaterThan(layout.anchors.left.size[0])
    expect(layout.anchors.deep.position[0]).toBe(layout.anchors.left.position[0])
  })
  it('groups actual types in append-only shelves and bounds face fields without losing runtime values', () => {
    const trace = traceOf([enter('root', null), allocation('a', 'app.A', 20), allocation('b', 'app.B'), allocation('c', 'app.A')])
    const layout = createLayout(trace)
    expect(layout.anchors.a.position[0]).toBe(layout.anchors.c.position[0])
    expect(layout.anchors.a.position[0]).not.toBe(layout.anchors.b.position[0])
    expect(Object.keys(layout.anchors.a.ports)).toHaveLength(6)
    const scene = buildSceneModel(seek(trace, trace.events.length), layout, 'micro')
    expect(scene.objects.find(node => node.id === 'a')?.fields).toHaveLength(20)
    const builder = createLayoutBuilder()
    for (const event of trace.events) {
      const before = builder.state, snapshot = JSON.stringify(before)
      builder.append([event])
      expect(JSON.stringify(before)).toBe(snapshot)
      for (const anchor of Object.values(before.anchors)) {
        expect(builder.state.anchors[anchor.entityId].position).toEqual(anchor.position)
        expect(builder.state.anchors[anchor.entityId].size).toEqual(anchor.size)
      }
    }
    expect(builder.state).toEqual(layout)
  })
  it('wraps 32 observed array cells into physical rows and appends an exact sparse index without moving prefix cells', () => {
    const allocate: TraceEvent = { ...base, type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 2, elementType: 'int', observed: true, length: 1000,
      elements: Array.from({ length: 32 }, () => ({ kind: 'primitive', javaType: 'int', value: 0 })) }
    const observe: TraceEvent = { ...base, type: 'OBJECT_OBSERVE', objectId: 'array', arrayElements: [{ index: 999, value: { kind: 'primitive', javaType: 'int', value: 7 } }] }
    const trace = traceOf([enter('root', null), allocate, observe]), layout = createLayout(trace)
    const prefix = createLayout(traceOf([enter('root', null), allocate]))
    const ids = Array.from({ length: 32 }, (_, index) => `array:element:${index}`)
    expect(new Set(ids.map(id => layout.anchors[id].position.join(','))).size).toBe(32)
    expect(layout.anchors[ids[8]].position[1]).toBeLessThan(layout.anchors[ids[0]].position[1])
    for (const id of ids) expect(layout.anchors[id]).toEqual(prefix.anchors[id])
    expect(layout.anchors['array:element:999']).toBeDefined()
    const scene = buildSceneModel(seek(trace, trace.events.length), layout, 'micro')
    expect(scene.objects[0].array?.cells.at(-1)?.index).toBe(999)
    expect(scene.objects[0].array?.length).toBe(1000)
  })
  it('reserves late sparse observations without intersecting earlier or future arrays', () => {
    const array = (id: string): TraceEvent => ({ ...base, type: 'ALLOCATE_ARRAY', objectId: id, displayId: 2,
      elementType: 'int', observed: true, length: 1000, elements: [{ kind: 'primitive', javaType: 'int', value: 0 }] })
    const observation: TraceEvent = { ...base, type: 'OBJECT_OBSERVE', objectId: 'a', arrayElements: Array.from({ length: 24 }, (_, i) => ({ index: 900 + i, value: { kind: 'primitive', javaType: 'int', value: i } })) }
    const before = createLayout(traceOf([enter('root', null), array('a'), array('b')]))
    const complete = createLayout(traceOf([enter('root', null), array('a'), array('b'), observation, array('c')]))
    for (const id of ['a', 'b', 'a:element:0', 'b:element:0']) {
      expect(complete.anchors[id].position).toEqual(before.anchors[id].position)
      expect(complete.anchors[id].size).toEqual(before.anchors[id].size)
      for (const [slot, port] of Object.entries(before.anchors[id].ports)) expect(complete.anchors[id].ports[slot]).toEqual(port)
    }
    const solids = ['a', 'b', 'c', ...Array.from({ length: 24 }, (_, i) => `a:element:${900 + i}`)].map(id => complete.anchors[id])
    for (let i = 0; i < solids.length; i++) for (const other of solids.slice(i + 1)) {
      const solid = solids[i]
      const gap = Math.max(...[0, 1, 2].map(axis => Math.abs(solid.position[axis] - other.position[axis]) - (solid.size[axis] + other.size[axis]) / 2))
      expect(gap).toBeGreaterThanOrEqual(0.08 - 1e-8)
    }
  })
  it('projects class storage and its reference as a real distinct class identity', () => {
    const reference = { kind: 'reference' as const, javaType: 'app.A', objectId: 'a' }
    const event: TraceEvent = { ...base, type: 'CLASS_OBSERVE', classId: 'jvm:class:app.Program', className: 'app.Program', initialization: 'observed',
      fields: [{ id: 'static:shared', name: 'shared', javaType: 'app.A', value: reference }] }
    const trace = traceOf([enter('root', null), allocation('a', 'app.A'), event]), layout = createLayout(trace)
    const runtime = seek(trace, trace.events.length), scene = buildSceneModel(runtime, layout, 'micro')
    expect(scene.classes?.[0].id).toBe('jvm:class:app.Program')
    expect(scene.classes?.[0].anchor.region).toBe('class')
    expect(scene.objects.map(node => node.id)).toEqual(['a'])
    expect(scene.references[0].source).toEqual({ kind: 'class', classId: event.classId, slotId: 'static:shared' })
    expect(scene.references[0].from).toEqual(layout.anchors[event.classId].ports['static:shared'])
    expect(buildSceneModel(runtime, layout, 'meso').classes?.[0]).toBe(scene.classes?.[0])
  })
})
