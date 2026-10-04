import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { seek } from '../../src/runtime/seek.ts';

const OUTPUT_ROOT = process.env.VJ_PHASE4_OUTPUT_ROOT ? resolve(process.env.VJ_PHASE4_OUTPUT_ROOT) : null;
const PROBE_ENABLED = process.env.VJ_PHASE4_PROBE === '1';
const mib = bytes => bytes / (1024 * 1024);
const count = object => Object.keys(object ?? {}).length;
const digest = text => createHash('sha256').update(text).digest('hex');

/** Probe preparation is inside the opt-in test body, before its single JVM run.
 * GC presence is reported explicitly; absence never becomes a zero-memory claim.
 */
export function beginProbe() {
  if (!PROBE_ENABLED) return null;
  const explicitGc = typeof globalThis.gc === 'function';
  if (explicitGc) globalThis.gc();
  return { explicitGc, heapUsedBytes: process.memoryUsage().heapUsed };
}

export function finishProbe(run, baseline) {
  if (!baseline) return null;
  const length = run.trace.events.length;
  let seed = 0x4c0ffee;
  const cursors = [0, length];
  while (cursors.length < 30) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    cursors.push(seed % (length + 1));
  }
  const live = run.history.state;
  const samples = cursors.map(cursor => {
    const started = performance.now();
    const snapshot = seek(run.trace, cursor);
    const milliseconds = performance.now() - started;
    if (snapshot.cursor !== cursor) throw new Error('Probe materialized an incorrect semantic cursor');
    return { cursor, milliseconds };
  });
  if (run.history.state !== live) throw new Error('Scrub probe replaced the live history root');
  if (baseline.explicitGc) globalThis.gc();
  const heapUsedBytes = process.memoryUsage().heapUsed;
  const sorted = samples.map(sample => sample.milliseconds).sort((a, b) => a - b);
  return {
    domain: 'Node semantic seek only; no browser, rendering or GPU measurement',
    sampleCount: 30, seed: '0x4c0ffee', samples,
    medianScrubMs: (sorted[14] + sorted[15]) / 2,
    maximumScrubMs: sorted.at(-1),
    explicitGc: baseline.explicitGc,
    heapBeforeMiB: baseline.explicitGc ? mib(baseline.heapUsedBytes) : null,
    heapAfterMiB: baseline.explicitGc ? mib(heapUsedBytes) : null,
    retainedMiB: baseline.explicitGc ? mib(heapUsedBytes - baseline.heapUsedBytes) : null,
    heapScope: 'Per-case process heap delta retaining raw events, semantic trace, graph, bounded history, source manifest and test harness; not isolated graph bytes',
    caveat: 'One ordered-suite sample per case; GC/JIT/cache noise and prior-case retention can affect deltas. Negative deltas are reported unchanged.',
    history: run.history.stats,
  };
}

function scrubPaths(text, run) {
  let cleaned = text;
  for (const path of run?.redactPaths ?? []) cleaned = cleaned.replaceAll(path, '<temporary-workspace>');
  // CaptureReader and JVM preparation also use their own temporary directories.
  // Replace a whole path token; never publish an ephemeral host path as evidence.
  cleaned = cleaned.replace(/(?:\/private)?\/var\/folders\/[^\s"'<>]+/g, '<temporary-path>')
    .replace(/\/tmp\/[^\s"'<>]+/g, '<temporary-path>')
    .replace(/[A-Za-z]:[\\/]Users[\\/][^\s"'<>]*[\\/]Temp[\\/][^\s"'<>]+/gi, '<temporary-path>');
  return cleaned;
}

const sanitize = (value, run) => {
  if (Array.isArray(value)) return value.map(item => sanitize(item, run));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item, run)]));
  return typeof value === 'string' ? scrubPaths(value, run) : value;
};

function classpathLabel(path, run) {
  return run.redactPaths.some(root => path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}\\`))
    ? '<project-classes>' : basename(path);
}

async function atomicJson(path, value) {
  const temporary = `${path}.pending-${process.pid}`;
  try { await writeFile(temporary, JSON.stringify(value, null, 2) + '\n'); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

/** Cached trace is published only after every behavior/fact/replay assertion
 * passes. A failing rerun removes a previous accepted cache of the same case so
 * browser/perf work cannot silently consume a stale pass. No extra JVM runs.
 */
export async function writeCaseEvidence({ name, spec, run = null, accepted, error = null, probe = null }) {
  if (!OUTPUT_ROOT) return;
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid evidence case name');
  const cases = join(OUTPUT_ROOT, 'cases'), traces = join(OUTPUT_ROOT, 'traces');
  await mkdir(cases, { recursive: true }); await mkdir(traces, { recursive: true });
  const graph = run?.graph;
  const summary = {
    version: 1, case: name, category: spec.category, mainClass: spec.mainClass, accepted,
    recordedAt: new Date().toISOString(),
    error: error ? scrubPaths(error.message ?? String(error), run).slice(0, 2048) : null,
    buildSystem: run?.buildSystem ?? spec.buildSystem ?? 'plain',
    timings: run?.timings ?? null,
    counts: run ? { rawEvents: run.rawEvents.length, semanticEvents: run.trace.events.length, rawBatches: run.batches.length,
      deltaBytes: run.batches.reduce((sum, batch) => sum + batch.deltaBytes, 0), runtimeObjects: count(run.state.objects),
      runtimeClasses: count(run.state.classes), invocations: count(graph?.invocations), calls: count(graph?.calls),
      values: count(graph?.values), storage: count(graph?.storage), graphObjects: count(graph?.objects),
      io: count(graph?.io), edges: graph?.edges.length ?? 0 } : null,
    java: run ? { status: run.snapshot.status, exitCode: run.snapshot.exitCode,
      stdoutBytes: Buffer.byteLength(run.snapshot.stdout), stderrBytes: Buffer.byteLength(run.snapshot.stderr),
      stdoutSha256: digest(run.snapshot.stdout), stderrSha256: digest(run.snapshot.stderr) } : null,
    observer: run ? { ...run.snapshot.recording } : null,
    semantic: run ? { status: run.state.status, capability: run.capability.status, diagnostics: run.capability.diagnostics } : null,
    jdk: run ? { available: run.jdk.available, version: run.jdk.version, platform: process.platform, architecture: process.arch } : null,
    dependencies: run?.dependencies.map(dependency => dependency.name) ?? [],
    classpaths: run ? { compile: run.classpaths.compile.map(path => classpathLabel(path, run)),
      runtime: run.classpaths.runtime.map(path => classpathLabel(path, run)) } : null,
    outputs: run ? Object.fromEntries(Object.entries(run.files).map(([path, text]) => [path, { bytes: Buffer.byteLength(text), sha256: digest(text) }])) : {},
    probe,
    acceptedTrace: accepted ? `traces/${name}.trace.json` : null,
  };
  const tracePath = join(traces, `${name}.trace.json`);
  if (accepted) {
    // Canonical trace document contains captured sources and bounded observed
    // values, not raw source-manifest absolute paths or copied output-file text.
    const trace = sanitize(run.trace, run);
    await atomicJson(tracePath, trace);
  } else await rm(tracePath, { force: true });
  await atomicJson(join(cases, `${name}.summary.json`), sanitize(summary, run));
}
