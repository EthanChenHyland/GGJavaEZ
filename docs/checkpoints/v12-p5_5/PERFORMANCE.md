# Spatial 2.0 Phase 5.5 performance

## Final sustained renderer measurement

[soak/performance.json](soak/performance.json) measures the final code against the accepted, actual `Topology` JVM recording: 7,492 raw records, 9,852 semantic events, FULL observation, 1440×900, DPR 1. The browser discovers that retained session through its real execution endpoint. No replacement facts, new application JVM or build are used. JDT is excluded from this renderer experiment. The default development renderer probe is disabled; the measurement explicitly enables it.

The run lasted **180,873 ms**, completed **643 mixed navigation/history actions**, and submitted **6,464 real WebGL renders**, with **no browser errors**. Navigation includes orbit, dolly, Focus, Home and seeded seeks. The timing probe wraps the existing renderer, has 4,096-entry rings and at most eight pending asynchronous GPU queries. It does not wait synchronously for the GPU.

| Measurement | Samples | Median | 95th percentile | Maximum |
| --- | ---: | ---: | ---: | ---: |
| UI scrub: action, UI commit, two animation frames | 30 | 50.45 ms | 101.24 ms | 102.60 ms |
| Focus command: same UI timing boundary | 54 | 75.67 ms | 110.97 ms | 162.68 ms |
| Home command: same UI timing boundary | 54 | 86.50 ms | 138.49 ms | 193.03 ms |
| WebGL submission CPU, bounded tail | 4,096 | 0.60 ms | 3.70 ms | 31.00 ms |
| Asynchronous GPU elapsed commands, bounded tail | 4,096 | 0.716 ms | 1.388 ms | 9.758 ms |
| Demand-render intervals, including idle/choreography | 4,096 | 16.70 ms | 74.90 ms | 499.30 ms |

There were 6,463 collected GPU queries and zero disjoint drops. These are local sample distributions, not cross-machine guarantees. GPU elapsed commands do not measure physical display presentation, utilization or VRAM bytes. Submission CPU excludes React, text shaping and pre-render scene work. Demand rendering deliberately idles, so its intervals **cannot be reported as FPS**. Focus/Home timings exclude the fixed settling wait used for screenshots; they are not animation-completion measurements.

Final sampled pose: **134 draw calls, 27,548 triangles, 132 geometries, four textures, ten programs**. The recurring exploration pose used 115 geometries, 125 draw calls and 25,202 triangles. A different pose used 106 geometries/115 calls. Textures and programs stayed at four/ten throughout the logged sustained samples. Shadows remained enabled, ACES tone mapping was retained, and output color space was sRGB. Counts vary with legitimate LOD/cell/flow presentation; no unbounded geometry growth appeared in these samples.

One dense retained-world load took **4,816 ms**. This is one cold sample, not a cold-load percentile. Phase 5's 1,984 ms load used a different 6,474-event, observer-limited workload; comparing these values does not isolate a regression or improvement. The original soak before the final shared routing/caption fixes is preserved in [soak-before-final/performance.json](soak-before-final/performance.json). Its mixed action sequence is similar but not a fixed identical-camera benchmark; do not attribute small timing differences causally to the fixes.

## Memory and lifecycle boundaries

Explicit CDP GC around the sustained run measured whole frontend used heap **102,130,864 → 109,397,260 bytes** (about 6.93 MiB growth). This includes Monaco, transport, raw recording, history, text and renderer state. It is neither isolated semantic retention nor GPU storage. Two documents remained; listeners were 510→507 and DOM nodes 16,068→16,081.

Five subsequent reloads reported **102.76 / 102.48 / 101.79 / 98.11 / 98.39 MB** of used heap. All five had four allocated textures; geometries were 96/106/107/25/31 at their different actual presentation poses. Reloads exercise document disposal, not same-document execution replacement. Their full counters and method are in the soak JSON; an independent short validation is in [reload-validation/performance.json](reload-validation/performance.json).

The fresh lifecycle browser test separately performs five actual edited Java Runs in **one page**, one failed build and repair. It checks unique sessions, exact source/output/state ownership and real post-Focus renderer counters. Its final proof is retained under `media/lifecycle/repeated-proof.json` after the accepted browser suite. The final five page-level explicit-GC heap samples were **76,200,944 / 78,957,112 / 80,500,028 / 81,990,756 / 82,850,132 bytes**, a +6.34 MiB first-to-fifth delta. Each post-Focus sample had **46 geometries, four textures, 32 draw calls and 14 labels**. Resource constancy and finite heap deltas are evidence for this bounded experiment; five Runs and three minutes do not establish a universal absence of leaks or long-duration thermal stability.

## Presentation work removed

- I/O projection extends exact immutable graph/console prefixes. A counter test visits **1,000 newly recorded output observations** across 1,000 prefixes, versus the previous **500,500 full-scan visits**. This excludes reducer copies and is not a whole-product timing claim. Cold imports, backward seeks, branches and other sessions retain their own exact fallback scan. Weak caches/references avoid retaining departed executions.
- Connector curves, sampled points and pick tubes use actual scalar endpoints and represented-geometry keys. Unchanged coordinate wrappers do not rebuild geometry. Retired pick tubes are disposed. No runtime edges are dropped to achieve these savings.
- Routes consider at most 48 nearby represented solids in a bounded front corridor. Arrays contribute actual headers/cell windows rather than empty envelopes. This bounds presentation work and removes the reproduced header/cell crossings; it is not a global no-crossing guarantee for arbitrary camera views.
- Home fits occupied cuboid corners instead of inventing solids at empty envelope corners. A controlled small-program model at 45° FOV changed fitted range **64.028→59.229 world units**, with the same geometry/anchors. The app uses 41° FOV; the range ratio is not asserted as a measured UI ratio.

## Build and startup

Final Vite build: **3,432 modules**, reported bundling **477 ms** after TypeScript. Main JavaScript **1,617.67 kB / 450.91 kB gzip**; separately loaded Monaco SourceEditor **3,280.69 kB / 841.01 kB gzip**; IDE module **177.82 kB / 52.69 kB gzip**. Vite still reports its existing large-chunk warning and the ineffective dynamic Troika import because Drei also imports it statically. No dependency or recorder-limit increase was introduced. The retained-world load above includes data publication and rendering and is not a production startup/HTTP transfer benchmark.

## Remaining bottlenecks and limits

The final controlled rich-graph gate reproduces all four Phase 5 graph digests and graph counts exactly: **462 / 9,788 / 38,302 / 190,031 semantic events**. The largest case retains 6,814 invocations, 6,813 calls, 67,849 values and 110,408 edges. Its explicit-GC enriched process delta is **354.56 MiB**, versus **353.33 MiB** in Phase 5 (about +1.23 MiB / 0.35%). These are separate single-run process deltas, not isolated graph-object bytes or a statistical memory-growth finding. The earlier reduction from roughly 818 MiB remains preserved. [rich/performance.json](rich/performance.json) and [rich/phase5-comparison.json](rich/phase5-comparison.json) contain the exact method/results. Its semantic-only seeded seeks were p50/p95 **3.58 / 17.84 ms**; those omit UI/rendering and must not be substituted for the UI scrub distribution above.

Text shaping/cold hydration, source-editor/raw-history residency and main/editor bundle size remain more significant product costs than steady GPU command time on this machine. A second GPU, physical frame presentation, VRAM bytes, multi-hour thermal behavior and an unbounded program are unmeasured. Full real-JVM processing and controlled rich-graph retention/digest results are reported in [VALIDATION.md](VALIDATION.md) and their separate JSON evidence; those domains must not be conflated with renderer timing.

Cinematic quality should use the same immutable world and bounded presentation planner with central interactive/capture material and lighting tiers. See [CINEMATIC-READINESS.md](CINEMATIC-READINESS.md). No cinematic passes or Phase 6 work are included here.
