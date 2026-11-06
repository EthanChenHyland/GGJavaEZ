# Recursive frame headings and compact slot evidence

The existing frame header can tighten tracking by up to 0.025 em to keep a slightly overwide signature on one line. The font remains Inter at 0.40 units. A single-line signature and its invocation identity sit lower in the header, below the part a nearer slab can cover. Longer signatures retain the two-line layout. The renderer and camera admission read the same heading coordinates. Row geometry, anchor coordinates and camera angles are preserved.

The focused regression first failed with `SeriesApp.total(int)` wrapped across two lines. It now checks that the whole signature fits at the actual font size and that its identity shares the lower line. The long `InventoryApp.main(String[])` signature still wraps. All 48 focused typography, text lifetime and camera tests pass.

Desktop and narrow JVM captures compare actual glyph corners with the visible stack boxes. In each prior capture, the titles of frames #6–#8 and the identity of frame #8 had blocked corners. The new captures report zero blocked corners across the eight titles and identities. The native reference harness now checks this geometry for the four nearest frames. Its first wider preflight passed nine cases and rejected three hidden identities at 1440×650. Their projected sizes were below the required 11 px threshold. The corrected check requires them to remain hidden below that threshold and still checks their measured geometry. It passes all ten cases across the five viewport sizes.

The scene projector now stores the introducing ordinal and first-observation flags inline for slots with one observation. A second observation creates the full history. Shared evidence reuses the latest single-event record when the introducing and changing events coincide. Layout shares immutable placement paths through a bounded 256-entry cache. A saved-trace comparison matches complete layout and scene snapshots on Dense and 32 generated recordings, including append and rewind.

## Source and generated performance

The retention-only source passes 80 focused tests, including the layout golden. Its unchanged Node run matches all three corpus hashes and completes in 17.117 s. LINE scaling passes at 1.096243297×. The largest corpus retains 21,275,800 presentation bytes versus 21,906,128 in the preceding combined checkpoint. Its presentation ratio is 0.382183102. The other two ratios are 1.591989987 and 0.453123615. All three exceed 25%.

The two-viewport visual proof uses source `deb71b49dc82e7304fbc5a3f418ca7230415aa58fca6ca5bc383a15688fdf39c`. The first integrated source `b99151490d83dffeaa60bddb9749b1e82c465843298209b8fe0cfc6808609a2d` inventories 993 inputs and seven changed files. It includes the native heading check and its short-viewport correction. All eight build, type, lint, unit and source checks pass. The default unit run passes 2,278 tests with 70 explicit opt-in skips across 244 files.

## Integrated array Focus failure and correction

The first integrated run passes 118 of 120 native cases in 1,275.459 seconds. It retains 155 original screenshots, six reviewed at full size, and 96 distinct actual JVM session attachments. All recursion and I/O comparison cases pass. The narrow I/O image also shows a readability issue outside those assertions. Its three channel blocks are visible and their labels fall below the 11 px floor.

In the reduced-motion desktop array case, the canonical cell `[6500]` moved from presentation slot 23 to 63 at CLOSE detail. Its selection and recording cursor were correct. The readiness observation returned while the camera was still framing slot 23, and the cell was outside the viewport. The screenshot taken after that observation shows the camera had caught up. In the separate 760×900 case, the JVM completed, then the Vite client lost its connection and the page reloaded during Home readiness before Focus. Both failures, exact source inputs, observations, and original screenshots are archived under `.ggjavaez/qa/reference-exact/stack-heading-retention-final-failed/`.

The Focus correction schedules the camera move in a layout effect for the committed anchor, before its first draw, and marks that move pending immediately. It keeps the same arrival deadline during remapping. The existing user-input cancellation path and the existing geometry and native assertions apply. `CameraRig.tsx` is the sole camera file changed.

The corrected source `0bd89e66ce26bacd00e2795c5b2c618746f712f4be218bb4b2ba85ec741b1563` passes 24 of 24 targeted native cases in 224.269 seconds. The 16 array trials cover all five viewports and both motion modes, including five repeats at 1440×900 with reduced motion and three at 760×900 with normal motion. Both resize and both orbit cases pass, along with four Source and Inspector layout checks. The reviewed desktop and narrow captures show `[6500]` and its face inside the intended free rectangle after remapping from slot 23 to 63. The trial report and hash-bound captures are under `.ggjavaez/qa/reference-exact/stack-heading-retention/focus-remap/`.

All eight source checks pass on the corrected source in 280.158 seconds. The default unit run passes 2,278 of 2,348 discovered tests with 70 explicit opt-in skips. The production main entry is 71,734 gzip bytes against a 500,000-byte budget. Monaco and Cinematic passes remain split, and the application Shell's static JS closure is 678,972 gzip bytes as a separate-resource sum.

The fresh integrated run passes 120 of 120 native cases in 1,306.040 seconds with zero skips, failures or flaky cases. The archive contains 156 original images and 96 distinct actual JVM session attachments. Six originals were reviewed at full size. Both earlier array Focus cases pass, and the new observations put the remapped cell and its caption inside the free rectangle. The supplied boards still show stronger acrylic depth and floor reflection. Dense connector glow, peripheral clipping and the narrow I/O labels remain visible differences. The exact source inventory, reports, captures, side-by-side and diff images are under `.ggjavaez/qa/reference-exact/stack-heading-retention-final-captures/`.

The protected Node benchmark runs on this same source in 20.233 seconds with all three corpus hashes matching the previous committed checkpoint. LINE scaling passes at 1.240093×. Presentation retention is 1,960,224, 5,645,800 and 21,291,416 bytes, or 210.263%, 45.327% and 38.246% of measured semantic retention. All three exceed 25%. The medium and large rows retain fewer presentation bytes in this run than the previous committed checkpoint, while the small row retains more. The full report and exact ratios are under `.ggjavaez/qa/reference-exact/stack-heading-retention/production-node/`.

The Dense browser run `087c8eb2-00c1-4891-bcdc-ebc3bf6bbe37` executes actual FULL JVM session `7397cd3e-40e4-4b6f-becb-49e1ae7c4a15` with 7,492 raw events and 9,852 normalized events. All ten stages complete in 474.454 seconds with zero browser or stage errors, suspended requests or orbit lifecycle issues. The benchmark exits one for the following five fixed limits.

| Metric | Measured (ms) | Limit (ms) |
| --- | ---: | ---: |
| Seek p50 | 83.456 | 55 |
| Seek p95 | 130.922 | 112 |
| Focus p95 | 183.828 | 125 |
| Home p95 | 198.740 | 152 |
| Cold-load median | 5,490.849 | 5,300 |

All five orbit windows pass with medians of 16.7 ms, p95 intervals of 17.5–17.8 ms, CPU p95 of 2.1–2.8 ms and at most 99 draw calls. The longest observed interval is 725.4 ms. The 61.428-second soak shows zero median drift and +0.028727% whole-frontend heap growth after GC. Four external rows remain unmeasured by the browser probe. The archive under `.ggjavaez/qa/reference-exact/performance-stack-heading-retention/` contains the report, profiles, JVM snapshot and reviewed Dense image. Whole A–G acceptance remains open.
