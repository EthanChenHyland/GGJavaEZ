import { test, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { seek } from '../../src/runtime/seek.ts';
import { recordFixture } from './record.mjs';

test.runIf(process.env.VJ_PHASE3_JVM === '1')('bounded real-JVM graph processing measurements for an ordinary project and a large call tree', async () => {
  const samples = [];
  for (const [fixture, mainClass, programArgs] of [['flows', 'FlowMain', []], ['call-tree', 'BranchMain', ['large']]]) {
    globalThis.gc?.();
    const before = process.memoryUsage().heapUsed;
    const started = performance.now();
    const result = await recordFixture(fileURLToPath(new URL(`./fixtures/${fixture}`, import.meta.url)), mainClass, { programArgs });
    const endToEndMs = performance.now() - started;
    expect(result.snapshot.exitCode).toBe(0);
    globalThis.gc?.();
    const retainedMiB = (process.memoryUsage().heapUsed - before) / 2**20;
    let seed = 111;
    const scrubs = [];
    for (let n = 0; n < 30; n++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const start = performance.now();
      seek(result.trace, Math.floor(seed / 2**32 * result.trace.events.length));
      scrubs.push(performance.now() - start);
    }
    scrubs.sort((a,b) => a-b);
    samples.push({ fixture, jdk: result.jdk.version, actualExitCode: result.snapshot.exitCode, stdout: result.snapshot.stdout,
      recording: result.snapshot.recording.state, endToEndMs, ...result.metrics, retainedMiB,
      graph: { invocations: Object.keys(result.graph.invocations).length, calls: Object.keys(result.graph.calls).length, values: Object.keys(result.graph.values).length, edges: result.graph.edges.length },
      scrubMs: { p50: scrubs[15], p95: scrubs[28], max: scrubs[29] } });
  }
  await mkdir('docs/checkpoints/v12-p3', { recursive: true });
  await writeFile('docs/checkpoints/v12-p3/real-jvm-performance.json', JSON.stringify({ explicitGc: typeof globalThis.gc === 'function',
    note: 'One actual application JVM per fixture run; all workloads serial. End-to-end includes javac, helper preparation and Java. normalizationMs times accepted raw batches plus terminal graph/history normalization only. Retained heap samples include trace/history/graph and returned metadata, not isolated graph bytes; without explicit GC they include transient allocation. Scrub samples measure synchronous seeks, no browser/GPU. Production caps unchanged.', samples }, null, 2)+'\n');
}, 180000);
