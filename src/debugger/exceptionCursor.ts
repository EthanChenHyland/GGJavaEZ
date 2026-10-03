import type { TraceDocument } from '../contracts/runtime'

/** Include the graph fact committed for the same observed exception operation.
 * Never advance over another Java operation, frame or exception episode. */
export function committedExceptionCursor(trace: TraceDocument, index: number): number {
  const event = trace.events[index]
  if (!event) return 0
  const kind = event.type === 'THROW_EXCEPTION' ? 'throw' : event.type === 'UNWIND_EXCEPTION' ? 'unwind' : event.type === 'CATCH_EXCEPTION' ? 'catch' : null
  const next = trace.events[index + 1]
  return kind && 'exceptionId' in event && 'frameId' in event && next?.type === 'EXECUTION_FACT' &&
    next.fact.kind === kind && 'exceptionId' in next.fact && next.fact.exceptionId === event.exceptionId &&
    'invocationId' in next.fact && next.fact.invocationId === event.frameId ? index + 2 : index + 1
}
