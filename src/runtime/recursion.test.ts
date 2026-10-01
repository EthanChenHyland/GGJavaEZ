import { describe, expect, it } from 'vitest'
import type { RuntimeState, TraceDocument, TraceEvent } from '../contracts/runtime'
import recursionSource from '../examples/demos/recursion/Main.java?raw'
import { applyEvent, createInitialState, getReferences, seek, validateTrace } from './index'
import { loadPersonTrace, loadRecursionTrace } from '../examples/traces'

const mainId = 'frame:recursion-main:1'
const resultId = 'slot:recursion-main:1:result'
const frameId = (n: number) => `frame:factorial:${n}`
const childId = (n: number) => `slot:factorial:${n}:child`
const int = (value: number) => ({ kind: 'primitive' as const, javaType: 'int' as const, value })

function returnEvents(trace: TraceDocument) {
  return trace.events.filter((event) => event.type === 'RETURN_VALUE')
}

function freezeDeep(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
}

describe('recursive factorial trace', () => {
  it('uses the requested source and finite pre-authored semantic events', () => {
    const trace = loadRecursionTrace()
    expect(trace.sourceFiles).toEqual([{ fileId: 'Main.java', name: 'Main.java', content: recursionSource }])
    expect(trace.events).toHaveLength(36)
    expect(trace.events.map((event) => event.seq)).toEqual(Array.from({ length: 36 }, (_, i) => i))
    expect(new Set(trace.events.map((event) => event.eventId)).size).toBe(36)
    expect(trace.events[0].type).toBe('PROGRAM_START')
    expect(trace.events.at(-1)?.type).toBe('PROGRAM_END')
    expect(trace.events.some((event) => event.type === 'ALLOCATE_OBJECT')).toBe(false)
  })

  it('reconstructs every cursor forward, backward, and in arbitrary order', () => {
    const trace = loadRecursionTrace()
    const sequential: RuntimeState[] = [createInitialState()]
    for (const event of trace.events) {
      const previous = sequential.at(-1)!
      const copy = structuredClone(previous)
      freezeDeep(previous)
      const next = applyEvent(previous, event)
      expect(previous).toEqual(copy)
      sequential.push(next)
    }
    const order = [
      ...Array.from({ length: 37 }, (_, i) => i),
      ...Array.from({ length: 37 }, (_, i) => 36 - i),
      ...Array.from({ length: 37 }, (_, i) => (i * 17) % 37),
    ]
    for (const cursor of order) {
      const state = seek(trace, cursor)
      expect(state).toEqual(sequential[cursor])
      expect(state.objects).toEqual({})
      expect(getReferences(state)).toEqual([])
      expect(state.currentSource).toEqual(cursor === 0 ? null : trace.events[cursor - 1].source)
    }
  })

  it('has six distinct invocation identities and correctly nested live frames', () => {
    const trace = loadRecursionTrace()
    const peak = seek(trace, 17)
    expect(peak.activeFrameIds).toEqual([mainId, ...[5, 4, 3, 2, 1].map(frameId)])
    expect(Object.keys(peak.frames)).toEqual(peak.activeFrameIds)
    for (const n of [5, 4, 3, 2, 1]) {
      const frame = peak.frames[frameId(n)]
      expect(frame).toMatchObject({
        id: frameId(n), depth: 6 - n, status: 'active',
        callerFrameId: n === 5 ? mainId : frameId(n + 1),
        invocationLabel: `factorial(${n})`, returnType: 'int',
      })
      expect(frame.locals[`slot:factorial:${n}:n`]).toMatchObject({ name: 'n', role: 'parameter', value: int(n) })
      expect(frame.returnValue).toBeUndefined()
      if (n > 1) expect(frame.locals[childId(n)]).toMatchObject({ role: 'operand', value: { kind: 'uninitialized' } })
      else expect(frame.locals[childId(n)]).toBeUndefined()
    }
    expect(peak.frames[mainId].locals[resultId].value).toEqual({ kind: 'uninitialized' })
    for (const event of trace.events.filter((event) => event.type === 'EXIT_METHOD')) {
      const before = seek(trace, event.seq)
      const after = seek(trace, event.seq + 1)
      expect(before.activeFrameIds.at(-1)).toBe(event.frameId)
      expect(after.activeFrameIds).toEqual(before.activeFrameIds.slice(0, -1))
      expect(after.frames[event.frameId].status).toBe('returned')
      expect(after.frames[event.frameId].enteredAt).toBe(before.frames[event.frameId].enteredAt)
    }
  })

  it('transfers 1, 2, 6, 24, and 120 to the direct caller before popping each frame', () => {
    const trace = loadRecursionTrace()
    expect(returnEvents(trace).map((event) => event.value)).toEqual([1, 2, 6, 24, 120].map(int))
    for (const event of returnEvents(trace)) {
      const before = seek(trace, event.seq)
      const state = seek(trace, event.seq + 1)
      expect(state.activeFrameIds).toEqual(before.activeFrameIds)
      expect(state.frames[event.frameId].returnValue).toEqual(event.value)
      expect(state.frames[event.frameId].status).toBe('active')
      expect(event.destination!.frameId).toBe(before.activeFrameIds.at(-2))
      expect(state.frames[event.destination!.frameId].locals[event.destination!.slotId].value).toEqual(event.value)
      expect(state.returns.at(-1)).toEqual({
        eventId: event.eventId, frameId: event.frameId, destination: event.destination,
        value: event.value, expression: event.expression,
      })
    }
    expect(seek(trace, 26).frames[frameId(3)].locals[childId(3)].value).toEqual(int(2))
    expect(seek(trace, 26).frames[frameId(3)].returnValue).toEqual(int(6))
    const final = seek(trace, trace.events.length)
    expect(final).toMatchObject({ status: 'ended', activeFrameIds: [], objects: {} })
    expect(final.frames[mainId].locals[resultId].value).toEqual(int(120))
    expect(final.returns).toHaveLength(5)
    expect(final.returns.map((transfer) => transfer.expression)).toEqual(['1', '2 × 1', '3 × 2', '4 × 6', '5 × 24'])
  })

  it('copies causal records and isolates cached snapshots from consumer mutation', () => {
    const trace = loadRecursionTrace()
    const event = structuredClone(returnEvents(trace)[0])
    const before = seek(trace, event.seq)
    const after = applyEvent(before, event)
    event.destination!.slotId = 'mutated'
    event.value = int(999)
    expect(after.returns[0].value).toEqual(int(1))
    expect(after.returns[0].destination?.slotId).toBe(childId(2))
    after.returns[0].value = int(100)
    expect(after.frames[frameId(1)].returnValue).toEqual(int(1))
    expect(after.frames[frameId(2)].locals[childId(2)].value).toEqual(int(1))
    const cached = seek(trace, 24)
    cached.returns[0].value = int(-1)
    cached.frames[frameId(2)].returnValue = int(-1)
    expect(seek(trace, 24).returns[0].value).toEqual(int(1))
    expect(seek(trace, 24).frames[frameId(2)].returnValue).toEqual(int(2))
  })

  it('preserves schema-v1 Person void exits and results', () => {
    const trace = loadPersonTrace()
    expect(trace.events).toHaveLength(21)
    const final = seek(trace, trace.events.length)
    expect(final.returns).toEqual([])
    expect(final.objects['object:person:17'].fields['slot:object:person:17:age'].value).toEqual(int(18))
  })
})

describe('return lifecycle validation', () => {
  it.each([
    ['non-top frame', (event: Extract<TraceEvent, { type: 'RETURN_VALUE' }>) => { event.frameId = frameId(2) }, 'outside top frame'],
    ['skipped caller', (event: Extract<TraceEvent, { type: 'RETURN_VALUE' }>) => { event.destination!.frameId = frameId(3) }, 'direct caller'],
    ['missing caller destination', (event: Extract<TraceEvent, { type: 'RETURN_VALUE' }>) => { event.destination = null }, 'direct caller'],
    ['undeclared caller slot', (event: Extract<TraceEvent, { type: 'RETURN_VALUE' }>) => { event.destination!.slotId = 'missing' }, 'Unknown slot'],
    ['incompatible return value', (event: Extract<TraceEvent, { type: 'RETURN_VALUE' }>) => { event.value = { kind: 'primitive', javaType: 'boolean', value: true } }, 'Value type mismatch'],
    ['unevaluated return value', (event: Extract<TraceEvent, { type: 'RETURN_VALUE' }>) => { event.value = { kind: 'uninitialized' } }, 'Malformed event'],
  ] as const)('rejects %s', (_, change, message) => {
    const trace = loadRecursionTrace()
    change(returnEvents(trace)[0])
    expect(() => validateTrace(trace)).toThrow(message)
  })

  it('rejects a duplicate return from a frame', () => {
    const trace = loadRecursionTrace()
    const first = returnEvents(trace)[0]
    const exit = trace.events[first.seq + 1]
    trace.events[exit.seq] = { ...first, seq: exit.seq, eventId: exit.eventId }
    expect(() => validateTrace(trace)).toThrow('Duplicate return')
  })

  it('requires non-void calls to produce a return before exiting', () => {
    const trace = loadRecursionTrace()
    const event = returnEvents(trace)[0]
    trace.events[event.seq] = { ...event, type: 'LINE_EXECUTE' }
    expect(() => validateTrace(trace)).toThrow('must return a value before exit')
  })

  it.each(['LINE_EXECUTE', 'ASSIGN_LOCAL', 'ENTER_METHOD'] as const)(
    'rejects %s after a return until the frame exits', (type) => {
      const trace = loadRecursionTrace()
      const before = seek(trace, 20)
      const original = structuredClone(before)
      const base = {
        seq: before.cursor, eventId: `invalid:after-return:${type}`,
        source: { fileId: 'Main.java', line: 4 }, label: 'Execute after return', importance: 'normal' as const,
      }
      const events: Record<typeof type, TraceEvent> = {
        LINE_EXECUTE: { ...base, type: 'LINE_EXECUTE', frameId: frameId(1) },
        ASSIGN_LOCAL: { ...base, type: 'ASSIGN_LOCAL', frameId: frameId(1), slotId: 'slot:factorial:1:n', value: int(99) },
        ENTER_METHOD: { ...base, type: 'ENTER_METHOD', frameId: 'invalid:child', callerFrameId: frameId(1), className: 'Main', methodName: 'factorial', returnType: 'int', locals: [] },
      }
      expect(() => applyEvent(before, events[type])).toThrow('must exit after returning a value')
      expect(before).toEqual(original)
      const afterExit = applyEvent(before, trace.events[20])
      expect(afterExit.activeFrameIds.at(-1)).toBe(frameId(2))
      expect(() => applyEvent(afterExit, trace.events[21])).not.toThrow()
    },
  )

  it('requires the returning frame to declare a non-void return type', () => {
    for (const returnType of [undefined, 'void']) {
      const trace = loadRecursionTrace()
      const entry = trace.events.find((event) => event.type === 'ENTER_METHOD' && event.frameId === frameId(1))!
      if (entry.type !== 'ENTER_METHOD') throw new Error('Missing entry')
      entry.returnType = returnType
      expect(() => validateTrace(trace)).toThrow('has no return type')
    }
  })

  it('checks the caller destination type independently of the return type', () => {
    const trace = loadRecursionTrace()
    const entry = trace.events.find((event) => event.type === 'ENTER_METHOD' && event.frameId === frameId(2))!
    if (entry.type !== 'ENTER_METHOD') throw new Error('Missing entry')
    entry.locals.find((slot) => slot.role === 'operand')!.javaType = 'boolean'
    expect(() => validateTrace(trace)).toThrow('Value type mismatch for slot:factorial:2:child')
  })

  it('supports a root scalar return with no caller destination', () => {
    const template = loadRecursionTrace()
    const rootEvents: TraceEvent[] = [
      { ...template.events[0] },
      { ...template.events[4], type: 'ENTER_METHOD', frameId: 'root', callerFrameId: null, className: 'Main', methodName: 'factorial', locals: [], returnType: 'int' },
      { ...returnEvents(template)[0], frameId: 'root', destination: null },
      { ...template.events[20], type: 'EXIT_METHOD', frameId: 'root' },
      { ...template.events.at(-1)! },
    ]
    const events = rootEvents.map((event, seq) => ({ ...event, seq, eventId: `root:${seq}` }))
    const trace = validateTrace({ ...template, events })
    expect(seek(trace, 5).returns[0]).toMatchObject({ frameId: 'root', destination: null, value: int(1) })
    const bad = structuredClone(trace)
    const event = returnEvents(bad)[0]
    event.destination = { frameId: mainId, slotId: resultId }
    expect(() => validateTrace(bad)).toThrow('Root return cannot have a caller destination')
  })

  it('rejects malformed optional invocation metadata and slot roles', () => {
    const trace = loadRecursionTrace()
    const entry = trace.events[4]
    if (entry.type !== 'ENTER_METHOD') throw new Error('Missing entry')
    entry.invocationLabel = ''
    expect(() => validateTrace(trace)).toThrow('Malformed event')
    entry.invocationLabel = 'factorial(5)'
    ;(entry.locals[0] as unknown as { role: string }).role = 'invented'
    expect(() => validateTrace(trace)).toThrow('Malformed event')
  })
})
