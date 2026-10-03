import { test, expect, vi } from 'vitest';
vi.mock('./raw-trace-archive.mjs', async original => ({
  ...await original(), RawTraceArchive: class { constructor() { throw new Error('Mock archive creation failure'); } },
}));
import { DebugManager } from './debug-manager.mjs';
test('archive initialization failure is safe pre-child preparation failure, with cleanup and no JVM launch', async () => {
  const cleanup = vi.fn(async () => {}), spawnProcess = vi.fn();
  const manager = new DebugManager({ spawnProcess, prepare: async () => ({ coveredClasses: [], transformInfo: {}, cleanup }) });
  const failure = await manager.start({ projectId: 'test', projectRoot: '/tmp', classesDir: '/tmp', mainClass: 'Main', javaPath: process.execPath,
    build: { success: true }, sourceManifest: { sources: [], classes: [] }, control: false }).catch(error => error);
  expect(failure).toMatchObject({ message: 'Mock archive creation failure', preparationFailed: true, executionStarted: false });
  expect(spawnProcess).not.toHaveBeenCalled(); expect(cleanup).toHaveBeenCalledOnce();
  expect(manager.current()).toBe(null); await manager.dispose();
});
