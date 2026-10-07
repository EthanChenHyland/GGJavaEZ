import { describe, expect, it } from 'vitest'
import type { DetailLevel, SceneArrayCell, SceneClassNode, SceneFrameNode, SceneModel, SceneObjectNode, SceneReferenceEdge, WorldAnchor } from '../contracts/world'
import type { SemanticTransition } from '../motion/semanticTransition'
import { focusReferenceBudget, homeExternalGroupBudget, homeGroupBudget, planSpatialPresentation, presentationBounds, spatialBudgets } from './spatialPresentation'

const anchor = (id: string, index = 0, region: WorldAnchor['region'] = 'heap'): WorldAnchor => ({ entityId: id, region, position: [region === 'heap' ? 12 : -5, -index * 4.25, -index * 1.8], size: [5.1, 3.6, 1.6], ports: {}, bodyPort: [12, -index * 4.25, -index * 1.8] })
const frame = (id: string, index: number, caller: string | null = null): SceneFrameNode => ({ kind: 'frame', id, label: 'execute()', className: 'app.Work', depth: index, active: false, historical: true, callerFrameId: caller, anchor: anchor(id, index, 'stack'), slots: [] })
const object = (id: string, index: number, className = 'app.Item'): SceneObjectNode => ({ kind: 'object', id, className, label: `${className} #${index}`, displayId: index, anchor: anchor(id, index), fields: [] })
const catalog = (frames: SceneFrameNode[] = [], objects: SceneObjectNode[] = []): SceneModel => ({ frames, objects, references: [], detailLevel: 'meso', activeEventId: null, layoutKind: 'spatial2' })
const ref = (id: string, sourceId: string, targetId: string): SceneReferenceEdge => ({ id, source: { kind: 'frame', frameId: sourceId, slotId: `${sourceId}:slot` }, targetObjectId: targetId, from: [0, 0, 0], to: [12, 0, 0] })
const flow = (id: string, seq: number, from: string, to: string): SemanticTransition => ({ id, seq, kind: 'reference', label: 'bind', evidence: 'observed', from: { kind: 'frame', id: from }, to: { kind: 'object', id: to }, source: null, importance: 'normal' })

describe('adaptive spatial representation', () => {
  it.each<DetailLevel>(['macro', 'meso', 'micro'])('strictly caps %s faces, neighbors, links and picking even under large fan-in', level => {
    const frames = Array.from({ length: 1000 }, (_, index) => ({ ...frame(`f${index}`, index, index ? 'f0' : null), active: true, historical: false }))
    const objects = Array.from({ length: 1000 }, (_, index) => object(`o${index}`, index))
    const scene = catalog(frames, objects)
    scene.references = objects.flatMap(node => frames.slice(0, 4).map(source => ref(`${source.id}:${node.id}`, source.id, node.id)))
    const plan = planSpatialPresentation(scene, { kind: 'object', id: 'o999' }, { detailLevel: level, flowDisplay: 'all' })
    const cap = spatialBudgets[level]
    expect(plan.scene.frames.length).toBeLessThanOrEqual(cap.frames)
    expect(plan.scene.objects.length).toBeLessThanOrEqual(cap.objects)
    expect(plan.scene.references.length).toBeLessThanOrEqual(cap.references)
    expect(plan.labelledClusters.length).toBeLessThanOrEqual(cap.clusters)
    expect(plan.pickableQuiet.length).toBeLessThanOrEqual(cap.picking)
    expect(plan.quietVolumes.length).toBeLessThanOrEqual(cap.quiet)
    expect(plan.scene.objects).toContain(objects[999])
    expect(plan.geometryScene.frames.length + plan.geometryScene.objects.length).toBeLessThanOrEqual(cap.frames + cap.objects + cap.classes + cap.picking + cap.clusters)
  })

  it('macro counts actual type and caller-branch records while preserving their stable first member', () => {
    const frames = [frame('root', 0), ...Array.from({ length: 1000 }, (_, index) => frame(`child${index}`, index + 1, 'root'))]
    const objects = Array.from({ length: 1000 }, (_, index) => object(`o${index}`, index))
    const scene = catalog(frames, objects)
    const plan = planSpatialPresentation(scene, null, { detailLevel: 'macro' })
    expect(plan.scene.frames).toHaveLength(0)
    expect(plan.scene.objects).toHaveLength(0)
    const heap = plan.clusters.find(cluster => cluster.kind === 'object')!
    const branch = plan.clusters.find(cluster => cluster.kind === 'frame' && cluster.count === 1000)!
    expect(heap.count).toBe(1000)
    expect(heap.quietCount).toBe(1000)
    expect(heap.anchor).toBe(objects[0].anchor)
    expect(branch.anchor).toBe(frames[1].anchor)
    expect(plan.homeBounds!.size[1]).toBeLessThan(20)
    expect(plan.homeScene.frames).toHaveLength(2)
    const movedView = planSpatialPresentation(scene, { kind: 'object', id: 'o500' }, { detailLevel: 'micro', viewTarget: [500, 300, 40] })
    expect(movedView.clusters.find(cluster => cluster.kind === 'object')!.anchor).toBe(heap.anchor)
    expect(movedView.scene.objects.find(node => node.id === 'o500')).toBe(objects[500])
  })

  it('recursive descendants aggregate without conflating a different caller', () => {
    const frames = [frame('root', 0), frame('a', 1, 'root'), frame('b', 2, 'a'), frame('c', 3, 'b'), frame('other-root', 4), frame('d', 5, 'other-root')]
    const plan = planSpatialPresentation(catalog(frames), null, { detailLevel: 'macro' })
    expect(plan.clusters.find(cluster => cluster.representative.id === 'a')!.count).toBe(3)
    expect(plan.clusters.find(cluster => cluster.representative.id === 'd')!.count).toBe(1)
  })

  it('describes opaque caller relationships as observed ancestry', () => {
    const ancestor = { ...frame('ancestor', 0), label: 'outer()' }
    const child = { ...frame('callback', 1, ancestor.id), callerEvidence: 'unavailable' as const }
    const plan = planSpatialPresentation(catalog([ancestor, child]), null, { detailLevel: 'macro' })
    expect(plan.clusters.find(cluster => cluster.representative.id === child.id)?.label).toContain('observed ancestor outer()')
    expect(child.callerEvidence).toBe('unavailable')
  })

  it('separates actual ownership metadata and exposes selected class references', () => {
    const objects = [object('project', 0), { ...object('library', 1), metadata: { ownership: 'LIBRARY' as const, runtimeType: 'app.Item', packageName: 'app' } }]
    const klass: SceneClassNode = { kind: 'class', id: 'class:Registry', label: 'Registry', className: 'app.Registry', initialization: 'completed', fields: [], anchor: anchor('class:Registry', 0, 'class') }
    const scene = { ...catalog([], objects), classes: [klass], references: [{ ...ref('static-edge', '', 'project'), source: { kind: 'class' as const, classId: klass.id, slotId: 'Registry.item' } }] }
    const far = planSpatialPresentation({ ...scene, references: [] }, null, { detailLevel: 'macro' })
    expect(far.clusters.filter(cluster => cluster.kind === 'object')).toHaveLength(2)
    const selected = planSpatialPresentation(scene, { kind: 'reference', id: 'static-edge' }, { detailLevel: 'macro' })
    expect(selected.scene.classes).toContain(klass)
    expect(selected.scene.objects).toContain(objects[0])
    expect(selected.scene.references[0]).toBe(scene.references[0])
  })

  it('defaults to relevant links and honors current/all within the same cap', () => {
    const frames = [frame('current', 0), frame('past', 1)]
    const objects = [object('a', 0), object('b', 1)]
    const scene = catalog(frames, objects)
    scene.frames[0] = { ...frames[0], active: true, historical: false }
    scene.references = [ref('now', 'current', 'a'), { ...ref('old', 'past', 'b'), historical: true }]
    const history = [flow('old-flow', 1, 'past', 'b'), flow('now-flow', 2, 'current', 'a')]
    const relevant = planSpatialPresentation(scene, null, { flowHistory: history })
    expect(relevant.scene.references.map(edge => edge.id)).toEqual(['now'])
    expect(relevant.flows.map(item => item.id)).toEqual(['now-flow'])
    const current = planSpatialPresentation(scene, { kind: 'object', id: 'b' }, { flowDisplay: 'current', flowHistory: history, transition: history[1] })
    expect(current.scene.references.map(edge => edge.id)).toEqual(['now'])
    expect(current.flows.map(item => item.id)).toEqual(['now-flow'])
    const all = planSpatialPresentation(scene, null, { flowDisplay: 'all', flowHistory: history })
    expect(all.scene.references).toHaveLength(2)
    expect(all.flows).toHaveLength(2)
  })

  it('retains bounded reference architecture when a small completed world has no current subject', () => {
    const scene = catalog([frame('done', 0)], [object('retained', 0)])
    scene.references = [{ ...ref('retained-link', 'done', 'retained'), historical: true }]
    const far = planSpatialPresentation(scene, null, { detailLevel: 'macro' })
    expect(far.scene.frames[0]).toBe(scene.frames[0])
    expect(far.scene.objects[0]).toBe(scene.objects[0])
    expect(far.scene.references[0]).toBe(scene.references[0])
    expect(far.quietVolumes).toHaveLength(0)
  })

  it('preserves selected and current invocations inside a live stack larger than the face cap', () => {
    const frames = Array.from({ length: 1000 }, (_, index) => ({ ...frame(`f${index}`, index, index ? `f${index - 1}` : null), historical: false, active: index === 999 }))
    const plan = planSpatialPresentation(catalog(frames), { kind: 'frame', id: 'f0' }, { detailLevel: 'micro' })
    expect(plan.scene.frames).toHaveLength(spatialBudgets.micro.frames)
    expect(plan.scene.frames).toContain(frames[0])
    expect(plan.scene.frames).toContain(frames[999])
    expect(plan.scene.frames).toContain(frames[998])
    expect(plan.quiet.length).toBe(1000 - spatialBudgets.micro.frames)
  })

  it('promotes an explicitly selected old flow and its endpoints beyond the recent suffix', () => {
    const frames = Array.from({ length: 100 }, (_, index) => frame(`f${index}`, index))
    const objects = Array.from({ length: 100 }, (_, index) => object(`o${index}`, index))
    const history = frames.map((node, index) => flow(`flow${index}`, index, node.id, objects[index].id))
    const plan = planSpatialPresentation(catalog(frames, objects), null, { selectedFlowId: 'flow0', flowHistory: history })
    expect(plan.flows[0]).toBe(history[0])
    expect(plan.scene.frames).toContain(frames[0])
    expect(plan.scene.objects).toContain(objects[0])
  })

  it('retains array reference source cells when promoting completed topology', () => {
    const a = object('array', 0, 'app.Item[]')
    const cell: SceneArrayCell = { id: 'array:element:10000', index: 10000, name: '[10000]', javaType: 'app.Item', value: { kind: 'reference', javaType: 'app.Item', objectId: 'target' }, port: [12, 0, -20], anchor: anchor('array:element:10000', 0) }
    const array = { ...a, array: { elementType: 'app.Item', length: 10001, cells: [cell] } }
    const scene = catalog([], [array, object('target', 0)])
    scene.references = [{ ...ref('cell-edge', '', 'target'), source: { kind: 'object', objectId: array.id, slotId: cell.id } }]
    const plan = planSpatialPresentation(scene, null, { detailLevel: 'macro' })
    expect(plan.faceIds.has(array.id)).toBe(true)
    expect(plan.cellWindows.get(array.id)).toContain(cell)
    expect(plan.scene.references[0]).toBe(scene.references[0])
    expect(plan.geometryScene.objects.find(node => node.id === array.id)?.array?.cells[0]).toBe(cell)
  })

  it('keeps sparse selected cells exact inside a global cell budget', () => {
    const arrays = Array.from({ length: 20 }, (_, arrayIndex) => {
      const node = object(`array${arrayIndex}`, arrayIndex, 'int[]')
      const cells: SceneArrayCell[] = Array.from({ length: 60 }, (_, index) => ({ id: `${node.id}:element:${index === 59 ? 100000 : index}`, name: `[${index}]`, javaType: 'int', value: { kind: 'primitive', javaType: 'int', value: index }, index: index === 59 ? 100000 : index, port: [12, 0, -index], anchor: anchor(`${node.id}:element:${index}`, index) }))
      return { ...node, array: { elementType: 'int', length: 100001, cells } }
    })
    const selected = arrays[19].array.cells[59]
    const scene = catalog([], arrays)
    const plan = planSpatialPresentation(scene, { kind: 'slot', id: selected.id }, { detailLevel: 'micro' })
    expect(plan.scene.objects).toContain(arrays[19])
    expect(plan.cellWindows.get(arrays[19].id)).toContain(selected)
    expect([...plan.cellWindows.values()].reduce((sum, cells) => sum + cells.length, 0)).toBeLessThanOrEqual(spatialBudgets.micro.cells)
    expect(arrays[19].array.cells).toHaveLength(60)
    expect(selected.index).toBe(100000)
  })

  it('Focus retains one-hop context with immutable entities and no unrelated clusters', () => {
    const a = object('a', 0); const b = object('b', 1); const unrelated = object('unrelated', 2)
    const scene = catalog([], [a, b, unrelated])
    scene.references = [{ ...ref('a:b', '', 'b'), source: { kind: 'object', objectId: 'a', slotId: 'a:field' } }]
    const before = JSON.stringify(scene)
    const plan = planSpatialPresentation(scene, { kind: 'object', id: 'a' }, { focus: true })
    expect(plan.scene.objects).toEqual([a, b])
    expect(plan.scene.objects[0]).toBe(a)
    expect(plan.clusters).toHaveLength(0)
    expect(plan.scene.references[0]).toBe(scene.references[0])
    expect(JSON.stringify(scene)).toBe(before)
  })

  it('Home prioritizes project groups and excludes remote external catalog extents', () => {
    const project = Array.from({ length: 3 }, (_, index) => ({ ...object(`project${index}`, index, `app.Type${index}`), metadata: { ownership: 'PROJECT' as const, runtimeType: `app.Type${index}`, packageName: 'app' } }))
    const jdk = Array.from({ length: 200 }, (_, index) => ({ ...object(`jdk${index}`, index + 1000, `java.Type${index}`), metadata: { ownership: 'JDK' as const, runtimeType: `java.Type${index}`, packageName: 'java' } }))
    const scene = catalog([], [...jdk, ...project])
    const plan = planSpatialPresentation(scene, null, { detailLevel: 'macro' })
    expect(plan.homeScene.objects.length).toBeLessThanOrEqual(homeGroupBudget)
    expect(plan.homeScene.objects.filter(node => node.metadata?.ownership === 'JDK').length).toBeLessThanOrEqual(homeExternalGroupBudget)
    expect(plan.homeScene.objects).toEqual(project)
    expect(plan.labelledClusters.map(cluster => cluster.representative)).toEqual(project)
    expect(plan.geometryScene.objects).toEqual(project)
    expect(plan.quietVolumes).toHaveLength(0)
    expect(plan.homeBounds!.size[1]).toBeLessThan(20)
    expect(scene.objects).toHaveLength(203)
    for (const node of project) expect(plan.homeScene.objects).toContain(node)
  })

  it('Focus caps nearby true references and excludes remote endpoints', () => {
    const center = object('subject', 0)
    const neighbors = Array.from({ length: 30 }, (_, index) => object(`neighbor${index}`, index + 1))
    const scene = catalog([], [center, ...neighbors])
    scene.references = neighbors.map(node => ({ ...ref(`subject:${node.id}`, '', node.id), source: { kind: 'object' as const, objectId: center.id, slotId: `subject:${node.id}` } }))
    const plan = planSpatialPresentation(scene, { kind: 'object', id: center.id }, { focus: true, detailLevel: 'micro' })
    expect(plan.scene.references.length).toBeLessThanOrEqual(focusReferenceBudget)
    expect(plan.scene.objects).toContain(center)
    expect(plan.scene.objects).not.toContain(neighbors[29])
    for (const edge of plan.scene.references) expect(scene.references).toContain(edge)
  })

  it('samples quiet detail near the camera target while preserving a remote selected identity', () => {
    const nearby = Array.from({ length: 100 }, (_, index) => ({ ...object(`near${index}`, index), anchor: anchor(`near${index}`, index % 5) }))
    const remote = Array.from({ length: 1000 }, (_, index) => object(`remote${index}`, index + 1000))
    const plan = planSpatialPresentation(catalog([], [...nearby, ...remote]), { kind: 'object', id: 'remote999' }, {
      detailLevel: 'meso', viewTarget: [12, 0, 0], viewPosition: [12, 0, 20],
    })
    expect(plan.scene.objects).toContain(remote[999])
    expect(plan.quietVolumes.length).toBeGreaterThan(0)
    for (const node of plan.quietVolumes) expect(nearby).toContain(node)
    for (const node of plan.scene.objects.filter(node => node.id !== 'remote999')) expect(nearby).toContain(node)
    expect(plan.quiet).toContain(remote[0])
  })

  it('derives bounds from the supplied physical volumes and handles empty catalogs', () => {
    const node = object('a', 2)
    expect(presentationBounds([node.anchor])!.center).toEqual(node.anchor.position)
    presentationBounds([node.anchor])!.size.forEach((value, axis) => expect(value).toBeCloseTo(node.anchor.size[axis]))
    expect(planSpatialPresentation(catalog(), null).homeBounds).toBeUndefined()
  })

  it('terminal Home summarizes distant last effects while an explicit selection remains framed in place', () => {
    const first=object('first',0), last=object('last',1000)
    const scene=catalog([], [first,last])
    const event={type:'PROGRAM_END' as const,eventId:'end',seq:1,source:null,label:'complete',importance:'major' as const}
    const transition=flow('last-effect',0,'unknown-caller',last.id)
    const overview=planSpatialPresentation(scene,null,{detailLevel:'macro',event,transition})
    expect(overview.scene.objects).toContain(last)
    expect(overview.homeScene.objects).toEqual([first])
    expect(overview.homeBounds!.size[1]).toBeLessThan(10)
    const selected=planSpatialPresentation(scene,{kind:'object',id:last.id},{detailLevel:'macro',event,transition})
    expect(selected.homeScene.objects).toContain(last)
    expect(selected.scene.objects.find(node=>node.id===last.id)?.anchor).toBe(last.anchor)
    expect(last.anchor.position).toEqual([12,-4250,-1800])
  })

  it('retains recorded I/O without visible flow and frames its immutable reserved volume', () => {
    const io = { id: 'stdout' as const, observations: 3, preview: 'done', anchor: { ...anchor('io:stdout', 0, 'io'), position: [7, 2, 1] as const, size: [2.8, 0.8, 0.55] as const, bodyPort: [7, 2, 1.3] as const } }
    const scene = { ...catalog(), io: [io] }
    const plan = planSpatialPresentation(scene, null, { detailLevel: 'macro' })
    expect(plan.scene.io?.[0]).toBe(io)
    expect(plan.homeScene.io?.[0]).toBe(io)
    expect(plan.geometryScene.io?.[0]).toBe(io)
    expect(plan.homeBounds?.center).toEqual(io.anchor.position)
    expect(plan.flows).toHaveLength(0)
    expect(planSpatialPresentation(catalog(), null).scene.io).toBeUndefined()
  })
})
