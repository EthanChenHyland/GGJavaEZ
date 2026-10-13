# Performance evidence

As of 2026-10-13, performance approval is incomplete. Budgets and required sample counts are unchanged. Historical and current methods are distinguished; passing a frame probe does not waive command latency or memory failures.

## Complete native Dense sample

The most recent completed browser measurement before prefix reuse/long-seek reconstruction uses a fresh ordinary Java Run, session `7f22cf7b-95ba-49fc-b893-cf30ea3ef9c3`: 7,492 raw events, 9,852 normalized events, four frames and 33 objects. Source hash `97e6a390f5349cb8a474d5ff2f5de3104bad8c3f86f46fea43ad4b9e841b10da`, exact stdout `TOPOLOGY 73 100 1000 3 true\n`, exit 0 and FULL recording. Real JDT remains enabled. The browser run finishes every stage with no browser errors and exits 1 for unchanged latency limits.

| Metric | Measured | Budget | Phase 5.5 baseline | Result |
| --- | ---: | ---: | ---: | --- |
| 100 spread seeks p50 | 100.7475 ms | 55 ms | 50.45 ms | Fail |
| 100 spread seeks p95 | 134.372417 ms | 112 ms | 101.24 ms | Fail |
| 50 actual cell Focus commands p95 | 184.7945 ms | 125 ms | 110.97 ms | Fail |
| 50 Home commands p95 | 232.320209 ms | 152 ms | 138.49 ms | Fail |
| Five fresh frontend loads, median | 4163.322917 ms | 5300 ms | 4816 ms (one sample, excluded JDT) | Pass, differing historical method |
| Five ≥30 s continuous native orbit windows, median | 16.7 ms | 16.7 ms | — | Pass |
| Orbit frame intervals p95 across sizes | 17.4–18.5 ms | 33.3 ms | — | Pass |
| Whole-owner CPU submission p95 across sizes | 3.0–3.8 ms | 6 ms | 3.70 ms | Pass |
| Every submitted-frame draw-call maximum | 109–110 | 250 | — | Pass |
| 60 s soak first/last 10 s median absolute drift | 0% | 10% | — | Pass |
| Forced-GC whole-frontend soak heap growth | 0.090617723% | 5% | — | Pass |

Command timing includes the real native command, UI commit and two real animation frames. Readiness occurs outside timing. Camera choreography is not replaced by a clock setter. CPU submission is separate from asynchronously resolved GPU time and physical-display FPS. All five viewport windows use elapsed native pointer motion without an additional per-move rAF RPC. Required samples, error checks and failed stages stay in the raw report.

Evidence: `.ggjavaez/qa/reference-exact/browser-world-performance-stable-materials.json`, matching log and command profile. The later production prefix/evidence/route changes require a fresh full run. The optional ten seek and ten Focus/Home profiling samples are additional diagnostics, not substitutions for required samples.

## Generated CPU and retention gate

The current generated gate uses the actual normalizer, history, layout, projector, Flow catalog, router and all three detail-level plans. It passes the single-event comparison (100 measured LINE batches after 20 warmups at each size): 1,000 objects median 0.0111875 ms; 20,000 objects median 0.0122085 ms; ratio 1.091262570 ≤ 2.0. Untouched object identity assertions remain enabled.

| Requested raw events | Semantic retained bytes | Presentation retained bytes | Ratio | Budget/result |
| --- | ---: | ---: | ---: | --- |
| 200 | 927536 | 1644584 | 1.773067568 | ≤0.25, fail |
| 5000 | 12634696 | 9487408 | 0.750901169 | ≤0.25, fail |
| 20000 | 55695224 | 36239016 | 0.650666492 | ≤0.25, fail |

The presentation checkpoint conservatively includes layout/projector/Flow indexes and caches, the scene and three final plans. Signed forced-GC stage deltas are retained. Post-seek mixed diagnostic retention is not isolated renderer memory. These generated corpora are not the required rich real-JVM semantic-retention measurement (≤390 MiB, historical 354.56 MiB), which remains open. The generated gate exits 1 for retention; it is not an approval waiver.

## Build and remaining work

The current production build passes typecheck and Vite. AppRoot gzip is 351.99 kB and entry index gzip 72.67 kB. Monaco/editor and Cinematic passes/materials are separate chunks. The large-chunk warning remains visible. These individual numbers are not a measured complete initial-load closure; the final 500 kB entry budget must be reported with the exact build boundary and artifact manifest.

Central connector material retention greatly reduced shader program lookup cost in the diagnostic profile; unchanged label trees are memoized, route contexts are bounded, Flow endpoint resolution owns one current prefix, and compact-world long seeks choose reconstruction. Full command latency and memory limits still need to pass. Methods and earlier failures are preserved in `migration/performance-methods.md`, `migration/browser-performance-methods.md`, `migration/connector-route-cache.md` and `migration/frame-performance.md`.
