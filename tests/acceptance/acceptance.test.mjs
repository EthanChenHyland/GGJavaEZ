import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { makeVariant, renamer, SHIFT_LINES, worldSignature } from '../../scripts/acceptance-variants.mjs';
import { evaluate } from './facts.mjs';
import { runAcceptanceProject } from './runner.mjs';

/**
 * Spec tasks 0.4–0.6: fresh real-Java acceptance corpus, invariance harness, and real-JVM runs
 * of the curated demos' Main.java through the generic path.
 *   current facts   -> test(), must hold today.
 *   target:Pn facts -> test.fails(): asserted exactly as the spec requires and expected to fail
 *                      until phase n. An unexpected pass fails the suite so the fact gets promoted.
 * Run with `npm run test:acceptance` (needs JDK, Maven, Gradle and dependency resolution).
 */
const corpusRoot = 'fixtures/acceptance-v12';
const projects = (await readdir(corpusRoot)).sort();
const specs = Object.fromEntries(await Promise.all(projects.map(async (name) => [name, JSON.parse(await readFile(join(corpusRoot, name, 'expected.facts.json'), 'utf8'))])));
const curated = JSON.parse(await readFile('tests/acceptance/curated.facts.json', 'utf8'));
const scratch = await mkdtemp(join(tmpdir(), 'vj-variants-'));
afterAll(() => rm(scratch, { recursive: true, force: true }));
const cache = new Map();
const once = (key, work) => { if (!cache.has(key)) cache.set(key, work()); return cache.get(key); };
const TIMEOUT = 240000;

function factTests(spec, run, runWithOptions) {
  for (const fact of spec.facts) {
    const label = `${fact.status === 'current' ? 'CURRENT' : `TARGET ${fact.status.slice(7)}`} ${fact.id} (${fact.kind}${fact.requirement ? ` · ${fact.requirement}` : ''})`;
    const body = async () => {
      const result = fact.stdinDelayMs ? await runWithOptions({ stdinDelayMs: fact.stdinDelayMs }) : await run();
      expect(result.built, result.buildOutput).toBe(true);
      const { ok, detail } = evaluate(result, fact);
      expect(ok, detail).toBe(true);
    };
    if (fact.status === 'current') test(label, body, TIMEOUT);
    else test.fails(label, body, TIMEOUT);
  }
}

describe.each(projects)('acceptance %s', (name) => {
  const dir = join(corpusRoot, name);
  const spec = specs[name];
  const run = () => once(name, () => runAcceptanceProject(dir, { stdin: spec.stdin ?? null }));
  const runWith = (options) => once(`${name}:${JSON.stringify(options)}`, () => runAcceptanceProject(dir, { stdin: spec.stdin ?? null, ...options }));

  test('corpus project is fresh (no curated fixture identifiers)', async () => {
    const files = [];
    const walk = async (root) => { for (const e of await readdir(root, { withFileTypes: true })) { const p = join(root, e.name); if (e.isDirectory()) await walk(p); else if (p.endsWith('.java')) files.push(p); } };
    await walk(dir);
    for (const file of files) expect(await readFile(file, 'utf8'), file).not.toMatch(/\b(Person|setAge|factorial|bubble|BankAccount|LedgerService|Receipt|DispatchService|GraphBuilder)\b/);
  });
  factTests(spec, run, runWith);

  test('INVARIANCE (R15.3): identifier-permuted variant yields an isomorphic world', async () => {
    const base = await run();
    const variant = await runAcceptanceProject(await makeVariant(dir, 'permuted', join(scratch, `${name}-permuted`), spec.renames), { stdin: spec.stdin ?? null });
    expect(variant.built, variant.buildOutput).toBe(true);
    expect(worldSignature(variant)).toBe(renamer(spec.renames)(worldSignature(base)));
  }, TIMEOUT);

  test(`INVARIANCE (R15.4): +${SHIFT_LINES}-line source shift changes only source lines`, async () => {
    const base = await run();
    const variant = await runAcceptanceProject(await makeVariant(dir, 'shifted', join(scratch, `${name}-shifted`), {}), { stdin: spec.stdin ?? null });
    expect(variant.built, variant.buildOutput).toBe(true);
    expect(worldSignature(variant, { stripLines: true })).toBe(worldSignature(base, { stripLines: true }));
    const lines = (r) => r.trace.events.filter((e) => e.source).map((e) => e.source.line);
    expect(lines(variant)).toEqual(lines(base).map((line) => line + SHIFT_LINES));
  }, TIMEOUT);
});

describe.each(Object.keys(curated))('curated demo %s on the real JVM generic path (task 0.6)', (name) => {
  const spec = curated[name];
  const run = () => once(`curated:${name}`, () => runAcceptanceProject(spec.dir, { stdin: spec.stdin ?? null }));
  factTests(spec, run, run);
});
