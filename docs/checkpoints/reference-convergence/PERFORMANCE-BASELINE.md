# Performance and memory baseline

**Merged source:** `cd4bd85d4f1221b2cecb6babdd6227ccfe058e24`. Apple M1 Pro, 16 GiB, macOS 15.2, Node 24.22.1, Chrome 158 on ANGLE Metal, DPR 1 and Temurin JDK 26.0.2.1. Browser acceptance uses the built app with the existing opt-in QA observer and actual JDT/JVM bridge. Visual and mixed lifecycle diagnostics use the normal Vite development server. Report the result for each serving mode as measured.

## Build and environment

A clean-mode `npm run build` with no QA override passes TypeScript and Vite. The official `scripts/reference/measure-build.mjs` reports **71,873 bytes** for the main entry against the **500,000-byte gzip limit**. Its entry static JS closure is 72,304 bytes, and its application-shell static JS closure is 682,960 bytes, measured as sums of separate compressed resources. The Cinematic pass chunk is separate, and Monaco remains split. Vite warns on large chunks. The limit covers the main entry file; shell closure and lazy editor cost remain visible as distinct measures. The dev server printed 137 ms to Vite readiness in the JDK 26 run, which measures server startup only.

## Fixed Dense browser workload

The repository’s `perf-e2e/reference-world.spec.ts` extracts the ordinary `Topology.java` source from its established historical fixture. The measured browser starts a fresh JVM, with no reuse of prior raw events or session identity. The source SHA-256 is `97e6a390f5349cb8a474d5ff2f5de3104bad8c3f86f46fea43ad4b9e841b10da`. It produced 7,492 raw / 9,852 normalized events and 4 frames / 33 objects, with exact stdout and full observation. Native seek, cell Focus and Home are measured through actual UI actions. Cold restoration uses fresh browser contexts against the same new recording with JDT enabled.

The single Run-to-JVM-completed sample was **3,108 ms**. Run-to-ready-World was **5,105 ms**. These include command/Java/startup and transport or readiness as defined in the harness. Five cold World loads were approximately 3,706 / 3,552 / 3,625 / 3,518 / 3,556 ms. Cold restoration is a different measurement from Run-to-World.

**Fixed browser gate: FAIL.** All ten stages completed, with zero recorded browser or stage errors. Of 27 required browser rows, 25 passed and two were over budget. Four external rows remain outside this browser probe. Their separate build and Node measurements appear in this report.

| Native action / metric | Samples | p50 | p95 | Maximum | Fixed result |
| --- | ---: | ---: | ---: | ---: | --- |
| Cold World restore | 5 | 3,555.74 ms | — | 3,706.32 ms | Pass, median ≤5,300 ms |
| Spread timeline seeks | 100 | 66.83 ms | 84.33 ms | 170.18 ms | Median over 55 ms, p95 passes 112 ms |
| Array-cell Focus | 50 distinct | 116.92 ms | 132.94 ms | 166.12 ms | p95 over 125 ms |
| Home | 50 | 114.92 ms | 131.79 ms | 158.35 ms | p95 passes 152 ms |

Action latency is request through committed UI and the first measured composition boundary. Focus/Home p95 is distinct from completed camera travel. See the per-action command/commit/composition stages in the raw report.

| Active orbit viewport | Submissions / span | Interval p50 / p95 / max, ms | Submit CPU p95, ms | GPU elapsed p50 / p95, ms | Max draw calls | Triangles / frame |
| --- | --- | --- | ---: | --- | ---: | --- |
| 1728×1117 | 1,828 / 30.49 s | 16.7 / 18.0 / 34.0 | 2.5 | 5.295 / 6.488 | 102 | 331,885–332,441 |
| 1440×900 | 1,817 / 30.95 s | 16.7 / 17.9 / 462.6 | 3.8 | 3.846 / 5.249 | 90 | 534,905–631,637 |
| 1280×800 | 1,825 / 31.25 s | 16.7 / 17.0 / 747.7 | 3.8 | 3.087 / 3.792 | 90 | 534,905–631,637 |
| 760×900 | 1,831 / 31.35 s | 16.7 / 18.1 / 845.0 | 2.2 | 1.549 / 2.124 | 103 | 102,885–332,441 |
| 1440×650 | 1,828 / 31.37 s | 16.7 / 18.5 / 873.0 | 2.6 | 2.599 / 3.306 | 102 | 331,887–332,441 |

All orbit budget rows pass. All but three GPU queries resolved within their sampling windows; three were pending and zero unavailable. Resource ranges during orbit were 33–40 geometries, 31 textures and 56–58 programs. The retained **873 ms** maximum interval prevents a no-jank conclusion. Its cause is not established by a duration distribution. Frame intervals refer to the intentionally active gesture windows.

The fixed one-recording, 61.00 s orbit soak submitted 3,628 frames. First-to-last ten-second median interval drift was approximately zero. Whole-frontend JS heap after CDP GC was **73,026,324 → 73,001,428 bytes (−0.0341%)**, with unchanged documents, nodes and listeners. Both fixed soak rows passed. This steady-state observation and the repeated-lifecycle growth below describe different workloads.

## CPU projection and memory method

The generated reference-world test owns layout, SceneModel, FlowCatalog and planning stage measurements and runs with explicit GC. It creates three deterministic generated corpora at nominal 200, 5,000 and 20,000 raw records, then samples 100 spread, direction-changing prefix seeks and uses a separate held-one-event update at 1,000 and 20,000 objects. These are CPU diagnostics, distinct from UI seeking or real JVM execution. The same-session presentation retention covers the layout, projector, scene, FlowCatalog and three final plans, above a measured semantic delta from the same test process. The fixed presentation ceiling is **25%** and the single-event median scaling ceiling is **2×**. The independent rich graph assay owns the 390 MiB semantic boundary.

The initial Node invocation from the parent accidentally discovered both copies of the identical test because the temporary checkout was nested there. Both found all three retention limits exceeded and the report path was overwritten by the second run. The acceptance numbers below use isolated invocations from the audit checkout. The initial log remains retained.

| Nominal raw target | Actual raw / normalized | Layout / projector index / first projection, ms | History materialize p50/p95, ms | SceneModel projection p50/p95, ms | Flow prefix p50/p95, ms | Semantic / presentation bytes | Presentation % / result |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 200 | 208 / 367 | 1.07 / 1.46 / 2.95 | 0.78 / 1.64 | 0.38 / 0.64 | 0.11 / 0.27 | 931,864 / 1,514,856 | 162.56% / over |
| 5,000 | 5,024 / 8,875 | 18.84 / 36.46 / 15.47 | 1.10 / 7.28 | 5.25 / 9.74 | 3.13 / 6.71 | 12,432,800 / 5,896,312 | 47.43% / over |
| 20,000 | 20,018 / 35,346 | 86.77 / 61.69 / 62.13 | 1.35 / 9.54 | 23.31 / 44.16 | 17.54 / 34.10 | 55,700,480 / 22,237,680 | 39.92% / over |

Largest-corpus plan p50/p95 was 17.68/34.90 ms FAR, 17.66/33.14 ms MEDIUM, and 17.97/34.35 ms CLOSE, measured independently following each seek. The 20,000-record corpus retains roughly 5.44 MB for layout, 5.82 MB for projector indexing, 5.15 MB for the initial scene, 0.60 MB for FlowCatalog indexing and 5.23 MB for three final plans and resolved flows at the sampled checkpoints. These owner-stage deltas estimate retained heap, with collection noise and shared ownership. Their sum matches the reported presentation delta. All three exceed the 25% ceiling.

The separate 100-batch identical LINE update took median **0.0438 → 0.0455 ms** at 1,000 → 20,000 actual objects, **1.038×** against the 2× limit. Single-event scaling passes and broad prefix projection is still expensive on large generated histories.

The independent rich graph probe passed, exercising **462 / 9,788 / 38,302 / 190,031 semantic events**. Its largest enriched retained-process delta is **353.68 MiB** against **390 MiB** and the prior 354.56 MiB sample. Largest semantic-only scrub p50/p95 was **5.11 / 30.19 ms**. It has different retention ownership from the browser heap and the presentation ratio test. Its controlled event counts match Phase 5.5 and the earlier report uses different hardware/runs. The one rich retained-heap result cannot establish a lifecycle plateau.

## Matched quality and rendering cost boundaries

The Person Focus pair uses identical recording, cursor 48 and camera pose at 1672×941. Both tiers became ready on the real local GPU. The quality observed was hardware-capable WebGL 2 with half-float target support, four maximum samples, and a 16,384 maximum texture size. In these settled frames, Interactive → Cinematic was **89 → 129 draw calls**, **44,331 → 61,213 triangles**, **33 → 35 geometries**, and **31 → 45 textures**. The counts include auxiliary/shadow/composite work. They show the incremental whole-tier resource burden of this matched scene, including shadow/contact, materials, and post-processing differences.

| Area | Measured or inspected boundary |
| --- | --- |
| Draw calls / triangles | Whole-frame submission counters and capture JSON. E.g. staged native Hero 84 / 80,185, ordinary Person Home 92 / 44,031, native Dense CLOSE 97 / 409,455. Much geometry is handled in batches, so similar call counts can conceal large triangle changes. |
| Text and connector burden | Native Hero has 23 planned curves, including two bundle curves; ordinary Person Home has 12. Native Dense CLOSE has 45 curves. Captures record projected glyph and heading stats, cell counts, and plan accounting. Several Dense repetition rows and labels are intentionally quiet/cullable. |
| Picking | Native route hover, observed collection cell pick, pointer selection, and fifty distinct Dense cell Focus end-to-end. These measure interaction effects or UI action intervals. Isolated picking CPU/GPU cost was outside the existing counters. |
| Shadows and floor | Renderer owns shadow, planar mirror and contact auxiliary passes. Whole-frame submissions and the quality pair show their aggregate costs. No isolated shadow map, contact, or reflection timer was taken. |
| Transparency and post-processing | Shared body/fronts plus selective bloom, masks and antialiasing run in the whole submission. Cinematic swaps material/effects and adds an alternate contact/AO path. No isolated blend-overdraw, transmission, bloom or mask attribution was captured. |
| CPU and GPU semantics | CPU submission excludes browser work preceding the timed render owner, including some React, plan and text preparation work. GPU extension queries measure submitted graphics commands where resolved. The cadence series is active-gesture submission intervals, with visible stalls retained. No physical presentation/FPS, hardware utilization or VRAM-byte inference is made from these values. |
| Startup/transport | Production split is checked in build artifacts. JDT, SSE receipts and cold observation are retained in the built-browser report. The mixed lifecycle test is a separate workload and should be read independently. |

## Repeated lifecycle soak

The same live browser document ran **194.225 s** of mixed work in development mode. Across ten cycles and the final repeat, it started **21 fresh instrumented JVM sessions**, alternating Array and InventoryWorld projects using the Project menu. It performed repeated cursor seeks, cell inspection, Focus/Home, orbit/pan/dolly, Dense member inspection and **ten real Cinematic round trips**. All 11 memory snapshots are after explicit CDP GC, at the identical Array Home camera and cursor 63, with matching scope, selection, quality and scene counts. Raw evidence is `local-probe-playwright/*valent-pose-post-GC-samples/observations.jsonl`.

| Array checkpoint | JS used MiB after GC | Renderer textures | DOM nodes |
| --- | ---: | ---: | ---: |
| Cycle 1 | 37.700 | 30 | 1,340 |
| Cycle 2 | 45.429 | 40 | 1,369 |
| Cycle 3 | 48.978 | 41 | 1,373 |
| Cycle 4 | 52.467 | 42 | 1,377 |
| Cycle 5 | 55.387 | 43 | 1,381 |
| Cycle 6 | 57.829 | 44 | 1,385 |
| Cycle 7 | 59.206 | 45 | 1,389 |
| Cycle 8 | 60.872 | 46 | 1,393 |
| Cycle 9 | 62.874 | 47 | 1,397 |
| Cycle 10 | 64.965 | 48 | 1,401 |
| Final fresh Array run | 67.483 | 49 | 1,405 |

Every recurring Array state has 72 calls, 25,357 triangles and 31 geometries. Documents stay at 2 and JS event listeners range from 614 to 616. The used-heap series grows **79.0%** start to end and **48.5%** from the second sample after the initial tier warm-up. After that first warm-up interval, texture count continues rising one per sampled cycle/run. There is no plateau within these samples. The result is a same-document retention signal across multiple owners, with no per-type bytes or disposal cause established. Existing geometry, material, text, environment and render-target cleanup paths are present in the code. Counts alone cannot say which texture classes or caches survive intentionally. A heap/texture ownership capture, separate fresh-run-only and tier-only controls, and a longer bounded retention test are needed for acceptance.

No browser console or page errors were recorded in the soak. Two Dense cluster-inspection attempts failed on cycles 6 and 7 because the diagnostic sampled the accepted cursor while the completed recording was still draining into the frontend. Those cuts show a near-beginning cursor (15 and 9) in the screenshots. Eight iterations reached Dense member Focus. The harness marked the mixed test failed and preserved both failures. The Array statistics above use only the equivalent settled checkpoints. This distinguishes a driver synchronization problem from a proven persistent interaction failure, without claiming leak freedom or a clean soak.

### Same-project and quality controls

After the mixed test, one same-document Array control locked the same cursor and pose, first repeating Run five times in the same project, then toggling quality five times in the same recording. Each boundary was settled in Interactive at cursor 63 before explicit CDP GC.

| Sequence | Post-GC JS heap | Renderer textures | Control result |
| --- | --- | --- | --- |
| Five same-project Runs with quality unchanged | 37.83 → 40.76 MiB | 30 → 30 | Repeated Runs show a smaller heap rise with constant geometry, textures and DOM nodes. |
| Five Cinematic round trips on that last recording | 40.76 → 41.62 MiB | 30 → 39 → 40 → 41 → 42 → 43 | An initial tier warm-up and persistent +1 per subsequent trip. Geometry remained at 31. |

Both control sequences passed their action/owner checks without browser errors. The results associate texture growth with quality changes on this renderer even without replacing the recording. They suggest separate heap owners for repeated Run and the broader mixed lifecycle, with type and disposal attribution still open. Raw controls are in `supplement/retention-controls.json`.

## Phase 5.5 comparison boundaries

The earlier accepted three-minute test used the same source program as today’s fixed Dense run, with a retained JVM payload and a different product revision, renderer and interaction mix. It reported 30 UI seeks at 50.45/101.24 ms p50/p95, 54 Focus/Home p95 at 110.97/138.49 ms, CPU submission p95 3.70 ms and asynchronous GPU p95 1.388 ms under that workload. It reported a single 4,816 ms cold retained-World load, plus whole-frontend post-GC heap approximately 97.40 → 104.33 MiB. These are useful context and budget anchors. The current repeated Run/project/tier lifecycle is materially different and cannot be treated as a matched regression experiment against the earlier orbit/history soak. [Phase 5.5 performance](../v12-p5_5/PERFORMANCE.md).

Raw current measurements are in `qa/browser-world-performance.json`, `qa/production-build.json`, `serial-node/modern-world-performance.json` and `rich-node/performance.json`.

The earlier built-app diagnostic recorded 66.248/82.790 ms for seek p50/p95 and 150.950/140.679 ms for Focus/Home p95, with 4,596.878 ms median cold load. It describes another revision. Any difference across those single-host runs is descriptive. [Built application diagnostic](../reference-exact/PERFORMANCE.md#built-application-diagnostic--2026-11-06).

## Reproduction and qualification

Use the same compatible JDK, native locale, and installed JDT location as the visual runs, with a clean bridge workspace. The fixed Dense test requires the historical payload file at `.ggjavaez/qa/v12-p5_5/payloads/02-arrays-cycles-collections.json` for its checked source manifest. It validates the Java source hash and launches a new JVM.

```sh
npm run build
node scripts/reference/measure-build.mjs

VITE_QA=1 npm run build
GGJAVA_PORT=5173 npm run start
npx playwright test --config playwright.perf.config.ts reference-world.spec.ts
```

Run the Node probes serially from the standalone audit checkout, with output directed to separate ignored folders.

```sh
VJ_SUITE=perf VJ_PERF_OUTPUT_ROOT=.ggjavaez/qa/audit-modern npx vitest run tests/perf/reference-world.test.mjs --execArgv=--expose-gc --maxWorkers=1 --fileParallelism=false
VJ_SUITE=perf VJ_PERF_OUTPUT_ROOT=.ggjavaez/qa/audit-rich npx vitest run tests/perf/provenance.test.mjs --execArgv=--expose-gc --maxWorkers=1 --fileParallelism=false
```

**Performance and memory acceptance remain open.** Median seek and p95 Focus exceed their fixed limits, while the tail includes long stalls even with passing orbit p95s. The presentation retention ratio fails at all three generated sizes. The repeated lifecycle has a rising heap and texture series despite steady short single-recording orbit. Next measurements should preserve the existing budgets and isolate the warm lifecycle owners and the long stalls. [Ranked performance and memory findings](BACKLOG.md).
