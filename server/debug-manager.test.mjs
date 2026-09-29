import { test, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { DebugManager } from './debug-manager.mjs';
import { compileProject } from './compiler.mjs';
import { buildInstrumentationSourceManifest } from './instrumentation-sources.mjs';
import { prepareInstrumented } from './instrumentation-provider.mjs';

const main = `public class Main {
  public static void main(String[] args) {
    int a = 1;
    int result = Helper.work(a);
    System.out.println(result);
    result++;
    System.out.println(result);
  }
}`;
const helper = `public class Helper {
  static int work(int x) {
    int y = x + 1;
    return inner(y);
  }
  static int inner(int x) {
    return x + 3;
  }
}`;

async function fixture(files = { 'Main.java': main, 'Helper.java': helper }, options = {}) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'visual-java-debug-test-'));
  const classesDir = join(projectRoot, '.classes');
  try {
    for (const [name, source] of Object.entries(files)) {
      await mkdir(join(projectRoot, name, '..'), { recursive: true });
      await writeFile(join(projectRoot, name), source);
    }
    const build = await compileProject(projectRoot, classesDir, null, { debug: true });
    expect(build.success, build.rawOutput).toBe(true);
    const sourceManifest = await buildInstrumentationSourceManifest(projectRoot, classesDir);
    const manager = new DebugManager(options);
    return { manager, request: { projectId: 'debug-test', projectRoot, classesDir, mainClass: 'Main',
      javaPath: build.jdk.javaPath, javacPath: build.jdk.javacPath, build, sourceManifest,
      rawEventLimit: 20000, rawByteLimit: 8 * 1024 * 1024, timeoutMs: 30000, breakpoints: [] },
    cleanup: async () => { await manager.stop(); await rm(projectRoot, { recursive: true, force: true }); } };
  } catch (failure) { await rm(projectRoot, { recursive: true, force: true }); throw failure; }
}

async function until(manager, predicate, timeout = 7000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const snapshot = manager.current();
    if (predicate(snapshot)) return snapshot;
    if (snapshot?.status === 'failed') throw new Error(snapshot.diagnostic);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(`Timed out waiting for debugger: ${JSON.stringify(manager.current())}`);
}
const paused = (manager, line, className = 'Main') => until(manager,
  (session) => session?.status === 'paused' && session.pause.line === line && session.pause.className === className);
const ended = (manager) => until(manager, (session) => ['exited', 'stopped', 'failed'].includes(session?.status));

test('actual source breakpoint pauses before operation; removal and continue complete normally', async () => {
  const f = await fixture();
  try {
    const start = await f.manager.start({ ...f.request, breakpoints: [{ fileId: 'Main.java', line: 4 }, { fileId: 'Main.java', line: 9 }] });
    expect(start.status).toBe('starting');
    expect(start.breakpoints.map((item) => item.status)).toEqual(['verified', 'non_executable']);
    const entry = await paused(f.manager, 3);
    expect(entry.pause.reason).toBe('entry');
    await f.manager.command(start.sessionId, 'continue');
    const hit = await paused(f.manager, 4);
    expect(hit.pause.reason).toBe('breakpoint');
    expect(hit.rawEvents.length).toBe(hit.pause.rawEventCount);
    expect(hit.rawEvents.at(-1)).toMatchObject({ type: 'line', line: 4, frameId: hit.pause.frameId });
    expect(hit.rawEvents.some((event) => event.type === 'enter' && event.className === 'Helper')).toBe(false);
    expect(hit.rawEvents.find((event) => event.type === 'local' && event.name === 'a').value.value).toBe(1);
    const removed = await f.manager.setBreakpoints(start.sessionId, []);
    expect(removed.breakpoints).toEqual([]);
    await f.manager.command(start.sessionId, 'continue');
    const final = await ended(f.manager);
    expect(final).toMatchObject({ status: 'exited', terminalStatus: 'complete', stdout: '5\n6\n', exitCode: 0 });
    expect(final.stdout).not.toContain('paused');
    expect(final.revision).toBeGreaterThan(hit.revision);
    final.rawEvents.forEach((event, index) => expect(event.seq).toBe(index));
    expect(f.manager.snapshot('missing')).toBeNull();
  } finally { await f.cleanup(); }
}, 15000);

test('actual step Into/Over/Out follows project thread and multi-file stack depth', async () => {
  const f = await fixture();
  try {
    const { sessionId } = await f.manager.start(f.request);
    const entry = await paused(f.manager, 3);
    await f.manager.command(sessionId, 'stepOver'); await paused(f.manager, 4);
    await f.manager.command(sessionId, 'stepInto');
    const work = await paused(f.manager, 3, 'Helper');
    expect(work.pause.reason).toBe('step');
    expect(work.pause.threadId).toBe(entry.pause.threadId);
    expect(work.pause.frameId).not.toBe(entry.pause.frameId);
    await f.manager.command(sessionId, 'stepOver'); await paused(f.manager, 4, 'Helper');
    await f.manager.command(sessionId, 'stepInto'); await paused(f.manager, 7, 'Helper');
    await f.manager.command(sessionId, 'stepOut');
    const caller = await paused(f.manager, 5);
    expect(caller.pause.frameId).toBe(entry.pause.frameId);
    expect(caller.rawEvents.filter((event) => event.type === 'return').map((event) => event.value.value)).toEqual([5, 5]);
    await f.manager.command(sessionId, 'continue'); expect((await ended(f.manager)).terminalStatus).toBe('complete');
  } finally { await f.cleanup(); }
}, 15000);

test('step Over skips deeper project calls and step Out from callee returns to caller', async () => {
  const f = await fixture();
  try {
    let { sessionId } = await f.manager.start(f.request);
    await paused(f.manager, 3); await f.manager.command(sessionId, 'stepOver'); await paused(f.manager, 4);
    await f.manager.command(sessionId, 'stepOver');
    const next = await paused(f.manager, 5);
    expect(next.rawEvents.some((event) => event.type === 'enter' && event.methodName === 'inner')).toBe(true);
    await f.manager.stop();
    ({ sessionId } = await f.manager.start(f.request));
    await paused(f.manager, 3); await f.manager.command(sessionId, 'stepOver'); await paused(f.manager, 4);
    await f.manager.command(sessionId, 'stepInto'); await paused(f.manager, 3, 'Helper');
    await f.manager.command(sessionId, 'stepOut'); await paused(f.manager, 5);
  } finally { await f.cleanup(); }
}, 15000);

test('removing a loop breakpoint prevents repeated hits; Pause stops the next real checkpoint', async () => {
  const f = await fixture({ 'Main.java': `public class Main {
  public static void main(String[] args) throws Exception {
    int i = 0;
    while (i < 100) {
      i++;
      Thread.sleep(20);
    }
    System.out.println(i);
  }
}` });
  try {
    const { sessionId } = await f.manager.start({ ...f.request, breakpoints: [{ fileId: 'Main.java', line: 5 }] });
    await paused(f.manager, 3); await f.manager.command(sessionId, 'continue');
    const first = await paused(f.manager, 5);
    await f.manager.setBreakpoints(sessionId, []); await f.manager.command(sessionId, 'continue');
    await new Promise((resolve) => setTimeout(resolve, 90));
    expect(f.manager.current().status).toBe('running');
    await f.manager.command(sessionId, 'pause');
    const pause = await until(f.manager, (session) => session?.status === 'paused');
    expect(pause.pause.reason).toBe('pause');
    expect(pause.rawEvents.length).toBeGreaterThan(first.rawEvents.length);
    const isolated = f.manager.snapshot(sessionId); isolated.rawEvents.length = 0;
    expect(f.manager.snapshot(sessionId).rawEvents.length).toBe(pause.rawEvents.length);
  } finally { await f.cleanup(); }
}, 15000);

test('implicit exception pauses before project frames unwind and retains real crash output', async () => {
  const f = await fixture({ 'Main.java': `public class Main {
  public static void main(String[] args) {
    String value = null;
    System.out.println(value.length());
  }
}` });
  try {
    const { sessionId } = await f.manager.start(f.request);
    await paused(f.manager, 3); await f.manager.command(sessionId, 'continue');
    const crash = await until(f.manager, (session) => session?.pause?.reason === 'exception');
    expect(crash.pause.line).toBe(4);
    expect(crash.rawEvents.at(-1).type).toBe('throw');
    expect(crash.rawEvents.some((event) => event.type === 'unwind')).toBe(false);
    expect(crash.rawEvents.find((event) => event.type === 'local' && event.name === 'value').value.kind).toBe('null');
    await f.manager.command(sessionId, 'continue');
    const final = await ended(f.manager);
    expect(final.terminalStatus).toBe('program_crashed');
    expect(final.stderr).toContain('NullPointerException');
    expect(final.rawEvents.some((event) => event.type === 'unwind')).toBe(true);
  } finally { await f.cleanup(); }
}, 15000);

test('paused time is excluded from deadline; Stop terminates native/blocked execution and cleans preparation', async () => {
  let prepared;
  const f = await fixture({ 'Main.java': `public class Main {
  public static void main(String[] args) throws Exception {
    Thread.sleep(10000);
  }
}` }, { prepare: async (request) => { prepared = await prepareInstrumented(request); return prepared; } });
  try {
    const { sessionId } = await f.manager.start({ ...f.request, timeoutMs: 1500 });
    await paused(f.manager, 3);
    await new Promise((resolve) => setTimeout(resolve, 1700));
    expect(f.manager.current().status).toBe('paused');
    await f.manager.command(sessionId, 'continue');
    await f.manager.command(sessionId, 'pause');
    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(f.manager.current().status).toBe('running'); // Cooperative Pause cannot interrupt sleep.
    const stopped = await f.manager.stop(sessionId);
    expect(stopped).toMatchObject({ status: 'stopped', terminalStatus: 'unsupported' });
    await expect(access(prepared.temp)).rejects.toThrow();
    await expect(f.manager.command(sessionId, 'continue')).rejects.toThrow();
  } finally { await f.cleanup(); }
}, 15000);

test('running deadline fails with an honest prefix', async () => {
  const f = await fixture({ 'Main.java': `public class Main {
  public static void main(String[] args) throws Exception {
    Thread.sleep(10000);
  }
}` });
  try {
    const { sessionId } = await f.manager.start({ ...f.request, timeoutMs: 500 });
    await paused(f.manager, 3); await f.manager.command(sessionId, 'continue');
    const limited = await ended(f.manager);
    expect(limited).toMatchObject({ status: 'failed', terminalStatus: 'limit_exceeded' });
    expect(limited.rawEvents.length).toBeGreaterThan(0);
  } finally { await f.cleanup(); }
}, 15000);

test('Recorder event cap terminates actual execution without a fabricated complete envelope', async () => {
  const f = await fixture({ 'Main.java': `public class Main {
  public static void main(String[] args) {
    int sum = 0;
    for (int i = 0; i < 100; i++) sum += i;
  }
}` });
  try {
    const { sessionId } = await f.manager.start({ ...f.request, rawEventLimit: 6 });
    await paused(f.manager, 3); await f.manager.command(sessionId, 'continue');
    const limited = await ended(f.manager);
    expect(limited).toMatchObject({ status: 'failed', terminalStatus: 'limit_exceeded', exitCode: 86 });
    expect(limited.rawEvents.length).toBeLessThanOrEqual(6);
    limited.rawEvents.forEach((event, index) => expect(event.seq).toBe(index));
  } finally { await f.cleanup(); }
}, 15000);

test('starting another debug session stops/reaps its predecessor and preserves its snapshot', async () => {
  const f = await fixture();
  try {
    const first = await f.manager.start(f.request); await paused(f.manager, 3);
    const second = await f.manager.start(f.request); await paused(f.manager, 3);
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(f.manager.snapshot(first.sessionId)).toMatchObject({ status: 'stopped', terminalStatus: 'unsupported' });
    expect(f.manager.current().sessionId).toBe(second.sessionId);
    await f.manager.command(second.sessionId, 'continue');
    expect((await ended(f.manager)).terminalStatus).toBe('complete');
  } finally { await f.cleanup(); }
}, 15000);

test('stdin is separate from debug commands and invalid controls do not resume execution', async () => {
  const f = await fixture({ 'Main.java': `public class Main {
  public static void main(String[] args) {
    String value = new java.util.Scanner(System.in).nextLine();
    System.out.println(value);
  }
}` });
  try {
    const { sessionId } = await f.manager.start(f.request);
    await paused(f.manager, 3);
    await expect(f.manager.command(sessionId, 'bogus')).rejects.toThrow('Unknown');
    await expect(f.manager.setBreakpoints(sessionId, [{ fileId: '../Main.java', line: 3 }])).rejects.toThrow('Invalid');
    await f.manager.input(sessionId, 'continue\n'); await f.manager.command(sessionId, 'continue');
    expect((await ended(f.manager)).stdout).toBe('continue\n');
  } finally { await f.cleanup(); }
}, 15000);

test('Stop reaps an actual inherited subprocess in the target JVM process group', async () => {
  if (process.platform === 'win32') return;
  const f = await fixture({ 'Main.java': `public class Main {
  public static void main(String[] args) throws Exception {
    Process child = new ProcessBuilder("sleep", "10").start();
    System.out.println(child.pid());
    Thread.sleep(10000);
  }
}` });
  let childPid;
  try {
    const { sessionId } = await f.manager.start(f.request);
    await paused(f.manager, 3); await f.manager.command(sessionId, 'continue');
    const running = await until(f.manager, (session) => /^\d+\n/.test(session?.stdout));
    childPid = Number(running.stdout.trim());
    expect(childPid).toBeGreaterThan(0);
    expect(() => process.kill(childPid, 0)).not.toThrow();
    await f.manager.stop(sessionId);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(() => process.kill(childPid, 0)).toThrow();
  } finally {
    if (childPid) { try { process.kill(childPid, 'SIGKILL'); } catch { /* Reaped by Stop. */ } }
    await f.cleanup();
  }
}, 15000);

test('unauthenticated first local client cannot claim control or change the real JVM pause', async () => {
  let rejected = false, token;
  const f = await fixture(undefined, { spawnProcess: (command, args, options) => {
    const port = Number(args.find((arg) => arg.startsWith('-Dvisualjava.debugPort=')).split('=')[1]);
    token = args.find((arg) => arg.startsWith('-Dvisualjava.debugToken=')).split('=')[1];
    const outsider = net.connect(port, '127.0.0.1', () => outsider.write('{"v":1,"type":"hello","token":"wrong"}\n'));
    outsider.on('error', () => {});
    outsider.on('close', () => { rejected = true; });
    return spawn(command, args, options);
  } });
  try {
    const { sessionId } = await f.manager.start(f.request);
    const entry = await paused(f.manager, 3);
    expect(rejected).toBe(true);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(entry)).not.toContain(token);
    expect(entry.pause.reason).toBe('entry');
    await f.manager.command(sessionId, 'continue');
    expect((await ended(f.manager)).terminalStatus).toBe('complete');
  } finally { await f.cleanup(); }
}, 15000);

test('multiple project execution threads report unsupported without counting frame-less console threads', async () => {
  const f = await fixture({ 'Main.java': `public class Main {
  public static void main(String[] args) throws Exception {
    Thread worker = new Thread(() -> work());
    worker.start();
    worker.join();
  }
  static void work() {
    System.out.println("worker");
  }
}` });
  try {
    const { sessionId } = await f.manager.start(f.request);
    await paused(f.manager, 3); await f.manager.command(sessionId, 'continue');
    const final = await ended(f.manager);
    expect(final).toMatchObject({ status: 'failed', terminalStatus: 'unsupported' });
    expect(final.diagnostic).toContain('Multiple project threads');
  } finally { await f.cleanup(); }
}, 15000);
