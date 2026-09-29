/** Recorder/normalizer boundary. See docs/architecture/M6_TRACE_CONTRACT.md. */
export type RawValue =
  | { kind: 'int' | 'long' | 'float' | 'double' | 'byte' | 'short'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'char'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'null' }
  | { kind: 'ref'; objectId: string; className: string }
  | { kind: 'unsupported'; javaType: string }

export interface RawSourceContext {
  v: 1
  seq: number
  threadId: string
  type: string
  frameId: string | null
  className: string | null
  methodName: string | null
  descriptor: string | null
  line: number | null
  site: number | null
}

export interface RawParameter { slot: number; name: string; descriptor: string; value: RawValue; liveRange: string }
export interface RawField { owner: string; name: string; descriptor: string; value: RawValue }

export type RawRuntimeEvent = RawSourceContext & (
  | { type: 'object'; objectId: string; className: string; fields: RawField[] }
  | { type: 'array'; objectId: string; elementType: 'int'; elements: number[] }
  | { type: 'enter'; frameId: string; callerFrameId: string | null; receiver: RawValue | null; parameters: RawParameter[] }
  | { type: 'line'; frameId: string; line: number }
  | { type: 'local'; frameId: string; slot: number; name: string; descriptor: string; liveRange: string; value: RawValue }
  | { type: 'local_end'; frameId: string; slot: number; liveRange: string }
  | { type: 'field'; frameId: string; objectId: string; owner: string; name: string; descriptor: string; value: RawValue }
  | { type: 'array_read' | 'array_write'; frameId: string; objectId: string; index: number; value: number }
  | { type: 'branch'; frameId: string; opcode: number; site: number; left: RawValue; right?: RawValue; taken: boolean }
  | { type: 'return'; frameId: string; value: RawValue }
  | { type: 'exit'; frameId: string }
  | { type: 'throw'; frameId: string; objectId: string; className: string; message: string | null; explicit: boolean }
  | { type: 'unwind' | 'catch' | 'finally'; frameId: string; objectId: string }
  | { type: 'console'; channel: 'stdout' | 'stderr'; text: string }
  | { type: 'stdin_wait' }
  | { type: 'stdin_read'; text: string }
)

export type VisualizationTerminalStatus = 'complete' | 'program_crashed' | 'instrumentation_failed' | 'limit_exceeded' | 'unsupported'
export type CapabilityStatus = 'supported' | 'partial' | 'unsupported'
export type VisualizationFeature = 'methods' | 'locals' | 'objects' | 'fields' | 'references' | 'intArrays' |
  'arrayReads' | 'arrayWrites' | 'sourceMapping' | 'branches' | 'loops' | 'scopes' | 'returns' | 'exceptions' | 'console'

export interface FeatureCapability {
  status: CapabilityStatus
  reason: string
  observedEvents: number
}

export interface VisualizationCapabilityReport {
  status: CapabilityStatus
  features: Record<VisualizationFeature, FeatureCapability>
  coveredClasses: string[]
  diagnostics: string[]
}

export interface InstrumentedRunRequest {
  projectId: string
  projectRoot: string
  classesDir: string
  mainClass: string
  javaPath: string
  javacPath: string
  sourcePaths: string[]
  rawEventLimit: number
  rawByteLimit: number
  timeoutMs: number
}

export interface InstrumentedRunMetrics {
  transformMs: number
  jvmStartupMs: number
  executionMs: number
  rawBytes: number
  rawEvents: number
  normalizeMs?: number
}

export interface InstrumentedRunResult {
  status: VisualizationTerminalStatus
  exitCode: number | null
  diagnostic: string | null
  rawEvents: RawRuntimeEvent[]
  stdout: string
  stderr: string
  capability: VisualizationCapabilityReport
  metrics: InstrumentedRunMetrics
}
