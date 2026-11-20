# Accepted event lookup ownership — 2026-11-03

Parent 40c57d9 maintains a projector event-ID Map and a binding-adapter event-ID Set over the same normalized witnesses. The binding adapter already validates the complete appended envelope before observations are admitted. Candidate eb3ca568659c275780c0db1d450cb7ac67ac8fe5a40ceb6b5cea3a067fe2c980 replaces that Set with the single event-ID Map and exposes a frozen get-only facade. The projector reuses it. Return-evidence functions require only get, which is their sole existing operation. No runtime/global/shared-semantic store, event copy, module or dependency is introduced. Append sequence/duplicate rejection, recording isolation, exact witness identity and prefix filters remain.

A new contract test fails before the facade exists (one failed/five passed), then 59 focused checks in nine files pass (16.04 seconds), with types/lint green. The facade test checks stable object identity, frozen/no mutation surface, absence before admission, atomic envelope rejection including a duplicate after an otherwise valid suffix, ordinal gaps, retry/rewind rejection and independent same-demo recordings.

Read-only census of the earlier exact-source explicit-GC snapshot finds three projector/binding contexts, including both LINE-scaling worlds. Those worlds precede the corpus baseline and must not be called part of its retained-stage delta. The corpus has 1,712 reference intervals and zero closed intervals: a closed-introduction optimization would not help this workload and is not implemented. The census reports selected shallow bytes, not dominator/retained sizes. The four relevant modules are byte-identical between that saved source and 40c57d9.

Exact parent-shadow proof passes 32,344 complete SceneModel comparisons and 6,513 append batches across 37 inputs: the saved actual-JVM Dense d058e336-f4d3-4969-a01b-4cf509d793d0 recording, 32 generated workloads and four curated normalized fixtures. Every input/state/layout hash remains unchanged. Caught-exception prefix count is zero, an explicit corpus limitation; native exception/return cases are added to the subsequent integration. This is saved-input equivalence, not fresh JVM/browser evidence. Parent original bytes and only-import-path-rewritten shadows are retained.

Four independent unchanged protected Node runs use explicit GC in parent/candidate/candidate/parent order. Parent load substitution uses exactly three original 40c57d9 modules; all other production and the protected benchmark are identical. At the 20k target, parent presentation deltas are 27,502,352/27,502,608 bytes; candidates 26,220,096/26,219,320. The observed reduction is about 1.28 MB, not an exact per-type retained attribution. Parent projector-index stages 7,727,784/7,722,568 versus candidate 6,415,560/6,417,248 bytes are consistent with the scoped removal.

| Raw target /actual raw /normalized Events | Parent A/B presentation bytes | Candidate A/B presentation bytes | Result |
| --- | ---: | ---: | --- |
| 200 /208 /367 | 1,583,920 /1,581,376 | 1,572,840 /1,552,760 | All 0.25 limits FAIL |
| 5,000 /5,024 /8,875 | 7,282,920 /7,283,064 | 6,934,952 /6,929,360 | All 0.25 limits FAIL |
| 20,000 /20,018 /35,346 | 27,502,352 /27,502,608 | 26,220,096 /26,219,320 | All 0.25 limits FAIL |

All twelve retention budget rows still exceed 25%. Candidate 20k ratios 0.470568/0.470773 remain FAIL, before adding the entire 15,375-byte endpoint-tag backing-store bound. All four LINE scaling ratios pass 2.0. At the 20k target parent seek-projection p50 values 29.477/30.543 ms and p95 values 56.195/57.032; candidates 29.550/29.968 and 57.070/57.883. Those mixed tails do not establish statistical CPU non-regression or a browser-latency improvement.

## Fresh validation and native integration

The exact 968-input candidate source eb3ca568659c275780c0db1d450cb7ac67ac8fe5a40ceb6b5cea3a067fe2c980 passes all eight checks, including fresh complete defaults: 2,205 passed/70 explicit opt-in skips/2,275 total in 237 files, 291.43 seconds. No earlier default run is relabelled. Main-entry gzip is 71,732 bytes; entry/Shell static closures are 72,162/672,501 diagnostic bytes. Fourteen production JS resources are measured. AST inventory remains 686 modules/2,397 literal edges/263 production-reachable modules/41 nonliteral sites/zero obsolete targets.

Fresh native integration passes 109/109, zero skipped/failed/flaky, 1,043.378 seconds. Its original 99-case scope gains ten actual-JVM return/uncaught-exception comparison cases across five viewports each. Original Java, semantic assertions, timeouts and native interaction helpers stay intact. The gate includes normal/reduced-motion navigation, constructor provenance, source failure containment, null chips, historical binding/Flow bundle selection, real I/O, persistence, observer saturation, context recovery and GPU quality controls. It retains 156 exact PNG files, seven root reviewed at original size and 149 unreviewed. Seventy-six attached distinct JVM IDs plus two historical-binding and two separate stream IDs give 80 known identities. This is a mixed actual-Java, curated and isolated gate, not 109 fresh JVM sessions or exhaustive whole-browser approval.

Reviewed actual-JVM Hero, null Frame, Trace All history, environment recovery and CINEMATIC StockItem show no new visual-system change. The added return image has an amber return but a long stack under TimeDock and weak return-heading/label readability. The added exception image preserves the captured message/throw-line/red path and honestly states uncaptured stack/cause metadata; right-edge clipping and panel title wrapping remain unapproved. Bright/crowded routing, glyph quality, peripheral clipping and face/side/floor hierarchy remain open against best.png.

## Fixed Dense on the candidate

Run a7c44ea5-96fe-41b1-b4b3-3ed5a6da37e0 executes fresh actual JVM 0c78ad4d-a7a6-4703-b689-f5859a746a31: 7,492 raw/9,852 normalized Events, FULL, completed exit zero. All ten unchanged stages complete with zero browser errors, stage failures, suspended requests or recorded lifecycle issues. Runner exits one after 476.226 seconds.

| Metric | Measured ms | Fixed limit ms | Result |
| --- | ---: | ---: | --- |
| Seek p50 | 98.870 | 55 | FAIL |
| Seek p95 | 117.372 | 112 | FAIL |
| Focus p95 | 185.012 | 125 | FAIL |
| Home p95 | 232.485 | 152 | FAIL |
| Five-load cold median | 5,038.454 | 5,300 | PASS |

All five orbit medians are 16.7 ms. In viewport order 1728/1440/1280/760/short1440, p95 intervals are 18.1/17.5/16.8/18.1/19.4 ms, CPU p95 values 3.0/2.9/2.9/3.3/4.6 ms, and maximum intervals 617.3/183.3/700.4/911.8/1,002.2 ms, with at most 102 calls. These maxima prevent no-jank acceptance. The 61,464.7-ms soak has approximately zero median drift (8.92285e-8%) and whole-frontend post-GC heap growth +0.055951%; this is not isolated presentation retention. Four external rows remain NOT_MEASURED in the browser report; independent Node/build measurements remain separate.

The original Dense image is root reviewed. Overview glyph cutoff/aliasing, bright/crowded routes, peripheral clipping and face/floor hierarchy remain unapproved. CPU profiles and the accepted raw recording are retained. Browser latency changes relative to 40c are mixed; no causal browser-speed improvement or statistical non-regression is inferred from these separate runs.

At the 20k target, adding the full 15,375-byte endpoint-tag backing-store bound gives candidate totals 26,235,471/26,234,695 bytes; both still FAIL 25%. The lookup covers the admitted normalized envelope; cursor qualification remains in its existing readers, rather than being implied by get itself. The reduction removes redundant derived index ownership without evicting a recorded edge, interval, value or earlier prefix.

Primitive chip ports, all retention limits, four current Dense latency limits, array-window keyboard continuity, visual/motion convergence, 74 older browser cases, exhaustive JVM/browser gates and whole A–G completion remain OPEN. No limit or protected performance/semantic driver is changed or waived.

Evidence under .ggjavaez/qa/reference-exact/: binding-interval-retention-census.{json,log}, binding-interval-retention-census-source.json, shared-event-index-red/, shared-event-index-{red,green,types,lint}.log, shared-event-index-source.json, shared-event-index-parent/, shared-event-index-parent-proof.*, shared-event-index-retention-{parent-a,candidate-a,candidate-b,parent-b}/, shared-event-index-retention-comparison.json, validation-shared-event-index-final*, native-shared-event-index-integration*, shared-event-index-captures/, dependency-shared-event-index.json and performance-shared-event-index/.
