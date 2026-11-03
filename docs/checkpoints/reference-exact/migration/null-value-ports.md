# Null and unavailable value ports — 2026-11-03

Live spatial attachment eligibility excludes null and unavailable ValueText. Physical row positions remain usable for text, rounded chips, picking and mutation bounds. The layout engine's canonical anchors are untouched. SceneRow.port, actual presented flow ports and public drawable FlowCatalog queries use the same eligibility. Array and Map key/value eligibility are independent; a null key cannot borrow its non-null value's port. Raw graph edges and the complete iterable prefix remain available as structured provenance.

Trace All remains a distinct historical role: an ended reference binding can attach to the actual still-visible captured row at no more than 25% opacity, even when that row is now null. Hidden/retired rows remain unavailable. This is not a restored live port. The first full gate found two historical-reference regressions (2 failed /2,201 passed /70 explicit skips /2,273 total, 237 files). Its exact 968-file source f7ea20b063fa9a2cd0007dad70375b4fd0182370759cccc37df351f3991c92ab and failed reports are archived before correction. A dedicated live-null versus faded-history regression also fails before the correction. The corrected seven-file focused gate passes 59/59.

Initial focused null-port RED is four failures, with the corrected provenance fixture separately demonstrating a drawable null edge. Focused integration before history correction passes 75/75. Existing geometry assertions use physical row position, retaining all scope/value/identity checks; new checks assert absence of null/missing ports. An all-null inherited group heading regression preserves real captured row geometry and the declaring class heading.

The original two native Frame value-chip cases pass on the earlier f7ea source with expanded read-only observations: null chips have neither SceneRow nor presented Flow ports, and no individual/bundle terminal occupies their actual row position. All original Java, native selection, camera pose and runtime values remain unchanged. The narrow PNG is root reviewed; its null chip loop is absent. This is preflight evidence, not final-source confirmation.

Corrected production source d49267662d32152da00bb226146d73d9883ce5b0f21183cf314c6127c0220240 (968 files) passes fresh complete defaults and eight checks; its first complete browser integration and successors are reported below. Primitive chip ports remain a separate unresolved requirement 9.8 issue. No complete visual, motion, retention, latency or A–G acceptance is claimed.


## Browser dispositions and source equivalence

The first complete integration on corrected production source d49267662d32152da00bb226146d73d9883ce5b0f21183cf314c6127c0220240 records 94 passed/five failed, zero skipped/flaky, 952.125 seconds. Both historical cases pass historical curve picking, historical aggregate picking and constituent inspection, then fail an obsolete assertion requiring a repeated live Flow bundle after its destination has become null. Both source-fault cases pass fallback/World/content checks, then reject the deliberately failed import because the error allowlist hard-codes the IPv4 origin. The unsupported-thread case successfully completes Java and preserves STOPPED_UNSUPPORTED, then fails a native Console toggle helper during frontend completion publication.

The historical successor preserves the exact Java fixture, timeout, full-prefix graph partition, native picking and replay/scope checks. It additionally asserts that the final null field has no presented Flow port, seeks natively to the latest ended binding's captured introduction prefix, proves the field then holds a non-null reference with real geometry, and exercises the original repeated Flow bundle and constituent checks there. It verifies the exact prefix facts/camera and returns to the original complete world before continuing full-history replay. No graph edge is removed to satisfy the test.

The source-failure successor matches the exact URL captured by the editor-module-only failure route; unrelated console errors still fail. The observer successor waits for the frontend process to be ended with the matching recording ID before the original native close/reopen-to-pin helper. A completed partial recording's aggregate display remains PARTIAL_RECORDING; using COMPLETED as that display prerequisite was an intermediate test mistake (four passed/one failed, 49.439 seconds). That report and a later syntax-only discovery failure are retained. Corrected focused successors pass 5/5, zero skipped/failed/flaky, 41.027 seconds.

The unrelated ethanbchen.com Vite on IPv4 port5173 is left untouched. The first reused-server attempt records zero passed/32 failed/67 interrupted-not-run because API requests receive that site's HTML. A separate alternate-port attempt records zero passed/nine failed/90 interrupted-not-run because the bridge correctly rejects port5175 mutation Origins. Both are archived prerequisite failures, not native semantic results or configured skips. QA now starts a separate GGJavaEZ Vite on verified free IPv6 ::1:5173, uses localhost:5173 in the browser and checks the IPv6 endpoint for readiness, with server reuse disabled. The bridge, origin policy and unrelated server are unchanged. The original two Frame cases pass separately on this setup in 21.048 seconds.

Final frozen source bb9299e6f005d7bb7a970a72754ccb39333b0cd5d3728bd46ce5ef466694cd5d contains 968 inputs: 965 match d492, with only the three described browser successors different. The fresh 2,204 passed/70 explicit opt-in skips/2,274 total default result in 237 files (285.24 seconds) is reused for identical production/unit/fixture inputs, not relabelled as a new execution. Seven fresh checks pass; all fourteen built production JS resources are byte-identical. Main-entry gzip is 71,730 bytes; entry/Shell static closures are 72,160/672,499 diagnostic bytes. AST inventory is 686 modules/2,397 literal edges/263 production-reachable modules/41 nonliteral sites/zero obsolete targets. The three new nonliteral sites are read-only browser topology observations; no production import policy changes.

## Final native gate

Final source bb9299e6f005d7bb7a970a72754ccb39333b0cd5d3728bd46ce5ef466694cd5d passes 99/99 native integration cases, zero skipped/failed/flaky, 951.657 seconds. This includes both historical cases and the exact source-fault and unsupported-thread successors. The earlier 94/5 gate remains separate. All 144 exact PNGs are retained: five reviewed at original size against best.png and 139 unreviewed. Sixty-six distinct attached JVM IDs plus two historical-binding and two separate stream IDs give 70 known identities. This is a mixed actual-Java, curated and isolated gate, not 99 fresh JVM sessions or exhaustive whole-browser approval.

Reviewed images are actual-JVM Hero, narrow null Frame, narrow Trace All history, environment context recovery and CINEMATIC StockItem face palette. Null input/local chips remain readable without the former dots/loop; the non-null box reference survives. Trace All shows faded ended bindings at a now-null row without a live outgoing reference. Context recovery and opaque palette remain. Relative to best.png, bright/crowded routes, text edge quality, peripheral clipping and floor/face hierarchy remain unapproved. Historical holder-name unavailability deliberately avoids borrowing current redeclared storage metadata.

## Fixed Dense on final source

Run 32a8b4b0-c737-4de0-af9b-3c659ce1501f executes fresh actual JVM d058e336-f4d3-4969-a01b-4cf509d793d0: 7,492 raw/9,852 normalized Events, FULL, completed exit zero. All ten unchanged stages complete with zero browser errors, stage failures, suspended requests or recorded lifecycle issues. The runner exits one after 478.170 seconds.

| Metric | Measured ms | Fixed limit ms | Result |
| --- | ---: | ---: | --- |
| Seek p50 | 84.350 | 55 | FAIL |
| Seek p95 | 117.167 | 112 | FAIL |
| Focus p95 | 200.842 | 125 | FAIL |
| Home p95 | 215.443 | 152 | FAIL |
| Five-load cold median | 5,026.650 | 5,300 | PASS |

In viewport order 1728/1440/1280/760/short1440, orbit medians are 16.7/16.6/16.7/16.6/16.7 ms; p95 values 17.6/17.3/17.5/17.5/17.8 ms; CPU p95 values 3.1/3.1/3.1/3.1/4.1 ms; and maximum intervals 574.3/140.4/644.9/367.3/962.3 ms, with at most 102 calls. These maxima prevent a no-jank claim. The 61,532.7-ms soak has approximately zero median drift (8.92285e-8%) and whole-frontend post-GC heap change -0.051235%; that is not isolated presentation retention. Four external rows remain NOT_MEASURED in the browser report. Independent Node and build evidence stay separate.

The original Dense image is root reviewed: overview glyph cutoff/aliasing, bright long routes and peripheral tray/entity clipping remain unapproved. CPU profiles and the raw accepted recording are retained. This is a fresh budget check, with no parent counterbalance, causal improvement, statistical non-regression or final motion approval inferred.

## Independent retained presentation measurement

The unchanged protected Node benchmark runs once per generated configuration with explicit GC on M1 Pro /Node 24.22.1. It is generated-provenance evidence, not a fresh JVM or WebGL measurement. The runner exits one in 21.92 seconds.

| Raw target /actual raw /normalized Events | Semantic heap bytes | Presentation heap bytes | Ratio | Limit |
| --- | ---: | ---: | ---: | --- |
| 200 /208 /367 | 925,504 | 1,583,200 | 1.710636 | 0.25 FAIL |
| 5,000 /5,024 /8,875 | 12,442,776 | 7,253,440 | 0.582944 | 0.25 FAIL |
| 20,000 /20,018 /35,346 | 55,691,544 | 27,502,912 | 0.493844 | 0.25 FAIL |

The one-byte-per-accepted-edge endpoint-tag backing store is outside heapUsed. Adding its entire 15,375-byte upper bound at 20k gives 27,518,287 presentation bytes and ratio 0.494120, still FAIL. ID arrays/wrappers remain included in heapUsed. LINE scaling 1.023085 passes the unchanged 2.0 limit. These forced-GC deltas include the real measured construction/cache/JIT conditions; they are not exact per-type retained sizes, a parent comparison, causal improvement or statistical confidence. No heap snapshot is captured in this run. At the 20k target the diagnostic stage deltas are layout 6,583,384; projector index 7,727,720; initial scene 5,791,840; catalog 4,054,944; and final plans/endpoints 3,345,024 bytes.

Primitive chip ports (requirement 9.8), all three retention limits, four current Dense latency limits, array-window keyboard continuity, visual/motion convergence, the 74 older browser cases, exhaustive JVM/browser gates and whole A–G completion remain OPEN. No limits, Java fixtures, performance drivers or protected semantic suites are changed or waived.

Evidence under .ggjavaez/qa/reference-exact/: null-ports-red/, null-ports-history-regression/, null-ports-history-{red,green}.log, null-ports-history-and-origin-gate/, null-ports-wrong-server-failure/, null-ports-alternate-port-failure/, null-ports-loopback-preflight/, null-ports-browser-successor-prerequisite-failure/, null-ports-browser-successor-syntax-failure/, null-ports-browser-successors/, null-ports-final-source.json, null-ports-final-input-equivalence.json, validation-null-ports-confirmed-final*, validation-null-ports-final-final*, native-null-ports-final-integration*, null-ports-final-captures/, dependency-null-ports-final.json, performance-null-ports/ and null-ports-node-retention/.
