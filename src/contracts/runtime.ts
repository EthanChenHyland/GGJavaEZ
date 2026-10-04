import type { ExecutionFact, ExecutionGraph } from './executionGraph'
import type { RecordingStatus } from '../instrumentation/contracts'

/** Trace and runtime truth. No positions, camera state, or animation state belong here. */
export type EventId = string
export type FrameId = string
export type ObjectId = string
export type SlotId = string
export type ReferenceId = string
export type ScopeId = string

export type SourceLocation = { fileId: string; line: number }

export type RuntimeValue =
  | { kind: 'uninitialized' }
  | { kind: 'unavailable'; reason: string; javaType?: string }
  | { kind: 'null' }
  | { kind: 'primitive'; javaType: 'int' | 'boolean' | 'double' | 'long' | 'float' | 'short' | 'byte' | 'char'; value: number | boolean | string }
  | { kind: 'stringSummary'; javaType: 'String'; value: string }
  | { kind: 'reference'; javaType: string; objectId: ObjectId }

export type ScalarValue = Exclude<RuntimeValue, { kind: 'reference' }>

export interface RuntimeSlot {
  id: SlotId
  name: string
  javaType: string
  value: RuntimeValue
  /** Expression operands are VM evaluation slots, not invented Java locals. */
  role?: 'local' | 'parameter' | 'operand' | 'return'
  scopeId?: ScopeId
  synthetic?: 'outer' | 'compiler'
  declaringClass?: string
  static?: boolean
  observedAt?: EventId
  changedAt?: EventId
}

export interface RuntimeTypeMetadata {
  ownership: 'PROJECT' | 'LIBRARY' | 'JDK' | 'SYNTHETIC'
  runtimeType: string
  packageName: string
  synthetic?: boolean
  record?: boolean
  enum?: boolean
  components?: Array<{ name: string; javaType: string }>
}
export interface RuntimeLibrarySummary {
  kind: 'LIST' | 'SET' | 'MAP' | 'QUEUE' | 'DEQUE' | 'BOXED' | 'OPAQUE'
  size?: number
  order?: 'index' | 'iteration' | 'unordered' | 'sorted' | 'fifo'
  items?: RuntimeValue[]
  entries?: Array<{ key: RuntimeValue; value: RuntimeValue }>
  value?: RuntimeValue
  truncated?: boolean
  reason?: string
}
export interface RuntimeClass {
  id: string
  className: string
  statics: Record<SlotId, RuntimeSlot>
  initialization: 'started' | 'completed' | 'observed'
  observedAt: EventId
  initializedAt?: EventId
  metadata?: RuntimeTypeMetadata
}

export interface RuntimeFrame {
  id: FrameId
  callerFrameId: FrameId | null
  className: string
  methodName: string
  depth: number
  status: 'active' | 'returned' | 'unwound'
  locals: Record<SlotId, RuntimeSlot>
  enteredAt: EventId
  exitedAt?: EventId
  invocationLabel?: string
  returnType?: string
  returnValue?: RuntimeValue
}

export interface ReturnTransfer {
  eventId: EventId
  frameId: FrameId
  destination: { frameId: FrameId; slotId: SlotId } | null
  value: RuntimeValue
  expression?: string
}

export interface RuntimeArray {
  elementType: string
  length: number
  elements: RuntimeSlot[]
  truncated?: boolean
  /** Observed cells outside a bounded initial prefix; no invented unknown prefix. */
  sparseElements?: Record<string, RuntimeSlot>
}

export type ArrayValueOrigin = { kind: 'element'; index: number } | { kind: 'slot'; frameId: FrameId; slotId: SlotId }
export interface ArrayMutation {
  eventId: EventId
  objectId: ObjectId
  index: number
  before: RuntimeValue
  after: RuntimeValue
  /** Absent when the JVM store operand has no provable named origin. */
  from?: ArrayValueOrigin
}
export type ArrayActivity =
  | { kind: 'read'; eventId: EventId; objectId: ObjectId; index: number; value: RuntimeValue; destinationSlotId?: SlotId }
  | { kind: 'compare'; eventId: EventId; objectId: ObjectId; indices: readonly [number, number]; values: readonly [ScalarValue, ScalarValue]; operator: '>'; result: boolean }
  | ({ kind: 'write' } & ArrayMutation)

export function arrayElementSlotId(objectId: ObjectId, index: number): SlotId { return `${objectId}:element:${index}` }

export interface RuntimeObject {
  id: ObjectId
  displayId: number
  className: string
  fields: Record<SlotId, RuntimeSlot>
  allocatedAt: EventId
  array?: RuntimeArray
  metadata?: RuntimeTypeMetadata
  library?: RuntimeLibrarySummary
  string?: { value: string; length: number; truncated: boolean }
  observedAt?: EventId
}

export interface RuntimeScope {
  id: ScopeId
  frameId: FrameId
  parentId: ScopeId | null
  label: string
  depth: number
  status: 'active' | 'closed'
  enteredAt: EventId
  exitedAt?: EventId
}
export interface VariableLifetime {
  slot: RuntimeSlot
  frameId: FrameId
  scopeId: ScopeId
  declaredAt: EventId
  source: SourceLocation | null
  lastChangedAt: EventId
  exitedAt?: EventId
}
export interface ConditionOperand { label: string; value: ScalarValue; slotId?: SlotId }
export interface RuntimeCondition {
  eventId: EventId
  frameId: FrameId
  conditionId: string
  kind: 'branch' | 'loop'
  expression: string
  operands: readonly [ConditionOperand, ConditionOperand]
  operator: '<' | '>' | '<=' | '=='
  result: boolean
  takenLabel: string
  skippedLabel: string
}
export interface RuntimeLoop {
  eventId: EventId
  frameId: FrameId
  loopId: string
  iteration: number
  status: 'running' | 'ended'
}
export interface ConsoleEntry {
  eventId: EventId
  frameId: FrameId | null
  source: SourceLocation | null
  kind: 'input' | 'output'
  text: string
  value: ScalarValue
  destinationSlotId?: SlotId
  readerObjectId?: ObjectId
  channel?: 'stdout' | 'stderr'
}

export interface RuntimeExceptionFact {
  eventId: EventId
  exceptionId: ObjectId
  className: string
  message: string | null
  explicit: boolean
  source: SourceLocation | null
  frameIds: FrameId[]
  caughtBy?: FrameId
  unwoundFrameIds: FrameId[]
  finallyFrameIds?: FrameId[]
}

export interface RuntimeBranchFact {
  eventId: EventId
  frameId: FrameId
  opcode: number
  site: number
  left: ScalarValue
  right?: ScalarValue
  taken: boolean
}

export interface RuntimeState {
  /** Number of events already applied: 0 is ready, N is after the last event. */
  cursor: number
  status: 'ready' | 'running' | 'ended' | 'aborted' | 'partial'
  currentSource: SourceLocation | null
  lastEventId: EventId | null
  activeFrameIds: FrameId[]
  frames: Record<FrameId, RuntimeFrame>
  objects: Record<ObjectId, RuntimeObject>
  returns: ReturnTransfer[]
  arrayActivity: ArrayActivity | null
  arrayMutations: ArrayMutation[]
  scopes: Record<ScopeId, RuntimeScope>
  variableLifetimes: VariableLifetime[]
  conditions: Record<FrameId, RuntimeCondition>
  loops: Record<string, RuntimeLoop>
  console: ConsoleEntry[]
  exceptions: RuntimeExceptionFact[]
  branch: RuntimeBranchFact | null
  abortReason: string | null
  recordingStop?: RecordingStatus
  executionGraph?: ExecutionGraph
  /** Actual per-declaring-class static storage, separate from heap instances. */
  classes?: Record<string, RuntimeClass>
}

export type SlotOwner =
  | { kind: 'frame'; frameId: FrameId; slotId: SlotId }
  | { kind: 'object'; objectId: ObjectId; slotId: SlotId }

export interface TraceEventBase {
  eventId: EventId
  seq: number
  source: SourceLocation | null
  label: string
  importance: 'quiet' | 'normal' | 'major'
  /** Actual recorder thread; absent on curated fixtures. */
  threadId?: string
}

export type TraceEvent = TraceEventBase & (
  | { type: 'ENTER_SCOPE'; frameId: FrameId; scopeId: ScopeId; parentId: ScopeId | null; labelScope: string }
  | { type: 'EXIT_SCOPE'; frameId: FrameId; scopeId: ScopeId }
  | ({ type: 'EVALUATE_CONDITION' } & Omit<RuntimeCondition, 'eventId'>)
  | ({ type: 'LOOP_ITERATION' } & Omit<RuntimeLoop, 'eventId'>)
  | { type: 'INPUT_READ'; frameId: FrameId; readerObjectId: ObjectId; method: string; inputIndex: number; destinationSlotId: SlotId; value: ScalarValue; text: string }
  | { type: 'OUTPUT_WRITE'; frameId: FrameId; value: ScalarValue; text: string; originSlotId?: SlotId }
  | { type: 'CONSOLE_WRITE'; frameId: FrameId | null; channel: 'stdout' | 'stderr'; text: string }
  | { type: 'CONSOLE_INPUT'; frameId: FrameId | null; text: string }
  | { type: 'EXECUTION_FACT'; fact: ExecutionFact }
  | { type: 'CLASS_OBSERVE'; classId: string; className: string; fields: RuntimeSlot[]; initialization: RuntimeClass['initialization']; metadata?: RuntimeTypeMetadata }
  | { type: 'SET_STATIC'; classId: string; slotId: SlotId; value: RuntimeValue }
  | { type: 'OBJECT_OBSERVE'; objectId: ObjectId; fields?: RuntimeSlot[]; replaceFields?: boolean; arrayElements?: Array<{ index: number; value: RuntimeValue }>; library?: RuntimeLibrarySummary; string?: RuntimeObject['string']; metadata?: RuntimeTypeMetadata }
  | { type: 'PROGRAM_START' }
  | { type: 'PROGRAM_END' }
  | { type: 'CAPTURE_STOP'; recording: RecordingStatus }
  | { type: 'PROGRAM_ABORT'; reason: 'program_crashed' | 'instrumentation_failed' | 'limit_exceeded' | 'unsupported'; message: string }
  | { type: 'LINE_EXECUTE'; frameId: FrameId }
  | { type: 'ENTER_METHOD'; frameId: FrameId; callerFrameId: FrameId | null; className: string; methodName: string; locals: RuntimeSlot[]; invocationLabel?: string; returnType?: string }
  | { type: 'EXIT_METHOD'; frameId: FrameId }
  | { type: 'RETURN_VALUE'; frameId: FrameId; value: RuntimeValue; destination: ReturnTransfer['destination']; expression?: string }
  | { type: 'DECLARE_LOCAL'; frameId: FrameId; slot: RuntimeSlot }
  | { type: 'REMOVE_LOCAL'; frameId: FrameId; slotId: SlotId }
  | { type: 'ALLOCATE_ARRAY'; objectId: ObjectId; displayId: number; elementType: string; elements: RuntimeValue[]; length?: number; truncated?: boolean; metadata?: RuntimeTypeMetadata; observed?: boolean }
  | { type: 'ARRAY_READ'; frameId: FrameId; objectId: ObjectId; index: number; value: RuntimeValue; destinationSlotId?: SlotId; observed?: boolean }
  | { type: 'ARRAY_COMPARE'; frameId: FrameId; objectId: ObjectId; indices: readonly [number, number]; values: readonly [ScalarValue, ScalarValue]; operator: '>'; result: boolean }
  | { type: 'ARRAY_WRITE'; frameId: FrameId; objectId: ObjectId; index: number; value: RuntimeValue; from?: ArrayValueOrigin }
  | { type: 'ASSIGN_LOCAL'; frameId: FrameId; slotId: SlotId; value: ScalarValue }
  | { type: 'ALLOCATE_OBJECT'; objectId: ObjectId; displayId: number; className: string; fields: RuntimeSlot[]; metadata?: RuntimeTypeMetadata }
  | { type: 'SET_FIELD'; objectId: ObjectId; slotId: SlotId; value: ScalarValue }
  | { type: 'CREATE_REFERENCE'; sourceSlot: SlotOwner; targetObjectId: ObjectId; javaType: string }
  | { type: 'CLEAR_REFERENCE'; sourceSlot: SlotOwner }
  | { type: 'BRANCH_EVALUATE'; frameId: FrameId; opcode: number; site: number; left: ScalarValue; right?: ScalarValue; taken: boolean }
  | { type: 'THROW_EXCEPTION'; frameId: FrameId; exceptionId: ObjectId; className: string; message: string | null; explicit: boolean }
  | { type: 'UNWIND_EXCEPTION'; frameId: FrameId; exceptionId: ObjectId }
  | { type: 'CATCH_EXCEPTION'; frameId: FrameId; exceptionId: ObjectId }
  | { type: 'FINALLY_ENTER'; frameId: FrameId; exceptionId: ObjectId }
)

export interface TraceDocument {
  schemaVersion: 1 | 2
  demoId: string
  sourceFiles: Array<{ fileId: string; name: string; content: string }>
  events: TraceEvent[]
  capture?: { origin: 'jvm'; sourceHashes: Record<string, string>; recordedAt: string }
}

/** A reference's identity belongs to its named source slot; its target may change. */
export function referenceIdForSlot(slotId: SlotId): ReferenceId {
  return `ref:${slotId}`
}
