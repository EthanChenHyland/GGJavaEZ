package visualjava;

import java.io.BufferedWriter;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;

/** Probe sink. It never invokes user equals, hashCode or toString. */
public final class Recorder {
  private static final BufferedWriter OUT;
  private static final IdentityHashMap<Object, String> IDS = new IdentityHashMap<>();
  private static final IdentityHashMap<Object, Boolean> SEEN = new IdentityHashMap<>();
  private static final ThreadLocal<ArrayDeque<Frame>> STACK = ThreadLocal.withInitial(ArrayDeque::new);
  private static final ThreadLocal<List<String>> PARAMETERS = ThreadLocal.withInitial(ArrayList::new);
  private static long seq, objectSequence, frameSequence, rawBytes;
  private static final long EVENT_LIMIT = Long.getLong("visualjava.eventLimit", 20000L);
  private static final long BYTE_LIMIT = Long.getLong("visualjava.byteLimit", 8L*1024*1024);
  private static void limit(String reason) { System.err.println("[VisualJava] trace limit exceeded: " + reason); System.err.flush(); Runtime.getRuntime().halt(86); }
  private static final Set<String> PROJECT_CLASSES = new HashSet<>(List.of(System.getProperty("visualjava.classes", "").split(",")));
  private static final class Frame {
    final String id, owner, method, descriptor;
    int line, site;
    Frame(String id, String owner, String method, String descriptor, int line, int site) {
      this.id=id; this.owner=owner; this.method=method; this.descriptor=descriptor; this.line=line; this.site=site;
    }
  }
  static {
    try {
      String path = System.getProperty("visualjava.trace");
      if (path == null || path.isEmpty()) throw new IllegalStateException("visualjava.trace missing");
      OUT = Files.newBufferedWriter(Path.of(path), StandardCharsets.UTF_8);
      Runtime.getRuntime().addShutdownHook(new Thread(() -> { try { synchronized (OUT) { OUT.flush(); OUT.close(); } } catch (IOException ignored) {} }));
    } catch (IOException e) { throw new ExceptionInInitializerError(e); }
  }
  private Recorder() {}
  private static String q(String s) {
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
  private static String id(Object object) {
    if (object == null) return null;
    synchronized (IDS) { return IDS.computeIfAbsent(object, ignored -> { if(objectSequence>=256) limit("objects"); return "o" + (++objectSequence); }); }
  }
  private static String context(String type, Frame frame, int line, int site, String classOverride, String descriptorOverride) {
    return "\"v\":1,\"seq\":" + (seq++) + ",\"threadId\":" + q(Long.toString(Thread.currentThread().threadId()))
      + ",\"type\":" + q(type) + ",\"frameId\":" + q(frame == null ? null : frame.id)
      + ",\"className\":" + q(classOverride == null ? frame == null ? null : frame.owner : classOverride) + ",\"methodName\":" + q(frame == null ? null : frame.method)
      + ",\"descriptor\":" + q(descriptorOverride == null ? frame == null ? null : frame.descriptor : descriptorOverride) + ",\"line\":" + (line > 0 ? line : "null")
      + ",\"site\":" + (site >= 0 ? site : "null");
  }
  private static Frame current() { return STACK.get().peek(); }
  private static void emit(String type, Frame frame, int line, int site, String payload) { emit(type,frame,line,site,payload,null,null); }
  private static void emit(String type, Frame frame, int line, int site, String payload,String classOverride,String descriptorOverride) {
    synchronized (OUT) {
      try {
        if(seq>=EVENT_LIMIT) limit("events");
        String record="{" + context(type,frame,line,site,classOverride,descriptorOverride) + (payload.isEmpty() ? "" : "," + payload) + "}\n";
        long length=record.getBytes(StandardCharsets.UTF_8).length;
        if(rawBytes+length>BYTE_LIMIT) limit("bytes");
        OUT.write(record); OUT.flush(); rawBytes+=length;
      }
      catch (IOException e) { throw new IllegalStateException("Trace write failed", e); }
    }
  }
  private static String binary(Class<?> type) { return type.getName(); }
  public static void observe(Object object) {
    if (object == null || object instanceof String) return;
    if (object instanceof int[] array) {
      String objectId;
      synchronized (IDS) { objectId=id(object); if (SEEN.put(object, Boolean.TRUE) != null) return; }
      StringBuilder elements=new StringBuilder("[");
      for(int i=0;i<array.length;i++) { if(i>0) elements.append(','); elements.append(array[i]); }
      elements.append(']');
      Frame f=current(); emit("array", f, f==null ? -1:f.line, f==null ? -1:f.site,
        "\"objectId\":"+q(objectId)+",\"elementType\":\"int\",\"elements\":"+elements);
      return;
    }
    Class<?> type=object.getClass();
    if (type.isArray() || !PROJECT_CLASSES.contains(type.getName())) return;
    String objectId;
    synchronized (IDS) { objectId=id(object); if (SEEN.put(object, Boolean.TRUE) != null) return; }
    StringBuilder fields=new StringBuilder("["); boolean first=true;
    for(Class<?> c=type;c!=null && c.getClassLoader()!=null;c=c.getSuperclass()) for(Field field:c.getDeclaredFields()) {
      if(Modifier.isStatic(field.getModifiers()) || field.isSynthetic()) continue;
      try {
        field.setAccessible(true); Object value=field.get(object);
        if(!first) fields.append(','); first=false;
        fields.append("{\"owner\":").append(q(c.getName())).append(",\"name\":").append(q(field.getName()))
          .append(",\"descriptor\":").append(q(descriptor(field.getType()))).append(",\"value\":")
          .append(raw(value,descriptor(field.getType()),true)).append('}');
      } catch (ReflectiveOperationException | RuntimeException e) { throw new IllegalStateException("Cannot inspect field " + c.getName() + "." + field.getName(),e); }
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
    if(value==null) return "{\"kind\":\"null\"}";
    char d=descriptor.charAt(0);
    String kind=switch(d) { case 'Z'->"boolean";case 'B'->"byte";case 'C'->"char";case 'S'->"short";case 'I'->"int";case 'J'->"long";case 'F'->"float";case 'D'->"double";default->""; };
    if(!kind.isEmpty()) {
      String literal = d=='C' ? q(String.valueOf((char)value)) : d=='Z' ? String.valueOf(value) : String.valueOf(value);
      if((d=='F'||d=='D') && !Double.isFinite(((Number)value).doubleValue())) return "{\"kind\":\"unsupported\",\"javaType\":"+q(descriptor)+"}";
      return "{\"kind\":"+q(kind)+",\"value\":"+literal+"}";
    }
    if(value instanceof String s) return "{\"kind\":\"string\",\"value\":"+q(s)+"}";
    if(value instanceof int[]) { if(register) observe(value); return "{\"kind\":\"ref\",\"objectId\":"+q(id(value))+",\"className\":\"int[]\"}"; }
    if(value.getClass().isArray() || !PROJECT_CLASSES.contains(value.getClass().getName()))
      return "{\"kind\":\"unsupported\",\"javaType\":"+q(value.getClass().getName())+"}";
    if(register) observe(value);
    return "{\"kind\":\"ref\",\"objectId\":"+q(id(value))+",\"className\":"+q(binary(value.getClass()))+"}";
  }
  public static void parameter(int slot,String name,String descriptor,String liveRange,Object value) {
    PARAMETERS.get().add("{\"slot\":"+slot+",\"name\":"+q(name)+",\"descriptor\":"+q(descriptor)
      +",\"liveRange\":"+q(liveRange)+",\"value\":"+raw(value,descriptor,true)+"}");
  }
  public static void enter(String owner,String method,String descriptor,Object receiver,int line,int site) {
    ArrayDeque<Frame> stack=STACK.get(); Frame caller=stack.peek();
    if(stack.size()>=128) limit("live frames");
    String frameId; synchronized (IDS) { frameId="f"+(++frameSequence); }
    Frame frame=new Frame(frameId,owner,method,descriptor,line,site);
    String receiverValue=receiver==null ? "null" : raw(receiver,"L"+owner.replace('.','/')+";",true);
    List<String> params=PARAMETERS.get();
    emit("enter",frame,line,site,"\"callerFrameId\":"+q(caller==null?null:caller.id)+",\"receiver\":"+receiverValue
      +",\"parameters\":["+String.join(",",params)+"]");
    params.clear(); stack.push(frame);
  }
  public static void line(int line,int site) { Frame f=current(); if(f==null)return; f.line=line;f.site=site;emit("line",f,line,site,""); }
  public static void local(int slot,String name,String descriptor,String liveRange,Object value,int site) {
    Frame f=current();if(f==null)return;f.site=site;
    emit("local",f,f.line,site,"\"slot\":"+slot+",\"name\":"+q(name)+",\"descriptor\":"+q(descriptor)
      +",\"liveRange\":"+q(liveRange)+",\"value\":"+raw(value,descriptor,true));
  }
  public static void localEnd(int slot,String liveRange,int site) { Frame f=current();if(f!=null)emit("local_end",f,f.line,site,"\"slot\":"+slot+",\"liveRange\":"+q(liveRange)); }
  public static void field(Object receiver,Object value,String owner,String name,String descriptor,int site) {
    Frame f=current();if(f==null)return;f.site=site;
    emit("field",f,f.line,site,"\"objectId\":"+q(id(receiver)) + ",\"owner\":"+q(owner)+",\"name\":"+q(name)
      +",\"value\":"+raw(value,descriptor,true),null,descriptor);
  }
  public static void arrayRead(int[] array,int index,int value,int site) {
    observe(array); Frame f=current();if(f!=null)emit("array_read",f,f.line,site,"\"objectId\":"+q(id(array))+",\"index\":"+index+",\"value\":"+value);
  }
  public static void arrayWrite(int[] array,int index,int value,int site) {
    observe(array); Frame f=current();if(f!=null)emit("array_write",f,f.line,site,"\"objectId\":"+q(id(array))+",\"index\":"+index+",\"value\":"+value);
  }
  public static void branch(int opcode,Object left,Object right,int site) {
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
  }
  public static void returned(Object value,String descriptor,int site) { Frame f=current();if(f!=null)emit("return",f,f.line,site,"\"value\":"+raw(value,descriptor,true)); }
  public static void exit(int site) { Frame f=current();if(f==null)return;emit("exit",f,f.line,site,"");STACK.get().pop(); }
  public static void explicitThrow(Throwable error,int site) { if(error!=null) thrown(error,true,site); }
  private static void thrown(Throwable error,boolean explicit,int site) {
    Frame f=current();if(f==null)return;
    emit("throw",f,f.line,site,"\"objectId\":"+q(id(error))+",\"message\":"+q(error.getMessage())+",\"explicit\":"+explicit,error.getClass().getName(),null);
  }
  public static void caught(Throwable error,int site) { Frame f=current();if(f!=null)emit("catch",f,f.line,site,"\"objectId\":"+q(id(error))); }
  public static void unwind(Throwable error,int site) {
    Frame f=current();if(f==null)return;thrown(error,false,site);
    emit("unwind",f,f.line,site,"\"objectId\":"+q(id(error)));STACK.get().pop();
  }
}
