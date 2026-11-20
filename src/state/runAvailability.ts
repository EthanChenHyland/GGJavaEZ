import type { AppStateInputs, ExecutionDimensions } from './appState'

export type RunCommandAvailability = { enabled: true } | { enabled: false; reason: string }
export interface RunAvailability {
  run: RunCommandAvailability
  debugStart: RunCommandAvailability
  continue: RunCommandAvailability
  stepOver: RunCommandAvailability
  stepInto: RunCommandAvailability
  stepOut: RunCommandAvailability
  stop: RunCommandAvailability
  /** Availability only: dispatch must confirm, stop/reap, then recheck before launch. */
  restart: RunCommandAvailability
  input: RunCommandAvailability
}

function availability(enabled: boolean, reason: string): RunCommandAvailability {
  return enabled ? { enabled: true } : { enabled: false, reason }
}

/** All lifecycle commands share actual process/build/debug facts, independent of the viewed World. */
export function runCommandAvailability(dimensions: ExecutionDimensions, debug: AppStateInputs['debug']): RunAvailability {
  // The typed adapter supplies unknown; also fail closed for an omitted bridge fact at runtime.
  const process = dimensions.process ?? 'unknown'
  const starting = dimensions.build === 'building' || dimensions.build === 'launching' || process === 'starting'
  const unresolved = process === 'unknown'
  const alive = process === 'alive'
  const active = starting || unresolved || alive
  const start = availability(!active, 'A session is already active')
  const processMayExist = alive || unresolved || process === 'starting'
  const paused = processMayExist && (dimensions.debugger === 'paused' || debug?.status === 'paused')
  const step = availability(paused, 'Stepping requires a paused debugger')
  // Unknown liveness alone blocks starts, but without an attempt identity there is nothing to stop.
  const stoppable = alive || process === 'starting' || (dimensions.attemptId !== null && active)
  return {
    run: start, debugStart: start,
    continue: availability(paused, 'Continue requires a paused debugger'),
    stepOver: step, stepInto: step, stepOut: step,
    stop: availability(stoppable, 'No active session to stop'),
    restart: availability(stoppable, 'No active session to restart'),
    input: availability(alive && dimensions.input.available, 'Program input requires a live input-capable process'),
  }
}
