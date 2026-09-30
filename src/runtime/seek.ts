import type { RuntimeState, TraceDocument } from '../contracts/runtime'
import { applyEvent, createInitialState } from './state'

const MIN_CHECKPOINT_INTERVAL = 8
const MAX_CACHED_SNAPSHOTS = 64
type Checkpoint = { cursor: number; state: RuntimeState }
type SeekCache = {
  eventCount: number
  interval: number
  snapshots: Checkpoint[]
  /** One rolling checkpoint keeps adjacent stepping to one reducer call. */
  recent: RuntimeState | null
}
const checkpoints = new WeakMap<TraceDocument, SeekCache>()

/** Find the greatest cached cursor <= the requested cursor in O(log cache size). */
function nearestCheckpoint(snapshots: Checkpoint[], cursor: number): number {
  let low = 0
  let high = snapshots.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (snapshots[middle].cursor <= cursor) low = middle + 1
    else high = middle
  }
  return low - 1
}

/** Cursor is the number of applied events, from 0 through trace.events.length.
 * Event contents are immutable; changing the trace length invalidates its cache.
 */
export function seek(trace: TraceDocument, cursor: number): RuntimeState {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > trace.events.length) {
    throw new RangeError(`Cursor must be an integer from 0 to ${trace.events.length}`)
  }

  let cache = checkpoints.get(trace)
  if (!cache || cache.eventCount !== trace.events.length) {
    // Reserve space for cursor zero and the rolling checkpoint. Even a cold
    // end-of-trace seek retains at most 63 periodic snapshots plus one recent.
    cache = {
      eventCount: trace.events.length,
      interval: Math.max(MIN_CHECKPOINT_INTERVAL, Math.ceil(trace.events.length / (MAX_CACHED_SNAPSHOTS - 2))),
      snapshots: [{ cursor: 0, state: createInitialState() }],
      recent: null,
    }
    checkpoints.set(trace, cache)
  }

  let checkpointIndex = nearestCheckpoint(cache.snapshots, cursor)
  let state = cache.snapshots[checkpointIndex].state
  if (cache.recent && cache.recent.cursor <= cursor && cache.recent.cursor > state.cursor) state = cache.recent

  for (let index = state.cursor; index < cursor; index += 1) {
    state = applyEvent(state, trace.events[index])
    if (state.cursor % cache.interval === 0) {
      cache.snapshots.splice(++checkpointIndex, 0, { cursor: state.cursor, state })
    }
  }
  cache.recent = state.cursor % cache.interval === 0 ? null : state

  // Keep the cached snapshots private even if a consumer mutates its returned state.
  return structuredClone(state)
}
