import type { RuntimeState, TraceDocument } from '../contracts/runtime'
import { applyEvent, createInitialState } from './state'

const CHECKPOINT_INTERVAL = 8
const checkpoints = new WeakMap<TraceDocument, Map<number, RuntimeState>>()

/** Cursor is the number of applied events, from 0 through trace.events.length. */
export function seek(trace: TraceDocument, cursor: number): RuntimeState {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > trace.events.length) {
    throw new RangeError(`Cursor must be an integer from 0 to ${trace.events.length}`)
  }

  let cache = checkpoints.get(trace)
  if (!cache) {
    cache = new Map([[0, createInitialState()]])
    checkpoints.set(trace, cache)
  }

  const checkpointCursor = Math.floor(cursor / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL
  let start = checkpointCursor
  while (!cache.has(start)) start -= CHECKPOINT_INTERVAL
  let state = cache.get(start)!

  for (let index = start; index < cursor; index += 1) {
    state = applyEvent(state, trace.events[index])
    if (state.cursor % CHECKPOINT_INTERVAL === 0) cache.set(state.cursor, state)
  }

  // Keep the cached snapshots private even if a consumer mutates its returned state.
  return structuredClone(state)
}
