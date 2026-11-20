import type { DebugPause, DebugSession } from '../debugger/contracts'
import type { ExecutionSession, TimelineLens } from '../execution/contracts'
import type { RecordingStatus } from '../instrumentation/contracts'

export type ExecutionState = 'EDIT' | 'BUILDING' | 'RUNNING' | 'WAITING_INPUT' | 'DEBUG_PAUSED' | 'COMPLETED' | 'FAILED' | 'PARTIAL_RECORDING'
export type Overlay = 'HISTORY' | 'FOCUS'
export type FailureKind = 'compile' | 'build' | 'instrumentation' | 'launch' | 'uncaught-exception'
export type Termination = { kind: 'exit'; exitCode: number; durationMs: number } | { kind: 'user-stop'; durationMs: number }
export type WorldOrigin = 'none' | 'session' | 'prior' | 'recording'
/** Glyph identifiers only; the Shell owns their rendering. */
export type AppStateIcon = 'pencil' | 'loader-circle' | 'play' | 'terminal' | 'pause' | 'circle-check' | 'triangle-alert' | 'circle-dashed'

export interface ExecutionDimensions {
  attemptId: string | null
  build: 'idle' | 'building' | 'launching' | 'failed' | 'ready'
  instrumentation: 'pending' | 'recording' | 'stopped' | 'run-only' | 'failed'
  process: 'unknown' | 'starting' | 'alive' | 'ended' | 'none'
  recording: RecordingStatus | null
  debugger: 'inactive' | 'running' | 'paused' | 'ended'
  input: { available: boolean; wait: 'waiting' | 'not-waiting' | 'unknown' }
  view: { recordingId: string | null; cursor: number; liveHead: number; lens: TimelineLens }
}

export interface AppStateInputs {
  session: Pick<ExecutionSession, 'id' | 'kind' | 'phase' | 'support' | 'supportReason' | 'failureKind' | 'exitCode'
    | 'terminalStatus' | 'recording' | 'build' | 'diagnostic' | 'durationMs'> | null
  /** Normalized events ingested for session; never a raw recorder sequence. */
  sessionEventCount: number
  dimensions: ExecutionDimensions
  debug: { status: DebugSession['status']; pause: DebugPause | null } | null
  world: { origin: WorldOrigin; eventCount: number; cursor: number; lens: TimelineLens }
  focusTargetId: string | null
  recordingViewer: { status: RecordingStatus; ended: boolean } | null
}

export interface AppState {
  execution: ExecutionState
  overlays: readonly Overlay[]
  failure: FailureKind | null
  termination: Termination | null
  partial: Pick<RecordingStatus, 'state' | 'reason' | 'budget' | 'lastRecordedSeq'> | null
  worldOrigin: WorldOrigin
  dimensions: ExecutionDimensions
  badges: readonly string[]
  label: string
  icon: AppStateIcon
}

const icons: Readonly<Record<ExecutionState, AppStateIcon>> = {
  EDIT: 'pencil', BUILDING: 'loader-circle', RUNNING: 'play', WAITING_INPUT: 'terminal',
  DEBUG_PAUSED: 'pause', COMPLETED: 'circle-check', FAILED: 'triangle-alert', PARTIAL_RECORDING: 'circle-dashed',
}
const names: Readonly<Record<ExecutionState, string>> = {
  EDIT: 'Edit', BUILDING: 'Building', RUNNING: 'Running', WAITING_INPUT: 'Waiting for input',
  DEBUG_PAUSED: 'Debug paused', COMPLETED: 'Completed', FAILED: 'Failed', PARTIAL_RECORDING: 'Partial recording',
}

function compilerErrorCount(session: AppStateInputs['session']): number {
  return session?.build?.diagnostics.filter((diagnostic) => diagnostic.severity === 'error' && diagnostic.provider !== 'language').length ?? 0
}

function failureOf(session: NonNullable<AppStateInputs['session']>, dimensions: ExecutionDimensions): FailureKind {
  switch (session.failureKind) {
    case 'build': return compilerErrorCount(session) > 0 ? 'compile' : 'build'
    case 'capture': return 'instrumentation'
    case 'runtime': return 'uncaught-exception'
    case 'launch': return 'launch'
    case null:
      // Reconciled failure facts are preferred to interpreting diagnostic/stderr text.
      if (session.terminalStatus === 'program_crashed') return 'uncaught-exception'
      if (dimensions.build === 'failed') return compilerErrorCount(session) > 0 ? 'compile' : 'build'
      if (dimensions.instrumentation === 'failed' || session.terminalStatus === 'instrumentation_failed') return 'instrumentation'
      return 'launch'
  }
}

function terminationOf(inputs: AppStateInputs): Termination | null {
  const session = inputs.session, durationMs = session?.durationMs
  if (!session || typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0
    || !['STOPPED', 'COMPLETED', 'FAILED'].includes(session.phase)) return null
  if (session.phase === 'STOPPED') return { kind: 'user-stop', durationMs }
  return session.exitCode === null ? null : { kind: 'exit', exitCode: session.exitCode, durationMs }
}

/** Pure display projection. Operational command decisions must use dimensions instead. */
export function deriveAppState(inputs: AppStateInputs): AppState {
  const { session, dimensions, debug, world, recordingViewer } = inputs
  const recording = session === null && recordingViewer
    ? recordingViewer.status : dimensions.recording ?? session?.recording ?? null
  const partial: AppState['partial'] = recording && recording.state !== 'FULL'
    ? { state: recording.state, reason: recording.reason, budget: recording.budget, lastRecordedSeq: recording.lastRecordedSeq }
    : null
  const terminal = session !== null && ['FAILED', 'COMPLETED', 'STOPPED'].includes(session.phase)
  const paused = dimensions.debugger === 'paused' || debug?.status === 'paused'
  const waiting = dimensions.process === 'alive' && dimensions.input.available && dimensions.input.wait === 'waiting'
  let execution: ExecutionState
  let failure: FailureKind | null = null

  if (session === null && recordingViewer) execution = partial ? 'PARTIAL_RECORDING' : 'COMPLETED'
  else if (session === null || session.phase === 'IDLE') execution = 'EDIT'
  else if (!terminal && !paused && !waiting && (
    dimensions.build === 'building' || dimensions.build === 'launching' || dimensions.process === 'starting'
  )) execution = 'BUILDING'
  else if (session.phase === 'FAILED') {
    execution = 'FAILED'
    failure = failureOf(session, dimensions)
  } else if (terminal && session.terminalStatus === 'program_crashed' && session.phase !== 'STOPPED') {
    execution = 'FAILED'
    failure = 'uncaught-exception'
  } else if (session.phase === 'STOPPED') execution = 'COMPLETED'
  else if (session.phase === 'COMPLETED') execution = partial ? 'PARTIAL_RECORDING' : 'COMPLETED'
  else if (paused) execution = 'DEBUG_PAUSED'
  else if (waiting) execution = 'WAITING_INPUT'
  else if (partial) execution = 'PARTIAL_RECORDING'
  // Pending/unresolved bridge facts must not manufacture a terminal state.
  else execution = 'RUNNING'

  const termination = terminationOf(inputs)
  const overlays: Overlay[] = []
  // The presented World can belong to a prior attempt; use its normalized prefix.
  if (world.eventCount > 0 && world.cursor < world.eventCount) overlays.push('HISTORY')
  if (inputs.focusTargetId !== null) overlays.push('FOCUS')

  const badges: string[] = []
  if (partial) badges.push(partial.reason ? `Partial recording · ${partial.reason}` : 'Partial recording')
  if ((dimensions.process ?? 'unknown') === 'unknown') badges.push('Process liveness unknown')
  if (partial && dimensions.process === 'alive') badges.push('Process alive')
  if (execution === 'RUNNING' && dimensions.process === 'alive' && inputs.sessionEventCount === 0
    && dimensions.instrumentation !== 'run-only' && session?.support !== 'RUN_ONLY') badges.push('Waiting for recording')

  let label = names[execution]
  if (execution === 'FAILED') {
    if (failure === 'compile') label = `Build failed · ${compilerErrorCount(session)} errors`
    else if (failure === 'build') label = 'Build failed'
    else if (failure === 'instrumentation') label = 'Instrumentation failed'
    else if (failure === 'launch') label = 'Launch failed'
    else label = 'Failed · Uncaught exception'
  } else if (execution === 'PARTIAL_RECORDING' && partial?.reason) label += ` · ${partial.reason}`
  else if (execution === 'COMPLETED' && termination) {
    label += ` · ${(termination.durationMs / 1000).toFixed(2)} s · ${termination.kind === 'user-stop' ? 'Stopped by user' : `Exit code ${termination.exitCode}`}`
  } else if (execution === 'COMPLETED' && session?.phase === 'STOPPED') label += ' · Stopped by user'
  for (const overlay of overlays) label += ` · ${overlay === 'HISTORY' ? 'History' : 'Focus'}`

  return { execution, overlays, failure, termination, partial, worldOrigin: world.origin, dimensions, badges, label, icon: icons[execution] }
}

// Keep the design's state-module entry point without introducing a store dependency.
export { runCommandAvailability } from './runAvailability'
