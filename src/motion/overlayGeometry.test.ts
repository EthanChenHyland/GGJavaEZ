import { expect, it } from 'vitest'
import fc from 'fast-check'
import { loadPersonTrace, loadArrayTrace } from '../examples/traces'
import { seek } from '../runtime'
import { historyForTrace } from '../runtime/history'
import { createLayoutEngine } from '../world/layoutEngine'
import { createSceneProjector } from '../world/sceneProjector'
import { planPresentation } from '../world/presentationPlanner'
import { createVirtualClock } from './clock'
import { createTransitionPlayer, type AnimationStep } from './transitionPlayer'
import { motionCurve, motionSubjects, overlayEmphasis } from './overlayGeometry'
import type { TraceDocument } from '../contracts/runtime'

function view(trace: TraceDocument, cursor: number) {
  const layout = createLayoutEngine(); layout.append(trace.events)
  const scene = createSceneProjector(trace).project(seek(trace, cursor), layout.state, { sessionEnded: false, pausedAtLiveHead: false, liveHead: trace.events.length, recording: { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false } })
  const plan = planPresentation({ scene, layout: layout.state, detailLevel: 'CLOSE', selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } })
  return { scene, plan }
}
function step(trace: TraceDocument, cursor: number): AnimationStep {
  const clock = createVirtualClock(), player = createTransitionPlayer({ trace, history: historyForTrace(trace) }, clock)
  player.cursorChanged({ from: cursor - 1, to: cursor, reason: 'play', speed: 1, reducedMotion: false })
  const overlay = player.sample(clock.now(), () => true).overlays[0]
  if (!overlay) throw new Error('Expected an actual recorded step')
  return overlay.step
}
it('allocation outline scales .92→1 without changing any canonical body, port or face anchor (100 runs)', () => {
  const trace = loadPersonTrace(), allocation = step(trace, 9), { scene, plan } = view(trace, 9)
  const before = JSON.stringify(scene), subjects = motionSubjects(scene, plan)
  expect(overlayEmphasis({ step: allocation, progress: 0, static: false }).scale).toBe(.92)
  expect(overlayEmphasis({ step: allocation, progress: 1, static: false })).toEqual({ scale: 1, alpha: 0 })
  expect(subjects.get(allocation.subjects[0])?.anchor).toBe(scene.entities[allocation.subjects[0]].anchor)
  fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), progress => {
    const emphasis = overlayEmphasis({ step: allocation, progress, static: false })
    expect(emphasis.scale).toBeGreaterThanOrEqual(.92); expect(emphasis.scale).toBeLessThanOrEqual(1)
    expect(emphasis.alpha).toBeGreaterThanOrEqual(0); expect(emphasis.alpha).toBeLessThanOrEqual(.68)
    expect(overlayEmphasis({ step: allocation, progress, static: true })).toEqual({ scale: 1, alpha: .55 })
    expect(JSON.stringify(scene)).toBe(before)
  }), { numRuns: 100 })
})
it('uses the canonical visible slot/cell bounds and excludes quiet or absent subjects', () => {
  const trace = loadPersonTrace(), { scene, plan } = view(trace, 18)
  const subjects = motionSubjects(scene, plan)
  const object = scene.entities['object:person:17']
  if (object.kind !== 'object') throw new Error('Expected captured object')
  const age = object.groups.flatMap(group => group.rows).find(row => row.name === 'age')!
  expect(subjects.get(age.slotId)?.anchor.position[1]).toBe(object.anchor.ports[age.slotId][1])
  expect(subjects.has('absent-subject')).toBe(false)
  const entities = new Map(plan.entities), previous = entities.get(object.id)!
  entities.set(object.id, { ...previous, mode: 'quiet' })
  expect(motionSubjects(scene, { ...plan, entities }).has(object.id)).toBe(false)
  expect(motionSubjects(scene, { ...plan, entities }).has(age.slotId)).toBe(false)
  const array = view(loadArrayTrace(), 10), mapped = motionSubjects(array.scene, array.plan)
  expect(array.plan.cellWindows.size).toBeGreaterThan(0)
  for (const window of array.plan.cellWindows.values()) for (const [id, cell] of window.mapping) expect(mapped.get(id)?.anchor).toBe(cell.anchor)
})
it('travels only on the exact currently presented reference or graph-edge curve identity', () => {
  const trace = loadPersonTrace(), reference = step(trace, 14), { scene, plan } = view(trace, 14)
  const curves = new Map(plan.curves.map(curve => [curve.id, curve]))
  const subjects = motionSubjects(scene, plan)
  const recorded = scene.references.find(item => item.sourceSlotId === reference.transition.from?.id && item.targetId === reference.transition.to?.id)!
  expect(recorded).toBeDefined()
  expect(motionCurve(reference, subjects, curves)?.id).toBe(recorded.id)
  expect(motionCurve({ ...reference, flowId: 'absent-recorded-edge' }, subjects, curves)).toBeUndefined()
  expect(motionCurve({ ...reference, transition: { ...reference.transition, to: { kind: 'object', id: 'other-identity' } } }, subjects, curves)).toBeUndefined()
  expect(motionCurve(reference, subjects, new Map())).toBeUndefined()
})
