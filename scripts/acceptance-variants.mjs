#!/usr/bin/env node
/**
 * Spec task 0.5 / R15.3–15.4: source-rewrite variants of an acceptance project.
 *   permuted — every identifier in `renames` is renamed (code tokens only; string/char
 *              literals and comments untouched), and files named after a renamed class move.
 *   shifted  — SHIFT_LINES comment lines are prepended to every .java file.
 * A generic runtime must produce an isomorphic world for both: identical up to the rename
 * map, and identical apart from source line numbers (+SHIFT_LINES).
 *
 * CLI: node scripts/acceptance-variants.mjs <projectDir> <permuted|shifted> <outDir>
 */
import { cp, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SHIFT_LINES = 3;
const IDENT = '[A-Za-z0-9_]';

/** Rename identifiers in arbitrary text (JSON signatures, binary names, descriptors such as LShape;). */
export function renamer(renames) {
  const keys = Object.keys(renames).sort((a, b) => b.length - a.length);
  if (!keys.length) return (text) => text;
  const alternatives = keys.join('|');
  // Default-package JVM descriptors (LShape; / [LShape;) carry the class name after an L.
  const descriptor = new RegExp(`L(${alternatives});`, 'g');
  const plain = new RegExp(`(?<!${IDENT})(${alternatives})(?!${IDENT})`, 'g');
  return (text) => text.replace(descriptor, (_whole, key) => `L${renames[key]};`).replace(plain, (key) => renames[key]);
}

/** Rename identifiers in Java source outside string/char literals and comments. */
export function renameJava(source, renames) {
  const rename = renamer(renames);
  let out = '', code = '', i = 0;
  const flush = () => { out += rename(code); code = ''; };
  while (i < source.length) {
    const two = source.slice(i, i + 2), ch = source[i];
    if (two === '//') { flush(); const end = source.indexOf('\n', i); const stop = end < 0 ? source.length : end; out += source.slice(i, stop); i = stop; continue; }
    if (two === '/*') { flush(); const end = source.indexOf('*/', i + 2) + 2; out += source.slice(i, end); i = end; continue; }
    if (ch === '"' || ch === "'") {
      flush();
      let j = i + 1;
      while (j < source.length && source[j] !== ch) j += source[j] === '\\' ? 2 : 1;
      out += source.slice(i, j + 1); i = j + 1; continue;
    }
    code += ch; i++;
  }
  flush();
  return out;
}

async function javaFiles(root) {
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...await javaFiles(path));
    else if (entry.name.endsWith('.java')) out.push(path);
  }
  return out;
}

export async function makeVariant(projectDir, kind, outDir, renames) {
  await mkdir(outDir, { recursive: true });
  await cp(projectDir, outDir, { recursive: true, filter: (path) => !/[\\/](target|build|out|\.gradle)([\\/]|$)/.test(path.slice(projectDir.length)) });
  for (const file of await javaFiles(outDir)) {
    const source = await readFile(file, 'utf8');
    if (kind === 'shifted') { await writeFile(file, `${'// acceptance line-shift variant\n'.repeat(SHIFT_LINES)}${source}`); continue; }
    if (kind !== 'permuted') throw new Error(`Unknown variant ${kind}`);
    await writeFile(file, renameJava(source, renames));
    const stem = basename(file, '.java');
    if (renames[stem]) await rename(file, join(dirname(file), `${renames[stem]}.java`));
  }
  return outDir;
}

/**
 * Canonical world signature: every semantic event (without ids/sequence numbers), the final
 * entity statuses, every layout anchor, and console/exit facts. `stripLines` removes source
 * line numbers and line-bearing labels for line-shift comparison.
 */
export function worldSignature(run, { stripLines = false } = {}) {
  const events = run.trace.events.map(({ eventId: _e, seq: _s, threadId: _t, source, label, ...rest }) => ({
    ...rest, ...(rest.type === 'EXECUTION_FACT' && stripLines ? { fact: { ...rest.fact, context: { ...rest.fact.context, source: rest.fact.context.source ? { fileId: rest.fact.context.source.fileId } : null } } } : {}), source: source ? { fileId: source.fileId, ...(stripLines ? {} : { line: source.line }) } : null,
    label: stripLines && /^Line \d+$/.test(label) ? 'Line' : label,
  }));
  // Keep every captured local/field in the semantic signature, including rows
  // omitted by presentation budgets or collapsed collection/library faces.
  const frames = run.scene.order.frames.map(id => {
    const frame = run.scene.entities[id], observed = run.final.frames[id];
    return { id, label: frame.title, status: frame.status.kind, slots: Object.values(observed.locals).map(slot => [slot.id, slot.name, slot.javaType, slot.value]) };
  });
  const objects = run.scene.order.objects.map(id => {
    const object = run.scene.entities[id], observed = run.final.objects[id];
    return { id, label: object.title, fields: Object.values(observed.fields).map(slot => [slot.id, slot.name, slot.value]) };
  });
  const anchors = Object.fromEntries(Object.entries(run.layout.anchors).map(([id, anchor]) => [id, { position: anchor.position, size: anchor.size, ports: anchor.ports }]));
  return JSON.stringify({ exit: run.snapshot.exitCode, stdout: run.snapshot.stdout, stderr: run.snapshot.stderr.replace(/\/tmp\/\S+/g, ''), events, frames, objects, anchors, bounds: run.layout.bounds ?? null }).replace(/\/0x[0-9a-f]+/gi, '/<vm-address>');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [projectDir, kind, outDir] = process.argv.slice(2);
  if (!projectDir || !kind || !outDir) { console.error('usage: acceptance-variants.mjs <projectDir> <permuted|shifted> <outDir>'); process.exit(2); }
  const facts = JSON.parse(await readFile(join(projectDir, 'expected.facts.json'), 'utf8'));
  console.log(await makeVariant(projectDir, kind, outDir, facts.renames ?? {}));
}

/** Rename enum/member-derived text along with labels, updating its truthful observed
 * UTF-16 length. No events, identities, geometry or relationships are discarded. */
export function renameWorldSignature(signature, renames) {
  const rename = renamer(renames);
  const transform = value => {
    if (Array.isArray(value)) return value.map(transform);
    if (value && typeof value === 'object') {
      // Schema keys are contracts, not application identifiers. Dynamic keys
      // contain canonical IDs/paths and must still follow their member rename.
      const result = Object.fromEntries(Object.entries(value).map(([key, item]) =>
        [key.includes(':') || key.includes('/') ? rename(key) : key, transform(item)]));
      if (result.string && !result.string.truncated) result.string.length = result.string.value.length;
      return result;
    }
    return typeof value === 'string' ? rename(value) : value;
  };
  return JSON.stringify(transform(JSON.parse(signature)));
}
