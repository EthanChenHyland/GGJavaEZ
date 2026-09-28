import type {
  RuntimeArray,
  RuntimeFrame,
  RuntimeObject,
  RuntimeSlot,
  RuntimeScope,
  RuntimeState,
  RuntimeValue,
  ScalarValue,
  SlotOwner,
  TraceEvent,
} from '../contracts/runtime'
import { arrayElementSlotId } from '../contracts/runtime'

export function createInitialState(): RuntimeState {
  return {
    cursor: 0,
    status: 'ready',
    currentSource: null,
    lastEventId: null,
    activeFrameIds: [],
    frames: {},
    objects: {},
    returns: [],
    arrayActivity: null,
    arrayMutations: [],
    scopes: {},
    variableLifetimes: [],
    conditions: {},
    loops: {},
    console: [],
    exceptions: [],
    branch: null,
    abortReason: null,
  }
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function requireInt(value: RuntimeValue): asserts value is { kind: 'primitive'; javaType: 'int'; value: number } {
  requireCondition(value.kind === 'primitive' && value.javaType === 'int' &&
    typeof value.value === 'number' && Number.isInteger(value.value) &&
    value.value >= -2147483648 && value.value <= 2147483647,
  'Array value must be a concrete Java int')
}

function requireArray(state: RuntimeState, objectId: string): RuntimeObject & { array: RuntimeArray } {
  const object = state.objects[objectId]
  requireCondition(object, `Unknown object ${objectId}`)
  requireCondition(object.array && object.className === 'int[]', `Object ${objectId} is not an int array`)
  return object as RuntimeObject & { array: RuntimeArray }
}

function requireElement(object: RuntimeObject & { array: RuntimeArray }, index: number): RuntimeSlot {
  requireCondition(Number.isInteger(index) && index >= 0 && index < object.array.length,
    `Array index ${index} outside bounds of ${object.id}`)
  return object.array.elements[index]
}

function requireObserved(slot: RuntimeSlot, value: RuntimeValue): void {
  requireInt(value)
  requireInt(slot.value)
  requireCondition(slot.value.value === value.value, `Observed array value mismatch at ${slot.id}`)
}

function assertCompatible(slot: RuntimeSlot, value: RuntimeValue): void {
  const matches = value.kind === 'uninitialized' ||
    (value.kind === 'null' && !['int', 'boolean', 'double', 'long', 'float', 'short', 'byte', 'char'].includes(slot.javaType)) ||
    (value.kind === 'primitive' && value.javaType === slot.javaType) ||
    (value.kind === 'stringSummary' && slot.javaType === 'String') ||
    (value.kind === 'reference' && value.javaType === slot.javaType)
  requireCondition(matches, `Value type mismatch for ${slot.id}`)
  if (value.kind === 'primitive') {
    if (value.javaType === 'int') requireInt(value)
    else requireCondition(value.javaType === 'boolean' ? typeof value.value === 'boolean' :
      value.javaType === 'long' ? typeof value.value === 'string' && /^-?\d+$/.test(value.value) :
      value.javaType === 'char' ? typeof value.value === 'string' && value.value.length === 1 :
      typeof value.value === 'number' && Number.isFinite(value.value), `Invalid primitive value for ${slot.id}`)
  }
}

function sameValue(a: RuntimeValue, b: RuntimeValue): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'primitive' && b.kind === 'primitive') return a.javaType === b.javaType && a.value === b.value
  if (a.kind === 'stringSummary' && b.kind === 'stringSummary') return a.value === b.value
  if (a.kind === 'reference' && b.kind === 'reference') return a.javaType === b.javaType && a.objectId === b.objectId
  return a.kind === 'null' || a.kind === 'uninitialized'
}

function scalarText(value: ScalarValue): string {
  requireCondition(value && (value.kind === 'primitive' || value.kind === 'stringSummary' || value.kind === 'null'),
    'Console and condition values must be concrete scalars')
  if (value.kind === 'null') return 'null'
  if (value.kind === 'primitive') {
    assertCompatible({ id: 'scalar', name: 'scalar', javaType: value.javaType, value }, value)
  } else requireCondition(value.javaType === 'String' && typeof value.value === 'string', 'Invalid string scalar')
  return String(value.value)
}

function activeScopes(state: RuntimeState, frameId: string): RuntimeScope[] {
  return Object.values(state.scopes).filter((scope) => scope.frameId === frameId && scope.status === 'active')
    .sort((a, b) => a.depth - b.depth)
}

function closeScope(state: RuntimeState, scope: RuntimeScope, eventId: string): RuntimeState {
  const frame = state.frames[scope.frameId]
  const locals = Object.fromEntries(Object.entries(frame.locals).filter(([, slot]) => slot.scopeId !== scope.id))
  return {
    ...withFrame(state, { ...frame, locals }),
    scopes: { ...state.scopes, [scope.id]: { ...scope, status: 'closed', exitedAt: eventId } },
    variableLifetimes: state.variableLifetimes.map((life) =>
      life.frameId === frame.id && life.scopeId === scope.id && life.exitedAt === undefined ? { ...life, exitedAt: eventId } : life),
  }
}

function slotsById(slots: RuntimeSlot[], state: RuntimeState): Record<string, RuntimeSlot> {
  const result: Record<string, RuntimeSlot> = {}
  for (const slot of slots) {
    requireCondition(!Object.hasOwn(result, slot.id), `Duplicate slot ${slot.id}`)
    assertCompatible(slot, slot.value)
    if (slot.value.kind === 'reference') {
      requireCondition(state.objects[slot.value.objectId], `Unknown reference target ${slot.value.objectId}`)
    }
    result[slot.id] = { ...slot, value: { ...slot.value } }
  }
  return result
}

function withFrame(state: RuntimeState, frame: RuntimeFrame): RuntimeState {
  return { ...state, frames: { ...state.frames, [frame.id]: frame } }
}

function withObject(state: RuntimeState, object: RuntimeObject): RuntimeState {
  return { ...state, objects: { ...state.objects, [object.id]: object } }
}

function setSlot(state: RuntimeState, owner: SlotOwner, value: RuntimeValue, eventId: string): RuntimeState {
  if (owner.kind === 'frame') {
    const frame = state.frames[owner.frameId]
    requireCondition(frame?.status === 'active', `Frame ${owner.frameId} is not active`)
    const slot = frame.locals[owner.slotId]
    requireCondition(slot, `Unknown slot ${owner.slotId}`)
    assertCompatible(slot, value)
    if (slot.scopeId !== undefined) requireCondition(state.scopes[slot.scopeId]?.status === 'active' &&
      state.scopes[slot.scopeId].frameId === frame.id, `Slot ${slot.id} has no active owning scope`)
    const next = withFrame(state, {
      ...frame,
      locals: { ...frame.locals, [slot.id]: { ...slot, value: { ...value } } },
    })
    return { ...next, variableLifetimes: state.variableLifetimes.map((life) =>
      life.frameId === frame.id && life.slot.id === slot.id && life.exitedAt === undefined ? {
        ...life, slot: { ...slot, value: { ...value } }, lastChangedAt: eventId,
      } : life) }
  }

  const object = state.objects[owner.objectId]
  requireCondition(object, `Unknown object ${owner.objectId}`)
  const slot = object.fields[owner.slotId]
  requireCondition(slot, `Unknown field ${owner.slotId}`)
  assertCompatible(slot, value)
  return withObject(state, {
    ...object,
    fields: { ...object.fields, [slot.id]: { ...slot, value: { ...value } } },
  })
}

/** Apply exactly the next semantic event. The input state and event are never mutated. */
export function applyEvent(state: RuntimeState, event: TraceEvent): RuntimeState {
  requireCondition(event.seq === state.cursor, `Expected event seq ${state.cursor}, received ${event.seq}`)
  requireCondition(state.status !== 'ended' && state.status !== 'aborted', state.status === 'ended'
    ? 'Cannot apply an event after PROGRAM_END' : 'Cannot apply an event after PROGRAM_ABORT')
  requireCondition(
    state.status !== 'ready' || event.type === 'PROGRAM_START',
    'First event must be PROGRAM_START',
  )

  let next: RuntimeState = state
  const activeFrameId = state.activeFrameIds.at(-1)
  if (activeFrameId && state.frames[activeFrameId].returnValue !== undefined) {
    requireCondition(event.type === 'EXIT_METHOD' || event.type === 'RETURN_VALUE',
      `Frame ${activeFrameId} must exit after returning a value`)
  }

  switch (event.type) {
    case 'ENTER_SCOPE': {
      requireCondition(activeFrameId === event.frameId, `Scope entered outside active frame ${event.frameId}`)
      requireCondition(typeof event.scopeId === 'string' && event.scopeId.length > 0 &&
        typeof event.labelScope === 'string' && event.labelScope.length > 0, 'Invalid scope identity or label')
      const innermost = activeScopes(state, event.frameId).at(-1)
      requireCondition(event.parentId === (innermost?.id ?? null), 'Scope parent must be the innermost active scope')
      const previous = state.scopes[event.scopeId]
      requireCondition(previous?.status !== 'active', `Scope ${event.scopeId} already active`)
      requireCondition(!previous || (previous.frameId === event.frameId && previous.parentId === event.parentId &&
        previous.label === event.labelScope), `Lexical scope identity changed for ${event.scopeId}`)
      requireCondition(innermost || Object.keys(state.frames[event.frameId].locals).length === 0,
        'Root scope must enter before scoped declarations')
      next = { ...state, scopes: { ...state.scopes, [event.scopeId]: {
        id: event.scopeId, frameId: event.frameId, parentId: event.parentId, label: event.labelScope,
        depth: innermost ? innermost.depth + 1 : 0, status: 'active', enteredAt: event.eventId,
      } } }
      break
    }

    case 'EXIT_SCOPE': {
      requireCondition(activeFrameId === event.frameId, `Scope exited outside active frame ${event.frameId}`)
      const scope = state.scopes[event.scopeId]
      requireCondition(scope?.status === 'active' && scope.frameId === event.frameId,
        `Scope ${event.scopeId} is not active in frame ${event.frameId}`)
      requireCondition(activeScopes(state, event.frameId).at(-1)?.id === event.scopeId,
        'Scope must exit in innermost order')
      next = closeScope(state, scope, event.eventId)
      break
    }

    case 'EVALUATE_CONDITION': {
      requireCondition(activeFrameId === event.frameId, `Condition evaluated outside active frame ${event.frameId}`)
      requireCondition(typeof event.conditionId === 'string' && event.conditionId.length > 0 &&
        ['branch', 'loop'].includes(event.kind) && typeof event.expression === 'string' && event.expression.length > 0 &&
        typeof event.takenLabel === 'string' && event.takenLabel.length > 0 &&
        typeof event.skippedLabel === 'string' && event.skippedLabel.length > 0 &&
        Array.isArray(event.operands) && event.operands.length === 2 &&
        ['<', '>', '<=', '=='].includes(event.operator) && typeof event.result === 'boolean', 'Invalid condition')
      for (const operand of event.operands) {
        requireCondition(operand && typeof operand.label === 'string' && operand.label.length > 0,
          'Invalid condition operand')
        scalarText(operand.value)
        if (operand.slotId !== undefined) {
          const slot = state.frames[event.frameId].locals[operand.slotId]
          requireCondition(slot, `Unknown observed slot ${operand.slotId}`)
          requireCondition(sameValue(slot.value, operand.value), `Observed condition value mismatch at ${operand.slotId}`)
        }
      }
      const [left, right] = event.operands.map((operand) => operand.value)
      requireCondition(left.kind === 'primitive' && right.kind === 'primitive' && left.javaType === right.javaType,
        'Condition operands must be compatible primitives')
      let result: boolean
      if (event.operator === '==') result = left.value === right.value
      else {
        requireCondition(typeof left.value === 'number' && typeof right.value === 'number',
          'Ordered condition operands must be numeric')
        result = event.operator === '<' ? left.value < right.value :
          event.operator === '>' ? left.value > right.value : left.value <= right.value
      }
      requireCondition(result === event.result, 'Condition result mismatch')
      const { frameId, conditionId, kind, expression, operator, takenLabel, skippedLabel } = event
      next = { ...state, conditions: { ...state.conditions, [frameId]: {
        eventId: event.eventId, frameId, conditionId, kind, expression, operator, result, takenLabel, skippedLabel,
        operands: [{ ...event.operands[0], value: { ...left } }, { ...event.operands[1], value: { ...right } }],
      } } }
      break
    }

    case 'LOOP_ITERATION': {
      requireCondition(activeFrameId === event.frameId, `Loop recorded outside active frame ${event.frameId}`)
      requireCondition(typeof event.loopId === 'string' && event.loopId.length > 0 &&
        Number.isInteger(event.iteration) && event.iteration >= 0 && ['running', 'ended'].includes(event.status),
        'Invalid loop iteration')
      const previous = state.loops[event.loopId]
      requireCondition(!previous || previous.frameId === event.frameId, 'Loop identity belongs to another frame')
      requireCondition(previous?.status !== 'ended', 'Loop already ended')
      const condition = state.conditions[event.frameId]
      requireCondition(condition?.kind === 'loop' && condition.eventId === state.lastEventId,
        'Loop iteration requires a fresh loop condition')
      requireCondition(condition.conditionId === event.loopId, 'Loop iteration must match the fresh condition identity')
      requireCondition(condition.result === (event.status === 'running'), 'Loop status and condition result mismatch')
      requireCondition(event.iteration === (previous?.iteration ?? 0) + (event.status === 'running' ? 1 : 0),
        'Loop iteration must be sequential or end with the completed count')
      next = { ...state, loops: { ...state.loops, [event.loopId]: {
        eventId: event.eventId, frameId: event.frameId, loopId: event.loopId,
        iteration: event.iteration, status: event.status,
      } } }
      break
    }

    case 'INPUT_READ': {
      requireCondition(activeFrameId === event.frameId, `Input read outside active frame ${event.frameId}`)
      const reader = state.objects[event.readerObjectId]
      requireCondition(reader && ['Scanner', 'java.util.Scanner'].includes(reader.className) && !reader.array,
        'Input reader must be an existing Scanner object')
      requireCondition(Object.values(state.frames[event.frameId].locals).some((slot) =>
        slot.value.kind === 'reference' && slot.value.objectId === reader.id &&
        ['Scanner', 'java.util.Scanner'].includes(slot.javaType)), 'Input reader requires a live Scanner reference')
      requireCondition(event.method === 'nextInt', 'Input method must be nextInt')
      requireCondition(Number.isInteger(event.inputIndex) &&
        event.inputIndex === state.console.filter((entry) => entry.kind === 'input').length,
        'Input index must match the zero-based consumed input count')
      requireInt(event.value)
      requireCondition(typeof event.text === 'string' && /^[+-]?\d+$/.test(event.text) &&
        Number(event.text) === event.value.value, 'Input text and Java int value mismatch')
      next = setSlot(state, { kind: 'frame', frameId: event.frameId, slotId: event.destinationSlotId }, event.value, event.eventId)
      next = { ...next, console: [...state.console, {
        eventId: event.eventId, frameId: event.frameId, source: event.source ? { ...event.source } : null,
        kind: 'input', text: event.text, value: { ...event.value },
        destinationSlotId: event.destinationSlotId, readerObjectId: event.readerObjectId,
      }] }
      break
    }

    case 'OUTPUT_WRITE': {
      requireCondition(activeFrameId === event.frameId, `Output written outside active frame ${event.frameId}`)
      const text = scalarText(event.value)
      requireCondition(event.text === text || event.text === `${text}\n`, 'Output text and scalar value mismatch')
      if (event.originSlotId !== undefined) {
        const slot = state.frames[event.frameId].locals[event.originSlotId]
        requireCondition(slot, `Unknown output origin slot ${event.originSlotId}`)
        requireCondition(sameValue(slot.value, event.value), `Observed output value mismatch at ${event.originSlotId}`)
      }
      next = { ...state, console: [...state.console, {
        eventId: event.eventId, frameId: event.frameId, source: event.source ? { ...event.source } : null,
        kind: 'output', text: event.text, value: { ...event.value },
      }] }
      break
    }

    case 'PROGRAM_START':
      requireCondition(state.status === 'ready', 'PROGRAM_START can only occur once')
      next = { ...state, status: 'running' }
      break

    case 'PROGRAM_END':
      requireCondition(state.activeFrameIds.length === 0, 'Cannot end with active frames')
      next = { ...state, status: 'ended' }
      break

    case 'PROGRAM_ABORT':
      requireCondition(state.status === 'running', 'Only a running program can abort')
      next = { ...state, status: 'aborted', abortReason: `${event.reason}: ${event.message}` }
      break

    case 'LINE_EXECUTE':
      requireCondition(activeFrameId === event.frameId, `Line executed outside active frame ${event.frameId}`)
      break

    case 'ENTER_METHOD': {
      requireCondition(!state.frames[event.frameId], `Duplicate frame ${event.frameId}`)
      requireCondition(event.callerFrameId === (activeFrameId ?? null), 'Caller must be the active frame')
      requireCondition(event.locals.every((slot) => slot.scopeId === undefined),
        'Scoped parameters must be declared after ENTER_SCOPE')
      const frame: RuntimeFrame = {
        id: event.frameId,
        callerFrameId: event.callerFrameId,
        className: event.className,
        methodName: event.methodName,
        depth: state.activeFrameIds.length,
        status: 'active',
        locals: slotsById(event.locals, state),
        enteredAt: event.eventId,
        ...(event.invocationLabel !== undefined ? { invocationLabel: event.invocationLabel } : {}),
        ...(event.returnType !== undefined ? { returnType: event.returnType } : {}),
      }
      next = withFrame(state, frame)
      next = { ...next, activeFrameIds: [...state.activeFrameIds, frame.id] }
      break
    }

    case 'EXIT_METHOD': {
      requireCondition(activeFrameId === event.frameId, `Method return is not top of stack: ${event.frameId}`)
      const frame = state.frames[event.frameId]
      requireCondition(!frame.returnType || frame.returnType === 'void' || frame.returnValue !== undefined,
        `Non-void frame ${event.frameId} must return a value before exit`)
      requireCondition(!Object.values(state.loops).some((loop) => loop.frameId === frame.id && loop.status === 'running') ||
        frame.returnValue !== undefined, 'Running loop must terminate before method exit')
      for (const scope of activeScopes(state, frame.id).reverse()) next = closeScope(next, scope, event.eventId)
      next = { ...next, loops: Object.fromEntries(Object.entries(next.loops).map(([id, loop]) =>
        [id, loop.frameId === frame.id && loop.status === 'running' ?
          { ...loop, eventId: event.eventId, status: 'ended' as const } : loop])) }
      next = withFrame(next, { ...next.frames[frame.id], status: 'returned', exitedAt: event.eventId })
      next = { ...next, activeFrameIds: state.activeFrameIds.slice(0, -1) }
      break
    }

    case 'RETURN_VALUE': {
      requireCondition(activeFrameId === event.frameId, `Value returned outside top frame ${event.frameId}`)
      const frame = state.frames[event.frameId]
      requireCondition(frame.returnType && frame.returnType !== 'void', `Frame ${event.frameId} has no return type`)
      requireCondition(frame.returnValue === undefined, `Duplicate return from ${event.frameId}`)
      requireCondition(event.value.kind !== 'uninitialized', 'Return value must be concrete')
      assertCompatible({ id: `${frame.id}:return`, name: 'return', javaType: frame.returnType, value: event.value }, event.value)

      if (frame.callerFrameId === null) {
        requireCondition(event.destination === null, 'Root return cannot have a caller destination')
      } else if (event.destination) {
        requireCondition(event.destination.frameId === frame.callerFrameId &&
          state.activeFrameIds.at(-2) === frame.callerFrameId, 'Return destination must be the direct caller')
        next = setSlot(state, { kind: 'frame', ...event.destination }, event.value, event.eventId)
      }
      next = withFrame(next, { ...frame, returnValue: { ...event.value } })
      next = {
        ...next,
        returns: [...state.returns, {
          eventId: event.eventId,
          frameId: event.frameId,
          destination: event.destination ? { ...event.destination } : null,
          value: { ...event.value },
          ...(event.expression !== undefined ? { expression: event.expression } : {}),
        }],
      }
      break
    }

    case 'DECLARE_LOCAL': {
      requireCondition(activeFrameId === event.frameId, `Local declared outside active frame ${event.frameId}`)
      const frame = state.frames[event.frameId]
      requireCondition(!frame.locals[event.slot.id], `Duplicate slot ${event.slot.id}`)
      const scopes = activeScopes(state, frame.id)
      const scopedFrame = Object.values(state.scopes).some((scope) => scope.frameId === frame.id)
      requireCondition(!scopedFrame || event.slot.scopeId !== undefined, 'Scoped frame declarations require scopeId')
      if (event.slot.scopeId !== undefined) {
        requireCondition(scopes.at(-1)?.id === event.slot.scopeId,
          'Declaration must belong to the innermost active scope')
        requireCondition(!Object.values(frame.locals).some((slot) => slot.name === event.slot.name),
          `Duplicate live variable name ${event.slot.name}`)
        if (event.slot.role === 'parameter') requireCondition(scopes.length === 1, 'Parameter must belong to the root scope')
        const old = state.variableLifetimes.find((life) => life.slot.id === event.slot.id)
        requireCondition(!old || (old.frameId === frame.id && old.scopeId === event.slot.scopeId &&
          old.slot.name === event.slot.name && old.slot.javaType === event.slot.javaType && old.slot.role === event.slot.role),
        `Lexical slot identity changed for ${event.slot.id}`)
      }
      assertCompatible(event.slot, event.slot.value)
      if (event.slot.value.kind === 'reference') {
        requireCondition(state.objects[event.slot.value.objectId], `Unknown reference target ${event.slot.value.objectId}`)
      }
      next = withFrame(state, {
        ...frame,
        locals: { ...frame.locals, [event.slot.id]: { ...event.slot, value: { ...event.slot.value } } },
      })
      if (event.slot.scopeId !== undefined) next = { ...next, variableLifetimes: [...state.variableLifetimes, {
        slot: { ...event.slot, value: { ...event.slot.value } }, frameId: frame.id, scopeId: event.slot.scopeId,
        declaredAt: event.eventId, source: event.source ? { ...event.source } : null, lastChangedAt: event.eventId,
      }] }
      break
    }

    case 'REMOVE_LOCAL': {
      requireCondition(activeFrameId === event.frameId, `Local removed outside active frame ${event.frameId}`)
      const frame = state.frames[event.frameId]
      requireCondition(frame.locals[event.slotId], `Unknown slot ${event.slotId}`)
      requireCondition(frame.locals[event.slotId].scopeId === undefined, 'Scoped locals close through EXIT_SCOPE or EXIT_METHOD')
      const locals = { ...frame.locals }
      delete locals[event.slotId]
      next = withFrame(state, { ...frame, locals })
      break
    }

    case 'ASSIGN_LOCAL':
      requireCondition(activeFrameId === event.frameId, `Local assigned outside active frame ${event.frameId}`)
      next = setSlot(state, { kind: 'frame', frameId: event.frameId, slotId: event.slotId }, event.value, event.eventId)
      break

    case 'ALLOCATE_OBJECT': {
      requireCondition(!state.objects[event.objectId], `Duplicate object ${event.objectId}`)
      requireCondition(
        !Object.values(state.objects).some((object) => object.displayId === event.displayId),
        `Duplicate display ID ${event.displayId}`,
      )
      next = withObject(state, {
        id: event.objectId,
        displayId: event.displayId,
        className: event.className,
        fields: slotsById(event.fields, state),
        allocatedAt: event.eventId,
      })
      break
    }

    case 'ALLOCATE_ARRAY': {
      requireCondition(activeFrameId, 'Array allocation requires an active frame')
      requireCondition(!state.objects[event.objectId], `Duplicate object ${event.objectId}`)
      requireCondition(Number.isInteger(event.displayId) && event.displayId > 0, 'Invalid array display ID')
      requireCondition(!Object.values(state.objects).some((object) => object.displayId === event.displayId),
        `Duplicate display ID ${event.displayId}`)
      requireCondition(event.elementType === 'int', 'Array element type must be int')
      const elements = event.elements.map((value, index) => {
        requireInt(value)
        return {
          id: arrayElementSlotId(event.objectId, index), name: `[${index}]`, javaType: 'int',
          value: { ...value },
        }
      })
      next = withObject(state, {
        id: event.objectId, displayId: event.displayId, className: 'int[]', fields: {},
        allocatedAt: event.eventId,
        array: { elementType: 'int', length: elements.length, elements },
      })
      break
    }

    case 'ARRAY_READ': {
      requireCondition(activeFrameId === event.frameId, `Array read outside active frame ${event.frameId}`)
      const element = requireElement(requireArray(state, event.objectId), event.index)
      requireObserved(element, event.value)
      if (event.destinationSlotId !== undefined) {
        next = setSlot(state, { kind: 'frame', frameId: event.frameId, slotId: event.destinationSlotId }, event.value, event.eventId)
      }
      next = { ...next, arrayActivity: {
        kind: 'read', eventId: event.eventId, objectId: event.objectId, index: event.index,
        value: { ...event.value },
        ...(event.destinationSlotId !== undefined ? { destinationSlotId: event.destinationSlotId } : {}),
      } }
      break
    }

    case 'ARRAY_COMPARE': {
      requireCondition(activeFrameId === event.frameId, `Array comparison outside active frame ${event.frameId}`)
      requireCondition(event.indices.length === 2 && event.values.length === 2 && event.operator === '>' &&
        typeof event.result === 'boolean', 'Invalid array comparison')
      const object = requireArray(state, event.objectId)
      requireObserved(requireElement(object, event.indices[0]), event.values[0])
      requireObserved(requireElement(object, event.indices[1]), event.values[1])
      requireInt(event.values[0])
      requireInt(event.values[1])
      requireCondition(event.result === (event.values[0].value > event.values[1].value),
        'Array comparison result mismatch')
      next = { ...state, arrayActivity: {
        kind: 'compare', eventId: event.eventId, objectId: event.objectId,
        indices: [...event.indices], values: [{ ...event.values[0] }, { ...event.values[1] }],
        operator: event.operator, result: event.result,
      } }
      break
    }

    case 'ARRAY_WRITE': {
      requireCondition(activeFrameId === event.frameId, `Array write outside active frame ${event.frameId}`)
      const object = requireArray(state, event.objectId)
      const element = requireElement(object, event.index)
      requireInt(event.value)
      requireInt(element.value)
      if (event.from) {
        let origin: RuntimeSlot
        if (event.from.kind === 'element') {
          origin = requireElement(object, event.from.index)
        } else {
          requireCondition(event.from.kind === 'slot' && event.from.frameId === event.frameId,
            'Array write origin must be a local in the active frame')
          origin = state.frames[event.from.frameId].locals[event.from.slotId]
          requireCondition(origin, `Unknown origin slot ${event.from.slotId}`)
          requireCondition(origin.javaType === 'int', `Array origin slot ${origin.id} must be int`)
        }
        requireInt(origin.value)
        requireCondition(origin.value.value === event.value.value, 'Array write origin value mismatch')
      }
      const elements = [...object.array.elements]
      elements[event.index] = { ...element, value: { ...event.value } }
      next = withObject(state, { ...object, array: { ...object.array, elements } })
      const mutation = {
        eventId: event.eventId, objectId: event.objectId, index: event.index,
        before: { ...element.value }, after: { ...event.value },
        ...(event.from ? { from: { ...event.from } } : {}),
      }
      next = { ...next,
        arrayActivity: { kind: 'write', ...mutation,
          before: { ...mutation.before }, after: { ...mutation.after },
          ...(mutation.from ? { from: { ...mutation.from } } : {}) },
        arrayMutations: [...state.arrayMutations, mutation],
      }
      break
    }

    case 'SET_FIELD':
      next = setSlot(state, { kind: 'object', objectId: event.objectId, slotId: event.slotId }, event.value, event.eventId)
      break

    case 'CREATE_REFERENCE': {
      requireCondition(state.objects[event.targetObjectId], `Unknown reference target ${event.targetObjectId}`)
      const owner = event.sourceSlot
      const slot = owner.kind === 'frame'
        ? state.frames[owner.frameId]?.locals[owner.slotId]
        : state.objects[owner.objectId]?.fields[owner.slotId]
      requireCondition(slot, `Unknown reference source ${owner.slotId}`)
      requireCondition(slot.javaType === event.javaType, `Reference type mismatch for ${slot.id}`)
      next = setSlot(state, owner, {
        kind: 'reference',
        javaType: event.javaType,
        objectId: event.targetObjectId,
      }, event.eventId)
      break
    }

    case 'CLEAR_REFERENCE': {
      const owner = event.sourceSlot
      const slot = owner.kind === 'frame'
        ? state.frames[owner.frameId]?.locals[owner.slotId]
        : state.objects[owner.objectId]?.fields[owner.slotId]
      requireCondition(slot?.value.kind === 'reference', `Slot ${owner.slotId} has no reference to clear`)
      next = setSlot(state, owner, { kind: 'null' }, event.eventId)
      break
    }

    case 'BRANCH_EVALUATE':
      requireCondition(activeFrameId === event.frameId, `Branch evaluated outside active frame ${event.frameId}`)
      next = { ...state, branch: {
        eventId: event.eventId, frameId: event.frameId, opcode: event.opcode, site: event.site,
        left: { ...event.left }, ...(event.right ? { right: { ...event.right } } : {}), taken: event.taken,
      } }
      break

    case 'THROW_EXCEPTION':
      requireCondition(activeFrameId === event.frameId, `Exception thrown outside active frame ${event.frameId}`)
      requireCondition(!state.exceptions.some((item) => item.exceptionId === event.exceptionId && !item.caughtBy),
        `Exception ${event.exceptionId} already active`)
      next = { ...state, exceptions: [...state.exceptions, {
        eventId: event.eventId, exceptionId: event.exceptionId, className: event.className,
        message: event.message, explicit: event.explicit, source: event.source,
        frameIds: [...state.activeFrameIds], unwoundFrameIds: [],
      }] }
      break

    case 'UNWIND_EXCEPTION': {
      requireCondition(activeFrameId === event.frameId, `Exception unwind outside top frame ${event.frameId}`)
      const index = state.exceptions.map((item) => item.exceptionId === event.exceptionId && !item.caughtBy).lastIndexOf(true)
      requireCondition(index >= 0, `Unknown active exception ${event.exceptionId}`)
      const frame = state.frames[event.frameId]
      for (const scope of activeScopes(state, frame.id).reverse()) next = closeScope(next, scope, event.eventId)
      next = withFrame(next, { ...next.frames[frame.id], status: 'unwound', exitedAt: event.eventId })
      const exceptions = [...next.exceptions]
      exceptions[index] = { ...exceptions[index], unwoundFrameIds: [...exceptions[index].unwoundFrameIds, frame.id] }
      next = { ...next, activeFrameIds: state.activeFrameIds.slice(0, -1), exceptions }
      break
    }

    case 'CATCH_EXCEPTION': {
      requireCondition(activeFrameId === event.frameId, `Exception caught outside top frame ${event.frameId}`)
      const index = state.exceptions.map((item) => item.exceptionId === event.exceptionId && !item.caughtBy).lastIndexOf(true)
      requireCondition(index >= 0, `Unknown active exception ${event.exceptionId}`)
      const exceptions = [...state.exceptions]
      exceptions[index] = { ...exceptions[index], caughtBy: event.frameId }
      next = { ...state, exceptions }
      break
    }
  }

  return {
    ...next,
    cursor: state.cursor + 1,
    currentSource: event.source ? { ...event.source } : event.type === 'PROGRAM_ABORT' ? state.currentSource : null,
    lastEventId: event.eventId,
    // Activity describes the current array instruction, not a lingering visual effect.
    arrayActivity: ['ARRAY_READ', 'ARRAY_COMPARE', 'ARRAY_WRITE'].includes(event.type) ? next.arrayActivity : null,
  }
}
