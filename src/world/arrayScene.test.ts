import { describe, expect, it } from 'vitest'
import { seek } from '../runtime'
import { arrayElementSlotId } from '../contracts/runtime'
import { loadArrayTrace } from '../examples/traces'
import { projectTrace } from '../testing/projectTrace'
import { planPresentation } from './presentationPlanner'
import { presentedFlowPorts } from './flowTopology'
import { faceRows, faceRowPort } from './faceRows'

const trace = loadArrayTrace(), projection = projectTrace(trace), layout = projection.layout
const allocation = trace.events.find(event => event.type === 'ALLOCATE_ARRAY')!
if (allocation.type !== 'ALLOCATE_ARRAY') throw new Error('Array fixture required')
const objectId = allocation.objectId

describe('array spatial identity through the production projection', () => {
  it('reserves equal cuboids and unique indexed anchors before execution', () => {
    const other = projectTrace(trace).layout
    expect(JSON.stringify(other)).toBe(JSON.stringify(layout))
    const cells = allocation.elements.map((_, index) => layout.anchors[arrayElementSlotId(objectId, index)])
    expect(cells).toHaveLength(5)
    expect(new Set(cells.map(cell => cell.position[0])).size).toBe(5)
    expect(new Set(cells.map(cell => JSON.stringify(cell.size))).size).toBe(1)
    expect(cells.every(cell => cell.size.every(axis => axis > 0))).toBe(true)
    expect(layout.anchors[objectId].size[0]).toBeGreaterThan(cells[0].size[0])
    expect(projection.project(allocation.seq).entities[objectId]).toBeUndefined()
  })

  it('keeps IDs, raw values, references and canonical cell coordinates across every seek and LOD', () => {
    const before = JSON.stringify(layout)
    for (const cursor of Array.from({ length: trace.events.length + 1 }, (_, index) => index).reverse()) {
      const state = seek(trace, cursor), scene = projection.project(cursor), node = scene.entities[objectId]
      if (!node) { expect(state.objects[objectId]).toBeUndefined(); continue }
      if (node.kind !== 'array') throw new Error('Expected array')
      const actual = state.objects[objectId].array!
      expect(node.id).toBe(objectId)
      expect(node.cells.map(cell => cell.slotId)).toEqual(actual.elements.map((_, index) => arrayElementSlotId(objectId, index)))
      expect(node.cells.map(cell => cell.value.exact)).toEqual(actual.elements.map(cell => cell.value.kind === 'primitive' ? String(cell.value.value) : 'uninitialized'))
      const rawReferences=Object.values(state.frames).flatMap(frame=>Object.values(frame.locals).flatMap(slot=>slot.value.kind==='reference'?[[slot.id,slot.value.objectId]]:[]))
      expect(scene.references.map(ref=>[ref.sourceSlotId,ref.targetId]).sort()).toEqual(rawReferences.sort())
      expect(node.anchor).toBe(layout.anchors[objectId])
      const activity = state.arrayActivity?.objectId === objectId ? state.arrayActivity : null
      expect(node.activity).toEqual(activity && activity.kind !== 'compare' ? { kind: activity.kind, index: activity.index } : null)
      // Comparison facts remain in runtime history; the current array face
      // deliberately represents only captured reads and writes.
      if (activity?.kind === 'compare') expect(trace.events.slice(0, cursor).some(event => event.eventId === activity.eventId)).toBe(true)
      for (const detailLevel of ['FAR', 'MEDIUM', 'CLOSE'] as const) {
        const plan = planPresentation({ scene, layout, detailLevel, selection: { kind: 'object', id: objectId }, focusTargetId: objectId, trace: { active: false, scope: 'relevant' } })
        const window = plan.cellWindows.get(objectId)!, port = presentedFlowPorts(scene, plan.entities, plan.cellWindows)
        expect(window.visible).toEqual([0, 1, 2, 3, 4])
        for (const cell of node.cells) {
          expect(window.mapping.get(cell.slotId)!.anchor.position).toEqual(layout.anchors[cell.slotId].position)
          expect(port({ kind: 'slot', id: cell.slotId })!.point).toEqual(layout.anchors[cell.slotId].bodyPort)
        }
        expect(scene.references.map(ref => ref.id)).toEqual(projection.project(cursor).references.map(ref => ref.id))
        expect(scene.entities[objectId]).toBe(node)
      }
    }
    expect(JSON.stringify(layout)).toBe(before)
  })

  it('preserves each lexical slot through repeated swaps and maps requested captured locals to distinct face rows', () => {
    const declarations = trace.events.filter(event => event.type === 'DECLARE_LOCAL').map(event => event.type === 'DECLARE_LOCAL' ? event.slot.id : '')
    const lexical = [...new Set(declarations)]
    expect(lexical).toHaveLength(4)
    expect(declarations.length).toBeGreaterThan(lexical.length)
    const before = JSON.stringify(layout)
    for (let cursor = 0; cursor <= trace.events.length; cursor++) {
      const scene = projection.project(cursor)
      for (const id of scene.order.frames) {
        const frame = scene.entities[id]
        if (frame.kind !== 'frame') throw new Error('Expected frame')
        for (const row of frame.rows) {
          expect(lexical).toContain(row.slotId)
          const plan = planPresentation({ scene, layout, detailLevel: 'CLOSE', selection: { kind: 'slot', id: row.slotId }, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
          const cut = plan.entities.get(id)!, rows = faceRows(frame, cut).visible
          expect(rows.some(item => item.slotId === row.slotId)).toBe(true)
          const ports = rows.map(item => faceRowPort(frame, cut, item.slotId)!)
          expect(new Set(ports.map(port => port[1])).size).toBe(rows.length)
          expect(rows.every(item => frame.rows.some(captured=>captured.slotId===item.slotId))).toBe(true)
          expect(frame.anchor).toBe(layout.anchors[id])
        }
      }
    }
    expect(JSON.stringify(layout)).toBe(before)
  })
})
