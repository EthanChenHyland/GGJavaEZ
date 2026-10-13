# Whole-display-frame QA performance sidecar

The lead reviewed and wired the sidecar into the real render owner, behind DEV/VITE_QA plus the `perf=1` URL guard. Its 15 lifecycle cases pass, and the auxiliary-pass registry adds three passing lifecycle/ownership cases. Native renderer, quality and graphics checks pass six cases in 21.9 seconds. These checks validate instrumentation; sustained Dense_Sample performance approval remains open.

## Factory and root wiring

`createFramePerformanceProbe(renderer: WebGLRenderer, options?: { clock?: () => number })` returns `startFrame`, `beginSubmission`, `endSubmission({ tier, continuous })`, `snapshot` and `dispose`. It imports Three only as a type. It has no window, document, DOM constructor, event listener, animation scheduler, renderer wrapper or runtime/camera setter. The default clock is `globalThis.performance.now`; an injected clock must be finite and monotonic and is intended for unit tests.

Instantiate only when **DEV or VITE_QA is enabled and the URL contains `perf=1`**. The factory intentionally does not decide environment or URL policy; the root must apply that guard before creating it. An ordinary production visit must have no probe instance and no GPU-query work. Dispose the instance when its renderer or opt-in lifetime ends.

Wire through the existing single owner in `PostPipeline`:

1. At the `useFrame` priority **-100** display-frame boundary, call `startFrame` once. Preserve the owner's existing `gl.info.autoReset = false` and `gl.info.reset()` before any world, shadow, mask, reflection or screen passes. The sidecar does not change either setting.
2. Call `beginSubmission` immediately before the complete render operation at priority **1**. Wrap the entire normal composer path and any error fallback render in the same `try/finally`; call `endSubmission({ tier, continuous: renderActivity.continuous })` in that finally. The direct fallback when resources are absent must receive the same one pair. Do not put a pair around each pass or end the pair before an error fallback.
3. If context loss means that the owner submits nothing, call neither begin nor end for that display frame. `startFrame` still records its display boundary and observes query cleanup; submitted sample IDs remain consecutive and separate from display-frame IDs.
4. Expose `snapshot` through the read-only `WorldObservation.framePerformance()` accessor wired in `RuntimeCanvas`. An ordinary visit returns null. Do not add semantic/camera mutation access or use the probe to invalidate/request frames.

The lead found that Floor originally submitted its reflection/contact work at R3F priority .5, ahead of the composer at priority 1. Merely wrapping the composer would therefore omit that CPU/GPU work despite retaining its draw-call totals. Floor now registers its actual auxiliary pass with the renderer-owned `auxiliaryPasses` registry. PostPipeline invokes it immediately before the composer, inside the same begin/end pair. The reflection-before-composer order, targets, resources and data remain unchanged; Floor no longer has an independent render callback. Cleanup unregisters the actual pass and stale cleanup cannot remove its replacement. The instance is created in an effect rather than a memo so StrictMode cleanup/recreation does not reuse a disposed probe.

CPU submission timing starts after GPU-query setup, immediately before `beginSubmission` returns, and ends on entry to the matching `endSubmission`, before query teardown or copying renderer counters. This includes the owner's actual full composer and fallback work. It excludes layout, React work, earlier R3F callbacks, query polling and probe snapshot serialization. It is CPU submission duration, not total browser-main-thread frame cost or GPU completion time. The small boundary-call overhead is not subtracted.

## Observation contract

`snapshot()` returns a frozen observation, a frozen chronological sample array, frozen sample/GPU records and frozen reason-counter copies. Later query completion, ring eviction, render calls or disposal cannot mutate a previously returned snapshot.

Each submitted sample carries:

- Consecutive `id`, its actual `displayFrameId`, `frameStartedAtMs`, and `displayFrameIntervalMs` relative to the previous **display-frame start**, including a previous frame without a submission. The first interval is null.
- `submissionStartedAtMs` and `cpuSubmissionMs` for the one whole submission.
- Post-submission `calls`, `triangles`, `geometries`, `textures`, and compiled `programs` from the actual renderer info. These preserve whatever totals the real owner accumulated; the sidecar never estimates pass counts or resets them.
- The caller's actual `tier` and `continuous` metadata, copied as scalar values.
- `gpu.status` (`pending`, `measured`, or `unavailable`), nullable `durationMs`, and an explicit nullable reason.

The report carries actual lifetime display/submission counts, ring `droppedSamples`, `pendingGpuQueries`, context-loss/disposal state, timer capability/reason, lifetime measured/unavailable GPU totals and reason/lifecycle counters. Timer capability is independent of individual omission reasons and the disposed flag; a capable renderer does not imply a particular sample was measured. Lifetime counters include samples that have already left the ring.

**Demand-render idle intervals are not continuous FPS.** Filter and report continuous workloads separately; retain the tier and observed intervals, rather than turning demand idle time into an alleged render-rate failure. The first continuous sample can follow an idle frame, so the caller must define its measurement window and discard that transition interval explicitly. This module computes no FPS, percentile or budget verdict.

## Bounds and asynchronous GPU lifecycle

The fixed ring keeps **16,384 submitted samples**. It overwrites the oldest sample only when full, preserving monotonically increasing IDs and an explicit dropped count. It never retains a trace or scene. A snapshot allocates immutable copies of retained samples; the consumer controls snapshot frequency and should avoid exporting all 16,384 samples every display frame.

There are at most **eight outstanding timer queries**, including an active submission. An unresolved query can keep its associated sample alive after that sample leaves the ring; there are at most eight such additional references. Queue overflow omits that new sample's GPU query with `pending-limit`; it preserves its CPU and renderer observations and never waits for a slot.

WebGL2 is detected by its core query methods, without relying on a global `WebGL2RenderingContext` constructor. The probe asks the actual context for `EXT_disjoint_timer_query_webgl2`, creates a query, begins `TIME_ELAPSED_EXT` before the whole submission and ends it afterward. When available, `getQuery(..., CURRENT_QUERY)` prevents interference with another timer-query owner; `query-already-active` omits the probe's query without ending the external query. Teardown also verifies query ownership so an external query that replaced the probe's query is not ended accidentally.

Polling occurs at `startFrame` and `snapshot`, outside CPU submission timing. Each pass inspects at most eight `QUERY_RESULT_AVAILABLE` flags. **`QUERY_RESULT` is read only for an available result.** There is no spin loop, finish, flush, synchronous GPU wait, new frame request, or forced render. Nanoseconds become milliseconds only for finite nonnegative numeric results; invalid results are omitted explicitly. Ready queries may resolve out of order, always against their original sample IDs.

A disjoint flag discards and deletes pending queries. Harvested results are published only after a final disjoint check, preventing a partly accepted batch if the flag changes during harvesting. No pending or disjoint result is represented as a measured zero. Context loss similarly discards pending/in-flight queries without ending a query on a lost context. Restoration reacquires the actual extension. Loss is polled at the next frame, snapshot, submission boundary or disposal; this sidecar registers no DOM context listeners. Root must preserve the renderer's existing context lifecycle handling.

Repeated `dispose` is safe, ends/deletes this probe's active query when the context permits, releases every pending query and stops all later polling/submissions. It does not mutate `renderer.render`, `gl.info`, semantic data or camera state. Driver exceptions during query operations become explicit omissions; cleanup exceptions are contained so QA cannot interrupt the render owner.

## Unit coverage and root validation

`src/qa/framePerformance.test.ts` uses a fake renderer/context and an injected clock. Its assertions cover full accumulated calls, exact CPU boundaries, demand/skipped-frame intervals, unavailable extension/core methods, deferred/out-of-order results, no unavailable result reads, disjoint deletion including a flag change while harvesting, eight-query saturation, ring eviction/immutability, repeated disposal, context loss/restoration, allocation/external-query/invalid-result omissions, API exceptions and mispaired lifecycle calls. Misuse is counted and ignored or abandoned explicitly; it never produces an extra paired sample.

The fake tests are lifecycle and accounting evidence only. They do not prove WebGL support, actual GPU durations, browser frame budgets, smooth interaction, or freedom from driver errors on a real machine.

The native Person recording smoke first verifies a normal QA visit returns no probe, then uses native pointer orbit with `perf=1` and actual quality controls. Cursor, recording and all canonical anchors stay identical. Its INTERACTIVE snapshot has 103 submitted frames and 103 resolved GPU samples; the Cinematic snapshot has 114 submissions and 113 resolved results, with the final query pending. Final INTERACTIVE has 118 submissions and 117 resolved results. All snapshots have no ring drops, lifecycle issues or GPU omission reasons, and pending work stays within eight. Actual full-frame calls are 72 at INTERACTIVE and 103 at Cinematic in the captured settled states. These are short-run observations, not 30/60-second percentile, Dense_Sample or performance-budget approval.

The first new browser smoke failed before measurement because it invoked QA readiness before the bridge mounted; five surrounding graphics/quality cases passed. It now waits for the actual bridge lifecycle at both navigations without changing instrumentation, capabilities or timing assertions. The subsequent six-case run passes. Actual-GPU evidence is saved in `.ggjavaez/qa/reference-exact/frame-performance-native.json`; it is not substituted by fake unit timers. Sustained browser/GPU windows, memory/cold-load gates and final product performance approval remain open.
