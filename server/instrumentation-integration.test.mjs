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
import { createLayout } from '../src/world/layout.ts';
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
