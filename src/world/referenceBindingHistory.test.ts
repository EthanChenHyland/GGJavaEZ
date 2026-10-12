import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { referenceIdForSlot, type RuntimeValue } from '../contracts/runtime'
import { createReferenceBindingHistory, type BindingObservation, type ReferenceBinding } from './referenceBindingHistory'

// Explicit normalized observations only: these tests do not derive RuntimeState/Graph facts.
const reference = (objectId: string): RuntimeValue => ({ kind: 'reference', javaType: 'Unit', objectId })
const observation = (value: RuntimeValue | null, mode: BindingObservation['mode'] = 'observe',
  sourceId = 'owner', sourceSlotId = 'slot', role: BindingObservation['role'] = 'object-object'): BindingObservation =>
  ({ sourceId, sourceSlotId, role, value, mode })
const byId = (bindings: readonly ReferenceBinding[]) => [...bindings].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

interface Call { seq: number; eventId: string; observations: readonly BindingObservation[] }

/** Deliberately simple replay oracle: linear live search, no indices or future records. */
function oracle(recordingId: string, calls: readonly Call[], cursor: number) {
  const live: ReferenceBinding[] = [], closed: ReferenceBinding[] = []
  for (const call of calls) {
    if (call.seq >= cursor) continue
    for (const item of call.observations) {
      const index = live.findIndex(binding => binding.sourceId === item.sourceId && binding.sourceSlotId === item.sourceSlotId)
      const previous = index < 0 ? undefined : live[index]
      const next = item.value?.kind === 'reference' ? item.value.objectId : null
      if (item.mode === 'observe' && previous && next === previous.targetId) continue
      if (previous) {
        live.splice(index, 1)
        const kind = item.mode === 'retire' ? 'retired' : item.value?.kind === 'null' ? 'null'
          : item.value === null || item.value.kind === 'unavailable' || item.value.kind === 'uninitialized' ? 'unavailable' : 'overwritten'
        closed.push({ ...previous, endSeq: call.seq, endEventId: call.eventId, endKind: kind })
      }
      if (item.mode !== 'retire' && next !== null) live.push({
        id: `presentation:reference-binding:${JSON.stringify([recordingId, item.sourceId, item.sourceSlotId, call.seq])}`,
        referenceId: `ref:${item.sourceSlotId}`, sourceId: item.sourceId, sourceSlotId: item.sourceSlotId,
        targetId: next, role: item.role, introducedSeq: call.seq, introducedEventId: call.eventId,
        endSeq: null, endEventId: null, endKind: null,
      })
    }
  }
  return { current: byId(live), historical: byId(closed) }
}

describe('normalized reference binding history', () => {
  it('creates stable recording-scoped interval identities and slot reference identities', () => {
    const build = (recordingId: string) => {
      const index = createReferenceBindingHistory(recordingId)
      index.append(4, 'opaque event 4', [observation(reference('opaque target'))])
      index.append(11, 'opaque event 11', [observation(reference('other target'))])
      return index
    }
    const first = build('recording/one'), replay = build('recording/one'), other = build('recording/two')
    expect(first.current(5)).toEqual(replay.current(5))
    expect(first.historical(12)).toEqual(replay.historical(12))
    expect(first.current(5)[0]).toEqual({
      id: `presentation:reference-binding:${JSON.stringify(['recording/one', 'owner', 'slot', 4])}`,
      referenceId: referenceIdForSlot('slot'), sourceId: 'owner', sourceSlotId: 'slot', targetId: 'opaque target', role: 'object-object',
      introducedSeq: 4, introducedEventId: 'opaque event 4', endSeq: null, endEventId: null, endKind: null,
    })
    expect(first.current(5)[0].id).not.toBe(first.current(12)[0].id)
    expect(first.current(5)[0].id).not.toBe(other.current(5)[0].id)
    expect(first.current(5)[0].referenceId).toBe(first.current(12)[0].referenceId)
    expect(first.length).toBe(2)
    expect(Object.isFrozen(first)).toBe(true)
  })

  it('coalesces repeated observations but records genuine same-target writes', () => {
    const index = createReferenceBindingHistory('unit')
    index.append(0, 'allocate binding', [observation(reference('a'))])
    const initial = index.current(1)
    index.append(2, 'repeat with other java type', [observation({ kind: 'reference', javaType: 'Object', objectId: 'a' })])
    index.append(3, 'empty batch', [])
    expect(index.current(4)).toEqual(initial)
    expect(index.historical(4)).toEqual([])
    index.append(7, 'proved write', [observation(reference('a'), 'write')])
    expect(index.current(7)).toEqual(initial)
    expect(index.historical(7)).toEqual([])
    expect(index.current(8)[0]).toMatchObject({ targetId: 'a', introducedSeq: 7, introducedEventId: 'proved write' })
    expect(index.historical(8)[0]).toMatchObject({ introducedSeq: 0, endSeq: 7, endEventId: 'proved write', endKind: 'overwritten' })
    index.append(9, 'repeat after write', [observation(reference('a'))])
    expect(index.current(10)).toEqual(index.current(8))
    expect(index.historical(10)).toEqual(index.historical(8))
    expect(index.length).toBe(5)
  })

  it.each([
    ['replacement', reference('b'), 'observe', 'overwritten'],
    ['Java null', { kind: 'null' }, 'write', 'null'],
    ['absent capture', null, 'observe', 'unavailable'],
    ['unavailable capture', { kind: 'unavailable', reason: 'not recorded' }, 'write', 'unavailable'],
    ['uninitialized slot', { kind: 'uninitialized' }, 'observe', 'unavailable'],
    ['primitive replacement', { kind: 'primitive', javaType: 'int', value: 4 }, 'observe', 'overwritten'],
    ['captured string scalar', { kind: 'stringSummary', javaType: 'String', value: 'a' }, 'write', 'overwritten'],
    ['retirement despite captured target', reference('a'), 'retire', 'retired'],
    ['retirement despite Java null', { kind: 'null' }, 'retire', 'retired'],
    ['retirement without capture', null, 'retire', 'retired'],
  ] satisfies Array<[string, RuntimeValue | null, BindingObservation['mode'], ReferenceBinding['endKind']]>)(
    'retains %s closure truth and opens a fresh interval on reentry', (_label, value, mode, endKind) => {
      const index = createReferenceBindingHistory('unit')
      index.append(1, 'first', [observation(reference('a'))])
      const initial = index.current(2)[0]
      index.append(4, 'end', [observation(value, mode)])
      expect(index.historical(5)[0]).toEqual({ ...initial, endSeq: 4, endEventId: 'end', endKind })
      if (value?.kind === 'reference' && mode !== 'retire') expect(index.current(5)[0].targetId).toBe('b')
      else expect(index.current(5)).toEqual([])
      index.append(8, 'reenter', [observation(reference('a'))])
      expect(index.current(9)[0]).toMatchObject({ targetId: 'a', introducedSeq: 8, introducedEventId: 'reenter' })
      expect(index.current(9)[0].id).not.toBe(initial.id)
    },
  )

  it('never opens for null/unknown/scalar/retire and omission does not retire an untouched slot', () => {
    const index = createReferenceBindingHistory('unit')
    index.append(0, 'absent', [observation(null)])
    index.append(1, 'null', [observation({ kind: 'null' }, 'write')])
    index.append(2, 'primitive', [observation({ kind: 'primitive', javaType: 'boolean', value: true })])
    index.append(3, 'retire', [observation(reference('a'), 'retire')])
    expect(index.current(4)).toEqual([])
    expect(index.historical(4)).toEqual([])
    index.append(5, 'actual binding', [observation(reference('a'))])
    index.append(6, 'only other source', [observation(null, 'retire', 'other', 'slot')])
    index.append(7, 'empty', [])
    expect(index.current(8)).toEqual(index.current(6))
    expect(index.historical(8)).toEqual([])
  })

  it('uses exact applied-prefix boundaries with gaps and never reveals future ending metadata', () => {
    const calls: Call[] = [
      { seq: 2, eventId: 'a', observations: [observation(reference('a'))] },
      { seq: 6, eventId: 'b', observations: [observation(reference('b'), 'write')] },
      { seq: 10, eventId: 'c', observations: [observation({ kind: 'null' })] },
      { seq: 14, eventId: 'd', observations: [observation(reference('b'))] },
      { seq: 18, eventId: 'e', observations: [observation(null, 'retire')] },
    ]
    const index = createReferenceBindingHistory('unit')
    for (const call of calls) index.append(call.seq, call.eventId, call.observations)
    for (let cursor = 0; cursor <= 21; cursor++) {
      const expected = oracle('unit', calls, cursor)
      expect(byId(index.current(cursor))).toEqual(expected.current)
      expect(byId(index.historical(cursor))).toEqual(expected.historical)
      for (const item of index.current(cursor)) expect([item.endSeq, item.endEventId, item.endKind]).toEqual([null, null, null])
    }
    expect(index.current(2)).toEqual([])
    expect(index.current(6)[0].targetId).toBe('a')
    expect(index.historical(6)).toEqual([])
    expect(index.current(7)[0].targetId).toBe('b')
    expect(index.historical(7)[0].endSeq).toBe(6)
  })

  it('returns immutable snapshots that survive append and caller mutation attempts', () => {
    const index = createReferenceBindingHistory('unit')
    const value = { kind: 'reference' as const, javaType: 'Unit', objectId: 'a' }
    const supplied = observation(value)
    index.append(1, 'first', [supplied])
    const before = index.current(2), empty = index.historical(2)
    value.objectId = 'caller changed input'
    expect(Object.isFrozen(before)).toBe(true)
    expect(Object.isFrozen(before[0])).toBe(true)
    expect(() => (empty as ReferenceBinding[]).push(before[0])).toThrow(TypeError)
    expect(() => (before as ReferenceBinding[]).push(before[0])).toThrow(TypeError)
    expect(Reflect.set(before[0], 'targetId', 'caller changed output')).toBe(false)
    index.append(4, 'second', [observation(reference('b'))])
    const ended = index.historical(5)
    expect(Array.isArray(ended)).toBe(true)
    expect([...ended]).toEqual(ended.slice())
    expect(Object.keys(ended)).toEqual(['0'])
    expect(JSON.parse(JSON.stringify(ended))).toEqual([...ended])
    expect(() => Reflect.set(ended, '0', before[0])).toThrow(TypeError)
    expect(() => Reflect.deleteProperty(ended, '0')).toThrow(TypeError)
    expect(() => Reflect.defineProperty(ended, 'length', { value: 0 })).toThrow(TypeError)
    expect(() => Reflect.setPrototypeOf(ended, null)).toThrow(TypeError)
    expect(() => Reflect.preventExtensions(ended)).toThrow(TypeError)
    expect(Reflect.set(ended[0], 'endKind', 'retired')).toBe(false)
    index.append(8, 'third', [observation(null, 'retire')])
    expect(before[0]).toMatchObject({ targetId: 'a', endSeq: null, endEventId: null, endKind: null })
    expect(index.current(2)).toEqual(before)
    expect(empty).toEqual([])
    expect(ended).toHaveLength(1)
    expect(ended[0]).toMatchObject({ endKind: 'overwritten', endSeq: 4 })
    expect(index.historical(5)).toEqual(ended)
  })

  it('keeps opaque owners/slots distinct, including delimiter collisions, quotes and empty strings', () => {
    const pairs = [['a:b', 'c'], ['a', 'b:c'], ['a', 'same slot'], ['b', 'same slot'], ['["x",', '"y"]'], ['', '\u0000'], ['\u0000', '']]
    const index = createReferenceBindingHistory('recording:["opaque"]')
    index.append(0, 'event:any delimiters', pairs.map(([owner, slot], i) => observation(reference(`target:${i}`), 'observe', owner, slot)))
    expect(new Set(index.current(1).map(item => item.id)).size).toBe(pairs.length)
    expect(index.current(1).map(item => [item.sourceId, item.sourceSlotId])).toEqual(pairs)
    expect(index.current(1)[2].referenceId).toBe(index.current(1)[3].referenceId)
    index.append(5, 'one retirement', [observation(null, 'retire', 'a:b', 'c')])
    expect(index.current(6)).toHaveLength(pairs.length - 1)
    expect(index.current(6).some(item => item.sourceId === 'a' && item.sourceSlotId === 'b:c')).toBe(true)
    expect(index.historical(6)[0].targetId).toBe('target:0')
  })

  it('retains introduction roles and does not turn role-only observations into operations', () => {
    const index = createReferenceBindingHistory('unit')
    index.append(0, 'first', [observation(reference('a'), 'observe', 'owner', 'slot', 'frame-object')])
    index.append(2, 'unchanged target', [observation(reference('a'), 'observe', 'owner', 'slot', 'class-object')])
    expect(index.current(3)[0]).toMatchObject({ role: 'frame-object', introducedSeq: 0 })
    index.append(4, 'proved write', [observation(reference('a'), 'write', 'owner', 'slot', 'class-object')])
    expect(index.current(5)[0].role).toBe('class-object')
    expect(index.historical(5)[0].role).toBe('frame-object')
  })

  it('orders closures by end sequence and batch order, including tied end sequences', () => {
    const index = createReferenceBindingHistory('unit')
    index.append(0, 'first', ['a', 'b', 'c'].map(slot => observation(reference(slot), 'observe', 'owner', slot)))
    index.append(3, 'reverse closure batch', ['c', 'a'].map(slot => observation(null, 'retire', 'owner', slot)))
    index.append(9, 'last closure', [observation(null, 'retire', 'owner', 'b')])
    expect(index.historical(3)).toEqual([])
    expect(index.historical(4).map(item => item.sourceSlotId)).toEqual(['c', 'a'])
    expect(index.historical(9).map(item => item.sourceSlotId)).toEqual(['c', 'a'])
    expect(index.historical(10).map(item => item.sourceSlotId)).toEqual(['c', 'a', 'b'])
  })

  it('validates an entire batch before mutation and permits exact retry of rejected sequence/event', () => {
    const index = createReferenceBindingHistory('unit')
    index.append(1, 'first', [observation(reference('a'))])
    const before = index.current(20)
    const valid = observation(reference('b'), 'write')
    const invalid = { ...observation(reference('z'), 'observe', 'other'), mode: 'invented operation' } as unknown as BindingObservation
    expect(() => index.append(5, 'retry me', [valid, invalid])).toThrow(TypeError)
    expect(index.length).toBe(1)
    expect(index.current(20)).toEqual(before)
    expect(index.historical(20)).toEqual([])
    expect(() => index.append(5, 'retry me', [valid, observation(null)])).toThrow(/Duplicate/)
    expect(index.current(20)).toEqual(before)
    index.append(5, 'retry me', [valid])
    expect(index.length).toBe(2)
    expect(index.historical(6)[0]).toMatchObject({ endSeq: 5, endEventId: 'retry me', endKind: 'overwritten' })
  })

  it('rejects invalid sequence/event/query and malformed late observations without consuming a call', () => {
    const index = createReferenceBindingHistory('unit')
    index.append(2, 'used event', [observation(reference('a'))])
    const badCalls: Array<[number, string, readonly BindingObservation[]]> = [
      [2, 'unused', []], [1, 'unused', []], [-1, 'unused', []], [2.5, 'unused', []], [NaN, 'unused', []],
      [Infinity, 'unused', []], [Number.MAX_SAFE_INTEGER + 1, 'unused', []], [5, '', []], [5, 'used event', []],
      [5, 'unused', [observation(reference('b')), { ...observation(null, 'retire', 'other'), role: 'guessed' } as unknown as BindingObservation]],
      [5, 'unused', [observation(reference('b')), { ...observation(null, 'observe', 'other'), value: { kind: 'guessed' } } as unknown as BindingObservation]],
      [5, 'unused', [observation(reference('b')), { ...observation(null, 'observe', 'other'), sourceSlotId: 9 } as unknown as BindingObservation]],
      [5, 'unused', [observation(reference('b')), { ...observation(null, 'observe', 'other'), value: { kind: 'reference', objectId: 8 } } as unknown as BindingObservation]],
    ]
    const before = index.current(10)
    for (const [seq, eventId, batch] of badCalls) {
      expect(() => index.append(seq, eventId, batch)).toThrow()
      expect(index.length).toBe(1)
      expect(index.current(10)).toEqual(before)
      expect(index.historical(10)).toEqual([])
    }
    for (const cursor of [-1, 1.5, NaN, Infinity]) {
      expect(() => index.current(cursor)).toThrow(RangeError)
      expect(() => index.historical(cursor)).toThrow(RangeError)
    }
    index.append(5, 'unused', [])
    expect(index.length).toBe(2)
    expect(index.current(10)).toEqual(before)
  })

  it('matches an independent applied-prefix interval oracle under randomized batches (100 runs)', () => {
    const pairs = [['a:b', 'c'], ['a', 'b:c'], ['owner', 's'], ['other', 's'], ['"[]\u0000', ':'], ['', 'opaque']]
    const value = fc.constantFrom<RuntimeValue | null>(reference('same target'), reference('other target'), reference(''),
      { kind: 'null' }, null, { kind: 'unavailable', reason: 'not captured' }, { kind: 'uninitialized' },
      { kind: 'primitive', javaType: 'int', value: 0 }, { kind: 'stringSummary', javaType: 'String', value: 'same target' })
    const item = fc.record({ pair: fc.integer({ min: 0, max: pairs.length - 1 }), value,
      mode: fc.constantFrom<BindingObservation['mode']>('observe', 'observe', 'write', 'retire'),
      role: fc.constantFrom<BindingObservation['role']>('frame-object', 'object-object', 'class-object') })
    const batch = fc.record({ gap: fc.integer({ min: 1, max: 4 }), items: fc.uniqueArray(item, { selector: entry => entry.pair, maxLength: 5 }) })
    fc.assert(fc.property(fc.string({ maxLength: 12 }), fc.array(batch, { minLength: 1, maxLength: 24 }), (recordingId, batches) => {
      const index = createReferenceBindingHistory(recordingId), calls: Call[] = []
      let seq = -1
      for (const [ordinal, batch] of batches.entries()) {
        seq += batch.gap
        const call: Call = { seq, eventId: `opaque event [${ordinal}]`, observations: batch.items.map(item =>
          observation(item.value, item.mode, ...pairs[item.pair] as [string, string], item.role)) }
        const oldCursor = Math.max(0, seq - 1)
        const oldCurrent = index.current(oldCursor), oldHistorical = index.historical(oldCursor)
        calls.push(call)
        index.append(call.seq, call.eventId, call.observations)
        expect(index.current(oldCursor)).toEqual(oldCurrent)
        expect(index.historical(oldCursor)).toEqual(oldHistorical)
        expect(index.length).toBe(calls.length)
      }
      const cursors = new Set([0, seq + 3, ...calls.flatMap(call => [Math.max(0, call.seq - 1), call.seq, call.seq + 1])])
      for (const cursor of cursors) {
        const expected = oracle(recordingId, calls, cursor)
        expect(byId(index.current(cursor))).toEqual(expected.current)
        expect(byId(index.historical(cursor))).toEqual(expected.historical)
        expect(new Set([...index.current(cursor), ...index.historical(cursor)].map(binding => binding.id)).size)
          .toBe(index.current(cursor).length + index.historical(cursor).length)
      }
    }), { numRuns: 100 })
  })
})
