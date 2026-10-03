import { describe, expect, it } from 'vitest'
import { createReductionEngine } from './engine'
import { ExecutionHistory } from './history'
import { applyEvent, createInitialState } from './state'
import { generateRawTrace } from '../testing/traceGen'
import { normalizeTrace } from '../instrumentation/normalize'
import { loadArrayTrace, loadControlTrace, loadPersonTrace, loadRecursionTrace } from '../examples/traces'

describe('persistent reduction equivalence', () => {
  const traces = [loadPersonTrace(), loadRecursionTrace(), loadArrayTrace(), loadControlTrace(),
    ...[1, 7, 42, 312].map(seed => {
      const generated = generateRawTrace({ rawEvents: 1000, seed })
      return normalizeTrace(generated.rawEvents, generated.manifest, { status: 'complete', exitCode: 0, diagnostic: null }).trace
    })]
  it.each(traces)('matches the pure reducer at every event: $demoId', trace => {
    const engine = createReductionEngine()
    let reference = createInitialState()
    for (const event of trace.events) {
      const old = engine.state
      const oldJson = JSON.stringify(old)
      reference = applyEvent(reference, event)
      expect(engine.apply(event)).toEqual(reference)
      expect(JSON.stringify(old)).toBe(oldJson)
    }
  })
  it('leaves the head unchanged when semantic validation fails', () => {
    const engine = createReductionEngine()
    const state = engine.state
    expect(() => engine.apply({ ...loadPersonTrace().events[0], seq: 9 })).toThrow()
    expect(engine.state).toBe(state)
  })
  it('imports externally supplied reference checkpoints once and retains immutable history', () => {
    const trace = loadControlTrace()
    const initial = trace.events.slice(0, 12).reduce(applyEvent, createInitialState())
    const engine = createReductionEngine(initial)
    for (const event of trace.events.slice(12)) engine.apply(event)
    expect(engine.state).toEqual(trace.events.reduce(applyEvent, createInitialState()))
    const history = new ExecutionHistory({ checkpointInterval: 4, maxCheckpoints: 8 })
    history.append(trace.events)
    const live = history.state
    for (let cursor = trace.events.length; cursor >= 0; cursor--)
      expect(history.materialize(cursor)).toEqual(trace.events.slice(0, cursor).reduce(applyEvent, createInitialState()))
    expect(history.state).toBe(live)
    expect(history.stats.retainedStateRoots).toBeLessThanOrEqual(8)
  })
})
