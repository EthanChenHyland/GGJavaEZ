import assert from 'node:assert/strict';
import { arrayElementSlotId } from '../../src/contracts/runtime.ts';
import { seek } from '../../src/runtime/seek.ts';

const values = object => Object.values(object ?? {});
const scalar = (javaType, value) => ({ kind: 'primitive', javaType, value });
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const ownerOf = (run, frameId) => run.state.frames[frameId];
const objectsOf = (run, className) => values(run.state.objects).filter(object => object.className === className);

/** Names identify only the explicit assertion target. They are never a source of
 * provenance; every local value below comes from production semantic events.
 */
export function localValues(run, name, { owner = run.spec.mainClass, method = 'main' } = {}) {
  const declarations = new Map(), observed = [];
  const key = (frameId, slotId) => `${frameId}\0${slotId}`;
  const record = (frameId, slotId, value) => {
    const declaration = declarations.get(key(frameId, slotId));
    const frame = ownerOf(run, frameId);
    if (declaration?.name === name && frame?.className === owner && frame.methodName === method) observed.push(value);
  };
  for (const event of run.trace.events) {
    if (event.type === 'DECLARE_LOCAL') {
      declarations.set(key(event.frameId, event.slot.id), event.slot);
      record(event.frameId, event.slot.id, event.slot.value);
    } else if (event.type === 'ASSIGN_LOCAL') {
      record(event.frameId, event.slotId, event.value);
    } else if (event.type === 'CREATE_REFERENCE' && event.sourceSlot.kind === 'frame') {
      const { frameId, slotId } = event.sourceSlot;
      const declaration = declarations.get(key(frameId, slotId));
      assert.ok(declaration, `Reference transition has no recorded slot declaration ${frameId}/${slotId}`);
      record(frameId, slotId, { kind: 'reference', javaType: declaration.javaType, objectId: event.targetObjectId });
    } else if (event.type === 'CLEAR_REFERENCE' && event.sourceSlot.kind === 'frame') {
      const { frameId, slotId } = event.sourceSlot;
      assert.ok(declarations.has(key(frameId, slotId)), `Clear transition has no recorded slot declaration ${frameId}/${slotId}`);
      record(frameId, slotId, { kind: 'null' });
    }
  }
  return observed;
}

export function reference(run, name, selector = {}) {
  const found = localValues(run, name, selector).filter(value => !['uninitialized', 'unavailable'].includes(value.kind)).at(-1);
  assert.ok(found?.kind === 'reference', `Missing actual reference for ${name}: ${JSON.stringify(localValues(run, name, selector))}`);
  assert.ok(run.state.objects[found.objectId], `Reference ${name} points to absent object ${found.objectId}`);
  assert.ok(run.graph?.objects[found.objectId], `Reference ${name} is absent from graph object identities`);
  return found.objectId;
}

function objectText(run, value) {
  if (value?.kind === 'stringSummary') return value.value;
  if (value?.kind === 'reference') return run.state.objects[value.objectId]?.string?.value;
  return undefined;
}

function itemMatches(run, value, expected) {
  return expected === null ? value?.kind === 'null'
    : value?.kind === 'reference' && value.objectId === reference(run, expected);
}

function entryMatches(run, actual, expected) {
  const key = expected.nullKey ? actual.key.kind === 'null'
    : expected.keyReference ? itemMatches(run, actual.key, expected.keyReference)
    : objectText(run, actual.key) === expected.keyText;
  const value = expected.nullValue ? actual.value.kind === 'null' : itemMatches(run, actual.value, expected.reference);
  return key && value;
}

function summaryMatches(run, summary, stage) {
  if (stage.size !== undefined && summary.size !== stage.size) return false;
  if (stage.truncated !== undefined && summary.truncated !== stage.truncated) return false;
  if (stage.items) {
    if (summary.items?.length !== stage.items.length) return false;
    if (stage.unordered) {
      // Remove one matching item per expected member; duplicates cannot mask a missing member.
      const remaining = [...summary.items];
      for (const expected of stage.items) {
        const index = remaining.findIndex(value => itemMatches(run, value, expected));
        if (index < 0) return false;
        remaining.splice(index, 1);
      }
    } else if (!stage.items.every((expected, index) => itemMatches(run, summary.items[index], expected))) return false;
  }
  if (stage.texts && !same(summary.items?.map(value => objectText(run, value)), stage.texts)) return false;
  if (stage.entries) {
    if (stage.exactEntries) {
      if (summary.entries?.length !== stage.entries.length ||
          !stage.entries.every((expected, index) => entryMatches(run, summary.entries[index], expected))) return false;
    } else if (!stage.entries.every(expected => summary.entries?.some(actual => entryMatches(run, actual, expected)))) return false;
  }
  return true;
}

function staticSlot(run, fact) {
  const cls = run.state.classes?.[`jvm:class:${fact.owner}`];
  assert.ok(cls, `Missing static class storage ${fact.owner}`);
  assert.equal(cls.className, fact.owner);
  const slot = values(cls.statics).find(value => value.name === fact.field);
  assert.ok(slot, `Missing ${fact.owner}.${fact.field}`);
  assert.equal(slot.static, true);
  assert.equal(slot.declaringClass, fact.owner);
  assert.ok(run.graph?.storage[slot.id], `Static slot ${slot.id} absent from graph`);
  assert.equal(run.graph.storage[slot.id].kind, 'static');
  assert.equal(run.graph.storage[slot.id].ownerId, cls.id);
  return slot;
}

export const FACTS = {
  local(run, fact) {
    assert.ok(localValues(run, fact.name, fact).some(value => same(value, scalar(fact.javaType, fact.value))),
      `${fact.name} lacks exact ${fact.javaType} ${JSON.stringify(fact.value)}`);
    assert.ok(values(run.graph?.values).some(node => same(node.value, scalar(fact.javaType, fact.value))), 'Graph lost the exact typed local value');
  },
  alias(run, fact) { assert.equal(reference(run, fact.left), reference(run, fact.right)); },
  differentIdentity(run, fact) { assert.notEqual(reference(run, fact.left), reference(run, fact.right)); },
  invoked(run, fact) {
    assert.ok(values(run.graph?.invocations).some(invocation => invocation.method.owner === fact.owner && invocation.method.name === fact.method),
      `No observed invocation ${fact.owner}.${fact.method}`);
  },
  field(run, fact) {
    assert.ok(objectsOf(run, fact.className).some(object => values(object.fields).some(slot => slot.name === fact.field &&
      same(slot.value, scalar(fact.javaType, fact.value)))), `No exact field ${fact.className}.${fact.field}`);
  },
  static(run, fact) {
    const slot = staticSlot(run, fact);
    assert.deepEqual(slot.value, scalar(fact.javaType, fact.value));
    assert.deepEqual(run.graph.values[run.graph.storage[slot.id].valueId]?.value, slot.value);
  },
  staticMutation(run, fact) {
    const slot = staticSlot(run, fact);
    const index = run.trace.events.findIndex(event => event.type === 'SET_STATIC' && event.slotId === slot.id && same(event.value, scalar(fact.javaType, fact.after)));
    assert.ok(index >= 0, 'No successful static write');
    const before = seek(run.trace, index), after = seek(run.trace, index + 1);
    assert.deepEqual(before.classes[`jvm:class:${fact.owner}`].statics[slot.id].value, scalar(fact.javaType, fact.before));
    assert.deepEqual(after.classes[`jvm:class:${fact.owner}`].statics[slot.id].value, scalar(fact.javaType, fact.after));
    assert.ok(run.graph.edges.some(edge => edge.kind === 'STATIC_WRITE' && edge.to === slot.id &&
      same(run.graph.values[edge.from]?.value, scalar(fact.javaType, fact.after))));
  },
  staticReference(run, fact) { assert.equal(staticSlot(run, fact).value.objectId, reference(run, fact.reference)); },
  classInitialization(run, fact) {
    const raw = run.rawEvents;
    const entered = raw.find(event => event.type === 'enter' && event.className === fact.owner && event.methodName === '<clinit>');
    const started = raw.find(event => event.type === 'class_state' && event.owner === fact.owner && event.initialization === 'started');
    const completed = raw.find(event => event.type === 'class_state' && event.owner === fact.owner && event.initialization === 'completed');
    const exited = raw.find(event => event.type === 'exit' && event.frameId === entered?.frameId);
    assert.ok(entered && started && completed && exited, `Incomplete <clinit> observations for ${fact.owner}`);
    assert.ok(entered.seq < started.seq && started.seq < completed.seq && completed.seq < exited.seq);
    assert.equal(run.state.classes[`jvm:class:${fact.owner}`].initialization, 'completed');
  },
  arrayShape(run, fact) {
    const array = run.state.objects[reference(run, fact.array)].array;
    assert.ok(array);
    assert.equal(array.elementType, fact.elementType);
    assert.equal(array.length, fact.length);
    if (fact.bounded) { assert.ok(array.elements.length <= 32); assert.equal(array.truncated, true); }
  },
  arrayCell(run, fact) {
    const objectId = reference(run, fact.array), array = run.state.objects[objectId].array;
    assert.ok(array, `${fact.array} is not an observed array`);
    const slot = array.elements[fact.index] ?? array.sparseElements?.[fact.index];
    assert.ok(slot, `Missing observed cell ${fact.array}[${fact.index}]`);
    assert.equal(slot.id, arrayElementSlotId(objectId, fact.index));
    if (fact.reference) { assert.equal(slot.value.kind, 'reference'); assert.equal(slot.value.objectId, reference(run, fact.reference)); }
    else if (fact.null) assert.deepEqual(slot.value, { kind: 'null' });
    else assert.deepEqual(slot.value, scalar(fact.javaType, fact.value));
    if (fact.readAndWrite) {
      for (const type of ['ARRAY_READ', 'ARRAY_WRITE']) assert.ok(run.trace.events.some(event => event.type === type &&
        event.objectId === objectId && event.index === fact.index && same(event.value, slot.value)), `Missing successful ${type}`);
      assert.ok(run.graph.edges.some(edge => edge.kind === 'ARRAY_WRITE' && edge.to === slot.id));
      assert.deepEqual(run.graph.values[run.graph.storage[slot.id]?.valueId]?.value, slot.value, 'Graph narrowed the array cell');
    }
  },
  string(run, fact) {
    const object = run.state.objects[reference(run, fact.local)];
    assert.ok(object.string, 'String must have an identity and bounded text');
    assert.equal(object.string.length, fact.length);
    assert.equal(object.string.truncated, fact.truncated);
    if (fact.value !== undefined) assert.equal(object.string.value, fact.value);
    if (fact.noInternals) {
      const summaryId = `${object.id}:summary:value`, summary = object.fields[summaryId];
      assert.ok(summary, 'Missing explicit semantic String value slot');
      assert.equal(summary.javaType, 'String');
      assert.deepEqual(summary.value, { kind: 'stringSummary', javaType: 'String', value: object.string.value });
      const implementationField = slot => /:field:java[./]lang[./]String:/.test(slot.id) ||
        ['coder', 'hash', 'hashIsZero'].includes(slot.name) || (slot.name === 'value' && slot.id !== summaryId);
      assert.ok(values(object.fields).every(slot => !implementationField(slot)), 'JDK String implementation fields leaked into runtime fields');
      const storage = values(run.graph.storage).filter(slot => slot.ownerId === object.id);
      assert.ok(storage.every(slot => !implementationField(slot)), 'JDK String implementation fields leaked into graph storage');
      const graphSummary = run.graph.storage[summaryId];
      assert.ok(graphSummary, 'Semantic String summary is absent from graph storage');
      assert.equal(graphSummary.javaType, 'String');
      assert.deepEqual(run.graph.values[graphSummary.valueId]?.value, summary.value);
    }
  },
  collectionHistory(run, fact) {
    const candidates = objectsOf(run, fact.className);
    assert.ok(candidates.length, `No ${fact.className} identity`);
    // All requested stages must occur in order for the SAME identity, including
    // reductions/clear. Matching unrelated collections is not accepted.
    let matched = null;
    for (const object of candidates) {
      const observations = run.trace.events.map((event, index) => ({ event, cursor: index + 1 }))
        .filter(({ event }) => event.type === 'OBJECT_OBSERVE' && event.objectId === object.id && event.library?.kind === fact.collectionKind);
      let after = -1;
      const stages = [];
      for (const stage of fact.stages) {
        const found = observations.find(({ event, cursor }) => cursor > after && (!fact.order || event.library.order === fact.order) && summaryMatches(run, event.library, stage));
        if (!found) break;
        stages.push({ ...found, stage }); after = found.cursor;
      }
      if (stages.length === fact.stages.length) { matched = { object, stages }; break; }
    }
    assert.ok(matched, `Missing ordered ${fact.collectionKind} summary history: ${JSON.stringify(fact.stages)}`);
    for (const { stage, cursor } of matched.stages) {
      const snapshot = seek(run.trace, cursor), encoded = JSON.stringify(snapshot.objects[matched.object.id].library);
      assert.ok(summaryMatches(run, snapshot.objects[matched.object.id].library, stage));
      seek(run.trace, run.trace.events.length);
      assert.equal(JSON.stringify(snapshot.objects[matched.object.id].library), encoded, 'Later seek mutated an earlier collection snapshot');
      assert.equal(JSON.stringify(seek(run.trace, cursor).objects[matched.object.id].library), encoded, 'Reverse seek changed membership');
    }
  },
  metadata(run, fact) {
    const objects = objectsOf(run, fact.className);
    assert.ok(objects.some(object => {
      const metadata = object.metadata;
      return metadata && ['ownership', 'record', 'enum', 'synthetic'].every(key => fact[key] === undefined || metadata[key] === fact[key]) &&
        (!fact.components || same(metadata.components?.map(component => component.name), fact.components));
    }), `Missing type metadata ${fact.className}`);
  },
  outerReference(run, fact) {
    assert.ok(objectsOf(run, fact.className).some(object => values(object.fields).some(slot =>
      slot.synthetic && slot.value.kind === 'reference' && slot.value.objectId === reference(run, fact.reference))), 'Missing observed synthetic outer-instance reference');
  },
  noOuterReference(run, fact) {
    const objects = objectsOf(run, fact.className);
    assert.ok(objects.length);
    assert.ok(objects.every(object => values(object.fields).every(slot => !slot.name.startsWith('this$') && slot.synthetic !== 'outer')));
  },
  opaqueCollection(run, fact) {
    const ids = new Set(objectsOf(run, fact.className).map(object => object.id));
    const summaries = run.trace.events.filter(event => event.type === 'OBJECT_OBSERVE' && ids.has(event.objectId) && event.library).map(event => event.library);
    assert.ok(summaries.some(summary => summary.kind === 'OPAQUE' && summary.reason), `Unsafe implementation ${fact.className} needs an explicit opaque observation`);
    assert.ok(summaries.every(summary => summary.kind === 'OPAQUE' && !summary.items?.length && !summary.entries?.length), 'User collection contents were decoded');
  },
  libraryBoundary(run, fact) {
    const calls = values(run.graph?.calls).filter(call => call.declared.owner === fact.owner);
    assert.ok(calls.length && calls.every(call => call.ownership === 'LIBRARY'), `External boundary ${fact.owner} needs LIBRARY ownership`);
    assert.ok(!values(run.graph.invocations).some(invocation => invocation.method.owner === fact.owner), 'Dependency internals flooded project invocations');
    assert.ok(calls.some(call => call.resultValueId), 'Project-visible library return absent');
  },
  reflectiveBoundary(run, fact) {
    const invoked = values(run.graph.invocations).filter(invocation => invocation.method.owner === fact.owner && invocation.method.name === fact.method);
    assert.ok(invoked.length);
    for (const invocation of invoked) {
      if (!invocation.callId) continue; // Observed entry can truthfully have no statically proven caller.
      const call = run.graph.calls[invocation.callId];
      assert.ok(call, 'Invocation points to missing call');
      assert.ok(call.invokeKind === 'dynamic' || (call.declared.owner === fact.owner && call.declared.name === fact.method),
        'Reflective target was falsely bound as Method.invoke itself');
    }
  },
  unobservedMethod(run, fact) {
    assert.ok(!values(run.graph.invocations).some(invocation => invocation.method.owner === fact.owner && invocation.method.name === fact.method),
      'An offline-uninstrumented method acquired a fabricated invocation');
  },
  noFabricatedDynamicBinding(run) {
    for (const call of values(run.graph.calls)) {
      if (!call.calleeInvocationId || call.declared.owner !== 'java.lang.reflect.Method') continue;
      const callee = run.graph.invocations[call.calleeInvocationId];
      assert.equal(callee?.method.owner, call.declared.owner, 'Method.invoke acquired an unrelated dynamic target as a proven static callee');
    }
  },
  fileOperation(run, fact) {
    const operations = values(run.graph?.io).filter(io => io.kind === 'file' && io.operation === fact.operation &&
      (!fact.pathSuffix || io.path?.replaceAll('\\', '/').endsWith(fact.pathSuffix)) && (fact.preview === undefined || io.text === fact.preview) &&
      (fact.charCount === undefined || io.charCount === fact.charCount) && (fact.truncated === undefined || io.truncated === fact.truncated));
    assert.ok(operations.length, `Missing successful file ${fact.operation} ${fact.pathSuffix ?? ''}`);
    assert.ok(operations.every(io => io.callId && run.graph.calls[io.callId] && io.context.source), 'File I/O lacks observed call/source context');
    assert.ok(operations.every(io => io.text.length <= 256), 'File contents flooded semantic metadata');
  },
  exception(run, fact) {
    assert.ok(run.state.exceptions.some(exception => exception.className === fact.className && (!fact.caught || exception.caughtBy) &&
      (!fact.unwoundMethod || exception.unwoundFrameIds.some(id => run.state.frames[id].methodName === fact.unwoundMethod))),
    `Missing throw/unwind/catch facts for ${fact.className}`);
  },
  noSuccessfulArrayOperation(run, fact) {
    assert.ok(!run.rawEvents.some(event => event.type === fact.operation && event.className === fact.owner && event.methodName === fact.method),
      'Failed JVM opcode produced a successful array observation');
  },
  inputConsumed(run, fact) {
    assert.equal(run.inputSent, true);
    assert.ok(values(run.graph?.io).some(io => io.kind === 'input-consume' && io.text.trim() === fact.text && io.valueId), 'No consumed input value');
  },
  sourceFiles(run, fact) {
    assert.ok(new Set(run.trace.events.map(event => event.source?.fileId).filter(Boolean)).size >= fact.min);
  },
  dependency(run, fact) {
    assert.ok(run.dependencies.some(dependency => dependency.name.includes(fact.name)), `Missing resolved dependency ${fact.name}`);
    assert.ok(run.runtimeClasspathEntries > 1, 'Dependency omitted from resolved launch classpath');
  },
  noMachineryFlood(run) {
    assert.ok(!values(run.graph.invocations).some(invocation => /^(java\.lang\.invoke\.|jdk\.internal\.reflect\.)/.test(invocation.method.owner)), 'JVM machinery became project invocations');
  },
  boundedPreviews(run) {
    let count = 0;
    for (const event of run.trace.events) {
      if (event.type !== 'OBJECT_OBSERVE') continue;
      if (event.library) { count++; assert.ok((event.library.items?.length ?? 0) <= 32); assert.ok((event.library.entries?.length ?? 0) <= 32); }
      if (event.string) { count++; assert.ok(event.string.value.length <= 256); assert.ok(event.string.value.length <= event.string.length); }
    }
    assert.ok(count > 0, 'Preview bound assertion had no observed summaries');
  },
  recordingStopped(run, fact) {
    assert.equal(run.snapshot.recording.state, 'STOPPED_LIMIT');
    assert.equal(run.snapshot.recording.budget, fact.budget);
    assert.equal(run.snapshot.recording.executionContinued, true);
    assert.equal(run.state.status, 'partial');
    assert.equal(run.trace.events.at(-1).type, 'CAPTURE_STOP');
    assert.ok(run.rawEvents.filter(event => event.type !== 'capture_saturated').length <= run.spec.rawEventLimit);
    assert.equal(run.rawEvents.at(-1).type, 'capture_saturated');
  },
};

export function assertFact(run, fact) {
  assert.ok(FACTS[fact.kind], `Unknown fact kind ${fact.kind}`);
  try { FACTS[fact.kind](run, fact); }
  catch (error) { throw new Error(`${fact.kind} ${JSON.stringify(fact)}: ${error.message}`, { cause: error }); }
}

export function assertBehavior(run, spec = run.spec) {
  assert.equal(run.snapshot.status, 'exited', JSON.stringify(run.snapshot));
  assert.equal(run.snapshot.exitCode, spec.exitCode);
  assert.equal(run.snapshot.stdout, spec.stdout);
  assert.equal(run.snapshot.stderr, spec.stderr);
  const allowed = Array.isArray(spec.recording) ? spec.recording : [spec.recording];
  assert.ok(allowed.includes(run.snapshot.recording.state), `Unexpected recording ${JSON.stringify(run.snapshot.recording)}`);
  if (run.snapshot.recording.state === 'FULL' && spec.exitCode === 0) assert.equal(run.state.status, 'ended', 'Full successful recording did not normalize to ended');
  assert.ok(!run.capability.diagnostics.some(diagnostic => /^Raw event\b/i.test(diagnostic)),
    `Normalizer rejected an actual Recorder event: ${JSON.stringify(run.capability.diagnostics)}`);
  if (spec.buildSystem) assert.equal(run.buildSystem, spec.buildSystem);
  for (const [path, text] of Object.entries(spec.files ?? {})) assert.equal(run.files[path], text);
  assert.ok(run.graph && Object.keys(run.graph.invocations).length > 0, 'No observed project graph');
}
