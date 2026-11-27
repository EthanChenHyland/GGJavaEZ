import { arrayElementSlotId, type RuntimeState, type RuntimeValue, type TraceDocument, type TraceEvent } from '../contracts/runtime'
import type { ExecutionGraph, GraphEdge, GraphEdgeKind, GraphStorage } from '../contracts/executionGraph'
import { historyForTrace } from '../runtime/history'
import { persistentAppend, persistentArray } from '../runtime/storage'

export type FlowEndpoint =
  | { kind: 'slot'; id: string }
  | { kind: 'frame'; id: string }
  | { kind: 'object'; id: string }
  | { kind: 'class'; id: string }
  | { kind: 'io'; id: 'stdin' | 'stdout' | 'stderr' }

/** correlated remains a legacy renderer type only; this module never emits it. */
export type FlowEvidence = 'observed' | 'bytecode-derived' | 'correlated' | 'local'
export type SemanticTransitionKind = 'assignment' | 'parameter' | 'receiver' | 'return' | 'allocation' | 'field-write' | 'reference' | 'null' | 'field-read' | 'array-read' | 'array-write' | 'input' | 'output' | 'branch' | 'loop' | 'frame-enter' | 'frame-exit' | 'throw' | 'unwind' | 'catch' | 'uncaught'

/** Presentation facts only. Never store these in RuntimeState or use them to advance execution. */
export interface SemanticTransition {
  id: string
  seq: number
  kind: SemanticTransitionKind
  label: string
  value?: RuntimeValue
  previousValue?: RuntimeValue
  /** Exact appended edge, and (if different) its route in the current presentation. */
  edgeId?: string
  routeId?: string
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
const arrayCell = (state: RuntimeState, objectId: string, index: number) => {
  const array = state.objects[objectId]?.array
  return array?.elements[index] ?? array?.sparseElements?.[index]
}

/** Resolve only identities with existing runtime geometry. Graph values/calls are
 * not geometry: direct producer edges can reveal a storage endpoint, but a
 * computed/literal/unknown value must never be collapsed onto an operand. */
function graphEndpoint(id: string, state: RuntimeState, graph: ExecutionGraph, remaining = 8, budget = { remaining: 32 }): FlowEndpoint | undefined {
  if (--budget.remaining < 0) return undefined
  const storage = graph.storage[id]
  if (storage) {
    if (storage.kind === 'variable') return state.frames[storage.ownerId]?.locals[id] ? slot(id) : undefined
    if (storage.kind === 'static') return state.classes?.[storage.ownerId]?.statics[id] ? slot(id) : undefined
    const owner = state.objects[storage.ownerId]
    if (storage.kind === 'field') return owner?.fields[id] ? slot(id) : undefined
    // Indexed cell IDs belong to the common array slot contract.
    const array = owner?.array
    if (array && id.startsWith(`${storage.ownerId}:element:`)) {
      const index = Number(id.slice(`${storage.ownerId}:element:`.length))
      if (Number.isInteger(index) && index >= 0 && (array.elements[index]?.id === id || array.sparseElements?.[index]?.id === id)) return slot(id)
    }
    return undefined
  }
  if (state.frames[id]) return frame(id)
  if (state.objects[id]) return object(id)
  if (state.classes?.[id]) return { kind: 'class', id }
  const channel = graph.io[id]
  if (channel && channel.kind !== 'input-bytes' && channel.channel !== 'file') return io(channel.channel)
  const value = graph.values[id]
  if (!value || remaining === 0) return undefined
  // A return has its own real frame subdivision, separate from its operands.
  const invocation = value.kind === 'return' && value.context.frameId ? state.frames[value.context.frameId] : undefined
  if (invocation?.returnValue) return slot(`return:${invocation.id}`)
  if (value.kind === 'computed' || value.kind === 'literal' || value.kind === 'unknown') return undefined
  const incoming = graph.incoming[id] ?? []
  // Producer nodes have bounded incoming edges. Ambiguous/large fan-in stays local.
  if (incoming.length > 8) return undefined
  let origin: FlowEndpoint | undefined
  for (const index of incoming) {
    const edge = graph.edges[index]
    if (!edge || edge.evidence === 'unknown' || !directProducerKinds.has(edge.kind)) continue
    // Completion links identify the invocation, not a physical value source.
    if (edge.kind === 'RETURN' && (graph.invocations[edge.from] || graph.calls[edge.from])) continue
    const candidate = graphEndpoint(edge.originSlotId ?? edge.from, state, graph, remaining - 1, budget)
    if (!candidate) continue
    if (origin && (origin.id !== candidate.id || origin.kind !== candidate.kind)) return undefined
    origin = candidate
  }
  return budget.remaining < 0 ? undefined : origin
}

const directProducerKinds = new Set<GraphEdgeKind>(['ASSIGN', 'FIELD_READ', 'STATIC_READ', 'ARRAY_READ', 'RETURN', 'INPUT_CONSUME'])
const edgeKinds: Partial<Record<GraphEdgeKind, SemanticTransitionKind>> = {
  CALL: 'frame-enter', ARGUMENT_BIND: 'parameter', RECEIVER_BIND: 'receiver', RETURN: 'return',
  ASSIGN: 'assignment', FIELD_WRITE: 'field-write', FIELD_READ: 'field-read', ARRAY_WRITE: 'array-write',
  ARRAY_READ: 'array-read', STATIC_READ: 'field-read', STATIC_WRITE: 'field-write', REFERENCE_BIND: 'reference', INPUT_CONSUME: 'input', OUTPUT: 'output',
  THROW: 'throw', UNWIND: 'unwind', CATCH: 'catch',
}

/** A prefix scan can reuse top-level answers. Recursive walks still have
 * their own shared work and depth limits, independent of the scan order. */
function scanEndpoint(id: string, state: RuntimeState, graph: ExecutionGraph, cache?: Map<string, FlowEndpoint | null>): FlowEndpoint | undefined {
  const known = cache?.get(id)
  if (known !== undefined) return known ?? undefined
  const endpoint = graphEndpoint(id, state, graph)
  if (cache && cache.size < 512) cache.set(id, endpoint ?? null)
  return endpoint
}

/** Resolve the physical endpoints without constructing motion presentation data. */
export function graphTransitionEndpoints(event: TraceEvent, edge: GraphEdge, state: RuntimeState, graph: ExecutionGraph, cache?: Map<string, FlowEndpoint | null>): { from: FlowEndpoint | undefined; to: FlowEndpoint | undefined } {
  let to = scanEndpoint(edge.to, state, graph, cache)
  let from = edge.evidence === 'unknown' ? undefined : scanEndpoint(edge.originSlotId ?? edge.from, state, graph, cache)
  if (event.type === 'EXECUTION_FACT' && edge.evidence !== 'unknown' && !edge.originSlotId) {
    const fact = event.fact
    // Retained raw recipes are a fallback for edges without the exact load slot.
    // A consumer's explicit bytecode slot recipe disambiguates aliases and works
    // even when that slot was initialized from a literal/computed/unknown root.
    const origin = fact.kind === 'write' && edge.to === fact.target.id || fact.kind === 'return' && edge.kind === 'RETURN' ? fact.origin : undefined
    if (origin?.kind === 'local' && edge.to !== origin.slotId) from = scanEndpoint(origin.slotId, state, graph, cache)
  }
  if (edge.kind === 'CALL') {
    const call = graph.calls[edge.from]
    if (call?.callerInvocationId) from = scanEndpoint(call.callerInvocationId, state, graph, cache)
  }
  // Completion and output-operation edges do not prove a value left a frame.
  if (edge.kind === 'RETURN' && (graph.invocations[edge.from] || graph.calls[edge.from])) from = undefined
  if (edge.kind === 'OUTPUT' && !graph.values[edge.from] && !graph.storage[edge.from]) from = undefined
  if (from?.id === to?.id && from?.kind === to?.kind) from = undefined
  if (edge.kind === 'FIELD_READ' || edge.kind === 'STATIC_READ' || edge.kind === 'ARRAY_READ') {
    // A read into an evaluation operand emphasizes its actual source subdivision.
    if (!to) { to = from; from = undefined }
  }
  return { from, to }
}

export function graphTransition(event: TraceEvent, edge: GraphEdge, state: RuntimeState, graph: ExecutionGraph, includeStructural = false): SemanticTransition | null {
  const kind = edgeKinds[edge.kind]
  if (!kind) return null // COMPUTE has no physical value geometry yet.
  // Completion records must not animate a second copy of the returned value.
  if (kind === 'return' && (graph.invocations[edge.from] || graph.calls[edge.from])) return null
  let { from, to } = graphTransitionEndpoints(event, edge, state, graph)
  // The physical exception object is optional. The recorded invocation still
  // identifies the local cue; the call operation's duplicate THROW does not.
  if (kind === 'throw' && from?.kind !== 'frame' && !includeStructural) return null
  if (kind === 'input' && from?.id === 'stdin' && !to) { to = from; from = undefined }
  if (!to && !(from && (kind === 'unwind' || kind === 'throw')) && !includeStructural) return null
  const valueId = graph.storage[edge.from]?.valueId
  const value = graph.values[edge.from] ?? graph.values[edge.to] ?? (valueId ? graph.values[valueId] : undefined)
  return { id: `${event.eventId}:${edge.id}`, edgeId: edge.id, seq: event.seq, kind, label: event.label,
    ...(kind === 'frame-enter' && graph.calls[edge.from] ? { routeId: edge.from } : {}),
    source: edge.context.source, importance: event.importance, value: value?.value,
    ...(from ? { from } : {}), to, evidence: from ? edge.evidence === 'bytecode-derived' ? 'bytecode-derived' : 'observed' : 'local' }
}

function previousSlotValue(state: RuntimeState, target: Omit<GraphStorage, 'valueId' | 'writerInvocationId'>): RuntimeValue | undefined {
  if (target.kind === 'variable') return state.frames[target.ownerId]?.locals[target.id]?.value
  if (target.kind === 'static') return state.classes?.[target.ownerId]?.statics[target.id]?.value
  if (target.kind === 'field') return state.objects[target.ownerId]?.fields[target.id]?.value
  const index = Number(target.id.slice(`${target.ownerId}:element:`.length))
  const cell = Number.isSafeInteger(index) && index >= 0 ? arrayCell(state, target.ownerId, index) : undefined
  return cell && cell.id === target.id ? cell.value : undefined
}

/** The consuming write is a separate accepted event. Follow the exact dynamic
 * call result back to its accepted producer edge, never a same-valued return. */
function consumedCallResult(event: Extract<TraceEvent, { type: 'EXECUTION_FACT' }>, edge: GraphEdge, graph: ExecutionGraph, transition: SemanticTransition) {
  if (event.fact.kind !== 'write' || event.fact.origin.kind !== 'call_result' || transition.evidence === 'local') return null
  const inbound = graph.incoming[edge.from] ?? []
  // Producer links precede all consumers and are a small prefix of this
  // adjacency vector even when a value is used by many later invocations.
  let input: GraphEdge | undefined, returned: GraphEdge | undefined
  for (let i = 0; i < Math.min(inbound.length, 8); i++) {
    const candidate = graph.edges[inbound[i]]
    if (candidate.kind === 'INPUT_CONSUME' && graph.io[candidate.from]?.kind === 'input-consume') input ??= candidate
    if (candidate.kind === 'RETURN' && !graph.calls[candidate.from] && !graph.invocations[candidate.from]) returned ??= candidate
  }
  if (input && transition.from?.kind === 'io' && transition.from.id === 'stdin') return { kind: 'input' as const, routeId: input.id }
  if (returned && transition.from?.kind === 'slot' && transition.from.id.startsWith('return:')) return { kind: 'return' as const, routeId: returned.id }
  return null
}

/** New graph edges only. No prefix scans, name matching, equal-value matching or
 * source-line correlation; bytecode evidence is the sole generic flow authority. */
export function deriveSemanticTransitions(before: RuntimeState, event: TraceEvent, after: RuntimeState): SemanticTransition[] {
  if (event.type !== 'EXECUTION_FACT') {
    const transition = deriveSemanticTransition(before, event, after)
    return transition ? [transition] : []
  }
  const graph = after.executionGraph
  if (!graph) return []
  const result: SemanticTransition[] = []
  for (let index = before.executionGraph?.edges.length ?? 0; index < graph.edges.length; index++) {
    const edge = graph.edges[index]
    if (edge.eventId !== event.eventId) continue
    const transition = graphTransition(event, edge, after, graph)
    if (!transition) continue
    if (event.fact.kind === 'write' && edge.to === event.fact.target.id) {
      transition.previousValue = previousSlotValue(before, event.fact.target)
      // The fact is the actual new value, independent of whether it was
      // computed, unavailable, or reconciling a raw observation.
      transition.value = event.fact.value
      Object.assign(transition, consumedCallResult(event, edge, graph, transition))
    }
    result.push(transition)
  }
  return result
}

export function deriveSemanticTransition(before: RuntimeState, event: TraceEvent, after: RuntimeState): SemanticTransition | null {
  const base = { id: event.eventId, seq: event.seq, label: event.label, source: event.source, importance: event.importance } as const
  switch (event.type) {
    case 'EXECUTION_FACT': {
      const transitions = deriveSemanticTransitions(before, event, after)
      // Existing playback has one active overlay; retain every edge in history.
      return transitions.find((transition) => transition.from && transition.kind !== 'frame-enter') ?? transitions[0] ?? null
    }
    case 'DECLARE_LOCAL':
      // A parameter's caller is known, but the value's origin is not.
      return { ...base, kind: event.slot.role === 'parameter' ? 'parameter' : 'assignment', value: event.slot.value,
        to: slot(event.slot.id), evidence: 'local' }
    case 'ASSIGN_LOCAL': {
      const target = after.frames[event.frameId]?.locals[event.slotId]
      if (!target) return null
      return { ...base, kind: 'assignment', value: event.value, previousValue: before.frames[event.frameId]?.locals[event.slotId]?.value, to: slot(event.slotId), evidence: 'local' }
    }
    case 'ENTER_METHOD':
      // Enriched recordings prove calls separately. Stack adjacency may cross an
      // opaque library callback and must not be rendered as a direct invocation.
      if (before.executionGraph || after.executionGraph) return { ...base, kind: 'frame-enter', to: frame(event.frameId), evidence: 'local' }
      return { ...base, kind: 'frame-enter', from: event.callerFrameId ? frame(event.callerFrameId) : undefined,
        to: frame(event.frameId), routeId: `call:${event.eventId}`, evidence: 'observed' }
    case 'EXIT_METHOD':
      if (before.executionGraph || after.executionGraph) return { ...base, kind: 'frame-exit', from: frame(event.frameId), evidence: 'local' }
      return { ...base, kind: 'frame-exit', from: frame(event.frameId),
        to: before.frames[event.frameId]?.callerFrameId ? frame(before.frames[event.frameId].callerFrameId!) : undefined, evidence: 'observed' }
    case 'RETURN_VALUE': return { ...base, kind: 'return', value: event.value, from: slot(`return:${event.frameId}`),
      to: event.destination ? slot(event.destination.slotId) : undefined, evidence: 'observed' }
    case 'ALLOCATE_OBJECT': return { ...base, kind: 'allocation', to: object(event.objectId), evidence: 'observed' }
    case 'ALLOCATE_ARRAY': return { ...base, kind: 'allocation', to: object(event.objectId), evidence: 'observed' }
    case 'SET_FIELD': {
      const field = after.objects[event.objectId]?.fields[event.slotId]
      if (!field) return null
      return { ...base, kind: 'field-write', value: event.value, previousValue: before.objects[event.objectId]?.fields[event.slotId]?.value, to: slot(event.slotId), evidence: 'local' }
    }
    case 'SET_STATIC': return { ...base, kind: 'field-write', value: event.value, previousValue: before.classes?.[event.classId]?.statics[event.slotId]?.value,
      to: slot(event.slotId), evidence: 'local' }
    case 'CREATE_REFERENCE': {
      const owner = event.sourceSlot
      const receiver = owner.kind === 'frame' && after.frames[owner.frameId]?.locals[owner.slotId]?.name === 'this'
      const holder = slot(owner.slotId), target = object(event.targetObjectId)
      return { ...base, kind: receiver ? 'receiver' : 'reference', from: receiver ? target : holder, to: receiver ? holder : target,
        value: { kind: 'reference', javaType: event.javaType, objectId: event.targetObjectId }, evidence: 'observed' }
    }
    case 'CLEAR_REFERENCE': return { ...base, kind: 'null', to: slot(event.sourceSlot.slotId), value: { kind: 'null' }, evidence: 'observed' }
    case 'ARRAY_READ': return { ...base, kind: 'array-read', value: event.value, from: slot(arrayElementSlotId(event.objectId, event.index)),
      to: event.destinationSlotId ? slot(event.destinationSlotId) : undefined, evidence: 'observed' }
    case 'ARRAY_WRITE': return { ...base, kind: 'array-write', value: event.value, previousValue: arrayCell(before, event.objectId, event.index)?.value,
      from: event.from ? event.from.kind === 'slot' ? slot(event.from.slotId) : slot(arrayElementSlotId(event.objectId, event.from.index)) : undefined,
      to: slot(arrayElementSlotId(event.objectId, event.index)), evidence: event.from ? 'observed' : 'local' }
    case 'INPUT_READ': return { ...base, kind: 'input', value: event.value, from: io('stdin'), to: slot(event.destinationSlotId), evidence: 'observed' }
    case 'CONSOLE_INPUT': return { ...base, kind: 'input', value: { kind: 'stringSummary', javaType: 'String', value: event.text },
      // Console bytes alone do not prove token consumption or a frame transfer.
      to: io('stdin'), evidence: 'local' }
    case 'OUTPUT_WRITE': return { ...base, kind: 'output', value: event.value,
      ...(event.originSlotId ? { from: slot(event.originSlotId) } : {}), to: io('stdout'), evidence: event.originSlotId ? 'observed' : 'local' }
    case 'CONSOLE_WRITE': return { ...base, kind: 'output', value: { kind: 'stringSummary', javaType: 'String', value: event.text },
      to: io(event.channel), evidence: 'local' }
    case 'EVALUATE_CONDITION': return { ...base, kind: event.kind === 'loop' ? 'loop' : 'branch', to: frame(event.frameId), evidence: 'observed' }
    case 'LOOP_ITERATION': return { ...base, kind: 'loop', to: frame(event.frameId), evidence: 'observed' }
    case 'BRANCH_EVALUATE': return { ...base, kind: 'branch', to: frame(event.frameId), evidence: 'observed' }
    case 'THROW_EXCEPTION': return { ...base, kind: 'throw', from: frame(event.frameId), to: object(event.exceptionId), evidence: 'observed' }
    case 'UNWIND_EXCEPTION': {
      const caller = before.executionGraph ? before.executionGraph.invocations[event.frameId]?.callerInvocationId : before.frames[event.frameId]?.callerFrameId
      return { ...base, kind: 'unwind', from: frame(event.frameId), to: caller ? frame(caller) : undefined, evidence: 'observed' }
    }
    case 'CATCH_EXCEPTION': return { ...base, kind: 'catch', from: object(event.exceptionId), to: frame(event.frameId), evidence: 'observed' }
    case 'PROGRAM_ABORT': {
      const failure = after.exceptions.at(-1)
      const origin = failure?.frameIds.at(-1)
      return event.reason === 'program_crashed' && failure && !failure.caughtBy && origin
        ? { ...base, kind: 'uncaught', from: frame(origin), to: object(failure.exceptionId), evidence: 'observed' }
        : null
    }
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
    for (const transition of deriveSemanticTransitions(before, event, next)) index.items = persistentAppend(index.items, transition)
    before = next
    index.count = cursor + 1
    index.first = trace.events[0]
    index.last = event
  }
  return index.items
}


function indexedEvent(trace: TraceDocument) {
  let tail: Map<string, TraceEvent> | undefined
  return { get(id: string): TraceEvent | undefined {
    // Normalized event identities carry their semantic ordinal. Verify exact
    // identity before use; this lookup does not infer execution from a label.
    const ordinal = Number(id.slice(id.lastIndexOf(':') + 1))
    const event = Number.isSafeInteger(ordinal) && ordinal >= 0 ? trace.events[ordinal] : undefined
    if (event?.eventId === id) return event
    // Imported/custom schemas retain arbitrary IDs. A bounded tail fallback
    // keeps presentation queries bounded even across immutable live prefixes.
    if (!tail) tail = new Map(trace.events.slice(-1024).map(item => [item.eventId, item]))
    return tail.get(id)
  } }
}

/** Bounded presentation query over the accepted graph. Unlike the export index,
 * opening or seeking a world never materializes every adjacent history state.
 * Selection uses real graph adjacency, including old transfers, with bounded
 * fan-in. Runtime history itself remains complete and untouched. */
export function recentFlowTransitions(trace: TraceDocument, state: RuntimeState, selectedIds: ReadonlySet<string>, limit = 24): SemanticTransition[] {
  limit = Math.max(0, Math.min(24, Math.floor(limit)))
  if (!limit) return []
  const graph = state.executionGraph
  const candidates = new Set<number>()
  if (graph) {
    if (selectedIds.size) for (const id of selectedIds) {
      for (const list of [graph.incoming[id], graph.outgoing[id]]) {
        if (list) for (let i = Math.max(0, list.length - 128); i < list.length; i++) candidates.add(list[i])
      }
    } else for (let i = Math.max(0, graph.edges.length - 256); i < graph.edges.length; i++) candidates.add(i)
    const events = indexedEvent(trace)
    const result: SemanticTransition[] = []
    for (const i of [...candidates].sort((a, b) => b - a)) {
      const edge = graph.edges[i], event = edge && events.get(edge.eventId)
      const transition = event && graphTransition(event, edge, state, graph)
      if (transition?.from && transition.to && transition.evidence !== 'local' && transition.kind !== 'frame-enter' && transition.kind !== 'frame-exit') result.push(transition)
      if (result.length >= limit) break
    }
    return result.reverse()
  }
  // Deterministic demos have no graph. Only the visible historical window is
  // reconstructed; an arbitrary seek snaps directly to its accepted state.
  const history = historyForTrace(trace), end = Math.min(state.cursor, trace.events.length)
  const result: SemanticTransition[] = []
  for (let i = end - 1; i >= Math.max(0, end - 128); i--) {
    const transition = deriveSemanticTransition(history.materialize(i), trace.events[i], history.materialize(i + 1))
    if (transition?.from && transition.to && transition.evidence !== 'local' && transition.kind !== 'frame-enter' && transition.kind !== 'frame-exit' && (!selectedIds.size || selectedIds.has(transition.from.id) || selectedIds.has(transition.to.id))) result.push(transition)
    if (result.length >= limit) break
  }
  return result.reverse()
}
