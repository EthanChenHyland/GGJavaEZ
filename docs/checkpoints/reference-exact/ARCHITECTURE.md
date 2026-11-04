# Architecture

Current implementation, 2026-10-18. Whole-product convergence, presentation-memory approval and legacy removal are still open. This is an implementation record, not a completed milestone claim.

## Runtime boundary

Real Run/Debug uses the existing local bridge, BuildService, launch reconciliation, instrumentation and ExecutionSession. Incremental raw transport feeds TraceNormalizer and ExecutionHistory; immutable RuntimeState and ExecutionGraph remain the semantic substrate. The presentation never supplies fake objects, frames, values, provenance or Console output. Raw recorder sequence, normalized semantic ordinal and applied-prefix cursor remain distinct. Cursor c applies [0,c), including c = 0.

`src/app/AppRoot.tsx` routes the production Shell at `/`. `/examples` mounts the same Shell with a clearly curated recording selected from `src/examples/catalog`. It does not mount a second renderer. `src/state/appState.ts` derives visible state from orthogonal process, recording, debugger, input, work and view dimensions. `runAvailability` gates every start/continue/stop path; a partial recording does not mean its JVM ended.

## Shell and ownership

`src/shell/Shell.tsx`, Header, source surfaces, TimeDock, DebugBar and Console form the runtime-first shell. `computeShellLayout` owns viewport rectangles, Safe Frame and contextual source/drawer geometry. EDIT gives source more space; running, completed, historical and focused worlds retain contextual source. Debug pause uses the same world with the actual paused source location.

Workspace, editor, execution, debugger, interaction and shell stores own separate concerns. The workspace adapters retain dirty drafts, save barriers, rename receipts/recovery, launch/main validation, source-proof generations, recorded source bindings and JDT document coordination. Monaco model ownership survives collapsing/moving a source surface; actual tab/project retirement releases models. Filesystem rename and JDT symbol rename remain different commands. Console bindings follow their execution, including failed-build retention of the prior world and its output association.

## World pipeline

`WorldSurface` owns one compiler per recording: LayoutEngine, SceneProjector, FlowCatalog and bounded ConnectorRouter. Layout appends first-record/call-tree reservations; persistent anchors do not depend on camera or cursor. SceneProjector reconstructs the current accepted runtime prefix, sharing immutable leaf projections; sparse forward updates touch actual event owners. Long jumps through compact worlds reconstruct from the already sought state instead of traversing thousands of skipped events. Both paths must agree on values, IDs, source and evidence.

The scene is complete; PresentationPlanner chooses detail, quiet entities, residual clusters and visible array windows downstream. Mandatory Selection/Focus/current/error/breakpoint/direct-runtime identities survive nominal budgets with explicit overflow. Counts account for every prefix-present entity and every eligible reference/Flow. Drawable geometry is separate from recorded provenance; missing spatial endpoints never erase recorded evidence.

The planner consumes FlowCatalog.iteratePrefix as one complete ordered pass, with the accepted edge boundary captured before lazy consumption. A current-prefix cache holds opaque endpoint IDs and packed kind tags, avoiding repeated semantic derivation without retaining every endpoint object and flow DTO. The public prefix snapshot remains eager, frozen and identity-cached; an existing exact snapshot can be reused by the iterable. Public queries retain their endpoint-object cache. Both endpoint caches retire together when a different semantic prefix is resolved. FlowTopology accepts arrays or other iterables and counts the complete single pass. No edge omission or runtime/backend contract change is introduced. [API equivalence and retention boundaries](migration/flow-prefix-lifetime.md).

Array windows map temporary presented cells back to canonical object/index slot IDs. Collections retain captured preview/size/observation truth, including retirement when an accepted summary replaces earlier entries. Historical references retain recorded lifetimes and event IDs; overwritten/null bindings do not become current references. Repeated observations with unchanged values still expose their latest recorded evidence.

The current hierarchy indexes class, type, package, actual recorded ownership, captured collection membership, observed invocation ancestry and normalized execution-age buckets. Immutable membership intervals handle preview replacement and rewind; canonical nodes retain zero-member identity/anchors, while the presented cut excludes pins and detailed/quiet identities exactly once. Optional detail expands whole groups ranked by one-hop relevance, actual project ownership and coarse target tile. Residual groups coarsen to package and recorded ownership; live-depth labels use canonical recorded methods with innermost ties. A historical native confirmation of this hierarchy passes 69 cases; `migration/cluster-hierarchy.md` records the precise contract and evidence boundary.

## Interaction, camera and time

Canonical Selection and Focus live in the interaction store. Selection opens inspection; Focus travels to the actual entity/cell and presents its readable face. Home returns to the shared Hero composition and EXPLORE. Trace chooses current/relevant/all recorded evidence, including historical bindings. Actual cluster/member selection reveals real runtime identities through a bounded keyboard catalog and inspector list.

CameraRig uses genuine Three.js orbit/pan/dolly. Manual input cancels scripted travel and always owns the camera. Follow, Follow Path, Focus, Home and auxiliary travel use shared camera contracts. Reduced motion removes scripted animation while preserving final geometry and semantic state. Timeline playback is independent of raw sequence and source event labels; forward/backward step and public HTML range scrubbing seek the same recording in place. The slider keeps stable physical track geometry at cursor zero and exposes captured pointer scrub lifecycle.

## Renderer

`src/render/RuntimeCanvas.tsx` uses actual WebGL/R3F geometry in X/Y/Z. SolidBatch instantiates rounded runtime cuboids; RuntimeSolid and FaceText attach actual titles/rows/cell labels. Central tokens, material roles and face typography prevent per-scene aesthetic systems. ConnectorBatch uses screen-space core/halo widths and per-curve shader alpha; mounted bands retain their material while paths change. ConnectorRouter stores at most two geometry contexts × 256 immutable paths and retains no semantic roots.

Interactive rendering uses shared acrylic materials, lit rounded bodies, readable information faces, floor contact/reflection and demand rendering. Cinematic materials/passes load separately, with GPU capability checks, selective-emitter bloom, AO/reflections and readability safeguards. PipelineGovernor uses Interactive during scrub, live trailing or camera movement, restoring Cinematic only after the 500 ms settling interval. Quality fallback retains recording, camera and interaction state. Lost graphics contexts and unavailable WebGL retain usable source/time controls.

The opt-in frame observer measures complete submitted render ownership, including auxiliary/composer passes, CPU submission, actual asynchronous GPU queries, draw calls and resources. It does not claim physical display presentation. OrbitControls' own requested frame is observed without introducing extra redraws.

## Delivery boundary

Superseded modules outside the production dependency closure remain in the repository and still have legacy test consumers. Their removal, shared stylesheet extraction, contract rename and test migration are required before final completion. The requested clean-replacement scan must fail until that work is proven; a one-shell production route alone is insufficient.

Java runs locally and unsandboxed. Maven and Gradle may execute project build logic. The product must retain that security truth in documentation and relevant launch/project surfaces; no renderer change creates a Java sandbox.

## Captured late frame storage — 2026-10-14

The current presentation can promote selected/focused/current graph-backed captured frame storage into a bounded face window. Runtime labels, pick chips, references and Flow endpoints share the same row membership/physical port; canonical frame/slot identity, body geometry and reserved ports stay immutable. Requests never synthesize unobserved storage or resize the frame. Graphless events retain semantic transitions/channel summaries, but corrected Requirement 17 excludes provenance Flow curves without an actual graph edge. The root removed an incompatible proposed event catalogue before integration. See `migration/frame-row-windows.md`. Full convergence and broader cleanup remain ongoing.

The production accessibility catalogue now refreshes each committed presentation-cut revision independently of runtime revision. Unchanged-cut orbit keeps its prior cadence, and publication identity includes actual labels/counts. The full unchanged-input reconstruction gate passes 69/69 after this correction; failed and diagnostic runs are preserved in `migration/frame-row-windows.md`.

## Scoped faces, camera consumers and editable model ownership — 2026-10-15

Captured lexical sections now occupy the existing immutable frame face through a shared divider/row mapping (0.36-unit divider, 0.18-unit depth indentation). Retirement and late captured rows cannot overlap canonical rows, and text/picking/reference/graph Flow terminals agree. Scope labels have no runtime anchors. Focus restores full readability for historical targets and their six true reference neighbors. The sibling reservation cache distinguishes null callers from a real frame ID `root`. Connector clearance reserves front captions only on the front of actual bodies.

All nine remaining legacy world test consumers and all six navigation test consumers now target the current layout/projector/planner/camera. The 81 navigation cases retain original corpora and map retired Theater/fixture-relative assumptions to the corrected continuous-world contracts. Their old production source modules remain pending the final dependency cleanup. Camera collision inputs now include captured channel bodies without changing lens margins. Editable Monaco draft publication uses a stable current-URI owner and ignores unchanged/retired echoes, protecting tab content and avoiding an observed update loop. Details and failed/corrected evidence are in `migration/scoped-faces.md`; semantic runtime/history/graph/recorder and semantic goldens remain unchanged. Full checkpoint convergence is in progress.


## Return evidence and Classic successors — 2026-10-15, ongoing

The return projector and Flow catalog now share exact graph return/consumer resolution. Scene return candidates carry edge IDs; catalog-free planner return curves and the separate fallback port resolver are removed. A consuming-write edge invalidates the source invocation face incrementally. Legacy return values/destinations remain semantic facts without becoming graph provenance. No semantic-core/history/recorder or golden change is made.

## Shared physical faces and Classic removal — 2026-10-15

The current renderer and temporal layer share exact visible chip geometry, including scope offsets, promoted late locals and separate Map key/value halves. Graph-backed drawable returns have bounded captured-value captions; captured operand text is optional and never inferred. Typed arrays/known collections reserve full library-region structural bodies at allocation, with occupancy for variable footprints; ordinary external objects remain compact. Raw-field ports and typography follow the actual body footprint. All 52 Classic cases now have production successors and its renderer, stylesheet, selector and dead layout adapters are removed. Remaining old 3D/browser/CSS/contracts consumers still require migration; see [the migration ledger](migration/face-motion-classic-removal.md).

## Current storage and visible context headings — 2026-10-15

`cursorEvent.storageIds` carries only current explicitly captured storage for bounded frame-face admission, independently of owner histories and graph provenance. It supports graphless declarations/assignments/input/array-read/reference targets without changing runtime state or inventing Flows/ports. Rendering and Home now consume the same captured four-invocation context and actual planned STACK heading. Structural heading cap height tracks 0.029 H with shared weight/tracking and ≥12-pixel admission; bounded clearance preserves the physical world plane while glyphs resize. The original 18 legacy text cases now exercise current metrics/projection policy; other old renderer consumers remain. [Implementation and failed/corrected evidence](migration/current-storage-headings.md).

## Protected unlit output — 2026-10-16, ongoing

The existing protection pass now carries unlit coverage in B independently of its hard red-channel bloom exclusion. Final OutputPass preserves covered linear face/chip/text colours before Three's output transfer, while lit bodies keep the installed tone mapper. Pass order, depth/vertex/SDF behavior and resource ownership remain intact; no additional pass, target or draw batch is introduced. See [the evidence ledger](migration/unlit-output.md). Exact opaque palette correction is distinct from final reference/material convergence.


## Timeline retirement and catalog order — 2026-10-17

Production time has one owner (`TimelineStore`, `useTimelinePlayback`, `TimeDock`). Seven unused old playback/timeline files, including 249 CSS lines, are removed with all 21 old cases preserved in reviewed production successors. The unused legacy `PlaybackState` type is removed after consumer inspection. Two original camera browser cases now use native controls/read-only observations rather than the retired Classic/Spatial/NavigationController surfaces.

A demonstrated batched-forward/reverse discrepancy is fixed in SceneProjector: catalog and reference-owner insertion follow recorded introduction witnesses, independently of update priority or numeric-looking opaque IDs. This keeps the shared first-invocation STACK heading and Home inputs identical through replay. Two regressions fail before the fix and pass afterward. RuntimeState, graph, history, storage, instrumentation and canonical anchors are untouched. AST inventory reports 41 remaining legacy targets and zero production-reachable legacy modules; whole-product cleanup remains unfinished. See [the migration ledger](migration/timeline-retirement.md).


## Measured text columns — 2026-10-17

RuntimeSolid derives one aligned text grid from its bounded visible row list using the same Inter advances and Unicode escape policy as WorldText. Fixed fonts, semantic content, world geometry and ports are preserved; ordinary names take priority over long type spellings while values retain at least 35% of the row span. See [the migration ledger](migration/face-columns.md).

## Hero admission and committed camera cuts — 2026-10-18

Optional visible-row dependencies remain detailed/pickable within the remaining budget without becoming semantic mandatory camera evidence. Source-known user-level Strings and collections retain their first-assigned heap geography and recorded JDK type ownership; compact ownership collapse applies to actual library-region bodies. Selection/Focus/live/current/required-flow identities still survive budgets with explicit overflow. `PlanInput.hero` carries only the actual viewport/Safe Frame during scripted Hero requests. The planner and camera share a pure fit over represented heap groups; unadmitted groups remain exact-count clusters. One nominal object budget bounds optional trials. A short-lived lazy type/package/ownership exclusion index supplies the same proxy anchors/order without rescanning every entity for each tentative cut. Exploration keeps its original quiet budget.

Renderer and camera share real Inter heading metrics, bounded lift and depth-aware obstacles. Selected cluster captions precede lane titles; lane titles precede optional captions. Home fits actual glyph corners and keys its cache/destination by the committed presentation cut, since LOD can replace a detailed library array with a cluster while travelling. A changed cut updates the destination within the existing arrival deadline; two stable arrival frames reconcile the final LOD before transient HOME clears. Manual input still cancels immediately. Hero independently refits changed represented cuts. These are presentation/camera contracts; no normalized event, semantic identity, runtime/history/graph, canonical body/port, source-proof or JVM contract changes.

The 41 remaining legacy targets are still in the repository. Neither a passing targeted run nor zero production reachability claims their removal. Exact failed experiments and validation boundaries are in [the Hero ledger](migration/hero-admission.md).


## Captured local retirement and Focus presence — 2026-10-18

`render/inspection.ts` exposes closed local records only from the applied `RuntimeState.variableLifetimes`. They are Inspector history, never reconstructed world geometry. Frame Inspector selection uses the existing bounded row-window policy for overflowed live storage. `interaction/focusTarget.ts` resolves a current semantic owner or actual structural cluster; the mounted World publishes that predicate through `WorldCommandSurface`, so Header/shortcut and native World/Inspector Focus agree on retired/absent targets. No scene/camera data enters runtime truth. [Corpus and evidence](migration/retired-locals.md).


## Region atmosphere and floor visibility — 2026-10-18

Two owned world-space haze sprites implement the specified region colours with explicit mask exclusion/restoration. The installed grid shader now applies true empty-world alpha; a longer extent-based fade makes the unchanged physical floor visible in the deep world. Runtime semantics/anchors, floor height/extent, grid spacing/colours and frozen palettes are preserved. Graphics **15/15** and defaults **2076/2146 with 70 explicit opt-in skips** pass, 174.40 seconds. Final native atmosphere/palette **2/2**, recovery **1/1** and Hero **5/5** pass in separate runs; all eight actual face/chip RGB samples remain exact in both tiers. Production build, strict browser TypeScript, lint and the 71,926-byte main-entry gzip gate pass. The lead reviews 16 hash-bound original-size images with OPEN visual findings. Typography, glow, material depth, Home readability, legacy cleanup, Dense budgets and final full-product gates remain open. [Implementation, failed attempts and evidence](migration/region-environment.md).


## Captured control facts and native condition migration — 2026-10-18

The current Inspector exposes only its owning invocation's applied-prefix conditions, named exact operands, taken/skipped paths, loop counts/endings and scope evidence. Raw VM jumps remain explicitly separate from unavailable Java results. Five new unit cases preserve all 73 forward/reverse prefixes, exact unavailable/MAX_LONG operands and bounded 10,000-entry lists. Defaults pass **2081 / 2151 with 70 explicit opt-in skips**, 218 files (211 passed/seven skipped), **176.50 seconds**, exit 0. Native integration passes **14/14, zero skips, 1.2 minutes**, including the original nine-condition/four-iteration case under its unchanged 30-second limit. Production typecheck/build, strict browser TypeScript and lint pass. Main entry **71,929 gzip bytes** passes 500,000; entry/shell static closures **72,357/657,265** remain diagnostics, Monaco/Cinematic split. AST: **637 modules / 2235 literal edges / 225 production-reachable / 41 remaining legacy targets / zero active legacy targets**. Default browser inventory stays **203 cases / 57 files**, now **86 native cases / 32 files** and **117 older cases**; listings do not claim a complete browser pass. Semantic/golden/reference guards pass. [The ledger](migration/control-facts.md) preserves original corpus, intermediate test failures and hash-bound OPEN capture reviews. Dense budgets, legacy removal and final A–G/visual gates remain open.


## Complete control browser migration and popup layering — 2026-10-18

The five remaining control workflows have native successors; the retired file is removed after a **5/5, zero-skip, 50.3-second** confirmation. A real Replay pointer interception is fixed by removing the enclosing World stacking context and raising only the open settings dock; natural 72-event Replay completes in **18.9 seconds** under the unchanged **32,240-ms** overall limit. Source typecheck/build, strict browser TypeScript and lint pass. Main entry **71,928 gzip bytes**, Monaco/Cinematic split; closures **72,356/657,259** diagnostic bytes. Browser inventory remains **203 / 57 files**, now **91 reconstruction / 33 files** and **112 remaining older cases**; final current-source full native confirmation is pending. AST **637/2236/225/41/0**. Semantic/golden/reference guards are unchanged; the previous full-unit 2081/70 result belongs to the preceding checkpoint. [The migration ledger](migration/control-workflows.md) documents every retained workflow, corrected single-World/Console oracles, initial 3/2 failure and OPEN image review. Dense, legacy and final visual/A–G gates remain open.


## Frozen full native confirmation — 2026-10-18

Clean pushed commit `26802ee4016f80d65ec7a9c45ba8d1fc6d665a68` passes **91 expected / 91 executed / 91 passed / zero skipped / zero flaky / zero unexpected**, **662.94 seconds (11.0 minutes)**, observed exit 0. The runner verifies unchanged HEAD/origin, tracked source and protected main before and after; run `200d72ba-ab73-4698-858b-dd9203d7f13d` is recorded in `validation-control-workflows-run.json/log`, `browser-control-workflows-confirmed.json/log` and its unique results directory. It includes the final stronger invocation-count guard and new Scanner/narrow captures. This is the full current reconstruction mix of curated/native and actual-JVM cases, not 91 fresh JVM sessions, the formal 80-session matrix or the complete 203-case default browser corpus. The remaining **112 older browser cases** are still not claimed as passed. The lead opens all three workflow captures at original size; `control-workflow-capture-review-confirmed.json` binds their hashes to OPEN findings. Final visual, Dense latency/retention, remaining legacy cleanup and A–G completion stay open.


## Legacy renderer/navigation entries removed — 2026-10-18

Ten audited, isolated old renderer/navigation modules are physically removed, while the Troika ambient declaration is relocated byte-identically and Selection stays unchanged. M7/M8 entry points now explicitly reject their retired browser workflows before browser/bridge/output work; their original source/history/reports and all modern performance gates are preserved. Full defaults pass **2081/2151 with 70 explicit opt-in skips**, **174.51 seconds**, exit 0. All remaining primitive tests are untouched and execute **83/83, zero skips, seven files**; the JSON inventory records expanded cases rather than 59 static templates. Production typecheck/build, strict browser TypeScript, source lint and protected semantic/golden/performance/reference guards pass. All **14 recorded production JS resources remain byte-identical** to clean parent `26802ee`, whose complete **91/91** native run passes with frozen source/refs. This is exact artifact equivalence, not a claimed new browser/performance run on the cleanup commit. Main entry **71,928 gzip bytes**, entry/shell closures **72,356/657,259** diagnostics, Monaco/Cinematic split. AST **627 modules / 2165 edges / 225 production-reachable / 30 remaining legacy targets / zero active legacy targets**. [The cleanup ledger](migration/legacy-entry-removal.md) records consumers, preserved corpora, declaration ownership and evidence limits. Remaining old primitives, aliases, CSS, persistence, 112 older browser cases, visual convergence, Dense budgets and final A–G gates remain open.


## Array facts and Inspector placement — 2026-10-18

Array window reasons now preserve existing selection/Focus/access semantics through one planner and shared cell style. Captured array operations remain Inspector facts; only proven graph edges route in the World. Inspector side resolves from actual projected geometry once per open item, remains fixed through navigation and reconsiders on reopen. ArraySolid and its unused geometry helper are removed after all 14 expanded unit successors and five browser successors pass. [Migration and limits](migration/array-placement.md).


## Isolated presentation retirement — 2026-10-18

Seven unused old renderer/planner helpers are removed after complete parent 97-case confirmation; all 14 production JS resources remain byte-identical. Current ownership is documented in the root coverage guide. The old Person file has six passing native successors, while the remaining six primitive test files stay untouched. AST becomes 624/2167/228, with 20 legacy targets and zero active legacy modules. [Evidence and verification limits](migration/presentation-retirement.md).


## Captured Inspector details — 2026-10-19

Invocation details use applied runtime/graph evidence, distinguish opaque ancestors from callers and preserve returns after their consumers. Reference descriptions name actual storage; inbound/outbound counts remain exact and historical bindings never borrow current redeclared names. A shared title formatter keeps identities consistent. The Inspector's at most ten lists share a 20-row cap, including overscan, for a 200-row total; logical index access remains paged. [Implementation, tests and remaining action gaps](migration/inspector-details.md).


## Inspector actions and captured Source — 2026-10-19

Inspector Reveal/Copy are registered presentation commands backed by the current mounted World. Applied-prefix source evidence creates a transient captured-file receipt; the existing read-only Source view owns its temporary Monaco model. Explicit reveal has a distinct marker and never mutates executing-source bindings or editable drafts. Focus/Return remains contextual. [Implementation and evidence](migration/inspector-actions.md).


## Unmounted trace-table retirement — 2026-10-19

Three explicitly superseded developer-table files are physically removed after a no-consumer audit. All **14 JS/four CSS production resources remain byte-identical** to clean parent 0cc97f7, whose full defaults and affected native checks pass. Five table-only unit cases are retired with explicit dispositions; semantic tests and all 69 remaining primitive cases are unchanged. Build/typecheck, strict browser TS, lint and protected/reference guards pass. AST **636/2228/234/20/0**; no new full-unit/browser/performance execution is inferred. [Evidence and limits](migration/trace-table-retirement.md). The active legacy surfaces and final A–G gates remain open.


## Paused debugger and Dock consolidation — 2026-10-19

The Shell DebugDrawer reads one existing ingested pause head independently of World history, with exact session/raw-watermark/frame/thread evidence and bounded lists. The old DebugPanel/shared stylesheet are removed; Source and Dock own their active styles. Closed Dock visibility no longer overrides open child layout. A deterministically reproduced pre-flush polling race in DebugManager receives one guarded fresh read before the unchanged exact watermark check. [Contracts, red/green evidence and limits](migration/debug-drawer.md).


## Legacy primitive closure — 2026-10-19

Twenty unreachable legacy primitive/helper/test modules are physically removed after all69 original cases are individually reconciled with current successors or explicit spec-replaced visual policies. Production assets are byte-identical; semantic contracts are unchanged. No src/scene or src/navigation source remains. The current world contract still has its temporary worldV2 name, and active old IDE chrome/persistence cleanup remains open. [Per-case reconciliation, evidence and limits](migration/primitives-retirement.md). Whole A–G acceptance remains open.


## Slot evidence retention — 2026-10-19

The presentation projector retains first assignment/write ordinals instead of redundant growing arrays; observation ordinals still provide exact historical changed-at evidence. All normalized/runtime/graph/history contracts remain unchanged. [Measured evidence and limits](migration/slot-history.md). Whole A–G acceptance remains open.


## World contract and orphan surfaces — 2026-10-19

The sole renderer contract now lives at src/contracts/world.ts, byte-identical to the previous worldV2 module. All119 consumer edits are exact import substitutions; the runtime reference selector owns its unchanged structural type and unchanged executable body. Eight unmounted standalone Console/Source/dropdown/flow files are removed, with13 original UI cases individually reconciled and5 current Console prefix successors. [Per-case dispositions, type proof and limits](migration/world-contract-consolidation.md). Whole A–G acceptance remains open.


## Style and token compatibility retirement — 2026-10-19

The standalone App/IDE stylesheets and v3 token export/palette aliases are physically removed. A six-rule document base remains; Shell/Editor own active pointer/gutter styles. Current CSS and Monaco bind directly to the frozen design groups. Bootstrap retires only the four obsolete preference keys, preserving project/draft/source/recording data. [Evidence, failure and scope](migration/styles-tokens.md). Whole A–G acceptance remains open.


## Shared Shell surfaces — 2026-10-19

The active menus, Launch/path/Delete/unsaved dialogs and both search focus owners now share a parent-aware mounted surface stack. Three superseded IDE files are physically removed. Twelve filesystem/execution command operation initializers remain byte-identical to parent9e2a612. The single Picker, Header project menu, DirtyRun decision and remaining chrome cleanup are still pending. [Evidence, per-case reconciliation and scope](migration/shell-surfaces.md). Whole A–G acceptance remains open.


## Focus Source / Inspector separation — 2026-10-19

The left Inspector uses the available space beside Source while staying in its required opposite half. The shared pure layout retains frozen Source/card dimensions; existing camera fitting reserves the actual card. Side ownership, camera-input priority, runtime and canonical world geometry are unchanged. [Evidence and limits](migration/focus-source-layout.md). Whole A–G acceptance remains open.


## Unified Shell Picker — 2026-10-19

Quick Open, Command Palette and workspace symbols use one Picker with virtualized complete file/command results, shared surface focus and single activation. JDT owns symbol matching and exact source locations; unavailable positions are disabled and stale replies cannot replace current results. Three old search/alias components and their style owners are physically removed; all16 original unit cases move unchanged. The workspace hook changes only its erased type import/annotation. [Evidence, per-case reconciliation and limits](migration/picker.md). DirtyRun, Header/Dock, remaining chrome and whole A–G acceptance stay open.


## Dirty-file Run decision — 2026-10-19

Run and Run Without Visualization now require an explicit decision for changed open/inactive and persisted closed drafts. Approval uses the existing Save All owner, retains errors/retry inside the dialog and releases the unchanged execution transaction only after every save succeeds and no dirty path remains. Cancel retains files and the prior World. Eleven protected operation initializers and generic dirty-decision behavior compare exactly with parent0b685a0 outside the new Run branch. [Browser reconciliation, faults and limits](migration/dirty-run.md). Header transition timing, remaining Shell cleanup and whole A–G acceptance remain open.


## Header project menu and command presentation — 2026-10-20

Managed projects and curated recordings use the Header project menu and the same registry/dirty-decision owners. The workspace hook is byte-identical to parent6970f5e. AppStateBadge renders the existing derived label, eight glyphs, Building progress and source-proof flag; Header buttons use bounded launch presentation, accessible disabled reasons and shared focus/hover tooltips. Explorer's superseded project controls and styles are removed. Tooltip Escape precedes global navigation, and pointer-transparent descriptions retain hover without blocking underlying controls. [Per-case reconciliation, retained failures and validation](migration/header-controls.md). Global keyboard/Dock/status consolidation, Header transition timing and whole A–G acceptance remain open.


## Shell keyboard dispatcher — 2026-10-20

The global keyboard listener now delegates to one Shell dispatcher. Exact physical matching and availability/invocation retain their existing registry and workspace owners; composition, menus, text input and consumed Escape keep their established priority. An AST comparison proves the remainder of the workspace source byte-identical to parent b4ed018. [Evidence and preserved behavior](migration/keyboard.md). Dock/status and whole A–G acceptance remain open.


## Dock drawers and workspace status — 2026-10-20

The Dock now owns its fixed strip, one floating resizable drawer and workspace status popover. Counts follow the canonical Console groups, merged diagnostics, paused debugger lists and recorded exception episodes. Existing Console JSX, Debug body and operation owners compare exactly with parent 97441e4 except the two retired automatic height resets. The old tool/footer/JDK banner and style owners are physically replaced; Configure JDK uses the existing dialog stack and detect action. [Ownership, case reconciliation and limits](migration/dock.md). Header fit at 1024, remaining Shell polish and whole A–G acceptance remain open.


## Closest camera fit — 2026-10-20

The shared perspective fit now solves image-plane pan intervals directly, without its unconditional 3% distance margin. Home converges on the actual structural glyph footprint. Canonical anchors, fixed fonts/FOV, camera ownership and collision/zoom constraints retain their owners and values. [Derivation, RED evidence, source-bound captures and remaining visual gap](migration/camera.md#closest-perspective-fit--2026-10-20). This closes the unnecessary zoom-out defect; Hero typography and whole A–G acceptance remain open.


## Reference value chips — 2026-10-20

Observed references now use inset value chips measured by the same scoped column initializer as the text. Whole-row pick, Inspector and motion geometry remains unchanged; only the new decorative parts occupy a separate depth-tested batch before the SDF labels, with depth writes disabled. No semantic ID, value, port, canonical anchor, fixed font or camera changes. [846 replay comparisons, exact owner proof, native evidence and open visual limits](migration/reference-chips.md).


## Camera visibility-graph work — 2026-10-21

The existing shortest-path owner checks whether a candidate distance improves the current entry before testing collision visibility. All admitted edges retain the exact full-solid swept test; the graph, tie order, escape/fallback and emitted camera poses remain unchanged. No hierarchy, new cache or semantic/backend owner is introduced. [Exact parent/source comparison, 279 complete route comparisons, actual native checks and open performance/visual gates](migration/camera.md#avoid-redundant-collision-queries--2026-10-21).


## Connector and flow-planning work — 2026-10-21

Whole-path bounds reject irrelevant face checks before exact segment clipping. Valid array-window ports use a temporary observed-ID lookup, and one ranked flow order supplies the unchanged mandatory/optional/bundle partition. All working tables stay within one call; public contracts, camera, values, provenance and runtime/backend retain their owners. [Operation-count REDs, 2,673 route and 336 complete-plan comparisons, native captures and fixed-budget results](migration/connector-route-cache.md#path-bounds-and-bounded-flow-planning-work--2026-10-21).


## Compact flow indexes — 2026-10-21

Flow candidates reuse the existing opaque-ID index and accepted graph ordinals; the redundant ordinal Map is removed. Event adjacency stores a singleton until fanout requires a list. Public APIs, semantic roots and recording lifetime remain unchanged. [Exact parent API comparisons, memory deltas, native behavior and remaining gates](migration/flow-partition.md#compact-catalog-indexes--2026-10-21).


## Unlit text mask composition — 2026-10-22

White unlit Troika masks accumulate coverage with MAX blending so antialiased glyphs cannot erase an opaque face beneath them. Source shaders/material ownership, depth, ordinary/black masks and render-pass/target counts remain unchanged. [Regression and compositing limits](migration/unlit-output.md#preserve-face-coverage-under-glyphs--2026-10-22).


## Camera-aware forensic evidence — 2026-10-22

The structural exception panel shares one camera-aware footprint between rendering and Hero/Home/Follow fitting. It grows left/up to preserve readable captured text, keeping the right/bottom edges, depth, runtime anchors and semantic identity fixed. Existing rounded geometry and the shared text batch are updated in place. The runtime layout and captured-content model are unchanged. [Ownership, bounded fallback and proof](migration/forensic.md#readable-structural-evidence--2026-10-22).


## Inline ordinal histories — 2026-10-22

Private observation/change histories store singleton ordinals inline, promoting only on repetition. All ordinals and strict-before evidence remain intact; runtime timestamps are not interchangeable. Only the projector changes. [Ownership and exact scene comparisons](migration/slot-history.md#inline-ordinal-histories--2026-10-22).


## Canonical source-event ordinals — 2026-10-22

Owner source histories retain ordinal references into the accepted event catalog, removing per-observation wrapper objects while preserving the same captured locations and cursor boundary. Only the private projector index changes. [Exact comparisons and ownership](migration/slot-history.md#canonical-source-event-ordinals--2026-10-22).


## Visible recording/liveness badges — 2026-10-23

The Header now renders independent AppState badges beneath its primary label, deduplicating only facts already present there. Existing derived state, lifecycle/commands, source-change status and full title remain unchanged. Production scope is the status component and Header stylesheet. [Native RED and ownership](migration/header-controls.md#visible-independent-recordingliveness-facts--2026-10-23).


## Compact forward dependencies — 2026-10-23

Forward target dependencies omit empty entries and keep single targets inline, promoting only for distinct targets. Reverse invalidation remains exact through duplicate bindings, clearing and rebinding; empty incoming buckets are removed. Public/runtime/backend/camera/rendering contracts remain unchanged. [Heap evidence and exact parent/heap-owner checks](migration/slot-history.md#compact-forward-dependency-targets--2026-10-23).


## Full-app 5,000-file search — 2026-10-23

A permanent browser regression exercises the actual 5,000-Java-file managed project through production Shell/Editor/Explorer/WebGL. It reuses only verified generated QA projects, observes native shortcut/focus/input events and opens real source. Production and existing unit inputs are unchanged. [Scope and correct capture boundary](migration/picker.md#full-production-project-with-5000-files--2026-10-23).


## Static environment capture ownership — 2026-10-23

The static environment now has one memoized owner. Runtime, selection and quality rerenders retain its panels/cube map; actual context loss remounts it. All panel settings and protected semantic/camera contracts remain unchanged. A read-only QA counter and permanent native regression cover capture identity/version through public interactions and recovery. [Ownership, native evidence and limits](migration/static-environment.md). Whole-product A–G acceptance remains OPEN.


## Completed-stream ownership — 2026-10-24

Execution delta streams now retire after the confirmed process end and complete committed raw prefix. Stop-request metadata is distinguished from child exit. Partial recording, input waits, debugger pauses and raw-processing recovery retain observation. Existing backend/runtime/ingestion/command contracts and transport bounds are unchanged. [Lifecycle policy, reproduced failures and evidence](migration/stream-retirement.md). Whole-product A–G remains OPEN.
## Array-window ownership — 2026-10-24

Deterministic windows retain identity when topology, budget and normalized admission reasons are unchanged. Geometry changes retain the existing revision rule; changed selection/Focus/current/requested reasons still replace the window so emphasis updates. This shares the previous bounded window without adding a cache or retaining runtime values. [Proof and validation](migration/array-window-identity.md).

## Qualified frame headers — 2026-10-24

Ordinary qualified signatures can use two lines within the existing fixed header. The shared heading helper owns metadata reserve and title position, including the 0.06-unit lift; existing camera admission reads the same plane. Other labels retain their single-line path. Read-only QA uses actual visible glyph-path bounds. [Design, fidelity boundary and evidence](migration/frame-title-layout.md).

## Rounded value insets and floor fade — 2026-10-24

Captured primitive rows gain a value-column inset; valid reference insets share an actually extruded rounded XY template with fixed physical corners. Renderer-owned face-band materials survive temporary batch retirement and dispose once with the renderer; mask proxies retain the same outline. Canonical row hit/mutation bounds, ports, IDs and values remain unchanged. The grid uses a quadratic distance fade with existing spacing/colors/reflection settings. [Ownership and preservation proof](migration/rounded-value-insets.md).

## Connector hover ownership — 2026-10-25

The existing interaction hover state now carries a pointer and presentation generation. Narrow subscribers separate port emphasis from tooltip coordinates; camera pose/intent and scene-generation changes retire stale hover. Captions resolve captured metadata and canonical indices. Core click mapping and runtime state are unchanged. [Ownership and lifecycle](migration/connector-hover.md).

## Focus anchor reconciliation — 2026-10-25

CameraRig tracks the current geometry and original deadline of an active Focus intent. A virtualized array-window repack refits that destination without extending arrival time; existing user-input cancellation clears the intent and prevents a later pullback. No new store, command or runtime contract is introduced. CameraRig is the sole, demonstrated camera-boundary exception. [Native RED/GREEN proof and integration limits](migration/focus-anchor-reconciliation.md).

## Recorded source containment — 2026-10-25

RecordedSourceView contains its lazy editor failure locally and shows the current captured file as a disclosed, focusable read-only view. Its single failure flag leaves the recording, workbench, source binding and normal Monaco lifecycle with their existing owners. [Scope and native fault evidence](migration/recorded-source-containment.md).

## Stable World text renders — 2026-10-25

WorldText skips equivalent drawing/semantic wrappers while preserving every annotation field, context/store updates, per-frame visibility and glyph cleanup. No runtime or presentation contract changes. [Evidence, boundaries and remaining failures](migration/world-text-memo.md). Whole A–G remains OPEN.

## Complete Frame value insets — 2026-10-25

Every remaining visible Frame value now uses the existing rounded inset batch, including null, unavailable and captured String summaries. Generic value-chip metadata does not reclassify Java values or change runtime/shared schemas. Heap null fields remain plain text. [Evidence, boundaries and remaining failures](migration/frame-value-chips.md). Whole A–G remains OPEN.

## Retained recording handoff — 2026-10-26

The existing source/path comparison now applies to a retained visualization, correcting suppressed source-change labels after a failed build. Only the session guard changes; runtime, source-proof, camera and store contracts remain unchanged. [Evidence, semantic disposition and remaining gates](migration/recording-handoff.md). Whole A–G remains OPEN.


## Null and unavailable attachment eligibility — 2026-11-03

Physical face-row positions are separate from current live attachment eligibility. Shared null/unavailable filtering applies to projected rows, presented Flow geometry and drawable catalog queries; complete graph provenance and canonical layout anchors remain intact. Trace All uses still-visible captured storage geometry for ended bindings at its existing faded opacity. No runtime/shared semantic contract, dependency or production module is added. [Contracts, failures and evidence](migration/null-value-ports.md). Primitive chip ports and whole A–G remain OPEN.


## Accepted event lookup ownership — 2026-11-03

The binding adapter now owns the single accepted-witness Map used by the projector, exposing only a frozen get-only facade. Full append-envelope validation remains with that owner; cursor qualification remains in existing readers. Return-evidence helpers express their existing get-only requirement. No global cache, runtime/shared semantic field, dependency or production module is added. [Ownership, contract regression and evidence](migration/accepted-event-lookup.md). Whole A–G remains OPEN.


## Array cell label lifetime — 2026-11-03

RuntimeSolid gives each physical cell a private memoized label boundary over presentation scalars. Equal-value observations preserve the group and glyph resources; activity, value, tint, opacity and supplied XYZ changes still update the affected subtree. Runtime truth, picking geometry and shared contracts remain unchanged. [Ownership and parent-equivalence evidence](migration/array-cell-label-lifetime.md).


## Array cell typography — 2026-11-03

ArrayCellLabels now supplies the required existing Inter weights explicitly: 500 for indices/activity labels and 600 for values. The parent/candidate comparison permits only those attributes. [Typography ownership and proof](migration/array-cell-typography.md).


## Face text opacity lifetime — 2026-11-03

RuntimeSolid separates memoized label content from the face fade. FaceTextOpacity carries opacity on the existing transform hierarchy; WorldText applies the inherited scalar in its pre-render hook. Actual values/geometry/highlight/windows still update. [Ownership and lifetime evidence](migration/face-text-opacity-lifetime.md).


## Source Escape and IDE browser successors — 2026-11-03

Source chrome now consumes plain Escape only while expanded over an existing World, preserving editor/input/widget ownership. The existing workbench.source action restores run/debug presentation sizing without changing Cursor, runtime, Focus or camera contracts. [Regression and ownership](migration/ide-browser-successors.md).


## Debugger browser successors — 2026-11-03

Debugger successors use the current World, Dock, Inspector, native timeline and source boundaries. Production and shared contracts remain unchanged. The explicit requirement 9.11 distinction between throw-origin status and recorded propagation is preserved; the temporary contrary experiment is rejected and archived. [Assertions, rejected experiment, exact source and evidence](migration/debugger-browser-successors.md). Whole A–G remains OPEN.


## Independent Error Explorer actions — 2026-11-03

Error Explorer now uses distinct callbacks for captured-source reveal, frame selection and recorded-event seeking. Frame selection uses the existing interaction owner with recording/prefix guards; explicit seeks omit replacement Selection. Nullable presentation-only source receipts support preview without selecting an item. Semantic/runtime and camera contracts are unchanged. [Exact source, regression and evidence](migration/error-navigation.md). Whole A–G remains OPEN.


## Captured return expressions and recursion successors — 2026-11-03

Invocation inspection now exposes only the selected invocation’s existing, prefix-visible ReturnTransfer expression. Missing expressions stay unavailable; no Java parsing, arithmetic inference, graph edge or standalone return entity is added. A read-only QA navigation observer and maintained browser typecheck support four migrated recursion cases. Semantic/runtime/camera contracts stay unchanged. [Exact assertions, source boundaries and evidence](migration/recursion-browser-successors.md). Whole A–G remains OPEN.


## Shared presentation event witnesses — 2026-11-04

Scene projection and FlowCatalog share one exact-document event-ID index through a registry with weak keys and weak values. Live readers retain their owner and qualify every lookup by their own admitted prefix; differing mutable incoming witnesses fork privately. The World compiler binds both readers to its original document across streaming wrappers. No RuntimeState, Graph, history, JVM or camera contract changes. [Ownership contract, rejected candidate and measurements](migration/shared-presentation-events.md). Whole A–G remains OPEN.


## Complete unavailable-flow snapshots — 2026-11-04

Unavailable-flow evidence now uses a complete read-only Array facade over privately captured IDs and an immutable on-heap reason string. It captures no mutable catalog or future prefix and preserves every ID, exact reason, index, count, iteration and JSON value. Stable identity is the recorded Flow ID; Inspector has no per-DTO identity cache or mutation. No runtime, Graph, event, history, camera, source or material contract changes. [Complete evidence, ownership and source qualification](migration/compact-unavailable-flows.md). Whole A–G remains OPEN.


## Error Explorer applied-prefix evidence — 2026-11-04

Error Explorer reads the existing recording-qualified RuntimeState and clamps its historical throw snapshot to the applied prefix. Accepted later Events remain explicit navigation targets outside the observed path. A user-created return bookmark is qualified by recording and throw witness, independently of the currently visible earlier episode. Runtime/Graph schemas, normalization, history, camera and navigation contracts remain unchanged; no CSS or alternate scene system is added. [Exact source, regressions and qualification](migration/error-prefix-evidence.md). Whole A–G remains OPEN.


## Reference-chip attachment geometry — 2026-11-04

Reference attachments use shared value-inset geometry; primitive transfer terminals preserve existing frame-boundary coordinates. Visible captured reference chips own ports independently of curve admission. The endpoint instance batch merges attachments and preserves hover, while a read-only QA observer reads actual sphere matrices/radii/alpha. Entity anchors, RuntimeState, Graph, normalization, history and all Java remain unchanged. Arrays/collections retain separate existing geometry. [Exact source, regression and current measurements](migration/reference-chip-ports.md). Whole A–G remains OPEN.


## Focus connection hierarchy and target readability — 2026-11-04

The root preserves the original six-neighbor reference ranking and caps every connection outside the direct Focus cut, composing with Trace, selection and forensic priority. A shared explicit Focus-context material modifier disables depth writes only for faded Focus bodies. A renderer-owned rounded-target mask clips faded glyphs over that target; actual draw-camera identity excludes reflections, and the owned base material releases installed Troika derivatives. Runtime/Graph/anchor/camera contracts and the Cinematic module remain unchanged. Arrays are excluded until their real header/cell silhouette is supported. [Scope, rejected alternatives and exact proof](migration/focus-connection-mask.md).


## Private layout metadata compaction — 2026-11-04

The private layout cache retains first slot order and latest heap declaring-class strings instead of complete RuntimeSlot/value wrappers. Omitted group metadata survives partial observations; supplied absent metadata clears it; empty maps are removed. Permanent geometry/ports and all runtime/Graph/history/camera contracts stay unchanged. [Ownership proof and complete parent/candidate comparison](migration/compact-layout-slot-metadata.md).
