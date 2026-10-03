# v12 Phase 3 — truthful invocations and value provenance

Branch: `kiro-runtime-audit`. Base: `d2dbedd`. This is the user-scoped semantic Phase 3; broader arrays/statics/library coverage in the older Kiro phase numbering remains deferred. Prior Phase 0–2 history and checkpoint evidence are preserved.

## Delivered architecture

- Additive raw v1 calls, successful call returns, producer recipes, instance-field reads, receiver readiness and completed NEW facts; semantic schema v2 `EXECUTION_FACT` events.
- An optional immutable ExecutionGraph inside RuntimeState, below React/Three. Invocations, calls, value versions, variable/field/cell storage, objects and I/O have stable IDs. Edges reference nodes with actual event/source/method/descriptor/bytecode-site context.
- Existing pure reducer and persistent engine share graph semantics through the existing storage seam. Deltas append new facts; history retains structurally shared roots and bounded checkpoints. Indexed queries expose caller/input/receiver, field writer/origin, return destinations, output and exception path.
- Evidence is `observed`, `bytecode-derived` or `unknown`. Source names/labels/lines cannot establish a relationship. Equality only checks an already identified producer against an actual operand.

See [ARCHITECTURE](ARCHITECTURE.md), [locked contract](CONTRACT.md), [ADR-013](../../architecture/ADR-013-truthful-invocations-and-provenance.md) and [current coverage](../../../JAVA-VISUALIZATION-COVERAGE.md).

## Semantic acceptance

| Requirement | Evidence and behavior |
| --- | --- |
| `super()` / `this(...)` | Constructors enter at their true beginning with a numeric frame token and null receiver. Actual initializing invoke is classified separately from nested NEW operands. Receiver becomes known only after initialization; verifier handler never covers uninitialized this. Derived→delegated Derived→Base are distinct nested invocations. |
| Exceptional constructor entry | Observed caller handlers reconcile outstanding pre-super frames with the real throwable. Without exception evidence the recorder stops rather than inventing unwind. An opaque unmatched callback under an uninitialized constructor stops as unsupported before publishing potentially stale ancestry; both swallowed-failure retry and legitimate opaque callback are tested with normal Java exit/complete output. |
| Calls, overloads and dispatch | Original call site plus declared owner/name/full descriptor and actual receiver/operands. Actual entered project method joins an exact pending resolved target/descriptor. Static/special inheritance, interface implementation/default methods, overloads and recursive invocations are covered. A library callback's observed ancestor is separate from its unknown direct caller. |
| Arguments and `this` | Exact local slot/live-range → actual argument → parameter, including different identifier names. Literal nodes have no fabricated variable; computed nodes retain opcode/operand recipes. Receiver→this keeps the same object ID. Exact origin slot disambiguates aliases. |
| Return flow | Supported primitive/project-reference/null returns have immutable return versions. Direct local assignment and direct return→argument reuse that version. `a()+b()` creates a distinct computed result with actual operand edges. References reuse one heap object; null creates no reference edge. |
| Fields/locals/references/arrays | Actual instance-field and local writes retain direct/computed/unknown producer and actual writer. Inherited field probes resolve symbolic owner/name/descriptor to the actual declaring owner; hidden fields remain distinct. Initial field snapshots are OBSERVE without fabricated writes. Aliases preserve identity and exact loaded slot. Existing int-array reads/writes fit the same graph; broader arrays are deferred. |
| Construction completion | Each constructor invocation can finish separately. A superclass/this return does not mark the enclosing object fully constructed. Only explicit completed NEW marks whole-object completion at its original allocation site. |
| Input/output | Wrapped stdin read-ahead bytes cannot establish consumption. Successful Scanner match retains actual lexeme, returned value and provable destination; failed reads have no successful result. stdout/stderr retain actual operation/site and emitted text. Formatting internals remain opaque; Console remains canonical. |
| Exceptions | Actual exception object/site, failed call, throwing invocation, unwind and catch are indexed in observed order. Unobserved library internals are not invented. |
| Source and invariance | Multi-package and duplicate-filename construction mapping uses actual allocating frame owner. Full corpus rename/line-shift checks retain method descriptors and bytecode identities. Graph-only identifier/line goldens also pass. |
| Partial recordings | Open invocations query as recorded-prefix-ended; no missing returns, writes, final values or caller edges are fabricated. One JVM continues after unchanged budgets, with complete Console and natural exit. |
| Legacy and motion | Retained legacy normalization goldens remain unchanged. Generic `correlatedSource` name/value guesses and the curated Scanner reducer validation exemption are removed. Motion consumes proven graph edges; unknown/computed sources without geometry remain destination-only. |

## JDK evidence

Actual installed/tested runtime: **OpenJDK 26.0.2.1**. Focused constructor programs compiled with **`--release 17`, `21`, `25`** verify and execute on that runtime. Actual JDK 17/21/25 runtimes are not installed and were not tested; class-file compatibility is not an actual runtime matrix.

Focused verifier tests cover true constructor entry, delegation, pre-super failures, nested same-class NEW, synthetic outer fields executing unchanged, conditional super operands, wide arguments, inherited dispatch, conservative local epochs and post-limit operand restoration. Two opaque-dependency boundary tests prove observation stops without changing application output/exit.

## Validation commands

The full final run is serialized; no simultaneous JVM/build/performance workloads.

```sh
VJ_PHASE3_JVM=1 npm test
GGJAVA_MAVEN_PATH="$PWD/.ggjavaez/tools/maven/bin/mvn" \
GGJAVA_GRADLE_PATH="$PWD/.ggjavaez/tools/gradle/bin/gradle" \
VJ_ACCEPTANCE_REPORT=docs/checkpoints/v12-p3/acceptance-results.json npm run test:acceptance
VJ_SUITE=perf VJ_PERF_OUTPUT_ROOT=docs/checkpoints/v12-p3/phase2-regression \
./node_modules/.bin/vitest run tests/perf/incremental.test.mjs tests/perf/policy.test.mjs \
tests/perf/million.test.mjs tests/perf/world-projection.test.mjs \
--execArgv=--expose-gc --execArgv=--max-old-space-size=3072 --maxWorkers=1 --fileParallelism=false
VJ_SUITE=perf ./node_modules/.bin/vitest run tests/perf/provenance.test.mjs \
--execArgv=--expose-gc --execArgv=--max-old-space-size=3072 --maxWorkers=1 --fileParallelism=false
VJ_PHASE3_JVM=1 ./node_modules/.bin/vitest run tests/provenance/performance-jvm.test.mjs \
--execArgv=--expose-gc --maxWorkers=1 --fileParallelism=false
npm run typecheck
npm run lint
npm run build
VJ_QA_OUTPUT_ROOT=docs/checkpoints/v12-p3 npm run test:e2e
```

Real-JVM graph tests are opt-in to keep default uncoordinated test runs bounded; the final full gate sets the flag and runs every assertion. The existing Phase 1 transparency tests and Phase 2 equivalence/history/transport tests are included in the unit/integration suite. See [gates.json](gates.json) for final totals, [acceptance-results.json](acceptance-results.json) for actual project outcomes and [PERFORMANCE](PERFORMANCE.md) for heap/CPU measurements.

## Final gate results

| Gate | Final result |
| --- | --- |
| Unit/integration, with real-JVM Phase 3 enabled | **918 passed**, 84 files; 130.32 s |
| Phase 0 acceptance | **177 passed + 18 expected failures**, 195 total; 160.85 s |
| Existing Phase 2 performance probes | **4 passed**; 25.24 s |
| Paired enriched pipeline performance | **1 passed**; 5.18 s, explicit GC |
| Separate actual-JVM performance | **1 passed**; 2.78 s, explicit GC |
| Typecheck / lint / build | **Passed** |
| Complete browser suite, one worker / zero retries | **90 passed**; 7.9 min |
| Capture evidence | **89 PNGs**, 13 representative original-size manual reviews, four target sizes |

Build retains the existing large-chunk and Troika static/dynamic import warnings. They do not fail compilation. Counts above refer to separate gates and must not be summed as unique tests. Final browser results include all corrected exception cursor checks; no test was excluded or retried to obtain the pass.

## Delegation and lead convergence

- **Newton:** OfflineTransformer/Recorder, original-bytecode recipes, verifier-safe constructor/call instrumentation and focused real-JVM tests, including the final opaque-library boundary regression.
- **Kierkegaard:** generic motion consuming graph edges; removal of name/value correlations; exact alias-slot mapping and bounded endpoint resolution/tests.
- **Pauli:** four fresh Java projects, semantic golden assertions, rename/line invariance, partial-prefix/query tests and best.png design note.
- **Lead:** locked contracts; normalizer/graph/pure/persistent integration; exact origin slots and observed-ancestor distinction; honest observed-field writers and unsupported returns; bounded index memory convergence; allocating-source/whole-construction fixes; acceptance migration; all final gates, visual review, documentation, diff review, commit and push.

All worker diffs were reviewed. Workers owned disjoint modules; no worker commits, parallel JVM workloads or new scene-specific visual systems.

## Visual review and preserved interaction

See [screenshots.json](screenshots.json) for capture hashes/sizes and reviewed images. Captures are local ignored bulk QA media; the small manifest is tracked. Root best.png is intentionally tracked and remains at the root, with [BEST_REFERENCE](BEST_REFERENCE.md) describing future direction and semantic constraints.

The added real-browser constructor test proves actual graph normalization, nested caller identities, same receiver object, immutable restored head, stable object identity across backward/forward scrubbing, retained completed world, Focus and reload without another Run. Four target-size Focus images were inspected at original size: 1728×1117, 1440×900, 1280×800, 760×900. Full-suite overview captures supply the true XYZ depth check, since front-face Focus intentionally prioritizes reading.

No shell/material/camera/timeline redesign was attempted. Minor presentation correctness: an observed unsupported return displays unavailable rather than pretending it is still pending; generic motion renders only proven flows. Error Explorer navigation includes the paired graph fact for the same exception/frame, restoring the actual paused head without stepping across another Java operation. The stress-world browser harness now distinguishes actual Java completion from a stopped recording and selects only observed historical invocations. Dense overview clutter, undersized Focus identities at 1280/760 widths, small overview labels and long-name inspector wrapping remain prior visual limitations for Spatial 2.0. This is semantic Phase 3 acceptance, not a claim that the current composition already matches best.png.

### Comparison against references 06–11 and the design system

| Check | Review conclusion |
| --- | --- |
| True depth / common geometry | Person and dispatch overviews show actual top/side faces, extrusion, perspective and separated Stack/Heap regions. Focus deliberately faces the information surface; its frontal still is not used alone as the depth proof. |
| Readable owning faces | Constructor, active deposit, archived recursive invocation, object and int-array Focus captures were checked at the target sizes. Values stay attached to the actual entity; small overview labels and dense scenes remain limitations. |
| Semantic emphasis / restrained glow | Cyan identifies actual active execution/selection. Completed frames remain quieter; heap and stack retain shared materials. No arbitrary neon system, floating output decoration or fake background runtime objects was added. |
| Reference truth | Generic flows use observed/bytecode-derived graph edges and exact loaded slots. Literal, computed or unknown producers without owning geometry do not acquire invented source endpoints. Existing reference geometry and navigation are preserved. |
| Time / navigation | Browser checks cover backward/forward seeking, immutable restored head, retained completed world, partial-recording labels, Focus, free navigation and LIVE/HISTORY. Neither scrubbing nor Focus allocates a duplicate receiver object. |
| Scope of polish | The convergence pass fixed allocation source mapping, whole-object construction completion, exception navigation and truthful partial-world QA. Full shell composition, clustering, materials and Spatial 2.0 visual transformation remain deferred by the user. |

Three browser cursor assertions were migrated from the pre-graph exception prefix to the paired semantic operation. Each asserts the exact throw/catch exception and invocation IDs in the next fact before checking that committed cursor; the assertions do not skip to an arbitrary later event.

## Remaining boundaries

Merged/unsupported stack producers and temporally ambiguous local operands remain unknown. Synthetic outer/captured fields, opaque library internals/formatting, reflective state changes, unsafe long ranges, broad arrays/statics/collections, additional token parsers, dynamic class loading and concurrency remain incomplete. Opaque callbacks during uninitialized constructor evaluation stop conservatively; unavailable field declaration metadata stops only after a successful original operation. Rich semantic retention and CPU cost are substantial and measured; no enriched million-event or dense GPU capacity claim is made.

Before broader Java coverage: extend value fidelity, static/array/library state and source/runtime boundaries with fresh semantics tests. Before Spatial 2.0: design geometry and paths around this graph, preserving actual runtime entities, readable owning faces, stable XYZ identity, completed history and user camera override. No later phase begins automatically.

## Launch

```sh
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173/ide`. The owned development process is left running with one Vite listener on 5173 and one bridge listener on 8787.
