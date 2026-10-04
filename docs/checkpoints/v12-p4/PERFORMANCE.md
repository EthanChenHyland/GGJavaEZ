# Phase 4 performance

## Memory gate and preserved evidence

The paired rich Phase 3 workload improves from 817.76 MiB / 2,560.00 ms to 353.18 MiB / 1,965.53 ms with identical graph digests at all four sizes. The largest graph has 190,031 enriched events, 6,814 invocations, 6,813 calls, 67,849 values and 110,408 edges. See [MEMORY.md](MEMORY.md) for explicit GC, retention scope, heap attribution and single-sample caveats. Production recorder caps were not raised.

## Fresh actual-JVM coverage costs

The serialized 30-project acceptance probe uses the actual production build/recorder/delta/normalizer/history path. These final accepted samples include the audit corrections and named observer module isolation; regression outcomes are recorded in VALIDATION.md. Actual runtime OpenJDK 26.0.2.1 on macOS arm64, Node 24.20.0, Apple M4 Pro, 24 GiB RAM. Maven/Gradle cases use actual external commons-lang3 artifacts.

| Project | Semantic events | Invocations / calls / values | Edges | Normalize ms | Retained MiB | Scrub median / max ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 16-static-nested | 59 | 3 / 4 / 13 | 38 | 1.04 | 0.20 | 0.128 / 0.324 |
| 02-primitive-arrays | 115 | 1 / 2 / 46 | 84 | 2.20 | 0.72 | 0.194 / 0.727 |
| 07-array-list | 160 | 8 / 19 / 38 | 123 | 2.25 | 0.93 | 0.360 / 1.664 |
| 13-queue-deque | 195 | 8 / 22 / 52 | 165 | 2.57 | 0.66 | 0.277 / 3.479 |
| 25-cross-feature-dispatch | 922 | 34 / 77 / 244 | 759 | 11.68 | 2.83 | 1.222 / 2.416 |
| 28-bounded-values | 372 | 4 / 49 / 205 | 436 | 6.89 | 1.40 | 0.708 / 5.653 |

[All 30 measured cases](coverage-results.json) retain actual counts, timings, output hashes, JDK/build/dependency metadata, observer status and 30 deterministic semantic seek samples per project. Accepted trace caches containing fixture source remain local/ignored. Retained heap is an ordered-suite, explicit-GC process delta holding raw records, semantic trace/graph/history, source metadata and harness; it is not isolated graph memory. Negative deltas, if any, are reported unchanged. There is one construction sample per case; no performance percentile claim is made from the case list. Java end-to-end times include preparation and build/cache/network/tool effects and are not semantic append cost.

Bounded String/collection/array previews avoid proportional allocation to enormous value length. The production large-value case uses a 100,000-element array, long text and a collection larger than its preview while preserving actual Java output. Snapshot replacement retires membership in place; historical roots remain immutable.

## Final integrated probes

Final integrated measurements use the same seeded Phase 3 input after all corrections. [Rich probe](final-probes/performance.json) preserves all four exact graph digests. The largest result is 190,031 enriched events, 354.45 MiB retained, 1,844.74 ms append; 30 seeded seek samples have median 2.761 ms / maximum 16.738 ms. This is one construction sample; the earlier paired memory gate remains the controlled before/after evidence. The non-enriched paired baseline has 122,139 events, 95.38 MiB retained and 619.74 ms append, with a different retention scope from the incremental transport probe.

[Incremental transport/history probe](final-probes/incremental/performance.json) separately tests 6,264 / 24,591 / 122,139 semantic events. The largest normalizes in 668.14 ms, retains 184.58 MiB including generator input and exported JSON, reloads in 903.32 ms, and keeps 239 checkpoints (512-event interval), below the unchanged 256-root budget. Median / maximum seek is 0.650 / 8.490 ms; returning to LIVE is 0.0025 ms. Contiguous deltas total 19.46 MB versus 981.36 MB for repeated full snapshots. Its report retains the original Phase 2 generator labels; this is the final Phase 4 rerun. Measurements are not comparable to isolated graph bytes.

[Actual-JVM provenance probe](final-probes/real-jvm-performance.json) verifies ordinary flows (356 events, 20 invocations / 27 calls / 82 values / 245 edges; 8.39 ms normalization, 2.18 MiB) and a deep call workload (33,337 enriched events, 2,857 invocations / 2,856 calls / 10,475 values / 31,418 edges; 379.14 ms normalization, 74.98 MiB). The latter reaches the unchanged 20,000 raw-event observer budget and retains a valid STOPPED_LIMIT prefix while Java completes all 7,200 calls, prints the exact check and exits 0. This is not a claim of a complete 7,200-call graph. Seek maxima are 2.292 / 2.231 ms. End-to-end 961 / 1,456 ms includes javac/helper/JVM work.

Workloads ran serially. Browser validation is distinct from these Node semantic measurements. No GPU presentation percentile or universal 5,000-object rendering claim is made.

## Browser measurements

[Chrome ingestion evidence](browser-performance.json) records 100,017 raw / 122,139 semantic events while the existing Person WebGL scene stays mounted: 632.90 ms total, 120 ingestion slices with median 4.00 / p95 7.10 / maximum 17.10 ms; seeded scrub median 0.60 / p95 1.10 / maximum 4.60 ms. Concurrent animation-frame intervals have median 16.70 / p95 33.30 ms across 37 samples. This measures browser ingestion and a small existing scene, not a rendered 122k-event world or physical GPU presentation.

[Retained graph-world measurement](product-audit-v11_5/large-world-measurements.json) loads 4,307 raw / 6,474 semantic prefix events in 3,214 ms. Three UI commit plus two-animation-frame seeks take 741 / 493 / 482 ms. The program has already completed normally; observation stopped at the unchanged object limit. This concrete dense-world UI cost is a Phase 5 rendering blocker, not an efficient-semantic-seek or GPU percentile claim. Node seek timings above measure a different operation/retention scope. Browser screenshot/rAF/process scheduling is included here.

## Phase 5 blockers

Persistent semantics alone do not make a dense world readable. Scene projection still enumerates retained entities; labels and detailed solids have CPU/text/draw-call costs. Current cuboids reserve stable bounds and bounded face rows, but long array prefixes can widen camera fitting. Sparse off-prefix cells and class storage lack dedicated 3D presentation. Reference routing/picking/Focus need visible-entity budgets and truthful grouping. Ownership/package/type/call/time data now supports future clustering and library collapsing without source-name guessing. Output/file graph endpoints carry evidence, but their spatial endpoint geometry remains Phase 5 work. best.png remains the next hierarchy/composition reference; no shell, cinematic material or semantic zoom rewrite belongs to this phase.
