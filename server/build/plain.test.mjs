import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolvePlain } from './plain.mjs';

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function project() { const root = await mkdtemp(join(tmpdir(), 'ggjava-plain-')); roots.push(root); return root; }
async function put(root, path, content) { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), content); }

describe('plain project model', () => {
  it('keeps a beginner Main.java zero configuration', async () => {
    const root = await project(); await put(root, 'Main.java', 'class Main {}');
    const model = await resolvePlain({ projectRoot: root, classesDir: join(root, '..', 'classes') });
    expect(model.sourceRoots).toEqual(['.']);
    expect(model.sourcePaths).toEqual(['Main.java']);
  });
  it('uses explicit production and test roots without compiling test files', async () => {
    const root = await project();
    await put(root, 'code/com/example/Main.java', 'package com.example; class Main {}');
    await put(root, 'checks/Check.java', 'class Check {}');
    await put(root, 'visualjava.project.json', JSON.stringify({ sourceRoots: ['code'], testSourceRoots: ['checks'] }));
    const model = await resolvePlain({ projectRoot: root, classesDir: join(root, '..', 'classes') });
    expect(model.sourceRoots).toEqual(['code']);
    expect(model.testSourceRoots).toEqual(['checks']);
    expect(model.sourcePaths).toEqual(['code/com/example/Main.java']);
  });
  it.each(['../outside', '/tmp/outside', 'code/../checks'])('rejects unsafe custom root %s', async (path) => {
    const root = await project(); await put(root, 'visualjava.project.json', JSON.stringify({ sourceRoots: [path] }));
    await expect(resolvePlain({ projectRoot: root, classesDir: join(root, '..', 'classes') })).rejects.toThrow(/project-relative/);
  });
});
