import { referenceIdForSlot, type RuntimeValue } from '../contracts/runtime'
import type { SceneReference, SceneReferenceBinding } from '../contracts/worldV2'

/** Root-proved normalized slot observations, not raw events or inferred Java operations. */
export interface BindingObservation {
  readonly sourceId: string
  readonly sourceSlotId: string
  readonly role: SceneReference['role']
  /** JS null means absent capture; { kind: 'null' } means captured Java null. */
  readonly value: RuntimeValue | null
  readonly mode: 'observe' | 'write' | 'retire'
}

export type ReferenceBinding = SceneReferenceBinding

export interface ReferenceBindingHistory {
  append(seq: number, eventId: string, observations: readonly BindingObservation[]): void
  historical(cursor: number): readonly ReferenceBinding[]
  current(cursor: number): readonly ReferenceBinding[]
  /** Number of accepted append calls, including empty batches and repeat observations. */
  readonly length: number
}

interface Interval {
  /** Frozen introduction snapshot: ending metadata must not leak into earlier queries. */
  readonly introduction: ReferenceBinding
  ending: ReferenceBinding | null
}

interface PreparedObservation {
  readonly key: string
  readonly sourceId: string
  readonly sourceSlotId: string
  readonly role: SceneReference['role']
  readonly targetId: string | null
  readonly mode: BindingObservation['mode']
  readonly endKind: NonNullable<ReferenceBinding['endKind']>
}

function requireOrdinal(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a nonnegative safe integer`)
}

/** First entry whose ordinal is >= cursor. No scan of the excluded future suffix. */
function prefixLength<T>(items: readonly T[], cursor: number, ordinal: (item: T) => number): number {
  let low = 0, high = items.length
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2)
    if (ordinal(items[mid]) < cursor) low = mid + 1
    else high = mid
  }
  return low
}

/** Immutable, array-compatible view of a captured append-only prefix. Capturing
 * the count makes old snapshots stable without copying the growing history at
 * every cursor. The empty backing array avoids length-sized hole allocations.
 */
function closedPrefix(items: readonly ReferenceBinding[], length: number): readonly ReferenceBinding[] {
  const indexOf = (key: PropertyKey): number | null => typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) && Number.isSafeInteger(Number(key)) ? Number(key) : null
  const reject = (): never => { throw new TypeError('Reference binding snapshots are immutable') }
  return new Proxy([] as ReferenceBinding[], {
    set: reject, deleteProperty: reject, defineProperty: reject, setPrototypeOf: reject, preventExtensions: reject,
    get(target, key, receiver) {
      if (key === 'length') return length
      const index = indexOf(key)
      return index !== null ? index < length ? items[index] : undefined : Reflect.get(target, key, receiver)
    },
    has(target, key) { const index = indexOf(key); return index !== null ? index < length : Reflect.has(target, key) },
    ownKeys() { return [...Array.from({ length }, (_, i) => String(i)), 'length'] },
    getOwnPropertyDescriptor(target, key) {
      if (key === 'length') return { ...Reflect.getOwnPropertyDescriptor(target, key)!, value: length }
      const index = indexOf(key)
      return index !== null && index < length ? { value: items[index], enumerable: true, configurable: true, writable: false } : Reflect.getOwnPropertyDescriptor(target, key)
    },
  })
}

/**
 * Presentation-only interval catalog; all fact derivation belongs to the caller.
 * Append is O(batch size) expected work, without scanning existing histories.
 * Historical captures its immutable prefix in O(log closed); iteration costs
 * O(returned). Current binary-searches each bound slot.
 * Storage is O(accepted calls + genuine intervals), with no silent history eviction.
 * Historical order is closure seq then batch order; current order is first binding
 * of the opaque owner/slot pair. Roles are captured at interval introduction.
 */
export function createReferenceBindingHistory(recordingId: string): ReferenceBindingHistory {
  if (typeof recordingId !== 'string') throw new TypeError('recordingId must be a string')
  const histories = new Map<string, Interval[]>()
  const closed: ReferenceBinding[] = []
  const eventIds = new Set<string>()
  let lastSeq = -1, accepted = 0
  let snapshot: {count:number;values:readonly ReferenceBinding[]}|undefined

  return Object.freeze({
    get length() { return accepted },

    append(seq: number, eventId: string, observations: readonly BindingObservation[]): void {
      requireOrdinal(seq, 'seq')
      if (seq <= lastSeq) throw new RangeError('seq must strictly increase')
      if (typeof eventId !== 'string' || eventId.length === 0 || eventIds.has(eventId)) {
        throw new TypeError('eventId must be nonempty and unique')
      }
      if (!Array.isArray(observations)) throw new TypeError('observations must be an array')

      // Validate and copy the entire batch before touching any catalog state.
      // Never retain a caller-owned RuntimeValue or observation object.
      const keys = new Set<string>()
      const prepared: PreparedObservation[] = []
      for (const observation of observations) {
        if (!observation || typeof observation.sourceId !== 'string' || typeof observation.sourceSlotId !== 'string') {
          throw new TypeError('source owner and slot IDs must be opaque strings')
        }
        const { sourceId, sourceSlotId, role, mode, value } = observation
        if (role !== 'frame-object' && role !== 'object-object' && role !== 'class-object') throw new TypeError('Invalid reference role')
        if (mode !== 'observe' && mode !== 'write' && mode !== 'retire') throw new TypeError('Invalid observation mode')
        const key = JSON.stringify([sourceId, sourceSlotId])
        if (keys.has(key)) throw new TypeError('Duplicate source owner/slot pair in batch')
        keys.add(key)

        let targetId: string | null = null
        let endKind: PreparedObservation['endKind'] = 'unavailable'
        if (value !== null) {
          if (!value || typeof value !== 'object') throw new TypeError('Invalid captured RuntimeValue')
          switch (value.kind) {
            case 'reference':
              if (typeof value.objectId !== 'string') throw new TypeError('Reference target ID must be an opaque string')
              targetId = value.objectId
              endKind = 'overwritten'
              break
            case 'null': endKind = 'null'; break
            case 'primitive':
            case 'stringSummary': endKind = 'overwritten'; break
            case 'uninitialized':
            case 'unavailable': break
            default: throw new TypeError('Invalid captured RuntimeValue kind')
          }
        }
        prepared.push({ key, sourceId, sourceSlotId, role, mode, targetId, endKind: mode === 'retire' ? 'retired' : endKind })
      }

      for (const item of prepared) {
        let history = histories.get(item.key)
        const prior = history?.[history.length - 1]
        const active = prior && prior.ending === null ? prior : undefined
        if (item.mode === 'observe' && active && item.targetId === active.introduction.targetId) continue

        if (active) {
          const ending: ReferenceBinding = Object.freeze({ ...active.introduction, endSeq: seq, endEventId: eventId, endKind: item.endKind })
          active.ending = ending
          closed.push(ending)
        }
        if (item.mode === 'retire' || item.targetId === null) continue

        const introduction: ReferenceBinding = Object.freeze({
          id: `presentation:reference-binding:${JSON.stringify([recordingId, item.sourceId, item.sourceSlotId, seq])}`,
          referenceId: referenceIdForSlot(item.sourceSlotId),
          sourceId: item.sourceId, sourceSlotId: item.sourceSlotId, targetId: item.targetId, role: item.role,
          introducedSeq: seq, introducedEventId: eventId, endSeq: null, endEventId: null, endKind: null,
        })
        if (!history) { history = []; histories.set(item.key, history) }
        history.push({ introduction, ending: null })
      }
      lastSeq = seq
      eventIds.add(eventId)
      accepted++
    },

    historical(cursor: number): readonly ReferenceBinding[] {
      requireOrdinal(cursor, 'cursor')
      const count = prefixLength(closed, cursor, binding => binding.endSeq!)
      if(snapshot?.count===count)return snapshot.values
      const values=closedPrefix(closed,count);snapshot={count,values};return values
    },

    current(cursor: number): readonly ReferenceBinding[] {
      requireOrdinal(cursor, 'cursor')
      const result: ReferenceBinding[] = []
      for (const history of histories.values()) {
        const count = prefixLength(history, cursor, interval => interval.introduction.introducedSeq)
        if (count === 0) continue
        const interval = history[count - 1]
        if (interval.ending !== null && interval.ending.endSeq! < cursor) continue
        result.push(interval.introduction)
      }
      return Object.freeze(result)
    },
  })
}
