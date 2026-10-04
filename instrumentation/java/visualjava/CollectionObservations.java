package visualjava;

import java.lang.reflect.Field;
import java.util.AbstractList;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.NavigableMap;
import java.util.TreeMap;
import java.util.TreeSet;
import visualjava.SemanticObservations.CollectionSnapshot;
import visualjava.SemanticObservations.Entry;

/** Exact-class structural snapshots. No collection methods, user methods, or recursive observation. */
public final class CollectionObservations {
  private CollectionObservations() {}
  private static final int LIMIT = SemanticObservations.MAX_CHILD_REFERENCES;
  private static final int MAP_LIMIT = LIMIT / 2;
  private static final String ACCESS = "JDK layout/access unavailable";
  private static final String UNSTABLE = "Inconsistent or changing collection structure";

  private static final class Lists {
    static final Field MOD = JdkAccess.field(AbstractList.class, "modCount", int.class);
    static final Field ARRAY_SIZE = JdkAccess.field(ArrayList.class, "size", int.class);
    static final Field DATA = JdkAccess.field(ArrayList.class, "elementData", Object[].class);
    static final Class<?> NODE = JdkAccess.bootstrapClass("java.util.LinkedList$Node");
    static final Field LINK_SIZE = JdkAccess.field(LinkedList.class, "size", int.class);
    static final Field FIRST = JdkAccess.field(LinkedList.class, "first", NODE);
    static final Field LAST = JdkAccess.field(LinkedList.class, "last", NODE);
    static final Field ITEM = JdkAccess.field(NODE, "item", Object.class);
    static final Field NEXT = JdkAccess.field(NODE, "next", NODE);
    static final Field PREV = JdkAccess.field(NODE, "prev", NODE);
  }
  private static final class Deques {
    static final Field ELEMENTS = JdkAccess.field(ArrayDeque.class, "elements", Object[].class);
    static final Field HEAD = JdkAccess.field(ArrayDeque.class, "head", int.class);
    static final Field TAIL = JdkAccess.field(ArrayDeque.class, "tail", int.class);
  }
  private static final class Hashes {
    static final Class<?> NODE = JdkAccess.bootstrapClass("java.util.HashMap$Node");
    static final Class<?> TREE_NODE = JdkAccess.bootstrapClass("java.util.HashMap$TreeNode");
    static final Class<?> TABLE_TYPE = JdkAccess.bootstrapClass("[Ljava.util.HashMap$Node;");
    static final Field TABLE = JdkAccess.field(HashMap.class, "table", TABLE_TYPE);
    static final Field SIZE = JdkAccess.field(HashMap.class, "size", int.class);
    static final Field MOD = JdkAccess.field(HashMap.class, "modCount", int.class);
    static final Field HASH = JdkAccess.field(NODE, "hash", int.class);
    static final Field KEY = JdkAccess.field(NODE, "key", Object.class);
    static final Field VALUE = JdkAccess.field(NODE, "value", Object.class);
    static final Field NEXT = JdkAccess.field(NODE, "next", NODE);
    static final Field SET_MAP = JdkAccess.field(HashSet.class, "map", HashMap.class);
  }
  private static final class Trees {
    static final Class<?> NODE = JdkAccess.bootstrapClass("java.util.TreeMap$Entry");
    static final Field SIZE = JdkAccess.field(TreeMap.class, "size", int.class);
    static final Field MOD = JdkAccess.field(TreeMap.class, "modCount", int.class);
    static final Field ROOT = JdkAccess.field(TreeMap.class, "root", NODE);
    static final Field KEY = JdkAccess.field(NODE, "key", Object.class);
    static final Field VALUE = JdkAccess.field(NODE, "value", Object.class);
    static final Field LEFT = JdkAccess.field(NODE, "left", NODE);
    static final Field RIGHT = JdkAccess.field(NODE, "right", NODE);
    static final Field PARENT = JdkAccess.field(NODE, "parent", NODE);
    static final Field SET_MAP = JdkAccess.field(TreeSet.class, "m", NavigableMap.class);
  }

  public static CollectionSnapshot snapshot(Object value) {
    return snapshot(value, null);
  }

  /** Optional root-provided logical view for LinkedList; no view is inferred from method names. */
  public static CollectionSnapshot snapshot(Object value, String viewKind) {
    if (value == null) return opaque("OPAQUE", null, null, "Null has no collection identity");
    Class<?> type = value.getClass();
    if (!JdkAccess.trusted(type)) return opaque("OPAQUE", null, null, "Non-whitelisted implementation");
    try {
      if (type == ArrayList.class) return arrayList(value);
      if (type == LinkedList.class) return linkedList(value, viewKind);
      if (type == ArrayDeque.class) return deque(value);
      if (type == HashMap.class) return hash(value, false);
      if (type == TreeMap.class) return tree(value, false);
      if (type == HashSet.class) {
        if (Hashes.SET_MAP == null) return opaque("SET", null, "unordered", ACCESS);
        Object map = Hashes.SET_MAP.get(value);
        if (!exact(map, HashMap.class)) return opaque("SET", null, "unordered", "Unsupported backing map");
        CollectionSnapshot result = hash(map, true);
        return Hashes.SET_MAP.get(value) == map ? result : opaque("SET", null, "unordered", UNSTABLE);
      }
      if (type == TreeSet.class) {
        if (Trees.SET_MAP == null) return opaque("SET", null, "sorted", ACCESS);
        Object map = Trees.SET_MAP.get(value);
        // TreeSet range/descending views can invoke user comparisons even on traversal.
        if (!exact(map, TreeMap.class)) return opaque("SET", null, "sorted", "Unsupported backing map/view");
        CollectionSnapshot result = tree(map, true);
        return Trees.SET_MAP.get(value) == map ? result : opaque("SET", null, "sorted", UNSTABLE);
      }
    } catch (ReflectiveOperationException | RuntimeException unavailable) {
      return opaque("OPAQUE", null, null, "Snapshot access failed");
    }
    return opaque("OPAQUE", null, null, "Non-whitelisted implementation");
  }

  private static CollectionSnapshot arrayList(Object value) throws IllegalAccessException {
    if (!JdkAccess.available(Lists.ARRAY_SIZE, Lists.DATA, Lists.MOD)) return opaque("LIST", null, "index", ACCESS);
    int size = Lists.ARRAY_SIZE.getInt(value), mod = Lists.MOD.getInt(value);
    Object data = Lists.DATA.get(value);
    if (size < 0 || !exact(data, Object[].class) || size > ((Object[]) data).length)
      return opaque("LIST", null, "index", UNSTABLE);
    Object[] items = Arrays.copyOf((Object[]) data, Math.min(size, LIMIT));
    if (Lists.ARRAY_SIZE.getInt(value) != size || Lists.MOD.getInt(value) != mod || Lists.DATA.get(value) != data)
      return opaque("LIST", null, "index", UNSTABLE);
    return items("LIST", size, "index", items, null);
  }

  private static CollectionSnapshot linkedList(Object value, String viewKind) throws IllegalAccessException {
    String kind = "QUEUE".equals(viewKind) ? "QUEUE" : "DEQUE".equals(viewKind) ? "DEQUE" : "LIST";
    String order = kind.equals("LIST") ? "index" : "fifo";
    if (!JdkAccess.available(Lists.LINK_SIZE, Lists.FIRST, Lists.LAST, Lists.ITEM, Lists.NEXT, Lists.PREV, Lists.MOD))
      return opaque(kind, null, order, ACCESS);
    int size = Lists.LINK_SIZE.getInt(value), mod = Lists.MOD.getInt(value);
    if (size < 0) return opaque(kind, null, order, UNSTABLE);
    Object first = Lists.FIRST.get(value), node = first;
    Object[] items = new Object[Math.min(size, LIMIT)], seen = new Object[items.length];
    for (int i = 0; i < items.length; i++) {
      if (!exact(node, Lists.NODE) || contains(seen, i, node)) return opaque(kind, null, order, UNSTABLE);
      seen[i] = node; items[i] = Lists.ITEM.get(node); node = Lists.NEXT.get(node);
    }
    if (size <= LIMIT && node != null || Lists.LINK_SIZE.getInt(value) != size
        || Lists.MOD.getInt(value) != mod || Lists.FIRST.get(value) != first)
      return opaque(kind, null, order, UNSTABLE);
    return items(kind, size, order, items, null);
  }

  private static CollectionSnapshot deque(Object value) throws IllegalAccessException {
    if (!JdkAccess.available(Deques.ELEMENTS, Deques.HEAD, Deques.TAIL)) return opaque("DEQUE", null, "fifo", ACCESS);
    Object data = Deques.ELEMENTS.get(value);
    if (!exact(data, Object[].class)) return opaque("DEQUE", null, "fifo", UNSTABLE);
    Object[] array = (Object[]) data;
    int head = Deques.HEAD.getInt(value), tail = Deques.TAIL.getInt(value);
    if (head < 0 || head >= array.length || tail < 0 || tail >= array.length || array[tail] != null)
      return opaque("DEQUE", null, "fifo", UNSTABLE);
    int size = tail >= head ? tail - head : array.length - head + tail;
    Object[] items = new Object[Math.min(size, LIMIT)];
    int index = head;
    for (int i = 0; i < items.length; i++) {
      if (array[index] == null) return opaque("DEQUE", null, "fifo", UNSTABLE);
      items[i] = array[index]; index++; if (index == array.length) index = 0;
    }
    if (Deques.ELEMENTS.get(value) != data || Deques.HEAD.getInt(value) != head || Deques.TAIL.getInt(value) != tail)
      return opaque("DEQUE", null, "fifo", UNSTABLE);
    return items("DEQUE", size, "fifo", items, null);
  }

  private static CollectionSnapshot hash(Object value, boolean set) throws IllegalAccessException {
    String kind = set ? "SET" : "MAP";
    if (!JdkAccess.available(Hashes.TABLE, Hashes.SIZE, Hashes.MOD, Hashes.HASH, Hashes.KEY, Hashes.VALUE, Hashes.NEXT))
      return opaque(kind, null, "unordered", ACCESS);
    int size = Hashes.SIZE.getInt(value), mod = Hashes.MOD.getInt(value);
    Object data = Hashes.TABLE.get(value);
    if (size < 0 || data != null && !exact(data, Hashes.TABLE_TYPE) || size > 0 && data == null)
      return opaque(kind, null, "unordered", UNSTABLE);
    int capacity = Math.min(size, set ? LIMIT : MAP_LIMIT), count = 0, bucket = 0;
    Object[] items = set ? new Object[capacity] : new Object[0];
    Entry[] entries = set ? new Entry[0] : new Entry[capacity];
    Object[] seen = new Object[capacity];
    Object[] table = data == null ? new Object[0] : (Object[]) data;
    Object node = null;
    while (count < capacity) {
      while (node == null && bucket < table.length && bucket < SemanticObservations.MAX_BUCKET_SCANS)
        node = table[bucket++];
      if (node == null) break;
      if ((!exact(node, Hashes.NODE) && !exact(node, Hashes.TREE_NODE)) || contains(seen, count, node))
        return opaque(kind, null, "unordered", UNSTABLE);
      seen[count] = node;
      Object key = Hashes.KEY.get(node);
      if (set) items[count] = key; else entries[count] = new Entry(key, Hashes.VALUE.get(node));
      count++; node = Hashes.NEXT.get(node);
    }
    if (Hashes.SIZE.getInt(value) != size || Hashes.MOD.getInt(value) != mod || Hashes.TABLE.get(value) != data)
      return opaque(kind, null, "unordered", UNSTABLE);
    if (count < capacity && bucket == table.length && node == null)
      return opaque(kind, null, "unordered", UNSTABLE);
    String reason = count < capacity ? "Hash bucket scan limit" : count < size ? "Preview reference limit" : null;
    return new CollectionSnapshot(kind, size, "unordered", Arrays.copyOf(items, set ? count : 0),
        Arrays.copyOf(entries, set ? 0 : count), count < size, reason);
  }

  private static CollectionSnapshot tree(Object value, boolean set) throws IllegalAccessException {
    String kind = set ? "SET" : "MAP";
    if (!JdkAccess.available(Trees.SIZE, Trees.MOD, Trees.ROOT, Trees.KEY, Trees.VALUE, Trees.LEFT, Trees.RIGHT, Trees.PARENT))
      return opaque(kind, null, "sorted", ACCESS);
    int size = Trees.SIZE.getInt(value), mod = Trees.MOD.getInt(value);
    Object root = Trees.ROOT.get(value), node = root;
    if (size < 0 || (size == 0) != (root == null)) return opaque(kind, null, "sorted", UNSTABLE);
    int capacity = Math.min(size, set ? LIMIT : MAP_LIMIT), count = 0, depth = 0, steps = 0;
    Object[] stack = new Object[64], seen = new Object[capacity];
    Object[] items = set ? new Object[capacity] : new Object[0];
    Entry[] entries = set ? new Entry[0] : new Entry[capacity];
    boolean workLimited = false;
    while (count < capacity && (node != null || depth > 0)) {
      while (node != null) {
        if (steps++ >= SemanticObservations.MAX_TREE_STEPS || depth == stack.length) { workLimited = true; break; }
        if (!exact(node, Trees.NODE) || contains(stack, depth, node) || contains(seen, count, node))
          return opaque(kind, null, "sorted", UNSTABLE);
        stack[depth++] = node; node = Trees.LEFT.get(node);
      }
      if (workLimited) break;
      if (steps++ >= SemanticObservations.MAX_TREE_STEPS) { workLimited = true; break; }
      node = stack[--depth]; stack[depth] = null; seen[count] = node;
      Object key = Trees.KEY.get(node);
      if (set) items[count] = key; else entries[count] = new Entry(key, Trees.VALUE.get(node));
      count++; node = Trees.RIGHT.get(node);
    }
    if (Trees.SIZE.getInt(value) != size || Trees.MOD.getInt(value) != mod || Trees.ROOT.get(value) != root)
      return opaque(kind, null, "sorted", UNSTABLE);
    if (!workLimited && count < capacity) return opaque(kind, null, "sorted", UNSTABLE);
    String reason = workLimited ? "Tree traversal limit" : count < size ? "Preview reference limit" : null;
    return new CollectionSnapshot(kind, size, "sorted", Arrays.copyOf(items, set ? count : 0),
        Arrays.copyOf(entries, set ? 0 : count), workLimited || count < size, reason);
  }

  private static boolean exact(Object value, Class<?> type) {
    return value != null && type != null && value.getClass() == type;
  }
  private static boolean contains(Object[] values, int length, Object value) {
    for (int i = 0; i < length; i++) if (values[i] == value) return true;
    return false;
  }
  private static CollectionSnapshot items(String kind, int size, String order, Object[] items, String reason) {
    boolean truncated = items.length < size;
    return new CollectionSnapshot(kind, size, order, items, new Entry[0], truncated,
        reason != null ? reason : truncated ? "Preview reference limit" : null);
  }
  private static CollectionSnapshot opaque(String kind, Integer size, String order, String reason) {
    return new CollectionSnapshot(kind, size, order, new Object[0], new Entry[0], true, reason);
  }
}
