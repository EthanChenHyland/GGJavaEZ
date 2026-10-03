import type { RuntimeState, TraceDocument, TraceEvent } from '../contracts/runtime'
import { createReductionEngine, type ReductionEngine } from './engine'
import { IncrementalTraceValidator } from './trace'
import { freezeValue, immutableEvent } from './storage'
const originals = new WeakMap<TraceEvent, TraceEvent>()

export interface HistoryOptions {
  schemaVersion?: 1 | 2
  sourceFiles?: TraceDocument['sourceFiles']
  checkpointInterval?: number
  maxCheckpoints?: number
}
type Checkpoint = { cursor: number; state: RuntimeState }
/** Append-oriented semantic history. 256-event initial spacing, at most 256 roots.
 * When full, retain every other checkpoint and double spacing. Old states share radix
 * branches, so memory is bounded by roots and changed paths, not full state copies.
 * One recent cursor accelerates forward playback; live head is always independent.
 */
export class ExecutionHistory {
  private events: TraceEvent[] = []
  private engine: ReductionEngine = createReductionEngine()
  private validator: IncrementalTraceValidator
  private snapshots: Checkpoint[] = [{ cursor: 0, state: this.engine.state }]
  private recent: RuntimeState | null = null
  private interval: number
  private readonly maximum: number
  private disposed = false
  private documentValidator: IncrementalTraceValidator | null = null
  private documentCursor = 0
  private documentSources: TraceDocument['sourceFiles'] | undefined
  private replayedEvents = 0
  private attachedLength = 0
  private documentSchema: 1 | 2 | undefined

  constructor(options: HistoryOptions = {}) {
    this.interval = options.checkpointInterval ?? 256
    this.maximum = options.maxCheckpoints ?? 256
    if (!Number.isSafeInteger(this.interval) || this.interval < 1 || !Number.isSafeInteger(this.maximum) || this.maximum < 4) throw new RangeError('Invalid checkpoint policy')
    this.validator = new IncrementalTraceValidator(options.schemaVersion ?? 2, options.sourceFiles)
    if (options.sourceFiles && options.schemaVersion !== undefined) {
      this.documentSources = options.sourceFiles
      this.documentSchema = options.schemaVersion
      this.documentValidator = this.validator
    }
  }
  get stats() {
    return { length: this.length, checkpointCount: this.snapshots.length, checkpointInterval: this.interval,
      maxCheckpoints: this.maximum, cachedMaterializationCount: Number(this.recent !== null),
      cachedMaterializationCursor: this.recent?.cursor ?? null,
      retainedStateRoots: this.snapshots.length + Number(this.recent !== null) + 1,
      replayedEvents: this.replayedEvents }
  }
  get length(): number { return this.events.length }
  get state(): RuntimeState { this.requireOpen(); return this.engine.state }
  get isDisposed(): boolean { return this.disposed }
  /** Accepts a valid prefix before an invalid event, and never publishes the invalid suffix. */
  append(events: readonly TraceEvent[]): void {
    this.requireOpen()
    for (const event of events) {
      this.validator.check(event, this.engine.state)
      let state: RuntimeState
      const retained = immutableEvent(event)
      try { state = this.engine.apply(retained) }
      catch (error) { throw new Error(`Invalid event at seq ${this.length}: ${(error as Error).message}`, { cause: error }) }
      this.validator.accept(event)
      this.events.push(retained)
      originals.set(retained, event)
      if (this.documentValidator === this.validator) this.documentCursor = this.length
      if (state.cursor % this.interval === 0) this.snapshots.push({ cursor: state.cursor, state })
      // Reserve roots for live head and the recent historical cursor as well as zero.
      if (this.snapshots.length > this.maximum - 2) {
        this.interval *= 2
        this.snapshots = this.snapshots.filter(snapshot => snapshot.cursor % this.interval === 0)
      }
    }
  }
  materialize(cursor: number): RuntimeState {
    this.requireOpen()
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > this.length) throw new RangeError(`Cursor must be an integer from 0 to ${this.length}`)
    if (cursor === this.length) return this.engine.state
    let low = 0, high = this.snapshots.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (this.snapshots[middle].cursor <= cursor) low = middle + 1
      else high = middle
    }
    let state = this.snapshots[low - 1].state
    if (this.recent && this.recent.cursor <= cursor && this.recent.cursor > state.cursor) state = this.recent
    if (state.cursor !== cursor) {
      const replay = createReductionEngine(state)
      for (let index = state.cursor; index < cursor; index++) { replay.apply(this.events[index]); this.replayedEvents++ }
      state = replay.state
    }
    this.recent = state
    return state
  }
  /** Bind/check metadata once for histories registered before source metadata was supplied.
   * The normalizer should construct with schemaVersion/sourceFiles to avoid this one-time pass.
   */
  validateDocument(trace: TraceDocument): void {
    this.requireOpen()
    if (this.documentSchema !== trace.schemaVersion || this.documentSources !== trace.sourceFiles) {
      this.documentValidator = new IncrementalTraceValidator(trace.schemaVersion, trace.sourceFiles)
      this.documentSources = trace.sourceFiles
      this.documentSchema = trace.schemaVersion
      this.documentCursor = 0
    }
    if (this.documentValidator === this.validator) return
    for (; this.documentCursor < this.length; this.documentCursor++) {
      const event = this.events[this.documentCursor]
      // Only schema-v1 RETURN_VALUE needs a caller lookup. No second semantic reduction.
      const state = trace.schemaVersion === 1 && event.type === 'RETURN_VALUE'
        ? this.materialize(this.documentCursor) : { cursor: this.documentCursor } as RuntimeState
      this.documentValidator!.check(event, state)
      this.documentValidator!.accept(event)
    }
  }
  eventAt(index: number): TraceEvent | undefined { return this.events[index] }
  matchesEvent(index: number, event: TraceEvent): boolean {
    const stored = this.events[index]
    return stored === event || !!stored && originals.get(stored) === event
  }
  freezeAttachedEvents(trace: TraceDocument): void {
    for (; this.attachedLength < this.length; this.attachedLength++) freezeValue(trace.events[this.attachedLength])
  }
  dispose(): void {
    this.events = []
    this.snapshots = []
    this.recent = null
    this.engine = createReductionEngine()
    this.validator = new IncrementalTraceValidator()
    this.documentValidator = null
    this.documentSources = undefined
    this.documentSchema = undefined
    this.documentCursor = 0
    this.disposed = true
  }
  private requireOpen(): void { if (this.disposed) throw new Error('ExecutionHistory is disposed') }
}

const histories = new WeakMap<TraceDocument, ExecutionHistory>()
const attached = new WeakSet<TraceDocument>()
const prefixViews = new WeakSet<TraceDocument>()
/** Register normalizer-owned storage so validation/seek reuse its already applied head. */
export function attachHistory(trace: TraceDocument, history: ExecutionHistory): void {
  if (history.isDisposed || history.length !== trace.events.length || history.length &&
      !history.matchesEvent(history.length - 1, trace.events[history.length - 1])) throw new Error('Trace/history prefix mismatch')
  history.freezeAttachedEvents(trace)
  histories.set(trace, history)
  attached.add(trace)
}
/** A presentation prefix shares the full validated history but exposes only the
 * published event count. Advancing the live head must not mutate this prefix.
 */
export function attachHistoryPrefix(trace: TraceDocument, history: ExecutionHistory): void {
  const count = trace.events.length
  if (history.isDisposed || count > history.length || count &&
    (!history.matchesEvent(0, trace.events[0]) || !history.matchesEvent(count - 1, trace.events[count - 1])))
    throw new Error('Trace/history prefix mismatch')
  histories.set(trace, history)
  attached.add(trace)
  prefixViews.add(trace)
}
/** Immutable event contents with a stable append-only trace identity are the cache contract.
 * Legacy replacement/shrink gets a fresh history. Normal append retains all old checkpoints.
 */
export function historyForTrace(trace: TraceDocument, options: { revalidate?: boolean } = {}): ExecutionHistory {
  let history = histories.get(trace)
  const boundary = Math.min(history?.length ?? 0, trace.events.length)
  if (options.revalidate && !attached.has(trace) || !history || history.isDisposed ||
      !prefixViews.has(trace) && history.length > trace.events.length || boundary &&
      (!history.matchesEvent(0, trace.events[0]) || !history.matchesEvent(boundary - 1, trace.events[boundary - 1]))) {
    history?.dispose()
    history = new ExecutionHistory({ schemaVersion: trace.schemaVersion, sourceFiles: trace.sourceFiles })
    histories.set(trace, history)
  }
  if (history.length < trace.events.length) history.append(trace.events.slice(history.length))
  return history
}
