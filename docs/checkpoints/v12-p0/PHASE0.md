# v12 Phase 0: measurement and regression foundation

Spec: [.kiro/specs/generic-java-runtime](../../../.kiro/specs/generic-java-runtime/tasks.md). Phase 0 only. No limits, transport, Spatial design or IDE (Phase 7) behaviour changed.

Environment: Linux sandbox (8 vCPU), Node 24.21, OpenJDK 25.0.2, Maven 3.9.16, Gradle 8.14.5, and headless Playwright Chromium 153 with software WebGL. This is **not** the design §10 reference machine. Read the numbers as baselines for comparison between phases, not as absolute budget results.

## What was added

| Task | Deliverable |
| --- | --- |
| 0.1 | `src/examples/`: curated traces (`demos/`), loaders (`traces.ts`), catalog, `curatedLayout.ts` (the pre-Phase-0 non-JVM branches of `createLayout`, extracted verbatim), `scopedLayout.ts`, `ControlFlowStatus.tsx`, and the compare/"swap" caption. The single seam that composes them is `src/app/layoutForTrace.ts`. The generic `src/world/layout.ts` is now JVM-only. **Behaviour-preserving:** `tests/golden/layoutGolden.test.mjs` compares 98 layout hashes (4 curated traces × curated/JVM provenance × prefixes) recorded from the *unmodified* code before extraction. A mutation check of both the generic and the curated path confirmed that the golden fails when either changes. |
| 0.2 | ESLint `no-restricted-imports` (generic → `examples`/`theater`/`demos`) and the custom `visual-java/no-fixture-literals` rule (fixture words in strings, templates and JSX, plus the curated HEAP coordinate). `tests/guardrails` proves both rules fire, are word-bounded, and exempt only `src/examples`, `src/app` (imports only) and tests. Two **explicit, referenced exemptions** remain: `state.ts` `INPUT_READ` Scanner validation (D13, needs the P2 reducer-extension mechanism) and the RuntimeCanvas HEAP label coordinate (D6, P5 task 5.3). |
| 0.3 | `src/testing/traceGen.ts`: a seeded synthetic Recorder-v1 generator with no fixture names. `npm run perf:baseline` writes `performance.json`. |
| 0.4 | `fixtures/acceptance-v12/`: 14 fresh projects, each with `expected.facts.json` (96 `current` + 37 `target:Pn` facts; curated demos add 18 + 2). `npm run test:acceptance` runs them through the production BuildService → resolveLaunch → manifest → DebugManager → normalize → seek/layout/scene path. |
| 0.5 | `scripts/acceptance-variants.mjs`: identifier-permuted and +3-line-shifted variants. The world signature covers events, frames, objects, anchors, bounds and console output. |
| 0.6 | The curated demos' `Main.java` files run on the real-JVM generic path (`tests/acceptance/curated.facts.json`). |
| 0.7 | `npm run perf:browser` (opt-in `perf-e2e/`) writes `browser-performance.json`. |
| 0.8 | `src/testing/invariants.test.ts` covers INV-3/4/5/6/10/14 on curated and generated traces, with a coverage index for INV-1/7/8/12/15. |

## Characterization tests (current behaviour pinned; desired behaviour as `test.fails`)

| Bug | CURRENT test (passes today) | DESIRED test (expected fail until the phase lands) |
| --- | --- | --- |
| X1/X2 Recorder budgets (`tests/characterization/recorderBudgets`) | With production limits unchanged, each of **objects (300 > 256), events (> 20,000), live frames (depth 200 > 128) and bytes (> 8 MiB)** halts the JVM with exit 86 and `[VisualJava] trace limit exceeded: <reason>`. The program's `DONE` line is never printed. The prefix normalizes to `PROGRAM_ABORT limit_exceeded`. | Phase 1, task 1.1: exit 0, `DONE` printed, saturation record present. |
| X4 duration counts stdin wait (`sessionBudgets`) | Run waiting on `System.in.read()` is killed `limit_exceeded` with the last raw event `stdin_wait`. | Phase 1, task 1.2: late input completes the program. |
| X3 second thread (`sessionBudgets`) | (a) The server kills the JVM: `failed` / `unsupported` / "Multiple project threads". (b) The client normalizer independently aborts any two-thread prefix. | Phase 1, task 1.2: the program completes. |
| Constructor nesting (`constructorNesting`) | `Base.<init>` and `Derived.<init>` both have caller `main`, and Base enters first (raw and normalized). `this(...)` delegation shows the same sibling pattern. | Phase 3, R5.5: Base nested under Derived, and the delegated constructor nested under its delegator. |

Acceptance target facts are also `test.fails`. Any target fact that starts passing fails the suite and must be promoted to `current`.

## Acceptance results (real JVM, production limits)

`npm run test:acceptance`: **156 passed, 39 expected-fail, 0 failed** (195). The 156 passes are 96 corpus facts, 18 curated-demo facts, 14 freshness checks and 28 invariance checks (identifier permutation and +3-line shift for every project). The 39 expected-fails are the 37 + 2 target facts.

| ID | Project | Today | Main gaps (target facts) |
| --- | --- | --- | --- |
| ACC-1 | Clinic scheduler (Maven) | exit 0; 23 invocations, 10 objects | reference return (P3), statics (P3), return destination and argument origins (P4) |
| ACC-2 | Shapes: abstract class, override, super chains, enum, record | exit 0; override and `super.describe()` chain correct | ctor nesting (P3), enum statics (P3), call sites (P4) |
| ACC-3 | Payments: interface + 3 implementations + default method (Gradle) | exit 0; dispatch visible via callee frames | call-site/dispatch facts (P4) |
| ACC-4 | Seating: object/2-D/primitive arrays, longs > 2⁵³ | exit 0; only `int[]` visible | exact long (P1), `Seat[][]`/`double[]`/`char[]`/`long[]`/`String[]` (P3) |
| ACC-5 | Playlist: ArrayList, lambdas | exit 0; lambda bodies visible | ArrayList value (P6), library boundaries (P4) |
| ACC-6 | Word index: HashMap/TreeSet/HashSet | exit 0 | collection values (P6), boundaries (P4) |
| ACC-7 | Order pipeline: 6 packages, depth 6 (Maven) | exit 0; full call chain | destinations/origins/call sites (P4) |
| ACC-8 | Maze backtracking recursion | exit 0; depth 42, 126 invocations | `char[][]` (P3) |
| ACC-9 | Checked exception caught 4 frames up | exit 0; throw/unwind×4/catch correct | none |
| ACC-10 | Scanner REPL with stdout/stderr | exit 0 | stdin → variable (P4); a 60 s idle wait without being killed (P1) |
| ACC-11 | commons-csv dependency (Maven) | exit 0; project code visible | library boundaries (P4) |
| ACC-12 | Catalogue: 4 packages, singleton (Gradle) | exit 0 | statics, reference return (P3) |
| ACC-13 | Social graph: 3,000 members / 12,000 follows | **exit 86** at 256 identities; program never prints | completion and full graph (P1) |
| ACC-14 | Event simulator | **exit 86** at 20,000 raw events (24,765 semantic); program never prints | completion, ≥ 200k events, ≥ 5k invocations (P1) |

## Baseline metrics

The full data is in [performance.json](performance.json) (pipeline) and [browser-performance.json](browser-performance.json).

Pipeline, on synthetic traces with the unchanged code:

| Semantic events | normalize | validate | cold seek to end | random jump p50 / p95 | adjacent step p50 | full transitions | µs/event (norm+val) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 6,264 | 130 ms | 113 ms | 59 ms | 3.1 / 4.2 ms | 2.0 ms | 52 ms | 39 |
| 12,387 | 414 ms | 388 ms | 281 ms | 7.5 / 16 ms | 3.7 ms | 298 ms | 65 |
| 24,591 | 2.0 s | 2.0 s | 1.8 s | 26 / 72 ms | 7.5 ms | 1.8 s | 163 |
| 61,172 | 14.4 s | 14.4 s | 13.7 s | 146 / 473 ms | 26 ms | 13.7 s | 471 |
| 122,139 | 66.7 s | 67.1 s | 65.7 s | 591 / 2,087 ms | 68 ms | 64.8 s | 1,095 |

- **Fitted cost exponent: 2.2** (super-linear in the reducer fold). Projected normalize+validate for 1M events is about 3.3 h, so 1M was not run.
- Layout and scene build stay cheap: 103 ms and 79 ms at 122k events.
- **Live ingest** (re-normalize, validate and lay out the whole prefix on each publish, plus full SSE resend): 20 publishes of a 20k raw trace cost **27.5 s** of client CPU in total. The last publish was 143× the first. **40.7 MB** went over SSE, with 3.9 MB in the last snapshot.
- Real JVM: ACC-14 (24,765 events) normalized in 2.7 s, and the world built in 1.4 s, in Node.

Browser, ACC-14 through the real UI, headless with software WebGL:
- Run → first world: 4.3 s. Run → full world: **64 s**. Retained reload → interactive: 9.8 s.
- Scrub jump p50 **13.8 s**, adjacent step p50 **11.8 s**.
- Idle and orbit at about 1.5 fps.

These browser figures are dominated by software rendering, so they are only an environment-local baseline. They are still directionally consistent with v11.5's 5.3 s reload and 212–840 ms scrubs measured on a GPU Mac.

## Regression gates

- `npm run typecheck`, `npm run lint` and `npm run build`: passed.
- `npm test`: **634 passed, 1 failed, 8 expected-fail** (643 tests, 68 files; baseline 590 passed + 1 failed of 591). The single failure, `server/debug-manager.test.mjs` › "running deadline fails with an honest prefix", is pre-existing and identical at baseline `4f07444`. Its 500 ms `timeoutMs` is also applied to `javac` helper compilation, which takes longer than 500 ms in this sandbox. It is not caused by Phase 0.
- `npm run test:e2e` (85 tests, bundled headless Chromium instead of the Chrome channel): **76 passed, 5 failed, 4 did not run** (run in three serial chunks). The baseline at `4f07444` in the same sandbox, run the same way, gave **73 passed, 6 failed, 6 did not run**.
  - The 3D picking/playback tests (arrays:107, control:266, recursion:44, refinement:17; person:42 at baseline) fail **identically, and intermittently, on an unmodified baseline worktree** (re-run twice). They depend on pixel picking and timing under software WebGL.
  - java-project-m9:191 fails on the JDT rename UI in this sandbox.
  - product-audit-m11_5:229 fails on a screenshot timeout on the 21k graph.
  - The serial suites skip their dependants after these failures.
  - No test fails only with Phase 0.
- Test files and fixtures moved to `src/examples/demos` had their paths updated. No assertion was weakened.
