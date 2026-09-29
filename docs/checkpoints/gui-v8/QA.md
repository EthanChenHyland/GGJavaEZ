# Milestone 8 — Spatial-first GUI / UX

Baseline: `d3cbd99` (complete Milestones 1–7). This change preserves the runtime/trace contracts, reducer, stable anchors, Classic/Spatial/Theater semantics, Monaco/project lifecycle, instrumented execution and cooperative JVM debugger.

## Delivered hierarchy

The prior shell permanently allocated project explorer, editor, runtime, debugger toolbar and bottom tools. Its normal 1440×900 runtime drawing viewport was approximately 752×257.

The new workspace has three emphases over the same mounted editor and renderer:

| Emphasis | Source/editor | Runtime | Context |
| --- | --- | --- | --- |
| Code | 72% starting width after explorer | Secondary preview | Build; Run opens Console; failures open Problems |
| Runtime / Visualize | 30% starting width | Remaining ~70%; Spatial initial representation | Canvas timeline and contextual inspector |
| Debug | 35% starting width | Remaining ~65% | Contextual stepping toolbar; revealable debugger; exceptions open Error Explorer |
| Runtime Focus | Revealable source drawer | Nearly full useful viewport | Inspector and bottom tools revealable; labeled Exit Focus |

At 1440×900, the normal Person world is 1004×763 and drawing viewport 1004×647: about **3.36×** the previous drawing area. Focus world is 1440×817 and drawing viewport 1440×701. These are layout measurements, not performance measurements. At 760×900, source supports the world below it; the explorer is an intentional overlay, and error sections switch between Failure, Stack & path and Cause.

Widths are remembered per emphasis. Explorer collapse is saved. Focus, tool visibility, inspector visibility and transient debugger emphasis are not persisted. A reconnect uses the actual bridge session. The camera is preserved through layout changes; Home explicitly fits the current viewport. The renderer and editor are not remounted when changing emphasis or entering Focus.

## Screenshot review and iterations

`capture.json` indexes **31 original-resolution screenshots**. The core matrix covers Code, Person Visualize, breakpoint Debug, Runtime Focus and Error Explorer at **1728×1117, 1440×900, 1280×800 and 760×900**. Additional captures cover desktop Focus source/tools, desktop/narrow Person inspector, desktop/narrow debugger inspection, desktop/narrow Trace Cause, real six-frame recursion, bubble-sort Theater and control flow.

The lead also reviewed `runtime-focus-from-code-760x900.png`, a **32nd** capture from the narrow workspace regression using the accepted cached M7 Person trace. It verifies that Alt+Shift+F from Code reveals the same mounted world, selected object and inspector, and that Source and Exit Focus remain reachable. Reproduce this extra capture with `npx playwright test e2e/workspace-m8.spec.ts`; its test output contains the PNG.

The lead reviewed captures against references 06–11, DESIGN_SYSTEM, VISUAL_LANGUAGE, CAMERA_AND_NAVIGATION, MOTION_SYSTEM and POLISH_AND_QA. Each screenshot is an actual app/WebGL capture, not a generated mockup. Overview QA intentionally invokes Home after viewport changes; retaining a freely explored camera on resize is tested independently from overview composition.

Actual polish fixes after capture review:

- Replaced permanent camera text rows with a restrained floating icon group and labeled tooltips. Restored the standalone Home entry for continuity/accessibility.
- Put timeline inside the runtime canvas; moved mutation/failure messages above it after finding overlap.
- Moved entity/quality controls away from camera controls during inspection; bounded the embedded inspector shelf to 112px so it consumes less of the world. Existing Focus choreography still supplies its safe viewing rectangle; no extra canvas shrink competes with that framing.
- Collapsed unused explorer and tools; once-only narrow breakpoint collapse avoids covering Code on resize. User can reopen it.
- Wrapped narrow JVM controls so Continue, Into/Over/Out, Stop and inspection remain visible.
- Added visible Source and Exit Focus labels; desktop source drawer reserves space so it does not cover stack geometry. Source remains the same Monaco model.
- Included the unchanged STACK heading footprint in debugger Home framing for both shallow and reserved multi-invocation traces after narrow and reduced-height Debug captures clipped it. Runtime geometry, stable anchors, camera pivot/yaw and user-input precedence are unchanged.
- Removed inspector backdrop blur. Shared dark surfaces, semantic colors, native cuboids, lighting and labels remain intact; no glow effects, decorative scenery or new visual system added.
- Replaced duplicated debugger/cause explanations with disclosures; error columns scroll independently, narrow Debug rows scroll independently without overlap, and narrow Error Explorer has reachable sections.
- Kept an opened debugger drawer open through ordinary stepping. Selecting an active tool tab reveals it instead of unexpectedly collapsing it.
- Added discoverable shortcut disclosure, clear pressed states and labeled icon controls. Reduced-motion disables pane transitions; keyboard resizing remains available.
- Used physical key codes for workspace chords so macOS Option symbols do not disable Alt+Shift shortcuts.
- Restricted narrow Code's runtime-hiding rule to non-Focus layouts after a final independent review found that Code → Alt+Shift+F could hide both panes. The extended narrow regression checks world/source/exit visibility and preserved cursor/selection on returning to Code.

Real Z depth is visible in tops, side faces, shadows, stack offsets, array cells and reference paths. Home overviews show the six recursion frames and the same indexed Theater array. Runtime mutation and source highlights stay synchronized. No entity relayout/reducer changes were required.

## Delegation and integration

- **Dewey:** focused debugger/Error Explorer density, scrolling and narrow sections; then five M8 browser regressions using cached browser-local traces. No runtime semantics or IDE integration ownership.
- **Linnaeus:** App view/camera controls and embedded timeline; then original-size screenshot audit and bounded cached-trace performance script.
- **Lead:** emphasis/persistence/resizing/keyboard contracts; IDE integration; layout convergence; heading framing; full diff review; screenshot capture/polish; validation and commit.

No new package dependency, competing schema, design system or geometry engine was introduced.

## Validation

| Gate | Result |
| --- | --- |
| Unit/integration `npm test` | **441 passed**, 41 files, 20.75s; preserves 437 prior tests and adds four heading/framing projections |
| Full browser `npm run test:e2e` | **60 passed**, one worker, 3.1 minutes; preserves all 55 prior tests and adds five workspace regressions |
| Final workspace convergence | **5 passed**, 13.6s, after the isolated narrow Code-to-Focus CSS fix; extended regression also checks Source, Exit Focus and hidden-world cursor/selection preservation |
| Typecheck / configured lint / production build | All passed |
| Capture/performance script ESLint and syntax checks | Passed |
| `git diff --check` | Passed |
| Visual evidence | 31 scripted captures with zero page errors, plus the reviewed narrow Code-to-Focus regression capture |

The full browser run verifies real javac/Run/Scanner, import/save/drafts, debugging/stepping/Stop, exception episodes/Trace Cause, Person, recursion, array Theater, control flow, selection, reverse scrubbing and free exploration during playback. Final workspace convergence covers the subsequent CSS-only Focus exception without rerunning unrelated JVM workloads. The shared trace/reducer and entity anchor contracts are unchanged.

The production build retains the existing large Three/Monaco chunk warning and Troika's ineffective dynamic-import warning; neither is a build failure or introduced package dependency. Dev Vite/bridge listeners remained the original processes throughout this pass, with no additional server restart.

The final browser gate uses one worker because the execution bridge owns one current JVM run/debug session. A concurrent run exposed cross-test process termination during IDE hydration; serial execution preserves the real Run, Scanner, debugger and Stop assertions. A pane-resize assertion now polls its settled width through the 160ms transition. The camera test resolves the controller's transformed Vite store URL: a bare import after HMR created a second store while the actual camera zoomed correctly. Pose/reset assertions remain intact. The isolated camera/IDE convergence run passed all 12 tests.

Representative performance: see `PERFORMANCE.md` and `performance.json`. The 18 sampled windows and 48 scrubs completed with no page errors, unexpected API requests or sampled long tasks. Visualize/Focus orbit submission means were 1.49/1.90 ms for Person and 1.27/1.14 ms for recursion; scrub medians remained about 65–66 ms. Settled idle made zero WebGL submissions. The compact comparison uses current frontend CSS, not historical source; headless cadence and automation roundtrips do not establish GPU presentation or 60 fps throughput.

## Known limits

- Source is an overlay on narrow Focus; closing it restores uninterrupted exploration. Desktop source reserves space.
- A freely explored desktop pose remains free on an aspect change; use Home for a fresh narrow overview.
- Manual project/bottom dimensions remain session-local; editor widths and explorer preference persist. A new trace starts Spatial, retaining existing representation behavior within a trace.
- No command palette was added; shortcuts and existing commands are discoverable in the status disclosure and tooltips.
- Existing Java capture/debugger limits still apply. The redesign does not claim new language or dependency support.

## Launch and reproduce

```sh
npm run dev
```

Open http://127.0.0.1:5173/ide. The dev script owns Vite 5173 and bridge 8787; no extra listener is needed. A complete local JDK is needed for editable execution.

With the server running, screenshots: `node scripts/capture-m8.mjs`. This intentionally imports bounded real Java QA projects and executes one at a time. Performance: `node scripts/measure-m8.mjs --authorized`, which intercepts accepted cached traces in its browser and creates no JVM workload. Run these separately from the test suites.
