# Implementation Plan: Reference-Exact Rebuild

## Overview

This plan rebuilds GGJavaEZ as one production application, a persistent full-bleed 3D runtime World with a complete Java IDE floating over it. It implements `requirements.md` using the architecture in `design.md` and the evidence in `audit.md`. The implementation uses seven coherent milestones A–G below. The thirteen legacy R0–R12 parent groups remain as an acceptance checklist, feature inventory and dependency reference; their task IDs and completed states are preserved. They are not a runner schedule. The lead owns shared contracts, integration and milestone acceptance.

Ground rules for every task:

- The semantic substrate stays as it is (audit §5): ExecutionSession, the server, instrumentation, normalization and validation, RuntimeState, ExecutionGraph, history and seek, LIVE/HISTORY, partial recording, debug semantics, JDT, the filesystem and build model, and Console truth. Only narrow bug fixes are allowed there. Semantic_Goldens must stay byte-identical (33.7).
- Renderer, layout, camera and animation data never enter `RuntimeState` or `ExecutionGraph` (33.8).
- Validation uses the local, integration, milestone and final gates below; a full build or browser run is not required after every small task. Old and new code may coexist only until the explicit R2 switch-over and deletion task (3.13) and the explicit R12 deletion tasks (13.1–13.2). The interim adapters created in R2 have named replacement tasks.
- Tests are never weakened. Weakening means relaxing a tolerance, broadening an expected value, or skipping or disabling an assertion. When a deleted surface forces an assertion to move, the move goes into the migration ledger with the old locator, the new locator and the unchanged expected value. When a Presentation_Golden is regenerated, it gets a review record (34.12).
- Real-JVM and browser validation always use real Java programs: fixtures under `fixtures/` (including `fixtures/torture-v12-p5_5`), `tests/torture-v12-p5_5`, and the new generic programs in `fixtures/reference-exact/`. Generic code must never branch on demo or fixture names (33.6).
- Implementation language: TypeScript/React (R3F, three 0.186.1, drei, zustand, Monaco), with Node `.mjs` for server-side and QA scripts and Java for fixture programs.
- Property tests use `fast-check` 4.10.2 with at least 100 runs each. Each test carries the tag `// Feature: reference-exact-rebuild, Property <n>: <title>` and lives next to its module as `*.property.test.ts`.

Normalization boundary tests must cover existing finish() control emissions: CAPTURE_STOP, PROGRAM_END and PROGRAM_ABORT can extend the normalized prefix at an unchanged Java-probe raw boundary. Key the map by raw boundary plus publication/terminal revision, include real control Events, and do not invent later Java facts.

## Implementation milestones and ownership

| Milestone | Owned checklist groups/tasks | Deliverable and dependency boundary |
| --- | --- | --- |
| A — Shell and application behavior | 1–3; command ownership in 10.4; initial 11.1/11.2 QA scaffolding | Runtime-first shell, source integration, operational workspace ownership, orthogonal command inputs and retained-world identity. Establish QA bridge, helpers, capture/readiness protocol, test migration ledger and initial generic hero program before shell cutover. |
| B — Stack/Heap/world reconstruction | 4; world capture/projection extensions of 11.2 | Stable genuine XYZ solids, anchors, semantic projection, evidence, drawable flows and shared primitives. Extend early QA with projected bounds, plan accounting, deterministic state/pose capture and reference comparison; prove and polish the hero before later structures. Depends on A contracts and shell host. |
| C — Focus/Home/Trace/time/debug/I/O | 5; 6 except 6.7 and exception-specific portions of 6.9 | User-owned camera, selection/Inspector, semantic prefix playback, source synchronization, live debugger and truthful Console/input. Depends on B world identity; complete hero interaction proof before D. |
| D — Arrays/collections/recursion/exceptions | 7; 6.7 and exception-specific portions of 6.9 | Extend the proven shared world with canonical-index/presented-slot mapping, bounded observations, returns, recursion and evidence-qualified Error Explorer. Depends on B/C. |
| E — Cinematic rendering | 8 | Shared materials, lighting/environment, selective bloom, readable Focus, custom line alpha and text readiness/disposal. Depends on B–D primitives and C camera ownership. |
| F — Zoom/scaling/responsive/performance | 9–10 except A-owned 10.4 | Stable semantic zoom over the full canonical population, mandatory overflow, truthful clusters, scalable layout/text, responsive/accessibility behavior and measured costs. Depends on B–E; resolve concrete hot paths during earlier milestones too. |
| G — Convergence/torture/cleanup/final validation | 11–13, completing the A/B-owned scaffolding | All Comparable_States, evidence-driven visual polish, torture/regression/performance, deletion of proven superseded UI, documentation and final exhaustive gate. Depends on A–F. Task 13.8 remains a future lead release action. |

Early QA work in 3.1, 3.8, 4.11, 4.14 and the scaffolding portions of 11.1–11.2 belongs explicitly to A/B. Do not defer observation, capture or comparison until G. Keep 11.1/11.2 unchecked until their full program/state matrix is complete. A owns the command registry foundation in 10.4; complete its later-feature enablement/binding coverage alongside C–F and leave 10.4 unchecked until that coverage passes. Review each milestone's overview, event and inspected captures at original resolution and fix visible drift before advancing.

The current Phase 5/5.5 visible architecture is not sacred: reconstruct the whole application and behaviors implied by the reference suite, which is the production visual target. Source, Stack/Heap, navigation, time, Debug, I/O, specialized structures and cinematic rendering must converge as one product. Remove superseded visible UI once its replacement is proven. Arbitrary Java facts remain truthful; reference imagery is never fake runtime content.

### Serialization and handoff safeguards

- The lead locks the corrected requirements/design contracts before implementation fan-out. These tasks apply the sixteen authorized corrections without changing the runtime schema, recorder semantics, reducer or ExecutionGraph contracts.
- Assign explicit module/file ownership. Parallel work is allowed only after dependencies are available and owned files are disjoint. Serialize writers to `Shell.tsx`, shared stores/contracts/tokens, `sceneProjector.ts`, `presentationPlanner.ts`, `CameraRig.tsx`, command registry, QA bridge and common browser helpers; the lead integrates shared files. Helpers may evolve through this owner, with consumer reconciliation.
- Use one lead-reserved dev pair/bridge and serialize real-JVM, debugger, browser, soak and performance workloads. Neither shared hardware nor the same local server is a parallel test boundary.
- Each handoff reports changed files, decisions, assumptions, checks, limitations and reconciliation needs. The lead reviews the diff and evidence before integration. Shared contract changes require lead reconciliation across consumers.

### Validation cadence

- **Local fast checks:** relevant module unit/property checks, changed-source lint/type diagnostics and static/import checks. Preserve all detailed test inventory below, but batch checks for a coherent change; named browser checks run at the next relevant integration boundary. Local verification never replaces a required later gate.
- **Integration gates:** when stores, shell routes, source adapters, world projection, camera, timeline/debug/I/O or renderer pipelines connect, run targeted integration checks and affected browser scenarios plus typecheck/build when imports or bundling change. Run real JVM only for a concrete bridge/semantic risk, in the serialized slot with the flags and count gate in 12.2.
- **Milestone full gates:** once each A–F milestone is integrated, run typecheck, lint, build, the full configured unit/property/regression suite, all browser scenarios affected by that milestone, and its required visual, motion, semantic or performance gates. Opt-in suites must report real execution separately; `npm test` alone does not prove them. A single full gate can satisfy the legacy checkpoints within that milestone; broaden only for failures, new changes or unresolved risk.
- **Final exhaustive gate:** 13.7 runs on the final cleaned tree and includes every static, unit, acceptance, real-JVM, torture, full-browser, visual-convergence, performance and integrity gate. Record commands, durations, exit codes, expected/actual executed counts and skips. No skipped real-JVM suite counts as passing.
- Convergence is evidence-driven: capture and measure the initial state; if it meets the target, accept that evidence. Otherwise fix the largest discrepancy and recapture until it meets acceptance or a necessary deviation is explicitly reviewed. There is no minimum cycle count. Recheck impacted states after shared changes and the full state/viewport matrix at G.

### Corrected task contract interpretation

Apply these rules to all task descriptions, examples, property claims and linked requirement/design references; the lead integrates the corresponding documents.

1. **Raw versus semantic sequencing (2.1, 2.3, 3.1, 4.5, 6.1–6.4, 6.8):** raw recorder `seq`, normalized event ordinal/ID and history cursor are distinct. Cursor `c` is the applied prefix `events[0:c]`, with `c ∈ [0,N]` and current Event `events[c−1]` only for `c>0`. Normalized Event seq is zero-based: an Event at ordinal `i` is included iff `i<c`. One-based display ordinals are presentation labels only and must not replace normalized evidence seq. Convert evidence explicitly; never compare raw `seq` directly to `c`. For accepted raw exclusive boundary `r`, map to the count of completed semantic emissions from the preserved normalizer for that accepted prefix and its prefix revision (including validated terminal emissions when published). One raw event may emit zero, one or many semantic events. Publish the mapping only after normalization completes; buffered/incomplete emissions do not advance it. Partial bounds, LIVE head, replay, seek, timeline labels and Return to Live use that semantic prefix, including 0. Keep raw boundary metadata for diagnostics only: preserved `lastRecordedSeq` is an inclusive last accepted raw seq (or null), translated by the adapter to the corresponding accepted exclusive boundary before normalization-prefix lookup, never copied into c.
2. **Orthogonal inputs (2.3, 2.5, 2.7, 6.5, 6.6, 6.8, 12.5):** process liveness, recording status/completeness, debugger pause, input wait/availability, build/instrumentation state and visualization Lens/Cursor are independent. Friendly labels/overlays compose these facts; command availability uses the actual dimensions. An alive JVM may have stopped recording and await input simultaneously. Disable second Run/Debug-start while build/start is active or process liveness is alive/unknown pending bridge reconciliation; Stop/input/debug controls follow their own state. A pause is visible before the first semantic Event; partial recording never implies process death.
3. **Retained execution identity (2.7, 2.9, 4.14, 6.8, 12.5):** Prior_World retains session/execution identity, trace/history and prefix revision, semantic Cursor, layout/anchors, Lens/semantic zoom, Selection, valid Focus, source bindings and Console association as one coherent world. Failed-build diagnostics belong to the new attempt. Key history subscriptions, projection caches and incremental publication by execution/session identity and prefix revision; ignore stale callbacks and retire old subscriptions at replacement.
4. **Observation and exception evidence (4.3–4.5, 5.5–5.6, 6.7, 7.1–7.2):** distinguish OBSERVED, TRUNCATED, UNAVAILABLE and PARTIALLY OBSERVED content. Exact mode means exact recorded content, with recording bounds and omission markers. Late object observations do not prove allocation defaults; unobserved cells are unknown; truncated Strings and collection previews do not recover unrecorded originals/history. Distinguish observed, derived and unavailable provenance/exception evidence. Complete cause chains, stack text and mutation origins are shown only when recorded. Selection-only Error Explorer actions preserve Cursor; separate explicit timeline actions seek to a semantic prefix.
5. **Canonical identity and presented geometry (4.1, 4.3–4.4, 4.11, 7.1, 9.2):** preserve binary names/descriptors (including `$`) as canonical Java/JVM identity, with separate display labels; do not derive identity by reversing formatted text. Arrays keep semantic array/index IDs while large arrays map them into temporary presented slots. Picking, Focus, connectors, provenance and Inspector resolve the mapping to the canonical index. Stable tray/entity anchors do not promise a unique permanent world coordinate for every virtualized cell.
6. **Budgets and zoom (4.9, 5.3, 7.1–7.3, 9.1–9.4):** nominal budgets are presentation targets. Deduplicate mandatory entities, ordered correctness-required (including breakpoint/error and required direct-reference endpoints) > selected/focused > current/relevant > cluster representatives > background; break ties with stable canonical IDs/first-record order. Retain mandatory entities even when they alone exceed a target. For target `B` and mandatory count `M`, optional capacity is `max(0,B−M)` and mandatory overflow is `max(0,M−B)`; report both and suppress optional work first. Never drop required current/selected information to hit a target. Derive zoom representatives from the full canonical population/bounds and camera, independent of planner output, use separate entry/exit thresholds and stable membership, and update cluster counts by current role/lifetime/prefix rather than historical append count alone.
7. **Provenance versus SceneFlow (4.6, 4.8, 5.5, 6.3, 7.1–7.3):** provenance queries index recorded graph evidence independently of drawable-flow filtering. `recordedProvenanceOf` returns evidence in the applied semantic prefix even if a SceneFlow has no drawable endpoint. Index locals/parameters by frame+slot, fields by object+declaring field, static fields by canonical class+field, array cells by array+index, collection semantic entries by recorded entry identity/order at the prefix, I/O by recorded stream/operation, exceptions by recorded target/frame and returns by proven destination. Resolve through preserved graph IDs; absent evidence is explicitly unavailable, never invented from matching values. Drawable queries require valid presented endpoint mappings; omitted/undrawable evidence remains visible structurally/textually in Inspector/Trace. “No recorded provenance” means no recorded evidence, not no drawable line.
8. **Rendering/text guarantees (4.12–4.13, 8.1–8.7, 11.2):** curve-varying opacity requires custom alpha attributes/shader or bounded opacity batches, not ordinary line material assumptions. Emissive-only bloom uses selective layers/masks and composition; a threshold alone does not guarantee exclusion. Protect the whole tilted Focus face/text with target-aware depth/plane or masking/compositing, or disable DOF if readability suffers. Group batched text by compatible font/weight/material/opacity (or supported custom instance opacity), prewarm needed fonts/glyphs, await glyph/layout/shader/effect readiness before captures, and dispose batch members, cache references, passes, targets and materials on replacement/context recovery. Effects fall back gracefully while semantic geometry/text remain readable.
9. **Scalable layout and content (4.1, 4.9, 5.5, 8.3, 10.1):** region bands and dimensions are hero/default composition targets, not universal limits on arbitrarily wide/tall worlds. Reserve scalable non-overlapping regions and viewport-aware headings without moving established entity anchors. Fixed-height virtual rows contain bounded previews; expansion/detail mode holds longer recorded text. Inspector mounts at most 200 summary rows TOTAL including at most 20 overscan; Console mounts visible rows plus at most 200 offscreen overscan total, not per side. Expanded wrapped text uses a separate detail view. Shell text is ≥12 CSS px; world text follows its recorded token/visibility threshold, with required labels available through close detail/Inspector when too small. Never wrap unlimited text into a fixed row or shrink mandatory text indefinitely.
10. **References (13.3, 13.6, 13.8):** `best.png` is tracked and preserved unchanged; exactly five root `ChatGPT Image*.png` files are untracked user-owned references, preserved byte-for-byte and never added. Preserve tracked twins too. This checklist describes future product implementation; the current spec-only correction pass does not authorize executing these implementation tasks. Its explicit documentation commit/push is separate.

## Tasks

- [x] 1. R0 — Reference and current-product audit
  - [x] 1.1 Audit the Reference_Suite and the Phase 5.5 product
    - Completed in `.kiro/specs/reference-exact-rebuild/audit.md`. It covers:
      - the inventory of R1–R6 and B0–B5, with the twin checksums;
      - an analysis of each reference;
      - the resolved design system, with composition, world, camera and palette tokens;
      - the fiction-versus-design rules;
      - the current-product gap tables in §4.1–4.23;
      - the preserved-substrate and replaceable-presentation inventories;
      - the largest gaps and the risks.
    - This is the evidence base for every later task and for `docs/checkpoints/reference-exact/REFERENCE-AUDIT.md` (task 13.4).
    - _Requirements: 34.1, 34.13_

- [ ] 2. R1 — Application state and shell architecture
  - [ ] 2.1 Pin fast-check and build the shared test generators
    - Run `npm install --save-dev --save-exact fast-check@4.10.2`. It must appear only in `devDependencies` (package.json, package-lock.json).
    - Create `src/testing/arbitraries.ts` with these generators:
      - `appStateInputs`, `viewport` (320–3840 × 400–2160 px), `shellInput`, `keyEvent`, `pathTree`;
      - `javaValue`, including NaN, ±Infinity, −0.0, and surrogate and control chars;
      - `timelineActions`, `orbitPose`, `callTree`, `allocationSequence`;
      - `recording`: raw Recorder streams from `traceGen.ts`, normalized through the preserved normalizer;
      - `cursorIn(recording)` including every applied-prefix boundary 0 through N, and `selectionIn(scene)`. Include raw events with multiple normalized emissions and incomplete emissions in boundary examples.
    - Extend `src/testing/traceGen.ts` with optional shapes, using generic names only and no fixture or demo names:
      - primitive, reference, nested and ragged arrays;
      - summarized collections;
      - statics;
      - caught and uncaught exceptions with causes;
      - consumed stdin;
      - partial stops (STOPPED_LIMIT, STOPPED_UNSUPPORTED, STOPPED_ERROR).
    - Add `src/testing/arbitraries.test.ts`: every generated Recording must pass the preserved normalizer and validators (`valueValidation`, `executionFactValidation`).
    - Done when relevant local checks pass and no existing test changed.
    - _Requirements: 33.7, 34.12_
    - _Design: Key decisions D13; Testing Strategy › Property-based tests_

  - [ ] 2.2 Introduce design tokens v4 and the v2 presentation contracts
    - Rewrite `docs/visual-java-spec/DESIGN_TOKENS.json` to version 4, exactly as in design "Design tokens v4".
    - `src/theme/tokens.ts` exposes typed, frozen v4 groups: color, typography, shell, world, camera, motion, budgets and detailLevel. The v3 exports stay only as deprecated aliases for the legacy `src/scene/**` and `src/classic/**` until 13.2.
    - Add `src/theme/cssVariables.ts` with `applyTokenCssVariables(root)`, which writes `--gg-*` variables. Call it from `src/main.tsx`.
    - Add `src/contracts/worldV2.ts` with the SceneModel v2 types from design "Data Models":
      - `Vec3`, `EntityId`, `DetailLevel` (FAR, MEDIUM, CLOSE), `Region` (including `library`), `WorldAnchor`, `Evidence`, `ValueText`, `SceneRow`, `FrameStatus`;
      - `SceneFrame`, `SceneObject`, `SceneArray`, `SceneCollection`, `SceneClass`;
      - `SceneReference`, `SceneCallLink`, `SceneReturnFlow`, `SceneExceptionPath`, `SceneIo`, `SceneModel`;
      - layout v2 `LayoutState`, `PlacementInfo`, `ClusterKey`.
      - The file sits beside the legacy `src/contracts/world.ts` until 13.2 relocates it.
    - In `src/contracts/interaction.ts`, add `NavigationMode`, add the `flow`, `cluster` and `arrayCell` Selection kinds, and add `direction` and `scrubbing` to `PlaybackState`. Adapt the existing consumers. `CameraMode` stays until 13.1.
    - Add `src/theme/tokens.test.ts`, checking that:
      - `tokens.ts` equals the JSON;
      - every UI text and glass token pair has contrast ≥ 4.5:1 composited over both background extremes;
      - the budgets equal design §10.1.
    - Done when relevant local checks and the next affected integration gate pass and `src/contracts/runtime.ts` and `executionGraph.ts` are unchanged.
    - _Requirements: 2.19, 29.1, 29.2, 29.16, 31.10, 33.8_
    - _Design: Design tokens v4; SceneModel v2; Interaction and camera models; Migration and Deletion Plan step 1_

  - [ ] 2.3 Implement `deriveAppState` and command availability
    - Create `src/state/appState.ts` with the types `ExecutionState`, `Overlay`, `FailureKind`, `Termination`, `WorldOrigin`, `AppStateInputs` and `AppState`, plus a pure `deriveAppState`. It must implement:
      - the corrected display-state composition over independent process, recording, debugger, input, build/instrumentation and Lens/Cursor inputs; the legacy precedence table controls labels only;
      - HISTORY and FOCUS overlays, derived only from Cursor/Live_Head and the Focus target, in HISTORY-then-FOCUS order;
      - the failure-kind mapping (`compile` when there is at least 1 compiler error);
      - termination as either an exit with any code or "Stopped by user";
      - partial retention of reason, budget and raw boundary metadata separately from the mapped accepted semantic prefix;
      - `worldOrigin`;
      - labels: "Running · History · Focus", "Completed" with the duration to 2 decimals and the exit code or "Stopped by user", "Build failed · n errors", and "Partial recording · <reason>";
      - one distinct icon per Execution_State.
    - Add `runCommandAvailability` consuming the orthogonal operational inputs rather than a single display label. While a session is active, Run and Debug-start are disabled with the reason "A session is already active". Step commands are disabled with "Stepping requires a paused debugger" unless paused.
    - Add `src/state/appState.test.ts` with one example per display row plus simultaneous alive-process/stopped-recording/input-wait, pause-before-first-Event and HISTORY/debug cases; reconcile clarifications C3/C5 with these independent inputs.
    - Done when the module imports no store or view code and the tests pass.
    - _Requirements: 1.1–1.14, 1.19, 1.22, 7.6, 24.4, 27.6, 27.12_
    - _Design: Components §1 Application state; Requirements Clarifications C3, C5_

  - [ ] 2.4 Implement shell geometry and the shell surface store
    - Create `src/shell/shellLayout.ts` with `viewportClass` (thresholds of 30.1) and `computeShellLayout`, using the token table of design §2:
      - Header, brand and Mode_Bar;
      - the Run cluster, at most 0.18 W;
      - Source_Panel sizes by the precedence table (NARROW drawer, FOCUS 0.22 W, Expand Source, DEBUG, RUN, EDIT);
      - Explorer width of 0.16–0.22 W;
      - Time_Dock;
      - the Dock strip, with 24 px toggle hit areas that extend into the Time_Dock's control-free bottom padding (C7);
      - the Dock drawer, at 0.20–0.45 H;
      - the Inspector, with a left or right side and the NARROW bottom sheet;
      - the Debug_Bar, centred within 2 px below the Header;
      - the Safe_Frame (source right + 0.014 W, Inspector-right rule, SHORT ≥ 0.55 H, NARROW rectangle).
    - Create `src/shell/shellStore.ts`. It holds:
      - the viewport;
      - Explorer open state plus its EDIT-time memory;
      - Expand Source, and whether the NARROW drawer is open;
      - the Dock drawer, with at most one open and its height remembered for the session and clamped;
      - Inspector open state and side;
      - status popover, dialogs and picker.
    - Add `src/shell/shellLayout.test.ts` with the rectangles for the five QA viewports.
    - _Requirements: 2.2, 2.4, 2.7, 2.9–2.11, 2.13, 2.14, 2.18, 3.3–3.7, 3.9, 4.1, 4.4, 7.5, 28.1, 30.1–30.3, 30.7, 30.8, 30.10_
    - _Design: Components §2 Shell composition; §20 Responsive system; Clarification C7_

  - [ ] 2.5 Write property tests for AppState and shell geometry
    - In `src/state/appState.property.test.ts`, use a reference model of independent operational inputs and display composition written in the test:
      - **Property 1: AppState is a well-formed pure function composing orthogonal inputs** — **Validates: Requirements 1.1, 1.4, 1.6–1.14, 1.22, 26.15**
      - **Property 2: Overlays derive only from Cursor, Lens and Focus** — **Validates: Requirements 1.15, 1.17, 1.18, 1.19, 19.11, 23.6, 24.6**
      - **Property 3: Header label formatting** — **Validates: Requirements 1.3, 24.4, 27.6, 27.12**
      - **Property 4: Session command availability** — **Validates: Requirements 1.5, 7.6**
    - In `src/shell/shellLayout.property.test.ts`:
      - **Property 6: Shell layout geometry** — **Validates: Requirements 2.2, 2.4, 2.9–2.11, 3.3–3.5, 3.7, 3.9, 4.1, 7.5, 28.1, 30.1–30.3, 30.7, 30.10**
      - **Property 7: Safe_Frame clearance and disjoint hit areas** — **Validates: Requirements 2.18, 30.9, 30.11**
    - In `src/shell/shellStore.property.test.ts`, using a reference model:
      - **Property 8: Shell surface state model** — **Validates: Requirements 2.13, 2.14, 4.4**

  - [ ] 2.6 Extract the workspace, editor and language stores from IdeWorkspace
    - `src/workspace/workspaceStore.ts`: projects, active project id, workspace generation, file tree, JDK status and the Java project model.
    - `src/workspace/editorStore.ts`: tabs, drafts, closed-draft index, active path, caret and scroll memory, and the recorded-source view. It keeps the preserved draft persistence keys.
    - `src/workspace/languageStore.ts`: the LanguageClient snapshot, diagnostics and JDT document coordination.
    - Preserve explicit operational owners before deleting IdeWorkspace: workspaceStore/operations own source-proof generations and rename receipts/recovery; editorStore owns dirty draft transitions, historical source bindings and Monaco model lifecycle/retirement; languageStore owns JDT document coordination; debugStore owns breakpoint/source mapping reconciliation; executionStore/launch operations own main and launch target reconciliation. Serialize their transitions through the command host and preserve existing stale-generation guards.
    - `src/ide/IdeWorkspace.tsx` reads and writes these stores instead of its local `useState` hooks, with no behavior change. This is Migration step 2.
    - Done when relevant local checks and the next affected integration gate pass and these specs pass unchanged: `e2e/ide.spec.ts`, `e2e/workspace-m8.spec.ts`, `e2e/explorer-usability.spec.ts`, `e2e/m11-persistence.spec.ts`.
    - _Requirements: 4.12, 4.15, 5.7, 27.15_
    - _Design: Architecture › Store topology; Migration and Deletion Plan step 2_

  - [ ] 2.7 Extract the execution and debug stores
    - `src/workspace/executionStore.ts` holds `session`, `ingest`, `world`, `pendingWorld`, the launch configuration and `endedAt`.
      - `WorldSource` origin is one of session, prior or recording.
      - The launch configuration (main class, arguments, working directory) persists under `ggjavaez:launch:<project>`.
      - It implements Run flow steps 1–8 of design §5: the dirty-file decision through a prompt port, build/instrumentation state distinct from process/recording status, keeping the full Prior_World identity, the coherent swap on the first accepted semantic prefix, RUN_ONLY "Console execution", Stop within 2 s, and the user-stop marker.
      - It provides the restart helper: confirm, stop, wait for the terminal phase, then run.
    - `src/workspace/debugStore.ts` holds:
      - the desired Breakpoints per project, under the preserved key `ggjavaez:breakpoints:<project>`;
      - the resolved projection through `projectSessionBreakpoints`;
      - session status, pause and toggle.
    - `IdeWorkspace.tsx` consumes both stores.
    - Done when relevant local checks and the next affected integration gate pass and these specs pass unchanged: `e2e/real-visualize.spec.ts`, `e2e/debugger-errors.spec.ts`, `e2e/java-project-m9.spec.ts`.
    - _Requirements: 1.4–1.6, 1.21, 6.1–6.5, 6.10–6.14, 7.1–7.3, 27.7_
    - _Design: Components §5 Execution, Run and Prior_World; §6 Debug presentation; Store topology_

  - [ ] 2.8 Build the command host and operation adapters from the stores
    - `src/workspace/commandHost.ts` builds the `IdeCommandHost` from the stores: `snapshot()`, `operations`, and `prompts` that resolve through shellStore dialogs. Add `src/workspace/operations/{files,tabs,run,debug,language}.ts`.
    - The `createIdeCommandService` contract is unchanged. `IdeWorkspace.tsx` drops its inline host.
    - Preserve these semantics:
      - Current Save All in `IdeWorkspace.tsx` sequentially saves open tabs, then persisted closed drafts, and aborts at the first failure. Implement the deliberate improvement required by corrected Requirement 5.8: attempt the remaining selected files and report per-file outcomes, preserving revision conflicts, successful saves, failing drafts and source-proof barriers. Save All and Run starts nothing unless every required save succeeds;
      - filesystem errors name the operation, the path and the OS reason, and leave the tree, tabs and drafts unchanged;
      - renames use the preserved `pathChanges.ts` transitions;
      - the delete dialog lists the affected dirty files.
    - Done when `src/ide/commands.test.ts`, `commandIntegration.test.ts`, `shortcuts.test.ts` and `e2e/commands-v12-p4.spec.ts` pass unchanged.
    - _Requirements: 4.9, 4.10, 4.12, 4.14, 5.4, 5.7, 5.8, 27.14_
    - _Design: Store topology (command layer); Components §4_

  - [ ] 2.9 Write property and unit tests for stores and operations
    - `src/workspace/editorStore.property.test.ts`: **Property 13: Tabs are unique and dirty dots are exact** — **Validates: Requirements 4.7, 4.15, 5.2**
    - `src/workspace/operations/files.property.test.ts`:
      - **Property 14: Workspace path transitions** — **Validates: Requirements 4.9, 4.12**
      - **Property 17: Save All deliberate partial-failure improvement and draft retention** — **Validates: Requirements 5.8**. Assert remaining selected files are attempted, every outcome is reported, failing drafts/revisions survive and Save All and Run launches only when every required save succeeds; characterize first-failure abort as the prior behavior, not the rebuilt target.
    - `src/workspace/debugStore.property.test.ts`: **Property 18: Breakpoint toggle is an involution** — **Validates: Requirements 5.11, 7.3**
    - `src/workspace/executionStore.property.test.ts`: **Property 19: Launch configuration round trip** — **Validates: Requirements 6.14**
    - Add example tests in `src/workspace/executionStore.test.ts` with mocked bridges:
      - dirty-run Cancel and save failure start nothing;
      - build/instrumentation progress and waiting-for-first-observation remain distinct from actual debugger/process/input state;
      - a failed build keeps the full Prior_World identity described above, labelled "Previous run · source changed", including source/Console association and session-keyed subscriptions;
      - RUN_ONLY execution;
      - Stop produces "Stopped by user";
      - Restart, both declined and accepted.
    - _Requirements: 1.21, 6.1, 6.2, 6.4, 6.5, 6.11, 6.12_

  - [ ] 2.10 Checkpoint — R1
    - Integration A: check generators, tokens, stores, operational ownership and command/state behavior locally; run the affected IDE integration scenarios from 2.6–2.8 at the store boundary. The full A gate is 3.14.

- [ ] 3. R2 — Source and runtime composition
  - [ ] 3.1 Build the Shell root, layer stack, stylesheet, interim World host, timeline store and QA bridge core
    - `src/shell/Shell.tsx` (`mode: 'ide' | 'recordingViewer'`) renders the fixed layer stack z0–z5 of design §2.
      - The World layer is mounted once and never unmounted.
      - Non-surface layers use `pointer-events: none`, so the World receives pointer and wheel input everywhere a surface is absent.
      - Surfaces are mounted in 3.8.
    - `src/shell/useViewport.ts` uses a ResizeObserver that writes into shellStore inside `useLayoutEffect`.
    - `src/shell/shell.css` is the single production stylesheet. It imports per-surface partials under `src/shell/styles/` and uses token variables only, including `.glass`, the focus ring and typography. It has no viewport media queries for geometry.
    - `src/shell/world/InterimWorld.tsx` lifts the legacy runtime pipeline out of `src/app/App.tsx`: legacy layout, `buildSceneModel`, Spatial `RuntimeCanvas`, legacy navigation, and the legacy Inspector content in a glass card at Inspector geometry.
      - It renders full-bleed at layer 0, without App chrome: no topbar, example picker, Classic/Spatial selector, `world-controls`, `world-access`, Guided toggle or event chips.
      - It is temporary and replaced in 5.7.
    - `src/timeline/timelineStore.ts` is minimal for now. It holds cursor, liveHead, lens, playing and speed over the existing pure `src/playback/playbackState.ts`. It is the single semantic applied-prefix cursor source shared by Shell surfaces and the interim World, including valid cursor 0; raw accepted boundaries map through completed normalizer emissions. It is completed in 6.1.
    - `src/qa/qaBridge.ts` sets `window.__ggjavaezQA` only with `?qa=1` in dev or preview builds, or with `VITE_QA=1`. It exposes `appState()`, `cursor()`, `shellRects()`, `cameraPose()`, `select(id)` and `scene()`.
      - `scene()` returns semantic facts of the presented World (frames, objects, classes, cells, references), keyed by semantic frame, object, slot and `ref:<slotId>` ids, with status, values and selection.
      - It is compiled out of production otherwise.
    - Add `src/shell/Shell.test.tsx` covering layer order and a single canvas host.
    - _Requirements: 1.20, 2.1, 2.17, 2.19, 30.10_
    - _Design: Components §2; §20; §23 (QA bridge); Migration and Deletion Plan step 3_

  - [ ] 3.2 Build the Header, Mode_Bar, Run cluster and AppState badge
    - Create `src/shell/Header.tsx`, `ModeBar.tsx`, `RunCluster.tsx`, `AppStateBadge.tsx` and `src/state/useAppState.ts`.
      - `useAppState` gathers inputs from executionStore, debugStore and timelineStore, plus the legacy navigation Focus state until 5.3. It memoizes `deriveAppState`.
    - The Header has:
      - the brand: an isometric cube of 36–44 px, "GGJavaEZ" at 0.024 H weight 600, and a muted subtitle of at least 12 px;
      - the AppState icon and label, committed in the same React commit as the input change (≤ 100 ms);
      - a BUILDING progress indicator;
      - a slot for "Source changed since this run".
    - The Run cluster has Run, Debug, Stop and a launch-configuration control. The whole cluster is at most 0.18 W, and a long launch name is truncated with an ellipsis and a tooltip.
    - The Mode_Bar has Explore, Focus, Trace and Home as `aria-pressed` toggles, with exactly one pressed. It is bound to the legacy navigation mode until 5.3.
    - Disabled controls use `aria-disabled="true"` and show their reason as a tooltip and through `aria-describedby`.
    - Add the `src/shell/styles/header.css` partial and `src/shell/Header.test.tsx`.
    - _Requirements: 1.3, 1.23, 2.2–2.8, 6.3, 24.4, 27.6, 27.12_
    - _Design: Components §2 (Header details); §1_

  - [ ] 3.3 Rebuild the Source_Panel around Monaco with runtime source synchronization
    - `src/shell/source/SourcePanel.tsx` is a floating glass panel.
      - Its sizes come from `computeShellLayout`.
      - Width and height animate over 400 ms from the in-flight size, calling `editor.layout()` every frame. `saveViewState()`/`restoreViewState()` run on completion. Reduced motion applies the final size in one frame.
      - It has Expand Source and Collapse Source controls, with the Escape rule of 3.6.
      - It shows "Java language features unavailable", "Recorded source" and "No project source" indications.
    - `src/shell/source/sourceSync.ts` is a pure policy:
      - `sourceTargetFor` uses the priority FOCUS > paused at Live_Head > HISTORY > executing;
      - throw lines get an extra exception marker;
      - scroll policies are middle-third (once per pause), reveal and none;
      - executing-line follow is suppressed for 2 s after a manual scroll;
      - `firstVisibleLineForMiddleThird`;
      - the "Source changed since this run" flag compares recorded hashes with drafts using a debounced `sourceSha256`, and feeds the Header.
    - `src/shell/source/RecordedSourceView.tsx` shows the recorded text read-only when the hashes differ and leaves the draft untouched. It absorbs `src/ui/SourceEditor.tsx`.
    - Update `src/ide/EditableJavaEditor.tsx`, `src/ui/monacoSetup.ts` and `src/language/monaco.ts`:
      - a reference-matched theme: blue keywords, amber types, near-white identifiers, muted line numbers;
      - JetBrains Mono at 0.016 H with a 0.029 H line height, updated when H changes;
      - decorations: the execution bar (`#3FD8FF`, 18 % fill, 1.5 px border), the history dashed outline with "⟲", paused "❚❚", and exception red "!";
      - Breakpoint glyphs: resolved is a filled circle, unresolved a hollow diamond;
      - Monaco is lazy-loaded on first Editor display.
    - The panel stays a flat DOM element with no 3D transform (D11), so pointer-to-caret mapping stays exact.
    - _Requirements: 3.1–3.19, 7.4, 7.8, 7.12, 19.8, 25.1, 31.13, 32.9_
    - _Design: Components §3 Source and runtime relationship; Key decision D11_

  - [ ] 3.4 Build the dialogs, the picker and the global keyboard dispatcher
    - `src/shell/dialogs/DialogFrame.tsx`: a focus trap that focuses the first element, cycles Tab and Shift+Tab inside, closes only the topmost surface on Escape, and returns focus to the opener or the Editor.
    - Add `UnsavedChangesDialog.tsx` (Save, Don't Save, Cancel), `DeleteConfirmDialog.tsx` (affected dirty files, or "no unsaved files"), `PathInputDialog.tsx` (inline validation errors), `DirtyRunDialog.tsx` (Save All and Run, Cancel) and `LaunchConfigDialog.tsx`, which replaces `src/ide/LaunchDialog.tsx` (main class from classes that declare main, arguments, working directory).
    - `src/shell/picker/Picker.tsx` is one component for Quick_Open, Command_Palette and workspace symbol search.
      - Quick_Open uses `src/ide/fuzzy.ts`, with exact file-name matches first, up to 5,000 files and ≤ 200 ms.
      - The Command_Palette shows category, title, shortcut via `formatShortcut`, and availability. Disabled items stay listed with `aria-disabled` and their reason.
      - Enter or click executes once. Escape restores focus.
    - `src/shell/keyboard.ts` is the global handler. It matches by physical `code` and exact modifiers (`matchesShortcut`), calls `preventDefault()` only for registered chords, consumes a disabled command's chord without running it, and lets unbound chords through.
    - Add the `src/shell/styles/dialogs.css` partial.
    - _Requirements: 4.9, 4.13, 4.14, 4.17–4.19, 5.1–5.6, 5.13, 5.15, 5.16, 6.1, 6.2, 6.14, 31.15_
    - _Design: Components §4 (Picker, shortcuts); §21 (Dialog focus)_

  - [ ] 3.5 Rebuild the Tab_Bar, Explorer drawer and context menus
    - `src/shell/source/TabBar.tsx`:
      - one tab per open file, each with a dirty dot and a close button;
      - horizontal scroll, keeping the active tab scrolled into view;
      - a context menu (right-click, the ContextMenu key or Shift+F10) with Close, Close Others, Close to the Right, Close Saved, Rename, Reveal in Explorer and Copy Path;
      - dirty closes go through UnsavedChangesDialog.
    - `src/shell/source/ExplorerDrawer.tsx`:
      - wraps the `src/ide/ProjectExplorer.tsx` tree, with the persistent-panel styling removed;
      - anchored to the Source_Panel's left edge, 0.16–0.22 W, overlaying the World with no canvas resize;
      - Alt+Shift+E toggles it; focus moves to the tree on open and returns to the Editor on close;
      - it closes on Run/Debug start and restores its EDIT-time state;
      - in the tree, Enter opens or toggles, F2 starts an inline Rename, and Delete opens the confirmation;
      - New Java Class creates the class through the preserved `classCreation.ts`.
    - `src/shell/source/validateEntryName.ts` rejects names that are empty, contain a separator, duplicate a sibling, or (for a class) are not a valid Java identifier.
    - `src/ide/contextMenus.ts`: the Explorer item menu is Open, New File, New Java Class, New Folder, Rename, Delete, Reveal in Explorer and Copy Path. "Rename Symbol" never appears in it.
    - `src/ide/commands.ts`: the `resource.rename` title becomes "Rename".
    - Add the `src/shell/styles/source.css` partial.
    - _Requirements: 4.1–4.20_
    - _Design: Components §4 Explorer, tabs, picker and commands_

  - [ ] 3.6 Build the Dock, its drawers, the status popover and the Time_Dock shell
    - `src/shell/dock/Dock.tsx` is the strip.
      - It has Console, Problems, Debug and Errors toggles with counts that update within 100 ms, plus a status summary naming the Language_Service status with a non-colour glyph.
      - At most one drawer is open. The drawer's top edge can be dragged; the height is clamped to 0.20–0.45 H and remembered for the session.
      - Drawers overlay the World with no canvas resize.
    - `ConsoleDrawer.tsx` hosts the existing `src/ui/ConsolePane.tsx`; virtualization arrives in 6.5. Move the ConsolePane styles into the `src/shell/styles/dock.css` partial.
    - `ProblemsDrawer.tsx`: rows show a severity glyph and text, the project-relative path, the 1-based line and column, and the full message. Activating a row opens the file at the line and column.
    - `DebugDrawer.tsx`: Breakpoints with file, line and status, plus the paused stack and variables exactly as the Debugger reports them.
    - `ErrorsDrawer.tsx` reuses the content of `src/debugger/ErrorExplorer.tsx`.
    - `StatusPopover.tsx` shows the JDK, the Language_Service status and reason, the build system and the recording limits. It closes on Escape or an outside click and returns focus.
    - `src/shell/time/TimeDock.tsx` is a floating glass surface at token geometry. It is bound to timelineStore and shows:
      - Play/Pause, ⌀ 0.062 H with a ring glow;
      - Step back and Step forward;
      - the caption "n / N" plus "Executing: <Event summary>", taken from the Recording;
      - a track region at 0.15–0.81 W, with the Milestone track arriving in 6.2;
      - the Lens indicator with Return to Live;
      - `t = <semantic prefix c>`; raw recorder sequences, if shown as diagnostic metadata, are labelled separately;
      - the speed selector (0.25x–4.0x, default 1.0x);
      - a settings button.
    - Add the `src/shell/styles/time.css` partial.
    - _Requirements: 2.10–2.17, 7.17, 23.1, 23.2, 23.4, 23.6, 27.1, 27.2, 27.4, 27.15_
    - _Design: Components §2 (Dock); §15 Time_Dock_

  - [ ] 3.7 Write property tests for source policy, naming, fuzzy matching and shortcuts
    - `src/shell/source/sourceSync.property.test.ts`:
      - **Property 9: Source target selection policy** — **Validates: Requirements 3.8, 3.9, 3.10, 3.11, 3.14, 7.8, 19.8**
      - **Property 10: Middle-third scrolling** — **Validates: Requirements 3.8**
      - **Property 11: Source changes are isolated from the World** — **Validates: Requirements 3.15, 3.16**. The SceneModel and plan revision assertions are added in 4.14.
    - `src/shell/source/validateEntryName.property.test.ts`: **Property 12: Explorer naming and Java class creation** — **Validates: Requirements 4.6, 4.13**
    - `src/ide/fuzzy.property.test.ts`: **Property 15: Fuzzy matching** — **Validates: Requirements 5.1, 5.3**
    - `src/shell/keyboard.property.test.ts`: **Property 16: Shortcut matching and dispatch** — **Validates: Requirements 5.15, 5.16**

  - [ ] 3.8 Switch `/` and `/examples` to the Shell and mount every surface
    - `src/shell/Shell.tsx` mounts the Header, Source_Panel with Explorer and Tab_Bar, Time_Dock, Dock with drawers and popover, picker, dialogs and the interim World, all at the `computeShellLayout` rectangles.
    - `src/main.tsx` renders `<Shell mode="ide">` at `/` and `<Shell mode="recordingViewer">` at `/examples`.
      - The recording viewer selects curated Recordings from the Header project menu, using `src/examples/catalog.ts`.
      - Monaco and the World load lazily.
    - World Structural_UI labels from `worldOrigin` are shown in the DOM overlay at layer 1: "Building…", "Previous run · source changed" and "Console execution · <support reason>".
    - The Shell part of the Run transition: the Source_Panel reaches RUN size and the Explorer closes 300–600 ms after the first Event. The camera part comes in 5.7.
    - Create the shared browser helpers `e2e/helpers/shell.ts` (Run, Debug, Stop, drawers, tabs, Explorer, palette, Quick_Open, Time_Dock) and `e2e/helpers/world.ts` (World observation through the QA bridge `scene()`, selection, Inspector reading). The lead serializes changes to these shared helpers and reconciles consumers. Feature-specific helpers go in their own files.
    - Done when build passes and a smoke spec opens `/` and `/examples` in the Shell.
    - _Requirements: 1.2, 1.20, 1.21, 2.17, 6.4–6.6, 6.10, 34.11_
    - _Design: Changed modules (`src/main.tsx`); Components §2, §5_

  - [ ] 3.9 Migrate the IDE and workspace browser specs to the Shell
    - Migrate `e2e/ide.spec.ts`, `workspace-m8.spec.ts`, `explorer-usability.spec.ts`, `commands-v12-p4.spec.ts`, `java-project-m9.spec.ts`, `m11-persistence.spec.ts` and `ide-recording-handoff.spec.ts`.
    - Keep every expected value. Record each changed locator (old locator → new locator, with the unchanged expectation) in `docs/checkpoints/reference-exact/migration/e2e-ide.md`.
    - Done when these specs pass against the real local server.
    - _Requirements: 34.12_

  - [ ] 3.10 Migrate the runtime and curated-recording browser specs to the Shell
    - Migrate `e2e/person.spec.ts`, `arrays.spec.ts`, `recursion.spec.ts`, `control.spec.ts`, `refinement.spec.ts`, `camera-controls.spec.ts`, `unified-m10.spec.ts`, `incremental-v12.spec.ts`, `spatial-shell-v12-p5.spec.ts` and `spatial-io-v12-p5.spec.ts`.
    - Assertions on the deleted Classic DOM (`.classic-runtime [data-slot-id]`, viewBox) move to the semantic World observation through `e2e/helpers/world.ts`, with the same ids and expected values. Camera assertions use `cameraPose()`.
    - Record the ledger in `docs/checkpoints/reference-exact/migration/e2e-runtime.md`.
    - _Requirements: 34.11, 34.12_

  - [ ] 3.11 Migrate the execution, debugger, coverage and audit browser specs to the Shell
    - Migrate `e2e/debugger-errors.spec.ts`, `real-visualize.spec.ts`, `coverage-v12-p4.spec.ts`, `provenance-v12.spec.ts`, `observer-saturation-v12.spec.ts`, `product-audit-m11_5.spec.ts` and `product-audit-capture.ts`.
    - Debug control steps use the registered shortcuts and Command_Palette commands (F5, F10, F11, Shift+F11, Shift+F5) until the Debug_Bar arrives in 6.6.
    - Record the ledger in `docs/checkpoints/reference-exact/migration/e2e-execution.md`.
    - _Requirements: 34.12_

  - [ ] 3.12 Migrate the torture and performance browser specs to the Shell
    - Migrate `e2e/torture-v12-p5_5.spec.ts`, `torture-details-v12-p5_5.spec.ts`, `torture-lifecycle-v12-p5_5.spec.ts`, `torture-motion-v12-p5_5.spec.ts`, `e2e/spatial-performance.ts`, `perf-e2e/browser-baseline.spec.ts` and `perf-e2e/incremental-v12.spec.ts`.
    - Keep `window.__VJ_RENDER_METRICS__` and the QA probe contracts.
    - Record the ledger in `docs/checkpoints/reference-exact/migration/e2e-torture.md`.
    - _Requirements: 34.9, 34.12_

  - [ ] 3.13 Delete the superseded IDE and App shell chrome
    - Delete these files and every import of them:
      - `src/ide/IdeWorkspace.tsx`, `src/ide/ide.css`, `src/ide/ProjectExplorer.css`, `src/ide/TraceInspector.tsx`, `TraceInspector.css`, `TraceInspector.test.tsx`;
      - `src/ide/WorkspaceMenu.tsx` (folded into the Header project menu) and `src/ide/LaunchDialog.tsx`;
      - `src/ide/spatialShell.test.tsx`, superseded by the Shell tests;
      - `src/app/App.tsx` and `src/app/styles.css`;
      - `src/ui/SourcePane.tsx`, `src/ui/SourceEditor.tsx`, `src/ui/runtimeOptions.ts`, `src/ui/timeline/Timeline.tsx`, `Timeline.css` and `src/ui/ConsolePane.css`;
      - `src/debugger/DebugPanel.tsx` and `src/debugger/debugger.css`.
    - Done when:
      - a repository grep finds no `ide-activity-rail`, `ide-project-panel`, `ide-bottom-panel`, `ide-status-line`, `ide-runtime-ready`, `world-controls`, `world-access`, `world-hint`, `event-chip` or `representation-bar` in `src/`;
      - exactly one Shell is routed;
      - the affected integration checks pass; the milestone full gate runs at its boundary.
    - _Requirements: 2.17, 34.10_
    - _Design: Deleted modules; Migration and Deletion Plan step 3_

  - [ ] 3.14 Checkpoint — R2
    - Milestone A full gate: typecheck, lint, build, full configured unit/property suite and affected migrated IDE/shell browser scenarios. Review shell/source captures through early A QA scaffolding before cutover/deletion.

- [ ] 4. R3 — Stack, Heap and world reconstruction
  - [ ] 4.1 Implement the LayoutEngine and its occupancy index
    - `src/world/occupancy.ts` is a bucketed AABB grid generalized from the current builder. It keeps separate stack and heap reservation indexes.
    - `src/world/layoutEngine.ts` provides `createLayoutEngine(tokens)`, `append(events, from)` and an immutable `LayoutState` over persistent records from `src/runtime/storage.ts`.
    - §7.1 Stack:
      - Frame height is fixed at entry: 1.0 + 0.3 + 0.72 × clamp(receiver + parameters + 3, 2, 11).
      - Root Frames form a deck with fronts stepping by 1.45.
      - A first callee goes 0.10 below its caller's bottom and 1.25 back in −Z.
      - Later siblings form a +Z History_Deck. Collisions advance by 1.45.
      - The hero stack band targets x ∈ [−2.4, 2.4] and top ≤ 0; scalable reservation/preview rules handle wider signatures and deeper worlds without overlapping semantic regions or moving established anchors.
      - Call-site and entry Ports sit on the left; return Ports on the right.
    - §7.2 Heap:
      - Ownership is decided at first record only.
      - Each type gets a column, with column pitch = width + 2.4.
      - Each column has 3 tiers per page; pages advance in +Z.
      - Library and JDK summary blocks (4.2 u) sit behind every project back face.
    - §7.3 Arrays: presented tray slots use C(c) = clamp(first length, 4, 16), with an 8-row reservation when n > 128. Keep canonical array/index identity separate from reusable presented slots; do not reserve a permanent physical coordinate for every virtualized index. Collection blocks reserve 12 × 2 entries.
    - §7.4 Class_State: a scalable non-overlapping shelf region, above both headings in the hero composition.
    - §7.5 I/O: rail anchors in the corridor between Stack and Heap.
    - §7.6 Scopes: lexical scopes are row annotations only and create no anchors.
    - §7.7: scalable region heading anchors plus viewport-aware presentation/framing; headings never require fitting the whole unbounded world at readable size.
    - Every entity gets a `clusterPath` from the §10.2 table.
    - The engine never reads source text, the camera, the Cursor or the plan. It serves JVM and curated Recordings alike.
    - Add `src/world/layoutEngine.test.ts` with examples: a constructor called from main, a recursion chain, siblings, two heap types, a library object, a ragged array, statics and I/O.
    - _Requirements: 8.1, 8.4–8.8, 9.1, 10.1, 11.1, 11.4–11.8, 12.1, 13.1, 13.3, 14.1–14.3, 14.6, 26.9_
    - _Design: Components §7 Layout Engine (7.1–7.7); Key decisions D3–D5; Clarifications C1, C8, C9_

  - [ ] 4.2 Write property tests and the Presentation_Golden for the LayoutEngine
    - `src/world/layoutEngine.property.test.ts`:
      - **Property 20: Stack placement rules** — **Validates: Requirements 8.1, 8.4, 8.5, 8.6, 9.1, 11.1**
      - **Property 21: Frame anchors depend only on the call tree** — **Validates: Requirements 8.7, 10.1**
      - **Property 22: Anchors are append-only** — **Validates: Requirements 8.8, 11.4, 11.5, 11.7, 14.3, 22.7, 22.12, 23.5, 24.1**
    - `src/world/layoutEngine.heap.property.test.ts`:
      - **Property 23: Heap columns and library sub-region** — **Validates: Requirements 11.6, 11.8, 12.1, 14.1, 14.2**
      - **Property 24: Region separation** — **Validates: Requirements 13.1, 26.9**
    - Add `tests/golden/layoutEngineGolden.json` and `tests/golden/layoutEngineGolden.test.mjs`. The golden covers the curated Recordings (`src/examples/traces.ts`) and is written with `VJ_WRITE_GOLDEN=1`. Add a review record (file, reason, reviewed difference) to `docs/checkpoints/reference-exact/migration/presentation-goldens.md`.
    - _Requirements: 34.12_

  - [ ] 4.3 Implement value text, Java type display, frame titles and frame status
    - `src/world/valueText.ts` implements the design value table:
      - primitives exactly as recorded, including NaN, ±Infinity, −0.0 and escaped chars;
      - Strings quoted with Java escapes, bounded face previews of the first 48 recorded chars + "…" when longer, with " (n chars)" only when total length is recorded; distinguish display truncation from recorder truncation and show `""` only for observed empty content;
      - `null` with no chip;
      - reference chips `<Type> #id`, collections `List · size n #id`, arrays `int[n] #id`;
      - the `⟨not recorded⟩` marker;
      - the 28-char middle ellipsis for Frame text, with face and exact forms.
    - `src/world/displayType.ts`: retain the canonical binary name/descriptor unchanged, including `$`, and separately format display labels such as `Outer.Inner` and `int[][]`, with generics only when recorded. Display text is not a reversible canonical identifier.
    - `src/world/frameTitle.ts`: `Type.method(T1, T2)`, constructors named after their type, and static initializers identified.
    - `src/world/frameStatus.ts`: running, paused, returning, returned, threw, unwound, caught and terminated, with "line N" and exception simple names, from RuntimeState, the Cursor Event and `ProjectionContext`.
    - Add `src/world/valueText.test.ts` with edge-case examples.
    - _Requirements: 8.9, 8.10, 8.13, 9.2, 9.3, 9.9–9.11, 9.14, 12.2, 12.3, 12.7–12.10, 28.9, 33.9_
    - _Design: Data Models › Value text rules; Components §8 (Frames status)_

  - [ ] 4.4 Write property tests for value text, titles, types and frame status
    - `src/world/frameStatus.property.test.ts`: **Property 28: Frame status is unique and correct** — **Validates: Requirements 6.13, 7.7, 8.9, 8.10, 8.13, 9.11, 24.2**
    - `src/world/frameTitle.property.test.ts`: **Property 29: Frame title and identity** — **Validates: Requirements 9.2, 9.3**
    - `src/world/valueText.property.test.ts`:
      - **Property 30: Value text is exact and unambiguous** — **Validates: Requirements 9.9, 9.10, 12.7, 12.8, 12.9, 12.10, 28.9**
      - **Property 31: Truncation preserves identity** — **Validates: Requirements 9.14, 12.3**
    - `src/world/displayType.property.test.ts`: **Property 32: Canonical JVM identity and separate display type labels** — **Validates: Requirements 12.2, 33.9**

  - [ ] 4.5 Implement the incremental SceneProjector (SceneModel v2)
    - `src/world/sceneProjector.ts` provides `createSceneProjector(trace)`.
    - `project()` serves seeks with WeakMap leaf caches keyed by immutable `RuntimeFrame`, `RuntimeObject` and `RuntimeClass` records.
    - `advance()` serves live and step updates. It computes the touched set from the events in range (frameId, objectId, classId, sourceSlot owners, new graph-edge owners, previous and new top frames), replaces only those nodes in persistent records, and keeps ordered id lists append-only.
    - Projection rules:
      - Frame rows are ordered `this`, parameters, then locals by first assignment. A local row exists only when its first assignment is at or before the Cursor. Each Frame carries its status and `sourceLine`.
      - Object titles use Java source form. Field groups are ordered from the most distant superclass. Field writes at the Cursor set the mutation marker.
      - `SceneArray` cells use `arrayElementSlotId` and exact recorded observations; explicit observed allocation defaults may be shown, but late or unobserved cells remain unavailable/partially observed, never guessed as Java defaults.
      - Class shelves show statics written at or before the Cursor.
      - There is one `SceneReference` per non-null reference slot whose target exists.
      - Call links require graph call evidence, or `callerFrameId` for graphless curated Recordings.
      - I/O summaries come from `graphIoSummaries` or `consoleIoSummaries`.
      - The projector also produces `cursorEvent`, `liveStack` and introducing/changing evidence using the corrected semantic ordinal-to-prefix mapping; retain raw sequence provenance separately.
      - The Cursor stays in [0,N] and is clamped to the accepted semantic prefix mapped from completed normalizer emissions; `lastRecordedSeq` is raw metadata, never a history cursor.
    - Collections are projected as plain objects until 7.2. Return flows come in 7.3 and the exception path in 6.7.
    - Secondary indexes (inbound references, one-hop neighbours) are lazy and memoized per revision.
    - The legacy `src/world/sceneModel.ts` stays untouched for the interim World.
    - Add `src/world/sceneProjector.test.ts` with examples over the curated Recordings.
    - _Requirements: 6.8, 8.11, 9.4–9.6, 11.9, 12.4, 12.11, 12.12, 13.3, 13.4, 13.6, 14.3, 14.4, 16.11, 26.9, 26.10, 27.13, 32.10, 33.1, 33.2, 33.5, 33.8_
    - _Design: Components §8 SceneModel and projection; Data Models › SceneModel v2_

  - [ ] 4.6 Implement the FlowCatalog
    - `src/world/flowCatalog.ts` provides `extend`, drawable `query`/`bundles`/`atEvent`, and independent recorded-evidence `recordedProvenanceOf`, plus `drawableFlowsOf` as named in the corrected design. Implement all semantic owner/endpoint indexes in the corrected task interpretation above.
      - Flow ids are stable: `${edgeEventId}:${edgeId}`.
      - Edge kinds map to argument, receiver, local-field, assignment, reference, array-read, array-write, return, input, output, throw, unwind and catch. `COMPUTE`, `OBSERVE` and file edges produce no Flow.
      - A drawable SceneFlow is eligible only when evidence is in the applied semantic prefix and both presented endpoint mappings are valid. No substitute endpoints are invented. Provenance remains queryable without a drawable SceneFlow, including COMPUTE/OBSERVE/file evidence where recorded.
      - Optional tiered candidate retrieval uses the 128-edge tail bound; indexed retrieval of mandatory selected/focused/current evidence bypasses that tail, retaining priority/overflow guarantees and all recorded provenance.
      - Bundle keys are assigned at ingest, and counts are found by binary search, with the `variableLifetimes` correction.
    - Export `graphTransition` from `src/motion/semanticTransition.ts`. This is an export only; the derivation is unchanged.
    - Add `src/world/flowCatalog.test.ts` covering the edge-to-flow kind table.
    - _Requirements: 17.1–17.9, 21.3, 21.4, 26.11–26.13_
    - _Design: Components §9 Flow catalog; Key decision D6_

  - [ ] 4.7 Write property tests for the SceneProjector
    - `src/world/sceneProjector.property.test.ts`:
      - **Property 25: Projection agrees with RuntimeState** — **Validates: Requirements 9.4, 9.5, 9.6, 13.3, 13.6, 14.3, 14.4, 15.1, 15.2, 15.6, 15.9, 24.3, 25.6**. The collection clauses are added in 7.4.
      - **Property 26: Incremental projection equals full projection** — **Validates: Requirements 6.8**
      - **Property 27: Evidence traceability and recording boundary** — **Validates: Requirements 11.9, 27.13, 27.18, 33.1, 33.2, 33.5**

  - [ ] 4.8 Write property tests for references, call links and flows
    - `src/world/sceneReferences.property.test.ts`:
      - **Property 35: References, Ports and Connectors** — **Validates: Requirements 9.8, 12.7, 13.4, 13.5, 13.8, 14.5, 15.3, 15.5, 16.11**. The collection and cluster clauses are added in 7.4 and 9.4.
      - **Property 36: Call links require call evidence** — **Validates: Requirements 8.11**
    - `src/world/flowCatalog.property.test.ts`:
      - **Property 41: Flows are ExecutionGraph edges** — **Validates: Requirements 17.1, 17.3, 17.4, 17.5, 17.7, 26.11, 26.12, 26.13**
      - **Property 42: Flow priority under budget** — **Validates: Requirements 17.9**
      - **Property 43: Recorded provenance survives absent drawable flows** — **Validates: Requirements 17.6**

  - [ ] 4.9 Implement the presentation planner v1 and connector routing
    - `src/world/budgets.ts` is a frozen typed copy of `tokens.world.budgets`.
    - `src/world/presentationPlanner.ts` provides `planPresentation(input, previous)`:
      - the pinned set Π of §10.2, item 2;
      - detailed faces in corrected priority order, reserving mandatory entities first; optional capacity max(0,B−M), reported mandatory overflow max(0,M−B), for Frame, Heap_Object and shelf targets;
      - quiet volumes up to the quiet budget;
      - optional overflow counted in `accounting.clustered`, pending the cluster cut in 9.2; mandatory overflow stays presented and is reported separately, never falsely counted as hidden/clustered;
      - Connectors and call links by corrected priority/mandatory-overflow rules, with optional context reduced first;
      - base emphasis opacities (§10.4 base row; historical Frames 0.45; unattached Connectors ≤ 0.35; attached ones at 3.5 px);
      - exactly one execution halo;
      - the STACK, HEAP and CLASS STATE headings, with CLASS STATE present iff a shelf is presented;
      - Structural_UI text, including the empty-World prompt;
      - framing sets;
      - memoization on scene revision, Selection, Focus, Trace, Detail_Level and view tile.
      - Detail_Level is an input here; the thresholds come in 9.1.
    - `src/world/faceRows.ts` decides face rows per Detail_Level: FAR shows none; MEDIUM shows 4 rows as `name → value`; CLOSE shows the grid up to capacity, then "+N more".
    - `src/world/connectorRouting.ts`:
      - the destination face is the one whose centre is nearest the origin;
      - curves have a continuous tangent;
      - only the 48 obstacles nearest the straight segment are considered, memoized per endpoint pair;
      - if no clear path exists, the Connector still attaches at both Ports.
    - _Requirements: 8.11, 8.12, 9.12, 9.13, 11.10, 11.11, 12.4–12.6, 13.2, 16.1–16.4, 16.6–16.9, 22.5, 22.6, 29.19_
    - _Design: Components §10 (10.1, 10.2 pinned set, 10.4, 10.5); Data Models › PresentationPlan_

  - [ ] 4.10 Write property tests for face rows and connector geometry
    - `src/world/faceRows.property.test.ts`: **Property 33: Face rows by Detail_Level** — **Validates: Requirements 9.12, 9.13, 12.4, 12.5, 12.6, 12.11, 15.4, 22.5, 22.6**
    - `src/world/connectorRouting.property.test.ts`: **Property 40: Connector geometry and routing** — **Validates: Requirements 16.1, 16.2, 16.8, 16.9**

  - [ ] 4.11 Build the World renderer host and the base material set
    - `src/render/WorldCanvas.tsx` mounts one R3F `<Canvas>` for the application lifetime:
      - `frameloop="demand"`, with `dpr` taken from the tier;
      - `gl` options `antialias: false`, `powerPreference: 'high-performance'`, `alpha: false`;
      - `camera={{ fov: 36 }}`;
      - invalidation on plan revision, pose change and overlays.
      - A provisional camera holds the fixed Hero angles fitted to layout bounds until the CameraRig arrives in 5.2.
    - `src/render/WorldScene.tsx` maps the plan to primitives. Primitives receive plain records and never read stores.
    - `src/render/picking.ts`:
      - raycasts only pickable instances;
      - detects Connector hover by screen-space polyline distance;
      - treats a press and release within 4 px of travel as a click.
    - Add `src/render/metrics/FrameProfiler.tsx` and `RendererMetrics.ts` as the new home for the probes. `window.__VJ_RENDER_METRICS__` and the `__VJ_QA_*` contracts are kept, and the legacy `src/scene` files re-export from here until 13.1.
    - `src/render/materials/materialFactory.ts` is the only place materials are created. It defines the MaterialRole table with the INTERACTIVE base set; CINEMATIC is added in 8.1.
    - `src/render/materials/palette.ts` holds the palette.
    - _Requirements: 2.1, 16.13, 19.1, 29.2, 32.3, 32.4_
    - _Design: Components §19.1, §19.3 (role table); §22; Key decision D7_

  - [ ] 4.12 Build the FrameSlab, ObjectBlock, ClassShelf, Port and face text primitives
    - `src/render/geometry/roundedBox.ts` is an instanced rounded-box geometry whose vertex expansion keeps the 0.10 u bevel.
    - `src/render/primitives/FrameSlab.tsx`:
      - an acrylic slab with an opaque face plate;
      - a header with signature, `#n` and a status chip;
      - a `name | type | value` grid with inset chips;
      - Ports on non-null reference chips;
      - the execution halo.
    - `ObjectBlock.tsx`:
      - title and `#id`, with the identity never truncated;
      - field rows grouped by declaring class;
      - reference chips with Ports;
      - the mutation highlight `#FFC857` with "✎".
    - `ClassShelf.tsx`: a teal shelf with the class name and static rows.
    - `Port.tsx`: instanced 0.16 u glowing dots.
    - `src/render/text/FaceText.tsx`: troika `BatchedText` grouped by compatible font/weight/material/opacity, with token sizes and explicit readiness/disposal hooks. Complete cache prewarming and lifecycle in 8.3. The full typography system comes in 8.3.
    - Bodies, faces, chips and edges are instanced per material role.
    - _Requirements: 8.9, 8.12, 9.1–9.8, 9.12, 9.13, 12.1, 12.3–12.7, 12.11, 12.12, 13.2, 13.3, 29.2, 29.3_
    - _Design: Components §19.2 Primitive set_

  - [ ] 4.13 Build the ConnectorBatch, RegionHeading, StructuralText, IoPort and base Floor/Environment primitives
    - `src/render/primitives/ConnectorBatch.tsx`:
      - two merged `LineSegments2` batches: an 8 px halo and a core of 2.5 or 3.5 px, in pixel width, with per-vertex colour and custom alpha attributes/shader (or bounded opacity batches), since ordinary line material does not guarantee curve-varying alpha;
      - depth-tested, so occluded segments are hidden;
      - instanced end dots, with arrowheads only on object-object, return and exception curves;
      - kind colours: cyan, violet, teal, amber, and red, with exception red taking precedence over return amber;
      - at most 6 draw calls in total.
    - `RegionHeading.tsx` and `StructuralText.tsx`:
      - uppercase, 0.18 em tracking, glow, 0.45 u cap height;
      - a Structural_UI style distinct from entity titles, with no Ports.
    - `IoPort.tsx`: a glass port showing a count and a preview glyph.
    - `Floor.tsx`: a dark floor with a 1 u minor / 4 u major grid shader kept below the bloom threshold. The reflector comes in 8.2.
    - `EnvironmentRig.tsx`: the background gradient `#080C20` → `#03050C` and haze sprites. Lightformers come in 8.2.
    - Empty-World presentation: 45 % opacity plus "Run your Java program to enter the World".
    - _Requirements: 8.3, 11.3, 13.2, 16.3–16.5, 16.7, 26.8, 29.1, 29.5, 29.19, 33.3_
    - _Design: Components §19.2, §19.5_

  - [ ] 4.14 Wire the v2 projection pipeline into the stores and the World scene
    - `executionStore` creates one LayoutEngine, SceneProjector and FlowCatalog per WorldSource (session, prior or curated recording). They are appended on ingest, sliced by `yieldTraceWork`, and published at most once per animation frame.
    - Add `src/world/useWorldPlan.ts`: the SceneModel at the timelineStore cursor, then the plan.
    - `src/render/WorldScene.tsx` mounts every primitive from 4.12 and 4.13.
    - The QA bridge `scene()` switches to SceneModel v2 with the same semantic ids, so the e2e helpers keep their contract. Any change to an expected value must be a deliberate presentation-format change, recorded in the migration ledger. Semantic values do not change.
    - A `?qa=1&world=v2` preview in `Shell.tsx` mounts WorldCanvas in place of InterimWorld for in-browser checks. It is removed in 5.7.
    - Extend the Property 11 test: draft edits leave the SceneModel and plan revisions unchanged.
    - Done when:
      - affected integration/browser checks pass;
      - the preview renders every curated Recording and a real run of `fixtures/torture-v12-p5_5/01-text-and-fields`;
      - `tests/perf/world-projection.test.mjs` passes with `VJ_SUITE=perf` explicitly set so configuration cannot exclude it.
    - _Requirements: 1.20, 3.15, 6.8, 23.5, 32.10_
    - _Design: Data flow ExecutionSession → World; Components §5, §8; Migration and Deletion Plan step 4_

  - [ ] 4.15 Checkpoint — R3
    - Milestone B full gate: static/build/unit/property/layout-golden checks, affected world/browser scenarios, world-projection performance checks and hero overview/event/inspection comparison through B QA. Prove genuine depth, stable identity and recorded-value bounds before C/D.

- [ ] 5. R4 — Selection, Focus, Home, Trace and camera
  - [ ] 5.1 Implement the camera math: store, poses, Safe_Frame fitting, constraints and Home framing
    - `src/camera/cameraStore.ts` holds:
      - the mode (EXPLORE, FOCUS, TRACE, or HOME while Home travel runs);
      - `follow`, `pose`, `move`, `detailLevel` and `viewTile`;
      - the intents explore, home, focus, exitFocus, enterTrace, followPath and userInput.
    - `src/camera/poses.ts` holds the camera tokens:
      - vertical FOV 36° in every class and tier;
      - Hero yaw +8°, pitch −13°;
      - Focus yaw ±21° (on the side with more neighbours, ties to the stack side), pitch −8°;
      - the recursion pose constants;
      - the Focus pose solver with clarification C2.
    - `src/camera/projection.ts`: `fitToSafeFrame` with two refinement passes and a final containment check, plus projected-bounds helpers.
    - `src/camera/cameraConstraints.ts` is the new home of the collision boxes. The legacy `src/navigation` module re-exports from it until 13.1. It clamps pitch to [−80°, −2°] and distance to [1.5, max(1.5, 3 × World diagonal)], and clamping is idempotent.
    - `src/camera/homeFraming.ts`:
      - frames the headings, the live or most recently entered Frame, and up to 12 project and 2 external group representatives, each at ≥ 0.04 H;
      - with an empty World, frames only the headings;
      - for a completed World, treats no Invocation as active.
    - _Requirements: 19.5, 20.1, 20.10, 20.11, 20.13, 24.8, 30.8_
    - _Design: Components §12 Camera ownership and Home; Clarification C2_

  - [ ] 5.2 Implement the CameraRig and guided moves
    - `src/camera/CameraRig.tsx` is mounted inside the Canvas and is the only camera writer.
      - Input mapping: primary drag orbits; secondary drag, Shift+drag or a two-axis pixel wheel pans; a line wheel, a large wheel delta or ctrl+wheel (pinch) zooms.
      - Keyboard works only while the World has focus: arrows orbit 5°, Shift+arrows pan, and `+`/`-` zoom by ×0.9/×1.1.
      - Any user input cancels a Guided_Move within one frame, continuing from the interpolated pose.
      - User input turns Follow off until it is re-enabled.
      - Follow moves happen on entry, allocation, throw and major-mutation Events, only when the subject lies outside the Safe_Frame.
      - While process execution is active and Follow remains explicitly enabled, the executing Frame is kept inside the Safe_Frame; Free Explore/user input always overrides framing, including partial recording and debugger contexts.
      - The Run transition camera move lasts exactly 600 ms and ends at the Hero_Pose (C10).
      - On a debug pause, the rig frames the paused Frame.
      - Reduced motion applies the destination pose in one frame.
      - It invalidates demand rendering.
    - `src/camera/guidedMoves.ts`: `easeInOutCubic`, durations of 600–1200 ms, Follow-path waypoints, and a cluster-travel hook (used in 9.3).
    - Replace the provisional camera from 4.11.
    - _Requirements: 6.6, 6.9, 7.9, 20.2–20.9, 21.6, 21.7, 31.11_
    - _Design: Components §12 (Guided_Moves, Follow, Input mapping); Clarification C10_

  - [ ] 5.3 Implement Selection, Focus and Trace interaction with the navigation commands
    - `src/interaction/interactionStore.ts` holds the Selection, the Focus target, a `preFocus` pose and mode stored once, Trace active and scope, and hover.
    - Focus presentation in `src/world/presentationPlanner.ts`:
      - the target is shown at CLOSE;
      - mandatory correctness/selection/current neighbours are retained first with reported overflow; up to 6 optional deterministic neighbours are kept, ordered by Connector kind priority then first record;
      - everything else drops to ≤ 0.25 opacity;
      - an absent target shows "Not present at this point in time" at its anchor.
    - `src/world/traceEmphasis.ts`:
      - Relevant, Current and All scopes, using mandatory priority/overflow rules and keeping recorded provenance visible structurally when no drawable flow exists;
      - All uses `FlowCatalog.bundles`;
      - non-endpoints drop to ≤ 0.40;
      - emphasis is part of the plan, so it appears in the same frame as the state change.
    - `src/shell/TraceScopeControl.tsx` is a segmented control that selects Relevant on every entry into Trace.
    - In `src/ide/commands.ts` and `src/ide/shortcuts.ts`, add `navigation.explore`, `follow`, `focusSelection` (Alt+Shift+F, removing the `workbench.runtimeFocus` binding), `exitFocus`, `traceRelevant`, `traceCurrent`, `traceAll`, `followPath` and `home`, each with availability and a disabled reason.
    - `src/shell/ModeBar.tsx` is rebound to cameraStore, and Focus is the active button while FOCUS is present.
    - Escape precedence: dialog or palette first, then the Inspector, then Focus, then Trace.
    - _Requirements: 2.5, 2.6, 5.14, 19.1–19.14, 21.1–21.10_
    - _Design: Components §11 Selection and Focus; §13 Trace; §4 (new ShellCommandIds)_

  - [ ] 5.4 Write property tests for camera, Selection, Focus and Trace
    - `src/world/traceEmphasis.property.test.ts`: **Property 48: Trace scopes** — **Validates: Requirements 21.1, 21.2, 21.3, 21.9, 21.10**
    - `src/interaction/interactionStore.property.test.ts`, against a reference model: **Property 49: Selection and Focus model** — **Validates: Requirements 2.5, 19.1, 19.2, 19.3, 19.4, 19.6, 19.10, 19.12, 19.13, 19.14**
    - `src/camera/projection.property.test.ts`: **Property 51: Safe_Frame fitting** — **Validates: Requirements 6.9, 7.9, 10.2, 10.3, 19.5, 20.7, 20.10, 20.11, 24.8**. The recursion-framing clauses are added in 7.4.
    - `src/camera/guidedMoves.property.test.ts`: **Property 52: Guided moves yield to the user** — **Validates: Requirements 20.5, 20.6, 20.8, 20.9, 20.12, 21.6, 21.7**
    - `src/camera/cameraConstraints.property.test.ts`: **Property 53: Camera clamps and keyboard deltas** — **Validates: Requirements 20.3, 20.13**

  - [ ] 5.5 Build the Inspector card and the shared virtual list
    - `src/shell/inspector/inspectorModel.ts` is a pure `buildInspector(target, runtime, scene, graph, flows, cursor)` with one section per kind:
      - Heap_Object: fields, inbound references (count equals entries, holder names) and outbound references;
      - Frame: signature, caller, status, receiver, parameters, locals and return;
      - Class_State shelf, array, Array_Cell and collection;
      - Connector, Flow (kind, endpoints, evidence sequence numbers) and Cluster.
      - Values use exact recorded-content `valueText` mode, preserving OBSERVED/TRUNCATED/UNAVAILABLE/PARTIALLY OBSERVED markers and bounds; never restore unrecorded originals.
      - It shows the introducing and latest-changing evidence sequence numbers.
      - It shows "No recorded provenance" only when the independent recorded-evidence `recordedProvenanceOf` query is empty. When evidence exists without drawable endpoints, show it textually/structurally and label the unavailable spatial mapping.
    - `src/shell/inspector/InspectorCard.tsx`:
      - geometry from `computeShellLayout`;
      - the side is chosen only when the card opens or its target changes;
      - actions are Focus (Return to World while FOCUS is active), Reveal Source and Copy Value with exact recorded text and visible recording-bound metadata, each with Command_Registry disabled reasons;
      - Escape closes only the card;
      - in FOCUS, clearing the Selection keeps the card on the Focus target;
      - values refresh within 100 ms of a Cursor change, and an absent item shows "Not present at this point in time".
    - `src/shell/VirtualList.tsx` renders bounded-preview summary rows with total-count headings. Inspector mounts ≤200 rows TOTAL including ≤20 overscan; Console mounts viewport-visible rows plus ≤200 offscreen rows total. Every entry stays reachable; expanded wrapped recorded text uses a separate variable-height/detail view.
    - Add the `src/shell/styles/inspector.css` partial.
    - _Requirements: 17.6, 17.8, 22.11, 28.1–28.10, 33.2_
    - _Design: Components §18 Inspector; §17 (VirtualList)_

  - [ ] 5.6 Write property tests for the Inspector and virtualized lists
    - `src/shell/inspector/inspectorModel.property.test.ts`: **Property 50: Inspector completeness within recorded evidence bounds** — **Validates: Requirements 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.10**
    - `src/shell/VirtualList.property.test.ts`: **Property 59: Virtualized lists** — **Validates: Requirements 26.3, 28.8**

  - [ ] 5.7 Swap the Shell World layer to WorldCanvas, CameraRig and InspectorCard
    - `src/shell/Shell.tsx` mounts WorldCanvas with CameraRig at layer 0 and InspectorCard at layer 3.
    - Picking writes to interactionStore. Double-clicking an entity enters Focus. `useAppState` takes Focus from interactionStore.
    - The Run transition camera move, Follow and pause framing are wired.
    - Delete `src/shell/world/InterimWorld.tsx` and the `world=v2` preview flag.
    - Update only the Inspector and selection internals of `e2e/helpers/world.ts`.
    - Re-point `e2e/camera-controls.spec.ts` and `e2e/spatial-shell-v12-p5.spec.ts` to the CameraRig and Mode_Bar, keeping the same expected behaviour. Record the ledger in `docs/checkpoints/reference-exact/migration/e2e-world-swap.md`.
    - Done when affected integration/browser checks pass and the legacy `src/scene/**` and `src/navigation/**` are no longer imported by any routed module.
    - _Requirements: 1.20, 2.1, 6.6, 6.9, 19.1–19.3, 20.2, 28.1_
    - _Design: Migration and Deletion Plan step 5_

  - [ ] 5.8 Checkpoint — R4
    - Integration C: verify selection/Inspector/Focus/Home/Trace, free orbit/pan/dolly, user override and the World host swap with targeted camera/world browser scenarios. Full C gate is 6.10.

- [ ] 6. R5 — Time, I/O, debug and error behavior
  - [ ] 6.1 Complete the timelineStore and the commit-order pipeline
    - Move the pure `src/playback/playbackState.ts` to `src/timeline/playbackState.ts`. Legacy imports re-export it until 13.2.
    - `src/timeline/timelineStore.ts` adds `direction`, reverse play, `scrubbing`, `boundary` (accepted semantic-prefix clamp mapped from completed normalizer emissions for PARTIAL_RECORDING), Replay from empty prefix 0, click-to-nearest semantic prefix in [0,N], debug-command separation (Cursor and Lens unchanged) and the "Events after Cursor" count.
    - Commit order is: cursor → RuntimeState → SceneModel → plan → AppState, Shell, Inspector and Console → first frame → overlays. It is implemented in `src/world/useWorldPlan.ts` and `src/state/useAppState.ts`.
    - Register `workbench.returnLive` (Alt+Shift+L, available while HISTORY is active) in `src/ide/commands.ts`.
    - _Requirements: 1.15, 1.16, 1.19, 1.23, 7.11, 7.13, 7.14, 18.6, 23.2, 23.7–23.9, 23.12–23.14, 24.6, 24.7, 31.14_
    - _Design: Components §15 (TimelineState); Data flow (commit order)_

  - [ ] 6.2 Build the Milestone track and complete the Time_Dock
    - `src/timeline/milestones.ts` is an incremental `MilestoneIndex` over entry, return, allocation, exception, input and output Events.
      - `labelled(cursor, width, max)`: k = min(max, ⌊width / 110⌋) bins, each choosing the highest-importance then earliest milestone, with the current milestone substituted into its bin.
      - `density(width)` returns density ticks.
    - `src/shell/time/MilestoneTrack.tsx`:
      - 10 px nodes, labels at 0.015 H, and the current milestone ringed at 20 px in execution blue;
      - future nodes at ≤ 50 % opacity;
      - density ticks drawn on a canvas;
      - a `role="slider"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext`;
      - keys: Space, Left, Right, Home and End;
      - a PARTIAL_RECORDING boundary marker labelled with the Recording_Status and reason;
      - a debug paused-position marker at the Live_Head.
    - `TimeDock.tsx`:
      - the HISTORY badge with Return to Live, or the LIVE indicator;
      - settings for Replay, Reverse play, reduced motion and quality;
      - the "Events after Cursor" count during debug sessions;
      - direction controls disabled at a boundary;
      - with zero Events, everything disabled for assistive technology too, and no `t =`.
    - _Requirements: 7.12, 7.14, 23.1–23.4, 23.6, 23.10–23.14, 30.3_
    - _Design: Components §15 Time_Dock_

  - [ ] 6.3 Implement the TransitionPlayer, the virtual clock and FlowBatch overlays
    - `src/motion/clock.ts` uses `performance.now()` in production and a stepped virtual clock under the QA bridge (`clock.step(ms)`).
    - `src/motion/transitionPlayer.ts` wraps the preserved `deriveSemanticTransitions`:
      - steps come only from the crossed Event range and its graph edges;
      - constructor sequences expand in recorded order and stop at a throw;
      - per-kind durations in [250, 700] ms, divided by the speed;
      - at most 8 pending steps; overflow or a Live_Head lag > 750 ms drops them all and plays one settle of ≤ 250 ms;
      - user-initiated interruptions cut overlays within one frame (C4);
      - scrubbing produces no steps, and release plays one settle;
      - reduced motion produces static change highlights;
      - steps whose subjects are all culled or off-frustum are skipped.
    - `src/render/primitives/FlowBatch.tsx` draws provenance Flows as merged lines plus instanced travelling tokens. Entity pulses (≤ 2 cycles) and allocation scale-in (body only, anchor unchanged) are added to the primitives.
    - Mount it in `WorldScene.tsx`, sampled per frame with demand invalidation.
    - _Requirements: 17.2, 18.1–18.13, 31.11, 31.12, 31.14_
    - _Design: Components §14 Animation system; Clarification C4_

  - [ ] 6.4 Write property tests for the timeline, transitions and motion equivalence
    - `src/timeline/timelineStore.property.test.ts`, against a reference model: **Property 5: Timeline reducer invariants** — **Validates: Requirements 1.16, 7.13, 7.14, 23.2, 23.7, 23.8, 23.9, 23.12, 23.13, 24.7**
    - `src/timeline/milestones.property.test.ts`: **Property 57: Milestone labelling and timeline text** — **Validates: Requirements 23.3, 23.4, 23.11, 30.3**
    - `src/motion/transitionPlayer.property.test.ts`:
      - **Property 54: Transition derivation is evidence-bound** — **Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.13**
      - **Property 55: Transition queue discipline**, against a reference model — **Validates: Requirements 18.5, 18.6, 18.7, 18.8, 18.9, 18.10, 18.11, 18.12**
    - `src/motion/reducedMotion.property.test.ts`: **Property 56: Reduced-motion equivalence** — **Validates: Requirements 31.11, 31.14**

  - [ ] 6.5 Rebuild the Console drawer and the World I/O endpoints
    - `src/ui/ConsolePane.tsx` and `src/shell/dock/ConsoleDrawer.tsx`:
      - render exact recorded channel text and known within-stream order; use an ordered combined list only where actual `runEvents` or equivalent recorded ordering exists. Separate stdout/stderr snapshots have unknown cross-channel order and must not fabricate one. Recorder facts and process output are not blindly merged/deduplicated through `VirtualList`, with `Uint32Array` line offsets built incrementally;
      - mark stdin lines;
      - insert a truncation notice with an archive-download control where output was omitted;
      - when the independent input-wait dimension is active, including while recording has stopped, open the drawer and focus the input within 200 ms, and show "Program is waiting for input";
      - on submit, send the text plus exactly one `\n` (just `\n` when empty), then append and clear;
      - after process exit or stdin close, send nothing and show "Program is not accepting input".
    - SceneProjector I/O, `IoPort.tsx` and `presentationPlanner.ts`:
      - at most one endpoint per stream on the I/O rail;
      - stdout shows the exact line count in green with a 60-char preview, throttled to ≤ 10 updates/s with a 100 ms settle;
      - stdin shows consumed text only from consumed-input edges;
      - stderr uses `#FF8A5B` with "⚠";
      - value → stdout and stdin → value Flows appear at the Cursor Event within the budget;
      - there are never per-line cards.
    - _Requirements: 26.1–26.15_
    - _Design: Components §17 Runtime I/O and Console; §7.5_

  - [ ] 6.6 Build the Debug_Bar and the debug presentation
    - `src/shell/debug/DebugBar.tsx` is mounted in the Shell while a debug session is active.
      - Buttons: Continue (shown as Pause while running), Step Over, Step Into, Step Out and Stop.
      - Each dispatches the same command id as its shortcut.
      - Disabled steps show "Stepping requires a paused debugger".
      - Tooltips appear within 1 s.
      - The bar is centred on the Header within 2 px.
      - It hides within 300 ms when the session ends.
    - On pause, within 150 ms:
      - DEBUG source size, with the paused file active and line N in the middle third;
      - the paused Frame gets the execution halo and "Paused · line N".
    - In HISTORY during a pause, show the history-line style and the paused marker. The JVM stays suspended.
    - The Debug drawer shows the Debugger-reported stack and variables within 500 ms.
    - Breakpoint glyphs update within 500 ms of a resolution change.
    - Touches `src/shell/debug/DebugBar.tsx`, `src/workspace/debugStore.ts`, `src/shell/dock/DebugDrawer.tsx`, `src/world/presentationPlanner.ts` (paused halo) and `src/shell/Shell.tsx`.
    - _Requirements: 3.7, 3.8, 5.10, 5.12, 7.1–7.17_
    - _Design: Components §6 Debug presentation_

  - [ ] 6.7 Implement the exception path, the Forensic_State and the ExceptionPanel
    - `src/world/exceptionPath.ts` projects, for the latest relevant exception at the Cursor:
      - the throwing Frame;
      - the unwound Frames in recorded order;
      - the catching Frame or the uncaught endpoint;
      - the observed Throwable and recorded cause links, distinguishing derived and unavailable evidence;
      - the recorded stack lines and explicit bounds/unavailable evidence;
      - a `complete` flag only for evidence actually proven complete, never inferred from a truncated preview.
      - Reference overlays use exception > return precedence.
    - Planner:
      - "throws", "unwound" and "caught" status texts, with no Flow when the catch is in the throwing Frame;
      - the path clears at the Event after a catch;
      - Forensic_State at the final Event of an uncaught failure: the path at 100 %, everything else ≤ 0.40;
      - Frames on the path show values recorded at the throw;
      - an incomplete path is labelled and never drawn through unrecorded Frames;
      - one red Connector per recorded cause link with valid drawable endpoints; retain nondrawable cause evidence in textual inspection;
      - red `#FF4A5E` is exposed only through the `exception` material role.
    - `src/render/primitives/ExceptionPanel.tsx` is a red glass panel placed beside the throwing Frame without overlapping it. It shows the observed qualified class, recorded message ("message: null" only for recorded null, otherwise unavailable), up to the first 8 recorded stack lines and a truthful recorded remainder/bounds marker.
    - The Source_Panel shows a red marker on the throw line.
    - With Follow active, one move frames the throw site and the uncaught endpoint.
    - `ErrorsDrawer.tsx`: selection-only frame activation selects without changing Cursor/camera and reveals source, or marks the target unavailable. A separately labelled timeline navigation action explicitly seeks the recorded event’s semantic prefix; it never happens implicitly through selection.
    - A new session's first Event clears the Forensic_State.
    - _Requirements: 14.11, 25.1–25.14_
    - _Design: Components §16 Exception presentation and Forensic_State_

  - [ ] 6.8 Implement completion, partial recording, failure states and Prior_World behavior
    - COMPLETED keeps the same World.
      - Frames without a return transition to "terminated" at 35–55 % over 400–800 ms, or in one frame under reduced motion.
      - The Header shows the duration and the exit code or "Stopped by user".
      - Final values are shown at the last Event.
      - With HISTORY active, the Cursor is kept.
    - PARTIAL_RECORDING:
      - the Header shows "Partial recording · <reason>";
      - the Cursor is clamped to the accepted semantic prefix mapped from completed normalizer emissions, retaining valid empty prefix 0;
      - the Console continues to expose exact recorded channel content, including output recorded after the semantic boundary, with truncation and unknown cross-channel order disclosed;
      - recording limits/unsupported capture do not kill the JVM; Run stays disabled while it is alive, and Stop, input availability and debugger pause controls follow actual independent state.
    - Failure states:
      - compile: FAILED within 500 ms, the Problems drawer opens, and the Header shows "Build failed · n errors";
      - build: Maven and Gradle messages appear verbatim as Error rows and in the Console;
      - instrumentation: the reason is shown, with a Run Without Visualization action;
      - launch: "No runnable main method · <class>" (or "No main class is configured"), with an action that opens the launch configuration;
      - debugger launch failure: no Debug_Bar.
    - Prior_World after a failed build: retain its full execution identity, trace/history/prefix revision, Cursor, anchors/layout, Lens/zoom, Selection, valid Focus, source bindings and Console association; label "Previous run · source changed", with movable Cursor and untouched drafts. Failed-build state stays associated with the new attempt, and session/prefix keys reject stale publications.
    - Diagnostics never become World content.
    - Safety text: Java runs locally and unsandboxed, and Maven and Gradle can run build logic.
    - Touches `src/workspace/executionStore.ts`, `src/state/appState.ts`, `src/shell/Header.tsx`, `src/shell/dock/ProblemsDrawer.tsx`, `src/world/presentationPlanner.ts` and `src/render/primitives/StructuralText.tsx`.
    - _Requirements: 1.11–1.14, 1.21, 6.5, 6.10, 6.12, 6.13, 7.2, 24.1–24.8, 27.1–27.13, 27.18, 33.10_
    - _Design: Error Handling; Components §5_

  - [ ] 6.9 Write property and unit tests for exceptions, emphasis, Console, I/O and diagnostics
    - `src/world/exceptionPath.property.test.ts`: **Property 38: Exception path and panel** — **Validates: Requirements 25.1, 25.2, 25.3, 25.5, 25.7, 25.8**
    - `src/world/emphasis.property.test.ts`: **Property 47: Emphasis, colour and opacity rules** — **Validates: Requirements 8.9, 8.12, 16.3, 16.5, 16.6, 16.7, 16.12, 19.6, 21.5, 25.4, 25.13**
    - `src/ui/console.property.test.ts`: **Property 58: Console truth and input** — **Validates: Requirements 26.1, 26.6, 26.10**
    - `src/world/ioEndpoints.property.test.ts`: **Property 60: I/O endpoint presence** — **Validates: Requirements 26.8, 26.9**
    - `src/shell/dock/problems.property.test.ts`: **Property 61: Diagnostics stay conventional** — **Validates: Requirements 27.1, 27.4, 27.5**
    - Example tests for: a zero-Event Recording, an uncaught exception reaching the Forensic_State, a recorded `ArrayIndexOutOfBoundsException` indication, each failure kind, and completion with HISTORY active.
    - _Requirements: 23.14, 24.7, 27.6–27.10_

  - [ ] 6.10 Checkpoint — R5
    - Milestone C full gate: static/build/full configured unit/property checks and affected time/source/debug/I/O/completion/retention browser scenarios, including real debugger tests in the serialized slot. Exercise semantic cursor 0, mapped partial boundaries and simultaneous operational dimensions. Exception-specific acceptance waits for D.

- [ ] 7. R6 — Arrays, collections and recursion visual system
  - [ ] 7.1 Complete array projection and windowing and build the ArrayTray
    - `src/world/sceneProjector.ts` arrays:
      - read and write activity from `RuntimeState.arrayActivity` at the Cursor;
      - out-of-bounds indications only from recorded exception facts naming the index;
      - each nested or ragged inner array is its own tray with one Connector per referencing outer cell.
    - `src/world/presentationPlanner.ts` `cellWindows`:
      - when the length fits the nominal Detail_Level cell target, show all indices in stable presented slots; canonical array/index IDs always remain independent of slots;
      - otherwise, map windows around current/last accessed, selected and focused indices into reusable presented slots; use index 0 only as a presentation fallback when no access is recorded. Reserve all mandatory endpoints first and apply optional-capacity/overflow rules, then ellipsis summaries with exact hidden counts. Every pick/focus/connector/provenance lookup resolves back to canonical index IDs;
      - the tray anchor never changes.
    - `src/render/primitives/ArrayTray.tsx`:
      - a backplate of 0.12, a title plate of 0.9 showing `<component>[]`, `#id` and `length = n`;
      - instanced 1.55 u cells with 0.08 gaps and index labels 0.5 above;
      - read emphasis in execution blue and write emphasis in amber;
      - ellipsis cells and the out-of-bounds marker before index 0 or after the last index.
    - Mount it in `WorldScene.tsx`.
    - Array-to-array Flows in `FlowBatch.tsx` use canonical-index-to-presented-slot mappings and actual mapped cell Ports, never ellipsis endpoints. When an endpoint is hidden/unmapped, omit that drawable flow, retain recorded provenance and expose an Inspector/Trace reveal action for its canonical index.
    - _Requirements: 14.1–14.11, 22.6_
    - _Design: Components §7.3; §10.6; §19.2 (ArrayTray)_

  - [ ] 7.2 Implement collection summaries and the CollectionBlock
    - `src/world/collectionSummary.ts` builds `SceneCollection` from `RuntimeLibrarySummary` for List, Set, Map, Queue and Deque:
      - the recorded size, or explicit unavailable size;
      - recorded user-level order where the collection provides one, never invented order;
      - `key → value` entries for maps;
      - recorded entries plus a "not recorded" remainder;
      - mutation (add, remove, put, poll) only when recorded in the applied semantic prefix, with unavailable origins disclosed;
      - `summaryUnavailable` when summarization is not possible.
    - `sceneProjector.ts` integrates it. The planner hides JDK internals (backing arrays, nodes, entries) and their Connectors, keeps the referenced objects, and applies the Connector budget to entry chips.
    - `src/render/primitives/CollectionBlock.tsx`:
      - a header with the runtime type and `#id`, and a `size = n` row;
      - an entry grid showing 8 entries at MEDIUM and 24 at CLOSE, then "+M more";
      - a mutation-amber highlight on the affected entry, or on "+M more" when that entry is not shown;
      - a "summary unavailable" variant.
    - Mount it in `WorldScene.tsx`.
    - _Requirements: 12.10, 15.1–15.9_
    - _Design: Components §7.3 (CollectionBlock); §8 (Objects)_

  - [ ] 7.3 Implement return propagation and recursion framing
    - `src/world/returnFlows.ts` keeps a bounded list (≤ 20, newest first) of returns with a proven destination, taken from graph `RETURN` edges and `RuntimeState.returns[].destination`. Each carries `returnSeq`, the value text and an operand line only when operands are recorded.
    - It is integrated into `sceneProjector.ts`:
      - when no destination is proven, the Frame face shows `returned <value>`;
      - void returns show "returned";
      - Invocations with no return Event show neither.
    - Return Flows are drawn by `FlowBatch.tsx`:
      - amber `#FFB23E` arcs from the Frame's right edge, with an arrowhead;
      - labelled "return <value>", with an operand sub-line at 0.6–0.7× height;
      - ranked under mandatory-flow/overflow rules, then newest optional flows within capacity; all recorded return evidence remains queryable beyond the bounded drawable list.
    - The planner shows the amber "RETURNS" heading iff a return Flow is visible.
    - `src/camera/CameraRig.tsx` recursion framing:
      - at live depth ≥ 4 with Follow, pitch −16° and yaw +18°, keeping the deepest Frame and 3 ancestors inside the Safe_Frame with monotone screen centres;
      - at depth ≤ 3, back to the Hero angles.
      - It works for any recursion, generically.
    - _Requirements: 10.1–10.11_
    - _Design: Components §8 (Return flows); §12 (Follow, recursion framing); §7.1_

  - [ ] 7.4 Write property tests for arrays, collections, returns and recursion framing
    - `src/world/emphasisAccess.property.test.ts`: **Property 34: Mutation and access emphasis** — **Validates: Requirements 12.12, 12.13, 14.8, 14.9, 15.7**
    - `src/world/returnFlows.property.test.ts`: **Property 37: Return propagation** — **Validates: Requirements 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11**
    - `src/world/arrayWindows.property.test.ts`: **Property 39: Array structure and windows** — **Validates: Requirements 14.6, 14.7, 14.10**
    - Extend these existing tests:
      - **Property 25: Projection agrees with RuntimeState**, adding the collection order, real size and unrecorded-remainder clauses (Requirements 15.1, 15.2, 15.6, 15.9);
      - **Property 35: References, Ports and Connectors**, adding collection entries and hidden JDK internals (Requirements 15.3, 15.5);
      - **Property 51: Safe_Frame fitting**, adding the recursion-framing clauses (Requirements 10.2, 10.3).

  - [ ] 7.5 Checkpoint — R6
    - Milestone D full gate: static/build/full configured unit/property checks; affected array, collection, recursion and exception browser/JVM cases with explicit opt-in/count checks. Review structure/exception captures; preserve recorded truth and canonical-index mappings.

- [ ] 8. R7 — Cinematic material and lighting renderer
  - [ ] 8.1 Complete the material factory for both quality tiers
    - `src/render/materials/materialFactory.ts` and `acrylicChunks.ts` implement the full MaterialRole table.
    - INTERACTIVE acrylic: `MeshStandardMaterial` with Fresnel rim chunks, interior emissive 0.08–0.18, roughness 0.22, transparency 0.78 and depthWrite on.
    - CINEMATIC acrylic: `MeshPhysicalMaterial` with transmission 0.75, thickness 1, ior 1.45, roughness 0.22 and the core colour as attenuation.
    - Opaque face plates use pre-composited colours (`#0D235F`, `#28135F`, `#0B3A3A`), and chips are opaque.
    - Edge strips, the halo and Ports are `toneMapped: false` at 1.4–2.2× radiance, above the bloom threshold.
    - The `exception` role is reserved for exception-path elements.
    - `createMaterialSet(tier)` pre-compiles both sets with `renderer.compileAsync` when CINEMATIC is selected.
    - Palette values come from tokens v4.
    - _Requirements: 25.13, 29.2, 29.3, 29.6, 29.7, 29.9_
    - _Design: Components §19.3 Material system; Key decision D9_

  - [ ] 8.2 Build the lighting rig, environment, floor reflections and contact shadows
    - `src/render/primitives/EnvironmentRig.tsx`: drei `<Environment resolution={256} frames={1}>` built only from `Lightformer`s: a blue panel on the stack side, a violet panel on the heap side, a white top strip and a floor bounce. It must never use a preset or make a network request (D10).
    - `LightRig.tsx`:
      - hemisphere 0.25;
      - blue key light `#9CC8FF` at 2.2 from the stack side;
      - fill `#C9D6FF` at 0.6;
      - violet rim `#B57BFF` at 1.8 from the heap side;
      - CINEMATIC adds a 2048 PCF shadow map.
    - `Floor.tsx` uses `MeshReflectorMaterial`: 256 px with no blur and mirror 0.35 in INTERACTIVE; 1024 px with blur [300, 100] and mirror 0.5 in CINEMATIC. The grid stays below the bloom threshold, distance-faded.
    - `ContactBlobs.tsx` draws instanced gradient quads in INTERACTIVE. CINEMATIC uses drei `ContactShadows`, re-rendered only on plan change.
    - Haze sprites (`#0A2463` behind the stack, `#24104F` behind the heap) stay below threshold.
    - Mount in `WorldScene.tsx`.
    - _Requirements: 29.1, 29.4, 29.5, 29.7, 29.9, 29.19_
    - _Design: Components §19.5 Lighting, floor and environment; Key decision D10_

  - [ ] 8.3 Build the typography system
    - `src/render/text/textSystem.ts` and `FaceText.tsx`:
      - Inter weights 400, 500 and 600 as local static files in `public/fonts/`;
      - troika `BatchedText` per compatible font/weight/material/opacity group on face plates, 0.002 u proud, with `depthWrite: false` and a polygon offset;
      - world sizes from tokens (title 0.40/600, identity 0.28/500, row 0.32/500, value 0.34/600, type 0.27/400 muted, headings 0.45 cap height);
      - text projecting below 11 CSS px is not rendered, evaluated per entity group on Detail_Level or coarse pose changes.
    - `scripts/reference/generate-inter-metrics.mjs` produces `src/render/text/interMetrics.json` (advance widths) at build time. `valueText.ts` and `textSystem.ts` use it for synchronous title-before-identity truncation and String fitting.
    - Prewarm required local font/glyph caches and expose a readiness barrier covering glyph generation/layout, batch upload, shader compilation and active effects for screenshot/cinematic QA. Dispose text members and release owned cache/resource references on session replacement, unmount and context recovery; do not dispose shared caches still in use.
    - Add a local JetBrains Mono `@font-face` for Monaco in `src/shell/styles/source.css`.
    - _Requirements: 3.12, 12.3, 29.16, 29.17, 29.18_
    - _Design: Components §19.4 Typography_

  - [ ] 8.4 Build the post-processing pipelines and the lazy CINEMATIC chunk
    - `src/render/post/PostPipeline.tsx` takes over rendering with `useFrame(render, 1)`.
    - `interactivePipeline.ts` (main chunk), in order:
      - `RenderPass` into a half-float target;
      - `UnrealBloomPass` (threshold 1.0, strength 0.55, radius 0.35, half resolution) on selective emissive layers/masks composited with the base scene; threshold alone does not exclude reflective faces/text;
      - a corner-fog `ShaderPass` masked to the lower corners;
      - `OutputPass` with ACES Filmic tone mapping and sRGB;
      - `SMAAPass`.
    - `cinematicPasses.ts` is a dynamically imported chunk adding `GTAOPass` (half resolution, radius 0.6, intensity 0.8), bloom strength 0.65, and optional DOF only with FOCUS, protecting the entire tilted target face/text through target-aware focus depth/plane or a sharp mask/composite. Generic depth-only `BokehPass` is not a sharpness guarantee; disable DOF when readability suffers. The Shell is DOM and never blurred. Unsupported effects fall back to readable INTERACTIVE geometry/text; dispose passes/targets/materials on replacement and context recovery.
    - All passes come from three 0.186.1 `examples/jsm`. No new dependency.
    - Update `src/render/WorldCanvas.tsx`.
    - _Requirements: 29.6, 29.7, 29.8, 29.9, 32.7, 32.8_
    - _Design: Components §19.6 Post-processing pipelines; Key decision D8_

  - [ ] 8.5 Implement quality tiers, GPU capability detection, the pipeline governor, the frame-time watchdog and context-loss handling
    - `src/render/quality/qualityStore.ts`:
      - the setting is INTERACTIVE at every startup and is not persisted;
      - `active` tier, `capabilities`, `cinematicAvailable`, `notice`;
      - reduced motion from the OS media query plus the in-app setting.
    - `gpuCapabilities.ts` checks WebGL2, half-float colour buffers, `MAX_SAMPLES ≥ 4`, `MAX_TEXTURE_SIZE ≥ 4096` and software rasterizers. Failure disables CINEMATIC with "This GPU does not support Cinematic rendering".
    - `pipelineGovernor.ts`: when the setting is CINEMATIC and a scrub drag, Live_Head trailing or camera motion is in progress, the INTERACTIVE pipeline runs from the next frame. CINEMATIC returns 500 ms after the last trigger.
    - `frameTimeWatchdog.ts`: two consecutive 1 s windows with a median > 33 ms switch the setting to INTERACTIVE and post a Dock notice.
    - Register `view.qualityInteractive` and `view.qualityCinematic` in `src/ide/commands.ts`, plus the Time_Dock setting. The CINEMATIC chunk is requested only after the user first selects CINEMATIC.
    - `src/render/contextLoss.ts` handles `webglcontextlost` and `restored`. It restores the same plan, pose and Selection within 2 s, or shows "The World could not be restored" with a Retry action.
    - A WebGL probe before mounting shows "The 3D World requires WebGL" while the IDE, Console and Run stay functional.
    - _Requirements: 27.16, 27.17, 29.10–29.15, 32.8_
    - _Design: Components §19.7 Quality tiers and pipeline governor; §19.1 (context loss, WebGL probe); Error Handling_

  - [ ] 8.6 Write property tests for the governor, the watchdog and tier independence
    - `src/render/quality/pipelineGovernor.property.test.ts`: **Property 62: Pipeline governor and frame-time watchdog** — **Validates: Requirements 29.10, 29.11, 29.14**
    - `src/render/quality/qualityTier.property.test.ts`: **Property 63: Quality tier independence** — **Validates: Requirements 29.15**

  - [ ]* 8.7 Write presentation-detail tests for typography, materials and primitives
    - `src/render/text/textSystem.property.test.ts`: **Property 64: Text visibility threshold** — **Validates: Requirements 29.18**
    - Material and pipeline snapshot tests (role table per tier, pass order) and primitive render snapshots, using `react-dom/server` with R3F/drei mocks.
    - _Requirements: 29.2, 29.6, 29.7, 29.9_

  - [ ] 8.8 Checkpoint — R7
    - Milestone E full gate: static/build/full configured unit/property checks and affected renderer/quality browser scenarios. Review ready text, selective bloom and readable tilted Focus captures, effect fallback/context recovery and disposal. Main entry ≤500 kB gzip with Monaco/cinematic chunks split; confirm no CINEMATIC request while INTERACTIVE.

- [ ] 9. R8 — Semantic zoom and large-world behavior
  - [ ] 9.1 Implement Detail_Level from projected face height, with hysteresis and crossfade
    - `src/world/detailLevel.ts`:
      - `representativeFaceHeight` is the median projected front-face height of up to 5 stable canonical Frames, Heap_Objects and shelves from the full scene population/bounds, independent of the presented plan or clusters whose anchors lie inside the viewport nearest its centre;
      - `nextDetailLevel` returns CLOSE at ≥ 0.16 H and FAR at ≤ 0.05 H;
      - it leaves CLOSE only below 0.136 H and FAR only above 0.0575 H;
      - with no representative, the level is unchanged. Freeze representatives for a stable semantic population/camera tile and retain separate entry/exit thresholds so planner output cannot cause oscillation.
    - `src/camera/CameraRig.tsx` evaluates the level at most once per rendered frame while the pose changes, and writes `cameraStore.detailLevel` and `viewTile`.
    - `src/render/WorldScene.tsx` keeps the outgoing and incoming plans and crossfades opacity over 300 ms (200–400 ms), with no anchor or camera change. Each plan applies the same mandatory-overflow rule; crossfade deduplicates mandatory IDs and accounts for combined transient draw cost separately from canonical population. Reduced motion swaps instantly.
    - _Requirements: 22.1, 22.2, 22.7, 22.8_
    - _Design: Components §10.3 Detail_Level_

  - [ ] 9.2 Implement the cluster hierarchy, the pinned cut and library/JDK collapsing
    - `src/world/clusters.ts` builds the stable cluster hierarchy from layout `clusterPath`s:
      - keys: type, package, ownership, collection, invocation-branch, execution-age (buckets of 4,096) and class;
      - stable ingest identity/order is append-only, but active membership/counts are indexed by semantic prefix, role and lifetime; selection/current-role changes truthfully move entities out of aggregate membership. Historical append counts are not current-member counts;
      - identity and anchor are kept while a cluster has zero members.
    - `src/world/presentationPlanner.ts` computes the cut:
      - all-or-nothing optional cluster expansion after mandatory entities are removed from aggregate membership and presented independently;
      - ranking: one-hop neighbour of Π, then project before external, then distance by coarse tile;
      - coarsening optional type → package → ownership when the nominal Cluster target is exceeded; preserve mandatory representatives/targets and report unavoidable overflow;
      - every entity counted exactly once (detailed + quiet + clustered = total);
      - the live depth Cluster is labelled with the exact count and the most frequent method (ties to the innermost);
      - Class_State package Clusters;
      - library and JDK entities collapsed into ownership Clusters at FAR and MEDIUM unless pinned or directly referenced by a pinned Frame row or project field;
      - labels in the form `<key value> ×<count>`.
    - The planner never changes RuntimeState or ExecutionGraph.
    - _Requirements: 8.14, 11.11, 13.7, 22.3, 22.8–22.10, 22.12–22.15, 33.3_
    - _Design: Components §10.2 Pinned set, clusters and accounting; Clarification C6_

  - [ ] 9.3 Implement bundles, inter-cluster Connectors, cluster volumes and cluster interaction
    - Planner bundles:
      - Connectors beyond the budget aggregate per (source, target) cluster or entity, each labelled with an exact count;
      - at FAR, one optional inter-cluster Connector per Cluster pair, labelled with the exact reference count; semantically required endpoints/flows obey mandatory priority/overflow;
      - Trace All Flow bundles come from `FlowCatalog.bundles`;
      - historical bindings in Trace All are shown at ≤ 0.25 opacity.
    - `src/render/primitives/ClusterVolumes.tsx` draws instanced stacked silhouettes with labels at ≥ 12 px. `QuietVolumes.tsx` draws instanced untextured bodies in 1–3 draw calls and respects the pickable-quiet budget. Mount both in `WorldScene.tsx`.
    - Cluster Selection: the Inspector shows the key, the real count and a virtualized member list, with no camera move.
    - Double-clicking a Cluster runs a 600–1200 ms travel through `src/camera/guidedMoves.ts`, ending at MEDIUM with at least one member detailed, or at CLOSE for ownership Clusters. FOCUS is unchanged.
    - _Requirements: 16.10, 16.12, 21.4, 22.3, 22.4, 22.11, 22.16, 22.17_
    - _Design: Components §10.5 Connectors, bundles and call links; §19.2 (ClusterVolumes, QuietVolumes)_

  - [ ] 9.4 Write property tests for budgets, clusters and Detail_Level
    - `src/world/presentationPlanner.property.test.ts`: **Property 44: Budgets and exactly-once accounting** — **Validates: Requirements 8.14, 11.10, 11.11, 13.7, 16.10, 21.4, 22.3, 22.4, 22.8, 22.9**
    - `src/world/clusters.property.test.ts`: **Property 45: Cluster stability** — **Validates: Requirements 22.10, 22.12, 22.13, 22.14, 22.15**
    - `src/world/detailLevel.property.test.ts`: **Property 46: Detail_Level thresholds and hysteresis** — **Validates: Requirements 22.1, 22.2**
    - Extend **Property 35: References, Ports and Connectors** with the clause that Connectors to clustered targets end at the Cluster (Requirement 13.5).

  - [ ] 9.5 Add large-world scaling guards and fix whole-scene hot paths
    - `tests/perf/world-scaling.test.mjs`:
      - a single-Event batch in a 20,000-entity World costs ≤ 2× the same batch in a 1,000-entity World, comparing the median over ≥ 100 batches;
      - the retained size of SceneModel plus presentation state is ≤ 25 % of semantic retention, measured on the rich-graph sizes with `--expose-gc`;
      - the plan is memoized per view tile, so an orbit with no tile change produces no re-plan.
    - Remove any O(n) per-event or per-frame work these tests expose in `sceneProjector.ts`, `presentationPlanner.ts` or `clusters.ts`.
    - Run it as `VJ_SUITE=perf npx vitest run tests/perf/world-scaling.test.mjs --execArgv=--expose-gc --maxWorkers=1 --fileParallelism=false`.
    - _Requirements: 32.10, 32.11_
    - _Design: Components §22 Rendering-performance strategy_

  - [ ] 9.6 Checkpoint — R8
    - Integration F: run targeted planner/cluster/zoom properties, world-scaling guard and dense-world browser/performance scenarios. Verify mandatory overflow, truthful current membership and zoom independent of planner output. Full F gate is 10.6.

- [ ] 10. R9 — IDE, responsive and accessibility convergence
  - [ ] 10.1 Implement the SHORT and NARROW compositions
    - NARROW Source_Panel (`src/shell/source/SourcePanel.tsx`):
      - a left drawer, collapsed whenever the class becomes NARROW or the Execution_State becomes a runtime state;
      - a peek tab showing the active file name and line (the Cursor Event line, or the caret line), which opens the drawer by pointer or keyboard.
    - NARROW Header buttons (`Header.tsx`, `ModeBar.tsx`, `RunCluster.tsx`): icon-only, each with an `aria-label` and a tooltip naming its command.
    - NARROW Time_Dock (`TimeDock.tsx`): Play, Step and the track stay visible; speed and settings move into an overflow menu.
    - NARROW Inspector (`InspectorCard.tsx`): a bottom sheet ≤ 0.45 H with internal scrolling.
    - Fitting at Home and Hero uses the NARROW Safe_Frame, with both headings fully visible.
    - SHORT: 56 px Header, 84 px Time_Dock, ≤ 6 labelled milestones, and a Safe_Frame ≥ 0.55 H.
    - In every class, all Shell text is ≥ 12 px and every target is ≥ 24 × 24 px.
    - _Requirements: 30.1–30.11_
    - _Design: Components §20 Responsive system; §2 (token table)_

  - [ ] 10.2 Build the accessibility primitives, non-colour cues and live reduced-motion control
    - `src/shell/a11y/SkipLinks.tsx` provides Source, World and Time_Dock links, visible only on focus.
    - `focusRegions.ts` sets the DOM and Tab order: skip links, Header, Source_Panel, World, Time_Dock, Dock, drawers, Inspector, Debug_Bar.
      - Composites use roving `tabindex`.
      - Disabled controls stay focusable with `aria-disabled`.
      - Enter and Space activate exactly like a click.
    - `Announcer.tsx` is a polite live region. It coalesces triggers per 1 s into one message with the AppState label, the paused file and line, the input request, and exception class and counts.
    - `Tooltip.tsx`:
      - 800 ms hover delay, immediate on focus, persists while hovered;
      - Escape dismisses without moving focus;
      - includes the disabled reason and the shortcut in platform notation (⌘⇧⌥ or Ctrl/Shift/Alt).
    - Focus ring: 2 px `#FFFFFF` plus a 2 px `#0A1230` halo.
    - Glyph table for non-colour cues: ▶, line N, ❚❚, !/throws, ⚠, the HISTORY badge text, ◐ Partial recording, Breakpoint shape and ✎.
    - In-app reduced-motion toggle: `view.reducedMotion`, persisted under `ggjavaez:v4:reduced-motion`. OS changes apply live within 1 s, and in-flight animations jump to their end state.
    - Touches `src/shell/a11y/*`, `src/shell/Shell.tsx`, `src/render/quality/qualityStore.ts` and `src/shell/styles/a11y.css`.
    - _Requirements: 5.17, 31.1–31.3, 31.7–31.13, 31.15_
    - _Design: Components §21 Accessibility strategy_

  - [ ] 10.3 Implement the accessible entity list and keyboard World navigation
    - `src/interaction/accessibleEntities.ts` builds the list of visible pickable Frames, Heap_Objects, Array_Cells, shelves and Clusters whose projected centres are inside the viewport.
      - Entries are ordered top-to-bottom, then left-to-right.
      - Names include kind, identity and status, and Cluster names include the real count.
      - The list updates ≤ 250 ms after a Cursor, Detail_Level or pose change.
    - The World container in `src/render/WorldCanvas.tsx` has `tabIndex=0`, `role="application"` and `aria-roledescription="runtime world"`, with a visually hidden `listbox` and `aria-activedescendant`.
    - Keys:
      - Tab and Shift+Tab move the Selection through the list without moving the camera, and leave the World at either end;
      - Enter enters Focus;
      - Escape exits Focus or clears the Selection;
      - arrows, `+` and `-` stay camera keys;
      - `H` runs Home (world-scoped).
    - Draw a projected-bounds outline around the keyboard Selection.
    - _Requirements: 20.3, 20.4, 31.5, 31.6, 31.8_
    - _Design: Components §21 (World keyboard)_

  - [ ] 10.4 Converge the command registry and shortcuts
    - Add these commands to `src/ide/commands.ts` and `src/ide/shortcuts.ts`:
      - `execution.restart`, shown in the Header Run cluster and the Command_Palette, available during a live session. It confirms through `src/shell/dialogs/RestartDialog.tsx`, then stops and runs (6.11, C3).
      - `workbench.nextRegion` (Ctrl+F6), listed in the palette.
      - `workbench.expandSource` and `workbench.collapseSource`.
      - `workbench.errors` (Show Errors), alongside Show Console, Show Problems and Show Debug.
      - `workbench.inspector` (Alt+Shift+I), available when a Selection or Focus target exists.
      - F1 opening the Command_Palette.
      - `editor.toggleBreakpoint` on F9 in editor scope.
      - Alt+Shift+R (Run), Alt+Shift+O (workspace symbols) and Alt+Shift+E (Explorer).
      - Scope `world` for `H`.
    - Remove `workbench.runtimeFocus`, `workbench.tools` and `workbench.source`.
    - Add `src/ide/commands.table.test.ts`, asserting that the registry provides every command of 5.14 with a category, title, enablement and disabled reason, and every binding of the design table.
    - _Requirements: 3.5, 3.6, 5.3, 5.9–5.14, 5.16, 6.11, 31.4_
    - _Design: Components §4 (new ShellCommandIds table); Clarification C3_

  - [ ] 10.5 Write accessibility property tests and the responsive and keyboard browser specs
    - `src/interaction/accessibleEntities.property.test.ts`: **Property 65: Accessible World navigation** — **Validates: Requirements 31.5, 31.6**
    - `src/shell/a11y/announcer.property.test.ts`: **Property 66: Announcement coalescing** — **Validates: Requirements 31.7**
    - `e2e/reference/responsive.spec.ts` runs the five QA viewports (1728×1117, 1440×900, 1280×800, 760×900, 1440×650) in every Execution_State reachable with `fixtures/torture-v12-p5_5/05-output-and-input` and `06-small-debug`. It checks:
      - no horizontal page scroll;
      - no intersecting hit areas;
      - text ≥ 12 px and targets ≥ 24 px;
      - the composition is correct on the first frame after a resize, with AppState, Cursor, Selection and Editor content unchanged.
    - `e2e/reference/accessibility.spec.ts` checks:
      - keyboard-only Run, Explorer, palette and Focus flows;
      - skip links and Tab order;
      - dialog traps;
      - tooltips;
      - the reduced-motion end state equals the animated end state;
      - grayscale-distinguishable states;
      - focus-ring and text contrast sampled against the brightest World pixel in both tiers.
    - _Requirements: 30.9–30.11, 31.1–31.15_

  - [ ] 10.6 Checkpoint — R9
    - Milestone F full gate: static/build/full configured unit/property checks, affected responsive/accessibility/scaling browser scenarios and required performance measurements. Review all five viewports; verify camera ownership, geometry/text constraints and no semantic loss under presentation budgets.

- [ ] 11. R10 — Reference-versus-browser iteration
  - [x] 11.1 Write the reference-state Java programs
    - Add generic, ordinary Java projects under `fixtures/reference-exact/`. None may use the names Person, Factorial, SortDemo or any other Reference_Suite label. They cover:
      - a domain object graph (constructor, setter, String and List fields) for the hero, close-inspection, Focus and completed states;
      - a deep recursion with returned values for the recursion and return-propagation states;
      - an in-place array algorithm with compare/swap for the array visualization and array operation states;
      - nested calls with a throw, an unwind and an uncaught exit with a cause, for exception propagation;
      - stdin consumption with stdout and stderr, for I/O;
      - a breakpoint-friendly program for Debug pause;
      - a dense world with many types, packages, collections and a library/JDK share, for semantic zoom FAR, MEDIUM and CLOSE and free navigation.
    - Each program has a README line naming the Comparable_States it drives.
    - Start the generic hero program and fixture manifest in A/B for early QA; complete the full program set in G. Verify each one through the production BuildService and a real JVM in `tests/reference/programs.jvm.test.mjs`: exact output, exit status, and SceneModel counts at the final Event.
    - _Requirements: 33.4, 33.6, 34.1_

  - [x] 11.2 Build the reference convergence harness and the Comparable_State spec
    - Establish capture/readiness/report scaffolding in A and projection comparison in B, then complete this full matrix in G. Extend `src/qa/qaBridge.ts` with `worldProjection()` (projected stack and heap bands and entity bounds), `planStats()`, `clock.step(ms)` and `setCameraPose()`.
    - `e2e/reference/harness.ts`:
      - waits for the finite text/material/effect readiness barrier before capture and records session/prefix identity; timeout fails capture or selects a documented ready fallback, never silently capturing unresolved text;
      - rejects validation reports when expected/actual executed counts differ, required skips occur, or the actual real-JVM count is zero; the command/gate exit status must be nonzero, not just a warning;
      - captures at the twin resolution (1672×941 for R1–R4 twins, 1536×1024 for R5/R6 panels, with sheet panels cropped by rectangle);
      - composites side-by-side and absolute-difference assets in the browser with `OffscreenCanvas` (no image dependency);
      - writes them to `docs/checkpoints/reference-exact/{captures,side-by-side,diff}/`, which is gitignored media;
      - measures the Header, Source_Panel, Time_Dock, Stack-band and Heap-band rectangles against the tolerances of Requirements 2, 3, 8 and 11, failing the capture on any miss.
    - `scripts/reference/convergence.mjs` reads `docs/checkpoints/reference-exact/REVIEW.md` (tracked; one entry per reviewed capture with state, largest discrepancy, category and fix) and reports every state that is not converged, with the cause.
    - `e2e/reference/comparable-states.spec.ts` drives the production Shell with the 11.1 programs on a real JVM to all 16 Comparable_States in all five QA viewports. Each state is paired with exactly one tracked twin under `docs/visual-java-spec/references/`. Default pairing (change it only with a REVIEW.md entry):

      | Comparable_State | Twin |
      | --- | --- |
      | Runtime hero view | R1 (06) |
      | I/O | R1 (06) |
      | Close object inspection | R2 (07) |
      | Recursion and deep invocation | R3 (08) |
      | Array operation | R4 (09) |
      | Completed execution | R5 panel 1 |
      | Focus | R5 panel 2 |
      | Return propagation | R5 panel 3 |
      | Array visualization | R5 panel 4 |
      | Semantic_Zoom FAR | R5 panel 6 |
      | Debug pause | R6 panel 1 |
      | Exception propagation | R6 panel 5 |
      | Time travel | R6 panel 6 |
      | Free navigation | R6 panel 7 |
      | Semantic_Zoom MEDIUM | R6 panel 8 (medium) |
      | Semantic_Zoom CLOSE | R6 panel 8 (close) |

    - Add the `test:reference` and `qa:reference` scripts to `package.json`.
    - _Requirements: 34.1–34.6_
    - _Design: Components §23 QA harness_

  - [ ] 11.3 Converge the runtime hero view, completed execution and I/O states
    - For each state, iterate capture → compare at original resolution against the twin and diff → fix the single largest discrepancy → capture again only if evidence shows a discrepancy or the fix needs verification. Accept an initially conforming state without redundant cycles.
    - Log every iteration in REVIEW.md with a category: composition, camera, lighting, material, proportion, typography, contrast or control placement.
    - Fixes go into tokens, shell geometry, primitives, materials, camera poses or the planner. They never use content-specific branches.
    - The I/O rail is recorded as a documented necessary addition.
    - Done when `convergence.mjs` reports all three states converged, or every remaining difference is documented as runtime content or a necessary deviation with its reason.
    - _Requirements: 34.2–34.5_

  - [ ] 11.4 Converge the close object inspection and Focus states
    - Capture → compare → fix and recapture only where acceptance evidence requires it, against R2 and R5 panel 2: Focus travel framing, the 38–52 % H face, neighbours, dimming and Inspector card proportions.
    - Log every iteration in REVIEW.md.
    - Done when `convergence.mjs` reports both states converged or documented.
    - _Requirements: 19.5, 19.6, 28.1, 34.2–34.5_

  - [ ] 11.5 Converge the recursion and deep invocation and return propagation states
    - Capture → compare → fix and recapture only where acceptance evidence requires it, against R3 and R5 panel 3: the descending staircase, call links on the left, amber returns on the right, the RETURNS heading and recursion framing.
    - Log every iteration in REVIEW.md.
    - Done when `convergence.mjs` reports both states converged or documented.
    - _Requirements: 10.1–10.11, 34.2–34.5_

  - [ ] 11.6 Converge the array visualization and array operation states
    - Capture → compare → fix and recapture only where acceptance evidence requires it, against R5 panel 4 and R4: tray, title plate, cell proportions and numerals, read and write emphasis, and recorded-only array Flows.
    - Log every iteration in REVIEW.md.
    - Done when `convergence.mjs` reports both states converged or documented.
    - _Requirements: 14.1–14.10, 34.2–34.5_

  - [ ] 11.7 Converge the exception propagation and Debug pause states
    - Capture → compare → fix and recapture only where acceptance evidence requires it, against R6 panel 5 and R6 panel 1: the red path through Frames, ExceptionPanel placement and text, Forensic dimming, the Debug_Bar and the "Paused · line N" halo.
    - Log every iteration in REVIEW.md.
    - Done when `convergence.mjs` reports both states converged or documented.
    - _Requirements: 7.5, 7.7, 25.1–25.5, 34.2–34.5_

  - [ ] 11.8 Converge the free navigation and time travel states
    - Capture → compare → fix and recapture only where acceptance evidence requires it, against R6 panels 7 and 6: orbit, pan and zoom across both regions, and the same World at three Cursors with stable anchors and the Time_Dock milestones.
    - Log every iteration in REVIEW.md.
    - Done when `convergence.mjs` reports both states converged or documented.
    - _Requirements: 20.2, 23.1–23.5, 34.2–34.5_

  - [ ] 11.9 Converge the Semantic_Zoom FAR, MEDIUM and CLOSE states
    - Capture → compare → fix and recapture only where acceptance evidence requires it, against R5 panel 6 and R6 panel 8: Cluster silhouettes and `Key ×N` labels at FAR, compact rows at MEDIUM, and the full grid at CLOSE, as one continuous World without threshold flicker.
    - Log every iteration in REVIEW.md.
    - Done when `convergence.mjs` reports all three states converged or documented.
    - _Requirements: 22.1–22.8, 22.16, 34.2–34.5_

  - [ ] 11.10 Run a cross-state convergence pass
    - Re-capture all 16 states in all five QA viewports after 11.3–11.9, because a fix for one state can regress another.
    - Fix any regression, then recapture affected states to verify the change; do not require another fix when the captured state already passes.
    - Inspect the final captures at original resolution.
    - Done when `npm run qa:reference` reports every Comparable_State converged or documented, with passing rectangle measurements.
    - _Requirements: 34.2–34.6_

  - [ ] 11.11 Checkpoint — R10
    - Convergence boundary G: validate all sixteen Comparable_States across all five viewports with readiness and rectangle measurements, reviewed necessary deviations and no arbitrary iteration count. Run affected regression checks after shared visual fixes; exhaustive acceptance is 13.7.

- [ ] 12. R11 — Torture, regression and performance audit
  - [ ] 12.1 Run the static and unit/integration gates and fix regressions
    - Run `npm run typecheck`, `npm run lint`, `npm run build` and `npm test`. `npm test` covers every property test, `tests/guardrails`, `tests/characterization`, `tests/golden` and `src/testing/invariants.test.ts`.
    - Fix product code, never the tests. Any regenerated Presentation_Golden gets a review record.
    - Record each command, duration, exit code and log in `docs/checkpoints/reference-exact/gates/`.
    - _Requirements: 34.12_

  - [ ] 12.2 Run the real-JVM suites and verify Semantic_Golden byte identity
    - Run all workloads serially. Supply Maven/Gradle paths to every build-tool corpus command; clear `VJ_PHASE4_CASE` and `VJ_TORTURE_CASE` for full gates so ambient filters cannot narrow coverage. Use JSON reports with the count-checking gate in 11.2; a successful Vitest exit alone is insufficient.
    - Acceptance: `GGJAVA_MAVEN_PATH="$PWD/.ggjavaez/tools/maven/bin/mvn" GGJAVA_GRADLE_PATH="$PWD/.ggjavaez/tools/gradle/bin/gradle" npm run test:acceptance -- --reporter=json --outputFile=docs/checkpoints/reference-exact/gates/acceptance.json`. The package script supplies `VJ_SUITE=acceptance`.
    - Prior suites: `VJ_PHASE3_JVM=1 VJ_PHASE4_JVM=1 VJ_PHASE4_CASE= GGJAVA_MAVEN_PATH="$PWD/.ggjavaez/tools/maven/bin/mvn" GGJAVA_GRADLE_PATH="$PWD/.ggjavaez/tools/gradle/bin/gradle" npx vitest run tests/coverage-v12-p4 tests/provenance/real-jvm.test.mjs tests/provenance/performance-jvm.test.mjs --execArgv=--expose-gc --maxWorkers=1 --fileParallelism=false --reporter=json --outputFile=docs/checkpoints/reference-exact/gates/prior-jvm.json`.
    - Torture: `VJ_PHASE5_5_JVM=1 VJ_PHASE4_JVM=1 VJ_PHASE4_CASE= VJ_TORTURE_CASE= GGJAVA_MAVEN_PATH="$PWD/.ggjavaez/tools/maven/bin/mvn" GGJAVA_GRADLE_PATH="$PWD/.ggjavaez/tools/gradle/bin/gradle" npx vitest run tests/torture-v12-p5_5/torture.jvm.test.mjs --execArgv=--expose-gc --maxWorkers=1 --fileParallelism=false --reporter=json --outputFile=docs/checkpoints/reference-exact/gates/torture-jvm.json`. Both Phase 5.5 and Phase 4 flags are required by this harness.
    - Rich graph performance (not a real-JVM suite): `VJ_SUITE=perf npx vitest run tests/perf/provenance.test.mjs --execArgv=--expose-gc --maxWorkers=1 --fileParallelism=false --reporter=json --outputFile=docs/checkpoints/reference-exact/gates/rich-graph.json`. Without `VJ_SUITE`, `vite.config.ts` excludes `tests/perf/**`.
    - Reference programs: `VJ_PHASE4_JVM=1 VJ_PHASE4_CASE= GGJAVA_MAVEN_PATH="$PWD/.ggjavaez/tools/maven/bin/mvn" GGJAVA_GRADLE_PATH="$PWD/.ggjavaez/tools/gradle/bin/gradle" npx vitest run tests/reference/programs.jvm.test.mjs --maxWorkers=1 --fileParallelism=false --reporter=json --outputFile=docs/checkpoints/reference-exact/gates/reference-jvm.json`. Task 11.1 must declare its opt-in contract and expected per-program test manifest before execution; Phase 4 is required when using the existing `recordProject` harness.
    - Static inventory at correction time (recompute from definitions/fixture manifests if implementation legitimately adds cases): acceptance 195 cases = 42 corpus/invariance checks + 153 facts (149 current, 4 existing `test.fails` targets); prior command 85 cases = 33 non-JVM corpus checks + 30 Phase 4 coverage + 4 Phase 4 invariance + 17 Phase 3 provenance + 1 Phase 3 JVM performance; torture 9; rich graph 1. Thus prior real-JVM executed count is 52, not 85. Report existing expected-failure targets separately and reconcile their status through the lead's preserved test discipline; an expected failure is not proof of successful reconstructed behavior.
    - For every command report expected cases, actual executed cases, actual successful required cases, failed cases, skips/todos and actual real-JVM cases separately. Require actual executed = expected, actual real-JVM = expected real-JVM and >0 for each real-JVM suite, zero skipped required cases and no failures. The count-checking gate/wrapper must exit nonzero for mismatch, missing reports or all-skipped runs; non-JVM corpus passes cannot mask skipped JVM tests. New reference-program counts must be explicit and nonzero, never inferred from a successful command.
    - Regenerate every retained Semantic_Golden and diff it against the stored file. Zero modified, replaced or deleted files are allowed.
    - Check plain, Maven and Gradle parity at the final Event on `fixtures/projects-m9/people-{plain,maven,gradle}` and the `acc*` Maven and Gradle fixtures: equal counts of Frames, Heap_Objects, shelves, cells and entries, with the same type names and values.
    - Report any assertion that passed in Phase 5.5 and now fails, by name, and fix it.
    - _Requirements: 33.4, 33.7, 34.9, 34.12_

  - [ ] 12.3 Run the full browser suite, the torture browser cases and the real debugger scenarios
    - Run with exactly one dev pair (`npm run dev -- --port 5173 --strictPort`), and run heavy workloads serially:
      - `VJ_QA_OUTPUT_ROOT=docs/checkpoints/reference-exact/browser npx playwright test`;
      - `VJ_PHASE5_5_DETAILS=1 VJ_PHASE5_5_MOTION=1 npx playwright test e2e/torture-details-v12-p5_5.spec.ts e2e/torture-motion-v12-p5_5.spec.ts`;
      - `node scripts/torture-soak-p5_5.mjs`.
    - Add `e2e/reference/debug-scenarios.spec.ts` over `fixtures/debug-v7/*` and `fixtures/torture-v12-p5_5/06-small-debug`. It covers:
      - resolved and unresolved Breakpoints;
      - Step Into, Step Over, Step Out and Continue;
      - a long pause of at least 35 s with responsive camera, scrub, Console and Editor;
      - history-Cursor separation: scrubbing while paused never resumes Java, Debug commands in HISTORY keep the Cursor, and Return to Live reaches the same Live_Head;
      - Stop.
    - Every Torture_Corpus category must pass, as listed in Requirement 34.9.
    - _Requirements: 7.11–7.16, 34.9, 34.12_

  - [ ] 12.4 Measure every Requirement 32 metric and mitigate exceeded budgets
    - Extend `perf-e2e/browser-baseline.spec.ts`, `e2e/spatial-performance.ts` and `scripts/reference/perf-report.mjs`. On the QA_Machine, with INTERACTIVE and the Dense_Sample, using the Phase 5.5 methods, measure:
      - seek p50/p95 over ≥ 100 spread seeks;
      - Focus first frame over ≥ 50 distinct targets and Home over ≥ 50 commands;
      - a 30 s orbit in each QA viewport: median and p95 frame time and the maximum draw calls;
      - WebGL submission CPU p95;
      - rich semantic retention;
      - dense cold load as the median of ≥ 5;
      - main chunk gzip size, and that the Monaco and CINEMATIC chunks are split and not requested early;
      - single-Event update scaling and the presentation retention ratio;
      - 60 s drift in frame time and post-GC heap;
      - startup, time-to-World and renderer memory.
    - Report semantic costs separately from rendering costs. Each metric lists its value, budget and Phase 5.5 baseline.
    - For each exceeded budget, fix it, or record the value, cause and mitigation decision. "Not measured" requires a reason.
    - Write the data to `docs/checkpoints/reference-exact/perf/`.
    - _Requirements: 32.1–32.14_
    - _Design: Components §22; §23 (Performance)_

  - [ ] 12.5 Capture the motion QA sequences and run the cross-state flows
    - `e2e/reference/motion.spec.ts` runs at 1.0x with reduced motion off, on the virtual clock. It captures deterministic frame sequences for: Run transition, allocation, constructor, argument binding, field write, return, recursion, array mutation, stdout, stdin, Focus, Home, Semantic_Zoom, scrub, Debug, exception and completion.
      - Two runs must match in frame count and in the Cursor sequence at every frame.
      - Inspect the frames and fix motion defects.
    - `e2e/reference/flows.spec.ts` asserts AppState, Lens and Shell state at every step of:
      - (a) exercise process running, input-wait and resumed input, HISTORY/LIVE Lens and debugger pause independently through completion; also alive process + stopped recording + input wait, and pause before any semantic Event;
      - (b) completed execution → source edit → failed build, asserting retained session/execution ID, trace/history/prefix revision, semantic Cursor, layout/anchors, Lens/zoom, Selection, valid Focus, source bindings and Console association; stale/new-attempt subscriptions must not leak;
      - (c) RUNNING → uncaught exception → Error_Explorer showing the recorded class and message → successful rerun → COMPLETED.
      - On failure it reports the first divergent step.
    - _Requirements: 34.7, 34.8_

  - [ ] 12.6 Run the automated full-product hands-on audit and fix friction
    - `e2e/reference/hands-on-audit.spec.ts` drives the production Shell in a real browser with real Java, capturing screenshots at every step:
      - open a project, use the Explorer, create a Java class, rename, open many tabs;
      - Quick_Open, Command_Palette, edit, save, Run;
      - watch allocation, constructor and field write; read stdout and enter stdin;
      - orbit, pan, zoom and Semantic_Zoom; select, Focus, Trace and Home;
      - inspect an array and a collection; scrub back and forward; Return to Live;
      - Debug with a Breakpoint, Step Into, Step Over and Step Out;
      - an exception and the Error_Explorer;
      - completion and the completed World; rerun; a failed build; partial recording; a dense World;
      - a narrow viewport, reduced motion and CINEMATIC.
    - Inspect the captures at original resolution, fix significant friction, and log findings and fixes in `docs/checkpoints/reference-exact/audit-log.md`.
    - _Requirements: 34.6, 34.8_

  - [ ] 12.7 Checkpoint — R11
    - Audit boundary G: every gate/evidence item in 12.1–12.6 must pass with expected/actual counts and skips recorded and no weakened assertions. Reuse valid evidence only if the relevant tree is unchanged; cleanup changes are covered by final 13.7.

- [ ] 13. R12 — Cleanup, documentation and final push
  - [ ] 13.1 Delete the superseded runtime presentation modules
    - Delete these modules, with their tests replaced by the tests of the new modules:
      - `src/classic/**`;
      - `src/scene/**` (the metrics now live in `src/render/metrics/`);
      - `src/navigation/**`, including THEATER;
      - `src/world/spatialLayout.ts`, `layout.ts`, `spatialPresentation.ts`, `detailedScene.ts`, `isolatedScene.ts`, `objectFace.ts`, `arrayGeometry.ts`, `runtimeHeadings.ts` and `callStructure.ts`, plus the legacy `sceneModel.ts` builder;
      - `src/ui/Inspector.tsx`;
      - `src/app/layoutForTrace.ts` and `src/app/animationQuality.ts`;
      - `src/examples/curatedLayout.ts`, `scopedLayout.ts`, `ControlFlowStatus.tsx` and `captions.ts`;
      - `src/contracts/visualization.ts`;
      - `src/playback/usePlayback.ts`;
      - `tests/golden/layoutGolden.*`, superseded by `layoutEngineGolden` with a review record.
    - Semantic tests stay untouched.
    - Done when relevant local checks and the next affected integration gate pass and no import of a deleted module remains.
    - _Requirements: 34.10_
    - _Design: Deleted modules; Migration and Deletion Plan steps 4–7_

  - [ ] 13.2 Consolidate the contracts and tokens and add the clean-replacement scan
    - Relocate `src/contracts/worldV2.ts` to `src/contracts/world.ts`, replacing the legacy types and updating imports.
    - Remove `CameraMode`, the v3 token aliases, the legacy `src/playback` re-exports and the persistence keys `ggjavaez:runtime-view`, `ggjavaez:animation-quality`, `ggjavaez:p5:source-width` and `ggjavaez:m8:explorer`, with one-time cleanup of the stored values.
    - Add `tests/guardrails/cleanReplacement.test.mjs`. It fails if any source module, route or stylesheet remains for the Classic runtime, Theater, the stand-alone App shell, the old IDE chrome, the matte primitives (`SolidBody`, `SolidFace`, `IdentitySolid`, `WorldOverviewLabels`, `ConnectorCaptions`) or the legacy layout kinds (`standard`, `deepStack`, `array`, `scoped`). It also asserts that `/examples` mounts the production Shell.
    - _Requirements: 33.8, 34.10, 34.11_

  - [ ] 13.3 Add the demo-leak source scan and the reference-image integrity check
    - `scripts/reference/scan-generic.mjs` with `tests/guardrails/genericScan.test.mjs`:
      - scans `src/`, `server/` and `instrumentation/`, excluding tests and `src/examples/`;
      - ignores case, comments and space, underscore or hyphen separators;
      - flags identifiers and literals containing Person, Factorial, bubble sort, SortDemo or any acceptance-fixture project name as a whole word or camel-case segment;
      - flags any string literal equal to a Reference_Suite label;
      - reports the file and line of every match.
      - Fix every leak in generic code.
    - `scripts/reference/check-references.mjs` with `tests/guardrails/references.test.mjs`:
      - `best.png` and the five `ChatGPT Image*.png` root images (R1–R6) exist;
      - `best.png` is tracked (`git ls-files --error-unmatch best.png` succeeds); each of the five `ChatGPT Image*.png` root references remains untracked (the corresponding lookup fails), user-owned and never added;
      - their md5 equals that of their tracked twins.
      - Failures name the image. The root images are never added, moved or modified.
    - _Requirements: 33.6, 34.13_
    - _Design: Components §23 (Reference integrity, Demo-name scan)_

  - [ ] 13.4 Write the reference-audit and architecture documentation
    - `docs/checkpoints/reference-exact/REFERENCE-AUDIT.md` covers:
      - the reference inventory with checksums;
      - the reference interpretation and the inconsistency resolutions;
      - the tokens derived from the references;
      - the fiction-versus-design rules;
      - the Comparable_State pairing table.
    - `docs/checkpoints/reference-exact/ARCHITECTURE.md` covers:
      - the final app architecture, the store topology, and the shell and AppState model;
      - the interaction model: Selection, Focus, Home, Trace and camera ownership;
      - the rendering architecture, materials, lighting, and the quality modes with their governor;
      - semantic zoom and clusters;
      - the timeline, I/O, Debug, exceptions and IDE behavior;
      - responsive behavior and accessibility;
      - the preserved versus replaced inventory;
      - the security truth: Java runs locally and unsandboxed, and Maven and Gradle may run build logic.
    - _Requirements: 33.10_

  - [ ] 13.5 Write the QA, performance and validation documentation
    - `VISUAL-QA.md`: captures per state and viewport, side-by-side and diff assets, REVIEW.md iterations, remaining reference differences and documented deviations.
    - `BEHAVIOR-QA.md`: motion sequences, cross-state flows, debug scenarios, the hands-on audit and the accessibility and reduced-motion results.
    - `PERFORMANCE.md`: every Requirement 32 metric with value, budget and Phase 5.5 baseline, the semantic and rendering split, and mitigations.
    - `VALIDATION.md`: gate results with commands/logs, flags, expected/actual executed and successful counts, skips/todos and real-JVM counts separately from non-JVM inventory checks, unit, acceptance and browser counts, Semantic_Golden identity, the consolidated test migration ledger and Presentation_Golden review records from `migration/`, and the known limitations.
    - All of these go under `docs/checkpoints/reference-exact/`. Bulk media stays gitignored.
    - _Requirements: 32.13, 34.3, 34.12_

  - [ ] 13.6 Audit the full branch diff from the starting commit
    - Inspect `git diff 316b94ad79582c284fd466174db6f82d939aebba...HEAD`. Check for and fix:
      - generated output, caches, `dist/` or `test-results/`, and giant artifacts;
      - machine-local paths and secrets;
      - duplicated shells and dead compatibility UI;
      - demo leakage;
      - semantic logic in the renderer, and renderer fields in RuntimeState or ExecutionGraph;
      - whole-trace scans in per-event paths;
      - memory and accessibility regressions;
      - any change to the root reference images.
    - Confirm that the tracked tree is clean apart from the intended changes.
    - _Requirements: 33.8, 34.10, 34.13_

  - [ ] 13.7 Final checkpoint — R12
    - Final exhaustive gate G: on the final cleaned tree, run typecheck, lint, build, full unit/property/regression suite, acceptance, all explicit-flag/count real-JVM suites from 12.2, torture/debugger/soak, full browser suite, reference convergence, performance and guardrail/integrity scans. Record all evidence and fail nonzero for missing execution, unexpected skips/count mismatch or any unresolved acceptance failure. Review final original-resolution captures and complete the polish pass.

  - [ ] 13.8 Push the branch and verify the remote tip
    - Run `git push origin reference-exact-rebuild` as a normal push, with no force, rebase or squash and no merge into main.
    - Verify that `git rev-parse HEAD` equals `git rev-parse origin/reference-exact-rebuild` and that the tracked working tree is clean.
    - Verify that root `best.png` remains tracked and unchanged, and exactly five root `ChatGPT Image*.png` references remain untracked and byte-identical; never add them.
    - _Requirements: 34.13_

## Notes

- Tasks marked `*` are optional presentation-detail tests (Property 64 and the material, pipeline and primitive snapshots). Every other test sub-task is required: the AppState, shell layout, layout anchors, SceneModel projection, flow catalog, planner budgets and clusters, timeline, transition player, value text, camera constraints and every other correctness property.
- Each property test references its design Correctness Property number and the requirement clauses it validates. All 66 properties are covered:
  - 1–4, 6–8, 13, 14, 17–19 in R1;
  - 9–12, 15, 16 in R2;
  - 20–33, 35, 36, 40–43 in R3;
  - 48–53, 59 in R4;
  - 5, 38, 47, 54–58, 60, 61 in R5;
  - 34, 37, 39 in R6, plus extensions of 25, 35 and 51;
  - 62–64 in R7;
  - 44–46 in R8;
  - 65, 66 in R9.
- Legacy checkpoints map to the integration/milestone/final cadence above; there are no execution waves. Task 13.8 follows accepted final 13.7 and is a future lead release action, not authorization to mutate Git during this correction pass.
- Interim code, with its named removal:
  - `InterimWorld` and the `world=v2` preview are removed in 5.7.
  - The legacy re-exports for `src/scene` metrics, `src/navigation/cameraConstraints` and `src/playback/playbackState`, and the v3 token aliases and `worldV2.ts` naming, are removed in 13.1–13.2.
- Browser, JVM, debugger, soak and performance workloads run serially in the lead-reserved slot against one dev pair/bridge; independent code ownership does not imply independent test infrastructure.
- The lead makes the intermediate commits. The only git-push task is 13.8.

## Implementation dependency reference

A → B → C → D → E → F → G is the main product progression. The milestone ownership table is the execution guide; parent R0–R12 groups and preserved item IDs locate acceptance details. A/B QA scaffolding and targeted correctness/performance checks precede their consumers. C needs B's stable IDs/ports; D extends B/C projection/navigation; E reuses their primitives; F plans over the full canonical world independently of its output; G converges the complete application and validates the cleaned final tree. Disjoint implementation may proceed in parallel only after the lead locks shared inputs and serializes common-file integration. No task-runner wave graph is prescribed.
