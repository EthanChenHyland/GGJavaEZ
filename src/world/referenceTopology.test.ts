import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type { RuntimeSlot, TraceDocument, TraceEvent } from '../contracts/runtime'
import { arrayElementSlotId } from '../contracts/runtime'
import type {
  Evidence, PresentedCluster, PresentedEntity, SceneArray, SceneClass, SceneCollection,
  SceneEntity, SceneFrame, SceneModel, SceneObject, SceneReference, SceneRow, Vec3, WorldAnchor,
} from '../contracts/world'
import { seek } from '../runtime'
import { createLayoutEngine } from './layoutEngine'
import { createSceneProjector } from './sceneProjector'
import { computeArrayWindow } from './arrayWindow'
import { valueChipReferencePort } from './valueChipGeometry'
import { presentedFlowPorts } from './flowTopology'
import { buildReferenceTopology, type ReferenceTopology, type ReferenceTopologyInput } from './referenceTopology'

// Synthetic geometry and explicitly normalized records below are unit fixtures,
// not real-JVM execution or browser/visual acceptance evidence.
const evidence = (seq = 1): Evidence => ({ kind: 'observed', introducedSeq: 0, changedSeq: seq, eventIds: [`unit/${seq}`] })
const anchor = (id: string, x = 0, ports: WorldAnchor['ports'] = {}): WorldAnchor =>
  ({ entityId: id, region: 'heap', position: [x, 0, 0], size: [4, 20, 2], bodyPort: [x, 0, 1], ports })
const row = (slotId: string, targetId: string, port: Vec3 = [2, 0, 1], seq = 1): SceneRow =>
  ({ slotId, name: slotId, type: 'Unit', role: 'field', value: { kind: 'reference', targetId, targetType: 'Unit', text: 'alias', exact: 'alias', observation: 'OBSERVED' }, port, evidence: evidence(seq) })
const object = (id: string, rows: readonly SceneRow[] = [], x = 0): SceneObject =>
  ({ kind: 'object', id, displayId: 1, title: 'Same formatted alias', groups: [{ declaringClass: 'Unit', rows }], fieldCount: rows.length, allocationSite: null,
    anchor: anchor(id, x, Object.fromEntries(rows.flatMap(item => item.port ? [[item.slotId, item.port]] : []))), ownership: 'PROJECT', evidence: evidence(), mutation: null })
const presented = (id: string, mode: PresentedEntity['mode'] = 'detailed', detail: PresentedEntity['detail'] = 'CLOSE'): PresentedEntity =>
  ({ id, mode, detail, opacity: 1, pinned: false, pickable: true, highlight: null })
const cluster = (id: string, memberIds: readonly string[], x: number): PresentedCluster =>
  ({ id, key: { kind: 'type', value: 'Same alias' }, label: 'Same alias', memberIds, members: memberIds.length,
    selected: false, pickable: true, opacity: .55, anchor: { ...anchor(id, x), size: [2.4, 1.2, .8], ports: {}, bodyPort: [x, 0, .4] } })
function scene(nodes: readonly SceneEntity[], references?: readonly SceneReference[]): SceneModel {
  const derived: SceneReference[] = []
  for (const node of nodes) {
    const rows = node.kind === 'object' ? node.groups.flatMap(group => group.rows) : node.kind === 'frame' || node.kind === 'class' ? node.rows : []
    for (const item of rows) if (item.value.kind === 'reference') derived.push({ id: `unit-reference/${item.slotId}`, sourceId: node.id, sourceSlotId: item.slotId, targetId: item.value.targetId,
      role: node.kind === 'frame' ? 'frame-object' : node.kind === 'class' ? 'class-object' : 'object-object', overlay: null, evidence: item.evidence })
  }
  return { recordingId: 'unit/recording', revision: 1, cursor: 20, liveHead: 20, entities: Object.fromEntries(nodes.map(node => [node.id, node])),
    order: { frames: nodes.filter(node => node.kind === 'frame').map(node => node.id), classes: nodes.filter(node => node.kind === 'class').map(node => node.id), objects: nodes.filter(node => node.kind !== 'frame' && node.kind !== 'class').map(node => node.id) },
    references: references ?? derived, historicalBindings:[], callLinks: [], returnFlows: [], exception: null, io: [], cursorEvent: null, liveStack: [],
    recording: { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false } }
}
const inputFor = (model: SceneModel, overrides: Partial<ReferenceTopologyInput> = {}): ReferenceTopologyInput =>
  ({ scene: model, entities: new Map(Object.keys(model.entities).map(id => [id, presented(id)])), clusters: [], cellWindows: new Map(), individualLimit: 12, mandatoryIds: new Set(), ...overrides })
function conservation(result: ReferenceTopology) {
  const { counts } = result
  expect(counts.current).toBe(counts.drawable + counts.unavailable + counts.internal + counts.scopeExcluded)
  expect(counts.drawable).toBe(counts.individual + counts.bundled)
  expect(counts.bundleCurves).toBe(result.bundles.length)
  expect(counts.bundled).toBe(result.bundles.reduce((sum, bundle) => sum + bundle.references.length, 0))
  const ids = [...result.individual.map(item => item.reference.id), ...result.bundles.flatMap(bundle => bundle.references.map(item => item.id)),
    ...result.unavailable.map(item => item.reference.id), ...result.internal.map(item => item.reference.id), ...result.scopeExcluded.map(item => item.id)]
  expect(new Set(ids).size).toBe(counts.current)
  expect(ids.length).toBe(counts.current)
}
const snapshot = (input: ReferenceTopologyInput) => JSON.stringify({ scene: input.scene, entities: [...input.entities], clusters: input.clusters,
  windows: [...input.cellWindows].map(([id, window]) => [id, { ...window, mapping: [...window.mapping] }]), mandatory: [...input.mandatoryIds], priority: [...input.priorityIds ?? []] })

describe('current reference topology over a presented cut', () => {
  it('aggregates collapsed endpoints by directed pair with exact constituents and stable proxy geometry', () => {
    const a = object('opaque A', [row('a→b', 'opaque B'), row('second a→b', 'opaque B')], -8)
    const b = object('opaque B', [row('b→a', 'opaque A')], 8)
    const model = scene([a, b]), left = cluster('proxy [left]', [a.id], -6), right = cluster('proxy/right', [b.id], 6)
    const input = inputFor(model, { entities: new Map(), clusters: [left, right], individualLimit: 0 })
    const before = snapshot(input), result = buildReferenceTopology(input)
    expect(result.individual).toEqual([])
    expect(result.bundles.map(bundle => [bundle.from, bundle.to, bundle.count])).toEqual([[left.id, right.id, 2], [right.id, left.id, 1]])
    for (const bundle of result.bundles) {
      expect(bundle.id).toBe(`presentation:reference-bundle:${JSON.stringify([model.recordingId, bundle.from, bundle.to])}`)
      expect(bundle.sourceAnchor).toBe(bundle.from === left.id ? left.anchor : right.anchor)
      expect(bundle.destinationAnchor).toBe(bundle.to === left.id ? left.anchor : right.anchor)
      expect(bundle.sourcePoint).toEqual(bundle.from === left.id ? [-4.74, 0, 0] : [4.74, 0, 0])
      for (const reference of bundle.references) expect(model.references).toContain(reference)
    }
    conservation(result)
    expect(snapshot(input)).toBe(before)
    const reversed = buildReferenceTopology({ ...input, scene: { ...model, revision: 77, cursor: 99, references: [...model.references].reverse() }, clusters: [right, left] })
    expect(reversed).toEqual(result)
    const reduced = buildReferenceTopology({ ...input, scene: { ...model, references: model.references.slice(0, 1) } })
    expect(reduced.bundles[0].id).toBe(result.bundles[0].id)
    expect(reduced.bundles[0].count).toBe(1)
  })

  it.each(['source', 'target'] as const)('forces aggregation when only the %s endpoint is collapsed', side => {
    const model = scene([object('a', [row('link', 'b')], -8), object('b', [], 8)])
    const hidden = side === 'source' ? 'a' : 'b', proxy = cluster('opaque proxy', [hidden], hidden === 'a' ? -8 : 8)
    const result = buildReferenceTopology(inputFor(model, { entities: new Map([[hidden === 'a' ? 'b' : 'a', presented(hidden === 'a' ? 'b' : 'a')]]), clusters: [proxy], mandatoryIds: new Set([model.references[0].id]) }))
    expect(result.individual).toEqual([])
    expect(result.bundles[0]).toMatchObject({ from: side === 'source' ? proxy.id : 'a', to: side === 'target' ? proxy.id : 'b', count: 1 })
    conservation(result)
  })

  it('admits mandatory, priority, newest, then canonical IDs; subtracts individuals before bundling', () => {
    const rows = [row('z', 'b', [2, 0, 1], 4), row('a', 'b', [2, 0, 1], 4), row('priority', 'b', [2, 0, 1], 1), row('mandatory', 'b', [2, 0, 1], 0), row('newest', 'b', [2, 0, 1], 5)]
    const model = scene([object('a', rows), object('b', [], 8)])
    const result = buildReferenceTopology(inputFor(model, { individualLimit: 3, mandatoryIds: new Set(['unit-reference/mandatory']), priorityIds: new Set(['unit-reference/priority']) }))
    expect(result.individual.map(item => item.reference.sourceSlotId)).toEqual(['mandatory', 'priority', 'newest'])
    expect(result.bundles[0].references.map(item => item.sourceSlotId)).toEqual(['a', 'z'])
    expect(result.bundles[0].count).toBe(2)
    expect(result.bundles[0].sourcePoint).not.toEqual(rows[0].port)
    conservation(result)
    const tie = buildReferenceTopology(inputFor(model, { individualLimit: 2 }))
    expect(tie.individual.map(item => item.reference.sourceSlotId)).toEqual(['newest', 'a'])
  })

  it('retains every proven mandatory individual beyond B and admits no optional individuals', () => {
    const model = scene([object('a', Array.from({ length: 8 }, (_, index) => row(`slot ${index}`, 'b'))), object('b', [], 8)])
    const mandatoryIds = new Set(model.references.slice(0, 5).map(reference => reference.id))
    const result = buildReferenceTopology(inputFor(model, { individualLimit: 2, mandatoryIds }))
    expect(result.individual.length).toBe(5)
    expect(result.individual.every(item => mandatoryIds.has(item.reference.id))).toBe(true)
    expect(result.bundles[0].count).toBe(3)
    conservation(result)
  })

  it('never silently truncates structural aggregates to the individual budget', () => {
    const nodes = Array.from({ length: 30 }, (_, index) => object(`source ${index}`, [row(`slot ${index}`, `target ${index}`)], -8))
    nodes.push(...Array.from({ length: 30 }, (_, index) => object(`target ${index}`, [], 8)))
    const result = buildReferenceTopology(inputFor(scene(nodes), { individualLimit: 0 }))
    expect(result.counts).toMatchObject({ current: 30, individual: 0, bundled: 30, bundleCurves: 30 })
    conservation(result)
  })

  it('preserves a selected bundle and accounts for every relationship deferred by a dense budget', () => {
    const model = scene([object('source', [row('one', 'near'), row('two', 'far')]), object('near', [], 8), object('far', [], 16)])
    const input = inputFor(model, { individualLimit: 0 })
    const selected = buildReferenceTopology(input).bundles.find(bundle => bundle.to === 'far')!
    const bounded = buildReferenceTopology({ ...input, bundleLimit: 1, selectedBundleId: selected.id })
    expect(bounded.bundles).toEqual([selected])
    expect(bounded.scopeExcluded.map(reference => reference.sourceSlotId)).toEqual(['one'])
    conservation(bounded)
  })

  it('uses visible face rows, rejects hidden/quiet slots, and never substitutes a missing source port', () => {
    const source = object('source', Array.from({ length: 5 }, (_, index) => row(`slot ${index}`, 'target')))
    const model = scene([source, object('target', [], 8)])
    const medium = inputFor(model, { entities: new Map([['source', presented('source', 'detailed', 'MEDIUM')], ['target', presented('target')]]) })
    const result = buildReferenceTopology(medium)
    expect(result.counts).toMatchObject({ individual: 4, unavailable: 1 })
    expect(result.unavailable[0]).toMatchObject({ reference: model.references[4], reason: 'Source slot is not in the visible face rows' })
    for (const mode of ['quiet', 'FAR'] as const) {
      const entities = new Map(medium.entities)
      entities.set('source', mode === 'quiet' ? presented('source', 'quiet') : presented('source', 'detailed', 'FAR'))
      expect(buildReferenceTopology({ ...medium, entities }).counts.unavailable).toBe(5)
    }
    const missing = { ...source, anchor: { ...source.anchor, ports: {} } }
    const unavailable = buildReferenceTopology(inputFor(scene([missing, object('target', [], 8)]), { mandatoryIds: new Set(model.references.map(item => item.id)) }))
    expect(unavailable.counts.unavailable).toBe(5)
    expect(unavailable.bundles).toEqual([])
    conservation(unavailable)
  })

  it('resolves Frame and Class_State sources through the same shared face visibility', () => {
    const rows = [row('opaque slot', 'target')], body = anchor('source', -8, { 'opaque slot': [-6, 0, 1] })
    const frame: SceneFrame = { kind: 'frame', id: 'source', rows, anchor: body, title: 'Unit.run()', invocationNumber: 1, callerId: null, depth: 0,
      status: { kind: 'running', line: null }, live: true, topOfStack: true, exceptionRole: null, sourceLine: null, ownership: 'PROJECT', evidence: evidence() }
    const shelf: SceneClass = { kind: 'class', id: 'source', rows, anchor: { ...body, region: 'class' }, title: 'Unit', packageName: '', initialization: 'observed', evidence: evidence() }
    for (const source of [frame, shelf]) {
      const result = buildReferenceTopology(inputFor(scene([source, object('target', [], 8)])))
      expect(result.individual[0].sourcePoint).toEqual(valueChipReferencePort(source.anchor,source.anchor.ports['opaque slot'][1]))
      expect(source.anchor.ports['opaque slot']).toEqual([-6,0,1])
      expect(result.individual[0].sourceAnchor).toBe(source.anchor)
      conservation(result)
    }
  })

  it('uses actual collection inset edges only for captured visible key/value ports', () => {
    const value = row('value slot', 'target'), key = row('key slot', 'target')
    const collection: SceneCollection = { kind: 'collection', id: 'map', displayId: 2, title: 'Map', collectionKind: 'Map', size: 1, recordedEntries: 1,
      entries: [{ slotId: value.slotId, value: value.value, port: [1, 2, 1], keySlotId: key.slotId, key: key.value, keyPort: [-1, 2, 1], evidence: evidence() }],
      mutation: null, ownership: 'JDK', anchor: anchor('map'), evidence: evidence() }
    const references: SceneReference[] = [value, key].map(item => ({ id: `unit-reference/${item.slotId}`, sourceId: collection.id, sourceSlotId: item.slotId, targetId: 'target', role: 'object-object', overlay: null, evidence: evidence() }))
    const model = scene([collection, object('target', [], 8)], references), input = inputFor(model),before=snapshot(input)
    const result = buildReferenceTopology(input)
    const expected=[[-1.1025,7.52,1.081],[-.1025,7.52,1.081]]
    result.individual.forEach((item,index)=>item.sourcePoint.forEach((value,axis)=>expect(value).toBeCloseTo(expected[index][axis],10)))
    expect(collection.entries[0].keyPort).toEqual([-1,2,1]);expect(collection.entries[0].port).toEqual([1,2,1])
    const missingKey = { ...collection, entries: [{ ...collection.entries[0], keyPort: null }] }
    expect(buildReferenceTopology(inputFor(scene([missingKey, object('target', [], 8)], references))).counts).toMatchObject({ individual: 1, unavailable: 1 })
    expect(buildReferenceTopology({ ...input, entities: new Map([['map', presented('map', 'detailed', 'FAR')], ['target', presented('target')]]) }).counts.unavailable).toBe(2)
    conservation(result)
    expect(snapshot(input)).toBe(before)
  })

  it('uses mapped array cell ports and actual title-plate destinations, never hidden indices or envelopes', () => {
    const id = 'opaque array', cells = [0, 999].map(index => ({ index, slotId: arrayElementSlotId(id, index), value: row('cell', 'target').value, evidence: evidence() }))
    const array: SceneArray = { kind: 'array', id, displayId: 3, title: 'Unit[]', componentType: 'Unit', length: 1000, cells,
      activity: null, outOfBounds: null, anchor: { ...anchor(id), size: [8, 30, 4] }, ownership: 'PROJECT', evidence: evidence() }
    const references: SceneReference[] = cells.map(cell => ({ id: `unit-reference/${cell.slotId}`, sourceId: id, sourceSlotId: cell.slotId, targetId: 'target', role: 'object-object', overlay: null, evidence: cell.evidence }))
    const window = computeArrayWindow({ recordingId: 'unit/recording', arrayId: id, recordedLength: 1000, anchor: array.anchor, nominalCellBudget: 1, requestedIndices: [999] })
    const input = inputFor(scene([array, object('target', [], 12)], references), { cellWindows: new Map([[id, window]]) }), before = snapshot(input)
    const result = buildReferenceTopology(input), mapping = window.mapping.get(cells[1].slotId)!
    const point=result.individual[0].sourcePoint
    expect(point[0]).toBeCloseTo(mapping.port[0]+.67,10);expect(point[1]).toBe(mapping.port[1]);expect(point[2]).toBeCloseTo(mapping.port[2]+.081,10)
    expect(point).not.toBe(mapping.port)
    expect(presentedFlowPorts(input.scene,input.entities,input.cellWindows)({kind:'slot',id:cells[1].slotId})?.point).toEqual(point)
    expect(result.individual[0].sourceAnchor).toBe(mapping.anchor)
    expect(result.unavailable[0].reference.sourceSlotId).toBe(cells[0].slotId)
    expect(snapshot(input)).toBe(before)
    const targeted = buildReferenceTopology(inputFor(scene([object('source', [row('source slot', id, [-6, 14.55, 0])], -8), array])))
    expect(targeted.individual[0].destinationAnchor.size).toEqual([8, .9, .12])
    expect(targeted.individual[0].destinationAnchor.position).toEqual([0, 14.55, 0])
    expect(targeted.individual[0].destinationPoint).toEqual([-4.06, 14.55, 0])
    expect(array.anchor.size).toEqual([8, 30, 4])
    const aggregated = buildReferenceTopology({ ...input, individualLimit: 0 })
    expect(aggregated.bundles[0].sourceAnchor.size).toEqual([8, .9, .12])
    expect(aggregated.bundles[0].sourceAnchor).not.toBe(mapping.anchor)
    const stale = { ...window, recordingId: 'another recording' }
    expect(buildReferenceTopology({ ...input, cellWindows: new Map([[id, stale]]) }).counts.unavailable).toBe(2)
    conservation(result)
  })

  it('chooses the nearest target face with outward offset and deterministic ties', () => {
    const source = object('source', [row('slot', 'target', [-10, 0, 0])], -12)
    const target: SceneObject = { ...object('target'), anchor: { ...anchor('target'), size: [4, 4, 4] } }
    const result = buildReferenceTopology(inputFor(scene([source, target])))
    expect(result.individual[0].destinationPoint).toEqual([-2.06, 0, 0])
    expect(result.individual[0].destinationAnchor).toBe(target.anchor)
    const centreSource = object('source', [row('slot', 'target', [0, 0, 0])])
    expect(buildReferenceTopology(inputFor(scene([centreSource, target]))).individual[0].destinationPoint).toEqual([2.06, 0, 0])
  })

  it('classifies missing/invalid geometry and same-cluster relationships without self-curves', () => {
    const model = scene([object('a', [row('inside', 'b'), row('missing', 'absent')]), object('b')])
    const proxy = cluster('proxy', ['a', 'b'], 0)
    const result = buildReferenceTopology(inputFor(model, { entities: new Map(), clusters: [proxy] }))
    expect(result.internal).toEqual([{ reference: model.references[0], clusterId: proxy.id }])
    expect(result.unavailable[0].reference).toBe(model.references[1])
    expect(result.bundles).toEqual([])
    const invalid = { ...proxy, anchor: { ...proxy.anchor, size: [0, 1, 1] as Vec3 } }
    // Internal membership is factual even when no curve geometry can be drawn.
    expect(buildReferenceTopology(inputFor(model, { entities: new Map(), clusters: [invalid] })).counts).toMatchObject({ internal: 1, unavailable: 1 })
    const invalidTarget = { ...model.entities.b, anchor: { ...model.entities.b.anchor, size: [0, 1, 1] as Vec3 } }
    const invalidGeometry = buildReferenceTopology(inputFor(scene([model.entities.a, invalidTarget])))
    expect(invalidGeometry.unavailable[0].reason).toBe('Destination represented cuboid geometry is invalid')
    expect(invalidGeometry.counts.unavailable).toBe(2)
    const unpresented = buildReferenceTopology(inputFor(model, { entities: new Map() }))
    expect(unpresented.unavailable.every(item => item.reason.includes('Source'))).toBe(true)
    conservation(result)
  })

  it('excludes all current references by disabled scope without replacing them with unavailable counts', () => {
    const model = scene([object('a', [row('slot', 'b')]), object('b')])
    const result = buildReferenceTopology(inputFor(model, { entities: new Map(), enabled: false }))
    expect(result.scopeExcluded).toEqual(model.references)
    expect(result.counts).toEqual({ current: 1, drawable: 0, individual: 0, bundled: 0, bundleCurves: 0, unavailable: 0, internal: 0, scopeExcluded: 1 })
    conservation(result)
  })

  it('partitions directed reference IDs once under varied cuts, priorities and input ordering (100 runs)', () => {
    fc.assert(fc.property(fc.array(fc.record({ target: fc.integer({ min: 0, max: 5 }), mandatory: fc.boolean(), priority: fc.boolean() }), { minLength: 1, maxLength: 6 }),
      fc.array(fc.constantFrom('detailed', 'quiet', 'cluster', 'absent'), { minLength: 6, maxLength: 6 }), fc.integer({ min: 0, max: 6 }), fc.boolean(), (edges, modes, limit, enabled) => {
        const nodes = Array.from({ length: 6 }, (_, index) => object(`opaque/${index}`, edges[index] ? [row(`opaque slot/${index}`, `opaque/${edges[index].target}`)] : [], index * 8))
        const model = scene(nodes), entities = new Map<string, PresentedEntity>()
        for (const [index, mode] of modes.entries()) {
          if (mode === 'detailed' || mode === 'quiet') entities.set(nodes[index].id, presented(nodes[index].id, mode))
        }
        const grouped = [0, 1].map(group => cluster(`proxy/${group}`, nodes.filter((_, index) => modes[index] === 'cluster' && index % 2 === group).map(node => node.id), group * 8)).filter(item => item.members > 0)
        const mandatoryIds = new Set(model.references.filter((_, index) => edges[index].mandatory).map(item => item.id))
        const priorityIds = new Set(model.references.filter((_, index) => edges[index].priority).map(item => item.id))
        const input = inputFor(model, { entities, clusters: grouped, mandatoryIds, priorityIds, individualLimit: limit, enabled }), before = snapshot(input)
        const result = buildReferenceTopology(input)
        conservation(result)
        // Independent oracle uses the synthetic cut, not result counts/membership.
        const drawable = model.references.filter((_, index) => {
          const source = modes[index], target = modes[edges[index].target]
          return enabled && source !== 'absent' && target !== 'absent' && source !== 'quiet'
            && !(source === 'cluster' && target === 'cluster' && index % 2 === edges[index].target % 2)
        })
        const individualCandidates = drawable.filter(item => entities.get(item.sourceId)?.mode === 'detailed' && entities.has(item.targetId))
        const required = individualCandidates.filter(item => mandatoryIds.has(item.id))
        expect(result.counts.drawable).toBe(drawable.length)
        expect(result.individual.length).toBe(Math.min(individualCandidates.length, Math.max(limit, required.length)))
        for (const reference of required) expect(result.individual.map(item => item.reference.id)).toContain(reference.id)
        expect(result.internal.length).toBe(enabled ? edges.filter((edge, index) => modes[index] === 'cluster' && modes[edge.target] === 'cluster' && index % 2 === edge.target % 2).length : 0)
        expect(snapshot(input)).toBe(before)
        expect(buildReferenceTopology({ ...input, scene: { ...model, references: [...model.references].reverse() }, entities: new Map([...entities].reverse()), clusters: [...grouped].reverse() })).toEqual(result)
        const provenMandatory = result.individual.filter(item => mandatoryIds.has(item.reference.id)).length
        expect(result.individual.length).toBeLessThanOrEqual(Math.max(limit, provenMandatory))
        for (const bundle of result.bundles) {
          expect(bundle.count).toBe(bundle.references.length)
          expect(bundle.references.map(item => item.id)).toEqual(bundle.references.map(item => item.id).sort())
          expect(bundle.references.some(item => mandatoryIds.has(item.id) && entities.has(item.sourceId) && entities.has(item.targetId))).toBe(false)
        }
      }), { numRuns: 100 })
  })

  it('follows normalized applied prefixes through replacement, null and rewind without future bindings', () => {
    const base = (seq: number) => ({ seq, eventId: `unit/normalized/${seq}`, source: null, label: 'Normalized unit fixture', importance: 'quiet' as const })
    const slot: RuntimeSlot = { id: 'opaque recorded field', name: 'link', javaType: 'Unit', value: { kind: 'null' } }
    const events: TraceEvent[] = [
      { ...base(0), type: 'PROGRAM_START' },
      { ...base(1), type: 'ALLOCATE_OBJECT', objectId: 'source', displayId: 1, className: 'Unit', fields: [slot] },
      { ...base(2), type: 'ALLOCATE_OBJECT', objectId: 'first', displayId: 2, className: 'Unit', fields: [] },
      { ...base(3), type: 'ALLOCATE_OBJECT', objectId: 'second', displayId: 3, className: 'Unit', fields: [] },
      { ...base(4), type: 'CREATE_REFERENCE', sourceSlot: { kind: 'object', objectId: 'source', slotId: slot.id }, targetObjectId: 'first', javaType: 'Unit' },
      { ...base(5), type: 'CREATE_REFERENCE', sourceSlot: { kind: 'object', objectId: 'source', slotId: slot.id }, targetObjectId: 'second', javaType: 'Unit' },
      { ...base(6), type: 'CLEAR_REFERENCE', sourceSlot: { kind: 'object', objectId: 'source', slotId: slot.id } },
      { ...base(7), type: 'CREATE_REFERENCE', sourceSlot: { kind: 'object', objectId: 'source', slotId: slot.id }, targetObjectId: 'first', javaType: 'Unit' },
    ]
    const trace: TraceDocument = { schemaVersion: 2, demoId: 'normalized-unit', sourceFiles: [{ fileId: 'Unit.java', name: 'Unit.java', content: '// explicit normalized unit fixture' }], events }
    const layout = createLayoutEngine(); layout.append(events)
    const projector = createSceneProjector(trace)
    const at = (cursor: number) => {
      const runtime = seek(trace, cursor), before = JSON.stringify(runtime)
      const model = projector.project(runtime, layout.state, { sessionEnded: true, pausedAtLiveHead: false, liveHead: events.length, recording: scene([]).recording })
      const result = buildReferenceTopology(inputFor(model, { individualLimit: 0 }))
      expect(JSON.stringify(runtime)).toBe(before)
      conservation(result)
      return result
    }
    const first = at(5), replacement = at(6)
    expect(first.bundles[0].references[0].targetId).toBe('first')
    expect(replacement.bundles[0].references[0].targetId).toBe('second')
    expect(first.bundles[0].id).not.toBe(replacement.bundles[0].id)
    expect(at(7).counts.current).toBe(0)
    expect(at(4).counts.current).toBe(0)
    expect(at(8).bundles[0].id).toBe(first.bundles[0].id)
    expect(at(5)).toEqual(first)
  })
})
