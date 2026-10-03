import { expect } from 'vitest';
import { incomingEdges, outgoingEdges } from '../../src/runtime/executionGraph.ts';

export const invocations = (graph, name, descriptor) => Object.values(graph.invocations)
  .filter(node => node.method.name === name && (!descriptor || node.method.descriptor === descriptor));
export const variables = (graph, name) => Object.values(graph.storage).filter(node => node.kind === 'variable' && node.name === name);
export const valueAt = (graph, storage) => graph.values[storage.valueId];
export function only(items) { expect(items, JSON.stringify(items)).toHaveLength(1); return items[0]; }
export function variable(graph, name) { return only(variables(graph, name)); }
export function binding(graph, invocation, index = 0) { return graph.storage[invocation.parameterIds[index]]; }
export function assertCallResolved(graph, invocation) {
  const call = graph.calls[invocation.callId];
  expect(call).toBeDefined();
  expect(call.calleeInvocationId).toBe(invocation.id);
  expect(call.callerInvocationId).toBe(invocation.callerInvocationId);
  expect(call.context.site).toBeTypeOf('number');
  expect(call.context.source).not.toBeNull();
  expect(incomingEdges(graph, invocation.id)).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'CALL', from: call.id, evidence: 'observed' }),
  ]));
  return call;
}
export function assertTransfer(graph, valueId, target, kind = 'ASSIGN') {
  expect(incomingEdges(graph, target)).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind, from: valueId, evidence: 'bytecode-derived' }),
  ]));
}
export function destinations(graph, valueId, kind = 'ASSIGN') {
  return outgoingEdges(graph, valueId).filter(edge => edge.kind === kind).map(edge => graph.storage[edge.to]).filter(Boolean);
}

/** Identity- and line-independent semantic golden. IDs are canonical ordinals, not labels.
 * Keep descriptors, bytecode sites, ordered edges, observed values, and completion intact.
 * Rename mapping is supplied by the test harness only; production never uses it.
 */
export function graphFingerprint(graph, undoNames = []) {
  const ids = new Map();
  const collections = ['invocations', 'calls', 'values', 'storage', 'objects', 'io'];
  for (const collection of collections) Object.keys(graph[collection]).forEach((id, i) => ids.set(id, `${collection}:${i}`));
  const identify = id => {
    if (id === undefined || id === null) return id;
    if (ids.has(id)) return ids.get(id);
    for (const call of Object.values(graph.calls)) if (id.startsWith(`${call.id}:argument:`)) return `${ids.get(call.id)}:argument:${id.slice(`${call.id}:argument:`.length)}`;
    return id;
  };
  const text = input => undoNames.reduce((s, [from, to]) => s.replaceAll(from, to), input);
  const method = node => ({ owner: text(node.owner), name: text(node.name), descriptor: text(node.descriptor) });
  const context = node => ({ ...method(node), frameId: identify(node.frameId), site: node.site });
  const value = node => node.kind === 'reference'
    ? { ...node, objectId: identify(node.objectId), javaType: text(node.javaType) }
    : 'javaType' in node ? { ...node, javaType: text(node.javaType) } : node;
  return {
    invocations: Object.values(graph.invocations).map(node => ({
      method: method(node.method), caller: identify(node.callerInvocationId), call: identify(node.callId),
      receiver: identify(node.receiverObjectId), parameters: node.parameterIds.map(identify), result: identify(node.returnValueId), status: node.status,
    })),
    calls: Object.values(graph.calls).map(node => ({ declared: method(node.declared), invokeKind: node.invokeKind,
      context: context(node.context), caller: identify(node.callerInvocationId), callee: identify(node.calleeInvocationId),
      receiver: identify(node.receiverValueId), receiverOriginSlot: identify(node.receiverOriginSlotId), argumentOriginSlots: node.argumentOriginSlotIds.map(identify), arguments: node.argumentValueIds.map(identify), result: identify(node.resultValueId), status: node.status })),
    values: Object.values(graph.values).map(node => ({ kind: node.kind, value: value(node.value), context: context(node.context), opcode: node.opcode })),
    storage: Object.values(graph.storage).map(node => ({ kind: node.kind, owner: identify(node.ownerId), name: text(node.name),
      javaType: text(node.javaType), value: identify(node.valueId), writer: identify(node.writerInvocationId) })),
    objects: Object.values(graph.objects).map(node => ({ className: text(node.className), constructed: node.constructedAt !== undefined })),
    io: Object.values(graph.io).map(node => ({ kind: node.kind, channel: node.channel, text: node.text,
      call: identify(node.callId), value: identify(node.valueId), context: context(node.context) })),
    edges: graph.edges.map(node => ({ kind: node.kind, from: identify(node.from), to: identify(node.to), evidence: node.evidence, originSlot: identify(node.originSlotId), context: context(node.context) })),
  };
}
