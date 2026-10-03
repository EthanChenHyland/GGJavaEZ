import { expect, it } from 'vitest'
import type { RawRuntimeEvent } from '../instrumentation/contracts'
import type { TraceDocument } from '../contracts/runtime'
import { normalizeTrace } from '../instrumentation/normalize'
import { committedExceptionCursor } from './exceptionCursor'

function captured(enriched: boolean) {
  const records = [
    { type: 'enter', callerFrameId: null, receiver: null, parameters: [] },
    { type: 'throw', className: 'java.lang.NullPointerException', objectId: 'failure', message: null, explicit: false },
  ].map((item, seq) => ({ v: 1, seq, threadId: '1', frameId: 'f1', className: 'Main', methodName: 'main', descriptor: '()V', line: 2, site: seq,
    ...(enriched ? { provenanceVersion: 1 } : {}), ...item })) as RawRuntimeEvent[]
  return normalizeTrace(records, { sources: [{ fileId: 'Main.java', name: 'Main.java', content: '// Main\n// throw\n', sha256: 'source' }],
    classes: [{ className: 'Main', sourceFile: 'Main.java', fileId: 'Main.java', sourceSha256: 'source', status: 'resolved', candidates: ['Main.java'] }] },
  { status: 'live', exitCode: null, diagnostic: null }).trace
}
it('returning to a current JVM failure includes its graph fact and reaches the paused head', () => {
  const trace = captured(true)
  const index = trace.events.findIndex(event => event.type === 'THROW_EXCEPTION')
  expect(trace.events.at(-1)).toMatchObject({ type: 'EXECUTION_FACT', fact: { kind: 'throw', exceptionId: 'jvm:object:failure' } })
  expect(committedExceptionCursor(trace, index)).toBe(trace.events.length)
})
it('legacy failures retain their original cursor', () => {
  const trace = captured(false)
  expect(committedExceptionCursor(trace, trace.events.length - 1)).toBe(trace.events.length)
})
it('does not cross another frame, exception or Java operation', () => {
  const trace = captured(true)
  const index = trace.events.findIndex(event => event.type === 'THROW_EXCEPTION')
  const next = trace.events[index + 1]
  if (next.type !== 'EXECUTION_FACT' || next.fact.kind !== 'throw') throw new Error('Missing captured throw fact')
  for (const fact of [{ ...next.fact, exceptionId: 'other' }, { ...next.fact, invocationId: 'other' }]) {
    const changed = { ...trace, events: [...trace.events.slice(0, index + 1), { ...next, fact }] } as TraceDocument
    expect(committedExceptionCursor(changed, index)).toBe(index + 1)
  }
  const later = { ...trace, events: [...trace.events.slice(0, index + 1), { type: 'LINE_EXECUTE', frameId: 'f1', seq: index + 1, eventId: 'next', source: null, label: 'Next', importance: 'quiet' }, next] } as TraceDocument
  expect(committedExceptionCursor(later, index)).toBe(index + 1)
})
