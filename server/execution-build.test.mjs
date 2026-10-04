import { expect, test, vi } from 'vitest';
import { createExecutionBuild } from './execution-build.mjs';

function queue() {
  let tail = Promise.resolve();
  return work => { const next = tail.then(work, work); tail = next.catch(() => {}); return next; };
}

test('file transitions wait for source capture and later builds cannot replace old evidence', async () => {
  const serialized = queue();
  let content = 'compiled source', release, started;
  const capturing = new Promise(resolve => { started = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const build = vi.fn(async () => ({ success: true, project: { classesDir: '/classes', sourcePaths: ['Main.java'] } }));
  const boundary = createExecutionBuild({ serialized, build, getProjectRoot: async () => '/project',
    buildManifest: async () => { const observed = content; started(); await barrier; return { sources: [{ content: observed }] }; } });
  const first = boundary.build('project', true);
  await capturing;
  let moved = false;
  const move = serialized(() => { content = 'renamed and edited source'; moved = true; });
  await Promise.resolve();
  expect(moved).toBe(false);
  release();
  const compilation = await first;
  await move;
  const next = await boundary.build('project', true);
  expect(build).toHaveBeenCalledTimes(2);
  expect(boundary.buildManifest('/project', '/classes', ['Main.java'], compilation)).toEqual({ sources: [{ content: 'compiled source' }] });
  expect(boundary.buildManifest('/project', '/classes', ['Main.java'], next)).toEqual({ sources: [{ content: 'renamed and edited source' }] });
  expect(compilation).not.toHaveProperty('sourceManifest');
});

test('capture failure preserves successful build and leaves the queue available', async () => {
  const serialized = queue(), error = new Error('source capture unavailable');
  const boundary = createExecutionBuild({ serialized,
    build: async () => ({ success: true, project: { classesDir: '/classes', sourcePaths: [] } }),
    getProjectRoot: async () => '/project', buildManifest: async () => { throw error; } });
  const compilation = await boundary.build('project', true);
  expect(compilation.success).toBe(true);
  expect(() => boundary.buildManifest('/project', '/classes', [], compilation)).toThrow(error);
  expect(await serialized(() => 'file command completed')).toBe('file command completed');
});

test('failed compilation never captures source and missing evidence cannot be guessed from a directory', async () => {
  const buildManifest = vi.fn();
  const boundary = createExecutionBuild({ serialized: queue(), build: async () => ({ success: false }), getProjectRoot: vi.fn(), buildManifest });
  const compilation = await boundary.build('project', true);
  expect(buildManifest).not.toHaveBeenCalled();
  expect(() => boundary.buildManifest('/project', '/classes', [], compilation)).toThrow('no captured source snapshot');
});
