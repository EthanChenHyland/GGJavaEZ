import rawPersonTrace from '../demos/person/person.trace.json'
import personSource from '../demos/person/Main.java?raw'
import type { RuntimeSlot, RuntimeValue, SlotOwner, TraceDocument, TraceEvent } from '../contracts/runtime'
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
        (value.javaType === 'int' && Number.isInteger(value.value)) ||
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

function isScalar(value: unknown): boolean {
  return isValue(value) && value.kind !== 'reference'
}

function isSlot(value: unknown): value is RuntimeSlot {
  return isRecord(value) && isText(value.id) && isText(value.name) && isText(value.javaType) && isValue(value.value)
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
        Array.isArray(value.locals) && value.locals.every(isSlot)
    case 'DECLARE_LOCAL':
      return isText(value.frameId) && isSlot(value.slot)
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
  let state = createInitialState()
  for (const [seq, rawEvent] of input.events.entries()) {
    if (!isEvent(rawEvent)) throw new Error(`Malformed event at seq ${seq}`)
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
