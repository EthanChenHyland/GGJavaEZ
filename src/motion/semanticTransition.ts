import { arrayElementSlotId, type RuntimeState, type RuntimeValue, type TraceDocument, type TraceEvent } from '../contracts/runtime'
import { historyForTrace } from '../runtime/history'
import { persistentAppend, persistentArray } from '../runtime/storage'

export type FlowEndpoint =
  | { kind: 'slot'; id: string }
  | { kind: 'frame'; id: string }
  | { kind: 'object'; id: string }
  | { kind: 'io'; id: 'stdin' | 'stdout' | 'stderr' }

export type FlowEvidence = 'observed' | 'correlated' | 'local'
export type SemanticTransitionKind = 'assignment' | 'parameter' | 'return' | 'allocation' | 'field-write' | 'reference' | 'null' | 'array-read' | 'array-write' | 'input' | 'output' | 'branch' | 'loop' | 'frame-enter' | 'frame-exit' | 'exception'

/** Presentation facts only. Never store these in RuntimeState or use them to advance execution. */
export interface SemanticTransition {
  id: string
  seq: number
  kind: SemanticTransitionKind
  label: string
  value?: RuntimeValue
  from?: FlowEndpoint
  to?: FlowEndpoint
  evidence: FlowEvidence
  source: TraceEvent['source']
  importance: TraceEvent['importance']
}

const slot = (id: string): FlowEndpoint => ({ kind: 'slot', id })
const frame = (id: string): FlowEndpoint => ({ kind: 'frame', id })
const object = (id: string): FlowEndpoint => ({ kind: 'object', id })
const io = (id: 'stdin' | 'stdout' | 'stderr'): FlowEndpoint => ({ kind: 'io', id })

function sameValue(left: RuntimeValue, right: RuntimeValue): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'reference' && right.kind === 'reference') return left.objectId === right.objectId
  if ('value' in left && 'value' in right) return left.value === right.value
  return true
}

/** A unique same-named, same-valued active slot is a correlation, not proven bytecode provenance. */
function correlatedSource(before: RuntimeState, destinationName: string, value: RuntimeValue, excludeId?: string): FlowEndpoint | undefined {
  const matches = before.activeFrameIds.flatMap((id) => Object.values(before.frames[id]?.locals ?? {}).filter((candidate) =>
    candidate.id !== excludeId && candidate.name === destinationName && sameValue(candidate.value, value)))
  return matches.length === 1 ? slot(matches[0].id) : undefined
}

export function deriveSemanticTransition(before: RuntimeState, event: TraceEvent, after: RuntimeState): SemanticTransition | null {
  const base = { id: event.eventId, seq: event.seq, label: event.label, source: event.source, importance: event.importance } as const
  switch (event.type) {
    case 'DECLARE_LOCAL':
      // A parameter's caller is known, but the value's origin is not.
      return { ...base, kind: event.slot.role === 'parameter' ? 'parameter' : 'assignment', value: event.slot.value,
        to: slot(event.slot.id), evidence: 'local' }
    case 'ASSIGN_LOCAL': {
      const target = after.frames[event.frameId]?.locals[event.slotId]
      if (!target) return null
      const from = correlatedSource(before, target.name, event.value, event.slotId)
      return { ...base, kind: 'assignment', value: event.value, from, to: slot(event.slotId), evidence: from ? 'correlated' : 'local' }
    }
    case 'ENTER_METHOD': return { ...base, kind: 'frame-enter', from: event.callerFrameId ? frame(event.callerFrameId) : undefined,
      to: frame(event.frameId), evidence: 'observed' }
    case 'EXIT_METHOD': return { ...base, kind: 'frame-exit', from: frame(event.frameId),
      to: before.frames[event.frameId]?.callerFrameId ? frame(before.frames[event.frameId].callerFrameId!) : undefined, evidence: 'observed' }
    case 'RETURN_VALUE': return { ...base, kind: 'return', value: event.value, from: slot(`return:${event.frameId}`),
      to: event.destination ? slot(event.destination.slotId) : undefined, evidence: 'observed' }
    case 'ALLOCATE_OBJECT': return { ...base, kind: 'allocation', to: object(event.objectId), evidence: 'observed' }
    case 'ALLOCATE_ARRAY': return { ...base, kind: 'allocation', to: object(event.objectId), evidence: 'observed' }
    case 'SET_FIELD': {
      const field = after.objects[event.objectId]?.fields[event.slotId]
      if (!field) return null
      const from = correlatedSource(before, field.name, event.value)
      return { ...base, kind: 'field-write', value: event.value, from, to: slot(event.slotId), evidence: from ? 'correlated' : 'local' }
    }
    case 'CREATE_REFERENCE': return { ...base, kind: 'reference', from: slot(event.sourceSlot.slotId), to: object(event.targetObjectId),
      value: { kind: 'reference', javaType: event.javaType, objectId: event.targetObjectId }, evidence: 'observed' }
    case 'CLEAR_REFERENCE': return { ...base, kind: 'null', to: slot(event.sourceSlot.slotId), value: { kind: 'null' }, evidence: 'observed' }
    case 'ARRAY_READ': return { ...base, kind: 'array-read', value: event.value, from: slot(arrayElementSlotId(event.objectId, event.index)),
      to: event.destinationSlotId ? slot(event.destinationSlotId) : undefined, evidence: 'observed' }
    case 'ARRAY_WRITE': return { ...base, kind: 'array-write', value: event.value,
      from: event.from ? event.from.kind === 'slot' ? slot(event.from.slotId) : slot(arrayElementSlotId(event.objectId, event.from.index)) : undefined,
      to: slot(arrayElementSlotId(event.objectId, event.index)), evidence: event.from ? 'observed' : 'local' }
    case 'INPUT_READ': return { ...base, kind: 'input', value: event.value, from: io('stdin'), to: slot(event.destinationSlotId), evidence: 'observed' }
    case 'CONSOLE_INPUT': return { ...base, kind: 'input', value: { kind: 'stringSummary', javaType: 'String', value: event.text },
      from: io('stdin'), to: event.frameId ? frame(event.frameId) : undefined, evidence: 'observed' }
    case 'OUTPUT_WRITE': return { ...base, kind: 'output', value: event.value,
      ...(event.originSlotId ? { from: slot(event.originSlotId) } : {}), to: io('stdout'), evidence: event.originSlotId ? 'observed' : 'local' }
    case 'CONSOLE_WRITE': return { ...base, kind: 'output', value: { kind: 'stringSummary', javaType: 'String', value: event.text },
      to: io(event.channel), evidence: 'local' }
    case 'EVALUATE_CONDITION': return { ...base, kind: event.kind === 'loop' ? 'loop' : 'branch', to: frame(event.frameId), evidence: 'observed' }
    case 'LOOP_ITERATION': return { ...base, kind: 'loop', to: frame(event.frameId), evidence: 'observed' }
    case 'BRANCH_EVALUATE': return { ...base, kind: 'branch', to: frame(event.frameId), evidence: 'observed' }
    case 'THROW_EXCEPTION': return { ...base, kind: 'exception', from: frame(event.frameId), to: object(event.exceptionId), evidence: 'observed' }
    case 'UNWIND_EXCEPTION': return { ...base, kind: 'exception', from: frame(event.frameId),
      to: before.frames[event.frameId]?.callerFrameId ? frame(before.frames[event.frameId].callerFrameId!) : undefined, evidence: 'observed' }
    default: return null
  }
}

type TransitionIndex = { first: TraceEvent | undefined; last: TraceEvent | undefined; count: number; items: SemanticTransition[] }
const indices = new WeakMap<TraceDocument, TransitionIndex>()

/** Derive only the semantic suffix from the shared history's adjacent snapshots.
 * Materialization uses the efficient engine/checkpoints, avoiding the former second
 * whole-entity reducer pass. Cache lifetime follows the trace document; equal demo
 * IDs in separate sessions cannot share history.
 * Events are immutable; replacing/truncating the prefix boundary resets the index.
 */
export function transitionsForTrace(trace: TraceDocument): readonly SemanticTransition[] {
  let index = indices.get(trace)
  if (!index || index.count > trace.events.length || (index.count > 0 &&
    (trace.events[0] !== index.first || trace.events[index.count - 1] !== index.last))) {
    index = { count: 0, first: undefined, last: undefined, items: persistentArray([]) }
    indices.set(trace, index)
  }
  if (index.count === trace.events.length) return index.items
  const history = historyForTrace(trace)
  let before = history.materialize(index.count)
  for (let cursor = index.count; cursor < trace.events.length; cursor++) {
    const event = trace.events[cursor]
    const next = history.materialize(cursor + 1)
    const transition = deriveSemanticTransition(before, event, next)
    if (transition) index.items = persistentAppend(index.items, transition)
    before = next
    index.count = cursor + 1
    index.first = trace.events[0]
    index.last = event
  }
  return index.items
}
