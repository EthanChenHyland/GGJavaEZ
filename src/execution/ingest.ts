import type { ExecutionSession, RawTraceDelta } from './contracts'
import { TraceNormalizer, type NormalizedTraceResult } from '../instrumentation/normalize'
import { type ExecutionHistory, attachHistory, attachHistoryPrefix } from '../runtime/history'
import type { TraceDocument } from '../contracts/runtime'
import { persistentAppend, persistentArray } from '../runtime/storage'

export class TraceGapError extends Error {
  constructor(readonly expected: number, readonly received: number) {
    super(`Trace sequence gap: expected ${expected}, received ${received}`)
  }
}

// Compact duplicate evidence, never a second retained raw representation.
function fingerprint(value: unknown): string {
  const text = JSON.stringify(value)
  let a = 2166136261, b = 5381
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619)
    b = Math.imul(b, 33) ^ text.charCodeAt(i)
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`
}

/** One session's append pipeline below React. Metadata and raw delivery can arrive in either order. */
export class ExecutionIngest {
  readonly normalizer: TraceNormalizer
  readonly history: ExecutionHistory
  private accepted: string[] = []
  private metadata: ExecutionSession
  private disposed = false
  private presented: TraceDocument
  result: NormalizedTraceResult

  constructor(session: ExecutionSession) {
    this.metadata = session
    this.normalizer = new TraceNormalizer(session.sourceManifest, `execution:${session.id}`)
    this.result = this.normalizer.snapshot({ status: 'live', exitCode: null, diagnostic: null })
    this.history = this.normalizer.history
    this.syncHistory()
    this.result.trace.capture = { origin: 'jvm', sourceHashes: Object.fromEntries(session.sourceManifest.sources.map(file => [file.fileId, file.sha256])), recordedAt: session.startedAt }
    attachHistory(this.result.trace, this.history)
    this.presented = { ...this.result.trace, events: persistentArray([...this.result.trace.events]) }
    attachHistoryPrefix(this.presented, this.history)
  }

  get nextSequence() { return this.accepted.length }
  get sessionId() { return this.metadata.id }

  /** Advance presentation only at the UI publication boundary. Persistent event
   * roots retain old prefixes without copying all events or reducing them again.
   */
  publishTrace(): TraceDocument {
    if (this.disposed) throw new Error('Trace history is disposed')
    let events = this.presented.events
    for (let i = events.length; i < this.normalizer.trace.events.length; i++)
      events = persistentAppend(events, this.normalizer.trace.events[i])
    this.presented.events = events
    attachHistoryPrefix(this.presented, this.history)
    return this.presented
  }

  update(session: ExecutionSession) {
    if (this.disposed || session.id !== this.sessionId) throw new Error('Trace session mismatch or disposed history')
    this.metadata = session
    // Explicit legacy snapshots carry their facts inline. Modern delta metadata
    // never takes this compatibility path or scans a previously accepted prefix.
    if (session.transportVersion === undefined && session.rawEvents.length) {
      return this.append({ version: 1, sessionId: session.id, fromSequence: 0,
        toSequence: session.rawEvents.length, events: session.rawEvents, recording: session.recording ?? {
          state: 'FULL', reason: null, budget: null,
          lastRecordedSeq: session.rawEvents.at(-1)?.seq ?? null, executionContinued: true,
        } })
    }
    return this.publish()
  }

  /** Validate the complete delivery range before accepting any of its new facts. */
  append(delta: RawTraceDelta) {
    if (this.disposed || delta.version !== 1 || delta.sessionId !== this.sessionId) throw new Error('Trace session/version mismatch')
    const { fromSequence: from, toSequence: to, events } = delta
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from || to - from !== events.length)
      throw new Error('Invalid trace delta range')
    if (from > this.nextSequence) throw new TraceGapError(this.nextSequence, from)
    const prints = events.map(fingerprint)
    events.forEach((event, i) => {
      const sequence = from + i
      if (event.seq !== sequence) throw new Error('Trace event sequence does not match its delta range')
      if (sequence < this.nextSequence && this.accepted[sequence] !== prints[i]) throw new Error('Conflicting duplicate trace event')
    })
    const overlap = Math.min(events.length, this.nextSequence - from)
    if (overlap < events.length) {
      const fresh = events.slice(overlap)
      this.normalizer.append(fresh)
      this.accepted.push(...prints.slice(overlap))
      this.syncHistory()
    }
    return this.publish()
  }

  private syncHistory() {
    const events = this.normalizer.trace.events
    if (events.length > this.history.length) this.history.append(events.slice(this.history.length))
  }

  private publish() {
    const session = this.metadata
    const head = session.rawEventCount ?? session.rawEvents.length
    const ready = this.nextSequence >= head
    const terminal = { status: ready ? session.terminalStatus ?? 'live' : 'live' as const,
      exitCode: ready ? session.exitCode : null, diagnostic: ready ? session.diagnostic : null,
      ...(ready && session.recording ? { recording: session.recording } : {}),
      ...(session.capability ? { capability: session.capability } : {}) }
    this.result = ready && (session.terminalStatus !== null || session.recording?.state !== 'FULL' && session.recording !== undefined)
      ? this.normalizer.finish(terminal) : this.normalizer.snapshot(terminal)
    this.syncHistory()
    return this.result
  }

  dispose() { this.disposed = true; this.accepted.length = 0; this.history.dispose() }
}
