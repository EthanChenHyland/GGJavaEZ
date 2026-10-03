import { describe, expect, it } from 'vitest'
import type { RuntimeState, TraceDocument, TraceEvent } from '../contracts/runtime'
import controlSource from '../examples/demos/control/Main.java?raw'
import { applyEvent, createInitialState, getReferences, seek, validateTrace } from './index'
import { loadArrayTrace, loadControlTrace, loadPersonTrace, loadRecursionTrace } from '../examples/traces'

const main = 'frame:control-main:1'
const scanner = 'object:scanner:31'
const root = 'scope:control-main:root'
const forScope = 'scope:control-main:for'
const body = 'scope:control-main:body'
const loop = 'loop:control-main:for'
const slot = (name: string) => `slot:control-main:1:${name}`
const int = (value: number) => ({ kind: 'primitive' as const, javaType: 'int' as const, value })

type EventOf<T extends TraceEvent['type']> = Extract<TraceEvent, { type: T }>
function eventsOf<T extends TraceEvent['type']>(trace: TraceDocument, type: T): EventOf<T>[] {
  return trace.events.filter((event): event is EventOf<T> => event.type === type)
}
function freezeDeep(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
}
function atCursor<T extends TraceEvent>(event: T, cursor: number): T {
  return { ...event, seq: cursor, eventId: `test:${cursor}:${event.type}` }
}
function changedEvent<T extends TraceEvent['type']>(type: T, occurrence: number, change: (event: EventOf<T>) => void): TraceDocument {
  const trace = loadControlTrace()
  change(eventsOf(trace, type)[occurrence])
  return trace
}

describe('control fixture and deterministic reconstruction', () => {
  it('loads byte-identical source and models all three explicit corrected-return branches', () => {
    const trace = loadControlTrace()
    expect(trace.sourceFiles).toEqual([{ fileId: 'Main.java', name: 'Main.java', content: controlSource }])
    expect(trace.events).toHaveLength(72)
    expect(new Set(trace.events.map((event) => event.eventId)).size).toBe(72)
    expect(trace.events.map((event) => event.seq)).toEqual(Array.from({ length: 72 }, (_, i) => i))
    expect(controlSource.match(/return corrected;/g)).toHaveLength(3)
    expect(controlSource).toContain('} else if (value > 100) {')
    expect(controlSource).toContain('} else {')
    for (const event of eventsOf(trace, 'ENTER_METHOD')) expect(event.locals).toEqual([])
    const declarations = eventsOf(trace, 'DECLARE_LOCAL')
    expect(declarations).toHaveLength(15)
    expect(declarations.every((event) => event.slot.scopeId)).toBe(true)
    expect(declarations.filter((event) => event.slot.role === 'parameter').map((event) => event.slot.value))
      .toEqual([-7, 42, 130].map(int))
    expect(declarations.filter((event) => event.slot.name === 'corrected').map((event) => event.slot.value))
      .toEqual([0, 42, 100].map(int))
    expect(eventsOf(trace, 'RETURN_VALUE').map((event) => event.expression)).toEqual(['corrected', 'corrected', 'corrected'])
    expect(eventsOf(trace, 'ENTER_METHOD').map((event) => event.frameId))
      .toEqual([main, 'frame:clamp:1', 'frame:clamp:2', 'frame:clamp:3'])
    expect(eventsOf(trace, 'ALLOCATE_OBJECT')).toMatchObject([{ objectId: scanner, displayId: 31, className: 'Scanner', fields: [] }])
  })

  it('reconstructs every cursor forward, backward and in a seeded random permutation without changing inputs', () => {
    const trace = loadControlTrace()
    freezeDeep(trace)
    const sequential: RuntimeState[] = [createInitialState()]
    for (const event of trace.events) {
      const previous = sequential.at(-1)!
      const original = structuredClone(previous)
      freezeDeep(previous)
      sequential.push(applyEvent(previous, event))
      expect(previous).toEqual(original)
    }
    const cursors = Array.from({ length: trace.events.length + 1 }, (_, i) => i)
    const random = [...cursors]
    let seed = 12345
    for (let i = random.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const j = seed % (i + 1)
      ;[random[i], random[j]] = [random[j], random[i]]
    }
    for (const cursor of [...cursors, ...[...cursors].reverse(), ...random]) {
      const state = seek(trace, cursor)
      expect(state).toEqual(sequential[cursor])
      expect(state.currentSource).toEqual(cursor ? trace.events[cursor - 1].source : null)
      expect(state.console).toEqual(sequential[cursor].console)
      for (const frameId of state.activeFrameIds) {
        for (const local of Object.values(state.frames[frameId].locals)) {
          expect(state.scopes[local.scopeId!]).toMatchObject({ frameId, status: 'active' })
          expect(state.variableLifetimes.filter((life) => life.frameId === frameId && life.slot.id === local.id && life.exitedAt === undefined))
            .toHaveLength(1)
        }
      }
    }
    const final = sequential.at(-1)!
    expect(final.status).toBe('ended')
    expect(final.activeFrameIds).toEqual([])
    expect(final.variableLifetimes).toHaveLength(15)
    expect(final.variableLifetimes.every((life) => life.exitedAt)).toBe(true)
    expect(Object.values(final.scopes).every((scope) => scope.status === 'closed')).toBe(true)
    expect(Object.values(final.frames).every((frame) => Object.keys(frame.locals).length === 0)).toBe(true)
    expect(final.loops[loop]).toMatchObject({ iteration: 3, status: 'ended' })
    expect(final.objects[scanner].fields).toEqual({})
  })

  it('records exact declared/change/exit events for each separate lexical lifetime', () => {
    const trace = loadControlTrace()
    const declarations = eventsOf(trace, 'DECLARE_LOCAL')
    const final = seek(trace, 72)
    for (const declaration of declarations) {
      const life = final.variableLifetimes.find((record) => record.declaredAt === declaration.eventId)!
      expect(life).toMatchObject({ frameId: declaration.frameId, scopeId: declaration.slot.scopeId, source: declaration.source })
      expect(life.slot.id).toBe(declaration.slot.id)
      const exit = trace.events.find((event) => event.eventId === life.exitedAt)!
      expect(['EXIT_SCOPE', 'EXIT_METHOD']).toContain(exit.type)
      const beforeExit = seek(trace, exit.seq)
      expect(life.slot).toEqual(beforeExit.frames[declaration.frameId].locals[declaration.slot.id])
      const writes = trace.events.slice(declaration.seq + 1, exit.seq).filter((event) =>
        ((event.type === 'ASSIGN_LOCAL') && event.frameId === declaration.frameId && event.slotId === declaration.slot.id) ||
        (event.type === 'INPUT_READ' && event.frameId === declaration.frameId && event.destinationSlotId === declaration.slot.id) ||
        (event.type === 'RETURN_VALUE' && event.destination?.frameId === declaration.frameId && event.destination.slotId === declaration.slot.id) ||
        (event.type === 'CREATE_REFERENCE' && event.sourceSlot.kind === 'frame' && event.sourceSlot.frameId === declaration.frameId && event.sourceSlot.slotId === declaration.slot.id))
      expect(life.lastChangedAt).toBe(writes.at(-1)?.eventId ?? declaration.eventId)
      expect(seek(trace, exit.seq + 1).frames[declaration.frameId].locals[declaration.slot.id]).toBeUndefined()
    }
    expect(final.variableLifetimes.filter((life) => life.slot.id === slot('raw')).map((life) => life.slot.value))
      .toEqual([-7, 42, 130].map(int))
    expect(final.variableLifetimes.filter((life) => life.slot.id === slot('score')).map((life) => life.slot.value))
      .toEqual([0, 42, 100].map(int))
    const bodyEntries = eventsOf(trace, 'ENTER_SCOPE').filter((event) => event.scopeId === body)
    expect(bodyEntries).toHaveLength(3)
    expect(new Set(bodyEntries.map((event) => event.scopeId)).size).toBe(1)
    for (const entry of bodyEntries) {
      const state = seek(trace, entry.seq + 1)
      expect(state.scopes[body]).toMatchObject({ parentId: forScope, depth: 2, enteredAt: entry.eventId, status: 'active' })
      expect(state.scopes[body].exitedAt).toBeUndefined()
    }
  })

  it('transfers return values before unwinding both callee scopes, leaving caller scopes live', () => {
    const trace = loadControlTrace()
    for (const event of eventsOf(trace, 'RETURN_VALUE')) {
      const before = seek(trace, event.seq)
      const returned = seek(trace, event.seq + 1)
      expect(returned.activeFrameIds).toEqual(before.activeFrameIds)
      expect(returned.frames[main].locals[slot('score')].value).toEqual(event.value)
      expect(returned.variableLifetimes.slice().reverse().find((life) => life.slot.id === slot('score')))
        .toMatchObject({ lastChangedAt: event.eventId, slot: { value: event.value } })
      expect(returned.frames[event.frameId].returnValue).toEqual(event.value)
      expect(Object.values(returned.scopes).filter((scope) => scope.frameId === event.frameId && scope.status === 'active')).toHaveLength(2)
      const exit = trace.events[event.seq + 1]
      expect(exit.type).toBe('EXIT_METHOD')
      const exited = seek(trace, event.seq + 2)
      expect(exited.frames[event.frameId].locals).toEqual({})
      expect(exited.variableLifetimes.filter((life) => life.frameId === event.frameId).every((life) => life.exitedAt === exit.eventId)).toBe(true)
      expect(exited.scopes[body].status).toBe('active')
      expect(exited.frames[main].locals[slot('raw')]).toBeDefined()
    }
  })

  it('stores verified conditions and ordered I/O as immutable facts with a live Scanner reference', () => {
    const trace = loadControlTrace()
    const conditions = eventsOf(trace, 'EVALUATE_CONDITION')
    expect(conditions.map((event) => event.result)).toEqual([true, true, true, false, false, true, false, true, false])
    for (const event of conditions) {
      const state = seek(trace, event.seq + 1)
      expect(state.conditions[event.frameId]).toMatchObject({ eventId: event.eventId, operands: event.operands, result: event.result })
    }
    const io = trace.events.filter((event) => event.type === 'INPUT_READ' || event.type === 'OUTPUT_WRITE')
    expect(io.map((event) => event.text)).toEqual(['-7', '0\n', '42', '42\n', '130', '100\n', '142\n'])
    for (const [i, event] of io.entries()) {
      const state = seek(trace, event.seq + 1)
      expect(state.console).toHaveLength(i + 1)
      expect(state.console.at(-1)).toMatchObject({ eventId: event.eventId, frameId: main, source: event.source, text: event.text, value: event.value })
      expect(state.console.slice(0, -1)).toEqual(seek(trace, event.seq).console)
      if (event.type === 'INPUT_READ') {
        expect(state.frames[main].locals[slot('raw')].value).toEqual(event.value)
        expect(getReferences(state)).toMatchObject([{ targetObjectId: scanner }])
        expect(state.variableLifetimes.slice().reverse().find((life) => life.slot.id === slot('raw'))?.lastChangedAt).toBe(event.eventId)
      }
    }
    expect(seek(trace, 69).console.at(-1)?.value).toEqual(int(142))
  })

  it('isolates event payloads, history records, live values and all cached cursors', () => {
    const trace = loadControlTrace()
    for (const type of ['DECLARE_LOCAL', 'INPUT_READ', 'EVALUATE_CONDITION', 'RETURN_VALUE'] as const) {
      const event = structuredClone(eventsOf(trace, type)[0])
      const original = structuredClone(event)
      const state = applyEvent(seek(trace, event.seq), event)
      if (event.type === 'DECLARE_LOCAL') {
        event.slot.value = int(900)
        event.slot.name = 'mutated'
        expect(state.variableLifetimes.at(-1)?.slot).toEqual(original.type === 'DECLARE_LOCAL' ? original.slot : undefined)
      } else if (event.type === 'EVALUATE_CONDITION') {
        event.operands[0].value = int(900)
        event.operands[0].label = 'mutated'
        expect(state.conditions[event.frameId].operands).toEqual(original.type === 'EVALUATE_CONDITION' ? original.operands : undefined)
      } else {
        event.value = int(900)
        if (event.type === 'INPUT_READ') {
          expect(state.console.at(-1)?.value).toEqual(int(-7))
          state.console.at(-1)!.value = int(901)
          expect(state.frames[main].locals[slot('raw')].value).toEqual(int(-7))
          expect(state.variableLifetimes.slice().reverse().find((life) => life.slot.id === slot('raw'))?.slot.value).toEqual(int(-7))
        } else {
          event.destination!.slotId = 'mutated'
          state.returns.at(-1)!.value = int(901)
          expect(state.frames[main].locals[slot('score')].value).toEqual(int(0))
          expect(state.variableLifetimes.slice().reverse().find((life) => life.slot.id === slot('score'))?.slot.value).toEqual(int(0))
        }
      }
    }
    for (let cursor = 0; cursor <= trace.events.length; cursor++) {
      const snapshot = seek(trace, cursor)
      const copy = snapshotCopy(snapshot)
      snapshot.console.forEach((entry) => {
        expect(() => { entry.text = 'changed' }).toThrow(TypeError)
        expect(() => { entry.value = int(999) }).toThrow(TypeError)
      })
      snapshot.variableLifetimes.forEach((life) => {
        expect(() => { life.slot.value = int(999) }).toThrow(TypeError)
        expect(() => { life.exitedAt = 'changed' }).toThrow(TypeError)
      })
      Object.values(snapshot.scopes).forEach((scope) => expect(() => { scope.label = 'changed' }).toThrow(TypeError))
      Object.values(snapshot.conditions).forEach((condition) => expect(() => { condition.operands[0].label = 'changed' }).toThrow(TypeError))
      Object.values(snapshot.loops).forEach((loop) => expect(() => { loop.iteration = 999 }).toThrow(TypeError))
      expect(seek(trace, cursor)).toEqual(copy)
    }
    expect(seek(loadControlTrace(), 72)).toEqual(seek(trace, 72))
  })

  it('preserves Person, Recursion and Arrays without explicit scopes or console facts', () => {
    for (const trace of [loadPersonTrace(), loadRecursionTrace(), loadArrayTrace()]) {
      const state = seek(trace, trace.events.length)
      expect(state.status).toBe('ended')
      expect(state.scopes).toEqual({})
      expect(state.variableLifetimes).toEqual([])
      expect(state.conditions).toEqual({})
      expect(state.loops).toEqual({})
      expect(state.console).toEqual([])
    }
  })
})

describe('control malformed events', () => {
  it.each([
    ['ENTER_SCOPE', 'scopeId', ''], ['ENTER_SCOPE', 'parentId', 7], ['ENTER_SCOPE', 'labelScope', ''],
    ['EXIT_SCOPE', 'frameId', ''], ['EXIT_SCOPE', 'scopeId', null],
    ['EVALUATE_CONDITION', 'conditionId', ''], ['EVALUATE_CONDITION', 'kind', 'guess'],
    ['EVALUATE_CONDITION', 'expression', ''], ['EVALUATE_CONDITION', 'operands', []],
    ['EVALUATE_CONDITION', 'operands', [{ label: 'i', value: int(0) }]],
    ['EVALUATE_CONDITION', 'operands', [{ label: '', value: int(0) }, { label: '3', value: int(3) }]],
    ['EVALUATE_CONDITION', 'operands', [{ label: 'i', value: int(0), slotId: '' }, { label: '3', value: int(3) }]],
    ['EVALUATE_CONDITION', 'operands', [{ label: 'i', value: { kind: 'uninitialized' } }, { label: '3', value: int(3) }]],
    ['EVALUATE_CONDITION', 'operator', '!='], ['EVALUATE_CONDITION', 'result', 'true'],
    ['EVALUATE_CONDITION', 'takenLabel', ''], ['EVALUATE_CONDITION', 'skippedLabel', null],
    ['LOOP_ITERATION', 'loopId', ''], ['LOOP_ITERATION', 'iteration', -1],
    ['LOOP_ITERATION', 'iteration', 1.5], ['LOOP_ITERATION', 'status', 'pending'],
    ['INPUT_READ', 'readerObjectId', ''], ['INPUT_READ', 'method', ''],
    ['INPUT_READ', 'inputIndex', -1], ['INPUT_READ', 'inputIndex', 0.5],
    ['INPUT_READ', 'destinationSlotId', ''], ['INPUT_READ', 'text', 42],
    ['INPUT_READ', 'value', { kind: 'primitive', javaType: 'double', value: -7 }],
    ['INPUT_READ', 'value', int(2147483648)], ['OUTPUT_WRITE', 'text', 42],
    ['OUTPUT_WRITE', 'originSlotId', ''], ['OUTPUT_WRITE', 'value', { kind: 'uninitialized' }],
    ['OUTPUT_WRITE', 'value', { kind: 'reference', javaType: 'Scanner', objectId: scanner }],
  ] as const)('rejects malformed %s.%s', (type, key, value) => {
    const trace = loadControlTrace()
    const event = eventsOf(trace, type)[0] as unknown as Record<string, unknown>
    event[key] = value
    expect(() => validateTrace(trace)).toThrow('Malformed event')
  })

  it('rejects a malformed scope on any slot and eager parameters in scoped traces', () => {
    const trace = loadControlTrace()
    eventsOf(trace, 'DECLARE_LOCAL')[0].slot.scopeId = ''
    expect(() => validateTrace(trace)).toThrow('Malformed event')
    const other = loadControlTrace()
    eventsOf(other, 'ENTER_METHOD')[1].locals = [{ id: 'early', name: 'value', javaType: 'int', value: int(-7), role: 'parameter' }]
    expect(() => validateTrace(other)).toThrow('empty locals')
    const missing = loadControlTrace()
    delete eventsOf(missing, 'DECLARE_LOCAL')[0].slot.scopeId
    expect(() => validateTrace(missing)).toThrow('scopeId')
  })
})

describe('scope and lifetime validation', () => {
  it.each([
    ['wrong scope parent', () => changedEvent('ENTER_SCOPE', 2, (event) => { event.parentId = root }), 'innermost'],
    ['non-top frame entry', () => changedEvent('ENTER_SCOPE', 2, (event) => { event.frameId = 'missing' }), 'outside active frame'],
    ['non-top frame exit', () => changedEvent('EXIT_SCOPE', 0, (event) => { event.frameId = 'frame:clamp:1' }), 'outside active frame'],
    ['unknown scope exit', () => changedEvent('EXIT_SCOPE', 0, (event) => { event.scopeId = 'missing' }), 'not active'],
    ['outer scope exit', () => changedEvent('EXIT_SCOPE', 0, (event) => { event.scopeId = forScope }), 'innermost'],
    ['declaration in outer scope', () => changedEvent('DECLARE_LOCAL', 3, (event) => { event.slot.scopeId = root }), 'innermost'],
    ['declaration in missing scope', () => changedEvent('DECLARE_LOCAL', 3, (event) => { event.slot.scopeId = 'missing' }), 'innermost'],
    ['wrong-frame scope declaration', () => changedEvent('DECLARE_LOCAL', 5, (event) => { event.slot.scopeId = body }), 'innermost'],
    ['parameter in nested block', () => changedEvent('DECLARE_LOCAL', 6, (event) => { event.slot.role = 'parameter' }), 'root scope'],
    ['duplicate live name', () => changedEvent('DECLARE_LOCAL', 3, (event) => { event.slot.name = 'total' }), 'Duplicate live variable name'],
    ['lexical scope label changes', () => changedEvent('ENTER_SCOPE', 5, (event) => { event.labelScope = 'different body' }), 'identity changed'],
    ['lexical slot name changes', () => changedEvent('DECLARE_LOCAL', 7, (event) => { event.slot.name = 'other' }), 'identity changed'],
  ] as const)('rejects %s', (_name, makeTrace, message) => {
    expect(() => validateTrace(makeTrace())).toThrow(message)
  })

  it('rejects duplicate activation, double exit, and explicit removal/use of scoped locals', () => {
    const trace = loadControlTrace()
    const entered = seek(trace, 12)
    const entry = eventsOf(trace, 'ENTER_SCOPE').find((event) => event.scopeId === body)!
    // Root parent forgery would mask the duplicate; supply the currently correct parent.
    expect(() => applyEvent(entered, { ...atCursor(entry, entered.cursor), parentId: body })).toThrow('already active')
    const removal: TraceEvent = { ...trace.events[25], type: 'REMOVE_LOCAL', frameId: main, slotId: slot('raw') }
    expect(() => applyEvent(seek(trace, 25), removal)).toThrow('Scoped locals close')
    const exited = seek(trace, 26)
    expect(() => applyEvent(exited, atCursor(trace.events[25], exited.cursor))).toThrow('not active')
    expect(() => applyEvent(exited, { ...atCursor(trace.events[26], exited.cursor), type: 'ASSIGN_LOCAL', frameId: main, slotId: slot('raw'), value: int(0) })).toThrow('Unknown slot')
    const declaration = eventsOf(trace, 'DECLARE_LOCAL')[3]
    expect(() => applyEvent(exited, atCursor(declaration, exited.cursor))).toThrow('innermost')
    const missingScope = snapshotCopy(entered)
    missingScope.scopes[root].status = 'closed'
    expect(() => applyEvent(missingScope, { ...atCursor(trace.events[23], missingScope.cursor), type: 'ASSIGN_LOCAL', frameId: main, slotId: slot('total'), value: int(4) })).toThrow('active owning scope')
  })

  it('allows assignment to a live outer local inside a nested scope', () => {
    const trace = loadControlTrace()
    const state = seek(trace, 23)
    const changed = applyEvent(state, trace.events[23])
    expect(changed.frames[main].locals[slot('total')].scopeId).toBe(root)
    expect(changed.variableLifetimes.find((life) => life.slot.id === slot('total'))?.lastChangedAt).toBe(trace.events[23].eventId)
  })

  it.each(['ENTER_SCOPE', 'EXIT_SCOPE', 'EVALUATE_CONDITION', 'LOOP_ITERATION', 'INPUT_READ', 'OUTPUT_WRITE', 'DECLARE_LOCAL'] as const)(
    'rejects %s after returning until the method exits', (type) => {
      const trace = loadControlTrace()
      const returned = seek(trace, 22)
      const event = atCursor(eventsOf(trace, type)[0], returned.cursor)
      expect(() => applyEvent(returned, event)).toThrow('must exit after returning a value')
    },
  )

  it('rejects omitted scoped root entry even when ENTER_METHOD locals are empty', () => {
    const trace = loadControlTrace()
    trace.events[2] = { ...trace.events[2], type: 'LINE_EXECUTE', frameId: main }
    expect(() => validateTrace(trace)).toThrow('innermost')
  })
})

describe('condition and loop validation', () => {
  it('rejects forged observations and comparison results', () => {
    expect(() => validateTrace(changedEvent('EVALUATE_CONDITION', 0, (event) => { event.operands[0].value = int(9) }))).toThrow('Observed condition value mismatch')
    expect(() => validateTrace(changedEvent('EVALUATE_CONDITION', 0, (event) => { event.operands[0].slotId = 'missing' }))).toThrow('Unknown observed slot')
    for (const occurrence of [0, 3, 8]) {
      expect(() => validateTrace(changedEvent('EVALUATE_CONDITION', occurrence, (event) => { event.result = !event.result }))).toThrow('Condition result mismatch')
    }
    expect(() => validateTrace(changedEvent('EVALUATE_CONDITION', 0, (event) => { event.frameId = 'missing' }))).toThrow('outside active frame')
  })

  it.each([
    ['running starts at zero', 0, 0, 'running', 'sequential'],
    ['running skips iteration', 1, 3, 'running', 'sequential'],
    ['duplicate iteration', 1, 1, 'running', 'sequential'],
    ['premature termination', 0, 0, 'ended', 'condition result mismatch'],
    ['termination wrong count', 3, 2, 'ended', 'completed count'],
    ['running on false condition', 3, 4, 'running', 'condition result mismatch'],
  ] as const)('rejects %s', (_name, occurrence, iteration, status, message) => {
    expect(() => validateTrace(changedEvent('LOOP_ITERATION', occurrence, (event) => { event.iteration = iteration; event.status = status }))).toThrow(message)
  })

  it('requires a fresh matching loop condition and rejects stale, branch, cross-loop and ended reuse', () => {
    const trace = loadControlTrace()
    const iteration = eventsOf(trace, 'LOOP_ITERATION')[0]
    expect(() => applyEvent(seek(trace, iteration.seq + 1), atCursor(iteration, iteration.seq + 1))).toThrow('fresh loop condition')
    expect(() => validateTrace(changedEvent('LOOP_ITERATION', 0, (event) => { event.loopId = 'different-loop' }))).toThrow('condition identity')
    expect(() => validateTrace(changedEvent('EVALUATE_CONDITION', 0, (event) => { event.kind = 'branch' }))).toThrow('fresh loop condition')
    const missing = loadControlTrace()
    missing.events[9] = { ...missing.events[9], type: 'LINE_EXECUTE', frameId: main }
    expect(() => validateTrace(missing)).toThrow('fresh loop condition')
    const ended = seek(trace, 67)
    const condition = eventsOf(trace, 'EVALUATE_CONDITION').at(-1)!
    const evaluated = applyEvent(ended, atCursor(condition, ended.cursor))
    expect(() => applyEvent(evaluated, { ...atCursor(iteration, evaluated.cursor), iteration: 4 })).toThrow('already ended')
    const switchedFrame = snapshotCopy(seek(trace, 28))
    switchedFrame.loops[loop].frameId = 'another-frame'
    expect(() => applyEvent(switchedFrame, trace.events[28])).toThrow('another frame')
  })

  it('requires a running loop to terminate before a void exit', () => {
    const trace = loadControlTrace()
    const state = seek(trace, 11)
    expect(() => applyEvent(state, { ...atCursor(trace.events[70], state.cursor), type: 'EXIT_METHOD', frameId: main })).toThrow('Running loop must terminate')
  })

  it('supports a zero-iteration loop and nonvoid return unwinding a running loop', () => {
    const trace = loadControlTrace()
    const condition = eventsOf(trace, 'EVALUATE_CONDITION')[0]
    const iteration = eventsOf(trace, 'LOOP_ITERATION')[0]
    const before = seek(trace, condition.seq)
    const zero = applyEvent(before, { ...condition, operands: [{ label: '3', value: int(3) }, { label: '3', value: int(3) }], result: false })
    const ended = applyEvent(zero, { ...iteration, iteration: 0, status: 'ended' })
    expect(ended.loops[loop]).toMatchObject({ iteration: 0, status: 'ended' })

    const running = snapshotCopy(seek(trace, 11))
    running.frames[main].returnType = 'int'
    const returning: TraceEvent = { ...atCursor(trace.events[21], running.cursor), type: 'RETURN_VALUE', frameId: main, destination: null, value: int(0) }
    const returned = applyEvent(running, returning)
    expect(returned.loops[loop].status).toBe('running')
    const exit = { ...atCursor(trace.events[70], returned.cursor), type: 'EXIT_METHOD' as const, frameId: main }
    const exited = applyEvent(returned, exit)
    expect(exited.loops[loop]).toMatchObject({ eventId: exit.eventId, status: 'ended', iteration: 1 })
    expect(exited.frames[main].locals).toEqual({})
    expect(Object.values(exited.scopes).every((scope) => scope.status === 'closed')).toBe(true)
  })

  it.each(['<', '>', '<=', '=='] as const)('verifies operator %s from concrete numeric operands', (operator) => {
    const trace = loadControlTrace()
    const template = eventsOf(trace, 'EVALUATE_CONDITION')[0]
    const before = seek(trace, template.seq)
    const result = operator === '<' || operator === '<='
    const event = { ...template, operator, result }
    expect(applyEvent(before, event).conditions[main].result).toBe(result)
    expect(() => applyEvent(before, { ...event, result: !result })).toThrow('Condition result mismatch')
  })

  it('permits boolean equality and rejects ordering boolean or unevaluated operands', () => {
    const trace = loadControlTrace()
    const event = eventsOf(trace, 'EVALUATE_CONDITION')[0]
    const before = seek(trace, event.seq)
    const bool = { kind: 'primitive' as const, javaType: 'boolean' as const, value: true }
    const booleanEvent = { ...event, operator: '==' as const, result: true, operands: [{ label: 'true', value: bool }, { label: 'true', value: bool }] as const }
    expect(applyEvent(before, booleanEvent).conditions[main].result).toBe(true)
    expect(() => applyEvent(before, { ...booleanEvent, operator: '<' })).toThrow('must be numeric')
    const unknown = { ...event, operands: [{ label: 'x', value: { kind: 'uninitialized' as const } }, event.operands[1]] as const }
    expect(() => applyEvent(before, unknown)).toThrow('concrete scalars')
  })
})

describe('console and reader validation', () => {
  it.each([
    ['unknown reader', 'INPUT_READ', (event: EventOf<'INPUT_READ'>) => { event.readerObjectId = 'missing' }, 'existing object'],
    ['out of order input', 'INPUT_READ', (event: EventOf<'INPUT_READ'>) => { event.inputIndex = 1 }, 'consumed input count'],
    ['unknown input destination', 'INPUT_READ', (event: EventOf<'INPUT_READ'>) => { event.destinationSlotId = 'missing' }, 'Unknown slot'],
    ['wrong destination type', 'INPUT_READ', (event: EventOf<'INPUT_READ'>) => { event.destinationSlotId = slot('input') }, 'Value type mismatch'],
    ['non-top input frame', 'INPUT_READ', (event: EventOf<'INPUT_READ'>) => { event.frameId = 'missing' }, 'outside active frame'],
    ['non-top output frame', 'OUTPUT_WRITE', (event: EventOf<'OUTPUT_WRITE'>) => { event.frameId = 'missing' }, 'outside active frame'],
    ['missing output origin', 'OUTPUT_WRITE', (event: EventOf<'OUTPUT_WRITE'>) => { event.originSlotId = 'missing' }, 'Unknown output origin'],
    ['wrong observed output', 'OUTPUT_WRITE', (event: EventOf<'OUTPUT_WRITE'>) => { event.value = int(1); event.text = '1\n' }, 'Observed output value mismatch'],
    ['wrong output text', 'OUTPUT_WRITE', (event: EventOf<'OUTPUT_WRITE'>) => { event.text = '999\n' }, 'text and scalar value mismatch'],
  ] as const)('rejects %s', (_name, type, change, message) => {
    const trace = loadControlTrace()
    const event = eventsOf(trace, type)[0]
    // Each table row couples the event discriminator with its typed mutation.
    if (event.type === 'INPUT_READ') (change as (event: EventOf<'INPUT_READ'>) => void)(event)
    else (change as (event: EventOf<'OUTPUT_WRITE'>) => void)(event)
    expect(() => validateTrace(trace)).toThrow(message)
  })

  it.each(['7', '-7.0', '-7x', ' -7', '-7\n', 'NaN', '-2147483649', ''])('rejects input text %j', (text) => {
    const trace = changedEvent('INPUT_READ', 0, (event) => { event.text = text })
    expect(() => validateTrace(trace)).toThrow()
  })

  it('rejects repeated input indices and a reader with no current live reference', () => {
    expect(() => validateTrace(changedEvent('INPUT_READ', 1, (event) => { event.inputIndex = 0 }))).toThrow('consumed input count')
    const trace = loadControlTrace()
    const input = eventsOf(trace, 'INPUT_READ')[0]
    const before = snapshotCopy(seek(trace, input.seq))
    before.frames[main].locals[slot('input')].value = { kind: 'null' }
    expect(() => applyEvent(before, input)).toThrow('live reference')
    const otherReader = snapshotCopy(seek(trace, input.seq))
    otherReader.objects[scanner].className = 'OtherReader'
    expect(applyEvent(otherReader, input).console.at(-1)?.value).toEqual(input.value)
  })

  it('supports signed Java int endpoints and console scalar output without an observed origin', () => {
    const trace = loadControlTrace()
    const read = eventsOf(trace, 'INPUT_READ')[0]
    const beforeRead = seek(trace, read.seq)
    for (const [value, text] of [[-2147483648, '-2147483648'], [2147483647, '+2147483647'], [0, '-0']] as const) {
      const next = applyEvent(beforeRead, { ...read, value: int(value), text })
      expect(next.console.at(-1)?.value).toEqual(int(value))
    }
    const output = eventsOf(trace, 'OUTPUT_WRITE')[0]
    const beforeOutput = seek(trace, output.seq)
    for (const [value, text] of [
      [int(42), '42'], [{ kind: 'primitive' as const, javaType: 'boolean' as const, value: false }, 'false\n'],
      [{ kind: 'stringSummary' as const, javaType: 'String' as const, value: '' }, ''], [{ kind: 'null' as const }, 'null'],
    ] as const) {
      const event = { ...output, value, text, originSlotId: undefined }
      expect(applyEvent(beforeOutput, event).console.at(-1)).toMatchObject({ value, text })
    }
  })
})

// Persistent seek snapshots cross the wire through JSON; clone only deliberate forged test states.
function snapshotCopy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
