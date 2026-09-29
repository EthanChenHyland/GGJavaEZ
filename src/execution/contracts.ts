import type { BuildResult, RunEvent, SourceLocation } from '../ide/contracts'
import type { RawRuntimeEvent, VisualizationCapabilityReport, VisualizationTerminalStatus } from '../instrumentation/contracts'
import type { InstrumentationSourceManifest } from '../instrumentation/normalize'
import type { DebugPause, ResolvedBreakpoint, SourceBreakpoint } from '../debugger/contracts'

/** The bridge owns one current process/session. View state is deliberately separate. */
export type ExecutionPhase = 'IDLE' | 'BUILDING' | 'STARTING' | 'RUNNING' | 'WAITING_FOR_INPUT' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'STOPPED'
export type ExecutionKind = 'run' | 'debug'
export type VisualizationSupport = 'FULL' | 'PARTIAL' | 'RUN_ONLY'
export type TimelineLens = 'LIVE' | 'HISTORY'

export interface ExecutionSession {
  id: string
  revision: number
  projectId: string
  mainClass: string | null
  kind: ExecutionKind
  phase: ExecutionPhase
  support: VisualizationSupport
  supportReason: string | null
  build: BuildResult | null
  rawEvents: RawRuntimeEvent[]
  sourceManifest: InstrumentationSourceManifest
  capability: VisualizationCapabilityReport | null
  /** Recorder console writes share rawEvents' sequence. These are process-pipe facts with unknown cross-channel order. */
  stdout: string
  stderr: string
  /** Present only for the non-instrumented escape/fallback path. */
  runEvents: RunEvent[]
  pause: DebugPause | null
  breakpoints: ResolvedBreakpoint[]
  terminalStatus: VisualizationTerminalStatus | null
  exitCode: number | null
  diagnostic: string | null
  failureKind: 'build' | 'launch' | 'runtime' | 'capture' | null
  /** A complete prefix is retained through stop/failure; only COMPLETED has a success end marker. */
  startedAt: string
}

export interface StartExecutionRequest {
  kind: ExecutionKind
  mainClass: string
  workingDirectory?: string
  programArgs?: string[]
  jvmArgs?: string[]
  breakpoints?: SourceBreakpoint[]
  /** Advanced escape hatch; never the default Run behavior. */
  withoutVisualization?: boolean
}

export interface ExecutionViewState {
  sessionId: string | null
  lens: TimelineLens
  cursor: number
  liveCursor: number
  selectedSource: SourceLocation | null
}
