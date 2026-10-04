package visualjava;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.nio.file.Files;
import visualjava.SemanticObservations.FileObservation;
import visualjava.SemanticObservations.StringSnapshot;

/** Observes the normal return of the original call. Never performs I/O or invokes a delegate. */
public final class FileIoObservations {
  private FileIoObservations() {}
  private static final int LIMIT = SemanticObservations.MAX_PREVIEW_UNITS;

  /**
   * Invoke only after the actual successful operation, within Recorder's guarded capture.
   * Operands/results are borrowed. No identity registration or recursive observation occurs.
   * null means no supported operation. Root supplies call/source provenance and cached endpoints.
   */
  public static FileObservation successful(String owner, String name, String descriptor,
      Object receiver, Object[] args, Object result) {
    if (owner == null || name == null || descriptor == null || args == null) return null;
    // The transformer uses dotted owners today; also accept original JVM internal names.
    owner = owner.replace('/', '.');
    if (receiver == null && owner.equals("java.nio.file.Files") && JdkAccess.trusted(Files.class))
      return files(name, descriptor, args, result);
    if (exact(receiver, BufferedReader.class)) {
      if (closeOwner(owner, "java.io.BufferedReader", "java.io.Reader")
          && name.equals("close") && descriptor.equals("()V") && args.length == 0)
        return operation("close", null, null, null, false, receiver);
      if (owner.equals("java.io.BufferedReader") || owner.equals("java.io.Reader")) {
        // readLine is declared only by BufferedReader, not Reader.
        if (name.equals("readLine") && !owner.equals("java.io.BufferedReader")) return null;
        return reader(name, descriptor, receiver, args, result);
      }
    }
    if (exact(receiver, BufferedWriter.class)) {
      if (closeOwner(owner, "java.io.BufferedWriter", "java.io.Writer")
          && name.equals("close") && descriptor.equals("()V") && args.length == 0)
        return operation("close", null, null, null, false, receiver);
      if (owner.equals("java.io.BufferedWriter") || owner.equals("java.io.Writer")
          || owner.equals("java.lang.Appendable") && name.equals("append"))
        return writer(name, descriptor, receiver, args);
    }
    return null;
  }

  /** Only endpoint capture, not resolution/stat/read; unknown or oversized paths remain null. */
  public static String safePath(Object value) { return JdkAccess.safePath(value); }

  private static FileObservation files(String name, String descriptor, Object[] args, Object result) {
    if (name.equals("readString") && (descriptor.equals("(Ljava/nio/file/Path;)Ljava/lang/String;") && args.length == 1
        || descriptor.equals("(Ljava/nio/file/Path;Ljava/nio/charset/Charset;)Ljava/lang/String;") && args.length == 2)) {
      if (!exact(result, String.class)) return null;
      return text("read", safePath(args[0]), (String) result, null);
    }
    if (name.equals("writeString") && (descriptor.equals("(Ljava/nio/file/Path;Ljava/lang/CharSequence;[Ljava/nio/file/OpenOption;)Ljava/nio/file/Path;") && args.length == 3
        || descriptor.equals("(Ljava/nio/file/Path;Ljava/lang/CharSequence;Ljava/nio/charset/Charset;[Ljava/nio/file/OpenOption;)Ljava/nio/file/Path;") && args.length == 4)) {
      if (args[0] == null || result != args[0]) return null;
      String path = safePath(args[0]);
      // The original call may have used an arbitrary CharSequence. Never inspect it here.
      if (exact(args[1], String.class)) return text("write", path, (String) args[1], null);
      return operation("write", path, null, null, true, null);
    }
    if (name.equals("newBufferedReader") && (descriptor.equals("(Ljava/nio/file/Path;)Ljava/io/BufferedReader;") && args.length == 1
        || descriptor.equals("(Ljava/nio/file/Path;Ljava/nio/charset/Charset;)Ljava/io/BufferedReader;") && args.length == 2)) {
      if (!exact(result, BufferedReader.class)) return null;
      return operation("open", safePath(args[0]), null, null, false, result);
    }
    if (name.equals("newBufferedWriter") && (descriptor.equals("(Ljava/nio/file/Path;[Ljava/nio/file/OpenOption;)Ljava/io/BufferedWriter;") && args.length == 2
        || descriptor.equals("(Ljava/nio/file/Path;Ljava/nio/charset/Charset;[Ljava/nio/file/OpenOption;)Ljava/io/BufferedWriter;") && args.length == 3)) {
      if (!exact(result, BufferedWriter.class)) return null;
      return operation("open", safePath(args[0]), null, null, false, result);
    }
    return null;
  }

  private static FileObservation reader(String name, String descriptor, Object receiver, Object[] args, Object result) {
    if (name.equals("readLine") && descriptor.equals("()Ljava/lang/String;") && args.length == 0) {
      if (result == null) return operation("read", null, 0, "", false, receiver);
      if (exact(result, String.class)) return text("read", null, (String) result, receiver);
      return null;
    }
    if (!name.equals("read")) return null;
    Integer count = integer(result);
    if (count == null) return null;
    if (descriptor.equals("()I") && args.length == 0) {
      if (count == -1) return operation("read", null, 0, "", false, receiver);
      if (count < 0 || count > Character.MAX_VALUE) return null;
      return operation("read", null, 1, String.valueOf((char) count.intValue()), false, receiver);
    }
    if (descriptor.equals("([C)I") && args.length == 1 && exact(args[0], char[].class)) {
      char[] buffer = (char[]) args[0];
      return readBuffer(buffer, 0, buffer.length, count, receiver);
    }
    if (descriptor.equals("([CII)I") && args.length == 3 && exact(args[0], char[].class)) {
      Integer offset = integer(args[1]), length = integer(args[2]);
      if (offset == null || length == null) return null;
      return readBuffer((char[]) args[0], offset, length, count, receiver);
    }
    return null;
  }

  private static FileObservation readBuffer(char[] buffer, int offset, int requested, int count, Object resource) {
    if (!range(buffer.length, offset, requested) || count < -1 || count > requested) return null;
    if (count == -1) return operation("read", null, 0, "", false, resource);
    int captured = Math.min(count, LIMIT);
    return operation("read", null, count, new String(buffer, offset, captured), captured < count, resource);
  }

  private static FileObservation writer(String name, String descriptor, Object receiver, Object[] args) {
    if (name.equals("write")) {
      if (descriptor.equals("(I)V") && args.length == 1) {
        Integer character = integer(args[0]);
        return character == null ? null : operation("write", null, 1,
            String.valueOf((char) character.intValue()), false, receiver);
      }
      if (descriptor.equals("(Ljava/lang/String;)V") && args.length == 1 && exact(args[0], String.class))
        return text("write", null, (String) args[0], receiver);
      if (descriptor.equals("(Ljava/lang/String;II)V") && args.length == 3 && exact(args[0], String.class)) {
        Integer offset = integer(args[1]), length = integer(args[2]);
        String value = (String) args[0];
        if (offset == null || length == null || !range(value.length(), offset, length)) return null;
        int captured = Math.min(length, LIMIT);
        return operation("write", null, length, value.substring(offset, offset + captured), captured < length, receiver);
      }
      if (descriptor.equals("([C)V") && args.length == 1 && exact(args[0], char[].class))
        return mutableWrite(((char[]) args[0]).length, receiver);
      if (descriptor.equals("([CII)V") && args.length == 3 && exact(args[0], char[].class)) {
        Integer offset = integer(args[1]), length = integer(args[2]);
        if (offset == null || length == null || !range(((char[]) args[0]).length, offset, length)) return null;
        return mutableWrite(length, receiver);
      }
    }
    if (name.equals("append")) {
      if (appendDescriptor(descriptor, "Ljava/lang/CharSequence;") && args.length == 1) {
        if (args[0] == null) return text("write", null, "null", receiver);
        if (exact(args[0], String.class)) return text("write", null, (String) args[0], receiver);
        return operation("write", null, null, null, true, receiver);
      }
      if (appendDescriptor(descriptor, "Ljava/lang/CharSequence;II") && args.length == 3) {
        Integer start = integer(args[1]), end = integer(args[2]);
        if (start == null || end == null || start < 0 || end < start) return null;
        if (args[0] == null || exact(args[0], String.class)) {
          String value = args[0] == null ? "null" : (String) args[0];
          if (end > value.length()) return null;
          int length = end - start, captured = Math.min(length, LIMIT);
          return operation("write", null, length, value.substring(start, start + captured), captured < length, receiver);
        }
        // Neither length(), subSequence(), nor toString() on user CharSequence is safe.
        return operation("write", null, null, null, true, receiver);
      }
      if (appendDescriptor(descriptor, "C") && args.length == 1 && exact(args[0], Character.class))
        return operation("write", null, 1, String.valueOf(((Character) args[0]).charValue()), false, receiver);
    }
    // flush has no locked raw operation tag; wrapper construction does not prove a file open.
    return null;
  }

  private static FileObservation mutableWrite(int count, Object resource) {
    // A delegate can change the supplied array before returning. A post-call preview cannot
    // prove which characters were supplied. Root can add separately captured pre-call evidence.
    return operation("write", null, count, count == 0 ? "" : null, count > 0, resource);
  }

  private static boolean closeOwner(String owner, String concrete, String base) {
    return owner.equals(concrete) || owner.equals(base)
        || owner.equals("java.io.Closeable") || owner.equals("java.lang.AutoCloseable");
  }
  private static boolean appendDescriptor(String descriptor, String arguments) {
    return descriptor.equals("(" + arguments + ")Ljava/io/Writer;")
        || descriptor.equals("(" + arguments + ")Ljava/lang/Appendable;");
  }
  private static boolean range(int total, int offset, int count) {
    return offset >= 0 && count >= 0 && offset <= total && count <= total - offset;
  }
  private static Integer integer(Object value) {
    return exact(value, Integer.class) ? (Integer) value : null;
  }
  private static boolean exact(Object value, Class<?> type) {
    return value != null && value.getClass() == type && JdkAccess.trusted(type);
  }
  private static FileObservation text(String operation, String path, String value, Object resource) {
    StringSnapshot snapshot = StringObservations.snapshot(value);
    return operation(operation, path, snapshot.length, snapshot.preview, snapshot.truncated, resource);
  }
  private static FileObservation operation(String operation, String path, Integer charCount,
      String preview, boolean truncated, Object resource) {
    return new FileObservation(operation, path, null, charCount, preview, truncated, resource);
  }
}
