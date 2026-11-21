import { expect, it } from 'vitest'
import type { TraceEvent } from '../contracts/runtime'
import { createMilestoneIndex } from './milestones'
import { eventCaption, milestoneCaption } from './milestonesCaption'

function events(): TraceEvent[] {
  return Array.from({ length: 20 }, (_, seq) => ({ eventId: `opaque$${seq}`, seq, source: null, label: `actual captured ${seq}`,
    importance: seq === 8 || seq === 9 ? 'major' : 'normal', type: 'ENTER_METHOD', frameId: `f${seq}`, callerFrameId: null,
    className: 'C', methodName: 'm', locals: [] } as TraceEvent))
}
it('labels highest importance then earliest in each bin, substituting the current milestone', () => {
  const trace = events(), index = createMilestoneIndex()
  index.extend(trace, 0)
  expect(index.labelled(0, 280, 12).map((item) => item.seq)).toEqual([8, 9])
  expect(index.labelled(5, 280, 12).map((item) => item.seq)).toEqual([4, 9])
  expect(index.current(0)).toBeNull()
  expect(index.current(5)?.seq).toBe(4)
})
it('append-only extension equals batch indexing and repeated publication visits no events again', () => {
  const trace = events(), append = createMilestoneIndex(), batch = createMilestoneIndex()
  append.extend(trace, 0, 7); append.extend(trace, 7, 12); append.extend(trace, 12)
  batch.extend(trace, 0)
  expect(append.labelled(12, 880, 6)).toEqual(batch.labelled(12, 880, 6))
  const published = trace.map((event) => new Proxy(event, { get() { throw new Error('Published event was reread') } }))
  expect(() => append.extend(published, append.count)).not.toThrow()
})
it('quiet non-milestone Events are density, not invented semantic labels', () => {
  const trace = events().map((event) => ({ ...event, type: 'LINE_EXECUTE' as const, frameId: 'f' }))
  const index = createMilestoneIndex(); index.extend(trace, 0)
  expect(index.labelled(15, 1320, 12)).toEqual([])
  expect(Array.from(index.density(4))).toEqual([4, 5, 5, 6])
})
it('prioritizes an exact write over routine call activity and leaves duplicate JVM and library records as density', () => {
  const base = events()[0]
  const records: TraceEvent[] = [
    base,
    { ...base, type: 'ALLOCATE_OBJECT', objectId: 'lib', displayId: 2, className: 'java.util.ArrayList', fields: [], metadata: { ownership: 'JDK', runtimeType: 'java.util.ArrayList', packageName: 'java.util' } },
    { ...base, type: 'EXECUTION_FACT', fact: { kind: 'exit', invocationId: 'f0', context: { owner: 'C', name: 'm', descriptor: '()V', frameId: 'f0', rawSeq: 9, site: 3, source: null } } },
    { ...base, type: 'EXIT_METHOD', frameId: 'f0' },
    { ...base, type: 'ARRAY_WRITE', frameId: 'f1', objectId: 'arr', index: 1, value: { kind: 'primitive', javaType: 'int', value: 8 }, label: 'Write [1]' },
  ]
  const trace = records.map((record, seq) => ({ ...record, seq, eventId: `exact/${seq}` }))
  const index = createMilestoneIndex(); index.extend(trace, 0)
  expect(index.current(4)?.id).toBe('exact/0')
  expect(index.current(5)?.id).toBe('exact/4')
  expect(index.labelled(0, 140, 12)).toMatchObject([{ cursor: 5, seq: 4, kind: 'mutation', caption: 'Write [1] = 8', label: 'Write [1]' }])
  expect(Array.from(index.density(1))).toEqual([5])
})
it('distinguishes unavailable arguments, recorded empty lists and recorded values', () => {
  const entry = events()[0]
  expect(eventCaption(entry).headline).toBe('Enter m')
  expect(milestoneCaption(entry)).toBe('m')

  const method = { owner: 'C', name: 'm', descriptor: '(I)V' }
  const context = { ...method, frameId: 'f0', rawSeq: 9, site: 3, source: null }
  const fact = { kind: 'enter' as const, context, method, invocationId: 'f0', callerInvocationId: null, receiver: null, parameters: [] }
  expect(eventCaption({ ...entry, type: 'EXECUTION_FACT', fact }).headline).toBe('Enter m')
  expect(eventCaption({ ...entry, type: 'EXECUTION_FACT', fact: { ...fact, method: { ...method, descriptor: '()V' } } }).headline).toBe('Enter m()')

  const call = { kind: 'call' as const, context, callId: 'call', declared: { ...method, descriptor: '()V' }, invokeKind: 'static' as const,
    receiver: null, arguments: [], argumentOrigins: [], receiverOrigin: { kind: 'unknown' as const } }
  expect(eventCaption({ ...entry, type: 'EXECUTION_FACT', fact: call })).toEqual({ headline: 'Call m()', context: 'm' })

  const parameter = { slotId: 'arg', name: 'arg', javaType: 'int', value: { kind: 'primitive' as const, javaType: 'int' as const, value: 3 } }
  expect(eventCaption({ ...entry, type: 'EXECUTION_FACT', fact: { ...fact, parameters: [parameter] } }).headline).toBe('Enter m(3)')
})
it('partial markers retain raw diagnostic metadata while their bound is accepted semantic count', () => {
  const trace = events()
  const recording = { state: 'STOPPED_LIMIT' as const, reason: 'Budget', budget: 'events' as const, lastRecordedSeq: 9999, executionContinued: true }
  trace.push({ eventId: 'control', seq: 20, source: null, label: 'Capture stopped', importance: 'major', type: 'CAPTURE_STOP', recording })
  const index = createMilestoneIndex(); index.extend(trace, 0)
  expect(index.count).toBe(21)
  expect(index.recordingStop()).toEqual(recording)
  expect(index.labelled(21, 220, 12).every((item) => item.seq < 21)).toBe(true)
  expect(index.recordingStop()?.lastRecordedSeq).toBe(9999)
})
