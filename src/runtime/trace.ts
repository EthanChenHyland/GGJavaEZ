import rawPersonTrace from '../demos/person/person.trace.json'
import personSource from '../demos/person/Main.java?raw'
import rawRecursionTrace from '../demos/recursion/recursion.trace.json'
import recursionSource from '../demos/recursion/Main.java?raw'
import rawArrayTrace from '../demos/arrays/trace.json'
import arraySource from '../demos/arrays/Main.java?raw'
import rawControlTrace from '../demos/control/trace.json'
import controlSource from '../demos/control/Main.java?raw'
import type { RuntimeSlot, RuntimeValue, ScalarValue, SlotOwner, TraceDocument, TraceEvent } from '../contracts/runtime'
import { applyEvent, createInitialState } from './state'

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isSource(value: unknown): boolean {
  return isRecord(value) && isText(value.fileId) && Number.isInteger(value.line) && (value.line as number) > 0
}

function isValue(value: unknown): value is RuntimeValue {
  if (!isRecord(value)) return false
  switch (value.kind) {
    case 'uninitialized':
    case 'null':
      return true
    case 'primitive':
      return (
        (value.javaType === 'int' && Number.isInteger(value.value) &&
          (value.value as number) >= -2147483648 && (value.value as number) <= 2147483647) ||
        (value.javaType === 'double' && typeof value.value === 'number' && Number.isFinite(value.value)) ||
        (value.javaType === 'boolean' && typeof value.value === 'boolean')
      )
    case 'stringSummary':
      return value.javaType === 'String' && typeof value.value === 'string'
    case 'reference':
      return isText(value.javaType) && isText(value.objectId)
    default:
      return false
  }
}

function isScalar(value: unknown): value is ScalarValue {
  return isValue(value) && value.kind !== 'reference'
}

function isInt(value: unknown): boolean {
  return isScalar(value) && value.kind === 'primitive' && value.javaType === 'int' &&
    typeof value.value === 'number' && value.value >= -2147483648 && value.value <= 2147483647
}

function isIndex(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0
}

function isSlot(value: unknown): value is RuntimeSlot {
  return isRecord(value) && isText(value.id) && isText(value.name) && isText(value.javaType) && isValue(value.value) &&
    (value.role === undefined || ['local', 'parameter', 'operand', 'return'].includes(String(value.role))) &&
    (value.scopeId === undefined || isText(value.scopeId))
}

function isOperand(value: unknown): boolean {
  return isRecord(value) && isText(value.label) && isScalar(value.value) && value.value.kind !== 'uninitialized' &&
    (value.slotId === undefined || isText(value.slotId))
}

function isOwner(value: unknown): value is SlotOwner {
  if (!isRecord(value) || !isText(value.slotId)) return false
  return (value.kind === 'frame' && isText(value.frameId)) ||
    (value.kind === 'object' && isText(value.objectId))
}

function isEvent(value: unknown): value is TraceEvent {
  if (!isRecord(value) || !isText(value.eventId) || !Number.isInteger(value.seq) ||
      (value.source !== null && !isSource(value.source)) || !isText(value.label) ||
      !['quiet', 'normal', 'major'].includes(String(value.importance))) return false

  switch (value.type) {
    case 'ENTER_SCOPE':
      return isText(value.frameId) && isText(value.scopeId) && isText(value.labelScope) &&
        (value.parentId === null || isText(value.parentId))
    case 'EXIT_SCOPE':
      return isText(value.frameId) && isText(value.scopeId)
    case 'EVALUATE_CONDITION':
      return isText(value.frameId) && isText(value.conditionId) && ['branch', 'loop'].includes(String(value.kind)) &&
        isText(value.expression) && Array.isArray(value.operands) && value.operands.length === 2 && value.operands.every(isOperand) &&
        ['<', '>', '<=', '=='].includes(String(value.operator)) && typeof value.result === 'boolean' &&
        isText(value.takenLabel) && isText(value.skippedLabel)
    case 'LOOP_ITERATION':
      return isText(value.frameId) && isText(value.loopId) && isIndex(value.iteration) &&
        ['running', 'ended'].includes(String(value.status))
    case 'INPUT_READ':
      return isText(value.frameId) && isText(value.readerObjectId) && value.method === 'nextInt' &&
        isIndex(value.inputIndex) && isText(value.destinationSlotId) && isInt(value.value) && isText(value.text)
    case 'OUTPUT_WRITE':
      return isText(value.frameId) && isScalar(value.value) && value.value.kind !== 'uninitialized' &&
        typeof value.text === 'string' && (value.originSlotId === undefined || isText(value.originSlotId))
    case 'PROGRAM_START':
    case 'PROGRAM_END':
      return true
    case 'LINE_EXECUTE':
      return isText(value.frameId) && isSource(value.source)
    case 'EXIT_METHOD':
      return isText(value.frameId)
    case 'ENTER_METHOD':
      return isText(value.frameId) && (value.callerFrameId === null || isText(value.callerFrameId)) &&
        isText(value.className) && isText(value.methodName) &&
        Array.isArray(value.locals) && value.locals.every(isSlot) &&
        (value.invocationLabel === undefined || isText(value.invocationLabel)) &&
        (value.returnType === undefined || isText(value.returnType))
    case 'RETURN_VALUE':
      return isText(value.frameId) && isScalar(value.value) && value.value.kind !== 'uninitialized' &&
        (value.destination === null || (isRecord(value.destination) &&
          isText(value.destination.frameId) && isText(value.destination.slotId))) &&
        (value.expression === undefined || isText(value.expression))
    case 'DECLARE_LOCAL':
      return isText(value.frameId) && isSlot(value.slot)
    case 'REMOVE_LOCAL':
      return isText(value.frameId) && isText(value.slotId)
    case 'ALLOCATE_ARRAY':
      return isText(value.objectId) && Number.isInteger(value.displayId) && (value.displayId as number) > 0 &&
        value.elementType === 'int' && Array.isArray(value.elements) && value.elements.every(isInt)
    case 'ARRAY_READ':
      return isText(value.frameId) && isText(value.objectId) && isIndex(value.index) && isInt(value.value) &&
        (value.destinationSlotId === undefined || isText(value.destinationSlotId))
    case 'ARRAY_COMPARE':
      return isText(value.frameId) && isText(value.objectId) && value.operator === '>' &&
        typeof value.result === 'boolean' && Array.isArray(value.indices) && value.indices.length === 2 &&
        value.indices.every(isIndex) && Array.isArray(value.values) && value.values.length === 2 && value.values.every(isInt)
    case 'ARRAY_WRITE':
      return isText(value.frameId) && isText(value.objectId) && isIndex(value.index) && isInt(value.value) &&
        isRecord(value.from) && ((value.from.kind === 'element' && isIndex(value.from.index)) ||
          (value.from.kind === 'slot' && isText(value.from.frameId) && isText(value.from.slotId)))
    case 'ASSIGN_LOCAL':
      return isText(value.frameId) && isText(value.slotId) && isScalar(value.value)
    case 'ALLOCATE_OBJECT':
      return isText(value.objectId) && Number.isInteger(value.displayId) && (value.displayId as number) > 0 &&
        isText(value.className) && Array.isArray(value.fields) && value.fields.every(isSlot)
    case 'SET_FIELD':
      return isText(value.objectId) && isText(value.slotId) && isScalar(value.value)
    case 'CREATE_REFERENCE':
      return isOwner(value.sourceSlot) && isText(value.targetObjectId) && isText(value.javaType)
    case 'CLEAR_REFERENCE':
      return isOwner(value.sourceSlot)
    default:
      return false
  }
}

/** Validate structure, source locations, and the entire semantic lifecycle before playback. */
export function validateTrace(input: unknown): TraceDocument {
  if (!isRecord(input) || input.schemaVersion !== 1 || !isText(input.demoId) ||
      !Array.isArray(input.sourceFiles) || input.sourceFiles.length === 0 ||
      !Array.isArray(input.events) || input.events.length < 2) {
    throw new Error('Invalid trace document header')
  }

  const files = new Map<string, string>()
  for (const sourceFile of input.sourceFiles) {
    if (!isRecord(sourceFile) || !isText(sourceFile.fileId) || !isText(sourceFile.name) ||
        typeof sourceFile.content !== 'string' || files.has(sourceFile.fileId)) {
      throw new Error('Invalid or duplicate trace source file')
    }
    files.set(sourceFile.fileId, sourceFile.content)
  }

  const eventIds = new Set<string>()
  // Opting into explicit scopes makes every invocation use the scoped entry protocol.
  // Legacy schema-v1 examples keep their existing eager local/parameter entries.
  const scoped = input.events.some((event) => isRecord(event) && event.type === 'ENTER_SCOPE')
  let state = createInitialState()
  for (const [seq, rawEvent] of input.events.entries()) {
    if (!isEvent(rawEvent)) throw new Error(`Malformed event at seq ${seq}`)
    if (scoped && rawEvent.type === 'ENTER_METHOD' && rawEvent.locals.length !== 0) {
      throw new Error(`Invalid event at seq ${seq}: Scoped ENTER_METHOD must have empty locals`)
    }
    if (scoped && rawEvent.type === 'DECLARE_LOCAL' && rawEvent.slot.scopeId === undefined) {
      throw new Error(`Invalid event at seq ${seq}: Scoped declarations require scopeId`)
    }
    if (rawEvent.seq !== seq) throw new Error(`Non-contiguous event seq at ${seq}`)
    if (eventIds.has(rawEvent.eventId)) throw new Error(`Duplicate event ID ${rawEvent.eventId}`)
    eventIds.add(rawEvent.eventId)
    if (rawEvent.source) {
      const content = files.get(rawEvent.source.fileId)
      if (content === undefined || rawEvent.source.line > content.split('\n').length) {
        throw new Error(`Invalid source location at seq ${seq}`)
      }
    }
    try {
      state = applyEvent(state, rawEvent)
    } catch (error) {
      throw new Error(`Invalid event at seq ${seq}: ${(error as Error).message}`, { cause: error })
    }
  }

  if (state.status !== 'ended') throw new Error('Trace must end with PROGRAM_END')
  return input as unknown as TraceDocument
}

export function loadPersonTrace(): TraceDocument {
  const trace = validateTrace(structuredClone(rawPersonTrace))
  if (trace.demoId !== 'person' || trace.sourceFiles.length !== 1 ||
      trace.sourceFiles[0].content !== personSource) {
    throw new Error('Person trace and Java source fixture differ')
  }
  return trace
}

export function loadRecursionTrace(): TraceDocument {
  const trace = validateTrace(structuredClone(rawRecursionTrace))
  if (trace.demoId !== 'recursion' || trace.sourceFiles.length !== 1 ||
      trace.sourceFiles[0].content !== recursionSource) {
    throw new Error('Recursion trace and Java source fixture differ')
  }
  return trace
}

export function loadArrayTrace(): TraceDocument {
  const trace = validateTrace(structuredClone(rawArrayTrace))
  if (trace.demoId !== 'arrays' || trace.sourceFiles.length !== 1 ||
      trace.sourceFiles[0].content !== arraySource) {
    throw new Error('Array trace and Java source fixture differ')
  }
  return trace
}

export function loadControlTrace(): TraceDocument {
  const trace = validateTrace(structuredClone(rawControlTrace))
  if (trace.demoId !== 'control' || trace.sourceFiles.length !== 1 ||
      trace.sourceFiles[0].content !== controlSource) {
    throw new Error('Control trace and Java source fixture differ')
  }
  return trace
}
