# Pass 6 performance and acceptance

The comparison starts at the published Pass 5 commit `6f665bb5e57c86e06d26fb7f525c9b1807057cfa`. The fixed Dense browser workload keeps the same source digest, sample counts, percentile definitions, viewports, orbit duration, soak, and gates as the original audit. Node projection, browser lifecycle, renderer submission, and the production bundle each have their own measurement boundary. The host is the same Apple M1 Pro Mac with a 16 GiB memory configuration, Node 24.22.1, Chrome 158, DPR 1, and Temurin JDK 26. [Original measurements and reproduction](PERFORMANCE-BASELINE.md)

## Fixed gates

**Performance verdict — FAIL.** The release build completed all ten stages and all 27 browser rows, with zero browser errors and zero failed stages. **23 passed.** Seek p50, seek p95, Focus p95 and Home p95 exceeded budget. Chrome was 158.0.8127.36 for the fresh Pass 5 comparator and 158.0.8127.37 for both Pass 6 runs. The release product source was `2718080`. Its built hashes match the lifecycle release, and the fixed workload and gates are byte-identical to Pass 5. [Release gate and raw evidence](../../../test-results/reference-pass6/release/fixed/)

| Metric | Pass 5 comparator | Pass 6 release | Budget | Result |
| --- | ---: | ---: | ---: | --- |
| Cold World restore, median of five | 3,536.26 ms | 3,545.49 ms | ≤ 5,300 ms | PASS |
| Seek p50, 100 actions | 67.80 ms | 74.18 ms | ≤ 55 ms | FAIL |
| Seek p95 | 114.61 ms | 118.71 ms | ≤ 112 ms | FAIL |
| Focus p50, 50 distinct array cells | 100.57 ms | 117.25 ms | — | INFORMATIONAL |
| Focus p95 | 148.90 ms | 237.58 ms | ≤ 125 ms | FAIL |
| Home p50, 50 actions | 126.45 ms | 142.49 ms | — | INFORMATIONAL |
| Home p95 | 179.85 ms | 273.94 ms | ≤ 152 ms | FAIL |
| Worst of five active orbit p95s | 18.5 ms | 17.8 ms | ≤ 33.3 ms | PASS |
| Active orbit median, all five viewports | 16.7 ms | 16.7 ms | ≤ 16.7 ms | PASS |
| Orbit maximum draws / worst submission CPU p95 | 71 / 2.8 ms | 71 / 2.5 ms | ≤ 250 / ≤ 6 ms | PASS |
| Fixed 61-second orbit median interval drift | ~0% | ~0% | ≤ 10% | PASS |
| Fixed 61-second orbit post-GC heap drift | +2.36% | +0.43% | ≤ 5% | PASS |
| First composition segment p95, seek / Focus / Home | 38.21 / 37.14 / 40.17 ms | 38.79 / 49.28 / 42.94 ms | — | INFORMATIONAL |
| Mixed seek including full settle, p50 / p95 | 304.23 / 361.10 ms before editor cleanup | 300.31 / 326.15 ms | — | INFORMATIONAL |
| Hero draws, Interactive / Cinematic | — | 62 / 74 | — | INFORMATIONAL |
| Focus draws, Interactive / Cinematic | — | 66 / 76 | — | INFORMATIONAL |
| Dense Home draws, Interactive / Cinematic | — | 62 / 78 | — | INFORMATIONAL |
| Dense CLOSE draws, matched manual cut | — | 62 / 78 | — | INFORMATIONAL |
| Interactive GPU p95 at Dense Home | — | 3.64 ms | — | INFORMATIONAL |
| Cinematic GPU p95 at Dense Home | — | 11.97 ms | — | INFORMATIONAL |
| Main entry gzip | 71,873 bytes, original audit | 72,470 bytes | ≤ 500,000 bytes | PASS |
| Rich semantic heap, 190,031 events | 353.68 MiB, original audit | 353.74 MiB | ≤ 390 MiB | PASS |
| Single LINE event cost, 20k / 1k objects | 1.10× | 1.34× | ≤ 2× | PASS |
| Generated presentation retention, all three sizes | 174.77 / 47.13 / 39.95% | 173.90 / 45.46 / 38.72% | ≤ 25% each | FAIL |

The fixed timeline and camera gate ends at committed UI plus two real animation frames. The first-composition segment is the portion after UI commit. The mixed seek starts from the same native cursor operation and waits for camera, text and presentation settle. Release p99 action latencies were 168.31 ms for seek, 333.76 ms for Focus, and 276.48 ms for Home.

The earlier built Pass 6 cut at `d53cedd` passed 25/27 with seek 66.76/101.50 ms, Focus p95 134.00 ms, and Home p95 141.72 ms. The release's Focus and Home command segments increased from 93.60 and 114.70 ms p95 to 165.90 and 200.33 ms. The release stage ran after the other GGJavaEZ harnesses. Host samples also showed screen sharing and unrelated Node work. The runs establish inconsistent interaction latency. They leave the relative host and application contributions unresolved. Cold restore, all viewport submission budgets, and the fixed one-recording soak passed both runs. [Earlier Pass 6 gate](../../../test-results/reference-pass6/fixed-dense-final/raw/browser-world-performance.json)

| Active orbit viewport | Submissions / measured seconds | Interval p95 / max, ms | CPU p95, ms | Resolved GPU p50 / p95, ms | Maximum draws | Triangles per frame |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1728×1117 | 1,781 / 30.89 | 17.7 / 444.8 | 2.20 | 3.12 / 4.38 | 71 | 64,508–166,118 |
| 1440×900 | 1,786 / 31.04 | 17.7 / 544.5 | 2.20 | 1.99 / 3.54 | 71 | 64,508–166,118 |
| 1280×800 | 1,786 / 31.38 | 17.7 / 882.5 | 2.40 | 1.42 / 2.88 | 71 | 64,514–166,118 |
| 760×900 | 1,825 / 31.48 | 17.5 / 942.8 | 1.80 | 0.93 / 1.91 | 68 | 64,646–155,606 |
| 1440×650 | 1,789 / 31.80 | 17.8 / 1,015.5 | 2.50 | 1.33 / 2.80 | 68 | 64,502–155,606 |

All twenty viewport checks passed. The 1,015.5 ms maximum remained close to the Pass 5 comparator's 1,016.2 ms. Attribution of the longest active-window gap remains open. The fixed one-recording soak submitted 3,486 frames over 61.84 seconds. Post-GC heap moved from 67,860,896 to 68,151,612 bytes and listener count moved from 612 to 611.

The fixed dense Java case captured 7,492 raw and 9,852 normalized events with exact output. Its release invocation took **781 ms** for compilation, **3,227.73 ms** from Run through terminal JVM metadata and **5,070.69 ms** from Run to ready World. Pass 5 measured 898, 3,554.51, and 5,819.28 ms respectively. Restore uses a fresh browser context on the completed recording. The five release samples were 3,600, 3,528, 3,560, 3,545 and 3,496 ms.

The independent built Domain startup probe used a new browser context and clean project. Navigation reached the mounted shell at **373 ms** and the active Java tab, Monaco and enabled Run at **949 ms**. The actual Run command was accepted at **116 ms**. Javac reported **710 ms**, terminal JVM metadata arrived at **3,033 ms**, and the normalized World was ready at **3,457 ms** from Run. The recording contained 110 raw and 182 normalized events. [Startup probe](../../../test-results/reference-pass6/gpu-driver/final-playwright/)

## Generated memory and replay

| Nominal raw records | Actual raw / normalized | Semantic retained bytes | Presentation retained bytes | Ratio and outcome |
| ---: | ---: | ---: | ---: | --- |
| 200 | 208 / 367 | 933,200 | 1,622,880 | 173.90% FAIL |
| 5,000 | 5,024 / 8,875 | 12,418,392 | 5,644,888 | 45.46% FAIL |
| 20,000 | 20,018 / 35,346 | 55,630,848 | 21,542,328 | 38.72% FAIL |

The 20,000-record corpus retains about 5.61 MB in layout, 5.15 MB in projector construction, 5.15 MB in the initial SceneModel, 0.60 MB in the FlowCatalog and 5.03 MB in three final plans and resolved flows. These are incremental forced-GC measurements from the unchanged test. The additional post-replay footprint, including retained diagnostics and semantic state, fell from 20.14 to 17.80 MB after the ownership changes. The distinct rich-semantic run sampled 186 checkpoints at its largest size, within the cap of 256. Semantic-only scrub p50/p95 was 4.84/30.75 ms. [Generated presentation](../../../test-results/reference-pass6/node-final/modern-world-performance.json) · [Rich semantic](../../../test-results/reference-pass6/semantic-isolated/performance.json)

For the generated 20,000-record sample, NDJSON parse took 19.98 ms. The 79 validated normalization, reduction and graph batches totaled 557.84 ms, with p95 21.45 ms per batch. Layout, projector indexing, initial SceneModel projection and flow indexing took 77.17, 63.61, 65.59 and 37.11 ms respectively. Across the 100 replay points, history materialization, SceneModel projection and flow prefix p95 were 7.48, 49.53 and 34.98 ms. The profile separates those stages from native Java compilation, transport, React and the GPU.

## Baseline and profiled phases

The clean Pass 5 production QA build completed all ten fixed stages. It passed 23 of 27 browser rows. Seek p50 and p95, Focus p95, and Home p95 exceeded budget. The profile uses separate diagnostic action windows and source maps generated against byte-identical JavaScript. CPU samples are cumulative across actions and do not account for all wall-clock wait time.

| Action | Main sampled work before the first committed composition |
| --- | --- |
| Seek, eight actions | 89.85 ms runtime/history, 72.98 ms flow and routing, 15.49 ms SceneModel work |
| Focus, six actions | 31.98 ms flow and connector work, 24.86 ms workbench, 22.34 ms React and R3F, 8.75 ms camera |
| Home, six actions | 65.91 ms flow and routing, 63.85 ms camera including 48.58 ms fitting, 56.29 ms text/preparation, about 23.42 ms GC and 21.47 ms editor |

Raw results and source-mapped diagnostics are under `test-results/reference-pass6/fixed-dense-pass5-20261123T174328Z/`. The profile starts at dispatch. JVM discovery, compilation, process startup, SSE and normalization are measured separately where the harness exposes them. Render CPU samples cover submission from the timed render owner. Resolved GPU timer queries cover graphics commands, including effects active in that tier. They provide neither end-user FPS nor native GPU memory size.

## Changes with measured targets

| Owner | Before | Change and measurement |
| --- | --- | --- |
| Recorded binding index | The largest generated corpus retained 5,821,688 bytes through projector construction | Reuse the accepted event index for envelope uniqueness and discard closed local scope bookkeeping. The isolated owner stage retained 5,179,216 bytes, down 642,472 bytes. Standalone binding history still validates event IDs. |
| SceneProjector | Semantic checkpoints can keep immutable leaf keys and older cached presentation rows reachable | Keep one immutable projection per runtime identity, with exact source leaf, anchor, evidence and dependency reuse checks. Prune identities outside the rewind cut. In the largest generated test the post-replay increment fell from 19.11 MB after the binding change to 17.82 MB with this cache change. Published old projections remained immutable in the focused tests. |
| FlowCatalog and connector topology | Largest generated prefix p50/p95 20.71/43.10 ms after the projector change. CLOSE plan 21.88/51.68 ms. | Reuse up to 512 top-level endpoint resolutions per scan and preflight unavailable endpoints. Recursive resolution retains its work and depth limits. Prefix p50/p95 was 17.07/35.94 ms and CLOSE plan 18.82/35.97 ms in the paired generated run. Native latency is qualified independently. |
| Home framing | The Home profile spent 48.58 ms in fitting across six actions. | Reuse structural-label and exception-panel footprints at repeated poses during one Home command. The cache holds at most 16 poses and dies with the call. Paired dense fitting fell from 1.81 to 1.07 ms per Home, with 590 exact pose and point parity checks. |
| Workspace source bindings | The workspace retained one generation and one source binding entry per successful Run | Keep the active attempt and the displayed recording, then prune on replacement. A switch holds at most the binding for the bridge's latest attachable session. That preserves durable source rename and reload behavior when returning to its project. A failed build keeps the previous published world's source mapping. [Lifecycle evidence](PASS-6-SOAK.md) |
| Monaco Save command | An editor mount added a global command and its callback was retained after editor retirement. V8 snapshots showed one old dynamic command at the first sample and seven at the end of two cycles. | Register the same Save shortcut as a disposable editor action and release it with the editor's other listeners. Old editor callbacks can otherwise retain the old workspace and World through their lexical scope. [Retaining path and lifecycle receipts](PASS-6-SOAK.md) |
| WebGL context cache bindings | Identical Three.js resources reached 31 dispose callbacks after 30 context restorations. | Release lost-context bindings from long-lived World geometries, instances and textures, including the renderer's DFG texture. The 30-restore retest preserved the canvas and rendered state. Disposal callbacks held steady and the measured final heap fell from 43.68 to 32.39 MiB in the paired diagnostic. [Retaining path and recovery controls](PASS-6-SOAK.md) |

The experimental numeric key parser and radix table passed focused parity. The observed profile included persistent storage reads, but there was insufficient evidence of a material benefit to retain that experiment. A broader camera-basis and constraint rewrite moved paired median Home fitting from 2.05 to 3.43 ms, despite sub-pixel parity. It was reverted before candidate qualification. An early placement of the graphics cleanup pulled Three.js into the QA entry and raised its gzip size to 171.70 kB. Moving the cleanup into the lazy render owner returned the entry to its usual size. Camera diagnostic logs and rejected patches are in `fixed-dense-pass5-20261123T174328Z/home-fit/`.

## JDK 17

Azul Zulu 17.0.20.1 reproduced the original defect. Plain Java exited 0 and printed the expected stdout, but missing recorder APIs left Run at `RUN_ONLY` with zero events and prevented Debug from launching. The missing methods were `Thread.threadId()` and `PrintStream.charset()`. The observation code now detects those public APIs, retains their behavior on newer JDKs, and uses supported JDK 17 paths for thread identity and the stock stream encoding. The recorder leaves a replaced stream with unknown encoding available to the program.

The same isolated bridge fixture produced 20 raw events for each Run and Debug on both JDK 17 and 26. Five targeted instrumentation checks on each JDK covered exact encoded stdout/stderr, recorded text, thread continuity and Debug boundaries. Optional JDT language service retains its separate JDK 21+ requirement. Detailed receipts are in `test-results/reference-pass6/jdk17/`.

## Renderer and GPU

The current real-JVM tier sample uses matched settled camera cuts and forces stationary submissions via the existing readiness observer. The quality governor drops to Interactive during orbit, so stationary sampling exercises the actual Cinematic reflection, AO, and bloom passes. Readings cover the whole submitted frame and give no independent duration for each effect. The matched tiers use eight and eleven composer targets respectively, with one additional floor target in Cinematic. At most one query per sample window stayed pending. [Tier probe, raw samples and captures](../../../test-results/reference-pass6/gpu-driver/)

| Real cut at 1440×900 | Interactive draws / triangles | Cinematic draws / triangles | Interactive CPU p95 / GPU p50 / p95, ms | Cinematic CPU p95 / GPU p50 / p95, ms | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| Domain Hero, setter write | 62 / 73,964 | 74 / 84,541 | 2.0 / 2.50 / 4.85 | 3.0 / 7.17 / 10.71 | INFORMATIONAL |
| Domain Focus, same recording and write | 66 / 75,110 | 76 / 77,975 | 6.3 / 2.72 / 3.11 | 6.7 / 11.70 / 12.78 | INFORMATIONAL |
| Dense InventoryWorld Home, completed | 62 / 57,896 | 78 / 73,209 | 2.3 / 1.82 / 3.64 | 8.4 / 6.51 / 11.97 | INFORMATIONAL |
| Dense InventoryWorld manual CLOSE, after zooming in | 62 / 160,160 | 78 / 196,745 | 2.1 / 2.97 / 3.79 | 2.6 / 8.30 / 10.95 | INFORMATIONAL |

Hero kept 31 curves and 30 heading and structural label receipts across tiers. Focus kept 33 curves and 31 such labels. Dense Home kept five curves and 24 such labels. Manual CLOSE kept 20 curves and 54 labels. The first mixed run's manual Dense FAR, MEDIUM and CLOSE measurements were 56 / 35,786, 80 / 107,246, and 62 / 160,160 draws / triangles using Interactive. Returning to Home in that cycle after cluster inspection used 68 draws and 64,274 triangles. Dense geometry count stayed within 35–36 during the sampled zoom changes.

The 100,003-cell array rendered 22 cells with 42–45 draws and 30,926–34,736 triangles at tested write and read cuts. The release's 64-element List, Set, Map and Deque Focus cuts used 66–69 draws and 34,814–63,746 triangles. The 96-object exception fixture used 62–74 draws and 22,370–37,826 triangles across its native throw, unwind and catch cuts. The smaller exception reference at 1440×900 used 71 draws and 33,314 triangles. [Scale receipts](../../../test-results/reference-pass6/release/mixed/)

## Production bundle

The clean release production build completed with **72,470 bytes gzip** for the main entry against **500,000 bytes**. The static entry closure was 72,901 bytes and the static application shell closure was 694,165 bytes. Monaco and Cinematic pass files remain separate from the main entry. Vite still reports its large-chunk advisory, including the lazily requested Monaco module. [Production artifact report](../../../test-results/reference-pass6/release/production-build.json)

## Qualification and visual regression

| Check | Outcome |
| --- | --- |
| Application typecheck, reference typecheck, lint, production build | PASS on release source. [Build receipt](../../../test-results/reference-pass6/release/build-qualification.log) |
| Source, presentation, golden, and reference unit checks | PASS, 1,989 passed and seven configured skips on release source. Earlier concurrent timeouts cleared in the isolated rerun. [Unit receipt](../../../test-results/reference-pass6/release/unit.log) |
| JDK 26 acceptance corpus | PASS, 191 passed and four manifest-declared expected failures using actual instrumented JVM, Maven, and Gradle workloads. [Acceptance receipt](../../../test-results/reference-pass6/acceptance.log) |
| JDK 17 and 26 recorder compatibility | PASS, five targeted tests on each version and real bridge Run and Debug on each. [Compatibility receipts](../../../test-results/reference-pass6/jdk17/) |
| Selected real-JVM reference matrix | PASS across the 22-case first subset and 12 representative retakes after the editor and projection work. The retake's one cold-start editor visibility timeout cleared in isolation. Hero, Focus, recursion, returns, arrays, I/O, exceptions, semantic zoom and free camera were exercised. The selected widths and heights included all five reference viewports. [First subset](../../../test-results/reference-pass6/reference-matrix.log) · [Retake](../../../test-results/reference-pass6/final-reference-matrix.log) · [Isolated Hero](../../../test-results/reference-pass6/isolated-hero.log) |
| Targeted browser interactions | PASS, 12 isolated checks of Save and source rename/reload, timeline replay, array caption spacing, narrow Focus orbit, native context recovery, fallback, quality laziness and real Debug source scrolling. [Isolated interaction](../../../test-results/reference-pass6/isolated-interaction.log) |
| Broader exploratory browser run | 35 passed, 15 initial failures. The failure receipts distinguish startup and JDT timeouts, a stale array caption expectation from Pass 5's bounded windows, a narrow Focus interrupted during the changeover, and connector-hover assertions. The selected retakes above include real Debug and navigation proof. [Broader run](../../../test-results/reference-pass6/interaction.log) |
| Isolated built release graphics and narrow dense checks | Six passed, including all four graphics cases and both 760×900 array caption cases. The static and virtualized array connector tests still miss their core/3 px halo hover at 1440×900 and 760×900. The same two assertions fail with the frozen Pass 5 assets. [Release retest](../../../test-results/reference-pass6/release/interactions/candidate.log) · [Pass 5 control](../../../test-results/reference-pass6/release/interactions/baseline.log) |
| Final release context and lifecycle controls | PASS, 20 replacement Runs, 50 tier round trips, and 15 recoveries per tier in the same document. [Lifecycle report](PASS-6-SOAK.md) |

The visual check compared the current Hero, narrow Focus, Dense and Cinematic Focus captures next to Pass 5 and the supplied references. The setter mutation, highlighted source, stack and heap depth, Focus Inspector and the main connector are preserved. Dense manual viewpoints still show peripheral clipping and long secondary routes, as recorded in Pass 5. The Pass 6 changes address resource ownership and computation. [Release Dense capture](../../../test-results/reference-pass6/release/fixed/raw/browser-world-dense-interactive-1440x900.png) · [Matched two-tier captures](../../../test-results/reference-pass6/gpu-driver/static-playwright/)
