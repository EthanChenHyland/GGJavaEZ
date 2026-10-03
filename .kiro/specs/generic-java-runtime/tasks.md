# Implementation Plan — Generic Java Runtime World

Execute the phases in order. Each phase is independently mergeable, keeps all existing tests green (or migrates them with a written rationale), and ends with a checkpoint under `docs/checkpoints/v12-<phase>/` containing `performance.json`, the acceptance results and screenshots. **Do not start a phase until the previous phase's exit criteria are met and reviewed.** P7 (IDE) depends only on P0 and may run in parallel with P2–P6. It touches disjoint files; `app/` integration edits are serialized through the lead.

References: R = requirement number, INV = design §1 invariant.

---

## Phase 0 — Guardrails, baselines, acceptance corpus (no product behaviour change)

- [ ] 0.1 Create the `src/examples/` module and move curated-only code into it. Behaviour must stay identical.
  - Move: curated loaders and trace JSON, `scopedLayout`, the curated branches of `createLayout` (recursion staircase, Person main/child, single heap column), the Person `sceneHomePose` path, `ControlFlowStatus`, array compare/swap captions, and the `INPUT_READ` Scanner reducer case.
  - The generic `createLayout` delegates to `examples` only through one registration seam in `app/`. _R15, R16, INV-15_
- [ ] 0.2 Add ESLint rules:
  - `no-restricted-imports` (generic → examples/theater).
  - A custom `no-fixture-literals` rule that rejects `Person`, `setAge`, `factorial`, `bubble`, `swap`, `'Scanner'`, `obj-person`, `#17`, and the fixture coordinate tokens in generic modules.

  Fix any violations that surface. _R15.1–2_
- [ ] 0.3 Add the synthetic trace generator `src/testing/traceGen.ts` (seeded, schema v2 now and v3 later) and a Vitest bench harness. Record baseline numbers for current normalize, seek, layout and scene at 10k/100k/1M events. _R20_
- [ ] 0.4 Create the fresh acceptance corpus `fixtures/acceptance-v12/` (specified below). Include sources and `expected.facts.json` only; the facts express entities, relationships and evidence levels, never coordinates. Mark each fact `current` (should pass today) or `target:<phase>`. _R21_
- [ ] 0.5 Build the invariance harness `scripts/acceptance-variants.mjs`. It emits identifier-permuted and line-shifted variants of every acceptance project and compares normalized worlds up to renaming. _R15.3–4_
- [ ] 0.6 Build the real-JVM regression runs of `src/demos/*/Main.java` through the generic path. These are fact assertions, not coordinates. _R15.5_
- [ ] 0.7 Build the browser performance harness (Playwright). It measures:
  - orbit frame-time p50/p95/p99;
  - scrub adjacent/jump latency;
  - retained-load time;
  - live latency.

  Record the baseline on the reference machine. _R20_
- [ ] 0.8 Add invariant tests that already hold today: INV-1, INV-3, INV-5 (seek determinism across random paths), INV-6, INV-10, INV-12, INV-14.

**Exit:** lint clean; baseline `performance.json`; corpus committed with its `current` facts passing; no behaviour change (591 unit + 85 browser tests green).

---

## Phase 1 — Execution integrity and incremental transport

- [ ] 1.1 Recorder saturation replaces `halt(86)`. Probes short-circuit on `SATURATED`. Add the `capture_saturated` raw record. The server classifies `limit_exceeded` from that record, not from the exit code. _R1.1–2, INV-2_
- [ ] 1.2 Server: remove the SIGKILL on a second thread (record a partial capability instead). The duration clock excludes `stdin_wait`→`stdin_read` and debugger pauses. Raise the default limits (design §2.1). _R1.3–4_
- [ ] 1.3 Recorder: 64 KiB buffered writer, a 50 ms daemon flusher, and flush on stdin wait, pause, saturation and shutdown. Keep the pause watermark protocol. _R1.6_
- [ ] 1.4 Recorder: weak identity map with monotonic IDs, and remove `SEEN` strong retention. _R1.5_
- [ ] 1.5 Transport **longs as decimal strings** and NaN/±∞ as labelled values (raw v1.1, backward compatible). _R5.4_
- [ ] 1.6 Bridge: the file-backed raw trace; the DTO carries `rawEventCount`; SSE `raw` deltas; `GET …/raw?from=`; client acknowledge and resume. Keep a v11.5 retained-session loader. _R3.1, R3.4_
- [ ] 1.7 Client: extract `TraceNormalizer` (incremental; lookup tables only). `normalizeTrace` becomes a wrapper. Add byte-identical golden tests against current output on all existing fixtures and the product-audit sessions. _R3.2, R3.6_
- [ ] 1.8 `IdeWorkspace.acceptExecution`: append deltas; incremental `validateTrace`; time-slice ingestion to ≤ 8 ms per frame. _R3.3, R3.5, INV-16_

**Acceptance:**
- A program creating 5,000 objects (ACC-13) runs to completion with correct stdout, and its world shows a saturation notice if a limit is hit.
- A two-thread program is not killed.
- An interactive stdin program idle for 60 s is not killed.

**Exit:** the P1 budgets are met (transport proportional to delta; ingest cost-independence); all tests green.

---

## Phase 2 — Runtime core: history index, value model, freshness

- [ ] 2.1 Schema v3 contracts (additive):
  - `threadId`, `unavailable{reason}`, and generalized `RuntimeArray.elementType`.
  - `RuntimeClass`, `RuntimeCall` and `RuntimeThread` shapes.
  - `changedAt`/`observedAt`/`origin` on slots.
  - The `CLEANUP_HANDLER_ENTER` alias.

  The v2 loader stays. _R4.2–4, R4.7_
- [ ] 2.2 Normalizer emits `unavailable{reason}` in place of `uninitialized` for unsupported and unrepresentable values. Migrate the reducer's `assertCompatible`. _R4.3_
- [ ] 2.3 `HistoryIndex` (design §5): `append`, `view`, `materialize`, `entityTimeline`. Add oracle equivalence against `applyEvent` in dev and test. _R10, INV-4_
- [ ] 2.4 Replace `seek.ts` consumers (App, Inspector, DebugPanel, ErrorExplorer) with the history index. No `structuredClone`; states frozen in dev. _R10.3–4_
- [ ] 2.5 Reducer oracle performance: a displayId set, and persistent append lists for console/returns. _R20_
- [ ] 2.6 Move `RuntimeState.branch`/`arrayActivity` to cursor-event derivation; migrate consumers. _R4.6_
- [ ] 2.7 Scene: the `invocationStatus` vocabulary (`active`/`suspended`/`completed`/`unwound`/`interrupted`), per-frame exception state across all episodes, and freshness in the Inspector. _R8.2, R8.6, R9_
- [ ] 2.8 Transitions are fed from the history index and keyed by session trace ID. Rename `demoId` → `traceId`, keeping an alias. _R14.1_

**Exit:**
- The scrub budgets are met at 100k synthetic events.
- 1,000-path determinism passes.
- Retained graph-stress reload takes ≤ 2.0 s.

---

## Phase 3 — Storage coverage: arrays, statics, constructors, reference returns

- [ ] 3.1 **Spike (time-boxed, 2 days):** constructor true-start `enter` plus `receiver_ready` plus the frame token, across javac 17/21/25 output of the corpus. Write ADR-013 recording the result or the fallback (design §14). _R5.5_
- [ ] 3.2 Instrument every array opcode. Carry the generalized `array` record with element bound and truncation. Add reducer and scene support for primitive, object and nested arrays, including `String[] args`. _R5.1, R5.7_
- [ ] 3.3 `PUTSTATIC` probe and `class_init` statics snapshot. Add `CLASS_INIT`/`SET_STATIC` events and `RuntimeClass`. _R5.2_
- [ ] 3.4 Reference-typed returns become `RETURN_VALUE` with a reference `RuntimeValue`. _R5.3_
- [ ] 3.5 Implement constructor nesting per ADR-013. Add outer-instance `this$N` as a synthetic reference. _R5.5–6_
- [ ] 3.6 Wide-compare operand capture and `switch` records. Add `SWITCH_EVALUATE`. _R4.1_
- [ ] 3.7 Update `JAVA-VISUALIZATION-COVERAGE.md` from acceptance results. _R22.2_

**Exit:** ACC-4 and the enum/record parts of ACC-2 and ACC-3 pass their `target:P3` facts, and the invariance harness is green for them.

---

## Phase 4 — Call sites, provenance, library boundaries, I/O relationships

- [ ] 4.1 Transformer: `call` before `INVOKE*`, `call_return` for library callees, a per-thread pending callId consumed by `enter`, and `constructed` after `<init>`. Add the `callProbes` level. _R6.1–2_
- [ ] 4.2 Static operand provenance (`Analyzer<SourceValue>`) → `provenance.json` per build. Unit tests over javac patterns (ternary, `+=`, `++`, switch expressions, try-with-resources, lambdas, string concatenation via indy). _R6.3_
- [ ] 4.3 Normalizer provenance join:
  - parameter origins;
  - receiver → this;
  - local → field/static;
  - array read/write origins and destinations;
  - return destinations (`null` + `expression` otherwise).

  _R6.3–5, R6.7_
- [ ] 4.4 `CALL`/`CALL_RETURN`/`OBJECT_CONSTRUCTED` events and `RuntimeCall` state. Dispatch fact (declared vs actual). Persistent call-history edges in the scene. _R6.2, R8.7_
- [ ] 4.5 Library-call boundary nodes. Attach console and stdin records to the enclosing library call. Add the `stdin → call → value` and `value → call → stdout` flows. _R7.1, R8.8, R14.2_
- [ ] 4.6 Motion: new transition kinds; the name correlation is turned off by default and labelled when enabled; the evidence level is rendered. _R6.6, R14.2–3, INV-9_

**Exit:**
- In ACC-1, ACC-7, ACC-9 and ACC-10, every argument → parameter, return → destination and stdin → value that is `target:P4` is `proven`.
- No `correlated` flow is drawn by default.
- Recorder overhead is within budget on the corpus.

---

## Phase 5 — Generic layout, semantic LOD, scale, Focus

- [ ] 5.1 **Spike:** layout L1 vs L2 on the corpus plus synthetic traces, measured by the metrics in design §6.2. Write ADR-012. _R11.2_
- [ ] 5.2 `world/genericLayout.ts` with an incremental `LayoutBuilder`: regions, the chosen invocation placement, class shelves with CLASS heads, virtualized array strips, and incremental bounds. Remove `hasArrays`/`layoutKind`/origin branches from the generic path. _R11, INV-7, INV-8_
- [ ] 5.3 Headings, floor, fog and Home framing come from region bounds. Remove the D6/D7/D8/D9 constants from the generic path. Automated re-framing is suppressed during interaction or Focus. _R11.5, R13.6_
- [ ] 5.4 Semantic LOD (map/structure/detail) with a screen-space priority budget. Replace the `detailedScene` recency budget. Culling and adaptive labels. _R12.1, R12.6–7, INV-17_
- [ ] 5.5 Clusters: consecutive same-method sibling decks, recursion depth shafts, and library package collapse, all expandable in place. _R12.2–3_
- [ ] 5.6 Flow filtering by selection, kind and time window, with a screen-space edge budget. _R12.4_
- [ ] 5.7 Focus:
  - a "with context" mode (the default) and an "isolated" mode;
  - paged object rows and virtualized array cells;
  - recursion caller/callee navigation;
  - a session-replacement notice.

  Invocation-subtree isolation and object-neighbourhood isolation. _R12.5, R13.2–4, INV-13_
- [ ] 5.8 Migrate JVM layout exact-coordinate tests to property tests (append-only, non-overlap, adjacency, bounds growth), with a written rationale. _R21.1_

**Exit:**
- The camera and scene budgets are met at 5k and 50k invocations.
- ACC-13 and ACC-14 pass.
- The invariance harness is green on the whole corpus.
- A visual QA pass against references 06–11 is completed.

---

## Phase 6 — Library values and data freshness

- [ ] 6.1 Recorder safe summarization: Collection, Map, boxed, Optional, CharSequence and enum. Use the declaring-loader rule; add tests with user subclasses that override `size()`/`iterator()`. _R7.3_
- [ ] 6.2 `LIBRARY_OBSERVE` events, library-value shelf entities, and element references to project objects. _R7.3_
- [ ] 6.3 Re-snapshot at boundaries after library, reflective or MethodHandle calls. Add `OBJECT_RESNAPSHOT` with evidence `resnapshot`, and staleness hints in the Inspector. _R7.4–5, R9_

**Exit:** ACC-5, ACC-6, ACC-11 and the Set part of ACC-6 pass. A reflection-mutation probe shows a corrected field with `resnapshot` evidence.

---

## Phase 7 — IDE convergence (VS Code conventions); may run in parallel after P0

- [ ] 7.1 Decompose `IdeWorkspace` into `useProjectWorkspace`, `useExecutionSession`, `useBreakpoints`, `layoutStore` and `runtimeStore`. No visual change. Derived `mainClass`/`projectStatus`/`javaProject`; an `isActivePhase` helper. _R19_
- [ ] 7.2 Command registry, command palette (Ctrl/Cmd+Shift+P), Quick Open (Ctrl/Cmd+P), and Go to Symbol in Workspace (Ctrl/Cmd+T, reusing SymbolSearch). Remove the More actions gear. _R19.1, R19.6_
- [ ] 7.3 VS Code keybindings (R19.2). Remove conflicting Alt+Shift bindings. Save becomes global. The shortcut help is generated from the registry. _R19.2_
- [ ] 7.4 Bottom status bar. Remove the top status strip and the editor footer. Static bottom-panel tabs; auto open/close is limited to the stdin wait and build-failure reveals. _R19.3–4_
- [ ] 7.5 Run & Debug view: Call Stack (frame selection drives Variables and the editor), Variables ("Recorded values", expandable, freshness), Breakpoints (enable/disable/remove), and a floating icon debug toolbar with Restart and Stop. Remove the text strip and the "Inspect" button. _R19.5_
- [ ] 7.6 Remove workspace modes and per-mode widths. Rename workspace Focus to Maximize Runtime (a view-title toggle). Remove the Focus source drawer and the Focus-only tools toggle. _R13.5, R19.6_
- [ ] 7.7 Consolidate the runtime view title bar (R19.8). Move flow filter, motion quality and guided cues to Settings. Remove the entity `<select>` and the duplicate Return-to-world button. _R19.8_
- [ ] 7.8 Explorer: New Java Class by name with inline input, inline rename, single-confirmation delete, and breakpoint remapping on rename. _R19.7_
- [ ] 7.9 Remove dead code: `ide/visualize.ts`, the legacy bridge client endpoints and routes (after an e2e audit), and `TraceInspector` (it becomes a dev-only command). _design §0_
- [ ] 7.10 First-use browser test (VS Code user script): open project → navigate tree → create class → rename/delete → edit → save → run → console/stdin → breakpoint → debug step → inspect runtime → enter/exit Focus → Maximize/restore. Every step uses only standard labels and shortcuts. _R19_

**Exit:** the 7.10 script passes at 1728×1117, 1440×900, 1280×800 and 760×900; existing browser tests are migrated.

---

## Phase 8 — Threads as lanes (after P5)

- [ ] 8.1 Per-thread RuntimeState stacks, `THREAD_START`/`THREAD_END`, and a Call Stack grouped by thread. _R18.2_
- [ ] 8.2 Invocation-plane lanes per thread along z (design §6.1), with interleaving by global seq and a thread filter. _R18.2_
- [ ] 8.3 A multi-thread acceptance project (producer/consumer with `ExecutorService`): threads visible, no kill, deterministic scrub. Synchronization semantics stay **deferred**.

---

## Fresh real-Java acceptance corpus (`fixtures/acceptance-v12/`)

These projects are **new**. They must not reuse names, structures or sources from Person, factorial, bubble sort, the arrays/control demos, or the v11.5 audit fixtures. Each has `expected.facts.json` and passes the invariance harness. The question answered for every project is: **does Spatial understand this because its runtime model is generic?** Evidence for that is an isomorphic world under identifier permutation, plus facts derived only from semantic events.

| ID | Project (build) | Must be visible (facts) | Target phase |
|---|---|---|---|
| ACC-1 | **Clinic appointment scheduler** (Maven): `Clinic`, `Doctor`, `Patient`, `Slot`, `Scheduler`, `Invoice`; books, reschedules, bills | ≥ 6 project classes as objects; field writes with `proven` local→field origins; argument→parameter flows; return→destination on `Invoice total = scheduler.bill(...)`; completed calls greyed in place; final objects full-contrast with `observedAt` | P1 current / P4 provenance |
| ACC-2 | **Shape hierarchy** (plain): `Shape` (abstract) ← `Polygon` ← `Rectangle` ← `Square`; overriding `area()`/`describe()`; `super.describe()` chain; an enum `Unit`; a record `Dimensions` | Constructor frames nested Square→Rectangle→Polygon→Shape; actual override frames entered; dispatch fact declared `Shape.area` vs actual `Square.area`; enum constants as CLASS statics; record components as fields | P3 nesting/statics, P4 dispatch |
| ACC-3 | **Payment gateway** (Gradle, single project): interface `PaymentMethod` with `Card`, `Wallet`, `BankTransfer`; default method; strategy chosen at runtime from input | Interface-declared call sites dispatching to three implementations; default-method frame; implementations' objects on distinct class shelves | P4 |
| ACC-4 | **Seating chart** (plain): `Seat[][]` grid, `String[] names`, `double[] prices`, `char[] rowLabels`, `long[] ticketIds` with values > 2⁵³ | Object, multidimensional and all primitive arrays with element reads/writes; exact long values; `String[] args` visible; array-element references to `Seat` objects | P3 |
| ACC-5 | **Playlist manager** (plain): `ArrayList<Track>`, add/remove/sort with comparator lambda, iteration | ArrayList as a library value with size and elements referencing `Track` objects; re-observed after `sort`; library-call nodes collapsed under `java.util`; lambda body frames | P6 (P4 boundaries) |
| ACC-6 | **Word-frequency index** (plain): `HashMap<String,Integer>`, `TreeSet<String>`, `HashSet<Integer>`; `merge`, `getOrDefault` | Map entries summary (keys, boxed values); Set summaries; boxed values distinct from primitives; library-call boundaries with argument/return provenance | P6 |
| ACC-7 | **Order pipeline** (Maven, multi-package): `api.OrderController` → `service.OrderService` → `pricing.PriceEngine` → `inventory.Stock` → `persistence.OrderRepository` → `audit.AuditLog` (≥ 5 classes deep, ≥ 3 packages) | Call tree depth ≥ 6 with caller adjacency; call-site lines; persistent call edges after return; source navigation across packages | P4 / P5 layout |
| ACC-8 | **Maze solver** (plain): recursive DFS/backtracking on a `char[][]` grid, depth ≈ 60, with pruning returns | Recursion without factorial shape (branching, backtrack returns); depth cluster/shaft at map LOD; Focus on a deep frame keeps caller/callee navigation; unwinding greys in place | P5 |
| ACC-9 | **Config loader** (plain): `ConfigLoader.load` → `Parser.parse` → `Validator.check` → `Rule.apply` throws custom `ConfigException`, caught 3 frames up in `Main` with a `finally`-style cleanup | Throw origin, unwound frames retained and marked, catch frame, cleanup handler labelled as such; Error Explorer path; world retained after catch | P2 (status) current-mostly |
| ACC-10 | **Unit converter REPL** (plain): `Scanner` reads commands and numbers until `quit`; prints results; stderr for invalid input; idle ≥ 60 s during test | stdin → `Scanner.nextDouble` call → local `proven`; local → `println` → stdout `proven`; stderr write; not killed while idle; Console and world from one JVM | P1 (idle) / P4 (provenance) |
| ACC-11 | **CSV report with dependency** (Maven): uses `org.apache.commons:commons-csv` to parse an embedded string and aggregate | Dependency on the classpath, untransformed; `org.apache.commons.csv` library-call nodes collapsed by package; returned records summarized or unavailable-with-reason; project aggregation fully visible | P4 / P6 |
| ACC-12 | **Library catalogue** (Gradle, single project, ≥ 4 packages: `model`, `repo`, `search`, `app`) | Package-qualified classes and source mapping; class shelves per class; statics (`Catalogue.INSTANCE` singleton) on the CLASS head | P3 |
| ACC-13 | **Social graph** (plain): 3,000 `Member` objects, ~12,000 `follows` references, BFS for degrees of separation | Large object graph: shelves by class, map LOD clustering, object isolation of the 1-hop neighbourhood, edge budget, camera budget at scale; no saturation at default limits | P1 (no kill) / P5 |
| ACC-14 | **Event simulator** (plain): a discrete-event loop producing ≥ 200,000 semantic events and ≥ 5,000 invocations | Ingestion/scrub/load budgets; deterministic scrub; completed map equals the accumulated live geometry (no scene swap); invariance under permutation | P2 / P5 |

Additional probes (small, non-headline): a two-thread counter (P1 no-kill, P8 lanes); a reflection mutation (P6 re-snapshot); a user subclass of `ArrayList` overriding `size()` (P6: must be `unavailable{user-override}`, and user code must not run); an inner class accessing its outer field (P3 synthetic outer link); a lambda capturing a local (a P4 functional object node, with capture deferred).

---

## Regression requirements (every phase)

1. `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass. `npm run test:e2e` passes or is migrated with a written rationale in the phase checkpoint.
2. The v11.5 product-audit fixtures (banking-maven, dispatch-gradle, graph-stress-plain, focus-shapes-plain) keep passing. Retained v11.5 sessions still load (v1/v2 raw readers).
3. `/examples` curated traces render unchanged (examples-module tests).
4. The invariant tests from P0.8 onward stay green. New invariants gain tests in the phase that introduces them.
5. No budget in design §10 regresses by more than 10% from the previous checkpoint without review.
6. `JAVA-VISUALIZATION-COVERAGE.md` is regenerated from acceptance results at phase exit.

## Explicitly not in these phases

See design §12. In particular, do not start any of the following during P0–P7: a Java agent or dynamic classes, file-I/O visuals, GC/reachability, lexical scopes or loops as entities, synchronization semantics, debugger Watch/evaluate/conditional breakpoints, multi-module builds, Classic large-world, or a binary trace format.

---

## Phase 0 status (implemented; see docs/checkpoints/v12-p0/PHASE0.md)

Corrections found while implementing Phase 0, checked against the code:

- **0.1:** The curated layout branch was not cleanly separable inside `createLayout`. It is now `src/examples/curatedLayout.ts`, selected by `src/app/layoutForTrace.ts`. `src/app/` is the composition layer and is exempt from the import boundary, so it is *not* a generic module as design §9 implied.
- **0.1:** The `INPUT_READ` Scanner validation could not be moved without the Phase 2 reducer-extension mechanism. It remains in `state.ts` as an explicit lint exemption.
- **0.2:** The spec's fixture-word list (`Person`, `Scanner`, …) would also flag legitimate generic code that handles JDK types (for example a future `java.util.Scanner` library boundary in P4). The rule therefore checks literals only, and will need an allowlist once P4/P6 add JDK-aware summaries.
- **0.7:** The design §10 budgets assume a GPU reference machine. The sandbox baseline uses software WebGL, so only the pipeline (Node) numbers are comparable across environments.
- **ACC-13/14:** As specified, these cannot pass any `current` "large world" fact today, because the Recorder halts the JVM. Their current facts characterize the halt; the large-world facts are `target:P1`.

## User-scoped Phase 3 checkpoint

The later user request scopes Phase 3 to truthful invocation/value provenance, rather than all storage coverage above. Constructor true-start/receiver_ready/frame-token spike and real nested invocation semantics are implemented in [ADR-013](../../../docs/architecture/ADR-013-truthful-invocations-and-provenance.md). Installed JDK 26 and --release 17/21/25 class files are verified; actual 17/21/25 runtimes are unavailable. Synthetic pre-super outer links, broad arrays/statics/library coverage and Spatial 2.0 remain deferred. See [Phase 3 checkpoint](../../../docs/checkpoints/v12-p3/ARCHITECTURE.md) for the locked graph contract and final validation.
