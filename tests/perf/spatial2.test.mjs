import { afterAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Run only after the serialized browser window:
// VJ_SUITE=perf VJ_SPATIAL2_PERF=1 VJ_PERF_OUTPUT_ROOT=docs/checkpoints/v12-p5/projection \
//   npx vitest run tests/perf/spatial2.test.mjs --maxWorkers=1 --fileParallelism=false
// Add --execArgv=--expose-gc for optional retained CPU presentation heap samples.
const enabled = process.env.VJ_SPATIAL2_PERF === '1';
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const cacheRoot = resolve(repoRoot, '.ggjavaez/qa/v12-p4/final-accepted/traces');
const outputRoot = resolve(repoRoot, process.env.VJ_PERF_OUTPUT_ROOT ?? 'docs/checkpoints/v12-p5/projection');
const names = ['25-cross-feature-dispatch', '28-bounded-values', '30-observer-budget'];
const levels = ['macro', 'meso', 'micro'];
const sampleCount = 30;
const seedInitial = 0x5eed5;
const report = {
  probe: 'spatial2-cached-jvm-cpu', recordedAt: new Date().toISOString(), sampleCount, seed: seedInitial,
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model },
  scope: 'Accepted cached JVM facts only. No JVM launch, browser, React mount, WebGL, GPU, Troika, or physical rendering measurement.',
  methodology: 'Imports, JSON loading, validated ExecutionHistory construction/attachment, and append-only layout preparation precede the 30 seeded seeks. Each seek, scene projection, bounded relevant-flow query, LOD plan, endpoint lookup, 24-segment face-curve sampling, and surface routing is timed separately. Assertions and report serialization are outside timings. The full accepted tail is projected once before sampling; caches are not reset between seeks. Latencies are observations, not machine-independent pass/fail gates.',
  traces: [],
};

let corePromise;
function loadCore() {
  // A default skipped probe does not import the scene/Three/React modules.
  corePromise ??= Promise.all([
    import('../../src/runtime/history.ts'), import('../../src/runtime/seek.ts'),
    import('../../src/world/layout.ts'), import('../../src/world/sceneModel.ts'),
    import('../../src/world/spatialPresentation.ts'), import('../../src/contracts/world.ts'),
    import('../../src/scene/primitives/ReferenceCurve.tsx'), import('../../src/world/connectorRouting.ts'),
    import('../../src/motion/semanticTransition.ts'),
  ]).then(parts => Object.assign({}, ...parts));
  return corePromise;
}

function timed(fn) {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = fraction => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
  return { count: sorted.length, p50: percentile(0.5), p95: percentile(0.95), min: sorted[0], max: sorted.at(-1), method: 'nearest-rank' };
}
function heapAfterGc() {
  if (typeof globalThis.gc !== 'function') return null;
  globalThis.gc();
  return process.memoryUsage().heapUsed;
}
function nodes(scene) { return [...scene.frames, ...scene.objects, ...(scene.classes ?? [])]; }
function counts(scene) {
  return { frames: scene.frames.length, objects: scene.objects.length, classes: scene.classes?.length ?? 0,
    references: scene.references.length, io: scene.io?.length ?? 0,
    recordedArrayCells: scene.objects.reduce((sum, node) => sum + (node.array?.cells.length ?? 0), 0),
    logicalArrayLength: scene.objects.reduce((sum, node) => sum + (node.array?.length ?? 0), 0) };
}
function fingerprint(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function persistentLayout(trace, core) {
  const builder = core.createLayoutBuilder();
  let appendCpuMs = 0;
  for (let from = 0; from < trace.events.length; from += 256) {
    const previous = builder.state;
    const saved = fingerprint(previous);
    appendCpuMs += timed(() => builder.append(trace.events.slice(from, from + 256))).ms;
    assert.equal(fingerprint(previous), saved, 'append mutated an earlier layout snapshot');
    for (const [id, anchor] of Object.entries(previous.anchors)) {
      assert.deepEqual(builder.state.anchors[id].position, anchor.position, `append moved ${id}`);
      assert.deepEqual(builder.state.anchors[id].size, anchor.size, `append resized ${id}`);
      for (const [slotId, port] of Object.entries(anchor.ports)) {
        assert.deepEqual(builder.state.anchors[id].ports[slotId], port, `append moved port ${slotId}`);
      }
    }
  }
  assert.equal(builder.length, trace.events.length);
  assert.equal(builder.state.layoutKind, 'spatial2');
  return { builder, layout: builder.state, appendCpuMs };
}

function assertCatalog(state, scene, layout, core) {
  assert.equal(scene.frames.length, Object.keys(state.frames).filter(id => layout.anchors[id]).length);
  assert.equal(scene.objects.length, Object.keys(state.objects).filter(id => layout.anchors[id]).length);
  assert.equal(scene.classes.length, Object.keys(state.classes ?? {}).filter(id => layout.anchors[id]).length);
  const slots = new Map();
  for (const node of nodes(scene)) {
    assert.strictEqual(node.anchor, layout.anchors[node.id], `projection replaced anchor ${node.id}`);
    for (const slot of node.kind === 'frame' ? node.slots : node.fields) slots.set(slot.id, slot);
    if (!node.array) continue;
    const runtimeArray = state.objects[node.id].array;
    const recorded = [...runtimeArray.elements.map((slot, index) => ({ slot, index })),
      ...Object.entries(runtimeArray.sparseElements ?? {}).map(([index, slot]) => ({ slot, index: Number(index) }))]
      .filter(({ slot }) => layout.anchors[slot.id]);
    assert.equal(node.array.length, runtimeArray.length, 'projection changed logical array length');
    assert.equal(node.array.cells.length, recorded.length, 'full catalog dropped recorded cells');
    const cells = new Map(node.array.cells.map(cell => [cell.id, cell]));
    for (const { slot, index } of recorded) {
      const cell = cells.get(slot.id);
      assert.ok(cell, `missing actual recorded cell ${slot.id}`);
      assert.equal(cell.index, index);
      assert.deepEqual(cell.value, slot.value);
      assert.strictEqual(cell.anchor, layout.anchors[slot.id]);
      slots.set(cell.id, cell);
    }
  }
  for (const edge of scene.references) {
    assert.ok(nodes(scene).some(node => node.id === core.sceneSourceId(edge.source)));
    assert.equal(slots.get(edge.source.slotId)?.value.kind, 'reference');
    assert.equal(slots.get(edge.source.slotId).value.objectId, edge.targetObjectId);
    assert.ok(state.objects[edge.targetObjectId]);
  }
  for (const endpoint of scene.io ?? []) assert.strictEqual(endpoint.anchor, layout.anchors[`io:${endpoint.id}`]);
}

function selectActual(scene, sample) {
  if (sample % 3 === 0 && scene.references.length) return { kind: 'reference', id: scene.references[sample % scene.references.length].id };
  const cells = scene.objects.flatMap(node => node.array?.cells ?? []);
  if (sample % 3 === 1 && cells.length) {
    // Exercise an actual sparse observation when present, never fill the missing prefix.
    return { kind: 'slot', id: cells.reduce((last, cell) => cell.index > last.index ? cell : last).id };
  }
  const subject = scene.frames.find(node => node.active) ?? nodes(scene).find(node => node.metadata?.ownership === 'PROJECT') ?? nodes(scene)[0];
  return subject ? { kind: subject.kind, id: subject.id } : null;
}
function selectedIds(scene, selection, core) {
  if (!selection) return new Set();
  if (selection.kind !== 'reference') return new Set([selection.id]);
  const edge = scene.references.find(item => item.id === selection.id);
  return new Set([edge.source.slotId, core.sceneSourceId(edge.source), edge.targetObjectId]);
}
function planOptions(trace, cursor, level, flows) {
  return { detailLevel: level, event: trace.events[cursor - 1] ?? null, flowHistory: flows, flowDisplay: 'relevant' };
}

function assertPlan(scene, plan, level, selection, core) {
  const cap = core.spatialBudgets[level];
  const originalNodes = new Map(nodes(scene).map(node => [node.id, node]));
  assert.ok(plan.scene.frames.length <= cap.frames);
  assert.ok(plan.scene.objects.length <= cap.objects);
  assert.ok((plan.scene.classes?.length ?? 0) <= cap.classes);
  assert.ok(plan.scene.references.length <= cap.references);
  assert.ok(plan.flows.length <= cap.flows);
  assert.ok(plan.labelledClusters.length <= cap.clusters);
  assert.ok(plan.pickableQuiet.length <= cap.picking);
  assert.ok(plan.quietVolumes.length <= cap.quiet);
  assert.ok([...plan.cellWindows.values()].reduce((sum, cells) => sum + cells.length, 0) <= cap.cells);
  for (const node of nodes(plan.scene)) assert.strictEqual(node, originalNodes.get(node.id));
  for (const edge of plan.scene.references) assert.ok(scene.references.includes(edge));
  for (const cluster of plan.clusters) {
    assert.strictEqual(cluster.representative, originalNodes.get(cluster.representative.id));
    assert.strictEqual(cluster.anchor, cluster.representative.anchor);
    assert.ok(cluster.count >= cluster.quietCount && cluster.quietCount > 0);
  }
  for (const [id, cells] of plan.cellWindows) for (const cell of cells) assert.ok(originalNodes.get(id).array.cells.includes(cell));
  if (level === 'macro') {
    assert.equal(plan.quietVolumes.length, 0);
    assert.ok(plan.labelledClusters.length <= core.homeGroupBudget);
  }
  if (selection?.kind === 'slot') {
    const owner = scene.objects.find(node => node.array?.cells.some(cell => cell.id === selection.id));
    if (owner) {
      assert.ok(plan.scene.objects.includes(owner), 'selected array owner lost');
      assert.ok(plan.cellWindows.get(owner.id)?.some(cell => cell.id === selection.id), 'selected actual cell lost');
    }
  } else if (selection?.kind === 'reference') {
    assert.ok(plan.scene.references.some(edge => edge.id === selection.id), 'selected reference lost');
  } else if (selection) assert.ok(nodes(plan.scene).some(node => node.id === selection.id), 'selected identity lost');
}

function connectorJobs(plan, layout, core) {
  const endpoints = new Map();
  for (const node of nodes(plan.scene)) {
    endpoints.set(node.id, { point: node.anchor.bodyPort, anchor: node.anchor });
    for (const slot of node.kind === 'frame' ? node.slots : node.fields) {
      endpoints.set(slot.id, { point: slot.port, anchor: node.anchor });
    }
    for (const cell of plan.cellWindows.get(node.id) ?? []) endpoints.set(cell.id, { point: cell.port, anchor: cell.anchor });
  }
  for (const io of plan.scene.io ?? []) endpoints.set(`io:${io.id}`, { point: io.anchor.bodyPort, anchor: io.anchor });
  const jobs = plan.scene.references.map(edge => {
    const from = endpoints.get(edge.source.slotId), to = endpoints.get(edge.targetObjectId);
    const source = layout.anchors[edge.source.slotId] ?? layout.anchors[core.sceneSourceId(edge.source)];
    return { from: edge.fromFace ?? edge.from, to: edge.toFace ?? edge.to, source, target: to?.anchor, represented: Boolean(from && to) };
  });
  for (const flow of plan.flows) {
    const endpoint = value => value && endpoints.get(value.kind === 'io' ? `io:${value.id}` : value.id);
    const from = endpoint(flow.from), to = endpoint(flow.to);
    if (from && to) jobs.push({ from: from.point, to: to.point, source: from.anchor, target: to.anchor, represented: true });
  }
  return jobs;
}
function assertJobs(plan, jobs) {
  assert.ok(jobs.length <= plan.scene.references.length + plan.flows.length);
  for (const job of jobs) assert.ok(job.represented && job.source && job.target, 'connector endpoint is not actually represented');
}
function faceCurves(plan, core) {
  return plan.scene.references.map(edge => {
    const curve = core.referenceFaceCurve(edge);
    return { curve, points: curve.getPoints(24) };
  });
}
function surfaces(jobs, core) {
  return jobs.map(job => core.surfaceConnectorPoints(job.from, job.to, job.source, job.target));
}
function assertRoutes(curves, routes, jobs) {
  for (const entry of curves) for (const point of entry.points) assert.ok(point.toArray().every(Number.isFinite));
  for (let index = 0; index < routes.length; index++) {
    assert.deepEqual(routes[index][0], jobs[index].from);
    assert.deepEqual(routes[index].at(-1), jobs[index].to);
    for (const point of routes[index]) assert.ok(point.every(Number.isFinite));
  }
}

function measureTrace(trace, core) {
  const history = new core.ExecutionHistory({ schemaVersion: trace.schemaVersion, sourceFiles: trace.sourceFiles });
  try {
    const setup = timed(() => { history.append(trace.events); core.attachHistory(trace, history); });
    const baseline = heapAfterGc(); // Semantic input and all history roots already exist.
    let prepared = persistentLayout(trace, core);
    const afterLayout = heapAfterGc();
    const layout = prepared.layout;
    let fullScene = core.buildSceneModel(history.state, layout, 'micro');
    assertCatalog(history.state, fullScene, layout, core);
    const afterProjection = heapAfterGc();
    const tailSelection = selectActual(fullScene, 1);
    const tailFlows = core.recentFlowTransitions(trace, history.state, selectedIds(fullScene, tailSelection, core), 24);
    let retained = levels.map(level => core.planSpatialPresentation(fullScene, tailSelection, planOptions(trace, history.length, level, tailFlows)));
    for (let i = 0; i < levels.length; i++) assertPlan(fullScene, retained[i], levels[i], tailSelection, core);
    const afterPlans = heapAfterGc();
    let geometry = retained.map(plan => {
      const jobs = connectorJobs(plan, layout, core);
      assertJobs(plan, jobs);
      const curves = faceCurves(plan, core), routes = surfaces(jobs, core);
      assertRoutes(curves, routes, jobs);
      return { curves, routes };
    });
    const afterConnectors = heapAfterGc();
    const summary = {
      semanticEvents: trace.events.length, sourceFiles: trace.sourceFiles.length, statusAtAcceptedTail: history.state.status,
      historyPreparationMs: setup.ms, appendOnlyLayoutCpuMs: prepared.appendCpuMs,
      layoutAnchors: Object.keys(layout.anchors).length, fullTailRecords: counts(fullScene),
      retainedLayoutBuilderLength: prepared.builder.length,
      retainedLodCatalogs: Object.fromEntries(levels.map((level, index) => [level, counts(retained[index].scene)])),
      retainedConnectorCounts: geometry.map(item => ({ referenceCurves: item.curves.length, sampledFacePoints: item.curves.reduce((sum, curve) => sum + curve.points.length, 0), surfaceRoutes: item.routes.length })),
      displayBudgets: core.spatialBudgets, homeGroupBudget: core.homeGroupBudget, homeExternalGroupBudget: core.homeExternalGroupBudget,
      retainedCpuPresentation: baseline === null ? { measured: false, reason: 'Explicit GC unavailable; add --execArgv=--expose-gc. No uncollected heap estimate substituted.' }
        : { measured: true, semanticBaselineHeapBytes: baseline,
          heapBytes: { afterLayout, afterProjection, afterPlans, afterConnectors },
          cumulativeAdditionalBytes: { layout: afterLayout - baseline, projection: afterProjection - baseline, threeLodPlans: afterPlans - baseline, connectors: afterConnectors - baseline },
          note: 'Semantic trace/history preexist the baseline. Retains one append builder/layout, the full tail catalog, three LOD plans, bounded flow window, sampled curves and connector point arrays, including CPU projection caches. All GC samples precede random seeks, excluding semantic replay roots created by seek. This is CPU presentation data, not React/WebGL/GPU/Troika memory; signed deltas include GC noise.' },
      rawSamples: [],
    };
    // Do not retain all timed projections/geometries as a fabricated render history.
    retained = null; geometry = null; fullScene = null;
    const layoutBefore = fingerprint(layout);
    let seed = seedInitial;
    for (let sample = 0; sample < sampleCount; sample++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const cursor = Math.floor(seed / 2 ** 32 * (history.length + 1));
      const seekResult = timed(() => core.seek(trace, cursor));
      const sceneResult = timed(() => core.buildSceneModel(seekResult.value, layout, 'micro'));
      const scene = sceneResult.value;
      assert.equal(seekResult.value.cursor, cursor);
      assertCatalog(seekResult.value, scene, layout, core);
      const sceneBefore = fingerprint(scene);
      const selection = selectActual(scene, sample);
      const ids = selectedIds(scene, selection, core);
      const flowResult = timed(() => core.recentFlowTransitions(trace, seekResult.value, ids, 24));
      assert.ok(flowResult.value.length <= 24);
      for (const flow of flowResult.value) {
        assert.ok(flow.seq < cursor && flow.from && flow.to);
        assert.ok(flow.evidence === 'observed' || flow.evidence === 'bytecode-derived');
      }
      const lod = {};
      for (const level of levels) {
        const planning = timed(() => core.planSpatialPresentation(scene, selection, planOptions(trace, cursor, level, flowResult.value)));
        const plan = planning.value;
        assertPlan(scene, plan, level, selection, core);
        const endpoints = timed(() => connectorJobs(plan, layout, core));
        assertJobs(plan, endpoints.value);
        const curves = timed(() => faceCurves(plan, core));
        const routes = timed(() => surfaces(endpoints.value, core));
        assertRoutes(curves.value, routes.value, endpoints.value);
        lod[level] = { planMs: planning.ms, endpointLookupMs: endpoints.ms, referenceFaceCurveMs: curves.ms,
          surfaceConnectorPointsMs: routes.ms, detailedCatalog: counts(plan.scene), fullFaces: plan.faceIds.size,
          renderedArrayCells: [...plan.cellWindows.values()].reduce((sum, cells) => sum + cells.length, 0),
          quietRecords: plan.quiet.length, quietInstances: plan.quietVolumes.length, pickingInstances: plan.pickableQuiet.length,
          catalogClusters: plan.clusters.length, renderedClusters: plan.labelledClusters.length,
          historicalFlows: plan.flows.length, surfaceConnectorJobs: endpoints.value.length,
          homeRecords: counts(plan.homeScene), collisionRecords: counts(plan.geometryScene) };
      }
      assert.equal(fingerprint(scene), sceneBefore, 'LOD planning/routing mutated full semantic catalog');
      assert.equal(fingerprint(layout), layoutBefore, 'seek/projection/planning moved canonical anchors');
      summary.rawSamples.push({ sample, cursor, eventId: trace.events[cursor - 1]?.eventId ?? null,
        runtimeStatus: seekResult.value.status, selection, fullSceneRecords: counts(scene),
        seekMs: seekResult.ms, sceneModelMs: sceneResult.ms, relevantFlowQueryMs: flowResult.ms,
        relevantFlowCount: flowResult.value.length, lod });
    }
    summary.latencyMs = {};
    for (const key of ['seekMs', 'sceneModelMs', 'relevantFlowQueryMs']) summary.latencyMs[key] = distribution(summary.rawSamples.map(item => item[key]));
    summary.lodLatencyMs = Object.fromEntries(levels.map(level => [level, Object.fromEntries(
      ['planMs', 'endpointLookupMs', 'referenceFaceCurveMs', 'surfaceConnectorPointsMs'].map(key => [key, distribution(summary.rawSamples.map(item => item.lod[level][key]))])
    )]));
    summary.historyPolicy = history.stats;
    prepared = null;
    return summary;
  } finally { history.dispose(); }
}

for (const name of names) test.skipIf(!enabled)(`Spatial 2 cached JVM CPU probe: ${name}`, async context => {
  const cache = resolve(cacheRoot, `${name}.trace.json`);
  let json;
  try { json = await readFile(cache, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    report.traces.push({ name, cache: relative(repoRoot, cache), status: 'skipped', reason: 'Accepted trace cache is missing; no replacement trace or JVM capture generated.' });
    context.skip(`Accepted trace cache missing: ${cache}`);
    return;
  }
  try {
    const trace = JSON.parse(json);
    assert.equal(trace.schemaVersion, 2);
    assert.ok(Array.isArray(trace.events) && trace.events.length > 0);
    assert.ok(trace.events.some(event => event.type === 'EXECUTION_FACT'), 'cache has no actual execution facts');
    const result = measureTrace(trace, await loadCore());
    report.traces.push({ name, cache: relative(repoRoot, cache), sha256: createHash('sha256').update(json).digest('hex'), status: 'passed', ...result });
  } catch (error) {
    report.traces.push({ name, cache: relative(repoRoot, cache), status: 'failed', error: error.stack ?? String(error) });
    throw error;
  }
}, 60000);

afterAll(async () => {
  if (!enabled) return;
  await mkdir(outputRoot, { recursive: true });
  const output = resolve(outputRoot, 'spatial2.json');
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.info(`Spatial 2 cached CPU report: ${output}`);
});
