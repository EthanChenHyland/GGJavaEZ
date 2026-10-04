package visualjava;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;

/** Read-only access capability. Launch preparation owns module opens; this class never opens one. */
public final class JdkAccess {
  private JdkAccess() {}

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
