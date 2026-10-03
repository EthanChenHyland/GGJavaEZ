import { describe, expect, it } from 'vitest'
import type { ExecutionFact, ExecutionSite } from '../contracts/executionGraph'
import type { TraceEvent } from '../contracts/runtime'
import { createInitialState, applyEvent } from './state'
import { createReductionEngine } from './engine'
import { ExecutionHistory } from './history'
import { incomingEdges, invocationCompletion, outgoingEdges } from './executionGraph'
import { isExecutionFact } from './executionFactValidation'
const site: ExecutionSite = { frameId: 'root', owner: 'Program', name: 'main', descriptor: '()V', site: 2, rawSeq: 0, source: null }
const int = (value: number) => ({ kind: 'primitive', javaType: 'int', value } as const)
function event(fact: ExecutionFact, seq: number): TraceEvent { return { type: 'EXECUTION_FACT', fact, seq: seq + 1, eventId: `e${seq}`, source: null, label: fact.kind, importance: 'quiet' } }
const start: TraceEvent = { type: 'PROGRAM_START', seq: 0, eventId: 'start', source: null, label: 'Start', importance: 'major' }
function startedEngine() { const engine = createReductionEngine(); engine.apply(start); return engine }
function facts(): ExecutionFact[] {
  return [
    { kind: 'enter', context: site, invocationId: 'root', callerInvocationId: null, method: site, receiver: null, parameters: [] },
    { kind: 'write', context: site, target: { id: 'x', kind: 'variable', ownerId: 'root', name: 'banana', javaType: 'int' }, value: int(25), origin: { kind: 'constant', value: int(25) } },
    { kind: 'call', context: site, callId: 'call1', declared: { owner: 'Service', name: 'compute', descriptor: '(I)I' }, invokeKind: 'static', receiver: null, arguments: [int(25)], argumentOrigins: [{ kind: 'local', slotId: 'x' }], receiverOrigin: { kind: 'unknown' } },
    { kind: 'enter', context: { ...site, frameId: 'child' }, invocationId: 'child', callerInvocationId: 'root', callId: 'call1', method: { owner: 'Service', name: 'compute', descriptor: '(I)I' }, receiver: null, parameters: [{ slotId: 'amount', name: 'different', javaType: 'int', value: int(25) }] },
    { kind: 'return', context: { ...site, frameId: 'child' }, invocationId: 'child', value: int(30), origin: { kind: 'computed', site: 4, opcode: 96, inputs: [{ kind: 'local', slotId: 'amount' }, { kind: 'constant', value: int(5) }] } },
    { kind: 'exit', context: { ...site, frameId: 'child' }, invocationId: 'child' },
    { kind: 'call-return', context: site, callId: 'call1', value: int(30) },
    { kind: 'write', context: { ...site, site: 5 }, target: { id: 'result', kind: 'variable', ownerId: 'root', name: 'outcome', javaType: 'int' }, value: int(30), origin: { kind: 'call_result', site: 2 } },
  ]
}
describe('incremental truthful graph', () => {
  it('shares semantic behavior with the plain reducer at every prefix and arbitrary seek', () => {
    const events = [start, ...facts().map(event)]
    const engine = createReductionEngine()
    let plain = createInitialState()
    const prefixes = [plain]
    for (const event of events) {
      plain = applyEvent(plain, event)
      engine.apply(event)
      expect(JSON.stringify(engine.state)).toEqual(JSON.stringify(plain))
      prefixes.push(plain)
    }
    const history = new ExecutionHistory({ schemaVersion: 2, sourceFiles: [], checkpointInterval: 2 })
    history.append(events)
    for (const cursor of [9, 2, 6, 0, 4, 9]) expect(JSON.stringify(history.materialize(cursor))).toEqual(JSON.stringify(prefixes[cursor]))
    const graph = engine.state.executionGraph!
    expect(graph.calls.call1.calleeInvocationId).toBe('child')
    expect(graph.invocations.child.method.descriptor).toBe('(I)I')
    expect(graph.storage.amount.valueId).toBe(graph.storage.x.valueId)
    expect(graph.storage.result.valueId).toBe(graph.invocations.child.returnValueId)
    expect(invocationCompletion(graph, 'child')).toBe('normal-return')
    const computed = incomingEdges(graph, graph.invocations.child.returnValueId!).find(e => e.from !== 'child')!
    expect(graph.values[computed.from].kind).toBe('computed')
    expect(incomingEdges(graph, computed.from).filter(e => e.kind === 'COMPUTE')).toHaveLength(2)
    expect(outgoingEdges(graph, graph.storage.result.valueId!).some(e => e.to === 'result')).toBe(true)
    expect(() => { graph.storage.result.name = 'mutated' }).toThrow()
    expect(prefixes[2].executionGraph?.calls.call1).toBeUndefined()
  })
  it('unknown producers never search equal values or equal names', () => {
    const engine = startedEngine()
    engine.apply(event(facts()[0], 0))
    engine.apply(event(facts()[1], 1))
    engine.apply(event({ ...facts()[1], kind: 'write', target: { id: 'y', kind: 'variable', ownerId: 'root', name: 'banana', javaType: 'int' }, value: int(25), origin: { kind: 'unknown' } }, 2))
    const graph = engine.state.executionGraph!
    expect(graph.storage.x.valueId).not.toBe(graph.storage.y.valueId)
    expect(graph.values[graph.storage.y.valueId!].kind).toBe('unknown')
    expect(incomingEdges(graph, 'y')[0].evidence).toBe('unknown')
  })
  it('snapshot fields have no invented writer and no fabricated store event', () => {
    const engine = startedEngine()
    engine.apply(event({ kind: 'object', context: site, objectId: 'o', className: 'Record', fields: [{ slotId: 'field', name: 'balance', javaType: 'int', value: int(0) }] }, 0))
    const graph = engine.state.executionGraph!
    expect(graph.storage.field.writerInvocationId).toBeUndefined()
    expect(incomingEdges(graph, 'field')[0].kind).toBe('OBSERVE')
  })
  it('retains immutable degree indexes when repeated aliases cross the small-list boundary', () => {
    const engine = startedEngine()
    let plain = applyEvent(createInitialState(), start)
    const inputs: ExecutionFact[] = [facts()[0], facts()[1], ...Array.from({ length: 64 }, (_, index): ExecutionFact => ({
      kind: 'write', context: site, target: { id: `alias:${index}`, kind: 'variable', ownerId: 'root', name: `a${index}`, javaType: 'int' },
      value: int(25), origin: { kind: 'local', slotId: 'x' },
    }))]
    const roots = []
    for (const [index, fact] of inputs.entries()) {
      const next = event(fact, index)
      plain = applyEvent(plain, next)
      engine.apply(next)
      expect(JSON.stringify(engine.state)).toBe(JSON.stringify(plain))
      roots.push(engine.state.executionGraph!)
    }
    const graph = engine.state.executionGraph!
    expect(outgoingEdges(graph, 'x')).toHaveLength(64)
    expect(outgoingEdges(roots[5], 'x')).toHaveLength(4)
    expect(outgoingEdges(roots[10], 'x')).toHaveLength(9)
    expect(() => { graph.outgoing.x.push(1000) }).toThrow()
    expect(graph.outgoing.x.slice()).toEqual(outgoingEdges(graph, 'x').map(edge => graph.edges.indexOf(edge)))
  })
  it('does not mark enclosing construction complete when a superclass constructor returns', () => {
    const engine = startedEngine()
    const inputs: ExecutionFact[] = [facts()[0],
      { kind: 'call', context: site, callId: 'super', declared: { owner: 'java.lang.Object', name: '<init>', descriptor: '()V' },
        invokeKind: 'special', receiver: null, arguments: [], argumentOrigins: [], receiverOrigin: { kind: 'unknown' } },
      { kind: 'object', context: site, objectId: 'derived', className: 'Derived', fields: [] },
      { kind: 'call-return', context: site, callId: 'super', value: { kind: 'reference', javaType: 'Derived', objectId: 'derived' } },
    ]
    inputs.forEach((fact, index) => engine.apply(event(fact, index)))
    const partial = engine.state.executionGraph!
    expect(partial.objects.derived.constructedAt).toBeUndefined()
    expect(outgoingEdges(partial, 'super').some(edge => edge.kind === 'CONSTRUCT' && edge.to === 'derived')).toBe(true)
    engine.apply(event({ kind: 'constructed', context: site, objectId: 'derived', className: 'Derived', newSite: 1 }, inputs.length))
    expect(engine.state.executionGraph!.objects.derived.constructedAt).toBe('e4')
    expect(partial.objects.derived.constructedAt).toBeUndefined()
  })
  it('validates recipes and rejects malformed new contracts without accepting a partial head', () => {
    for (const fact of facts()) expect(isExecutionFact(fact)).toBe(true)
    expect(isExecutionFact({ ...facts()[0], context: { ...site, rawSeq: -1 } })).toBe(false)
    expect(isExecutionFact({ ...facts()[1], origin: { kind: 'local', slotId: '' } })).toBe(false)
    const engine = startedEngine()
    engine.apply(event(facts()[0], 0))
    const before = engine.state
    expect(() => engine.apply(event({ ...facts()[3], callId: 'missing', kind: 'enter', context: site, invocationId: 'bad', callerInvocationId: 'root', method: site, receiver: null, parameters: [] }, 1))).toThrow('Missing call')
    expect(engine.state).toBe(before)
  })
})
