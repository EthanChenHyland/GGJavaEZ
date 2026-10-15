import { describe, expect, it } from 'vitest'
import type { TraceDocument, TraceEvent } from '../contracts/runtime'
import type { PresentationPlan, SceneModel } from '../contracts/worldV2'
import { projectTrace } from '../testing/projectTrace'
import { planPresentation } from './presentationPlanner'
import { budgets } from '../theme/tokens'

type EventInput<T = TraceEvent> = T extends TraceEvent ? Omit<T, 'eventId' | 'seq' | 'source' | 'label' | 'importance'> : never
// Same 1756 invocations / 136 objects; registered normalized unit records replace
// the former fabricated scene with every anchor at the same world coordinate.
function fixture(live = false) {
  const events: TraceEvent[] = []
  const emit = (event: EventInput) => events.push({ ...event, eventId: `unit/retained/${events.length}`, seq: events.length,
    source: null, label: 'Explicit retained-world unit record', importance: 'quiet' })
  emit({ type: 'PROGRAM_START' })
  for (let index = 0; index < 136; index++) emit({ type: 'ALLOCATE_OBJECT', objectId: `o${index}`, displayId: index + 1,
    className: 'Node', fields: [], metadata: { ownership: 'PROJECT', runtimeType: 'Node', packageName: '' } })
  const enter = (index: number, callerFrameId: string | null) => emit({ type: 'ENTER_METHOD', frameId: `f${index}`, callerFrameId,
    className: 'Unit', methodName: 'call', locals: index === 1 ? [{ id: 's', name: 's', javaType: 'Node', value: { kind: 'reference', javaType: 'Node', objectId: 'o1' } }] : [] })
  enter(0, null)
  for (let index = live ? 3 : 1; index < 1756; index++) { enter(index, 'f0'); emit({ type: 'EXIT_METHOD', frameId: `f${index}` }) }
  if (live) { enter(1, 'f0'); enter(2, 'f1') }
  else { emit({ type: 'EXIT_METHOD', frameId: 'f0' }); emit({ type: 'PROGRAM_END' }) }
  const trace: TraceDocument = { schemaVersion: 2, demoId: `unit/retained/${live ? 'live' : 'completed'}`, sourceFiles: [], events }
  const projection = projectTrace(trace)
  return { projection, scene: projection.project(events.length) }
}
const completed = fixture()
function partition(plan: PresentationPlan, scene: SceneModel) {
  const ids = [...plan.entities.keys(), ...plan.clusters.flatMap(cluster => cluster.memberIds)]
  expect(ids).toHaveLength(1892)
  expect(new Set(ids)).toEqual(new Set(Object.keys(scene.entities)))
  expect(plan.accounting.total).toBe(1892)
  expect(plan.accounting.detailed + plan.accounting.quiet + plan.accounting.clustered).toBe(1892)
}
function bounded(plan: PresentationPlan, scene: SceneModel) {
  const level = budgets[plan.detailLevel]
  for (const category of ['frames', 'objects'] as const) expect([...plan.entities].filter(([id, item]) => item.mode === 'detailed' && (category === 'frames' ? scene.entities[id].kind === 'frame' : scene.entities[id].kind === 'object')).length).toBeLessThanOrEqual(level[category])
}

describe('bounded production detail in retained runtime worlds', () => {
  it('bounds faces without deleting records and reuses immutable canonical anchors', () => {
    const { projection, scene } = completed, entries = new Map(Object.entries(scene.entities))
    expect(scene.order.frames).toHaveLength(1756); expect(scene.order.objects).toHaveLength(136)
    for (const detailLevel of ['FAR', 'MEDIUM', 'CLOSE'] as const) {
      const plan = planPresentation({ scene, layout: projection.layout, detailLevel, selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
      bounded(plan, scene); partition(plan, scene)
      for (const id of Object.keys(scene.entities)) { expect(scene.entities[id]).toBe(entries.get(id)); expect(scene.entities[id].anchor).toBe(projection.layout.anchors[id]) }
    }
    expect(new Set(scene.order.frames.map(id => scene.entities[id].anchor.position.join(','))).size).toBe(1756)
  })

  it('restores any selected historical frame/object within the current nominal detail budget', () => {
    const { projection, scene } = completed
    for (const selection of [{ kind: 'frame', id: 'f0' }, { kind: 'object', id: 'o0' }] as const) {
      const plan = planPresentation({ scene, layout: projection.layout, detailLevel: 'CLOSE', selection, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
      expect(plan.entities.get(selection.id)).toMatchObject({ mode: 'detailed', pinned: true })
      bounded(plan, scene); partition(plan, scene)
      expect(scene.entities[selection.id].anchor).toBe(projection.layout.anchors[selection.id])
    }
  })

  it('protects both recorded selected-reference endpoints and the actual three-frame live stack', () => {
    const { projection, scene } = fixture(true), before = scene.references
    expect(scene.liveStack).toEqual(['f0', 'f1', 'f2'])
    const reference = scene.references.find(reference => reference.sourceId === 'f1' && reference.sourceSlotId === 's' && reference.targetId === 'o1')!
    expect(reference).toBeDefined()
    const plan = planPresentation({ scene, layout: projection.layout, detailLevel: 'CLOSE', selection: { kind: 'reference', id: reference.id }, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
    for (const id of ['f0', 'f1', 'f2', 'o1']) expect(plan.entities.get(id)).toMatchObject({ mode: 'detailed', pinned: true })
    expect(scene.entities.o1.anchor).toBe(projection.layout.anchors.o1)
    expect(scene.references).toBe(before)
    expect(plan.curves.some(curve => curve.id === reference.id)).toBe(true)
    bounded(plan, scene); partition(plan, scene)
  })
})
