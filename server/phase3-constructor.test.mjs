import { describe, expect, test } from 'vitest';
import { recordProgram } from '../tests/characterization/recorderHarness.mjs';

// Real JVM tests are serial. Run only in the lead's reserved JVM QA slot.
const source = `public class Main {
  interface Op { int apply(int value); }
  static class Base { int balance; Base(int initial) { balance=initial; } }
  static class Derived extends Base implements Op {
    Derived() { this(7); }
    Derived(int seed) { super(seed+1); }
    public int apply(int amount) { balance+=amount; return balance; }
  }
  static int twice(int amount) { return amount*2; }
  static int twice(String text) { return text.length(); }
  static Derived create() { return new Derived(); }
  static Derived absent() { return null; }
  static int fail() { throw new IllegalArgumentException("pre-init"); }
  static class Broken extends Base { Broken() { super(fail()); } }
  public static void main(String[] args) {
    Derived p=create(); Op service=p; int x=25;
    int result=service.apply(x); int literal=service.apply(3);
    int computed=service.apply(result/2);
    System.out.println(twice(computed));
    int combined=twice(2)+twice("abc"); Derived alias=p; Derived empty=absent();
    int[] values={combined}; int read=values[0]; values[0]=x;
    try { new Broken(); } catch(IllegalArgumentException problem) { System.out.println("caught"); }
    java.util.Scanner input=new java.util.Scanner(System.in);
    int age=input.nextInt(); int another=input.nextInt();
    System.out.println(age+another);
  }
}`;
let captured;
const recording = () => (captured ??= recordProgram({ 'Main.java': source }, { stdin: '018 002\n' }));

describe('Phase 3 verifier-safe constructors and original-bytecode provenance', () => {
  test('super and this delegation have true-start entries, late receivers and allocation completion', async () => {
    const result = await recording();
    expect(result.code, result.stderr).toBe(0);
    expect(result.recording.state).toBe('FULL');
    const enters=result.rawEvents.filter(event=>event.type==='enter');
    const derived=enters.filter(event=>event.className==='Main$Derived'&&event.methodName==='<init>');
    expect(derived).toHaveLength(2);
    expect(derived[1].callerFrameId).toBe(derived[0].frameId);
    const base=enters.find(event=>event.className==='Main$Base'&&event.methodName==='<init>');
    expect(base.callerFrameId).toBe(derived[1].frameId);
    expect(base.seq).toBeGreaterThan(derived[1].seq);
    for(const constructor of [...derived,base]) {
      expect(constructor.receiver).toBeNull();
      expect(constructor.provenanceVersion).toBe(1);
      expect(constructor.callId).toMatch(/^c\d+$/);
      expect(result.rawEvents.some(event=>event.type==='receiver_ready'&&event.frameId===constructor.frameId)).toBe(true);
    }
    expect(result.rawEvents.find(event=>event.type==='constructed'&&event.className==='Main$Derived')).toMatchObject({newSite:expect.any(Number)});
  },120000);

  test('dispatch and overloads preserve declared calls and exact actual method descriptors', async () => {
    const raw=(await recording()).rawEvents;
    const call=raw.find(event=>event.type==='call'&&event.owner==='Main$Op'&&event.name==='apply');
    expect(call).toMatchObject({invokeKind:'interface',callDescriptor:'(I)I',arguments:[{kind:'int',value:25}],argumentOrigins:[{kind:'local',slot:expect.any(Number)}]});
    expect(raw.find(event=>event.type==='enter'&&event.callId===call.callId)).toMatchObject({className:'Main$Derived',methodName:'apply',descriptor:'(I)I'});
    const overloads=raw.filter(event=>event.type==='call'&&event.name==='twice');
    expect(new Set(overloads.map(event=>event.callDescriptor))).toEqual(new Set(['(I)I','(Ljava/lang/String;)I']));
    for(const invoke of overloads)expect(raw.find(event=>event.type==='enter'&&event.callId===invoke.callId)?.descriptor).toBe(invoke.callDescriptor);
  },120000);

  test('local, field, array and return consumers retain conservative origin recipes', async () => {
    const raw=(await recording()).rawEvents;
    expect(raw.find(event=>event.type==='local'&&event.name==='result')?.origin.kind).toBe('call_result');
    expect(raw.find(event=>event.type==='local'&&event.name==='combined')?.origin).toMatchObject({kind:'computed',opcode:96,inputs:[{kind:'call_result'},{kind:'call_result'}]});
    expect(raw.find(event=>event.type==='local'&&event.name==='alias')?.origin.kind).toBe('local');
    expect(raw.find(event=>event.type==='local'&&event.name==='empty')).toMatchObject({value:{kind:'null'},origin:{kind:'call_result'}});
    expect(raw.some(event=>event.type==='field_read'&&event.name==='balance')).toBe(true);
    expect(raw.find(event=>event.type==='field'&&event.name==='balance'&&event.origin?.kind==='computed')?.origin).toMatchObject({kind:'computed',inputs:[{kind:'field_read'},{kind:'local'}]});
    expect(raw.find(event=>event.type==='local'&&event.name==='read')?.origin.kind).toBe('array_read');
    expect(raw.some(event=>event.type==='array_write'&&event.origin?.kind==='local')).toBe(true);
    const out=raw.find(event=>event.type==='call'&&event.name==='println'&&event.argumentOrigins[0]?.kind==='call_result');
    expect(raw.some(event=>event.type==='console'&&event.callId===out.callId)).toBe(true);
  },120000);

  test('pre-super failure reconciles only actual exceptional frames and lets the caller continue', async () => {
    const result=await recording();const raw=result.rawEvents;
    const broken=raw.find(event=>event.type==='enter'&&event.className==='Main$Broken');
    expect(raw.some(event=>event.type==='unwind'&&event.frameId===broken.frameId)).toBe(true);
    expect(raw.some(event=>event.type==='receiver_ready'&&event.frameId===broken.frameId)).toBe(false);
    expect(raw.some(event=>event.type==='exit'&&event.frameId===broken.frameId)).toBe(false);
    expect(raw.filter(event=>event.type==='throw')).toHaveLength(1);
    expect(result.stdout).toContain('caught\n20\n');
  },120000);

  test('successful Scanner matches prove consumed lexemes independently of read-ahead', async () => {
    const raw=(await recording()).rawEvents;
    const calls=raw.filter(event=>event.type==='call'&&event.owner==='java.util.Scanner'&&event.name==='nextInt');
    const returns=calls.map(invoke=>raw.find(event=>event.type==='call_return'&&event.callId===invoke.callId));
    expect(returns.map(event=>event.inputText)).toEqual(['018','002']);
    expect(returns.map(event=>event.value.value)).toEqual([18,2]);
    expect(raw.filter(event=>event.type==='stdin_read'&&event.text).every(event=>event.callId)).toBe(true);
  },120000);
});

test('library exceptional call retains its actual in-flight call ID on throw/catch', async () => {
  const result=await recordProgram({'Main.java':'public class Main { public static void main(String[] args) { try { java.util.List.of(1).get(3); } catch(IndexOutOfBoundsException e) { System.out.println("ok"); } } }'});
  expect(result.code,result.stderr).toBe(0);
  const invoke=result.rawEvents.find(event=>event.type==='call'&&event.name==='get');
  expect(result.rawEvents.find(event=>event.type==='throw')?.callId).toBe(invoke.callId);
  expect(result.rawEvents.find(event=>event.type==='catch')?.callId).toBe(invoke.callId);
  expect(result.rawEvents.some(event=>event.type==='call_return'&&event.callId===invoke.callId)).toBe(false);
},120000);

// --release establishes class-file compatibility only, not execution on those JDK runtimes.
for(const release of ['17','21','25']) test(`javac --release ${release} constructors verify on the installed runtime`,async()=>{
  const { execFileSync }=await import('node:child_process');
  const { mkdtemp,mkdir,writeFile,rm }=await import('node:fs/promises');
  const { tmpdir }=await import('node:os');const { join }=await import('node:path');
  const { detectJdk }=await import('./jdk.mjs');const { runInstrumented }=await import('./instrumentation-provider.mjs');
  const jdk=await detectJdk();expect(jdk.available).toBe(true);
  const projectRoot=await mkdtemp(join(tmpdir(),'vj-p3-release-'));const classesDir=join(projectRoot,'classes');
  try {
    await mkdir(classesDir);const path=join(projectRoot,'Main.java');
    await writeFile(path,`public class Main {
      static class Base { Base(int n) {} }
      static class Derived extends Base { Derived() { this(2); } Derived(int n) { super(n); } }
      static int fail() { throw new IllegalStateException(); }
      static class Broken extends Base { Broken() { super(fail()); } }
      public static void main(String[] args) { new Derived();try {new Broken();}catch(IllegalStateException e) {System.out.println("ok");} }
    }`);
    execFileSync(jdk.javacPath,['--release',release,'-g','-d',classesDir,path],{timeout:30000});
    const result=await runInstrumented({projectRoot,classesDir,mainClass:'Main',javaPath:jdk.javaPath,javacPath:jdk.javacPath});
    expect(result.status,result.diagnostic).toBe('complete');expect(result.stdout).toBe('ok\n');expect(result.recording.state).toBe('FULL');
    const entries=result.rawEvents.filter(event=>event.type==='enter');
    const derived=entries.filter(event=>event.className==='Main$Derived');
    expect(derived[1].callerFrameId).toBe(derived[0].frameId);
    expect(entries.find(event=>event.className==='Main$Base').callerFrameId).toBe(derived[1].frameId);
  }finally{await rm(projectRoot,{recursive:true,force:true});}
},120000);

test('nested new arguments, inner synthetic pre-super fields and wide operands remain verifier-safe',async()=>{
  const result=await recordProgram({'Main.java':`public class Main {
    static class Base { Base(Object value) {} }
    static class Derived extends Base {
      Derived() { super(new Derived(1)); }
      Derived(int seed) { super(null); }
    }
    class Inner extends Base { Inner() { super(null); } }
    static long wide(long a,double b) { return a+(long)b; }
    public static void main(String[] args) { new Derived();new Main().new Inner();System.out.println(wide(3L,4.0)); }
  }`});
  expect(result.code,result.stderr).toBe(0);expect(result.recording.state).toBe('FULL');expect(result.stdout).toBe('7\n');
  const entries=result.rawEvents.filter(event=>event.type==='enter');
  const outer=entries.find(event=>event.className==='Main$Derived'&&event.descriptor==='()V');
  const nested=entries.find(event=>event.className==='Main$Derived'&&event.descriptor==='(I)V');
  expect(nested.callerFrameId).toBe(outer.frameId);
  expect(entries.filter(event=>event.className==='Main$Base').map(event=>event.callerFrameId)).toContain(outer.frameId);
  expect(result.rawEvents.find(event=>event.type==='call'&&event.name==='wide').arguments).toEqual([{kind:'long',value:3},{kind:'double',value:4}]);
},120000);

test('inherited static and special methods link to the actual declaring method rather than reference owner',async()=>{
  const result=await recordProgram({'Main.java':`public class Main {
    static class Grand { static int inherited(int n) { return n; } int virtual(int n) { return n+1; } }
    static class Base extends Grand {}
    static class Derived extends Base { int special(int n) { return super.virtual(n); } }
    public static void main(String[] args) { System.out.println(Derived.inherited(2)+new Derived().special(3)); }
  }`});
  expect(result.code,result.stderr).toBe(0);expect(result.stdout).toBe('6\n');
  for(const name of ['inherited','virtual']) {
    const invoke=result.rawEvents.find(event=>event.type==='call'&&event.name===name);
    expect(result.rawEvents.find(event=>event.type==='enter'&&event.callId===invoke.callId)).toMatchObject({className:'Main$Grand',descriptor:'(I)I'});
  }
},120000);

test('operand recipes do not substitute a later local epoch after increments, assignments or branches',async()=>{
  const result=await recordProgram({'Main.java':`public class Main {
    static int consume(int first,int second) { return first+second; }
    static class Base { Base(int n) {} }
    static class Derived extends Base { Derived(boolean flag) { super(flag?1:2); } }
    public static void main(String[] args) {
      int i=10;
      int j=i++;
      int z=i++ + i;
      int updated=i + (i=5);
      int late=i*2 + (i=7);
      int direct=consume(i++,i);
      int branch=i + (args.length==0 ? (i=9) : (i=11));
      int unchanged=i+2;
      new Derived(true);
      System.out.println(j+":"+z+":"+updated+":"+late+":"+direct+":"+branch+":"+unchanged);
    }
  }`});
  expect(result.code,result.stderr).toBe(0);expect(result.recording.state).toBe('FULL');
  expect(result.stdout).toBe('10:23:17:17:15:17:11\n');
  const local=name=>result.rawEvents.find(event=>event.type==='local'&&event.name===name);
  expect(local('j').origin.kind).toBe('unknown');
  expect(local('z').origin).toMatchObject({kind:'computed',inputs:[{kind:'unknown'},{kind:'local'}]});
  expect(local('updated').origin).toMatchObject({kind:'computed',inputs:[{kind:'unknown'},{kind:'constant'}]});
  // Check against the FINAL store: ILOAD -> IMUL was earlier than the later assignment.
  expect(local('late').origin).toMatchObject({kind:'computed',inputs:[{kind:'computed',inputs:[{kind:'unknown'},{kind:'constant'}]},{kind:'constant'}]});
  const invoke=result.rawEvents.find(event=>event.type==='call'&&event.name==='consume');
  expect(invoke.argumentOrigins.map(origin=>origin.kind)).toEqual(['unknown','local']);
  expect(local('branch').origin.inputs[0].kind).toBe('unknown');
  expect(local('unchanged').origin.inputs[0].kind).toBe('local');
},120000);

test('call operands and constructors execute unchanged after the recorder limit with packaging skipped',async()=>{
  const result=await recordProgram({'Main.java':`public class Main {
    static class Value { final int n; Value(int n) { this.n=n; } }
    static int sum(int n,long wide,double fractional,String text,Value value) { return n+(int)wide+(int)fractional+text.length()+value.n; }
    public static void main(String[] args) {
      int total=0;
      for(int i=0;i<5000;i++)total+=sum(1,2L,3.0,"four",new Value(5));
      System.out.println(total);
    }
  }`},{rawEventLimit:12});
  expect(result.code,result.stderr).toBe(0);expect(result.stdout).toBe('75000\n');
  expect(result.recording).toMatchObject({state:'STOPPED_LIMIT',budget:'events'});
  expect(result.rawEvents.filter(event=>event.type!=='capture_saturated').length).toBeLessThanOrEqual(12);
  expect(result.rawEvents.at(-1).type).toBe('capture_saturated');
},120000);

/** The dependency never enters the project's transform walk; only its bytecode is on the launch classpath. */
async function recordOpaqueConstructorBoundary(mainSource) {
  const { execFileSync }=await import('node:child_process');
  const { mkdtemp,mkdir,writeFile,rm }=await import('node:fs/promises');
  const { tmpdir }=await import('node:os');const { delimiter,join }=await import('node:path');
  const { detectJdk }=await import('./jdk.mjs');
  const dependencyRoot=await mkdtemp(join(tmpdir(),'vj-p3-opaque-'));
  try {
    return await recordProgram({'Main.java':mainSource},{beforeLaunch:async prepared=>{
      const jdk=await detectJdk();expect(jdk.available).toBe(true);
      const dependencyClasses=join(dependencyRoot,'classes');await mkdir(dependencyClasses);
      const path=join(dependencyRoot,'Boundary.java');
      await writeFile(path,`package opaque;
        public final class Boundary {
          public static Object retry(java.lang.reflect.Constructor<?> constructor,java.util.function.Supplier<?> callback) throws Exception {
            try { return constructor.newInstance(); }
            catch(java.lang.reflect.InvocationTargetException failed) { return callback.get(); }
          }
          public static int read(java.util.function.IntSupplier callback) { return callback.getAsInt(); }
        }
      `);
      execFileSync(jdk.javacPath,['-g','-d',dependencyClasses,path],{timeout:30000});
      const index=prepared.args.indexOf('-cp');expect(index).toBeGreaterThanOrEqual(0);
      prepared.args[index+1]+=delimiter+dependencyClasses;
      expect(prepared.coveredClasses.some(name=>name.startsWith('opaque.'))).toBe(false);
    }});
  }finally{await rm(dependencyRoot,{recursive:true,force:true});}
}

test('opaque dependency catches pre-super failure and retries without recording a stale constructor ancestor',async()=>{
  const result=await recordOpaqueConstructorBoundary(`public class Main {
    static class Base { Base(int n) {} }
    public static class Broken extends Base { public Broken() { super(fail()); } }
    static int fail() { throw new IllegalStateException("before-super"); }
    static String retryValue() { return "retried"; }
    public static void main(String[] args) throws Exception {
      Object value=Class.forName("opaque.Boundary")
        .getMethod("retry",java.lang.reflect.Constructor.class,java.util.function.Supplier.class)
        .invoke(null,Broken.class.getConstructor(),(java.util.function.Supplier<String>)Main::retryValue);
      System.out.println("RESULT "+value);
      System.out.println("DONE");
    }
  }`);
  expect(result.code,result.stderr).toBe(0);expect(result.stdout).toBe('RESULT retried\nDONE\n');
  expect(result.recording).toMatchObject({state:'STOPPED_UNSUPPORTED',budget:null});
  const raw=result.rawEvents;
  const broken=raw.find(event=>event.type==='enter'&&event.className==='Main$Broken');expect(broken).toBeDefined();
  const fail=raw.find(event=>event.type==='enter'&&event.methodName==='fail');expect(fail.callerFrameId).toBe(broken.frameId);
  expect(raw.some(event=>event.type==='unwind'&&event.frameId===fail.frameId)).toBe(true);
  expect(raw.some(event=>event.type==='enter'&&event.methodName==='retryValue')).toBe(false);
  expect(raw.some(event=>event.type==='enter'&&event.seq>broken.seq&&event.callerFrameId===broken.frameId&&event.methodName!=='fail')).toBe(false);
  expect(raw.some(event=>['unwind','exit','receiver_ready'].includes(event.type)&&event.frameId===broken.frameId)).toBe(false);
  expect(raw.at(-1).type).toBe('capture_saturated');
  expect(raw.map(event=>event.seq)).toEqual(raw.map((_,index)=>index));
  expect(result.trace.events.at(-1).type).toBe('CAPTURE_STOP');
},120000);

test('legitimate opaque callback during pre-super evaluation stops conservatively and Java still completes',async()=>{
  const result=await recordOpaqueConstructorBoundary(`public class Main {
    static class Base { final int n; Base(int n) { this.n=n; } }
    static class Derived extends Base {
      Derived() throws Exception {
        super((Integer)Class.forName("opaque.Boundary").getMethod("read",java.util.function.IntSupplier.class)
          .invoke(null,(java.util.function.IntSupplier)Main::value));
      }
    }
    static int value() { return 7; }
    public static void main(String[] args) throws Exception { System.out.println("VALUE "+new Derived().n); }
  }`);
  expect(result.code,result.stderr).toBe(0);expect(result.stdout).toBe('VALUE 7\n');
  expect(result.recording).toMatchObject({state:'STOPPED_UNSUPPORTED',budget:null});
  const raw=result.rawEvents;const derived=raw.find(event=>event.type==='enter'&&event.className==='Main$Derived');
  expect(derived).toBeDefined();expect(raw.some(event=>event.type==='enter'&&event.methodName==='value')).toBe(false);
  expect(raw.some(event=>['throw','unwind','exit','receiver_ready'].includes(event.type)&&event.frameId===derived.frameId)).toBe(false);
  expect(raw.at(-1).type).toBe('capture_saturated');expect(result.trace.events.at(-1).type).toBe('CAPTURE_STOP');
},120000);

test('inherited fields accessed through a subclass use their declaring owner in state and provenance',async()=>{
  const result=await recordProgram({'Main.java':`public class Main {
    static class Base { int value=2; }
    static class Derived extends Base {}
    public static void main(String[] args) {
      Derived item=new Derived();int before=item.value;item.value=9;int after=item.value;
      System.out.println(before+":"+after);
    }
  }`});
  expect(result.code,result.stderr).toBe(0);expect(result.stdout).toBe('2:9\n');expect(result.recording.state).toBe('FULL');
  const raw=result.rawEvents.filter(event=>['field','field_read'].includes(event.type)&&event.name==='value');
  expect(raw.some(event=>event.type==='field_read')).toBe(true);
  expect(raw.every(event=>event.owner==='Main$Base'&&event.descriptor==='I')).toBe(true);
  const { seek }=await import('../src/runtime/seek.ts');const state=seek(result.trace,result.trace.events.length);
  expect(state.status).toBe('ended');const object=Object.values(state.objects).find(value=>value.className==='Main$Derived');
  const slot=`${object.id}:field:Main$Base:value:I`;
  expect(Object.keys(object.fields)).toEqual([slot]);expect(object.fields[slot].value).toMatchObject({kind:'primitive',value:9});
  const graph=state.executionGraph;expect(graph).toBeDefined();
  expect(Object.values(graph.storage).filter(storage=>storage.ownerId===object.id&&storage.kind==='field').map(storage=>storage.id)).toEqual([slot]);
  expect(graph.values[graph.storage[slot].valueId].value).toMatchObject({kind:'primitive',value:9});
  expect(graph.edges.filter(edge=>edge.kind==='FIELD_READ').every(edge=>edge.from===slot)).toBe(true);
  expect(graph.edges.filter(edge=>edge.kind==='FIELD_WRITE').every(edge=>edge.to===slot)).toBe(true);
},120000);

test('hidden base/subclass fields and differing descriptors retain distinct canonical storage',async()=>{
  const result=await recordProgram({'Main.java':`public class Main {
    static class Base { int value=1; }
    static class Hidden extends Base { int value=2; }
    static class Different extends Base { String value="child"; }
    public static void main(String[] args) {
      Hidden hidden=new Hidden();hidden.value=20;((Base)hidden).value=10;
      Different different=new Different();different.value="updated";((Base)different).value=30;
      System.out.println(((Base)hidden).value+":"+hidden.value+":"+((Base)different).value+":"+different.value);
    }
  }`});
  expect(result.code,result.stderr).toBe(0);expect(result.stdout).toBe('10:20:30:updated\n');expect(result.recording.state).toBe('FULL');
  const { seek }=await import('../src/runtime/seek.ts');const state=seek(result.trace,result.trace.events.length);expect(state.status).toBe('ended');
  const graph=state.executionGraph;expect(graph).toBeDefined();
  for(const [className,childOwner,childDescriptor,baseValue,childValue] of [
    ['Main$Hidden','Main$Hidden','I',10,20],['Main$Different','Main$Different','Ljava/lang/String;',30,'updated'],
  ]) {
    const object=Object.values(state.objects).find(value=>value.className===className);
    const baseSlot=`${object.id}:field:Main$Base:value:I`,childSlot=`${object.id}:field:${childOwner}:value:${childDescriptor}`;
    expect(new Set(Object.keys(object.fields))).toEqual(new Set([baseSlot,childSlot]));
    expect(object.fields[baseSlot].value.value).toBe(baseValue);expect(object.fields[childSlot].value.value).toBe(childValue);
    expect(new Set(Object.values(graph.storage).filter(storage=>storage.ownerId===object.id&&storage.kind==='field').map(storage=>storage.id))).toEqual(new Set([baseSlot,childSlot]));
    expect(graph.values[graph.storage[baseSlot].valueId].value.value).toBe(baseValue);
    expect(graph.values[graph.storage[childSlot].valueId].value.value).toBe(childValue);
    expect(graph.edges.some(edge=>edge.kind==='FIELD_READ'&&edge.from===baseSlot)).toBe(true);
    expect(graph.edges.some(edge=>edge.kind==='FIELD_READ'&&edge.from===childSlot)).toBe(true);
    expect(graph.edges.some(edge=>edge.kind==='FIELD_WRITE'&&edge.to===baseSlot)).toBe(true);
    expect(graph.edges.some(edge=>edge.kind==='FIELD_WRITE'&&edge.to===childSlot)).toBe(true);
  }
},120000);
