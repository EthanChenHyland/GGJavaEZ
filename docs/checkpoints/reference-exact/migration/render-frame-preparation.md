# Shared world inputs and glyph preparation

One renderer snapshot now carries the scene, presentation plan and layout for each committed cut. The canvas, floor, solids, structural labels, motion, connectors and read-only observers consume the same references. A face label receives its own array window. Solid picking receives the cell-window map and Focus flag it uses. This reduces repeated inspection of large world records across React component boundaries.

The text batch prepares its main material on the first draw of a frame. Mask passes that inherit that material and its uniform table reuse the glyph data. The batch refreshes preparation for the next frame and still sets the Focus mask for each draw's camera. Passes with independent uniforms or outline state use Troika's regular preparation. The regression first failed with four prepares where two were required. The final unit exercise covers the original material, both real mask wrappers, an independent uniform table and the next frame. The saved test-only type errors concern the mock material and draw group types.

## Source and focused evidence

The snapshot-only source `56b77059` passes 73 focused unit tests and six native cases. Its exact-source archive preserves 14 original PNGs. The candidate `46dd60bebda87c9ec0beba215e9c7fd0e59b304261b6aa951613b6bbd5c299a0` has 993 inventoried inputs and 12 changes from `1f31a23`. It passes 79 focused tests in seven files and nine native cases with zero failures, skips or flaky retries. The native archive preserves 22 original PNGs, both GPU palette checks and the actual Focus, resize and connector hover cases. Two narrow hover crops match their snapshot-only controls pixel for pixel. The desktop crops differ at six and seven of 716,900 pixels. The Dense world crop differs at nine of 716,900 pixels across separate recordings.

The ignored archives are under `.ggjavaez/qa/reference-exact/`. Source, focused native runs and the failing regression are preserved under `render-snapshot/` and `render-text-frame/`.

## Dense measurements

The committed collection source, snapshot-only source and combined candidate each ran the protected Dense workload with 100 seeks, 50 distinct Focus targets, 50 Home commands, five orbit viewports and a 60-second soak. Both renderer candidates completed all ten stages and the full 7,492 raw and 9,852 normalized events from fresh JVM recordings. Both completed with zero browser, stage, lifecycle or suspended-request errors. The snapshot JVM session is `6c018f31-24aa-40e6-a1b5-9ecbfcdfe959`. The combined session is `1f24cce9-c10e-4d45-9155-edfbc2075ac8`. The snapshot run took 479.368 s and the combined run took 483.869 s. Each benchmark exited 1 and each archive exited 0.

| Metric | Limit ms | Collection fixes | Snapshot | Snapshot and text frame |
| --- | ---: | ---: | ---: | ---: |
| seek-p50 | 55 | 103.576 | 98.781 | 83.389 |
| seek-p95 | 112 | 133.923 | 134.066 | 117.335 |
| focus-p95 | 125 | 238.576 | 219.846 | 185.257 |
| home-p95 | 152 | 248.913 | 246.753 | 209.727 |
| cold-load-median | 5300 | 5030.127 | 6081.632 | 6041.041 |

The combined candidate misses all five latency and cold-load limits. The runs used separate browser and JVM sessions. Their observed timings include environment variation.

The separate diagnostic command profiles cover ten Focus and Home pairs after the fixed samples. Sampled self CPU for Fiber's prop diff falls from 2,884.8 ms to 380.7 ms with the snapshot and to 370.3 ms in the combined candidate. Between the two renderer candidates, text preparation falls from 366.75 ms to 144.73 ms and texture data updates fall from 309.20 ms to 83.99 ms. The aggregate profile intervals are separate from the latency budget samples.

| Viewport | Median ms | p95 ms | Maximum interval ms | Submission CPU p95 ms |
| --- | ---: | ---: | ---: | ---: |
| 1728x1117 | 16.7 | 17.5 | 624.2 | 2.9 |
| 1440x900 | 16.7 | 17.6 | 200.4 | 2.7 |
| 1280x800 | 16.7 | 17.5 | 737.4 | 2.6 |
| 760x900 | 16.7 | 17.3 | 846.8 | 2.3 |
| 1440x650 | 16.7 | 18.1 | 997.2 | 3.5 |

Both candidates meet every orbit median, p95, draw-call and submission CPU limit in these runs. The combined run reaches 103 draw calls and records frame stalls up to 997.2 ms. Its 61,762.3 ms soak shows zero median frame drift and +0.159390765% whole-frontend post-GC heap growth. Four external rows remain unmeasured in the browser report. Raw reports, profiles, environment inventories and the Dense originals are in `performance-render-snapshot/` and `performance-render-text-frame/`.

## Full validation

All eight checks pass on the combined source in 325.266 s. The default suite passes 2,275 of 2,345 tests with 70 explicit opt-in skips across 244 files in 300.07 s. The integrity checks cover the protected references, runtime, camera, fixtures and goldens. The production entry measures 71,732 gzip bytes. The static entry and Shell JavaScript closures measure 72,162 and 678,548 bytes. Monaco and Cinematic load separately.

The full native gate passes **110/110** with zero failures, skips or flaky retries in 1,250.659 s. The runner took 1,251.236 s. The run adds five forensic ink cases and four graphics cases to the 101-case gate. It covers demand rendering, actual context recovery and JVM execution without WebGL. The archive contains 145 original PNGs, five root reviews and 86 distinct standard JVM attachments across 86 cases. Both actual GPU tiers execute and all eight face and chip samples match the required RGB values. Archive `render-text-frame-final-captures/`.

The dependency scan finds 710 modules, 2,532 literal edges, 274 production-reachable modules, 42 nonliteral sites and zero inventoried obsolete targets. The default browser configuration discovers 320 cases across 87 files. The protected Node benchmark closure has 81 inputs with identical bytes to the committed collection milestone.

The fresh Node benchmark exits 1 in 22.641 s. LINE scaling of 1.501130931 passes the 2× limit. All three presentation retention ratios exceed the 25% limit. The raw corpus hashes match the preceding run.

| Raw target | Semantic retained bytes | Presentation retained bytes | Ratio |
| --- | ---: | ---: | ---: |
| 200 | 927200 | 1568040 | 1.691156169 |
| 5000 | 12373112 | 6013584 | 0.486020332 |
| 20000 | 55674520 | 22361800 | 0.401652318 |

Raw Node results are in `render-text-frame/production-node/`.

## Open acceptance

The remaining performance gates include seek, Focus, Home, cold load, sustained stalls and presentation retention. Final acceptance also requires the remaining visual and motion review, broader browser coverage and exhaustive JVM opt-ins.
