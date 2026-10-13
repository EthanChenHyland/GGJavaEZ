import { test } from 'vitest';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cpus, totalmem, release } from 'node:os';
import { createHash } from 'node:crypto';
import { writeHeapSnapshot } from 'node:v8';
import { generateRawTrace } from '../../src/testing/traceGen.ts';
import { TraceNormalizer } from '../../src/instrumentation/normalize.ts';
import { ExecutionHistory, attachHistory, historyForTrace } from '../../src/runtime/history.ts';
import { validateTrace } from '../../src/runtime/trace.ts';
import { createLayoutEngine } from '../../src/world/layoutEngine.ts';
import { createSceneProjector } from '../../src/world/sceneProjector.ts';
import { createFlowCatalog } from '../../src/world/flowCatalog.ts';
import { createConnectorRouter } from '../../src/world/connectorRouter.ts';
import { planPresentation } from '../../src/world/presentationPlanner.ts';

// Explicit VJ_SUITE=perf opt-in; no legacy layout/scene-model API or JVM claim.
const LEVELS = ['FAR', 'MEDIUM', 'CLOSE'];
const RAW_TARGETS = [200, 5000, 20000];
const LINE_SAMPLES = 100, LINE_WARMUP = 20, SEEK_SAMPLES = 100;
const recording = { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false };
const terminal = { status: 'complete', exitCode: 0, diagnostic: null };
const context = (trace, ended = false) => ({ sessionEnded: ended, pausedAtLiveHead: false, liveHead: trace.events.length, recording });
const timed = callback => {
  const start = performance.now();
  const value = callback();
  return { value, ms: performance.now() - start };
};
function distribution(samples) {
  assert(samples.length > 0);
  const sorted = [...samples].sort((a, b) => a - b);
  assert(sorted.every(value => Number.isFinite(value) && value >= 0));
  const at = percentile => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentile))];
  const middle = sorted.length / 2;
  return { samples: samples.length, median: sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2,
    p50: at(.5), p95: at(.95), max: sorted.at(-1), total: samples.reduce((a, b) => a + b, 0), raw: samples };
}
function measuredHeap() {
  if (typeof globalThis.gc !== 'function') return null;
  globalThis.gc();
  return process.memoryUsage().heapUsed;
}
function planInput(scene, layout, flows, detailLevel, router) {
  return { scene, layout, flows, router, detailLevel, selection: null, focusTargetId: null, trace: { active: true, scope: 'all' } };
}
function assertScene(scene, state, trace, layout) {
  assert.equal(scene.cursor, state.cursor);
  assert.equal(scene.cursorEvent?.id ?? null, trace.events[state.cursor - 1]?.eventId ?? null);
  const ids = [...scene.order.frames, ...scene.order.objects, ...scene.order.classes];
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(Object.keys(scene.entities).length, ids.length);
  for (const id of ids) {
    const node = scene.entities[id];
    assert(node, `Missing actual scene entity ${id}`);
    assert.strictEqual(node.anchor, layout.anchors[id]);
    for (const seq of [node.evidence.introducedSeq, node.evidence.changedSeq]) if (seq !== null) assert(seq < state.cursor);
  }
  for (const ref of scene.references) assert(scene.entities[ref.sourceId] && scene.entities[ref.targetId]);
  for (const binding of scene.historicalBindings) assert(binding.introducedSeq < state.cursor && binding.endSeq !== null && binding.endSeq < state.cursor);
}
function assertPlan(plan, scene) {
  const catalog = [...scene.order.frames, ...scene.order.objects, ...scene.order.classes];
  const accounted = [...plan.entities.keys(), ...plan.clusters.flatMap(cluster => cluster.memberIds)];
  assert.equal(accounted.length, catalog.length);
  assert.equal(new Set(accounted).size, catalog.length);
  assert.deepEqual(new Set(accounted), new Set(catalog));
  assert.equal(plan.accounting.total, catalog.length);
  assert.equal(plan.accounting.detailed + plan.accounting.quiet + plan.accounting.clustered, catalog.length);
  for (const family of [plan.referencePresentation, plan.historicalReferencePresentation]) {
    const count = family.counts;
    assert.equal(count.drawable, count.individual + count.bundled);
    assert.equal('current' in count ? count.current : count.eligible, count.drawable + count.unavailable + count.internal + count.scopeExcluded);
  }
  // Complete Flow accounting is an integration guard, not a timing-only waiver.
  const flow = plan.flowPresentation.counts;
  assert.equal(flow.drawable, flow.individual + flow.bundled);
  assert.equal(flow.recorded, flow.drawable + flow.unavailable + flow.scopeExcluded);
  assert.equal(plan.bundles.filter(bundle => bundle.kind === 'flow').reduce((sum, bundle) => sum + bundle.count, 0), flow.bundled);
}

function* lineScaling(objectCount) {
  const sourceFiles = [{ fileId: 'bench/Main.java', name: 'Main.java', content: 'class Main {\n  void main() {}\n}' }];
  const trace = { schemaVersion: 2, demoId: `generated-line-scaling:${objectCount}`, sourceFiles, events: [] };
  const emit = event => trace.events.push({ eventId: `line-bench/${trace.events.length}`, seq: trace.events.length,
    source: null, label: 'Generated normalized CPU benchmark', importance: 'quiet', ...event });
  emit({ type: 'PROGRAM_START' });
  emit({ type: 'ENTER_METHOD', frameId: 'bench-main', callerFrameId: null, className: 'bench.Main', methodName: 'main', locals: [] });
  for (let i = 0; i < objectCount; i++) emit({ type: 'ALLOCATE_OBJECT', objectId: `bench-object/${i}`, displayId: i + 1,
    className: 'bench.Node', fields: [], metadata: { ownership: 'PROJECT', runtimeType: 'bench.Node', packageName: 'bench' } });
  const history = new ExecutionHistory({ schemaVersion: 2, sourceFiles });
  try {
    const initialHistory = timed(() => history.append(trace.events));
    attachHistory(trace, history);
    validateTrace(trace, { allowLive: true });
    assert.strictEqual(historyForTrace(trace), history);
    assert.equal(Object.keys(history.state.objects).length, objectCount);
    assert.deepEqual([...history.state.activeFrameIds], ['bench-main']);
    const layoutEngine = createLayoutEngine();
    const initialLayout = timed(() => { layoutEngine.append(trace.events); return layoutEngine.state; });
    const projector = createSceneProjector(trace);
    const initialProjection = timed(() => projector.project(history.state, initialLayout.value, context(trace)));
    let previous = initialProjection.value;
    assert.equal(previous.order.objects.length, objectCount);
    const ids = [...previous.order.objects], updateMs = [], appendMs = [], layoutMs = [], attachMs = [];
    // Construct both worlds before measuring either. The caller alternates
    // which world advances first; event kind, warmups and samples stay fixed.
    yield;
    for (let i = 0; i < LINE_WARMUP + LINE_SAMPLES; i++) {
      const from = history.length;
      emit({ type: 'LINE_EXECUTE', frameId: 'bench-main', source: { fileId: sourceFiles[0].fileId, line: 2 } });
      const batch = [trace.events.at(-1)];
      assert.equal(batch.length, 1); assert.equal(batch[0].type, 'LINE_EXECUTE');
      const append = timed(() => history.append(batch));
      const attached = timed(() => attachHistory(trace, history));
      const layout = timed(() => { layoutEngine.append(trace.events); return layoutEngine.state; });
      const state = history.state, projectionContext = context(trace);
      // The only measured update is the actual production incremental API.
      const projected = timed(() => projector.advance(state, layout.value, trace.events, from, history.length, projectionContext));
      const scene = projected.value;
      assert.equal(scene.cursor, from + 1);
      assert.equal(scene.cursorEvent.id, batch[0].eventId);
      assert.equal(scene.entities['bench-main'].sourceLine.line, 2);
      assert.strictEqual(scene.order.objects, previous.order.objects);
      assert.strictEqual(scene.references, previous.references);
      for (const id of ids) assert.strictEqual(scene.entities[id], previous.entities[id], `LINE_EXECUTE rebuilt untouched ${id}`);
      assert.deepEqual([...state.activeFrameIds], ['bench-main']);
      assert.strictEqual(historyForTrace(trace), history);
      if (i >= LINE_WARMUP) { updateMs.push(projected.ms); appendMs.push(append.ms); layoutMs.push(layout.ms); attachMs.push(attached.ms); }
      previous = scene;
      yield;
    }
    assert.equal(updateMs.length, LINE_SAMPLES);
    return { objectCount, actualSceneObjectCount: previous.order.objects.length, activeFrames: 1, measuredBatchSize: 1,
      measuredEventKind: 'LINE_EXECUTE', warmupBatches: LINE_WARMUP, measuredBatches: LINE_SAMPLES,
      initialHistoryMs: initialHistory.ms, initialLayoutMs: initialLayout.ms, initialProjectionMs: initialProjection.ms,
      sceneUpdateMs: distribution(updateMs), validatedReductionMs: distribution(appendMs), layoutAppendMs: distribution(layoutMs), historyAttachMs: distribution(attachMs),
      untouchedObjectIdentityChecks: objectCount * (LINE_WARMUP + LINE_SAMPLES), historyStats: history.stats };
  } finally { history.dispose(); }
}

function corpus(requestedRawEvents) {
  const generated = timed(() => generateRawTrace({ rawEvents: requestedRawEvents, seed: 42, provenance: true }));
  const input = generated.value;
  const encoded = input.rawEvents.map(event => JSON.stringify(event)).join('\n');
  const ingest = timed(() => encoded.split('\n').map(line => JSON.parse(line)));
  const raw = ingest.value;
  assert.equal(raw.length, input.rawEvents.length);
  assert(raw.length >= requestedRawEvents);
  assert(raw.every((event, seq) => event.seq === seq && event.provenanceVersion === 1));
  const semanticBefore = measuredHeap();
  const constructed = timed(() => new TraceNormalizer(input.manifest, `generated-provenance:${requestedRawEvents}`));
  const normalizer = constructed.value;
  try {
    const append = [];
    for (let from = 0; from < raw.length; from += 256) append.push(timed(() => normalizer.append(raw.slice(from, from + 256))).ms);
    const finished = timed(() => normalizer.finish(terminal));
    const { trace, capability } = finished.value, history = normalizer.history;
    assert.deepEqual(capability.diagnostics, []);
    assert.equal(history.state.status, 'ended');
    attachHistory(trace, history);
    validateTrace(trace);
    assert.strictEqual(historyForTrace(trace), history);
    assert.strictEqual(history.materialize(history.length), normalizer.state);
    const graph = normalizer.state.executionGraph;
    assert(graph && graph.edges.length > 0, 'Generated corpus must exercise actual provenance');
    const semanticAfter = measuredHeap();
    const layoutEngine = createLayoutEngine();
    const layoutBuilt = timed(() => { layoutEngine.append(trace.events); return layoutEngine.state; });
    const layout = layoutBuilt.value;
    const layoutAfter = measuredHeap();
    const projectorBuilt = timed(() => createSceneProjector(trace));
    const projector = projectorBuilt.value;
    const projectorAfter = measuredHeap();
    const initialProjection = timed(() => projector.project(history.state, layout, context(trace, true)));
    const sceneAfter = measuredHeap();
    const flows = createFlowCatalog();
    const indexed = timed(() => flows.extend(graph, trace));
    const catalogAfter = measuredHeap();
    const router = createConnectorRouter();
    // Retain exactly the final world and one plan per level for the heap probe.
    const retainedPlans = LEVELS.map(level => planPresentation(planInput(initialProjection.value, layout, flows, level, router)));
    retainedPlans.forEach(plan => assertPlan(plan, initialProjection.value));
    const presentationAfter = measuredHeap();
    const heapSnapshot = requestedRawEvents === 20000 && process.env.VJ_PERF_HEAP_OUTPUT
      ? timed(() => writeHeapSnapshot(process.env.VJ_PERF_HEAP_OUTPUT)) : null;
    // Keep these owners live through the measured checkpoint; GC bytes are not
    // claimed as exact object sizes or portable per-type heap attribution.
    assert.strictEqual(initialProjection.value.entities[initialProjection.value.order.objects[0]]?.anchor,
      layout.anchors[initialProjection.value.order.objects[0]]);
    assert.equal(retainedPlans.length, 3); assert.strictEqual(history.state.executionGraph, graph);
    const semanticBytes = semanticAfter === null ? null : semanticAfter - semanticBefore;
    const presentationBytes = presentationAfter === null ? null : presentationAfter - semanticAfter;
    const ratioValid = semanticBytes !== null && semanticBytes > 0 && presentationBytes >= 0;
    const memoryRatio = ratioValid ? presentationBytes / semanticBytes : null;
    const graphEventSeq = new Map(trace.events.map(event => [event.eventId, event.seq]));
    const acceptedEdges = new Set(graph.edges.map(edge => edge.id));
    const cursorSamples = [], seekMs = [], projectionMs = [], flowPrefixMs = [], flowQueryMs = [];
    const planningMs = Object.fromEntries(LEVELS.map(level => [level, []]));
    const perSeek = [];
    let previousCursor = history.length;
    // Multiplication by 37 permutes all 100 evenly spread positions, including
    // zero/live head, and deliberately mixes forward and backward seeks.
    for (let i = 0; i < SEEK_SAMPLES; i++) {
      const cursor = Math.floor(((i * 37) % SEEK_SAMPLES) * history.length / (SEEK_SAMPLES - 1));
      cursorSamples.push(cursor);
      const sought = timed(() => history.materialize(cursor));
      const projected = timed(() => projector.advance(sought.value, layout, trace.events, previousCursor, cursor, context(trace, true)));
      previousCursor = cursor;
      const scene = projected.value;
      assertScene(scene, sought.value, trace, layout);
      const prefix = timed(() => flows.prefix(cursor, scene));
      assert.equal(new Set(prefix.value.map(flow => flow.id)).size, prefix.value.length);
      for (const flow of prefix.value) {
        assert(acceptedEdges.has(flow.id));
        assert(flow.evidenceEventIds.every(id => graphEventSeq.has(id) && graphEventSeq.get(id) < cursor));
        assert(flow.evidenceSeqs.every(seq => seq < cursor));
      }
      const priority = { selectedIds: new Set(), focusedIds: new Set(), currentIds: new Set(scene.cursorEvent?.subjects ?? []) };
      const query = timed(() => flows.query({ cursor, scene, priority, limit: 64 }));
      const stats = {};
      for (const level of LEVELS) {
        const planned = timed(() => planPresentation(planInput(scene, layout, flows, level, router)));
        assertPlan(planned.value, scene);
        planningMs[level].push(planned.ms);
        stats[level] = { accounting: planned.value.accounting, clusters: planned.value.clusters.length,
          curves: planned.value.curves.length, bundles: planned.value.bundles.length, flows: planned.value.flowPresentation.counts };
      }
      seekMs.push(sought.ms); projectionMs.push(projected.ms); flowPrefixMs.push(prefix.ms); flowQueryMs.push(query.ms);
      perSeek.push({ cursor, prefixFlows: prefix.value.length, queriedFlows: query.value.length, levels: stats });
    }
    assert.equal(new Set(cursorSamples).size, SEEK_SAMPLES);
    assert(cursorSamples.includes(0) && cursorSamples.includes(history.length));
    const replayAfter = measuredHeap();
    const memory = { explicitGc: typeof globalThis.gc === 'function', semanticBeforeBytes: semanticBefore, semanticAfterBytes: semanticAfter,
      presentationAfterBytes: presentationAfter, semanticRetainedDeltaBytes: semanticBytes, presentationRetainedDeltaBytes: presentationBytes,
      stageHeapBytes: { layoutAfter, projectorAfter, sceneAfter, catalogAfter, plansAfter: presentationAfter },
      stageRetainedDeltaBytes: semanticAfter === null ? null : { layout: layoutAfter - semanticAfter,
        projectorIndex: projectorAfter - layoutAfter, initialScene: sceneAfter - projectorAfter,
        flowCatalogIndex: catalogAfter - sceneAfter, threeFinalPlansAndResolvedFlows: presentationAfter - catalogAfter },
      replayAfterBytes: replayAfter,
      replayRetainedDeltaBytes: replayAfter === null ? null : replayAfter - presentationAfter,
      replayAttribution: 'Diagnostic only: includes semantic history recent/checkpoint changes, derived caches, samples and report arrays after all 100 seeks. Not isolated presentation bytes or a new budget waiver.',
      heapSnapshot: heapSnapshot && { path: heapSnapshot.value, captureMs: heapSnapshot.ms, boundary: 'Final plans retained, before spread seeks; opt-in diagnostics outside stage timers' },
      presentationToSemanticRatio: memoryRatio, budget: .25,
      status: memoryRatio === null ? 'not measured' : memoryRatio <= .25 ? 'pass' : 'exceeded',
      cause: memoryRatio === null ? semanticAfter === null ? 'Explicit GC unavailable; no retained-memory ratio asserted' : 'Non-positive semantic or negative presentation heap delta; attribution unstable'
        : memoryRatio <= .25 ? 'Measured retained presentation delta is within the 25% budget' : 'Measured layout/projector/FlowCatalog and three final plans exceed 25% of measured semantic retention',
      attribution: 'Incremental forced-GC heap deltas; raw/NDJSON/manifest already held before semantic baseline. Semantic includes normalizer/history/events/graph/checkpoints. Presentation includes layout/projector indexes and caches/FlowCatalog/final scene/three level plans; ratio checkpoint precedes spread seeks. Conservative presentation-state estimate, not exact SceneModel-only bytes.' };
    return { requestedRawEvents, actualRawEvents: raw.length, normalizedEvents: history.length, generator: input.stats,
      rawSha256: createHash('sha256').update(encoded).digest('hex'), generateMs: generated.ms, ndjsonBytes: Buffer.byteLength(encoded), ingestParseMs: ingest.ms,
      normalizerConstructMs: constructed.ms, normalizeValidateReduceAppendMs: distribution(append), normalizationFinishMs: finished.ms,
      normalizationOnlyMs: null, normalizationOnlyReason: 'Production TraceNormalizer.append synchronously validates and reduces into its shared ExecutionHistory; no separate timer is fabricated',
      layoutBuildMs: layoutBuilt.ms, projectorIndexMs: projectorBuilt.ms, initialProjectionMs: initialProjection.ms, flowCatalogIndexMs: indexed.ms,
      graph: { edges: graph.edges.length, invocations: Object.keys(graph.invocations).length, values: Object.keys(graph.values).length },
      seeks: { count: SEEK_SAMPLES, cursors: cursorSamples, materializeMs: distribution(seekMs), sceneProjectionMs: distribution(projectionMs),
        flowPrefixMs: distribution(flowPrefixMs), flowQueryMs: distribution(flowQueryMs), planningMs: Object.fromEntries(LEVELS.map(level => [level, distribution(planningMs[level])])), samples: perSeek },
      routingCache: router.stats(), memory, historyStats: history.stats };
  } finally { normalizer.history.dispose(); }
}

test.skipIf(process.env.VJ_SUITE !== 'perf')('modern reference world CPU scaling and generated provenance performance', async () => {
  const outputRoot = process.env.VJ_PERF_OUTPUT_ROOT ?? '.ggjavaez/qa/reference-exact';
  await mkdir(outputRoot, { recursive: true });
  const output = join(outputRoot, 'modern-world-performance.json');
  const report = { schemaVersion: 1, recordedAt: new Date().toISOString(), status: 'running',
    environment: { node: process.version, platform: process.platform, arch: process.arch, osRelease: release(), cpu: cpus()[0]?.model ?? null,
      logicalCpus: cpus().length, totalMemoryBytes: totalmem(), explicitGc: typeof globalThis.gc === 'function', execArgv: process.execArgv },
    methodology: { source: 'Generated data, not actual JVM execution', clock: 'node:perf_hooks performance.now; milliseconds',
      constructionRunsPerConfiguration: 1, lineScaling: '100 individually appended LINE_EXECUTE batches after 20 identical-kind warmups at 1000 and 20000 actual runtime objects, one active main frame. advance timer excludes validation/reduction/layout/attachment/checks.',
      corpus: 'Seed 42 generator with provenance=true, requested 200/5000/20000 raw records; actual counts can exceed target to close frames. NDJSON parse, integrated normalization/validation/reduction, layout, projection, Flow indexing/prefix/query and planning have separate timers.',
      seeks: '100 deterministic spread cursors, permuted by stride 37, including zero/live, forward/backward. Production SceneProjector.advance receives the preceding cursor; reverse and long compact-world jumps reconstruct from the accepted prefix. Same shared history; all levels use the same SceneModel. Earlier reports used direct project calls and are not identical-path timing comparisons. No camera/view-tile memoization claim.',
      planning: 'Actual planPresentation with Trace All, no selection/Focus, FAR/MEDIUM/CLOSE. CPU planner evidence analogous to INTERACTIVE detail cuts; no WebGL render or quality tier is instantiated.',
      stageCaveat: 'Flow prefix/query may internally materialize semantic history to resolve endpoints; those costs stay inside their real production calls. Complete prefix is timed before plans, so planner measurements reuse that cache. Assertions and report serialization excluded from stage timers.',
      samplingCaveat: 'Single process and one construction per configuration; construct both scaling worlds first and alternate first-updated size each round, no statistical confidence claim. Stage caches and JIT/GC remain part of recorded environment.' },
    notMeasured: { gpuMs: 'No WebGL/GPU in Node', browserFrameTime: 'No browser rendering', drawCalls: 'No renderer', rendererMemory: 'No renderer',
      startupTimeToWorld: 'No application/browser startup', focusHomeLatency: 'No native camera interaction', sustainedInteraction: 'CPU probes only',
      pickingShadowsTransparencyPostProcessing: 'No renderer', orbitTileMemoization: 'No camera/view-tile pipeline', bundleSize: 'No build' },
    activeConfiguration: null, lineScaling: [], scalingBudget: null, corpora: [], failures: [] };
  const save = () => writeFile(output, JSON.stringify(report, null, 2) + '\n');
  await save();
  try {
    const lineRuns = [lineScaling(1000), lineScaling(20000)];
    try {
      report.activeConfiguration = { stage: 'lineScaling', objectCounts: [1000, 20000], order: 'counterbalanced' }; await save();
      for (const run of lineRuns) assert.equal(run.next().done, false);
      for (let round = 0; round < LINE_WARMUP + LINE_SAMPLES; round++) {
        for (const index of round % 2 ? [1, 0] : [0, 1]) assert.equal(lineRuns[index].next().done, false);
      }
      for (const run of lineRuns) { const result = run.next(); assert.equal(result.done, true); report.lineScaling.push(result.value); }
      await save();
    } finally {
      for (const run of lineRuns) run.return();
    }
    const small = report.lineScaling[0].sceneUpdateMs.median, large = report.lineScaling[1].sceneUpdateMs.median;
    assert(small > 0 && large > 0, 'Clock resolution insufficient for scaling ratio');
    const ratio = large / small;
    report.scalingBudget = { metric: 'SceneProjector.advance median 20000 / 1000 actual objects', value: ratio, budget: 2,
      status: ratio <= 2 ? 'pass' : 'exceeded',
      cause: ratio <= 2 ? 'The measured identical single-event update ratio meets the 2x limit'
        : 'Measured production advance ratio exceeds 2x; profiler needed to distinguish whole-world traversal, GC/JIT or other costs. No production cause inferred from timing alone.' };
    await save();
    for (const size of RAW_TARGETS) {
      report.activeConfiguration = { stage: 'generatedProvenance', requestedRawEvents: size }; await save();
      report.corpora.push(corpus(size)); await save();
    }
    report.activeConfiguration = null;
    if (report.scalingBudget.status === 'exceeded') report.failures.push(report.scalingBudget.cause);
    for (const sample of report.corpora) if (sample.memory.status === 'exceeded') report.failures.push(`${sample.requestedRawEvents} raw target: ${sample.memory.cause}`);
    report.status = report.failures.length ? 'budget exceeded' : 'completed';
    await save();
    assert.equal(report.failures.length, 0, `Performance budget exceeded; inspect ${output}: ${report.failures.join('; ')}`);
  } catch (error) {
    if (report.status !== 'budget exceeded') { report.status = 'failed'; report.failures.push(error instanceof Error ? error.message : String(error)); }
    await save();
    throw error;
  }
}, 600000);
