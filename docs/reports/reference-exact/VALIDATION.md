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

## Acrylic edge hierarchy — 2026-10-10

The Interactive Fresnel contribution now uses the actual instance's distance to
its second-nearest surface plane, keeping rim ink within a fixed edge band.
Frozen body opacity/roughness/emission, lighting, opaque face/chip colours,
canonical geometry/picks and Cinematic transmission remain unchanged. It adds
no draw batches. The shader program cache identity was updated.

- Build and lint passed; AppRoot is 333.93 kB gzip.
- Eight material/geometry/mask/cinematic tests passed across four files in
  954 ms. The full default suite passed 1,736 tests with 70 opt-in skips (1,806
  total), across 178 files (171 passed, seven skipped), in 157.36 seconds.
  Semantic goldens were unchanged.
- All six graphics/quality browser checks passed in 17.0 seconds, including
  actual context recovery and hardware-gated tier compilation.
- Five real-JVM Hero/inspection/array/Debug/Exception diagnostic cases passed in
  41.0 seconds, producing ten QA/native captures with zero geometry misses.
  All five native captures received original-size lead inspection. A first
  anchored grep command matched no tests; it is not counted as validation.

Broad surfaces are more restrained, but cyan route crossings, neighboring label
overlap and reference fidelity remain open. These diagnostics are not a fresh
unfiltered matrix or 96 current approvals. Details are in `migration/materials.md`.

## Captured exception source — 2026-10-10

Source now marks the recorded throw line separately from the current execution
target. Proof requires explicit runtime recording identity, the actual applied
throw event, an unambiguous captured source file and valid line. Editable Source
also requires the existing verified binding and the exact displayed content.
Unwind retains the marker; caught exceptions, dirty drafts, different files and
different recordings cannot inherit it. No backend, reducer or semantic golden
changed. Details are in `migration/source-debug.md`.

Build, lint and strict reference TypeScript passed. The targeted source/debugger
browser run passed ten cases in 59.4 seconds; all 21 reconstruction browser
checks then passed in 1.5 minutes. The full default suite passed 1,739 tests with
70 opt-in skips (1,809 total), across 178 files (171 passed, seven skipped), in
155.56 seconds. A focused source run passed 41 tests across three files in 208 ms;
its command also named a nonexistent source-observation path, so that file was
not part of the focused count. The full suite includes the actual observation
test. The terminal failure screenshot received original-size lead inspection;
the red throw marker and unavailable current-source footer coexist correctly.
This diagnostic does not replace a fresh unfiltered matrix or formal visual
approval. Model-registry retirement, route overlap and A–G convergence remain
open.

## Ordered Follow Path and settled Source — 2026-10-11

Follow Path uses proven presented endpoint anchors, visits equal-distance samples
of the actual rendered curve, and fits the whole destination in the available
Safe Frame. The single 1,000 ms move preserves Trace scope, selection, runtime
prefix and canonical anchors. Collision detours retain semantic waypoint order;
manual input and obsolete recording/prefix/selection cancel travel. Reduced
motion reaches the final pose and refreshes semantic detail in one frame.

Build, lint and strict reference TypeScript passed; AppRoot is 335.09 kB gzip.
All 27 reconstruction browser checks passed in 2.1 minutes, including six new
real-JVM Follow Path cases across all five QA viewports and reduced motion. The
full default suite passed 1,745 tests with 70 opt-in skips (1,815 total), across
180 files (173 passed, seven skipped), in 158.07 seconds. Semantic goldens are
unchanged. All six path diagnostics received original-size lead inspection.

Earlier integration runs exposed React's passive wheel prevention error and a
narrow Source pause-centering race; the final run includes their fixes. An
additional three consecutive narrow Source checks passed in 26.5 seconds with
the original middle-third and manual-scroll assertions. One frozen-clock test
initially waited for semantic settling before advancing time; it now performs
the real slider seek and advances the clock before waiting for readiness.
These diagnostics do not replace the fresh unfiltered 80-case/96-capture matrix
or formal visual approval. Cluster presentation, route/label overlap and A–G
convergence remain open. Implementation details are in `migration/camera.md`
and `migration/source-debug.md`.

## Shared cluster bounds and exact member inspection — 2026-10-11

Collapsed bodies now use the shared rounded instanced materials and one
port-free structural anchor, consumed by routing, picking, floor contacts and QA.
The planner publishes the exact residual member IDs behind each count.
Inspector virtualizes those members and selects their real identities while
preserving the camera. Selected cluster edges use the shared selection color;
world and Inspector previews protect the count from key truncation. Visible
structural text has the 12 CSS pixel cutoff. The existing pick budget now applies
to quiet volumes alone, as specified; represented detailed entities and clusters
remain pickable within their own category budgets. Runtime semantics and goldens
are unchanged.

Build, lint and strict reference TypeScript passed; AppRoot is 335.77 kB gzip.
The final default suite passed 1,747 tests with 70 opt-in skips (1,817 total),
across 181 files (174 passed, seven skipped), in 156.47 seconds. Nine focused
tests across five files passed in 1.55 seconds. All 32 reconstruction browser
checks passed in 2.7 minutes, including five real-JVM dense-world cluster cases
that prove partial mounting and exact reachability of every member through real
scrolling at all target sizes. A 20-member test assumption was corrected after
the actual fixture cut showed groups of at most 12; the final assertions require
at least 11, fewer mounted rows than members, and equality with the exact IDs.

All five final captures received original-size lead inspection. Inspector counts
are legible at all sizes, but FAR world labels remain excessively culled and
dense routes cross faces and neighboring labels. Ownership hierarchy, cluster
travel and A–G convergence remain open. This increment is not the required fresh
80-case/96-capture matrix or formal visual approval. Details are in
`migration/materials.md`.

## Readable structural captions — 2026-10-11

Cluster captions and region headings retain real 3D text planes. Deterministic
placement scales glyphs to at least 12 projected CSS pixels and admits whole
labels inside the actual Safe Frame, outside Inspector, represented bodies,
I/O and forensic panels, with four-pixel clearance between captions. Cluster
captions can lift by at most four font heights; selected captions take priority.
Unambiguous short type previews preserve exact counts and canonical identity.
Batched text now honors ancestor scale and visibility. Camera, runtime anchors,
membership, semantic detail and semantic goldens are unchanged.

Build, lint and strict reference TypeScript passed; AppRoot is 337.08 kB gzip.
Fourteen focused tests across four files passed in 542 ms. The complete default
suite passed 1,752 tests with 70 opt-in skips (1,822 total), across 182 files
(175 passed, seven skipped), in 154.55 seconds. All 32 reconstruction browser
checks passed in 2.7 minutes; five focused real-JVM caption/member checks also
passed in 35.7 seconds. Their assertions cover exact membership, real scrolling,
unchanged camera/anchors, minimum font size, clipping and non-overlap.

All five final dense-world screenshots received original-size lead inspection.
The hero diagnostic passed in 8.7 seconds, and both its 1728×1117 and native
1672×941 captures received original-size inspection: STACK and HEAP remain
visible. An earlier caption candidate used world-unit lifts and occluded I/O;
the final bounded font-height placement addresses those observed problems.
Dense route crossings, broader heading/ownership hierarchy, cluster travel and
A–G convergence remain open. These diagnostics are not a fresh unfiltered
80-case/96-capture matrix or formal visual approval. Details are in
`migration/typography.md`.

## Editable model retirement — 2026-10-11

Committed workspace tab/project state now owns editable Monaco models and their
URI-scoped caret, selection and scroll snapshots. Switching tabs or hiding
Source retains views; confirmed closure, project replacement, rename/delete
and unmount retire owned models and snapshots. Cancelled dirty decisions retain
the model. Retirement cannot load Monaco and excludes recorded-source models.

Build, lint and strict reference TypeScript passed; AppRoot is 337.44 kB gzip.
Eighteen focused tests across four files passed in 277 ms. With all four JVM
flags enabled, the unfiltered default suite passed 1,824 tests with two opt-in
legacy presentation skips (1,826 total), across 183 files (182 passed, one
skipped), in 271.70 seconds. The repository's installed Maven and Gradle were
supplied through explicit tool-path environment variables for temporary build
workspaces; the initial run without these paths failed three tool-discovery
cases. The successful rerun produced fresh Maven, Gradle and cross-file source
receipts. Default Vitest still excludes the separate acceptance/performance
suites; this result does not claim those gates.

All 34 reconstruction browser checks passed in 3.3 minutes. Two new real-editor
cases prove exact view restoration, dirty-cancel retention, closure retirement,
repeated project replacement and zero editor requests before narrow Source's
first display. A cluster scroll check now waits for the actual final virtual
row before sampling IDs; all exact membership assertions remain. Three repeated
1728×1117 cluster checks also passed in 25.6 seconds.

All five final debugger Source captures and both model-ownership captures
received original-size lead inspection. Source pause centering and controls
remain readable. HEAP is absent in several debugger layouts; idle headings
overlap Ready and need the specified reduced environment opacity. Heading
clearance, wider workspace/performance cleanup, the fresh 80-case/96-capture
matrix and A–G visual convergence remain open. Details are in
`migration/source-debug.md`.

## Heading clearance and idle composition — 2026-10-11

Region text can lift by at most two font heights on its original 3D plane to
clear represented bodies. Empty worlds dim the canvas to the specified 45%;
Ready uses the actual space beside Source/Explorer and no longer overlaps
region headings. Recorded examples retain their active-world opacity. Runtime
anchors, camera ownership, semantic detail and semantic goldens are unchanged.

Build, lint and strict reference TypeScript passed; AppRoot is 337.59 kB gzip.
Fifty-eight focused tests across three files passed in 272 ms. The final default
suite passed 1,758 tests with 70 opt-in skips (1,828 total), across 183 files
(176 passed, seven skipped), in 161.32 seconds. All 34 reconstruction browser
checks passed in 3.0 minutes; the eight focused Source/idle checks passed in
54.2 seconds. Real debugger Home checks now require both rendered headings
entirely inside Safe Frame at ≥12 CSS pixels in all five target viewports while
preserving manually scrolled Source views. Desktop and narrow checks measure
idle opacity, prompt clearance and heading non-overlap.

Original-size inspection covered five Home, five paused Source, two idle and
five dense-world captures. The lifted HEAP label is visible in the debugger
captures; the narrow open Source drawer continues to cover its underlying
stack, and explicit Home with the drawer collapsed presents both regions.
Expanded Source/debug-toolbar overlap, broader heading/ownership hierarchy,
dense route crossings, cluster travel and A–G convergence remain open. These
diagnostics do not replace the fresh 80-case/96-capture matrix or formal lead
approval. Details are in `migration/typography.md`.

The isolated 1728×1117 hero diagnostic passed in 9.0 seconds. Both its QA and
native 1672×941 captures received original-size review: STACK and HEAP remain
visible; bright cyan crossings and overlapping heap labels remain open. The
diagnostic uses the list reporter and preserves the last complete matrix report.

## Source/debug control clearance — 2026-10-11

The Source heading now reserves the actual intersecting debugger toolbar's
height. All four Source hit targets remain inside Source and clear of the
toolbar before and after expansion in all five target viewports. This changes
only internal heading spacing; Source bounds, Safe Frame and camera ownership
remain unchanged. Narrow spacing uses the same measured rule as desktop.

Build, lint and strict reference TypeScript passed; AppRoot is 337.66 kB gzip.
The 57 focused layout tests passed in 99 ms. The full default suite passed
1,764 tests with 70 opt-in skips (1,834 total), across 183 files (176 passed,
seven skipped), in 153.67 seconds. All 34 reconstruction browser checks passed
in 3.0 minutes; the six focused Source checks passed in 49.6 seconds. Native
pointer-hit checks, exact tab views, manual scroll, camera preservation, Home
and middle-third pause checks all remain in place.

All five final expanded Source captures received original-size lead review.
The controls are visibly below Debug in each capture. Expanded Source still
covers underlying world geometry without moving the user's camera; explicit
Home remains separately verified. Console virtualization, ownership hierarchy,
cluster travel, dense route crossings and final A–G convergence remain open.
This increment does not replace the fresh 80-case/96-capture matrix or formal
visual approval. Details are in `migration/source-debug.md`.

## Console line virtualization — 2026-10-11

The Shell now renders bounded, paged Console rows through captured-text offsets.
Adjacent writes to the same output channel join across chunks without inserted
characters; input entries and channel boundaries remain distinct. A separate
detail view retains exact text, including CRLF, blanks, Unicode and a final
unterminated line. Manual navigation stops following, Last resumes it, and a
shrunk prefix clamps its page before later growth. Build, recorder, run-event,
pipe and archive ownership remain explicit; no equal-text deduplication or
invented cross-channel ordering is introduced.

Build, lint and strict reference TypeScript passed; AppRoot is 339.72 kB gzip.
Ten focused unit tests across two files passed in 196 ms. The final default
suite passed 1,774 tests with 70 opt-in skips (1,844 total), across 185 files
(178 passed, seven skipped), in 160.18 seconds. All 37 reconstruction browser
checks passed in 3.2 minutes, including the three new Console cases.

The isolated production-component fixture indexed one million terminated lines.
Its four measured First/Last presentations took 22–32.6 ms and mounted at most
six offscreen rows. The receipt identifies this as a rendering fixture, not a
real-JVM million-line execution. It also verifies arbitrary index reachability,
append, manual-scroll retention, shrink/continued growth, exact long text and
stderr color/glyph. Real desktop and narrow JVM cases verify stdout/stderr,
submitted text, visibly accessible recorder/pipe groups, rewind to zero and
exact restored prefix text. All six final Console captures received original-size
lead review; a polish pass removed empty space from short lists.

The WebGL-disabled cases passed their fallback assertions while Troika emitted
SDF context rejections; these graphics diagnostics remain open. Retained-world
Console association through a new pending/failed attempt, input-wait feedback,
submission receipts, closed-stdin feedback, legacy browser migration, the
independent acceptance/performance suites and final A–G convergence remain open.
This increment does not replace the fresh 80-case/96-capture matrix or formal
visual approval. Details are in `migration/console.md`.

## Retained Console ownership — 2026-10-11

The committed World now retains its own process/archive metadata. A new
pending or failed attempt has a separate labelled Console section; it cannot
replace the previous recording's output owner. Curated recordings borrow no
workspace pipes, archives or build messages. Runtime rows require the actual
matching recording identity. Verified build failures show compiler diagnostics
and explicitly declare that they have no program output.

Build, lint and strict reference TypeScript passed; AppRoot is 340.25 kB gzip.
Twenty focused unit tests across three files passed in 277 ms. The full default
suite passed 1,784 tests with 70 opt-in skips (1,854 total), across 186 files
(179 passed, seven skipped), in 158.86 seconds. Five focused browser checks
passed in 15.4 seconds.

The first complete browser run passed 36 checks and failed an immediate timeline
count read after process completion. Metadata can arrive before retained raw
pages publish; the test now waits for the actual nonempty timeline before
preserving all existing cursor, identity and failed-rebuild assertions.
The final complete rerun passed all 37 reconstruction browser checks in 3.2
minutes. Troika's WebGL-disabled SDF context diagnostics remain open.

Both fresh failed-rebuild captures received original-size lead review. The
previous output and current compiler diagnostics are visibly labelled; all four
compiler rows are reachable and retain their whitespace and orange stderr glyph.
The no-program-output message is asserted as present, without claiming it lies
inside that screenshot's visible scroll range. World and camera geometry are
unchanged. Input-wait/submission behavior, graphics fallback diagnostics,
broader Prior_World/source binding and final acceptance/performance/visual
gates remain open. This does not replace the fresh 80-case/96-capture matrix
or formal A–G visual approval.

## Console input wait and submissions — 2026-10-11

Console now focuses a newly active real wait in layout and shows wait evidence
independently of recording status and cursor. Metadata refreshes during the same
wait preserve manually moved focus. Live input without wait evidence is labelled
unknown. The submission controller reads the current session and project epoch,
serializes pending Enter, sends unchanged text plus one LF, and records only true
acknowledgements in a separately labelled submission-order list. It preserves
newly edited drafts, rejects retired acknowledgements and retains only current
and committed-World receipt owners. Source/tree operations do not retire a write
for the same process. Curated recordings show no workspace input state.

Final build, lint and strict reference TypeScript passed; AppRoot is 341.32 kB
gzip. The 39 focused unit checks across five files passed in 407 ms. Eight
focused browser checks passed in 22.3 seconds. The final default suite passed
1,803 tests with 70 opt-in skips (1,873 total), across 188 files (181 passed,
seven skipped), in 158.33 seconds after the project-epoch correction. The earlier
full run also passed, in 157.24 seconds.
All 40 final reconstruction browser checks passed in 3.3 minutes. The existing
WebGL-disabled SDF context diagnostics remain open for a separate correction.

Real desktop/narrow JVM checks use actual stdin writes and delayed real API
responses to verify empty input, exact spaces/Unicode, pending duplicate Enter,
new draft preservation, Java stdout, ended-process no-send/no-append and exact
blank submission detail. Wait checks observe the actual frontend wait commit
through two animation frames and require focused input within 200 ms. A separate,
explicitly isolated production-component fixture verifies partial/no-event
presentation, same-wait manual focus retention and wait clearing within 200 ms;
it is not a real-JVM saturation test.
The final real wait receipts measured 181.7 ms (desktop) and 164.2 ms (narrow);
the isolated fixture measured 24.8 ms for focus and 26.6 ms for clearing.
All four fresh wait/submission captures received original-size lead review.
The wait message, submission-order qualification, two submission rows and kept
draft are readable in both viewports. Exact blank detail is asserted as captured
text, without claiming its entire expansion is visible in those screenshots.

Known ended processes and unconfirmed writes keep their draft with inline
feedback. The preserved API lacks independent stdin-closure knowledge, so
preflight prevention for a live process with closed stdin remains open. No
backend, trace, reducer, history, graph, World endpoint or animation contracts
change. Fresh real-JVM partial-limit/no-first-event checks, graphics diagnostics,
formal acceptance/performance suites and final A–G visual convergence remain
open. This does not replace the fresh 80-case/96-capture matrix.

## Unsupported-graphics font prewarming — 2026-10-11

Shared token imports previously started Troika atlas work before the Canvas
WebGL check, producing null-context SDF failures on operational fallback pages.
The font entry point now checks the same graphics probe before starting atlas
work or populating either cache key. Supported calls still warm all three
weights once and wait for every job; context recovery and disposal are unchanged.

Build, lint and strict reference TypeScript passed; AppRoot is 341.17 kB gzip.
Two focused font tests passed in 186 ms. The default suite passed 1,804 tests
with 70 opt-in skips (1,874 total), across 188 files (181 passed, seven skipped),
in 158.02 seconds. All four focused graphics browser checks passed in 9.9 seconds.
Both WebGL-disabled pages now assert zero page/Console errors, zero warnings
and zero runtime-atlas font requests, while preserving their existing Source,
timeline, real Java output and absent-World-canvas assertions. These checks
include actual context loss/restoration and settled demand rendering.
All 40 final reconstruction browser checks passed in 3.3 minutes. Their log
contains no WebGL SDF failures or unhandled rejections. Supported-renderer
Three.Clock/PCFSoftShadowMap deprecation warnings remain; this does not claim
that every browser scenario emits zero warnings.

Both fallback captures received original-size lead review: recorded Source and
its completed timeline remain readable, and the real-run Console visibly shows
FALLBACK_OK alongside the unsupported-World message. Final reference visuals,
ownership/cluster travel, input closure knowledge and independent acceptance/
performance gates remain open. This is an unsupported-graphics initialization
correction, not full A–G approval or a substitute for the fresh 80/96 matrix.

## Physical cluster travel — 2026-10-11

Native cluster proxy double-clicks now request a separate prefix-owned camera
intent rather than entering Focus. The physical solver measures the unchanged
full canonical catalog after ordinary destination constraints, frames the old
proxy anchor and every corner of a real member in Safe Frame, and accepts only
poses that reach the required semantic detail from all hysteresis states. It
targets MEDIUM for generic keys and CLOSE for an explicit ownership key, without
forcing Detail_Level or moving runtime anchors. The shared collision route must
reach that validated destination before the planner pins the actual member.
The pin consumes the existing mandatory budget and is excluded from residual
counts. Manual navigation, another camera command and prefix replacement retire
it. Focus, Trace, selection, Lens and runtime semantics are not rewritten.

Build, lint and strict reference TypeScript pass; AppRoot is 342.29 kB gzip.
Ten focused solver, accounting, camera-store and planner checks pass in 1.27 s.
The default suite passes 1,809 tests with 70 opt-in skips (1,879 total), across
189 files (182 passed, seven skipped), in 157.31 s. The initial accounting test
incorrectly compared a successor plan's revision to a fresh plan's revision;
its expected revision now advances normally while the full cut remains equal.

Six focused actual-JVM cluster travel checks pass in 1.1 minutes. They use all
five QA viewport sizes plus reduced motion, native face double-clicks and the
production presentation clock stepped through the 900 ms destination. They
verify real detailed-member bounds, the original proxy anchor, unchanged
recording/cursor/anchors/Focus, manual cancellation and cursor-change retirement.
Two further heap checks pass in 26.8 s, covering desktop/narrow object geometry
and travel while a different, actual frame remains focused. The earlier 46-case
reconstruction browser run passes in 4.4 minutes. The expanded 48-case final run
passes in 4.8 minutes, including all eight travel cases in that single run.
These counts do not describe legacy browser tests or the formal 80-case
reference matrix.

All eight diagnostics received original-size lead inspection. Real Z-depth and
the Inspector's truthful absent-presentation status are visible. Dense cyan
route crowding, foreground caption clipping and narrow-sheet timeline occlusion
remain visible. Manual Focus pivot behavior after auxiliary camera travel still
needs the broader Focus audit. The explicit ownership-key solver test is math
coverage, not proof of production ownership hierarchy. That hierarchy, fresh
80/96 comparisons, final visual approval and independent acceptance/performance
gates remain open. This increment does not close all of Requirement 22 or A–G.

## Recorded ownership hierarchy — 2026-10-11

The production planner now collapses applied-prefix LIBRARY/JDK metadata into
exact ownership groups at FAR/MEDIUM. Missing metadata stays unknown; region,
type-name prefixes and conservative scene defaults cannot supply ownership.
An immutable placement ledger retains classification changes using normalized
semantic ordinals. Canonical type/package/ownership key anchors remain stable
when a representative is detailed, residual order changes, members disappear
or the Cursor rewinds. Package coarsening keeps the default namespace distinct
from a root namespace cut. Runtime bodies, ports, reducer, graph, normalized
event contracts and semantic goldens are unchanged.

Detailed Frame rows and recorded project-object fields share the renderer's
row-visibility model for required external targets. Optional sources and their
visible dependencies must fit together before admission; genuine mandatory
overflow keeps its reasons. Quiet external volumes cannot bypass collapse.

Build, lint and strict reference TypeScript pass; AppRoot is 343.21 kB gzip.
Thirteen new ledger/hierarchy/admission unit checks and the existing focused
camera/planner checks pass: 18 tests in 1.36 seconds. Initial unit fixture errors
(missing PROGRAM_START and ended-session context for live references) were
corrected before the passing result. The complete default suite passes 1,822
tests with 70 opt-in skips (1,892 total), across 191 files (184 passed, seven
skipped), in 157.24 seconds.

Nine existing cluster/metadata browser checks pass in 1.6 minutes. The actual
dense JVM records 589 metadata observations; all match prefix-present identities,
including five JDK-owned objects/arrays. Six explicit ownership browser checks
pass in 1.0 minute, covering all five target viewports and reduced motion. They
use real Java, native pointer/keyboard interaction and the production camera
clock. They verify truthful FAR/MEDIUM collapse, exact identity accounting,
camera-stable single selection, physical CLOSE on ownership double-click,
unchanged runtime anchors/Focus and complete member bounds plus original proxy
anchor inside command Safe Frame. Desktop travel preserves a different actual
focused Frame. The browser harness reads the shared production row model in
its Vite browser environment; a preliminary Node import failed on the token
JSON import before any test ran, and was corrected without changing production
token loading.

The expanded final reconstruction browser run passes all 55 cases in 6.0
minutes, including the metadata bridge and all six ownership-travel cases in
that single run. This count excludes legacy E2E scenarios and the formal
80-case matrix. The dense recorded scene is retained as an ignored diagnostic
for visibility-aware camera analysis; it is an actual JVM observation, not a
replacement trace or synthetic production fixture.

All six ownership diagnostic images received original-size lead inspection.
Library members can still be obscured by foreground project solids even when
their projected bounds fit Safe Frame. Visibility-aware camera polish, dense
foreground/glow readability, narrow Inspector/timeline overlap and the broader
Focus pivot audit remain open. The complete collection/invocation/age hierarchy,
inter-cluster connector convergence, fresh 80/96 formal comparison, independent
acceptance/performance suites and final A–G approval also remain open. These
functional checks are not visual completion or a replacement for that matrix.

## Ownership visibility and Focus orbit — 2026-10-11

Ownership travel adds bounded sightline ranking against actual canonical solids
and actual array title plates. It admits only physical destinations whose real
title and identity project at least 12 CSS pixels nominally and along both face
axes. Renderer and solver share heading geometry and font sizes. Ordinary
collision admission, complete member bounds/proxy centre in command Safe Frame,
the canonical global zoom metric and runtime anchors remain unchanged. Generic
type/package travel retains its prior search and MEDIUM target. Ranking does
not establish that every row in an arbitrary world is unobstructed.

All six actual-JVM ownership cases now additionally select a fully framed
member's central face by native raycast. After actual selection/text transitions
settle, read-only WorldText observation verifies title, identity, rendered
opacity and all three projected font measurements. Selection preserves the
camera, Focus, Cursor and runtime anchors. The final full browser run regenerates
the six ignored destination images/JSON diagnostics. All six refined images
also received original-size lead inspection; title visibility has improved,
while narrow foreground overlap, collection entry presentation and the narrow
Inspector's timeline occlusion remain open.

The Focus pivot now rebases to the actual focused body/cell/cluster only on an
actual orbit gesture or non-shift arrow orbit. Single clicks, pointer down, pan
and dolly do not trigger that rebase. Swept collision checks retain their last
safe eye. Two native dense-JVM regressions cover desktop/narrow auxiliary heap
travel, plain clicks, keyboard orbit, pan followed by primary-pointer orbit,
Inspector Escape/return, World Escape with the Inspector open and exact
pre-Focus pose restoration. They exposed the old pivot error and a global
Inspector Escape interception; both were fixed. Inspector dispatch now depends
on actual keyboard focus inside that surface.

Build, lint and strict reference TypeScript pass. AppRoot is 343.91 kB gzip.
The focused camera/visibility/projection/shortcut run passes 23 tests in
0.885 seconds. The first complete unit run found one new fixture error: a
16:9 camera was paired with a 1440×900 viewport. After correcting the fixture,
the final complete default suite passes 1,826 tests with 70 opt-in skips (1,896
total), across 192 files (185 passed, seven skipped), in 158.64 seconds.

The final reconstruction browser run passes all 57 cases in 6.5 minutes,
including all six ownership cases and both expanded native Focus cases in the
same run. This includes the existing actual clock, cluster travel, Follow Path,
runtime identity, Console/input, editor/debugger, quality and graphics recovery
regressions. It excludes the separate formal 80-case matrix and legacy E2E
scenarios. Supported-renderer THREE.Clock/PCFSoftShadowMap warnings and legacy
unit Three CommonJS warnings remain visible; these results do not claim zero
warnings or a completed performance audit.

Complete collection/invocation/age hierarchy, current-reference inter-cluster
aggregation, broad visual/contrast polish, fresh 80/96 comparison and approval,
independent acceptance/performance suites and final A–G approval remain open.
The read-only inter-cluster audit confirms that the existing planner drops
clustered references and individual connector overflow and that production
bundle picking/captions/inspection need convergence. No runtime semantics,
normalizer, reducer, graph schema or Semantic_Golden changed in this increment.

## Current-reference topology and Header contrast — 2026-10-11

Current references are now partitioned over the exact presented cut instead of
dropping collapsed endpoints or silently discarding individual overflow. The
pure helper emits proven individuals, exact directed structural bundles,
unavailable geometry reasons, internal collapsed-cluster relationships and
Trace Current exclusions. All constituent IDs remain recorded current
references. No future, historical replacement or formatted identity is used.
The planner and readonly QA observation expose conservation counts separately
from runtime entity and graph-flow accounting.

Production bundle curves share ConnectorBatch, support native raycast selection
and open an exact virtualized constituent Inspector under explicit structural
`bundle` selection. Reference and flow captions are distinguished and use the
shared readable structural-label placement. Individual reference colour roles
now follow recorded frame/object/class semantics, with overlay precedence and
composed Focus/forensic caps. Selecting a constituent never issues a camera
command. Unavailable source ports stay unavailable; they are not replaced with
invented body-port references.

The complete default unit suite passes 1,841 tests with 70 opt-in skips (1,911
total), across 193 files (186 passed, seven skipped), in 155.39 seconds. The
focused helper/planner/structural-label/inspection run passes 23 tests in 1.03
seconds, including 100 randomized topology cases and normalized
replacement/null/rewind fixtures. The first typecheck caught tuple inference
and a null fixture payload error in the delegated tests, and an omitted
structural-label observation union in integration. These were corrected; no
runtime contract was relaxed. The strict browser typecheck also caught a DOM
Node cleanup type mismatch in the Header sampler; cleanup now uses the typed
parent operation.

The initial two native dense-JVM bundle cases pass in 16.7 seconds. At both
desktop and narrow FAR poses, their 107 current references partition as 101
drawable references in 14 directed bundles, six unavailable source ports, zero
individuals and zero internal relationships. Actual curve selection and
constituent inspection preserve camera, Focus, Cursor and canonical anchors.
Inspector mounted elements stay below 200. Both original-size ignored captures
received lead review. Their extended replay and Trace Current/All checks also
pass in the complete reconstruction browser gate.

Five fresh dense-JVM Header cases pass in 33.0 seconds at all target viewports,
using native Home/orbit and actual composited background pixels. The minimum
enabled text/icon contrast across ten states is 8.995:1. Glyph sampling preserves
the World, camera and runtime facts. Original-size lead review covered all five
orbit captures, including bright floor reflection immediately below the Header.
This verifies the Header's local backing and active-mode glass base; inactive
controls, broad floating surfaces and full World contrast remain outside this
check.

Build, lint and final strict reference TypeScript pass. AppRoot is 346.18 kB
gzip (CSS 8.73 kB gzip); the existing large-chunk build warning remains visible.
All 64 cases pass in 7.3 minutes in the complete reconstruction browser gate, including native
camera/Focus/cluster travel, actual-JVM playback/identity, Console/input,
editor/debugger, graphics/quality recovery and the new Header/reference cases.
This excludes legacy E2E and the separate formal matrix. The separate
80/96 formal matrix, sustained performance/chunk checks, complete
collection/invocation/age hierarchy, historical Trace All bindings, remaining
visual polish, independent acceptance/torture and final A–G approval remain
open. Supported-renderer Clock/shadow and legacy unit Three CommonJS warnings
remain visible. Runtime normalization/reducer/graph schema, Semantic_Goldens,
main and the frozen best.png reference remain unchanged.

## Collection reservations, entry faces and chip picking — 2026-10-12

The source-bearing dense-JVM ArrayList now reserves 5.2 × 9.93 × 2.3 project
heap geometry from its first captured allocation type/source. The pure helper
uses an explicit finite table of 28 canonical standard collection classes;
ordinary objects, arrays and unknown classes retain their formulas. A
reservation is not a collection fact. The SceneModel exposes no size or entry
before a captured summary, and later source/ownership does not move an
originally compact library anchor. Recorded JDK ownership remains unchanged.
Referencing-owner placement, unknown collection subclasses and complete
hierarchy remain open.

Captured entry chips, labels, visibility and key/value reference ports now share
one physical grid. MEDIUM displays up to eight captured entries; CLOSE displays
up to 24 across two columns of 12. Maps have distinct key/value chips and
chip-front ports. The runtime still caps collection previews at 32 values,
therefore normalized Maps at 16 pairs. No positions, defaults or operations are
fabricated to fill the reservation. `+M more` accounts for the recorded size,
including known unrecorded positions. Generic fields without a summary keep
their ports; explicit summary entries no longer get conflicting generic ports.

Native checks exposed two shared instanced-picking defects: farther body plates
could overwrite a chip's pointer-down state, and a face pointer-down followed
by body double-click dispatch lost the press across draw batches. The closest
pickable press now stops propagation and belongs to the whole solid surface,
with semantic identity and recording/array-window validation shared across
batches. Desktop/narrow actual chip selection and Inspector storage identity
pass. The cluster helper now proves a fresh native selection publication; an
unchanged old selection is no longer accepted as proof of a new hit.

The focused six-file run passes 118 tests in 1.36 seconds, including 100-run
layout/collection properties and new typed normalized prefix/geometry checks.
The initial new fixtures omitted PROGRAM_START, exceeded the Map capture budget
and used an out-of-range source line; they were corrected without relaxing
validation. Existing port tests were updated from the covered body face to the
exposed chip front and independently checked against actual solid geometry.
The first full default suite passed 1,910 tests with 70 opt-in skips (1,980
total), across 195 files (188 passed, seven skipped), in 152.52 seconds.
After the proxy and shared-press fixes, the full working-tree suite passes
1,939 tests with 70 opt-in skips (2,009 total), across 197 files (190 passed,
seven skipped), in 159.65 seconds. That count includes 26 tests in two pending,
unintegrated historical-binding modules; this collection checkpoint contributes
1,913 passing tests across 195 files. The pending index's subsequent immutable
prefix-view change also passes its focused 26 tests in 256 ms. Neither test
count establishes production historical Trace All behavior.

Two dense-JVM cases pass in 20.1 seconds with actual glyph observation. Each
shows 24 captured value slots, `size = 72` and `+48 more`; 32 entries were captured
and 40 were not recorded. Minimum actual projected text spans are 13.99 pixels
on desktop and 12.18 on narrow; headings measure at least 14.10 and 12.26.
Observed draw calls are 98 and 119, under 250. These are readiness snapshots,
not sustained CPU/GPU or pixel-occlusion measurements. Native selection and
prefix-before-summary/replay preserve the canonical body and Focus. Both
original-size ignored captures received lead review.

The narrow native case closes the sheet through its real control before
explicit Focus in the full World; closing alone preserves the camera. Initial
Focus with the sheet open remains physically obstructed by foreground frames
in this dense arrangement. A two-angle Focus-ranking attempt did not resolve
it and was removed. Foreground stack occlusion and bright connectors crossing
labels remain visible polish issues. Map browser coverage and final reference
approval are not claimed by these List checks.

The first complete 66-case browser run passed 64 and failed two cases in 7.6
minutes. It exposed infeasible narrow ownership framing and proxies hidden
inside individually presented members. Structural proxies now reserve separate
stable space outside the runtime bands; actual ownership-observation ordinals
preserve reservation order. Ownership CLOSE replaces its outgoing proxy, so
arrival now frames the actual complete member with the same Safe Frame bounds
and tolerance, and asserts that the outgoing proxy is absent. Generic groups
still frame their proxy centre. The bounded solver uses the full actual Safe
Frame only if its centred search finds no feasible pose. The second full run
passed 65 and failed the short desktop native double-click in 7.7 minutes;
pointer diagnostics isolated the face/body press boundary, and the final
shared-press fix passes that native case in 11.7 seconds. Temporary production
diagnostics were removed. Pure proxy/arrival checks pass 25 tests in 1.88 seconds
and a subsequent focused 17 tests in 1.03 seconds, including a distant outgoing
proxy and actual readable member geometry.

The final complete 66-case run passes 65 cases and fails the initial quality
test lifecycle wait in 7.8 minutes (`browser-collection-shared-press-all.log`).
All collection, cluster, ownership, directed-bundle, camera, Console/input,
editor/debugger and runtime-identity cases pass. The quality test had called
the readonly World bridge before Metrics mounted; it now waits for that real
lifecycle boundary before invoking readiness. All original GPU capability,
lazy-loading, effect readiness and same-canvas assertions remain. Its focused
rerun, together with desktop/narrow collection tests tightened to at least
12 pixels on all three measured glyph spans, passes all three cases in 22.2
seconds (`browser-collection-quality-mounted.log`). A single fully passing
66-case run after this test-only wait is not claimed; the final product gate
must rerun the complete suite after subsequent integration.

Build, lint and strict reference TypeScript pass. AppRoot is 347.13 kB gzip;
the existing large-chunk, renderer Clock/shadow and unit CommonJS warnings
remain visible. Formal 80/96 comparison, independent
acceptance/torture/performance, remaining visual/IDE cleanup and final A–G
approval remain open. Runtime normalization/reducer/graph schemas,
Semantic_Goldens, main and best.png remain unchanged.

## Historical reference bindings — 2026-10-12

Production SceneModel now exposes an immutable closed-binding prefix, derived
from accepted normalized slot observations/writes and actual retirement. It
does not alter RuntimeState, ExecutionGraph or normalization. Trace All draws
overwritten/nulled bindings at no more than .25 opacity, including selected,
focused and current-evidence relationships. Current and historical individuals
share the connector budget; mandatory overflow admits no optional excess.
Historical directed bundles retain exact constituent IDs in a separate
namespace. Hidden/retired sources remain unavailable; current null Map chips
use their actual distinct value/key geometry for proved earlier bindings.
Retired/unavailable endings have separate lifetime accounting and remain
queryable. Native curve/bundle selection and Inspector evidence are integrated.

Append validates accepted ordinals/IDs before adding facts. Closed history
captures a fixed immutable facade in logarithmic time; unchanged closed
prefixes reuse the facade and derived catalog. No per-projection growing-history
copy or future ending metadata is exposed. The implementation and evidence
limits are documented in `migration/historical-bindings.md`.

The focused integration run passes 58 tests in eight files in 3.13 seconds,
including independent interval properties and normalized cursor/null/Map/
retirement/budget checks. The first new scalar SET_FIELD fixture incorrectly
carried a reference; it was corrected to CREATE_REFERENCE without weakening
event validation. Strict TypeScript initially caught a nullable session cleanup
guard in the new browser test; the guard now explicitly requires the session.
Production build, strict browser TypeScript and lint pass. The production
AppRoot chunk is 1,143.30 kB / 349.78 kB gzip. The large-chunk warning remains
visible; browser evidence also retains Three.Clock and removed soft-shadow
filter warnings. These are not suppressed or treated as performance approval.

The first native ordinary BindingApp cases pass at both sizes in 16.8 seconds:
79 raw/135 normalized events, six historical bindings, four drawable and two
unavailable. The extended ordinary Java fixture adds captured field writes and
emits 553 raw/755 normalized events. At desktop and narrow poses, 78 historical
bindings partition into 76 drawable and two unavailable: 58 individuals plus
18 constituents in two directed bundles. A nine-constituent historical bundle
and an actual historical curve are selected through native pointers, then a
real Inspector constituent is selected without camera/Focus/Cursor/anchor
changes. Rewind before ending, empty-prefix replay and Trace Current/All keep
exact prefix accounting and opacity caps. Inspector mounted elements remain
below 200 in the checked states. The first extended run passed desktop and
failed narrow picking because a missed click opened the sheet over later
World points. Native sheet closure between attempts preserves the camera;
the narrow rerun passes in 9.8 seconds. No routing/picking tolerance was relaxed.
Both original-size extended captures received lead review and still show
strong current-flow clutter/crossings, so visual approval is not claimed.
The JVM only captured the final Map snapshot in this fixture; absent earlier
Map bindings are not invented. Map history geometry uses accepted normalized
unit evidence, not a claimed real-JVM observation.

The complete default suite passes 1,944 tests with 70 opt-in skips (2,014 total),
across 198 files (191 passed, seven skipped), in 156.22 seconds. The complete
68-case reconstruction browser gate passes in 8.0 minutes, including both
extended native-JVM history cases and the quality-readiness/collection checks.
The fresh desktop and narrow original-size captures received lead review;
current-flow crossings and excessive glow remain visible. Formal 80/96 comparison,
complete Flow provenance partitioning, hierarchy, sustained/world-scaling
performance, independent acceptance/torture, visual/IDE cleanup and final A–G
approval remain open. Main, best.png and the protected reference images are
unchanged.

## Complete Flow partition and obsolete shell removal — 2026-10-12

The modern planner accounts for every supported ExecutionGraph edge in the
applied prefix after selecting actual visible semantic ports. Individuals,
exact directed semantic-pair/role bundle constituents, unavailable spatial
evidence and active-scope/context exclusions form a disjoint complete partition.
Trace All has no scope exclusions. Quiet/hidden/retired rows, uncaptured array
cells and collapsed clusters never supply fabricated provenance ports. Actual
Map key/null-value chip geometry remains distinct. Mandatory drawable evidence
can overflow its nominal budget without admitting optional excess. Inspector
Flow bundles expose exact graph-edge IDs through virtual native-selectable lists.

The focused integration gate passes 19 tests in seven files in 3.15 seconds,
including two 100-case properties. Actual ordinary BindingApp JVM evidence
accounts for 289 supported edges: 158 drawable and 131 unavailable; 20
individuals plus 138 constituents in 13 bundles. Desktop and narrow native
Flow bundle/constituent picking, rewind, empty-prefix replay and Trace scopes
pass. Initial new unit fixtures used an incorrect array contract, no active
frame and unknown-source compact Map geometry; they were corrected to accepted
normalized facts. The initial native prefix oracle failed only at cursor zero,
where no graph exists; it now checks the actual empty edge prefix. Runtime
validation, picking tolerances and geometry admission were not weakened.

The obsolete unreferenced App and Inspector views are removed after a module
dependency scan. Their three live formatter consumers now import the extracted
pure formatter; the lead independently confirmed its declaration is
byte-identical. Legacy tested primitives remain, and broader renderer/style
deletion is still open. Migration evidence is in `migration/legacy-visible-shell.md`
and `migration/flow-partition.md`.

Application and strict browser TypeScript, lint and production build pass.
AppRoot is 1,147.83 kB / 350.95 kB gzip; Monaco and Cinematic remain separate
chunks. The full default suite passes 1,950 tests with 70 opt-in skips
(2,020 total; 199 files, 192 passed and seven skipped) in 162.45 seconds.
The complete 68-case reconstruction browser gate passes in 8.1 minutes
(`browser-flow-cleanup-all-68.log`). The quality evidence actually exercises
Cinematic on ANGLE Metal Apple M4 Pro: WebGL2, half-float buffers, four samples
and 16,384 maximum texture size; shaders compile, effects become ready,
the same canvas survives switching back, and page errors are empty.
Interactive makes no Cinematic request before the native switch. Explicit PCF
shadow mode preserves the effective filter already selected by installed Three
and removes the obsolete soft-shadow warning; Clock and build chunk warnings
remain visible.

The lead inspected fresh original-size desktop/narrow Flow captures and both
quality captures against the supplied reference. Text-crossing routes and
strong glow remain unapproved. Complete prefix resolution and topology still
cost linear work per changed prefix; the modern CPU benchmark has been
implemented and reviewed but has not run at this checkpoint. Million-edge
indexed aggregation, full hierarchy, sustained GPU/browser performance,
formal 80/96 comparison, independent acceptance/torture, remaining visual/IDE
cleanup and final A–G approval remain open. Main, best.png and protected user
reference assets remain unchanged.

## Whole-frame instrumentation and measured CPU diagnostics — 2026-10-12

Selected Flow details now show the accepted normalized event sequence from
the complete provenance record, with no event-ID parsing. Both actual JVM
desktop/narrow native bundle, constituent and replay cases pass in 24.2 seconds.

A guarded, read-only frame probe records one actual full-render submission,
draw calls, renderer resources and bounded asynchronous GPU results. The lead
found Floor rendered reflection/contact before the composer's callback;
those auxiliary passes now execute immediately before the composer under the
same owner and timing boundary. This preserves render order and resource/data
contracts while including their CPU/GPU work. Ordinary visits return no probe;
only DEV/VITE_QA plus `perf=1` creates one. No frame requests, synchronous GPU
waits or camera/runtime mutation access are added. The 16,384-sample ring and
eight-query limit expose drops, pending work, disjoint results and omissions.

The focused probe/registry suite passes 18 cases in 158 ms. Strict application
and reference TypeScript, lint and production build pass. AppRoot is
1,148.41 kB / 351.13 kB gzip; separate Monaco/Cinematic chunks and the existing
chunk warning remain. The complete default suite passes 1,968 tests with 70
opt-in skips (2,038 total; 201 files) in 161.14 seconds. Native probe, real
quality and graphics/context recovery checks pass six cases in 21.9 seconds.
The first new probe smoke failed before measurement by calling readiness before
the actual QA bridge mounted; the test now waits for that lifecycle at both
navigations. No metrics or thresholds were relaxed. The full 69-case browser
gate after this render-owner change remains to be run.

Actual native Person orbit evidence captures 103 INTERACTIVE submissions with
103 resolved GPU results. Cinematic captures 114 submissions with 113 resolved
and one pending; final INTERACTIVE has 118/117. There are no drops, lifecycle
issues or omission reasons. Actual settled full-frame calls are 72/103 for
INTERACTIVE/Cinematic. This short smoke is not Dense_Sample or sustained
30/60-second performance approval. The old Dense_Sample session is unavailable
after backend restart; a fresh ordinary Topology JVM run and modern browser
harness are required, not manufactured replay data.

The new modern CPU harness calls actual layout, projector, Flow and planner
APIs, with validated generated data and 100 distinct spread seeks per corpus.
The 200/5,000/20,000 raw targets yield 208/5,024/20,018 raw records and
367/8,875/35,346 normalized events. Initial fixed-order update ratios fail at
4.280 and 2.187; adding only heap diagnostics yields 1.501. No production
update code changed. Constructing both worlds before measurement and
counterbalancing their update order yields 1.123 against the same 2x guard,
with all 100 samples and identity assertions intact. Earlier failures remain
saved; this does not establish a repaired production bottleneck.

Every run fails generated retained-presentation memory checks. Counterbalanced
ratios are 1.638/0.721/0.645 against 0.25. The attribution run's largest corpus
retains 52.79 MiB semantic state and adds approximately 4.2 MiB layout,
10.7 MiB projector indexes, 5.9 MiB scene, 5.6 MiB Flow indexes and 7.4 MiB
plans/resolved flows. Forced-GC heap deltas are estimates with documented
boundaries. The opt-in test exits 1; no memory budget is waived. These generated
results do not substitute for the actual Dense_Sample retention gate. Further
heap/replay diagnostics, cache/index optimization, sustained native browser
work, hierarchy, formal reference convergence, independent acceptance/torture
and final A–G approval remain open.

The opt-in heap/replay diagnostic completed with the same memory failures:
ratios 1.602/0.714/0.641 and update ratio 1.061. Its pre-seek V8 snapshot is
400,253,908 bytes. Forced-GC retention after 100 seeks adds
8,180,408/33,824,024/109,549,592 bytes; this includes semantic checkpoint/recent
changes, derived caches and measurement arrays, not isolated presentation
bytes. The saved diagnostic motivates cache-lifetime analysis; it supplies
neither a budget waiver nor a completed optimization claim.

## Flow cache and fresh native Dense_Sample diagnostics — 2026-10-13

The complete-frame instrumentation checkpoint is committed and pushed as
`48f49edd15c745b6affb377426af5f27caa0e473`; local/origin match. Main/origin/main
remain `316b94ad79582c284fd466174db6f82d939aebba`, and best.png retains blob
`489b10543535dfe3e4d2d656904ce8261c9f64d6`. Protected user assets remain untouched.

Flow endpoint caching now keeps one currently resolved semantic graph's derived
map, clearing it on graph changes instead of retaining one map for every history
root. Ten focused Flow checks pass, including both 100-run properties and
repeated backward/forward prefix equality against a fresh catalog. The same
generated benchmark records post-100-seek increments of
7,272,104/10,310,160/16,673,704 bytes versus the preceding
8,180,408/33,824,024/109,549,592-byte diagnostic. These single-run totals include
semantic and reporting changes and do not isolate each cache. Initial
presentation-memory ratios remain 1.616/0.722/0.642 against 0.25; the benchmark
still exits 1. Its unchanged update guard passes at 1.055.

The reviewed native browser harness has strict TypeScript and focused lint
passing. It imports the preserved ordinary Topology source (SHA-256 verified)
and clicks actual Run. A completed fresh JVM yields 7,492 raw facts; independent
normalization requires the frontend to reach all 9,852 events, four frames and
33 objects before timing. Initial source-character/UTF-8-byte confusion and an
early 26-event catch-up-prefix attempt remain archived, with no complete-world
performance claim.

The first complete attempt has five fresh frontend loads with actual JDT,
median 3,919.73 ms against 5,300 ms. Fifty distinct captured-cell Focus/Home
pairs complete, but p95 167.72/232.70 ms exceed 125/152 ms. Seeking fails on
Time Dock width changing between press/release at cursor zero, so it is
unmeasured. Five complete 30-second windows retain every draw-call record,
maximum 110, but median cadence 32.1–33.3 ms, p95 34.7–35.1 ms and whole-owner
CPU p95 6.3–6.5 ms fail their budgets. The 60-second window passes drift/growth
at 0.304%/0.433%; whole-frontend heap does not isolate semantic/presentation
memory. The test exits 1 and its full report is preserved.

Time Dock now reserves sequence width for the entire accepted count, including
an invisible allocation at cursor zero without displaying a fabricated event.
Drei's already-requested orbit redraws are noted by the existing activity tracker
without an extra invalidation. A native probe smoke passes in 8.5 seconds and
checks continuity specifically after native orbit starts. The harness removes
its separate per-move rAF RPC; native pointer coordinates vary by elapsed wall
time and renderer submissions still determine every cadence sample. The fixed
full run and separate post-latency CPU profiling were subsequently completed. No sample
count, threshold, semantic truth or missing result is waived. Full default unit,
69-case browser, build/static checks after these changes and remaining A–G
convergence remain open.

The corrected-cadence attempt completes all fixed stages with no errors or
exceptions. Its preserved report records 100 exact seeks and 50 captured-cell
Focus/Home pairs; latency still fails at 145.03/193.22 ms seek p50/p95 and
167.55/223.26 ms Focus/Home p95. All five continuous viewport windows pass,
as do the 60-second drift and whole-frontend GC-growth checks. The optional
ten extra command pairs are profiled after all required timed pairs.

Prepared represented-face bounds, a bounded recording-owned route cache and
camera-intent subscription narrowing pass 20 focused tests, including 100
warm/cold geometry comparisons, invalidation and both cache limits. Thirteen
native checks pass across five viewport cluster travel, reduced motion,
actual historical-binding recordings and timeline semantics. The timeline
now has a public native HTML range; its separate regression passes exact
range fill, stable width from zero and real pointer scrub lifecycle.

The subsequent prepared-routing full browser attempt completes in 7.2 minutes:
fresh actual JVM `ad325471-2325-46f7-b3c2-98018533b91c`, full 7,492 raw /
9,852 normalized events, five cold loads, 100 exact spread cursors, 50 actual
captured-cell Focus/Home pairs, five continuous 30-second viewports and one
60-second stability window. No browser or stage failures occur. Cold median
3,913.28 ms passes. All viewport budgets pass at median 16.7 ms, p95
17.2–17.6 ms, CPU p95 2.4–5.6 ms and 109–110 maximum calls. Drift/GC growth
pass at 0%/0.324%. Seek p50/p95 102.21/133.12 ms and Focus/Home p95
167.60/199.43 ms still fail unchanged budgets; exit is 1. The old pointer
method and new baseline public-range method remain explicitly distinguished.

The separate extra-command profile shows planner inclusive sampled time
437.68 ms versus approximately 1,239.56 ms previously; this is diagnostic,
not a confidence claim or a replacement for latency samples. Shader work
remains substantial. Complete report, raw profile and summary are preserved
before subsequent production changes. No F milestone or A–G approval follows.

## Command and resource convergence — 2026-10-13, ongoing

The stable-material Dense browser attempt completes every stage with no browser errors or stage exceptions. Fresh actual JVM session `7f22cf7b-95ba-49fc-b893-cf30ea3ef9c3` supplies 7,492 raw / 9,852 normalized facts from the preserved source hash. All five 30-second viewport windows and the 60-second soak pass their unchanged submission/CPU/calls/drift/whole-frontend-growth limits. Five actual-JDT cold loads pass at median 4,163.32 ms. The command budgets still fail: seek p50/p95 100.75/134.37 ms, Focus/Home p95 184.79/232.32 ms. Exit 1 is preserved; there is no whole-product performance approval.

The separate ten-pair profile shows 26.61 ms shader program-log self time, down from 352.56 ms in the preceding diagnostic, with inclusive planner time 414.67 ms. These diagnostic runs are not statistical proof or replacement budget samples. Component timings leave the original command-to-two-rAF measurement boundary unchanged and show most measured time inside the native input-command await; this includes delivery and application work, so production causality remains unproven.

Subsequent production changes reuse one current accepted Flow runtime prefix, refresh complete collection-reference evidence on repeated observations, reconstruct long compact-world forward seeks instead of scanning skipped events, and restrict connector terminal exemptions to actual outward port corridors. Exact ports, canonical runtime IDs, complete recorded Flow/provenance counts and stable anchors stay intact. The retained actual Dense Node diagnostic compares 100 spread cursors with reconstruction; all agree. Its forward advance median is 1.149 ms versus 3.126 ms before the long-jump choice, without claiming browser-budget repair. A repeated-observation regression plus collection/binding checks pass 35 tests; combined routing/Flow/projector convergence passes 24, including 100-run append/replay, arbitrary left/right ports and long-jump properties. Root reference/browser-harness strict typechecks and full `src` lint pass. Full default units, production build and complete native suite are being rerun; their results must be recorded before treating this checkpoint as stable.

The full default suite passes **1,981 tests**, with **70 opt-in skips** (2,051 total; 202 files, 195 passed and seven skipped), in **168.31 seconds**. This includes the new collection-observation, long-jump, append/replay, terminal-clearance and resource checks. Full source lint, strict reference/performance-browser checks and production `tsc -b`/Vite build pass. AppRoot is 1,151.11 kB / **351.99 kB gzip**; entry, Monaco, Troika and Cinematic artifacts remain separately recorded. The normal large-chunk warning remains visible. Logs: `unit-command-convergence.log`, `lint-command-convergence.log`, `typecheck-reference-command-convergence.log`, `typecheck-perf-command-convergence.log`, and `build-command-convergence.log`. These results establish the static/unit checkpoint only; full native, fresh fixed performance and final convergence gates remain pending.

The first complete 69-case native run exits 1: **55 passed / 14 failed**, over **2.8 hours**. This is not a passing checkpoint. macOS power logs confirm repeated Sleep/DarkWake cycles during the interrupted window and full wake at 14:31:20 local; individual tests show 12–17 minute wall durations despite 60-second configured limits. Cluster/collection failures retain actual `ERR_NETWORK_IO_SUSPENDED` console errors, and other cases retain language-service timeouts or failed source loading. The isolated Console input timing is 245.5 ms against its unchanged 200-ms limit; that failure is preserved and is not waived or asserted to have a proven production cause. The complete log is archived as `browser-command-convergence-sleep-interrupted.log`, with original error contexts in `browser-command-sleep-interrupted-results/`. A full fresh 69-case awake run is required, without reducing counts, altering thresholds or suppressing errors.

Generated prefix-reuse/long-seek gate (2026-10-13): `.ggjavaez/qa/reference-exact/perf-command-convergence.log` exits 1 for presentation memory, with unchanged ratios 1.773067568 / 0.750901169 / 0.650666492 against 0.25. The 100-batch single-event 20k/1k update ratio is 1.091262570 and passes 2×. Replay diagnostic retained bytes are 7,345,736 / 10,443,496 / 16,024,856, with mixed semantic/report attribution retained explicitly. Full awake native rerun is pending; the prior 55-pass/14-fail sleep-interrupted result is preserved and is not converted into a pass.

The full unchanged native suite rerun with `caffeinate -i npx playwright test e2e/reference --reporter=list` passes **69/69** in **7.9 minutes**, exit 0. Evidence: `.ggjavaez/qa/reference-exact/browser-command-convergence-awake.log`. This rerun used the same production tree, required case counts, assertions and timing limits. The sleep-interrupted 55/14 result and original failed contexts remain archived; they were not suppressed or relabeled. Native success does not approve the formal 80/96 visual matrix or the outstanding fixed performance/retention gates.

Required source/reference guardrails are implemented: `node scripts/reference/scan-generic.mjs` and `node scripts/reference/check-references.mjs` pass; 14 focused guardrail cases pass in 593 ms (`guardrails-integrity.log`). The scan checks TS/JS/Java/JSON identifiers and literals, ignores comments/tests/examples, handles camel case and space/underscore/hyphen separators and names all hits. Artwork caption checks preserve required functional Home/Focus/Trace controls. Six original images match their tracked twins and corrected-spec baseline bytes, with best tracked and five user-owned roots untracked. The temporary strict performance-harness config confirms the additional diagnostic seek profile typechecks, exit 0 (`typecheck-perf-seek-profile-confirmed.log`). The six requested checkpoint documentation files now record substantive implementation and current open gates; final cleaned-tree evidence still needs reconciliation.

## Completed prefix-reuse browser measurement — 2026-10-13

The fixed Dense browser gate on `44f5bc2391bdf191eed9bd2a2874bf12f7828d27` completes every stage, then exits 1 for four unchanged latency budgets. Run `b8847180-9a3d-4931-a911-fbcb6db9018c` uses actual new JVM session `012ada8d-beb2-4b75-8d94-8dc4d26496a5`: 7,492 raw / 9,852 normalized facts, four frames, 33 objects, FULL recording, exit 0 and exact preserved Topology stdout/source digest. All 100 spread seeks and 50 distinct cell Focus/Home pairs execute; no browser errors or stage failures occur. Seek p50/p95 are **99.188 / 116.456459 ms**, Focus/Home p95 **167.212083 / 199.873084 ms**. None pass their fixed 55/112/125/152-ms limits.

Five actual-JDT cold loads pass at median **3,928.589958 ms**. All five ≥30-second native orbit windows pass: median 16.7 ms, p95 17.3–17.4 ms, whole-owner CPU p95 2.4–3.0 ms, maximum 110 calls. Their actual asynchronous GPU sample counts and pending boundary queries remain recorded. The 60-second soak passes with 0% frame-median drift and **0.136979571%** whole-frontend forced-GC growth. Semantic rich retention and the presentation-only ratio remain open. Requirement 32.7 main-entry chunk measurement is reported separately; a complete initial dependency closure is a diagnostic rather than a second 500 kB budget. Raw `browser-world-performance-prefix-reuse.json`, its log, extra command/seek profiles and compact summaries are preserved. This report supersedes the prior pending-run wording without erasing earlier failed reports; it does not approve performance or A–G completion.

## Production presentation-test successors — 2026-10-13, ongoing

The root migrates actual acceptance/torture/instrumentation and INV-10 geometry consumers to the production layout/projector through a test-only adapter, preserving recorder limits and semantic assertions. Identifier signatures retain every captured local and field even when faces omit them. A full initial acceptance attempt fails 72 cases because required build-tool paths are omitted and hidden JVM type display exposes VM addresses without class names; that attempt is archived. The formatter preserves the captured hidden-class name and `/0x…` suffix (also descriptor/source array forms), with canonical identity untouched. The corrected full acceptance run with Maven/Gradle paths passes **191 ordinary checks + four declared expected failures, zero skips, 195 total**, in 172.70 seconds. The complete fresh torture gate passes **9 expected / 9 executed / 9 passed / 0 skipped**, in 42.80 seconds.

The root reviews the replacement presentation golden: exactly all 98 old case keys remain, all 49 metadata-mode pairs now have identical production geography, and every-case batch/append/snapshot/body/port invariants hold. New hashes intentionally replace obsolete curated/theater/Spatial 2.0 geography; semantic goldens are untouched. `presentation-goldens.md` records the retired and replacement hashes and the reviewed difference. Old `layoutGolden.*` and the unused `src/app/animationQuality.ts` are removed; the current Interactive/reduced-motion assertion replaces only the retired preference case. The retained Home/ragged cases and unchanged 3×4096 array/1000 invocation projection corpus pass; the first overly broad drawable-source expectation and its precise current face-limit correction remain documented. Five successor/layout/topology files pass 26 tests.

Full defaults pass **1997 tests, 70 explicit opt-in skips, 2067 total**, in 176.31 seconds; 197 passed / seven skipped files. A later bounded hidden-type array-spelling extension passes all nine focused checks. Production typecheck/build, full source lint and strict reference-browser TypeScript pass. Vite AppRoot estimates are 1151.20 kB / 352.06 kB gzip. The actual post-build SHA-256/default-gzip artifact measurement passes Requirement 32.7: main entry 71,915 gzip bytes (limit 500,000); Monaco and Cinematic passes are separate. Entry static closure 72,343 bytes and main/Shell static closure 649,587 bytes are diagnostics, not a second invented entry budget. Network request-policy checks remain independent. Evidence: `production-build.json` and `production-build-measurement.log`.

The migrated full pipeline probe passes its unchanged five sizes through 100000 requested raw events, 30 random/50 adjacent seeks per size, both full-prefix controls and all three actual Java projects, exit 0 in 16.72 seconds. Stage methods are labelled as production successors; old reports are not overwritten. The complete unchanged native suite passes **69/69** in **8.2 minutes**, exit 0; evidence: `browser-presentation-migration.log`. Broader hierarchy, legacy module/test/CSS/contracts cleanup, unchanged Dense latency/retention gates and final visual/full validation remain open; no A–G completion is claimed.


## Recorded hierarchy and Focus convergence — 2026-10-13, ongoing

The production hierarchy now indexes every required key, prefix-gated captured collection lifetimes, separate live/historical frame roles, exact residual membership, zero-node anchors, class packages and canonical method frequency with innermost ties. Optional groups expand all or nothing after pins, ranked by one-hop relevance, actual project ownership and target tile; residual cuts coarsen to recorded ownership and report irreducible overflow. All 98 prior runtime geometries match independently; only presentation metadata goldens change under the reviewed explicit write flag. Semantic events/reducer/graph/history/instrumentation remain unchanged. `migration/cluster-hierarchy.md` records contracts and exact evidence.

An initial full native run fails 67/2. The focused-cluster zoom failure reproduces: inward +21° traps the eye at the stack slab boundary. Structural stack/class Focus now uses outward −21° while preserving real-entity neighbour preference, angle magnitudes, pitch, collision boxes and limits. The other case exposes a guessed virtual-window sampling delay; the native scan now verifies physical scrolling and committed visible rows, preserving complete membership and the row cap. Both corrected cases pass, and the full unchanged native suite then passes **69/69**, 8.2 minutes. Earlier failures are preserved rather than converted to passes.

Full default convergence passes **2009 tests / 70 explicit opt-in skips / 2079 total**, 164.07 seconds (206 files, 199 passed and seven skipped). Lint, strict reference-browser TypeScript and production typecheck/build pass. The actual built main entry is **71,911 gzip bytes**, with Monaco/Cinematic split; entry static closure 72,339 and main/Shell static closure 651,545 bytes remain diagnostics (`production-build-cluster-focus.json`). Vite AppRoot is 1157.22 kB / 354.21 kB gzip. Four further old consumers retain their original case counts and semantic assertions through the current projector. The cached CPU successor passes all three original accepted recordings, 90 seeded seeks and 270 level plans with explicit GC; the initial evidence-shape failure and precise recorded-return proof correction remain documented in `migration/presentation-tests.md`. No final milestone or reference/performance approval is claimed.

## Captured frame-row windows and consumer migration — 2026-10-14, ongoing

The production face now uses one bounded captured-row mapping for labels, instanced picking, references and graph-backed Flow endpoints; immutable canonical frame/slot identity and geometry remain unchanged. A proposed event-to-Flow catalogue is rejected during root review because corrected Requirement 17 requires actual graph edges; no synthesized event graph or graphless Flow is integrated. The original array/I/O cases move to the current projector/planner, preserving all 122 array prefixes, five cells, four lexical locals and seven explicit I/O transitions. Five additional row-window cases include a 100-run geometry property and a reducer-produced late graph binding. `migration/frame-row-windows.md` records the exact old/new oracle mapping and failed experiments.

Focused integration passes **80 tests in nine files**, 1.52 seconds. Full defaults pass **2014 tests / 70 explicit opt-in skips / 2084 total**, 169.54 seconds (207 files, 200 passed and seven skipped). Typecheck/Vite build, source lint and strict reference-browser TypeScript pass. Actual post-build measurement passes Requirement 32.7 at **71,914 main-entry gzip bytes**; Monaco/Cinematic remain split. Entry static closure 72,342 and main/Shell static closure 651,900 bytes are diagnostics. Evidence: `unit-frame-row-window.log`, `build-frame-row-window.log`, `lint-frame-row-window.log`, `typecheck-reference-frame-row-window.log`, `production-build-frame-row-window.json/log`. AST inventory finds **626 tracked modules, 2071 literal edges, 213 production-reachable modules and 72 obsolete targets, zero production-reachable**; the obsolete files are still present, so removal is not claimed.

The root mistakenly starts the broader 195-case default browser command, which includes retired Classic/Spatial/Theater selector cases. It is deliberately interrupted after **five array failures, one interrupted camera case, 189 not run, exit 130**; this is not a passing or complete full-browser gate. Log `browser-legacy-selectors-interrupted.log` and `browser-legacy-selector-failures/` preserve the diagnostics. Legacy browser migration remains required. The documented 69-case reconstruction command is then run unchanged; its result is pending. Fixed Dense latency/retention, final visual convergence and whole-product architecture removal remain open.

The first frame-row reconstruction run is **67 passed / two failed**, 8.7 minutes, exit 1, with both failures in native cluster keyboard selection before the member list opens. Full failure contexts are archived. A two-case diagnostic with unchanged assertions passes in 22.8 seconds, so no deterministic test-only explanation is claimed. Root review identifies stale accessibility-cut publication: the production throttle previously used scene revision, though selection changes plan revision independently, and its identity key omitted actual cluster label/count changes. The catalogue now refreshes committed cuts immediately and includes labels in its publication key, preserving unchanged-cut orbit cadence. All-viewport targeted confirmation and a fresh full gate remain required.

Final checkpoint confirmation (still not final A–G approval): the full default suite passes **2014 tests / 70 explicit opt-in skips / 2084 total**, 169.19 seconds; source lint, strict reference-browser TypeScript and production build pass. The fresh full native reconstruction run passes **69/69**, 8.1 minutes, exit 0 (`browser-row-accessibility-confirmed.log`), with the original lightweight keyboard loop restored and an additional exact accessible cluster-label/count assertion. The five corrected viewport scenarios had already passed in 47.7 seconds with read-only observations; those observations remain archived, and the earlier 67/2 and broader interrupted legacy runs remain failures. Cached production projection passes **3 expected / 3 executed / 3 passed / zero skipped**, 90 seeded seeks × three levels, explicit GC, 1.06 seconds (`cached-projection-frame-rows.log` and its `cached-projection.json`). This is reused accepted JVM CPU evidence, not fresh execution or a browser/GPU/Dense budget approval. All four guardrail files pass **19 tests**, 1.20 seconds, including the six protected reference images and semantic/provenance/fixture checks. No protected semantic-core diff is present.

The final measured entry is **71,916 gzip bytes**, within 500,000, with Monaco/Cinematic split. Entry static closure 72,344 and main/Shell static closure 651,905 bytes remain diagnostics (`production-build-row-accessibility-confirmed.json/log`). Fixed Dense seek/Focus/Home and presentation-memory gates, old browser/renderer/contracts/CSS removal, and formal reference convergence remain open.
