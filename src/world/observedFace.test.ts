import { describe, expect, it } from 'vitest'
import type { RuntimeSlot, TraceDocument, TraceEvent } from '../contracts/runtime'
import { arrayElementSlotId } from '../contracts/runtime'
import { seek } from '../runtime'
import { projectTrace } from '../testing/projectTrace'
import { createLayoutEngine } from './layoutEngine'
import { planPresentation } from './presentationPlanner'
import { faceRows, faceRowPort } from './faceRows'
import { presentedFlowPorts } from './flowTopology'

const fixture = (data: readonly object[]): TraceDocument => ({ schemaVersion: 2, demoId: 'unit/observed-faces', sourceFiles: [],
  events: data.map((item, seq) => ({ ...item, seq, eventId: `unit/observed/${seq}`, source: null, label: 'Explicit observed unit fixture', importance: 'quiet' })) as TraceEvent[] })

describe('bounded captured heap faces through the production cut', () => {
  it('adds recorded ports without moving identities or resizing boxes, retains every semantic reference and matches batch/live geometry', () => {
    const field = (index: number): RuntimeSlot => ({ id: `list:summary:item:${index}`, name: `[${index}]`, javaType: 'java.lang.Object', value: { kind: 'reference', javaType: 'java.lang.Object', objectId: 'target' } })
    const trace = fixture([
      { type: 'PROGRAM_START' },
      { type: 'ALLOCATE_OBJECT', objectId: 'target', displayId: 1, className: 'Target', fields: [] },
      { type: 'ALLOCATE_OBJECT', objectId: 'list', displayId: 2, className: 'java.util.ArrayList', fields: [] },
      { type: 'OBJECT_OBSERVE', objectId: 'list', fields: [field(0)], replaceFields: true },
      { type: 'OBJECT_OBSERVE', objectId: 'list', fields: Array.from({ length: 32 }, (_, index) => field(index)), replaceFields: true },
      { type: 'OBJECT_OBSERVE', objectId: 'list', fields: [], replaceFields: true },
    ])
    const projection = projectTrace(trace), initial = projection.layout.anchors.list, builder = createLayoutEngine()
    for (let cursor = 1; cursor <= trace.events.length; cursor++) {
      builder.append(trace.events.slice(0, cursor))
      const batch = createLayoutEngine(); batch.append(trace.events.slice(0, cursor))
      expect(JSON.stringify(builder.state)).toBe(JSON.stringify(batch.state))
      const anchor = builder.state.anchors.list
      if (!anchor) continue
      expect(anchor.position).toEqual(initial.position); expect(anchor.size).toEqual(initial.size)
      const state = seek(trace, cursor), scene = projection.project(cursor), node = scene.entities.list
      expect(scene.references).toHaveLength(Object.keys(state.objects.list.fields).length)
      if (node.kind !== 'object') throw new Error('Raw field capture must not invent a collection summary')
      expect(node.fieldCount).toBe(Object.keys(state.objects.list.fields).length)
      const plan = planPresentation({ scene, layout: projection.layout, detailLevel: 'CLOSE', selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
      const face = faceRows(node, plan.entities.get(node.id)!), drawable = plan.curves.filter(curve => curve.kind === 'connector')
      expect(drawable).toHaveLength(face.visible.length)
      expect(plan.referencePresentation.counts.current).toBe(scene.references.length)
      expect(plan.referencePresentation.counts.unavailable).toBe(scene.references.length - face.visible.length)
      for (const curve of drawable) {
        const reference = scene.references.find(reference => reference.id === curve.id)!
        expect(curve.points[0]).toEqual(faceRowPort(node, plan.entities.get(node.id)!, reference.sourceSlotId))
        expect(curve.points[0][1]).toBeGreaterThan(anchor.position[1] - anchor.size[1] / 2)
        expect(curve.points[0][2]).toBeGreaterThan(anchor.position[2] + anchor.size[2] / 2)
      }
    }
    expect(projection.project(5).references).toHaveLength(32)
    expect(projection.project(6).references).toEqual([])
    expect(projection.project(5).references).toHaveLength(32)
  })

  it('attaches a captured reference-array connector to its actual mapped cell geometry', () => {
    const trace = fixture([
      { type: 'PROGRAM_START' },
      { type: 'ALLOCATE_OBJECT', objectId: 'target', displayId: 1, className: 'Target', fields: [] },
      { type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 2, className: 'Target[]', elementType: 'Target', length: 1, observed: true,
        elements: [{ kind: 'reference', javaType: 'Target', objectId: 'target' }] },
    ])
    const projection = projectTrace(trace), scene = projection.project(trace.events.length)
    const plan = planPresentation({ scene, layout: projection.layout, detailLevel: 'CLOSE', selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
    const slot = arrayElementSlotId('array', 0), cell = plan.cellWindows.get('array')!.mapping.get(slot)!
    expect(scene.references).toHaveLength(1)
    const curve = plan.curves.find(curve => curve.id === scene.references[0].id)!
    expect(curve).toBeDefined()
    expect(curve.points[0]).toEqual(cell.port)
    expect(curve.sourceAnchor).toBe(cell.anchor)
    expect(presentedFlowPorts(scene, plan.entities, plan.cellWindows)({ kind: 'slot', id: slot })!.point).toEqual(cell.port)
    expect(cell.anchor.position).toEqual(projection.layout.anchors[slot].position)
    const target=scene.entities.target.anchor
    expect(curve.destinationAnchor).toBe(target)
    expect(curve.points.at(-1)).toEqual([target.position[0]+target.size[0]/2+.06,target.position[1],target.position[2]])
  })
})
