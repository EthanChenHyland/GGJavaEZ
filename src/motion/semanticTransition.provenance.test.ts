import { describe, expect, it } from 'vitest'
import type { ExecutionFact, ExecutionGraph, ExecutionSite, GraphEdge, GraphStorage } from '../contracts/executionGraph'
import type { RuntimeState, RuntimeValue, TraceDocument, TraceEvent } from '../contracts/runtime'
import { applyExecutionFact } from '../runtime/executionGraph'
import { applyEvent, createInitialState, type ReductionStorage } from '../runtime/state'
import { deriveSemanticTransition, deriveSemanticTransitions, transitionsForTrace } from './semanticTransition'
import { transitionIsFlow } from './flowPresentation'

const scalar = (value = 25): Extract<RuntimeValue, { kind: 'primitive' }> => ({ kind: 'primitive', javaType: 'int', value })
const method = { owner: 'Ledger', name: 'accept', descriptor: '(I)I' }
const context: ExecutionSite = { ...method, frameId: 'caller', site: 7, rawSeq: 0, source: { fileId: 'Ledger.java', line: 3 } }
const store: Pick<ReductionStorage, 'put' | 'remove' | 'append'> = {
  put: (record, key, value) => ({ ...record, [key]: value }),
  remove: (record, key) => Object.fromEntries(Object.entries(record).filter(([id]) => id !== key)),
  append: (array, value) => [...array, value],
}
const storage = (id: string, ownerId = 'caller', kind: GraphStorage['kind'] = 'variable'): Omit<GraphStorage, 'valueId' | 'writerInvocationId'> =>
  ({ id, ownerId, kind, name: id, javaType: 'int' })
function initial(): RuntimeState {
  const frame = (id: string, names: string[]) => ({ id, callerFrameId: id === 'caller' ? null : 'caller', className: 'Ledger',
    methodName: 'accept', depth: id === 'caller' ? 0 : 1, status: 'active' as const, enteredAt: 'start',
    locals: Object.fromEntries(names.map(name => [name, { id: name, name, javaType: 'int', value: scalar() }])) })
  return { ...createInitialState(), activeFrameIds: ['caller', 'child'],
    frames: { caller: frame('caller', ['x', 'copy', 'destination']), child: frame('child', ['amount', 'this']) },
    objects: { account: { id: 'account', displayId: 1, className: 'Ledger', allocatedAt: 'allocate',
      fields: { balance: { id: 'balance', name: 'balance', javaType: 'int', value: scalar() } } } } }
}
type WithoutContext<T> = T extends unknown ? Omit<T, 'context'> : never
function step(before: RuntimeState, fact: WithoutContext<ExecutionFact>, id: string, at = context) {
  const event: TraceEvent = { type: 'EXECUTION_FACT', eventId: id, seq: before.cursor, label: 'Observed operation',
    importance: 'normal', source: null, fact: { ...fact, context: at } as ExecutionFact }
  const after = { ...before, cursor: before.cursor + 1,
    executionGraph: applyExecutionFact(before.executionGraph, event.fact, id, store) }
  return { event, after, transitions: deriveSemanticTransitions(before, event, after), transition: deriveSemanticTransition(before, event, after) }
}
function written(id = 'x') {
  return step(initial(), { kind: 'write', target: storage(id), value: scalar(), origin: { kind: 'constant', value: scalar() } }, 'initial-write').after
}

describe('truthful graph motion', () => {
  it('does not treat an observed stack ancestor through a library callback as a proven caller', () => {
    const before = written()
    const entry: TraceEvent = { type: 'ENTER_METHOD', eventId: 'callback', seq: 1, label: 'callback', source: null,
      importance: 'normal', frameId: 'child', callerFrameId: 'caller', className: 'Ledger', methodName: 'accept', locals: [] }
    expect(deriveSemanticTransition(before, entry, before)).toMatchObject({ kind: 'frame-enter', to: { kind: 'frame', id: 'child' }, evidence: 'local' })
    expect(deriveSemanticTransition(before, entry, before)).not.toHaveProperty('from')
    const exit: TraceEvent = { type: 'EXIT_METHOD', eventId: 'callback-exit', seq: 2, label: 'callback exit', source: null,
      importance: 'normal', frameId: 'child' }
    expect(deriveSemanticTransition(before, exit, before)).not.toHaveProperty('to')
    const entered = step(before, { kind: 'enter', invocationId: 'child', callerInvocationId: 'caller', method,
      receiver: null, parameters: [] }, 'callback-graph').transitions
    expect(entered.some(item => item.kind === 'frame-enter' && item.from)).toBe(false)
  })

  it('uses a bytecode local recipe even when names differ and other values happen to equal it', () => {
    const before = written()
    const { transition } = step(before, { kind: 'write', target: storage('destination'), value: scalar(), origin: { kind: 'local', slotId: 'x' } }, 'assign')
    expect(transition).toMatchObject({ kind: 'assignment', from: { kind: 'slot', id: 'x' },
      to: { kind: 'slot', id: 'destination' }, evidence: 'bytecode-derived' })
  })

  it('connects a differently named argument to its parameter through producer indexes', () => {
    const before = written()
    const call = step(before, { kind: 'call', callId: 'call-1', declared: method, invokeKind: 'static', receiver: null,
      arguments: [scalar()], argumentOrigins: [{ kind: 'local', slotId: 'x' }], receiverOrigin: { kind: 'unknown' } }, 'invoke').after
    const { transitions } = step(call, { kind: 'enter', invocationId: 'child', callerInvocationId: 'caller', method,
      callId: 'call-1', receiver: null, parameters: [{ slotId: 'amount', name: 'amount', javaType: 'int', value: scalar() }] }, 'enter')
    expect(transitions).toContainEqual(expect.objectContaining({ kind: 'parameter', from: { kind: 'slot', id: 'x' },
      to: { kind: 'slot', id: 'amount' }, evidence: 'bytecode-derived' }))
    expect(transitions).toContainEqual(expect.objectContaining({ kind: 'frame-enter', from: { kind: 'frame', id: 'caller' }, to: { kind: 'frame', id: 'child' } }))
  })

  it.each(['constant', 'computed', 'unknown'] as const)('keeps %s destinations local without borrowing an equal-valued variable', kind => {
    const origin = kind === 'constant' ? { kind, value: scalar() } : kind === 'computed'
      ? { kind, site: 4, opcode: 96, inputs: [{ kind: 'local' as const, slotId: 'x' }, { kind: 'constant' as const, value: scalar(5) }] } : { kind }
    const { transition } = step(written(), { kind: 'write', target: storage('destination'), value: scalar(), origin }, `write-${kind}`)
    expect(transition).toMatchObject({ kind: 'assignment', to: { kind: 'slot', id: 'destination' }, evidence: 'local' })
    expect(transition).not.toHaveProperty('from')
    expect(transitionIsFlow(transition!)).toBe(false)
  })

  it('does not collapse a computed argument onto one operand', () => {
    const call = step(written(), { kind: 'call', callId: 'computed-call', declared: method, invokeKind: 'static', receiver: null,
      arguments: [scalar()], argumentOrigins: [{ kind: 'computed', site: 4, opcode: 108, inputs: [{ kind: 'local', slotId: 'x' }, { kind: 'constant', value: scalar(2) }] }], receiverOrigin: { kind: 'unknown' } }, 'invoke').after
    const { transition } = step(call, { kind: 'enter', invocationId: 'child', callerInvocationId: 'caller', method,
      callId: 'computed-call', receiver: null, parameters: [{ slotId: 'amount', name: 'amount', javaType: 'int', value: scalar() }] }, 'enter')
    expect(transition).toMatchObject({ kind: 'frame-enter' })
    const parameter = step(call, { kind: 'enter', invocationId: 'child', callerInvocationId: 'caller', method,
      callId: 'computed-call', receiver: null, parameters: [{ slotId: 'amount', name: 'amount', javaType: 'int', value: scalar() }] }, 'enter').transitions.find(item => item.kind === 'parameter')!
    expect(parameter).toMatchObject({ to: { kind: 'slot', id: 'amount' }, evidence: 'local' })
    expect(parameter).not.toHaveProperty('from')
  })

  it('uses an explicit slot origin to disambiguate aliases instead of choosing by order', () => {
    const alias = step(written(), { kind: 'write', target: storage('copy'), value: scalar(), origin: { kind: 'local', slotId: 'x' } }, 'alias').after
    const { transition } = step(alias, { kind: 'write', target: storage('destination'), value: scalar(), origin: { kind: 'local', slotId: 'copy' } }, 'copy-write')
    expect(transition?.from).toEqual({ kind: 'slot', id: 'copy' })
  })

  it('uses the exact invoked reference and argument alias when a, b and p share a value version', () => {
    const reference: RuntimeValue = { kind: 'reference', objectId: 'account', javaType: 'Ledger' }
    const state = initial()
    state.frames.caller.locals = Object.fromEntries(['a', 'b', 'p'].map(id => [id, { id, name: id, javaType: 'Ledger', value: reference }]))
    const receiverSlot = 'child:local:0:receiver'
    state.frames.child.locals = Object.fromEntries(['recipient', receiverSlot].map(id => [id, { id, name: id, javaType: 'Ledger', value: reference }]))
    let before = step(state, { kind: 'write', target: { ...storage('a'), javaType: 'Ledger' }, value: reference, origin: { kind: 'unknown' } }, 'seed-alias').after
    for (const id of ['b', 'p']) before = step(before, { kind: 'write', target: { ...storage(id), javaType: 'Ledger' },
      value: reference, origin: { kind: 'local', slotId: 'a' } }, `alias-${id}`).after
    const declared = { ...method, descriptor: '(LLedger;)V' }
    const call = step(before, { kind: 'call', callId: 'alias-call', declared, invokeKind: 'virtual', receiver: reference,
      receiverOrigin: { kind: 'local', slotId: 'p' }, arguments: [reference], argumentOrigins: [{ kind: 'local', slotId: 'b' }] }, 'alias-invoke').after
    const recorded = call.executionGraph!.calls['alias-call']
    expect(recorded.argumentValueIds[0]).toBe(recorded.receiverValueId)
    expect(recorded.argumentOriginSlotIds).toEqual(['b'])
    expect(recorded.receiverOriginSlotId).toBe('p')
    const entered = step(call, { kind: 'enter', invocationId: 'child', callerInvocationId: 'caller', callId: 'alias-call', method: declared,
      receiver: reference, parameters: [{ slotId: 'recipient', name: 'recipient', javaType: 'Ledger', value: reference }] }, 'alias-enter').transitions
    expect(entered).toContainEqual(expect.objectContaining({ kind: 'parameter', from: { kind: 'slot', id: 'b' }, to: { kind: 'slot', id: 'recipient' } }))
    expect(entered).toContainEqual(expect.objectContaining({ kind: 'reference', from: { kind: 'slot', id: 'p' }, to: { kind: 'slot', id: receiverSlot } }))
    expect(entered.some(item => item.from?.id === 'a')).toBe(false)
  })

  it('prefers the explicit graph edge load over a raw-fact fallback', () => {
    const before = step(written(), { kind: 'write', target: storage('copy'), value: scalar(), origin: { kind: 'local', slotId: 'x' } }, 'alias').after
    const result = step(before, { kind: 'write', target: storage('destination'), value: scalar(), origin: { kind: 'local', slotId: 'x' } }, 'priority')
    const graph = result.after.executionGraph!
    const after = { ...result.after, executionGraph: { ...graph, edges: graph.edges.map(edge => edge.eventId === 'priority'
      ? { ...edge, originSlotId: 'copy' } : edge) } }
    expect(deriveSemanticTransition(before, result.event, after)?.from).toEqual({ kind: 'slot', id: 'copy' })
  })

  it('never searches outgoing aliases when the exact load slot is absent or has no geometry', () => {
    const call = step(written(), { kind: 'call', callId: 'legacy-call', declared: method, invokeKind: 'static', receiver: null,
      arguments: [scalar()], argumentOrigins: [{ kind: 'local', slotId: 'x' }], receiverOrigin: { kind: 'unknown' } }, 'legacy-invoke').after
    const result = step(call, { kind: 'enter', invocationId: 'child', callerInvocationId: 'caller', method, callId: 'legacy-call',
      receiver: null, parameters: [{ slotId: 'amount', name: 'amount', javaType: 'int', value: scalar() }] }, 'legacy-enter')
    const graph = result.after.executionGraph!
    for (const exactSlot of [undefined, 'not-in-world']) {
      const after = { ...result.after, executionGraph: { ...graph,
        outgoing: new Proxy(graph.outgoing, { get() { throw new Error('Alias search is forbidden') } }),
        edges: graph.edges.map(edge => edge.eventId === 'legacy-enter' && edge.kind === 'ARGUMENT_BIND'
          ? { ...edge, originSlotId: exactSlot } : edge) } }
      const parameter = deriveSemanticTransitions(call, result.event, after).find(item => item.kind === 'parameter')!
      expect(parameter).toMatchObject({ to: { kind: 'slot', id: 'amount' }, evidence: 'local' })
      expect(parameter).not.toHaveProperty('from')
    }
  })

  it('distinguishes direct parameter-to-field writes from computed field updates', () => {
    const before = step(written(), { kind: 'write', target: storage('amount', 'child'), value: scalar(), origin: { kind: 'local', slotId: 'x' } }, 'bind').after
    const direct = step(before, { kind: 'write', target: storage('balance', 'account', 'field'), value: scalar(), origin: { kind: 'local', slotId: 'amount' } }, 'field').transition
    expect(direct).toMatchObject({ kind: 'field-write', from: { kind: 'slot', id: 'amount' }, to: { kind: 'slot', id: 'balance' } })
    const computed = step(before, { kind: 'write', target: storage('balance', 'account', 'field'), value: scalar(), origin: { kind: 'computed', site: 8, opcode: 96, inputs: [{ kind: 'local', slotId: 'amount' }] } }, 'field-computed').transition
    expect(computed).not.toHaveProperty('from')
  })

  it('maps a primitive return to its actual return subdivision, then to its destination', () => {
    let before = step(written(), { kind: 'enter', invocationId: 'child', callerInvocationId: 'caller', method,
      receiver: null, parameters: [] }, 'enter-child', { ...context, frameId: 'child' }).after
    before = { ...before, frames: { ...before.frames, child: { ...before.frames.child, returnType: 'int', returnValue: scalar() } } }
    const returned = step(before, { kind: 'return', invocationId: 'child', value: scalar(), origin: { kind: 'local', slotId: 'x' } }, 'return-child', { ...context, frameId: 'child' })
    expect(returned.transition).toMatchObject({ kind: 'return', from: { kind: 'slot', id: 'x' }, to: { kind: 'slot', id: 'return:child' } })
    const graph = returned.after.executionGraph!
    const valueId = graph.invocations.child.returnValueId!
    const state = { ...returned.after, executionGraph: { ...graph, results: { ...graph.results, 'caller:7': valueId } } }
    expect(step(state, { kind: 'write', target: storage('destination'), value: scalar(), origin: { kind: 'call_result', site: 7 } }, 'receive').transition)
      .toMatchObject({ from: { kind: 'slot', id: 'return:child' }, to: { kind: 'slot', id: 'destination' } })
  })

  it('does not substitute an entire invocation for a return value without geometry', () => {
    const before = step(written(), { kind: 'enter', invocationId: 'child', callerInvocationId: 'caller', method,
      receiver: null, parameters: [] }, 'enter-no-return-port', { ...context, frameId: 'child' }).after
    const returned = step(before, { kind: 'return', invocationId: 'child', value: scalar(), origin: { kind: 'constant', value: scalar() } },
      'return-no-port', { ...context, frameId: 'child' }).after
    const graph = returned.executionGraph!
    const valueId = graph.invocations.child.returnValueId!
    const state = { ...returned, executionGraph: { ...graph, results: { ...graph.results, 'caller:7': valueId } } }
    const transfer = step(state, { kind: 'write', target: storage('destination'), value: scalar(), origin: { kind: 'call_result', site: 7 } }, 'receive-no-port').transition!
    expect(transfer).toMatchObject({ to: { kind: 'slot', id: 'destination' }, evidence: 'local' })
    expect(transfer).not.toHaveProperty('from')
  })

  it('distinguishes actual input consumption from Console bytes and output call operations', () => {
    const before = initial()
    const consoleInput: TraceEvent = { type: 'CONSOLE_INPUT', eventId: 'bytes', seq: 0, label: 'stdin bytes', source: null,
      importance: 'normal', frameId: 'caller', text: '25\n' }
    expect(deriveSemanticTransition(before, consoleInput, before)).toMatchObject({ evidence: 'local', to: { kind: 'io', id: 'stdin' } })
    expect(deriveSemanticTransition(before, consoleInput, before)).not.toHaveProperty('from')
    const call = step(before, { kind: 'call', callId: 'read-call', declared: { ...method, name: 'read' }, invokeKind: 'virtual', receiver: null,
      arguments: [], argumentOrigins: [], receiverOrigin: { kind: 'unknown' } }, 'read-call').after
    const consumed = step(call, { kind: 'call-return', callId: 'read-call', value: scalar(), inputText: '25' }, 'consumed').after
    expect(step(consumed, { kind: 'write', target: storage('destination'), value: scalar(), origin: { kind: 'call_result', site: 7 } }, 'read-destination').transition)
      .toMatchObject({ kind: 'assignment', from: { kind: 'io', id: 'stdin' }, to: { kind: 'slot', id: 'destination' } })
    const output = step(consumed, { kind: 'io', channel: 'stderr', text: 'value=25', callId: 'read-call' }, 'output').transition!
    expect(output).toMatchObject({ kind: 'output', evidence: 'local', to: { kind: 'io', id: 'stderr' } })
    expect(output).not.toHaveProperty('from')
  })

  it('omits graph endpoints without runtime geometry', () => {
    const before = initial()
    const { transitions } = step(before, { kind: 'write', target: storage('not-in-world'), value: scalar(), origin: { kind: 'constant', value: scalar() } }, 'invisible')
    expect(transitions).toEqual([])
  })

  it('keeps array read provenance in the shared indexed slot vocabulary', () => {
    const before = { ...written(), objects: { ...written().objects, vector: { id: 'vector', displayId: 2,
      className: 'int[]', allocatedAt: 'allocate-vector', fields: {}, array: { elementType: 'int' as const, length: 1,
        elements: [{ id: 'vector:element:0', name: '[0]', javaType: 'int', value: scalar() }] } } } }
    const read = step(before, { kind: 'read', target: storage('vector:element:0', 'vector', 'array-element'),
      value: scalar(), origin: { kind: 'unknown' } }, 'array-read').after
    expect(step(read, { kind: 'write', target: storage('destination'), value: scalar(), origin: { kind: 'array_read', site: 7 } }, 'array-destination').transition)
      .toMatchObject({ from: { kind: 'slot', id: 'vector:element:0' }, to: { kind: 'slot', id: 'destination' } })
  })

  it('retains reference identity and never makes a null value into a heap link', () => {
    const reference: RuntimeValue = { kind: 'reference', objectId: 'account', javaType: 'Ledger' }
    const before = step(initial(), { kind: 'write', target: { ...storage('x'), javaType: 'Ledger' }, value: reference,
      origin: { kind: 'unknown' } }, 'reference-source').after
    const { transitions } = step(before, { kind: 'write', target: { ...storage('destination'), javaType: 'Ledger' }, value: reference,
      origin: { kind: 'local', slotId: 'x' } }, 'reference-alias')
    expect(transitions).toContainEqual(expect.objectContaining({ kind: 'assignment', from: { kind: 'slot', id: 'x' }, to: { kind: 'slot', id: 'destination' } }))
    expect(transitions).toContainEqual(expect.objectContaining({ kind: 'reference', from: { kind: 'slot', id: 'destination' }, to: { kind: 'object', id: 'account' } }))
    const cleared = step(before, { kind: 'write', target: storage('destination'), value: { kind: 'null' }, origin: { kind: 'constant', value: { kind: 'null' } } }, 'null-destination').transitions
    expect(cleared).toHaveLength(1)
    expect(cleared[0]).toMatchObject({ value: { kind: 'null' }, to: { kind: 'slot', id: 'destination' }, evidence: 'local' })
    expect(cleared[0]).not.toHaveProperty('from')
  })

  it('does not change endpoints when identifiers and source line positions change', () => {
    const before = written()
    const fact = { kind: 'write' as const, target: storage('destination'), value: scalar(), origin: { kind: 'local' as const, slotId: 'x' } }
    const original = step(before, fact, 'rename').transition!
    const renamed = { ...before, frames: Object.fromEntries(Object.entries(before.frames).map(([id, frame]) => [id, { ...frame,
      locals: Object.fromEntries(Object.entries(frame.locals).map(([slotId, local]) => [slotId, { ...local, name: `renamed_${local.name}` }])) }])) }
    const shifted = step(renamed, { ...fact, target: { ...fact.target, name: 'changedDestinationName' } }, 'rename',
      { ...context, source: { ...context.source!, line: 300 } }).transition!
    expect({ ...shifted, source: original.source }).toEqual(original)
  })

  it('retains every graph edge transition across append publications and prefix stop', () => {
    const base = { source: context.source, label: 'operation', importance: 'normal' as const }
    const events: TraceEvent[] = [
      { ...base, type: 'PROGRAM_START', eventId: 'start', seq: 0 },
      { ...base, type: 'ENTER_METHOD', eventId: 'main', seq: 1, frameId: 'caller', callerFrameId: null,
        className: 'Ledger', methodName: 'main', locals: Object.values(initial().frames.caller.locals) },
      { ...base, type: 'EXECUTION_FACT', eventId: 'seed', seq: 2, fact: { context, kind: 'write', target: storage('x'),
        value: scalar(), origin: { kind: 'constant', value: scalar() } } },
      { ...base, type: 'EXECUTION_FACT', eventId: 'assign', seq: 3, fact: { context, kind: 'write', target: storage('destination'),
        value: scalar(), origin: { kind: 'local', slotId: 'x' } } },
      { ...base, type: 'CAPTURE_STOP', eventId: 'stop', seq: 4,
        recording: { state: 'STOPPED_LIMIT', reason: 'Observation cap', budget: 'events', lastRecordedSeq: 3, executionContinued: true } },
    ]
    const trace: TraceDocument = { schemaVersion: 2, demoId: 'graph-prefix', sourceFiles: [{ fileId: 'Ledger.java', name: 'Ledger.java', content: 'class Ledger {\n\n}' }], events: [] }
    let state = createInitialState()
    let expected: ReturnType<typeof deriveSemanticTransitions> = []
    let published = transitionsForTrace(trace)
    for (const event of events) {
      const retained = JSON.stringify(published)
      const next = applyEvent(state, event)
      expected = [...expected, ...deriveSemanticTransitions(state, event, next)]
      trace.events.push(event)
      const current = transitionsForTrace(trace)
      expect(current).toEqual(expected)
      expect(JSON.stringify(published)).toBe(retained)
      for (let index = 0; index < published.length; index++) expect(current[index]).toBe(published[index])
      expect(transitionsForTrace(trace)).toBe(current)
      published = current
      state = next
    }
    expect(published.some(item => item.kind === 'return' || item.kind === 'frame-exit')).toBe(false)
    expect(published.some(item => item.evidence === 'bytecode-derived')).toBe(true)
  })

  it('reads only the newly appended edge range even with a large retained prefix', () => {
    const before = written()
    const prior = before.executionGraph!
    const prefixSize = 100_000
    const edge: GraphEdge = { id: 'new-edge', kind: 'ASSIGN', from: 'unknown-value', to: 'destination',
      eventId: 'new-fact', evidence: 'unknown', context }
    const retained = new Array<GraphEdge>(prefixSize)
    const edges = new Proxy([...retained, edge], { get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key) && Number(key) < prefixSize) throw new Error('Historical prefix scanned')
      return Reflect.get(target, key, receiver)
    } })
    const graph: ExecutionGraph = { ...prior, edges, storage: { ...prior.storage, destination: storage('destination') } }
    const state = { ...before, executionGraph: { ...prior, edges: retained } }
    const event: TraceEvent = { type: 'EXECUTION_FACT', eventId: 'new-fact', seq: 1, label: 'new', source: null, importance: 'normal',
      fact: { kind: 'write', target: storage('destination'), value: scalar(), origin: { kind: 'unknown' }, context } }
    expect(deriveSemanticTransitions(state, event, { ...state, executionGraph: graph })).toHaveLength(1)
  })
})
