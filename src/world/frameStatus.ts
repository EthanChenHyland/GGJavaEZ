import type { ReturnTransfer, RuntimeFrame, RuntimeState, SourceLocation, TraceEvent } from '../contracts/runtime'
import type { FrameStatus } from '../contracts/worldV2'
import { displayType } from './displayType'
import { valueText, type ValueTextOptions } from './valueText'

export interface FrameStatusInputs {
  frame: RuntimeFrame
  /** Applied-prefix snapshot; exceptions and returns must not include future evidence. */
  state: Pick<RuntimeState, 'cursor' | 'activeFrameIds' | 'exceptions' | 'returns' | 'currentSource'>
  /** Events[c−1], null at c=0. An event from another prefix is ignored. */
  cursorEvent: TraceEvent | null
  context: { sessionEnded: boolean; pausedAtLiveHead: boolean; liveHead: number }
  /** Per-invocation latest source, supplied by the projector's index. null explicitly means unavailable. */
  sourceLine?: SourceLocation | null
  /** Optional fallback for standalone callers; projector hot paths should supply indexed sourceLine. */
  events?: readonly TraceEvent[]
  /** Optional pre-indexed return; null explicitly means no observed return. */
  returnTransfer?: ReturnTransfer | null
  /** A prefix-visible graph return and consuming write prove the destination. */
  returnDestinationProven?: boolean
  valueOptions?: ValueTextOptions
}

/** Pure status projection. Historical pause/termination never overwrites a frame at an earlier prefix. */
export function frameStatus(input: FrameStatusInputs): FrameStatus {
  const { frame, state, context } = input
  const event = input.cursorEvent?.seq === state.cursor - 1 ? input.cursorEvent : null
  let source = input.sourceLine
  if (source === undefined && input.events) {
    for (let index = Math.min(state.cursor, input.events.length) - 1; index >= 0; index--) {
      const candidate = input.events[index]
      const frameId = 'frameId' in candidate ? candidate.frameId : candidate.type === 'EXECUTION_FACT' ? candidate.fact.context.frameId : null
      if (candidate.seq < state.cursor && frameId === frame.id && candidate.source) { source = candidate.source; break }
    }
  }
  if (source === undefined && event) {
    const frameId = 'frameId' in event ? event.frameId : event.type === 'EXECUTION_FACT' ? event.fact.context.frameId : null
    if (frameId === frame.id) source = event.source
  }
  const line = source?.line ?? null
  const returning = event && ((event.type === 'RETURN_VALUE' || event.type === 'EXIT_METHOD') && event.frameId === frame.id
    || event.type === 'EXECUTION_FACT' && (event.fact.kind === 'return' || event.fact.kind === 'exit') && event.fact.invocationId === frame.id)
  if (returning) return { kind: 'returning' }

  if (event?.type === 'EXECUTION_FACT' && ['throw', 'catch', 'unwind'].includes(event.fact.kind)
    && 'invocationId' in event.fact && event.fact.invocationId === frame.id) {
    const fact = event.fact
    const captured = 'exceptionId' in fact ? state.exceptions.find((exception) => exception.exceptionId === fact.exceptionId) : undefined
    const name = 'className' in fact && fact.className ? fact.className : captured?.className
    const exception = name ? displayType(name) : '⟨exception not recorded⟩'
    if (fact.kind === 'catch') return { kind: 'caught', exception, line }
    return { kind: fact.kind === 'throw' || captured?.frameIds.at(-1) === frame.id ? 'threw' : 'unwound', exception }
  }

  for (let index = state.exceptions.length - 1; index >= 0; index--) {
    const exception = state.exceptions[index]
    const simpleName = displayType(exception.className)
    if (event?.type === 'CATCH_EXCEPTION' && event.frameId === frame.id && event.exceptionId === exception.exceptionId) {
      return { kind: 'caught', exception: simpleName, line }
    }
    const origin = exception.frameIds.at(-1) === frame.id
    if (exception.unwoundFrameIds.includes(frame.id)) return { kind: origin ? 'threw' : 'unwound', exception: simpleName }
    if (origin && !exception.caughtBy) return { kind: 'threw', exception: simpleName }
  }

  let returned = input.returnTransfer
  if (returned === undefined) {
    returned = null
    for (let index = state.returns.length - 1; index >= 0; index--) {
      if (state.returns[index].frameId === frame.id) { returned = state.returns[index]; break }
    }
  }
  if (frame.status === 'returned' || returned || frame.returnValue !== undefined) {
    const value = returned?.value ?? frame.returnValue
    const destinationProven = input.returnDestinationProven === true
    return { kind: 'returned', value: !destinationProven && value !== undefined ? valueText(value, input.valueOptions) : null }
  }
  // An unwind with no captured class still remains an unwind; its class is explicitly unavailable.
  if (frame.status === 'unwound') return { kind: 'unwound', exception: '⟨exception not recorded⟩' }
  if (context.sessionEnded && state.cursor === context.liveHead) return { kind: 'terminated' }
  if (context.pausedAtLiveHead && state.cursor === context.liveHead && state.activeFrameIds.includes(frame.id)) return { kind: 'paused', line }
  return { kind: 'running', line }
}

export function frameStatusText(status: FrameStatus): string {
  switch (status.kind) {
    case 'running': return status.line === null ? 'running' : `line ${status.line}`
    case 'paused': return status.line === null ? 'paused' : `paused · line ${status.line}`
    case 'returning': return 'returning'
    case 'returned': return status.value ? `returned ${status.value.text}` : 'returned'
    case 'threw': return `throws ${status.exception}`
    case 'unwound': return `unwound · ${status.exception}`
    case 'caught': return `caught ${status.exception}${status.line === null ? '' : ` · line ${status.line}`}`
    case 'terminated': return 'terminated'
  }
}
