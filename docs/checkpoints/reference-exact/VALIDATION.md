# Validation

Current implementation evidence, 2026-10-13. A–G completion is not claimed. The detailed chronological record is `docs/reports/reference-exact/VALIDATION.md`; migration ledgers live beside this file in `migration/`. Final results must be refreshed on the cleaned final commit and pushed tip.

| Gate | Command/evidence | Current result |
| --- | --- | --- |
| Default unit/property/regression | npm run test; unit-command-convergence.log | 1981 pass, 70 explicit opt-in skips, 2051 total, 202 files; 168.31 s |
| Source lint | npm run lint; lint-command-convergence.log | Pass |
| Strict reference browser TS | npm run typecheck:reference; typecheck-reference-command-convergence.log | Pass |
| Strict optional performance harness TS | tsc --project .ggjavaez/qa/reference-exact/tsconfig.perf.json; typecheck-perf-seek-profile-confirmed.log | Pass, exit 0, including extra seek profile |
| Production typecheck/build | npm run build; build-command-convergence.log | Pass; large-chunk warning preserved |
| Full native reconstruction | playwright test e2e/reference --reporter=list | Fresh unchanged awake run: 69/69 pass in 7.9 min; earlier 55/14 sleep-interrupted failures archived |
| Complete Dense native browser performance | browser-world-performance-stable-materials.json and matching log | Every stage completed, no browser errors; seek/Focus/Home budgets fail |
| Generated actual pipeline CPU/retention | perf-command-convergence/modern-world-performance.json | 100-batch update ratio 1.091262570 passes 2×; all three 0.25 retention budgets fail; exit 1 |
| Reference integrity | node scripts/reference/check-references.mjs | Six root/twin/baseline hashes agree; tracked/untracked ownership preserved |
| Generic source scan | node scripts/reference/scan-generic.mjs | Pass; 14 source-scan/integrity guardrail tests pass in 593 ms |
| Formal reference matrix/convergence | npm run qa:reference | Earlier 80-case/96-image evidence has 18 open findings; fresh full gate required |
| Independent acceptance/JVM/torture | Explicit opt-in suites, expected/executed/success/skip accounting | Final current-tree exhaustive reruns required |

## Evidence ownership

Default opt-in skips are not counted as executed JVM tests. A browser test containing mock/isolated presentation is not counted as real-JVM execution merely because adjacent tests execute Java. Raw reports retain actual session IDs, source hashes, counts, recording completeness, exact output, failures and measurement methods. A successful process alone does not approve an incomplete matrix.

The interrupted 69-case archive is `.ggjavaez/qa/reference-exact/browser-command-convergence-sleep-interrupted.log` and `browser-command-sleep-interrupted-results/`. The fresh serial run uses an owned `caffeinate -i` command wrapper, preserves the original workload/thresholds and leaves unrelated user assertions/settings untouched. Physical lid sleep remains outside that idle-sleep assertion.

The complete fixed Dense browser measurement on `44f5bc2` executes all stages and exits 1 for seek/Focus/Home latency: 99.188/116.456459-ms seek p50/p95 and 167.212083/199.873084-ms command p95. Cold median 3,928.589958 ms, all five continuous windows and the 60-second soak pass. Raw prefix-reuse reports/profiles preserve all 100/50/50 samples, actual fresh JVM session and zero stage/browser errors. See `PERFORMANCE.md`; full performance approval remains incomplete.

## Remaining delivery checks

Full recorded hierarchy/lifetime grouping, legacy module/test/CSS removal, contract/token/persistence consolidation, clean-replacement guardrail, current Dense semantic/presentation memory, remaining unchanged performance limits, final original-size reference review/polish and the exhaustive final gate remain required. Semantic goldens and backend contracts remain protected; final cleanup must record their identity and map replaced presentation tests/goldens to independently reviewed successors. The final diff must exclude generated output, secrets, accidental machine-local artifacts, duplicate architecture, fixture leakage and modified/staged reference roots.

Final completion requires a normal push on reference-exact-rebuild, HEAD equal to origin/reference-exact-rebuild, tracked tree clean, unchanged main baseline and protected root images. No merge or history rewrite is authorized.

## Production presentation-test successors — 2026-10-13, ongoing

The root migrates actual acceptance/torture/instrumentation and INV-10 geometry consumers to the production layout/projector through a test-only adapter, preserving recorder limits and semantic assertions. Identifier signatures retain every captured local and field even when faces omit them. A full initial acceptance attempt fails 72 cases because required build-tool paths are omitted and hidden JVM type display exposes VM addresses without class names; that attempt is archived. The formatter preserves the captured hidden-class name and `/0x…` suffix (also descriptor/source array forms), with canonical identity untouched. The corrected full acceptance run with Maven/Gradle paths passes **191 ordinary checks + four declared expected failures, zero skips, 195 total**, in 172.70 seconds. The complete fresh torture gate passes **9 expected / 9 executed / 9 passed / 0 skipped**, in 42.80 seconds.

The root reviews the replacement presentation golden: exactly all 98 old case keys remain, all 49 metadata-mode pairs now have identical production geography, and every-case batch/append/snapshot/body/port invariants hold. New hashes intentionally replace obsolete curated/theater/Spatial 2.0 geography; semantic goldens are untouched. `presentation-goldens.md` records the retired and replacement hashes and the reviewed difference. Old `layoutGolden.*` and the unused `src/app/animationQuality.ts` are removed; the current Interactive/reduced-motion assertion replaces only the retired preference case. The retained Home/ragged cases and unchanged 3×4096 array/1000 invocation projection corpus pass; the first overly broad drawable-source expectation and its precise current face-limit correction remain documented. Five successor/layout/topology files pass 26 tests.

Full defaults pass **1997 tests, 70 explicit opt-in skips, 2067 total**, in 176.31 seconds; 197 passed / seven skipped files. A later bounded hidden-type array-spelling extension passes all nine focused checks. Production typecheck/build, full source lint and strict reference-browser TypeScript pass. Vite AppRoot estimates are 1151.20 kB / 352.06 kB gzip. The actual post-build SHA-256/default-gzip artifact measurement passes Requirement 32.7: main entry 71,915 gzip bytes (limit 500,000); Monaco and Cinematic passes are separate. Entry static closure 72,343 bytes and main/Shell static closure 649,587 bytes are diagnostics, not a second invented entry budget. Network request-policy checks remain independent. Evidence: `production-build.json` and `production-build-measurement.log`.

The migrated full pipeline probe passes its unchanged five sizes through 100000 requested raw events, 30 random/50 adjacent seeks per size, both full-prefix controls and all three actual Java projects, exit 0 in 16.72 seconds. Stage methods are labelled as production successors; old reports are not overwritten. The complete unchanged native suite passes **69/69** in **8.2 minutes**, exit 0; evidence: `browser-presentation-migration.log`. Broader hierarchy, legacy module/test/CSS/contracts cleanup, unchanged Dense latency/retention gates and final visual/full validation remain open; no A–G completion is claimed.
