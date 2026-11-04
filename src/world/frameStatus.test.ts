import { expect, it } from 'vitest'
import type { RuntimeFrame, RuntimeState, TraceEvent } from '../contracts/runtime'
import { createInitialState } from '../runtime/state'
import { frameStatus, frameStatusText, type FrameStatusInputs } from './frameStatus'
import type { RawRuntimeEvent } from '../instrumentation/contracts'
import { normalizeTrace } from '../instrumentation/normalize'
import { seek } from '../runtime'
import { createLayoutEngine } from './layoutEngine'
import { createSceneProjector } from './sceneProjector'

it('preserves throw-origin status while recording origin and caller unwinds through reverse replay', () => {
  const raw = [
    { type: 'enter', frameId: 'caller', methodName: 'main', callerFrameId: null, receiver: null, parameters: [] },
    { type: 'enter', frameId: 'origin', methodName: 'work', callerFrameId: 'caller', receiver: null, parameters: [] },
    { type: 'throw', frameId: 'origin', objectId: 'failure', className: 'pkg.Failure', message: null, explicit: true },
    { type: 'unwind', frameId: 'origin', objectId: 'failure' },
    { type: 'unwind', frameId: 'caller', objectId: 'failure' },
  ].map((item, seq) => ({ v: 1, seq, threadId: '1', className: 'C', methodName: 'main', descriptor: '()V', line: seq + 1, site: seq, ...item })) as RawRuntimeEvent[]
  const trace = normalizeTrace(raw, { sources: [], classes: [] }, { status: 'program_crashed', exitCode: 1, diagnostic: null }).trace
  const layout = createLayoutEngine(); layout.append(trace.events)
  const projector = createSceneProjector(trace)
  const throwIndex = trace.events.findIndex(event => event.type === 'THROW_EXCEPTION')
  const unwindIndex = trace.events.findIndex(event => event.type === 'UNWIND_EXCEPTION')
  const callerUnwindIndex = trace.events.findIndex(event => event.type === 'UNWIND_EXCEPTION' && event.frameId === 'jvm:frame:caller')
  expect(throwIndex).toBeGreaterThan(0); expect(unwindIndex).toBeGreaterThan(throwIndex); expect(callerUnwindIndex).toBeGreaterThan(unwindIndex)
  const cursors = [throwIndex + 1, throwIndex + 2, unwindIndex + 1, unwindIndex + 2, trace.events.length, throwIndex + 2, unwindIndex + 2]
  for (const cursor of cursors) {
    const runtime = seek(trace, cursor), before = JSON.stringify(runtime)
    const scene = projector.project(runtime, layout.state, { sessionEnded: true, pausedAtLiveHead: false, liveHead: trace.events.length,
      recording: { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false } })
    const origin = scene.entities['jvm:frame:origin']
    expect(origin).toMatchObject({ kind: 'frame', exceptionRole: 'origin', status: { kind: 'threw', exception: 'Failure' } })
    expect(scene.exception!.unwound).toEqual(cursor <= unwindIndex ? [] : cursor > callerUnwindIndex ? ['jvm:frame:origin', 'jvm:frame:caller'] : ['jvm:frame:origin'])
    if (cursor === trace.events.length) expect(scene.entities['jvm:frame:caller']).toMatchObject({ kind: 'frame', exceptionRole: 'unwound', status: { kind: 'unwound', exception: 'Failure' } })
    expect(origin.anchor).toBe(layout.state.anchors['jvm:frame:origin'])
    expect(JSON.stringify(runtime)).toBe(before)
  }
})

function input(extra: Partial<FrameStatusInputs> = {}): FrameStatusInputs {
  const frame: RuntimeFrame = { id: 'f', callerFrameId: null, className: 'C', methodName: 'm', depth: 0, status: 'active', locals: {}, enteredAt: 'enter' }
  const state: RuntimeState = { ...createInitialState(), cursor: 4, activeFrameIds: ['f'], frames: { f: frame }, currentSource: { fileId: 'Other.java', line: 99 } }
  return { frame, state, cursorEvent: null, context: { sessionEnded: false, pausedAtLiveHead: false, liveHead: 4 }, ...extra }
}
function event(payload: object, seq = 3): TraceEvent {
  return { eventId: `event:${seq}`, seq, source: { fileId: 'C.java', line: 12 }, label: '', importance: 'normal', ...payload } as TraceEvent
}

it('uses invocation-specific source lines and refuses unrelated global source or future events', () => {
  expect(frameStatus(input())).toEqual({ kind: 'running', line: null })
  expect(frameStatus(input({ sourceLine: { fileId: 'C.java', line: 7 } }))).toEqual({ kind: 'running', line: 7 })
  expect(frameStatus(input({ cursorEvent: event({ type: 'LINE_EXECUTE', frameId: 'f' }) }))).toEqual({ kind: 'running', line: 12 })
  expect(frameStatus(input({ cursorEvent: event({ type: 'LINE_EXECUTE', frameId: 'f' }, 4) }))).toEqual({ kind: 'running', line: null })
})
it('pause applies only to live frames at the live prefix, including before a semantic Event', () => {
  const original = input()
  expect(frameStatus({ ...original, context: { ...original.context, pausedAtLiveHead: true } }).kind).toBe('paused')
  expect(frameStatus({ ...original, context: { ...original.context, pausedAtLiveHead: true, liveHead: 8 } }).kind).toBe('running')
})
it('return at the cursor is returning; historical values show only without a proven destination', () => {
  const original = input()
  const value = { kind: 'primitive' as const, javaType: 'int' as const, value: 18 }
  const returned = { ...original.frame, status: 'returned' as const, returnValue: value, exitedAt: 'exit' }
  expect(frameStatus({ ...original, frame: returned, cursorEvent: event({ type: 'EXIT_METHOD', frameId: 'f' }) })).toEqual({ kind: 'returning' })
  expect(frameStatus({ ...original, frame: returned })).toMatchObject({ kind: 'returned', value: { exact: '18' } })
  expect(frameStatus({ ...original, frame: returned, returnDestinationProven: true })).toEqual({ kind: 'returned', value: null })
  expect(frameStatus({ ...original, frame: returned, returnTransfer: { eventId: 'return', frameId: 'f', value, destination: { frameId: 'caller', slotId: 'result' } } })).toMatchObject({ kind: 'returned', value: { exact: '18' } })
})
it('throw origin, propagated unwind and caught-at-cursor remain distinct, and caught emphasis clears', () => {
  const original = input()
  const exception = { eventId: 'throw', exceptionId: 'ex', className: 'java.lang.IllegalStateException', message: null, explicit: true, source: null, frameIds: ['caller', 'f'], unwoundFrameIds: ['f', 'caller'] }
  const state = { ...original.state, exceptions: [exception] }
  expect(frameStatus({ ...original, state })).toEqual({ kind: 'threw', exception: 'IllegalStateException' })
  expect(frameStatus({ ...original, frame: { ...original.frame, id: 'caller', status: 'unwound' }, state })).toEqual({ kind: 'unwound', exception: 'IllegalStateException' })
  const caughtState = { ...state, exceptions: [{ ...exception, caughtBy: 'f', unwoundFrameIds: [] }] }
  expect(frameStatus({ ...original, state: caughtState, cursorEvent: event({ type: 'CATCH_EXCEPTION', frameId: 'f', exceptionId: 'ex' }) })).toEqual({ kind: 'caught', exception: 'IllegalStateException', line: 12 })
  expect(frameStatus({ ...original, state: caughtState, cursorEvent: event({ type: 'LINE_EXECUTE', frameId: 'f' }) })).toEqual({ kind: 'running', line: 12 })
})
it('an ended session terminates only a frame lacking recorded return/exception exit at the final prefix', () => {
  const original = input()
  expect(frameStatus({ ...original, context: { ...original.context, sessionEnded: true } })).toEqual({ kind: 'terminated' })
  expect(frameStatus({ ...original, context: { ...original.context, sessionEnded: true, liveHead: 10 } })).toEqual({ kind: 'running', line: null })
  expect(frameStatus({ ...original, frame: { ...original.frame, status: 'unwound' }, context: { ...original.context, sessionEnded: true } })).toEqual({ kind: 'unwound', exception: '⟨exception not recorded⟩' })
})
it('exposes textual status independent of colour and supports recorded graph exception facts', () => {
  expect(frameStatusText({ kind: 'paused', line: 6 })).toBe('paused · line 6')
  expect(frameStatusText({ kind: 'running', line: 12 })).toBe('line 12')
  const fact = { kind: 'throw', invocationId: 'f', exceptionId: 'ex', className: 'pkg.Failure$Literal', context: { frameId: 'f' } }
  expect(frameStatus(input({ cursorEvent: event({ type: 'EXECUTION_FACT', fact }) }))).toEqual({ kind: 'threw', exception: 'Failure$Literal' })
})
