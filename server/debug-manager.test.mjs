import { test, expect, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
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
    cleanup: async () => { await manager.dispose(); await rm(projectRoot, { recursive: true, force: true }); } };
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
    // The immediate caller returns on this same line. Step Out must retain
    // that frame instead of skipping it on the way to Main's next line.
    const inlineCaller = await paused(f.manager, 4, 'Helper');
    expect(inlineCaller.pause.frameId).toBe(work.pause.frameId);
    expect(inlineCaller.rawEvents.filter((event) => event.type === 'return').map((event) => event.value.value)).toEqual([5, 5]);
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

test('step Out retains an inline void caller before exit without inventing a return value', async () => {
  const f = await fixture({ 'Main.java': `public class Main {
  public static void main(String[] args) {
    outer();
    System.out.println("DONE");
  }
  static void outer() { inner(); }
  static void inner() { System.out.println("INNER"); }
}` });
  try {
    const { sessionId } = await f.manager.start(f.request);
    const entry = await paused(f.manager, 3);
    await f.manager.command(sessionId, 'stepInto');
    const outer = await paused(f.manager, 6);
    expect(outer.pause.methodName).toBe('outer');
    await f.manager.command(sessionId, 'stepInto');
    expect((await paused(f.manager, 7)).pause.methodName).toBe('inner');
    await f.manager.command(sessionId, 'stepOut');
    const retained = await paused(f.manager, 6);
    expect(retained.pause.frameId).toBe(outer.pause.frameId);
    expect(retained.rawEvents.filter(event => event.type === 'return')).toEqual([]);
    await f.manager.command(sessionId, 'stepOut');
    expect((await paused(f.manager, 4)).pause.frameId).toBe(entry.pause.frameId);
    await f.manager.command(sessionId, 'continue');
    expect(await ended(f.manager)).toMatchObject({ stdout: 'INNER\nDONE\n', terminalStatus: 'complete', exitCode: 0 });
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

test('Recorder event cap stops observation while actual execution completes', async () => {
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
    expect(limited).toMatchObject({ status: 'exited', terminalStatus: 'complete', exitCode: 0,
      recording: { state: 'STOPPED_LIMIT', budget: 'events', lastRecordedSeq: 5, executionContinued: true } });
    expect(limited.rawEvents).toHaveLength(7);
    expect(limited.rawEvents.at(-1).type).toBe('capture_saturated');
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
    expect(final).toMatchObject({ status: 'exited', terminalStatus: 'complete', exitCode: 0, stdout: 'worker\n',
      recording: { state: 'STOPPED_UNSUPPORTED', budget: null, executionContinued: true } });
    expect(final.recording.reason).toMatch(/thread/i);
  } finally { await f.cleanup(); }
}, 15000);


const mockRaw = (seq, type = 'line', extra = {}) => ({ v: 1, seq, type, threadId: '1', frameId: 'f1',
  className: 'Main', methodName: 'main', descriptor: '([Ljava/lang/String;)V', line: 3, site: 1, ...extra });
const mockStopped = (lastRecordedSeq = 0) => ({ state: 'STOPPED_LIMIT', budget: 'events', reason: 'Recording event limit reached', lastRecordedSeq, executionContinued: true });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function mockSession({ controlled = false, timeoutMs = 2000, hardTimeoutMs = 600000, rawEventLimit = 1, prepareDelay = 0 } = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'vj-mock-debug-'));
  const trace = join(temp, 'raw.ndjson');
  let child, socket, finished = false;
  const cleanupPrepared = vi.fn(async () => {});
  const spawnProcess = vi.fn((_command, args) => {
    finished = false;
    child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = vi.fn(() => { if (!finished) finish(null); return true; });
    if (controlled) {
      const port = Number(args.find((arg) => arg.startsWith('-Dvisualjava.debugPort=')).split('=')[1]);
      const token = args.find((arg) => arg.startsWith('-Dvisualjava.debugToken=')).split('=')[1];
      socket = net.connect(port, '127.0.0.1', () => socket.write(JSON.stringify({ v: 1, type: 'hello', token }) + '\n'));
      socket.setEncoding('utf8'); let tail = '';
      socket.on('error', () => {});
      socket.on('data', (chunk) => {
        tail += chunk; let end;
        while ((end = tail.indexOf('\n')) >= 0) {
          const [command, requestId] = tail.slice(0, end).split('\t'); tail = tail.slice(end + 1);
          socket.write(JSON.stringify({ v: 1, type: 'ack', command, requestId }) + '\n');
          if (command === 'start') socket.write(JSON.stringify({ v: 1, type: 'paused', reason: 'entry', threadId: '1',
            frameId: 'f1', className: 'Main', methodName: 'main', line: 3, rawEventCount: 2 }) + '\n');
        }
      });
    }
    return child;
  });
  function finish(code = 0) {
    if (finished) return; finished = true;
    child.stdout.end(); child.stderr.end(); socket?.destroy();
    child.emit('exit', code); child.emit('close', code);
  }
  const manager = new DebugManager({ spawnProcess, prepare: async () => {
    await delay(prepareDelay);
    return { trace, args: ['-cp', temp, 'Main'], coveredClasses: ['Main'], transformInfo: {}, executableLines: { Main: [3] },
      rawEventLimit, rawByteLimit: 4096, timeoutMs, hardTimeoutMs, cleanup: cleanupPrepared };
  } });
  const recording = mockStopped();
  await writeFile(trace, [mockRaw(0), mockRaw(1, 'capture_saturated', { recording })].map(JSON.stringify).join('\n') + '\n');
  const status = async (waitingForInput) => writeFile(trace + '.status.json', JSON.stringify({ v: 1, recording, waitingForInput }));
  await status(false);
  const request = { projectId: 'mock', projectRoot: temp, classesDir: temp, mainClass: 'Main', javaPath: 'mock-java', control: controlled,
    build: { success: true }, sourceManifest: { sources: [{ fileId: 'Main.java', content: 'a\nb\nc' }], classes: [{ className: 'Main', fileId: 'Main.java', status: 'resolved' }] } };
  const start = await manager.start(request);
  return { manager, sessionId: start.sessionId, status, trace, finish, child, spawnProcess, cleanupPrepared,
    cleanup: async () => { await manager.dispose(); socket?.destroy(); await rm(temp, { recursive: true, force: true }); } };
}

test('mocked Phase 1: saturation then late stdin excludes wait from active deadline and preserves one process', async () => {
  const f = await mockSession({ timeoutMs: 150, prepareDelay: 180 });
  try {
    await f.status(true);
    await until(f.manager, (s) => s.waitingForInput && s.recording.state === 'STOPPED_LIMIT');
    await delay(250);
    expect(f.manager.current().status).toBe('running');
    let received = ''; f.child.stdin.on('data', (data) => { received += data.toString(); });
    await f.manager.input(f.sessionId, 'A\n'); await f.status(false);
    f.child.stdout.write('GOT 65\n'); f.finish(0);
    const final = await ended(f.manager);
    expect(final).toMatchObject({ status: 'exited', terminalStatus: 'complete', exitCode: 0, stdout: 'GOT 65\n', waitingForInput: false });
    expect(final.rawEvents).toHaveLength(2); expect(received).toBe('A\n');
    expect(f.spawnProcess).toHaveBeenCalledTimes(1); expect(f.cleanupPrepared).toHaveBeenCalledTimes(1);
  } finally { await f.cleanup(); }
});

test('mocked Phase 1: long debugger pause after saturation retains frozen watermark and remains controllable', async () => {
  const f = await mockSession({ controlled: true, timeoutMs: 150 });
  try {
    const entry = await paused(f.manager, 3); expect(entry.pause.rawEventCount).toBe(2);
    await delay(250); expect(f.manager.current().status).toBe('paused');
    await f.manager.command(f.sessionId, 'continue');
    f.child.stdout.write('DONE\n'); f.finish(0);
    expect(await ended(f.manager)).toMatchObject({ terminalStatus: 'complete', stdout: 'DONE\n', recording: { state: 'STOPPED_LIMIT' } });
  } finally { await f.cleanup(); }
});

test('mocked Phase 1: explicit Stop after saturation reaps child; subsequent Run has clean state', async () => {
  const first = await mockSession();
  try {
    await until(first.manager, (s) => s.recording.state === 'STOPPED_LIMIT');
    expect(await first.manager.stop(first.sessionId)).toMatchObject({ status: 'stopped' });
    expect(first.child.kill).toHaveBeenCalled(); expect(first.cleanupPrepared).toHaveBeenCalledTimes(1);
    const next = await first.manager.start({ projectId: 'mock', projectRoot: '/tmp', classesDir: '/tmp', mainClass: 'Main', javaPath: 'mock-java', control: false,
      build: { success: true }, sourceManifest: { sources: [], classes: [] } });
    expect(next.sessionId).not.toBe(first.sessionId); expect(next.stdout).toBe(''); expect(next.recording.state).toBe('FULL');
    expect(first.manager.snapshot(first.sessionId).status).toBe('stopped');
  } finally { await first.cleanup(); }
});

test('mocked Phase 1: hard safety deadline applies during input wait', async () => {
  const f = await mockSession({ timeoutMs: 1000, hardTimeoutMs: 160 });
  try {
    await f.status(true);
    const result = await until(f.manager, (s) => s.status === 'failed');
    expect(result.terminalStatus).toBe('limit_exceeded'); expect(result.diagnostic).toContain('Hard process safety');
  } finally { await f.cleanup(); }
});

test('mocked Phase 1: complete archive survives inline output cap and actual crash; disposal removes files', async () => {
  const f = await mockSession(); let archiveDirectory;
  try {
    const first = Buffer.alloc(10 * 1024 * 1024, 120), second = Buffer.alloc(23 * 1024 * 1024, 121);
    f.child.stdout.write(first);
    expect(f.manager.current().stdout.length).toBe(first.length); expect(f.manager.current().outputTruncated).toBe(false);
    f.child.stdout.write(second); f.child.stdout.write('DONE\n'); f.child.stderr.write('REAL STDERR\n');
    expect(f.manager.current().stdout.length).toBe(32 * 1024 * 1024); expect(f.manager.current().outputTruncated).toBe(true);
    expect(f.child.kill).not.toHaveBeenCalled(); f.finish(7);
    const final = await ended(f.manager);
    expect(final).toMatchObject({ status: 'exited', terminalStatus: 'program_crashed', exitCode: 7, recording: { state: 'STOPPED_LIMIT' }, outputArchiveAvailable: true });
    const archive = f.manager.sessions.get(f.sessionId).archive; archiveDirectory = archive.directory;
    expect([...archive.files.values()].every((file) => file.fd === null)).toBe(true);
    const expectedHash = createHash('sha256').update(first).update(second).update('DONE\n').digest('hex');
    const actualHash = createHash('sha256'); let downloadedBytes = 0;
    for await (const chunk of f.manager.output(f.sessionId, 'stdout')) { downloadedBytes += chunk.length; actualHash.update(chunk); }
    expect(downloadedBytes).toBe(33 * 1024 * 1024 + 5); expect(actualHash.digest('hex')).toBe(expectedHash);
    let stderr = ''; for await (const chunk of f.manager.output(f.sessionId, 'stderr')) stderr += chunk.toString();
    expect(stderr).toBe('REAL STDERR\n');
  } finally { await f.cleanup(); }
  await expect(access(archiveDirectory)).rejects.toThrow();
});

test('mocked Phase 1: fatal verifier launch error is explicit and keeps actual exit without rerun', async () => {
  const f = await mockSession();
  try {
    f.child.stderr.write('java.lang.VerifyError: bad instrumented bytecode\n'); f.finish(1);
    expect(await until(f.manager, (r) => r.status === 'failed')).toMatchObject({ terminalStatus: 'instrumentation_failed', exitCode: 1 });
    expect(f.spawnProcess).toHaveBeenCalledTimes(1);
  } finally { await f.cleanup(); }
});


test.each(['missing', 'corrupt', 'stale FULL'])('mocked Phase 1: %s sidecar after saturation leaves input unknown and active watchdog suspended', async (kind) => {
  const f = await mockSession({ timeoutMs: 150 });
  try {
    await f.status(true); await until(f.manager, (r) => r.waitingForInput);
    if (kind === 'missing') await rm(f.trace + '.status.json');
    else if (kind === 'corrupt') await writeFile(f.trace + '.status.json', '{bad json');
    else await writeFile(f.trace + '.status.json', JSON.stringify({ v: 1, waitingForInput: false,
      recording: { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false } }));
    await until(f.manager, (r) => !r.waitingForInput);
    expect(f.manager.sessions.get(f.sessionId).reader.inputStatusKnown).toBe(false);
    await delay(250); expect(f.child.kill).not.toHaveBeenCalled(); expect(f.manager.current().status).toBe('running');
    await f.manager.input(f.sessionId, 'A\n'); f.child.stdout.write('DONE\n'); f.finish(0);
    expect(await ended(f.manager)).toMatchObject({ terminalStatus: 'complete', exitCode: 0, stdout: 'DONE\n' });
  } finally { await f.cleanup(); }
});

test('mocked Phase 1: unknown input status still has an explicit hard safety deadline', async () => {
  const f = await mockSession({ timeoutMs: 50, hardTimeoutMs: 180 });
  try {
    await writeFile(f.trace + '.status.json', '{bad json');
    const result = await until(f.manager, (r) => r.status === 'failed');
    expect(result.diagnostic).toContain('Hard process safety'); expect(result.terminalStatus).toBe('limit_exceeded');
  } finally { await f.cleanup(); }
});

// Real JVM pause records are flushed before the control message. A periodic
// reader refresh may nevertheless have started before that flush and still be
// pending when the message arrives. Hold that earlier read deterministically.
test('a pause refreshes again after joining a pre-flush polling read, preserving the exact JVM watermark', async () => {
  const f = await fixture();
  let release;
  try {
    const { sessionId } = await f.manager.start(f.request);
    await paused(f.manager, 3);
    const run = f.manager.sessions.get(sessionId), original = run.reader.refresh.bind(run.reader);
    let started;
    const reading = new Promise(resolve => { started = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    let hold = true;
    run.reader.refresh = async final => {
      await original(final);
      if (hold) { hold = false; started(); await held; }
    };
    await reading;
    let received;
    const incoming = new Promise(resolve => { received = resolve; });
    let tail = '';
    run.socket.on('data', chunk => {
      tail += chunk;
      let end;
      while ((end = tail.indexOf('\n')) >= 0) {
        const message = JSON.parse(tail.slice(0, end)); tail = tail.slice(end + 1);
        if (message.type === 'paused') received(message);
      }
    });
    await f.manager.command(sessionId, 'stepOver');
    const watermark = await incoming;
    expect(watermark.line).toBe(4);
    release();
    const hit = await paused(f.manager, 4);
    expect(hit.recording.state).toBe('FULL');
    expect(hit.rawEvents).toHaveLength(watermark.rawEventCount);
    expect(hit.rawEventCount).toBe(watermark.rawEventCount);
    expect(hit.rawEvents.at(-1)).toMatchObject({ type: 'line', line: 4, frameId: watermark.frameId });
    await f.manager.command(sessionId, 'stepOver');
    const next = await paused(f.manager, 5);
    expect(next.recording.state).toBe('FULL');
    expect(next.rawEventCount).toBe(next.pause.rawEventCount);
  } finally { release?.(); await f.cleanup(); }
}, 15000);

test('a genuinely inconsistent pause watermark still stops observation and retains only accepted events', async () => {
  const f = await fixture();
  try {
    const { sessionId } = await f.manager.start(f.request), entry = await paused(f.manager, 3);
    const run = f.manager.sessions.get(sessionId), count = entry.rawEventCount;
    // Inject a malformed control boundary; no recorder event is fabricated.
    run.socket.emit('data', JSON.stringify({v:1,type:'paused',...entry.pause,rawEventCount:count+1})+'\n');
    const rejected = await until(f.manager, session => session?.recording.state !== 'FULL');
    expect(rejected.recording.reason).toContain('Pause watermark does not match flushed Recorder prefix');
    expect(rejected.pause.rawEventCount).toBe(count+1);
    expect(rejected.rawEvents.filter(event=>event.type!=='capture_saturated')).toEqual(entry.rawEvents);
    expect(rejected.rawEvents.every((event,index)=>event.seq===index)).toBe(true);
  } finally { await f.cleanup(); }
}, 15000);
