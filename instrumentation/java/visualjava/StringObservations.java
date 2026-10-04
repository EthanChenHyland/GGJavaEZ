package visualjava;

import visualjava.SemanticObservations.StringSnapshot;

/** String is final. Read only bounded public text, never backing bytes/coder/hash. */
public final class StringObservations {
  private StringObservations() {}

  public static StringSnapshot snapshot(String value) {
    if (value == null) return null;
    int length = value.length();
    int count = Math.min(length, SemanticObservations.MAX_PREVIEW_UNITS);
    // Keep UTF-16 code units, even when the boundary splits a surrogate pair.
    // Recorder's JSON encoder must escape isolated surrogates faithfully.
    return new StringSnapshot(length, value.substring(0, count), count < length);
  }
}
