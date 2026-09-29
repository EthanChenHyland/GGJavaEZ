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

/** Transforms every class in a compiled project directory, or fails the whole stage. */
public final class OfflineTransformer implements Opcodes {
  private static final String R="visualjava/Recorder";
  private static final String E="(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;II)V";
  private static int classes, methods, localsWithoutDebug;
  private static final Map<String,Set<Integer>> executableLines=new TreeMap<>();
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
  private static boolean mayThrow(int opcode) {
    return opcode>=IALOAD && opcode<=SALOAD || opcode>=IASTORE && opcode<=SASTORE ||
      opcode>=GETSTATIC && opcode<=INVOKEDYNAMIC || opcode==IDIV || opcode==LDIV ||
      opcode==IREM || opcode==LREM || opcode==NEW || opcode==NEWARRAY || opcode==ANEWARRAY ||
      opcode==MULTIANEWARRAY || opcode==ARRAYLENGTH || opcode==ATHROW || opcode==CHECKCAST ||
      opcode==INSTANCEOF || opcode==MONITORENTER || opcode==MONITOREXIT || opcode==LDC;
  }
  private static void transformMethod(ClassNode owner,MethodNode method) {
    if((method.access&(ACC_ABSTRACT|ACC_NATIVE))!=0 || method.instructions.size()==0)return;
    methods++;
    List<AbstractInsnNode> original=new ArrayList<>(); Map<AbstractInsnNode,Integer> positions=new IdentityHashMap<>(),sites=new IdentityHashMap<>();
    int ordinal=0,index=0;
    for(AbstractInsnNode insn=method.instructions.getFirst();insn!=null;insn=insn.getNext()) {
      original.add(insn);positions.put(insn,index++);sites.put(insn,ordinal);
      if(insn.getOpcode()>=0)ordinal++;
    }
    AbstractInsnNode entryPoint=original.get(0);
    boolean constructor=method.name.equals("<init>");
    if(constructor) {
      entryPoint=null;
      for(AbstractInsnNode insn:original) if(insn instanceof MethodInsnNode call && call.getOpcode()==INVOKESPECIAL
        && call.name.equals("<init>") && (call.owner.equals(owner.name)||call.owner.equals(owner.superName))) {
        entryPoint=insn.getNext();break;
      }
      if(entryPoint==null)throw new IllegalStateException("Cannot find safe constructor entry in "+owner.name);
    }
    int entryIndex=positions.get(entryPoint), entrySite=sites.get(entryPoint);
    int entryLine=-1;
    for(AbstractInsnNode insn:original) { if(positions.get(insn)>entryIndex)break;if(insn instanceof LineNumberNode l)entryLine=l.line; }
    InsnList entry=new InsnList();
    int slot=(method.access&ACC_STATIC)==0?1:0;
    for(Type arg:Type.getArgumentTypes(method.desc)) {
      LocalVariableNode local=localAt(method,slot,entryIndex,positions);
      String name=local==null?"arg"+slot:local.name,range=local==null?slot+":parameter":live(local,positions);
      integer(entry,slot);string(entry,name);string(entry,arg.getDescriptor());string(entry,range);loadBox(entry,arg,slot);
      call(entry,"parameter","(ILjava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;)V");
      slot+=arg.getSize();
    }
    string(entry,owner.name.replace('/','.'));string(entry,method.name);string(entry,method.desc);
    if((method.access&ACC_STATIC)==0)entry.add(new VarInsnNode(ALOAD,0));else entry.add(new InsnNode(ACONST_NULL));
    integer(entry,entryLine);integer(entry,entrySite);call(entry,"enter",E);
    boolean followingLine=false;
    for(int i=entryIndex;i<original.size();i++) {
      AbstractInsnNode next=original.get(i);
      if(next instanceof LineNumberNode) { followingLine=true;break; }
      if(next.getOpcode()>=0)break;
    }
    Set<Integer> lines=executableLines.computeIfAbsent(owner.name.replace('/','.'),ignored->new TreeSet<>());
    if(!followingLine && entryLine>0) { call(entry,"entryCheckpoint","()V");lines.add(entryLine); }
    LabelNode tryStart=new LabelNode();entry.add(tryStart);
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
      InsnList hook=new InsnList();hook.add(new InsnNode(DUP));integer(hook,handlerLine);integer(hook,sites.getOrDefault(handler.handler,0));
      call(hook,handler.type==null?"finallyEntered":"caught","(Ljava/lang/Throwable;II)V");method.instructions.insert(handler.handler,hook);
    }
    int currentLine=entryLine;
    for(AbstractInsnNode insn:original) {
      int at=positions.get(insn),site=sites.get(insn);
      if(at<entryIndex)continue;
      if(insn instanceof LineNumberNode line) {
        currentLine=line.line;
        lines.add(line.line);
        InsnList hook=new InsnList();integer(hook,line.line);integer(hook,site);call(hook,"line","(II)V");method.instructions.insert(insn,hook);
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
        InsnList context=new InsnList();integer(context,currentLine);integer(context,site);call(context,"site","(II)V");
        method.instructions.insertBefore(insn,context);
      }
      if(insn instanceof VarInsnNode var && opcode>=ISTORE && opcode<=ASTORE) {
        LocalVariableNode local=localAt(method,var.var,at,positions);
        if(local==null) { localsWithoutDebug++;continue; }
        Type type=Type.getType(local.desc);InsnList hook=new InsnList();
        integer(hook,var.var);string(hook,local.name);string(hook,local.desc);string(hook,live(local,positions));
        loadBox(hook,type,var.var);integer(hook,site);
        call(hook,"local","(ILjava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;I)V");
        method.instructions.insert(insn,hook);
      } else if(insn instanceof IincInsnNode increment) {
        LocalVariableNode local=localAt(method,increment.var,at,positions);
        if(local==null) { localsWithoutDebug++; continue; }
        InsnList hook=new InsnList();integer(hook,increment.var);string(hook,local.name);string(hook,local.desc);
        string(hook,live(local,positions));loadBox(hook,Type.INT_TYPE,increment.var);integer(hook,site);
        call(hook,"local","(ILjava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/Object;I)V");
        method.instructions.insert(insn,hook);
      } else if(insn instanceof FieldInsnNode field && opcode==PUTFIELD) {
        Type type=Type.getType(field.desc);int valueSlot=temp(method,type),objectSlot=temp(method,Type.getType(Object.class));
        InsnList before=new InsnList();before.add(new VarInsnNode(type.getOpcode(ISTORE),valueSlot));before.add(new VarInsnNode(ASTORE,objectSlot));
        before.add(new VarInsnNode(ALOAD,objectSlot));before.add(new VarInsnNode(type.getOpcode(ILOAD),valueSlot));
        method.instructions.insertBefore(insn,before);
        InsnList after=new InsnList();after.add(new VarInsnNode(ALOAD,objectSlot));loadBox(after,type,valueSlot);
        string(after,field.owner.replace('/','.'));string(after,field.name);string(after,field.desc);integer(after,site);
        call(after,"field","(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;I)V");
        method.instructions.insert(insn,after);
      } else if(opcode==NEWARRAY && insn instanceof IntInsnNode allocation && allocation.operand==T_INT) {
        InsnList after=new InsnList();after.add(new InsnNode(DUP));call(after,"observe","(Ljava/lang/Object;)V");method.instructions.insert(insn,after);
      } else if(opcode==IALOAD) {
        int arraySlot=temp(method,Type.getType(Object.class)),indexSlot=temp(method,Type.INT_TYPE),valueSlot=temp(method,Type.INT_TYPE);
        InsnList before=new InsnList();before.add(new VarInsnNode(ISTORE,indexSlot));before.add(new VarInsnNode(ASTORE,arraySlot));
        before.add(new VarInsnNode(ALOAD,arraySlot));before.add(new VarInsnNode(ILOAD,indexSlot));method.instructions.insertBefore(insn,before);
        InsnList after=new InsnList();after.add(new InsnNode(DUP));after.add(new VarInsnNode(ISTORE,valueSlot));
        after.add(new VarInsnNode(ALOAD,arraySlot));after.add(new TypeInsnNode(CHECKCAST,"[I"));after.add(new VarInsnNode(ILOAD,indexSlot));
        after.add(new VarInsnNode(ILOAD,valueSlot));integer(after,site);call(after,"arrayRead","([IIII)V");method.instructions.insert(insn,after);
      } else if(opcode==IASTORE) {
        int arraySlot=temp(method,Type.getType(Object.class)),indexSlot=temp(method,Type.INT_TYPE),valueSlot=temp(method,Type.INT_TYPE);
        InsnList before=new InsnList();before.add(new VarInsnNode(ISTORE,valueSlot));before.add(new VarInsnNode(ISTORE,indexSlot));before.add(new VarInsnNode(ASTORE,arraySlot));
        before.add(new VarInsnNode(ALOAD,arraySlot));before.add(new VarInsnNode(ILOAD,indexSlot));before.add(new VarInsnNode(ILOAD,valueSlot));method.instructions.insertBefore(insn,before);
        InsnList after=new InsnList();after.add(new VarInsnNode(ALOAD,arraySlot));after.add(new TypeInsnNode(CHECKCAST,"[I"));
        after.add(new VarInsnNode(ILOAD,indexSlot));after.add(new VarInsnNode(ILOAD,valueSlot));integer(after,site);
        call(after,"arrayWrite","([IIII)V");method.instructions.insert(insn,after);
      } else if(insn instanceof JumpInsnNode && ((opcode>=IFEQ&&opcode<=IF_ACMPNE)||opcode==IFNULL||opcode==IFNONNULL)) {
        boolean two=opcode>=IF_ICMPEQ&&opcode<=IF_ACMPNE,reference=opcode==IFNULL||opcode==IFNONNULL||opcode==IF_ACMPEQ||opcode==IF_ACMPNE;
        Type type=reference?Type.getType(Object.class):Type.INT_TYPE;
        int rightSlot=two?temp(method,type):-1,leftSlot=temp(method,type);
        InsnList hook=new InsnList();if(two)hook.add(new VarInsnNode(type.getOpcode(ISTORE),rightSlot));
        hook.add(new VarInsnNode(type.getOpcode(ISTORE),leftSlot));
        // Report before the branch, then restore the original operand stack.
        integer(hook,opcode);loadBox(hook,type,leftSlot);
        if(two)loadBox(hook,type,rightSlot);else hook.add(new InsnNode(ACONST_NULL));
        integer(hook,site);call(hook,"branch","(ILjava/lang/Object;Ljava/lang/Object;I)V");
        hook.add(new VarInsnNode(type.getOpcode(ILOAD),leftSlot));if(two)hook.add(new VarInsnNode(type.getOpcode(ILOAD),rightSlot));
        method.instructions.insertBefore(insn,hook);
      } else if(opcode==ATHROW) {
        InsnList hook=new InsnList();hook.add(new InsnNode(DUP));integer(hook,site);
        call(hook,"explicitThrow","(Ljava/lang/Throwable;I)V");method.instructions.insertBefore(insn,hook);
      } else if(opcode>=IRETURN&&opcode<=RETURN) {
        InsnList hook=new InsnList();
        if(opcode!=RETURN) {
          Type type=Type.getReturnType(method.desc);
          int resultSlot=temp(method,type);
          hook.add(new VarInsnNode(type.getOpcode(ISTORE),resultSlot));
          loadBox(hook,type,resultSlot);string(hook,type.getDescriptor());integer(hook,site);
          call(hook,"returned","(Ljava/lang/Object;Ljava/lang/String;I)V");
          hook.add(new VarInsnNode(type.getOpcode(ILOAD),resultSlot));
        }
        integer(hook,site);call(hook,"exit","(I)V");method.instructions.insertBefore(insn,hook);
      }
    }
    LabelNode tryEnd=new LabelNode(),handler=new LabelNode();
    method.instructions.add(tryEnd);method.instructions.add(handler);
    InsnList unwind=new InsnList();unwind.add(new InsnNode(DUP));integer(unwind,ordinal);
    call(unwind,"unwind","(Ljava/lang/Throwable;I)V");unwind.add(new InsnNode(ATHROW));method.instructions.add(unwind);
    method.tryCatchBlocks.add(new TryCatchBlockNode(tryStart,tryEnd,handler,"java/lang/Throwable"));
  }
  private static byte[] transform(byte[] bytes,URLClassLoader loader) throws Exception {
    ClassNode node=new ClassNode();new ClassReader(bytes).accept(node,ClassReader.EXPAND_FRAMES);
    for(MethodNode method:node.methods)transformMethod(node,method);
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
    if(args.length!=2) { System.err.println("usage: OfflineTransformer <classes> <output>");System.exit(2); }
    try {
      Path input=Path.of(args[0]),output=Path.of(args[1]);Files.createDirectories(output);
      try(URLClassLoader loader=new URLClassLoader(new URL[]{input.toUri().toURL()},OfflineTransformer.class.getClassLoader());
          Stream<Path> paths=Files.walk(input)) {
        for(Path path:paths.filter(Files::isRegularFile).sorted(Comparator.naturalOrder()).toList()) {
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
