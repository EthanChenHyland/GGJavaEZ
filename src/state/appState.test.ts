import { describe, expect, it } from 'vitest'
import { deriveAppState, runCommandAvailability, type AppStateInputs, type ExecutionDimensions } from './appState'
import type { RecordingStatus } from '../instrumentation/contracts'

const full: RecordingStatus = { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false }
const partial: RecordingStatus = { state: 'STOPPED_LIMIT', reason: 'Event budget reached', budget: 'events', lastRecordedSeq: 900, executionContinued: true }

function inputs(): AppStateInputs {
  return {
    session: { id: 'attempt-1', kind: 'run', phase: 'RUNNING', support: 'FULL', supportReason: null,
      failureKind: null, exitCode: null, terminalStatus: null, recording: full, build: null,
      diagnostic: null, durationMs: null },
    sessionEventCount: 8,
    dimensions: { attemptId: 'attempt-1', build: 'ready', instrumentation: 'recording', process: 'alive',
      recording: full, debugger: 'inactive', input: { available: true, wait: 'not-waiting' },
      view: { recordingId: 'recording-1', cursor: 8, liveHead: 8, lens: 'LIVE' } },
    debug: null, world: { origin: 'session', eventCount: 8, cursor: 8, lens: 'LIVE' },
    focusTargetId: null, recordingViewer: null,
  }
}

function completed(input = inputs()) {
  input.session!.phase = 'COMPLETED'
  input.session!.exitCode = 0
  input.session!.terminalStatus = 'complete'
  input.dimensions.process = 'ended'
  input.session!.durationMs = 1235
  return input
}

describe('deriveAppState', () => {
  it.each([true, false])('projects a recording viewer without claiming a JVM is running (full=%s)', (isFull) => {
    const input = inputs()
    input.session = null
    input.recordingViewer = { status: isFull ? full : partial, ended: true }
    input.world.origin = 'recording'
    input.dimensions.process = 'none'
    expect(deriveAppState(input)).toMatchObject({ execution: isFull ? 'COMPLETED' : 'PARTIAL_RECORDING', worldOrigin: 'recording', termination: null })
  })

  it.each(['no-session', 'idle'] as const)('shows Edit with %s', (kind) => {
    const input = inputs()
    if (kind === 'no-session') input.session = null
    else input.session!.phase = 'IDLE'
    expect(deriveAppState(input).execution).toBe('EDIT')
  })

  it.each(['building', 'launching'] as const)('shows Building for an active %s attempt and retains prior World origin', (build) => {
    const input = inputs()
    input.dimensions.build = build
    input.dimensions.process = 'starting'
    input.session!.phase = build === 'building' ? 'BUILDING' : 'STARTING'
    input.world = { origin: 'prior', eventCount: 48, cursor: 0, lens: 'HISTORY' }
    expect(deriveAppState(input)).toMatchObject({ execution: 'BUILDING', worldOrigin: 'prior', overlays: ['HISTORY'] })
  })

  it.each([
    ['launch', 'launch'], ['capture', 'instrumentation'], ['runtime', 'uncaught-exception'], ['build', 'build'],
  ] as const)('maps failed session %s to %s without interpreting its diagnostic text', (kind, failure) => {
    const input = inputs()
    input.session!.phase = 'FAILED'
    input.session!.failureKind = kind
    input.session!.diagnostic = 'stderr text that looks like a Java stack trace'
    input.dimensions.process = 'ended'
    expect(deriveAppState(input)).toMatchObject({ execution: 'FAILED', failure })
  })

  it('counts compiler errors, keeps Prior World and never mistakes language diagnostics for compiler errors', () => {
    const input = inputs()
    input.session!.phase = 'FAILED'
    input.session!.failureKind = 'build'
    input.session!.build = {
      success: false, diagnostics: [
        { id: '1', location: { path: 'Main.java', line: 1, column: 1 }, severity: 'error', message: 'missing ;', raw: '', provider: 'compiler' },
        { id: '2', location: { path: 'Main.java', line: 2, column: 1 }, severity: 'error', message: 'bad type', raw: '' },
        { id: '3', location: { path: 'Main.java', line: 3, column: 1 }, severity: 'warning', message: 'warning', raw: '' },
        { id: '4', location: { path: 'Main.java', line: 4, column: 1 }, severity: 'error', message: 'stale draft', raw: '', provider: 'language' },
      ], rawOutput: '', elapsedMs: 25, mainClasses: [],
      jdk: { available: true, home: null, javaPath: null, javacPath: null, version: null, error: null },
    }
    input.world = { origin: 'prior', eventCount: 30, cursor: 12, lens: 'HISTORY' }
    input.focusTargetId = 'previous-object'
    expect(deriveAppState(input)).toMatchObject({ execution: 'FAILED', failure: 'compile', worldOrigin: 'prior', label: 'Build failed · 2 errors · History · Focus' })
  })

  it('retains an actual uncaught failure above pause, wait and partial-recording metadata', () => {
    const input = completed()
    input.session!.terminalStatus = 'program_crashed'
    input.session!.exitCode = 1
    input.dimensions.recording = partial
    input.dimensions.debugger = 'paused'
    input.dimensions.input.wait = 'waiting'
    expect(deriveAppState(input)).toMatchObject({ execution: 'FAILED', failure: 'uncaught-exception', partial: { state: partial.state, lastRecordedSeq: 900 }, termination: { kind: 'exit', exitCode: 1 } })
  })

  it('user stop wins over partial status and stale crash/pause metadata', () => {
    const input = completed()
    input.session!.phase = 'STOPPED'
    input.session!.terminalStatus = 'program_crashed'
    input.dimensions.recording = partial
    input.dimensions.debugger = 'paused'
    const state = deriveAppState(input)
    expect(state).toMatchObject({ execution: 'COMPLETED', failure: null, termination: { kind: 'user-stop', durationMs: 1235 }, partial: { lastRecordedSeq: 900 } })
    expect(state.label).toBe('Completed · 1.24 s · Stopped by user')
  })

  it('ordinary exit keeps partial recording as the primary label and retains the actual exit', () => {
    const input = completed()
    input.dimensions.recording = partial
    input.session!.exitCode = 7
    expect(deriveAppState(input)).toMatchObject({ execution: 'PARTIAL_RECORDING', label: 'Partial recording · Event budget reached', termination: { kind: 'exit', exitCode: 7, durationMs: 1235 } })
  })

  it.each([0, 1, -1, 42])('exit code %s alone never creates an uncaught failure', (exitCode) => {
    const input = completed()
    input.session!.exitCode = exitCode
    expect(deriveAppState(input)).toMatchObject({ execution: 'COMPLETED', failure: null, label: `Completed · 1.24 s · Exit code ${exitCode}` })
  })

  it('pause before the first semantic Event beats startup and input wait, keeping History and Focus', () => {
    const input = inputs()
    input.sessionEventCount = 0
    input.dimensions.build = 'launching'
    input.dimensions.input.wait = 'waiting'
    input.debug = { status: 'paused', pause: null }
    input.dimensions.recording = partial
    input.world = { origin: 'prior', eventCount: 10, cursor: 0, lens: 'HISTORY' }
    input.focusTargetId = 'prior-frame'
    expect(deriveAppState(input)).toMatchObject({ execution: 'DEBUG_PAUSED', overlays: ['HISTORY', 'FOCUS'], worldOrigin: 'prior', badges: ['Partial recording · Event budget reached', 'Process alive'] })
  })

  it('resume recomputes real wait then partial status without losing retained metadata', () => {
    const input = inputs()
    input.dimensions.recording = partial
    input.dimensions.debugger = 'paused'
    input.dimensions.input.wait = 'waiting'
    expect(deriveAppState(input).execution).toBe('DEBUG_PAUSED')
    input.dimensions.debugger = 'running'
    expect(deriveAppState(input).execution).toBe('WAITING_INPUT')
    input.dimensions.input.wait = 'not-waiting'
    expect(deriveAppState(input)).toMatchObject({ execution: 'PARTIAL_RECORDING', partial: { state: 'STOPPED_LIMIT', reason: partial.reason, budget: 'events', lastRecordedSeq: 900 } })
  })

  it.each(['unavailable', 'unknown-wait', 'unknown-process'] as const)('does not infer input wait from %s', (kind) => {
    const input = inputs()
    input.dimensions.input.wait = 'waiting'
    if (kind === 'unavailable') input.dimensions.input.available = false
    if (kind === 'unknown-wait') input.dimensions.input.wait = 'unknown'
    if (kind === 'unknown-process') input.dimensions.process = 'unknown'
    expect(deriveAppState(input).execution).toBe('RUNNING')
  })

  it('an alive zero-event recording waits for observation; Run Only does not', () => {
    const input = inputs()
    input.sessionEventCount = 0
    expect(deriveAppState(input)).toMatchObject({ execution: 'RUNNING', badges: ['Waiting for recording'] })
    input.dimensions.instrumentation = 'run-only'
    expect(deriveAppState(input)).toMatchObject({ execution: 'RUNNING', badges: [] })
    input.dimensions.instrumentation = 'pending'
    input.session!.support = 'RUN_ONLY'
    expect(deriveAppState(input).badges).toEqual([])
  })

  it('missing process reconciliation remains conservative regardless of a friendly session phase', () => {
    const input = completed()
    input.dimensions.process = 'unknown'
    expect(deriveAppState(input)).toMatchObject({ execution: 'COMPLETED', badges: ['Process liveness unknown'] })
    expect(runCommandAvailability(input.dimensions, input.debug).run).toEqual({ enabled: false, reason: 'A session is already active' })
  })

  it('History compares normalized World counts, including cursor zero, rather than raw boundary or another attempt', () => {
    const input = inputs()
    input.dimensions.recording = partial
    input.dimensions.view = { recordingId: 'new-recording', cursor: 100, liveHead: 100, lens: 'LIVE' }
    input.world = { origin: 'prior', cursor: 0, eventCount: 1, lens: 'HISTORY' }
    expect(deriveAppState(input).overlays).toEqual(['HISTORY'])
    input.world.cursor = 1
    input.focusTargetId = 'object'
    expect(deriveAppState(input).overlays).toEqual(['FOCUS'])
    input.world = { origin: 'prior', cursor: 0, eventCount: 0, lens: 'HISTORY' }
    expect(deriveAppState(input).overlays).toEqual(['FOCUS'])
  })

  it('does not guess an exit code, duration or stop time; derivation has no wall-clock dependence', () => {
    const input = completed()
    input.session!.exitCode = null
    expect(deriveAppState(input).termination).toBeNull()
    input.session!.exitCode = 0
    delete input.session!.durationMs
    expect(deriveAppState(input).label).toBe('Completed')
    input.session!.phase = 'STOPPED'
    expect(deriveAppState(input).label).toBe('Completed · Stopped by user')
    input.session!.durationMs = NaN
    expect(deriveAppState(input).termination).toBeNull()
    input.session!.durationMs = -60000
    expect(deriveAppState(input).termination).toBeNull()
  })

  it('does not mutate inputs and ignores extra stderr content', () => {
    const input = inputs()
    const before = structuredClone(input)
    const original = deriveAppState(input)
    expect(input).toEqual(before)
    expect(deriveAppState(structuredClone(input))).toEqual(original)
    expect(deriveAppState({ ...input, session: { ...input.session!, stderr: 'Exception in thread main' } } as AppStateInputs)).toEqual(original)
  })
})

describe('runCommandAvailability', () => {
  it.each(['building', 'launching'] as const)('blocks starts during %s, offering Stop and explicit Restart', (build) => {
    const dimensions = inputs().dimensions
    dimensions.build = build
    dimensions.process = 'none'
    expect(runCommandAvailability(dimensions, null)).toMatchObject({ run: { enabled: false, reason: 'A session is already active' }, debugStart: { enabled: false }, stop: { enabled: true }, restart: { enabled: true } })
  })

  it.each(['alive', 'starting', 'unknown'] as const)('blocks duplicate starts for %s with stopped recording', (process) => {
    const dimensions = inputs().dimensions
    dimensions.process = process
    dimensions.recording = partial
    expect(runCommandAvailability(dimensions, null)).toMatchObject({ run: { enabled: false }, debugStart: { enabled: false }, stop: { enabled: true } })
  })

  it.each(['ended', 'none'] as const)('permits a new start only after reconciliation to %s, regardless of stale pause', (process) => {
    const dimensions = inputs().dimensions
    dimensions.process = process
    dimensions.debugger = 'paused'
    dimensions.recording = partial
    expect(runCommandAvailability(dimensions, { status: 'paused', pause: null })).toMatchObject({ run: { enabled: true }, debugStart: { enabled: true }, continue: { enabled: false }, stepOver: { enabled: false }, stop: { enabled: false }, input: { enabled: false } })
  })

  it('requires actual pause for all three Step commands and Continue; wait never counts as pause', () => {
    const dimensions = inputs().dimensions
    dimensions.input.wait = 'waiting'
    expect(runCommandAvailability(dimensions, null).stepOver).toEqual({ enabled: false, reason: 'Stepping requires a paused debugger' })
    dimensions.debugger = 'paused'
    expect(runCommandAvailability(dimensions, null)).toMatchObject({ continue: { enabled: true }, stepOver: { enabled: true }, stepInto: { enabled: true }, stepOut: { enabled: true }, run: { enabled: false }, input: { enabled: true } })
  })

  it('input capability does not require wait evidence or an active recording', () => {
    const dimensions = inputs().dimensions
    dimensions.recording = partial
    dimensions.input.wait = 'unknown'
    expect(runCommandAvailability(dimensions, null).input).toEqual({ enabled: true })
    dimensions.input.available = false
    expect(runCommandAvailability(dimensions, null).input.enabled).toBe(false)
  })

  it('unknown liveness with no attempt blocks Run but cannot target a fictitious process for Stop', () => {
    const dimensions: ExecutionDimensions = { ...inputs().dimensions, attemptId: null, process: 'unknown' }
    expect(runCommandAvailability(dimensions, null)).toMatchObject({ run: { enabled: false }, stop: { enabled: false }, restart: { enabled: false }, input: { enabled: false } })
  })

  it('fails closed if a JavaScript caller omits the process fact before reconciliation', () => {
    const input = inputs()
    delete (input.dimensions as Partial<ExecutionDimensions>).process
    expect(runCommandAvailability(input.dimensions, null)).toMatchObject({ run: { enabled: false }, debugStart: { enabled: false }, input: { enabled: false } })
    expect(deriveAppState(input).badges).toContain('Process liveness unknown')
  })

  it('historical navigation does not change process commands', () => {
    const dimensions = inputs().dimensions
    const before = runCommandAvailability(dimensions, null)
    dimensions.view = { recordingId: 'old-recording', cursor: 0, liveHead: 100, lens: 'HISTORY' }
    expect(runCommandAvailability(dimensions, null)).toEqual(before)
  })
})
