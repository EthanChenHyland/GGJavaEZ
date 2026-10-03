import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { runInstrumented, CaptureReader, prepareInstrumented } from './instrumentation-provider.mjs';

const javaPath = process.env.JAVA_PATH || 'java';
const javacPath = process.env.JAVAC_PATH || 'javac';
async function fixture(files, mainClass = 'Main') {
  const projectRoot = await mkdtemp(join(tmpdir(), 'visual-java-fixture-'));
  const classesDir = join(projectRoot, 'classes'); await mkdir(classesDir);
  const sourcePaths = [];
  for (const [name, source] of Object.entries(files)) {
    const path = join(projectRoot, name); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, source); sourcePaths.push(path);
  }
  execFileSync(javacPath, ['-g:lines,vars,source', '-d', classesDir, ...sourcePaths]);
  return { request: { projectId: 'fixture', projectRoot, classesDir, mainClass, javaPath, javacPath, sourcePaths,
    rawEventLimit: 20000, rawByteLimit: 8 * 1024 * 1024, timeoutMs: 30000 }, cleanup: () => rm(projectRoot, { recursive: true, force: true }) };
}
function types(result, type) { return result.rawEvents.filter((event) => event.type === type); }
function assertPrefix(result) {
  result.rawEvents.forEach((event, index) => assert.equal(event.seq, index));
  assert.ok(result.rawEvents.every((event) => event.v === 1 && typeof event.threadId === 'string'));
}

test('Person: stable identity, constructor and successful field/local observations', async () => {
  const f = await fixture({ 'Main.java': `public class Main {
    public static void main(String[] args) { Person a=new Person(); Person b=new Person(); a.setAge(18); b.setAge(7); System.out.println(a.age+b.age); }
  }`, 'Person.java': `public class Person { int age; Person() {} void setAge(int age) { this.age=age; } }` });
  try {
    const r = await runInstrumented(f.request); assert.equal(r.status, 'complete', r.diagnostic); assert.equal(r.stdout, '25\n'); assertPrefix(r);
    const objects = types(r, 'object').filter((e) => e.className === 'Person'); assert.equal(objects.length, 2);
    assert.notEqual(objects[0].objectId, objects[1].objectId);
    assert.deepEqual(types(r, 'field').map((e) => e.value.value), [18, 7]);
    assert.ok(types(r, 'local').some((e) => e.name === 'a' && e.value.objectId === objects[0].objectId));
    const constructor = types(r, 'enter').find((e) => e.methodName === '<init>' && e.className === 'Person');
    assert.equal(constructor.receiver, null);
    assert.ok(types(r, 'receiver_ready').some((e) => e.frameId === constructor.frameId && e.receiver.objectId === objects[0].objectId));
    assert.ok(types(r, 'line').some((e) => e.className === 'Person'));
    assert.equal(r.capability.coveredClasses.length, 2);
    assert.equal(r.capability.features.console.status, 'partial');
    assert.ok(r.capability.features.console.observedEvents > 0);
    assert.match(r.capability.features.console.reason, /replaced streams/);
  } finally { await f.cleanup(); }
});

test('recursive calls get fresh invocation IDs and exact return operands', async () => {
  const f = await fixture({ 'Main.java': `public class Main {
    static int factorial(int n) { if (n<=1) return 1; return n*factorial(n-1); }
    public static void main(String[] args) { System.out.println(factorial(4)); }
  }` });
  try {
    const r=await runInstrumented(f.request); assert.equal(r.status, 'complete', r.diagnostic); assert.equal(r.stdout, '24\n'); assertPrefix(r);
    const calls=types(r,'enter').filter((e)=>e.methodName==='factorial'); assert.equal(calls.length,4);
    assert.equal(new Set(calls.map((e)=>e.frameId)).size,4);
    assert.deepEqual(types(r,'return').map((e)=>e.value.value),[1,2,6,24]);
    assert.ok(types(r,'branch').every((e)=>typeof e.taken==='boolean'));
  } finally { await f.cleanup(); }
});

test('int array reads/writes, branch and catch are observed in JVM order', async () => {
  const f=await fixture({ 'Main.java': `public class Main {
    public static void main(String[] args) {
      int[] a={3,1}; int x=a[0]; if (x>a[1]) { a[0]=a[1]; a[1]=x; }
      try { throw new IllegalArgumentException("boom"); } catch (IllegalArgumentException e) { System.out.println(a[0]+a[1]); }
    }
  }` });
  try {
    const r=await runInstrumented(f.request); assert.equal(r.status,'complete',r.diagnostic); assert.equal(r.stdout,'4\n');assertPrefix(r);
    const array=types(r,'array')[0];assert.deepEqual(array.elements,[0,0]);
    assert.deepEqual(types(r,'array_write').map((e)=>[e.index,e.value]),[[0,3],[1,1],[0,1],[1,3]]);
    assert.ok(types(r,'array_read').length>=3); assert.ok(types(r,'branch').length>0);assert.ok(types(r,'branch').every((e)=>typeof e.taken==='boolean'));
    assert.equal(types(r,'throw').filter((e)=>e.explicit).length,1);assert.equal(types(r,'catch').length,1);
  } finally { await f.cleanup(); }
});

test('crash retains honest exceptional prefix without a success marker', async () => {
  const f=await fixture({ 'Main.java': `public class Main { static void crash() { throw new RuntimeException("broken"); }
    public static void main(String[] args) { crash(); } }` });
  try {
    const r=await runInstrumented(f.request);assert.equal(r.status,'program_crashed',r.diagnostic);assertPrefix(r);
    assert.equal(types(r,'unwind').length,2);assert.ok(types(r,'throw').some((e)=>e.explicit));
    assert.notEqual(r.capability.features.methods.status, 'unsupported');
    assert.match(r.capability.features.exceptions.reason, /before catch\/finally\/unwind/);
  } finally { await f.cleanup(); }
});

test('event cap preserves actual completion; preparation failure remains explicit', async () => {
  const f=await fixture({ 'Main.java': `public class Main { public static void main(String[] args) { for(int i=0;i<100;i++) {} } }` });
  try {
    const capped=await runInstrumented({ ...f.request, rawEventLimit: 5 }); assert.equal(capped.status,'complete'); assert.equal(capped.exitCode,0); assert.equal(capped.recording.state,'STOPPED_LIMIT');
    assert.equal(capped.recording.budget,'events'); assertPrefix(capped); assert.equal(capped.rawEvents.length,6);
    assert.equal(capped.rawEvents.at(-1).type,'capture_saturated');
    const failed=await runInstrumented({ ...f.request, classesDir: join(f.request.projectRoot,'missing') });
    assert.equal(failed.status,'instrumentation_failed');assert.ok(failed.diagnostic);
  } finally { await f.cleanup(); }
});

test('bubble sort preserves array writes and loop increment locals', async () => {
  const f=await fixture({ 'Main.java': `public class Main {
    public static void main(String[] args) {
      int[] numbers={3,8,1,6,2};
      for(int i=0;i<numbers.length-1;i++) for(int j=0;j<numbers.length-1-i;j++) {
        if(numbers[j]>numbers[j+1]) { int temp=numbers[j]; numbers[j]=numbers[j+1]; numbers[j+1]=temp; }
      }
      for(int value:numbers) System.out.print(value+" ");
    }
  }` });
  try {
    const r=await runInstrumented(f.request);assert.equal(r.status,'complete',r.diagnostic);assert.equal(r.stdout,'1 2 3 6 8 ');assertPrefix(r);
    assert.ok(types(r,'array_read').length>10);assert.ok(types(r,'array_write').length>5);
    assert.ok(types(r,'local').filter((e)=>e.name==='i').length>2);
    assert.ok(types(r,'local').filter((e)=>e.name==='j').length>2);
    assert.ok(types(r,'branch').length>10);
  } finally { await f.cleanup(); }
});


const mockRaw = (seq, type = 'line', extra = {}) => ({ v: 1, seq, type, threadId: '1', frameId: 'f1', className: 'Main',
  methodName: 'main', descriptor: '()V', line: 1, site: 0, ...extra });
const mockRecording = (lastRecordedSeq = 0, extra = {}) => ({ state: 'STOPPED_LIMIT', reason: 'Recorder event limit reached', budget: 'events', lastRecordedSeq, executionContinued: true, ...extra });
const lines = (records) => records.map((r) => JSON.stringify(r)).join('\n') + '\n';
async function mockReader(records, options = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'vj-mock-reader-')), trace = join(temp, 'raw.ndjson');
  await writeFile(trace, lines(records));
  const reader = new CaptureReader({ trace, rawEventLimit: 2, rawByteLimit: 4096, ...options });
  return { trace, reader, cleanup: async () => { await reader.dispose(); await rm(temp, { recursive: true, force: true }); } };
}

test('mocked Phase 1: reserved saturation fits outside exact event and byte budgets; later semantic records are ignored', async () => {
  const first = mockRaw(0), recording = mockRecording();
  const f = await mockReader([first, mockRaw(1, 'capture_saturated', { recording }), mockRaw(2)],
    { rawEventLimit: 1, rawByteLimit: Buffer.byteLength(lines([first])) });
  try {
    await f.reader.refresh(true);
    expect(f.reader.events).toHaveLength(2); expect(f.reader.recording).toEqual(recording); expect(f.reader.stopped).toBe(true);
    expect(f.reader.offset).toBeLessThanOrEqual(f.reader.rawByteLimit + 1024);
  } finally { await f.cleanup(); }
});

test.each(['events', 'bytes'])('mocked Phase 1: older or malicious %s overflow retains valid prefix and bounds reads', async (budget) => {
  const first = mockRaw(0);
  const f = await mockReader([first, ...Array.from({ length: 10000 }, (_, i) => mockRaw(i + 1))],
    { rawEventLimit: budget === 'events' ? 1 : 20000, rawByteLimit: budget === 'bytes' ? Buffer.byteLength(lines([first])) : 4096 });
  try {
    await f.reader.refresh(true);
    expect(f.reader.events).toEqual([first]); expect(f.reader.recording).toMatchObject({ state: 'STOPPED_LIMIT', budget, lastRecordedSeq: 0 });
    expect(f.reader.offset).toBeLessThanOrEqual(f.reader.rawByteLimit + 1024);
    const offset = f.reader.offset; await f.reader.refresh(); expect(f.reader.offset).toBe(offset); expect(f.reader.tail.length).toBe(0);
  } finally { await f.cleanup(); }
});

test('mocked Phase 1: old mixed-thread trace stops before second application thread; frameless output is allowed', async () => {
  const first = mockRaw(0), console = mockRaw(1, 'console', { threadId: '9', frameId: null, text: 'x', channel: 'stdout' });
  const f = await mockReader([first, console, mockRaw(2, 'line', { threadId: '2' }), mockRaw(3)], { rawEventLimit: 10 });
  try {
    await f.reader.refresh(true); expect(f.reader.events).toEqual([first, console]);
    expect(f.reader.recording).toMatchObject({ state: 'STOPPED_UNSUPPORTED', budget: null, lastRecordedSeq: 1 });
  } finally { await f.cleanup(); }
});

test.each(['malformed', 'incomplete', 'sequence'])('mocked Phase 1: %s trace stops only observation and retains prefix', async (kind) => {
  const f = await mockReader([mockRaw(0)]);
  try {
    await writeFile(f.trace, lines([mockRaw(0)]) + (kind === 'malformed' ? '{bad}\n' : kind === 'incomplete' ? '{' : lines([mockRaw(7)])));
    await f.reader.refresh(true); expect(f.reader.events).toHaveLength(1);
    expect(f.reader.recording).toMatchObject({ state: 'STOPPED_ERROR', lastRecordedSeq: 0, executionContinued: true });
  } finally { await f.cleanup(); }
});

test('mocked Phase 1: bounded sidecar reports stdin after semantic recording stopped', async () => {
  const recording = mockRecording(); const f = await mockReader([mockRaw(0), mockRaw(1, 'capture_saturated', { recording })]);
  try {
    await f.reader.refresh(); const offset = f.reader.offset;
    for (const waitingForInput of [true, false]) {
      await writeFile(f.trace + '.status.json', JSON.stringify({ v: 1, recording, waitingForInput }));
      await f.reader.refresh(); expect(f.reader.waitingForInput).toBe(waitingForInput); expect(f.reader.events).toHaveLength(2); expect(f.reader.offset).toBe(offset);
    }
  } finally { await f.cleanup(); }
});

test.each([
  { reason: '' }, { budget: null }, { state: 'STOPPED_UNSUPPORTED', budget: 'events' }, { lastRecordedSeq: 10 },
])('mocked Phase 1: invalid stopped sidecar %j becomes observer error', async (extra) => {
  const f = await mockReader([mockRaw(0)]);
  try {
    await writeFile(f.trace + '.status.json', JSON.stringify({ v: 1, recording: mockRecording(0, extra), waitingForInput: false }));
    await f.reader.refresh(true); expect(f.reader.recording.state).toBe('STOPPED_ERROR'); expect(f.reader.recording.lastRecordedSeq).toBe(0);
  } finally { await f.cleanup(); }
});

test('mocked Phase 1: oversized sidecar and huge unterminated line cannot create an unbounded buffer', async () => {
  const f = await mockReader([mockRaw(0)], { rawByteLimit: 1024 });
  try {
    await writeFile(f.trace, lines([mockRaw(0)]) + 'x'.repeat(100000));
    await f.reader.refresh(); expect(f.reader.offset).toBeLessThanOrEqual(2048); expect(f.reader.tail.length).toBe(0);
    await writeFile(f.trace + '.status.json', 'x'.repeat(100000));
    await f.reader.refresh(true); expect(f.reader.recording.state).toBe('STOPPED_LIMIT');
  } finally { await f.cleanup(); }
});

test('mocked Phase 1: legacy finite provider drains oversized observation, output and second thread without killing', async () => {
  const f = await mockReader([mockRaw(0), mockRaw(1, 'line', { threadId: '2' }), mockRaw(2)]);
  let child; let executions = 0;
  try {
    const result = await runInstrumented({ javaPath: 'mock-java' }, {
      prepare: async () => ({ trace: f.trace, args: [], coveredClasses: ['Main'], transformInfo: {}, rawEventLimit: 10,
        rawByteLimit: 4096, timeoutMs: 2000, transformMs: 0, workingDirectory: '/tmp', cleanup: async () => {} }),
      spawnProcess: () => {
        executions++; child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = vi.fn();
        setTimeout(() => {
          child.stdout.write(Buffer.alloc(10 * 1024 * 1024, 120)); child.stdout.write('DONE\n');
          child.stdout.end(); child.stderr.end(); child.emit('close', 0);
        }, 40);
        return child;
      },
    });
    expect(result.status).toBe('complete'); expect(result.exitCode).toBe(0); expect(result.stdout).toHaveLength(10 * 1024 * 1024 + 5);
    expect(result.stdout.endsWith('DONE\n')).toBe(true); expect(result.outputTruncated).toBe(false);
    expect(result.recording.state).toBe('STOPPED_UNSUPPORTED'); expect(result.rawEvents).toHaveLength(1);
    expect(child.kill).not.toHaveBeenCalled(); expect(executions).toBe(1);
  } finally { await f.cleanup(); }
});

test('mocked Phase 1: preparation deadline is independent of short active runtime deadline', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'vj-mock-preparation-')); const classesDir = join(temp, 'classes'); await mkdir(classesDir);
  await writeFile(join(classesDir, 'Main.class'), 'mock');
  let calls = 0, prepared;
  try {
    prepared = await prepareInstrumented({ javaPath: 'mock-java', javacPath: 'mock-javac', projectRoot: temp, classesDir, mainClass: 'Main', timeoutMs: 25 }, {
      spawnProcess: () => {
        const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = vi.fn();
        const transform = ++calls === 2;
        setTimeout(() => {
          if (transform) child.stdout.write(JSON.stringify({ classes: 1, executableLines: { Main: [1] } }));
          child.stdout.end(); child.stderr.end(); child.emit('close', 0);
        }, 60);
        return child;
      },
    });
    expect(calls).toBe(2); expect(prepared.timeoutMs).toBe(25); expect(prepared.preparationTimeoutMs).toBe(30000); expect(prepared.hardTimeoutMs).toBe(600000);
    expect((await stat(prepared.temp)).isDirectory()).toBe(true);
  } finally { await prepared?.cleanup(); await rm(temp, { recursive: true, force: true }); }
});


test('mocked Phase 1: rejected legacy monitor stops observation without unhandled rejection or child termination', async () => {
  const f = await mockReader([mockRaw(0)]);
  const refresh = vi.spyOn(CaptureReader.prototype, 'refresh').mockRejectedValueOnce(new Error('mock read failure'));
  let child;
  try {
    const result = await runInstrumented({ javaPath: 'mock-java' }, {
      prepare: async () => ({ trace: f.trace, args: [], coveredClasses: ['Main'], transformInfo: {}, rawEventLimit: 10, rawByteLimit: 4096,
        timeoutMs: 1000, transformMs: 0, cleanup: async () => {} }),
      spawnProcess: () => {
        child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = vi.fn();
        setTimeout(() => { child.stdout.end('DONE\n'); child.stderr.end(); child.emit('close', 0); }, 40); return child;
      },
    });
    expect(result).toMatchObject({ status: 'complete', exitCode: 0, stdout: 'DONE\n', recording: { state: 'STOPPED_ERROR' } });
    expect(child.kill).not.toHaveBeenCalled();
  } finally { refresh.mockRestore(); await f.cleanup(); }
});


test('mocked Phase 1: FULL legacy stdin controls remain usable without a sidecar', async () => {
  const f = await mockReader([mockRaw(0, 'stdin_wait')]);
  try {
    await f.reader.refresh(); expect(f.reader.recording.state).toBe('FULL');
    expect(f.reader.inputStatusKnown).toBe(false); expect(f.reader.waitingForInput).toBe(true);
  } finally { await f.cleanup(); }
});

test.each(['missing', 'corrupt'])('mocked Phase 1: legacy %s sidecar after stop disables active watchdog without inventing an input wait', async (kind) => {
  const recording = mockRecording(); const f = await mockReader([mockRaw(0), mockRaw(1, 'capture_saturated', { recording })]);
  let child;
  try {
    if (kind === 'corrupt') await writeFile(f.trace + '.status.json', '{bad json');
    const result = await runInstrumented({ javaPath: 'mock-java' }, {
      prepare: async () => ({ trace: f.trace, args: [], coveredClasses: ['Main'], transformInfo: {}, rawEventLimit: 1, rawByteLimit: 4096,
        timeoutMs: 50, hardTimeoutMs: 1000, transformMs: 0, cleanup: async () => {} }),
      spawnProcess: () => {
        child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = vi.fn();
        setTimeout(() => { child.stdout.end('DONE\n'); child.stderr.end(); child.emit('close', 0); }, 150); return child;
      },
    });
    expect(result).toMatchObject({ status: 'complete', exitCode: 0, stdout: 'DONE\n', recording: { state: 'STOPPED_LIMIT' } });
    expect(child.kill).not.toHaveBeenCalled();
  } finally { await f.cleanup(); }
});
