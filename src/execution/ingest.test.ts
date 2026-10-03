import { expect, test } from 'vitest'
import { ExecutionIngest, TraceGapError } from './ingest'
import type { ExecutionSession, RawTraceDelta } from './contracts'
import { generateRawTrace } from '../testing/traceGen'
import { normalizeTrace } from '../instrumentation/normalize'
import { applyEvent, createInitialState } from '../runtime/state'
import { historyForTrace } from '../runtime/history'
import { seek } from '../runtime/seek'
import { validateTrace } from '../runtime/trace'

function fixture(size = 100) {
  const { rawEvents, manifest } = generateRawTrace({ rawEvents: size, seed: 43 })
  const recording = { state: 'FULL' as const, reason: null, budget: null, lastRecordedSeq: rawEvents.length - 1, executionContinued: true }
  const session: ExecutionSession = { id: 'test-session', revision: 1, projectId: 'test-project', mainClass: 'gen.G0', kind: 'run',
    phase: 'COMPLETED', support: 'PARTIAL', supportReason: null, build: null, rawEvents: [], transportVersion: 1,
    rawEventCount: rawEvents.length, sourceManifest: manifest, capability: null, recording,
    stdout: 'ACTUAL OUTPUT', stderr: '', runEvents: [], pause: null, breakpoints: [], terminalStatus: 'complete', exitCode: 0,
    diagnostic: null, failureKind: null, startedAt: '1970-01-01T00:00:00.000Z' }
  const batch = (from: number, to: number): RawTraceDelta => ({ version: 1, sessionId: session.id,
    fromSequence: from, toSequence: to, events: rawEvents.slice(from, to), recording })
  return { session, rawEvents, manifest, batch }
}

test('terminal metadata ahead of raw delivery cannot fabricate early completion', () => {
  const f = fixture(), ingest = new ExecutionIngest(f.session)
  expect(ingest.history.state.status).toBe('running')
  ingest.append(f.batch(0, 20))
  expect(ingest.history.state.status).toBe('running')
  ingest.append(f.batch(20, f.rawEvents.length))
  expect(ingest.history.state.status).toBe('ended')
  const reference = normalizeTrace(f.rawEvents, f.manifest, { status: 'complete', exitCode: 0, diagnostic: null }, 'execution:test-session')
  expect(ingest.result.trace.events).toEqual(reference.trace.events)
  expect(ingest.result.capability).toEqual(reference.capability)
})

test('duplicates and overlapping reconnect deliveries apply each raw event once', () => {
  const f = fixture(), ingest = new ExecutionIngest(f.session)
  ingest.append(f.batch(0, 20))
  const length = ingest.history.length, head = ingest.history.state
  ingest.append(f.batch(0, 20))
  expect(ingest.history.length).toBe(length)
  expect(ingest.history.state).toBe(head)
  ingest.append(f.batch(10, 40))
  expect(ingest.nextSequence).toBe(40)
  const conflict = f.batch(0, 20)
  conflict.events = conflict.events.map((event, index) => index === 0 ? { ...event, threadId: 'different' } : event)
  expect(() => ingest.append(conflict)).toThrow('Conflicting duplicate')
})

test('explicit legacy inline snapshots reload and extend without duplicating semantic facts', () => {
  const f = fixture(), ingest = new ExecutionIngest(f.session)
  const live = { ...f.session, transportVersion: undefined, rawEventCount: undefined,
    terminalStatus: null, phase: 'RUNNING' as const, rawEvents: f.rawEvents.slice(0, 20) }
  ingest.update(live)
  const prefix = [...ingest.result.trace.events], head = ingest.history.state
  ingest.update(live)
  expect(ingest.history.state).toBe(head)
  expect(ingest.nextSequence).toBe(20)
  ingest.update({ ...f.session, transportVersion: undefined, rawEventCount: undefined, rawEvents: f.rawEvents })
  expect(ingest.result.trace.events.slice(0, prefix.length)).toEqual(prefix)
  expect(ingest.nextSequence).toBe(f.rawEvents.length)
  expect(ingest.history.state.status).toBe('ended')
  expect(ingest.result.trace.events).toEqual(normalizeTrace(f.rawEvents, f.manifest,
    { status: 'complete', exitCode: 0, diagnostic: null }, 'execution:test-session').trace.events)
})

test('gaps, malformed ranges and session mismatch are rejected before any later event is applied', () => {
  const f = fixture(), ingest = new ExecutionIngest(f.session)
  ingest.append(f.batch(0, 20))
  const head = ingest.history.state
  expect(() => ingest.append(f.batch(30, 40))).toThrow(TraceGapError)
  expect(() => ingest.append({ ...f.batch(20, 30), toSequence: 31 })).toThrow('range')
  expect(() => ingest.append({ ...f.batch(20, 30), sessionId: 'other' })).toThrow('mismatch')
  expect(ingest.history.state).toBe(head)
  ingest.append(f.batch(20, 30)); ingest.append(f.batch(30, 40))
  expect(ingest.nextSequence).toBe(40)
})

test('historical cursor remains immutable while live head grows, including deterministic return to history', () => {
  const f = fixture(500), ingest = new ExecutionIngest(f.session)
  ingest.append(f.batch(0, 100))
  const cursor = Math.floor(ingest.history.length / 2)
  const old = ingest.history.materialize(cursor)
  const oldJson = JSON.stringify(old)
  ingest.append(f.batch(100, f.rawEvents.length))
  expect(JSON.stringify(old)).toBe(oldJson)
  ingest.history.materialize(ingest.history.length)
  ingest.history.materialize(3)
  expect(ingest.history.materialize(cursor)).toEqual(old)
  const reference = ingest.result.trace.events.slice(0, cursor).reduce(applyEvent, createInitialState())
  expect(old).toEqual(reference)
  expect(ingest.history.state.status).toBe('ended')
  ingest.dispose()
  expect(() => ingest.append(f.batch(0, 10))).toThrow('mismatch')
})

test('Console rerenders cannot expose unpublished live events or rebuild shared history', () => {
  const f = fixture(500), ingest = new ExecutionIngest(f.session)
  ingest.append(f.batch(0, 100))
  const view = ingest.publishTrace(), events = view.events, count = events.length
  const previous = seek(view, count), priorJson = JSON.stringify(previous)
  ingest.append(f.batch(100, f.rawEvents.length))
  ingest.update({ ...f.session, stdout: 'MORE ACTUAL OUTPUT', revision: 2 })
  expect(view.events).toBe(events)
  expect(view.events.length).toBe(count)
  expect(historyForTrace(view)).toBe(ingest.history)
  expect(JSON.stringify(seek(view, count))).toBe(priorJson)
  expect(ingest.history.isDisposed).toBe(false)
  expect(() => validateTrace(view)).toThrow('Trace must end')
  expect(ingest.publishTrace()).toBe(view)
  expect(events.length).toBe(count)
  expect(view.events.length).toBe(ingest.history.length)
  expect(historyForTrace(view)).toBe(ingest.history)
  expect(seek(view, view.events.length)).toBe(ingest.history.state)
  expect(validateTrace(view)).toBe(view)
})
