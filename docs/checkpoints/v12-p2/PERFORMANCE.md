# Phase 2 processing performance

Apple M4 Pro, 24 GiB, macOS arm64, Node 24.20.0. Same-machine baseline ran isolated source from commit `14e2a17`; no JVM workloads ran alongside these benchmarks. The original Phase 0 134-second measurement was on Linux and is not an identical hardware comparison.

One construction sample per size; 30 seeded random scrub samples. Timings measure Node semantic processing, not WebGL/GPU presentation. After times include normalization, shape/lifecycle validation, persistent reduction and checkpoint construction in **one shared history**. The JSON compatibility field indexValidateMs is zero because that work is included in normalizeMs, not because it is omitted.

| Semantic events | Before normalize + validate (s) | After combined (s) | Speedup | Scrub p50 / p95 (ms) | Reload (s) | Retained fixture delta (MiB) |
| --- | --- | --- | --- | --- | --- | --- |
| 6,264 | 0.116 | 0.049 | 2.4× | 0.33 / 0.77 | 0.052 | 19.0 |
| 24,591 | 1.647 | 0.150 | 11.0× | 0.44 / 0.81 | 0.200 | 63.5 |
| 122,139 | 57.524 | 0.828 | 69.4× | 0.98 / 1.83 | 1.077 | 301.5 |
| 250,289 | — | 1.694 | — | 1.52 / 11.15 | 2.239 | 592.5 |
| 1,003,111 | — | 8.495 | — | 9.57 / 30.79 | Not run | 1821.5 |

At 122k, processing improves **69.4×** against the same-Mac baseline. Baseline random scrub p50/p95 was 287/794 ms; after is 0.98/1.83 ms. Reload measures JSON parse + versioned validation/index construction + latest seek: 59.763 s → 1.077 s. Return to Live directly reads the existing head, measured 0.0036 ms at 122k. These very small timings establish algorithmic behavior, not perceptible UI latency guarantees. Combined construction includes finalization; its separately recorded cost is 0.066 ms at 122k.

The 1,000-raw-event append benchmark at 122k measured p50/p95 **6.32/16.90 ms**, with first/last batches 7.39/0.17 ms. These are bounded new-suffix CPU samples, not presentation latency.

## Transport work

Synthetic append measurements use 1,000-raw-event batches. The old whole-resend byte count is calculated exactly from per-event UTF-8 JSON sizes and cumulative boundaries, avoiding another quadratic serialization benchmark. Delta counts measure versioned range envelopes including the final partial batch. Neither includes metadata, SSE framing/TCP overhead or compression. Baseline byte evidence excluded its final partial batch.

| Semantic events | Whole-prefix JSON bytes | Delta JSON bytes |
| --- | --- | --- |
| 6,264 | 2,920,066 | 976,289 |
| 24,591 | 40,747,436 | 3,882,887 |
| 122,139 | 981,358,328 | 19,463,510 |
| 250,289 | 4,115,465,661 | 40,073,042 |

At 122k this removes about 50× raw payload work. Production SSE/HTTP readers retain no full decoded prefix; explicit legacy reads remain intentionally linear. Real browser duplicate/reconnect QA verifies committed-cursor resume, later raw progress, fixed History cursor, same Java session/exit and completed-session reload; see transport-browser.json.

## Batching and presentation

The [policy comparison](policy.json) uses the same 122k input:

| Raw batch size | Total processing (ms) | Batch p50 / p95 (ms) |
| --- | --- | --- |
| 64 | 820.3 | 0.37 / 0.52 |
| 256 | 749.2 | 1.45 / 2.23 |
| 1024 | 749.8 | 5.83 / 18.62 |

GC produces tails, so a synchronous batch size alone is insufficient to ensure responsiveness. Production pages use 256 events/256 KiB, at most four per 100 ms tick. Browser ingestion uses 32-event slices and MessageChannel yields after about 4 ms; presentation coalesces at 100 ms. Console metadata is independent of ingestion. No animation of every execution event is attempted.

Browser processing and original 3D regression measurements are reported separately in browser-performance.json and VALIDATION.md. The browser algorithm probe keeps the existing Person WebGL scene mounted; it does **not** render the synthetic 122k world. Layout/scene generation, labels and GPU presentation are different costs and remain potential dense-world bottlenecks.

## Checkpoint memory and lifecycle

All retained-memory measurements use explicit GC inside the Vitest worker. Main fixture deltas include generated raw input, semantic events, runtime head/indexes/checkpoints and exported semantic JSON. Reload transient allocations are collected before measuring retained memory. This is not checkpoint-only memory. Disposing history releases head, auxiliary indexes, validation set and event-reference storage as well as checkpoint roots; releasedHistoryMiB preserves those measurements.

For a fixed retained 122k semantic event list:

| Root budget | Indexed history (MiB) | Scrub p50 / p95 (ms) |
| --- | --- | --- |
| 16 | 146.2 | 19.37 / 65.14 |
| 64 | 157.4 | 3.48 / 14.09 |
| 128 | 163.4 | 1.68 / 6.25 |
| 256 | 169.4 | 0.86 / 1.45 |

Default policy remains 256-event initial spacing / 256 total roots. After adaptive thinning, actual spacing is 512 at 122k, 1,024 at 250k and 4,096 at one million. The root budget bounds checkpoints, not all semantic truth: events/entities grow with accepted facts. Existing production raw/byte/identity/live-frame limits remain unchanged.

The synthetic million-event probe deliberately exceeds those production budgets. It uses one serialized process with a 3 GiB Node heap ceiling, retained 1.78 GiB including raw input, and built in 8.50 s. No million-event archive reload or GPU scene was attempted. Its 30.8 ms scrub p95 and 33.9 ms maximum remain large-history tails, not an all-size realtime guarantee.

## Projection convergence finding

The first acceptance run exposed a large-array projection regression. Persistent vectors initially set the actual empty backing array's length on every facade creation. V8 could allocate hole storage proportional to that length, despite the radix data being structurally shared. Facades now virtualize length over an empty array target while preserving Array.isArray, native iteration, descriptors and JSON behavior. Out-of-range reads are also bounded explicitly.

The isolated 3×4,096-cell array / 1,001-frame test has **13,292 identical anchors**, verified against the existing batch-layout oracle. Incremental projection went from 10.645 s to 286.2 ms. The batch oracle takes 58.3 ms; persistent projection still has extra path-allocation cost at large single allocations, so it is not a GPU or single-frame guarantee. Scene-model creation took 15.8 ms. Exact evidence: projection-before.json and projection.json.

## Reproduce

```sh
npm run perf:incremental
VJ_SUITE=perf ./node_modules/.bin/vitest run tests/perf/policy.test.mjs --execArgv=--expose-gc --maxWorkers=1 --fileParallelism=false
VJ_SUITE=perf ./node_modules/.bin/vitest run tests/perf/million.test.mjs --execArgv=--expose-gc --execArgv=--max-old-space-size=3072 --maxWorkers=1 --fileParallelism=false
VJ_SUITE=perf ./node_modules/.bin/vitest run tests/perf/world-projection.test.mjs --execArgv=--expose-gc --maxWorkers=1 --fileParallelism=false
```

[before.json](before.json), [performance.json](performance.json), [policy.json](policy.json), [million.json](million.json), [projection-before.json](projection-before.json) and [projection.json](projection.json) preserve exact counts/numbers. Pre-facade intermediate measurements are retained separately. Re-running changes measurements, without rewriting Phase 0/1 evidence. Do not run heavy probes concurrently with JVM/browser builds.

## ACC13 / ACC14 and the dense browser boundary

The final-source acceptance recheck uses raw range reads and the shared incremental normalizer/history with unchanged production limits. ACC13 completes Java with its original four output facts, a 3,076-raw / 3,849-semantic partial prefix, 32 ms cumulative processing and 16 ms layout/scene work. ACC14 completes its original output and exit 0 with 20,001 raw / 24,765 semantic events; cumulative processing is 139 ms and layout/scene work 418 ms. The earlier full-corpus run measured 24/18 ms and 159/389 ms respectively. These are acceptance-stage CPU timings, not click-to-visible-world or GPU frame times. [Final-source evidence](acceptance-converged-cases.json).

The bounded ACC14 browser run after the presentation fixes reaches the complete retained timeline in **10.816 s** (first `main()` DOM option 10.416 s), with **2.913 s CDP task CPU** through that boundary and **4,507,399 decoded SSE bytes**. This measurement preceded the final server socket-drain correction. The byte count includes metadata and SSE framing, unlike the synthetic raw-envelope table. It is not compressed network wire bytes. Chrome reports ANGLE Metal / Apple M4 Pro. The Phase 0 software-WebGL/Linux run reached the full timeline in 64.415 s; hardware and graphics differ, so this is context, not an identical-machine speedup claim. The timeline boundary is not a physical GPU presentation measurement.

Earlier ACC14 QA exposed two publication defects: rebuilding dense intermediate worlds while raw delivery caught up, and leaking the mutable normalizer event array into React through already published props. Published event prefixes now use persistent roots bound to the same history; new facts remain hidden from React until publication. The first publication also uses the existing 100 ms cadence. These changes preserve every fact and XYZ rule.

A separate full dense-frame probe (after stable prefixes, before the final initial-publication delay) renders roughly 12k cells. It measured **13.181 s retained reload**, random UI jump p50/p95 **6,779 / 46,179 ms** (eight samples), and adjacent UI p50/p95 **6,112 / 7,118 ms** (ten samples). It then hit its **300-second cap during orbit sampling**. No complete idle/orbit/fps result is claimed. The Phase 0 software-WebGL figures were reload 9.752 s, jump 13,765/18,667 ms and adjacent 11,755/15,686 ms; these are different-environment observations and the new jump tail remains poor. Its negative reload CPU delta was discarded because CDP TaskDuration reset at navigation; the harness now reads per-document cumulative CPU.

A bounded cached-session CPU profile shows substantial React/Three scene commit work. It is diagnostic sampling, not proof of a GPU-only cause. Dense cell/text creation, scene updates and camera/render work remain bottlenecks. This phase makes history processing scalable; it does not claim an interactive million-event 3D world or conceal slow dense presentation. The regular browser correctness suite and the 122k browser algorithm probe are reported separately in VALIDATION.md.

Exact evidence: [acc14-browser-performance.json](acc14-browser-performance.json), [acc14-dense-browser.json](acc14-dense-browser.json), [acc14-profile.json](acc14-profile.json), [acceptance-results.json](acceptance-results.json). The bounded final run can be reproduced with `VJ_ACC14_QUICK=1 npm run perf:browser -- perf-e2e/incremental-v12.spec.ts`. The full opt-in dense-frame probe can exceed its cap.
