# Recorded stdout preview projection

The SceneModel now retains the first 60 code points of the most recent stdout line and includes an ellipsis when more text belongs to that line. Counting continues over the original writes after the preview fills. A pending CR still joins a following LF across write boundaries. An unterminated final line counts as one line. The bounded line summary tracks its own length so the retained text is no longer rescanned for each character.

The graphless unit regression fails before the change at the exact overflow boundary. The existing fixture assertions still run. Ten focused tests pass, including an emoji within the first 60 code points, an ellipsis added by a later write, split CRLF, an unterminated last line and reverse seeks.

Two native Chrome probes run actual Java at 1440 × 900 and 760 × 900. Both preserve the original pipe text and expose the five separate captured GraphIO writes at cursors 17, 25, 33, 41 and 49. Native timeline seeks in both directions reproduce the exact count and preview at each write, keep the endpoint anchor stable and show zero endpoints at cursor zero. The probes complete in 22.147 seconds with two completed JVM executions and zero failures, skips or flakes. The exact source and observed evidence are under `.ggjavaez/qa/reference-exact/io-preview-prototype/native/`.

This checkpoint covers the projected data. World text for the preview, its visual layout and its 100 ms publication behavior remain open.

Source `965b49394a5dda42c921dc11b569ce47436f7846e8936ca7db2756904152e1cc` passes all eight source checks in 285.648 seconds. The default suite passes 2,281 cases with 70 explicit opt-in skips across 244 test files. The main production entry is 71,732 B gzip.
