import { test, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExecutionManager } from './execution-manager.mjs';
import { DebugManager } from './debug-manager.mjs';

const project = { classesDir: '/tmp/classes', sourcePaths: ['Main.java'], runnableTargets: ['Main'] };
const buildResult = { success: true, project, jdk: { javaPath: '/jdk/java', javacPath: '/jdk/javac' },
  diagnostics: [], rawOutput: '', elapsedMs: 1, mainClasses: ['Main'] };
const manifest = { sources: [{ fileId: 'Main.java', content: 'class Main {}' }],
  classes: [{ className: 'Main', fileId: 'Main.java', status: 'resolved' }] };
const observed = { v: 1, seq: 0, threadId: '1', type: 'enter', frameId: 'f1', className: 'Main',
  methodName: 'main', descriptor: '([Ljava/lang/String;)V', line: 1, site: 0, callerFrameId: null, receiver: null, parameters: [] };

function harness(overrides = {}) {
  let debuggerListener;
  let runnerListener;
  let debugSnapshot;
  let runSnapshot;
  const debug = {
    start: vi.fn(async (request) => {
      debugSnapshot = { sessionId: 'debug-1', projectId: request.projectId, status: 'running', revision: 1,
        rawEvents: [], sourceManifest: request.sourceManifest, coverage: { coveredClasses: ['Main'], transformInfo: { localsWithoutDebug: 0 } },
        stdout: '', stderr: '', pause: null, breakpoints: [], terminalStatus: null, exitCode: null, diagnostic: null };
      return structuredClone(debugSnapshot);
    }),
    subscribe: vi.fn((id, listener) => { debuggerListener = listener; listener(structuredClone(debugSnapshot)); return () => {}; }),
    stop: vi.fn(async () => { if (debugSnapshot) {
      debugSnapshot = { ...debugSnapshot, status: 'stopped', terminalStatus: 'unsupported' };
      debuggerListener?.(structuredClone(debugSnapshot));
    } }),
    input: vi.fn(async () => ({ ok: true })),
    command: vi.fn(async () => ({})),
    setBreakpoints: vi.fn(async () => ({})),
  };
  const runs = {
    start: vi.fn(async () => {
      runSnapshot = { runId: 'plain-1', status: 'running', events: [], exitCode: null, exception: null };
      return structuredClone(runSnapshot);
    }),
    subscribe: vi.fn((id, listener) => { runnerListener = listener; return () => {}; }),
    snapshot: vi.fn(() => structuredClone(runSnapshot)),
    stop: vi.fn(async () => { if (runSnapshot) {
      runSnapshot = { ...runSnapshot, status: 'exited', exitCode: null };
      runnerListener?.({ id: 1, kind: 'exit' });
    } }),
    input: vi.fn(async () => ({ ok: true })),
  };
  const deps = { build: vi.fn(async () => buildResult),
    resolveLaunch: vi.fn(async () => ({ mainClass: 'Main', workingDirectory: '/tmp', classpath: ['/tmp/classes'], programArgs: [], jvmArgs: [] })),
    buildManifest: vi.fn(async () => manifest), getProjectRoot: vi.fn(async () => '/tmp'),
    publicBuild: vi.fn(({ project: internal, ...dto }) => dto), runs, debuggerSessions: debug, ...overrides };
  const manager = new ExecutionManager(deps);
  const emitDebug = (patch) => { debugSnapshot = { ...debugSnapshot, ...patch }; debuggerListener?.(structuredClone(debugSnapshot)); };
  const emitRun = (patch) => { runSnapshot = { ...runSnapshot, ...patch }; runnerListener?.(runSnapshot.events.at(-1)); };
  return { manager, deps, debug, runs, emitDebug, emitRun };
}

async function until(manager, predicate) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const value = manager.current();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Execution did not settle: ${JSON.stringify(manager.current())}`);
}

test('Run returns BUILDING immediately, streams one recorder prefix and completes without a second JVM', async () => {
  const h = harness();
  const initial = h.manager.start({ projectId: 'p1', kind: 'run' });
  expect(initial).toMatchObject({ phase: 'BUILDING', kind: 'run', rawEvents: [] });
  const live = await until(h.manager, (session) => session.phase === 'RUNNING');
  expect(h.debug.start).toHaveBeenCalledOnce();
  expect(h.deps.buildManifest).toHaveBeenCalledWith('/tmp', '/tmp/classes', ['Main.java'], buildResult);
  expect(h.debug.start.mock.calls[0][0].control).toBe(false);
  expect(h.runs.start).not.toHaveBeenCalled();
  h.emitDebug({ rawEvents: [observed, { ...observed, seq: 1, type: 'line' }], stdout: 'Hello\n' });
  expect(h.manager.current()).toMatchObject({ phase: 'RUNNING', support: 'PARTIAL', stdout: 'Hello\n' });
  h.emitDebug({ status: 'exited', terminalStatus: 'complete', exitCode: 0 });
  expect(h.manager.snapshot(initial.id)).toMatchObject({ phase: 'COMPLETED', support: 'FULL', rawEvents: [{ seq: 0 }, { seq: 1 }], exitCode: 0 });
  expect(h.manager.snapshot(initial.id).id).toBe(live.id);
  expect(h.runs.start).not.toHaveBeenCalled();
});

test('partial coverage stays PARTIAL and burst updates preserve all facts with bounded public publishes', async () => {
  const h = harness();
  const initial = h.manager.start({ projectId: 'p1' });
  await until(h.manager, (session) => session.phase === 'RUNNING');
  const published = [];
  const unsubscribe = h.manager.subscribe(initial.id, (snapshot) => published.push(snapshot), { transport: 'legacy' });
  const prefix = [observed];
  for (let i = 1; i <= 30; i++) {
    prefix.push({ ...observed, seq: i, type: 'line' });
    h.emitDebug({ rawEvents: [...prefix], coverage: { coveredClasses: [], transformInfo: { localsWithoutDebug: 1 } } });
  }
  expect(h.manager.current()).toMatchObject({ support: 'PARTIAL' });
  expect(h.manager.current().rawEvents).toHaveLength(31);
  expect(published.length).toBeLessThanOrEqual(3);
  await new Promise((resolve) => setTimeout(resolve, 120));
  expect(published.at(-1).rawEvents).toHaveLength(31);
  unsubscribe();
});

test('preparation failure alone falls back to one plain run with truthful RUN_ONLY status', async () => {
  const h = harness();
  h.debug.start.mockRejectedValueOnce(Object.assign(new Error('ASM unavailable'), { preparationFailed: true }));
  h.manager.start({ projectId: 'p1' });
  await until(h.manager, (session) => session.phase === 'RUNNING');
  expect(h.runs.start).toHaveBeenCalledOnce();
  expect(h.manager.current()).toMatchObject({ support: 'RUN_ONLY', supportReason: 'Instrumentation preparation failed: ASM unavailable' });
  h.emitRun({ status: 'exited', exitCode: 0, events: [{ id: 1, kind: 'stdout', text: 'Hello\n' }, { id: 2, kind: 'exit', exitCode: 0 }] });
  expect(h.manager.current()).toMatchObject({ phase: 'COMPLETED', stdout: 'Hello\n' });
});

test('advanced Run without visualization launches only the plain runner', async () => {
  const h = harness();
  h.manager.start({ projectId: 'p1', withoutVisualization: true });
  await until(h.manager, (session) => session.phase === 'RUNNING');
  expect(h.manager.current()).toMatchObject({ support: 'RUN_ONLY', supportReason: 'Visualization was disabled for this run' });
  expect(h.debug.start).not.toHaveBeenCalled();
  expect(h.runs.start).toHaveBeenCalledOnce();
});

test('capture failure after a child starts never reruns the program', async () => {
  const h = harness();
  h.debug.start.mockRejectedValueOnce(Object.assign(new Error('spawned capture failed'), { executionStarted: true }));
  h.manager.start({ projectId: 'p1' });
  await until(h.manager, (session) => session.phase === 'FAILED');
  expect(h.runs.start).not.toHaveBeenCalled();
  expect(h.manager.current()).toMatchObject({ failureKind: 'launch', diagnostic: 'spawned capture failed' });
});

test('successful JVM exit with failed capture completes Run with truthful console-only output', async () => {
  const h = harness();
  h.manager.start({ projectId: 'p1' });
  await until(h.manager, (session) => session.phase === 'RUNNING');
  h.emitDebug({ status: 'failed', terminalStatus: 'instrumentation_failed', exitCode: 0,
    diagnostic: 'No verified instrumented execution prefix', stdout: 'Real output\n', rawEvents: [] });
  expect(h.manager.current()).toMatchObject({ phase: 'COMPLETED', support: 'RUN_ONLY',
    supportReason: 'No verified instrumented execution prefix', stdout: 'Real output\n', failureKind: null });
  expect(h.runs.start).not.toHaveBeenCalled();
});

test('build failure creates Problems state without starting a JVM or world', async () => {
  const h = harness({ build: vi.fn(async () => ({ ...buildResult, success: false, mainClasses: [], diagnostics: [{ message: 'error' }] })) });
  h.manager.start({ projectId: 'p1' });
  await until(h.manager, (session) => session.phase === 'FAILED');
  expect(h.manager.current()).toMatchObject({ failureKind: 'build', rawEvents: [], sourceManifest: { classes: [] } });
  expect(h.debug.start).not.toHaveBeenCalled();
  expect(h.runs.start).not.toHaveBeenCalled();
});

test('Debug uses the same session snapshots; input, breakpoint and command target its sole JVM', async () => {
  const h = harness();
  const initial = h.manager.start({ projectId: 'p1', kind: 'debug', breakpoints: [{ fileId: 'Main.java', line: 1 }] });
  await until(h.manager, (session) => session.phase === 'RUNNING');
  expect(h.debug.start.mock.calls[0][0]).toMatchObject({ control: true, breakpoints: [{ line: 1 }] });
  h.emitDebug({ status: 'paused', pause: { reason: 'breakpoint', line: 1, rawEventCount: 1 }, rawEvents: [observed] });
  expect(h.manager.current()).toMatchObject({ phase: 'PAUSED', pause: { line: 1 } });
  await h.manager.input(initial.id, '18\n');
  await h.manager.command(initial.id, 'stepOver');
  await h.manager.setBreakpoints(initial.id, []);
  expect(h.debug.input).toHaveBeenCalledWith('debug-1', '18\n');
  expect(h.debug.command).toHaveBeenCalledWith('debug-1', 'stepOver', { transport: 'delta' });
  expect(h.debug.setBreakpoints).toHaveBeenCalledWith('debug-1', [], { transport: 'delta' });
});

test('Stop during build prevents launch; Stop after start stops the existing child', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const h = harness({ build: vi.fn(async () => { await gate; return buildResult; }) });
  const early = h.manager.start({ projectId: 'p1' });
  await h.manager.stop(early.id);
  release();
  await h.manager.startQueue;
  expect(h.manager.snapshot(early.id).phase).toBe('STOPPED');
  expect(h.debug.start).not.toHaveBeenCalled();
  const live = h.manager.start({ projectId: 'p1' });
  await until(h.manager, (session) => session.phase === 'RUNNING');
  await h.manager.stop(live.id);
  expect(h.debug.stop).toHaveBeenCalledWith('debug-1', { transport: 'delta' });
  expect(h.manager.snapshot(live.id).phase).toBe('STOPPED');
});

test('recorder Run mode uses one fake child, streams its trace and output, and never opens debug control', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'visual-java-execution-fake-'));
  const trace = join(directory, 'trace.ndjson');
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
  child.kill = vi.fn();
  const spawnProcess = vi.fn(() => child);
  const prepare = vi.fn(async () => ({ args: ['-cp', '/tmp/classes', 'Main'], trace, coveredClasses: ['Main'],
    transformInfo: { localsWithoutDebug: 0 }, executableLines: {}, rawByteLimit: 4096,
    rawEventLimit: 20, timeoutMs: 2000, cleanup: vi.fn(async () => {}) }));
  const manager = new DebugManager({ prepare, spawnProcess });
  try {
    const started = await manager.start({ projectId: 'p1', projectRoot: '/tmp', classesDir: '/tmp/classes',
      classpath: ['/tmp/classes'], workingDirectory: '/tmp', mainClass: 'Main', javaPath: '/jdk/java',
      sourceManifest: manifest, build: { success: true }, control: false });
    expect(started.status).toBe('running');
    expect(spawnProcess).toHaveBeenCalledOnce();
    expect(spawnProcess.mock.calls[0][1]).toEqual(['-cp', '/tmp/classes', 'Main']);
    await expect(manager.command(started.sessionId, 'continue')).rejects.toThrow('does not have debugger control');
    await writeFile(trace, `${JSON.stringify(observed)}\n`);
    child.stdout.write('Hello\n');
    for (let attempt = 0; attempt < 50 && !manager.current().rawEvents.length; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(manager.current()).toMatchObject({ status: 'running', stdout: 'Hello\n', rawEvents: [{ seq: 0 }] });
    const submitted = new Promise((resolve) => child.stdin.once('data', (bytes) => resolve(bytes.toString())));
    await manager.input(started.sessionId, '18\n');
    expect(await submitted).toBe('18\n');
    child.stdout.end(); child.stderr.end(); child.emit('close', 0);
    for (let attempt = 0; attempt < 50 && manager.current().status !== 'exited'; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(manager.current()).toMatchObject({ status: 'exited', terminalStatus: 'complete', exitCode: 0 });
    expect(spawnProcess).toHaveBeenCalledOnce();
  } finally { await manager.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test.each(['objects', 'events', 'bytes', 'live frames', null])('stopped recording (%s) preserves real completion, console, prefix and one execution', async (budget) => {
  const h = harness();
  h.manager.start({ projectId: 'p1' });
  await until(h.manager, (session) => session.phase === 'RUNNING');
  const prefix = [observed, { ...observed, seq: 1, type: 'line' }];
  const recording = { state: budget ? 'STOPPED_LIMIT' : 'STOPPED_UNSUPPORTED',
    reason: budget ? `Recording limit reached: ${budget}` : 'Multiple application threads detected',
    budget, lastRecordedSeq: 1, executionContinued: true };
  h.emitDebug({ rawEvents: prefix, recording, waitingForInput: true });
  expect(h.manager.current()).toMatchObject({ phase: 'WAITING_FOR_INPUT', support: 'PARTIAL', recording });
  await h.manager.input(h.manager.current().id, 'late input\n');
  expect(h.debug.input).toHaveBeenCalledOnce();
  h.emitDebug({ status: 'exited', terminalStatus: 'complete', exitCode: 0, stdout: 'DONE\n', stderr: 'real stderr\n', waitingForInput: false });
  expect(h.manager.current()).toMatchObject({ phase: 'COMPLETED', support: 'PARTIAL', exitCode: 0,
    terminalStatus: 'complete', failureKind: null, stdout: 'DONE\n', stderr: 'real stderr\n', recording, rawEvents: prefix });
  expect(h.manager.current().supportReason).toContain(recording.reason);
  expect(h.debug.start).toHaveBeenCalledOnce();
  expect(h.runs.start).not.toHaveBeenCalled();
});

test('a real nonzero exit after recording stops remains a runtime failure', async () => {
  const h = harness();
  h.manager.start({ projectId: 'p1' });
  await until(h.manager, (session) => session.phase === 'RUNNING');
  h.emitDebug({ rawEvents: [observed], recording: { state: 'STOPPED_LIMIT', reason: 'Recording limit reached: events',
    budget: 'events', lastRecordedSeq: 0, executionContinued: true }, status: 'exited', terminalStatus: 'program_crashed', exitCode: 7 });
  expect(h.manager.current()).toMatchObject({ phase: 'FAILED', exitCode: 7, failureKind: 'runtime', support: 'PARTIAL' });
  expect(h.runs.start).not.toHaveBeenCalled();
});
