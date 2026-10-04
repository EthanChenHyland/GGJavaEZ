package visualjava;

/** Bounded, transient observer DTOs. Recorder encodes borrowed references without recursion. */
public final class SemanticObservations {
  private SemanticObservations() {}

  public static final int MAX_CHILD_REFERENCES = 32;
  public static final int MAX_PREVIEW_UNITS = 256;
  public static final int MAX_BUCKET_SCANS = 2048;
  public static final int MAX_TREE_STEPS = 2048;

  public static final class Entry {
    public final Object key, value;
    Entry(Object key, Object value) { this.key = key; this.value = value; }
  }

  /** Fresh arrays; callers must not mutate or retain their borrowed application references. */
  public static final class CollectionSnapshot {
    public final String kind, order, reason;
    public final Integer size;
    public final Object[] items;
    public final Entry[] entries;
    public final boolean truncated;

    CollectionSnapshot(String kind, Integer size, String order, Object[] items,
        Entry[] entries, boolean truncated, String reason) {
      this.kind = kind; this.size = size; this.order = order;
      this.items = items; this.entries = entries;
      this.truncated = truncated; this.reason = reason;
    }
  }

  public static final class StringSnapshot {
    public final int length;
    public final String preview;
    public final boolean truncated;
    StringSnapshot(int length, String preview, boolean truncated) {
      this.length = length; this.preview = preview; this.truncated = truncated;
    }
  }

  public static final class FileObservation {
    public final String operation, path, preview;
    public final Integer byteCount, charCount;
    public final boolean truncated;
    /** Existing receiver or successful factory result; no helper-created runtime identity. */
    public final Object resource;
    FileObservation(String operation, String path, Integer byteCount, Integer charCount,
        String preview, boolean truncated, Object resource) {
      this.operation = operation; this.path = path;
      this.byteCount = byteCount; this.charCount = charCount;
      this.preview = preview; this.truncated = truncated; this.resource = resource;
    }
  }
}
