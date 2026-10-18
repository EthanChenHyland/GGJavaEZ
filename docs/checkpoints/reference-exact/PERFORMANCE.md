# Performance evidence

As of 2026-10-17, performance approval is incomplete. Budgets and required sample counts are unchanged. Historical and current methods are distinguished; passing a frame probe does not waive command latency or memory failures.

## Complete native Dense sample

The most recent completed browser measurement on commit `44f5bc2391bdf191eed9bd2a2874bf12f7828d27` uses a fresh ordinary Java Run, session `012ada8d-beb2-4b75-8d94-8dc4d26496a5` (browser run `b8847180-9a3d-4931-a911-fbcb6db9018c`): 7,492 raw events, 9,852 normalized events, four frames and 33 objects. Source hash `97e6a390f5349cb8a474d5ff2f5de3104bad8c3f86f46fea43ad4b9e841b10da`, exact stdout `TOPOLOGY 73 100 1000 3 true\n`, exit 0 and FULL recording. Real JDT remains enabled. The browser run finishes every stage with no browser errors and exits 1 for unchanged latency limits.

| Metric | Measured | Budget | Phase 5.5 baseline | Result |
| --- | ---: | ---: | ---: | --- |
| 100 spread seeks p50 | 99.188 ms | 55 ms | 50.45 ms | Fail |
| 100 spread seeks p95 | 116.456459 ms | 112 ms | 101.24 ms | Fail |
| 50 actual cell Focus commands p95 | 167.212083 ms | 125 ms | 110.97 ms | Fail |
| 50 Home commands p95 | 199.873084 ms | 152 ms | 138.49 ms | Fail |
| Five fresh frontend loads, median | 3928.589958 ms | 5300 ms | 4816 ms (one sample, excluded JDT) | Pass, differing historical method |
| Five ≥30 s continuous native orbit windows, median | 16.7 ms | 16.7 ms | — | Pass |
| Orbit frame intervals p95 across sizes | 17.3–17.4 ms | 33.3 ms | — | Pass |
| Whole-owner CPU submission p95 across sizes | 2.4–3.0 ms | 6 ms | 3.70 ms | Pass |
| Every submitted-frame draw-call maximum | 110 | 250 | — | Pass |
| 60 s soak first/last 10 s median absolute drift | 0% | 10% | — | Pass |
| Forced-GC whole-frontend soak heap growth | 0.136979571% | 5% | — | Pass |

Command timing includes the real native command, UI commit and two real animation frames. Readiness occurs outside timing. Camera choreography is not replaced by a clock setter. CPU submission is separate from asynchronously resolved GPU time and physical-display FPS. All five viewport windows use elapsed native pointer motion without an additional per-move rAF RPC. Required samples, error checks and failed stages stay in the raw report.

Evidence: `.ggjavaez/qa/reference-exact/browser-world-performance-prefix-reuse.json`, matching log, seek/command profiles and compact summaries. Earlier stable-material and interrupted results remain archived. The optional ten seek and ten Focus/Home profiling samples are additional diagnostics, not substitutions for required samples.

The five windows contain 1,832 / 1,831 / 1,829 / 1,832 / 1,830 actual submissions. Asynchronous GPU queries resolve 1,832 / 1,830 / 1,829 / 1,831 / 1,829 samples; three queries remain pending at their window boundary and none are reported unavailable. GPU p50/p95 ranges are 1.098–2.994 / 5.763–19.054 ms. These are actual queries, with whole-owner pass attribution, not estimates from CPU time. The separate ten-seek profile identifies persistent-record enumeration under React development prop diffing and current-prefix Flow resolution; the ten Focus/Home profile also identifies routing, camera collision planning and batched text work. Profiling samples do not alter the required command samples or limits.

## Generated CPU and retention gate

The current generated gate uses the actual normalizer, history, layout, projector, Flow catalog, router and all three detail-level plans. It passes the single-event comparison (100 measured LINE batches after 20 warmups at each size): 1,000 objects median 0.0111875 ms; 20,000 objects median 0.0122085 ms; ratio 1.091262570 ≤ 2.0. Untouched object identity assertions remain enabled.

| Requested raw events | Semantic retained bytes | Presentation retained bytes | Ratio | Budget/result |
| --- | ---: | ---: | ---: | --- |
| 200 | 927536 | 1644584 | 1.773067568 | ≤0.25, fail |
| 5000 | 12634696 | 9487408 | 0.750901169 | ≤0.25, fail |
| 20000 | 55695224 | 36239016 | 0.650666492 | ≤0.25, fail |

The presentation checkpoint conservatively includes layout/projector/Flow indexes and caches, the scene and three final plans. Signed forced-GC stage deltas are retained. Post-seek mixed diagnostic retention is not isolated renderer memory. These generated corpora are not the required rich real-JVM semantic-retention measurement (≤390 MiB, historical 354.56 MiB), which remains open. The generated gate exits 1 for retention; it is not an approval waiver.

## Build and remaining work

The current production build passes typecheck and Vite. AppRoot gzip is 352.06 kB and entry index gzip 72.67 kB. Monaco/editor and Cinematic passes/materials are separate chunks. The large-chunk warning remains visible. Requirement 32.7 limits the main entry JavaScript chunk, not the complete dependency closure. `scripts/reference/measure-build.mjs` now checks actual built bytes, SHA-256 and default gzip compression with a decimal 500,000-byte threshold, and reports static dependency closures separately. The actual main HTML entry is **71,915 bytes gzip** and passes 500,000 bytes. AppRoot is 348,716 bytes gzip under this same measurement. The entry static closure sums to 72,343 bytes and the main/Shell static closure to 649,587 bytes; those sums are separate diagnostics, not the entry-chunk limit. Vite console gzip estimates above are distinguished from these post-build file-byte measurements. Monaco/editor API and Cinematic passes occupy separate chunks. The native request-policy checks remain separate, because chunk separation alone does not prove when a chunk is fetched. The large dependency closure remains useful startup evidence, without inventing a second 500 kB criterion.

Central connector material retention greatly reduced shader program lookup cost in the diagnostic profile; unchanged label trees are memoized, route contexts are bounded, Flow endpoint resolution owns one current prefix, and compact-world long seeks choose reconstruction. Full command latency and memory limits still need to pass. Methods and earlier failures are preserved in `migration/performance-methods.md`, `migration/browser-performance-methods.md`, `migration/connector-route-cache.md` and `migration/frame-performance.md`.

## Frame-row/accessibility checkpoint — 2026-10-14

The actual production entry passes at **71,916 gzip bytes**, limit 500,000, with Monaco and Cinematic passes separate (`production-build-row-accessibility-confirmed.json/log`). Entry static closure 72,344 and main/Shell static closure 651,905 bytes are diagnostic totals, not a second entry budget. The same three accepted cached JVM recordings pass all 90 seeded seeks and 270 production plans with explicit GC, **3 expected/executed/passed, zero skipped**, 1.06 seconds (`cached-projection-frame-rows/cached-projection.json`, matching log). This is a cached CPU successor, not a fresh-JVM, browser, GPU or physical-rendering measurement. The new row helper reuses each computed face model; accessibility refreshes changed presentation cuts independently of runtime revision. Prior fixed Dense latency and retained-memory failures remain open and require fresh measurements after cleanup; no budget is waived.


## Scoped-face/navigation/editor checkpoint — 2026-10-15

The actual rebuilt main entry is **71,930 gzip bytes**, within the unchanged 500,000-byte Requirement 32.7 limit; Monaco/editor and Cinematic passes remain separate. Entry static closure **72,358** and main/Shell static closure **652,506** bytes remain diagnostics (`production-build-scoped-navigation-editor.json/log`), not a second budget. Vite AppRoot estimates 1160.21 kB / 355.25 kB gzip and retains its large-chunk warning. Source changes keep scope/row work bounded by fixed face capacity and include only captured I/O volumes in existing camera collision geometry. No new Dense latency, GPU, memory or sustained-rendering performance claim is made. Prior fixed Dense seek/Focus/Home and generated retention failures remain open. Cached production projection passes **3 expected/executed/passed, zero skipped**, 90 seeded seeks and 270 plans with explicit GC, 1.00 second (`cached-projection-scoped-navigation-editor/cached-projection.json` and matching log). This reuses accepted recordings and does not claim fresh JVM/browser/GPU/Dense measurements. The full native reconstruction functional suite passes **70/70**, 8.3 minutes; it does not replace the fixed performance measurements.


## Return-evidence checkpoint — 2026-10-15

Main-entry default gzip is **71,929 bytes**, passing the unchanged 500,000-byte budget, with Monaco/Cinematic separate (`production-build-return-successors.json/log`). Entry static closure 72,357 and main/Shell static closure 652,403 are diagnostics. Vite AppRoot 1159.74 kB / 355.11 kB gzip retains its large-chunk warning. Source return resolution uses graph incoming/outgoing adjacency and invalidates only the recorded producer invocation when its value is consumed; no full-frame scan is added to that update. Cached production projection passes **3 expected/executed/passed, zero skipped**, 90 seeded seeks and 270 plans with explicit GC, 1.03 seconds (`cached-projection-return-successors/cached-projection.json` and matching log). This reuses accepted recordings rather than claiming fresh JVM/browser/GPU measurements. This checkpoint does not resolve or remeasure fixed Dense latency, GPU or retained-memory failures.

## Face/Classic-removal checkpoint — 2026-10-15

Production build and actual artifact measurement pass (`production-build-face-motion-classic-confirmed.json/log`): main entry **71,931 gzip bytes** against 500,000; Monaco/Cinematic passes remain separate. Entry/static Shell closures are **72,359 / 653,050 bytes**, diagnostic sums rather than new entry budgets. Cached production projection passes **3 expected/executed/passed, zero skipped**, 90 seeded seeks/270 plans with explicit GC in 1.04 seconds (`cached-projection-face-motion-classic.log`). Four guardrail files pass **19/19** in 1.15 seconds. These cached results use previously accepted recordings; they are not fresh-JVM/Dense/native/GPU or memory approval. Library occupancy adds typed-body correctness and needs the unchanged final performance gates. The existing Dense latency and generated retention failures remain unwaived.

The retained 20k generated heap snapshot is now parsed (`perf-heap/retained20k-summary.json`): 4,179,225 nodes and 268,404,249 shallow self bytes, including the runner/live inputs. Categories overlap and are not dominators or presentation-only attribution. This diagnostic does not approve generated retention or actual Dense 390 MiB/25% budgets.

Current storage/heading checkpoint, verified 2026-10-16: actual main entry **71,929 gzip bytes**; static closures **72,357 / 653,419 bytes** remain diagnostics. Build, Monaco/Cinematic chunk separation, cached projection **3/3** (90 seeks/270 plans, explicit GC, 1.03 s) and all **19** guardrails (1.27 s) pass. This is reused-recording CPU/build evidence, not fresh Dense latency, GPU or memory approval.

## Protected unlit output — 2026-10-16, ongoing

Colour correction reuses the existing protection target and final OutputPass, adding one mask sample without a new render pass, target, mesh or draw batch. This is a resource/implementation fact, not a measured GPU-speed improvement. Production artifact measurement passes at **71,928 gzip bytes** for the main entry; **72,356/653,690** entry/shell static closure bytes are diagnostics. Monaco and Cinematic stay split (`production-build-unlit-output.json/log`). Existing Dense latency and generated retention failures remain unwaived; final current-tree performance measurements are still required.

The existing curated-recording native frame-probe smoke observes 103 Interactive submissions with 103 resolved GPU samples, then actual Cinematic activation and 120 total submissions/119 resolved GPU samples at the final boundary. Dropped samples are zero and lifecycle-issue records are empty. The one pending boundary sample is not zero GPU time. This verifies query/render lifecycle through the change; it is neither actual-JVM Dense throughput nor sustained/performance-budget approval (`frame-performance-native.json`).


## Timeline/catalog-order checkpoint — 2026-10-17

Actual main-entry gzip is **71,930 bytes**, passing the unchanged 500,000-byte budget; entry/shell static closures **72,358/653,760** are diagnostics (`production-build-order-timeline.json/log`). Cached CPU projection passes **3 expected/executed/passed, zero skips**, 90 seeded seeks/270 plans with explicit GC, 1.02 seconds (`cached-projection-scene-order.log`, `perf-scene-order/`). Sorting touched owners preserves bounded single-LINE updates; full reconstruction sorts already materialized catalog copies. These checks do not remeasure or waive the open Dense latency and retained-memory failures.
