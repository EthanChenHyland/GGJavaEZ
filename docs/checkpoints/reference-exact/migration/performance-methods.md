# Modern world CPU performance methods

The opt-in harness is `tests/perf/reference-world.test.mjs`. It calls the modern production `createLayoutEngine`, `createSceneProjector.project/advance`, `createFlowCatalog` and `planPresentation` APIs. It imports no legacy `layout.ts` or `sceneModel.ts` pipeline and changes no runtime/normalizer contract.

The lead reviewed and executed the harness serially after the complete unit and browser gates. The initial runs exceed budgets; this is measured diagnostic evidence, not performance approval. All outputs are retained in ignored QA directories.

## Execution and output

From the repository root, after other heavy checks finish:

```sh
VJ_SUITE=perf npx vitest run tests/perf/reference-world.test.mjs --execArgv=--expose-gc --maxWorkers=1 --fileParallelism=false
```

`VJ_SUITE=perf` is required both by the repository's test inclusion rules and the harness's explicit opt-in. Without it the case is skipped; a skipped case is not performance evidence. The command runs only this new file. A syntax-only check is:

```sh
node --check tests/perf/reference-world.test.mjs
```

The default artifact is the ignored `.ggjavaez/qa/reference-exact/modern-world-performance.json`. `VJ_PERF_OUTPUT_ROOT` can select another output directory; the filename remains `modern-world-performance.json`. Existing Phase 2/3/5.5 checkpoint files are not overwritten. Subsequent executions replace this harness's latest artifact; archive it externally if comparing runs. The report is written initially and after each completed configuration, and semantic/budget failures are persisted before the test fails. A failed configuration can leave earlier samples and an error, never a fabricated successful sample.

## Single-event scaling guard

Two validated normalized workloads allocate exactly 1,000 and 20,000 runtime objects through `ExecutionHistory.append`, plus one active `bench-main` frame. The generated objects are ordinary empty-field PROJECT `bench.Node` records. They are actual semantic objects, not fake render instances or copied state dictionaries. This isolates world-size scaling for LINE_EXECUTE; it does not establish costs for wide objects, huge arrays, or rich references.

Each workload attaches the same accepted history to its append-only trace, validates the live document, constructs the actual layout/projector, and applies 20 LINE_EXECUTE warmups followed by **100 measured single-event batches**. Both worlds are constructed before either starts updating. Each round advances both worlds, alternating which size goes first; both keep independent validated histories and projectors. Every batch has the same event kind, same active frame and same valid source line. Event identity and ordinal change normally. History validation/reduction, history attachment and layout append are timed separately outside `SceneProjector.advance`. Context construction and semantic checks also lie outside its timer. Initial projection and initial layout/history construction are reported separately.

Every update asserts cursor/event/source truth, the one-frame live stack, unchanged object-order/reference identities, and identity sharing for **every untouched projected object**. No checks are loosened on budget failure. The median is the arithmetic midpoint of the two middle sorted samples. The reported ratio is the 20,000-object median divided by the 1,000-object median; the budget is **≤ 2**. An exceeded budget fails after the remaining corpus samples are collected. The report does not infer a production bottleneck from a timing ratio; profiling is needed to distinguish traversal, GC, JIT and other causes.

## Generated provenance corpus

The existing seeded `generateRawTrace` runs with seed 42 and `provenance: true`, requesting **200, 5,000 and 20,000 raw events**. It may exceed these targets to balance recorded frame exits; requested and actual counts are both reported. These are generated producer facts exercising real normalization/graph/reduction APIs, **not JVM evidence**. Raw NDJSON size and SHA-256 identify the generated input.

Separate timers record generation, NDJSON parsing, normalizer construction, 256-record raw append batches, normalization finish, layout construction, projector indexing, initial projection and FlowCatalog indexing. Production `TraceNormalizer.append` synchronously validates/reduces into its own `ExecutionHistory`; its integrated cost is reported accurately. There is no fictional independent normalization-only measurement or duplicate timed reduction pipeline. The actual validated history is attached/shared and its live state identity is checked.

Each corpus exercises **100 distinct deterministic spread seeks**, including zero and live head, with stride 37 permuting the evenly distributed cursors so direction changes repeatedly. It separately times materialization, projection, complete Flow prefix resolution, bounded Flow query, and each FAR/MEDIUM/CLOSE plan. All levels use the same actual SceneModel at that prefix. Planning uses Trace All, no Focus and no selection; it measures CPU work associated with those INTERACTIVE-style detail cuts, not an instantiated renderer quality tier. Prefix/query calls can internally seek to resolve semantic endpoints; their real internal costs stay in those stage measurements. Complete prefix resolution precedes planning, so the latter benefits from its cache. This sequence is explicit; it is not a cold-planner timing claim.

Checks enforce unique prefix identities, accepted provenance edge membership, no future evidence, stable canonical anchors, complete/disjoint scene accounting and exact individual/bundle/unavailable/scope counts for references, history and Flow. If root Flow integration is incomplete, those assertions fail instead of treating missing facts as a performance improvement. Per-seek scene/cluster/curve/bundle accounting and raw timing samples are retained in the report.

## Retained heap ratio

Heap deltas are taken only with a real `globalThis.gc` available. Generated raw records, parsed records, NDJSON and manifest already exist before the semantic baseline. Semantic retention includes the production normalizer, history, normalized events, graph and checkpoints. After that checkpoint the harness constructs layout/projector/FlowCatalog, the final SceneModel and one retained final plan per detail level. A second forced-GC checkpoint measures their incremental retained heap before the spread-seek workload.

This is a conservative presentation-state estimate including derived indexes/caches and all three retained plans, rather than exact SceneModel-only attribution. Sharing with the semantic baseline is intentional. It is not a renderer-memory figure. A positive semantic delta and nonnegative presentation delta permit the measured presentation/semantic ratio; **≤ 25%** passes, exceeding it fails. Nonpositive/negative unstable deltas or absent explicit GC produce `not measured`, with no ratio and no fabricated pass. The raw heap readings and attribution caveat remain in the report. A successful CPU test with memory `not measured` leaves that gate open.

## Limits and root reconciliation

This is a single-process, one-construction-per-configuration probe with counterbalanced update order. JIT, GC, caches and ambient system load can affect ratios; no confidence interval is claimed. The report includes Node/OS/CPU/memory/GC metadata and all sample durations. Targets and sample counts have no environment override that could weaken the gate. Extra forced-GC checkpoints after layout, projector indexing, initial scene, Flow indexing and final plans expose incremental retained heap by stage; negative differences remain visible and are not converted into zero.

GPU timings, browser frame timing, draw calls, renderer memory, cold application startup/time-to-world, Focus/Home latency, sustained native interaction, picking, shadows, transparency/post-processing, orbit/view-tile memoization and built bundle size are explicitly **not measured**. The 100-seek planning probe must not be cited as proof that orbit without a tile change avoids planning. Browser/GPU probes and final product performance reporting remain root responsibilities.

The harness uses the integrated modern complete `FlowCatalog.prefix` and `PresentationPlan.flowPresentation` contracts. No runtime, package or normalization contract changes are made by this harness.

## Initial measurements — 2026-10-12

Node 24.20.0 on Apple M4 Pro, explicit GC available. All three generated corpora complete 100 distinct spread seeks with semantic/identity/accounting assertions intact. The requested 200/5,000/20,000 raw targets produce 208/5,024/20,018 raw records, 367/8,875/35,346 normalized events and 187/3,893/15,375 graph edges. These are generated facts, not actual JVM or Dense_Sample measurements.

The original fixed small-before-large run fails at a 4.280 update ratio; an unchanged repeat fails at 2.187. A run adding only heap-stage diagnostics passes its update ratio at 1.501. No production update code changed between those runs. To reduce order/JIT/system-load bias, the harness now constructs both worlds first and alternates first-updated size. That run passes the unchanged 2x guard at 1.123 (0.016104 / 0.0180835 ms medians). Earlier failures remain preserved; this variation is not evidence of a diagnosed or repaired production bottleneck.

Every run still fails generated retained-memory checks. The counterbalanced run's presentation/semantic ratios are 1.638, 0.721 and 0.645 against 0.25. In the attribution run, the largest corpus retains 52.79 MiB of semantic state and adds 4,435,696 bytes of layout, 11,263,208 of projector indexes, 6,207,992 of initial scene, 5,897,560 of Flow indexes and 7,773,264 of final plans/resolved flows. These are incremental heap estimates, not exact per-object attribution. Optimization and an actual Dense_Sample memory gate remain open.

At the largest generated corpus, the attribution run's p95 materialization/projection/Flow-prefix costs are recorded in its JSON. Stage costs and all samples are kept in `modern-world-performance.json`, `perf-repeat/modern-world-performance.json`, `perf-attribution/modern-world-performance.json` and `perf-counterbalanced/modern-world-performance.json` under `.ggjavaez/qa/reference-exact/`. The test exits 1 on memory failure; neither budgets nor assertions are waived. GPU/browser/sustained/cold-load targets remain unmeasured by these CPU runs.

## Heap and replay diagnostic checkpoint

The completed opt-in heap run retains its report in `perf-heap/modern-world-performance.json` and its 400,253,908-byte V8 heap snapshot in `perf-heap/retained20k.heapsnapshot`, under the ignored reference-exact QA directory. Snapshot capture occurs before spread seeks and outside stage timers; it took 4,825.78 ms. Set `VJ_PERF_HEAP_OUTPUT` to request this diagnostic explicitly. Ordinary benchmark runs do not capture a heap snapshot.

Its counterbalanced update ratio is 1.061, while presentation/semantic ratios remain 1.602/0.714/0.641: the test exits 1 on all three unchanged memory budgets. After 100 spread seeks, forced-GC retention increases by 8,180,408 / 33,824,024 / 109,549,592 bytes over the pre-seek presentation checkpoint. These replay deltas include semantic recent/checkpoint changes, derived caches and measurement/report arrays; they are not isolated presentation attribution. They motivate inspecting cache lifetimes, without claiming a cause or a completed repair from the totals alone. Earlier baseline artifacts remain preserved.

## One-prefix Flow endpoint cache — 2026-10-13

`FlowCatalog` previously kept a WeakMap of endpoint maps for every semantic graph retained by history. Repeated complete-prefix resolution could therefore retain a separate derived map at many checkpoint/recent roots. It now keeps one graph identity and one endpoint map, clearing derived records when the currently resolved graph changes. Semantic history, accepted evidence, prefix completeness, stable IDs and real endpoint resolution remain unchanged. Backward seeks recompute from their actual semantic prefix.

The focused Flow suite passes ten tests in 1.30 seconds, including two 100-run properties and a new repeated-rewind comparison against a fresh catalog through assignment and retirement. The first version of the new assertion incorrectly treated recorded retired endpoints as necessarily absent from complete provenance; it now distinguishes complete recorded evidence from the existing drawable-query retirement check. No runtime behavior was changed to accommodate that assertion.

The same counterbalanced generated benchmark after the cache change, saved in `perf-current-cache/modern-world-performance.json`, passes the 2x update guard at 1.055. Post-100-seek forced-GC increments are 7,272,104 / 10,310,160 / 16,673,704 bytes, compared with the preceding diagnostic's 8,180,408 / 33,824,024 / 109,549,592 bytes. This is a single-run whole-diagnostic comparison with the documented semantic/report attribution caveat, not an isolated per-cache heap proof or statistical confidence claim. The structural cache bound no longer multiplies endpoint records across retained graph roots.

Pre-seek presentation ratios remain 1.616 / 0.722 / 0.642 against 0.25, and the test exits 1 on all three unchanged memory gates. The cache-lifetime repair does not reduce initial layout/projector/index retention or complete-prefix O(E) work; those gates remain open.

## Prepared routing diagnostic — 2026-10-13

The recording-owned bounded router is now supplied to all three retained plans and each spread-seek plan, matching the production compiler ownership. Its geometry contexts and paths remain live through the explicit-GC checkpoints; the harness does not discard that cache to improve memory. The completed report is `perf-prepared-routing/modern-world-performance.json`. The counterbalanced update ratio passes at 1.136; presentation/semantic ratios still fail at 1.746/0.750/0.651 against 0.25. The largest corpus retains 55,661,400 semantic bytes and adds 36,251,232 presentation bytes. Stage deltas are 4,717,704 layout, 11,232,240 projector index, 6,210,864 initial scene, 5,888,064 Flow index and 8,202,360 final plans/resolved paths. Signed negative deltas in smaller configurations remain recorded.

After 100 seeks, diagnostic forced-GC increments are 7,305,720 / 10,348,800 / 17,094,520 bytes. The ending routers retain two contexts each and 17/71/110 paths; total computed routes are 1,911/8,313/10,828. This test exits 1 on all three unchanged memory budgets. These Node generated-data measurements do not replace actual Dense JVM memory attribution, native command latency or WebGL submission evidence.

The spread-seek benchmark now invokes production `SceneProjector.advance` with the preceding cursor, matching the application compiler. Earlier reports invoked `project` directly and remain preserved; their projection times are not identical-path comparisons. The 100 distinct spread cursors, complete Flow/accounting checks, all detail levels, explicit GC checkpoints and fixed budgets are unchanged. Single-event scaling still measures the same incremental LINE_EXECUTE path.

A Node diagnostic reconstructs the retained actual Dense JVM session `7f22cf7b-95ba-49fc-b893-cf30ea3ef9c3` and compares advance/rebuild at 100 spread cursors. After repairing stale repeated collection-observation evidence, all compared SceneModels agree. Before the large-jump change, 63 forward jumps have median advance/rebuild 3.126/0.896 ms; 37 reverse jumps have 0.479/0.355 ms. This is a single-process Node diagnostic, not native browser-budget approval. It motivates using full reconstruction for long jumps through a compact catalog: skipped events above `max(256, 4 × prior entity count)` use the already reconstructed runtime prefix. Small steps keep the sparse incremental path and stable untouched leaves. A separate 100-run property compares long forward jumps, one-event steps and reverse replay against reconstruction, including exact evidence and anchor identity. Fresh measurements are still required.

After the long-jump choice, the same retained Dense session again agrees at all 100 cursors: 63 forward jumps have median/p95 1.149/1.612 ms for production advance, versus 3.126/4.133 ms before the change. The same-run direct reconstruction median is 0.787 ms. All 37 reverse prefixes agree as well. Complete Flow prefix median is still 8.544 ms on forward samples; no claim is made that this change resolves browser command budgets. The raw before/after diagnostics remain in `seek-projection-before-long-jump.json` and `seek-projection-diagnostic.json`. The new 100-run property originally hit the default timeout, then a timeout during an extended run; those results are retained and are not called passes. The test now gives the larger corpus a 60-second allowance and reports a first failing generated case without expensive shrinking. The unchanged 100-run check and combined focused group pass at 24 tests in 7.67 seconds.

## Prefix reuse and seek reconstruction — 2026-10-13

The complete generated gate in `.ggjavaez/qa/reference-exact/perf-command-convergence/modern-world-performance.json` exits nonzero for all three unchanged 0.25 presentation/semantic retention limits. For 200, 5,000 and 20,000 requested raw events, measured semantic retention is 927,536 / 12,634,696 / 55,695,224 bytes; presentation retention is 1,644,584 / 9,487,408 / 36,239,016 bytes; ratios are 1.773067568 / 0.750901169 / 0.650666492. The signed stage deltas remain in the raw report. Post-seek diagnostic retention is 7,345,736 / 10,443,496 / 16,024,856 bytes and includes semantic recent-history changes and diagnostic/report arrays. These are not isolated renderer bytes.

The identical single-LINE update comparison passes: 100 measured batches after 20 warmups at each size, 1,000-object median 0.0111875 ms, 20,000-object median 0.0122085 ms, ratio 1.091262570 against 2.0. Generated-corpus replay now exercises the production `advance` API between actual spread cursors, including its reconstruction choice for long jumps; older direct-`project` replay timings use a different method. This is a measured scaling result, not memory or whole-product approval.
