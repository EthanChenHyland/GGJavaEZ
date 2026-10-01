package visualjava;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.lang.ref.WeakReference;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.Charset;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;

/** Bounded observer. Never invokes user equals, hashCode or toString. */
public final class Recorder {
  // One lock orders payload dependencies, identities, trace writes and the sidecar. Never
  // enter DebugControl or write an application stream while holding it.
  private static final Object LOCK = new Object();
  private static FileChannel out;
  private static Path statusPath;
  private static final IdentityHashMap<Object, String> IDS = new IdentityHashMap<>();
  private static final IdentityHashMap<Object, Boolean> SEEN = new IdentityHashMap<>();
  private static final ThreadLocal<ControlContext> CONTROL = ThreadLocal.withInitial(ControlContext::new);
  private static final long EVENT_LIMIT = Long.getLong("visualjava.eventLimit", 20000L);
  private static final long BYTE_LIMIT = Long.getLong("visualjava.byteLimit", 8L * 1024 * 1024);
  private static final int OBJECT_LIMIT = 256, FRAME_LIMIT = 128;
  private static final boolean DEBUG = System.getProperty("visualjava.debugPort") != null;
  private static final Set<String> PROJECT_CLASSES = new HashSet<>(List.of(System.getProperty("visualjava.classes", "").split(",")));
  private static volatile boolean stopped;
  private static long seq, objectSequence, frameSequence, rawBytes, firstThread, inputReads;
  private static ControlContext recordingContext;
  private static String recordingState = "FULL", reason, budget;
  private static Long lastRecordedSeq;
  // A probe is a transaction: recursively emitted object dependencies commit together.
  // These bytes are bounded by the existing semantic budgets, never queued after stop.
  private static final List<byte[]> pending = new ArrayList<>();
  private static long pendingBytes, serializedBytes;
  private static final byte[] EMPTY_BYTES = new byte[0];
  private static final PayloadStopped PAYLOAD_STOPPED = new PayloadStopped();
  private static final class PayloadStopped extends RuntimeException {
    PayloadStopped() { super(null, null, false, false); }
  }
  private static final class Frame {
    final String id, owner, method, descriptor;
    int line, site;
    Frame(String id, String owner, String method, String descriptor, int line, int site) {
      this.id=id; this.owner=owner; this.method=method; this.descriptor=descriptor; this.line=line; this.site=site;
    }
  }
  private static final class ControlContext {
    final ArrayDeque<Frame> frames = new ArrayDeque<>();
    final List<String> parameters = new ArrayList<>();
    final IdentityHashMap<Throwable, Boolean> propagating = new IdentityHashMap<>();
    int depth;
    long parameterBytes;
    WeakReference<Throwable> debugException = new WeakReference<>(null);
  }
  static {
    // Preparation succeeded before launch; a later sink failure only stops observation.
    try {
      String path = System.getProperty("visualjava.trace");
      if (path != null && !path.isEmpty()) {
        statusPath = Path.of(path + ".status.json");
        out = FileChannel.open(Path.of(path), StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
      } else throw new IOException("visualjava.trace missing");
    } catch (Exception failure) {
      synchronized (LOCK) { stop("STOPPED_ERROR", "Trace writer unavailable", null); }
    }
    // Wrappers keep real I/O alive independently of semantic recording.
    try { System.setIn(wrappedInput(System.in)); } catch (Exception ignored) {}
    try { System.setOut(wrapped(System.out, "stdout")); } catch (Exception ignored) {}
    try { System.setErr(wrapped(System.err, "stderr")); } catch (Exception ignored) {}
    synchronized (LOCK) { writeStatus(); }
    try {
      Runtime.getRuntime().addShutdownHook(new Thread(() -> {
        synchronized (LOCK) {
          try { if (out != null) out.close(); } catch (IOException ignored) {}
          IDS.clear(); SEEN.clear(); pending.clear();
          if (recordingContext != null) clearPayload(recordingContext);
        }
      }, "VisualJava recorder cleanup"));
    } catch (Exception ignored) {}
  }
  private Recorder() {}

  private static String recordingJson() {
    return "{\"state\":" + quote(recordingState) + ",\"reason\":" + quote(reason)
      + ",\"budget\":" + quote(budget) + ",\"lastRecordedSeq\":" + lastRecordedSeq
      + ",\"executionContinued\":" + stopped + "}";
  }
  /** Constant-size replacement, including input reads after saturation. Best effort only. */
  private static void writeStatus() {
    if (statusPath == null) return;
    Path temporary = statusPath.resolveSibling(statusPath.getFileName() + ".tmp");
    try {
      Files.writeString(temporary, "{\"v\":1,\"recording\":" + recordingJson()
        + ",\"waitingForInput\":" + (inputReads > 0) + "}\n", StandardCharsets.UTF_8);
      Files.move(temporary, statusPath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    } catch (Exception ignored) {
      // No fallback to a non-atomic replacement. The previous snapshot stays readable.
      try { Files.deleteIfExists(temporary); } catch (Exception cleanupIgnored) {}
    }
  }
  private static void clearPayload(ControlContext c) {
    c.parameters.clear(); c.parameterBytes=0; c.propagating.clear();
    if (!DEBUG) c.frames.clear();
  }
  /** Called under LOCK, once. Control record is reserved outside both semantic budgets. */
  private static void stop(String state, String why, String triggeringBudget) {
    if (stopped) return;
    stopped=true; recordingState=state; reason=why; budget=triggeringBudget;
    lastRecordedSeq=seq == 0 ? null : seq-1;
    pending.clear(); pendingBytes=0; serializedBytes=0;
    IDS.clear(); SEEN.clear();
    if (recordingContext != null) clearPayload(recordingContext);
    // Null context keeps this bounded even for extremely long project identifiers.
    String record="{" + context("capture_saturated", null, -1, -1, null, null, seq)
      + ",\"recording\":" + recordingJson() + "}\n";
    byte[] bytes=record.getBytes(StandardCharsets.UTF_8);
    try {
      if (out != null && bytes.length <= 1024) { write(bytes); seq++; }
    } catch (Exception ignored) {
      // Even a failed terminal write must not throw into the application.
      try { if (out != null) { out.truncate(rawBytes); out.position(rawBytes); } } catch (Exception cleanupIgnored) {}
    } finally {
      try { if (out != null) out.close(); } catch (IOException ignored) {}
      out=null;
    }
    writeStatus();
  }
  private static void limit(String which) {
    stop("STOPPED_LIMIT", "Recording budget exceeded: " + which, which);
    throw PAYLOAD_STOPPED;
  }
  private static void write(byte[] bytes) throws IOException {
    ByteBuffer data=ByteBuffer.wrap(bytes);
    while (data.hasRemaining()) out.write(data);
  }
  private static boolean begin() {
    if (stopped) return false;
    long thread=Thread.currentThread().threadId();
    if (firstThread == 0) { firstThread=thread; recordingContext=CONTROL.get(); }
    else if (thread != firstThread) {
      stop("STOPPED_UNSUPPORTED", "Multiple application threads detected", null);
      return false;
    }
    if (seq >= EVENT_LIMIT) limit("events");
    return true;
  }
  /** All recorder exceptions are isolated here; a nested payload stop aborts its parent. */
  private static boolean capture(Runnable payload) {
    if (stopped) return false;
    synchronized (LOCK) {
      try {
        if (!begin()) return false;
        payload.run();
        // Commit complete dependency groups. On sink failure restore the last full group.
        for (byte[] bytes : pending) write(bytes);
        seq+=pending.size(); rawBytes+=pendingBytes;
        lastRecordedSeq=seq==0 ? null : seq-1;
        pending.clear(); pendingBytes=0; serializedBytes=0;
        return true;
      } catch (PayloadStopped ignored) { return false; }
      catch (Throwable failure) {
        try { if (out != null) { out.truncate(rawBytes); out.position(rawBytes); } } catch (Exception ignored) {}
        stop("STOPPED_ERROR", "Recorder probe or trace write failed", null);
        return false;
      }
    }
  }
  private static void room(long size) {
    if (stopped) throw PAYLOAD_STOPPED;
    if (size > BYTE_LIMIT - rawBytes - pendingBytes) limit("bytes");
  }
  // Bound all simultaneously held recursive serialization, not just the final record.
  // Conservative reservation may stop a large probe before its final UTF-8 size is known.
  private static void reserve(long size) {
    long retained=recordingContext==null ? 0 : recordingContext.parameterBytes;
    if (size > BYTE_LIMIT - rawBytes - pendingBytes - serializedBytes - retained) limit("bytes");
    serializedBytes+=size;
  }
  private static String quote(String s) {
    if (s == null) return "null";
    StringBuilder b = new StringBuilder("\"");
    for (int i=0;i<s.length();i++) {
      char c=s.charAt(i);
      switch(c) {
        case '"': b.append("\\\""); break;
        case '\\': b.append("\\\\"); break;
        case '\n': b.append("\\n"); break;
        case '\r': b.append("\\r"); break;
        case '\t': b.append("\\t"); break;
        default: if(c<32) { String hex=Integer.toHexString(c); b.append("\\u"); for(int j=hex.length();j<4;j++) b.append('0'); b.append(hex); } else b.append(c);
      }
    }
    return b.append('"').toString();
  }
  private static String q(String s) {
    room(s == null ? 4 : (long)s.length()+2);
    // Escaping may expand the payload; don't create an unbounded temporary string.
    if (s == null) return "null";
    long escaped=2;
    for (int i=0;i<s.length();i++) {
      char c=s.charAt(i);
      escaped+=c=='"'||c=='\\'||c=='\n'||c=='\r'||c=='\t' ? 2 : c<32 ? 6 : c<128 ? 1 : c<2048 ? 2 : 3;
      room(escaped);
    }
    reserve(escaped);
    return quote(s);
  }
  private static String id(Object object) {
    if (object == null) return null;
    if (stopped) throw PAYLOAD_STOPPED;
    String existing=IDS.get(object);
    if (existing != null) return existing;
    if (objectSequence >= OBJECT_LIMIT) limit("objects");
    String created="o" + (++objectSequence); IDS.put(object, created); return created;
  }
  private static String context(String type, Frame frame, int line, int site, String classOverride, String descriptorOverride, long sequence) {
    return "\"v\":1,\"seq\":" + sequence + ",\"threadId\":" + quote(Long.toString(Thread.currentThread().threadId()))
      + ",\"type\":" + quote(type) + ",\"frameId\":" + quote(frame == null ? null : frame.id)
      + ",\"className\":" + quote(classOverride == null ? frame == null ? null : frame.owner : classOverride) + ",\"methodName\":" + quote(frame == null ? null : frame.method)
      + ",\"descriptor\":" + quote(descriptorOverride == null ? frame == null ? null : frame.descriptor : descriptorOverride) + ",\"line\":" + (line > 0 ? line : "null")
      + ",\"site\":" + (site >= 0 ? site : "null");
  }
  private static Frame current() { return CONTROL.get().frames.peek(); }
  private static void emit(String type, Frame frame, int line, int site, String payload) { emit(type,frame,line,site,payload,null,null); }
  private static void emit(String type, Frame frame, int line, int site, String payload,String classOverride,String descriptorOverride) {
    if (stopped) throw PAYLOAD_STOPPED;
    if (seq + pending.size() >= EVENT_LIMIT) limit("events");
    String record="{" + context(type,frame,line,site,classOverride,descriptorOverride,seq + pending.size()) + (payload.isEmpty() ? "" : "," + payload) + "}\n";
    byte[] bytes=record.getBytes(StandardCharsets.UTF_8); room(bytes.length);
    pending.add(bytes); pendingBytes+=bytes.length;
  }

  /** Actual underlying reads, with original validation, byte values, EOF and exceptions. */
  private static InputStream wrappedInput(InputStream original) {
    return new FilterInputStream(original) {
      @Override public int read() throws IOException {
        inputBoundary(true);
        int value=-1;
        try { value=in.read(); return value; }
        finally { inputFinished(value); }
      }
      @Override public int read(byte[] bytes,int offset,int length) throws IOException {
        java.util.Objects.checkFromIndexSize(offset,length,bytes.length);
        if (length==0) return in.read(bytes,offset,length);
        inputBoundary(true);
        int count=-1;
        try { count=in.read(bytes,offset,length); return count; }
        finally {
          final int readCount=count;
          capture(() -> {
            Frame f=current(); room(Math.max(0,readCount));
            String text=readCount <= 0 ? "" : new String(bytes,offset,readCount,StandardCharsets.UTF_8);
            emit("stdin_read",f,f==null?-1:f.line,f==null?-1:f.site,"\"text\":"+q(text));
          });
          inputBoundary(false);
        }
      }
      private void inputFinished(int value) {
        capture(() -> {
          Frame f=current(); String text=value<0 ? "" : new String(new byte[]{(byte)value},StandardCharsets.UTF_8);
          emit("stdin_read",f,f==null?-1:f.line,f==null?-1:f.site,"\"text\":"+q(text));
        });
        inputBoundary(false);
      }
    };
  }
  private static void inputBoundary(boolean waiting) {
    synchronized (LOCK) {
      if (waiting) inputReads++; else if (inputReads > 0) inputReads--;
      if (waiting) capture(() -> { Frame f=current(); emit("stdin_wait",f,f==null?-1:f.line,f==null?-1:f.site,""); });
      writeStatus();
    }
  }
  /** Decode only while recording; original streams receive every byte, even on failure. */
  private static PrintStream wrapped(PrintStream original, String channel) {
    Charset charset=original.charset();
    CharsetDecoder decoder=charset.newDecoder().onMalformedInput(CodingErrorAction.REPLACE).onUnmappableCharacter(CodingErrorAction.REPLACE);
    return new PrintStream(new OutputStream() {
      private byte[] undecoded=EMPTY_BYTES;
      @Override public void write(int value) {
        if (stopped) { original.write(value); return; }
        write(new byte[]{(byte)value},0,1);
      }
      @Override public void write(byte[] bytes,int offset,int length) {
        if (!stopped) capture(() -> {
          // A huge console write may saturate, but its actual bytes still bypass below.
          room((long)undecoded.length+length);
          byte[] combined=new byte[undecoded.length+length];
          System.arraycopy(undecoded,0,combined,0,undecoded.length);System.arraycopy(bytes,offset,combined,undecoded.length,length);
          ByteBuffer input=ByteBuffer.wrap(combined);CharBuffer output=CharBuffer.allocate(combined.length+2);
          decoder.decode(input,output,false);undecoded=new byte[input.remaining()];input.get(undecoded);
          output.flip();String text=output.toString();Frame f=current();
          if(!text.isEmpty()) emit("console",f,f==null?-1:f.line,f==null?-1:f.site,"\"channel\":"+q(channel)+",\"text\":"+q(text));
        });
        if (stopped) undecoded=EMPTY_BYTES;
        original.write(bytes,offset,length);
      }
      @Override public void flush() { original.flush(); }
      @Override public void close() { original.close(); }
    },true,charset);
  }

  public static void observe(Object object) { if (!stopped) capture(() -> observeValue(object)); }
  private static void observeValue(Object object) {
    if (stopped) throw PAYLOAD_STOPPED;
    if (object == null || object instanceof String) return;
    if (object instanceof int[] array) {
      String objectId=id(object); if (SEEN.put(object, Boolean.TRUE) != null) return;
      room((long)array.length*2+2);
      StringBuilder elements=new StringBuilder("[");
      reserve(2);
      for(int i=0;i<array.length;i++) {
        String value=Integer.toString(array[i]); reserve(value.length()+(i>0 ? 1 : 0));
        if(i>0) elements.append(','); elements.append(value); room(elements.length());
      }
      elements.append(']');
      Frame f=current(); emit("array", f, f==null ? -1:f.line, f==null ? -1:f.site,
        "\"objectId\":"+q(objectId)+",\"elementType\":\"int\",\"elements\":"+elements);
      return;
    }
    Class<?> type=object.getClass();
    if (type.isArray() || !PROJECT_CLASSES.contains(type.getName())) return;
    String objectId=id(object); if (SEEN.put(object, Boolean.TRUE) != null) return;
    StringBuilder fields=new StringBuilder("["); boolean first=true;
    for(Class<?> c=type;c!=null && c.getClassLoader()!=null;c=c.getSuperclass()) for(Field field:c.getDeclaredFields()) {
      if(Modifier.isStatic(field.getModifiers()) || field.isSynthetic()) continue;
      try {
        field.setAccessible(true); Object value=field.get(object);
        if(!first) fields.append(','); first=false;
        fields.append("{\"owner\":").append(q(c.getName())).append(",\"name\":").append(q(field.getName()))
          .append(",\"descriptor\":").append(q(descriptor(field.getType()))).append(",\"value\":")
          .append(raw(value,descriptor(field.getType()),true)).append('}');
        room(fields.length());
      } catch (ReflectiveOperationException e) { throw new IllegalStateException("Cannot inspect field",e); }
    }
    fields.append(']'); Frame f=current(); emit("object",f,f==null?-1:f.line,f==null?-1:f.site,
      "\"objectId\":"+q(objectId)+",\"fields\":"+fields,type.getName(),null);
  }
  private static String descriptor(Class<?> type) {
    if(type==void.class)return "V"; if(type==boolean.class)return "Z"; if(type==byte.class)return "B";
    if(type==char.class)return "C"; if(type==short.class)return "S"; if(type==int.class)return "I";
    if(type==long.class)return "J"; if(type==float.class)return "F"; if(type==double.class)return "D";
    if(type.isArray())return type.getName().replace('.','/'); return "L"+type.getName().replace('.','/')+";";
  }
  private static String raw(Object value,String descriptor,boolean register) {
    if (stopped) throw PAYLOAD_STOPPED;
    if(value==null) return "{\"kind\":\"null\"}";
    char d=descriptor.charAt(0);
    String kind=switch(d) { case 'Z'->"boolean";case 'B'->"byte";case 'C'->"char";case 'S'->"short";case 'I'->"int";case 'J'->"long";case 'F'->"float";case 'D'->"double";default->""; };
    if(!kind.isEmpty()) {
      String literal = d=='C' ? q(String.valueOf((char)value)) : String.valueOf(value);
      if((d=='F'||d=='D') && !Double.isFinite(((Number)value).doubleValue())) return "{\"kind\":\"unsupported\",\"javaType\":"+q(descriptor)+"}";
      return "{\"kind\":"+q(kind)+",\"value\":"+literal+"}";
    }
    if(value instanceof String s) return "{\"kind\":\"string\",\"value\":"+q(s)+"}";
    if(value instanceof int[]) { if(register) observeValue(value); return "{\"kind\":\"ref\",\"objectId\":"+q(id(value))+",\"className\":\"int[]\"}"; }
    if(value.getClass().isArray() || !PROJECT_CLASSES.contains(value.getClass().getName()))
      return "{\"kind\":\"unsupported\",\"javaType\":"+q(value.getClass().getName())+"}";
    if(register) observeValue(value);
    return "{\"kind\":\"ref\",\"objectId\":"+q(id(value))+",\"className\":"+q(value.getClass().getName())+"}";
  }
  public static void parameter(int slot,String name,String descriptor,String liveRange,Object value) {
    if (stopped) return;
    capture(() -> {
      ControlContext c=CONTROL.get();
      String parameter="{\"slot\":"+slot+",\"name\":"+q(name)+",\"descriptor\":"+q(descriptor)
        +",\"liveRange\":"+q(liveRange)+",\"value\":"+raw(value,descriptor,true)+"}";
      long bytes=parameter.getBytes(StandardCharsets.UTF_8).length;
      room(c.parameterBytes+bytes);
      // JVM descriptor parameter slots are bounded; also bound accidental repeated probes.
      if (c.parameters.size() >= 255) { stop("STOPPED_ERROR", "Parameter probe capacity exceeded", null); throw PAYLOAD_STOPPED; }
      c.parameters.add(parameter); c.parameterBytes+=bytes;
    });
  }
  public static void enter(String owner,String method,String descriptor,Object receiver,int line,int site) {
    ControlContext c=CONTROL.get();
    Frame[] entered=stopped ? null : new Frame[1];
    boolean recorded=capture(() -> {
      Frame caller=c.frames.peek();
      if (c.depth >= FRAME_LIMIT) limit("live frames");
      Frame frame=new Frame("f"+(++frameSequence),owner,method,descriptor,line,site);
      String receiverValue=receiver==null ? "null" : raw(receiver,"L"+owner.replace('.','/')+";",true);
      emit("enter",frame,line,site,"\"callerFrameId\":"+q(caller==null?null:caller.id)+",\"receiver\":"+receiverValue
        +",\"parameters\":["+String.join(",",c.parameters)+"]");
      entered[0]=frame;
    });
    synchronized (LOCK) {
      c.parameters.clear(); c.parameterBytes=0; c.depth++;
      if (c.frames.size()<FRAME_LIMIT && (!stopped || DEBUG)) {
        Frame frame=!recorded || entered==null ? null : entered[0];
        if (frame==null) frame=new Frame(debugId(c.depth),owner,method,descriptor,line,site);
        c.frames.push(frame);
      }
    }
  }
  private static String debugId(int depth) { return "debug:"+Thread.currentThread().threadId()+":"+depth; }
  /** Overflow is represented by depth, not retained frames. Recover only current metadata. */
  private static Frame checkpointFrame(int line,int site) {
    ControlContext c=CONTROL.get();
    if (c.depth<=c.frames.size()) return c.frames.peek();
    if (!DEBUG) return null;
    return StackWalker.getInstance().walk(frames -> frames.filter(frame -> PROJECT_CLASSES.contains(frame.getClassName()))
      .findFirst().map(frame -> new Frame(debugId(c.depth),frame.getClassName(),frame.getMethodName(),null,line>0 ? line : frame.getLineNumber(),site)).orElse(null));
  }
  public static void line(int line,int site) {
    if (stopped && !DEBUG) return;
    Frame[] snapshot=new Frame[1]; int[] depth=new int[1]; long[] watermark=new long[1];
    synchronized (LOCK) {
      Frame f=checkpointFrame(line,site); if(f==null)return;
      f.line=line;f.site=site;
      capture(() -> emit("line",f,line,site,""));
      snapshot[0]=f; depth[0]=CONTROL.get().depth; watermark[0]=seq;
    }
    Frame f=snapshot[0];
    DebugControl.checkpoint(f.id,f.owner,f.method,line,depth[0],watermark[0]);
  }
  public static void entryCheckpoint() {
    if (stopped && !DEBUG) return;
    Frame f=checkpointFrame(-1,-1);
    if (f!=null && f.line>0) line(f.line,f.site);
  }
  public static void site(int line,int site) {
    if (stopped && !DEBUG) return;
    Frame f=checkpointFrame(line,site); if(f!=null) { f.line=line;f.site=site; }
  }
  public static void local(int slot,String name,String descriptor,String liveRange,Object value,int site) {
    if (stopped) return;
    capture(() -> {
      Frame f=current();if(f==null)return;f.site=site;
      emit("local",f,f.line,site,"\"slot\":"+slot+",\"name\":"+q(name)+",\"descriptor\":"+q(descriptor)
        +",\"liveRange\":"+q(liveRange)+",\"value\":"+raw(value,descriptor,true));
    });
  }
  public static void localEnd(int slot,String liveRange,int site) {
    if (stopped) return;
    capture(() -> { Frame f=current();if(f!=null)emit("local_end",f,f.line,site,"\"slot\":"+slot+",\"liveRange\":"+q(liveRange)); });
  }
  public static void field(Object receiver,Object value,String owner,String name,String descriptor,int site) {
    if (stopped) return;
    capture(() -> {
      Frame f=current();if(f==null)return;f.site=site;
      emit("field",f,f.line,site,"\"objectId\":"+q(id(receiver)) + ",\"owner\":"+q(owner)+",\"name\":"+q(name)
        +",\"value\":"+raw(value,descriptor,true),null,descriptor);
    });
  }
  public static void arrayRead(int[] array,int index,int value,int site) { arrayAccess("array_read",array,index,value,site); }
  public static void arrayWrite(int[] array,int index,int value,int site) { arrayAccess("array_write",array,index,value,site); }
  private static void arrayAccess(String type,int[] array,int index,int value,int site) {
    if (stopped) return;
    capture(() -> { observeValue(array); Frame f=current();if(f!=null)emit(type,f,f.line,site,"\"objectId\":"+q(id(array))+",\"index\":"+index+",\"value\":"+value); });
  }
  public static void branch(int opcode,Object left,Object right,int site) {
    if (stopped) return;
    capture(() -> {
      int a=left instanceof Number n?n.intValue():0,b=right instanceof Number n?n.intValue():0;
      boolean taken=switch(opcode) {
        case 153->a==0;case 154->a!=0;case 155->a<0;case 156->a>=0;case 157->a>0;case 158->a<=0;
        case 159->a==b;case 160->a!=b;case 161->a<b;case 162->a>=b;case 163->a>b;case 164->a<=b;
        case 165->left==right;case 166->left!=right;case 198->left==null;case 199->left!=null;default->false;
      };
      Frame f=current();if(f==null)return;f.site=site;
      String ld=opcode>=198||opcode==165||opcode==166?"Ljava/lang/Object;":"I";
      emit("branch",f,f.line,site,"\"opcode\":"+opcode+",\"left\":"+raw(left,ld,true)
        +(right==null && opcode!=165 && opcode!=166 ? "" : ",\"right\":"+raw(right,ld,true))+",\"taken\":"+taken);
    });
  }
  public static void returned(Object value,String descriptor,int site) {
    if (stopped) return;
    capture(() -> { Frame f=current();if(f!=null)emit("return",f,f.line,site,"\"value\":"+raw(value,descriptor,true)); });
  }
  public static void exit(int site) {
    if (!stopped) capture(() -> { Frame f=current();if(f!=null)emit("exit",f,f.line,site,""); });
    leaveControl();
  }
  private static void leaveControl() {
    ControlContext c=CONTROL.get();
    if(c.depth<=c.frames.size() && !c.frames.isEmpty()) c.frames.pop();
    if(c.depth>0)c.depth--;
  }
  public static void explicitThrow(Throwable error,int site) { if(error!=null) thrown(error,true,site); }
  private static String safeMessage(Throwable error) {
    try {
      if(error.getClass().getMethod("getMessage").getDeclaringClass().getClassLoader()!=null)return null;
      return error.getMessage();
    } catch(ReflectiveOperationException | SecurityException unavailable) { return null; }
  }
  private static void thrownValue(Throwable error,boolean explicit,int site) {
    Frame f=current();if(f==null)return;
    ControlContext c=CONTROL.get();
    if(c.propagating.containsKey(error))return;
    String errorId=id(error);
    c.propagating.put(error,Boolean.TRUE);
    emit("throw",f,f.line,site,"\"objectId\":"+q(errorId)+",\"message\":"+q(safeMessage(error))+",\"explicit\":"+explicit,error.getClass().getName(),null);
  }
  private static void thrown(Throwable error,boolean explicit,int site) {
    if (stopped && !DEBUG) return;
    boolean[] first={stopped};
    Frame[] snapshot=new Frame[1]; int[] depth=new int[1]; long[] watermark=new long[1];
    synchronized (LOCK) {
      boolean wasStopped=stopped;
      capture(() -> { first[0]=!CONTROL.get().propagating.containsKey(error); thrownValue(error,explicit,site); });
      if (stopped && DEBUG) {
        ControlContext c=CONTROL.get();
        first[0]=wasStopped ? c.debugException.get()!=error : first[0];
        c.debugException=new WeakReference<>(error);
      }
      Frame f=checkpointFrame(-1,site); if(f==null)return;
      snapshot[0]=f;depth[0]=CONTROL.get().depth;watermark[0]=seq;
    }
    Frame f=snapshot[0];
    if(first[0] && f.line>0) DebugControl.exception(f.id,f.owner,f.method,f.line,depth[0],watermark[0]);
  }
  public static void caught(Throwable error,int handlerLine,int site) {
    if (stopped && !DEBUG) return;
    thrown(error,false,site);
    Frame f=checkpointFrame(handlerLine,site);if(f==null)return;
    f.line=handlerLine;f.site=site;
    if (DEBUG && CONTROL.get().debugException.get()==error) CONTROL.get().debugException.clear();
    if (!stopped) capture(() -> { emit("catch",f,handlerLine,site,"\"objectId\":"+q(id(error))); CONTROL.get().propagating.remove(error); });
  }
  public static void finallyEntered(Throwable error,int handlerLine,int site) {
    if (stopped && !DEBUG) return;
    thrown(error,false,site);
    Frame f=checkpointFrame(handlerLine,site);if(f==null)return;
    f.line=handlerLine;f.site=site;
    if (!stopped) capture(() -> emit("finally",f,handlerLine,site,"\"objectId\":"+q(id(error))));
  }
  public static void unwind(Throwable error,int site) {
    thrown(error,false,site);
    if (!stopped) capture(() -> { Frame f=current();if(f!=null)emit("unwind",f,f.line,site,"\"objectId\":"+q(id(error))); });
    leaveControl();
  }
}
