package visualjava;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.lang.ref.WeakReference;
import java.lang.reflect.Array;
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
  private static final Set<Class<?>> SEEN_CLASSES = new HashSet<>();
  private static final IdentityHashMap<Object,String> FILE_PATHS = new IdentityHashMap<>();
  private static int observationDepth;
  private static final java.util.Map<String,String> DISPATCH = new java.util.HashMap<>();
  private static final ThreadLocal<ControlContext> CONTROL = ThreadLocal.withInitial(ControlContext::new);
  private static final long EVENT_LIMIT = Long.getLong("visualjava.eventLimit", 20000L);
  private static final long BYTE_LIMIT = Long.getLong("visualjava.byteLimit", 8L * 1024 * 1024);
  private static final int OBJECT_LIMIT = 256, FRAME_LIMIT = 128;
  private static final Set<String> SCANNER_CONSUMERS = Set.of("next","nextLine","nextInt","nextLong","nextShort","nextByte","nextFloat","nextDouble","nextBoolean","nextBigInteger","nextBigDecimal");
  private static final boolean DEBUG = System.getProperty("visualjava.debugPort") != null;
  private static final Set<String> PROJECT_CLASSES = new HashSet<>(List.of(System.getProperty("visualjava.classes", "").split(",")));
  private static volatile boolean stopped;
  private static long seq, objectSequence, frameSequence, callSequence, rawBytes, firstThread, inputReads;
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
    long token;
    int line, site;
    String failedCallId;
    boolean receiverInitialized;
    Frame(String id, String owner, String method, String descriptor, int line, int site) {
      this.id=id; this.owner=owner; this.method=method; this.descriptor=descriptor; this.line=line; this.site=site; this.receiverInitialized=!method.equals("<init>");
    }
  }
  private static final class ControlContext {
    final ArrayDeque<Frame> frames = new ArrayDeque<>();
    final List<String> parameters = new ArrayList<>();
    final ArrayDeque<PendingCall> calls = new ArrayDeque<>();
    String origin;
    long tokenSequence;
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
          IDS.clear(); SEEN.clear(); SEEN_CLASSES.clear(); FILE_PATHS.clear(); DISPATCH.clear(); pending.clear();
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
    c.parameters.clear(); c.parameterBytes=0; c.propagating.clear(); c.calls.clear(); c.origin=null;
    if (!DEBUG) c.frames.clear();
  }
  /** Called under LOCK, once. Control record is reserved outside both semantic budgets. */
  private static void stop(String state, String why, String triggeringBudget) {
    if (stopped) return;
    stopped=true; recordingState=state; reason=why; budget=triggeringBudget;
    lastRecordedSeq=seq == 0 ? null : seq-1;
    pending.clear(); pendingBytes=0; serializedBytes=0;
    IDS.clear(); SEEN.clear(); SEEN_CLASSES.clear(); FILE_PATHS.clear(); DISPATCH.clear();
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
    // Class and field metadata consume the same bounded identity-observation budget.
    String category=which.equals("classes") || which.equals("object fields") ? "objects" : which;
    stop("STOPPED_LIMIT", "Recording budget exceeded: " + which, category);
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
        default: if(c<32 || Character.isSurrogate(c)) { String hex=Integer.toHexString(c); b.append("\\u"); for(int j=hex.length();j<4;j++) b.append('0'); b.append(hex); } else b.append(c);
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
      escaped+=c=='"'||c=='\\'||c=='\n'||c=='\r'||c=='\t' ? 2 : (c<32 || Character.isSurrogate(c)) ? 6 : c<128 ? 1 : c<2048 ? 2 : 3;
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
    return "\"v\":1,\"provenanceVersion\":1,\"coverageVersion\":1,\"seq\":" + sequence + ",\"threadId\":" + quote(Long.toString(Thread.currentThread().threadId()))
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
        try { int value=in.read(); inputFinished(value); return value; }
        finally { inputBoundary(false); }
      }
      @Override public int read(byte[] bytes,int offset,int length) throws IOException {
        java.util.Objects.checkFromIndexSize(offset,length,bytes.length);
        if (length==0) return in.read(bytes,offset,length);
        inputBoundary(true);
        try {
          final int readCount=in.read(bytes,offset,length);
          capture(() -> {
            Frame f=current(); room(Math.max(0,readCount));
            String text=readCount <= 0 ? "" : new String(bytes,offset,readCount,StandardCharsets.UTF_8);
            emit("stdin_read",f,f==null?-1:f.line,f==null?-1:f.site,"\"text\":"+q(text)+callContext());
          });
          return readCount;
        } finally { inputBoundary(false); }
      }
      private void inputFinished(int value) {
        capture(() -> {
          Frame f=current(); String text=value<0 ? "" : new String(new byte[]{(byte)value},StandardCharsets.UTF_8);
          emit("stdin_read",f,f==null?-1:f.line,f==null?-1:f.site,"\"text\":"+q(text)+callContext());
        });
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
          if(!text.isEmpty()) emit("console",f,f==null?-1:f.line,f==null?-1:f.site,"\"channel\":"+q(channel)+",\"text\":"+q(text)+callContext());
        });
        if (stopped) undecoded=EMPTY_BYTES;
        original.write(bytes,offset,length);
      }
      @Override public void flush() { original.flush(); }
      @Override public void close() { original.close(); }
    },true,charset);
  }

  public static void observe(Object object) { if (!stopped) capture(() -> observeValue(object)); }
  private static String ownership(Class<?> type) {
    if (PROJECT_CLASSES.contains(type.getName())) return "PROJECT";
    if (type.isSynthetic()) return "SYNTHETIC";
    return type.getClassLoader()==null || type.getClassLoader()==ClassLoader.getPlatformClassLoader() ? "JDK" : "LIBRARY";
  }
  private static String typeName(Class<?> type) { return type.isArray() ? typeName(type.getComponentType())+"[]" : type.getName(); }
  private static String metadata(Class<?> type) {
    StringBuilder result=new StringBuilder("{\"ownership\":").append(q(ownership(type)))
      .append(",\"runtimeType\":").append(q(typeName(type))).append(",\"packageName\":").append(q(type.getPackageName()))
      .append(",\"synthetic\":").append(type.isSynthetic() || type.isAnonymousClass()).append(",\"record\":").append(type.isRecord())
      .append(",\"enum\":").append(type.isEnum());
    if(type.isRecord()) {
      result.append(",\"components\":[");boolean first=true;
      for(java.lang.reflect.RecordComponent component:type.getRecordComponents()) {
        if(!first)result.append(',');first=false;
        result.append("{\"name\":").append(q(component.getName())).append(",\"javaType\":").append(q(typeName(component.getType()))).append('}');
      }
      result.append(']');
    }
    return result.append('}').toString();
  }
  private static void observeValue(Object object) { observeValue(object,false,null); }
  private static void observeValue(Object object,boolean refresh,String viewKind) {
    if (stopped) throw PAYLOAD_STOPPED;
    if (object == null) return;
    Class<?> type=object.getClass();String objectId=id(object);
    boolean seen=SEEN.put(object,Boolean.TRUE)!=null;
    if(seen && !refresh)return;
    Frame f=current();int line=f==null?-1:f.line,site=f==null?-1:f.site;
    String common="\"objectId\":"+q(objectId)+",\"metadata\":"+metadata(type);
    if(object instanceof String string) {
      if(seen)return;
      SemanticObservations.StringSnapshot snapshot=StringObservations.snapshot(string);
      emit("string_object",f,line,site,common+",\"value\":"+q(snapshot.preview)+",\"length\":"+snapshot.length+",\"truncated\":"+snapshot.truncated,type.getName(),null);
      return;
    }
    if(type.isArray()) {
      if(seen)return;
      int length=Array.getLength(object),count=Math.min(length,SemanticObservations.MAX_CHILD_REFERENCES);
      String elementDescriptor=descriptor(type.getComponentType());StringBuilder elements=new StringBuilder("[");
      observationDepth++;
      try { for(int i=0;i<count;i++){if(i>0)elements.append(',');elements.append(raw(Array.get(object,i),elementDescriptor,true));} }
      finally { observationDepth--; }
      elements.append(']');
      emit("array",f,line,site,common+",\"elementType\":"+q(typeName(type.getComponentType()))+",\"length\":"+length+",\"truncated\":"+(count<length)+",\"elements\":"+elements);
      return;
    }
    if(!PROJECT_CLASSES.contains(type.getName())) {
      SemanticObservations.CollectionSnapshot snapshot=observationDepth<8 ? CollectionObservations.snapshot(object,viewKind) : null;
      StringBuilder summary=new StringBuilder("{\"kind\":").append(q(snapshot==null?"OPAQUE":snapshot.kind));
      String boxed=boxedDescriptor(type);
      if(!boxed.isEmpty()) summary=new StringBuilder("{\"kind\":\"BOXED\",\"value\":").append(raw(object,boxed,false));
      else if(snapshot!=null) {
        if(snapshot.size!=null)summary.append(",\"size\":").append(snapshot.size);
        if(snapshot.order!=null)summary.append(",\"order\":").append(q(snapshot.order));
        summary.append(",\"truncated\":").append(snapshot.truncated);
        if(snapshot.reason!=null)summary.append(",\"reason\":").append(q(snapshot.reason));
        summary.append(",\"items\":[");observationDepth++;
        try {
          for(int i=0;i<snapshot.items.length;i++){if(i>0)summary.append(',');summary.append(raw(snapshot.items[i],"Ljava/lang/Object;",true));}
          summary.append("],\"entries\":[");
          for(int i=0;i<snapshot.entries.length;i++) {
            if(i>0)summary.append(',');SemanticObservations.Entry entry=snapshot.entries[i];
            summary.append("{\"key\":").append(raw(entry.key,"Ljava/lang/Object;",true)).append(",\"value\":").append(raw(entry.value,"Ljava/lang/Object;",true)).append('}');
          }
          summary.append(']');
        } finally { observationDepth--; }
      } else summary.append(",\"truncated\":true,\"reason\":\"Bounded observation depth\"");
      emit("library",f,line,site,common+",\"summary\":"+summary.append('}'),type.getName(),null);
      return;
    }
    StringBuilder fields=new StringBuilder("[");boolean first=true;int count=0;observationDepth++;
    try {
      for(Class<?> c=type;c!=null && PROJECT_CLASSES.contains(c.getName());c=c.getSuperclass()) for(Field field:c.getDeclaredFields()) {
        if(Modifier.isStatic(field.getModifiers()))continue;
        if(++count>256)limit("object fields");
        Object value;String encoded;
        try { if(!field.trySetAccessible())throw new IllegalAccessException();value=field.get(object);encoded=raw(value,descriptor(field.getType()),true); }
        catch(ReflectiveOperationException | SecurityException inaccessible) {encoded="{\"kind\":\"unsupported\",\"javaType\":"+q(typeName(field.getType()))+"}";}
        if(!first)fields.append(',');first=false;
        fields.append("{\"owner\":").append(q(c.getName())).append(",\"name\":").append(q(field.getName()))
          .append(",\"descriptor\":").append(q(descriptor(field.getType()))).append(",\"synthetic\":").append(field.isSynthetic())
          .append(",\"value\":").append(encoded).append('}');room(fields.length());
      }
    } finally {observationDepth--;}
    emit("object",f,line,site,common+",\"resnapshot\":"+seen+",\"fields\":"+fields.append(']'),type.getName(),null);
    if(object instanceof java.util.Collection<?> || object instanceof java.util.Map<?,?>) {
      // User subclasses keep their real project fields. Their inherited JDK
      // storage is deliberately opaque: never dispatch an overridden accessor.
      emit("library",f,line,site,common+",\"summary\":{\"kind\":\"OPAQUE\",\"truncated\":true,\"reason\":\"Project collection subclass; no safe exact-class adapter\"}",type.getName(),null);
    }
  }
  private static String boxedDescriptor(Class<?> type) {
    if(type==Boolean.class)return "Z";if(type==Byte.class)return "B";if(type==Character.class)return "C";
    if(type==Short.class)return "S";if(type==Integer.class)return "I";if(type==Long.class)return "J";
    if(type==Float.class)return "F";if(type==Double.class)return "D";return "";
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
      String literal=d=='C' ? q(String.valueOf((char)value)) : d=='J' ? q(Long.toString((Long)value)) : String.valueOf(value);
      if(d=='F'||d=='D') {
        double number=((Number)value).doubleValue();
        if(Double.isNaN(number))literal=q("NaN");else if(number==Double.POSITIVE_INFINITY)literal=q("Infinity");else if(number==Double.NEGATIVE_INFINITY)literal=q("-Infinity");
        else if(number==0 && Double.doubleToRawLongBits(number)<0)literal=q("-0.0");
      }
      return "{\"kind\":"+q(kind)+",\"value\":"+literal+"}";
    }
    if(register)observeValue(value);
    return "{\"kind\":\"ref\",\"objectId\":"+q(id(value))+",\"className\":"+q(typeName(value.getClass()))+"}";
  }
  private static final class PendingCall {
    final long token;final Frame frame;final int site,line;final String name,descriptor,targetOwner,owner;final Object[] arguments;
    PendingCall(long token,Frame frame,String name,String descriptor,String targetOwner,int site,String owner,Object[] arguments) {
      this.site=site;this.line=frame.line;this.token=token;this.frame=frame;this.name=name;this.descriptor=descriptor;this.targetOwner=targetOwner;this.owner=owner;this.arguments=arguments;
    }
  }
  private static String callContext() {
    Frame frame=current();PendingCall call=CONTROL.get().calls.peek();
    String id=call!=null && call.frame==frame?"c"+call.token:frame==null?null:frame.failedCallId;
    return id==null?"":",\"callId\":"+q(id);
  }
  public static void origin(String recipe) { if(!stopped)CONTROL.get().origin=recipe; }
  private static String takeOrigin() {
    ControlContext c=CONTROL.get();String origin=c.origin;c.origin=null;
    return origin==null?"":",\"origin\":"+origin;
  }
  /** Probe token is not a Java receiver; legal even before constructor initialization. */
  public static long enterToken(String owner,String method,String descriptor,Object receiver,int line,int site) {
    enter(owner,method,descriptor,receiver,line,site);
    ControlContext c=CONTROL.get();long token=++c.tokenSequence;
    Frame frame=c.frames.peek();if(frame!=null&&c.depth<=c.frames.size())frame.token=token;
    return token;
  }
  public static void activate(long token) { reconcile(null,token); }
  /** Reconcile only at actual caller bytecode/handlers; never invent a normal return. */
  public static void reconcile(Throwable error,long token) {
    if(stopped&&!DEBUG)return;
    ControlContext c=CONTROL.get();
    // Bounded debug overflow has no retained token; its depth bookkeeping remains unchanged.
    if(c.depth>c.frames.size())return;
    while(!c.frames.isEmpty()&&c.frames.peek().token!=token) {
      if(error!=null)unwind(error,c.frames.peek().site);
      else {
        // No throwable is observable here: observation ends instead of fabricating unwind.
        if(!stopped)capture(() -> stop("STOPPED_ERROR","Unobserved frame exit without exception evidence",null));
        leaveControl();
      }
    }
    Frame frame=c.frames.peek();
    // A real handler proves pending calls in this frame failed (there is no successful result).
    if(error!=null) {
      if(frame!=null && !c.calls.isEmpty() && c.calls.peek().frame==frame)frame.failedCallId="c"+c.calls.peek().token;
      while(!c.calls.isEmpty()&&c.calls.peek().frame==frame)c.calls.pop();
    }
  }
  /** Volatile fast path; does not alter recorder or debugger state. */
  public static boolean isRecording() { return !stopped; }
  public static long calling(int opcode,String owner,String name,String descriptor,Object receiver,Object[] arguments,String origins,String receiverOrigin,int site,String declaredTarget) {
    if(stopped)return 0;
    final long[] token={0};
    capture(() -> {
      Frame frame=current();if(frame==null)return;frame.failedCallId=null;
      long id=++callSequence;StringBuilder values=new StringBuilder("[");
      // Descriptor parsing is private and never calls into the program.
      List<String> descriptors=argumentDescriptors(descriptor);
      for(int i=0;i<arguments.length;i++){if(i>0)values.append(',');values.append(raw(arguments[i],descriptors.get(i),true));}
      values.append(']');
      String kind=switch(opcode){case 184->"static";case 185->"interface";case 183->"special";case 186->"dynamic";default->"virtual";};
      emit("call",frame,frame.line,site,"\"callId\":"+q("c"+id)+",\"invokeKind\":"+q(kind)+",\"owner\":"+q(owner)+",\"name\":"+q(name)
        +",\"callDescriptor\":"+q(descriptor)+",\"receiver\":"+(receiver==null?"null":raw(receiver,"L"+owner.replace('.','/')+";",true))
        +",\"ownership\":"+q(ownerOwnership(owner,receiver))+",\"arguments\":"+values+",\"argumentOrigins\":"+origins+",\"receiverOrigin\":"+receiverOrigin);
      String targetOwner=resolvedTarget(opcode,owner,name,descriptor,receiver,declaredTarget);
      CONTROL.get().calls.push(new PendingCall(id,frame,name,descriptor,targetOwner,site,owner,arguments));token[0]=id;
    });
    return token[0];
  }
  private static String ownerOwnership(String owner,Object receiver) {
    if(PROJECT_CLASSES.contains(owner))return "PROJECT";
    if(receiver!=null && receiver.getClass().isSynthetic())return "SYNTHETIC";
    try {Class<?> type=Class.forName(owner,false,ClassLoader.getPlatformClassLoader());return ownership(type);}
    catch(ClassNotFoundException | LinkageError | SecurityException unavailable) {return "LIBRARY";}
  }
  /** Resolve metadata only, without invoking user methods or loading classes by user loaders. */
  private static String resolvedTarget(int opcode,String owner,String name,String signature,Object receiver,String declaredTarget) {
    if(opcode==183||opcode==184)return PROJECT_CLASSES.contains(declaredTarget)?declaredTarget:null;
    if(receiver==null||!PROJECT_CLASSES.contains(receiver.getClass().getName()))return null;
    String key=receiver.getClass().getName()+"#"+name+signature;
    if(DISPATCH.containsKey(key))return DISPATCH.get(key);
    String target=resolveVirtualTarget(name,signature,receiver);
    if(DISPATCH.size()<1024)DISPATCH.put(key,target);
    return target;
  }
  private static String resolveVirtualTarget(String name,String signature,Object receiver) {
    try {
      for(Class<?> type=receiver.getClass();type!=null;type=type.getSuperclass()) {
        for(java.lang.reflect.Method method:type.getDeclaredMethods())
          if(method.getName().equals(name)&&methodDescriptor(method).equals(signature)&&!Modifier.isStatic(method.getModifiers()))
            return PROJECT_CLASSES.contains(type.getName())?type.getName():null;
      }
      // Public inherited interface default methods are actual dispatch targets too.
      for(java.lang.reflect.Method method:receiver.getClass().getMethods())
        if(method.getName().equals(name)&&methodDescriptor(method).equals(signature)&&!Modifier.isStatic(method.getModifiers()))
          return PROJECT_CLASSES.contains(method.getDeclaringClass().getName())?method.getDeclaringClass().getName():null;
    } catch(LinkageError | SecurityException unsupported) { /* unknown rather than callback guessing */ }
    return null;
  }
  private static String methodDescriptor(java.lang.reflect.Method method) {
    StringBuilder result=new StringBuilder("(");for(Class<?> parameter:method.getParameterTypes())result.append(descriptor(parameter));
    return result.append(')').append(descriptor(method.getReturnType())).toString();
  }
  private static List<String> argumentDescriptors(String descriptor) {
    List<String> result=new ArrayList<>();int i=1;
    while(descriptor.charAt(i)!=')') {int start=i;while(descriptor.charAt(i)=='[')i++;if(descriptor.charAt(i)=='L')i=descriptor.indexOf(';',i)+1;else i++;result.add(descriptor.substring(start,i));}
    return result;
  }
  public static void callReturned(long token,Object value,String descriptor,Object receiver,int newSite) {
    if(stopped||token==0)return;
    capture(() -> {
      ControlContext c=CONTROL.get();PendingCall pending=c.calls.peek();
      if(pending==null||pending.token!=token)return;
      Frame frame=pending.frame;
      String input="";
      // Scanner is final. Its successful match is consumption evidence even with read-ahead.
      // No text typed/read alone is treated as a consumed token; failed next* has no return probe.
      if(receiver instanceof java.util.Scanner scanner &&
          SCANNER_CONSUMERS.contains(pending.name)) {
        try { input=",\"inputText\":"+q(scanner.match().group()); }
        catch(IllegalStateException unavailable) { /* no successful match, no consumption claim */ }
      }
      emit("call_return",frame,pending.line,pending.site,"\"callId\":"+q("c"+token)+",\"value\":"+(descriptor.equals("V")?"{\"kind\":\"null\"}":raw(value,descriptor,true))+input);
      if(newSite>=0 && value!=null && PROJECT_CLASSES.contains(value.getClass().getName()))
        emit("constructed",frame,pending.line,pending.site,"\"objectId\":"+q(id(value))+",\"className\":"+q(value.getClass().getName())+",\"newSite\":"+newSite);
      // Only real successful calls can produce I/O facts. Never repeat the operation.
      var io=FileIoObservations.successful(pending.owner,pending.name,pending.descriptor,receiver,pending.arguments,value);
      if((pending.owner.equals("java.nio.file.Path")||pending.owner.equals("java.nio.file.Paths")) && (pending.name.equals("of")||pending.name.equals("get"))
          && value!=null && pending.arguments.length==2 && pending.arguments[0] instanceof String path && pending.arguments[1] instanceof String[] more
          && more.length==0 && path.length()<=256 && FILE_PATHS.size()<256)FILE_PATHS.put(value,path);
      // A buffered wrapper alone is not proof of a file resource (e.g. StringReader).
      if(io!=null && (receiver==null || FILE_PATHS.containsKey(receiver))) {
        String path=io.path;
        if(path==null && io.resource!=null)path=FILE_PATHS.get(io.resource);
        if(path==null && pending.arguments.length>0)path=FILE_PATHS.get(pending.arguments[0]);
        if(io.resource!=null && FILE_PATHS.size()<256 && (path!=null || receiver==null && io.operation.equals("open")))FILE_PATHS.put(io.resource,path);
        emit("file_io",frame,pending.line,pending.site,"\"operation\":"+q(io.operation)+",\"path\":"+q(path)+",\"callId\":"+q("c"+token)
          +(io.byteCount==null?"":",\"byteCount\":"+io.byteCount)+(io.charCount==null?"":",\"charCount\":"+io.charCount)
          +(io.preview==null?"":",\"preview\":"+q(io.preview))+",\"truncated\":"+io.truncated);
      }
      if(receiver!=null && (PROJECT_CLASSES.contains(receiver.getClass().getName()) || receiver instanceof java.util.Collection<?> || receiver instanceof java.util.Map<?,?>))
        observeValue(receiver,true,pending.owner.equals("java.util.Queue")?"QUEUE":pending.owner.equals("java.util.Deque")?"DEQUE":null);
      c.calls.pop();
    });
  }
  public static void receiverReady(Object receiver) {
    if(stopped)return;
    capture(() -> {Frame frame=current();if(frame!=null){frame.receiverInitialized=true;emit("receiver_ready",frame,frame.line,frame.site,"\"receiver\":"+raw(receiver,"Ljava/lang/Object;",true));}});
  }
  /** An unresolved declaration cannot produce a truthful storage identity. Java already succeeded. */
  public static void unsupportedField() {
    if(!stopped)capture(() -> stop("STOPPED_UNSUPPORTED","Field storage outside observed project declarations",null));
  }
  public static void fieldRead(Object receiver,Object value,String owner,String name,String descriptor,int site) {
    if(stopped)return;
    capture(() -> {
      observeValue(receiver);Frame frame=current();if(frame==null)return;
      emit("field_read",frame,frame.line,site,"\"objectId\":"+q(id(receiver))+",\"owner\":"+q(owner)+",\"name\":"+q(name)+",\"value\":"+raw(value,descriptor,true)+takeOrigin(),null,descriptor);
    });
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
      PendingCall pendingCall=c.calls.peek();
      String callId=pendingCall!=null && pendingCall.frame==caller && owner.equals(pendingCall.targetOwner) && pendingCall.name.equals(method) && pendingCall.descriptor.equals(descriptor) ? "c"+pendingCall.token : null;
      // An opaque library may swallow a pre-super failure before re-entering
      // project code. Without a joined call, its retained constructor ancestor
      // cannot be trusted. End observation before publishing that relationship.
      if(caller!=null && !caller.receiverInitialized && callId==null) {
        stop("STOPPED_UNSUPPORTED","Opaque callback across an uninitialized constructor boundary",null);
        throw PAYLOAD_STOPPED;
      }
      if (c.depth >= FRAME_LIMIT) limit("live frames");
      Frame frame=new Frame("f"+(++frameSequence),owner,method,descriptor,line,site);
      String receiverValue=receiver==null ? "null" : raw(receiver,"L"+owner.replace('.','/')+";",true);
      int packageEnd=owner.lastIndexOf('.');
      String entryMetadata="{\"ownership\":\"PROJECT\",\"runtimeType\":"+q(owner)+",\"packageName\":"+q(packageEnd<0?"":owner.substring(0,packageEnd))+"}";
      emit("enter",frame,line,site,"\"callerFrameId\":"+q(caller==null?null:caller.id)+",\"receiver\":"+receiverValue
        +",\"metadata\":"+entryMetadata+",\"parameters\":["+String.join(",",c.parameters)+"]"+(callId==null?"":",\"callId\":"+q(callId)));
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
        +",\"liveRange\":"+q(liveRange)+",\"value\":"+raw(value,descriptor,true)+takeOrigin());
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
        +",\"value\":"+raw(value,descriptor,true)+takeOrigin(),null,descriptor);
    });
  }
  public static void arrayRead(Object array,int index,Object value,int site) { arrayAccess("array_read",array,index,value,site); }
  public static void arrayWrite(Object array,int index,Object value,int site) { arrayAccess("array_write",array,index,value,site); }
  private static void arrayAccess(String type,Object array,int index,Object value,int site) {
    if(stopped)return;
    capture(() -> {
      observeValue(array);Frame f=current();if(f==null)return;
      Class<?> component=array.getClass().getComponentType();
      // The original opcode succeeded. Keep its operand/result, including JVM narrow
      // stores, rather than rereading a cell that another producer could have changed.
      Object actual=value;
      if(component==byte.class)actual=((Number)value).byteValue();
      else if(component==short.class)actual=((Number)value).shortValue();
      else if(component==char.class && !(value instanceof Character))actual=(char)((Number)value).intValue();
      else if(component==boolean.class && !(value instanceof Boolean))actual=(((Number)value).intValue()&1)!=0;
      emit(type,f,f.line,site,"\"objectId\":"+q(id(array))+",\"index\":"+index+",\"elementType\":"+q(component.getTypeName())+",\"value\":"+raw(actual,descriptor(component),true)+takeOrigin());
    });
  }
  public static void classInitialize(Class<?> owner,int site) {classSnapshot(owner,"started",site);}
  public static void classInitialized(Class<?> owner,int site) {classSnapshot(owner,"completed",site);}
  private static void classSnapshot(Class<?> owner,String initialization,int site) {
    classSnapshot(owner,initialization,site,null,null);
  }
  private static void classSnapshot(Class<?> owner,String initialization,int site,String justWrittenName,String justWrittenDescriptor) {
    if(stopped || !PROJECT_CLASSES.contains(owner.getName()))return;
    capture(() -> {
      if(SEEN_CLASSES.size()>=256&&!SEEN_CLASSES.contains(owner))limit("classes");
      SEEN_CLASSES.add(owner);StringBuilder fields=new StringBuilder("[");boolean first=true;
      for(Field field:owner.getDeclaredFields()) {
        if(!Modifier.isStatic(field.getModifiers()))continue;
        if(!first)fields.append(',');first=false;
        String d=descriptor(field.getType());String value;
        if(field.getName().equals(justWrittenName) && d.equals(justWrittenDescriptor))
          value="{\"kind\":\"unsupported\",\"javaType\":"+q(typeName(field.getType()))+"}";
        else try {value=field.trySetAccessible()?raw(field.get(null),d,true):"{\"kind\":\"unsupported\",\"javaType\":"+q(field.getType().getTypeName())+"}";}
        catch(ReflectiveOperationException | RuntimeException unavailable) {value="{\"kind\":\"unsupported\",\"javaType\":"+q(field.getType().getTypeName())+"}";}
        fields.append("{\"owner\":").append(q(owner.getName())).append(",\"name\":").append(q(field.getName())).append(",\"descriptor\":").append(q(d))
          .append(",\"synthetic\":").append(field.isSynthetic()).append(",\"value\":").append(value).append('}');room(fields.length());
      }
      Frame f=current();emit("class_state",f,f==null?-1:f.line,site,"\"owner\":"+q(owner.getName())+",\"initialization\":"+q(initialization)+",\"fields\":"+fields.append(']')+",\"metadata\":"+metadata(owner));
    });
  }
  public static void staticField(Class<?> owner,Object value,String name,String descriptor,int site) {staticAccess("static",owner,value,name,descriptor,site);}
  public static void staticRead(Class<?> owner,Object value,String name,String descriptor,int site) {staticAccess("static_read",owner,value,name,descriptor,site);}
  private static void staticAccess(String type,Class<?> owner,Object value,String name,String descriptor,int site) {
    if(stopped)return;
    if(!SEEN_CLASSES.contains(owner))classSnapshot(owner,"observed",site,type.equals("static")?name:null,type.equals("static")?descriptor:null);
    capture(() -> {Frame f=current();emit(type,f,f==null?-1:f.line,site,"\"owner\":"+q(owner.getName())+",\"name\":"+q(name)+",\"value\":"+raw(value,descriptor,true)+takeOrigin(),null,descriptor);});
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
    capture(() -> { Frame f=current();if(f!=null)emit("return",f,f.line,site,"\"value\":"+raw(value,descriptor,true)+takeOrigin()); });
  }
  public static void exit(int site) {
    if (!stopped) capture(() -> { Frame f=current();if(f!=null)emit("exit",f,f.line,site,""); });
    leaveControl();
  }
  private static void leaveControl() {
    ControlContext c=CONTROL.get();
    if(c.depth<=c.frames.size() && !c.frames.isEmpty()) {
      Frame exited=c.frames.pop();while(!c.calls.isEmpty()&&c.calls.peek().frame==exited)c.calls.pop();
    }
    if(c.depth>0)c.depth--;
  }
  public static void explicitThrow(Throwable error,int site) { if(error!=null) thrown(error,true,site); }
  private static String safeMessage(Throwable error) {
    try {
      Class<?> declaration=error.getClass().getMethod("getMessage").getDeclaringClass();
      // Throwable.getMessage returns its stored String directly. Overridden JDK
      // implementations can call user overrides (FileSystemException.getReason).
      if(declaration!=Throwable.class && error.getClass()!=NullPointerException.class)return null;
      return error.getMessage();
    } catch(ReflectiveOperationException | SecurityException unavailable) { return null; }
  }
  private static void thrownValue(Throwable error,boolean explicit,int site) {
    Frame f=current();if(f==null)return;
    ControlContext c=CONTROL.get();
    if(c.propagating.containsKey(error))return;
    String errorId=id(error);
    c.propagating.put(error,Boolean.TRUE);
    emit("throw",f,f.line,site,"\"objectId\":"+q(errorId)+",\"message\":"+q(safeMessage(error))+",\"explicit\":"+explicit+takeOrigin()+callContext(),error.getClass().getName(),null);
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
    if (!stopped) capture(() -> { emit("catch",f,handlerLine,site,"\"objectId\":"+q(id(error))+callContext()); CONTROL.get().propagating.remove(error);f.failedCallId=null; });
  }
  public static void finallyEntered(Throwable error,int handlerLine,int site) {
    if (stopped && !DEBUG) return;
    thrown(error,false,site);
    Frame f=checkpointFrame(handlerLine,site);if(f==null)return;
    f.line=handlerLine;f.site=site;
    if (!stopped) capture(() -> emit("finally",f,handlerLine,site,"\"objectId\":"+q(id(error))+callContext()));
  }
  public static void unwind(Throwable error,int site) {
    thrown(error,false,site);
    if (!stopped) capture(() -> { Frame f=current();if(f!=null)emit("unwind",f,f.line,site,"\"objectId\":"+q(id(error))); });
    leaveControl();
  }
}
