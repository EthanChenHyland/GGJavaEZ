import { beforeAll, describe, expect, test } from 'vitest';
import { fileURLToPath } from 'node:url';
import { recordFixture } from './record.mjs';
import { assertCallResolved, assertTransfer, binding, destinations, graphFingerprint, invocations, only, valueAt, variable } from './graphGolden.mjs';
import { incomingEdges, invocationCompletion, outgoingEdges } from '../../src/runtime/executionGraph.ts';
import { seek } from '../../src/runtime/seek.ts';

// JVM preparation/execution is explicitly serialized by the lead, never on module import.
const jvmSuite = describe.runIf(process.env.VJ_PHASE3_JVM === '1');
const fixture = name => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
function fullRecording(result, stdout) {
  expect(result.snapshot.status).toBe('exited');
  expect(result.snapshot.exitCode).toBe(0);
  expect(result.snapshot.recording.state).toBe('FULL');
  expect(result.snapshot.stdout).toBe(stdout);
  expect(result.state.status).toBe('ended');
  expect(Object.values(result.graph.invocations).every(node => node.status !== 'active')).toBe(true);
}

jvmSuite('Phase 3 JVM constructor golden (selectable for JDK 17/21/25)', () => {
  let result;
  beforeAll(async () => { result = await recordFixture(fixture('inheritance'), 'InheritanceMain'); }, 120000);
  test('this delegation and super constructor have real nested calls before receiver readiness', () => {
    fullRecording(result, '34\n');
    const graph = result.graph;
    const main = only(invocations(graph, 'main'));
    const empty = only(invocations(graph, '<init>', '()V').filter(node => node.method.owner.endsWith('$Extension')));
    expect(empty.callerInvocationId).toBe(main.id);
    const delegated = only(invocations(graph, '<init>', '(I)V').filter(node => node.callerInvocationId === empty.id));
    expect(delegated.method.owner).toBe('InheritanceMain$Extension');
    const parent = only(invocations(graph, '<init>', '(I)V').filter(node => node.callerInvocationId === delegated.id));
    expect(parent.method.owner).toBe('InheritanceMain$Foundation');
    for (const node of [empty, delegated, parent]) {
      expect(assertCallResolved(graph, node).invokeKind).toBe('special');
      expect(invocationCompletion(graph, node.id)).toBe('normal-return');
    }
    expect(parent.receiverObjectId).toBe(delegated.receiverObjectId);
    expect(empty.receiverObjectId).toBe(delegated.receiverObjectId);
    const thisSlots = Object.values(graph.storage).filter(node => node.name === 'this' && [empty.id, delegated.id, parent.id].includes(node.ownerId));
    expect(thisSlots).toHaveLength(3);
    expect(thisSlots.every(node => valueAt(graph, node).value.objectId === empty.receiverObjectId)).toBe(true);
    expect(graph.objects[empty.receiverObjectId].constructedAt).toBeDefined();
    expect(graph.edges.filter(edge => edge.kind === 'CONSTRUCT' && edge.to === empty.receiverObjectId).length).toBeGreaterThanOrEqual(3);
  });
  test('literal constructor argument reaches differently named parameter and then actual field', () => {
    const graph = result.graph;
    const delegated = invocations(graph, '<init>', '(I)V').find(node => node.method.owner.endsWith('$Extension') && graph.invocations[node.callerInvocationId]?.method.descriptor === '()V');
    const input = binding(graph, delegated);
    expect(input.name).toBe('initial');
    expect(valueAt(graph, input)).toMatchObject({ kind: 'literal', value: { value: 9 } });
    const own = only(Object.values(graph.storage).filter(node => node.name === 'own' && node.ownerId === delegated.receiverObjectId));
    assertTransfer(graph, input.valueId, own.id, 'FIELD_WRITE');
    expect(own.writerInvocationId).toBe(delegated.id);
  });
});

jvmSuite('Phase 3 JVM call and value-flow golden', () => {
  let result;
  beforeAll(async () => { result = await recordFixture(fixture('flows'), 'FlowMain'); }, 120000);
  test('interface dispatch retains declared interface, actual runtime callee, overload descriptors and receiver', () => {
    fullRecording(result, '42\n42\n12\n42\n43\n10\n28\n');
    const graph = result.graph;
    const interfaceCall = only(Object.values(graph.calls).filter(call => call.invokeKind === 'interface' && call.declared.name === 'deposit'));
    expect(interfaceCall.declared).toEqual({ owner: 'FlowMain$Payment', name: 'deposit', descriptor: '(I)V' });
    const actual = graph.invocations[interfaceCall.calleeInvocationId];
    expect(actual.method).toEqual({ owner: 'FlowMain$Ledger', name: 'deposit', descriptor: '(I)V' });
    expect(assertCallResolved(graph, actual)).toBe(interfaceCall);
    const reference = graph.values[variable(graph, 'payment').valueId].value;
    expect(variable(graph, 'payment').javaType).toBe('FlowMain$Payment');
    expect(reference).toMatchObject({ kind: 'reference', javaType: 'FlowMain$Ledger' });
    expect(graph.values[interfaceCall.receiverValueId].value.objectId).toBe(reference.objectId);
    expect(actual.receiverObjectId).toBe(reference.objectId);
    const thisSlot = only(Object.values(graph.storage).filter(slot => slot.ownerId === actual.id && slot.name === 'this'));
    assertTransfer(graph, interfaceCall.receiverValueId, thisSlot.id, 'RECEIVER_BIND');
    expect(interfaceCall.receiverOriginSlotId).toBe(variable(graph, 'payment').id);
    expect(incomingEdges(graph, thisSlot.id)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'RECEIVER_BIND', originSlotId: variable(graph, 'payment').id })]));
    expect(new Set(invocations(graph, 'deposit').map(node => node.method.descriptor))).toEqual(new Set(['(I)V', '(II)V']));
  });
  test('arguments bind by producer slot rather than equal source and parameter names', () => {
    const graph = result.graph;
    const caller = variable(graph, 'callerValue');
    const call = only(Object.values(graph.calls).filter(node => node.invokeKind === 'interface' && node.declared.name === 'deposit'));
    const callee = graph.invocations[call.calleeInvocationId];
    const parameter = binding(graph, callee);
    expect(parameter.name).toBe('amount');
    expect(parameter.valueId).toBe(caller.valueId);
    expect(call.argumentValueIds).toEqual([caller.valueId]);
    expect(call.argumentOriginSlotIds).toEqual([caller.id]);
    expect(incomingEdges(graph, parameter.id)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'ARGUMENT_BIND', originSlotId: caller.id })]));
    assertTransfer(graph, caller.valueId, parameter.id, 'ARGUMENT_BIND');
  });
  test('literal and computed arguments remain distinct from direct variable transfer', () => {
    const graph = result.graph;
    const calls = Object.values(graph.calls).filter(node => node.declared.name === 'deposit' && node.invokeKind === 'virtual' && node.declared.descriptor === '(I)V');
    expect(calls).toHaveLength(2);
    expect(graph.values[calls[0].argumentValueIds[0]]).toMatchObject({ kind: 'literal', value: { value: 25 } });
    const computed = graph.values[calls[1].argumentValueIds[0]];
    expect(computed).toMatchObject({ kind: 'computed', value: { value: 12 } });
    expect(computed.id).not.toBe(variable(graph, 'callerValue').valueId);
    expect(incomingEdges(graph, computed.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'COMPUTE', from: variable(graph, 'callerValue').valueId, evidence: 'bytecode-derived' }),
    ]));
    for (const call of calls) assertTransfer(graph, call.argumentValueIds[0], binding(graph, graph.invocations[call.calleeInvocationId]).id, 'ARGUMENT_BIND');
  });
  test('primitive return goes to actual local and direct return-to-argument reaches consume', () => {
    const graph = result.graph;
    const answers = invocations(graph, 'answer', '()I');
    expect(answers).toHaveLength(2);
    const assigned = only(answers.filter(node => destinations(graph, node.returnValueId).some(slot => slot.name === 'result')));
    expect(variable(graph, 'result').valueId).toBe(assigned.returnValueId);
    expect(graph.values[assigned.returnValueId]).toMatchObject({ kind: 'return', value: { value: 42 } });
    const consume = only(invocations(graph, 'consume', '(I)V'));
    const parameter = binding(graph, consume);
    const forwarded = only(answers.filter(node => node.returnValueId === parameter.valueId));
    expect(graph.calls[consume.callId].argumentValueIds).toEqual([forwarded.returnValueId]);
    assertTransfer(graph, forwarded.returnValueId, parameter.id, 'ARGUMENT_BIND');
  });
  test('two return operands produce a computed sum and neither return directly claims the result', () => {
    const graph = result.graph;
    const combined = variable(graph, 'combined');
    const value = valueAt(graph, combined);
    expect(value).toMatchObject({ kind: 'computed', value: { value: 12 } });
    const left = only(invocations(graph, 'left'));
    const right = only(invocations(graph, 'right'));
    const inputs = incomingEdges(graph, value.id).filter(edge => edge.kind === 'COMPUTE').map(edge => edge.from);
    expect(inputs).toEqual(expect.arrayContaining([left.returnValueId, right.returnValueId]));
    for (const node of [left, right]) {
      expect(node.returnValueId).not.toBe(combined.valueId);
      expect(destinations(graph, node.returnValueId).some(slot => slot.id === combined.id)).toBe(false);
    }
  });
  test('reference return and aliases retain one heap identity; null return has no object edge', () => {
    const graph = result.graph;
    const identity = only(invocations(graph, 'identity'));
    const returned = variable(graph, 'returned');
    expect(returned.valueId).toBe(identity.returnValueId);
    const reference = valueAt(graph, returned).value;
    expect(reference.kind).toBe('reference');
    expect(reference.objectId).toBe(valueAt(graph, variable(graph, 'ledger')).value.objectId);
    for (const name of ['returned', 'alias', 'alias2']) {
      const slot = variable(graph, name);
      expect(slot.valueId).toBe(identity.returnValueId);
      expect(outgoingEdges(graph, slot.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'REFERENCE_BIND', to: reference.objectId }),
      ]));
    }
    expect(Object.values(graph.objects).filter(node => node.className === 'FlowMain$Ledger')).toHaveLength(1);
    const none = only(invocations(graph, 'none'));
    const absent = variable(graph, 'absent');
    expect(absent.valueId).toBe(none.returnValueId);
    expect(valueAt(graph, absent).value).toEqual({ kind: 'null' });
    expect(outgoingEdges(graph, absent.id).some(edge => edge.kind === 'REFERENCE_BIND')).toBe(false);
    expect(outgoingEdges(graph, none.returnValueId).some(edge => edge.kind === 'REFERENCE_BIND')).toBe(false);
  });
  test('direct local assignment differs from computed assignment, and field writes retain actual writer', () => {
    const graph = result.graph;
    expect(variable(graph, 'b').valueId).toBe(variable(graph, 'a').valueId);
    expect(valueAt(graph, variable(graph, 'c'))).toMatchObject({ kind: 'computed', value: { value: 15 } });
    const setter = only(invocations(graph, 'set'));
    const add = only(invocations(graph, 'add'));
    const field = only(Object.values(graph.storage).filter(slot => slot.kind === 'field' && slot.name === 'balance'));
    expect(field.writerInvocationId).toBe(add.id);
    expect(valueAt(graph, field)).toMatchObject({ kind: 'computed', value: { value: 28 } });
    const direct = incomingEdges(graph, field.id).filter(edge => edge.kind === 'FIELD_WRITE' && edge.context.frameId === setter.id);
    expect(direct).toEqual(expect.arrayContaining([expect.objectContaining({ from: binding(graph, setter).valueId, evidence: 'bytecode-derived' })]));
    const inputs = incomingEdges(graph, field.valueId).filter(edge => edge.kind === 'COMPUTE');
    expect(inputs.some(edge => edge.from === binding(graph, add).valueId)).toBe(true);
    expect(inputs.some(edge => incomingEdges(graph, edge.from).some(read => read.kind === 'FIELD_READ' && read.from === field.id))).toBe(true);
  });
  test('int array reads and writes use common producer graph and actual indexed storage', () => {
    const graph = result.graph;
    const writes = graph.edges.filter(edge => edge.kind === 'ARRAY_WRITE');
    expect(writes.some(edge => edge.from === variable(graph, 'result').valueId)).toBe(true);
    const indexed = variable(graph, 'indexed');
    expect(valueAt(graph, indexed).value.value).toBe(42);
    expect(incomingEdges(graph, indexed.valueId).some(edge => edge.kind === 'ARRAY_READ')).toBe(true);
    const computedWrite = writes.find(edge => graph.values[edge.from]?.kind === 'computed' && graph.values[edge.from]?.value.value === 43);
    expect(computedWrite).toBeDefined();
    expect(incomingEdges(graph, computedWrite.from).some(edge => edge.kind === 'COMPUTE' && edge.from === indexed.valueId)).toBe(true);
  });
  test('recursion retains each real callsite and distinct invocation/return chain', () => {
    const graph = result.graph;
    const walk = invocations(graph, 'walk', '(I)I');
    expect(walk).toHaveLength(5);
    expect(new Set(walk.map(node => node.id)).size).toBe(5);
    expect(walk.map(node => valueAt(graph, binding(graph, node)).value.value)).toEqual([4, 3, 2, 1, 0]);
    walk.forEach((node, i) => {
      assertCallResolved(graph, node);
      if (i) expect(node.callerInvocationId).toBe(walk[i - 1].id);
      expect(graph.values[node.returnValueId].value.value).toBe([10, 6, 3, 1, 0][i]);
    });
  });
  test('arbitrary prefix seeks preserve the same graph and Return to Live returns the retained head', () => {
    for (const cursor of [0, 1, Math.floor(result.trace.events.length / 3), Math.floor(result.trace.events.length / 2), result.trace.events.length - 1]) {
      const first = seek(result.trace, cursor);
      seek(result.trace, result.trace.events.length);
      expect(seek(result.trace, cursor).executionGraph).toEqual(first.executionGraph);
    }
    expect(seek(result.trace, result.trace.events.length)).toBe(result.state);
  });
});

jvmSuite('Phase 3 JVM observed I/O and exception golden', () => {
  let result;
  beforeAll(async () => { result = await recordFixture(fixture('io'), 'IoMain', { stdin: '18 99\n' }); }, 120000);
  test('successful input consumption, not read-ahead bytes, proves the local value', () => {
    fullRecording(result, '18\nhandled\nfinished\n');
    expect(result.snapshot.stderr).toBe('audit');
    expect(result.inputSent).toBe(true);
    const graph = result.graph;
    const consumes = Object.values(graph.io).filter(node => node.kind === 'input-consume');
    expect(consumes).toHaveLength(1);
    expect(consumes[0].text.trim()).toBe('18');
    expect(graph.calls[consumes[0].callId].declared).toMatchObject({ owner: 'java.util.Scanner', name: 'nextInt', descriptor: '()I' });
    expect(variable(graph, 'consumed').valueId).toBe(consumes[0].valueId);
    expect(graph.values[consumes[0].valueId].value).toMatchObject({ value: 18 });
    expect(consumes.some(node => node.text.includes('99'))).toBe(false);
    expect(incomingEdges(graph, consumes[0].valueId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'INPUT_CONSUME', from: consumes[0].id }),
    ]));
  });
  test('canonical output text is tied to actual operation callsites without invented formatting origins', () => {
    const graph = result.graph;
    const outputs = Object.values(graph.io).filter(node => node.kind === 'output');
    expect(outputs.filter(node => node.channel === 'stdout').map(node => node.text).join('')).toBe(result.snapshot.stdout);
    expect(outputs.filter(node => node.channel === 'stderr').map(node => node.text).join('')).toBe(result.snapshot.stderr);
    for (const output of outputs) {
      const call = graph.calls[output.callId];
      expect(call).toBeDefined();
      expect(call.declared.owner).toBe('java.io.PrintStream');
      expect(['print', 'println']).toContain(call.declared.name);
      expect(call.context.source).not.toBeNull();
      expect(incomingEdges(graph, output.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'OUTPUT', from: call.id, evidence: 'observed' }),
      ]));
    }
    const direct = outputs.find(node => node.text.includes('18'));
    expect(graph.calls[direct.callId].argumentValueIds).toContain(variable(graph, 'consumed').valueId);
  });
  test('throw, ordered unwinds and actual catch retain one truthful exception path', () => {
    const graph = result.graph;
    const leaf = only(invocations(graph, 'leaf'));
    const middle = only(invocations(graph, 'middle'));
    const main = only(invocations(graph, 'main'));
    const thrown = only(graph.edges.filter(edge => edge.kind === 'THROW' && graph.invocations[edge.from]));
    const failedCall = only(graph.edges.filter(edge => edge.kind === 'THROW' && graph.calls[edge.from]));
    expect(failedCall.to).toBe(thrown.to);
    expect(graph.calls[failedCall.from].declared.name).toBe('middle');
    expect(graph.calls[failedCall.from].status).toBe('threw');
    expect(thrown.from).toBe(leaf.id);
    expect(thrown.context.source).not.toBeNull();
    const unwind = graph.edges.filter(edge => edge.kind === 'UNWIND');
    expect(unwind.map(edge => [edge.from, edge.to])).toEqual([[leaf.id, thrown.to], [middle.id, thrown.to]]);
    expect(graph.edges.filter(edge => edge.kind === 'CATCH').map(edge => [edge.from, edge.to])).toEqual([[thrown.to, main.id]]);
    expect(invocationCompletion(graph, leaf.id)).toBe('exceptional-unwind');
    expect(invocationCompletion(graph, middle.id)).toBe('exceptional-unwind');
    expect(invocationCompletion(graph, main.id)).toBe('normal-return');
  });
});

jvmSuite('Phase 3 JVM graph identifier and source-line invariance', () => {
  test('renaming unrelated identifiers and shifting source lines preserves proven graph semantics', async () => {
    const original = await recordFixture(fixture('flows'), 'FlowMain');
    const renames = [['callerValue', 'externalCount'], ['amount', 'creditedUnits'], ['replacement', 'newBalance'], ['increment', 'deltaUnits'], ['incoming', 'acceptedUnits']];
    const variant = await recordFixture(fixture('flows'), 'FlowMain', { sourceTransform: source =>
      '\n\n// Source displacement must not establish or remove producer relationships.\n' + renames.reduce((text, [from, to]) => text.replaceAll(from, to), source) });
    expect(variant.snapshot.stdout).toBe(original.snapshot.stdout);
    expect(graphFingerprint(variant.graph, renames.map(([from, to]) => [to, from]))).toEqual(graphFingerprint(original.graph));
  }, 180000);
});

jvmSuite('Phase 3 JVM large call-tree prefix golden', () => {
  test('thousands of actual nested calls retain indexed identities/history and limits never terminate Java', async () => {
    const result = await recordFixture(fixture('call-tree'), 'BranchMain', { programArgs: ['large'] });
    expect(result.snapshot.status).toBe('exited');
    expect(result.snapshot.exitCode).toBe(0);
    expect(result.snapshot.stdout).toBe('CALLS 7200 CHECK 5764800\n');
    expect(result.snapshot.stderr).toBe('');
    expect(result.snapshot.recording).toMatchObject({ state: 'STOPPED_LIMIT', budget: 'events', executionContinued: true });
    expect(result.trace.events.at(-1).type).toBe('CAPTURE_STOP');
    const nodes = Object.values(result.graph.invocations);
    if (process.env.VJ_PHASE3_METRICS === '1') console.info('PHASE3_CALL_TREE', JSON.stringify({ jdk: result.jdk.version, rawEvents: result.rawCount, semanticEvents: result.trace.events.length, invocations: nodes.length, calls: Object.keys(result.graph.calls).length, edges: result.graph.edges.length, values: Object.keys(result.graph.values).length }));
    expect(nodes.length).toBeGreaterThanOrEqual(1000);
    expect(new Set(nodes.map(node => node.id)).size).toBe(nodes.length);
    for (const node of nodes.filter(node => node.method.name !== 'main')) assertCallResolved(result.graph, node);
    const open = nodes.filter(node => node.status === 'active');
    expect(open.length).toBeGreaterThan(0);
    expect(open.every(node => invocationCompletion(result.graph, node.id) === 'recorded-prefix-ended')).toBe(true);
    for (const cursor of [100, Math.floor(result.trace.events.length / 3), result.trace.events.length - 1]) {
      const snapshot = seek(result.trace, cursor);
      expect(snapshot.cursor).toBe(cursor);
      expect(Object.keys(snapshot.executionGraph?.invocations ?? {}).length).toBeLessThanOrEqual(nodes.length);
    }
    expect(seek(result.trace, result.trace.events.length)).toBe(result.state);
  }, 120000);
});
