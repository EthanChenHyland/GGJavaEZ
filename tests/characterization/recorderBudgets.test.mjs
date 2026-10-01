import { describe, expect, test } from 'vitest';
import { recordProgram, waitFor } from './recorderHarness.mjs';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import { validateTrace } from '../../src/runtime/trace.ts';
import { seek } from '../../src/runtime/seek.ts';

/**
 * Phase 1 promotes the desired Phase 0 budget assertions. The original exit-86 evidence
 * is preserved verbatim in docs/checkpoints/v12-p0/PHASE0.md (audit X1/X2).
 * These use unchanged production defaults and assert real program output and exit.
 */
const programs = {
  objects: `public class Main {
  static class Item { int id; Item(int id) { this.id = id; } }
  public static void main(String[] args) {
    int total = 0;
    for (int i = 0; i < 300; i++) { Item item = new Item(i); total = total + item.id; }
    System.out.println("DONE " + total);
  }
}`,
  events: `public class Main {
  public static void main(String[] args) {
    long sum = 0;
    for (int i = 0; i < 20000; i++) { int square = i * i; sum = sum + square; }
    System.out.println("DONE " + sum);
  }
}`,
  frames: `public class Main {
  static int descend(int depth) { if (depth == 0) return 0; return 1 + descend(depth - 1); }
  public static void main(String[] args) {
    System.out.println("DONE " + descend(200));
  }
}`,
  bytes: `public class Main {
  public static void main(String[] args) {
    String block = "x".repeat(100_000);
    for (int i = 0; i < 100; i++) System.out.print(block);
    System.out.println();
    System.out.println("DONE");
  }
}`,
};
const reasons = { objects: 'objects', events: 'events', frames: 'live frames', bytes: 'bytes' };
const runs = new Map();
const run = (name) => {
  if (!runs.has(name)) runs.set(name, recordProgram({ 'Main.java': programs[name] }));
  return runs.get(name);
};

const outputs = { objects: 'DONE 44850\n', events: 'DONE 2666466670000\n', frames: 'DONE 200\n',
  bytes: 'x'.repeat(10_000_000) + '\nDONE\n' };

function assertStopped(result, budget, state = 'STOPPED_LIMIT') {
  expect(result.timedOut).toBe(false);
  expect(result.signal).toBeNull();
  const controls = result.rawEvents.filter((event) => event.type === 'capture_saturated');
  expect(controls).toHaveLength(1);
  const stop = controls[0];
  expect(result.rawEvents.at(-1)).toBe(stop);
  expect(result.rawEvents.map((event) => event.seq)).toEqual(result.rawEvents.map((_, i) => i));
  expect(stop.recording).toMatchObject({ state, budget, executionContinued: true,
    lastRecordedSeq: stop.seq === 0 ? null : stop.seq - 1 });
  expect(Buffer.byteLength(JSON.stringify(stop) + '\n')).toBeLessThanOrEqual(1024);
  expect(result.rawEvents.length - 1).toBeLessThanOrEqual(result.limits.rawEventLimit);
  const prefixBytes = Buffer.byteLength(result.rawText.slice(0, result.rawText.lastIndexOf('{"v":1,"seq":')));
  expect(prefixBytes).toBeLessThanOrEqual(result.limits.rawByteLimit);
  expect(result.recording).toEqual(stop.recording);
  if (result.sidecar) {
    expect(result.sidecar).toEqual({ v: 1, recording: stop.recording, waitingForInput: false });
    expect(Buffer.byteLength(result.sidecarText)).toBeLessThanOrEqual(1024);
  }
  expect(result.capability.diagnostics.join(' ')).not.toMatch(/Invalid Recorder event|Unknown .*frame|Unknown .*object|Unobserved reference/);
  expect(result.trace.events.at(-1)).toMatchObject({ type: 'CAPTURE_STOP', recording: stop.recording });
  validateTrace(result.trace);
  expect(seek(result.trace, result.trace.events.length).status).toBe('partial');
}

describe.each(Object.keys(programs))('Recorder %s budget', (name) => {
  test(`Phase 1: ${name} saturation preserves complete actual stdout and natural exit`, async () => {
    const result = await run(name);
    expect(result.limits).toEqual({ rawEventLimit: 20000, rawByteLimit: 8 * 1024 * 1024 });
    expect(result.code).toBe(0);
    expect(result.status).toBe('complete');
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(outputs[name]);
    assertStopped(result, reasons[name]);
  }, 120000);
});

// Manually driven Recorder boundary tests isolate the exact point at which payload
// dependencies exhaust capacity. The application is compiled once and executed once.
const manual = (action) => `public class Main {
  static class Node { Node next; String text; }
  static Class<?> recorder;
  static Object probe(String name, Class<?>[] types, Object... values) throws Exception {
    return recorder.getMethod(name, types).invoke(null, values);
  }
  static void enter(String method, Object receiver) throws Exception {
    probe("enter", new Class<?>[]{String.class,String.class,String.class,Object.class,int.class,int.class},
      "Main",method,"()V",receiver,1,0);
  }
  static Node chain(int size) { Node root=null; for(int i=0;i<size;i++) { Node node=new Node(); node.next=root; root=node; } return root; }
  static int size(String name) throws Exception {
    java.lang.reflect.Field field=recorder.getDeclaredField(name);field.setAccessible(true);
    Object value=field.get(null);
    if(value instanceof java.util.Map<?,?> map)return map.size();
    return ((java.util.List<?>)value).size();
  }
  public static void main(String[] args) throws Exception {
    recorder=Class.forName("visualjava.Recorder"); enter("main",null);
    ${action}
    System.out.println("DONE"); System.err.println("ERR");
    System.out.println("RETAINED "+size("IDS")+","+size("SEEN")+","+size("pending"));
  }
}`;

const nestedActions = {
  observe: 'probe("observe",new Class<?>[]{Object.class},chain(257));',
  raw: 'probe("local",new Class<?>[]{int.class,String.class,String.class,String.class,Object.class,int.class},1,"node","LMain$Node;","node",chain(257),1);',
  parameter: `probe("parameter",new Class<?>[]{int.class,String.class,String.class,String.class,Object.class},0,"node","LMain$Node;","param",chain(257)); enter("callee",null);`,
  enter: 'enter("callee",chain(257));',
};
describe.each(Object.entries(nestedActions))('recursive %s payload saturation', (name, action) => {
  test('drops the entire dependent group and never writes an invalid new frame', async () => {
    const result = await recordProgram({ 'Main.java': manual(action) }, { manualProbes: true, vmArgs: ['-Xss4m'] });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('DONE\nRETAINED 0,0,0\n');
    expect(result.stderr).toBe('ERR\n');
    assertStopped(result, 'objects');
    expect(result.rawEvents.map((event) => event.type)).toEqual(['enter', 'capture_saturated']);
    expect(result.trace.events.filter((event) => event.type === 'ENTER_METHOD')).toHaveLength(1);
  }, 120000);
});

test('event saturation during recursive dependency emission rolls back staged children as well as their parent', async () => {
  const result = await recordProgram({ 'Main.java': manual('probe("observe",new Class<?>[]{Object.class},chain(2));') },
    { manualProbes: true, rawEventLimit: 2 });
  expect(result.code).toBe(0);
  assertStopped(result, 'events');
  expect(result.rawEvents.map((event) => event.type)).toEqual(['enter', 'capture_saturated']);
  expect(result.recording.lastRecordedSeq).toBe(0);
}, 120000);

describe.each([
  ['string', 'String huge="x".repeat(40_000_000); System.out.println("SIZE "+huge.length());'],
  ['int array', 'int[] huge=new int[12_000_000]; System.out.println("SIZE "+huge.length);'],
])('bounded large %s serialization', (name, action) => {
  test('stops before allocating an oversized observer payload, with a constrained heap', async () => {
    const result = await recordProgram({ 'Main.java': `public class Main { public static void main(String[] args) { ${action} System.out.println("DONE"); } }` },
      { vmArgs: ['-Xmx96m'] });
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/^SIZE (40000000|12000000)\nDONE\n$/);
    assertStopped(result, 'bytes');
  }, 120000);
});

test('a failed atomic sidecar replacement never escapes into Java', async () => {
  const result = await recordProgram({ 'Main.java': manual('probe("observe",new Class<?>[]{Object.class},chain(2));') },
    { manualProbes: true, rawEventLimit: 2, beforeLaunch: async (prepared) => { await mkdir(`${prepared.trace}.status.json`); } });
  expect(result.code).toBe(0);
  expect(result.stdout).toBe('DONE\nRETAINED 0,0,0\n');
  expect(result.sidecar).toBeNull();
  assertStopped(result, 'events');
}, 120000);

test('post-stop stdin preserves byte reads, bulk reads, empty reads and EOF with bounded wait snapshots', async () => {
  const source = `public class Main {
    public static void main(String[] args) throws Exception {
      long sum=0; for(int i=0;i<20000;i++)sum+=i;
      System.out.println("WAIT");
      int one=System.in.read();
      byte[] bytes=new byte[2];
      int count=System.in.read(bytes,0,2);
      int zero=System.in.read(bytes,0,0);
      int eof=System.in.read();
      System.out.println("READ "+one+" "+count+" "+(bytes[0]&255)+" "+(bytes[1]&255)+" "+zero+" "+eof);
    }
  }`;
  let frozen;
  const result = await recordProgram({ 'Main.java': source }, { interact: async ({ child, readStatus, readRaw }) => {
    const waiting = await waitFor(readStatus, (value) => value?.waitingForInput && value.recording.state === 'STOPPED_LIMIT');
    expect(Buffer.byteLength(JSON.stringify(waiting))).toBeLessThanOrEqual(1024);
    frozen = await readRaw();
    // Keep stdin open through the next wait to verify actual read boundaries.
    child.stdin.write(Buffer.from([0xff]));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await readStatus()).waitingForInput).toBe(true);
    child.stdin.write(Buffer.from([0, 0x80]));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((await readStatus()).waitingForInput).toBe(true);
    child.stdin.end();
  } });
  expect(result.code).toBe(0);
  expect(result.stdout).toBe('WAIT\nREAD 255 2 0 128 0 -1\n');
  assertStopped(result, 'events');
  expect(result.rawEvents).toEqual(frozen);
}, 120000);

test('a second application thread stops capture before its first semantic event and both streams continue', async () => {
  const source = `public class Main {
    static void work() { System.out.println("WORKER"); System.err.println("WORKER ERR"); }
    public static void main(String[] args) throws Exception {
      Thread thread=new Thread(Main::work);thread.start();thread.join();System.out.println("DONE");
    }
  }`;
  const result = await recordProgram({ 'Main.java': source });
  expect(result.code).toBe(0);
  expect(result.stdout).toBe('WORKER\nDONE\n');
  expect(result.stderr).toBe('WORKER ERR\n');
  assertStopped(result, null, 'STOPPED_UNSUPPORTED');
  expect(new Set(result.rawEvents.slice(0, -1).map((event) => event.threadId)).size).toBe(1);
  expect(result.rawEvents.at(-1).threadId).not.toBe(result.rawEvents[0].threadId);
}, 120000);

async function debugWire() {
  const messages = [];
  let socket, sequence = 0;
  const server = net.createServer((connection) => {
    socket = connection; socket.setEncoding('utf8');
    let tail = '';
    socket.on('data', (text) => {
      tail += text;
      let end;
      while ((end = tail.indexOf('\n')) >= 0) {
        const message = JSON.parse(tail.slice(0, end)); tail = tail.slice(end + 1); messages.push(message);
        if (message.type === 'hello') socket.write('breakpoints\tinitial\nstart\tstart\n');
      }
    });
    socket.on('error', () => {});
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    port: server.address().port,
    paused: async (after = 0) => waitFor(async () => messages.slice(after).find((message) => message.type === 'paused')),
    count: () => messages.length,
    command: async (command, payload = '') => {
      const request = `test${++sequence}`;
      socket.write(`${command}\t${request}${payload}\n`);
      if (command !== 'stop') await waitFor(async () => messages.find((message) => message.type === 'ack' && message.requestId === request));
    },
    close: async () => { socket?.destroy(); await new Promise((resolve) => server.close(resolve)); },
  };
}
const debugSource = `public class Main {
  static int descend(int n) {
    if(n==0)return 0;
    return 1+descend(n-1);
  }
  static void after(int n) throws Exception {
    if(n==0)bottom(); else after(n-1);
  }
  static int controlSize() throws Exception {
    Class<?> recorder=Class.forName("visualjava.Recorder");
    java.lang.reflect.Field field=recorder.getDeclaredField("CONTROL");field.setAccessible(true);
    Object context=((ThreadLocal<?>)field.get(null)).get();
    java.lang.reflect.Field frames=context.getClass().getDeclaredField("frames");frames.setAccessible(true);
    return ((java.util.ArrayDeque<?>)frames.get(context)).size();
  }
  static void bottom() throws Exception {
    System.out.println("BOTTOM");
    System.out.println("BOUNDS "+controlSize());
  }
  public static void main(String[] args) throws Exception {
    System.out.println("DONE "+descend(200));
    System.in.read();
    Thread worker=new Thread(() -> { try { Thread.sleep(100); } catch(InterruptedException ignored) {} System.out.println("WORKER"); });
    worker.start(); after(200); worker.join();
    System.out.println("FINISHED");
  }
}`;
const bottomLine = debugSource.split('\n').findIndex((line) => line.includes('System.out.println("BOTTOM")')) + 1;

test('debug pauses and steps after frame saturation have truthful overflow context and a frozen watermark without retaining the writer lock', async () => {
  const wire = await debugWire();
  try {
    let watermark, frozen;
    const result = await recordProgram({ 'Main.java': debugSource }, {
      vmArgs: [`-Dvisualjava.debugPort=${wire.port}`, '-Dvisualjava.debugToken=recorder-test', '-Xss4m'],
      interact: async ({ child, readStatus, readRaw, output }) => {
        await wire.paused(); await wire.command('continue');
        await waitFor(readStatus, (value) => value?.waitingForInput && value.recording.budget === 'live frames');
        frozen = await readRaw(); watermark = frozen.length;
        const start = wire.count();
        await wire.command('breakpoints', `\tMain:${bottomLine}`);
        child.stdin.end('A');
        const pause = await wire.paused(start);
        expect(pause).toMatchObject({ className: 'Main', methodName: 'bottom', line: bottomLine, rawEventCount: watermark });
        expect(pause.frameId).toMatch(/^debug:/);
        // A different application thread writes while the first is paused. It cannot
        // acquire the recorder lock if the debugger checkpoint accidentally retains it.
        await waitFor(async () => output().stdout, (text) => text.includes('WORKER\n'));
        expect(await readRaw()).toEqual(frozen);
        const stepped = wire.count();
        await wire.command('stepInto');
        const step = await wire.paused(stepped);
        expect(step).toMatchObject({ reason: 'step', className: 'Main', rawEventCount: watermark });
        await wire.command('breakpoints'); await wire.command('continue');
      },
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('DONE 200\n');
    expect(result.stdout).toContain('BOTTOM\nBOUNDS 128\n');
    expect(result.stdout).toContain('FINISHED\n');
    expect(result.stderr).toBe('');
    assertStopped(result, 'live frames');
    expect(result.rawEvents).toEqual(frozen);
  } finally { await wire.close(); }
}, 120000);

test('explicit debugger Stop remains authoritative after saturation', async () => {
  const wire = await debugWire();
  try {
    const result = await recordProgram({ 'Main.java': debugSource }, {
      vmArgs: [`-Dvisualjava.debugPort=${wire.port}`, '-Dvisualjava.debugToken=recorder-stop-test', '-Xss4m'],
      interact: async ({ child, readStatus }) => {
        await wire.paused(); await wire.command('continue');
        await waitFor(readStatus, (value) => value?.waitingForInput && value.recording.state === 'STOPPED_LIMIT');
        const start = wire.count();
        await wire.command('breakpoints', `\tMain:${bottomLine}`); child.stdin.end('A');
        await wire.paused(start); await wire.command('stop');
      },
    });
    expect(result.code).toBe(87);
    expect(result.timedOut).toBe(false);
    expect(result.stdout).not.toContain('FINISHED');
    expect(result.recording).toMatchObject({ state: 'STOPPED_LIMIT', budget: 'live frames' });
    expect(result.rawEvents.filter((event) => event.type === 'capture_saturated')).toHaveLength(1);
  } finally { await wire.close(); }
}, 120000);
