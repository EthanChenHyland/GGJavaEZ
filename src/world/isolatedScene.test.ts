import { describe, expect, it } from 'vitest'
import type { RuntimeSlot, TraceDocument, TraceEvent } from '../contracts/runtime'
import type { PresentationPlan, SceneModel } from '../contracts/worldV2'
import { loadPersonTrace } from '../examples/traces'
import { projectTrace } from '../testing/projectTrace'
import { planPresentation } from './presentationPlanner'

const trace = loadPersonTrace(), projection = projectTrace(trace), at = projection.project
const focus = (scene: SceneModel, layout: typeof projection.layout, id: string) => planPresentation({ scene, layout, detailLevel: 'MEDIUM', selection: null, focusTargetId: id, trace: { active: false, scope: 'relevant' } })
function complete(plan: PresentationPlan, scene: SceneModel) {
  const ids = [...plan.entities.keys(), ...plan.clusters.flatMap(cluster => cluster.memberIds)]
  expect(ids.length).toBe(Object.keys(scene.entities).length)
  expect(new Set(ids)).toEqual(new Set(Object.keys(scene.entities)))
}

describe('Focus over the full production catalog', () => {
  it('focuses a field owner in place without deleting the runtime world', () => {
    const scene = at(18), object = scene.entities[scene.order.objects[0]]
    if (object.kind !== 'object') throw new Error('Expected object')
    const before = JSON.stringify(scene), plan = focus(scene, projection.layout, object.groups[0].rows[0].slotId)
    expect(plan.framing.focus?.targetId).toBe(object.id)
    expect(plan.entities.get(object.id)).toMatchObject({ mode: 'detailed', detail: 'CLOSE', opacity: 1 })
    expect(scene.order.frames).toHaveLength(3)
    expect(object.anchor).toBe(projection.layout.anchors[object.id])
    complete(plan, scene); expect(JSON.stringify(scene)).toBe(before)
    for (const id of plan.framing.focus!.neighbours) expect(plan.entities.get(id)!.opacity).toBe(1)
  })

  it('keeps the focused method geometry and readable detail as the method and main complete', () => {
    const id = at(18).order.frames.at(-1)!
    for (const cursor of [18, 19, 21]) {
      const scene = at(cursor), plan = focus(scene, projection.layout, id), frame = scene.entities[id]
      if (frame.kind !== 'frame') throw new Error('Expected frame')
      expect(plan.framing.focus?.targetId).toBe(id)
      expect(plan.entities.get(id)).toMatchObject({ detail: 'CLOSE', opacity: 1 })
      expect(frame.anchor).toBe(projection.layout.anchors[id])
      expect(frame.live).toBe(cursor === 18)
      complete(plan, scene)
    }
  })

  it('retains a structural absence message without inventing the future focused object', () => {
    const scene = at(1), plan = focus(scene, projection.layout, 'object:person:17')
    expect(scene.entities['object:person:17']).toBeUndefined()
    expect(plan.framing.focus).toBeNull()
    expect(plan.structural.some(item => item.text === 'Not present at this point in time')).toBe(true)
    complete(plan, scene)
  })
})

// Explicit normalized unit records replace the former fabricated overlap scene.
function fixture(wide = false, registry = false) {
  const ref = (id: string) => ({ kind: 'reference' as const, javaType: 'Node', objectId: id })
  const slot = (id: string, target: string): RuntimeSlot => ({ id, name: id, javaType: 'Node', value: ref(target) })
  const inputs: object[] = [{ type: 'PROGRAM_START' }]
  if (wide) for (let index = 0; index < 50; index++) inputs.push({ type: 'ALLOCATE_OBJECT', objectId: `object:${index}`, displayId: index + 1, className: 'Node', fields: [] })
  else inputs.push({ type: 'ALLOCATE_OBJECT', objectId: 'c', displayId: 3, className: 'Node', fields: [] },
    { type: 'ALLOCATE_OBJECT', objectId: 'b', displayId: 2, className: 'Node', fields: [slot('b.next', 'c')] },
    { type: 'ALLOCATE_OBJECT', objectId: 'a', displayId: 1, className: 'Node', fields: [slot('a.next', 'b')] })
  const enter = (frameId: string, callerFrameId: string | null, locals: RuntimeSlot[] = []) => inputs.push({ type: 'ENTER_METHOD', frameId, callerFrameId, className: 'Unit', methodName: frameId, locals })
  const exit = (frameId: string) => inputs.push({ type: 'EXIT_METHOD', frameId })
  enter('caller', null); enter('subject', 'caller', wide ? Array.from({ length: 50 }, (_, index) => slot(`root:${index}`, `object:${index}`)) : [slot('root', 'a')])
  enter('child', 'subject'); enter('grandchild', 'child'); exit('grandchild'); exit('child'); exit('subject')
  enter('sibling', 'caller'); exit('sibling'); exit('caller')
  if (registry) inputs.push({ type: 'CLASS_OBSERVE', classId: 'jvm:class:Registry', className: 'Registry', initialization: 'observed', fields: [slot('Registry.current', 'a')] },
    {type:'SET_STATIC',classId:'jvm:class:Registry',slotId:'Registry.current',value:ref('a')})
  inputs.push({ type: 'PROGRAM_END' })
  const events = inputs.map((input, seq) => ({ ...input, seq, eventId: `unit/focus/${seq}`, source: null, label: 'Explicit unit Focus fixture', importance: 'normal' })) as TraceEvent[]
  const document: TraceDocument = { schemaVersion: 2, demoId: 'unit/focus-cut', sourceFiles: [], events }, current = projectTrace(document)
  return { document, current, scene: current.project(events.length) }
}

describe('deterministic one-hop Focus context', () => {
  it('keeps reference neighbors bright while retaining captured callers and children as dimmed context', () => {
    const { current, scene } = fixture(), saved = JSON.stringify(scene), plan = focus(scene, current.layout, 'subject')
    expect(plan.framing.focus?.neighbours).toEqual(['a'])
    expect(plan.entities.get('subject')!.opacity).toBe(1)
    expect(plan.entities.get('a')!.opacity).toBe(1)
    for (const id of ['caller', 'child', 'grandchild', 'sibling']) {
      expect(scene.entities[id].anchor).toBe(current.layout.anchors[id])
      expect(plan.entities.get(id)!.opacity).toBeLessThanOrEqual(.25)
    }
    expect(scene.callLinks.map(link => [link.callerId, link.calleeId])).toContainEqual(['caller', 'subject'])
    expect(scene.callLinks.map(link => [link.callerId, link.calleeId])).toContainEqual(['subject', 'child'])
    complete(plan, scene); expect(JSON.stringify(scene)).toBe(saved)
  })

  it('brightens inbound and outbound one-hop relationships while keeping two-hop objects dimmed', () => {
    const { current, scene } = fixture(), plan = focus(scene, current.layout, 'a')
    expect(plan.framing.focus?.neighbours).toEqual(['subject', 'b'])
    for (const id of ['a', 'subject', 'b']) expect(plan.entities.get(id)!.opacity).toBe(1)
    expect(plan.entities.get('c')!.opacity).toBeLessThanOrEqual(.25)
    complete(plan, scene)
  })

  it('includes actual class storage and its recorded static-to-heap relationship', () => {
    const { current, scene } = fixture(false, true), plan = focus(scene, current.layout, 'jvm:class:Registry')
    expect(plan.framing.focus?.neighbours).toEqual(['a'])
    expect(scene.references.some(ref => ref.sourceId === 'jvm:class:Registry' && ref.sourceSlotId === 'Registry.current' && ref.targetId === 'a')).toBe(true)
    expect(plan.entities.get('jvm:class:Registry')!.opacity).toBe(1)
    expect(plan.entities.get('a')!.opacity).toBe(1)
    complete(plan, scene)
  })

  it('bounds bright high-degree context at six deterministic neighbors while preserving every recorded identity', () => {
    const { current, scene } = fixture(true), first = focus(scene, current.layout, 'subject'), second = focus(scene, current.layout, 'subject')
    expect(first.framing.focus!.neighbours).toHaveLength(6)
    expect(first.framing.focus!.neighbours).toEqual(second.framing.focus!.neighbours)
    expect([...first.entities].filter(([, item]) => item.opacity === 1)).toHaveLength(7)
    for (const cluster of first.clusters) expect(cluster.opacity).toBeLessThanOrEqual(.25)
    expect(scene.references).toHaveLength(50)
    complete(first, scene)
  })

  it('keeps canonical focused geometry through replay, pause and independently known process termination', () => {
    const { document, current } = fixture(), end = current.project(document.events.length)
    const subject = end.entities.subject, entered = document.events.find(event => event.type === 'ENTER_METHOD' && event.frameId === 'subject')!
    const contexts = [projectTrace(document, { sessionEnded: false }), projectTrace(document, { sessionEnded: true })]
    for (const context of contexts) for (const cursor of [entered.seq + 1, document.events.length, entered.seq + 1]) {
      const scene = context.project(cursor), plan = focus(scene, context.layout, 'subject')
      expect(scene.entities.subject.anchor.position).toEqual(subject.anchor.position)
      expect(scene.entities.subject.anchor.size).toEqual(subject.anchor.size)
      expect(plan.entities.get('subject')).toMatchObject({ detail: 'CLOSE', opacity: 1 })
      complete(plan, scene)
    }
    const prior = current.project(entered.seq), plan = focus(prior, current.layout, 'subject')
    expect(prior.entities.subject).toBeUndefined(); expect(plan.framing.focus).toBeNull()
    expect(plan.structural.some(item => item.text === 'Not present at this point in time')).toBe(true)
    const prefix={...document,events:document.events.slice(0,entered.seq+1)}
    const paused=projectTrace(prefix,{pausedAtLiveHead:true,sessionEnded:false}),pausedScene=paused.project(prefix.events.length)
    const pausedFrame=pausedScene.entities.subject
    if(pausedFrame.kind!=='frame')throw new Error('Expected paused frame')
    expect(pausedFrame.status.kind).toBe('paused')
    expect(focus(pausedScene,paused.layout,'subject').entities.get('subject')).toMatchObject({detail:'CLOSE',opacity:1})
    expect(pausedFrame.anchor.position).toEqual(subject.anchor.position)
  })
})
