# Forensic panel word wrapping

The 3D exception panel now prefers spaces and qualified-name separators when the next segment fits a new line. The wrapper retains the separator, spaces and escaped glyphs so the joined lines preserve the captured string. A long segment can still wrap within its width and the existing line cap still bounds glyph work.

The unit regression first reproduces a break inside `IllegalStateException`. The corrected layout preserves the simple name on its own line and keeps evidence words intact. All 11 focused model, placement and presentation tests pass.

Source `7f7d3faca6e0f19c48fc81967f51e0d0a247da6e23d8bbe42e9648de292dbeed` passes all 11 targeted native cases in 99.910 seconds. Five comparable exception cases and five forensic ink cases cover the desktop, narrow and short views. The separate GPU quality case exercises the actual exception panel across quality tiers. Paired short and narrow captures retain the same joined text, line positions, panel bounds, camera pose and cursor. In each, `java.lang.` and `IllegalStateException` occupy separate lines. The phrases `captured stack-text fact` and `captured cause-chain fact` are readable as words. The short original was reviewed at full size. Source, captures and paired observations are under `.ggjavaez/qa/reference-exact/forensic-word-wrap-prototype/native/`.

All eight source checks pass in 295.201 seconds. The default suite records 2,280 passes and 70 explicit opt-in skips across 244 test files. The production entry is 71,733 B gzip. These checks cover the exact source tested in the targeted browser run.
