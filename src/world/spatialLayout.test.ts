import { describe, expect, it } from 'vitest'
import type { TraceEvent, TraceDocument, RuntimeSlot } from '../contracts/runtime'
import { arrayElementSlotId } from '../contracts/runtime'
import { createLayoutEngine } from './layoutEngine'
import { projectTrace } from '../testing/projectTrace'
import { planPresentation } from './presentationPlanner'
import { faceRows,faceRowPort } from './faceRows'
import { computeArrayWindow } from './arrayWindow'
import { world } from '../theme/tokens'

const base = { eventId: '', seq: 0, source: null, label: 'Explicit observed unit fixture', importance: 'major' as const }
const local = (id: string): RuntimeSlot => ({ id, name: id, javaType: 'int', value: { kind: 'primitive', javaType: 'int', value: 1 } })
const enter = (id: string, caller: string | null): TraceEvent => ({ ...base, type: 'ENTER_METHOD', frameId: id, callerFrameId: caller, className: 'app.Program', methodName: 'work', locals: [], returnType: 'int' })
const traceOf = (events: TraceEvent[]): TraceDocument => ({ schemaVersion: 2, demoId: 'unit/spatial-contract', sourceFiles: [], events: [{ ...base, type: 'PROGRAM_START' } as TraceEvent, ...events].map((event, seq) => ({ ...event, seq, eventId: `e${seq}` })) })
const allocation = (id: string, type: string, fields = 2): TraceEvent => ({ ...base, type: 'ALLOCATE_OBJECT', objectId: id, displayId: id === 'a' ? 1 : id === 'b' ? 2 : 3, className: type, metadata: { ownership: 'PROJECT', runtimeType: type, packageName: 'app' }, fields: Array.from({ length: fields }, (_, index) => local(`${id}:field:${index}`)) })
const createLayout = (trace: TraceDocument) => { const engine = createLayoutEngine(); engine.append(trace.events); return engine.state }
const cut = (trace: TraceDocument, selection: { kind: 'slot'; id: string } | null = null) => {
  const projection = projectTrace(trace), scene = projection.project(trace.events.length)
  return { scene, layout: projection.layout, plan: planPresentation({ scene, layout: projection.layout, detailLevel: 'CLOSE', selection, focusTargetId: null, trace: { active: false, scope: 'relevant' } }) }
}

describe('persistent production runtime geography', () => {
  it('keeps source-observed scalar summaries on a rear shelf without displacing the first project object', () => {
    const string = (id: string, fields: number): TraceEvent => ({
      ...allocation(id, 'java.lang.String', fields),
      source: { fileId: 'Unit.java', line: 1 },
      metadata: { ownership: 'JDK', runtimeType: 'java.lang.String', packageName: 'java.lang' },
    } as TraceEvent)
    const project = allocation('a', 'app.A')
    const solo = createLayout(traceOf([project]))
    const {anchors} = createLayout(traceOf([string('summary1', 5), string('summary2', 1), project]))
    expect(anchors.a.position).toEqual(solo.anchors.a.position)
    expect(anchors.summary1.position[2]).toBeLessThan(anchors.a.position[2])
    expect(anchors.summary2.position[1] + anchors.summary2.size[1] / 2).toBeLessThan(anchors.summary1.position[1] - anchors.summary1.size[1] / 2)
  })
  it('places first descendants downward and toward the camera from their recorded caller and siblings on nonoverlapping depth decks', () => {
    const trace = traceOf([enter('root', null), enter('left', 'root'), enter('deep', 'left'), enter('right', 'root')])
    const layout = createLayout(trace)
    for (const [parent, child] of [['root', 'left'], ['left', 'deep']]) {
      const a = layout.anchors[parent], b = layout.anchors[child]
      expect(b.position[1] + b.size[1] / 2).toBeLessThan(a.position[1] + a.size[1] / 2)
      expect(b.position[2] - b.size[2] / 2).toBeGreaterThan(a.position[2] + a.size[2] / 2)
    }
    const left = layout.anchors.left, right = layout.anchors.right
    expect(right.position[1] + right.size[1] / 2).toBe(left.position[1] + left.size[1] / 2)
    expect(right.position[2] - left.position[2]).toBeGreaterThanOrEqual(world.frame.depth + world.frame.deckGapZ - 1e-8)
    expect(layout.anchors.deep.position[0]).toBe(left.position[0])
    expect(layout.placement.right.callerId).toBe('root')
  })
  it('groups captured types in append-only shelves and bounds face fields without losing runtime values', () => {
    const trace = traceOf([enter('root', null), allocation('a', 'app.A', 20), allocation('b', 'app.B'), allocation('c', 'app.A')])
    const { layout, scene, plan } = cut(trace)
    expect(layout.anchors.a.position[0]).toBe(layout.anchors.c.position[0])
    expect(layout.anchors.a.position[0]).not.toBe(layout.anchors.b.position[0])
    expect(Object.keys(layout.anchors.a.ports)).toHaveLength(13)
    const node = scene.entities.a
    if (node.kind !== 'object') throw new Error('Expected captured object')
    expect(node.groups.flatMap(group => group.rows)).toHaveLength(20)
    expect(faceRows(node, plan.entities.get('a')!).visible).toHaveLength(12)
    const builder = createLayoutEngine()
    for (let cursor = 1; cursor <= trace.events.length; cursor++) {
      const before = builder.state, snapshot = JSON.stringify(before)
      builder.append(trace.events.slice(0, cursor))
      expect(JSON.stringify(before)).toBe(snapshot)
      for (const anchor of Object.values(before.anchors)) {
        expect(builder.state.anchors[anchor.entityId].position).toBe(anchor.position)
        expect(builder.state.anchors[anchor.entityId].size).toBe(anchor.size)
      }
    }
    expect(builder.state).toEqual(layout)
  })
  it('maps 32 captured cells into physical rows and presents exact sparse index 999 without moving the array', () => {
    const allocate: TraceEvent = { ...base, type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 2, elementType: 'int', observed: true, length: 1000,
      metadata: { ownership: 'PROJECT', runtimeType: 'int[]', packageName: '' }, elements: Array.from({ length: 32 }, () => ({ kind: 'primitive', javaType: 'int', value: 0 })) }
    const observe: TraceEvent = { ...base, type: 'OBJECT_OBSERVE', objectId: 'array', arrayElements: [{ index: 999, value: { kind: 'primitive', javaType: 'int', value: 7 } }] }
    const prefix = traceOf([enter('root', null), allocate]), trace = traceOf([enter('root', null), allocate, observe])
    const before = cut(prefix), after = cut(trace, { kind: 'slot', id: arrayElementSlotId('array', 999) })
    expect(after.layout.anchors.array).toEqual(before.layout.anchors.array)
    expect(after.layout.anchors[arrayElementSlotId('array', 999)]).toBeUndefined()
    const window = computeArrayWindow({ recordingId: prefix.demoId, arrayId: 'array', recordedLength: 1000, anchor: before.layout.anchors.array, requestedIndices: Array.from({ length: 32 }, (_, index) => index), nominalCellBudget: 48 })
    const cells = Array.from({ length: 32 }, (_, index) => window.mapping.get(arrayElementSlotId('array', index))!)
    expect(new Set(cells.map(cell => cell.anchor.position.join(','))).size).toBe(32)
    expect(cells[16].anchor.position[1]).toBeLessThan(cells[0].anchor.position[1])
    const mapped = after.plan.cellWindows.get('array')!.mapping.get(arrayElementSlotId('array', 999))!
    expect(mapped.index).toBe(999)
    const node = after.scene.entities.array
    if (node.kind !== 'array') throw new Error('Expected array')
    expect(node.cells.at(-1)?.index).toBe(999)
    expect(node.cells.at(-1)?.value.exact).toBe('7')
    expect(node.length).toBe(1000)
  })
  it('keeps sparse observations inside their reserved array volume without intersecting earlier or future arrays', () => {
    const array = (id: string): TraceEvent => ({ ...base, type: 'ALLOCATE_ARRAY', objectId: id, displayId: id === 'a' ? 1 : id === 'b' ? 2 : 3,
      elementType: 'int', observed: true, length: 1000, metadata: { ownership: 'PROJECT', runtimeType: 'int[]', packageName: '' }, elements: [{ kind: 'primitive', javaType: 'int', value: 0 }] })
    const observation: TraceEvent = { ...base, type: 'OBJECT_OBSERVE', objectId: 'a', arrayElements: Array.from({ length: 24 }, (_, i) => ({ index: 900 + i, value: { kind: 'primitive', javaType: 'int', value: i } })) }
    const before = createLayout(traceOf([enter('root', null), array('a'), array('b')]))
    const { layout: complete, scene } = cut(traceOf([enter('root', null), array('a'), array('b'), observation, array('c')]))
    for (const id of ['a', 'b']) expect(complete.anchors[id]).toEqual(before.anchors[id])
    const solids = ['a', 'b', 'c'].map(id => complete.anchors[id])
    for (let i = 0; i < solids.length; i++) for (const other of solids.slice(i + 1)) {
      const solid = solids[i], gap = Math.max(...[0, 1, 2].map(axis => Math.abs(solid.position[axis] - other.position[axis]) - (solid.size[axis] + other.size[axis]) / 2))
      expect(gap).toBeGreaterThanOrEqual(world.object.tierGap - 1e-8)
    }
    const anchor = complete.anchors.a
    const window = computeArrayWindow({ recordingId: scene.recordingId, arrayId: 'a', recordedLength: 1000, anchor, requestedIndices: Array.from({ length: 24 }, (_, index) => 900 + index), nominalCellBudget: 48 })
    const sparse = Array.from({ length: 24 }, (_, index) => window.mapping.get(arrayElementSlotId('a', 900 + index))!)
    expect(new Set(sparse.map(cell => cell.anchor.position.join(','))).size).toBe(24)
    for (const cell of sparse) for (const axis of [0, 1, 2]) {
      expect(Math.abs(cell.anchor.position[axis] - anchor.position[axis]) + cell.anchor.size[axis] / 2).toBeLessThanOrEqual(anchor.size[axis] / 2 + 1e-8)
    }
    const node = scene.entities.a
    if (node.kind !== 'array') throw new Error('Expected array')
    expect(node.cells).toHaveLength(25)
  })
  it('projects written static storage and its reference as a distinct class identity through every LOD', () => {
    const reference = { kind: 'reference' as const, javaType: 'app.A', objectId: 'a' }
    const event: TraceEvent = { ...base, type: 'CLASS_OBSERVE', classId: 'jvm:class:app.Program', className: 'app.Program', initialization: 'observed',
      fields: [{ id: 'static:shared', name: 'shared', javaType: 'app.A', value: reference }] }
    const write: TraceEvent = { ...base, type: 'SET_STATIC', classId: event.classId, slotId: 'static:shared', value: reference }
    const trace = traceOf([enter('root', null), allocation('a', 'app.A'), event, write]), { scene, layout } = cut(trace)
    expect(scene.entities[event.classId].kind).toBe('class')
    expect(scene.entities[event.classId].anchor.region).toBe('class')
    expect(Object.values(scene.entities).filter(node => node.kind === 'object').map(node => node.id)).toEqual(['a'])
    expect(scene.references[0].sourceId).toBe(event.classId)
    expect(scene.references[0].sourceSlotId).toBe('static:shared')
    for (const detailLevel of ['FAR', 'MEDIUM', 'CLOSE'] as const) {
      const plan = planPresentation({ scene, layout, detailLevel, selection: { kind: 'reference', id: scene.references[0].id }, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
      expect(plan.entities.get(event.classId)?.pinned).toBe(true)
      expect(scene.entities[event.classId].anchor).toBe(layout.anchors[event.classId])
      if (detailLevel === 'FAR') expect(plan.referencePresentation.unavailable.map(item => item.id)).toContain(scene.references[0].id)
      else expect(plan.curves.find(curve => curve.id === scene.references[0].id)?.points[0]).toEqual(faceRowPort(scene.entities[event.classId],plan.entities.get(event.classId)!,'static:shared'))
    }
  })
})
