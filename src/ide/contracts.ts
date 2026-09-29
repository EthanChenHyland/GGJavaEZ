/** Milestone 5 bridge DTOs. The browser never receives host filesystem paths. */
import type { InstrumentedRunMetrics, RawRuntimeEvent, VisualizationCapabilityReport, VisualizationTerminalStatus } from '../instrumentation/contracts'
import type { InstrumentationSourceManifest } from '../instrumentation/normalize'
import type { JavaProject } from './javaProject'
export interface SourceLocation { path: string; line: number; column: number | null }
export interface ProjectSummary { id: string; name: string; createdAt: string }
export interface ProjectEntry { path: string; name: string; kind: 'file' | 'directory'; children?: ProjectEntry[] }
export interface ProjectFile { path: string; content: string; revision: string }
export interface JdkStatus { available: boolean; home: string | null; javaPath: string | null; javacPath: string | null; version: string | null; error: string | null }
export interface CompileDiagnostic { id: string; location: SourceLocation; severity: 'error' | 'warning' | 'note'; message: string; raw: string; provider?: 'language' | 'compiler' }
export interface BuildResult { success: boolean; diagnostics: CompileDiagnostic[]; rawOutput: string; elapsedMs: number; jdk: JdkStatus; mainClasses: string[]; javaProject?: JavaProject }
export interface StackTraceFrame { className: string; methodName: string; fileName: string | null; line: number | null; location: SourceLocation | null; raw: string }
export interface RuntimeException { type: string; message: string; rawStackTrace: string; frames: StackTraceFrame[] }
export interface ExecutionFailure { kind: 'compile' | 'runtime' | 'launch'; message: string; diagnostic: CompileDiagnostic | null; exception: RuntimeException | null; causalTraceId: null }
export interface RunEvent { id: number; kind: 'stdout' | 'stderr' | 'stdin' | 'exit'; text?: string; exitCode?: number | null; signal?: string | null; elapsedMs?: number; exception?: RuntimeException | null }
export interface RunSnapshot { runId: string; projectId: string; mainClass: string; status: 'running' | 'exited'; startedAt: string; events: RunEvent[]; exitCode: number | null; exception: RuntimeException | null }
export interface RunResponse { build: BuildResult; run: RunSnapshot | null }
export interface VisualizeResponse {
  build: BuildResult
  status: VisualizationTerminalStatus | 'compile_failed'
  diagnostic: string | null
  sourceManifest: InstrumentationSourceManifest
  rawEvents: RawRuntimeEvent[]
  capability: VisualizationCapabilityReport | null
  stdout: string
  stderr: string
  exitCode: number | null
  metrics: InstrumentedRunMetrics | null
}
