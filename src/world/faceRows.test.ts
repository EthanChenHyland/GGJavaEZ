import { expect, it } from 'vitest'
import fc from 'fast-check'
import type { RuntimeSlot, TraceDocument, TraceEvent } from '../contracts/runtime'
import type { PresentedEntity, SceneFrame } from '../contracts/world'
import { projectTrace } from '../testing/projectTrace'
import { faceRows, faceRowPort } from './faceRows'
import { planPresentation } from './presentationPlanner'
import { presentedFlowPorts } from './flowTopology'
import { buildReferenceTopology } from './referenceTopology'
import { buildSolidBatch } from '../render/SolidBatch'
import { world } from '../theme/tokens'
import { createFlowCatalog } from './flowCatalog'
import { seek } from '../runtime'

function fixture() {
  const slot = (id: string): RuntimeSlot => ({ id, name: id, javaType: 'Node', value: { kind: 'reference', javaType: 'Node', objectId: 'unit/target' } })
  const inputs = [
    { type: 'PROGRAM_START' },
    { type: 'ALLOCATE_OBJECT', objectId: 'unit/target', displayId: 1, className: 'Node', fields: [] },
    { type: 'ENTER_METHOD', frameId: 'unit/frame', callerFrameId: null, className: 'Unit', methodName: 'run', locals: ['a', 'b', 'c'].map(slot) },
    ...Array.from({ length: 20 }, (_, index) => ({ type: 'DECLARE_LOCAL', frameId: 'unit/frame', slot: slot(`late/${index}`) })),
    // End current-storage admission independently of the selection under test.
    { type: 'LINE_EXECUTE', frameId: 'unit/frame' },
  ]
  const events = inputs.map((input, seq) => ({ ...input, seq, eventId: `unit/row/${seq}`, source: input.type === 'LINE_EXECUTE' ? { fileId: 'Unit.java', line: 1 } : null, importance: 'normal', label: 'Explicit unit storage' })) as TraceEvent[]
  const trace: TraceDocument = { schemaVersion: 2, demoId: 'unit/row-window', sourceFiles: [{ fileId: 'Unit.java', name: 'Unit.java', content: '// explicit captured unit line' }], events }
  const projection = projectTrace(trace), scene = projection.project(events.length), frame = scene.entities['unit/frame'] as SceneFrame
  return { projection, scene, frame, trace }
}
const presented: PresentedEntity = { id: 'unit/frame', detail: 'CLOSE', mode: 'detailed', opacity: 1, pinned: true, pickable: true, highlight: null }

it('promotes real captured frame rows into a bounded face without changing canonical geometry (100 runs)', () => {
  const { frame } = fixture(), before = JSON.stringify(frame), capacity = faceRows(frame, presented).visible.length
  expect(capacity).toBe(3)
  fc.assert(fc.property(fc.uniqueArray(fc.integer({ min: 0, max: 19 }), { minLength: 1, maxLength: 20 }), indices => {
    const rowSlotIds = indices.map(index => `late/${index}`), cut = { ...presented, rowSlotIds }, model = faceRows(frame, cut)
    expect(model.visible).toHaveLength(capacity)
    const requested = rowSlotIds.slice(0, capacity)
    for (const id of requested) expect(model.visible.some(row => row.slotId === id)).toBe(true)
    expect(model.visible.map(row => row.slotId)).toEqual(frame.rows.filter(row => model.visible.includes(row)).map(row => row.slotId))
    for (const [index, row] of model.visible.entries()) {
      const port = faceRowPort(frame, cut, row.slotId)!
      expect(port[1]).toBe(frame.anchor.position[1] + frame.anchor.size[1] / 2 - model.header - model.pitch * (index + .5))
      expect(port[1]).toBeGreaterThan(frame.anchor.position[1] - frame.anchor.size[1] / 2 + world.frame.pad)
    }
    for (const row of frame.rows.filter(row => !model.visible.includes(row))) expect(faceRowPort(frame, cut, row.slotId)).toBeNull()
    expect(JSON.stringify(frame)).toBe(before)
    expect(frame.anchor.ports['late/19']).toBeUndefined()
  }), { numRuns: 100 })
})

it('shares promoted slot geometry across face picking, references and transfers at every LOD', () => {
  const { projection, scene, frame } = fixture(), before = JSON.stringify(projection.layout)
  for (const detailLevel of ['FAR', 'MEDIUM', 'CLOSE'] as const) {
    const plan = planPresentation({ scene, layout: projection.layout, detailLevel, selection: { kind: 'slot', id: 'late/19' }, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
    const cut = plan.entities.get(frame.id)!, point = faceRowPort(frame, cut, 'late/19')!
    expect(cut.rowSlotIds).toContain('late/19')
    expect(point).not.toBeNull()
    expect(cut.detail).toBe(detailLevel === 'FAR' ? 'MEDIUM' : detailLevel)
    const parts = buildSolidBatch(scene, plan).filter(solid => solid.pick.kind === 'slot' && solid.pick.id === 'late/19')
    const plate = parts.filter(solid => !solid.part), insets = parts.filter(solid => solid.part)
    expect(plate).toHaveLength(1)
    expect(insets).toHaveLength(2)
    for(const inset of insets){expect(inset.pick).toEqual(plate[0].pick);expect(inset.anchor.position[1]).toBe(point[1]);expect(inset.pickable).toBe(true)}
    expect(plate[0].anchor.position[1]).toBe(point[1])
    expect(plate[0].pickable).toBe(true)
    expect(presentedFlowPorts(scene, plan.entities, plan.cellWindows)({ kind: 'slot', id: 'late/19' })?.point).toEqual(point)
    const reference = scene.references.find(ref => ref.sourceSlotId === 'late/19')!
    const topology = buildReferenceTopology({ scene, entities: plan.entities, clusters: plan.clusters, cellWindows: plan.cellWindows, individualLimit: 0, mandatoryIds: new Set([reference.id]) })
    expect(topology.individual.find(item => item.reference.id === reference.id)?.sourcePoint).toEqual(point)
  }
  expect(JSON.stringify(projection.layout)).toBe(before)
})

it('never admits a future or absent slot request; FAR without a required row keeps all slot ports hidden', () => {
  const { projection, frame } = fixture(), early = projection.project(3).entities[frame.id] as SceneFrame
  const missing = { ...presented, rowSlotIds: ['late/19', 'not recorded'] }
  expect(faceRows(early, missing).visible.map(row => row.slotId)).toEqual(['a', 'b', 'c'])
  expect(faceRowPort(early, missing, 'late/19')).toBeNull()
  expect(faceRows(frame, { ...missing, detail: 'FAR' }).visible).toEqual([])
  expect(faceRowPort(frame, { ...missing, detail: 'FAR' }, 'late/19')).toBeNull()
})

it('reuses equal requested row windows and restores canonical rows when the request ends', () => {
  const { projection, scene, frame } = fixture()
  const input = { scene, layout: projection.layout, detailLevel: 'CLOSE' as const, selection: { kind: 'slot' as const, id: 'late/19' }, focusTargetId: null, trace: { active: false, scope: 'relevant' as const } }
  const first = planPresentation(input), again = planPresentation(input, first)
  expect(again.entities.get(frame.id)!.rowSlotIds).toBe(first.entities.get(frame.id)!.rowSlotIds)
  const released = planPresentation({ ...input, selection: null }, again), cut = released.entities.get(frame.id)!
  expect(cut.rowSlotIds).toBeUndefined()
  expect(faceRows(frame, cut).visible.map(row => row.slotId)).toEqual(['a', 'b', 'c'])
  expect(faceRowPort(frame, cut, 'a')).toBe(frame.anchor.ports.a)
  expect(faceRowPort(frame, cut, 'late/19')).toBeNull()
})

it('promotes a late slot for its current recorded graph edge without inventing an assignment origin', () => {
  const { trace } = fixture(), seq = trace.events.length
  const recorded: TraceDocument = { ...trace, events: [...trace.events, {
    type: 'EXECUTION_FACT', seq, eventId: 'unit/recorded-late-binding', source: null, label: 'Actual unit graph binding', importance: 'normal',
    fact: { kind: 'write', context: { owner: 'Unit', name: 'run', descriptor: '()V', frameId: 'unit/frame', site: 1, rawSeq: 73, source: null },
      target: { id: 'late/19', kind: 'variable', ownerId: 'unit/frame', name: 'late/19', javaType: 'Node' },
      value: { kind: 'reference', javaType: 'Node', objectId: 'unit/target' }, origin: { kind: 'unknown' } },
  }] }
  const current = projectTrace(recorded), scene = current.project(seq + 1), catalog = createFlowCatalog()
  const graph = seek(recorded, seq + 1).executionGraph!
  catalog.extend(graph, recorded)
  const edge = graph.edges.find(edge => edge.kind === 'REFERENCE_BIND' && edge.from === 'late/19')!
  expect(edge.from).toBe('late/19'); expect(edge.to).toBe('unit/target')
  for (const detailLevel of ['FAR', 'MEDIUM', 'CLOSE'] as const) {
    const plan = planPresentation({ scene, layout: current.layout, flows: catalog, detailLevel, selection: null, focusTargetId: null, trace: { active: true, scope: 'current' } })
    const curve = plan.curves.find(curve => curve.id === edge.id)!
    expect(curve).toBeDefined()
    expect(curve.points[0]).toEqual(faceRowPort(scene.entities['unit/frame'], plan.entities.get('unit/frame')!, 'late/19'))
    expect(curve.points.at(-1)).toEqual(scene.entities['unit/target'].anchor.bodyPort)
    expect(plan.flowPresentation.counts.unavailable).toBeGreaterThan(0) // Unknown producer is not a guessed local-to-local transfer.
    expect(plan.entities.get('unit/frame')!.rowSlotIds).toContain('late/19')
  }
  expect(catalog.recordedProvenanceOf('late/19', seq + 1).some(item => item.edgeId === edge.id)).toBe(true)
  expect(catalog.atEvent(seq, current.project(seq))).toEqual([])
})

it('reuses bounded face positions when retired scope storage exposes a captured late local', () => {
  const { trace } = fixture(), seq = trace.events.length
  const retired: TraceDocument = { ...trace, events: [...trace.events, {
    type: 'REMOVE_LOCAL', frameId: 'unit/frame', slotId: 'a', seq, eventId: 'unit/retire-first-local', source: null, label: 'Retire captured storage', importance: 'normal',
  }] }
  const current = projectTrace(retired), scene = current.project(seq + 1), frame = scene.entities['unit/frame'] as SceneFrame
  const before = JSON.stringify(current.layout), model = faceRows(frame, presented)
  expect(frame.rows.some(row => row.slotId === 'a')).toBe(false)
  expect(model.visible.map(row => row.slotId)).toEqual(['b', 'c', 'late/0'])
  const plan = planPresentation({ scene, layout: current.layout, detailLevel: 'CLOSE', selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
  const parts = buildSolidBatch(scene, plan).filter(solid => solid.pick.kind === 'slot' && model.visible.some(row => row.slotId === solid.pick.id))
  const plates = parts.filter(solid => !solid.part), insets = parts.filter(solid => solid.part)
  expect(plates).toHaveLength(3)
  expect(insets).toHaveLength(6)
  expect(new Set(plates.map(plate => plate.anchor.position[1])).size).toBe(3)
  const port = presentedFlowPorts(scene, plan.entities, plan.cellWindows)
  for (const row of model.visible) {
    const chips=insets.filter(inset=>inset.pick.id===row.slotId)
    expect(chips).toHaveLength(2)
    for(const chip of chips)expect(chip.anchor.position[1]).toBe(plates.find(plate=>plate.pick.id===row.slotId)!.anchor.position[1])
    expect(port({ kind: 'slot', id: row.slotId })?.point[1]).toBe(plates.find(plate => plate.pick.id === row.slotId)!.anchor.position[1])
    expect(faceRowPort(frame, presented, row.slotId)).not.toBeNull()
  }
  expect(port({ kind: 'slot', id: 'a' })).toBeNull()
  expect(faceRowPort(frame, presented, 'a')).toBeNull()
  expect(JSON.stringify(current.layout)).toBe(before)
  expect(current.layout.anchors['unit/frame'].ports['late/0']).toBeUndefined()
})
