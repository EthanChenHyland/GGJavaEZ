import type { BuildResult } from '../ide/contracts'
import type { RecordingStatus, RawRuntimeEvent, VisualizationTerminalStatus } from '../instrumentation/contracts'
import type { InstrumentationSourceManifest } from '../instrumentation/normalize'

/** Control metadata only. All variables/objects are reconstructed from rawEvents. */
export interface SourceBreakpoint { fileId: string; line: number }
export interface ResolvedBreakpoint extends SourceBreakpoint {
  status: 'pending' | 'verified' | 'non_executable' | 'unresolved'
  reason: string | null
}
export type DebugCommand = 'continue' | 'pause' | 'stepOver' | 'stepInto' | 'stepOut' | 'stop'
export interface DebugPause {
  reason: 'breakpoint' | 'step' | 'pause' | 'exception' | 'entry'
  threadId: string
  frameId: string
  className: string
  methodName: string
  line: number
  rawEventCount: number
}
export interface DebugSession {
  sessionId: string
  projectId: string
  revision: number
  status: 'starting' | 'running' | 'paused' | 'exited' | 'stopped' | 'failed'
  pause: DebugPause | null
  breakpoints: ResolvedBreakpoint[]
  rawEvents: RawRuntimeEvent[]
  sourceManifest: InstrumentationSourceManifest
  build: BuildResult
  stdout: string
  stderr: string
  exitCode: number | null
  terminalStatus: VisualizationTerminalStatus | null
  diagnostic: string | null
  recording?: RecordingStatus
  waitingForInput?: boolean
  outputTruncated?: boolean
  outputArchiveAvailable?: boolean
  outputArchiveError?: string | null
}
