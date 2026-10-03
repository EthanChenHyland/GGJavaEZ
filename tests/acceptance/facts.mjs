/**
 * Evaluates `expected.facts.json` entries against one acceptance run.
 * Facts are semantic: entities, relationships, values and evidence. They never mention
 * coordinates, and they never depend on example names inside product code.
 * Every evaluator returns { ok, detail } so failures explain themselves.
 */
const methodOf = (frame) => frame ? `${frame.className}.${frame.methodName}` : null;
const scalar = (value) => value?.kind === 'primitive' || value?.kind === 'stringSummary' ? value.value
  : value?.kind === 'null' ? null : value?.kind === 'uninitialized' ? '<unavailable>' : value?.kind === 'reference' ? `<ref ${value.objectId}>` : undefined;
const sameScalar = (actual, expected) => String(actual) === String(expected);

function localWrites(run, method, name) {
  const frames = run.final.frames;
  const out = [];
  for (const event of run.trace.events) {
    if (event.type === 'DECLARE_LOCAL' && event.slot.name === name && methodOf(frames[event.frameId]) === method) out.push(scalar(event.slot.value));
    if (event.type === 'ASSIGN_LOCAL' && methodOf(frames[event.frameId]) === method) {
      const declared = run.trace.events.find((e) => e.type === 'DECLARE_LOCAL' && e.slot.id === event.slotId);
      if (declared?.slot.name === name) out.push(scalar(event.value));
    }
  }
  return out;
}
const objectsOf = (run, className) => Object.values(run.final.objects).filter((object) => object.className === className);
const fieldValues = (run, className, field) => objectsOf(run, className)
  .map((object) => Object.values(object.fields).find((slot) => slot.name === field)).filter(Boolean).map((slot) => scalar(slot.value));

export const evaluators = {
  exit: (run, f) => {
    const s = run.snapshot;
    const missingOut = (f.stdout ?? []).filter((text) => !s.stdout.includes(text));
    const missingErr = (f.stderr ?? []).filter((text) => !s.stderr.includes(text));
    return { ok: s.exitCode === f.code && !missingOut.length && !missingErr.length,
      detail: `exit ${s.exitCode} (${s.status}/${s.terminalStatus}); missing stdout ${JSON.stringify(missingOut)} stderr ${JSON.stringify(missingErr)}` };
  },
  recording: (run, f) => {
    const recording = run.snapshot.recording;
    const end = run.trace.events.at(-1);
    return { ok: recording?.state === f.state && recording?.budget === f.budget && recording?.executionContinued === true
      && Number.isSafeInteger(recording.lastRecordedSeq) && end?.type === 'CAPTURE_STOP' && run.final.status === 'partial',
      detail: `recording ${JSON.stringify(recording)}, visual end ${end?.type}/${run.final.status}` };
  },
  validWorld: (run) => {
    const frames = run.scene.frames.length, total = Object.keys(run.final.frames).length;
    return { ok: frames === total && frames > 0 && run.trace.events.length > 1, detail: `${frames}/${total} invocations in scene, ${run.trace.events.length} events` };
  },
  objects: (run, f) => { const n = objectsOf(run, f.className).length; return { ok: n >= (f.min ?? 1) && (f.max === undefined || n <= f.max), detail: `${n} ${f.className}` }; },
  invoked: (run, f) => {
    const methods = new Set(Object.values(run.final.frames).map(methodOf));
    const missing = f.methods.filter((method) => f.pattern ? ![...methods].some((m) => new RegExp(method).test(m)) : !methods.has(method));
    return { ok: !missing.length, detail: `missing ${JSON.stringify(missing)}` };
  },
  caller: (run, f) => {
    const frames = Object.values(run.final.frames).filter((frame) => methodOf(frame) === f.callee);
    const callers = frames.map((frame) => methodOf(run.final.frames[frame.callerFrameId]));
    return { ok: frames.length > 0 && callers.every((caller) => caller === f.caller), detail: `${f.callee} callers ${JSON.stringify([...new Set(callers)])}` };
  },
  field: (run, f) => {
    const values = fieldValues(run, f.className, f.field);
    const missing = f.includes.filter((want) => !values.some((value) => sameScalar(value, want)));
    return { ok: values.length > 0 && !missing.length, detail: `${f.className}.${f.field} = ${JSON.stringify(values)}` };
  },
  local: (run, f) => {
    const values = localWrites(run, f.method, f.name);
    return { ok: values.some((value) => sameScalar(value, f.value)), detail: `${f.method} ${f.name} observed ${JSON.stringify(values.slice(0, 8))}` };
  },
  eventCount: (run, f) => {
    const n = f.type === 'CALL' ? Object.keys(run.final.executionGraph?.calls ?? {}).length : run.trace.events.filter((event) => f.type === '*' || event.type === f.type).length;
    return { ok: n >= (f.min ?? 0) && (f.max === undefined || n <= f.max), detail: `${n} ${f.type}` };
  },
  maxDepth: (run, f) => { const d = Math.max(...Object.values(run.final.frames).map((frame) => frame.depth)); return { ok: d >= f.min, detail: `max depth ${d}` }; },
  invocations: (run, f) => { const n = Object.keys(run.final.frames).length; return { ok: n >= f.min, detail: `${n} invocations` }; },
  returns: (run, f) => {
    const frames = run.final.frames;
    const values = run.final.returns.filter((r) => !f.method || methodOf(frames[r.frameId]) === f.method).map((r) => scalar(r.value));
    return { ok: f.values.every((v, i) => sameScalar(values[i], v)) && values.length === f.values.length, detail: `returns ${JSON.stringify(values)}` };
  },
  returnDestination: (run, f) => {
    const graph = run.final.executionGraph;
    const n = graph ? Object.values(graph.invocations).filter(invocation => invocation.returnValueId && (graph.outgoing[invocation.returnValueId] ?? []).some(index => {
      const edge = graph.edges[index], destination = graph.storage[edge.to];
      return edge.evidence !== 'unknown' && ((edge.kind === 'ASSIGN' && destination?.kind === 'variable' && destination.ownerId === invocation.callerInvocationId)
        || (edge.kind === 'COMPUTE' && graph.values[edge.to]?.context.frameId === invocation.callerInvocationId));
    })).length : run.final.returns.filter(r => r.destination).length;
    return { ok: n >= f.min, detail: `${n} returns with a proven caller variable or computed-value destination` };
  },
  referenceReturn: (run, f) => {
    const n = run.final.returns.filter((r) => r.value.kind === 'reference' && (!f.method || methodOf(run.final.frames[r.frameId]) === f.method)).length;
    return { ok: n >= (f.min ?? 1), detail: `${n} reference-valued returns` };
  },
  array: (run, f) => {
    const arrays = Object.values(run.final.objects).filter((object) => object.array);
    const match = arrays.filter((object) => object.array.elementType === f.elementType || object.className === f.className);
    const elements = match[0]?.array.elements.map((slot) => scalar(slot.value));
    const ok = match.length >= (f.min ?? 1) && (!f.elements || JSON.stringify(elements) === JSON.stringify(f.elements));
    return { ok, detail: `arrays ${JSON.stringify(arrays.map((a) => a.className))} elements ${JSON.stringify(elements)}` };
  },
  exception: (run, f) => {
    const facts = run.final.exceptions.filter((e) => e.className === f.className);
    const fact = facts[0];
    const caughtIn = fact?.caughtBy ? methodOf(run.final.frames[fact.caughtBy]) : null;
    const unwound = fact?.unwoundFrameIds.map((id) => methodOf(run.final.frames[id])) ?? [];
    const ok = !!fact && (!f.caughtIn || caughtIn === f.caughtIn) && unwound.length >= (f.unwound ?? 0)
      && (!f.unwoundMethods || f.unwoundMethods.every((m) => unwound.includes(m)));
    return { ok, detail: `exception ${f.className}: caught in ${caughtIn}, unwound ${JSON.stringify(unwound)}` };
  },
  retainedInPlace: (run) => {
    // Every invocation that ever entered remains a scene frame after completion, with a terminal status.
    const statuses = run.scene.frames.map((frame) => frame.invocationStatus);
    const active = statuses.filter((s) => s === 'active').length;
    return { ok: run.scene.frames.length === Object.keys(run.final.frames).length && (run.final.status !== 'ended' || active === 0),
      detail: `${run.scene.frames.length} frames, statuses ${JSON.stringify([...new Set(statuses)])}` };
  },
  sourceFiles: (run, f) => {
    const files = new Set(run.trace.events.map((event) => event.source?.fileId).filter(Boolean));
    return { ok: files.size >= f.min, detail: `${files.size} source files: ${[...files].join(', ')}` };
  },
  noEvent: (run, f) => { const n = run.trace.events.filter((event) => f.types.includes(event.type)).length; return { ok: n === 0, detail: `${n} of ${f.types.join('/')}` }; },
  dependency: (run, f) => {
    const names = (run.dependencies ?? []).map((d) => d.name);
    return { ok: names.some((name) => name.includes(f.name)), detail: `dependencies ${JSON.stringify(names)}` };
  },
  // Future coverage facts remain expected failures; Phase 3 flow facts query the semantic graph.
  statics: (run, f) => {
    const cls = run.final.classes?.[`jvm:class:${f.className}`] ?? Object.values(run.final.classes ?? {}).find((c) => c.className === f.className);
    const names = cls ? Object.values(cls.statics).map((slot) => slot.name) : [];
    return { ok: f.fields.every((name) => names.includes(name)), detail: `statics of ${f.className}: ${JSON.stringify(names)}` };
  },
  libraryValue: (run, f) => {
    const found = Object.values(run.final.objects).filter((object) => object.className === f.className);
    return { ok: found.length >= (f.min ?? 1) && (f.size === undefined || found.some((o) => o.library?.size === f.size)), detail: `${found.length} ${f.className} library values` };
  },
  parameterOrigin: (run, f) => {
    const graph = run.final.executionGraph;
    const parameters = new Set(Object.values(graph?.invocations ?? {}).flatMap(invocation => invocation.parameterIds));
    const origins = (graph?.edges ?? []).filter(edge => edge.kind === 'ARGUMENT_BIND' && parameters.has(edge.to) && edge.evidence === 'bytecode-derived').length;
    return { ok: origins >= f.min, detail: `${origins} parameters with proven origin` };
  },
  inputDestination: (run, f) => {
    const graph = run.final.executionGraph;
    const n = graph ? Object.values(graph.io).filter(input => input.kind === 'input-consume' && input.valueId && (graph.outgoing[input.valueId] ?? []).some(index => {
      const edge = graph.edges[index];
      return edge.kind === 'ASSIGN' && edge.evidence !== 'unknown' && graph.storage[edge.to]?.kind === 'variable';
    })).length : run.final.console.filter(entry => entry.kind === 'input' && entry.destinationSlotId).length;
    return { ok: n >= f.min, detail: `${n} input chunks bound to a destination slot` };
  },
};

export function evaluate(run, fact) {
  const evaluator = evaluators[fact.kind];
  if (!evaluator) throw new Error(`Unknown fact kind ${fact.kind}`);
  return evaluator(run, fact);
}

/** Apply a whole-word identifier rename map to every string in a fact (for permuted variants). */
export function renameFact(fact, rename) {
  return JSON.parse(JSON.stringify(fact), (_key, value) => typeof value === 'string' ? rename(value) : value);
}
