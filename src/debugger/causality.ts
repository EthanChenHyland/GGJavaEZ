import type { Selection } from '../contracts/interaction'
import type { RuntimeValue, SlotOwner, SourceLocation, TraceDocument, TraceEvent } from '../contracts/runtime'
import { arrayElementSlotId, referenceIdForSlot } from '../contracts/runtime'

export type CauseTarget = SlotOwner | { kind: 'array'; objectId: string; index: number }
export interface CauseNode {
  eventId: string
  /** Applied-event count, suitable for seek(). Never the raw recorder sequence. */
  cursor: number
  source: SourceLocation | null
  selection: NonNullable<Selection>
  label: string
  value?: RuntimeValue
  relationship: 'write' | 'binding' | 'return' | 'allocation'
}

const limitations = Object.freeze([
  'Earlier writes to the same slot are history, not dependencies of its current value.',
  'Parameter and this bindings record observed entry values; caller argument origins are not recorded.',
  'Return links require an explicit recorded destination. Nearby caller assignments do not prove a return binding.',
  'Array origins are followed only when recorded. General expression operands and failed dereference operands are not reconstructed.',
  'An allocation event is the first safe observation of an identity, not necessarily the JVM allocation instruction.',
])

export function causeLimitations(): readonly string[] { return limitations }

function sameOwner(left: SlotOwner, right: CauseTarget): boolean {
  return left.kind === right.kind && left.slotId === right.slotId &&
    (left.kind === 'frame'
      ? right.kind === 'frame' && left.frameId === right.frameId
      : right.kind === 'object' && left.objectId === right.objectId)
}

function valueLabel(value: RuntimeValue): string {
  switch (value.kind) {
    case 'primitive': return String(value.value)
    case 'stringSummary': return JSON.stringify(value.value)
    case 'reference': return `→ ${value.objectId}`
    case 'null': return 'null'
    case 'uninitialized': return 'uninitialized'
  }
}

interface Observation {
  selection: NonNullable<Selection>
  value: RuntimeValue
  relationship: CauseNode['relationship']
  label: string
  origin?: CauseTarget
}

/** Queries facts already validated by the trace boundary; it never evaluates Java. */
function observation(event: TraceEvent, target: CauseTarget): Observation | null {
  const slot = (value: RuntimeValue, label: string, relationship: CauseNode['relationship'] = 'write'): Observation => ({
    value, label, relationship,
    selection: { kind: 'slot', id: target.kind === 'array' ? arrayElementSlotId(target.objectId, target.index) : target.slotId },
  })
  const local = (frameId: string, slotId: string) => target.kind === 'frame' && target.frameId === frameId && target.slotId === slotId
  const field = (objectId: string, slotId: string) => target.kind === 'object' && target.objectId === objectId && target.slotId === slotId
  switch (event.type) {
    case 'ENTER_METHOD': {
      if (target.kind !== 'frame' || target.frameId !== event.frameId) return null
      const entry = event.locals.find((candidate) => candidate.id === target.slotId)
      if (!entry) return null
      const bound = entry.role === 'parameter' || entry.name === 'this'
      return slot(entry.value, bound ? `Observed ${entry.name === 'this' ? 'this' : 'parameter'} binding: ${entry.name}; caller origin not recorded`
        : `Observed initial local: ${entry.name}`, bound ? 'binding' : 'write')
    }
    case 'DECLARE_LOCAL': {
      if (!local(event.frameId, event.slot.id)) return null
      const bound = event.slot.role === 'parameter' || event.slot.name === 'this'
      return slot(event.slot.value, bound ? `Observed ${event.slot.name === 'this' ? 'this' : 'parameter'} binding: ${event.slot.name}; caller origin not recorded`
        : `Observed declaration: ${event.slot.name}`, bound ? 'binding' : 'write')
    }
    case 'ASSIGN_LOCAL': return local(event.frameId, event.slotId) ? slot(event.value, 'Observed local assignment') : null
    case 'SET_FIELD': return field(event.objectId, event.slotId) ? slot(event.value, 'Observed field write') : null
    case 'CREATE_REFERENCE': return sameOwner(event.sourceSlot, target) ? {
      ...slot({ kind: 'reference', javaType: event.javaType, objectId: event.targetObjectId }, 'Proven reference assignment'),
      selection: { kind: 'reference', id: referenceIdForSlot(event.sourceSlot.slotId) },
    } : null
    case 'CLEAR_REFERENCE': return sameOwner(event.sourceSlot, target) ? slot({ kind: 'null' }, 'Observed reference cleared') : null
    case 'RETURN_VALUE': {
      const destination = event.destination
      if (destination && local(destination.frameId, destination.slotId)) return {
        ...slot(event.value, `Proven return from ${event.frameId} to ${destination.slotId}`, 'return'),
        selection: { kind: 'frame', id: event.frameId },
      }
      return local(event.frameId, `return:${event.frameId}`)
        ? slot(event.value, destination ? `Observed return; proven destination ${destination.slotId}` : 'Observed return; caller destination not recorded', 'return') : null
    }
    case 'ALLOCATE_OBJECT': {
      if (target.kind !== 'object' || target.objectId !== event.objectId) return null
      const entry = event.fields.find((candidate) => candidate.id === target.slotId)
      return entry ? slot(entry.value, `Observed field at allocation: ${entry.name}`, 'allocation') : null
    }
    case 'ALLOCATE_ARRAY': {
      if (target.kind !== 'array' || target.objectId !== event.objectId) return null
      const value = event.elements[target.index]
      return value ? slot(value, `Observed array element at allocation: [${target.index}]`, 'allocation') : null
    }
    case 'ARRAY_WRITE': {
      if (target.kind !== 'array' || target.objectId !== event.objectId || target.index !== event.index) return null
      const origin: CauseTarget | undefined = event.from?.kind === 'slot'
        ? { kind: 'frame', frameId: event.from.frameId, slotId: event.from.slotId }
        : event.from?.kind === 'element' ? { kind: 'array', objectId: event.objectId, index: event.from.index } : undefined
      return { ...slot(event.value, origin ? 'Observed array write; proven recorded origin' : 'Observed array write; origin not recorded'), origin }
    }
    case 'ARRAY_READ': return event.destinationSlotId && local(event.frameId, event.destinationSlotId) ? {
      ...slot(event.value, 'Proven indexed read into local'),
      origin: { kind: 'array', objectId: event.objectId, index: event.index },
    } : null
    case 'INPUT_READ': return local(event.frameId, event.destinationSlotId) ? slot(event.value, 'Observed input binding', 'binding') : null
    default: return null
  }
}

/** Latest first. Earlier writes remain explicitly labeled history, never an inferred causal chain. */
export function causeHistory(trace: TraceDocument, target: CauseTarget, cursor: number): CauseNode[] {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > trace.events.length)
    throw new RangeError(`Cursor must be an integer from 0 to ${trace.events.length}`)
  if (target.kind === 'array' && (!Number.isInteger(target.index) || target.index < 0))
    throw new RangeError('Array index must be a nonnegative integer')
  const nodes: CauseNode[] = []
  const identities = new Map<string, CauseNode>()
  const add = (index: number, fact: Observation, prefix: string) => {
    const event = trace.events[index]
    const identity = `${index}:${fact.selection.kind}:${fact.selection.id}`
    const label = `${prefix} · ${fact.label} = ${valueLabel(fact.value)}`
    const existing = identities.get(identity)
    if (existing) {
      // A recorded self-copy may prove that a previous historical write is also an origin.
      if (prefix.startsWith('Proven')) existing.label = label
      return
    }
    const node: CauseNode = { eventId: event.eventId, cursor: index + 1, source: event.source ? { ...event.source } : null,
      selection: { ...fact.selection }, label,
      value: structuredClone(fact.value), relationship: fact.relationship }
    identities.set(identity, node)
    nodes.push(node)
  }
  let latest: { index: number; fact: Observation } | null = null
  for (let index = cursor - 1; index >= 0; index--) {
    const fact = observation(trace.events[index], target)
    if (!fact) continue
    add(index, fact, latest ? 'Earlier write history' : 'Latest observation')
    latest ??= { index, fact }
  }
  // Only the current value's explicit origins form dependencies. Prior target writes remain history.
  while (latest) {
    const { index, fact } = latest
    latest = null
    if (fact.origin) {
      for (let prior = index - 1; prior >= 0; prior--) {
        const source = observation(trace.events[prior], fact.origin)
        if (!source) continue
        add(prior, source, `Proven source for ${trace.events[index].eventId}`)
        latest = { index: prior, fact: source }
        break
      }
    } else if (fact.value.kind === 'reference') {
      const objectId = fact.value.objectId
      for (let prior = index - 1; prior >= 0; prior--) {
        const event = trace.events[prior]
        if ((event.type === 'ALLOCATE_OBJECT' || event.type === 'ALLOCATE_ARRAY') && event.objectId === objectId) {
          add(prior, { value: fact.value, selection: { kind: 'object', id: objectId }, relationship: 'allocation',
            label: 'Proven allocation observation of reference target' }, `Proven identity link for ${trace.events[index].eventId}`)
          break
        }
      }
    }
  }
  return nodes.sort((left, right) => right.cursor - left.cursor)
}
