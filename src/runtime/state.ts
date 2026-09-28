import type {
  RuntimeFrame,
  RuntimeObject,
  RuntimeSlot,
  RuntimeState,
  RuntimeValue,
  SlotOwner,
  TraceEvent,
} from '../contracts/runtime'

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
  }
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertCompatible(slot: RuntimeSlot, value: RuntimeValue): void {
  const matches = value.kind === 'uninitialized' ||
    (value.kind === 'null' && !['int', 'boolean', 'double'].includes(slot.javaType)) ||
    (value.kind === 'primitive' && value.javaType === slot.javaType) ||
    (value.kind === 'stringSummary' && slot.javaType === 'String') ||
    (value.kind === 'reference' && value.javaType === slot.javaType)
  requireCondition(matches, `Value type mismatch for ${slot.id}`)
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

function setSlot(state: RuntimeState, owner: SlotOwner, value: RuntimeValue): RuntimeState {
  if (owner.kind === 'frame') {
    const frame = state.frames[owner.frameId]
    requireCondition(frame?.status === 'active', `Frame ${owner.frameId} is not active`)
    const slot = frame.locals[owner.slotId]
    requireCondition(slot, `Unknown slot ${owner.slotId}`)
    assertCompatible(slot, value)
    return withFrame(state, {
      ...frame,
      locals: { ...frame.locals, [slot.id]: { ...slot, value: { ...value } } },
    })
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
  requireCondition(state.status !== 'ended', 'Cannot apply an event after PROGRAM_END')
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
    case 'PROGRAM_START':
      requireCondition(state.status === 'ready', 'PROGRAM_START can only occur once')
      next = { ...state, status: 'running' }
      break

    case 'PROGRAM_END':
      requireCondition(state.activeFrameIds.length === 0, 'Cannot end with active frames')
      next = { ...state, status: 'ended' }
      break

    case 'LINE_EXECUTE':
      requireCondition(activeFrameId === event.frameId, `Line executed outside active frame ${event.frameId}`)
      break

    case 'ENTER_METHOD': {
      requireCondition(!state.frames[event.frameId], `Duplicate frame ${event.frameId}`)
      requireCondition(event.callerFrameId === (activeFrameId ?? null), 'Caller must be the active frame')
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
      next = withFrame(state, { ...frame, status: 'returned', exitedAt: event.eventId })
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
      } else {
        requireCondition(event.destination?.frameId === frame.callerFrameId &&
          state.activeFrameIds.at(-2) === frame.callerFrameId, 'Return destination must be the direct caller')
        next = setSlot(state, { kind: 'frame', ...event.destination }, event.value)
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
      assertCompatible(event.slot, event.slot.value)
      if (event.slot.value.kind === 'reference') {
        requireCondition(state.objects[event.slot.value.objectId], `Unknown reference target ${event.slot.value.objectId}`)
      }
      next = withFrame(state, {
        ...frame,
        locals: { ...frame.locals, [event.slot.id]: { ...event.slot, value: { ...event.slot.value } } },
      })
      break
    }

    case 'ASSIGN_LOCAL':
      requireCondition(activeFrameId === event.frameId, `Local assigned outside active frame ${event.frameId}`)
      next = setSlot(state, { kind: 'frame', frameId: event.frameId, slotId: event.slotId }, event.value)
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

    case 'SET_FIELD':
      next = setSlot(state, { kind: 'object', objectId: event.objectId, slotId: event.slotId }, event.value)
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
      })
      break
    }

    case 'CLEAR_REFERENCE': {
      const owner = event.sourceSlot
      const slot = owner.kind === 'frame'
        ? state.frames[owner.frameId]?.locals[owner.slotId]
        : state.objects[owner.objectId]?.fields[owner.slotId]
      requireCondition(slot?.value.kind === 'reference', `Slot ${owner.slotId} has no reference to clear`)
      next = setSlot(state, owner, { kind: 'null' })
      break
    }
  }

  return {
    ...next,
    cursor: state.cursor + 1,
    currentSource: event.source ? { ...event.source } : null,
    lastEventId: event.eventId,
  }
}
