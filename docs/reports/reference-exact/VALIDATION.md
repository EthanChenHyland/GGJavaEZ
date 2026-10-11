# Reference reconstruction validation

## Shell integration checkpoint

The root and `/ide` routes now use the same full-viewport shell. `/examples` uses its recording-viewer composition. Header, source, time dock, inspector and drawers take their rectangles from `computeShellLayout` and the frozen v4 tokens. One runtime canvas survives project opening, execution publication and failed rebuilds.

Operational state has separate selector-based workspace, editor, execution, debug, timeline, interaction and shell stores. Save All attempts every open and closed draft before reporting failures; failed saves prevent launch. Previous committed ingest/history survives a new pending attempt until accepted normalized events publish the replacement. Project switch and unmount dispose every retained ingest.

Checks completed on 2026-10-08:

- Production build/typecheck passed. The interim application chunk remains oversized (1,035.78 kB gzip); Monaco separation remains required.
- Default unit gate: 1,499 passed, 63 opt-in skipped, 1,562 total across 121 files (115 passed, 6 skipped). These skips are not real-JVM validation.
- Focused shell/state/command/source-binding checks: 185 passed across seven files.
- Browser reconstruction checks: two passed. Five viewport rectangles match the shared layout; actual Java Run followed by invalid-source rebuild preserves the same canvas, recording, cursor and runtime identities.
- A separate actual Java execution produced captured output `AGE 18`, Completed status and exit code 0 without browser page errors.

Screenshots are local QA artifacts under `.ggjavaez/qa/reference-exact/`. Their review confirms the shell composition but identifies the legacy world spacing as a substantial remaining visual gap. This checkpoint does **not** approve reference convergence, the renderer, subsystem extraction, accessibility, performance or the final JVM/browser gates. The legacy renderer and compatibility tokens are interim dependencies to remove as reconstruction proceeds.

## Runtime integration checkpoint — 2026-10-09

The production Shell now renders the complete prefix SceneModel through persistent XYZ layout reservations and a separate budgeted PresentationPlan. Stack, heap, arrays, class shelves and captured I/O use shared instanced solids, face text and connector batches. Flow attachment requires prefix-visible storage/provenance; a return cannot attach to an earlier value merely because the eventual destination already exists. Inspector evidence queries retain recorded adjacency independently of drawable geometry.

The camera and canonical interaction stores own Explore, Follow, Home, Focus, saved-pose restoration and Trace. Selection alone never moves the camera. The command registry dispatches navigation in both IDE and recording viewer without waiting behind filesystem work. Escape closes the Inspector before exiting Focus or Trace. Clearing Selection in Focus keeps the Inspector on its target. Command changes and exact test-inventory migrations are recorded in `docs/checkpoints/reference-exact/migration/commands.md`.

The semantic timeline is an external store with deterministic forward/backward reconstruction, Replay, Return to Live and bounded milestone labels. Motion consumes committed adjacent states and recorded edge identities; it never delays event application. LIVE backlog expiry and first published batches have explicit coverage. Reduced motion retains static semantic emphasis. Allocation currently scales a transient outline rather than the canonical body; this is an unfinished presentation detail.

Array windows preserve canonical index identity separately from temporary geometry and monotonically retain prior window revisions across presentation changes. Pointer-down captures the window revision and stale picks are rejected. In-bounds uncaptured cells remain unavailable. Inspector lists use bounded physical pages so every logical index remains reachable without a count-sized values array or browser-sized scroll extent.

Read-only recorded source and editable Monaco have separate lazy boundaries. Monaco contribution services load before Java provider registration, avoiding first-open Suggest/Code Action service errors. Static local Inter 400/500/600 font assets serve the shared glyph batch. The capture barrier waits for glyph layouts, environment, settled camera/motion and active quality readiness; scene/window/plan/pose/resource changes restart its stable-frame interval.

Interactive uses shared acrylic Fresnel materials. Cinematic is requested only after explicit selection and uses real physical transmission, actual GPU capability checks, shader preparation and the frame-time governor. This checkpoint does not yet contain the required selective bloom, SMAA or complete Cinematic post-processing.

Validation on the checkpoint tree:

- `npm run build`: passed, including TypeScript. Bootstrap is 72.48 kB gzip; AppRoot is 223.99 kB gzip. Monaco API (699.96 kB gzip), its contributions (144.60 kB gzip), recorded editor and Cinematic materials are separate chunks. Vite still reports large lazy chunks; cold-load/retention budgets are not yet proven.
- `npm run lint`: passed; no disabled rules were added.
- Default unit gate: 1,666 passed, 63 opt-in skipped, 1,729 total across 158 files (152 passed, six skipped), in 157.15 seconds. These skips do not satisfy the explicit real-JVM gates. An initial property run exposed reduced-motion initialization after a scrub; the binding now initializes that preference before the first action, with an additional regression test. All 19 focused motion checks and the subsequent full unit gate passed.
- Focused command/shortcut, retained command integration, array identity, virtual-list and Inspector evidence checks: 75 passed across six files, with the added completeness/reachability properties configured for 100 runs.
- Reconstruction browser checks: seven passed in 19.6 seconds. These include five viewport shell rectangles, a real Java Run and failed rebuild retaining the canvas/history/IDs, semantic timeline boundaries, source highlighting, selection/Trace camera invariance, Focus pose restoration, projectless palette/shortcuts, Inspector Escape precedence and actual hardware-gated Cinematic selection without replacing the canvas.
- A separate real Java capture produced cursor 70, Completed/exit 0 and no browser errors. Its captured renderer report was 18 draw calls, 8,088 triangles, 29 geometries and 13 textures. This is an earlier small-program observation, not a dense-scene or post-processing performance gate.

Original-resolution comparisons against `best.png` remain **unapproved**: connector paths cross face-label regions; the completed-run floor loses the reference grid/reflection hierarchy; face typography and composition need another polish pass. Remaining work also includes first-known collection/ownership placement, exception and specialized presentations, source scroll policy, operational adapter extraction, legacy browser locator migration, full post-processing/resource disposal and measured performance. The 66-property inventory, 16 comparable real-Java states, final acceptance/explicit real-JVM/torture/debug/soak suites, retained browser suite and production cleanup have not passed their final gate. This is a stable integration checkpoint, not completion of A–G.

## Renderer foundation checkpoint — 2026-10-09

The runtime bodies now use one rounded template and shared vertex expansion that preserves a 0.10-unit bevel under unequal instance dimensions (bounded for thin trays). Shared depth/distance variants and rounded merged outlines use the same expansion; the canonical cuboid pick envelope and runtime anchors remain unchanged.

The render owner uses half-float targets, explicit emissive and protection masks, UnrealBloomPass, lower-corner fog, SMAA and final ACES/sRGB conversion. Every ordinary surface—including glyphs, plates, grid and reflections—is excluded from bloom. Mask proxies preserve original vertex transforms and Troika batching/discard paths, restore originals in `finally`, and own their disposal. Blue/violet emitter extraction uses peak HDR channel radiance at the unchanged 1.0 threshold so their semantic colors contribute consistently within the specified radiance range. CINEMATIC lazily adds half-resolution GTAO (radius 0.6, intensity 0.8), with rounded-body normals and an actual sharp text mask. DOF remains disabled pending a separate tilted-face readability proof.

**Installed API reconciliation:** Three 0.186's `SMAAPass` explicitly requires linear-sRGB input before `OutputPass`. The implementation follows that actual shader contract, placing SMAA immediately before final ACES/sRGB conversion rather than applying it to encoded output. This ordering departure from the design table is intentional; no specification was rewritten.

The managed floor retains the actual drei reflector material and blur implementation while explicitly owning targets and cleanup. Removing the perspective-depth threshold that nearly erased reflections restores the completed-run grid/reflection hierarchy. Its position/extent follow reserved bounds, with the specified 1/4-unit grid, 256/1024 reflection targets, Interactive gradient contact blobs and Cinematic contact maps of shadow-casting runtime solids only. Cinematic contact maps regenerate on plan changes; structural surfaces cannot shadow themselves.

The canvas now renders on demand. Camera travel, motion, glyph completion, quality settling and capture barriers request required redraws; idle gaps do not become slow-frame watchdog samples. Draw-call observation counts the whole display frame, including reflection, mask and post-processing passes. A pre-mount WebGL probe leaves the source and timeline usable without a graphics context. Actual context recovery rebuilds effects, floor targets and the local environment without replacing the canvas or semantic state; the retained recovery extension supports Retry after the two-second failure notice.

Current verification:

- Build/typecheck and lint passed. Bootstrap is 72.49 kB gzip, AppRoot 273.33 kB gzip, shared Troika 230.28 kB gzip; Cinematic passes are a separate 8.55 kB gzip chunk and materials remain separate. The aggregate cold-load/retention budget is still unproven.
- Full default unit gate: 1,675 passed, 63 opt-in skipped, 1,738 total across 162 files (156 passed, six skipped), in 152.91 seconds. These skips still require their explicit real-JVM gates. Focused rendering/quality/motion checks also passed: 86 tests across 14 files, including 100 randomized rounded-envelope/radius cases. The semantic bright-pass check passed in the full gate.
- Eleven reconstruction browser checks passed in 27.5 seconds. Added checks prove zero settled idle redraws, seek redraw, actual graphics-context loss/restoration with equal recording/cursor/Selection/pose and the same canvas, and source/timeline availability without WebGL. Cinematic checks now require exactly one material request and one effects request, no such requests during Interactive, and ready effects without failure. The no-WebGL IDE check also executed actual Java to Completed and verified retained process output and a nonempty recording.
- Latest actual Java captures completed at cursor 70 without browser or shader errors in both tiers. Interactive reported 78 total draw calls, 43,611 triangles, 32 geometries and 29 textures; hardware-enabled Cinematic reported 115 calls, 56,843 triangles, 34 geometries and 43 textures, with compiled physical materials and ready lazy effects. These are small-program observations, not dense-scene performance results.

The current original-size comparison shows recovered floor depth and reflections, but remains **unapproved** for reference convergence. Connector routing, synchronous typography fitting/visibility, edge depth polish, composition, haze, focus readability captures, large-world profiling and long-lived resource measurements still need work. This foundation does not close milestone E or the whole A–G reconstruction.

## Typography and routing increment — 2026-10-09

Face typography now fits synchronously against generated advances from the exact static local font assets. Titles reserve identity space; field/local faces have name, type and value columns. World previews preserve whole Unicode code points/escapes and cull text below 11 CSS pixels at its actual projected depth. Three bounded weight atlases prewarm together, including locally supplied availability brackets. Original fonts and captured Inspector values remain unchanged. The exact readiness-test migration is recorded in `migration/typography.md`.

Clear connectors retain smooth cubic paths. Obstructed connectors use canonical ports and a bounded exterior visibility grid, then clearance-checked fillets. Actual array headers and presented cells replace the empty reserved envelope as routing obstacles. Shared endpoint routes reuse a plan-local cache; the search queue is a binary heap. An interrupted Cinematic normal draw now restores the lines Three temporarily hid as well as materials and renderer state.

Verification on this increment:

- Build/typecheck and lint passed. Bootstrap is 72.53 kB gzip, AppRoot 328.77 kB gzip, shared Troika 230.28 kB gzip. The generated font metrics contribute 48.45 kB gzip. AppRoot is below the specified 500 kB gzip main-entry limit; the aggregate startup graph and measured cold-load/retention budgets remain open performance work. Cinematic and Monaco remain separate lazy chunks.
- Full default unit gate: 1,682 passed, 63 opt-in skipped, 1,745 total across 165 files (159 passed, six skipped), in 150.74 seconds. No semantic golden was changed. Added focused tests include 100 Unicode fits, 100 projected visibility cases, 100 rounded-route clearance cases and injected normal-pass failure restoration.
- All eleven reconstruction browser checks passed in 28.2 seconds, preserving their existing assertions.
- Actual Java completed at prefix 70 with no page/shader errors. Interactive reported 78 total calls, 47,227 triangles, 32 geometries and 29 textures. Compiled hardware-enabled Cinematic reported 115 calls, 61,363 triangles, 34 geometries and 43 textures, with ready effects and no failure. These remain small-program measurements.

Original-size review against the hero and reference-sheet overview shows clearer rows and identities and fewer face crossings, but overlapping historical flows, edge aliasing, material hierarchy and camera composition remain visibly weaker. These captures are **not approved** as formal Comparable_State convergence. Per-entity/coarse-pose text scheduling, complete routing/bundle properties, generic real-Java fixtures and the full 16-state/five-viewport harness remain required, along with the previously listed subsystem/performance/final gates. This increment does not close E or A–G.

## Real-JVM capture harness and forensic integration — 2026-10-10

Seven ordinary Java projects now cover domain objects, recursion, array writes,
uncaught exceptions, input/output, a real breakpoint and a moderately dense
world. Their explicit opt-in test uses the existing instrumented JVM pipeline;
all seven passed with actual build, output, exit and normalized inventory
evidence. This fixture observation is not the final JVM corpus or performance
gate. No normalizer, reducer, trace/graph contract or semantic golden changed.

The capture harness drives all sixteen reference states at the five frozen QA
viewports and takes sixteen additional full-viewport native-size captures.
Each ready capture retains its JVM/recording identity, prefix, camera, actual
projected geometry, renderer/effects readiness, screenshot hash, reference crop
and comparison scale. The reporter rejects filtered runs, skips and missing
instrumented JVM sessions. Convergence additionally requires 96 current lead
reviews; open reviews cannot be approved by pixel similarity or browser success.

Run Hero and Home now have independent camera solvers. Hero fits the live tower,
mandatory evidence and headings into Safe Frame before solving its screen
bands. Home admits one readable representative per actual layout group. Neither
changes canonical anchors. The QA clock advances the production presentation
clock without changing execution, cursor or selection. Focus dimming now uses
actual face opacity; MEDIUM labels show name/value previews while CLOSE retains
type columns, and exact captured values remain available in the Inspector.

The final uncaught prefix presents a shared red acrylic forensic panel beside
the actual throwing frame. Class/message wrapping preserves captured text and
explicitly reports unavailable stack/cause evidence. Recorded path entities and
curves retain exception emphasis while unrelated entities dim. The automatic
Errors selection leaves an unpinned drawer closed so it cannot cover the world;
the explicit Error Explorer action remains functional and a user-pinned drawer
is preserved. A browser flow executes the exception, reads its class/message in
Error Explorer, edits Java through Monaco and reaches a successful new JVM run
with the old panel and exception emphasis cleared.

Verification on this tree:

- `npm run build`, `npm run lint` and `npm run typecheck:reference`: passed.
  Bootstrap is 72.53 kB gzip, AppRoot 331.15 kB gzip and shared Troika 230.28 kB
  gzip; Cinematic passes are 8.58 kB gzip. The main-entry size is below 500 kB;
  cold-load and long-lived memory/resource limits are not yet measured.
- `npm test`: 1,704 passed, 70 opt-in skipped, 1,774 total; 166 passed files and
  seven skipped files, in 154.75 seconds. The skips comprise the pre-existing
  63 opt-in cases plus the seven fixture JVM cases and do not satisfy final
  explicit-flag gates.
- `VJ_REFERENCE_JVM=1 VJ_PHASE4_JVM=1 npm test -- tests/reference/programs.jvm.test.mjs`:
  seven real-JVM tests passed in 7.10 seconds, using JDK 26.0.2.1.
- `npx playwright test e2e/reference`: all thirteen reconstruction checks passed
  in 39.1 seconds. The initial rerun-flow failure came from a textarea locator
  incompatible with Monaco's accessible EditContext textbox. Correcting that
  locator preserved the complete actual-JVM and forensic-clearing assertions.
- The first exhaustive capture run executed 80 cases without skips: 57 passed,
  23 failed in 7.9 minutes; 64 cases launched instrumented JVMs. Its failed report
  is preserved separately. Narrow-source readiness, proven return-destination
  selection and separate Hero framing were corrected without widening frozen
  tolerances. Five focused exception captures also passed stricter Safe Frame,
  shell-occlusion and throwing-frame overlap checks.

Original-size Hero, Completed, Focus, Debug, I/O and Exception comparisons remain
**unapproved**. Opaque face hierarchy, overlapping cyan routes, camera composition
and reference lighting still require polish. First-known collection reservation,
source scroll policy, exception throw-time values, operational adapter extraction,
the complete 66-property inventory, final JVM/acceptance/torture/debug/soak/browser
gates, performance measurements and legacy cleanup remain outstanding. This
integration does not close a milestone or the A–G reconstruction.

## Focus and forensic regression validation — 2026-10-10

The second exhaustive matrix executed 80 distinct instrumented JVM sessions
without skips and produced all 96 captures: 78 passed, two failed in 7.9 minutes.
Both failures were narrow Focus states at 0.344 viewport height. The corrected
solver observes perspective face extrema, gives the unchanged 0.38–0.52 height
band priority over width, and uses the free area above a visible narrow Inspector
only for an explicit Focus command. Opening a sheet alone does not move the
camera. Two narrow Focus diagnostics and the corrected post-initialization array
operation capture passed their measured gates.

Forensic bodies retain their actual instance transform across hardware-enabled
quality changes, with owner disposal for retired instance buffers. QA reads the
rendered panel instance rather than planned dimensions. Final-path opacity uses
captured event IDs, preventing an earlier caught exception on identical endpoints
from being promoted. Null messages are labelled `unavailable or null` because the
preserved recorder cannot distinguish null from an unsafe message read.

Fresh validation after these corrections:

- Build, lint and reference-harness typecheck passed. AppRoot is 331.91 kB gzip;
  bootstrap and shared Troika remain 72.53 and 230.28 kB gzip respectively.
- Full default unit gate: 1,718 passed, 70 opt-in skipped, 1,788 total across 174
  files (167 passed, seven skipped), in 155.08 seconds. Required explicit JVM
  gates remain separate; semantic goldens were not changed.
- All fourteen reconstruction browser checks passed in 43.8 seconds, including
  actual panel geometry through Cinematic and back, with exact recording/camera
  state. The first new run exposed a recovery test's edited cached Java project;
  exception tests now import fresh source. A subsequent equality failure was
  floating-point projection rounding at 1e-13 pixels; geometry equality remains
  required to ten decimal places and semantic/camera equality remains exact.

The third unfiltered matrix passed all 80 cases in 7.9 minutes, with 80 distinct
instrumented JVM sessions, zero skips and all 96 captures from the same run
(`ddf00fd3-2b28-4b0e-a3a1-31e97966c377`) reporting zero geometry misses. The
complete report is preserved separately. The convergence command still returns
nonzero for missing/open/stale visual reviews; geometry success does not approve
reference fidelity. Task 11.2's harness is complete. Visual convergence,
recursive Follow/Home reconciliation, source scrolling, first-known collection
reservation and the remaining final gates are still open.

## Recursive Follow and Home reconciliation — 2026-10-10

Home now always uses Hero orientation. Recursive Follow fits the innermost
invocation and three actual callers independently, restores Hero angles at
depth three, and yields synchronously to manual camera input. Explicit Follow
also works on a History prefix. Important captured allocation, throw and
field/array-write subjects use minimal inclusion; an uncaught terminal prefix
includes the throwing frame, Throwable and structural panel after unwinding.
All changes are presentation-only. The comparison command and strengthened
geometry checks are recorded in `migration/camera.md`.

- Build, lint and strict reference TypeScript passed on the camera implementation.
- Full default unit gate: 1,722 passed, 70 opt-in skipped, 1,792 total across 175
  files (168 passed, seven skipped), in 161.68 seconds. The four added camera
  tests include 100 viewport cases and terminal forensic inclusion. No semantic
  golden changed; required explicit JVM gates remain separate.
- All five diagnostic recursion cases passed in 35.7 seconds, including the
  additional native capture. Actual nearest-four bounds, monotone face centres
  and recursion angles pass at every frozen QA viewport.
- The first broader browser rerun passed fourteen and failed one in 51.0
  seconds: the graphics idle test called the QA world API before lazy canvas
  mount. It now waits for that API; idle rendering and seek assertions are
  unchanged. The fresh full rerun passed all fifteen checks in 53.2 seconds.
  The fourth unfiltered exhaustive matrix passed all 80 cases in 8.1 minutes,
  with 80 distinct actual-JVM sessions, zero skips and 96 current captures from
  run `ba01fae5-51d3-433c-8dde-324bc626ec94`. All measured geometry gates pass.

The diagnostic native capture is more readable, but overlapping frame headers,
strong cyan edges and missing visible structural headings remain open polish.
The fresh exhaustive run replaces the diagnostic captures with one run ID. All
sixteen native captures and the critical short Hero/narrow inspection captures
have original-size lead reviews, recorded as open with current screenshot hashes.
The convergence command still exits 1 for open/missing reviews. Additional
findings include unreadable FAR cluster labels, wrapped Debug controls and
crowded return/array headings. This is not completion of a milestone or A–G.

## Source scrolling and debugger controls — 2026-10-10

Editable and recorded source share an owned Monaco scroll policy. Captured
pauses center once; manual scrolling, tab view state and caret/selection survive
resize and source expansion. Exact class/manifest/hash proof supplies pause
locations, and a pending attempt cannot supply a pause to the previous world.
Unknown source retains the displayed file without an execution marker. The six
debugger commands fit one fixed row and retain command-registry availability.

- Build, lint and strict reference TypeScript passed. AppRoot is 333.54 kB gzip;
  bootstrap and shared Troika remain 72.53 and 230.28 kB gzip. These figures do
  not establish aggregate startup or retention performance.
- The final default unit run passed 1,736 tests with 70 opt-in skips (1,806 total),
  across 178 files (171 passed, seven skipped), in 158.19 seconds. Semantic
  goldens were unchanged; explicit JVM gates remain separate.
- All 20 reconstruction browser checks passed in 1.5 minutes. Five source cases
  import ordinary Java files and suspend actual JVMs at lines 91 and 100. They
  verify the middle third, native wheel scrolling, source expansion, a real
  two-file tab round trip, unchanged caret/selection/scroll/cursor/camera, and
  header/debugger hit geometry at every required viewport.

Earlier diagnostics exposed a stale pause marker, narrow drawer control
occlusion and Monaco replacing its view DOM while retaining the editor instance.
The owner now rebinds DOM listeners and waits for actual visible ranges with a
finite deadline. The first broad tab run passed 19 and failed one because its
narrow hydration wait named the second file; the corrected wait names Aux.java
and preserves all pause, state and geometry assertions.

Original-size source captures were inspected, including the final 1280-wide and
narrow reruns. Array identity/length overlap and flat bright faces remain open.
These diagnostic captures do not replace the fourth formal matrix's 96 captures
or approve its visual reviews. Source lazy mounting, exception source markers,
workspace cleanup and the remaining A–G gates remain open.

## Array metadata and activity labels — 2026-10-10

Array title plates now reserve the wider measured metadata column before title
truncation. Length and identity occupy separate lines. Captured reads use cyan,
captured writes amber, with directional index cues and the captured value; a
read no longer receives the write edge colour. Index text is 0.28 world units
so the five-cell narrow capture keeps its labels above the existing visibility
cutoff. RETURNS uses the shared semantic return colour.

The existing text/array/projector checks passed 32 tests across five files in
1.85 seconds. All fifteen real-JVM array/return diagnostic cases passed in
1.4 minutes. Original-size review found narrow index culling; after the size
adjustment, all five array-operation reruns passed in 31.4 seconds. Native,
narrow and short captures were inspected against the unchanged array reference.
Length/identity and the written index/value are distinguishable. Build and lint
pass; reference TypeScript passed on the same code before the scalar font-size
adjustment. Main AppRoot remains below 500 kB gzip. Bright broad body surfaces,
tray stacking occlusion and small return-tower rows remain open. These partial
diagnostics replace some capture files but do not constitute a new unfiltered
80-case matrix, 96 current visual reviews or convergence approval.

## First Source display — 2026-10-10

Collapsed narrow Source defers mounting Monaco until its first actual editor
display, then retains the mounted editor through close/reopen. Both editable
Source and recorded `/examples` source pass real request checks: no editor
module requests before opening, positive requests after opening, retained
model/view state on reopen, and unchanged world cursor/selection/camera.
Recorded Source also reports its actual read-only option.

Build, lint and strict reference TypeScript passed; 68 existing source, layout
and loader tests passed across five files in 321 ms. The focused narrow debugger
case passed in 9.4 seconds, then all 21 reconstruction browser checks passed in
1.5 minutes. AppRoot is 333.73 kB gzip. Narrow fixture readiness now observes its
hydrated file peek instead of requiring a hidden Monaco mount. Semantic and
geometry assertions remain unchanged. Exception markers, model-registry
retirement, final performance and visual convergence remain open.
