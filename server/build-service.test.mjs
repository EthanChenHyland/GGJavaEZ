import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BuildService } from './build-service.mjs';

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const jdk = { available: true, home: '/mock/jdk', javaPath: '/mock/jdk/bin/java', javacPath: '/mock/jdk/bin/javac', version: '26', error: null };
async function service() {
  const root = await mkdtemp(join(tmpdir(), 'ggjava-service-')); roots.push(root);
  const projectRoot = join(root, 'projects', 'abc'); await mkdir(projectRoot, { recursive: true });
  const getProjectRoot = vi.fn(async () => projectRoot);
  const builds = new BuildService({ workspaceRoot: root, projects: { getProjectRoot }, getJdk: async () => jdk });
  return { root, projectRoot, builds };
}

describe('BuildService model boundary', () => {
  it('coalesces concurrent refreshes and keeps all host paths out of the DTO', async () => {
    const { root, projectRoot, builds } = await service();
    await writeFile(join(projectRoot, 'Main.java'), 'class Main {}');
    const [one, two] = await Promise.all([builds.resolve('abc', { refresh: true }), builds.resolve('abc')]);
    expect(two).toBe(one);
    expect(one.projectRoot).toBe(projectRoot);
    expect(one.classesDir).toBe(join(root, 'build', 'abc', 'classes'));
    const dto = builds.toDTO(one);
    expect(JSON.stringify(dto)).not.toContain(root);
    expect(dto.sourceRoots).toEqual(['.']);
    expect(dto.status).toBe('ready');
    expect((await builds.resolve('abc', { refresh: true })).revision).toBe(one.revision);
    await writeFile(join(projectRoot, 'Other.java'), 'class Other {}');
    expect((await builds.resolve('abc', { refresh: true })).revision).not.toBe(one.revision);
  });
  it('reports unavailable Maven without throwing and blocks launch', async () => {
    const { projectRoot, builds } = await service();
    await writeFile(join(projectRoot, 'pom.xml'), '<project/>');
    const model = await builds.resolve('abc');
    expect(model.buildSystem).toBe('maven');
    expect(model.status).toBe('failed');
    expect(model.runnableTargets).toEqual([]);
    expect(JSON.stringify(builds.toDTO(model))).not.toContain(projectRoot);
  });
});
