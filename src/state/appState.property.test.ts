import fc from 'fast-check'
import { expect, it } from 'vitest'
import { deriveAppState, runCommandAvailability, type AppState, type AppStateInputs, type ExecutionDimensions, type ExecutionState, type FailureKind, type Termination } from './appState'
import type { RecordingStatus } from '../instrumentation/contracts'

const recordingArb: fc.Arbitrary<RecordingStatus> = fc.record({
  state: fc.constantFrom('FULL', 'STOPPED_LIMIT', 'STOPPED_UNSUPPORTED', 'STOPPED_ERROR'),
  reason: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  budget: fc.constantFrom(null, 'objects', 'events', 'bytes', 'live frames'),
  lastRecordedSeq: fc.option(fc.nat(50_000), { nil: null }), executionContinued: fc.boolean(),
})
const viewArb = fc.nat(1000).chain((liveHead) => fc.record({
  recordingId: fc.option(fc.string(), { nil: null }), liveHead: fc.constant(liveHead), cursor: fc.integer({ min: 0, max: liveHead }), lens: fc.constantFrom('LIVE' as const, 'HISTORY' as const),
}))
const dimensionsArb: fc.Arbitrary<ExecutionDimensions> = fc.record({
  attemptId: fc.option(fc.string(), { nil: null }), build: fc.constantFrom('idle', 'building', 'launching', 'failed', 'ready'),
  instrumentation: fc.constantFrom('pending', 'recording', 'stopped', 'run-only', 'failed'),
  process: fc.constantFrom('unknown', 'starting', 'alive', 'ended', 'none'), recording: fc.option(recordingArb, { nil: null }),
  debugger: fc.constantFrom('inactive', 'running', 'paused', 'ended'),
  input: fc.record({ available: fc.boolean(), wait: fc.constantFrom('waiting', 'not-waiting', 'unknown') }), view: viewArb,
})
const sessionArb: fc.Arbitrary<NonNullable<AppStateInputs['session']>> = fc.record({
  id: fc.string(), kind: fc.constantFrom('run', 'debug'),
  phase: fc.constantFrom('IDLE', 'BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED', 'COMPLETED', 'FAILED', 'STOPPED'),
  support: fc.constantFrom('FULL', 'PARTIAL', 'RUN_ONLY'), supportReason: fc.option(fc.string(), { nil: null }),
  failureKind: fc.constantFrom(null, 'build', 'launch', 'runtime', 'capture'), exitCode: fc.option(fc.integer(), { nil: null }),
  terminalStatus: fc.constantFrom(null, 'complete', 'program_crashed', 'instrumentation_failed', 'limit_exceeded', 'unsupported'),
  recording: recordingArb, diagnostic: fc.option(fc.string(), { nil: null }), durationMs: fc.option(fc.nat(100_000), { nil: null }),
  build: fc.option(fc.array(fc.constantFrom('error' as const, 'warning' as const, 'note' as const), { maxLength: 8 }).map((severities) => ({
    success: false, diagnostics: severities.map((severity, i) => ({ id: String(i), location: { path: 'Main.java', line: i + 1, column: 1 }, severity, message: 'captured diagnostic', raw: '' })),
    rawOutput: '', elapsedMs: 0, mainClasses: [], jdk: { available: true, home: null, javaPath: null, javacPath: null, version: null, error: null },
  })), { nil: null }),
})
const inputsArb: fc.Arbitrary<AppStateInputs> = fc.record({
  session: fc.option(sessionArb, { nil: null }), sessionEventCount: fc.nat(1000), dimensions: dimensionsArb,
  debug: fc.option(fc.record({ status: fc.constantFrom('starting' as const, 'running' as const, 'paused' as const, 'exited' as const, 'stopped' as const, 'failed' as const), pause: fc.constant(null) }), { nil: null }),
  world: viewArb.chain((view) => fc.record({ origin: fc.constantFrom('none' as const, 'session' as const, 'prior' as const, 'recording' as const), eventCount: fc.constant(view.liveHead), cursor: fc.constant(view.cursor), lens: fc.constant(view.lens) })),
  focusTargetId: fc.option(fc.string(), { nil: null }), recordingViewer: fc.option(fc.record({ status: recordingArb, ended: fc.boolean() }), { nil: null }),
})

const presentation: Record<ExecutionState, [string, AppState['icon']]> = {
  EDIT: ['Edit', 'pencil'], BUILDING: ['Building', 'loader-circle'], RUNNING: ['Running', 'play'],
  WAITING_INPUT: ['Waiting for input', 'terminal'], DEBUG_PAUSED: ['Debug paused', 'pause'],
  COMPLETED: ['Completed', 'circle-check'], FAILED: ['Failed', 'triangle-alert'], PARTIAL_RECORDING: ['Partial recording', 'circle-dashed'],
}

/** Test oracle: an ordered decision table, independent of production helpers. */
function reference(input: AppStateInputs): AppState {
  const s = input.session, d = input.dimensions
  const status = !s && input.recordingViewer ? input.recordingViewer.status : d.recording ?? s?.recording ?? null
  const partial = status && status.state !== 'FULL' ? { state: status.state, reason: status.reason, budget: status.budget, lastRecordedSeq: status.lastRecordedSeq } : null
  const errors = s?.build?.diagnostics.filter((diagnostic) => diagnostic.severity === 'error' && diagnostic.provider !== 'language').length ?? 0
  const terminal = !!s && ['FAILED', 'COMPLETED', 'STOPPED'].includes(s.phase)
  const pause = d.debugger === 'paused' || input.debug?.status === 'paused'
  const wait = d.process === 'alive' && d.input.available && d.input.wait === 'waiting'
  const rows: [boolean, ExecutionState][] = [
    [!s && !!input.recordingViewer, partial ? 'PARTIAL_RECORDING' : 'COMPLETED'],
    [!s || s.phase === 'IDLE', 'EDIT'],
    [!terminal && !pause && !wait && (d.build === 'building' || d.build === 'launching' || d.process === 'starting'), 'BUILDING'],
    [s?.phase === 'FAILED', 'FAILED'],
    [terminal && s?.terminalStatus === 'program_crashed' && s.phase !== 'STOPPED', 'FAILED'],
    [s?.phase === 'STOPPED', 'COMPLETED'],
    [s?.phase === 'COMPLETED', partial ? 'PARTIAL_RECORDING' : 'COMPLETED'],
    [pause, 'DEBUG_PAUSED'], [wait, 'WAITING_INPUT'], [!!partial, 'PARTIAL_RECORDING'], [true, 'RUNNING'],
  ]
  const execution = rows.find(([matches]) => matches)![1]
  let failure: FailureKind | null = null
  if (execution === 'FAILED' && s) {
    if (s.phase !== 'FAILED') failure = 'uncaught-exception'
    else {
      const failureKinds: Record<NonNullable<typeof s.failureKind>, FailureKind> = { build: errors ? 'compile' : 'build', launch: 'launch', capture: 'instrumentation', runtime: 'uncaught-exception' }
      failure = s.failureKind ? failureKinds[s.failureKind] : s.terminalStatus === 'program_crashed' ? 'uncaught-exception'
        : d.build === 'failed' ? errors ? 'compile' : 'build'
          : d.instrumentation === 'failed' || s.terminalStatus === 'instrumentation_failed' ? 'instrumentation' : 'launch'
    }
  }
  let termination: Termination | null = null
  if (s && terminal && typeof s.durationMs === 'number') {
    const durationMs = s.durationMs
    if (Number.isFinite(durationMs) && durationMs >= 0) {
      if (s.phase === 'STOPPED') termination = { kind: 'user-stop', durationMs }
      else if (s.exitCode !== null) termination = { kind: 'exit', durationMs, exitCode: s.exitCode }
    }
  }
  const overlays: AppState['overlays'] = [
    ...(input.world.eventCount > 0 && input.world.cursor < input.world.eventCount ? ['HISTORY' as const] : []),
    ...(input.focusTargetId !== null ? ['FOCUS' as const] : []),
  ]
  const badges = [
    ...(partial ? [partial.reason ? `Partial recording · ${partial.reason}` : 'Partial recording'] : []),
    ...(d.process === 'unknown' ? ['Process liveness unknown'] : []),
    ...(partial && d.process === 'alive' ? ['Process alive'] : []),
    ...(execution === 'RUNNING' && d.process === 'alive' && input.sessionEventCount === 0 && d.instrumentation !== 'run-only' && s?.support !== 'RUN_ONLY' ? ['Waiting for recording'] : []),
  ]
  let label = presentation[execution][0]
  if (execution === 'FAILED') label = failure === 'compile' ? `Build failed · ${errors} errors` : ({ build: 'Build failed', instrumentation: 'Instrumentation failed', launch: 'Launch failed', 'uncaught-exception': 'Failed · Uncaught exception' } as Record<string, string>)[failure!]
  if (execution === 'PARTIAL_RECORDING' && partial?.reason) label += ` · ${partial.reason}`
  if (execution === 'COMPLETED') {
    if (termination) label += ` · ${(termination.durationMs / 1000).toFixed(2)} s · ${termination.kind === 'exit' ? `Exit code ${termination.exitCode}` : 'Stopped by user'}`
    else if (s?.phase === 'STOPPED') label += ' · Stopped by user'
  }
  label += overlays.map((overlay) => ` · ${overlay === 'HISTORY' ? 'History' : 'Focus'}`).join('')
  return { execution, overlays, failure, termination, partial, worldOrigin: input.world.origin, dimensions: d, badges, label, icon: presentation[execution][1] }
}

it('Property 1: AppState is pure and matches the precedence reference (100 runs)', () => {
  fc.assert(fc.property(inputsArb, fc.string(), (input, stderr) => {
    const before = structuredClone(input)
    const state = deriveAppState(input)
    expect(state).toEqual(reference(input))
    expect(state).toEqual(deriveAppState(structuredClone(input)))
    expect(Object.keys(presentation)).toContain(state.execution)
    expect(new Set(state.overlays).size).toBe(state.overlays.length)
    expect(input).toEqual(before)
    const withStderr = input.session ? { ...input, session: { ...input.session, stderr } } : input
    expect(deriveAppState(withStderr)).toEqual(state)
  }), { numRuns: 100 })
})

it('Property 2: overlays depend only on presented prefix and Focus (100 runs)', () => {
  fc.assert(fc.property(inputsArb, inputsArb, (input, other) => {
    const overlays = deriveAppState(input).overlays
    expect(overlays.includes('HISTORY')).toBe(input.world.eventCount > 0 && input.world.cursor < input.world.eventCount)
    expect(overlays.includes('FOCUS')).toBe(input.focusTargetId !== null)
    expect(deriveAppState({ ...other, world: input.world, focusTargetId: input.focusTargetId }).overlays).toEqual(overlays)
    const terminal: AppStateInputs = { ...input, session: { ...referenceSession(), phase: 'COMPLETED', recording: fullRecording() }, dimensions: { ...input.dimensions, recording: fullRecording() } }
    expect(deriveAppState(terminal).execution).toBe('COMPLETED')
    expect(deriveAppState({ ...terminal, world: { ...terminal.world, cursor: terminal.world.eventCount }, focusTargetId: null }).execution).toBe('COMPLETED')
  }), { numRuns: 100 })
})

it('Property 3: labels preserve state details and ordered overlays; icons are distinct (100 runs)', () => {
  expect(new Set(Object.values(presentation).map(([, icon]) => icon)).size).toBe(8)
  fc.assert(fc.property(inputsArb, fc.nat(100_000), fc.integer(), (input, durationMs, exitCode) => {
    const state = deriveAppState(input)
    expect(state.label).toBe(reference(input).label)
    expect(state.icon).toBe(presentation[state.execution][1])
    const session = { ...referenceSession(), phase: 'COMPLETED' as const, exitCode, durationMs }
    const terminal: AppStateInputs = { ...input, session, dimensions: { ...input.dimensions, recording: fullRecording() }, world: { ...input.world, cursor: input.world.eventCount }, focusTargetId: null }
    expect(deriveAppState(terminal).label).toBe(`Completed · ${(durationMs / 1000).toFixed(2)} s · Exit code ${exitCode}`)
    expect(deriveAppState({ ...terminal, session: { ...session, phase: 'STOPPED' } }).label).toBe(`Completed · ${(durationMs / 1000).toFixed(2)} s · Stopped by user`)
  }), { numRuns: 100 })
})

it('Property 4: command availability uses independent operational facts (100 runs)', () => {
  fc.assert(fc.property(inputsArb, viewArb, (input, view) => {
    const d = input.dimensions
    const actual = runCommandAvailability(d, input.debug)
    const active = ['building', 'launching'].includes(d.build) || ['alive', 'unknown', 'starting'].includes(d.process)
    expect(actual.run.enabled).toBe(!active)
    expect(actual.debugStart).toEqual(actual.run)
    if (active) expect(actual.run).toEqual({ enabled: false, reason: 'A session is already active' })
    const paused = !['none', 'ended'].includes(d.process) && (d.debugger === 'paused' || input.debug?.status === 'paused')
    expect(actual.continue.enabled).toBe(paused)
    for (const step of [actual.stepOver, actual.stepInto, actual.stepOut]) {
      expect(step.enabled).toBe(paused)
      if (!paused) expect(step).toEqual({ enabled: false, reason: 'Stepping requires a paused debugger' })
    }
    expect(actual.input.enabled).toBe(d.process === 'alive' && d.input.available)
    const hasTarget = ['alive', 'starting'].includes(d.process) || (d.attemptId !== null && active)
    expect(actual.stop.enabled).toBe(hasTarget)
    expect(actual.restart.enabled).toBe(hasTarget)
    expect(runCommandAvailability({ ...d, view }, input.debug)).toEqual(actual)
    const pausedBeforeEvent = { ...d, process: 'alive' as const, debugger: 'paused' as const }
    expect(runCommandAvailability(pausedBeforeEvent, null).stepInto.enabled).toBe(true)
  }), { numRuns: 100 })
})

function fullRecording(): RecordingStatus {
  return { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false }
}
function referenceSession(): NonNullable<AppStateInputs['session']> {
  return { id: 'session', kind: 'run', phase: 'RUNNING', support: 'FULL', supportReason: null, failureKind: null, exitCode: 0,
    terminalStatus: 'complete', recording: fullRecording(), build: null, diagnostic: null, durationMs: null }
}
