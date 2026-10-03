# Phase 3 performance and memory

All workloads were serialized on Apple M4 Pro, 24 GiB RAM, Node 24.20.0. JVM fixtures use installed OpenJDK 26.0.2.1. These are bounded single-run measurements, not repeated-run latency percentiles, physical GPU presentation or dense-world FPS claims. The reported scrub/batch percentiles describe samples inside one run.

## Paired legacy and enriched synthetic pipeline

[performance.json](performance.json) compares the same seeded generator input in one process. The enriched variant adds explicit synthetic calls, returns and producer recipes. These are test inputs; production does not derive producer relationships from the generator. Both configurations append 256 raw records per batch through the production normalizer/history, with explicit GC around retained-heap samples and 30 deterministic random seeks.

| Legacy semantic events | Rich semantic events | Rich invocations | Legacy append ms | Rich append ms | Legacy retained MiB | Rich retained MiB | Rich scrub p95 ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 288 | 462 | 21 | 4.35 | 6.57 | 1.28 | 2.97 | 2.59 |
| 6,264 | 9,788 | 382 | 39.14 | 120.15 | 12.45 | 48.49 | 2.67 |
| 24,591 | 38,302 | 1,409 | 149.28 | 456.73 | 45.52 | 182.88 | 1.58 |
| 122,139 | 190,031 | 6,814 | 803.26 | 2,429.28 | 213.41 | 817.74 | 15.97 |

The largest rich sample holds 67,849 value versions and 110,408 edges. It retains 188 state roots, with 1,024-event checkpoint spacing, within the existing 256-root policy. Return to Live is a head lookup: 0.089 ms in this sample (measurement also includes the identity assertion).

Additional retained heap at the largest paired size is **604.33 MiB**, about **3.83×** the simpler configuration's measured retention. The rich trace has 56% more semantic events plus graph nodes, producer recipes, indexes and immutable value history. This is a substantial linear cost; it must not be described as free or as unchanged memory use. Rich retained growth from 38k to 190k semantic events is approximately proportional to event/edge growth. No enriched million-event memory measurement or extrapolated capacity guarantee is claimed. Production recorder budgets remain unchanged.

The baseline input is held outside these paired allocation measurements. Rich retention includes enriched raw records, semantic trace, graph and checkpoint roots, rather than isolated graph bytes. The older Phase 2 report additionally charged generator input/exported JSON, so its retained numbers are not an apples-to-apples graph subtraction.

### Memory convergence

The [initial measurement](performance-before-index-polish.json) exposed overhead from persistent-vector wrappers on tiny incoming/outgoing index lists. Lists now copy at most eight integer ordinals in immutable arrays, then use existing persistent vectors for higher degree. A 64-consumer alias test verifies plain/persistent equivalence, previous-prefix immutability and promotion beyond the boundary.

At the largest paired size, rich retention fell from **919.74 → 817.74 MiB** (11.1%) and append from **2,709.16 → 2,429.28 ms**. These are sequential single samples, not statistical performance claims. Graph semantics and contracts are unchanged. Initial Return-to-Live samples mistakenly included graph-count enumeration; they were removed from that report and corrected in the final probe. Only the final head-lookup samples are valid.

## Actual Java projects

[real-jvm-performance.json](real-jvm-performance.json) comes from a separate explicit-GC run of the fresh fixtures. Exactly one application JVM runs per fixture, with production limits. End-to-end includes javac/helper preparation and Java; normalization times accepted raw batches and terminal facts only. Retention includes returned trace/history/graph metadata. No baseline JVM instrumentation overhead comparison is claimed.

| Fixture | Raw records | Semantic events | Observed invocations | Normalization ms | Retained MiB | Scrub p95 ms | Java result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ordinary value-flow project | 206 | 334 | 20 | 8.61 | 3.06 | 2.63 | Exit 0, full recording |
| Fresh recursive/nested call tree | 20,001 including terminal record | 33,335 | 2,857 | 540.97 | 178.16 | 2.90 | Exit 0, observer stopped at event budget |

The large project actually completes **7,200 calls**, printing exactly `CALLS 7200 CHECK 5764800\n`. Recording stops at the 20k event budget; open graph invocations are marked prefix-ended and no unobserved returns are fabricated. Console and application completion continue unchanged. Actual observed invocation count is intentionally smaller than total Java calls.

## Phase 2 regression probes

All four existing probes pass, with new output under [phase2-regression](phase2-regression) rather than overwriting Phase 2 evidence. The reused probe's internal phase/base labels identify its original benchmark, not a rollback of current production code.

| Probe | Phase 2 checkpoint | Current code |
| --- | --- | --- |
| 122,139-event legacy append | 828.33 ms | 819.10 ms |
| Same sample retained heap, including generator/export | 301.49 MiB | 299.67 MiB |
| 1,003,111-event construction | 8,495.31 ms | 8,629.61 ms |
| Million-event retained heap | 1,821.49 MiB | 1,821.54 MiB |
| Million-event scrub p95 | 30.79 ms | 25.48 ms |

The million-event sample still uses 247 roots and 4,096-event checkpoint spacing. Its Return-to-Live lookup is 0.0235 ms. This benchmark is the legacy schema fixture, not a million-event enriched graph, archive reload or WebGL world.

## Remaining performance boundaries

Graph construction is proportional to new facts, with bounded producer analysis and changed persistent paths. Queries use node indexes; no whole-prefix reconstruction was added. Rich semantics nevertheless increase CPU and heap considerably. Production caps can be reached sooner with more raw facts. Dense text/geometry commits, overview clutter and GPU rendering remain prior limitations for the later Spatial milestone; this phase makes no FPS improvement claim.
