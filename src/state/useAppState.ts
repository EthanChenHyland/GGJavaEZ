import type { TraceDocument } from '../contracts/runtime'
import { useMemo } from 'react'
import { deriveAppState, type ExecutionDimensions } from './appState'
import type { useWorkspace } from '../workspace/useWorkspace'

/** Bridge lifecycle facts are reconciled independently of semantic publication. */
export function executionDimensions(workspace: Pick<ReturnType<typeof useWorkspace>, 'execution' | 'visualization' | 'runtime' | 'timelineLens'>): ExecutionDimensions {
  const session = workspace.execution
  const phase = session?.phase ?? 'IDLE'
  const terminal = ['COMPLETED', 'FAILED', 'STOPPED'].includes(phase)
  const alive = ['RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(phase)
  return {
    attemptId: session?.id ?? null,
    build: phase === 'BUILDING' ? 'building' : phase === 'STARTING' ? 'launching' : session?.failureKind === 'build' ? 'failed' : session?.build?.success ? 'ready' : 'idle',
    instrumentation: session?.failureKind === 'capture' ? 'failed' : session?.recording && session.recording.state !== 'FULL' ? 'stopped' : session?.support === 'RUN_ONLY' ? 'run-only' : alive ? 'recording' : 'pending',
    process: !session || phase === 'IDLE' || phase === 'BUILDING' ? 'none' : terminal ? 'ended' : alive ? 'alive' : phase === 'STARTING' ? 'starting' : 'unknown',
    recording: session?.recording ?? null,
    debugger: session?.kind !== 'debug' ? 'inactive' : terminal ? 'ended' : phase === 'PAUSED' ? 'paused' : 'running',
    input: { available: alive, wait: phase === 'WAITING_FOR_INPUT' ? 'waiting' : alive ? 'not-waiting' : 'unknown' },
    view: { recordingId: workspace.visualization?.trace.demoId ?? null, cursor: workspace.runtime?.cursor ?? 0, liveHead: workspace.visualization?.trace.events.length ?? 0, lens: workspace.timelineLens },
  }
}
export function useAppState(workspace: ReturnType<typeof useWorkspace>, focusTargetId: string | null, recording?: TraceDocument) {
  const { execution: session, visualization, runtime, timelineLens, debugSession } = workspace
  return useMemo(() => {
    const dimensions = executionDimensions({ execution: session, visualization, runtime, timelineLens })
    if (recording) return deriveAppState({ session: null, sessionEventCount: 0, dimensions: { ...dimensions, view: { ...dimensions.view, recordingId: recording.demoId, cursor: runtime?.cursor ?? 0, liveHead: recording.events.length } }, debug: null, world: { origin: 'recording', eventCount: recording.events.length, cursor: runtime?.cursor ?? 0, lens: 'HISTORY' }, focusTargetId, recordingViewer: { status: recording.events.at(-1)?.type === 'CAPTURE_STOP' ? (recording.events.at(-1) as Extract<typeof recording.events[number], { type: 'CAPTURE_STOP' }>).recording : { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false }, ended: true } })
    const current = visualization?.sessionId === session?.id
    return deriveAppState({ session, sessionEventCount: current ? dimensions.view.liveHead : 0, dimensions,
      debug: debugSession ? {status: debugSession.status, pause: debugSession.pause} : null,
      world: { origin: !visualization ? 'none' : current ? 'session' : 'prior', eventCount: dimensions.view.liveHead, cursor: dimensions.view.cursor, lens: timelineLens },
      focusTargetId, recordingViewer: null,
    })
  }, [session, visualization, runtime, timelineLens, debugSession, focusTargetId, recording])
}
