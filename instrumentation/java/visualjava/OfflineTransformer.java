package visualjava;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.Set;
import java.util.stream.Stream;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.*;
import org.objectweb.asm.util.CheckClassAdapter;
import org.objectweb.asm.tree.analysis.*;

/** Transforms every class in a compiled project directory, or fails the whole stage. */
public final class OfflineTransformer implements Opcodes {
  private static final String R="visualjava/Recorder";
  private static final String E="(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;II)V";
  private static int classes, methods, localsWithoutDebug;
  private static final Map<String,Set<Integer>> executableLines=new TreeMap<>();
  private static final Map<String,String> fieldOwners=new TreeMap<>();
  private static final Set<String> projectClasses=new TreeSet<>();
  private OfflineTransformer() {}
  private static void call(InsnList out,String name,String descriptor) { out.add(new MethodInsnNode(INVOKESTATIC,R,name,descriptor,false)); }
  private static void string(InsnList out,String value) { out.add(new LdcInsnNode(value)); }
  private static void integer(InsnList out,int value) { out.add(new LdcInsnNode(value)); }
  private static void boxed(InsnList out,Type type) {
    String owner=switch(type.getSort()) {
      case Type.BOOLEAN->"java/lang/Boolean";case Type.BYTE->"java/lang/Byte";case Type.CHAR->"java/lang/Character";
      case Type.SHORT->"java/lang/Short";case Type.INT->"java/lang/Integer";case Type.LONG->"java/lang/Long";
      case Type.FLOAT->"java/lang/Float";case Type.DOUBLE->"java/lang/Double";default->null;
    };
    if(owner!=null) out.add(new MethodInsnNode(INVOKESTATIC,owner,"valueOf","("+type.getDescriptor()+")L"+owner+";",false));
  }
  private static LocalVariableNode localAt(MethodNode method,int slot,int index,Map<AbstractInsnNode,Integer> positions) {
    if(method.localVariables==null)return null;
    for(LocalVariableNode local:method.localVariables) {
      if(local.index!=slot)continue;
      Integer start=positions.get(local.start),end=positions.get(local.end);
      if(start!=null && end!=null && (start<=index && index<end || start==index+1))return local;
    }
    return null;
  }
  private static String live(LocalVariableNode local,Map<AbstractInsnNode,Integer> positions) {
    return local.index+":"+positions.get(local.start)+":"+positions.get(local.end);
  }
  private static int temp(MethodNode method,Type type) { int slot=method.maxLocals;method.maxLocals+=type.getSize();return slot; }
  private static void loadBox(InsnList out,Type type,int slot) { out.add(new VarInsnNode(type.getOpcode(ILOAD),slot));boxed(out,type); }
  /** xALOAD/xASTORE use JVM computational types, not the array's narrower component type. */
  private static Type arrayOperandType(int opcode) {
    return switch(opcode) {
      case LALOAD,LASTORE->Type.LONG_TYPE;
      case FALOAD,FASTORE->Type.FLOAT_TYPE;
      case DALOAD,DASTORE->Type.DOUBLE_TYPE;
      case AALOAD,AASTORE->Type.getType(Object.class);
      default->Type.INT_TYPE;
    };
  }
  private static LabelNode recordingGuard(InsnList out) {
    LabelNode skip=new LabelNode();call(out,"isRecording","()Z");out.add(new JumpInsnNode(IFEQ,skip));return skip;
  }
  private static boolean mayThrow(int opcode) {
    return opcode>=IALOAD && opcode<=SALOAD || opcode>=IASTORE && opcode<=SASTORE ||
      opcode>=GETSTATIC && opcode<=INVOKEDYNAMIC || opcode==IDIV || opcode==LDIV ||
      opcode==IREM || opcode==LREM || opcode==NEW || opcode==NEWARRAY || opcode==ANEWARRAY ||
      opcode==MULTIANEWARRAY || opcode==ARRAYLENGTH || opcode==ATHROW || opcode==CHECKCAST ||
      opcode==INSTANCEOF || opcode==MONITORENTER || opcode==MONITOREXIT || opcode==LDC;
  }
  /** Original-bytecode producers only. Unsupported/merged sources never claim a transfer. */
  private static final class Origins {
    final MethodNode method;
    final Map<AbstractInsnNode,Integer> positions, sites;
    org.objectweb.asm.tree.analysis.Frame<SourceValue>[] frames;
    final Map<Integer,TreeSet<Integer>> writes=new TreeMap<>();
    final TreeSet<Integer> controlBarriers=new TreeSet<>();
    Origins(String owner,MethodNode method,Map<AbstractInsnNode,Integer> positions,Map<AbstractInsnNode,Integer> sites) {
      this.method=method;this.positions=positions;this.sites=sites;
      // These indexes are built before probes alter the method. Each lookup is bounded
      // by the original method size; no scan of an execution prefix is involved.
      for(AbstractInsnNode node=method.instructions.getFirst();node!=null;node=node.getNext()) {
        int at=positions.get(node),op=node.getOpcode();
        if(node instanceof VarInsnNode store && op>=ISTORE && op<=ASTORE) {
          writes.computeIfAbsent(store.var,ignored->new TreeSet<>()).add(at);
          if(op==LSTORE||op==DSTORE)writes.computeIfAbsent(store.var+1,ignored->new TreeSet<>()).add(at);
        }
        else if(node instanceof IincInsnNode increment)
          writes.computeIfAbsent(increment.var,ignored->new TreeSet<>()).add(at);
        if(node instanceof JumpInsnNode jump) {controlBarriers.add(at);controlBarriers.add(positions.get(jump.label));}
        else if(node instanceof TableSwitchInsnNode branch) {
          controlBarriers.add(at);controlBarriers.add(positions.get(branch.dflt));
          for(LabelNode target:branch.labels)controlBarriers.add(positions.get(target));
        } else if(node instanceof LookupSwitchInsnNode branch) {
          controlBarriers.add(at);controlBarriers.add(positions.get(branch.dflt));
          for(LabelNode target:branch.labels)controlBarriers.add(positions.get(target));
        }
      }
      for(TryCatchBlockNode handler:method.tryCatchBlocks)controlBarriers.add(positions.get(handler.handler));
      try { frames=new Analyzer<SourceValue>(new SourceInterpreter()).analyze(owner,method); }
      catch(AnalyzerException | RuntimeException unsupported) { frames=null; }
    }
    String stack(AbstractInsnNode consumer,int fromTop) {
      if(frames==null)return unknown();
      org.objectweb.asm.tree.analysis.Frame<SourceValue> frame=frames[positions.get(consumer)];
      if(frame==null||frame.getStackSize()<=fromTop)return unknown();
      int[] remaining={24};
      String result=source(frame.getStack(frame.getStackSize()-1-fromTop),0,remaining,positions.get(consumer));
      return result.length()>8192?unknown():result;
    }
    static String unknown() { return "{\"kind\":\"unknown\"}"; }
    boolean constructorThis(AbstractInsnNode consumer,int fromTop) {
      if(frames==null)return false;
      org.objectweb.asm.tree.analysis.Frame<SourceValue> frame=frames[positions.get(consumer)];
      if(frame==null||frame.getStackSize()<=fromTop)return false;
      SourceValue receiver=frame.getStack(frame.getStackSize()-1-fromTop);
      // This is verifier initialization classification, not a consumer-time value recipe.
      // Parameter expressions can branch while the uninitialized-this operand stays live.
      return receiver.insns.size()==1 && receiver.insns.iterator().next() instanceof VarInsnNode load
        && load.getOpcode()==ALOAD && load.var==0;
    }

    boolean unchangedLocal(int slot,int load,int consumer) {
      if(load>=consumer)return false;
      TreeSet<Integer> slotWrites=writes.get(slot);
      Integer write=slotWrites==null?null:slotWrites.higher(load);
      if(write!=null && write<consumer)return false;
      // Branch/handler entry can retain an operand loaded in a different local epoch.
      // A straight-line segment is the conservative proof used for local recipes.
      Integer barrier=controlBarriers.higher(load);
      return barrier==null || barrier>=consumer;
    }
    String source(SourceValue value,int depth,int[] remaining,int consumer) {
      if(value==null||value.insns.size()!=1||depth>6||--remaining[0]<0)return unknown();
      AbstractInsnNode insn=value.insns.iterator().next();int op=insn.getOpcode();
      int site=sites.getOrDefault(insn,-1),at=positions.getOrDefault(insn,-1);
      if(at<0)return unknown();
      if(insn instanceof VarInsnNode var && op>=ILOAD && op<=ALOAD) {
        if(!unchangedLocal(var.var,at,consumer)||((op==LLOAD||op==DLOAD)&&!unchangedLocal(var.var+1,at,consumer)))return unknown();
        LocalVariableNode local=localAt(method,var.var,at,positions);
        return "{\"kind\":\"local\",\"slot\":"+var.var+(local==null?"":",\"liveRange\":"+json(live(local,positions)))+"}";
      }
      if(insn instanceof MethodInsnNode || insn instanceof InvokeDynamicInsnNode) return recipe("call_result",site);
      if(op==GETFIELD)return recipe("field_read",site);
      if(op==GETSTATIC)return recipe("static_read",site);
      if(op>=IALOAD&&op<=SALOAD)return recipe("array_read",site);
      if(op==NEW)return recipe("new",site);
      Object constant=null;String kind=null;
      if(op==ACONST_NULL)return "{\"kind\":\"constant\",\"value\":{\"kind\":\"null\"}}";
      if(op>=ICONST_M1&&op<=ICONST_5){constant=op-ICONST_0;kind="int";}
      else if(op==BIPUSH||op==SIPUSH){constant=((IntInsnNode)insn).operand;kind="int";}
      else if(op==LCONST_0||op==LCONST_1){constant=op-LCONST_0;kind="long";}
      else if(op>=FCONST_0&&op<=FCONST_2){constant=op-FCONST_0;kind="float";}
      else if(op==DCONST_0||op==DCONST_1){constant=op-DCONST_0;kind="double";}
      else if(insn instanceof LdcInsnNode ldc) {
        constant=ldc.cst;kind=constant instanceof Integer?"int":constant instanceof Long?"long":constant instanceof Float?"float":constant instanceof Double?"double":constant instanceof String?"string":null;
      }
      if(kind!=null) {
        String encoded;
        if(kind.equals("long"))encoded=json(constant.toString());
        else if(kind.equals("float")||kind.equals("double")) {
          double number=((Number)constant).doubleValue();
          encoded=Double.isNaN(number)?json("NaN"):number==Double.POSITIVE_INFINITY?json("Infinity"):
            number==Double.NEGATIVE_INFINITY?json("-Infinity"):
            number==0.0 && Double.doubleToRawLongBits(number)==Double.doubleToRawLongBits(-0.0)?json("-0.0"):constant.toString();
        } else encoded=constant instanceof String?json((String)constant):constant.toString();
        return "{\"kind\":\"constant\",\"value\":{\"kind\":"+json(kind)+",\"value\":"+encoded+"}}";
      }
      org.objectweb.asm.tree.analysis.Frame<SourceValue> frame=frames[at];if(frame==null)return unknown();
      // SourceInterpreter attributes DUP/CHECKCAST to the copying instruction.
      if(op==DUP||op==CHECKCAST) return source(frame.getStack(frame.getStackSize()-1),depth+1,remaining,consumer);
      int inputs=(op>=IADD&&op<=DREM||op>=ISHL&&op<=LXOR||op>=LCMP&&op<=DCMPG)?2:
        (op>=INEG&&op<=DNEG||op>=I2L&&op<=I2S)?1:0;
      if(inputs==0||frame.getStackSize()<inputs)return unknown();
      StringBuilder result=new StringBuilder("{\"kind\":\"computed\",\"site\":"+site+",\"opcode\":"+op+",\"inputs\":[");
      for(int i=inputs;i>0;i--){if(i<inputs)result.append(',');result.append(source(frame.getStack(frame.getStackSize()-i),depth+1,remaining,consumer));}
      return result.append("]}").toString();
    }
    static String recipe(String kind,int site) { return "{\"kind\":"+json(kind)+",\"site\":"+site+"}"; }
    static String json(String text) {
      StringBuilder out=new StringBuilder("\"");
      // Escaping every surrogate code unit also preserves valid pairs exactly;
      // lone UTF-16 surrogates must never pass through the UTF-8 writer as replacements.
      for(int i=0;i<text.length();i++) {char c=text.charAt(i);if(c=='"'||c=='\\')out.append('\\').append(c);else if(c<32||Character.isSurrogate(c))out.append(String.format("\\u%04x",(int)c));else out.append(c);}
      return out.append('"').toString();
    }
  }
  private static String declaredTarget(String owner,String name,String descriptor,URLClassLoader loader) {
    if(name.equals("<init>"))return owner.replace('/','.');
    try {
      for(Class<?> type=Class.forName(owner.replace('/','.'),false,loader);type!=null;type=type.getSuperclass())
        for(java.lang.reflect.Method method:type.getDeclaredMethods())
          if(method.getName().equals(name)&&Type.getMethodDescriptor(method).equals(descriptor))return type.getName();
    } catch(ClassNotFoundException | LinkageError | SecurityException unsupported) { /* linkage remains a real JVM operation */ }
    return "";
  }
  /** Field resolution uses the symbolic class plus exact name AND descriptor (JVMS lookup order). */
  private static String declaredFieldOwner(String owner,String name,String descriptor,URLClassLoader loader) {
    String key=owner+":"+name+":"+descriptor;
    if(fieldOwners.containsKey(key))return fieldOwners.get(key);
    String resolved=null;
    try { resolved=findFieldOwner(Class.forName(owner.replace('/','.'),false,loader),name,descriptor,
      java.util.Collections.newSetFromMap(new IdentityHashMap<>())); }
    catch(ClassNotFoundException | LinkageError | SecurityException unsupported) { /* probe degrades after the original operation succeeds */ }
    fieldOwners.put(key,resolved);return resolved;
  }
  private static String findFieldOwner(Class<?> type,String name,String descriptor,Set<Class<?>> visited) {
    if(type==null||!visited.add(type))return null;
    for(java.lang.reflect.Field field:type.getDeclaredFields())
      if(field.getName().equals(name)&&Type.getDescriptor(field.getType()).equals(descriptor))return type.getName();
    for(Class<?> parent:type.getInterfaces()) {
      String resolved=findFieldOwner(parent,name,descriptor,visited);if(resolved!=null)return resolved;
    }
    return findFieldOwner(type.getSuperclass(),name,descriptor,visited);
  }
  private static void activate(InsnList out,int tokenSlot) {
    out.add(new VarInsnNode(LLOAD,tokenSlot));call(out,"activate","(J)V");
  }
  private static void origin(InsnList out,String recipe) { string(out,recipe);call(out,"origin","(Ljava/lang/String;)V"); }
  private static void transformMethod(ClassNode owner,MethodNode method,URLClassLoader loader) {
    if((method.access&(ACC_ABSTRACT|ACC_NATIVE))!=0 || method.instructions.size()==0)return;
    methods++;
    List<AbstractInsnNode> original=new ArrayList<>(); Map<AbstractInsnNode,Integer> positions=new IdentityHashMap<>(),sites=new IdentityHashMap<>();
    int ordinal=0,index=0;
    for(AbstractInsnNode insn=method.instructions.getFirst();insn!=null;insn=insn.getNext()) {
      original.add(insn);positions.put(insn,index++);sites.put(insn,ordinal);
      if(insn.getOpcode()>=0)ordinal++;
    }
    Origins origins=new Origins(owner.name,method,positions,sites);
    AbstractInsnNode entryPoint=original.get(0),initializingCall=null;
    boolean constructor=method.name.equals("<init>");
    if(constructor) {
      for(AbstractInsnNode insn:original) if(insn instanceof MethodInsnNode invoke && invoke.getOpcode()==INVOKESPECIAL
        && invoke.name.equals("<init>") && (invoke.owner.equals(owner.name)||invoke.owner.equals(owner.superName))) {
        // The receiver must be this, not another freshly allocated instance of this class.
        if(origins.constructorThis(insn,Type.getArgumentTypes(invoke.desc).length)) { initializingCall=insn;break; }
      }
      if(initializingCall==null)throw new IllegalStateException("Cannot find initializing constructor call in "+owner.name);
    }
    int tokenSlot=temp(method,Type.LONG_TYPE);
    int entryIndex=positions.get(entryPoint), entrySite=sites.get(entryPoint);
    int entryLine=-1;
    for(AbstractInsnNode insn:original) { if(positions.get(insn)>entryIndex)break;if(insn instanceof LineNumberNode l)entryLine=l.line; }
    InsnList entry=new InsnList();
    int slot=(method.access&ACC_STATIC)==0?1:0;
    LabelNode skipParameters=recordingGuard(entry);
    for(Type arg:Type.getArgumentTypes(method.desc)) {
      LocalVariableNode local=localAt(method,slot,entryIndex,positions);
      String name=local==null?"arg"+slot:local.name,range=local==null?slot+":parameter":live(local,positions);
      integer(entry,slot);string(entry,name);string(entry,arg.getDescriptor());string(entry,range);loadBox(entry,arg,slot);
      call(entry,"parameter","(ILjava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;)V");
      slot+=arg.getSize();
    }
    entry.add(skipParameters);
    string(entry,owner.name.replace('/','.'));string(entry,method.name);string(entry,method.desc);
    if((method.access&ACC_STATIC)==0 && !constructor)entry.add(new VarInsnNode(ALOAD,0));else entry.add(new InsnNode(ACONST_NULL));
    integer(entry,entryLine);integer(entry,entrySite);call(entry,"enterToken",E.replace(")V",")J"));entry.add(new VarInsnNode(LSTORE,tokenSlot));
    if(method.name.equals("<clinit>")) {
      LabelNode skip=recordingGuard(entry);entry.add(new LdcInsnNode(Type.getObjectType(owner.name)));integer(entry,entrySite);
      call(entry,"classInitialize","(Ljava/lang/Class;I)V");entry.add(skip);
    }
    boolean followingLine=false;
    for(int i=entryIndex;i<original.size();i++) {
      AbstractInsnNode next=original.get(i);
      if(next instanceof LineNumberNode) { followingLine=true;break; }
      if(next.getOpcode()>=0)break;
    }
    Set<Integer> lines=executableLines.computeIfAbsent(owner.name.replace('/','.'),ignored->new TreeSet<>());
    if(!followingLine && entryLine>0) { call(entry,"entryCheckpoint","()V");lines.add(entryLine); }
    LabelNode tryStart=new LabelNode();if(!constructor)entry.add(tryStart);
    method.instructions.insertBefore(entryPoint,entry);
    List<TryCatchBlockNode> originalHandlers=new ArrayList<>(method.tryCatchBlocks);
    Set<LabelNode> hookedHandlers=java.util.Collections.newSetFromMap(new IdentityHashMap<>());
    for(TryCatchBlockNode handler:originalHandlers) {
      // Catch events are emitted only when the real handler is entered.
      // A null catch type proves exceptional cleanup, including monitor release;
      // the historical "finally" event name does not prove a lexical finally block.
      if(positions.getOrDefault(handler.handler,-1)<entryIndex || !hookedHandlers.add(handler.handler))continue;
      int handlerLine=entryLine;
      for(AbstractInsnNode node:original) {
        if(node instanceof LineNumberNode l)handlerLine=l.line;
        if(node==handler.handler)break;
      }
      for(AbstractInsnNode node=handler.handler.getNext();node!=null;node=node.getNext()) {
        if(node instanceof LineNumberNode l) { handlerLine=l.line;break; }
        if(node.getOpcode()>=0)break;
      }
      InsnList hook=new InsnList();hook.add(new InsnNode(DUP));hook.add(new VarInsnNode(LLOAD,tokenSlot));call(hook,"reconcile","(Ljava/lang/Throwable;J)V");hook.add(new InsnNode(DUP));integer(hook,handlerLine);integer(hook,sites.getOrDefault(handler.handler,0));
      call(hook,handler.type==null?"finallyEntered":"caught","(Ljava/lang/Throwable;II)V");method.instructions.insert(handler.handler,hook);
    }
    int currentLine=entryLine;
    for(AbstractInsnNode insn:original) {
      int at=positions.get(insn),site=sites.get(insn);
      if(at<entryIndex)continue;
      if(insn instanceof LineNumberNode line) {
        currentLine=line.line;
        lines.add(line.line);
        InsnList hook=new InsnList();activate(hook,tokenSlot);integer(hook,line.line);integer(hook,site);call(hook,"line","(II)V");method.instructions.insert(insn,hook);
      }
      if(insn instanceof LabelNode label && method.localVariables!=null) {
        InsnList hook=new InsnList();
        for(LocalVariableNode local:method.localVariables) if(local.end==label && local.index!=0) {
          integer(hook,local.index);string(hook,live(local,positions));integer(hook,site);
          call(hook,"localEnd","(ILjava/lang/String;I)V");
        }
        if(hook.size()>0) {
          AbstractInsnNode insertion=label;
          if(hookedHandlers.contains(label)) {
            // The exception checkpoint must expose the failing state before handler
            // lifetime retirement. These ends still occur before handler bytecode.
            for(AbstractInsnNode next=label.getNext();next!=null;next=next.getNext()) {
              if(next instanceof MethodInsnNode call && call.owner.equals(R) &&
                  (call.name.equals("caught") || call.name.equals("finallyEntered"))) { insertion=next;break; }
            }
          }
          method.instructions.insert(insertion,hook);
        }
      }
      int opcode=insn.getOpcode();if(opcode<0)continue;
      // A handler can change the source line before it observes an implicit exception.
      // Preserve the original bytecode context before an instruction that can throw.
      if(mayThrow(opcode)) {
        InsnList context=new InsnList();activate(context,tokenSlot);integer(context,currentLine);integer(context,site);call(context,"site","(II)V");
        method.instructions.insertBefore(insn,context);
      }
      if(insn instanceof VarInsnNode var && opcode>=ISTORE && opcode<=ASTORE) {
        LocalVariableNode local=localAt(method,var.var,at,positions);
        if(local==null) { localsWithoutDebug++;continue; }
        Type type=Type.getType(local.desc);InsnList hook=new InsnList();activate(hook,tokenSlot);LabelNode skip=recordingGuard(hook);origin(hook,origins.stack(insn,0));
        integer(hook,var.var);string(hook,local.name);string(hook,local.desc);string(hook,live(local,positions));
        loadBox(hook,type,var.var);integer(hook,site);
        call(hook,"local","(ILjava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;I)V");hook.add(skip);
        method.instructions.insert(insn,hook);
      } else if(insn instanceof IincInsnNode increment) {
        LocalVariableNode local=localAt(method,increment.var,at,positions);
        if(local==null) { localsWithoutDebug++; continue; }
        InsnList hook=new InsnList();activate(hook,tokenSlot);LabelNode skip=recordingGuard(hook);origin(hook,"{\"kind\":\"computed\",\"site\":"+site+",\"opcode\":132,\"inputs\":[{\"kind\":\"local\",\"slot\":"+increment.var+"},{\"kind\":\"constant\",\"value\":{\"kind\":\"int\",\"value\":"+increment.incr+"}}]}");integer(hook,increment.var);string(hook,local.name);string(hook,local.desc);
        string(hook,live(local,positions));loadBox(hook,Type.INT_TYPE,increment.var);integer(hook,site);
        call(hook,"local","(ILjava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;I)V");hook.add(skip);
        method.instructions.insert(insn,hook);
      } else if(insn instanceof FieldInsnNode field && (opcode==PUTFIELD||opcode==GETFIELD) && (!constructor||at>positions.get(initializingCall))) {
        Type type=Type.getType(field.desc);int valueSlot=temp(method,type),objectSlot=temp(method,Type.getType(Object.class));
        InsnList before=new InsnList();
        if(opcode==PUTFIELD)before.add(new VarInsnNode(type.getOpcode(ISTORE),valueSlot));
        before.add(new VarInsnNode(ASTORE,objectSlot));before.add(new VarInsnNode(ALOAD,objectSlot));
        if(opcode==PUTFIELD)before.add(new VarInsnNode(type.getOpcode(ILOAD),valueSlot));
        method.instructions.insertBefore(insn,before);
        InsnList after=new InsnList();
        if(opcode==GETFIELD)after.add(new VarInsnNode(type.getOpcode(ISTORE),valueSlot));
        activate(after,tokenSlot);LabelNode skip=recordingGuard(after);
        String declaringOwner=declaredFieldOwner(field.owner,field.name,field.desc,loader);
        if(declaringOwner==null || !projectClasses.contains(declaringOwner)) {
          // Do not stop for unexecuted bytecode or replace a real linkage failure.
          // This hook runs only after the original field operation succeeds.
          call(after,"unsupportedField","()V");
        } else {
          origin(after,opcode==PUTFIELD?origins.stack(insn,0):Origins.unknown());
          after.add(new VarInsnNode(ALOAD,objectSlot));loadBox(after,type,valueSlot);
          string(after,declaringOwner);string(after,field.name);string(after,field.desc);integer(after,site);
          call(after,opcode==PUTFIELD?"field":"fieldRead","(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;I)V");
        }
        after.add(skip);
        if(opcode==GETFIELD)after.add(new VarInsnNode(type.getOpcode(ILOAD),valueSlot));
        method.instructions.insert(insn,after);
      } else if(insn instanceof FieldInsnNode field && (opcode==GETSTATIC||opcode==PUTSTATIC)) {
        String declaringOwner=declaredFieldOwner(field.owner,field.name,field.desc,loader);
        // Project statics only. Resolving metadata loads classes without initializing them.
        // A missing project declaration degrades only after a successful original opcode.
        if(declaringOwner!=null&&!projectClasses.contains(declaringOwner))continue;
        if(declaringOwner==null&&!projectClasses.contains(field.owner.replace('/','.')))continue;
        Type type=Type.getType(field.desc);int valueSlot=temp(method,type);
        if(opcode==PUTSTATIC) {
          InsnList before=new InsnList();before.add(new VarInsnNode(type.getOpcode(ISTORE),valueSlot));
          before.add(new VarInsnNode(type.getOpcode(ILOAD),valueSlot));method.instructions.insertBefore(insn,before);
        }
        InsnList after=new InsnList();
        if(opcode==GETSTATIC)after.add(new VarInsnNode(type.getOpcode(ISTORE),valueSlot));
        activate(after,tokenSlot);LabelNode skip=recordingGuard(after);
        if(declaringOwner==null)call(after,"unsupportedField","()V");
        else {
          origin(after,opcode==PUTSTATIC?origins.stack(insn,0):Origins.unknown());
          after.add(new LdcInsnNode(Type.getObjectType(declaringOwner.replace('.','/'))));loadBox(after,type,valueSlot);
          string(after,field.name);string(after,field.desc);integer(after,site);
          call(after,opcode==PUTSTATIC?"staticField":"staticRead","(Ljava/lang/Class;Ljava/lang/Object;Ljava/lang/String;Ljava/lang/String;I)V");
        }
        after.add(skip);
        if(opcode==GETSTATIC)after.add(new VarInsnNode(type.getOpcode(ILOAD),valueSlot));method.instructions.insert(insn,after);
      } else if(opcode==NEWARRAY||opcode==ANEWARRAY||opcode==MULTIANEWARRAY) {
        // Original allocation, including every dimension check, has already succeeded.
        InsnList after=new InsnList();activate(after,tokenSlot);LabelNode skip=recordingGuard(after);
        after.add(new InsnNode(DUP));call(after,"observe","(Ljava/lang/Object;)V");after.add(skip);method.instructions.insert(insn,after);
      } else if(opcode>=IALOAD&&opcode<=SALOAD) {
        Type type=arrayOperandType(opcode);
        int arraySlot=temp(method,Type.getType(Object.class)),indexSlot=temp(method,Type.INT_TYPE),valueSlot=temp(method,type);
        InsnList before=new InsnList();before.add(new VarInsnNode(ISTORE,indexSlot));before.add(new VarInsnNode(ASTORE,arraySlot));
        before.add(new VarInsnNode(ALOAD,arraySlot));before.add(new VarInsnNode(ILOAD,indexSlot));method.instructions.insertBefore(insn,before);
        InsnList after=new InsnList();after.add(new VarInsnNode(type.getOpcode(ISTORE),valueSlot));
        activate(after,tokenSlot);LabelNode skip=recordingGuard(after);origin(after,Origins.recipe("array_read",site));
        after.add(new VarInsnNode(ALOAD,arraySlot));after.add(new VarInsnNode(ILOAD,indexSlot));loadBox(after,type,valueSlot);
        integer(after,site);call(after,"arrayRead","(Ljava/lang/Object;ILjava/lang/Object;I)V");after.add(skip);
        after.add(new VarInsnNode(type.getOpcode(ILOAD),valueSlot));method.instructions.insert(insn,after);
      } else if(opcode>=IASTORE&&opcode<=SASTORE) {
        Type type=arrayOperandType(opcode);
        int arraySlot=temp(method,Type.getType(Object.class)),indexSlot=temp(method,Type.INT_TYPE),valueSlot=temp(method,type);
        InsnList before=new InsnList();before.add(new VarInsnNode(type.getOpcode(ISTORE),valueSlot));before.add(new VarInsnNode(ISTORE,indexSlot));before.add(new VarInsnNode(ASTORE,arraySlot));
        before.add(new VarInsnNode(ALOAD,arraySlot));before.add(new VarInsnNode(ILOAD,indexSlot));before.add(new VarInsnNode(type.getOpcode(ILOAD),valueSlot));method.instructions.insertBefore(insn,before);
        InsnList after=new InsnList();activate(after,tokenSlot);LabelNode skip=recordingGuard(after);origin(after,origins.stack(insn,0));
        after.add(new VarInsnNode(ALOAD,arraySlot));after.add(new VarInsnNode(ILOAD,indexSlot));loadBox(after,type,valueSlot);integer(after,site);
        call(after,"arrayWrite","(Ljava/lang/Object;ILjava/lang/Object;I)V");after.add(skip);method.instructions.insert(insn,after);
      } else if(insn instanceof JumpInsnNode && ((opcode>=IFEQ&&opcode<=IF_ACMPNE)||opcode==IFNULL||opcode==IFNONNULL)) {
        boolean two=opcode>=IF_ICMPEQ&&opcode<=IF_ACMPNE,reference=opcode==IFNULL||opcode==IFNONNULL||opcode==IF_ACMPEQ||opcode==IF_ACMPNE;
        Type type=reference?Type.getType(Object.class):Type.INT_TYPE;
        int rightSlot=two?temp(method,type):-1,leftSlot=temp(method,type);
        InsnList hook=new InsnList();if(two)hook.add(new VarInsnNode(type.getOpcode(ISTORE),rightSlot));
        hook.add(new VarInsnNode(type.getOpcode(ISTORE),leftSlot));
        // Report before the branch, then restore the original operand stack.
        LabelNode skip=recordingGuard(hook);
        integer(hook,opcode);loadBox(hook,type,leftSlot);
        if(two)loadBox(hook,type,rightSlot);else hook.add(new InsnNode(ACONST_NULL));
        integer(hook,site);call(hook,"branch","(ILjava/lang/Object;Ljava/lang/Object;I)V");hook.add(skip);
        hook.add(new VarInsnNode(type.getOpcode(ILOAD),leftSlot));if(two)hook.add(new VarInsnNode(type.getOpcode(ILOAD),rightSlot));
        method.instructions.insertBefore(insn,hook);
      } else if(opcode==ATHROW) {
        InsnList hook=new InsnList();activate(hook,tokenSlot);origin(hook,origins.stack(insn,0));hook.add(new InsnNode(DUP));integer(hook,site);
        call(hook,"explicitThrow","(Ljava/lang/Throwable;I)V");method.instructions.insertBefore(insn,hook);
      } else if(opcode>=IRETURN&&opcode<=RETURN) {
        InsnList hook=new InsnList();
        activate(hook,tokenSlot);
        if(method.name.equals("<clinit>")) {
          LabelNode skip=recordingGuard(hook);hook.add(new LdcInsnNode(Type.getObjectType(owner.name)));integer(hook,site);
          call(hook,"classInitialized","(Ljava/lang/Class;I)V");hook.add(skip);
        }
        if(opcode!=RETURN) {
          Type type=Type.getReturnType(method.desc);
          int resultSlot=temp(method,type);
          hook.add(new VarInsnNode(type.getOpcode(ISTORE),resultSlot));
          LabelNode skip=recordingGuard(hook);origin(hook,origins.stack(insn,0));
          loadBox(hook,type,resultSlot);string(hook,type.getDescriptor());integer(hook,site);
          call(hook,"returned","(Ljava/lang/Object;Ljava/lang/String;I)V");hook.add(skip);
          hook.add(new VarInsnNode(type.getOpcode(ILOAD),resultSlot));
        }
        integer(hook,site);call(hook,"exit","(I)V");method.instructions.insertBefore(insn,hook);
      }
    }
    // All operand recipes and sites still refer to original bytecode, never injected probes.
    for(AbstractInsnNode insn:original) if(insn instanceof MethodInsnNode || insn instanceof InvokeDynamicInsnNode) {
      String callOwner=insn instanceof MethodInsnNode m?m.owner:"<dynamic>",name=insn instanceof MethodInsnNode m?m.name:((InvokeDynamicInsnNode)insn).name;
      String descriptor=insn instanceof MethodInsnNode m?m.desc:((InvokeDynamicInsnNode)insn).desc;
      int opcode=insn.getOpcode(),site=sites.get(insn);boolean instance=opcode!=INVOKESTATIC&&opcode!=INVOKEDYNAMIC,init=name.equals("<init>");
      Type[] args=Type.getArgumentTypes(descriptor);int[] argSlots=new int[args.length];
      int receiverSlot=instance?temp(method,Type.getType(Object.class)):-1,callSlot=temp(method,Type.LONG_TYPE);
      InsnList before=new InsnList();
      for(int i=args.length-1;i>=0;i--){argSlots[i]=temp(method,args[i]);before.add(new VarInsnNode(args[i].getOpcode(ISTORE),argSlots[i]));}
      if(instance)before.add(new VarInsnNode(ASTORE,receiverSlot));
      activate(before,tokenSlot);
      LabelNode skipPackaging=new LabelNode(),restoreOperands=new LabelNode();
      // Original operands stay in typed locals on both branches. Once observation
      // stops, no argument boxes or Object[] are allocated for call recording.
      call(before,"isRecording","()Z");before.add(new JumpInsnNode(IFEQ,skipPackaging));
      integer(before,opcode);string(before,callOwner.replace('/','.'));string(before,name);string(before,descriptor);
      if(instance&&!init)before.add(new VarInsnNode(ALOAD,receiverSlot));else before.add(new InsnNode(ACONST_NULL));
      integer(before,args.length);before.add(new TypeInsnNode(ANEWARRAY,"java/lang/Object"));
      StringBuilder recipes=new StringBuilder("[");
      for(int i=0;i<args.length;i++) {before.add(new InsnNode(DUP));integer(before,i);loadBox(before,args[i],argSlots[i]);before.add(new InsnNode(AASTORE));if(i>0)recipes.append(',');recipes.append(origins.stack(insn,args.length-1-i));}
      string(before,recipes.append(']').toString());string(before,instance?origins.stack(insn,args.length):Origins.unknown());integer(before,site);string(before,opcode==INVOKESTATIC||opcode==INVOKESPECIAL?declaredTarget(callOwner,name,descriptor,loader):"");
      call(before,"calling","(ILjava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;[Ljava/lang/Object;Ljava/lang/String;Ljava/lang/String;ILjava/lang/String;)J");before.add(new VarInsnNode(LSTORE,callSlot));
      before.add(new JumpInsnNode(GOTO,restoreOperands));before.add(skipPackaging);
      before.add(new InsnNode(LCONST_0));before.add(new VarInsnNode(LSTORE,callSlot));before.add(restoreOperands);
      if(instance)before.add(new VarInsnNode(ALOAD,receiverSlot));for(int i=0;i<args.length;i++)before.add(new VarInsnNode(args[i].getOpcode(ILOAD),argSlots[i]));
      method.instructions.insertBefore(insn,before);
      InsnList after=new InsnList();Type result=Type.getReturnType(descriptor);int resultSlot=result.getSort()==Type.VOID?-1:temp(method,result);
      if(resultSlot>=0)after.add(new VarInsnNode(result.getOpcode(ISTORE),resultSlot));
      LabelNode skipResult=recordingGuard(after);
      after.add(new VarInsnNode(LLOAD,callSlot));after.add(new InsnNode(LCONST_0));after.add(new InsnNode(LCMP));after.add(new JumpInsnNode(IFEQ,skipResult));
      after.add(new VarInsnNode(LLOAD,callSlot));
      if(init)after.add(new VarInsnNode(ALOAD,receiverSlot));else if(resultSlot>=0)loadBox(after,result,resultSlot);else after.add(new InsnNode(ACONST_NULL));
      string(after,init?"L"+callOwner.replace('.','/')+";":result.getDescriptor());
      if(instance)after.add(new VarInsnNode(ALOAD,receiverSlot));else after.add(new InsnNode(ACONST_NULL));
      String allocationOrigin=init?origins.stack(insn,args.length):Origins.unknown();
      int newSite=-1;
      if(allocationOrigin.startsWith("{\"kind\":\"new\",\"site\":"))try {newSite=Integer.parseInt(allocationOrigin.substring(allocationOrigin.lastIndexOf(':')+1,allocationOrigin.length()-1));}catch(NumberFormatException ignored){}
      integer(after,newSite);call(after,"callReturned","(JLjava/lang/Object;Ljava/lang/String;Ljava/lang/Object;I)V");after.add(skipResult);
      if(insn==initializingCall) {after.add(new VarInsnNode(ALOAD,0));call(after,"receiverReady","(Ljava/lang/Object;)V");after.add(tryStart);}
      if(resultSlot>=0)after.add(new VarInsnNode(result.getOpcode(ILOAD),resultSlot));method.instructions.insert(insn,after);
    }
    LabelNode tryEnd=new LabelNode(),handler=new LabelNode();
    method.instructions.add(tryEnd);method.instructions.add(handler);
    InsnList unwind=new InsnList();unwind.add(new InsnNode(DUP));unwind.add(new VarInsnNode(LLOAD,tokenSlot));call(unwind,"reconcile","(Ljava/lang/Throwable;J)V");unwind.add(new InsnNode(DUP));integer(unwind,ordinal);
    call(unwind,"unwind","(Ljava/lang/Throwable;I)V");unwind.add(new InsnNode(ATHROW));method.instructions.add(unwind);
    method.tryCatchBlocks.add(new TryCatchBlockNode(tryStart,tryEnd,handler,"java/lang/Throwable"));
  }
  private static byte[] transform(byte[] bytes,URLClassLoader loader) throws Exception {
    ClassNode node=new ClassNode();new ClassReader(bytes).accept(node,ClassReader.EXPAND_FRAMES);
    for(MethodNode method:node.methods)transformMethod(node,method,loader);
    ClassWriter writer=new ClassWriter(ClassWriter.COMPUTE_FRAMES|ClassWriter.COMPUTE_MAXS) {
      @Override protected String getCommonSuperClass(String a,String b) {
        try {
          Class<?> x=Class.forName(a.replace('/','.'),false,loader),y=Class.forName(b.replace('/','.'),false,loader);
          if(x.isAssignableFrom(y))return a;if(y.isAssignableFrom(x))return b;
          if(x.isInterface()||y.isInterface())return "java/lang/Object";
          do { x=x.getSuperclass(); } while(x!=null&&!x.isAssignableFrom(y));
          return x==null?"java/lang/Object":x.getName().replace('.','/');
        } catch(ClassNotFoundException e) { throw new IllegalStateException("Missing class for frame computation: "+a+" / "+b,e); }
      }
    };
    node.accept(writer);byte[] transformed=writer.toByteArray();
    StringWriter issues=new StringWriter();CheckClassAdapter.verify(new ClassReader(transformed),loader,false,new PrintWriter(issues));
    if(!issues.toString().isBlank())throw new IllegalStateException("ASM verification: "+issues);
    return transformed;
  }
  public static void main(String[] args) {
    if(args.length<2) { System.err.println("usage: OfflineTransformer <classes> <output> [dependency-path ...]");System.exit(2); }
    try {
      Path input=Path.of(args[0]),output=Path.of(args[1]);Files.createDirectories(output);
      List<URL> loaderPaths=new ArrayList<>();loaderPaths.add(input.toUri().toURL());
      // Dependencies participate in frame computation and verification, never in
      // the project-only Files.walk below. Keep their canonical launch order.
      for(int i=2;i<args.length;i++)loaderPaths.add(Path.of(args[i]).toUri().toURL());
      try(URLClassLoader loader=new URLClassLoader(loaderPaths.toArray(new URL[0]),OfflineTransformer.class.getClassLoader());
          Stream<Path> paths=Files.walk(input)) {
        List<Path> projectFiles=paths.filter(Files::isRegularFile).sorted(Comparator.naturalOrder()).toList();
        // Read class names directly: no Class.forName initialization or reflective snapshot.
        for(Path path:projectFiles)if(path.toString().endsWith(".class"))
          projectClasses.add(new ClassReader(Files.readAllBytes(path)).getClassName().replace('/','.'));
        for(Path path:projectFiles) {
          Path relative=input.relativize(path),target=output.resolve(relative);Files.createDirectories(target.getParent());
          if(path.toString().endsWith(".class")) { Files.write(target,transform(Files.readAllBytes(path),loader));classes++; }
          else Files.copy(path,target);
        }
      }
      if(classes==0)throw new IllegalStateException("No compiled project classes");
      StringBuilder lineReport=new StringBuilder("{");boolean first=true;
      for(Map.Entry<String,Set<Integer>> entry:executableLines.entrySet()) {
        if(!first)lineReport.append(',');first=false;
        lineReport.append('"').append(entry.getKey()).append("\":").append(entry.getValue().toString());
      }
      lineReport.append('}');
      System.out.println("{\"classes\":"+classes+",\"methods\":"+methods+",\"localsWithoutDebug\":"+localsWithoutDebug+",\"executableLines\":"+lineReport+"}");
    } catch(Throwable failure) { failure.printStackTrace(System.err);System.exit(1); }
  }
}
