import type { RuntimeState, TraceDocument } from '../contracts/runtime'
import { historyForTrace } from './history'

/** Cursor counts applied events. Snapshots are shared and immutable; never clone on seek. */
export function seek(trace: TraceDocument, cursor: number): RuntimeState {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > trace.events.length) {
    throw new RangeError(`Cursor must be an integer from 0 to ${trace.events.length}`)
  }
  return historyForTrace(trace).materialize(cursor)
}
