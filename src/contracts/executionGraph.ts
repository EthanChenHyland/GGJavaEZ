import type { RuntimeValue, SourceLocation } from './runtime'

/** JVM producer recipes. Local identity is a debug slot/live range, never a name. */
export type ValueOrigin =
  | { kind: 'unknown' }
  | { kind: 'local'; slotId: string }
  | { kind: 'constant'; value: RuntimeValue }
  | { kind: 'call_result' | 'field_read' | 'array_read' | 'new'; site: number }
  | { kind: 'computed'; site: number; opcode: number; inputs: ValueOrigin[] }
export type Evidence = 'observed' | 'bytecode-derived' | 'unknown'
export interface MethodIdentity { owner: string; name: string; descriptor: string }
export interface ExecutionSite extends MethodIdentity {
  frameId: string | null
  site: number | null
  rawSeq: number
  source: SourceLocation | null
}
export interface GraphValue {
  id: string
  value: RuntimeValue
  kind: 'observed' | 'literal' | 'computed' | 'unknown' | 'return' | 'input'
  eventId: string
  context: ExecutionSite
  opcode?: number
}
export interface GraphStorage {
  id: string
  kind: 'variable' | 'field' | 'array-element'
  ownerId: string
  name: string
  javaType: string
  valueId?: string
  writerInvocationId?: string
}
export interface GraphInvocation {
  id: string
  method: MethodIdentity
  callerInvocationId: string | null
  /** Nearest observed project ancestor; a library boundary may intervene. */
  observedAncestorInvocationId?: string
  callId?: string
  receiverObjectId?: string
  parameterIds: string[]
  returnValueId?: string
  status: 'active' | 'returned' | 'unwound'
  enteredAt: string
  completedAt?: string
}
export interface GraphCall {
  id: string
  callerInvocationId: string | null
  declared: MethodIdentity
  invokeKind: 'static' | 'virtual' | 'interface' | 'special' | 'dynamic'
  context: ExecutionSite
  receiverValueId?: string
  argumentValueIds: string[]
  /** Exact source slot for a direct bytecode load; null for literals/computation. */
  argumentOriginSlotIds: Array<string | null>
  receiverOriginSlotId?: string
  calleeInvocationId?: string
  resultValueId?: string
  status: 'pending' | 'returned' | 'threw'
}
export interface GraphObject { id: string; className: string; allocatedAt: string; constructedAt?: string }
export interface GraphIO {
  id: string
  kind: 'input-bytes' | 'input-consume' | 'output'
  channel: 'stdin' | 'stdout' | 'stderr'
  text: string
  callId?: string
  valueId?: string
  eventId: string
  context: ExecutionSite
}
export type GraphEdgeKind = 'CALL' | 'ARGUMENT_BIND' | 'RECEIVER_BIND' | 'RETURN' | 'ASSIGN' | 'FIELD_WRITE' | 'FIELD_READ' | 'ARRAY_WRITE' | 'ARRAY_READ' | 'REFERENCE_BIND' | 'INPUT_CONSUME' | 'OUTPUT' | 'THROW' | 'UNWIND' | 'CATCH' | 'COMPUTE' | 'CONSTRUCT' | 'OBSERVE'
export interface GraphEdge {
  id: string
  kind: GraphEdgeKind
  from: string
  to: string
  eventId: string
  evidence: Evidence
  context: ExecutionSite
  /** Dynamic value version remains from; this records the exact named load, if proved. */
  originSlotId?: string
}
/** Semantic graph roots share the same immutable snapshot lifetime as RuntimeState. */
export interface ExecutionGraph {
  invocations: Record<string, GraphInvocation>
  calls: Record<string, GraphCall>
  values: Record<string, GraphValue>
  storage: Record<string, GraphStorage>
  objects: Record<string, GraphObject>
  io: Record<string, GraphIO>
  edges: GraphEdge[]
  incoming: Record<string, number[]>
  outgoing: Record<string, number[]>
  /** Dynamic producer indexes scoped by invocation and original instruction site. */
  results: Record<string, string>
  reads: Record<string, string>
  observationEndedAt?: string
}
export interface ObservedBinding { slotId: string; name: string; javaType: string; value: RuntimeValue }
export type ExecutionFact = { context: ExecutionSite } & (
  | { kind: 'call'; callId: string; declared: MethodIdentity; invokeKind: GraphCall['invokeKind']; receiver: RuntimeValue | null; arguments: RuntimeValue[]; argumentOrigins: ValueOrigin[]; receiverOrigin: ValueOrigin }
  | { kind: 'call-return'; callId: string; value: RuntimeValue; inputText?: string }
  | { kind: 'enter'; invocationId: string; callerInvocationId: string | null; method: MethodIdentity; callId?: string; receiver: RuntimeValue | null; parameters: ObservedBinding[] }
  | { kind: 'receiver-ready'; invocationId: string; receiver: RuntimeValue; slotId: string }
  | { kind: 'write'; target: Omit<GraphStorage, 'valueId' | 'writerInvocationId'>; value: RuntimeValue; origin: ValueOrigin }
  | { kind: 'read'; target: Omit<GraphStorage, 'valueId' | 'writerInvocationId'>; value: RuntimeValue; origin: ValueOrigin }
  | { kind: 'return'; invocationId: string; value: RuntimeValue; origin: ValueOrigin }
  | { kind: 'exit' | 'unwind'; invocationId: string; exceptionId?: string }
  | { kind: 'object'; objectId: string; className: string; fields: ObservedBinding[] }
  | { kind: 'constructed'; objectId: string; className: string; newSite?: number }
  | { kind: 'io'; channel: 'stdin' | 'stdout' | 'stderr'; text: string; callId?: string }
  | { kind: 'throw' | 'catch'; invocationId: string; exceptionId: string; callId?: string; className?: string }
)
