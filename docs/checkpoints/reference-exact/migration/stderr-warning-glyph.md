# Shared stderr warning glyph

Recorded stderr has a warning triangle on its 3D rail port and in Console rows. The port fits the glyph and channel name together on one line and moves the count to the second line when needed. The Console uses text presentation for the warning character so it follows the recorded channel color. Captured text, channel assignment and exception evidence are preserved.

Source `fc08fa44737f29920d0b19839c584463e4b81e601b728ce8e22b647dc35e7970` passes the million-line Console case and two real-JVM Console cases at 1440 × 900 and 760 × 900, in 18.659 seconds with zero failures, skips or flakes. The browser cases check the mounted 3D glyph, the Console glyph and the existing exact recorded and pipe output. Root reviewed the original narrow capture at full size. It shows both warning marks and remaining connector overlap on the I/O rail. The complete source and capture archive is under `.ggjavaez/qa/reference-exact/io-stderr-glyph-prototype/native/`.

All eight source checks pass in 285.504 seconds, including 2,281 default unit passes and 70 explicit opt-in skips. The main production entry is 71,735 B gzip.
