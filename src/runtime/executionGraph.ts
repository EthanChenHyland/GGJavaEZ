import type { ExecutionFact, ExecutionGraph, ExecutionSite, GraphEdge, GraphEdgeKind, GraphStorage, ValueOrigin } from '../contracts/executionGraph'
import type { RuntimeValue } from '../contracts/runtime'
import type { ReductionStorage } from './state'

export function emptyExecutionGraph(): ExecutionGraph {
  return { invocations: {}, calls: {}, values: {}, storage: {}, objects: {}, io: {}, edges: [], incoming: {}, outgoing: {}, results: {}, reads: {} }
}
function same(a: RuntimeValue, b: RuntimeValue): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'reference' && b.kind === 'reference') return a.objectId === b.objectId
  if (a.kind === 'unavailable' && b.kind === 'unavailable') return a.reason === b.reason && a.javaType === b.javaType
  return !('value' in a) || 'value' in b && a.value === b.value
}
function constantMatches(expected: RuntimeValue, actual: RuntimeValue): boolean {
  if (same(expected, actual)) return true
  if (expected.kind !== 'primitive' || actual.kind !== 'primitive' || typeof expected.value !== 'number') return false
  return actual.javaType === 'boolean' ? (expected.value === 0 || expected.value === 1) && Boolean(expected.value) === actual.value
    : actual.javaType === 'char' && typeof actual.value === 'string' && expected.value === actual.value.charCodeAt(0)
}
const unknown: RuntimeValue = { kind: 'uninitialized' }
/** One fact changes only its own graph paths. Plain and persistent engines share semantics. */
export function applyExecutionFact(previous: ExecutionGraph | undefined, fact: ExecutionFact, eventId: string, store: Pick<ReductionStorage, 'put' | 'remove' | 'append'>): ExecutionGraph {
  let graph = previous ?? emptyExecutionGraph()
  const context = fact.context
  let serial = 0
  const fresh = (kind: string) => `${eventId}:${kind}:${serial++}`
  // Most nodes have one or two incident edges. Avoid a radix facade per tiny
  // list; copying at most eight integers is bounded, then upgrade to shared storage.
  const appendIndex = (indexes: number[] | undefined, index: number): number[] =>
    !indexes ? [index] : indexes.length < 8 ? [...indexes, index] : store.append(indexes, index)
  const edge = (kind: GraphEdgeKind, from: string, to: string, evidence: GraphEdge['evidence'] = 'observed', originSlotId?: string) => {
    const index = graph.edges.length
    const item: GraphEdge = { id: fresh('edge'), kind, from, to, eventId, evidence, context, ...(originSlotId ? { originSlotId } : {}) }
    graph = { ...graph, edges: store.append(graph.edges, item),
      incoming: store.put(graph.incoming, to, appendIndex(graph.incoming[to], index)),
      outgoing: store.put(graph.outgoing, from, appendIndex(graph.outgoing[from], index)) }
    if (originSlotId && originSlotId !== from) graph = { ...graph, outgoing: store.put(graph.outgoing, originSlotId, appendIndex(graph.outgoing[originSlotId], index)) }
  }
  const value = (observed: RuntimeValue, kind: ExecutionGraph['values'][string]['kind'], at: ExecutionSite = context, opcode?: number) => {
    const id = fresh('value')
    graph = { ...graph, values: store.put(graph.values, id, { id, value: observed, kind, eventId, context: at, ...(opcode === undefined ? {} : { opcode }) }) }
    if (observed.kind === 'reference') edge('REFERENCE_BIND', id, observed.objectId)
    return id
  }
  const key = (site: number) => `${context.frameId}:${site}`
  const origin = (recipe: ValueOrigin, observed?: RuntimeValue, depth = 0): { id: string; evidence: GraphEdge['evidence']; slotId?: string } => {
    if (depth > 16) return { id: value(observed ?? unknown, 'unknown'), evidence: 'unknown' }
    let id: string | undefined
    switch (recipe.kind) {
      case 'local': id = graph.storage[recipe.slotId]?.valueId; break
      case 'call_result': id = graph.results[key(recipe.site)]; break
      case 'field_read': case 'static_read': case 'array_read': id = graph.reads[key(recipe.site)]; break
      case 'new': id = graph.results[key(recipe.site)]; break
      case 'constant':
        return recipe.value.kind !== 'uninitialized' && recipe.value.kind !== 'unavailable' && (!observed || constantMatches(recipe.value, observed))
          ? { id: value(observed ?? recipe.value, 'literal'), evidence: 'bytecode-derived' }
          : { id: value(observed ?? unknown, 'unknown'), evidence: 'unknown' }
      case 'computed': {
        const result = value(observed ?? unknown, 'computed', context, recipe.opcode)
        for (const input of recipe.inputs) {
          const operand = origin(input, undefined, depth + 1)
          edge('COMPUTE', operand.id, result, operand.evidence, operand.slotId)
        }
        return { id: result, evidence: 'bytecode-derived' }
      }
      case 'unknown': break
    }
    // Producer identity proves transfer; equality is only a consistency check, never a search.
    if (id && (!observed || same(graph.values[id].value, observed))) return { id, evidence: 'bytecode-derived', ...(recipe.kind === 'local' ? { slotId: recipe.slotId } : {}) }
    return { id: value(observed ?? unknown, 'unknown'), evidence: 'unknown' }
  }
  const write = (target: Omit<GraphStorage, 'valueId' | 'writerInvocationId'>, valueId: string, kind: GraphEdgeKind, evidence: GraphEdge['evidence'], originSlotId?: string) => {
    graph = { ...graph, storage: store.put(graph.storage, target.id, { ...target, valueId, ...(context.frameId ? { writerInvocationId: context.frameId } : {}) }) }
    edge(kind, valueId, target.id, evidence, originSlotId)
  }
  switch (fact.kind) {
    case 'object': {
      if (graph.objects[fact.objectId]) throw new Error(`Duplicate graph object ${fact.objectId}`)
      graph = { ...graph, objects: store.put(graph.objects, fact.objectId, { id: fact.objectId, className: fact.className, allocatedAt: eventId, ...(fact.boundedSummary ? { summarySlotIds: fact.fields.map(f => f.slotId) } : {}), ...(fact.metadata ? { metadata: fact.metadata } : {}) }) }
      for (const field of fact.fields) {
        const id = value(field.value, 'observed')
        graph = { ...graph, storage: store.put(graph.storage, field.slotId, { id: field.slotId, ownerId: fact.objectId, kind: field.storageKind ?? 'field', name: field.name, javaType: field.javaType, valueId: id }) }
        edge('OBSERVE', id, field.slotId)
      }
      break
    }
    case 'class': case 'observe': {
      const ownerId = fact.kind === 'class' ? fact.classId : fact.objectId
      if (fact.kind === 'class') {
        const prior = graph.classes?.[ownerId]
        graph = { ...graph, classes: store.put(graph.classes ?? {}, ownerId, {
          ...prior, id: ownerId, className: fact.className,
          initialization: fact.initialization === 'observed' ? prior?.initialization ?? 'observed' : fact.initialization,
          observedAt: eventId, ...(fact.metadata ? { metadata: fact.metadata } : {}),
        }) }
      }
      else {
        const object = graph.objects[ownerId]
        if (!object) throw new Error(`Observation without graph object ${ownerId}`)
        if (fact.replaceFields) {
          const current = new Set(fact.fields.map(f => f.slotId))
          for (const id of object.summarySlotIds ?? []) if (!current.has(id)) graph = { ...graph, storage: store.remove(graph.storage, id) }
        }
        graph = { ...graph, objects: store.put(graph.objects, ownerId, { ...object, observedAt: eventId, ...(fact.replaceFields ? { summarySlotIds: fact.fields.map(f => f.slotId) } : {}), ...(fact.metadata ? { metadata: fact.metadata } : {}) }) }
      }
      for (const field of fact.fields) {
        const prior = graph.storage[field.slotId], priorValue = prior?.valueId ? graph.values[prior.valueId] : undefined
        if (priorValue && same(priorValue.value, field.value)) continue
        const id = value(field.value, 'observed')
        graph = { ...graph, storage: store.put(graph.storage, field.slotId, { id: field.slotId, ownerId,
          kind: fact.kind === 'class' ? 'static' : field.storageKind ?? 'field', name: field.name, javaType: field.javaType, valueId: id }) }
        edge('OBSERVE', id, field.slotId)
      }
      break
    }
    case 'call': {
      if (graph.calls[fact.callId]) throw new Error(`Duplicate graph call ${fact.callId}`)
      const args = fact.arguments.map((arg, i) => origin(fact.argumentOrigins[i] ?? { kind: 'unknown' }, arg))
      const receiver = fact.receiver ? origin(fact.receiverOrigin, fact.receiver) : undefined
      graph = { ...graph, calls: store.put(graph.calls, fact.callId, { id: fact.callId, callerInvocationId: context.frameId,
        declared: fact.declared, invokeKind: fact.invokeKind, context, argumentValueIds: args.map(arg => arg.id), argumentOriginSlotIds: args.map(arg => arg.slotId ?? null),
        ...(receiver ? { receiverValueId: receiver.id, ...(receiver.slotId ? { receiverOriginSlotId: receiver.slotId } : {}) } : {}), status: 'pending', ...(fact.ownership ? { ownership: fact.ownership } : {}) }) }
      if (context.frameId) edge('CALL', context.frameId, fact.callId)
      args.forEach((arg, index) => edge('ARGUMENT_BIND', arg.id, `${fact.callId}:argument:${index}`, arg.evidence, arg.slotId))
      if (receiver) edge('RECEIVER_BIND', receiver.id, fact.callId, receiver.evidence, receiver.slotId)
      break
    }
    case 'enter': {
      if (graph.invocations[fact.invocationId]) throw new Error(`Duplicate invocation ${fact.invocationId}`)
      const call = fact.callId ? graph.calls[fact.callId] : undefined
      if (fact.callId && !call) throw new Error(`Missing call ${fact.callId}`)
      if (call && (call.declared.name !== fact.method.name || call.declared.descriptor !== fact.method.descriptor)) throw new Error('Call/callee descriptor mismatch')
      graph = { ...graph, invocations: store.put(graph.invocations, fact.invocationId, {
        id: fact.invocationId, method: fact.method, callerInvocationId: call?.callerInvocationId ?? null,
        ...(!call && fact.callerInvocationId ? { observedAncestorInvocationId: fact.callerInvocationId } : {}),
        ...(call ? { callId: call.id } : {}), ...(fact.receiver?.kind === 'reference' ? { receiverObjectId: fact.receiver.objectId } : {}),
        parameterIds: fact.parameters.map(parameter => parameter.slotId), status: 'active', enteredAt: eventId, ...(fact.metadata ? { metadata: fact.metadata } : {}),
      }) }
      if (call) {
        graph = { ...graph, calls: store.put(graph.calls, call.id, { ...call, calleeInvocationId: fact.invocationId }) }
        edge('CALL', call.id, fact.invocationId)
      }
      fact.parameters.forEach((parameter, index) => {
        const arg = call?.argumentValueIds[index]
        const observed = arg && same(graph.values[arg].value, parameter.value) ? arg : value(parameter.value, 'observed')
        write({ id: parameter.slotId, kind: 'variable', ownerId: fact.invocationId, name: parameter.name, javaType: parameter.javaType }, observed, 'ARGUMENT_BIND', arg === observed ? 'bytecode-derived' : 'observed', arg === observed ? call?.argumentOriginSlotIds[index] ?? undefined : undefined)
      })
      if (fact.receiver?.kind === 'reference') {
        const slotId = `${fact.invocationId}:local:0:receiver`
        const id = call?.receiverValueId ?? value(fact.receiver, 'observed')
        write({ id: slotId, kind: 'variable', ownerId: fact.invocationId, name: 'this', javaType: fact.receiver.javaType }, id, 'RECEIVER_BIND', call?.receiverValueId ? 'bytecode-derived' : 'observed', call?.receiverOriginSlotId)
      }
      break
    }
    case 'receiver-ready': {
      const invocation = graph.invocations[fact.invocationId]
      if (!invocation || fact.receiver.kind !== 'reference') throw new Error('Receiver-ready requires an invocation and object identity')
      graph = { ...graph, invocations: store.put(graph.invocations, invocation.id, { ...invocation, receiverObjectId: fact.receiver.objectId }) }
      const id = value(fact.receiver, 'observed')
      write({ id: fact.slotId, kind: 'variable', ownerId: fact.invocationId, name: 'this', javaType: fact.receiver.javaType }, id, 'RECEIVER_BIND', 'observed')
      edge('CONSTRUCT', fact.invocationId, fact.receiver.objectId)
      break
    }
    case 'write': {
      const producer = origin(fact.origin, fact.value)
      write(fact.target, producer.id, fact.target.kind === 'field' ? 'FIELD_WRITE' : fact.target.kind === 'static' ? 'STATIC_WRITE' : fact.target.kind === 'array-element' ? 'ARRAY_WRITE' : 'ASSIGN', producer.evidence, producer.slotId)
      if (fact.value.kind === 'reference') edge('REFERENCE_BIND', fact.target.id, fact.value.objectId)
      break
    }
    case 'read': {
      const result = value(fact.value, 'observed')
      graph = { ...graph, reads: store.put(graph.reads, key(context.site ?? -1), result) }
      if (!graph.storage[fact.target.id]) graph = { ...graph, storage: store.put(graph.storage, fact.target.id, { ...fact.target }) }
      edge(fact.target.kind === 'field' ? 'FIELD_READ' : fact.target.kind === 'static' ? 'STATIC_READ' : 'ARRAY_READ', fact.target.id, result)
      break
    }
    case 'return': {
      const invocation = graph.invocations[fact.invocationId]
      if (!invocation) throw new Error('Return without invocation')
      const result = value(fact.value, 'return')
      const producer = origin(fact.origin, fact.value)
      edge('RETURN', producer.id, result, producer.evidence, producer.slotId)
      edge('RETURN', invocation.id, result)
      graph = { ...graph, invocations: store.put(graph.invocations, invocation.id, { ...invocation, returnValueId: result }) }
      break
    }
    case 'call-return': {
      const call = graph.calls[fact.callId]
      if (!call || call.status !== 'pending') throw new Error('Call return without pending call')
      const invocation = call.calleeInvocationId ? graph.invocations[call.calleeInvocationId] : undefined
      let result = invocation?.returnValueId
      if (!result || !same(graph.values[result].value, fact.value)) result = value(fact.value, fact.inputText !== undefined ? 'input' : 'return')
      graph = { ...graph, calls: store.put(graph.calls, call.id, { ...call, resultValueId: result, status: 'returned' }),
        results: store.put(graph.results, `${call.callerInvocationId}:${call.context.site}`, result) }
      edge('RETURN', call.id, result)
      if (call.declared.name === '<init>' && fact.value.kind === 'reference') {
        // A super/this constructor may finish while the enclosing constructor is
        // still active. Only an explicit completed NEW marks the object complete.
        edge('CONSTRUCT', call.id, fact.value.objectId)
      }
      if (fact.inputText !== undefined) {
        const id = fresh('input')
        graph = { ...graph, io: store.put(graph.io, id, { id, kind: 'input-consume', channel: 'stdin', text: fact.inputText, callId: call.id, valueId: result, eventId, context }) }
        edge('INPUT_CONSUME', id, result)
      }
      break
    }
    case 'exit': case 'unwind': {
      const invocation = graph.invocations[fact.invocationId]
      if (!invocation) throw new Error('Completion without invocation')
      graph = { ...graph, invocations: store.put(graph.invocations, invocation.id, { ...invocation, status: fact.kind === 'exit' ? 'returned' : 'unwound', completedAt: eventId }) }
      if (fact.kind === 'unwind' && fact.exceptionId) {
        edge('UNWIND', invocation.id, fact.exceptionId)
        const call = invocation.callId ? graph.calls[invocation.callId] : undefined
        if (call) graph = { ...graph, calls: store.put(graph.calls, call.id, { ...call, status: 'threw' }) }
      }
      break
    }
    case 'throw': case 'catch': {
      const call = fact.callId ? graph.calls[fact.callId] : undefined
      if (call?.status === 'pending') graph = { ...graph, calls: store.put(graph.calls, call.id, { ...call, status: 'threw' }) }
      if (!graph.objects[fact.exceptionId] && fact.className) graph = { ...graph, objects: store.put(graph.objects, fact.exceptionId, { id: fact.exceptionId, className: fact.className, allocatedAt: eventId }) }
      edge(fact.kind === 'throw' ? 'THROW' : 'CATCH', fact.kind === 'throw' ? fact.invocationId : fact.exceptionId, fact.kind === 'throw' ? fact.exceptionId : fact.invocationId)
      if (call) edge('THROW', call.id, fact.exceptionId)
      break
    }
    case 'constructed': {
      const object = graph.objects[fact.objectId]
      if (object) graph = { ...graph, objects: store.put(graph.objects, object.id, { ...object, constructedAt: eventId }) }
      if (fact.newSite !== undefined) {
        const id = value({ kind: 'reference', javaType: fact.className, objectId: fact.objectId }, 'observed')
        graph = { ...graph, results: store.put(graph.results, key(fact.newSite), id) }
      }
      break
    }
    case 'io': {
      const id = fresh('io')
      const call = fact.callId ? graph.calls[fact.callId] : undefined
      graph = { ...graph, io: store.put(graph.io, id, { id, kind: fact.channel === 'stdin' ? 'input-bytes' : 'output', channel: fact.channel, text: fact.text, ...(call ? { callId: call.id } : {}), eventId, context }) }
      if (fact.channel !== 'stdin') edge('OUTPUT', call?.id ?? context.frameId ?? `io:${fact.channel}:unknown-operation:${eventId}`, id, call || context.frameId ? 'observed' : 'unknown')
      break
    }
    case 'file': {
      const id = fresh('file'), call = fact.callId ? graph.calls[fact.callId] : undefined
      graph = { ...graph, io: store.put(graph.io, id, { id, kind: 'file', channel: 'file', text: fact.text,
        operation: fact.operation, path: fact.path, eventId, context, ...(call ? { callId: call.id } : {}),
        ...(fact.byteCount === undefined ? {} : { byteCount: fact.byteCount }),
        ...(fact.charCount === undefined ? {} : { charCount: fact.charCount }),
        ...(fact.truncated === undefined ? {} : { truncated: fact.truncated }) }) }
      edge('FILE_OPERATION', call?.id ?? context.frameId ?? `file:unknown:${eventId}`, id, call || context.frameId ? 'observed' : 'unknown')
      if (fact.operation === 'read' && call?.resultValueId) edge('FILE_READ', id, call.resultValueId)
      // Only exact successful API signatures prove which argument supplied text.
      // Arbitrary CharSequence implementations and mutable buffers stay opaque.
      if (fact.operation === 'write' && call) {
        const textIndex = call.declared.owner === 'java.nio.file.Files' && call.declared.name === 'writeString'
          && call.declared.descriptor.startsWith('(Ljava/nio/file/Path;Ljava/lang/CharSequence;') ? 1
          : ['java.io.BufferedWriter', 'java.io.Writer'].includes(call.declared.owner) && call.declared.name === 'write'
            && call.declared.descriptor.startsWith('(Ljava/lang/String;') ? 0 : -1
        const valueId = call.argumentValueIds[textIndex], observed = valueId && graph.values[valueId]?.value
        if (observed && (observed.kind === 'stringSummary' || observed.kind === 'reference' && ['String', 'java.lang.String'].includes(observed.javaType)))
          edge('FILE_WRITE', valueId, id)
      }
      break
    }
  }
  return graph
}

/** O(degree) queries; invocation/field/call lookup is indexed, independent of renderer. */
export function incomingEdges(graph: ExecutionGraph, id: string): GraphEdge[] { return (graph.incoming[id] ?? []).map(index => graph.edges[index]) }
export function outgoingEdges(graph: ExecutionGraph, id: string): GraphEdge[] { return (graph.outgoing[id] ?? []).map(index => graph.edges[index]) }
export function invocationCompletion(graph: ExecutionGraph, id: string): 'active' | 'normal-return' | 'exceptional-unwind' | 'recorded-prefix-ended' | null {
  const invocation = graph.invocations[id]
  return !invocation ? null : invocation.status === 'returned' ? 'normal-return' : invocation.status === 'unwound' ? 'exceptional-unwind' : graph.observationEndedAt ? 'recorded-prefix-ended' : 'active'
}
export function invocationInputs(graph: ExecutionGraph, id: string) {
  const invocation = graph.invocations[id]
  return invocation ? { call: invocation.callId ? graph.calls[invocation.callId] : undefined,
    receiverObjectId: invocation.receiverObjectId, parameters: invocation.parameterIds.map(parameter => graph.storage[parameter]),
    completion: invocationCompletion(graph, id) } : null
}
export function fieldOrigin(graph: ExecutionGraph, id: string) {
  const field = graph.storage[id]
  if (field?.kind !== 'field' && field?.kind !== 'static') return null
  return { field, value: field.valueId ? graph.values[field.valueId] : undefined,
    writer: field.writerInvocationId ? graph.invocations[field.writerInvocationId] : undefined,
    writes: incomingEdges(graph, id).filter(edge => edge.kind === 'FIELD_WRITE' || edge.kind === 'STATIC_WRITE' || edge.kind === 'OBSERVE') }
}
export function returnDestinations(graph: ExecutionGraph, invocationId: string): GraphEdge[] {
  const id = graph.invocations[invocationId]?.returnValueId
  return id ? outgoingEdges(graph, id).filter(edge => ['ASSIGN', 'FIELD_WRITE', 'STATIC_WRITE', 'ARRAY_WRITE', 'ARGUMENT_BIND', 'COMPUTE', 'RETURN'].includes(edge.kind)) : []
}
export function operationOutput(graph: ExecutionGraph, callId: string) {
  return outgoingEdges(graph, callId).filter(edge => edge.kind === 'OUTPUT').map(edge => graph.io[edge.to])
}
export function exceptionPath(graph: ExecutionGraph, exceptionId: string): GraphEdge[] {
  const indexes = [...(graph.incoming[exceptionId] ?? []), ...(graph.outgoing[exceptionId] ?? [])].sort((a, b) => a - b)
  return indexes.map(index => graph.edges[index]).filter(edge => ['THROW', 'UNWIND', 'CATCH'].includes(edge.kind))
}
