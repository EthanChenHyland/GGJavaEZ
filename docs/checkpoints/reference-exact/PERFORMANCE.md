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


## Measured face-column checkpoint — 2026-10-17

The main entry remains **71,930 gzip bytes**, within 500,000; entry/shell static closures are **72,358/654,010** diagnostic bytes (`production-build-face-columns.json/log`). Monaco and Cinematic remain split, with the large-chunk warning retained. Font advance measurements operate only on already bounded visible rows. No new Dense latency, retained-memory, sustained-rendering or GPU performance pass is claimed.

## Bounded Hero admission — 2026-10-18

Pre-Home reconciliation build measurement passes at **71,932 gzip bytes** for the actual main entry; **72,360/655,116** entry/shell static closures are diagnostic sums. Monaco/Cinematic stay split and the Vite warning remains. The candidate cut index reuses exact type/package/ownership groups: a 1,000-entity guard observes zero entity reads in warmed exclusion queries, and a 1,000-object Hero group stays whole instead of retrying 512 quiet members. Optional solver trials are bounded by the nominal object budget. The 270-plan cached CPU successor passes three accepted recordings in 1.10 seconds, with all 19 guardrails passing in 1.10 seconds. This does not measure fresh Dense execution, Hero browser latency, retained memory or GPU budgets. Home now fits real heading clearance and reconciles changed LOD destinations; the earlier Dense seek/Focus/Home and presentation-retention failures remain unwaived and require current-source measurement.

Final Home reconciliation build measurement passes at **71,930 gzip main-entry bytes**; diagnostic closures **72,358/655,463**, Monaco/Cinematic split (`production-build-hero-home-reconciled.json/log`). Cached CPU projection passes **3/3**, 90 seeks/270 plans with explicit GC, **1.02 seconds** (`cached-projection-hero-home-reconciled.log`). Current-source Dense command latency, retained memory, sustained GPU/frame windows and the unchanged final budget gates remain open.


## Region environment checkpoint — 2026-10-18

The actual production artifact passes at **71,926 main-entry gzip bytes**, against 500,000. Entry/shell static closures **72,354/656,465** remain diagnostics; Monaco/Cinematic are separate and Vite's large-chunk warning is preserved (`production-build-region-environment.json/log`). Two structural haze sprites share one 64×64 alpha map and owned materials; grid visibility changes retain physical geometry. These bounded source/resource properties are not measured Dense/GPU/retention budget approval. Existing Dense seek/Focus/Home and presentation-retention failures remain open. Full defaults and targeted graphics/native correctness pass as documented in [the environment ledger](migration/region-environment.md).


## Actual Dense browser measurement — 2026-10-21, source 9e95c68

The unchanged browser method completed every stage on a fresh actual JVM session `c3b938f1-bf50-4f71-82fc-41453a5f91f4`, run `a4500720-d076-429c-a4d0-2f5f04832030`. Source SHA-256 is `97e6a390f5349cb8a474d5ff2f5de3104bad8c3f86f46fea43ad4b9e841b10da`; the 942-file application map is `fc322adab697a55cda72016880483452d2de292526c10c38622b7d9fb95976f9`. The actual recording contains 7,492 raw / 9,852 normalized events, completes with FULL recording and exit zero, and prints `TOPOLOGY 73 100 1000 3 true\n`. JDT remains enabled. All original samples, windows, thresholds and command-readiness boundaries remain unchanged.

| Measurement | Actual | Budget | Result |
| --- | ---: | ---: | --- |
| Seek p50, 100 native seeks | 98.634 ms | 55 ms | FAIL |
| Seek p95 | 100.757 ms | 112 ms | PASS |
| Focus p95, 50 native pairs | 167.822 ms | 125 ms | FAIL |
| Home p95 | 200.051 ms | 152 ms | FAIL |
| Five actual JDT-enabled cold loads, median | 4,046.963 ms | 5,300 ms | PASS |
| Five sustained orbit windows, median submission interval | 16.7 ms each | 16.7 ms | PASS |
| Orbit p95 intervals, in viewport order | 17.7 / 18.3 / 18.0 / 17.2 / 17.8 ms | 33.3 ms | PASS |
| Orbit submission CPU p95 | 2.6 / 2.6 / 2.6 / 2.6 / 3.3 ms | 6 ms | PASS |
| Maximum draw calls | 123 | 250 | PASS |
| 60-second soak median frame drift | 0% | 10% | PASS |
| Whole frontend post-GC heap growth | 0.14317% | 5% | PASS |

The browser gate is **FAIL** and overall performance approval **INCOMPLETE**. Asynchronous GPU queries produced real samples; raw counts, pending queries and timings remain in the report, without substituting zero for missing samples. Rich semantic retention, presentation/semantic retained-memory ratio, single-event ratio and entry gzip are NOT_MEASURED by this browser run. The earlier generated retained-memory failures remain unwaived. Build artifacts are measured separately.

The report, log, source snapshot and optional CPU profiles are archived with hashes in `.ggjavaez/qa/reference-exact/performance-9e95c68/manifest.json`; the saved raw session remains alongside it. Extra profiling uses ten additional seeks and ten Focus/Home pairs outside the fixed command samples. Its call stacks identify route solving among the command costs, without attributing the full command budget to that function. This is a completed failing measurement, not an interrupted or pending run.


## Camera guard follow-up — 2026-10-21

The complete unchanged browser method reran on the 942-file camera-guard source map `f55d9aa6b07fea9d10df167b3bbcd02c1ec80483769d2769e9420a17e0b2dce6`, fresh actual JVM `3efabc32-6a77-491e-aca3-d9aa33d1eb89`, run `cddab979-c0fc-4227-b75f-4854924d95dd`. The same source hash, 7,492 raw / 9,852 normalized events, FULL completed recording, exit zero and exact stdout are retained. Every stage completes with all required samples; the command exits 1 at the final unchanged budget assertion, rather than a stage timeout/crash.

| Measurement | Before (9e95c68) | Camera guard | Budget | Current result |
| --- | ---: | ---: | ---: | --- |
| Seek p50 | 98.634 ms | 99.622 ms | 55 ms | FAIL |
| Seek p95 | 100.757 ms | 120.170 ms | 112 ms | FAIL |
| Focus p95 | 167.822 ms | 150.426 ms | 125 ms | FAIL |
| Home p95 | 200.051 ms | 182.679 ms | 152 ms | FAIL |
| Five cold loads, median | 4,046.963 ms | 4,181.682 ms | 5,300 ms | PASS |

These are separate fresh runs, not paired samples; the evidence supports the measured command reduction without attributing all variation to the guard. All five 30-second orbit windows pass: medians 16.7 ms, p95 17.5 / 17.5 / 17.0 / 17.2 / 17.6 ms, CPU p95 2.6 / 2.7 / 2.7 / 2.7 / 3.5 ms, maximum 123 calls. The 60-second soak passes at 0% median frame drift and 0.1296% whole-frontend post-GC heap growth. Real asynchronous GPU samples and pending-query counts remain in the raw report; no semantic-memory attribution is inferred from whole-frontend heap growth. External retention/single-event/build fields remain NOT_MEASURED by the browser method, and the generated retention failures remain open.

Raw report, exact session, optional profiles, command log and source snapshot are archived with hashes in `.ggjavaez/qa/reference-exact/performance-camera-relaxation/manifest.json`. The current browser gate is **FAIL** and whole-product performance approval **INCOMPLETE**. The build separately measures 71,765 main-entry gzip bytes, with Monaco/Cinematic chunks split. This checkpoint does not close the latency, retained-memory, visual or whole A–G gates.


The additional seek profile also places most sampled `recordKeys` self-time below React development component-prop diffing (`addObjectDiffToProperties`), rather than a reducer call. That diagnostic stack does not isolate its contribution to the fixed command samples or establish a runtime reducer defect. The protected runtime remains unchanged; no React logging or benchmark boundaries are disabled for performance runs (`performance-camera-relaxation-profile-summary.json`).


## Actual Dense after path and flow-planning bounds — 2026-10-21

All ten stages complete on source map `e53b9768aeb92291ea013dc6b1c91cd8c8431a67d30e5e0ea0b14728e4fb1113`, fresh actual JVM `a04493c3-50f3-4f53-ad96-3ec1befee8f2`, run `897680b1-b963-4f82-8dde-bc9236f0e5af`. The same Java source hash, 7,492 raw / 9,852 normalized events, FULL recording, successful exit and exact stdout are retained. The method, JDT, 100 spread seeks, 50 distinct captured Focus/Home pairs, five cold loads, five continuous orbit windows and soak are unchanged.

| Measurement | Camera guard run | Current | Budget | Current result |
| --- | ---: | ---: | ---: | --- |
| Seek p50 | 99.622 ms | 98.256 ms | 55 ms | FAIL |
| Seek p95 | 120.170 ms | 99.956 ms | 112 ms | PASS |
| Focus p95 | 150.426 ms | 134.409 ms | 125 ms | FAIL |
| Home p95 | 182.679 ms | 151.487 ms | 152 ms | PASS |
| Five cold loads, median | 4,181.682 ms | 4,060.694 ms | 5,300 ms | PASS |

All five 30-second orbit windows pass: median submission intervals 16.7 ms, p95 17.4 / 17.5 / 17.5 / 17.5 / 17.3 ms, CPU p95 2.6 / 2.6 / 2.6 / 2.6 / 3.5 ms, maximum 123 calls. The 60-second soak passes at 0% median frame drift and 0.1343% whole-frontend post-GC heap growth. These separate fresh runs have no statistical confidence claim; the earlier failures remain preserved. Home has limited margin in this run. The fixed final browser-budget assertion exits 1 because seek p50 and Focus still fail; the gate remains **FAIL**, with overall performance approval **INCOMPLETE**.

Actual asynchronous whole-render-owner GPU queries are retained as diagnostics, with no GPU budget or physical-display FPS pass inferred:

| Viewport | Resolved samples | Pending at final boundary | GPU p50 / p95 |
| --- | ---: | ---: | ---: |
| 1728×1117 | 1,829 | 1 | 4.498 / 22.054 ms |
| 1440×900 | 1,831 | 1 | 3.607 / 28.487 ms |
| 1280×800 | 1,830 | 1 | 2.647 / 24.912 ms |
| 760×900 | 1,831 | 1 | 2.671 / 22.840 ms |
| 1440×650 | 1,819 | 1 | 2.848 / 26.750 ms |

Report, raw actual session, log, optional profiles and exact 942-file source snapshot are archived with hashes in `performance-world-route-costs/manifest.json` under the QA evidence directory. Build artifacts separately pass at 71,762 main-entry gzip bytes, with Monaco/Cinematic split; static entry/Shell sums of 72,190 / 669,208 bytes are diagnostics.

The exact unchanged Phase 5.5 paired rich-graph method executes 1/1 with zero skips, explicit GC and all four original sizes. Both baseline and enriched graph digests/counts match the old evidence. Its largest controlled case contains 190,031 semantic events, 6,814 invocations, 6,813 calls, 67,849 values and 110,408 edges, retaining **354.625 MiB ≤ 390 MiB**. The original process-delta boundary includes enriched raw facts, semantic events, graph and checkpoint roots, with generator input held outside the measurement. This is synthetic controlled retention, not actual JVM or isolated GPU/SceneModel memory (`perf-world-route-costs-rich/performance.json`, `comparison.json`).

The unchanged modern Node method also completes all three configured corpora and the counterbalanced single-LINE scaling probe, executing 1/1 with zero skips. The 20k/1k actual-object update ratio is **1.03235 ≤ 2**, using 100 measured batches per size after 20 warmup batches. Presentation-retention ratios still fail the 0.25 limit:

| Raw target | Semantic retained delta | Presentation retained delta | Ratio | Result |
| --- | ---: | ---: | ---: | --- |
| 200 | 927,960 bytes | 1,639,648 bytes | 1.76694 | FAIL |
| 5,000 | 12,372,744 bytes | 9,325,152 bytes | 0.75369 | FAIL |
| 20,000 | 55,805,520 bytes | 35,869,048 bytes | 0.64275 | FAIL |

That test exits 1 at the unchanged retained-memory budget assertion, with all stages completed. Small differences from previous heap samples are not claimed as a material memory improvement. `perf-world-route-costs-modern/modern-world-performance.json` preserves stage deltas, exact input hashes, timings, ownership checks and failures; `performance-world-route-costs-external.json` links these independent gates without altering the browser report's NOT_MEASURED fields. Seek p50, Focus, presentation retention, visual convergence and whole A–G acceptance remain OPEN.


## Compact FlowCatalog retention — 2026-10-21

The unchanged explicit-GC generated method reruns all three raw targets and both 100-batch/20-warmup single-event sizes on source `858181a953fcba357cf6cf61f851444f607308aac27a797342cbb966b4c58902`. All raw hashes, graph counts and normalized event counts match 06695fc. Only the FlowCatalog implementation differs among 942 application/test/config files.

| Raw target | Flow index before / after | Whole presentation before / after | Current ratio | Result against 0.25 |
| --- | ---: | ---: | ---: | --- |
| 200 | 68,400 / 45,184 bytes | 1,639,648 / 1,623,400 bytes | 1.75427 | FAIL |
| 5,000 | 1,479,208 / 1,014,360 bytes | 9,325,152 / 8,936,272 bytes | 0.71967 | FAIL |
| 20,000 | 5,888,408 / 4,073,712 bytes | 35,869,048 / 34,185,248 bytes | 0.61403 | FAIL |

The largest Flow index delta is 1,814,696 bytes lower (30.8%); total presentation delta is 1,683,800 bytes lower (4.69%). These single-construction process deltas do not establish statistical confidence or isolated object bytes. Single-event scaling passes at 1.05977 against 2. The test executes 1/1 with zero skips, completes every stage, and exits 1 at the three unchanged memory-budget failures. Raw reports and the exact comparison are in `perf-flow-catalog-compact-modern/` and `flow-catalog-compact-memory-comparison.json` under the QA evidence directory.

The 06695fc actual Dense/quality/rich results above keep their original source boundary; no new browser command latency, GPU or Cinematic claim is made for this internal-index checkpoint. Build artifacts independently pass at 71,763 main-entry gzip bytes, entry/Shell static sums 72,191 / 669,231 diagnostic bytes, with Monaco/Cinematic separate. Seek p50, Focus, presentation retention and whole-product approval remain OPEN.


## Glyph coverage fix boundary — 2026-10-22

The mask blend correction adds no passes or render targets. Actual build: main-entry 71,763 gzip bytes; entry/Shell static closure diagnostics 72,191 / 669,274. Native render-probe lifecycle smoke passes with actual GPU queries and no lifecycle errors; it does not approve Dense sustained rendering or GPU budgets. Earlier Dense/memory results retain their original source boundaries and failures. [Evidence and limits](migration/unlit-output.md#preserve-face-coverage-under-glyphs--2026-10-22).


## Forensic footprint boundary — 2026-10-22

Camera-aware structural evidence reuses the existing body/face/outline and text batch without adding passes or render targets. Current main-entry gzip is 71,764 bytes; entry/Shell closure diagnostics are 72,192 / 670,068. Ordinary Home/Hero/Follow outputs match the parent in 1,325 comparisons. This correctness evidence is not fresh Dense, retained-memory or sustained GPU-budget approval; earlier failures retain their source boundaries. [Implementation and limits](migration/forensic.md#readable-structural-evidence--2026-10-22).


## Inline ordinal histories — 2026-10-22

The unchanged serial generated probe observes largest projector retention 9,612,680 → 8,794,320 bytes and complete presentation 34,011,128 → 33,220,784 bytes. All three unchanged 0.25 ratios still FAIL; LINE scaling passes at 1.08694 against 2. This single pair is not statistical, JVM, WebGL or Dense latency approval. [Source boundaries, all sizes and limits](migration/slot-history.md#inline-ordinal-histories--2026-10-22).


## Canonical source-event ordinals — 2026-10-22

The unchanged generated probe observes largest projector retention 8,800,016 → 7,729,728 bytes and complete presentation 33,284,360 → 32,128,344. All three 0.25 ratios still FAIL; LINE scaling passes at 1.09919 against 2. The smallest presentation delta increases; no universal/statistical or fresh Dense/GPU claim is made. A spatial-bucket candidate is rejected for no useful measured gain. [All sizes and source boundaries](migration/slot-history.md#canonical-source-event-ordinals--2026-10-22).


## Visible recording/liveness badges — 2026-10-23

Small actual-JVM timing passes at three sizes: native Run pointerup → Building 59.8–68 ms; observed lifecycle store → Header commit 6.7–12.4 ms, against 100 ms. This is not global/Dense timing approval. The unchanged generated retention ratios remain 1.76615 / 0.67571 / 0.57739, all FAIL 0.25; optional heap attribution follows the fixed checkpoint. Build main-entry 71,761 gzip bytes, Shell closure 670,171 diagnostic bytes. [Methods and boundaries](migration/header-controls.md#visible-independent-recordingliveness-facts--2026-10-23).


## Compact forward dependencies — 2026-10-23

The unchanged comparable generated probes observe largest presentation retention 32,208,832 → 31,755,920 bytes (1.4% lower in this pair). Every 0.25 ratio still FAILS; LINE scaling passes 1.24307 against 2. Heap census confirms measured empty/singleton forward Sets are absent; shallow container counts are not dominator retention. An unprofiled after run is retained separately. [All sizes, source boundary and limits](migration/slot-history.md#compact-forward-dependency-targets--2026-10-23). Actual Dense failures remain OPEN.


## Full-app 5,000-file search — 2026-10-23

Full-app Quick Open now has measured desktop/narrow 5,000-file evidence: opening 67.8 / 81.4 ms; six query samples 28.6–93.1 ms, all within the unchanged 200 ms boundary. Maximum twelve mounted rows, last match reachable and real source opened. This is after-load sampled file-search evidence, not cold/JDT startup, symbols, Dense or JVM approval. [Methods and retained invalid diagnostics](migration/picker.md#full-production-project-with-5000-files--2026-10-23). Other performance failures remain OPEN.


## Static environment capture ownership — 2026-10-23

The actual environment capture counter previously rose 34 → 94 through fourteen public interaction checkpoints and increased again after recovery. The fixed owner stays at 1 throughout; recovery creates a new resource that stays at 1. This proves removal of repeated cube captures, not a measured command-latency gain. Main-entry gzip 71,761 bytes passes; shell static closure 670,269 bytes is diagnostic. The unchanged full Dense gate completes all ten stages but FAILS seek p50/p95 98.745/114.889 ms, Focus p95 134.283 ms and Home p95 165.676 ms against 55/112/125/152. Cold loads, all five orbit windows and the soak pass. One `ERR_NETWORK_IO_SUSPENDED` browser error also fails the runner. No command-latency benefit is demonstrated; Dense and separate retention failures remain OPEN. [Ownership, native evidence and limits](migration/static-environment.md). Whole-product A–G acceptance remains OPEN.


## Inspector mount ownership — 2026-10-23

The Inspector now mounts only when its resolved selection/Focus target exists. In two fresh actual-JVM, thirty-seek CPU diagnostics, React prop-diff self time falls 131.084 → 13.325 ms and sampled seek p50 98.596 → 83.294 ms. This removes invisible work without changing runtime storage or disabling diagnostics; it does not pass or replace the formal 55/112 ms seek gate. The latest full Dense report remains the parent 0c10d14 boundary with four latency failures and one suspended event stream. [Evidence, lifecycle scope and limitations](migration/idle-inspector.md). Whole A–G acceptance remains OPEN.


## Completed-stream ownership — 2026-10-24

Closed Java recordings previously retained open event streams. Native RED and corrected cases verify retirement after the accepted raw head; stop ordering and raw-error retry remain truthful. The corrected full Dense gate completes all ten stages with zero browser errors/suspended requests. Seek p95 passes 99.577 ms; seek p50 82.597 ms, Focus p95 134.798 ms and Home p95 165.740 ms still fail 55/125/152. Cold loads, all five orbit windows and soak pass. Earlier retention failures remain OPEN. No isolated/statistical latency gain is attributed to SSE retirement. Main-entry gzip 71,759 bytes passes; shell static closure 670,412 is diagnostic. [Lifecycle policy, reproduced failures and evidence](migration/stream-retirement.md). Whole-product A–G remains OPEN.

## Stable array-window ownership — 2026-10-24

Unchanged array windows now retain identity while changed geometry, budgets or admission evidence invalidate it. All 288 compared Dense plans remain equal; the actual component comparator admits 39,756 → 23,650 potential array labels. The complete fresh-JVM browser gate still FAILS seek p50 82.373 ms, Focus p95 135.067 ms and Home p95 165.825 ms. Seek p95 99.727 ms, cold loads, all five orbit windows and soak pass with zero browser errors. This removes redundant work without demonstrating command-latency improvement. Earlier presentation-retention failures and whole-product acceptance remain OPEN. [Proof, full metrics and source boundaries](migration/array-window-identity.md).

## Qualified frame-title layout — 2026-10-24

The two-line title layout keeps one batched text object per title. Main-entry gzip 71,761 bytes passes; Shell closure 670,910 is diagnostic. The unchanged complete actual-JVM Dense gate still FAILS seek p50 82.293 ms, Focus p95 135.221 ms and Home p95 166.041 ms. Seek p95 98.403 ms, cold loads, all five orbit windows and soak pass with zero browser errors. No command-latency gain is demonstrated; earlier presentation-retention failures remain OPEN. [Full metrics, source boundary and evidence](migration/frame-title-layout.md).

## Rounded insets and shared face programs — 2026-10-24

Final source `ccf6fc32eed7017ee3b5974c36877e6da1228e2942d3f8ae6c918ee43dc355a3` completes all ten unchanged actual-JVM Dense stages with zero browser errors. Seek p50 82.628, Focus p95 134.451 and Home p95 165.434 ms still fail 55/125/152 ms; seek p95, cold loads, all five orbit windows and soak pass. The intermediate band-owned candidate and final renderer-owned candidate retain separate full reports/source maps. Additional command profiles sample program-info time 142.623→94.638 ms; these are diagnostic samples across separate runs, not exact calls or statistical latency proof. Fixed Hero counters remain 96 calls, adding one shared geometry and 6,744 submitted triangles. [Full budgets, evidence, resource lifetime and limitations](migration/rounded-value-insets.md). The independent Node retention failures and whole-product acceptance remain OPEN.

## Connector hover cost gate — 2026-10-25

The unchanged ten-stage actual-JVM Dense run completes with zero browser errors. Seek p50 82.306, Focus p95 150.269 and Home p95 166.177 ms fail 55/125/152 ms; seek p95, cold loads, all five sustained orbit windows and soak pass. Focus tail is higher than the preceding run, so no latency non-regression is claimed. Renderer calls remain 102 during orbit; CPU p95 is 2.4/2.4/2.5/2.4/3.2 ms. [All budgets, profiles, source boundaries and retained limitations](migration/connector-hover.md). Presentation-retention and final whole-product gates remain OPEN.

## Test-only origin coverage — 2026-10-25

Static/large-array native coverage changes no production file: all 960 prior inputs and fourteen built JS resources match `91f1161`. Entry gzip stays 71,759 bytes; entry/Shell static closures stay 72,187/673,164 diagnostic bytes. No new timing or retention approval is claimed. The parent's three Dense latency failures and prior independent retention failures remain OPEN. [Source/build proof and checks](migration/connector-origins.md).
