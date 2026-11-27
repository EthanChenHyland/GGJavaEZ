# Pass 6 lifecycle and resource ownership

## Method

The mixed test uses the audit's Array Home checkpoint at cursor 63 of 297. Each sample starts a fresh instrumented JVM and waits for normalization to reach the published head before seeking and invoking Home. The Chromium document, 1440×900 viewport at DPR 1, camera pose, selection, Focus, quality, lens, visible geometry counts, and project all match. Each checkpoint samples heap before and after explicit Chrome DevTools Protocol garbage collection, DOM counts, the active renderer, text and presentation counts, and Monaco models. GL allocation counts measure logical renderer resources.

Every mixed cycle runs Array, Dense InventoryWorld, and one rotating scale fixture. Native interactions exercise eight seeded seeks, previous/next, playback, Return to Live, cell Focus and exit, orbit/pan/dolly, Home, and a tier round trip when supported. InventoryWorld visits all three semantic zoom levels in both directions, opens a cluster's member, and focuses it. The rotating workloads cover three far-apart indices of the 100,003-cell array, observed List/Set/Map/Deque previews, caught and uncaught exceptions in the linked 96-object case, and whitespace-sensitive Console I/O with bounded World readouts.

The companion control measures an initial Array Run plus 20 replacement Runs, tests a failed build against the retained prior World, and samples actual quality round trips at 1, 5, 10, 20, and 50. WebGL context recovery exercises the loss extension five times per supported tier and checks recording, cursor, selection, camera, quality, effects, and canvas identity.

## Long mixed run

The first frozen Pass 6 build ran **635.908 seconds**, completing **15 cycles and 46 real JVM sessions** in one document. The source overlay and built hashes are archived under `test-results/reference-pass6/lifecycle-candidate/`. A development-browser reference matrix and correctness checks overlapped part of the run, so the series supplies equivalent-state retention and interaction evidence. The fixed performance harness measures native action latency separately.

| Equivalent Array Home checkpoint | Heap before / after GC (MiB) | Documents / nodes / listeners | Geometries / textures | Programs / scene materials | Composer / floor targets |
| --- | ---: | ---: | ---: | ---: | ---: |
| START, cycle 1 | 31.066 / 26.365 | 2 / 1,217 / 609 | 30 / 18 | 40 / 14 | 8 / 0 |
| WARM, cycle 2 | 45.570 / 34.620 | 2 / 1,256 / 609 | 30 / 20 | 48 / 14 | 8 / 0 |
| Cycle 5 | 111.371 / 52.418 | 2 / 1,278 / 609 | 30 / 20 | 48 / 14 | 8 / 0 |
| Cycle 11 | 169.494 / 76.849 | 2 / 1,314 / 609 | 30 / 20 | 48 / 14 | 8 / 0 |
| FINAL, fresh Array | 162.293 / 96.593 | 2 / 1,340 / 608 | 30 / 20 | 48 / 14 | 8 / 0 |

Post-GC heap gained **70.228 MiB** overall and **61.973 MiB after the first warmup**. Every sampled checkpoint rose. The median pairwise slope was **5.746 MiB per minute** after warmup and **6.344 MiB per minute** in the last half. Geometry, textures, linked programs, materials, and targets were flat from cycle 2 through the final checkpoint. The array kept two windows with five admitted cells at the matched cut. Its settled frame consistently used 47 draws and 16,688 triangles. Chromium kept one current Monaco model and zero retained editable view-state entries at those samples.

All scheduled actions completed with zero recorded browser errors. The 16 Array and 15 InventoryWorld executions exercised project switching and repeated Home, Focus and zoom. Four large-array, four collection, four exception and three I/O executions completed the exact interaction assertions. The 120 native mixed seeks include full settle and took p50/p95 **304.2/361.1 ms**. First-half p95 was 379.0 ms and second-half p95 was 336.3 ms. This boundary includes camera, text, and presentation settle and remains independent of the fixed first-composition seek gate.

## Confirmed editor retention

The shorter two-cycle diagnostic reproduced 25.80 → 44.47 MiB after GC and captured both V8 heaps. Three replaced real recording identities followed the same strong path through Monaco's process-wide `CommandsRegistry._commands`, a generated `DYNAMIC_n` command, its Save callback's editor closure, and the shell's captured workspace props and RuntimeState. The active editor's breakpoint action was already disposable and only its current instance appeared in the registry. Counting live command keys showed **1 → 7 Save handlers** over the two cycles. The V8 code and bytecode categories also grew during warmup. Their growth alone does not explain the obsolete recording identities.

`EditableJavaEditor` now installs the Save shortcut with Monaco's disposable `addAction` API and releases it in the same unmount path as the other editor subscriptions. The patched snapshots at START, cycle 5 and FINAL show exactly one editor-scoped Save action and one breakpoint action. Their editor IDs advance from 1 to 13 to 22. The dynamic Save registry rows disappear. The real-JVM lifecycle driver and its optional CDP snapshots exercise project switch, editor replacement, recorded source, and repeated recording handoff. The rename browser regression exercises source binding across a switch and reload, and its keyboard Save path checks the same primary shortcut. Raw snapshots, registry scans and retaining-path extraction are under `test-results/reference-pass6/heap-recipes/`.

## Patched long retake

The patched build completed **643.579 active seconds**, **seven cycles**, and **22 real JVM sessions**. Heap snapshot time is excluded. Every action assertion completed. Five browser console errors corresponded to JDT HTTP 504 responses during the overlapping runs. That marked the Playwright result failed. Host contention slowed several JVM starts and reduced the number of completed cycles over the same active interval. Compare the direction and shape of the heap series as well as its endpoints.

| Equivalent Array Home checkpoint | Heap before / after GC (MiB) | Documents / nodes / listeners | Geometries / textures | Programs / scene materials | Composer / floor targets |
| --- | ---: | ---: | ---: | ---: | ---: |
| START, cycle 1 | 39.362 / 26.628 | 2 / 1,217 / 609 | 30 / 18 | 40 / 14 | 8 / 0 |
| WARM, cycle 2 | 103.921 / 32.630 | 2 / 1,254 / 654 | 30 / 20 | 48 / 14 | 8 / 0 |
| Cycle 5 | 67.635 / 36.331 | 2 / 1,254 / 609 | 30 / 20 | 48 / 14 | 8 / 0 |
| FINAL, fresh Array | 85.035 / 37.739 | 2 / 1,250 / 609 | 30 / 20 | 48 / 14 | 8 / 0 |

The patched series gained 11.111 MiB in total, 5.109 MiB after initial warmup, and 1.408 MiB over the last four measurements. It dipped twice and ended 0.13 MiB below the previous checkpoint. Post-warmup median pairwise slope fell from 5.746 to 0.427 MiB per minute with the same active workload. The final two samples held the same 609 listeners as START. GPU counters stabilized by the second checkpoint. The retake completed eight Array and seven Dense recordings, two large-array, two collection, two exception and one I/O runs. Each mixed timeline checkpoint drained the motion queue, and matched Array cuts still held two windows and five visible cells. [Raw patched retake](../../../test-results/reference-pass6/final-lifecycle/mixed-run.log)

## Isolated release soak

**PASS WITH KNOWN BOUNDED RETENTION.** The release build at `2718080` completed **638.662 active seconds**, **17 cycles**, and **52 fresh JVM sessions** with zero scheduled action failures and zero browser errors. It ran with JDT enabled and with the fixed browser benchmark queued behind it. Time spent collecting the three optional heap snapshots is excluded from the active duration.

| Equivalent Array Home checkpoint | Heap before / after GC (MiB) | Documents / nodes / listeners | Geometries / textures | Programs / scene materials | Composer / floor targets |
| --- | ---: | ---: | ---: | ---: | ---: |
| START, cycle 1 | 35.109 / 26.354 | 2 / 1,217 / 609 | 30 / 18 | 40 / 14 | 8 / 0 |
| First warmup, cycle 2 | 34.312 / 32.519 | 2 / 1,250 / 609 | 30 / 20 | 48 / 14 | 8 / 0 |
| WARM after all scale fixtures, cycle 5 | 98.192 / 37.295 | 2 / 1,254 / 609 | 30 / 20 | 48 / 14 | 8 / 0 |
| FINAL, fresh Array | 100.837 / 38.835 | 2 / 1,254 / 610 | 30 / 20 | 48 / 14 | 8 / 0 |

START to FINAL grew 12.481 MiB as the renderer, editor and JVM workloads warmed. The last nine checkpoints grew **0.072 MiB**, crossed their previous values in both directions and had a median pairwise slope of **−0.022 MiB per minute**. The pre-fix run's last half grew 27.996 MiB. The release graphics counts held from cycle 2 through FINAL and the sampled document's listener count ended one above START.

The release exercised 17 Dense Home, Focus, exit, and zoom cycles, 18 fresh Array recordings, five large-array inspections, four collection inspections, four dense exception paths, and four exact I/O sessions. The array admitted 22 cells during the sampled indexed reads and writes and accounted for all 99,981 hidden cells. Collection virtual lists showed seven rows at matched focused cuts, with exact captured values and keys through the first and last entries. I/O kept three bounded World labels and the exact 1 input, 12 stdout and 8 stderr rows in the Console proof. Each equivalent checkpoint drained the motion queue. There were 136 seeks including full settle, at **300.31 ms p50 and 326.15 ms p95**, with p95 moving from 329.93 to 319.83 ms across the two halves. [Release soak](../../../test-results/reference-pass6/release/mixed.log)

The release heap snapshots at START, cycle 5 and FINAL each retained one active Monaco Save and one breakpoint registration. The last editor ID was 52. [Registry receipt](../../../test-results/reference-pass6/heap-recipes/release-mixed-registry.jsonl)

## Same-project, quality and graphics controls

The isolated release control passed the initial Run, **20 replacements**, **50 round trips**, and **30 recoveries**, with zero browser errors. A failed build emitted zero observation events while leaving the prior accepted World available. Same-project post-GC heap was **26.393 MiB** at START, **29.095 MiB** at Run 5, **30.214 MiB** at Run 10 and **31.307 MiB** at Run 20. Each equivalent sample kept 30 geometries, 18 textures, 40 programs, 14 scene materials and eight composer targets. The V8 snapshot comparison of Run 0 and 20 attributes the leading growth to generated instructions, bytecode and compiled-code metadata. Instruction streams alone added about 2.68 MB. The last ten replacements still added 1.093 MiB, so the measurement retains the late drift. The earlier overlapping control's isolated JDT 504 is preserved in its log. [Release control](../../../test-results/reference-pass6/release/control.log) · [Earlier control](../../../test-results/reference-pass6/final-control/control.log)

| Quality round trips | Interactive post-GC heap MiB | Interactive textures / programs / targets | Cinematic post-GC heap MiB | Cinematic textures / programs / targets |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 31.632 | 19 / 47 / 8 | 31.732 | 26 / 53 / 11 |
| 5 | 31.799 | 19 / 47 / 8 | 31.903 | 26 / 53 / 11 |
| 10 | 32.024 | 19 / 47 / 8 | 32.142 | 26 / 53 / 11 |
| 20 | 32.297 | 19 / 47 / 8 | 32.427 | 26 / 53 / 11 |
| 50 | 32.765 | 19 / 47 / 8 | 32.903 | 26 / 53 / 11 |

Texture and render-target counts held through 50 switches in both tiers. Cinematic had one additional floor target. Both tiers kept 30 geometries, 14 scene materials and 608 listeners. The Interactive heap series from trip 1 to 50 still rose 1.133 MiB.

A separate 150-trip control also passed. Interactive heap was **27.51 MiB** before the switches, **29.56 MiB** after 50 and **30.53 MiB** after 150. Both tiers kept their trip-1 graphics counts through 150. V8 instruction streams, trusted bytecode, protected arrays and code metadata account for the leading categories in the before/after snapshot, about 2.45 MB combined. The slower late heap rise remains in the evidence. [150-trip control](../../../test-results/reference-pass6/release/quality-extended.log) · [V8 diff](../../../test-results/reference-pass6/heap-recipes/quality-0-150-diff.json)

Fifteen context-loss recoveries per tier preserved the real canvas, selection, recording, cursor, camera and active quality. Interactive settled at 29 geometries, 18 textures, 43 programs, 14 scene materials and eight composer targets after the first rebuild. Cinematic held 29 geometries, 26 textures, 50 programs, 14 scene materials and 11 composer targets. Release recovery heap moved **33.511 → 34.386 MiB** in Interactive and **34.518 → 35.119 MiB** in Cinematic. Both post-warm series dipped between individual checkpoints. The document listener count stayed at 627 throughout recovery.

## Confirmed context-recovery retention

An isolated control with 15 real restores per tier found Three.js recording a fresh `dispose` listener on live geometries, instanced meshes, and textures on every restored context. The listeners retained obsolete renderer caches. The same object IDs reached 16 listeners after Interactive and 31 after Cinematic. The heap scan found 24 objects with multiple dispose callbacks. Owners included shared body geometry, floor contact instances, and the renderer's DFG texture.

The render owner now retires GPU bindings owned by the lost context before Three.js creates its replacement caches. The cleanup deduplicates persistent geometry and texture objects, including renderer uniforms, and keeps the canvas, camera, recording and CPU scene mounted. It stays in the lazy render path. A new regression test exercises disposal of a shared geometry, instanced mesh, atlas texture and renderer lookup texture while preserving scene data.

| Extended matched boundary | Before cleanup, post-GC MiB | After cleanup, post-GC MiB |
| --- | ---: | ---: |
| Interactive, first → fifteenth recovery | 29.49 → 36.70 | 29.66 → 31.38 |
| Cinematic, first → fifteenth recovery | 36.78 → 43.68 | 31.49 → 32.39 |

All 30 recoveries passed the actual state and canvas invariants on the patched build. The heap scan found zero Interactive owners with more than one disposal listener. One Cinematic texture had two listeners at both boundaries. The earlier 31-listener staircase disappeared. Texture, geometry, program, material and target counts still settled at the same levels. The smaller heap rise remains visible in the raw control. [Before](../../../test-results/reference-pass6/final-control/extended-recovery.log) · [After](../../../test-results/reference-pass6/graphics-fix/extended-recovery.log) · [Release V8 listener scan](../../../test-results/reference-pass6/heap-recipes/release-recovery-listeners.jsonl)

## Cache and subscription audit

| Owner and reachability | Bound or cleanup |
| --- | --- |
| Workspace source binding and generation maps | Previously retained a record for each accepted session. Keep one active generation and source bindings for its attempt and the published World while switching between those states. Project switches preserve only the bridge's latest attachable binding as needed for rename and reload. |
| Semantic normalization and history | Retain the accepted recording, latest state, and replay checkpoint roots. History caps stored checkpoints at 256 and retires its state when the associated ingest is disposed. The live recorder's raw cap stays at 20,000 events and 8 MiB. |
| Presentation projector and layout | Layout owns per-recording spatial anchors. The projector keeps one current immutable DTO per runtime ID. Persistent semantic history can still reference previous values. Flow endpoint reuse is limited to 512 entries per prefix scan. Connector routing keeps two 256-entry LRUs. |
| Array and collection previews | The active compiler holds one current array window per represented array. Inspector paging keeps exact recorded values available. Collection faces and I/O summaries have visible row limits and Console retains exact records. |
| Renderer, text, and effects | One active batch and current glyph transforms per mounted text owner, shared runtime fonts and materials, and a context-owned post pipeline. Focus and floor auxiliaries register and dispose against their renderer. A bounded QA render probe releases timer queries on disposal. |
| Source and Java language service | Editable models for closed tabs and old projects are retired. Language requests are abortable and pending poll/debounce work follows the project. The bridge retains up to 32 execution entries per manager, prunes JDT work data to eight caches, and keeps one build model per distinct visited project. The last cache belongs to the bridge process. |
| Browser listeners and schedules | Shell keyboard, wheel, media-query and resize listeners have corresponding cleanup. Monaco bindings clear subscriptions, capture handlers, and retry work. Playback, camera and motion own their subscriptions or timers. SSE closes and clears its retry timer as attempts change. Bridge stream close releases subscription and flush work. |

## Reproduction

Start a QA-enabled production build with an isolated local bridge workspace. The flag below points the browser directly at that built server. The harness is opt-in and never uses mocked execution.

```sh
VITE_QA=1 npm run build
GGJAVA_PORT=5174 GGJAVA_WORKSPACE=/path/to/isolated/workspace npm run start
VJ_PASS6_LIFECYCLE=1 VJ_PASS6_BASE_URL=http://127.0.0.1:5174 \
  npm run perf:browser -- pass6-lifecycle.spec.ts --workers=1
```

Defaults are 600,000 active-work milliseconds, four minimum mixed cycles, 20 replacement Runs, 50 quality round trips, and five context recoveries in each supported tier. `VJ_PASS6_SOAK_MS=1200000` extends the active duration. `VJ_PASS6_HEAP_SNAPSHOTS=1` captures initial, warm and final mixed samples, selected repeated-Run checkpoints, and the quality and recovery boundaries. Mixed active duration excludes time spent taking those optional snapshots. Each run writes a JSONL record of actions, samples and outcomes to its Playwright output directory.
