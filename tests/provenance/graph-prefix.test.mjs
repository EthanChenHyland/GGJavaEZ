import { expect, test } from 'vitest';
import { applyExecutionFact, emptyExecutionGraph, incomingEdges, invocationCompletion, outgoingEdges, invocationInputs, fieldOrigin, returnDestinations, operationOutput, exceptionPath } from '../../src/runtime/executionGraph.ts';
import { applyEvent, createInitialState } from '../../src/runtime/state.ts';
import { createReductionEngine } from '../../src/runtime/engine.ts';
import { ExecutionHistory } from '../../src/runtime/history.ts';

const int = value => ({ kind: 'primitive', javaType: 'int', value });
const nil = { kind: 'null' };
const unknown = { kind: 'unknown' };
const method = (name = 'main', descriptor = '()V', owner = 'FreshProgram') => ({ owner, name, descriptor });
const at = (frameId = 'root', site = 0, name = 'main', descriptor = '()V') => ({ ...method(name, descriptor), frameId, site, source: null, rawSeq: site });
const target = (id, name = id, kind = 'variable', ownerId = 'root', javaType = 'int') => ({ id, name, kind, ownerId, javaType });
const constant = value => ({ kind: 'constant', value });
const local = slotId => ({ kind: 'local', slotId });
const plain = { put: (record, key, value) => ({ ...record, [key]: value }), append: (array, value) => [...array, value] };
function fold(facts) { return facts.reduce((graph, fact, index) => applyExecutionFact(graph, fact, `fact:${index}`, plain), emptyExecutionGraph()); }
function eventsFor(facts, stopped = false) {
  const payloads = [{ type: 'PROGRAM_START' }, ...facts.map(fact => ({ type: 'EXECUTION_FACT', fact }))];
  if (stopped) payloads.push({ type: 'CAPTURE_STOP', recording: {
    state: 'STOPPED_LIMIT', reason: 'Raw recording budget reached', budget: 'events', lastRecordedSeq: facts.length,
    executionContinued: true,
  } });
  return payloads.map((payload, seq) => ({ eventId: `event:${seq}`, seq, source: null, label: 'Observed semantic event', importance: 'quiet', ...payload }));
}
const root = { context: at(), kind: 'enter', invocationId: 'root', callerInvocationId: null, method: method(), receiver: null, parameters: [] };

function returnChain(observed = int(42)) {
  const reference = observed.kind === 'reference';
  const javaType = reference ? 'FreshObject' : observed.kind === 'null' ? 'FreshObject' : 'int';
  const returnDescriptor = javaType === 'int' ? '()I' : '()LFreshObject;';
  const consumeDescriptor = javaType === 'int' ? '(I)V' : '(LFreshObject;)V';
  return [root,
    { context: at('root', 10), kind: 'call', callId: 'compute-call', declared: method('compute', returnDescriptor), invokeKind: 'static', receiver: null, arguments: [], argumentOrigins: [], receiverOrigin: unknown },
    { context: at('callee', 0, 'compute', returnDescriptor), kind: 'enter', invocationId: 'callee', callerInvocationId: 'root', callId: 'compute-call', method: method('compute', returnDescriptor), receiver: null, parameters: [] },
    { context: at('callee', 1, 'compute', returnDescriptor), kind: 'return', invocationId: 'callee', value: observed, origin: constant(observed) },
    { context: at('callee', 2, 'compute', returnDescriptor), kind: 'exit', invocationId: 'callee' },
    { context: at('root', 10), kind: 'call-return', callId: 'compute-call', value: observed },
    { context: at('root', 11), kind: 'write', target: target('destination', 'renamedResult', 'variable', 'root', javaType), value: observed, origin: { kind: 'call_result', site: 10 } },
    { context: at('root', 20), kind: 'call', callId: 'consume-call', declared: method('consume', consumeDescriptor), invokeKind: 'static', receiver: null, arguments: [observed], argumentOrigins: [{ kind: 'call_result', site: 10 }], receiverOrigin: unknown },
    { context: at('consumer', 0, 'consume', consumeDescriptor), kind: 'enter', invocationId: 'consumer', callerInvocationId: 'root', callId: 'consume-call', method: method('consume', consumeDescriptor), receiver: null,
      parameters: [{ slotId: 'consumer:parameter', name: 'otherName', javaType, value: observed }] },
  ];
}

test('unknown producers never search equal values, equal names or neighboring context', () => {
  const graph = fold([root,
    { context: at('root', 1), kind: 'write', target: target('source', 'balance'), value: int(25), origin: constant(int(25)) },
    { context: at('root', 2), kind: 'write', target: target('unproven', 'balance'), value: int(25), origin: unknown },
    { context: at('root', 3), kind: 'write', target: target('actual-copy', 'differentName'), value: int(25), origin: local('source') },
  ]);
  const source = graph.storage.source.valueId;
  const unproven = graph.storage.unproven.valueId;
  expect(unproven).not.toBe(source);
  expect(graph.values[unproven].kind).toBe('unknown');
  expect(incomingEdges(graph, 'unproven')).toMatchObject([{ kind: 'ASSIGN', from: unproven, evidence: 'unknown' }]);
  expect(graph.storage['actual-copy'].valueId).toBe(source);
  expect(incomingEdges(graph, 'actual-copy')[0].originSlotId).toBe('source');
  expect(incomingEdges(graph, 'actual-copy')).toMatchObject([{ kind: 'ASSIGN', from: source, evidence: 'bytecode-derived' }]);
  expect(outgoingEdges(graph, source).some(edge => edge.to === 'unproven')).toBe(false);
});

test('literal argument and computed argument cannot become direct variable aliases', () => {
  const graph = fold([root,
    { context: at('root', 1), kind: 'write', target: target('source'), value: int(50), origin: constant(int(50)) },
    { context: at('root', 2), kind: 'call', callId: 'literal', declared: method('pay', '(I)V'), invokeKind: 'static', receiver: null, arguments: [int(25)], argumentOrigins: [constant(int(25))], receiverOrigin: unknown },
    { context: at('root', 3), kind: 'call', callId: 'computed', declared: method('pay', '(I)V'), invokeKind: 'static', receiver: null, arguments: [int(25)], argumentOrigins: [
      { kind: 'computed', site: 3, opcode: 108, inputs: [local('source'), constant(int(2))] },
    ], receiverOrigin: unknown },
  ]);
  const literal = graph.values[graph.calls.literal.argumentValueIds[0]];
  const computed = graph.values[graph.calls.computed.argumentValueIds[0]];
  expect(literal.kind).toBe('literal');
  expect(computed.kind).toBe('computed');
  expect(computed.id).not.toBe(graph.storage.source.valueId);
  expect(incomingEdges(graph, computed.id)).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'COMPUTE', from: graph.storage.source.valueId, evidence: 'bytecode-derived' }),
  ]));
});

test('indexed invocation and return producers establish actual destinations and direct argument chains', () => {
  const graph = fold(returnChain());
  const resultId = graph.invocations.callee.returnValueId;
  expect(graph.calls['compute-call'].resultValueId).toBe(resultId);
  expect(graph.storage.destination.valueId).toBe(resultId);
  expect(graph.calls['consume-call'].argumentValueIds).toEqual([resultId]);
  expect(graph.storage['consumer:parameter'].valueId).toBe(resultId);
  expect(outgoingEdges(graph, resultId)).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'ASSIGN', to: 'destination' }),
    expect.objectContaining({ kind: 'ARGUMENT_BIND', to: 'consumer:parameter' }),
  ]));
  expect(invocationCompletion(graph, 'callee')).toBe('normal-return');
});

test('reference returns and aliases preserve actual object identity while null creates no reference edge', () => {
  const ref = { kind: 'reference', javaType: 'FreshObject', objectId: 'object:7' };
  const graph = fold([
    { context: at(), kind: 'object', objectId: 'object:7', className: 'FreshObject', fields: [] },
    ...returnChain(ref),
    { context: at('root', 21), kind: 'write', target: target('alias', 'alias', 'variable', 'root', 'FreshObject'), value: ref, origin: local('destination') },
  ]);
  expect(Object.keys(graph.objects)).toEqual(['object:7']);
  expect(graph.storage.alias.valueId).toBe(graph.storage.destination.valueId);
  expect(outgoingEdges(graph, 'alias')).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'REFERENCE_BIND', to: 'object:7' })]));
  const nullGraph = fold(returnChain(nil));
  expect(nullGraph.values[nullGraph.storage.destination.valueId].value).toEqual(nil);
  expect(nullGraph.edges.some(edge => edge.kind === 'REFERENCE_BIND')).toBe(false);
});

test('observed initial fields carry no invented write; actual field and array reads feed computed writes', () => {
  const field = target('object:7:field', 'total', 'field', 'object:7');
  const cell = target('array:8:cell:0', '[0]', 'array-element', 'array:8');
  const facts = [root,
    { context: at(), kind: 'object', objectId: 'object:7', className: 'FreshObject', fields: [{ slotId: field.id, name: field.name, javaType: 'int', value: int(10) }] },
  ];
  const initial = fold(facts);
  expect(initial.storage[field.id].writerInvocationId).toBeUndefined();
  expect(incomingEdges(initial, field.id).map(edge => edge.kind)).toEqual(['OBSERVE']);
  const graph = fold([...facts,
    { context: at('root', 1), kind: 'write', target: target('parameter', 'delta'), value: int(3), origin: constant(int(3)) },
    { context: at('root', 2), kind: 'read', target: field, value: int(10), origin: unknown },
    { context: at('root', 3), kind: 'write', target: field, value: int(13), origin: { kind: 'computed', site: 3, opcode: 96, inputs: [{ kind: 'field_read', site: 2 }, local('parameter')] } },
    { context: at('root', 4), kind: 'write', target: cell, value: int(3), origin: local('parameter') },
    { context: at('root', 5), kind: 'read', target: cell, value: int(3), origin: unknown },
    { context: at('root', 6), kind: 'write', target: target('array-result'), value: int(3), origin: { kind: 'array_read', site: 5 } },
  ]);
  expect(graph.storage[field.id].writerInvocationId).toBe('root');
  const result = graph.storage[field.id].valueId;
  expect(graph.values[result].kind).toBe('computed');
  expect(incomingEdges(graph, result).filter(edge => edge.kind === 'COMPUTE').map(edge => edge.from)).toEqual([
    graph.reads['root:2'], graph.storage.parameter.valueId,
  ]);
  expect(incomingEdges(graph, cell.id)).toMatchObject([{ kind: 'ARRAY_WRITE', from: graph.storage.parameter.valueId }]);
  expect(graph.storage['array-result'].valueId).toBe(graph.reads['root:5']);
});

test('input bytes alone create no consumed value; actual successful consumption links to a call result', () => {
  const prefix = [root,
    { context: at('root', 1), kind: 'call', callId: 'read-input', declared: method('nextInt', '()I', 'java.util.Scanner'), invokeKind: 'virtual', receiver: null, arguments: [], argumentOrigins: [], receiverOrigin: unknown },
    { context: at('root', 1), kind: 'io', channel: 'stdin', text: '18 99\n', callId: 'read-input' },
  ];
  const readAhead = fold(prefix);
  expect(Object.values(readAhead.io).map(node => node.kind)).toEqual(['input-bytes']);
  expect(readAhead.edges.some(edge => edge.kind === 'INPUT_CONSUME')).toBe(false);
  expect(readAhead.calls['read-input'].resultValueId).toBeUndefined();
  const graph = fold([...prefix,
    { context: at('root', 1), kind: 'call-return', callId: 'read-input', value: int(18), inputText: '18' },
    { context: at('root', 2), kind: 'write', target: target('received'), value: int(18), origin: { kind: 'call_result', site: 1 } },
  ]);
  const consumed = Object.values(graph.io).find(node => node.kind === 'input-consume');
  expect(consumed.text).toBe('18');
  expect(consumed.valueId).toBe(graph.storage.received.valueId);
  expect(graph.values[consumed.valueId].kind).toBe('input');
});

test('plain reducer and persistent history agree at every prefix, preserve old graph snapshots and stop truthfully', () => {
  const events = eventsFor(returnChain(), true);
  const history = new ExecutionHistory({ schemaVersion: 2, checkpointInterval: 2, maxCheckpoints: 8 });
  const engine = createReductionEngine();
  let reference = createInitialState();
  const heads = [];
  for (const event of events) {
    reference = applyEvent(reference, event);
    expect(engine.apply(event)).toEqual(reference);
    history.append([event]);
    heads.push(history.state);
  }
  for (let cursor = events.length; cursor > 0; cursor--) expect(history.materialize(cursor)).toEqual(heads[cursor - 1]);
  const beforeStop = history.materialize(events.length - 1).executionGraph;
  const graph = history.state.executionGraph;
  expect(invocationCompletion(beforeStop, 'consumer')).toBe('active');
  expect(invocationCompletion(graph, 'consumer')).toBe('recorded-prefix-ended');
  expect(invocationCompletion(graph, 'callee')).toBe('normal-return');
  expect(graph.invocations.consumer.returnValueId).toBeUndefined();
  expect(graph.calls['consume-call'].status).toBe('pending');
  expect(graph.edges).toBe(beforeStop.edges);
  expect(history.materialize(events.length)).toBe(history.state);
  expect(history.stats.checkpointCount).toBeLessThanOrEqual(8);
});

test('appending unrelated facts structurally shares prior semantic nodes and leaves frozen prefixes unchanged', () => {
  const engine = createReductionEngine();
  const events = eventsFor([root,
    { context: at('root', 1), kind: 'write', target: target('one'), value: int(1), origin: constant(int(1)) },
    { context: at('root', 2), kind: 'write', target: target('two'), value: int(2), origin: constant(int(2)) },
  ]);
  engine.apply(events[0]); engine.apply(events[1]);
  const previous = engine.apply(events[2]).executionGraph;
  const stored = previous.storage.one;
  const observed = previous.values[stored.valueId];
  const next = engine.apply(events[3]).executionGraph;
  expect(next.storage.one).toBe(stored);
  expect(next.values[stored.valueId]).toBe(observed);
  expect(previous.storage.two).toBeUndefined();
  expect(() => { stored.name = 'mutated'; }).toThrow();
});

test('a recorded ancestor across an unknown library boundary cannot become a proven caller edge', () => {
  const graph = fold([root,
    { context: at('callback', 0, 'callback', '()V'), kind: 'enter', invocationId: 'callback', callerInvocationId: 'root',
      method: method('callback', '()V'), receiver: null, parameters: [] },
  ]);
  expect(graph.invocations.callback.callerInvocationId).toBeNull();
  expect(graph.invocations.callback.observedAncestorInvocationId).toBe('root');
  expect(incomingEdges(graph, 'callback').some(edge => edge.kind === 'CALL')).toBe(false);
  expect(invocationInputs(graph, 'callback').call).toBeUndefined();
  expect(outgoingEdges(graph, 'root').some(edge => edge.kind === 'CALL' && edge.to === 'callback')).toBe(false);
});

test('renderer-facing invocation, field and return queries expose only indexed semantic facts', () => {
  const field = target('object:7:field', 'accountTotal', 'field', 'object:7');
  const observed = fold([
    { context: at(), kind: 'object', objectId: 'object:7', className: 'FreshObject', fields: [{ slotId: field.id, name: field.name, javaType: 'int', value: int(0) }] },
  ]);
  expect(fieldOrigin(observed, field.id).writer).toBeUndefined();
  expect(fieldOrigin(observed, field.id).writes.map(edge => edge.kind)).toEqual(['OBSERVE']);
  const graph = fold([
    ...returnChain(),
    { context: at('consumer', 1, 'consume', '(I)V'), kind: 'write', target: field, value: int(42), origin: local('consumer:parameter') },
  ]);
  const inputs = invocationInputs(graph, 'consumer');
  expect(inputs.call).toBe(graph.calls['consume-call']);
  expect(inputs.parameters).toEqual([graph.storage['consumer:parameter']]);
  expect(inputs.completion).toBe('active');
  expect(invocationInputs(graph, 'missing')).toBeNull();
  const origin = fieldOrigin(graph, field.id);
  expect(origin.field).toBe(graph.storage[field.id]);
  expect(origin.value).toBe(graph.values[graph.invocations.callee.returnValueId]);
  expect(origin.writer).toBe(graph.invocations.consumer);
  expect(origin.writes).toMatchObject([{ kind: 'FIELD_WRITE', originSlotId: 'consumer:parameter' }]);
  expect(fieldOrigin(graph, 'destination')).toBeNull();
  expect(fieldOrigin(graph, 'missing')).toBeNull();
  expect(returnDestinations(graph, 'callee')).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'ASSIGN', to: 'destination' }),
    expect.objectContaining({ kind: 'ARGUMENT_BIND', to: 'consumer:parameter' }),
    expect.objectContaining({ kind: 'FIELD_WRITE', to: field.id, originSlotId: 'consumer:parameter' }),
  ]));
  expect(returnDestinations(graph, 'missing')).toEqual([]);
});

test('output and exception queries retain observed operation and exception identity without renderer guesses', () => {
  const facts = returnChain().slice(0, 3);
  const graph = fold([...facts,
    { context: at('callee', 3, 'compute', '()I'), kind: 'throw', invocationId: 'callee', exceptionId: 'exception:9', className: 'java.lang.IllegalStateException' },
    { context: at('callee', 3, 'compute', '()I'), kind: 'unwind', invocationId: 'callee', exceptionId: 'exception:9' },
    { context: at('root', 10), kind: 'catch', invocationId: 'root', exceptionId: 'exception:9', callId: 'compute-call' },
    { context: at('root', 11), kind: 'call', callId: 'print-call', declared: method('println', '(I)V', 'java.io.PrintStream'),
      invokeKind: 'virtual', receiver: null, arguments: [int(42)], argumentOrigins: [constant(int(42))], receiverOrigin: unknown },
    { context: at('root', 11), kind: 'io', channel: 'stdout', text: '42\n', callId: 'print-call' },
    { context: at('root', 11), kind: 'call-return', callId: 'print-call', value: nil },
  ]);
  const output = operationOutput(graph, 'print-call');
  expect(output).toHaveLength(1);
  expect(output[0]).toMatchObject({ channel: 'stdout', kind: 'output', text: '42\n', callId: 'print-call' });
  expect(output[0]).toBe(graph.io[output[0].id]);
  expect(operationOutput(graph, 'compute-call')).toEqual([]);
  expect(operationOutput(graph, 'missing')).toEqual([]);
  expect(exceptionPath(graph, 'exception:9')).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'THROW', from: 'callee', to: 'exception:9' }),
    expect.objectContaining({ kind: 'THROW', from: 'compute-call', to: 'exception:9' }),
    expect.objectContaining({ kind: 'UNWIND', from: 'callee', to: 'exception:9' }),
    expect.objectContaining({ kind: 'CATCH', from: 'exception:9', to: 'root' }),
  ]));
  expect(exceptionPath(graph, 'exception:9').every(edge => ['THROW', 'UNWIND', 'CATCH'].includes(edge.kind))).toBe(true);
  expect(invocationInputs(graph, 'callee').completion).toBe('exceptional-unwind');
  expect(graph.objects['exception:9'].className).toBe('java.lang.IllegalStateException');
  expect(exceptionPath(graph, 'missing')).toEqual([]);
});
