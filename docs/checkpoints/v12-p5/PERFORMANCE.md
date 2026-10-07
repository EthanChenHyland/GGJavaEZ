# Spatial 2.0 performance

## Actual dense-world comparison

Same ordinary `graph-stress-plain` Java workload, recorder limits and 1440×900 Chrome viewport. Java finished with exit 0 and exact checksum/output even after observation stopped at the 256-object budget: 4,307 raw records, 6,474 normalized events. No fabricated post-limit semantic catch. Final accepted measurements are in [spatial-performance.json](browser-accepted/product-audit-v11_5/spatial-performance.json) and [large-world-measurements.json](browser-accepted/product-audit-v11_5/large-world-measurements.json).

| Measurement | Phase 4 | Phase 5 |
| --- | --- | --- |
| Fresh retained-world load | 3,214 ms | **1,984 ms** (38.3% lower) |
| Three matching UI seeks | 741 / 493 / 482 ms | **234 / 189 / 114 ms** |
| 30 seeded UI seeks | Three baseline samples only | p50 **67.01 ms**, p95 **109.82 ms**, maximum 112.86 ms |
| 30 actual orbit drags | Not measured as a distribution | p50 **66.44 ms**, p95 **85.94 ms** |
| Five Focus commands | No equivalent distribution | p50 **97.50 ms**, p95 **118.78 ms** |
| Five Home commands | No equivalent distribution | p50 **181.93 ms**, p95 **188.89 ms** |

UI timings include the Playwright action, UI commit and two animation frames. Five commands do not establish a population percentile. Separate command settling times include a fixed 800 ms wait; they do not detect GPU completion. One cold load does not establish cold-load p95. The development-only renderer probe adds traversal overhead and reports scene/CPU counters, not physical GPU presentation or FPS.

Final macro sample: 27 mounted text records, 5 visible labels, 42 click targets, 2 frames, 6 objects, 2 detailed faces, 6 references, 3 flows, 5 clusters, no quiet-volume instances; 125 draw calls, 22,496 triangles, 130 geometries, 4 textures. Counts reflect the last sampled exploration pose, not every possible Focus state.

## Cold-load causal correction

The first richer presentation was near the 3,214 ms baseline. CPU profiling identified repeated creation of project-option JSX for 1,933 existing managed projects on each raw publication. Options are now memoized by project-list identity; all project choices remain. The event-stream client requests the existing bounded server limit of 1,024 rather than 256 records. The 256 KiB frame limit, four frames per tick, client byte guards, 32-record ingestion slices and browser yielding remain unchanged.

A guarded browser-only before/after comparison reused one accepted terminal JVM session, changing only those two frontend behaviors. Same semantic facts and geometry: local pre-fix **3,275 ms**, two post-fix loads **2,280 / 2,285 ms**. Route flags assert both baseline overrides were actually applied. Earlier unguarded overrides did not match HMR URLs and were rejected as causal evidence. [comparison.json](cold/comparison.json) preserves the accepted methodology. This is one baseline and two after samples, not a cold-load distribution. The definitive final whole-suite result is the 1,984 ms measurement above.

## CPU presentation costs and memory

[spatial2.json](projection/spatial2.json) uses three accepted cached real-JVM recordings; no new JVM, browser, React mount, WebGL or Troika workload. Each has 30 seeded seeks. Imports, history construction, JSON loading and append-only layout preparation precede timing; projection caches stay warm across samples. Semantic seek, scene projection, relevant-flow query, LOD planning, endpoint lookup and connector sampling are timed separately.

Cross-feature recording (922 events, 34 invocations, 43 objects, 2 classes, 86 references, 3 observed I/O channels, 12 observed cells): scene projection p50/p95 **0.094 / 0.195 ms**; relevant-flow query **0.010 / 0.083 ms**; macro/meso/micro planning p50 **0.103 / 0.122 / 0.104 ms**, p95 **0.202 / 0.252 / 0.216 ms**. Endpoint and 24-segment reference/surface sampling have separate individual timings in the report. These are CPU costs, not GPU or text-shaping latencies.

Explicit-GC retained CPU presentation delta over the already constructed semantic trace/history is approximately **1.12 MiB** for the cross-feature full catalog, append layout, three retained LOD plans, bounded flows and connector arrays; **0.13 MiB** for bounded values and **0.18 MiB** for the observer-budget trace. Signed GC deltas can contain noise. React, WebGL, GPU, Troika and navigation-controller storage are outside this probe.

The whole browser's uncollected heap in the final dense measurement is **495,149,706 bytes used / 553,442,646 bytes total**. It includes raw transport, accepted recording, Monaco, histories and renderer; this is not isolated semantic or GPU retention. The guarded cold comparison's whole-browser after samples were about 222–225 MB and are likewise uncollected, so they are not an isolated renderer-memory improvement claim.

## Semantic memory and truth gate

[performance.json](rich/performance.json) reproduces all **four Phase 4 graph digests exactly**. Largest controlled workload: 190,031 normalized events, 6,814 invocations, 6,813 calls, 67,849 values, 110,408 edges. Explicit-GC retained semantic/process memory: Phase 4 **353.18 MiB**, Phase 5 **353.33 MiB**; the earlier 817.76 → 353.18 MiB memory improvement is preserved. Synthetic enriched facts model observations; this controlled probe is not a JVM or WebGL benchmark. Production recorder limits are unchanged.

Incremental and actual-JVM performance probes also pass: [incremental report](incremental/performance.json), [actual JVM report](jvm/real-jvm-performance.json). Their semantic normalization/replay costs are deliberately separate from renderer timings. The actual call-tree JVM computes its complete output after event recording stops.

## Remaining bottlenecks

Monaco/source-editor and main production chunks are large; Vite still reports chunk-size and Troika import warnings. Full raw recordings and editor state contribute to browser heap. Full-catalog CPU traversal happens on coarse relevance changes, not every animation frame. Text shaping, GPU residency, long-duration thermal behavior and camera frame-time distributions on a second machine have not been isolated. A Phase 5.5 torture audit should measure those directly. No FPS or physical GPU-latency claim is made.
