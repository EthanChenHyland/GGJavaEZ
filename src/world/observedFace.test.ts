import { describe, expect, it } from 'vitest'
import type { RuntimeSlot, TraceDocument, TraceEvent } from '../contracts/runtime'
import { applyEvent, createInitialState } from '../runtime/state'
import { buildSceneModel } from './sceneModel'
import { createLayout, createLayoutBuilder } from './layout'
import { objectFaceRowCount } from './objectFace'

describe('bounded observed heap faces', () => {
  it('adds face ports without moving identities or resizing boxes, with batch/live equivalence', () => {
    const field = (index: number): RuntimeSlot => ({ id: `list:summary:item:${index}`, name: `[${index}]`, javaType: 'java.lang.Object', value: { kind: 'reference', javaType: 'java.lang.Object', objectId: 'target' } })
    const data = [
      { type: 'PROGRAM_START' },
      { type: 'ALLOCATE_OBJECT', objectId: 'target', displayId: 1, className: 'Target', fields: [] },
      { type: 'ALLOCATE_OBJECT', objectId: 'list', displayId: 2, className: 'java.util.ArrayList', fields: [] },
      { type: 'OBJECT_OBSERVE', objectId: 'list', fields: [field(0)], replaceFields: true },
      { type: 'OBJECT_OBSERVE', objectId: 'list', fields: Array.from({ length: 32 }, (_, index) => field(index)), replaceFields: true },
      { type: 'OBJECT_OBSERVE', objectId: 'list', fields: [], replaceFields: true },
    ]
    const events = data.map((item, seq) => ({ ...item, seq, eventId: `e:${seq}`, source: null, label: 'observed', importance: 'quiet' })) as TraceEvent[]
    const trace: TraceDocument = { schemaVersion: 2, demoId: 'generic', sourceFiles: [], events }
    const builder = createLayoutBuilder()
    let runtime = createInitialState()
    const initial = createLayout({ ...trace, events: events.slice(0, 3) }).anchors.list
    for (let index = 0; index < events.length; index++) {
      builder.append(events.slice(index, index + 1))
      runtime = applyEvent(runtime, events[index])
      expect(JSON.stringify(builder.state)).toBe(JSON.stringify(createLayout({ ...trace, events: events.slice(0, index + 1) })))
      const anchor = builder.state.anchors.list
      if (!anchor) continue
      expect(anchor.position).toEqual(initial.position)
      expect(anchor.size).toEqual(initial.size)
      const count = objectFaceRowCount(anchor.size[1], Object.keys(runtime.objects.list.fields).length)
      const scene = buildSceneModel(runtime, builder.state, 'micro')
      expect(scene.references.length).toBe(count)
      for (const edge of scene.references) {
        expect(edge.from[1]).toBeGreaterThan(anchor.position[1] - anchor.size[1] / 2)
        expect(edge.fromFace![2]).toBeGreaterThan(anchor.position[2] + anchor.size[2] / 2)
      }
    }
  })
  it('attaches a reference-array connector to its actual cell geometry', () => {
    const data = [
      { type: 'PROGRAM_START' },
      { type: 'ALLOCATE_OBJECT', objectId: 'target', displayId: 1, className: 'Target', fields: [] },
      { type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 2, className: 'Target[]', elementType: 'Target', length: 1, observed: true,
        elements: [{ kind: 'reference', javaType: 'Target', objectId: 'target' }] },
    ]
    const events = data.map((item, seq) => ({ ...item, seq, eventId: `e:${seq}`, source: null, label: 'observed', importance: 'quiet' })) as TraceEvent[]
    const trace: TraceDocument = { schemaVersion: 2, demoId: 'generic', sourceFiles: [], events }
    const layout = createLayout(trace)
    const runtime = events.reduce(applyEvent, createInitialState())
    const scene = buildSceneModel(runtime, layout, 'micro')
    const cell = scene.objects.find(object => object.id === 'array')!.array!.cells[0].anchor!
    expect(scene.references).toHaveLength(1)
    expect(scene.references[0].from).toEqual(cell.bodyPort)
    expect(scene.references[0].fromFace![2]).toBeCloseTo(cell.position[2] + cell.size[2] / 2 + 0.055)
  })

})
