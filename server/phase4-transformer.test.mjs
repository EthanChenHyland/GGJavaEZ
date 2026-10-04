import { describe, expect, test } from 'vitest';
import { recordProgram } from '../tests/characterization/recorderHarness.mjs';
import { seek } from '../src/runtime/seek.ts';

// These launch real JVMs. Run serially, only in the lead's reserved validation slot.
const verify = (source, options = {}) => recordProgram({ 'Main.java': source }, {
  ...options, vmArgs: ['-Xverify:all', ...(options.vmArgs ?? [])],
});
const complete = result => {
  expect(result.code, result.stderr).toBe(0);
  expect(result.timedOut).toBe(false);
  expect(result.recording.state).toBe('FULL');
  expect(result.capability.diagnostics).not.toEqual(expect.arrayContaining([expect.stringMatching(/^Raw event /)]));
  expect(seek(result.trace, result.trace.events.length).status).toBe('ended');
};
const local = (result, name) => result.rawEvents.find(event => event.type === 'local' && event.name === name);
const access = (result, type, method) => result.rawEvents.filter(event => event.type === type && event.methodName === method);

describe('Phase 4 original-opcode transformer probes', () => {
  test('all primitive array opcodes preserve typed values and wide operand stacks', async () => {
    const result = await verify(`public class Main {
      static long consume(int lead,long wide,double fraction,Object tail) { return lead+wide+(long)fraction+(tail==null?0:1); }
      public static void main(String[] args) {
        byte[] bytes=new byte[1];bytes[0]=-127;byte byteRead=bytes[0];
        short[] shorts=new short[1];shorts[0]=-32000;short shortRead=shorts[0];
        int[] ints=new int[1];ints[0]=123456789;int intRead=ints[0];
        long[] longs=new long[1];longs[0]=9007199254740993L;long longRead=longs[0];
        float[] floats=new float[1];floats[0]=-0.0f;float floatRead=floats[0];
        double[] doubles=new double[1];doubles[0]=Double.NEGATIVE_INFINITY;double doubleRead=doubles[0];
        boolean[] flags=new boolean[1];flags[0]=true;boolean booleanRead=flags[0];
        char[] chars=new char[1];chars[0]=(char)0xD800;char charRead=chars[0];
        long mixed=consume(7,longs[0],doubles[0],null);
        longs[0]+=2;doubles[0]=-0.0d;
        System.out.println(byteRead+":"+shortRead+":"+intRead+":"+longRead+":"+Float.floatToRawIntBits(floatRead)+":"+doubleRead+":"+booleanRead+":"+(int)charRead);
        System.out.println(longs[0]+":"+Double.doubleToRawLongBits(doubles[0])+":"+mixed);
      }
    }`);
    complete(result);
    expect(result.stdout).toBe('-127:-32000:123456789:9007199254740993:-2147483648:-Infinity:true:55296\n9007199254740995:-9223372036854775808:-9214364837600034808\n');
    const values = {
      byteRead: { kind: 'byte', value: -127 }, shortRead: { kind: 'short', value: -32000 },
      intRead: { kind: 'int', value: 123456789 }, longRead: { kind: 'long', value: '9007199254740993' },
      floatRead: { kind: 'float', value: '-0.0' }, doubleRead: { kind: 'double', value: '-Infinity' },
      booleanRead: { kind: 'boolean', value: true }, charRead: { kind: 'char', value: '\ud800' },
    };
    for (const [name, value] of Object.entries(values)) {
      expect(local(result, name)).toMatchObject({ value, origin: { kind: 'array_read' } });
      const read = result.rawEvents.find(event => event.type === 'array_read' && event.site === local(result, name).origin.site);
      expect(read).toMatchObject({ value });
      expect(result.rawEvents.some(event => event.type === 'array_write' && event.objectId === read.objectId && JSON.stringify(event.value) === JSON.stringify(value))).toBe(true);
    }
    const invoke = result.rawEvents.find(event => event.type === 'call' && event.name === 'consume');
    expect(invoke.arguments).toEqual([{ kind: 'int', value: 7 }, { kind: 'long', value: '9007199254740993' },
      { kind: 'double', value: '-Infinity' }, { kind: 'null' }]);
    expect(invoke.argumentOrigins.map(origin => origin.kind)).toEqual(['constant', 'array_read', 'array_read', 'constant']);
    expect(result.rawText).toContain('\\ud800');
  }, 120000);

  test('reference, covariant, multi-dimensional and ragged arrays retain actual aliases', async () => {
    const result = await verify(`public class Main {
      static class Cell { int id; Cell(int id) { this.id=id; } }
      static Object pass(Object value) { return value; }
      public static void main(String[] args) {
        Cell item=new Cell(7);Cell[] cells=new Cell[2];cells[0]=item;
        Cell[] alias=cells;Cell selected=alias[0];Object passed=pass(cells[0]);
        Object[] covariant=cells;covariant[1]=null;
        String[] words=new String[1];words[0]="same";String word=words[0];
        int[][] matrix=new int[2][3];matrix[1][2]=11;int[] row=matrix[1];
        int[][] ragged=new int[3][];ragged[0]=row;ragged[1]=new int[1];ragged[2]=null;
        int[][][] partial=new int[2][1][];partial[0][0]=row;
        System.out.println((selected==item)+":"+(passed==item)+":"+(alias==cells)+":"+(ragged[0]==row)+":"+(ragged[2]==null)+":"+partial[0][0][2]+":"+word);
      }
    }`);
    complete(result);expect(result.stdout).toBe('true:true:true:true:true:11:same\n');
    const itemId=local(result,'item').value.objectId;
    expect(local(result,'selected')).toMatchObject({ value: { kind:'ref',objectId:itemId },origin:{kind:'array_read'} });
    const cellsId=local(result,'cells').value.objectId;
    expect(local(result,'alias').value.objectId).toBe(cellsId);
    expect(result.rawEvents.find(event=>event.type==='array_write'&&event.objectId===cellsId&&event.index===0)).toMatchObject({value:{kind:'ref',objectId:itemId}});
    expect(result.rawEvents.find(event=>event.type==='array_write'&&event.objectId===cellsId&&event.index===1)).toMatchObject({value:{kind:'null'}});
    const matrixId=local(result,'matrix').value.objectId,rowId=local(result,'row').value.objectId;
    expect(result.rawEvents.find(event=>event.type==='array'&&event.objectId===matrixId)).toMatchObject({elementType:'int[]',length:2});
    expect(result.rawEvents.find(event=>event.type==='array'&&event.objectId===rowId)).toMatchObject({elementType:'int',length:3});
    const raggedId=local(result,'ragged').value.objectId;
    expect(result.rawEvents.find(event=>event.type==='array_write'&&event.objectId===raggedId&&event.index===0)).toMatchObject({value:{kind:'ref',objectId:rowId}});
    expect(result.rawEvents.find(event=>event.type==='array_write'&&event.objectId===raggedId&&event.index===2)).toMatchObject({value:{kind:'null'}});
    expect(local(result,'word').origin.kind).toBe('array_read');
    expect(result.rawEvents.find(event=>event.type==='call'&&event.name==='pass').argumentOrigins[0].kind).toBe('array_read');
  },120000);

  test('raw JVM narrow stores report the value actually stored, including boolean low bits', async () => {
    // javac inserts narrowing conversions before xASTORE. Rewrite only these
    // original fixture methods so the verifier sees legal un-narrowed int operands.
    const result=await verify(`public class Main {
      static int narrowByte(byte[] a){return 0;}
      static int narrowShort(short[] a){return 0;}
      static int narrowChar(char[] a){return 0;}
      static int booleanEven(boolean[] a){return 0;}
      static int booleanOdd(boolean[] a){return 0;}
      public static void main(String[] args){System.out.println(narrowByte(new byte[1])+":"+narrowShort(new short[1])+":"+narrowChar(new char[1])+":"+booleanEven(new boolean[1])+":"+booleanOdd(new boolean[1]));}
    }`,{beforeLaunch:async prepared=>{
      const {execFileSync}=await import('node:child_process');
      const {writeFile,mkdir}=await import('node:fs/promises');
      const {delimiter,join}=await import('node:path');
      const {fileURLToPath}=await import('node:url');
      const {detectJdk}=await import('./jdk.mjs');const jdk=await detectJdk();
      const jars=['asm','asm-tree','asm-util','asm-analysis'].map(name=>fileURLToPath(new URL(`../instrumentation/lib/${name}-9.10.1.jar`,import.meta.url)));
      const generatorDir=join(prepared.temp,'narrow-generator');await mkdir(generatorDir);
      const generator=join(generatorDir,'NarrowGenerator.java');
      await writeFile(generator,`import java.nio.file.*;import org.objectweb.asm.*;import org.objectweb.asm.tree.*;
        public class NarrowGenerator implements Opcodes {
          public static void main(String[] args)throws Exception {
            Path path=Path.of(args[0]);ClassNode node=new ClassNode();new ClassReader(Files.readAllBytes(path)).accept(node,0);
            for(MethodNode method:node.methods){
              int value,store,load;
              switch(method.name){
                case "narrowByte":value=511;store=BASTORE;load=BALOAD;break;
                case "narrowShort":value=65535;store=SASTORE;load=SALOAD;break;
                case "narrowChar":value=65601;store=CASTORE;load=CALOAD;break;
                case "booleanEven":value=2;store=BASTORE;load=BALOAD;break;
                case "booleanOdd":value=3;store=BASTORE;load=BALOAD;break;
                default:continue;
              }
              method.instructions.clear();method.tryCatchBlocks.clear();method.localVariables.clear();
              method.instructions.add(new VarInsnNode(ALOAD,0));method.instructions.add(new InsnNode(ICONST_0));
              method.instructions.add(new LdcInsnNode(value));method.instructions.add(new InsnNode(store));
              method.instructions.add(new VarInsnNode(ALOAD,0));method.instructions.add(new InsnNode(ICONST_0));
              method.instructions.add(new InsnNode(load));method.instructions.add(new InsnNode(IRETURN));
            }
            ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_FRAMES|ClassWriter.COMPUTE_MAXS);node.accept(writer);Files.write(path,writer.toByteArray());
          }
        }`);
      const original=join(prepared.workingDirectory,'.classes');
      execFileSync(jdk.javacPath,['-cp',jars.join(delimiter),'-d',generatorDir,generator],{timeout:30000});
      execFileSync(jdk.javaPath,['-cp',[generatorDir,...jars].join(delimiter),'NarrowGenerator',join(original,'Main.class')],{timeout:30000});
      execFileSync(jdk.javaPath,['-cp',[prepared.helper,...jars].join(delimiter),'visualjava.OfflineTransformer',original,prepared.transformed],{timeout:30000});
    }});
    complete(result);expect(result.stdout).toBe('-1:-1:65:0:1\n');
    for(const [method,value] of [
      ['narrowByte',{kind:'byte',value:-1}],['narrowShort',{kind:'short',value:-1}],['narrowChar',{kind:'char',value:'A'}],
      ['booleanEven',{kind:'boolean',value:false}],['booleanOdd',{kind:'boolean',value:true}],
    ]) {
      expect(access(result,'array_write',method)).toHaveLength(1);expect(access(result,'array_read',method)).toHaveLength(1);
      expect(access(result,'array_write',method)[0].value).toEqual(value);expect(access(result,'array_read',method)[0].value).toEqual(value);
    }
  },120000);

  test('failed original loads, stores and allocations emit no successful observation', async () => {
    const result=await verify(`public class Main {
      static int nullRead() { int[] array=null;return array[0]; }
      static double boundsRead() { double[] array=new double[1];return array[1]; }
      static void nullWrite() { long[] array=null;array[0]=42L; }
      static void boundsWrite() { float[] array=new float[1];array[2]=3.0f; }
      static void wrongComponent() { Object[] array=new String[1];array[0]=new Object(); }
      static int[] negativePrimitive() { return new int[-1]; }
      static Object[] negativeReference() { return new Object[-1]; }
      static int[][] negativeMulti() { return new int[1][-1]; }
      public static void main(String[] args) {
        try {nullRead();}catch(NullPointerException expected){System.out.println("null-read");}
        try {boundsRead();}catch(ArrayIndexOutOfBoundsException expected){System.out.println("bounds-read");}
        try {nullWrite();}catch(NullPointerException expected){System.out.println("null-write");}
        try {boundsWrite();}catch(ArrayIndexOutOfBoundsException expected){System.out.println("bounds-write");}
        try {wrongComponent();}catch(ArrayStoreException expected){System.out.println("component");}
        try {negativePrimitive();}catch(NegativeArraySizeException expected){System.out.println("primitive");}
        try {negativeReference();}catch(NegativeArraySizeException expected){System.out.println("reference");}
        try {negativeMulti();}catch(NegativeArraySizeException expected){System.out.println("multi");}
      }
    }`);
    complete(result);expect(result.stdout).toBe('null-read\nbounds-read\nnull-write\nbounds-write\ncomponent\nprimitive\nreference\nmulti\n');
    for(const method of ['nullRead','boundsRead'])expect(access(result,'array_read',method)).toHaveLength(0);
    for(const method of ['nullWrite','boundsWrite','wrongComponent'])expect(access(result,'array_write',method)).toHaveLength(0);
    for(const method of ['negativePrimitive','negativeReference','negativeMulti'])expect(access(result,'array',method)).toHaveLength(0);
    expect(result.rawEvents.filter(event=>event.type==='throw')).toHaveLength(8);
    expect(result.rawEvents.filter(event=>event.type==='unwind').length).toBeGreaterThanOrEqual(8);
  },120000);

  test('project statics use exact declaring owners and preserve real initialization ordering', async () => {
    const result=await verify(`public class Main {
      interface Shared { Object TOKEN=new Object(); }
      static class Base { static int count;static long wide=9007199254740993L;static {count=3;System.out.println("base-init");} }
      static class Inherited extends Base implements Shared { static {System.out.println("child-init");} }
      static class Hidden extends Base { static int count=20; }
      static class Unused { static {System.out.println("UNEXPECTED");}static int value=99; }
      static class Broken {static int value=fail();static int fail(){System.out.println("broken-init");throw new IllegalStateException("bad");}}
      static int unusedMetadata() {return Unused.value;}
      public static void main(String[] args) {
        int before=Inherited.count;Inherited.count=before+4;int after=Inherited.count;
        long wideRead=Inherited.wide;Object shared=Inherited.TOKEN;
        new Inherited();Hidden.count=21;int hidden=Hidden.count;
        System.out.println(before+":"+after+":"+wideRead+":"+hidden+":"+(shared==Shared.TOKEN));
        try{int failed=Broken.value;}catch(ExceptionInInitializerError expected){System.out.println("caught-init");}
      }
    }`);
    complete(result);expect(result.stdout).toBe('base-init\nchild-init\n3:7:9007199254740993:21:true\nbroken-init\ncaught-init\n');
    const raw=result.rawEvents;
    const counts=raw.filter(event=>['static','static_read'].includes(event.type)&&event.name==='count');
    expect(new Set(counts.map(event=>event.owner))).toEqual(new Set(['Main$Base','Main$Hidden']));
    expect(counts.every(event=>event.descriptor==='I')).toBe(true);
    expect(raw.filter(event=>event.type==='static_read'&&event.name==='TOKEN').every(event=>event.owner==='Main$Shared')).toBe(true);
    expect(raw.some(event=>['static','static_read','class_state'].includes(event.type)&&event.owner==='java.lang.System')).toBe(false);
    expect(raw.some(event=>event.className==='Main$Unused'||event.owner==='Main$Unused')).toBe(false);
    for(const name of ['before','after','wideRead','hidden','shared'])expect(local(result,name).origin.kind).toBe('static_read');
    for(const owner of ['Main$Base','Main$Inherited','Main$Hidden','Main$Shared']) {
      const entered=raw.find(event=>event.type==='enter'&&event.className===owner&&event.methodName==='<clinit>');
      const started=raw.find(event=>event.type==='class_state'&&event.owner===owner&&event.initialization==='started');
      const completed=raw.find(event=>event.type==='class_state'&&event.owner===owner&&event.initialization==='completed');
      const exited=raw.find(event=>event.type==='exit'&&event.frameId===entered.frameId);
      expect(started.seq).toBeGreaterThan(entered.seq);expect(completed.seq).toBeGreaterThan(started.seq);expect(exited.seq).toBeGreaterThan(completed.seq);
    }
    const baseStart=raw.find(event=>event.type==='class_state'&&event.owner==='Main$Base'&&event.initialization==='started');
    expect(baseStart.fields.find(field=>field.name==='count')).toMatchObject({descriptor:'I',value:{kind:'int',value:0}});
    expect(raw.some(event=>event.type==='class_state'&&event.owner==='Main$Broken'&&event.initialization==='started')).toBe(true);
    expect(raw.some(event=>event.type==='class_state'&&event.owner==='Main$Broken'&&event.initialization==='completed')).toBe(false);
    expect(raw.some(event=>event.type==='static_read'&&event.owner==='Main$Broken'&&event.name==='value')).toBe(false);
  },120000);

  test('constant producer recipes preserve full-range longs, floating edge values and UTF-16', async () => {
    const result=await verify(`public class Main {
      static void edges(long max,long min,long exact,float fnan,float finf,float fneg,float fzero,double dnan,double dinf,double dneg,double dzero,String text) {
        System.out.println(max+":"+min+":"+exact+":"+Float.floatToRawIntBits(fzero)+":"+Double.doubleToRawLongBits(dzero)+":"+(int)text.charAt(0));
      }
      public static void main(String[] args) {
        edges(Long.MAX_VALUE,Long.MIN_VALUE,9007199254740993L,Float.NaN,Float.POSITIVE_INFINITY,Float.NEGATIVE_INFINITY,-0.0f,Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY,-0.0d,"\\uD800");
      }
    }`);
    complete(result);expect(result.stdout).toBe('9223372036854775807:-9223372036854775808:9007199254740993:-2147483648:-9223372036854775808:55296\n');
    const invoke=result.rawEvents.find(event=>event.type==='call'&&event.name==='edges');
    const expected=[
      {kind:'long',value:'9223372036854775807'},{kind:'long',value:'-9223372036854775808'},{kind:'long',value:'9007199254740993'},
      ...['NaN','Infinity','-Infinity','-0.0'].map(value=>({kind:'float',value})),
      ...['NaN','Infinity','-Infinity','-0.0'].map(value=>({kind:'double',value})),
      {kind:'string',value:'\ud800'},
    ];
    expect(invoke.argumentOrigins).toEqual(expected.map(value=>({kind:'constant',value})));
    expect(invoke.arguments.slice(0,-1)).toEqual(expected.slice(0,-1));
    expect(result.rawText).toContain('\\ud800');
  },120000);

  test('inner synthetic stores and array arguments before super remain verifier-safe', async () => {
    const result=await verify(`public class Main {
      int tag=11;
      static class Base {Base(long[] values,double[] numbers,Object[] refs){System.out.println(values[0]+":"+numbers[0]+":"+refs.length);}}
      class Inner extends Base {Inner(){super(new long[]{7L},new double[]{-0.0d},new Object[1]);} int outerTag(){return Main.this.tag;}}
      public static void main(String[] args){Main outer=new Main();Inner inner=outer.new Inner();System.out.println(inner.outerTag());System.out.println("ready");}
    }`);
    complete(result);expect(result.stdout).toBe('7:-0.0:1\n11\nready\n');
    const entered=result.rawEvents.find(event=>event.type==='enter'&&event.className==='Main$Inner');
    const ready=result.rawEvents.find(event=>event.type==='receiver_ready'&&event.frameId===entered.frameId);
    expect(ready).toBeDefined();
    expect(result.rawEvents.some(event=>event.type==='field'&&event.frameId===entered.frameId&&event.seq<ready.seq)).toBe(false);
    const object=result.rawEvents.find(event=>event.type==='object'&&event.objectId===ready.receiver.objectId);
    expect(object.fields.find(field=>field.name==='this$0')).toMatchObject({synthetic:true,value:{kind:'ref',objectId:local(result,'outer').value.objectId}});
  },120000);

  test('original array and static operations continue after the observation budget ends', async () => {
    const result=await verify(`public class Main {
      static long total;
      public static void main(String[] args) {
        long[] values=new long[1];double[] numbers=new double[1];Object[] refs=new Object[1];
        for(int i=0;i<1000;i++){values[0]+=2;numbers[0]+=0.5;refs[0]=values;total+=values[0];}
        System.out.println(values[0]+":"+numbers[0]+":"+(refs[0]==values)+":"+total);
        try {Object[] strings=new String[1];strings[0]=new Object();}catch(ArrayStoreException expected){System.out.println("still-throws");}
        System.err.println("stderr-alive");
      }
    }`,{rawEventLimit:12});
    expect(result.code,result.stderr).toBe(0);expect(result.timedOut).toBe(false);
    expect(result.stdout).toBe('2000:500.0:true:1001000\nstill-throws\n');expect(result.stderr).toBe('stderr-alive\n');
    expect(result.recording).toMatchObject({state:'STOPPED_LIMIT',budget:'events',executionContinued:true});
    expect(result.rawEvents.filter(event=>event.type!=='capture_saturated').length).toBeLessThanOrEqual(12);
    expect(result.rawEvents.at(-1).type).toBe('capture_saturated');
  },120000);
  test('first static write does not fabricate a previously observed old value', async () => {
    const result=await verify(`public class Main {
      static class Storage { static int total; }
      public static void main(String[] args){Storage.total=19;System.out.println(Storage.total);}
    }`);
    complete(result);expect(result.stdout).toBe('19\n');
    const snapshot=result.rawEvents.find(event=>event.type==='class_state'&&event.owner==='Main$Storage');
    expect(snapshot.initialization).toBe('observed');
    expect(snapshot.fields.find(field=>field.name==='total').value).toEqual({kind:'unsupported',javaType:'int'});
    const write=result.trace.events.find(event=>event.type==='SET_STATIC');
    const before=seek(result.trace,write.seq);
    expect(Object.values(before.classes['jvm:class:Main$Storage'].statics)[0].value.kind).toBe('unavailable');
    expect(Object.values(seek(result.trace,write.seq+1).classes['jvm:class:Main$Storage'].statics)[0].value).toEqual({kind:'primitive',javaType:'int',value:19});
  },120000);

  test('library instance fields stop only observation after the original successful opcode', async () => {
    const result=await verify(`public class Main {
      static class Child extends java.awt.Point { Child(){super(1,2);} }
      public static void main(String[] args){Child p=new Child();p.x=3;System.out.println(p.x+":"+p.y);}
    }`);
    expect(result.code,result.stderr).toBe(0);expect(result.stdout).toBe('3:2\n');
    expect(result.recording).toMatchObject({state:'STOPPED_UNSUPPORTED',executionContinued:true});
    expect(result.capability.diagnostics).not.toEqual(expect.arrayContaining([expect.stringMatching(/^Raw event /)]));
    expect(result.rawEvents.at(-1).type).toBe('capture_saturated');
  },120000);

  test('buffered in-memory streams are not file resources and inherited messages do not run overrides', async () => {
    const result=await verify(`public class Main {
      static int callbacks;
      static class Failure extends java.nio.file.FileSystemException {
        Failure(){super("ignored");}public String getReason(){callbacks++;return "callback";}
      }
      public static void main(String[] args)throws Exception {
        java.io.StringWriter sink=new java.io.StringWriter();
        try(java.io.BufferedWriter writer=new java.io.BufferedWriter(sink)){writer.write("memory");}
        try(java.io.BufferedReader reader=new java.io.BufferedReader(new java.io.StringReader(sink.toString()))){System.out.println(reader.readLine());}
        try{throw new Failure();}catch(Failure expected){System.out.println(callbacks);}
      }
    }`);
    complete(result);expect(result.stdout).toBe('memory\n0\n');
    expect(result.rawEvents.some(event=>event.type==='file_io')).toBe(false);
    expect(result.rawEvents.find(event=>event.type==='throw'&&event.className==='Main$Failure').message).toBeNull();
  },120000);

  test('failed underlying stdin reads clean up waiting without claiming consumption', async () => {
    const result=await verify(`public class Main {
      public static void main(String[] args)throws Exception {
        System.setIn(new java.io.InputStream(){public int read()throws java.io.IOException{throw new java.io.IOException("failed");}});
        Class.forName("visualjava.Recorder");
        try{System.in.read();}catch(java.io.IOException expected){System.out.println("single-failed");}
        try{System.in.read(new byte[2],0,2);}catch(java.io.IOException expected){System.out.println("buffer-failed");}
      }
    }`,{manualProbes:true});
    expect(result.code,result.stderr).toBe(0);expect(result.stdout).toBe('single-failed\nbuffer-failed\n');
    expect(result.rawEvents.filter(event=>event.type==='stdin_wait')).toHaveLength(2);
    expect(result.rawEvents.filter(event=>event.type==='stdin_read')).toHaveLength(0);
    expect(result.sidecar.waitingForInput).toBe(false);
  },120000);

  test('collection inspection opens only the observer, preserving application reflection access', async () => {
    const result=await verify(`public class Main {
      public static void main(String[] args)throws Exception {
        java.util.ArrayList<String> values=new java.util.ArrayList<>();values.add("actual");
        System.out.println(java.util.ArrayList.class.getDeclaredField("elementData").trySetAccessible());
        System.out.println(Class.forName("visualjava.Recorder").getModule().isNamed());
        System.out.println(values.get(0));
      }
    }`);
    complete(result);expect(result.stdout).toBe('false\ntrue\nactual\n');
    expect(result.rawEvents.some(event=>event.type==='library'&&event.summary.kind==='LIST'&&event.summary.size===1)).toBe(true);
  },120000);

});
