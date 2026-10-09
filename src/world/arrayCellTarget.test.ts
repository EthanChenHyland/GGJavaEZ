import { expect, it } from 'vitest'
import { arrayElementSlotId, type TraceDocument } from '../contracts/runtime'
import { seek } from '../runtime'
import { inspectorEntity, inspectorRows } from '../render/inspection'
import { focusSourceLocation } from '../shell/source/sourceSync'
import { createLayoutEngine } from './layoutEngine'
import { createSceneProjector } from './sceneProjector'
import { planPresentation } from './presentationPlanner'
import { arrayCellTarget } from './arrayCellTarget'
import { resolveArrayWindowPick } from './arrayWindow'

const id = 'opaque:element:array/β'
const trace: TraceDocument = { schemaVersion: 2, demoId: 'recording/opaque', sourceFiles: [{fileId:'source/opaque',name:'Buffer.java',content:'\n'.repeat(7)}], events: [
  {eventId:'opaque/start',seq:0,type:'PROGRAM_START',source:null,label:'start',importance:'normal'}, {
  eventId: 'opaque/allocation', seq: 1, type: 'ALLOCATE_ARRAY', objectId: id,
  displayId: 9, elementType: 'int', length: 1000000, elements: [], observed:true,
  source: { fileId: 'source/opaque', line: 7 }, label: 'allocate', importance: 'normal',
}] }
const layout = createLayoutEngine(); layout.append(trace.events)
const runtime = seek(trace, 2)
const scene = createSceneProjector(trace).project(runtime, layout.state, {
  sessionEnded: false, pausedAtLiveHead: false, liveHead: 2,
  recording: { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false },
})
it('resolves in-bounds uncaptured identities without adding a recorded cell or value', () => {
  const before = JSON.stringify(runtime)
  for (const index of [0, 888888, 999999]) {
    const slotId = arrayElementSlotId(id, index)
    const target = arrayCellTarget(scene, slotId)!
    expect(target.index).toBe(index)
    expect(target.array).toBe(scene.entities[id])
    expect(target.array.cells).toHaveLength(0)
    expect(inspectorEntity(scene, { kind: 'slot', id: slotId })).toBe(target.array)
    expect(inspectorRows(target.array).at(index).value.observation).toBe('UNAVAILABLE')
    expect(focusSourceLocation(scene, slotId, trace)).toEqual({ fileId: 'source/opaque', line: 7 })
  }
  expect(JSON.stringify(runtime)).toBe(before)
})
it('rejects absent arrays, invalid indices and noncanonical ID spellings', () => {
  for (const slotId of [null, '', id, `${id}:element:`, `${id}:element:01`, `${id}:element:1e2`,
    `${id}:element:-1`, `${id}:element:1000000`, `${id}:element:1.5`,
    `${id}:element:9007199254740992`, 'absent:element:0']) expect(arrayCellTarget(scene, slotId)).toBeNull()
})
it('pins an uncaptured selected/focused cell, remaps its physical slot and rejects the old pick', () => {
  const input = { scene, layout: layout.state, detailLevel: 'FAR' as const,
    selection: { kind: 'slot' as const, id: arrayElementSlotId(id, 888888) },
    focusTargetId: arrayElementSlotId(id, 888888), trace: { active: false, scope: 'relevant' as const } }
  const first = planPresentation(input), a = first.cellWindows.get(id)!
  expect(first.pinned.has(id)).toBe(true)
  expect(first.framing.focus?.targetId).toBe(id)
  const mapped = a.mapping.get(input.selection.id)!
  expect(mapped.index).toBe(888888)
  const pick = { recordingId: scene.recordingId, arrayId: id, windowRevision: a.windowRevision,
    index: mapped.index, slotId: input.selection.id, presentedSlot: mapped.presentedSlot }
  expect(resolveArrayWindowPick(a, pick)).toBe(mapped)
  const unchanged = planPresentation(input, first)
  expect(unchanged.cellWindows.get(id)?.windowRevision).toBe(a.windowRevision)
  const second = planPresentation({ ...input, selection: { kind: 'slot', id: arrayElementSlotId(id, 999999) },
    focusTargetId: null }, first), b = second.cellWindows.get(id)!
  expect(b.windowRevision).toBe(a.windowRevision + 1)
  expect(resolveArrayWindowPick(b, pick)).toBeNull()
  expect(scene.entities[id].anchor).toBe(layout.state.anchors[id])
})
