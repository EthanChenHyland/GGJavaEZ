import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadArrayTrace, loadControlTrace, loadPersonTrace, loadRecursionTrace } from '../../src/examples/traces.ts';
import { createLayoutEngine } from '../../src/world/layoutEngine.ts';

const goldenPath = new URL('./layoutEngineGolden.json', import.meta.url);
const capture = { origin: 'jvm', sourceHashes: {}, recordedAt: '2026-09-30T00:00:00.000Z' };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Preserve all 98 corpus/mode/prefix cases of the retired presentation golden.
// Semantic event/reducer/graph/history goldens are separate and never rewritten.
function variants() {
  const result = [];
  for (const [name, load] of [['person', loadPersonTrace], ['recursion', loadRecursionTrace], ['arrays', loadArrayTrace], ['control', loadControlTrace]]) {
    const trace = load();
    for (const [mode, doc] of [['curated', trace], ['jvm', { ...trace, capture }]]) {
      const cursors = new Set([1, Math.floor(trace.events.length / 3), Math.floor(trace.events.length / 2), trace.events.length]);
      for (let cursor = 7; cursor < trace.events.length; cursor += 7) cursors.add(cursor);
      for (const cursor of [...cursors].sort((a, b) => a - b)) result.push([`${name}:${mode}:${cursor}`, { ...doc, events: doc.events.slice(0, cursor) }]);
    }
  }
  return result;
}

describe('production layout-engine presentation golden', () => {
  it('matches the reviewed replacement at every preserved corpus/mode/prefix', () => {
    const actual = Object.fromEntries(variants().map(([key, trace]) => {
      const layout = createLayoutEngine(); layout.append(trace.events);
      return [key, digest(layout.state)];
    }));
    if (process.env.VJ_WRITE_GOLDEN === '1') writeFileSync(goldenPath, `${JSON.stringify(actual, null, 1)}\n`);
    const expected = JSON.parse(readFileSync(goldenPath, 'utf8'));
    expect(Object.keys(actual)).toHaveLength(98);
    expect(actual).toEqual(expected);
  });

  it('keeps identical geography across metadata modes and arbitrary append boundaries', () => {
    const hashes = new Map();
    for (const [key, trace] of variants()) {
      const batch = createLayoutEngine(); batch.append(trace.events);
      const incremental = createLayoutEngine();
      for (let to = 0; to < trace.events.length;) {
        const previous = incremental.state, saved = digest(previous);
        to = Math.min(trace.events.length, to + 1 + to % 11);
        incremental.append(trace.events.slice(0, to));
        expect(digest(previous), `immutable snapshot at ${key}/${to}`).toBe(saved);
        for (const [id, anchor] of Object.entries(previous.anchors)) {
          expect(incremental.state.anchors[id].position, `${key}/${id}`).toEqual(anchor.position);
          expect(incremental.state.anchors[id].size, `${key}/${id}`).toEqual(anchor.size);
          for (const [slot, port] of Object.entries(anchor.ports)) expect(incremental.state.anchors[id].ports[slot]).toEqual(port);
        }
      }
      expect(incremental.state, key).toEqual(batch.state);
      const [name, mode, cursor] = key.split(':'), identity = `${name}:${cursor}`;
      if (mode === 'curated') hashes.set(identity, digest(batch.state));
      else expect(digest(batch.state), key).toBe(hashes.get(identity));
    }
  });
});
