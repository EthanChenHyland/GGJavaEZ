# Architecture

Current implementation, 2026-10-13. Whole-product convergence, presentation-memory approval and legacy removal are still open. This is an implementation record, not a completed milestone claim.

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
