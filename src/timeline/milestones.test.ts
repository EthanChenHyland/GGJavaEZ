import { expect, it } from 'vitest'
import type { TraceEvent } from '../contracts/runtime'
import { createMilestoneIndex } from './milestones'

function events(): TraceEvent[] {
  return Array.from({ length: 20 }, (_, seq) => ({ eventId: `opaque$${seq}`, seq, source: null, label: `actual captured ${seq}`,
    importance: seq === 8 || seq === 9 ? 'major' : 'normal', type: 'ENTER_METHOD', frameId: `f${seq}`, callerFrameId: null,
    className: 'C', methodName: 'm', locals: [] } as TraceEvent))
}
it('labels highest importance then earliest in each bin, substituting the current milestone', () => {
  const trace = events(), index = createMilestoneIndex()
  index.extend(trace, 0)
  expect(index.labelled(0, 220, 12).map((item) => item.seq)).toEqual([8, 9])
  expect(index.labelled(5, 220, 12).map((item) => item.seq)).toEqual([4, 9])
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
