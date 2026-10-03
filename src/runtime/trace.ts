import type { RuntimeSlot, RuntimeValue, ScalarValue, SlotOwner, TraceDocument, TraceEvent } from '../contracts/runtime'
import { isRecordingStop } from './state'
import type { RuntimeState } from '../contracts/runtime'
import { historyForTrace } from './history'

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
        (['byte', 'short'].includes(String(value.javaType)) && typeof value.value === 'number' && Number.isInteger(value.value)) ||
        (['double', 'float'].includes(String(value.javaType)) && typeof value.value === 'number' && Number.isFinite(value.value)) ||
        (value.javaType === 'long' && typeof value.value === 'string' && /^-?\d+$/.test(value.value)) ||
        (value.javaType === 'char' && typeof value.value === 'string' && value.value.length === 1) ||
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

function isEvent(value: unknown, schemaVersion: 1 | 2): value is TraceEvent {
  if (!isRecord(value) || !isText(value.eventId) || !Number.isInteger(value.seq) ||
      (value.source !== null && !isSource(value.source)) || !isText(value.label) ||
      (value.threadId !== undefined && !isText(value.threadId)) ||
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
    case 'CONSOLE_WRITE':
      return schemaVersion === 2 && (value.frameId === null || isText(value.frameId)) &&
        ['stdout', 'stderr'].includes(String(value.channel)) && typeof value.text === 'string'
    case 'CONSOLE_INPUT':
      return schemaVersion === 2 && (value.frameId === null || isText(value.frameId)) && typeof value.text === 'string'
    case 'PROGRAM_START':
    case 'PROGRAM_END':
      return true
    case 'PROGRAM_ABORT':
      return schemaVersion === 2 && ['program_crashed', 'instrumentation_failed', 'limit_exceeded', 'unsupported'].includes(String(value.reason)) && typeof value.message === 'string'
    case 'CAPTURE_STOP':
      return schemaVersion === 2 && isRecordingStop(value.recording)
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
        (schemaVersion === 2 && value.from === undefined ||
          isRecord(value.from) && ((value.from.kind === 'element' && isIndex(value.from.index)) ||
            (value.from.kind === 'slot' && isText(value.from.frameId) && isText(value.from.slotId))))
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
    case 'BRANCH_EVALUATE':
      return schemaVersion === 2 && isText(value.frameId) && isIndex(value.opcode) && isIndex(value.site) &&
        isScalar(value.left) && (value.right === undefined || isScalar(value.right)) && typeof value.taken === 'boolean'
    case 'THROW_EXCEPTION':
      return schemaVersion === 2 && isText(value.frameId) && isText(value.exceptionId) && isText(value.className) &&
        (value.message === null || typeof value.message === 'string') && typeof value.explicit === 'boolean'
    case 'UNWIND_EXCEPTION':
    case 'CATCH_EXCEPTION':
    case 'FINALLY_ENTER':
      return schemaVersion === 2 && isText(value.frameId) && isText(value.exceptionId)
    default:
      return false
  }
}

/** Shape/source/identity checks for new events only. Semantic lifecycle stays in applyEvent.
 * Scope opt-in is a global invariant: retain two violation watermarks, rather than
 * rescanning old events when the first explicit scope arrives in a later batch.
 */
export class IncrementalTraceValidator {
  private readonly ids = new Set<string>()
  private readonly lines: Map<string, number> | undefined
  private scoped = false
  private eagerEntry: number | undefined
  private unscopedDeclaration: number | undefined
  constructor(private readonly schemaVersion: 1 | 2 = 2, sourceFiles?: TraceDocument['sourceFiles']) {
    if (sourceFiles) {
      this.lines = new Map()
      for (const file of sourceFiles) {
        if (!isRecord(file) || !isText(file.fileId) || !isText(file.name) || typeof file.content !== 'string' || this.lines.has(file.fileId)) {
          throw new Error('Invalid or duplicate trace source file')
        }
        this.lines.set(file.fileId, file.content.split('\n').length)
      }
    }
  }
  check(raw: unknown, state: RuntimeState): void {
    const seq = state.cursor
    if (!isEvent(raw, this.schemaVersion)) throw new Error(`Malformed event at seq ${seq}`)
    if (raw.seq !== seq) throw new Error(`Non-contiguous event seq at ${seq}`)
    if (this.ids.has(raw.eventId)) throw new Error(`Duplicate event ID ${raw.eventId}`)
    if (raw.source && this.lines) {
      const lines = this.lines.get(raw.source.fileId)
      if (lines === undefined || raw.source.line > lines) throw new Error(`Invalid source location at seq ${seq}`)
    }
    if (this.schemaVersion === 1 && raw.type === 'RETURN_VALUE' && state.frames[raw.frameId]?.callerFrameId && !raw.destination) {
      throw new Error(`Invalid event at seq ${seq}: schema-v1 returns require a direct caller destination`)
    }
    if (raw.type === 'ENTER_SCOPE' && !this.scoped) {
      if (this.eagerEntry !== undefined) throw new Error(`Invalid event at seq ${this.eagerEntry}: Scoped ENTER_METHOD must have empty locals`)
      if (this.unscopedDeclaration !== undefined) throw new Error(`Invalid event at seq ${this.unscopedDeclaration}: Scoped declarations require scopeId`)
    }
    if (this.scoped && raw.type === 'ENTER_METHOD' && raw.locals.length !== 0) throw new Error(`Invalid event at seq ${seq}: Scoped ENTER_METHOD must have empty locals`)
    if (this.scoped && raw.type === 'DECLARE_LOCAL' && raw.slot.scopeId === undefined) throw new Error(`Invalid event at seq ${seq}: Scoped declarations require scopeId`)
  }
  accept(event: TraceEvent): void {
    this.ids.add(event.eventId)
    if (event.type === 'ENTER_SCOPE') this.scoped = true
    if (event.type === 'ENTER_METHOD' && event.locals.length && this.eagerEntry === undefined) this.eagerEntry = event.seq
    if (event.type === 'DECLARE_LOCAL' && event.slot.scopeId === undefined && this.unscopedDeclaration === undefined) this.unscopedDeclaration = event.seq
  }
}

/** Validate a batch or registered live prefix; existing events are checked only once. */
export function validateTrace(input: unknown, options: { allowLive?: boolean } = {}): TraceDocument {
  if (!isRecord(input) || (input.schemaVersion !== 1 && input.schemaVersion !== 2) || !isText(input.demoId) ||
      !Array.isArray(input.sourceFiles) || input.sourceFiles.length === 0 ||
      !Array.isArray(input.events) || input.events.length < (options.allowLive && input.schemaVersion === 2 ? 1 : 2)) {
    throw new Error('Invalid trace document header')
  }
  const trace = input as unknown as TraceDocument
  const history = historyForTrace(trace, { revalidate: true })
  history.validateDocument(trace)
  const state = history.materialize(trace.events.length)
  if (state.status !== 'ended' && !(trace.schemaVersion === 2 && (state.status === 'aborted' || state.status === 'partial' ||
      options.allowLive && state.status === 'running'))) throw new Error('Trace must end with PROGRAM_END, v2 PROGRAM_ABORT or CAPTURE_STOP')
  return trace
}
