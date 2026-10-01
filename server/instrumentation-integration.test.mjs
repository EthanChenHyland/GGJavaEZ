import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInstrumented } from './instrumentation-provider.mjs';
import { buildInstrumentationSourceManifest } from './instrumentation-sources.mjs';
import { normalizeTrace } from '../src/instrumentation/normalize.ts';
import { validateTrace } from '../src/runtime/trace.ts';
import { seek } from '../src/runtime/seek.ts';
import { layoutForTrace as createLayout } from '../src/app/layoutForTrace.ts';
import { buildSceneModel } from '../src/world/sceneModel.ts';

async function recorded(files) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'visual-java-integration-'));
  const classesDir = join(projectRoot, '.classes');
  await mkdir(classesDir);
  try {
    const paths = [];
    for (const [name, source] of Object.entries(files)) {
      const path = join(projectRoot, name);
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, source);
      paths.push(path);
    }
    execFileSync('javac', ['-g:lines,vars,source', '-d', classesDir, ...paths]);
    const manifest = await buildInstrumentationSourceManifest(projectRoot, classesDir);
    const capture = await runInstrumented({ projectId: 'fixture', projectRoot, classesDir,
      mainClass: 'Main', javaPath: 'java', javacPath: 'javac', sourcePaths: paths,
      rawEventLimit: 20000, rawByteLimit: 8 * 1024 * 1024, timeoutMs: 30000 });
    const result = normalizeTrace(capture.rawEvents, manifest, capture, 'integration');
    const trace = validateTrace(result.trace);
    return { capture, result, trace };
  } finally { await rm(projectRoot, { recursive: true, force: true }); }
}

test('editable multi-file Person reaches the shared reducer with stable object identity and source mapping', async () => {
  const { capture, trace } = await recorded({
    'Main.java': 'public class Main { public static void main(String[] args) { Person p = new Person("Ethan"); p.setAge(18); } }',
    'Person.java': 'public class Person { String name; int age; Person(String name) { this.name=name; } void setAge(int age) { this.age=age; } }',
  });
  expect(capture.status).toBe('complete');
  const person = trace.events.find((event) => event.type === 'ALLOCATE_OBJECT' && event.className === 'Person');
  expect(person).toBeDefined();
  const final = seek(trace, trace.events.length);
  expect(final.status).toBe('ended');
  expect(Object.values(final.objects).find((object) => object.className === 'Person')?.fields).toEqual(
    expect.objectContaining({ [Object.keys(final.objects[person.objectId].fields).find((key) => key.includes(':age:'))]: expect.objectContaining({ value: expect.objectContaining({ value: 18 }) }) }));
  expect(trace.events.filter((event) => event.type === 'CREATE_REFERENCE' && event.targetObjectId === person.objectId).length).toBeGreaterThanOrEqual(2);
  expect(trace.events.some((event) => event.source?.fileId === 'Person.java')).toBe(true);
  expect(trace.events.some((event) => event.source?.fileId === 'Main.java')).toBe(true);
  expect(seek(trace, 1).objects[person.objectId]).toBeUndefined();
});

test('recursive factorial returns and reverse reconstruction use observed invocations', async () => {
  const { capture, trace } = await recorded({ 'Main.java': 'public class Main { static int factorial(int n) { if(n<=1) return 1; return n*factorial(n-1); } public static void main(String[] args) { System.out.println(factorial(5)); } }' });
  expect(capture.status).toBe('complete');
  expect(capture.stdout).toBe('120\n');
  const final = seek(trace, trace.events.length);
  expect(final.returns.map((item) => item.value.value)).toEqual([1, 2, 6, 24, 120]);
  expect(new Set(trace.events.filter((event) => event.type === 'ENTER_METHOD' && event.methodName === 'factorial').map((event) => event.frameId)).size).toBe(5);
  expect(seek(trace, 0).activeFrameIds).toEqual([]);
});

test('array writes, branch truth, caught exception and crash remain replayable', async () => {
  const { capture, trace } = await recorded({ 'Main.java': 'public class Main { public static void main(String[] args) { int[] a={3,1}; if(a[0]>a[1]) { int t=a[0]; a[0]=a[1]; a[1]=t; } try { throw new IllegalArgumentException("boom"); } catch(IllegalArgumentException e) { System.out.println(a[0]); } } }' });
  expect(capture.status).toBe('complete');
  expect(trace.events.some((event) => event.type === 'ARRAY_WRITE')).toBe(true);
  expect(trace.events.some((event) => event.type === 'BRANCH_EVALUATE')).toBe(true);
  expect(trace.events.some((event) => event.type === 'CATCH_EXCEPTION')).toBe(true);
  const array = Object.values(seek(trace, trace.events.length).objects).find((object) => object.array);
  expect(array.array.elements.map((item) => item.value.value)).toEqual([1, 3]);
});

test('real control flow records branch bytecodes and locals without inventing source loop semantics', async () => {
  const { capture, trace } = await recorded({ 'Main.java': 'public class Main { public static void main(String[] args) { int sum=0; for(int i=0;i<3;i++) { if(i%2==0) sum+=i; } System.out.println(sum); } }' });
  expect(capture.status).toBe('complete');
  expect(capture.stdout).toBe('2\n');
  expect(trace.events.filter((event) => event.type === 'BRANCH_EVALUATE').length).toBeGreaterThan(0);
  expect(trace.events.some((event) => event.type === 'LOOP_ITERATION' || event.type === 'EVALUATE_CONDITION')).toBe(false);
  expect(Object.values(seek(trace, trace.events.length).frames).some((frame) => Object.values(frame.locals).some((slot) => slot.name === 'sum' && slot.value.value === 2))).toBe(true);
});

test('multiple project threads are surfaced as unsupported instead of a false complete world', async () => {
  const { capture, result, trace } = await recorded({ 'Main.java': 'public class Main { static void work() { int x=1; } public static void main(String[] args) throws Exception { Thread t=new Thread(() -> work()); t.start(); t.join(); } }' });
  expect(capture.status).toBe('complete');
  expect(capture.capability.status).toBe('unsupported');
  expect(result.capability.status).toBe('unsupported');
  expect(trace.events.at(-1)).toMatchObject({ type: 'PROGRAM_ABORT', reason: 'instrumentation_failed' });
  expect(seek(trace, trace.events.length).status).toBe('aborted');
});

test('implicit JVM failure retains an inspectable historical frame after actual unwind', async () => {
  const { capture, trace } = await recorded({ 'Main.java': 'public class Main { public static void main(String[] args) { String value=null; System.out.println(value.length()); } }' });
  expect(capture.status).toBe('program_crashed');
  const state = seek(trace, trace.events.length);
  expect(state.activeFrameIds).toEqual([]);
  expect(state.exceptions.at(-1)).toMatchObject({ className: 'java.lang.NullPointerException', unwoundFrameIds: ['jvm:frame:f1'] });
  const scene = buildSceneModel(state, createLayout(trace), 'meso');
  expect(scene.frames).toMatchObject([{ id: 'jvm:frame:f1', historical: true, active: false }]);
  expect(scene.frames[0].label).toContain('unwound');
});

test('caught implicit arithmetic failure preserves origin, actual catch line, unsupported exception local and continuation', async () => {
  const { capture, result, trace } = await recorded({ 'Main.java': `public class Main {
  public static void main(String[] args) {
    int denominator=0;
    try {
      int result=12/denominator;
    } catch (ArithmeticException problem) {
      System.out.println("caught");
    }
    System.out.println("continued");
  }
}` });
  expect(capture.status).toBe('complete');
  expect(capture.stdout).toBe('caught\ncontinued\n');
  const throws = trace.events.filter(event => event.type === 'THROW_EXCEPTION');
  expect(throws).toHaveLength(1);
  expect(throws[0]).toMatchObject({ explicit: false, source: { fileId: 'Main.java', line: 5 } });
  expect(trace.events.find(event => event.type === 'CATCH_EXCEPTION')).toMatchObject({ source: { line: 6 } });
  expect(result.capability.features.locals.status).toBe('partial');
  expect(seek(trace, trace.events.length).status).toBe('ended');
});

test('nested implicit null propagation is one episode with deepest source and three ordered unwinds', async () => {
  const { capture, trace } = await recorded({ 'Main.java': `public class Main {
  public static void main(String[] args) { a(); }
  static void a() { b(); }
  static void b() {
    String value=null;
    System.out.println(value.length());
  }
}` });
  expect(capture.status).toBe('program_crashed');
  const throws = trace.events.filter(event => event.type === 'THROW_EXCEPTION');
  expect(throws).toHaveLength(1);
  expect(throws[0]).toMatchObject({ source: { line: 6 }, explicit: false });
  expect(trace.events.filter(event => event.type === 'UNWIND_EXCEPTION').map(event => event.frameId))
    .toEqual(['jvm:frame:f3', 'jvm:frame:f2', 'jvm:frame:f1']);
  const final=seek(trace,trace.events.length);
  expect(final.exceptions[0].frameIds).toEqual(['jvm:frame:f1', 'jvm:frame:f2', 'jvm:frame:f3']);
  expect(final.exceptions[0].unwoundFrameIds).toHaveLength(3);
  const atThrow=seek(trace,throws[0].seq+1);
  expect(atThrow.activeFrameIds).toHaveLength(3);
  expect(atThrow.exceptions[0].unwoundFrameIds).toEqual([]);
  expect(throws[0].threadId).toBeTruthy();
});

test('exceptional finally handler preserves the implicit origin and does not fabricate an explicit synthetic rethrow', async () => {
  const { capture, trace } = await recorded({ 'Main.java': `public class Main {
  public static void main(String[] args) {
    int zero=0;
    try {
      System.out.println(7/zero);
    } finally {
      System.out.println("cleanup");
    }
  }
}` });
  expect(capture.status).toBe('program_crashed');
  expect(capture.stdout).toBe('cleanup\n');
  expect(trace.events.filter(event => event.type === 'THROW_EXCEPTION')).toMatchObject([
    { explicit: false, source: { line: 5 } },
  ]);
  const finallyEvent=trace.events.find(event=>event.type==='FINALLY_ENTER');
  expect(finallyEvent).toBeDefined();
  expect(trace.events.some(event=>event.type==='CATCH_EXCEPTION')).toBe(false);
  expect(seek(trace,finallyEvent.seq+1).exceptions[0]).toMatchObject({ finallyFrameIds:['jvm:frame:f1'],unwoundFrameIds:[] });
  expect(seek(trace,trace.events.length).exceptions[0]).toMatchObject({ unwoundFrameIds:['jvm:frame:f1'] });
});

test('normal-path finally and caught-then-finally show actual lines and never invent exceptional handler entry', async () => {
  const { capture, trace } = await recorded({ 'Main.java': `public class Main {
  public static void main(String[] args) {
    int zero=0;
    try { System.out.println(1/zero); }
    catch (ArithmeticException error) { System.out.println("handled"); }
    finally { System.out.println("finally"); }
    try { System.out.println("normal"); }
    finally { System.out.println("normal finally"); }
  }
}` });
  expect(capture.status).toBe('complete');
  expect(capture.stdout).toBe('handled\nfinally\nnormal\nnormal finally\n');
  expect(trace.events.some(event=>event.type==='FINALLY_ENTER')).toBe(false);
  expect(trace.events.filter(event=>event.type==='LINE_EXECUTE').map(event=>event.source.line)).toEqual(expect.arrayContaining([6,8]));
});

test.each([
  ['read', 'int value=a[index];'],
  ['write', 'a[index]=9;'],
])('implicit bounds failure on %s keeps the failed line without a successful indexed operation', async (_kind, operation) => {
  const { capture, trace } = await recorded({ 'Main.java': `public class Main {
  public static void main(String[] args) {
    int[] a={1,2};
    int index=3;
    ${operation}
  }
}` });
  expect(capture.status).toBe('program_crashed');
  expect(trace.events.filter(event=>event.type==='THROW_EXCEPTION')).toMatchObject([
    { className:'java.lang.ArrayIndexOutOfBoundsException',explicit:false,source:{line:5} },
  ]);
  expect(trace.events.some(event=>event.type==='ARRAY_READ' || event.type==='ARRAY_WRITE' && event.index===3)).toBe(false);
});

test('explicit rethrow after a real catch starts a new episode; stdout/stderr remains ordered in rewind', async () => {
  const { capture, result, trace } = await recorded({ 'Main.java': `public class Main {
  public static void main(String[] args) {
    IllegalArgumentException failure=new IllegalArgumentException("boom");
    System.out.print("before");
    try { throw failure; }
    catch (IllegalArgumentException problem) {
      System.err.print("caught");
      throw problem;
    }
  }
}` });
  expect(capture.status).toBe('program_crashed');
  expect(trace.events.filter(event=>event.type==='THROW_EXCEPTION')).toMatchObject([
    {explicit:true,source:{line:5}}, {explicit:true,source:{line:8}},
  ]);
  const output=trace.events.filter(event=>event.type==='CONSOLE_WRITE');
  expect(output.slice(0,2)).toMatchObject([{channel:'stdout',text:'before'}, {channel:'stderr',text:'caught'}]);
  expect(output.filter(event=>event.channel==='stdout').map(event=>event.text).join('')).toBe(capture.stdout);
  expect(output.filter(event=>event.channel==='stderr').map(event=>event.text).join('')).toBe(capture.stderr);
  expect(seek(trace,output[1].seq).console.map(entry=>entry.text).join('')).toBe('before');
  expect(seek(trace,output[1].seq+1).console.map(entry=>entry.text).join('')).toBe('beforecaught');
  expect(result.capability.features.console.status).toBe('partial');
});

test('wrapped Unicode byte fragments decode exactly while direct/replaced streams retain honest ordering limits', async () => {
  const { capture, result, trace } = await recorded({ 'Main.java': `public class Main {
  public static void main(String[] args) throws Exception {
    byte[] bytes="é🙂".getBytes(java.nio.charset.StandardCharsets.UTF_8);
    for (int i=0;i<bytes.length;i++) System.out.write(bytes[i]);
    System.out.flush();
    java.io.FileOutputStream direct=new java.io.FileOutputStream(java.io.FileDescriptor.out);
    direct.write("native".getBytes(java.nio.charset.StandardCharsets.UTF_8));
    direct.flush();
    System.setOut(new java.io.PrintStream(direct,true,java.nio.charset.StandardCharsets.UTF_8));
    System.out.print("replacement");
  }
}` });
  expect(capture.status).toBe('complete');
  expect(capture.stdout).toBe('é🙂nativereplacement');
  expect(trace.events.filter(event=>event.type==='CONSOLE_WRITE').map(event=>event.text).join('')).toBe('é🙂');
  expect(result.capability.features.console.status).toBe('partial');
  expect(result.capability.features.console.reason).toContain('unknown ordering');
});

test('caught custom getMessage override is never executed by exception inspection', async () => {
  const { capture, result, trace } = await recorded({ 'Main.java': `public class Main {
  static int calls=0;
  static class SideEffectException extends RuntimeException {
    @Override public String getMessage() { calls++; return "side effect"; }
  }
  public static void main(String[] args) {
    try { throw new SideEffectException(); }
    catch (SideEffectException error) { System.out.println(calls); }
  }
}` });
  expect(capture.status).toBe('complete');
  expect(capture.stdout).toBe('0\n');
  expect(capture.stderr).toBe('');
  expect(trace.events.filter(event=>event.type==='THROW_EXCEPTION')).toMatchObject([
    {className:'Main$SideEffectException',message:null,explicit:true},
  ]);
  expect(trace.events.some(event=>event.type==='ENTER_METHOD' && event.methodName==='getMessage')).toBe(false);
  expect(result.capability.features.exceptions.reason).toContain('Custom getMessage overrides are not invoked');
});

test('synchronized exceptional monitor release is labeled cleanup rather than a proven lexical finally', async () => {
  const { capture, trace } = await recorded({ 'Main.java': `public class Main {
  public static void main(String[] args) {
    int zero=0;
    try {
      synchronized (Main.class) { System.out.println(1/zero); }
    } catch (ArithmeticException error) { System.out.println("caught"); }
  }
}` });
  expect(capture.status).toBe('complete');
  expect(capture.stdout).toBe('caught\n');
  const cleanup=trace.events.filter(event=>event.type==='FINALLY_ENTER');
  expect(cleanup).toHaveLength(1);
  expect(cleanup[0].label).toBe('Exceptional cleanup handler entered');
  expect(trace.events.filter(event=>event.type==='THROW_EXCEPTION')).toHaveLength(1);
  expect(seek(trace,trace.events.length).exceptions[0].caughtBy).toBe('jvm:frame:f1');
});
