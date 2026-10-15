import { expect, it } from 'vitest'
import type { RuntimeFrame, RuntimeState, TraceEvent } from '../contracts/runtime'
import { createInitialState } from '../runtime/state'
import { frameStatus, frameStatusText, type FrameStatusInputs } from './frameStatus'

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
