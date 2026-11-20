# Unchanged array-window identity — 2026-10-24

`computeArrayWindow` previously returned a fresh window even when every output was unchanged. `RuntimeSolid` correctly compares window identity, so unrelated presentation plans could rebuild an array's labels. The owner now returns the previous window when topology, nominal budget and normalized admission reasons match. Other accounting fields follow deterministically from those inputs. A reason or budget change still produces a new window; a geometry change still advances its revision. No values, provenance, runtime state, camera settings or renderer materials are cached or changed.

The new identity assertion and strengthened 100-run pick/revision property fail against the parent (2 failures, 19 passes). After the fix, the four focused array suites pass 37/37. Negative cases cover selection, Focus, current/requested evidence, budget, recording/array identity, region, position, size and length. Previous windows remain unchanged, including uncaptured sparse arrays of length 2,147,483,647.

The saved actual Dense recording `b14751ef-ec38-4848-bcc7-ff3c5ba624a1` provides 288 complete parent/candidate plan comparisons and 2,244 window comparisons. All plan contents match. With the actual `RuntimeSolid` comparator, potential array-label admission falls from 39,756 to 23,650 and array component admission from 2,244 to 1,109. These are offline comparator counts, not measured native component invocations or retained-memory approval. Source, test and proof artifacts are under `.ggjavaez/qa/reference-exact/array-window-*`.

The unchanged complete Dense browser gate runs actual JVM `2ecafd5e-ca2c-4b7c-ac13-30dbb3f0ab38`: 7,492 raw events, 9,852 normalized events, FULL recording and successful exit. Run `6f2cf6f7-a5ab-4d5b-af98-8be412e3e052` completes all ten stages with zero browser errors or suspended requests. It exits 1 at the final budget assertion:

| Metric | Observed | Fixed limit | Result |
| --- | ---: | ---: | --- |
| Seek p50 | 82.373 ms | 55 ms | FAIL |
| Seek p95 | 99.727 ms | 112 ms | PASS |
| Focus p95 | 135.067 ms | 125 ms | FAIL |
| Home p95 | 165.825 ms | 152 ms | FAIL |
| Cold-load median | 4,111.906 ms | 5,300 ms | PASS |

All five sustained orbit windows pass: median 16.7 ms; p95 18.3/17.5/16.8/16.8/18.5 ms; maximum 102 calls; CPU p95 2.7/2.7/2.7/2.8/3.4 ms. Soak frame drift is 0%; whole-frontend post-GC heap growth is +0.21424%, within 5%. The separate extra ten-pair CPU diagnostic samples JSX development self time at 682.941 ms versus 748.613 ms in the parent run; this is not statistical confidence or a demonstrated command-latency gain. The formal latency failures remain OPEN.

The source inventory contains 953 files. Performance starts on `c99f155b2cf53dd12914873d8e23e8a81efa077b7013ad451a08fa9137991e89`; final candidate inventory is `b00adb247ed9e78c7e43a16ff3146640f0817301e15ef4d2c5fe6c1653363508`. The only intervening change is the native-only array regression test; production and the fixed performance method are identical throughout. Both inventories, original report, actual raw session, CPU profiles, log and original-resolution Dense image are retained in `performance-array-window/`. The root reviewed that Dense image against `best.png`; typography, crossing glow, matte faces, floor/reflection balance and optional clipping remain unapproved.

Two routing hypotheses are rejected without changing production routing. The measured unchanged plans have no repeated-route misses from cache overflow. Moving the path-cost rejection before obstacle tests preserves all 2,673 compared routes but improves median warm replay only 80.760 → 79.923 ms, insufficient demonstrated gain. `route-cache-diagnostic.json`, `connector-distance-first-proof.json` and `routing-cost-decision.json` preserve those narrower diagnostics.

Final candidate validation passes 2,171 tests with 70 explicit opt-in skips (2,241 total, 233 files, 177.95 seconds). Production/browser typechecks, lint, build, reference integrity and protected-boundary checks pass with a stable source inventory. Main-entry gzip is 71,762 bytes; entry/Shell closure sums 72,190/670,479 are diagnostics. AST inventory remains 672 modules, 2,331 literal edges, 260 production-reachable modules, zero legacy targets and 35 nonliteral entries.

Native integration passes 23/23 with zero skips/failures/flaky results in 181.869 seconds, including ten actual Hero/Focus cuts, six separately classified curated array workflows, actual collection/reference-chip picking, hardware quality, forensic dimensions and context recovery. Sixteen distinct actual JVM IDs are attached. The new native identity test verifies an unchanged window across Trace, fresh selected/focused evidence, immutable earlier evidence and truthful forward/reverse indexed values. Twenty-one originals are archived in `array-window-captures/`; the root reviewed six at original size, with fifteen unreviewed and no wholesale visual approval. `array-window-evidence.json` consolidates this boundary.

Whole-product A–G, the separate 0.25 presentation-retention gate, remaining visual convergence and final exhaustive acceptance remain OPEN.
