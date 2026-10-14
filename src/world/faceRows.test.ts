import { expect, it } from 'vitest'
import fc from 'fast-check'
import type { RuntimeSlot, TraceDocument, TraceEvent } from '../contracts/runtime'
import type { PresentedEntity, SceneFrame } from '../contracts/worldV2'
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
  ]
  const events = inputs.map((input, seq) => ({ ...input, seq, eventId: `unit/row/${seq}`, source: null, importance: 'normal', label: 'Explicit unit storage' })) as TraceEvent[]
  const trace: TraceDocument = { schemaVersion: 2, demoId: 'unit/row-window', sourceFiles: [], events }
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
    const plate = buildSolidBatch(scene, plan).filter(solid => solid.pick.kind === 'slot' && solid.pick.id === 'late/19')
    expect(plate).toHaveLength(1)
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
