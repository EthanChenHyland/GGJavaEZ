# Connector selection width and bloom spread

The World planner now uses a 2.5 px core for ordinary paths and a 3.5 px core for the selected path or bundle. Relevance controls opacity independently. Connector routes, terminal ports, arrows and the 8 px halo keep their existing geometry. The regression reproduced two fully emphasized, unselected paths at 3.5 px. The corrected plan keeps both at full opacity and widens only the selected path, with exact route coordinates before and after selection.

The bloom radius changes from 0.35 to 0.12 to weight finer mips. Both quality tiers keep their specified strength and 1.0 threshold. In a fixed Hero crop below a cyan corridor, mean green and blue fall from 71.228 and 113.817 to 68.054 and 110.696. A nearer crop containing the core gains 4.578 green and 3.238 blue. The 960 pixels in a sampled StockItem chip interior match exactly. The crops are descriptive samples from two actual JVM runs. The independent GPU palette cases check the required RGB values.

## Exact source and browser evidence

The width-only source `cc4fd04ecbf11d71c6e1ccc472dcf0b10bea334cafea2a21be107f5db0bd5603` passes 73 focused tests and 12 native cases in 151.768 s, with 19 original captures. The browser covers both viewport classes, hover, Focus, history, bundles, Hero and return propagation. The archived red run executes the new regression against the parent planner.

Combined source `1c569d01f5eb1e5515a8e2677a2683050de0a704fa07594a2c45294f5c7512d8` inventories 993 inputs and three changed files. All 62 focused tests and ten native preflight cases pass. The preflight takes 112.457 s and preserves 16 original captures. Both quality tiers execute, all eight face and chip samples pass, and narrow exception evidence stays legible.

All eight validation checks pass in 314.848 s. The default suite passes 2,277 tests with 70 opt-in skips across 244 files in 290.41 s. The production entry measures 71,732 gzip bytes. Static entry and Shell JavaScript closures measure 72,162 and 678,643 bytes. Monaco and Cinematic load separately.

The integrated run passes 110 cases in 1,236.889 s with zero failures, skips or flaky retries. The archive contains 145 original PNGs and 86 distinct attached JVM session IDs across 86 cases. Six reviewed originals cover Hero, Focus, recursion, return, narrow exception and narrow Map. Narrow recursive titles are still partly occluded, and exterior route glare, jagged edges and peripheral clipping remain visible.

Source, preflights and crop diagnostics are under `.ggjavaez/qa/reference-exact/connector-core-width/` and `.ggjavaez/qa/reference-exact/connector-bloom/`. The full run and originals are under `.ggjavaez/qa/reference-exact/connector-bloom-final-captures/`.

## Protected performance runs

The Dense benchmark completes all ten stages in 471.514 s. Run `9f69d01e-eb82-4a5d-9ba6-90dfc59ff2f2` records 7,492 raw and 9,852 normalized events in fresh JVM session `01166011-e980-4867-a645-504788b8a9c7`. The recording is FULL and there are zero browser, stage, lifecycle or suspended-request errors.

| Metric | Limit ms | Measured ms | Result |
| --- | ---: | ---: | --- |
| Seek p50 | 55 | 83.837 | Exceeded |
| Seek p95 | 112 | 116.852 | Exceeded |
| Focus p95 | 125 | 183.821 | Exceeded |
| Home p95 | 152 | 183.191 | Exceeded |
| Cold-load median | 5300 | 5008.656 | Pass |

All five orbit windows pass. Medians are 16.7 ms, p95 intervals are 17.5–18.2 ms, submission CPU p95 is 2.3–3.2 ms, and maximum draw calls are 99. The prior run reached 103 calls. The longest interval is 880.1 ms. The 61,514.6 ms soak shows zero median frame drift and +0.120658422% whole-frontend post-GC growth. The benchmark exits 1 and the archive exits 0. The run and reviewed Dense capture are in `performance-connector-bloom/` under the QA evidence directory.

The generated Node benchmark completes in 22.132 s with matching raw corpus hashes. LINE scaling passes at 1.330088861× against 2×. Retention ratios of 1.696336930, 0.475102171 and 0.400135472 exceed the 25% limit, so the benchmark exits 1. Raw output is in `connector-bloom/production-node/`. Full acceptance remains open for latency, retention, frame stalls, visual polish and broader browser and JVM coverage.
