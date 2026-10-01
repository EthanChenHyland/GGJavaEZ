import { describe, expect, test } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DebugManager } from '../../server/debug-manager.mjs';
import { compileProject } from '../../server/compiler.mjs';
import { buildInstrumentationSourceManifest } from '../../server/instrumentation-sources.mjs';
import { normalizeTrace } from '../../src/instrumentation/normalize.ts';

/**
 * Phase 0 evidence: X3 killed on second-thread observation, X4 counted stdin waits as
 * running time. Phase 1 promotes the required behavior: the same JVM continues and
 * only recording becomes partial. Constructor characterization stays deferred.
 */
async function session(source, { timeoutMs = 30000, control = false, rawEventLimit = 20000, breakpoints = [] } = {}) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'vj-session-budget-'));
  const classesDir = join(projectRoot, '.classes');
  await mkdir(projectRoot, { recursive: true });
  await writeFile(join(projectRoot, 'Main.java'), source);
  const build = await compileProject(projectRoot, classesDir, null, { debug: true });
  if (!build.success) throw new Error(build.rawOutput);
  const sourceManifest = await buildInstrumentationSourceManifest(projectRoot, classesDir);
  const manager = new DebugManager();
  const { sessionId } = await manager.start({ projectId: 'budget', projectRoot, classesDir, mainClass: 'Main',
    javaPath: build.jdk.javaPath, javacPath: build.jdk.javacPath, build, sourceManifest, control,
    rawEventLimit, rawByteLimit: 8 * 1024 * 1024, timeoutMs, breakpoints });
  const ended = async (limit = 60000) => {
    const end = Date.now() + limit;
    for (;;) {
      const snapshot = manager.snapshot(sessionId);
      if (['exited', 'failed', 'stopped'].includes(snapshot.status)) return snapshot;
      if (Date.now() > end) throw new Error(`Session did not end: ${snapshot.status}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
  const cleanup = async () => { await manager.dispose(); await rm(projectRoot, { recursive: true, force: true }); };
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

async function until(s, predicate, limit = 10000) {
  const end = Date.now() + limit;
  for (;;) {
    const snapshot = s.manager.snapshot(s.sessionId);
    if (predicate(snapshot)) return snapshot;
    if (['failed', 'stopped', 'exited'].includes(snapshot.status)) throw new Error(`Unexpected terminal session: ${JSON.stringify(snapshot)}`);
    if (Date.now() > end) throw new Error('Session condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('stdin duration regression (X4)', () => {
  test('Phase 1: late stdin after the previous watchdog threshold completes the same program', async () => {
    const s = await session(waitsForInput, { timeoutMs: 4000 });
    try {
      await until(s, (result) => result.waitingForInput);
      await new Promise((resolve) => setTimeout(resolve, 5500));
      const waiting = s.manager.snapshot(s.sessionId);
      expect(waiting.status).toBe('running'); expect(waiting.rawEvents.at(-1).type).toBe('stdin_wait');
      await s.manager.input(s.sessionId, 'A\n');
      const result = await s.ended();
      expect(result).toMatchObject({ status: 'exited', terminalStatus: 'complete', exitCode: 0 });
      expect(result.stdout).toBe('WAITING\nGOT 65\n');
    } finally { await s.cleanup(); }
  }, 90000);
});

describe('second application thread regression (X3)', () => {
  test('Phase 1: program completes with a valid first-thread prefix and truthful stopped observer', async () => {
    const s = await session(twoThreads);
    try {
      const result = await s.ended();
      expect(result).toMatchObject({ status: 'exited', terminalStatus: 'complete', exitCode: 0, stdout: 'DONE 1\n',
        recording: { state: 'STOPPED_UNSUPPORTED', budget: null, executionContinued: true } });
      expect(result.recording.reason).toMatch(/thread/i);
      expect(new Set(result.rawEvents.filter((event) => event.type !== 'capture_saturated' && (event.type !== 'console' || event.frameId !== null)).map((event) => event.threadId)).size).toBe(1);
      result.rawEvents.forEach((event, index) => expect(event.seq).toBe(index));
      const normalized = normalizeTrace(result.rawEvents, result.sourceManifest,
        { status: 'complete', exitCode: 0, diagnostic: null, recording: result.recording });
      expect(normalized.trace.events.at(-1)).toMatchObject({ type: 'CAPTURE_STOP', recording: { state: 'STOPPED_UNSUPPORTED' } });
      expect(normalized.trace.events.some((event) => event.type === 'PROGRAM_END' || event.type === 'PROGRAM_ABORT')).toBe(false);
    } finally { await s.cleanup(); }
  }, 90000);
});

const saturatesThenReads = `public class Main {
  public static void main(String[] args) throws Exception {
    int sum = 0;
    for (int i = 0; i < 100; i++) sum += i;
    System.out.println("WAITING");
    int value = System.in.read();
    System.out.println("DONE " + value + " " + sum);
  }
}`;

test('Phase 1: stdin sidecar remains operational after saturation and idle watchdog threshold', async () => {
  const s = await session(saturatesThenReads, { timeoutMs: 2000, rawEventLimit: 6 });
  try {
    const waiting = await until(s, (r) => r.waitingForInput && r.recording.state === 'STOPPED_LIMIT');
    const count = waiting.rawEvents.length;
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(s.manager.snapshot(s.sessionId).status).toBe('running');
    await s.manager.input(s.sessionId, 'A\n');
    const result = await s.ended();
    expect(result).toMatchObject({ status: 'exited', terminalStatus: 'complete', exitCode: 0, stdout: 'WAITING\nDONE 65 4950\n' });
    expect(result.rawEvents).toHaveLength(count); expect(result.rawEvents.at(-1).type).toBe('capture_saturated');
    expect(result.waitingForInput).toBe(false);
  } finally { await s.cleanup(); }
}, 90000);

test('Phase 1: long breakpoint pause after saturation excludes paused time; Continue and stdin finish normally', async () => {
  const s = await session(saturatesThenReads, { timeoutMs: 2000, rawEventLimit: 6, control: true, breakpoints: [{ fileId: 'Main.java', line: 6 }] });
  try {
    await until(s, (r) => r.status === 'paused' && r.pause.reason === 'entry');
    await s.manager.command(s.sessionId, 'continue');
    const pause = await until(s, (r) => r.status === 'paused' && r.pause.line === 6);
    expect(pause.recording.state).toBe('STOPPED_LIMIT'); expect(pause.pause.rawEventCount).toBe(pause.rawEvents.length);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(s.manager.snapshot(s.sessionId).status).toBe('paused');
    await s.manager.command(s.sessionId, 'continue'); await until(s, (r) => r.waitingForInput);
    await s.manager.input(s.sessionId, 'B\n');
    expect(await s.ended()).toMatchObject({ status: 'exited', terminalStatus: 'complete', exitCode: 0, stdout: 'WAITING\nDONE 66 4950\n' });
  } finally { await s.cleanup(); }
}, 90000);

test('Phase 1: explicit Stop after saturation/input wait reaps target and reRun starts cleanly', async () => {
  const s = await session(saturatesThenReads, { rawEventLimit: 6 });
  try {
    await until(s, (r) => r.waitingForInput && r.recording.state === 'STOPPED_LIMIT');
    expect(await s.manager.stop(s.sessionId)).toMatchObject({ status: 'stopped' });
    const previous = s.manager.snapshot(s.sessionId);
    // Reuse the same successfully compiled project and source manifest; start prepares a new isolated recorder.
    const running = s.manager.sessions.get(s.sessionId);
    const next = await s.manager.start(running.request);
    expect(next.sessionId).not.toBe(s.sessionId); expect(next.stdout).toBe(''); expect(next.recording.state).toBe('FULL');
    await until({ manager: s.manager, sessionId: next.sessionId }, (r) => r.waitingForInput);
    await s.manager.input(next.sessionId, 'C\n');
    const final = await until({ manager: s.manager, sessionId: next.sessionId }, (r) => r.status === 'exited');
    expect(final).toMatchObject({ terminalStatus: 'complete', exitCode: 0, stdout: 'WAITING\nDONE 67 4950\n' });
    expect(s.manager.snapshot(s.sessionId)).toEqual(previous);
  } finally { await s.cleanup(); }
}, 90000);
