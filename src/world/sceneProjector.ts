import type { ExecutionGraph, GraphEdge, GraphIO } from '../contracts/executionGraph'
import { arrayElementSlotId, referenceIdForSlot, type RuntimeClass, type RuntimeFrame, type RuntimeObject, type RuntimeSlot, type RuntimeState, type SourceLocation, type TraceDocument, type TraceEvent } from '../contracts/runtime'
import type { RecordingStatus } from '../instrumentation/contracts'
import type { Evidence, LayoutState, SceneArray, SceneCollection, SceneClass, SceneEntity, SceneExceptionPath, SceneFrame, SceneIo, SceneModel, SceneObject, SceneReference, SceneReturnFlow, SceneRow, WorldAnchor } from '../contracts/worldV2'
import { createReductionEngine } from '../runtime/engine'
import { freezeValue, persistentAppend, persistentArray, persistentPut, persistentRecord } from '../runtime/storage'
import { displayType } from './displayType'
import { collectionSummary } from './collectionSummary'
import { frameStatus } from './frameStatus'
import { frameTitle } from './frameTitle'
import { consoleIoSummaries, graphIoSummaries } from './ioSummary'
import { stringValueText, valueText } from './valueText'
import {createRecordedReferenceBindings} from './recordedReferenceBindings'
import {recordedReturnDestination} from './returnEvidence'

export interface ProjectionContext {
  sessionEnded: boolean
  pausedAtLiveHead: boolean
  /** Accepted, completely normalized semantic prefix, not lastRecordedSeq. */
  liveHead: number
  recording: RecordingStatus
}
export interface SceneProjector {
  advance(state: RuntimeState, layout: LayoutState, events: readonly TraceEvent[], from: number, to: number, context: ProjectionContext): SceneModel
  project(state: RuntimeState, layout: LayoutState, context: ProjectionContext): SceneModel
}

interface SlotHistory { introduced: number; assignments: number[]; observations: number[]; writes: number[] }
interface OwnerHistory { introduced: number; changes: number[]; sources: { seq: number; source: SourceLocation }[]; slots: Map<string, SlotHistory>; invocationNumber: number }
interface CachedNode<T> { anchor: WorldAnchor; signature: string; dependencies: readonly (RuntimeObject | undefined)[]; node: T }
interface LineSummary { breaks: number; partial: boolean; pendingCR: boolean; current: string; last: string; first: string; changed: string }
type Channels = Map<SceneIo['id'], LineSummary>
const unavailable = (reason: string): Evidence => ({ kind: 'unavailable', introducedSeq: null, changedSeq: null, eventIds: [], unavailableReason: reason })

function lastBefore(values: readonly number[], cursor: number): number | null {
  let low = 0, high = values.length
  while (low < high) { const mid = (low + high) >>> 1; if (values[mid] < cursor) low = mid + 1; else high = mid }
  return low ? values[low - 1] : null
}
function sameDependencies(a: readonly (RuntimeObject | undefined)[], b: readonly (RuntimeObject | undefined)[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}
function sameReferences(a: readonly SceneReference[], b: readonly SceneReference[]): boolean {
  return a.length === b.length && a.every((ref, i) => ref.id === b[i].id && ref.targetId === b[i].targetId && ref.overlay === b[i].overlay
    && ref.evidence.changedSeq === b[i].evidence.changedSeq && ref.evidence.introducedSeq === b[i].evidence.introducedSeq
    && ref.evidence.kind === b[i].evidence.kind && ref.evidence.derivation === b[i].evidence.derivation
    && ref.evidence.unavailableReason === b[i].evidence.unavailableReason
    && ref.evidence.eventIds.length === b[i].evidence.eventIds.length && ref.evidence.eventIds.every((id, index) => id === b[i].evidence.eventIds[index]))
}

interface ReferenceTree {
  count: number
  left?: ReferenceTree | null
  right?: ReferenceTree | null
  values?: readonly SceneReference[]
}
interface ReferenceGroup { root: ReferenceTree | null; depth: number; owners: number }
type ReferenceCategory = 0 | 1 | 2
const referenceCategory = (node: SceneEntity): ReferenceCategory => node.kind === 'frame' ? 0 : node.kind === 'class' ? 2 : 1

/** A changed owner copies only its O(log owners) path. Empty owner blocks keep
 * their ordinal, so adding a first reference never changes canonical ordering.
 */
function putReferenceBlock(root: ReferenceTree | null, depth: number, index: number, values: readonly SceneReference[]): ReferenceTree | null {
  if (!depth) return values.length ? { count: values.length, values } : null
  const half = 2 ** (depth - 1), left = index < half ? putReferenceBlock(root?.left ?? null, depth - 1, index, values) : root?.left ?? null
  const right = index >= half ? putReferenceBlock(root?.right ?? null, depth - 1, index - half, values) : root?.right ?? null
  const count = (left?.count ?? 0) + (right?.count ?? 0)
  return count ? { count, left, right } : null
}

/** Array-compatible immutable snapshot without eagerly flattening the catalog.
 * Sequential numeric reads cache their owner block; iteration skips empty branches.
 * Like runtime/storage's persistent vectors, the backing array has no hole storage.
 */
function referenceSnapshot(groups: readonly ReferenceGroup[]): readonly SceneReference[] {
  const roots = groups.map(group => group.root), length = roots.reduce((count, root) => count + (root?.count ?? 0), 0)
  let block: { start: number; values: readonly SceneReference[] } | undefined
  const at = (index: number): SceneReference | undefined => {
    if (index >= length) return undefined
    if (block && index >= block.start && index < block.start + block.values.length) return block.values[index - block.start]
    let start = 0
    for (const root of roots) {
      if (!root || index >= start + root.count) { start += root?.count ?? 0; continue }
      let node = root
      while (!node.values) {
        const count = node.left?.count ?? 0
        if (index < start + count) node = node.left!
        else { start += count; node = node.right! }
      }
      block = { start, values: node.values }
      return node.values[index - start]
    }
    return undefined
  }
  const numericIndex = (key: PropertyKey): number | null => typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) && Number.isSafeInteger(Number(key)) ? Number(key) : null
  const reject = (): never => { throw new TypeError('Scene reference snapshots are immutable') }
  return new Proxy([] as SceneReference[], {
    set: reject, deleteProperty: reject, defineProperty: reject, setPrototypeOf: reject, preventExtensions: reject,
    get(target, key, receiver) {
      if (key === 'length') return length
      if (key === Symbol.iterator) return function* () {
        for (const root of roots) {
          if (!root) continue
          const stack = [root]
          while (stack.length) {
            const node = stack.pop()!
            if (node.values) yield* node.values
            else { if (node.right) stack.push(node.right); if (node.left) stack.push(node.left) }
          }
        }
      }
      const index = numericIndex(key)
      return index === null ? Reflect.get(target, key, receiver) : at(index)
    },
    has(target, key) { const index = numericIndex(key); return index === null ? Reflect.has(target, key) : index < length },
    ownKeys() { return [...Array.from({ length }, (_, index) => String(index)), 'length'] },
    getOwnPropertyDescriptor(target, key) {
      if (key === 'length') return { ...Reflect.getOwnPropertyDescriptor(target, key)!, value: length }
      const index = numericIndex(key)
      return index !== null && index < length ? { value: at(index), enumerable: true, configurable: true, writable: false } : Reflect.getOwnPropertyDescriptor(target, key)
    },
  })
}

/** Append-only trace indexes contain evidence ordinals, never raw-sequence guesses.
 * Scene records are persistent; immutable runtime leaves share their projections on seek.
 * The catalog is complete. Camera, selection, cell windows and render budgets belong downstream.
 */
export function createSceneProjector(trace: TraceDocument): SceneProjector {
  let events: readonly TraceEvent[] = trace.events, indexed = 0, invocationNumber = 0, revision = 0
  const byEvent = new Map<string, TraceEvent>(), owners = new Map<string, OwnerHistory>(), slotOwners = new Map<string, string>()
  const bindingHistory=createRecordedReferenceBindings(trace.demoId)
  const frameCache = new WeakMap<RuntimeFrame, CachedNode<SceneFrame>>()
  const objectCache = new WeakMap<RuntimeObject, CachedNode<SceneObject | SceneArray | SceneCollection>>()
  const classCache = new WeakMap<RuntimeClass, CachedNode<SceneClass>>()
  const referencesCache = new WeakMap<SceneEntity, readonly SceneReference[]>()
  const graphIoCache = new WeakMap<ExecutionGraph['io'], Channels>(), consoleIoCache = new WeakMap<RuntimeState['console'], Channels>()
  let priorGraphIo: { graph: ExecutionGraph; channels: Channels } | null = null
  let priorConsoleIo: { entries: RuntimeState['console']; channels: Channels } | null = null
  let previous: { state: RuntimeState; layout: LayoutState; scene: SceneModel; context: ProjectionContext } | null = null
  let refsByOwner: Record<string, readonly SceneReference[]> = persistentRecord({})
  let referenceGroups: ReferenceGroup[] = []
  const referenceOwners = new Map<string, { category: ReferenceCategory; index: number }>()
  function resetReferences() {
    refsByOwner = persistentRecord({})
    referenceGroups = Array.from({ length: 3 }, () => ({ root: null, depth: 0, owners: 0 }))
    referenceOwners.clear()
  }
  function indexReferences(node: SceneEntity, values: readonly SceneReference[]) {
    let position = referenceOwners.get(node.id)
    if (!position) {
      const category = referenceCategory(node), group = referenceGroups[category]
      position = { category, index: group.owners++ }
      referenceOwners.set(node.id, position)
    }
    const group = referenceGroups[position.category]
    while (position.index >= 2 ** group.depth) {
      group.root = group.root ? { count: group.root.count, left: group.root, right: null } : null
      group.depth++
    }
    group.root = putReferenceBlock(group.root, group.depth, position.index, values)
    refsByOwner = persistentPut(refsByOwner, node.id, values)
  }
  // Reverse dependencies keep target String/collection summaries fresh without scanning every owner.
  const dependents = new Map<string, Set<string>>(), dependencies = new Map<string, Set<string>>()
  let returnIndex: Record<string, RuntimeState['returns'][number]> = persistentRecord({}), indexedReturns: RuntimeState['returns'] | null = null

  function owner(id: string, seq: number): OwnerHistory {
    let value = owners.get(id)
    if (!value) { value = { introduced: seq, changes: [], sources: [], slots: new Map(), invocationNumber: 0 }; owners.set(id, value) }
    return value
  }
  function observeSlot(id: string, slot: RuntimeSlot, seq: number, written: boolean, assigned = written) {
    const history = owner(id, seq)
    let record = history.slots.get(slot.id)
    if (!record) { record = { introduced: seq, assignments: [], observations: [], writes: [] }; history.slots.set(slot.id, record) }
    slotOwners.set(slot.id, id)
    record.observations.push(seq)
    if (written) record.writes.push(seq)
    if (assigned && slot.value.kind !== 'uninitialized') record.assignments.push(seq)
  }
  function updateSlot(id: string, slotId: string, seq: number, written = true) {
    const record = owner(id, seq).slots.get(slotId)
    if (record) { record.observations.push(seq); if (written) record.writes.push(seq); record.assignments.push(seq) }
  }
  function eventOwners(event: TraceEvent, graph?: ExecutionGraph): Set<string> {
    const result = new Set<string>()
    if ('frameId' in event && event.frameId) result.add(event.frameId)
    if ('objectId' in event) result.add(event.objectId)
    if ('classId' in event) result.add(event.classId)
    if ('sourceSlot' in event) result.add(event.sourceSlot.kind === 'frame' ? event.sourceSlot.frameId : event.sourceSlot.objectId)
    if (event.type === 'RETURN_VALUE' && event.destination) result.add(event.destination.frameId)
    if (event.type === 'EXECUTION_FACT') {
      const fact = event.fact
      if (fact.context.frameId) result.add(fact.context.frameId)
      if ('invocationId' in fact) result.add(fact.invocationId)
      if ('objectId' in fact) result.add(fact.objectId)
      if ('classId' in fact) result.add(fact.classId)
      if ('target' in fact) result.add(fact.target.ownerId)
      if ('callId' in fact && fact.callId && graph) {
        const call = graph.calls[fact.callId]
        if (call?.callerInvocationId) result.add(call.callerInvocationId)
        if (call?.calleeInvocationId) result.add(call.calleeInvocationId)
      }
    }
    return result
  }
  function extend(next: readonly TraceEvent[]) {
    if (next.length < indexed || indexed && next[indexed - 1].eventId !== events[indexed - 1].eventId) throw new Error('SceneProjector requires one append-only recording')
    bindingHistory.append(next)
    events = next
    for (; indexed < next.length; indexed++) {
      const event = next[indexed]
      if (event.seq !== indexed || byEvent.has(event.eventId)) throw new Error('SceneProjector requires unique event IDs and contiguous semantic ordinals')
      byEvent.set(event.eventId, event)
      for (const id of eventOwners(event)) {
        const history = owner(id, event.seq)
        history.changes.push(event.seq)
      }
      const frameId = 'frameId' in event ? event.frameId : event.type === 'EXECUTION_FACT' ? event.fact.context.frameId : null
      if (frameId && event.source) owner(frameId, event.seq).sources.push({ seq: event.seq, source: event.source })
      switch (event.type) {
        case 'ENTER_METHOD': {
          const history = owner(event.frameId, event.seq)
          history.introduced = event.seq; history.invocationNumber = ++invocationNumber
          event.locals.forEach(slot => observeSlot(event.frameId, slot, event.seq, false, true)); break
        }
        case 'DECLARE_LOCAL': observeSlot(event.frameId, event.slot, event.seq, false, true); break
        case 'ASSIGN_LOCAL': updateSlot(event.frameId, event.slotId, event.seq); break
        case 'CREATE_REFERENCE': case 'CLEAR_REFERENCE': updateSlot(event.sourceSlot.kind === 'frame' ? event.sourceSlot.frameId : event.sourceSlot.objectId, event.sourceSlot.slotId, event.seq); break
        case 'ALLOCATE_OBJECT':
          owner(event.objectId, event.seq).introduced = event.seq
          event.fields.forEach(slot => observeSlot(event.objectId, slot, event.seq, false)); break
        case 'ALLOCATE_ARRAY':
          owner(event.objectId, event.seq).introduced = event.seq
          event.elements.forEach((value, index) => observeSlot(event.objectId, { id: arrayElementSlotId(event.objectId, index), name: `[${index}]`, javaType: event.elementType, value }, event.seq, false)); break
        case 'OBJECT_OBSERVE':
          event.fields?.forEach(slot => observeSlot(event.objectId, slot, event.seq, false))
          event.arrayElements?.forEach(({ index, value }) => observeSlot(event.objectId, { id: arrayElementSlotId(event.objectId, index), name: `[${index}]`, javaType: '', value }, event.seq, false)); break
        case 'CLASS_OBSERVE': event.fields.forEach(slot => observeSlot(event.classId, slot, event.seq, false)); break
        case 'SET_STATIC': updateSlot(event.classId, event.slotId, event.seq); break
        case 'SET_FIELD': updateSlot(event.objectId, event.slotId, event.seq); break
        case 'ARRAY_WRITE': case 'ARRAY_READ': {
          const id = arrayElementSlotId(event.objectId, event.index), record = owners.get(event.objectId)?.slots.get(id)
          if (record) updateSlot(event.objectId, id, event.seq, event.type === 'ARRAY_WRITE')
          else observeSlot(event.objectId, { id, name: `[${event.index}]`, javaType: '', value: event.value }, event.seq, event.type === 'ARRAY_WRITE')
          if (event.type === 'ARRAY_READ' && event.destinationSlotId) updateSlot(event.frameId, event.destinationSlotId, event.seq)
          break
        }
        case 'INPUT_READ': updateSlot(event.frameId, event.destinationSlotId, event.seq); break
        case 'RETURN_VALUE': if (event.destination) updateSlot(event.destination.frameId, event.destination.slotId, event.seq); break
        case 'EXECUTION_FACT': if (event.fact.kind === 'write' && event.fact.target.kind === 'static') updateSlot(event.fact.target.ownerId, event.fact.target.id, event.seq); break
      }
    }
  }
  extend(events)

  const seqOf = (id: string | undefined, cursor: number): number | null => {
    const seq = id === undefined ? undefined : byEvent.get(id)?.seq
    return seq !== undefined && seq < cursor ? seq : null
  }
  function evidence(introduced: number | null, changed: number | null, cursor: number): Evidence {
    const first = introduced !== null && introduced < cursor ? introduced : null
    const last = changed !== null && changed < cursor ? changed : null
    if (first === null && last === null) return unavailable('No captured introducing or changing event in this semantic prefix')
    return { kind: 'observed', introducedSeq: first, changedSeq: last,
      eventIds: [...new Set([first, last].flatMap(seq => seq === null ? [] : [events[seq].eventId]))] }
  }
  function ownerEvidence(id: string, cursor: number): Evidence {
    const history = owners.get(id)
    return evidence(history?.introduced ?? null, history ? lastBefore(history.changes, cursor) : null, cursor)
  }
  function slotEvidence(ownerId: string, slot: RuntimeSlot, cursor: number): Evidence {
    const history = owners.get(ownerId)?.slots.get(slot.id)
    return evidence(history?.introduced ?? seqOf(slot.observedAt, cursor), history ? lastBefore(history.observations, cursor) : seqOf(slot.changedAt ?? slot.observedAt, cursor), cursor)
  }
  function sourceAt(id: string, cursor: number): SourceLocation | null {
    const sources = owners.get(id)?.sources ?? []
    let low = 0, high = sources.length
    while (low < high) { const mid = (low + high) >>> 1; if (sources[mid].seq < cursor) low = mid + 1; else high = mid }
    return low ? sources[low - 1].source : null
  }
  function row(slot: RuntimeSlot, role: SceneRow['role'], id: string, state: RuntimeState, anchor: WorldAnchor): SceneRow {
    return { slotId: slot.id, name: slot.name, type: displayType(slot.javaType), role,
      value: valueText(slot.value, { context: role === 'local' || role === 'parameter' || role === 'this' ? 'frame' : 'object', objects: state.objects }),
      ...(slot.declaringClass ? { declaringClass: slot.declaringClass } : {}),
      ...(slot.scopeId && state.scopes[slot.scopeId] ? { scopeDepth: state.scopes[slot.scopeId].depth } : {}),
      port: anchor.ports[slot.id] ?? null, evidence: slotEvidence(id, slot, state.cursor) }
  }
  function targetDependencies(slots: readonly RuntimeSlot[], state: RuntimeState): readonly (RuntimeObject | undefined)[] {
    return slots.flatMap(slot => slot.value.kind === 'reference' ? [state.objects[slot.value.objectId]] : [])
  }
  function updateReturnIndex(state: RuntimeState) {
    const length = indexedReturns?.length ?? 0
    const extendsPrior = indexedReturns && state.returns.length >= length && (!length || indexedReturns[length - 1] === state.returns[length - 1])
    if (!extendsPrior) returnIndex = persistentRecord({})
    for (let i = extendsPrior ? length : 0; i < state.returns.length; i++) returnIndex = persistentPut(returnIndex, state.returns[i].frameId, state.returns[i])
    indexedReturns = state.returns
  }
  function provenReturn(frameId:string,state:RuntimeState) {
    const graph=state.executionGraph,valueId=graph?.invocations[frameId]?.returnValueId
    if(!graph||!valueId)return null
    for(const index of graph.incoming[valueId]??[]){
      const edge=graph.edges[index],event=byEvent.get(edge.eventId)
      if(!event||event.seq>=state.cursor)continue
      const returned=recordedReturnDestination(graph,edge,event,byEvent)
      if(returned?.frameId===frameId)return {edge,event,...returned}
    }
    return null
  }
  function frameNode(frame: RuntimeFrame, anchor: WorldAnchor, state: RuntimeState, context: ProjectionContext): SceneFrame {
    const event = state.cursor ? events[state.cursor - 1] : null, sourceLine = sourceAt(frame.id, state.cursor)
    const invocation = state.executionGraph?.invocations[frame.id]
    const status = frameStatus({ frame, state, cursorEvent: event, context, sourceLine, returnTransfer: returnIndex[frame.id] ?? null,
      returnDestinationProven: !!provenReturn(frame.id, state), valueOptions: { objects: state.objects, context: 'frame' } })
    const exception = state.exceptions.at(-1)
    const exceptionRole = exception?.caughtBy === frame.id ? 'caught' : exception?.frameIds.at(-1) === frame.id ? 'origin' : exception?.unwoundFrameIds.includes(frame.id) ? 'unwound' : null
    const live = frame.status === 'active' && !(context.sessionEnded && state.cursor === context.liveHead)
    const topOfStack = live && state.activeFrameIds.at(-1) === frame.id
    const ev = ownerEvidence(frame.id, state.cursor)
    const signature = JSON.stringify([status, sourceLine, live, topOfStack, exceptionRole, ev, invocation?.method, invocation?.metadata?.ownership])
    const slots = Object.values(frame.locals), deps = targetDependencies(slots, state), cached = frameCache.get(frame)
    if (cached?.anchor === anchor && cached.signature === signature && sameDependencies(cached.dependencies, deps)) return cached.node
    const history = owners.get(frame.id)
    const ordered = slots.filter(slot => slot.name === 'this' || slot.role === 'parameter' || (history?.slots.get(slot.id)?.assignments.some(seq => seq < state.cursor) ?? false))
      .sort((a, b) => {
        const category = (slot: RuntimeSlot) => slot.name === 'this' ? 0 : slot.role === 'parameter' ? 1 : 2
        const rank = (slot: RuntimeSlot) => { const entry = history?.slots.get(slot.id); return category(slot) === 2 ? entry?.assignments[0] ?? Infinity : entry?.introduced ?? Infinity }
        return category(a) - category(b) || rank(a) - rank(b)
      })
    const rows = ordered.map(slot => row(slot, slot.name === 'this' ? 'this' : slot.role === 'parameter' ? 'parameter' : 'local', frame.id, state, anchor))
    const scopeDividers: NonNullable<SceneFrame['scopeDividers']>[number][] = []
    let lastScope: string | undefined
    ordered.forEach((slot, index) => { if (slot.scopeId !== lastScope) {
      const scope = slot.scopeId ? state.scopes[slot.scopeId] : undefined
      if (scope && scope.depth > 0 && scope.status === 'active') scopeDividers.push({ afterRow: index - 1, label: scope.label, depth: scope.depth })
      lastScope = slot.scopeId
    } })
    const entry = history ? events[history.introduced] : undefined
    const parameters = entry?.type === 'ENTER_METHOD' && (entry.locals.length===0 || entry.locals.some(slot=>slot.role==='parameter')) ? entry.locals.filter(slot => slot.name !== 'this' && slot.role === 'parameter').map(slot => slot.javaType) : undefined
    const node: SceneFrame = freezeValue({ kind: 'frame', id: frame.id, invocationNumber: history?.invocationNumber ?? 0,
      title: frameTitle(frame, invocation ? { method: invocation.method } : { parameterTypes: parameters }), callerId: frame.callerFrameId, depth: frame.depth,
      rows, ...(scopeDividers.length ? { scopeDividers } : {}), status, live, topOfStack, exceptionRole, sourceLine, anchor,
      ownership: invocation?.metadata?.ownership ?? 'PROJECT', evidence: ev })
    frameCache.set(frame, { anchor, signature, dependencies: deps, node }); return node
  }
  function objectNode(object: RuntimeObject, anchor: WorldAnchor, state: RuntimeState): SceneObject | SceneArray | SceneCollection {
    const event = state.cursor ? events[state.cursor - 1] : null
    const activity = state.arrayActivity?.objectId === object.id ? state.arrayActivity : null
    const mutation = event?.type === 'SET_FIELD' && event.objectId === object.id ? { slotId: event.slotId }
      : event?.type === 'CREATE_REFERENCE' && event.sourceSlot.kind === 'object' && event.sourceSlot.objectId === object.id ? { slotId: event.sourceSlot.slotId } : null
    const ev = ownerEvidence(object.id, state.cursor)
    const cells = object.array ? [...object.array.elements.map((slot, index) => ({ slot, index })), ...Object.entries(object.array.sparseElements ?? {}).map(([index, slot]) => ({ slot, index: Number(index) }))].sort((a, b) => a.index - b.index) : []
    const fields = Object.values(object.fields).filter(slot => !slot.static)
    const deps = targetDependencies([...fields, ...cells.map(cell => cell.slot)], state)
    const signature = JSON.stringify([ev, mutation, activity])
    const cached = objectCache.get(object)
    if (cached?.anchor === anchor && cached.signature === signature && sameDependencies(cached.dependencies, deps)) return cached.node
    let node: SceneObject | SceneArray | SceneCollection
    if (object.array) {
      const observed = new Map(cells.map(cell => [cell.index, cell]))
      node = { kind: 'array', id: object.id, displayId: object.displayId, title: displayType(object.className), componentType: displayType(object.array.elementType), length: object.array.length,
        cells: [...observed.values()].map(({ slot, index }) => ({ index, slotId: arrayElementSlotId(object.id, index), value: valueText(slot.value, { objects: state.objects }), evidence: slotEvidence(object.id, slot, state.cursor) })),
        activity: activity && activity.kind !== 'compare' ? { kind: activity.kind, index: activity.index } : null,
        // The trace vocabulary has no array-access owner/index on throw. Do not guess from a message.
        outOfBounds: null, anchor, ownership: object.metadata?.ownership ?? (anchor.region==='heap'?'PROJECT':'LIBRARY'), evidence: ev }
    } else if (object.library && ['LIST','SET','MAP','QUEUE','DEQUE'].includes(object.library.kind)) {
      const summary=collectionSummary(object,anchor,{cursor:state.cursor,eventSeq:id=>seqOf(id,state.cursor),objects:state.objects});
      if(summary){freezeValue(summary);objectCache.set(object,{anchor,signature,dependencies:deps,node:summary});return summary}
      node={kind:'object',id:object.id,displayId:object.displayId,title:displayType(object.className),groups:[],fieldCount:fields.length,summaryUnavailable:true,allocationSite:byEvent.get(object.allocatedAt)?.source??null,anchor,ownership:object.metadata?.ownership??(anchor.region==='heap'?'PROJECT':'LIBRARY'),evidence:ev,mutation:null}
    } else {
      const groups = new Map<string, SceneRow[]>()
      // Captured field lists already carry superclass-first traversal; preserve that recorded order.
      for (const slot of fields) {
        const declaringClass = slot.declaringClass ?? object.className
        const rows = groups.get(declaringClass) ?? []; rows.push(row(slot, 'field', object.id, state, anchor)); groups.set(declaringClass, rows)
      }
      if (object.string) {
        const string = stringValueText(object.string)
        groups.set(object.className, [...(groups.get(object.className) ?? []), { slotId: `${object.id}:captured-string`, name: 'value', type: 'String', role: 'field', value: string,
          declaringClass: object.className, port: null, evidence: evidence(seqOf(object.observedAt, state.cursor), seqOf(object.observedAt, state.cursor), state.cursor) }])
      }
      const allocation = byEvent.get(object.allocatedAt)
      node = { kind: 'object', id: object.id, displayId: object.displayId, title: displayType(object.className),
        groups: [...groups].map(([declaringClass, rows]) => ({ declaringClass, rows })), fieldCount: fields.length,
        ...(object.library ? { summaryUnavailable: true } : {}), allocationSite: allocation?.source ?? null,
        anchor, ownership: object.metadata?.ownership ?? (anchor.region==='heap'?'PROJECT':'LIBRARY'), evidence: ev, mutation }
    }
    freezeValue(node); objectCache.set(object, { anchor, signature, dependencies: deps, node }); return node
  }
  function classNode(value: RuntimeClass, anchor: WorldAnchor, state: RuntimeState): SceneClass {
    const history = owners.get(value.id), ev = ownerEvidence(value.id, state.cursor)
    const slots = Object.values(value.statics).filter(slot => lastBefore(history?.slots.get(slot.id)?.writes ?? [], state.cursor) !== null)
    const deps = targetDependencies(slots, state), signature = JSON.stringify(ev), cached = classCache.get(value)
    if (cached?.anchor === anchor && cached.signature === signature && sameDependencies(cached.dependencies, deps)) return cached.node
    const node: SceneClass = freezeValue({ kind: 'class', id: value.id, title: displayType(value.className), packageName: value.metadata?.packageName ?? value.className.slice(0, Math.max(0, value.className.lastIndexOf('.'))),
      initialization: value.initialization, rows: slots.map(slot => row(slot, 'static', value.id, state, anchor)), anchor, evidence: ev })
    classCache.set(value, { anchor, signature, dependencies: deps, node }); return node
  }
  function refs(node: SceneEntity): readonly SceneReference[] {
    const cached = referencesCache.get(node)
    if (cached) return cached
    const values = node.kind === 'frame' || node.kind === 'class' ? node.rows
      : node.kind === 'object' ? node.groups.flatMap(group => group.rows) : node.kind === 'array' ? node.cells : node.entries.flatMap(entry=>entry.key&&entry.keySlotId?[entry,{slotId:entry.keySlotId,value:entry.key,evidence:entry.evidence}]:[entry])
    const result: SceneReference[] = []
    for (const slot of values) if (slot.value.kind === 'reference') result.push({ id: referenceIdForSlot(slot.slotId), sourceId: node.id, sourceSlotId: slot.slotId, targetId: slot.value.targetId,
      role: node.kind === 'frame' ? 'frame-object' : node.kind === 'class' ? 'class-object' : 'object-object', overlay: null, evidence: slot.evidence })
    referencesCache.set(node, freezeValue(result)); return result
  }
  function setDependencies(id: string, node: SceneEntity) {
    const old = dependencies.get(id) ?? new Set<string>(), next = new Set(refs(node).map(ref => ref.targetId))
    for (const target of old) if (!next.has(target)) dependents.get(target)?.delete(id)
    for (const target of next) if (!old.has(target)) { const incoming = dependents.get(target) ?? new Set(); incoming.add(id); dependents.set(target, incoming) }
    dependencies.set(id, next)
  }
  function callLinks(state: RuntimeState): SceneModel['callLinks'] {
    const links: SceneModel['callLinks'][number][] = [], graph = state.executionGraph
    if (graph) {
      for (const call of Object.values(graph.calls)) {
        const callerId = call.callerInvocationId, calleeId = call.calleeInvocationId
        if (!callerId || !calleeId || !state.frames[callerId] || !state.frames[calleeId]) continue
        const edge = (graph.outgoing[call.id] ?? []).map(index => graph.edges[index]).find(edge => edge.kind === 'CALL' && edge.to === calleeId)
        const seq = seqOf(edge?.eventId, state.cursor)
        if (seq !== null) links.push({ id: call.id, callerId, calleeId, callSeq: seq })
      }
    } else for (const frame of Object.values(state.frames)) {
      const entry = byEvent.get(frame.enteredAt), seq = seqOf(frame.enteredAt, state.cursor)
      if (entry?.type === 'ENTER_METHOD' && entry.callerFrameId && seq !== null) links.push({ id: `call:${entry.eventId}`, callerId: entry.callerFrameId, calleeId: frame.id, callSeq: seq })
    }
    return freezeValue(links)
  }
  function returnFlows(state: RuntimeState): SceneModel['returnFlows'] {
    const result: SceneReturnFlow[] = []
    for (let i = state.returns.length - 1; i >= 0; i--) {
      const transfer=state.returns[i],returned=provenReturn(transfer.frameId,state)
      if(returned)result.push({id:returned.edge.id,frameId:transfer.frameId,destination:{entityId:returned.destination.ownerId,slotId:returned.destination.id},value:valueText(transfer.value,{objects:state.objects}),operands:transfer.expression??null,returnSeq:returned.event.seq})
    }
    return freezeValue(result)
  }
  function exceptionPath(state: RuntimeState, context: ProjectionContext): SceneExceptionPath | null {
    const fact = state.exceptions.at(-1)
    if (!fact) return null
    const seq = seqOf(fact.eventId, state.cursor)
    if (seq === null) return null
    if(fact.caughtBy){const caught=lastBefore(owners.get(fact.caughtBy)?.changes.filter(index=>events[index].type==='CATCH_EXCEPTION'&& (events[index] as Extract<TraceEvent,{type:'CATCH_EXCEPTION'}>).exceptionId===fact.exceptionId)??[],state.cursor);if(caught!==null&&state.cursor>caught+1)return null}
    const ids = [fact.eventId]
    // Retain recorded unwind/catch graph evidence by identity, including opaque crossings.
    const graph = state.executionGraph
    for (const index of graph?.incoming[fact.exceptionId] ?? []) { const edge = graph!.edges[index]; if (['THROW', 'UNWIND'].includes(edge.kind) && seqOf(edge.eventId, state.cursor) !== null) ids.push(edge.eventId) }
    for (const index of graph?.outgoing[fact.exceptionId] ?? []) { const edge = graph!.edges[index]; if (edge.kind === 'CATCH' && seqOf(edge.eventId, state.cursor) !== null) ids.push(edge.eventId) }
    const uncaught = !fact.caughtBy && state.status === 'aborted' && !!state.abortReason?.startsWith('program_crashed:')
    return freezeValue({ exceptionId: fact.exceptionId, className: fact.className, simpleName: displayType(fact.className), message: fact.message,
      throwFrameId: fact.frameIds.at(-1) ?? null, unwound: fact.unwoundFrameIds, catchFrameId: fact.caughtBy ?? null,
      uncaught, causes: [], complete: !!fact.caughtBy || uncaught && context.sessionEnded && state.cursor === context.liveHead,
      throwLine: fact.source, stack: [], causeEvidence: unavailable('No captured cause-chain fact'), stackEvidence: unavailable('No captured stack-text fact'),
      evidence: { ...evidence(seq, Math.max(...ids.map(id => seqOf(id, state.cursor) ?? seq)), state.cursor), eventIds: [...new Set(ids)] } })
  }
  function addIo(channels: Channels, id: SceneIo['id'], text: string, eventId: string) {
    const old = channels.get(id)
    const summary: LineSummary = old ? { ...old, changed: eventId } : { breaks: 0, partial: false, pendingCR: false, current: '', last: '', first: eventId, changed: eventId }
    for (const char of text) {
      if (char === '\n' && summary.pendingCR) { summary.pendingCR = false; continue }
      if (char === '\n' || char === '\r') { summary.breaks++; summary.last = summary.current; summary.current = ''; summary.partial = false; summary.pendingCR = char === '\r' }
      else { summary.pendingCR = false; summary.partial = true; if (Array.from(summary.current).length < 60) summary.current += char }
    }
    channels.set(id, summary)
  }
  function ioNodes(state: RuntimeState, layout: LayoutState): SceneModel['io'] {
    const graph = state.executionGraph
    let channels: Channels
    let consumedText: string | null = null
    if (graph) {
      graphIoSummaries(graph) // Share the preserved observation index; it never counts submissions/file IO as consumption.
      channels = graphIoCache.get(graph.io) ?? new Map()
      if (!graphIoCache.has(graph.io)) {
        const prior = priorGraphIo, boundary = prior?.graph.edges.length ?? 0
        const extendsPrior = prior && graph.edges.length >= boundary && (!boundary || graph.edges[boundary - 1] === prior.graph.edges[boundary - 1])
        if (extendsPrior) channels = new Map(prior.channels)
        const add = (item: GraphIO | undefined) => { if (item && item.channel !== 'file' && (item.kind === 'output' || item.kind === 'input-consume') && seqOf(item.eventId, state.cursor) !== null) addIo(channels, item.channel, item.text, item.eventId) }
        if (extendsPrior) for (let index = boundary; index < graph.edges.length; index++) { const edge = graph.edges[index]; if (edge.kind === 'OUTPUT') add(graph.io[edge.to]); else if (edge.kind === 'INPUT_CONSUME') add(graph.io[edge.from]) }
        else for (const item of Object.values(graph.io)) add(item)
        graphIoCache.set(graph.io, channels)
      }
      priorGraphIo = { graph, channels }
      // Current input means the consuming edge, never recently submitted bytes.
      const currentId = state.lastEventId
      for (let i = graph.edges.length - 1; i >= 0 && graph.edges[i].eventId === currentId; i--) {
        const edge = graph.edges[i]
        if (edge.kind === 'INPUT_CONSUME') consumedText = graph.io[edge.from]?.text ?? null
      }
    } else {
      consoleIoSummaries(state.console)
      channels = consoleIoCache.get(state.console) ?? new Map()
      if (!consoleIoCache.has(state.console)) {
        const prior = priorConsoleIo, boundary = prior?.entries.length ?? 0
        const extendsPrior = prior && state.console.length >= boundary && (!boundary || state.console[boundary - 1] === prior.entries[boundary - 1])
        if (extendsPrior) channels = new Map(prior.channels)
        for (let index = extendsPrior ? boundary : 0; index < state.console.length; index++) {
          const entry = state.console[index]
          if ((entry.kind !== 'input' || entry.destinationSlotId) && seqOf(entry.eventId, state.cursor) !== null) addIo(channels, entry.kind === 'input' ? 'stdin' : entry.channel ?? 'stdout', entry.text, entry.eventId)
        }
        consoleIoCache.set(state.console, channels)
      }
      priorConsoleIo = { entries: state.console, channels }
      const current = state.console.at(-1)
      if (current?.kind === 'input' && current.destinationSlotId && current.eventId === state.lastEventId) consumedText = current.text
    }
    return freezeValue((['stdin', 'stdout', 'stderr'] as const).flatMap(id => {
      const summary = channels.get(id), anchor = layout.anchors[id] ?? layout.anchors[`io:${id}`]
      if (!summary || !anchor) return []
      return [{ id, lines: summary.breaks + Number(summary.partial), preview: summary.partial ? summary.current : summary.last,
        consumedText: id === 'stdin' ? consumedText : null, anchor,
        evidence: { ...evidence(seqOf(summary.first, state.cursor), seqOf(summary.changed, state.cursor), state.cursor), kind: 'derived' as const, derivation: 'Line count and last-line preview of captured channel text' } }]
    }))
  }
  function bounded(state: RuntimeState, context: ProjectionContext): { state: RuntimeState; context: ProjectionContext } {
    const liveHead = Math.max(0, Math.min(events.length, Math.floor(context.liveHead)))
    const cursor = Math.max(0, Math.min(state.cursor, liveHead))
    if (cursor !== state.cursor) {
      const reducer = createReductionEngine()
      for (let i = 0; i < cursor; i++) reducer.apply(events[i])
      state = reducer.state
    }
    return { state, context: { ...context, liveHead } }
  }
  function cursorEvent(state: RuntimeState): SceneModel['cursorEvent'] {
    const event = state.cursor ? events[state.cursor - 1] : null
    return event ? freezeValue({ id: event.eventId, seq: event.seq, summary: event.label, subjects: [...eventOwners(event, state.executionGraph)] }) : null
  }
  function assemble(state: RuntimeState, layout: LayoutState, context: ProjectionContext, entities: Record<string, SceneEntity>, order: SceneModel['order'], references: readonly SceneReference[], links: SceneModel['callLinks'], returns: SceneModel['returnFlows']): SceneModel {
    // Freeze ordinary children separately: walking the virtual reference array here
    // would undo the incremental index. Its facade rejects every mutation itself.
    const scene: SceneModel = Object.freeze({ ...freezeValue({ revision: ++revision, recordingId: trace.demoId, cursor: state.cursor, liveHead: context.liveHead,
      entities, order, callLinks: links, returnFlows: returns, exception: exceptionPath(state, context), io: ioNodes(state, layout),
      cursorEvent: cursorEvent(state), liveStack: state.activeFrameIds, recording: context.recording }), references, historicalBindings:bindingHistory.historical(state.cursor) })
    previous = { state, layout, context, scene }; return scene
  }
  function project(input: RuntimeState, layout: LayoutState, inputContext: ProjectionContext): SceneModel {
    extend(trace.events.length > events.length ? trace.events : events)
    const { state, context } = bounded(input, inputContext)
    updateReturnIndex(state)
    let entities: Record<string, SceneEntity> = persistentRecord({})
    const frames: string[] = [], objects: string[] = [], classes: string[] = []
    resetReferences(); dependencies.clear(); dependents.clear()
    if (state.cursor) {
      for (const frame of Object.values(state.frames)) { const anchor = layout.anchors[frame.id]; if (anchor && seqOf(frame.enteredAt, state.cursor) !== null) { const node = frameNode(frame, anchor, state, context); entities = persistentPut(entities, frame.id, node); frames.push(frame.id) } }
      for (const object of Object.values(state.objects)) { const anchor = layout.anchors[object.id]; if (anchor && seqOf(object.allocatedAt, state.cursor) !== null) { const node = objectNode(object, anchor, state); entities = persistentPut(entities, object.id, node); objects.push(object.id) } }
      for (const value of Object.values(state.classes ?? {})) { const anchor = layout.anchors[value.id]; if (anchor && seqOf(value.observedAt, state.cursor) !== null) { const node = classNode(value, anchor, state); entities = persistentPut(entities, value.id, node); classes.push(value.id) } }
    }
    for (const id of [...frames, ...objects, ...classes]) { const node = entities[id]; indexReferences(node, refs(node)); setDependencies(id, node) }
    return assemble(state, layout, context, entities, { frames: persistentArray(frames), objects: persistentArray(objects), classes: persistentArray(classes) }, referenceSnapshot(referenceGroups), callLinks(state), returnFlows(state))
  }
  return {
    project,
    advance(input, layout, nextEvents, from, to, inputContext) {
      extend(nextEvents)
      const { state, context } = bounded(input, inputContext), prior = previous
      if (!prior || prior.state.cursor !== from || state.cursor !== to || to < from || to > events.length) return project(state, layout, context)
      // Sparse playback stays incremental. For a long seek through a compact
      // world, rebuild from the already reconstructed prefix instead of walking
      // thousands of skipped events and graph edges to find the same owners.
      const population = prior.scene.order.frames.length + prior.scene.order.objects.length + prior.scene.order.classes.length
      if (to - from > Math.max(256, population * 4)) return project(state, layout, context)
      updateReturnIndex(state)
      const touched = new Set<string>(prior.scene.cursorEvent?.subjects ?? [])
      const oldTop = prior.state.activeFrameIds.at(-1), newTop = state.activeFrameIds.at(-1)
      if (oldTop) touched.add(oldTop); if (newTop) touched.add(newTop)
      for (let i = from; i < to; i++) for (const id of eventOwners(events[i], state.executionGraph)) touched.add(id)
      const graph = state.executionGraph, priorGraph = prior.state.executionGraph
      if (graph) for (let i = priorGraph?.edges.length ?? 0; i < graph.edges.length; i++) {
        const edge: GraphEdge = graph.edges[i]
        const returned=graph.values[edge.from]
        if(returned?.kind==='return'&&returned.context.frameId)touched.add(returned.context.frameId)
        for (const id of [edge.from, edge.to, edge.originSlotId]) if (id) {
          const storageOwner = graph.storage[id]?.ownerId ?? slotOwners.get(id)
          if (storageOwner) touched.add(storageOwner)
        }
      }
      if (context.sessionEnded !== prior.context.sessionEnded || context.pausedAtLiveHead !== prior.context.pausedAtLiveHead || (prior.state.cursor === prior.context.liveHead) !== (state.cursor === context.liveHead)) {
        for (const id of [...prior.state.activeFrameIds, ...state.activeFrameIds]) touched.add(id)
      }
      for (const id of [...touched]) if (state.objects[id] !== prior.state.objects[id]) for (const source of dependents.get(id) ?? []) touched.add(source)
      let entities = prior.scene.entities as Record<string, SceneEntity>
      let frames = prior.scene.order.frames as string[], objects = prior.scene.order.objects as string[], classes = prior.scene.order.classes as string[]
      let referencesChanged = false, linksChanged = !priorGraph && !!graph
      for (const id of touched) {
        const anchor = layout.anchors[id]
        if (!anchor) continue
        let node: SceneEntity | undefined
        if (state.frames[id]) node = frameNode(state.frames[id], anchor, state, context)
        else if (state.objects[id]) node = objectNode(state.objects[id], anchor, state)
        else if (state.classes?.[id]) node = classNode(state.classes[id], anchor, state)
        if (!node) continue
        const old = entities[id]
        if (old === node) continue
        entities = persistentPut(entities, id, node)
        if (!old) {
          if (node.kind === 'frame') { frames = persistentAppend(frames, id); linksChanged = true }
          else if (node.kind === 'class') classes = persistentAppend(classes, id)
          else objects = persistentAppend(objects, id)
        }
        const current = refs(node)
        const changed = !sameReferences(refsByOwner[id] ?? [], current)
        if (!old || changed) {
          indexReferences(node, current)
          referencesChanged ||= changed
        }
        setDependencies(id, node)
      }
      for (let i = from; i < to; i++) if (events[i].type === 'EXECUTION_FACT' && (events[i] as Extract<TraceEvent, { type: 'EXECUTION_FACT' }>).fact.kind === 'enter') linksChanged = true
      const references = referencesChanged ? referenceSnapshot(referenceGroups) : prior.scene.references
      const returnsChanged = state.returns !== prior.state.returns || graph?.storage !== priorGraph?.storage || graph?.invocations !== priorGraph?.invocations
      return assemble(state, layout, context, entities, { frames, objects, classes }, references, linksChanged ? callLinks(state) : prior.scene.callLinks, returnsChanged ? returnFlows(state) : prior.scene.returnFlows)
    },
  }
}
