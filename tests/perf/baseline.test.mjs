import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { test } from 'vitest';
import { generateRawTrace } from '../../src/testing/traceGen.ts';
import { normalizeTrace } from '../../src/instrumentation/normalize.ts';
import { validateTrace } from '../../src/runtime/trace.ts';
import { seek } from '../../src/runtime/seek.ts';
import { createLayoutEngine } from '../../src/world/layoutEngine.ts';
import { createSceneProjector } from '../../src/world/sceneProjector.ts';
import { planPresentation } from '../../src/world/presentationPlanner.ts';
import { transitionsForTrace } from '../../src/motion/semanticTransition.ts';
import { runAcceptanceProject } from '../acceptance/runner.mjs';

/**
 * Successor to the Phase 0 pipeline probe: the same generators, sample counts,
 * seeds, stage cap and real-JVM corpus with the production presentation modules.
 * Historical reports remain unchanged. New stage methods are recorded explicitly.
 * Run: npm run perf:baseline   (VJ_PERF_SIZES=5000,10000 to override sizes)
 */
const outputRoot = process.env.VJ_PERF_OUTPUT_ROOT ?? '.ggjavaez/qa/reference-exact/pipeline';
const out = `${outputRoot}/performance.json`;
const sizes = (process.env.VJ_PERF_SIZES ?? '5000,10000,20000,50000,100000').split(',').map(Number);
const STAGE_CAP_MS = 180000;
const capture = { origin: 'jvm', sourceHashes: {}, recordedAt: '1970-01-01T00:00:00.000Z' };
const time = (work) => { const start = performance.now(); const value = work(); return [value, performance.now() - start]; };
const pct = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return +sorted[Math.min(sorted.length - 1, Math.floor(p / 100 * sorted.length))].toFixed(2); };
const round = (value) => Math.round(value * 10) / 10;
const layoutFor = trace => { const engine = createLayoutEngine(); engine.append(trace.events); return engine.state; };

function pipeline(rawEvents, manifest, demoId) {
  const [normalized, normalizeMs] = time(() => normalizeTrace(rawEvents, manifest, { status: 'complete', exitCode: 0, diagnostic: null }, demoId));
  if (normalized.capability.diagnostics.length) throw new Error(normalized.capability.diagnostics[0]);
  const [trace, validateMs] = time(() => ({ ...validateTrace(normalized.trace), capture }));
  const [, seekColdEndMs] = time(() => seek(trace, trace.events.length));
  const n = trace.events.length;
  let state = 12345;
  const random = () => (state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const jumps = Array.from({ length: 30 }, () => time(() => seek(trace, Math.floor(random() * (n + 1))))[1]);
  const middle = Math.floor(n / 2);
  seek(trace, middle);
  const adjacent = Array.from({ length: 50 }, (_, i) => time(() => seek(trace, middle + 1 + i))[1]);
  const [layout, layoutMs] = time(() => layoutFor(trace));
  const final = seek(trace, n);
  const [scene, sceneMs] = time(() => createSceneProjector(trace).project(final, layout, { sessionEnded: true, pausedAtLiveHead: false, liveHead: n,
    recording: { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false } }));
  const [, detailMs] = time(() => planPresentation({ scene, layout, detailLevel: 'MEDIUM', selection: null, focusTargetId: null, trace: { active: false, scope: 'relevant' } }));
  const [, transitionsMs] = time(() => transitionsForTrace(trace));
  return { normalizedEvents: n, invocations: Object.keys(final.frames).length, objects: Object.keys(final.objects).length,
    normalizeMs: round(normalizeMs), validateMs: round(validateMs), seekColdEndMs: round(seekColdEndMs),
    seekJumpMs: { p50: pct(jumps, 50), p95: pct(jumps, 95), max: pct(jumps, 100) },
    seekAdjacentMs: { p50: pct(adjacent, 50), p95: pct(adjacent, 95) },
    layoutMs: round(layoutMs), sceneBuildMs: round(sceneMs), detailBudgetMs: round(detailMs), transitionsMs: round(transitionsMs),
    perEventNormalizeValidateUs: round((normalizeMs + validateMs) * 1000 / n) };
}

/** Historical full-prefix control, deliberately not a claim about the current
 * incremental transport. Retains the original normalization/publication workload
 * while replacing only the retired layout implementation. */
function liveIngest(rawEvents, manifest, chunk) {
  let totalMs = 0, totalBytes = 0, firstMs = 0, lastMs = 0, publishes = 0;
  for (let end = chunk; end <= rawEvents.length; end += chunk) {
    const prefix = rawEvents.slice(0, end);
    const bytes = JSON.stringify({ rawEvents: prefix }).length;
    const [, ms] = time(() => {
      const normalized = normalizeTrace(prefix, manifest, { status: 'live', exitCode: null, diagnostic: null }, 'live');
      layoutFor({ ...validateTrace(normalized.trace, { allowLive: true }), capture });
    });
    totalMs += ms; totalBytes += bytes; publishes++;
    if (!firstMs) firstMs = ms; lastMs = ms;
  }
  return { rawEvents: rawEvents.length, publishEveryRawEvents: chunk, publishes, totalClientIngestMs: round(totalMs),
    firstPublishMs: round(firstMs), lastPublishMs: round(lastMs), lastToFirstRatio: round(lastMs / firstMs),
    totalSseBytes: totalBytes, lastPublishBytes: JSON.stringify({ rawEvents }).length };
}

test('production successor to the Phase 0 pipeline baseline', async () => {
  const report = { phase: 'reference-exact', recordedAt: new Date().toISOString(), historicalCommitBase: '4f07444',
    methodology: 'Same original generators, seeds, 30 random seeks, 50 adjacent seeks, sizes, stage cap and three JVM projects. Scene/layout/detail stages use the current layout engine, projector and MEDIUM planner. Live-ingest is an explicit historical full-prefix control, not the current incremental transport.',
    environment: { node: process.version, platform: `${process.platform}/${process.arch}`, cpus: cpus().length, cpuModel: cpus()[0]?.model, memGiB: round(totalmem() / 2 ** 30),
      note: 'Actual host environment; compare methods and distributions before drawing budget conclusions.' },
    synthetic: {}, projection: {}, liveIngest: [], realJvm: {} };
  const measured = [];
  for (const size of sizes) {
    const { rawEvents, manifest, stats } = generateRawTrace({ rawEvents: size, seed: 42 });
    const started = performance.now();
    const result = pipeline(rawEvents, manifest, `perf:${size}`);
    const heapMiB = round(process.memoryUsage().heapUsed / 2 ** 20);
    report.synthetic[size] = { rawEvents: rawEvents.length, generator: stats, ...result, heapUsedMiBAfter: heapMiB };
    measured.push([result.normalizedEvents, result.normalizeMs + result.validateMs]);
    if (performance.now() - started > STAGE_CAP_MS) { report.synthetic[`>${size}`] = 'larger sizes skipped: stage cap exceeded'; break; }
  }
  // Least-squares log-log fit of normalize+validate cost vs semantic events, projected to 1M events.
  const xs = measured.map(([n]) => Math.log(n)), ys = measured.map(([, ms]) => Math.log(ms));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const slope = xs.map((x, i) => (x - mean(xs)) * (ys[i] - mean(ys))).reduce((a, b) => a + b, 0) / xs.map((x) => (x - mean(xs)) ** 2).reduce((a, b) => a + b, 0);
  const intercept = mean(ys) - slope * mean(xs);
  report.projection = { fittedExponent: round(slope), projected1MSemanticEventsNormalizeValidateMs: Math.round(Math.exp(intercept + slope * Math.log(1e6))),
    note: '1M events were not run; this is a fitted extrapolation, not a measured gate or an assumed growth exponent.' };
  for (const size of [5000, 20000]) {
    const { rawEvents, manifest } = generateRawTrace({ rawEvents: size, seed: 42 });
    report.liveIngest.push(liveIngest(rawEvents, manifest, 1000));
  }
  for (const name of ['acc08-maze-plain', 'acc14-simulator-plain', 'acc07-orders-maven']) {
    const run = await runAcceptanceProject(`fixtures/acceptance-v12/${name}`);
    report.realJvm[name] = { exitCode: run.snapshot.exitCode, terminalStatus: run.snapshot.terminalStatus, rawEvents: run.snapshot.rawEvents.length,
      normalizedEvents: run.trace.events.length, invocations: Object.keys(run.final.frames).length, ...run.timings,
      sessionSnapshotBytes: JSON.stringify(run.snapshot).length };
  }
  await mkdir(outputRoot, { recursive: true });
  const prior = await readFile(out, 'utf8').then(JSON.parse).catch(() => ({}));
  await writeFile(out, `${JSON.stringify({ ...prior, pipeline: report }, null, 1)}\n`);
}, 1800000);
