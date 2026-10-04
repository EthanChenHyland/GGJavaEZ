import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CaptureReader } from '../../server/instrumentation-provider.mjs';
import { normalizeTrace, TraceNormalizer } from '../../src/instrumentation/normalize.ts';
import { applyEvent, createInitialState } from '../../src/runtime/state.ts';
import { validateTrace } from '../../src/runtime/trace.ts';
import { seek } from '../../src/runtime/seek.ts';
import { JVM_ENABLED } from './runner.mjs';

const plain = value => JSON.parse(JSON.stringify(value));

/** Re-read ACTUAL captured facts using the production parser/archive path after
 * their originating JVM and preparation directory have been disposed. No mocks.
 */
export async function assertArchiveAndReplay(run) {
  if (!JVM_ENABLED) throw new Error('Archive replay of real runs needs the lead-authorized VJ_PHASE4_JVM=1 slot');
  const directory = await mkdtemp(join(tmpdir(), 'vj-phase4-reload-'));
  const tracePath = join(directory, 'raw.ndjson');
  const reader = new CaptureReader({ trace: tracePath, rawEventLimit: run.spec.rawEventLimit ?? 20000, rawByteLimit: 8 * 1024 * 1024 });
  try {
    await writeFile(tracePath, run.rawEvents.map(event => JSON.stringify(event)).join('\n') + '\n');
    await reader.refresh(true);
    await reader.close();
    await rm(directory, { recursive: true, force: true });
    const reloaded = reader.events;
    assert.deepEqual(reloaded, run.rawEvents, 'Archive reload narrowed or changed a captured value');
    const oneShot = normalizeTrace(reloaded, run.sourceManifest, run.terminal, run.demoId);
    assert.deepEqual(plain(oneShot.trace.events), plain(run.trace.events), 'Batch reload disagrees with production incremental normalization');
    assert.deepEqual(plain(seek(oneShot.trace, oneShot.trace.events.length)), plain(run.state));

    // Rebatch a single captured run. This verifies normalization at boundaries
    // inside allocations/static observations, rather than only real polling batches.
    const split = new TraceNormalizer(run.sourceManifest, run.demoId);
    const sizes = [1, 7, 31, 2, 256];
    for (let offset = 0, batch = 0; offset < reloaded.length; batch++) {
      const size = sizes[batch % sizes.length];
      split.append(reloaded.slice(offset, offset + size)); offset += size;
    }
    const rebatch = split.finish(run.terminal);
    assert.deepEqual(plain(rebatch.trace.events), plain(run.trace.events), 'Different raw packet boundaries changed semantic events');
    assert.deepEqual(plain(split.history.state), plain(run.state));
    assert.ok(split.history.stats.checkpointCount <= split.history.stats.maxCheckpoints);
    split.history.dispose();

    // The pure reducer remains the correctness reference. Compare a bounded set
    // of real history roots, including a library/static/array update, then scrub
    // backward and forward without changing the separately held live head.
    const count = run.trace.events.length;
    const interesting = run.trace.events.findIndex(event => ['OBJECT_OBSERVE', 'SET_STATIC', 'ARRAY_WRITE'].includes(event.type));
    const cursors = new Set([0, Math.floor(count / 2), count, ...(interesting >= 0 ? [interesting, interesting + 1] : [])]);
    const expected = new Map();
    let state = createInitialState();
    if (cursors.has(0)) expected.set(0, plain(state));
    for (const event of run.trace.events) {
      state = applyEvent(state, event);
      if (cursors.has(state.cursor)) expected.set(state.cursor, plain(state));
    }
    const live = run.history.state;
    const before = JSON.stringify(live);
    for (const cursor of [...cursors].sort((a, b) => b - a)) assert.deepEqual(plain(seek(run.trace, cursor)), expected.get(cursor));
    for (const cursor of [...cursors].sort((a, b) => a - b)) assert.deepEqual(plain(seek(run.trace, cursor)), expected.get(cursor));
    assert.equal(run.history.state, live, 'Historical seek replaced LIVE root');
    assert.equal(JSON.stringify(live), before, 'Scrubbing mutated retained LIVE root');

    // Semantic trace archive/reload also preserves every new value/summary/edge.
    const document = validateTrace(plain(run.trace));
    assert.deepEqual(plain(seek(document, document.events.length)), plain(run.state));
  } finally {
    await reader.dispose();
    await rm(directory, { recursive: true, force: true });
  }
}
