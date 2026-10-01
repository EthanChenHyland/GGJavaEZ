import { describe, expect, test } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DebugManager } from '../../server/debug-manager.mjs';
import { compileProject } from '../../server/compiler.mjs';
import { buildInstrumentationSourceManifest } from '../../server/instrumentation-sources.mjs';
import { normalizeTrace } from '../../src/instrumentation/normalize.ts';

/**
 * CHARACTERIZATION — audit X3/X4: server-side capture policy terminates the user's JVM.
 *   X4: the capture-duration clock keeps running while the program waits for stdin.
 *   X3: a second application thread emitting probe events causes SIGKILL.
 * These run the production DebugManager in Run mode (control: false). Only the duration is
 * shortened from 30 s via the existing timeoutMs request field, which production also uses,
 * so the tests stay fast; the policy is unchanged. "DESIRED" tests are test.fails
 * (Phase 1, task 1.2 / R1.3–1.4 / INV-2).
 */
async function session(source, { timeoutMs = 30000 } = {}) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'vj-session-budget-'));
  const classesDir = join(projectRoot, '.classes');
  await mkdir(projectRoot, { recursive: true });
  await writeFile(join(projectRoot, 'Main.java'), source);
  const build = await compileProject(projectRoot, classesDir, null, { debug: true });
  if (!build.success) throw new Error(build.rawOutput);
  const sourceManifest = await buildInstrumentationSourceManifest(projectRoot, classesDir);
  const manager = new DebugManager();
  const { sessionId } = await manager.start({ projectId: 'budget', projectRoot, classesDir, mainClass: 'Main',
    javaPath: build.jdk.javaPath, javacPath: build.jdk.javacPath, build, sourceManifest, control: false,
    rawEventLimit: 20000, rawByteLimit: 8 * 1024 * 1024, timeoutMs, breakpoints: [] });
  const ended = async (limit = 60000) => {
    const end = Date.now() + limit;
    for (;;) {
      const snapshot = manager.snapshot(sessionId);
      if (['exited', 'failed', 'stopped'].includes(snapshot.status)) return snapshot;
      if (Date.now() > end) throw new Error(`Session did not end: ${snapshot.status}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
  const cleanup = async () => { await manager.stop(); await rm(projectRoot, { recursive: true, force: true }); };
  return { manager, sessionId, ended, cleanup };
}

const waitsForInput = `public class Main {
  public static void main(String[] args) throws Exception {
    System.out.println("WAITING");
    int value = System.in.read();
    System.out.println("GOT " + value);
  }
}`;
const twoThreads = `public class Main {
  static int bump(int value) { return value + 1; }
  public static void main(String[] args) throws Exception {
    int[] box = new int[1];
    // The worker stays alive briefly so the server's 20 ms poll deterministically sees both
    // threads while the JVM is running (otherwise the race below decides the outcome).
    Thread worker = new Thread(() -> { box[0] = bump(box[0]); try { Thread.sleep(3000); } catch (InterruptedException ignored) {} });
    worker.start();
    worker.join();
    System.out.println("DONE " + box[0]);
  }
}`;

describe('capture duration while waiting for stdin (X4)', () => {
  test('CURRENT (bug X4, fixed in Phase 1): an idle stdin wait exhausts the capture time budget and the JVM is killed', async () => {
    const s = await session(waitsForInput, { timeoutMs: 4000 });
    try {
      const result = await s.ended();
      expect(result.rawEvents.at(-1)?.type).toBe('stdin_wait');
      expect(result).toMatchObject({ status: 'failed', terminalStatus: 'limit_exceeded' });
      expect(result.stdout).toContain('WAITING');
      expect(result.stdout).not.toContain('GOT');
    } finally { await s.cleanup(); }
  }, 90000);

  test.fails('DESIRED (Phase 1, R1.4): time spent waiting for stdin does not count; late input completes the program', async () => {
    const s = await session(waitsForInput, { timeoutMs: 4000 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 5500));
      await s.manager.input(s.sessionId, 'A\n');
      const result = await s.ended();
      expect(result.status).toBe('exited');
      expect(result.stdout).toContain('GOT 65');
    } finally { await s.cleanup(); }
  }, 90000);
});

describe('second application thread (X3)', () => {
  test('CURRENT (bug X3, fixed in Phase 1): a second project thread makes the server kill the JVM', async () => {
    const s = await session(twoThreads);
    try {
      const result = await s.ended();
      expect(result.status).toBe('failed');
      expect(result.terminalStatus).toBe('unsupported');
      expect(result.diagnostic).toContain('Multiple project threads');
      expect(result.stdout).not.toContain('DONE');
    } finally { await s.cleanup(); }
  }, 90000);

  test('CURRENT (bug X3, fixed in Phase 1): the client normalizer rejects any second-thread prefix, so even a JVM that escaped the kill race gets no world', async () => {
    const s = await session(twoThreads);
    try {
      const result = await s.ended();
      expect(new Set(result.rawEvents.filter((event) => event.type !== 'console').map((event) => event.threadId)).size).toBe(2);
      const normalized = normalizeTrace(result.rawEvents, result.sourceManifest, { status: 'complete', exitCode: 0, diagnostic: null });
      expect(normalized.capability.diagnostics.join(' ')).toContain('Multiple project threads are unsupported');
      expect(normalized.trace.events.at(-1)).toMatchObject({ type: 'PROGRAM_ABORT', reason: 'instrumentation_failed' });
    } finally { await s.cleanup(); }
  }, 90000);

  test.fails('DESIRED (Phase 1, R1.3): the program completes and thread coverage is only marked partial', async () => {
    const s = await session(twoThreads);
    try {
      const result = await s.ended();
      expect(result.status).toBe('exited');
      expect(result.stdout).toContain('DONE 1');
    } finally { await s.cleanup(); }
  }, 90000);
});
