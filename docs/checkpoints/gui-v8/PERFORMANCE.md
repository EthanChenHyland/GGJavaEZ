# Milestone 8 — Representative spatial performance

Evidence: `performance.json`. Reproduce with the existing dev server using `node scripts/measure-m8.mjs --authorized`, separately from browser/JVM tests.

The measurement replays accepted M7 Person and recursion recorder payloads through browser-local API interception. It launches no JVM, imports no project, and does not restart the dev server. There were **zero page errors, unexpected API requests, or sampled long tasks**.

## Results

At 1440×900, balanced quality, installed Chrome headless:

| Layout | Drawing viewport | Orbit JS submission mean: Person / recursion | Scrub median: Person / recursion |
| --- | --- | --- | --- |
| Compact layout-only baseline | 752×257 | 1.92 / 1.39 ms | 66.1 / 66.4 ms |
| Visualize | 1004×647 | 1.49 / 1.27 ms | 65.1 / 66.3 ms |
| Runtime Focus | 1440×701 | 1.90 / 1.14 ms | 66.4 / 66.2 ms |

The run contains 18 three-second windows: playback, pointer orbit and settled idle for each scene/layout pair. It also contains 48 forward/reverse scrub samples. The maximum scrub roundtrip was 100.1 ms. Playback advanced in every window, producing 15–16 render submissions for Person and 7–9 for recursion. Orbit produced 43–45 submissions per window under the paced pointer driver. All six settled idle windows produced **zero WebGL submissions**, consistent with demand rendering.

No clear layout-related increase appeared in sampled JavaScript renderer submission or scrub time despite the larger drawing viewport. Representative warm interaction retains the existing responsive behavior within this bounded measurement.

## Interpretation and limits

- The compact comparison uses the **same current frontend/renderer** with browser-only CSS constraining its drawing viewport. It is dimension-equivalent to the prior compact shell; it is **not a historical M7 source benchmark**.
- Each fixture reuses one warmed renderer across compact, Visualize and Focus in fixed order. One short sample per phase/layout is descriptive, not a statistical hardware-wide regression result.
- Render samples instrument `WebGLRenderer.render` with actual WebGL draw commands. JavaScript submission wall time includes WebGL calls, but does not measure physical GPU completion or display presentation.
- Headless RAF cadence was approximately 33.3 ms. Pointer driver pacing limits orbit cadence. Neither establishes 60 fps throughput or GPU/display percentiles.
- Scrub roundtrip includes Playwright slider interaction and two RAF callbacks. It is not a measurement of physical presentation or synchronized text readiness.
- No cold-font, huge-stack or physical GPU percentile claim is made. Existing M7 text-prewarm evidence remains unchanged.
