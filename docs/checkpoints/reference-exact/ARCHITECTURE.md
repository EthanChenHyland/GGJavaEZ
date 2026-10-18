# Architecture

Current implementation, 2026-10-17. Whole-product convergence, presentation-memory approval and legacy removal are still open. This is an implementation record, not a completed milestone claim.

## Runtime boundary

Real Run/Debug uses the existing local bridge, BuildService, launch reconciliation, instrumentation and ExecutionSession. Incremental raw transport feeds TraceNormalizer and ExecutionHistory; immutable RuntimeState and ExecutionGraph remain the semantic substrate. The presentation never supplies fake objects, frames, values, provenance or Console output. Raw recorder sequence, normalized semantic ordinal and applied-prefix cursor remain distinct. Cursor c applies [0,c), including c = 0.

`src/app/AppRoot.tsx` routes the production Shell at `/`. `/examples` mounts the same Shell with a clearly curated recording selected from `src/examples/catalog`. It does not mount a second renderer. `src/state/appState.ts` derives visible state from orthogonal process, recording, debugger, input, work and view dimensions. `runAvailability` gates every start/continue/stop path; a partial recording does not mean its JVM ended.

## Shell and ownership

`src/shell/Shell.tsx`, Header, source surfaces, TimeDock, DebugBar and Console form the runtime-first shell. `computeShellLayout` owns viewport rectangles, Safe Frame and contextual source/drawer geometry. EDIT gives source more space; running, completed, historical and focused worlds retain contextual source. Debug pause uses the same world with the actual paused source location.

Workspace, editor, execution, debugger, interaction and shell stores own separate concerns. The workspace adapters retain dirty drafts, save barriers, rename receipts/recovery, launch/main validation, source-proof generations, recorded source bindings and JDT document coordination. Monaco model ownership survives collapsing/moving a source surface; actual tab/project retirement releases models. Filesystem rename and JDT symbol rename remain different commands. Console bindings follow their execution, including failed-build retention of the prior world and its output association.

## World pipeline

`WorldSurface` owns one compiler per recording: LayoutEngine, SceneProjector, FlowCatalog and bounded ConnectorRouter. Layout appends first-record/call-tree reservations; persistent anchors do not depend on camera or cursor. SceneProjector reconstructs the current accepted runtime prefix, sharing immutable leaf projections; sparse forward updates touch actual event owners. Long jumps through compact worlds reconstruct from the already sought state instead of traversing thousands of skipped events. Both paths must agree on values, IDs, source and evidence.

The scene is complete; PresentationPlanner chooses detail, quiet entities, residual clusters and visible array windows downstream. Mandatory Selection/Focus/current/error/breakpoint/direct-runtime identities survive nominal budgets with explicit overflow. Counts account for every prefix-present entity and every eligible reference/Flow. Drawable geometry is separate from recorded provenance; missing spatial endpoints never erase recorded evidence.

Array windows map temporary presented cells back to canonical object/index slot IDs. Collections retain captured preview/size/observation truth, including retirement when an accepted summary replaces earlier entries. Historical references retain recorded lifetimes and event IDs; overwritten/null bindings do not become current references. Repeated observations with unchanged values still expose their latest recorded evidence.

The current hierarchy indexes class, type, package, actual recorded ownership, captured collection membership, observed invocation ancestry and normalized execution-age buckets. Immutable membership intervals handle preview replacement and rewind; canonical nodes retain zero-member identity/anchors, while the presented cut excludes pins and detailed/quiet identities exactly once. Optional detail expands whole groups ranked by one-hop relevance, actual project ownership and coarse target tile. Residual groups coarsen to package and recorded ownership; live-depth labels use canonical recorded methods with innermost ties. Native convergence of this hierarchy passes all 69 current cases; `migration/cluster-hierarchy.md` records the precise contract and evidence boundary.

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
