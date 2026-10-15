import { beforeEach, describe, expect, it } from 'vitest'
import type { TraceDocument } from '../contracts/runtime'
import { projectTrace } from '../testing/projectTrace'
import { useCameraStore } from './cameraStore'
import { useInteractionStore } from '../interaction/interactionStore'
import { cameraPosition, nextDetailLevel } from './projection'
import { inspectorEntity } from '../render/inspection'
import { planPresentation } from '../world/presentationPlanner'
import { faceRowPort } from '../world/faceRows'

const fixture: TraceDocument = { schemaVersion: 2, demoId: 'unit/navigation', sourceFiles: [], events: [
  { type: 'PROGRAM_START', eventId: 'e0', seq: 0, source: null, label: 'start', importance: 'quiet' },
  { type: 'ALLOCATE_OBJECT', eventId: 'e1', seq: 1, source: null, label: 'captured object', importance: 'quiet', objectId: 'unit/object', displayId: 17, className: 'Item', fields: [{ id: 'unit/age', name: 'age', javaType: 'int', value: { kind: 'primitive', javaType: 'int', value: 18 } }], metadata: { ownership: 'PROJECT', runtimeType: 'Item', packageName: '' } },
  { type: 'ENTER_METHOD', eventId: 'e2', seq: 2, source: null, label: 'captured frame', importance: 'quiet', frameId: 'unit/frame', callerFrameId: null, className: 'Unit', methodName: 'main', locals: [{ id: 'unit/local', name: 'p', javaType: 'Item', value: { kind: 'reference', javaType: 'Item', objectId: 'unit/object' } }] },
] }
const projection = projectTrace(fixture), scene = projection.project(fixture.events.length)
beforeEach(() => { useCameraStore.setState(useCameraStore.getInitialState()); useInteractionStore.setState(useInteractionStore.getInitialState()) })

describe('production navigation state', () => {
  it('lets actual user input cancel Follow and pending camera intents', () => {
    const camera = useCameraStore.getState(); camera.home(); camera.enableFollow()
    expect(useCameraStore.getState().follow).toBe(true)
    camera.userInput()
    expect(useCameraStore.getState()).toMatchObject({ mode: 'EXPLORE', follow: false, intent: null })
  })
  it('issues explicit distance-change intents and cancels guidance without changing yaw, pitch or pivot', () => {
    const camera = useCameraStore.getState(), pose = camera.pose, revision = camera.intentRevision
    camera.enableFollow(); camera.requestPose({ ...pose, distance: pose.distance * .8 })
    expect(useCameraStore.getState()).toMatchObject({ follow: false, intent: { kind: 'pose', pose: { ...pose, distance: pose.distance * .8 } }, intentRevision: revision + 1 })
    camera.requestPose({ ...pose, distance: pose.distance * 1.25 })
    expect(useCameraStore.getState()).toMatchObject({ follow: false, intent: { kind: 'pose', pose: { ...pose, distance: pose.distance * 1.25 } }, intentRevision: revision + 2 })
  })
  it('Home clears Focus history without clearing semantic selection', () => {
    const camera = useCameraStore.getState(); camera.focus({ kind: 'object', id: 'unit/object' }); camera.home()
    expect(useCameraStore.getState()).toMatchObject({ mode: 'HOME', intent: { kind: 'home' } })
    expect(useInteractionStore.getState()).toMatchObject({ preFocus: null, focus: null, selection: { kind: 'object', id: 'unit/object' } })
  })
  it('remembers the original pre-Focus pose/mode and preserves Focus on manual input before an exact return', () => {
    const camera = useCameraStore.getState(), pose = camera.pose
    camera.enterTrace(); camera.focus({ kind: 'object', id: 'unit/object' })
    expect(useInteractionStore.getState().preFocus).toEqual({ pose, mode: 'TRACE' })
    camera.userInput(); expect(useInteractionStore.getState().focus?.targetId).toBe('unit/object')
    camera.exitFocus()
    expect(useCameraStore.getState()).toMatchObject({ mode: 'TRACE', intent: { kind: 'exitFocus', pose, mode: 'TRACE' } })
    expect(useInteractionStore.getState()).toMatchObject({ focus: null, preFocus: null, selection: { kind: 'object', id: 'unit/object' }, trace: { active: true } })
  })
  it('resolves actual object/field owners and selected connector terminals without permitting connector Focus', () => {
    const object = scene.entities['unit/object'], reference = scene.references[0]
    expect(inspectorEntity(scene, { kind: 'object', id: object.id })).toBe(object)
    expect(inspectorEntity(scene, { kind: 'slot', id: 'unit/age' })).toBe(object)
    const plan = planPresentation({ scene, layout: projection.layout, detailLevel: 'CLOSE', selection: { kind: 'reference', id: reference.id }, focusTargetId: null, trace: { active: false, scope: 'relevant' } }), curve = plan.curves.find(curve => curve.id === reference.id)!
    expect(curve.points[0]).toEqual(faceRowPort(scene.entities[reference.sourceId], plan.entities.get(reference.sourceId)!, reference.sourceSlotId))
    expect(curve.destinationAnchor).toBe(object.anchor)
    useCameraStore.getState().focus({ kind: 'reference', id: reference.id })
    expect(useInteractionStore.getState().focus).toBeNull()
  })
})

describe('canonical semantic camera scale', () => {
  it('uses projected face coverage and hysteresis at both detail boundaries', () => {
    expect(nextDetailLevel('MEDIUM', 49, 1000)).toBe('FAR')
    expect(nextDetailLevel('FAR', 55, 1000)).toBe('FAR')
    expect(nextDetailLevel('FAR', 60, 1000)).toBe('MEDIUM')
    expect(nextDetailLevel('MEDIUM', 161, 1000)).toBe('CLOSE')
    expect(nextDetailLevel('CLOSE', 140, 1000)).toBe('CLOSE')
    expect(nextDetailLevel('CLOSE', 130, 1000)).toBe('MEDIUM')
  })
  it('preserves the viewing offset when the world pivot changes', () => {
    const pose = useCameraStore.getState().pose, shifted = { ...pose, target: [1, 2, 3] as const }
    const first = cameraPosition(pose), second = cameraPosition(shifted)
    for (const axis of [0, 1, 2]) expect(second[axis] - shifted.target[axis]).toBeCloseTo(first[axis] - pose.target[axis], 12)
    useCameraStore.getState().requestPose(shifted)
    expect(useCameraStore.getState().intent).toEqual({ kind: 'pose', pose: shifted })
  })
})
