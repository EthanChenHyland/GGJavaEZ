# Milestone 6 — real JVM traces

Milestone 6 continues the IDE foundation at `3c3d91f`. Editable Java now flows through a bounded offline ASM transform, a configured local JVM, a versioned raw event stream, and a pure normalizer into the existing trace reducer, stable spatial layout, and Classic/Spatial/Theater views. Normal Run still executes uninstrumented classes. [ADR 006](../../architecture/ADR-006-real-jvm-traces.md) and the [trace contract](../../architecture/M6_TRACE_CONTRACT.md) record the instrumentation and truth boundaries.

## Acceptance review

- Real multi-file Person: constructor receiver and `this`, reference from `p`, stable object identity, observed `age: 0 → 18`, executing `Person.java` line, reverse seek, and selection-driven source navigation.
- Real factorial: five distinct recursive invocations and observed return sequence `1, 2, 6, 24, 120`; shared 3D stack and Classic view. The full stack can be seen at Overview and individual frames at Focus.
- Real `int[]` sort: observed indexed loads/stores and low-level branches; Theater uses stable cells and never invents a swap source. A caught exception and an uncaught null dereference were verified separately.
- Real control flow: a separate `for`/`if` fixture records actual JVM branch decisions, local updates, and stdout `2`. It does not claim source-level loop iteration facts from bytecode alone.
- Failure and coverage: raw event/byte, time, object, and frame bounds; verifier/transform failure stops the Visualize path. Multiple project threads are reported unsupported. A crash retains an inspectable unwound frame and raw JVM stderr, with an incomplete timeline.
- The recorder captures only project classes. Source mapping uses compiled package/SourceFile metadata and exact project-relative paths. Ambiguous paths are diagnosed. Curated v1 traces and the normal Run path remain compatible.

## Visual review and polish

Reviewed the Person mutation captures at **1440×900, 1728×1117, 1280×800, and 760×900**, plus Person Classic, Person selected, Person expanded at 760×900, recursion overview/expanded/focused, array Theater, observed control branch, and exception at 1440×900. Compared with reference images 06–11 and the design-system, visual-language, spatial-world, camera/navigation, scene-consistency, motion, and polish/QA documents. Person clearly reads as actual cuboids with top and side faces, perspective size changes, separated stack/heap depth, contact shadows, and curved `this`/`p` references. No decorative city or fake CSS perspective was introduced. The same materials, semantic colors, camera, layout, and timeline remain in every view.

Changes made during review:

1. Added an expandable runtime workspace so the 3D world can use the full IDE width, including on narrow viewports; restored layout preserves cursor and selection.
2. Improved narrow IDE pane sizing and Monaco reveal behavior so the executing source line and runtime are both visible.
3. Preserved the final historical frame after exceptional unwind and marked it as unwound, with the actual JVM failure and source line still visible.
4. Kept array-write narration faithful to observed values and unknown operand origins. Inspector references show Java slot names.
5. Limited timeline marker DOM nodes for long recorded traces while retaining exact range scrubbing.
6. Made runtime entity selection navigate to the most recent observed source location for that entity.
7. Labeled stdout/stderr as full-run output separate from the timeline, because the recorder has no proven interleaving between console writes and probe events.

The recursion Overview deliberately fits all reserved invocation anchors and therefore uses small labels. Focus supplies readable frame detail. Captures are in this directory; `capture.json` records the project IDs and confirms no browser page errors.

## Validation and measurements

- TypeScript typecheck, ESLint, production build, and `git diff --check` passed. **375 unit/integration tests across 36 files** and **44 browser tests** passed. The browser suite covers real-trace free orbit during playback, reverse scrubbing and stable identity, source navigation, expanded layout, and normal Run regressions.
- `scripts/capture-m6.mjs` recreates the visual checkpoints. `scripts/measure-m6.mjs` records actual compile, transform, startup, execution, raw trace size, and browser seek-to-next-paint in [performance.json](performance.json). The measurement runs Chrome at 1440×900 on the local JDK and is a small local sample, not a cross-device benchmark.
- The final sample recorded 12 raw Person events, 28 recursion events, 123 array events, and 5 crash events. Transform took 398–448 ms; entire Visualize requests took 718–774 ms. Person seeks had a 33 ms median; the first object draw was a cold 833 ms outlier. Warm seeks were about 30–60 ms.

## Known limits

- This is a finite record/replay visualizer, not live JVM stepping. Library/JDK internals, standard `String` object bodies, non-`int[]` arrays, multiple application threads, and arbitrary reflection/native activity are outside the current trace contract.
- Bytecode branches are factual; source-level loop/condition labels and lexical scope boundaries are only shown when evidenced. Array store operand origins and return destinations remain unknown when not observed. stdout/stderr are captured but are not interleaved into the event clock.
- User Java still runs with local OS permissions. It is not sandboxed. Visualize has hard capture limits, not a security boundary.
- The first new object may cause a cold WebGL draw pause. Deep-stack Overview text is smaller than focused detail. Large Three/Monaco bundles continue to trigger a production chunk-size advisory; neither affects trace correctness.
