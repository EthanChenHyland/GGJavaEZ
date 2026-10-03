import { test, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { cpus, totalmem } from 'node:os';
import { generateRawTrace } from '../../src/testing/traceGen.ts';
import { TraceNormalizer } from '../../src/instrumentation/normalize.ts';

/** Synthetic producer facts are explicit, not inferred by product code. */
function enrich(original) {
  const events = [], frames = new Map(), returns = new Map();
  const put = record => events.push({ ...record, provenanceVersion: 1, seq: events.length });
  for (const raw of original) {
    if (raw.type === 'enter') {
      frames.set(raw.frameId, raw);
      const caller = frames.get(raw.callerFrameId);
      const id = `c:${raw.frameId}`;
      if (caller) put({ ...caller, type: 'call', site: raw.seq, callId: id, owner: raw.className, name: raw.methodName, callDescriptor: raw.descriptor,
        invokeKind: 'virtual', receiver: raw.receiver, receiverOrigin: { kind: 'unknown' }, arguments: raw.parameters.map(p => p.value), argumentOrigins: raw.parameters.map(p => ({ kind: 'constant', value: p.value })) });
      put({ ...raw, ...(caller ? { callId: id } : {}) });
    } else {
      if (raw.type === 'return') returns.set(raw.frameId, raw.value);
      put({ ...raw, ...(['local', 'field', 'return'].includes(raw.type) ? { origin: { kind: 'constant', value: raw.value } } : {}) });
      if (raw.type === 'exit') {
        const entered = frames.get(raw.frameId), caller = frames.get(entered.callerFrameId);
        if (caller) put({ ...caller, type: 'call_return', site: entered.seq, callId: `c:${raw.frameId}`, value: returns.get(raw.frameId) });
      }
    }
  }
  return events;
}
function measure(input, enriched) {
  globalThis.gc?.();
  const before = process.memoryUsage().heapUsed;
  const raw = enriched ? enrich(input.rawEvents) : input.rawEvents;
  const normalizer = new TraceNormalizer(input.manifest);
  const start = performance.now(), slices = [];
  for (let i = 0; i < raw.length; i += 256) { const t = performance.now(); normalizer.append(raw.slice(i, i + 256)); slices.push(performance.now() - t); }
  const result = normalizer.finish({ status: 'complete', exitCode: 0, diagnostic: null });
  const appendMs = performance.now() - start;
  expect(result.capability.diagnostics).toEqual([]);
  expect(normalizer.state.status).toBe('ended');
  const graph = normalizer.state.executionGraph;
  globalThis.gc?.();
  const retainedMiB = (process.memoryUsage().heapUsed - before) / 2**20;
  let seed = 12345;
  const scrubs = [];
  for (let i = 0; i < 30; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const t = performance.now(); normalizer.history.materialize(Math.floor(seed / 2**32 * normalizer.history.length)); scrubs.push(performance.now() - t); }
  const sorted = a => [...a].sort((x,y) => x-y);
  const s = sorted(scrubs), b = sorted(slices), live = performance.now();
  expect(normalizer.history.materialize(normalizer.history.length)).toBe(normalizer.state);
  const returnToLiveMs = performance.now()-live;
  const summary = { rawEvents: raw.length, semanticEvents: normalizer.history.length, appendMs, retainedMiB,
    graph: graph ? { invocations: Object.keys(graph.invocations).length, calls: Object.keys(graph.calls).length, values: Object.keys(graph.values).length, edges: graph.edges.length } : null,
    batchMs: { p50: b[Math.floor(b.length*.5)], p95: b[Math.floor(b.length*.95)] }, scrubMs: { p50: s[15], p95: s[28], max: s[29] }, returnToLiveMs, checkpoints: normalizer.history.stats };
  normalizer.history.dispose();
  return summary;
}
test('Phase 3 paired incremental provenance cost: small, thousands of invocations, 20k+ and 122k baseline semantic events', async () => {
  const outputRoot = 'docs/checkpoints/v12-p3';
  await mkdir(outputRoot, { recursive: true });
  const report = { environment: { node: process.version, cpu: cpus()[0]?.model, memoryGiB: totalmem()/2**30 }, explicitGc: typeof globalThis.gc === 'function',
    note: 'Single construction per configuration, paired in one process; 256 raw-record batches. Baseline input held outside retained measurement. Rich measurement includes enriched raw facts, semantic events, graph and checkpoint roots. Synthetic facts simulate bytecode observations, not a JVM or WebGL benchmark. 30 deterministic random seeks. Production recorder caps unchanged.', samples: [] };
  for (const size of [200, 5000, 20000, 100000]) {
    const input = generateRawTrace({ rawEvents: size, seed: 42 });
    const baseline = measure(input, false), provenance = measure(input, true);
    report.samples.push({ requestedRawEvents: size, generator: input.stats, baseline, provenance, appendRatio: provenance.appendMs / baseline.appendMs, additionalRetainedMiB: provenance.retainedMiB-baseline.retainedMiB });
    await writeFile(`${outputRoot}/performance.json`, JSON.stringify(report, null, 2)+'\n');
  }
}, 180000);
