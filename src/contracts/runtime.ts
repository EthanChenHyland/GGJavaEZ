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
  returnValue?: ScalarValue
}

export interface ReturnTransfer {
  eventId: EventId
  frameId: FrameId
  destination: { frameId: FrameId; slotId: SlotId } | null
  value: ScalarValue
  expression?: string
}

export interface RuntimeArray {
  elementType: 'int'
  length: number
  elements: RuntimeSlot[]
}

export type ArrayValueOrigin = { kind: 'element'; index: number } | { kind: 'slot'; frameId: FrameId; slotId: SlotId }
export interface ArrayMutation {
  eventId: EventId
  objectId: ObjectId
  index: number
  before: ScalarValue
  after: ScalarValue
  /** Absent when the JVM store operand has no provable named origin. */
  from?: ArrayValueOrigin
}
export type ArrayActivity =
  | { kind: 'read'; eventId: EventId; objectId: ObjectId; index: number; value: ScalarValue; destinationSlotId?: SlotId }
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
  status: 'ready' | 'running' | 'ended' | 'aborted'
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
  | { type: 'INPUT_READ'; frameId: FrameId; readerObjectId: ObjectId; method: 'nextInt'; inputIndex: number; destinationSlotId: SlotId; value: ScalarValue; text: string }
  | { type: 'OUTPUT_WRITE'; frameId: FrameId; value: ScalarValue; text: string; originSlotId?: SlotId }
  | { type: 'CONSOLE_WRITE'; frameId: FrameId | null; channel: 'stdout' | 'stderr'; text: string }
  | { type: 'PROGRAM_START' }
  | { type: 'PROGRAM_END' }
  | { type: 'PROGRAM_ABORT'; reason: 'program_crashed' | 'instrumentation_failed' | 'limit_exceeded' | 'unsupported'; message: string }
  | { type: 'LINE_EXECUTE'; frameId: FrameId }
  | { type: 'ENTER_METHOD'; frameId: FrameId; callerFrameId: FrameId | null; className: string; methodName: string; locals: RuntimeSlot[]; invocationLabel?: string; returnType?: string }
  | { type: 'EXIT_METHOD'; frameId: FrameId }
  | { type: 'RETURN_VALUE'; frameId: FrameId; value: ScalarValue; destination: ReturnTransfer['destination']; expression?: string }
  | { type: 'DECLARE_LOCAL'; frameId: FrameId; slot: RuntimeSlot }
  | { type: 'REMOVE_LOCAL'; frameId: FrameId; slotId: SlotId }
  | { type: 'ALLOCATE_ARRAY'; objectId: ObjectId; displayId: number; elementType: 'int'; elements: ScalarValue[] }
  | { type: 'ARRAY_READ'; frameId: FrameId; objectId: ObjectId; index: number; value: ScalarValue; destinationSlotId?: SlotId }
  | { type: 'ARRAY_COMPARE'; frameId: FrameId; objectId: ObjectId; indices: readonly [number, number]; values: readonly [ScalarValue, ScalarValue]; operator: '>'; result: boolean }
  | { type: 'ARRAY_WRITE'; frameId: FrameId; objectId: ObjectId; index: number; value: ScalarValue; from?: ArrayValueOrigin }
  | { type: 'ASSIGN_LOCAL'; frameId: FrameId; slotId: SlotId; value: ScalarValue }
  | { type: 'ALLOCATE_OBJECT'; objectId: ObjectId; displayId: number; className: string; fields: RuntimeSlot[] }
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
