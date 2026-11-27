package visualjava;

import java.io.PrintStream;
import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.Charset;
import java.util.concurrent.atomic.AtomicLong;

/** Read-only access capability. Launch preparation owns module opens; this class never opens one. */
public final class JdkAccess {
  private static final MethodHandle THREAD_ID = publicMethod(Thread.class, "threadId", long.class);
  private static final MethodHandle STREAM_CHARSET = publicMethod(PrintStream.class, "charset", Charset.class);
  private static final class LegacyThreads {
    private static final AtomicLong nextId = new AtomicLong(-1);
    // Legacy Thread.getId can call an application override.
    private static final ThreadLocal<Long> subclassId = ThreadLocal.withInitial(nextId::getAndDecrement);
  }

  private JdkAccess() {}

  private static MethodHandle publicMethod(Class<?> owner, String name, Class<?> result) {
    try {
      return MethodHandles.publicLookup().findVirtual(owner, name, MethodType.methodType(result));
    } catch (NoSuchMethodException unavailable) {
      return null;
    } catch (IllegalAccessException failure) {
      throw new IllegalStateException(failure);
    }
  }

  @SuppressWarnings("deprecation")
  static long currentThreadId() {
    Thread thread = Thread.currentThread();
    if (THREAD_ID == null) return thread.getClass() == Thread.class ? thread.getId() : LegacyThreads.subclassId.get();
    try {
      return (long) THREAD_ID.invokeExact(thread);
    } catch (RuntimeException | Error failure) {
      throw failure;
    } catch (Throwable failure) {
      throw new AssertionError(failure);
    }
  }

  /** Use the actual stream accessor where available. On OpenJDK 17, the
   * recorder is initialized at the first transformed project entry, before
   * project code can replace a startup stream or change the startup properties.
   * Mirror System.initPhase1's separate charset choice for the stock streams. */
  static Charset startupStreamCharset(PrintStream stream, String channel) {
    if (STREAM_CHARSET != null) {
      try {
        return (Charset) STREAM_CHARSET.invokeExact(stream);
      } catch (RuntimeException | Error failure) {
        throw failure;
      } catch (Throwable failure) {
        throw new AssertionError(failure);
      }
    }
    if (stream.getClass() != PrintStream.class) return null;
    String encoding = System.getProperty("sun." + channel + ".encoding");
    if (encoding != null) {
      try { return Charset.forName(encoding); }
      catch (IllegalArgumentException unsupported) { /* OpenJDK also falls back to the default. */ }
    }
    return Charset.defaultCharset();
  }

  public static boolean trusted(Class<?> type) {
    return type != null && type.getClassLoader() == null
        && type.getModule() == String.class.getModule();
  }

  static Class<?> bootstrapClass(String name) {
    try {
      Class<?> type = Class.forName(name, false, null);
      return trusted(type) ? type : null;
    } catch (ClassNotFoundException | LinkageError | SecurityException unavailable) {
      return null;
    }
  }

  /** Exact declaring class and field type, not inherited name lookup or guessed offsets. */
  static Field field(Class<?> owner, String name, Class<?> fieldType) {
    if (!trusted(owner) || fieldType == null || !owner.getName().startsWith("java.util.")) return null;
    try {
      Field field = owner.getDeclaredField(name);
      if (field.getDeclaringClass() != owner || field.getType() != fieldType
          || Modifier.isStatic(field.getModifiers()) || !field.trySetAccessible()) return null;
      return field;
    } catch (ReflectiveOperationException | RuntimeException unavailable) {
      return null;
    }
  }

  static boolean available(Field... fields) {
    for (Field field : fields) if (field == null) return false;
    return true;
  }

  /** Only the known exact platform paths' own JDK implementation may supply path text. */
  public static String safePath(Object value) {
    if (value == null) return null;
    Class<?> type = value.getClass();
    if (!trusted(type)) return null;
    String name = type.getName();
    if (!name.equals("sun.nio.fs.UnixPath") && !name.equals("sun.nio.fs.WindowsPath")) return null;
    try {
      Method method = type.getMethod("toString");
      if (method.getDeclaringClass() != type || method.getReturnType() != String.class
          || Modifier.isStatic(method.getModifiers())) return null;
      String text;
      if (name.equals("sun.nio.fs.UnixPath")) {
        // UnixPath.toString() can decode through the native-encoding Charset. An own JDK
        // method alone does not prove its delegates safe. Borrow only an existing cache;
        // java.util access alone does not grant this capability, so normally root's
        // captured Path.of/Paths.get String evidence supplies the endpoint instead.
        Field cached = type.getDeclaredField("stringValue");
        if (cached.getType() != String.class || Modifier.isStatic(cached.getModifiers())
            || !cached.trySetAccessible()) return null;
        text = (String) cached.get(value);
      } else {
        // The audited exact WindowsPath implementation returns its stored String.
        text = value.toString();
      }
      // Never pass a shortened path off as the original endpoint.
      return text != null && text.length() <= SemanticObservations.MAX_PREVIEW_UNITS ? text : null;
    } catch (ReflectiveOperationException | RuntimeException unavailable) {
      return null;
    }
  }
}
