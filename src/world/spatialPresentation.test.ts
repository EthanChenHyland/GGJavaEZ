import { describe, expect, it } from 'vitest'
import type { RuntimeSlot, TraceDocument, TraceEvent } from '../contracts/runtime'
import { arrayElementSlotId } from '../contracts/runtime'
import type { DetailLevel, PresentationPlan } from '../contracts/worldV2'
import type { Selection } from '../contracts/interaction'
import { projectTrace } from '../testing/projectTrace'
import { seek } from '../runtime'
import { planPresentation, anchorCorners } from './presentationPlanner'
import { createFlowCatalog } from './flowCatalog'
import { clusterHierarchy, clusterId } from './clusterHierarchy'
import { budgets } from '../theme/tokens'
import { homeFraming } from '../camera/homeFraming'
import { focusFraming } from '../camera/focusFraming'

type Input<T = TraceEvent> = T extends TraceEvent ? Omit<T, 'eventId' | 'seq' | 'source' | 'label' | 'importance'> : never
const refValue = (id: string) => ({ kind: 'reference' as const, javaType: 'app.Item', objectId: id })
const slot = (id: string, target: string): RuntimeSlot => ({ id, name: id, javaType: 'app.Item', value: refValue(target) })
const object = (id: string, className = 'app.Item', fields: RuntimeSlot[] = [], ownership: 'PROJECT' | 'LIBRARY' | 'JDK' = 'PROJECT'): Input => ({ type: 'ALLOCATE_OBJECT', objectId: id, displayId: 1, className, fields, metadata: { ownership, runtimeType: className, packageName: className.slice(0, className.lastIndexOf('.')) } })
const enter = (id: string, caller: string | null = null, locals: RuntimeSlot[] = []): Input => ({ type: 'ENTER_METHOD', frameId: id, callerFrameId: caller, className: 'app.Work', methodName: 'execute', locals })
const exit = (id: string): Input => ({ type: 'EXIT_METHOD', frameId: id })
const context = (frameId: string | null) => ({ owner: 'app.Work', name: 'execute', descriptor: '()V', frameId, site: 1, rawSeq: 91, source: null })
const bind = (frameId: string, target: string): Input => ({ type: 'EXECUTION_FACT', fact: { kind: 'write', context: context(frameId),
  target: { id: `${frameId}:slot`, kind: 'variable', ownerId: frameId, name: 'item', javaType: 'app.Item' }, value: refValue(target), origin: { kind: 'unknown' } } })
function rig(inputs: Input[], completed = true) {
  const events = [{ type: 'PROGRAM_START' as const }, ...inputs, ...(completed ? [{ type: 'PROGRAM_END' as const }] : [])].map((event, seq) => ({ ...event,
    ...('displayId' in event ? { displayId: seq } : {}), seq, eventId: `unit/cut/${seq}`, source: null, label: 'Explicit normalized presentation unit record', importance: 'quiet' as const }))
  const trace: TraceDocument = { schemaVersion: 2, demoId: 'unit/adaptive-cut', sourceFiles: [], events }, projection = projectTrace(trace)
  const scene = projection.project(events.length), graph = seek(trace, events.length).executionGraph, flows = createFlowCatalog()
  if (graph) flows.extend(graph, trace)
  return { trace, projection, scene, flows }
}
type Rig = ReturnType<typeof rig>
const cut = (r: Rig, detailLevel: DetailLevel = 'MEDIUM', selection: Selection = null, focusTargetId: string | null = null, scope: 'current' | 'relevant' | 'all' | null = null, viewTile?: readonly [number, number, number]) => planPresentation({ scene: r.scene, layout: r.projection.layout, flows: r.flows, detailLevel, selection, focusTargetId, trace: { active: scope !== null, scope: scope ?? 'relevant' }, viewTile })
function accounted(r: Rig, plan: PresentationPlan) {
  const members = [...plan.entities.keys(), ...plan.clusters.flatMap(cluster => cluster.memberIds)]
  expect(members).toHaveLength(Object.keys(r.scene.entities).length)
  expect(new Set(members)).toEqual(new Set(Object.keys(r.scene.entities)))
  const c = plan.referencePresentation.counts
  expect(c.current).toBe(r.scene.references.length)
  expect(c.individual + c.bundled + c.unavailable + c.internal + c.scopeExcluded).toBe(c.current)
  for (const category of ['frames', 'objects', 'classes'] as const) {
    const ids = r.scene.order[category], detailed = ids.filter(id => plan.entities.get(id)?.mode === 'detailed'), required = ids.filter(id => plan.pinned.has(id))
    expect(detailed.length).toBeLessThanOrEqual(Math.max(budgets[plan.detailLevel][category], required.length))
  }
  expect([...plan.entities.values()].filter(item => item.mode === 'quiet' && item.pickable).length).toBeLessThanOrEqual(budgets[plan.detailLevel].pickable)
}
const safe = { x: 0, y: 0, width: 1440, height: 900 }, viewport = { width: 1440, height: 900 }
const home = (r: Rig, plan: PresentationPlan) => homeFraming(r.scene, plan, safe, viewport, r.projection.layout)
function fanIn() {
  const inputs: Input[] = Array.from({ length: 1000 }, (_, i) => object(`o${i}`))
  const locals = (frame: number) => Array.from({ length: 1000 }, (_, i) => slot(`f${frame}:slot:${i}`, `o${i}`))
  inputs.push(enter('f0', null, locals(0)))
  for (let i = 1; i < 1000; i++) inputs.push(enter(`f${i}`, 'f0', i < 4 ? locals(i) : []), exit(`f${i}`))
  inputs.push(exit('f0'))
  return rig(inputs)
}
const fan = fanIn()

describe('adaptive production presentation', () => {
  it.each<DetailLevel>(['FAR', 'MEDIUM', 'CLOSE'])('accounts for every %s identity and reference under the original 1000-frame/1000-object/4000-link fan-in', level => {
    const plan = cut(fan, level, { kind: 'object', id: 'o999' }, null, 'all')
    expect(fan.scene.order.frames).toHaveLength(1000); expect(fan.scene.order.objects).toHaveLength(1000); expect(fan.scene.references).toHaveLength(4000)
    expect(plan.entities.get('o999')).toMatchObject({ mode: 'detailed', pinned: true })
    expect(plan.clusters.length).toBeLessThanOrEqual(budgets[level].clusters)
    const mandatoryConnectors = plan.budgetOverflow.find(item => item.category === 'connectors')?.actual ?? 0
    expect(plan.curves.filter(curve => curve.kind === 'connector').length).toBeLessThanOrEqual(Math.max(budgets[level].connectors, mandatoryConnectors))
    accounted(fan, plan)
  })
  it('counts actual type and caller-branch records with stable independent cluster anchors across view and selection', () => {
    const r = rig([enter('root'), ...Array.from({ length: 1000 }, (_, i) => [enter(`child${i}`, 'root'), exit(`child${i}`)]).flat(), exit('root'), ...Array.from({ length: 1000 }, (_, i) => object(`o${i}`))])
    const first = cut(r, 'FAR'), hierarchy = clusterHierarchy(r.scene, r.projection.layout)
    const heap = hierarchy.get(clusterId('heap', { kind: 'type', value: 'app.Item' }))!, branch = hierarchy.get(clusterId('stack', { kind: 'invocation-branch', value: 'root/observed-descendants' }))!
    expect(heap.memberIds).toHaveLength(1000); expect(branch.memberIds).toHaveLength(1000)
    expect(heap.anchor).not.toBe(r.scene.entities.o0.anchor)
    expect(first.clusters.find(cluster => cluster.id === heap.id)?.members).toBe(1000)
    expect(first.clusters.find(cluster => cluster.id === branch.id)?.members).toBe(1000)
    const moved = cut(r, 'CLOSE', { kind: 'object', id: 'o500' }, null, null, [42, 25, 3])
    expect(moved.entities.get('o500')?.pinned).toBe(true)
    expect(moved.clusters.find(cluster => cluster.id === heap.id)?.anchor).toBe(heap.anchor)
    expect(home(r, first).ids.filter(id => r.scene.entities[id].kind === 'frame')).toEqual(['root', 'child999'])
    accounted(r, moved)
  })
  it('keeps recursive descendants in their observed branch without conflating another root', () => {
    const r = rig([enter('root'), enter('a', 'root'), enter('b', 'a'), enter('c', 'b'), exit('c'), exit('b'), exit('a'), exit('root'), enter('other-root'), enter('d', 'other-root'), exit('d'), exit('other-root')])
    const hierarchy = clusterHierarchy(r.scene, r.projection.layout)
    expect(hierarchy.get(clusterId('stack', { kind: 'invocation-branch', value: 'root/observed-descendants' }))?.memberIds).toEqual(['a', 'b', 'c'])
    expect(hierarchy.get(clusterId('stack', { kind: 'invocation-branch', value: 'other-root/observed-descendants' }))?.memberIds).toEqual(['d'])
    accounted(r, cut(r, 'FAR'))
  })
  it('uses recorded observed ancestry without inventing a direct opaque call', () => {
    const method = { owner: 'app.Work', name: 'execute', descriptor: '()V' }
    const fact = (id: string, caller: string | null): Input => ({ type: 'EXECUTION_FACT', fact: { kind: 'enter', invocationId: id, callerInvocationId: caller, method, receiver: null, parameters: [], context: context(caller) } })
    const r = rig([enter('ancestor'), fact('ancestor', null), enter('callback', 'ancestor'), fact('callback', 'ancestor')], false)
    expect(seek(r.trace, r.trace.events.length).executionGraph!.invocations.callback).toMatchObject({ callerInvocationId: null, observedAncestorInvocationId: 'ancestor' })
    expect(r.scene.callLinks).toEqual([])
    expect(clusterHierarchy(r.scene, r.projection.layout).get(clusterId('stack', { kind: 'invocation-branch', value: 'ancestor/observed-descendants' }))?.memberIds).toEqual(['callback'])
    accounted(r, cut(r, 'FAR'))
  })
  it('separates recorded ownership and protects both endpoints of selected written static references', () => {
    const r = rig([object('project'), object('library', 'app.Item', [], 'LIBRARY'),
      { type: 'CLASS_OBSERVE', classId: 'jvm:class:app.Registry', className: 'app.Registry', initialization: 'observed', fields: [slot('Registry.item', 'project')] },
      { type: 'SET_STATIC', classId: 'jvm:class:app.Registry', slotId: 'Registry.item', value: refValue('project') }])
    const hierarchy = clusterHierarchy(r.scene, r.projection.layout)
    expect(hierarchy.get(clusterId('heap', { kind: 'ownership', value: 'PROJECT' }))?.memberIds).toEqual(['project'])
    expect(hierarchy.get(clusterId('library', { kind: 'ownership', value: 'LIBRARY' }))?.memberIds).toEqual(['library'])
    const reference = r.scene.references[0], plan = cut(r, 'MEDIUM', { kind: 'reference', id: reference.id })
    for (const id of ['jvm:class:app.Registry', 'project']) expect(plan.entities.get(id)?.pinned).toBe(true)
    expect(plan.curves.some(curve => curve.id === reference.id)).toBe(true)
    accounted(r, plan)
  })
  it('keeps default connectors and scopes actual graph-backed flows by current/relevant/all evidence', () => {
    const r = rig([object('a'), object('b'), enter('past', null, [slot('past:slot', 'b')]), bind('past', 'b'), exit('past'), enter('current', null, [slot('current:slot', 'a')]), bind('current', 'a')], false)
    const graph = seek(r.trace, r.trace.events.length).executionGraph!, now = graph.edges.find(edge => edge.kind === 'REFERENCE_BIND' && edge.from === 'current:slot')!, old = graph.edges.find(edge => edge.kind === 'REFERENCE_BIND' && edge.from === 'past:slot')!
    const baseline = cut(r, 'CLOSE'), current = cut(r, 'CLOSE', { kind: 'object', id: 'b' }, null, 'current'), relevant = cut(r, 'CLOSE', { kind: 'object', id: 'a' }, null, 'relevant'), all = cut(r, 'CLOSE', null, null, 'all')
    expect(baseline.curves.filter(curve => curve.kind === 'connector')).toHaveLength(2)
    expect(current.curves.filter(curve => curve.kind === 'connector')).toHaveLength(0)
    expect(current.curves.some(curve => curve.id === now.id)).toBe(true)
    expect(current.flowPresentation.scopeExcluded).toContain(old.id)
    expect(relevant.curves.some(curve => curve.id === now.id)).toBe(true)
    expect(all.curves.some(curve => curve.id === old.id)).toBe(true)
    expect(all.curves.some(curve => curve.id === now.id)).toBe(true)
    for (const plan of [baseline, current, relevant, all]) accounted(r, plan)
  })
  it('retains a completed small world and bounded reference architecture without a current subject', () => {
    const r = rig([object('retained'), enter('done', null, [slot('done:slot', 'retained')]), exit('done')]), before = JSON.stringify(r.scene)
    const plan = cut(r, 'MEDIUM')
    for (const id of ['done', 'retained']) expect(plan.entities.has(id)).toBe(true)
    expect(plan.curves.some(curve => curve.id === r.scene.references[0].id)).toBe(true)
    expect(r.scene.liveStack).toEqual([]); expect(JSON.stringify(r.scene)).toBe(before)
    accounted(r, plan)
  })
  it('protects selected/current invocations and aggregates the remaining original 1000-frame live stack', () => {
    const r = rig(Array.from({ length: 1000 }, (_, i) => enter(`f${i}`, i ? `f${i - 1}` : null)), false), plan = cut(r, 'CLOSE', { kind: 'frame', id: 'f0' })
    expect(r.scene.liveStack).toHaveLength(1000)
    for (const id of ['f0', 'f999', 'f998', 'f997', 'f996']) expect(plan.entities.get(id)?.pinned).toBe(true)
    expect(plan.entities.size + plan.clusters.reduce((sum, cluster) => sum + cluster.members, 0)).toBe(1000)
    expect(plan.clusters.reduce((sum, cluster) => sum + cluster.members, 0)).toBeGreaterThan(0)
    accounted(r, plan)
  })
  it('promotes an explicitly selected graph flow beyond the recent suffix and pins its actual endpoints', () => {
    const inputs: Input[] = Array.from({ length: 100 }, (_, i) => object(`o${i}`))
    for (let i = 0; i < 100; i++) inputs.push(enter(`f${i}`, null, [slot(`f${i}:slot`, `o${i}`)]), bind(`f${i}`, `o${i}`), exit(`f${i}`))
    const r = rig(inputs), graph = seek(r.trace, r.trace.events.length).executionGraph!, old = graph.edges.find(edge => edge.kind === 'REFERENCE_BIND' && edge.from === 'f0:slot')!, plan = cut(r, 'CLOSE', { kind: 'flow', id: old.id }, null, 'all')
    expect(plan.curves.some(curve => curve.id === old.id)).toBe(true)
    expect(plan.entities.get('f0')?.pinned).toBe(true); expect(plan.entities.get('o0')?.pinned).toBe(true)
    const recorded = graph.edges.filter(edge => edge.kind === 'REFERENCE_BIND' && r.trace.events.find(event => event.eventId === edge.eventId)?.type === 'EXECUTION_FACT')
    expect(new Set(recorded.map(edge => edge.eventId)).size).toBe(100)
    expect(recorded).toHaveLength(200) // Recorded binding edges include both storage and observed value versions.
    const complete = new Set(r.flows.prefix(r.scene.cursor, r.scene).map(flow => flow.id))
    for (const edge of recorded) expect(complete.has(edge.id)).toBe(true)
    accounted(r, plan)
  })
  it('maps a selected sparse reference-array source cell to its exact actual completed binding', () => {
    const r = rig([object('target'), { type: 'ALLOCATE_ARRAY', objectId: 'array', displayId: 2, elementType: 'app.Item', length: 10001, observed: true, elements: [], metadata: { ownership: 'PROJECT', runtimeType: 'app.Item[]', packageName: 'app' } },
      { type: 'OBJECT_OBSERVE', objectId: 'array', arrayElements: [{ index: 10000, value: refValue('target') }] }])
    const reference = r.scene.references[0], plan = cut(r, 'CLOSE', { kind: 'reference', id: reference.id }), cell = plan.cellWindows.get('array')!.mapping.get(arrayElementSlotId('array', 10000))!
    expect(cell.index).toBe(10000)
    expect(plan.curves.find(curve => curve.id === reference.id)?.points[0]).toEqual(cell.port)
    expect(plan.entities.get('array')?.pinned).toBe(true)
    accounted(r, plan)
  })
  it('keeps exact sparse selection within the global cell budget across the original 20 arrays and 60 captured values each', () => {
    const inputs: Input[] = []
    for (let i = 0; i < 20; i++) {
      inputs.push({ type: 'ALLOCATE_ARRAY', objectId: `array${i}`, displayId: i + 1, elementType: 'int', length: 100001, observed: true, elements: [], metadata: { ownership: 'PROJECT', runtimeType: 'int[]', packageName: '' } })
      // The unchanged recorder contract accepts at most 32 observations per event.
      for (const [start, count] of [[0, 32], [32, 28]]) inputs.push({ type: 'OBJECT_OBSERVE', objectId: `array${i}`,
        arrayElements: Array.from({ length: count }, (_, offset) => { const index = start + offset; return { index: index === 59 ? 100000 : index, value: { kind: 'primitive', javaType: 'int', value: index } } }) })
    }
    const r = rig(inputs), id = arrayElementSlotId('array19', 100000), plan = cut(r, 'CLOSE', { kind: 'slot', id })
    expect(plan.cellWindows.get('array19')!.mapping.get(id)?.index).toBe(100000)
    expect([...plan.cellWindows.values()].reduce((sum, window) => sum + window.mapping.size, 0)).toBeLessThanOrEqual(budgets.CLOSE.cells)
    for (const id of r.scene.order.objects) { const node = r.scene.entities[id]; if (node.kind !== 'array') throw new Error('Expected array'); expect(node.cells).toHaveLength(60) }
    accounted(r, plan)
  })
  it('keeps immutable one-hop Focus context and dims every unrelated identity instead of deleting it', () => {
    const r = rig([object('b'), object('a', 'app.Item', [slot('a:field', 'b')]), object('unrelated')]), before = JSON.stringify(r.scene), plan = cut(r, 'MEDIUM', { kind: 'object', id: 'a' }, 'a')
    expect(plan.framing.focus?.neighbours).toEqual(['b'])
    for (const id of ['a', 'b']) expect(plan.entities.get(id)?.opacity).toBe(1)
    expect(plan.entities.get('unrelated')?.opacity).toBeLessThanOrEqual(.25)
    expect(JSON.stringify(r.scene)).toBe(before); accounted(r, plan)
  })
  it('frames project groups before bounded external groups in the original 3-project/200-JDK world', () => {
    const r = rig([...Array.from({ length: 200 }, (_, i) => object(`jdk${i}`, `java.Type${i}`, [], 'JDK')), ...Array.from({ length: 3 }, (_, i) => object(`project${i}`, `app.Type${i}`))]), plan = cut(r, 'FAR'), framing = home(r, plan)
    const project = framing.ids.filter(id => r.scene.entities[id].anchor.region === 'heap'), external = framing.ids.filter(id => r.scene.entities[id].anchor.region === 'library')
    expect(project).toEqual(['project0', 'project1', 'project2']); expect(external.length).toBeLessThanOrEqual(2)
    expect(r.scene.order.objects).toHaveLength(203); expect(plan.clusters.some(cluster => cluster.key.kind === 'ownership' && cluster.key.value === 'JDK')).toBe(true)
    accounted(r, plan)
  })
  it('limits bright Focus to six deterministic true neighbors while retaining the original 30 recorded references', () => {
    const r = rig([...Array.from({ length: 30 }, (_, i) => object(`neighbor${i}`)), object('subject', 'app.Item', Array.from({ length: 30 }, (_, i) => slot(`subject:${i}`, `neighbor${i}`)))]), plan = cut(r, 'CLOSE', { kind: 'object', id: 'subject' }, 'subject')
    expect(plan.framing.focus!.neighbours).toHaveLength(6)
    expect(plan.framing.focus!.neighbours).not.toContain('neighbor29')
    expect(r.scene.references).toHaveLength(30)
    for (const id of plan.framing.focus!.neighbours) expect(plan.entities.get(id)?.opacity).toBe(1)
    accounted(r, plan)
  })
  it('prioritizes nearby whole groups while preserving a remote selection across the original 100-near/1000-remote catalog', () => {
    const r = rig([...Array.from({ length: 100 }, (_, i) => object(`near${i}`, `near.Type${Math.floor(i / 5)}`)), ...Array.from({ length: 1000 }, (_, i) => object(`remote${i}`, 'remote.Item'))]), anchor = r.scene.entities.near0.anchor
    const tile = anchor.position.map(value => Math.floor(value / 12)) as [number, number, number], plan = cut(r, 'MEDIUM', { kind: 'object', id: 'remote999' }, null, null, tile)
    expect(plan.entities.get('remote999')?.pinned).toBe(true)
    expect([...plan.entities.keys()].filter(id => id.startsWith('near')).length).toBeGreaterThan(0)
    expect(plan.clusters.some(cluster => cluster.memberIds.includes('remote500'))).toBe(true)
    expect(r.scene.order.objects).toHaveLength(1100); accounted(r, plan)
  })
  it('fits actual supplied geometry and keeps an empty catalog finite without fabricated volumes', () => {
    const r = rig([object('a')]), anchor = r.scene.entities.a.anchor, points = anchorCorners(anchor)
    for (const axis of [0, 1, 2]) {
      expect((Math.min(...points.map(p => p[axis])) + Math.max(...points.map(p => p[axis]))) / 2).toBeCloseTo(anchor.position[axis])
      expect(Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis]))).toBeCloseTo(anchor.size[axis])
    }
    const empty = rig([]), framing = home(empty, cut(empty))
    expect(framing.ids).toEqual([]); expect(framing.pose.distance).toBeGreaterThan(0)
    expect([...framing.pose.target, framing.pose.distance].every(Number.isFinite)).toBe(true)
  })
  it('keeps terminal Home bounded while a distant selected object remains focused at its immutable recorded anchor', () => {
    const r = rig([object('first'), ...Array.from({ length: 1000 }, (_, i) => object(`middle${i}`)), object('last')]), before = JSON.stringify(r.scene.entities.last.anchor)
    const plan = cut(r, 'FAR', { kind: 'object', id: 'last' }, 'last'), framing = home(r, plan), pose = focusFraming(r.scene.entities.last.anchor, { yaw: 21, pitch: -8 }, safe, viewport)
    expect(plan.entities.get('last')).toMatchObject({ pinned: true, detail: 'CLOSE' })
    expect(framing.ids).toContain('first'); expect(framing.ids).not.toContain('last')
    expect([...pose.target, pose.distance].every(Number.isFinite)).toBe(true)
    expect(JSON.stringify(r.scene.entities.last.anchor)).toBe(before); accounted(r, plan)
  })
  it('retains three actual stdout observations and the immutable I/O volume without graphless flow invention', () => {
    const r = rig(Array.from({ length: 3 }, (_, i) => ({ type: 'CONSOLE_WRITE' as const, channel: 'stdout' as const, frameId: null, text: `${i}\n` }))), plan = cut(r, 'FAR'), before = r.scene.io[0]
    expect(before.lines).toBe(3); expect(before.anchor).toBe(r.projection.layout.anchors.stdout)
    expect(plan.curves.filter(curve => curve.kind === 'flow')).toHaveLength(0)
    expect(plan.flowPresentation.counts.recorded).toBe(0)
    expect(r.projection.project(1).io).toEqual([])
    expect(r.projection.project(r.trace.events.length).io[0].anchor).toBe(before.anchor)
    expect(rig([]).scene.io).toEqual([])
  })
})
