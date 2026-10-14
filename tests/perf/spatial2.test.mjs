import { afterAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Same opt-in, three accepted caches, seed and 30 seeks × three levels.
// Run serially after browser measurement. Historical reports are not overwritten.
const enabled = process.env.VJ_SPATIAL2_PERF === '1';
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const cacheRoot = resolve(repoRoot, '.ggjavaez/qa/v12-p4/final-accepted/traces');
const outputRoot = resolve(repoRoot, process.env.VJ_PERF_OUTPUT_ROOT ?? '.ggjavaez/qa/reference-exact/cached-projection');
const names = ['25-cross-feature-dispatch', '28-bounded-values', '30-observer-budget'];
const levels = ['FAR', 'MEDIUM', 'CLOSE'], sampleCount = 30, seedInitial = 0x5eed5;
const report = {
  probe: 'production-successor-cached-jvm-cpu', recordedAt: new Date().toISOString(), sampleCount, seed: seedInitial,
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model },
  scope: 'Same accepted cached JVM facts. No fresh JVM, browser, React mount, WebGL, GPU, Troika or physical rendering claim.',
  methodology: 'Same cache identities, seed, 30 seeks and three levels, prefix append size 256, nearest-rank distributions and pre-seek GC checkpoints. Production layout/projector/planner/FlowCatalog/represented ports replace retired Spatial 2 stages. Actual paths are sampled at 25 points; surface-corridor routing is a separate CPU diagnostic. No historical report or fixed Dense gate is replaced.',
  traces: [],
};
let corePromise;
function loadCore() {
  corePromise ??= Promise.all([
    import('../../src/runtime/history.ts'), import('../../src/runtime/seek.ts'),
    import('../../src/world/layoutEngine.ts'), import('../../src/world/sceneProjector.ts'),
    import('../../src/world/presentationPlanner.ts'), import('../../src/world/flowCatalog.ts'),
    import('../../src/world/flowTopology.ts'), import('../../src/world/referenceTopology.ts'),
    import('../../src/world/connectorRouting.ts'), import('../../src/world/connectorRouter.ts'),
    import('../../src/world/arrayCellTarget.ts'), import('../../src/world/valueText.ts'),
    import('../../src/contracts/runtime.ts'), import('../../src/theme/tokens.ts'),
  ]).then(parts => Object.assign({}, ...parts));
  return corePromise;
}
const timed = fn => { const start = performance.now(), value = fn(); return { value, ms: performance.now() - start }; };
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const nodes = scene => Object.values(scene.entities);
function counts(scene) {
  const arrays = nodes(scene).filter(node => node.kind === 'array');
  return { frames: scene.order.frames.length, objects: scene.order.objects.length, classes: scene.order.classes.length,
    references: scene.references.length, io: scene.io.length, recordedArrayCells: arrays.reduce((sum, node) => sum + node.cells.length, 0),
    logicalArrayLength: arrays.reduce((sum, node) => sum + node.length, 0) };
}
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b), at = fraction => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
  return { count: sorted.length, p50: at(.5), p95: at(.95), min: sorted[0], max: sorted.at(-1), method: 'nearest-rank' };
}
function heapAfterGc() { if (typeof globalThis.gc !== 'function') return null; globalThis.gc(); return process.memoryUsage().heapUsed; }
function persistentLayout(trace, core) {
  const builder = core.createLayoutEngine(); let appendCpuMs = 0;
  for (let to = 256; to < trace.events.length + 256; to += 256) {
    const previous = builder.state, saved = fingerprint(previous);
    appendCpuMs += timed(() => builder.append(trace.events.slice(0, Math.min(to, trace.events.length)))).ms;
    assert.equal(fingerprint(previous), saved, 'append mutated prior layout');
    for (const [id, anchor] of Object.entries(previous.anchors)) {
      assert.deepEqual(builder.state.anchors[id].position, anchor.position, `append moved ${id}`);
      assert.deepEqual(builder.state.anchors[id].size, anchor.size, `append resized ${id}`);
      for (const [slot, port] of Object.entries(anchor.ports)) assert.deepEqual(builder.state.anchors[id].ports[slot], port);
    }
  }
  assert.equal(builder.length, trace.events.length);
  return { builder, layout: builder.state, appendCpuMs };
}
function rawSlots(state, core) {
  const slots = new Map();
  for (const frame of Object.values(state.frames)) for (const slot of Object.values(frame.locals)) slots.set(slot.id, slot.value);
  for (const klass of Object.values(state.classes ?? {})) for (const slot of Object.values(klass.statics)) slots.set(slot.id, slot.value);
  for (const object of Object.values(state.objects)) {
    for (const slot of Object.values(object.fields)) slots.set(slot.id, slot.value);
    if (object.array) {
      object.array.elements.forEach((slot, index) => slots.set(core.arrayElementSlotId(object.id, index), slot.value));
      for (const [index, slot] of Object.entries(object.array.sparseElements ?? {})) slots.set(core.arrayElementSlotId(object.id, Number(index)), slot.value);
    }
    object.library?.items?.forEach((value, index) => slots.set(`${object.id}:summary:item:${index}`, value));
    object.library?.entries?.forEach((entry, index) => {
      slots.set(`${object.id}:summary:entry:${index}:key`, entry.key); slots.set(`${object.id}:summary:entry:${index}:value`, entry.value);
    });
  }
  return slots;
}
function assertCatalog(state, scene, layout, core) {
  assert.equal(scene.order.frames.length, Object.keys(state.frames).length);
  assert.equal(scene.order.objects.length, Object.keys(state.objects).length);
  assert.equal(scene.order.classes.length, Object.keys(state.classes ?? {}).length);
  assert.equal(Object.keys(scene.entities).length, scene.order.frames.length + scene.order.objects.length + scene.order.classes.length);
  for (const [category, source] of [['frames', state.frames], ['objects', state.objects], ['classes', state.classes ?? {}]]) assert.deepEqual([...scene.order[category]].sort(), Object.keys(source).sort());
  const slots = rawSlots(state, core);
  for (const node of nodes(scene)) {
    assert.strictEqual(node.anchor, layout.anchors[node.id]);
    const rows = node.kind === 'frame' || node.kind === 'class' ? node.rows : node.kind === 'object' ? node.groups.flatMap(group => group.rows) : [];
    for (const row of rows) {
      if (slots.has(row.slotId)) assert.deepEqual(row.value, core.valueText(slots.get(row.slotId), { objects: state.objects, context: node.kind === 'frame' ? 'frame' : 'object' }));
      else { assert.equal(row.slotId, `${node.id}:captured-string`); assert.ok(state.objects[node.id]?.string); assert.deepEqual(row.value, core.stringValueText(state.objects[node.id].string)); }
    }
    if (node.kind !== 'array') continue;
    const array = state.objects[node.id].array, observed = new Map();
    array.elements.forEach((slot, index) => observed.set(index, slot));
    for (const [index, slot] of Object.entries(array.sparseElements ?? {})) observed.set(Number(index), slot);
    assert.equal(node.length, array.length, 'logical array length changed');
    assert.equal(node.cells.length, observed.size, 'captured array cells dropped');
    for (const cell of node.cells) {
      assert.equal(cell.slotId, core.arrayElementSlotId(node.id, cell.index));
      assert.ok(observed.has(cell.index));
      assert.deepEqual(cell.value, core.valueText(observed.get(cell.index).value, { objects: state.objects }));
    }
  }
  for (const ref of scene.references) {
    assert.ok(scene.entities[ref.sourceId]); assert.ok(state.objects[ref.targetId]);
    assert.equal(ref.id, core.referenceIdForSlot(ref.sourceSlotId));
    assert.equal(slots.get(ref.sourceSlotId)?.kind, 'reference');
    assert.equal(slots.get(ref.sourceSlotId).objectId, ref.targetId);
  }
  for (const io of scene.io) assert.strictEqual(io.anchor, layout.anchors[io.id]);
}
function selectActual(scene, sample) {
  if (sample % 3 === 0 && scene.references.length) return { kind: 'reference', id: scene.references[sample % scene.references.length].id };
  const cells = nodes(scene).filter(node => node.kind === 'array').flatMap(node => node.cells);
  if (sample % 3 === 1 && cells.length) return { kind: 'slot', id: cells.reduce((last, cell) => cell.index > last.index ? cell : last).slotId };
  const subject = nodes(scene).find(node => node.kind === 'frame' && node.live) ?? nodes(scene).find(node => node.ownership === 'PROJECT') ?? nodes(scene)[0];
  return subject ? { kind: subject.kind === 'frame' || subject.kind === 'class' ? subject.kind : 'object', id: subject.id } : null;
}
function selectedIds(scene, selection) {
  if (!selection) return new Set();
  if (selection.kind !== 'reference') return new Set([selection.id]);
  const edge = scene.references.find(item => item.id === selection.id);
  return new Set([edge.sourceSlotId, edge.sourceId, edge.targetId]);
}
function input(scene, layout, flows, level, selection, router) {
  return { scene, layout, flows, router, detailLevel: level, selection, focusTargetId: null, trace: { active: false, scope: 'relevant' } };
}
function assertPlan(scene, plan, level, selection, core) {
  const cap = core.budgets[level];
  for (const category of ['frames', 'objects', 'classes']) {
    const ids = scene.order[category], required = ids.filter(id => plan.pinned.has(id));
    assert.ok(ids.filter(id => plan.entities.get(id)?.mode === 'detailed').length <= Math.max(cap[category], required.length));
  }
  const quiet = [...plan.entities.values()].filter(item => item.mode === 'quiet');
  assert.ok(quiet.length <= cap.quiet); assert.ok(quiet.filter(item => item.pickable).length <= cap.pickable);
  for (const category of ['clusters', 'connectors', 'flows', 'cells']) {
    const actual = category === 'clusters' ? plan.clusters.length : category === 'cells' ? [...plan.cellWindows.values()].reduce((sum, window) => sum + window.visible.length, 0) : plan.curves.filter(curve => curve.kind === (category === 'flows' ? 'flow' : 'connector') || category === 'flows' && ['return', 'exception'].includes(curve.kind)).length;
    if (actual > cap[category]) assert.ok(plan.budgetOverflow.some(entry => entry.category === category && entry.actual >= actual), `unreported ${category} overflow`);
  }
  for (const id of plan.pinned) assert.ok(plan.entities.get(id)?.pinned && plan.entities.get(id)?.mode === 'detailed');
  const residual = plan.clusters.flatMap(cluster => { assert.equal(cluster.members, cluster.memberIds.length); assert.deepEqual(cluster.anchor.ports, {}); return cluster.memberIds; });
  assert.equal(plan.entities.size + residual.length, nodes(scene).length); assert.equal(new Set([...plan.entities.keys(), ...residual]).size, nodes(scene).length);
  for (const [id, window] of plan.cellWindows) for (const [slot, mapping] of window.mapping) {
    assert.equal(slot, core.arrayElementSlotId(id, mapping.index)); assert.ok(mapping.index >= 0 && mapping.index < scene.entities[id].length);
  }
  const refs = plan.referencePresentation.counts;
  assert.equal(refs.current, scene.references.length); assert.equal(refs.current, refs.individual + refs.bundled + refs.unavailable + refs.internal + refs.scopeExcluded);
  const flows = plan.flowPresentation.counts;
  assert.equal(flows.recorded, flows.individual + flows.bundled + flows.unavailable + flows.scopeExcluded);
  if (selection?.kind === 'slot') {
    const owner = core.arrayCellTarget(scene, selection.id);
    if (owner) { assert.equal(plan.entities.get(owner.array.id)?.mode, 'detailed'); assert.ok(plan.cellWindows.get(owner.array.id)?.mapping.has(selection.id)); }
  } else if (selection?.kind === 'reference') {
    const ref = scene.references.find(item => item.id === selection.id);
    assert.equal(plan.entities.get(ref.sourceId)?.mode, 'detailed'); assert.equal(plan.entities.get(ref.targetId)?.mode, 'detailed');
    assert.ok(plan.curves.some(curve => curve.id === ref.id) || plan.referencePresentation.unavailable.some(item => item.id === ref.id), 'targeted reference/evidence lost');
  } else if (selection) assert.equal(plan.entities.get(selection.id)?.mode, 'detailed');
}
function connectorJobs(scene, plan, core) {
  const refs = core.buildReferenceTopology({ scene, entities: plan.entities, clusters: plan.clusters, cellWindows: plan.cellWindows,
    individualLimit: scene.references.length, mandatoryIds: new Set(scene.references.map(ref => ref.id)) });
  const byId = new Map(refs.individual.map(item => [item.reference.id, item])), port = core.presentedFlowPorts(scene, plan.entities, plan.cellWindows), jobs = [];
  for (const curve of plan.curves) {
    if (curve.kind === 'connector') {
      const ref = byId.get(curve.id); assert.ok(ref, 'actual selected cut lacks a connector endpoint');
      jobs.push({ curve, from: ref.sourcePoint, to: ref.destinationPoint, source: ref.sourceAnchor, target: ref.destinationAnchor });
    } else if (['flow', 'return', 'exception'].includes(curve.kind)) {
      assert.ok(curve.sourceAnchor && curve.destinationAnchor, 'recorded Flow lacks real represented endpoints');
      jobs.push({ curve, from: curve.points[0], to: curve.points.at(-1), source: curve.sourceAnchor, target: curve.destinationAnchor });
    }
  }
  // Resolve all physical cell/row endpoints, not a full-catalog body substitute.
  for (const job of jobs) { assert.ok(job.source && job.target); assert.deepEqual(job.curve.points[0], job.from); assert.deepEqual(job.curve.points.at(-1), job.to); }
  for (const node of nodes(scene)) if (plan.entities.get(node.id)?.mode === 'detailed' && node.kind === 'array') {
    for (const cell of node.cells) if (plan.cellWindows.get(node.id)?.mapping.has(cell.slotId)) assert.deepEqual(port({kind:'slot',id:cell.slotId})?.point, plan.cellWindows.get(node.id).mapping.get(cell.slotId).port);
  }
  return jobs;
}
function sampleCurves(jobs) { return jobs.map(job => Array.from({ length: 25 }, (_, index) => job.curve.points[Math.round(index / 24 * (job.curve.points.length - 1))])); }
function surfaceRoutes(jobs, core) { return jobs.map(job => core.surfaceConnectorPoints(job.from, job.to, job.source, job.target)); }
function assertRoutes(curves, routes, jobs) {
  for (const points of curves) for (const point of points) assert.ok(point.every(Number.isFinite));
  routes.forEach((points, index) => { assert.deepEqual(points[0], jobs[index].from); assert.deepEqual(points.at(-1), jobs[index].to); for (const point of points) assert.ok(point.every(Number.isFinite)); });
}
function assertFlowProof(flow, state, trace) {
  const graph = state.executionGraph, edge = graph.edges[flow.edgeIndex];
  assert.equal(edge.id, flow.id); assert.ok(flow.from && flow.to); assert.ok(flow.evidenceSeqs.every(seq => seq < state.cursor));
  if (edge.evidence === 'observed' || edge.evidence === 'bytecode-derived') return;
  // Unknown expression producer is distinct from an observed return channel.
  // Require actual VM return + the graph-linked, bytecode-recorded consumer;
  // never infer a transfer from matching names, lines or equal values.
  assert.equal(edge.kind, 'RETURN'); assert.equal(flow.kind, 'return');
  const returned = trace.events.find(event => event.eventId === edge.eventId);
  assert.equal(returned?.type, 'EXECUTION_FACT'); assert.equal(returned.fact.kind, 'return');
  assert.equal(flow.from.kind, 'frame'); assert.equal(flow.from.id, returned.fact.invocationId);
  assert.ok(state.frames[flow.from.id]); assert.ok(!graph.invocations[edge.from] && !graph.calls[edge.from]);
  assert.equal(flow.to.kind, 'slot');
  const consumer = (graph.outgoing[edge.to] ?? []).map(index => graph.edges[index]).find(item => item.to === flow.to.id && ['ASSIGN','FIELD_WRITE','STATIC_WRITE','ARRAY_WRITE'].includes(item.kind));
  assert.ok(consumer, 'recorded return has no graph-linked storage consumer');
  const written = trace.events.find(event => event.eventId === consumer.eventId);
  assert.ok(written && written.seq < state.cursor); assert.equal(written.type, 'EXECUTION_FACT'); assert.equal(written.fact.kind, 'write');
  assert.equal(written.fact.origin.kind, 'call_result'); assert.equal(written.fact.target.id, flow.to.id);
  if (returned.fact.value.kind === 'reference') { assert.equal(written.fact.value.kind, 'reference'); assert.equal(written.fact.value.objectId, returned.fact.value.objectId); }
  else assert.deepEqual(written.fact.value, returned.fact.value);
}
function measureTrace(trace, core) {
  const history = new core.ExecutionHistory({ schemaVersion: trace.schemaVersion, sourceFiles: trace.sourceFiles });
  try {
    const setup = timed(() => { history.append(trace.events); core.attachHistory(trace, history); }), baseline = heapAfterGc();
    let prepared = persistentLayout(trace, core); const layout = prepared.layout, afterLayout = heapAfterGc(), projector = core.createSceneProjector(trace);
    const project = state => projector.project(state, layout, { sessionEnded: state.status === 'ended' || state.status === 'aborted', pausedAtLiveHead: false, liveHead: history.length,
      recording: history.state.recordingStop ?? {state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false} });
    const flows = core.createFlowCatalog(); if (history.state.executionGraph) flows.extend(history.state.executionGraph, trace);
    let fullScene = project(history.state); assertCatalog(history.state, fullScene, layout, core); const afterProjection = heapAfterGc();
    const router = core.createConnectorRouter(), tailSelection = selectActual(fullScene, 1);
    let retained = levels.map(level => core.planPresentation(input(fullScene, layout, flows, level, tailSelection, router)));
    retained.forEach((plan, index) => assertPlan(fullScene, plan, levels[index], tailSelection, core)); const afterPlans = heapAfterGc();
    let geometry = retained.map(plan => { const jobs = connectorJobs(fullScene, plan, core), curves = sampleCurves(jobs), routes = surfaceRoutes(jobs, core); assertRoutes(curves, routes, jobs); return {curves,routes}; });
    const afterConnectors = heapAfterGc();
    const summary = { semanticEvents: trace.events.length, sourceFiles: trace.sourceFiles.length, statusAtAcceptedTail: history.state.status,
      historyPreparationMs: setup.ms, appendOnlyLayoutCpuMs: prepared.appendCpuMs, layoutAnchors: Object.keys(layout.anchors).length,
      fullTailRecords: counts(fullScene), retainedLayoutBuilderLength: prepared.builder.length, displayBudgets: core.budgets,
      retainedLodCatalogs: Object.fromEntries(levels.map((level, index) => [level, retained[index].accounting])),
      retainedConnectorCounts: geometry.map(item => ({curves:item.curves.length,sampledFacePoints:item.curves.length*25,surfaceRoutes:item.routes.length})),
      retainedCpuPresentation: baseline === null ? {measured:false,reason:'Explicit GC unavailable; no uncollected substitute'} : {measured:true,semanticBaselineHeapBytes:baseline,
        heapBytes:{afterLayout,afterProjection,afterPlans,afterConnectors},cumulativeAdditionalBytes:{layout:afterLayout-baseline,projection:afterProjection-baseline,threeLodPlans:afterPlans-baseline,connectors:afterConnectors-baseline},
        note:'Semantic trace/history preexist baseline; retains production compiler indexes, full tail catalog, three plans and CPU curves. All GC samples precede random seeks. No React/WebGL/GPU/Troika or isolated Dense retention approval; signed deltas retain GC noise.'},rawSamples:[] };
    retained = null; geometry = null; fullScene = null; const layoutBefore = fingerprint(layout); let seed = seedInitial;
    for (let sample = 0; sample < sampleCount; sample++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const cursor = Math.floor(seed / 2 ** 32 * (history.length + 1));
      const seekResult = timed(() => core.seek(trace, cursor)), sceneResult = timed(() => project(seekResult.value)), scene = sceneResult.value;
      assert.equal(seekResult.value.cursor, cursor); assertCatalog(seekResult.value, scene, layout, core); const sceneBefore = fingerprint(scene), selection = selectActual(scene, sample);
      const query = timed(() => flows.query({cursor,scene,priority:{selectedIds:selectedIds(scene,selection),focusedIds:new Set(),currentIds:new Set(scene.cursorEvent?.subjects ?? [])},limit:24}));
      assert.ok(query.value.length <= 24);
      for (const flow of query.value) assertFlowProof(flow, seekResult.value, trace);
      const lod = {};
      for (const level of levels) {
        const planning = timed(() => core.planPresentation(input(scene, layout, flows, level, selection, router))), plan = planning.value;
        assertPlan(scene, plan, level, selection, core);
        const endpoints = timed(() => connectorJobs(scene, plan, core)), curves = timed(() => sampleCurves(endpoints.value)), routes = timed(() => surfaceRoutes(endpoints.value, core));
        assertRoutes(curves.value, routes.value, endpoints.value);
        lod[level] = {planMs:planning.ms,endpointLookupMs:endpoints.ms,actualPathSamplingMs:curves.ms,surfaceConnectorPointsMs:routes.ms,
          accountedCatalog:plan.accounting,renderedArrayCells:[...plan.cellWindows.values()].reduce((sum,window)=>sum+window.visible.length,0),
          quietInstances:[...plan.entities.values()].filter(item=>item.mode==='quiet').length,pickingInstances:[...plan.entities.values()].filter(item=>item.pickable).length,
          renderedClusters:plan.clusters.length,historicalFlows:plan.flowPresentation.counts.recorded,surfaceConnectorJobs:endpoints.value.length};
      }
      assert.equal(fingerprint(scene), sceneBefore); assert.equal(fingerprint(layout), layoutBefore);
      summary.rawSamples.push({sample,cursor,eventId:trace.events[cursor-1]?.eventId??null,runtimeStatus:seekResult.value.status,selection,fullSceneRecords:counts(scene),
        seekMs:seekResult.ms,sceneModelMs:sceneResult.ms,relevantFlowQueryMs:query.ms,relevantFlowCount:query.value.length,lod});
    }
    summary.latencyMs = Object.fromEntries(['seekMs','sceneModelMs','relevantFlowQueryMs'].map(key=>[key,distribution(summary.rawSamples.map(item=>item[key]))]));
    summary.lodLatencyMs = Object.fromEntries(levels.map(level=>[level,Object.fromEntries(['planMs','endpointLookupMs','actualPathSamplingMs','surfaceConnectorPointsMs'].map(key=>[key,distribution(summary.rawSamples.map(item=>item.lod[level][key]))]))]));
    summary.historyPolicy=history.stats;prepared=null;return summary;
  } finally {history.dispose();}
}
for (const name of names) test.skipIf(!enabled)(`production cached JVM CPU successor: ${name}`, async context => {
  const cache=resolve(cacheRoot,`${name}.trace.json`);let json;
  try {json=await readFile(cache,'utf8');} catch(error) {
    if(error.code!=='ENOENT')throw error;
    report.traces.push({name,cache:relative(repoRoot,cache),status:'skipped',reason:'Accepted trace cache missing; no replacement trace or JVM capture generated.'});context.skip(`Accepted trace cache missing: ${cache}`);return;
  }
  try {
    const trace=JSON.parse(json);assert.equal(trace.schemaVersion,2);assert.ok(trace.events?.length);assert.ok(trace.events.some(event=>event.type==='EXECUTION_FACT'));
    report.traces.push({name,cache:relative(repoRoot,cache),sha256:createHash('sha256').update(json).digest('hex'),status:'passed',...measureTrace(trace,await loadCore())});
  } catch(error) {report.traces.push({name,cache:relative(repoRoot,cache),status:'failed',error:error.stack??String(error)});throw error;}
},60000);
afterAll(async()=>{
  if(!enabled)return;await mkdir(outputRoot,{recursive:true});const output=resolve(outputRoot,'cached-projection.json');await writeFile(output,JSON.stringify(report,null,2)+'\n');console.info(`Production cached CPU report: ${output}`);
});
