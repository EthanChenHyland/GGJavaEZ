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

## Remaining delivery checks

Full recorded hierarchy/lifetime grouping, legacy module/test/CSS removal, contract/token/persistence consolidation, clean-replacement guardrail, current Dense semantic/presentation memory, all unchanged performance limits, final original-size reference review/polish and the exhaustive final gate remain required. Semantic goldens and backend contracts remain protected; final cleanup must record their identity and map replaced presentation tests/goldens to independently reviewed successors. The final diff must exclude generated output, secrets, accidental machine-local artifacts, duplicate architecture, fixture leakage and modified/staged reference roots.

Final completion requires a normal push on reference-exact-rebuild, HEAD equal to origin/reference-exact-rebuild, tracked tree clean, unchanged main baseline and protected root images. No merge or history rewrite is authorized.
