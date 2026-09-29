import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { runInstrumented } from './instrumentation-provider.mjs';

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
    assert.ok(types(r, 'enter').some((e) => e.methodName === '<init>' && e.receiver.objectId === objects[0].objectId));
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

test('event cap and transform failure fail closed', async () => {
  const f=await fixture({ 'Main.java': `public class Main { public static void main(String[] args) { for(int i=0;i<100;i++) {} } }` });
  try {
    const capped=await runInstrumented({ ...f.request, rawEventLimit: 5 }); assert.equal(capped.status,'limit_exceeded');assertPrefix(capped);assert.ok(capped.rawEvents.length<=5);
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
