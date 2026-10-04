import type { RuntimeClass, RuntimeFrame, RuntimeObject, RuntimeState, TraceEvent, VariableLifetime } from '../contracts/runtime'
import { applyEventWithStorage, createInitialState, type ReductionStorage } from './state'
import { freezeValue, persistentAppend, persistentArray, persistentDelete, persistentPop, persistentPut, persistentRecord, persistentSet } from './storage'

/** Auxiliary indexes contain no additional truth; they share the snapshot's lifetime. */
interface Indexes {
  displays: Record<string, boolean>
  scopes: Record<string, string[]>
  scoped: Record<string, boolean>
  loops: Record<string, Record<string, boolean>>
  lives: Record<string, Record<string, number>>
  firstLife: Record<string, VariableLifetime>
  exceptions: Record<string, number>
  inputs: number
}
const indexesByState = new WeakMap<RuntimeState, Indexes>()
function emptyIndexes(): Indexes {
  return { displays: persistentRecord({}), scopes: persistentRecord({}), scoped: persistentRecord({}), loops: persistentRecord({}),
    lives: persistentRecord({}), firstLife: persistentRecord({}), exceptions: persistentRecord({}), inputs: 0 }
}
function frameValue(frame: RuntimeFrame): RuntimeFrame { return freezeValue({ ...frame, locals: persistentRecord(frame.locals) }) }
function objectValue(object: RuntimeObject): RuntimeObject {
  return freezeValue({ ...object, fields: persistentRecord(object.fields), ...(object.array ? {
    array: { ...object.array, elements: persistentArray(object.array.elements),
      ...(object.array.sparseElements ? { sparseElements: persistentRecord(object.array.sparseElements) } : {}),
    },
  } : {}) })
}
function prepare(initial: RuntimeState): RuntimeState {
  if (indexesByState.has(initial)) return initial
  // An externally supplied initial state is imported once, independent of later appends.
  return freezeValue({ ...initial,
    frames: persistentRecord(Object.fromEntries(Object.entries(initial.frames).map(([id, frame]) => [id, frameValue(frame)]))),
    objects: persistentRecord(Object.fromEntries(Object.entries(initial.objects).map(([id, object]) => [id, objectValue(object)]))),
    ...(initial.classes ? { classes: persistentRecord(Object.fromEntries(Object.entries(initial.classes).map(([id, owner]) =>
      [id, freezeValue({ ...owner, statics: persistentRecord(owner.statics) })]))) } : {}),
    scopes: persistentRecord(initial.scopes), conditions: persistentRecord(initial.conditions), loops: persistentRecord(initial.loops),
    activeFrameIds: persistentArray(initial.activeFrameIds), returns: persistentArray(initial.returns),
    arrayMutations: persistentArray(initial.arrayMutations), variableLifetimes: persistentArray(initial.variableLifetimes),
    console: persistentArray(initial.console), exceptions: persistentArray(initial.exceptions),
  })
}
function indexInitial(state: RuntimeState): Indexes {
  const indexes = emptyIndexes()
  for (const object of Object.values(state.objects)) indexes.displays = persistentPut(indexes.displays, String(object.displayId), true)
  for (const scope of Object.values(state.scopes)) {
    indexes.scoped = persistentPut(indexes.scoped, scope.frameId, true)
    if (scope.status === 'active') indexes.scopes = persistentPut(indexes.scopes, scope.frameId,
      persistentAppend(indexes.scopes[scope.frameId] ?? [], scope.id))
  }
  for (const frameId of Object.keys(indexes.scopes)) indexes.scopes = persistentPut(indexes.scopes, frameId,
    persistentArray([...indexes.scopes[frameId]].sort((a, b) => state.scopes[a].depth - state.scopes[b].depth)))
  for (const loop of Object.values(state.loops)) if (loop.status === 'running') indexes.loops = persistentPut(indexes.loops,
    loop.frameId, persistentPut(indexes.loops[loop.frameId] ?? {}, loop.loopId, true))
  state.variableLifetimes.forEach((life, index) => {
    if (!Object.hasOwn(indexes.firstLife, life.slot.id)) indexes.firstLife = persistentPut(indexes.firstLife, life.slot.id, life)
    if (life.exitedAt === undefined) indexes.lives = persistentPut(indexes.lives, life.frameId,
      persistentPut(indexes.lives[life.frameId] ?? {}, life.slot.id, index))
  })
  state.exceptions.forEach((fact, index) => { if (!fact.caughtBy) indexes.exceptions = persistentPut(indexes.exceptions, fact.exceptionId, index) })
  indexes.inputs = state.console.filter(entry => entry.kind === 'input').length
  return indexes
}

export interface ReductionEngine { readonly state: RuntimeState; apply(event: TraceEvent): RuntimeState }
/** Same validated transitions as applyEvent, with O(log entities/history) collection writes.
 * Index roots are persistent too, so starting from a checkpoint takes constant time.
 */
export function createReductionEngine(initial: RuntimeState = createInitialState()): ReductionEngine {
  let state = prepare(initial)
  let indexes = indexesByState.get(initial) ?? indexInitial(state)
  indexesByState.set(state, indexes)
  const storage: ReductionStorage = {
    put: (record, key, value) => {
      if (value && typeof value === 'object') {
        if ('locals' in value) value = frameValue(value as unknown as RuntimeFrame) as unknown as typeof value
        else if ('fields' in value) value = objectValue(value as unknown as RuntimeObject) as unknown as typeof value
        else if ('statics' in value) {
          const owner = value as unknown as RuntimeClass
          value = freezeValue({ ...owner, statics: persistentRecord(owner.statics) }) as unknown as typeof value
        }
      }
      return persistentPut(record, key, value)
    },
    remove: persistentDelete, append: persistentAppend, set: persistentSet, pop: persistentPop,
    scopes: (state, frameId) => (indexes.scopes[frameId] ?? []).map(id => state.scopes[id]).filter(scope => scope.status === 'active'),
    scoped: (_state, frameId) => Object.hasOwn(indexes.scoped, frameId),
    loops: (state, frameId) => Object.keys(indexes.loops[frameId] ?? {}).map(id => state.loops[id]).filter(loop => loop.status === 'running'),
    lives: (state, frameId, slotId, scopeId) => {
      const live = indexes.lives[frameId] ?? {}
      const candidates = slotId === undefined ? Object.values(live) : Object.hasOwn(live, slotId) ? [live[slotId]] : []
      return candidates.filter(i => state.variableLifetimes[i].exitedAt === undefined &&
        (scopeId === undefined || state.variableLifetimes[i].scopeId === scopeId))
    },
    firstLife: (_state, slotId) => indexes.firstLife[slotId], inputCount: () => indexes.inputs,
    exceptionIndex: (_state, id) => Object.hasOwn(indexes.exceptions, id) ? indexes.exceptions[id] : -1,
    displayUsed: (_state, id) => Object.hasOwn(indexes.displays, String(id)),
  }
  return {
    get state() { return state },
    apply(event) {
      const next = freezeValue(applyEventWithStorage(state, event, storage))
      // Update lookup roots only after successful semantic validation. Failures leave head intact.
      const updated = { ...indexes }
      if (event.type === 'ALLOCATE_OBJECT' || event.type === 'ALLOCATE_ARRAY') updated.displays = persistentPut(updated.displays, String(event.displayId), true)
      if (event.type === 'ENTER_SCOPE') {
        updated.scoped = persistentPut(updated.scoped, event.frameId, true)
        updated.scopes = persistentPut(updated.scopes, event.frameId, persistentAppend(updated.scopes[event.frameId] ?? [], event.scopeId))
      }
      if (event.type === 'EXIT_SCOPE' || event.type === 'EXIT_METHOD' || event.type === 'UNWIND_EXCEPTION') {
        const frameId = event.frameId
        updated.scopes = persistentPut(updated.scopes, frameId,
          persistentArray((updated.scopes[frameId] ?? []).filter(id => next.scopes[id].status === 'active')))
        let live = updated.lives[frameId] ?? persistentRecord<number>({})
        for (const [slotId, index] of Object.entries(live)) if (next.variableLifetimes[index].exitedAt !== undefined) live = persistentDelete(live, slotId)
        updated.lives = persistentPut(updated.lives, frameId, live)
        if (event.type === 'EXIT_METHOD') updated.loops = persistentDelete(updated.loops, frameId)
      }
      if (event.type === 'LOOP_ITERATION') {
        const loops = updated.loops[event.frameId] ?? persistentRecord<boolean>({})
        updated.loops = persistentPut(updated.loops, event.frameId, event.status === 'running'
          ? persistentPut(loops, event.loopId, true) : persistentDelete(loops, event.loopId))
      }
      if (event.type === 'DECLARE_LOCAL' && event.slot.scopeId !== undefined) {
        const index = next.variableLifetimes.length - 1
        updated.lives = persistentPut(updated.lives, event.frameId, persistentPut(updated.lives[event.frameId] ?? {}, event.slot.id, index))
        if (!Object.hasOwn(updated.firstLife, event.slot.id)) updated.firstLife = persistentPut(updated.firstLife, event.slot.id, next.variableLifetimes[index])
      }
      if (event.type === 'INPUT_READ' || event.type === 'CONSOLE_INPUT') updated.inputs++
      if (event.type === 'THROW_EXCEPTION') updated.exceptions = persistentPut(updated.exceptions, event.exceptionId, next.exceptions.length - 1)
      if (event.type === 'CATCH_EXCEPTION') updated.exceptions = persistentDelete(updated.exceptions, event.exceptionId)
      indexes = updated
      state = next
      indexesByState.set(state, indexes)
      return state
    },
  }
}
