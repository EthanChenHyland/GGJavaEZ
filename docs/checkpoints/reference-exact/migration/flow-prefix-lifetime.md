# Complete flow-prefix ownership — 2026-11-01

The planner previously requested an eager FlowCatalog prefix, retaining every derived flow DTO and resolved endpoint object pair after planning. It now consumes the complete prefix once and retains compact endpoint IDs/kind tags for repeated planning at that cursor. No edge, unavailable reason, ordering, ranking, bundle, geometry, value or semantic identity is omitted or changed.

iteratePrefix captures its accepted edge boundary before lazy consumption, so a later append cannot add edges to an outstanding pass. Endpoint IDs remain opaque; three-bit tags describe endpoint kind/channel, with a separate valid bit for null/null results. Both endpoint caches retire when a different semantic prefix is resolved. Public query clients retain their endpoint-object cache. The public prefix API still returns its eager frozen array with the original cache identity; an existing exact snapshot is reused by the iterable. Eager clients may intentionally retain that full snapshot. FlowTopology accepts an Iterable and counts its single complete pass. There are no weak references, new production modules/dependencies, RuntimeState fields or shared semantic-contract changes.

Four new regressions cover replay/eager identity, delayed and partly consumed iterators across rewind/append, exact single-use accounting of 100 mixed flows, and reuse/invalidation of actual semantic endpoint derivation. The cacheless regression is one failed/six passed; final focused confirmation is 22/22 in four files. Earlier iterator RED is three failed/twelve passed; initial typing failures remain archived.

The final saved-input proof against committed parent ba9a39d passes 1,278 prefix comparisons, 31,416 public API queries and 3,834 complete FAR/MEDIUM/CLOSE plans across a saved real-JVM Dense recording and 32 generated traces. Its streaming planner never requests an eager snapshot. There are 313 multi-candidate Event queries but no multiple-drawable Event in that corpus, an explicit limitation. This is equivalence evidence, not a fresh JVM/browser execution.

## Rejected cacheless candidate and repeated planning

Candidate d108776d2c797587ce45381c89fbf2b89c967c3bb16dbd0f0893bdde7563f954 passes fresh 2,198/70 explicit opt-in skips/2,268 total defaults and a complete 97/97 native gate. Its M4 Pro Node comparison records 4,554,960 fewer presentation heap bytes at the 20k target, but all three 25% limits still fail. It is not shipped unchanged: a counterbalanced M1 Pro Node diagnostic over a fixed saved actual-JVM prefix finds parent planning p50 3.867/4.400 ms and p95 4.960/5.974, versus cacheless p50 23.034/22.743 and p95 25.607/25.568. Repeated semantic derivation is a demonstrated CPU tradeoff.

The final compact-cache diagnostic records parent p50 3.617/3.753 ms and p95 4.575/4.606, versus compact p50 5.687/5.924 and p95 6.966/8.061. Each independent warmed block uses 50 captured selected slots, alternating focusTargetId between that target and null, in parent/compact/compact/parent order. It does not exercise the Hero camera solver, React or native commands. All router counts match. This removes most of the cacheless cost but leaves a measurable planning overhead; no statistical non-regression or browser-latency pass is inferred. The old-path helper load failure executes no tests and is preserved separately before correcting only its ignored import paths.

## Independent retention on the current machine

The protected performance test is unchanged. Both configurations run once with explicit GC on M1 Pro /Node 24.22.1. The parent uses test-only Vite load substitution of exactly three byte-verified ba9a39d production modules; the other production sources and protected benchmark are unchanged. Modified unit test sources are not loaded by that benchmark. The compact run uses frozen source 9f25f0a6bb16e409eaf679f746e2ac952a80ea5a1594ef8620beb189d9ffaff3, 968 files.

| Target / actual raw / normalized Events | Parent presentation heap bytes | Compact presentation heap bytes | Parent ratio | Compact ratio | Limit |
| --- | ---: | ---: | ---: | ---: | ---: |
| 200 /208 /367 | 1,592,520 | 1,575,632 | 1.716181 | 1.699388 | 0.25 FAIL |
| 5,000 /5,024 /8,875 | 8,318,600 | 7,283,744 | 0.669423 | 0.586495 | 0.25 FAIL |
| 20,000 /20,018 /35,346 | 31,796,616 | 27,529,608 | 0.570419 | 0.494265 | 0.25 FAIL |

At the 20k target, presentation heap delta is 4,267,008 bytes lower. The final-plan/endpoints stage changes from 7,614,504 to 3,343,104 bytes. LINE scaling ratios 1.091353/1.111816 pass the unchanged 2.0 limit. Both runners exit one because all three retention limits fail. These are single-construction forced-GC deltas, not exact retained sizes, fresh JVM runs or statistical confidence.

The new Uint8Array backing store is outside heapUsed; its upper bound is one byte per accepted graph edge, 15,375 bytes at 20k. Adding that entire bound gives 27,544,983 presentation bytes and still fails 25%. ID arrays and wrappers are included in the measured heap. This separate bound prevents treating excluded backing-store bytes as an acceptance gain. Optional heap snapshots are captured by the protected test at the final-plan checkpoint, before 100 spread seeks. Earlier structural censuses are not dominator/retained-byte calculations; an empty analyzer router list is a detection limitation, not zero router memory.

## Environment and retained native evidence

The first cacheless 97-case run records 57 passed/38 failed/two not run over 23,541.412 seconds, with long timeout durations and language-service failures. Its report, traces, source and 67 exact captures remain a failed run. On resumption this machine is an M1 Pro; the saved JDK path points to an absent former user directory, and only JDK 17 is registered. A fresh run is stopped after its first prerequisite failure: zero passed/one failed/96 not run.

Workspace-local Temurin 26.0.2.1+1 is restored from the [vendor release](https://github.com/adoptium/temurin26-binaries/releases/tag/jdk-26.0.2.1%2B1), verified SHA-256 8c77a069a150c5b1c80280269ba062463053ebb7619ddef38dcfe3921fc60bdd. Matching java/javac and bridge health are checked. Only ignored workspace tools/settings change; system Java registration and repository source do not. The restored run records 95 passed/two failed, zero skipped/flaky, 911.067 seconds. Both failures preserve the submitted emoji but Java stdout returns `?`: inherited LC_ALL=C makes its native/stdin/stdout/stderr encodings US-ASCII despite UTF-8 file encoding.

A supported per-process en_US.UTF-8 locale makes those encodings UTF-8 without changing Console/backend code, assertions, timeouts or Java. The two exact cases pass in 12.907 seconds, then a separate complete gate passes 97/97, zero skipped/failed/flaky, 865.592 seconds. Neither result relabels the preceding 95/2 run. Arbitrary-locale stream support is not established. The new machine's timings are separate from earlier M4 Pro evidence.

The cacheless complete gate retains 140 exact PNGs, nine reviewed at original size; 131 remain unreviewed. Sixty-six distinct attached JVM IDs plus two separate stream IDs are retained. Review confirms the null-Frame chip endpoint defect under requirement 9.8, along with route glow/crowding, text cutoff/aliasing, dark face/side/floor response and peripheral clipping. Cinematic Person is explicitly curated. No final visual or motion approval is claimed.

## Final compact-cache gates

The complete-default-tested 968-file source is frozen at 9f25f0a6bb16e409eaf679f746e2ac952a80ea5a1594ef8620beb189d9ffaff3. All eight validation checks pass, including fresh complete defaults: 2,199 passed /70 explicit opt-in skips /2,269 total, 237 files, 264.72 seconds. Main-entry gzip is 71,732 bytes; entry/Shell static closures are 72,162/672,426 diagnostic bytes. These are fresh build measurements, without a causal cross-toolchain size claim. The first compact native run records 96 passed/one failed, zero skipped/flaky, 852.084 seconds. Its source/report/140 captures are retained as a failed integration. The provenance test restores 1440 pixels after its narrow capture and immediately measures a stale narrow slider width: retained trace shows a 556.501-pixel relative click offset landing at cursor 80 instead of 146, then eight native arrow corrections reaching 88. This is an inference about stale geometry from the actual helper formula and trace, not a captured final-width measurement. One browser prerequisite now waits for the actual STANDARD shell layout before seeking; exact Java, semantic assertions, timeouts and native input remain unchanged. Focused provenance then passes 1/1, 23.4 seconds.

Final source 0ddeed5c6450579407d6b8dd76a0fc44403a6b42ed2a6657961e9f278e6d843a matches 967 of the preceding 968 inputs; only that one browser line differs. The preceding fresh 2,199/70 result is explicitly reused for identical production/unit/fixture inputs, not relabelled as a new execution. Seven fresh checks pass, and all fourteen built production JS resources are byte-identical to the complete-default-tested build. Complete native confirmation passes 97/97, zero skipped/failed/flaky, 843.002 seconds. It retains 140 exact PNGs: five reviewed at original size, 135 unreviewed; 66 attached distinct JVM IDs and two separate stream IDs are retained. This is a mixed actual-Java, curated and isolated gate, not 97 fresh JVM sessions. The earlier 96/1 failure remains separate. AST inventory is 686 modules/2,392 literal edges/263 production-reachable modules/38 nonliteral sites, with zero obsolete targets. Runtime, instrumentation, shared semantic contracts, camera, protected tests and performance driver stay unchanged.

## Fixed Dense on the final source

Run 51ffadfb-6863-4a40-b109-d38195e97f64 executes fresh actual JVM 2152c7df-7fd9-4b19-96b4-04ca3ce2d43c: 7,492 raw/9,852 normalized Events, FULL, completed exit zero. All ten unchanged stages complete, with zero browser errors, stage failures, suspended requests or recorded lifecycle issues. The runner exits one.

| Metric | Measured ms | Fixed limit ms | Result |
| --- | ---: | ---: | --- |
| Seek p50 | 90.673 | 55 | FAIL |
| Seek p95 | 157.048 | 112 | FAIL |
| Focus p95 | 183.829 | 125 | FAIL |
| Home p95 | 215.858 | 152 | FAIL |
| Five-load cold median | 4,601.898 | 5,300 | PASS |

All five orbit medians are 16.7 ms. In viewport order 1728/1440/1280/760/short1440, p95 intervals are 17.1/17.5/17.4/18.4/18.3 ms and CPU p95 values 2.9/3.1/3.0/2.8/4.1 ms, with at most 102 calls. Maximum intervals are 22.4/628.6/723.0/801.0/454.9 ms: this is not no-jank acceptance. The 60,929.6-ms soak has zero median drift and whole-frontend post-GC heap change -0.039323%; that is not isolated presentation retention. Four external rows remain NOT_MEASURED in the browser report; independent Node/build evidence is separate.

The original Dense image is root reviewed. Overview glyph cutoff, small cluster labels, strong routing glow and peripheral hierarchy remain open. Diagnostic CPU profiles are retained; no causal global improvement, statistical non-regression or equivalence to the earlier M4 timings is claimed. The measured repeated-planning overhead remains explicit.

Independent retention and four current Dense latency budgets remain FAILED. Primitive/null Flow Ports, visual/motion convergence, 74 older browser cases, exhaustive JVM/browser gates and whole A–G completion remain OPEN.

Evidence under .ggjavaez/qa/reference-exact/: flow-compact-endpoints-source.json, flow-compact-endpoints-{red,green,typecheck,lint}*, flow-compact-endpoints-parent-proof.*, flow-compact-endpoints-replanning.*, flow-compact-retention-comparison.json, flow-compact-backing-store-bound.json, flow-compact-parent-m1/, flow-retention-compact-m1/, validation-flow-compact-final*, native-flow-compact-integration*, flow-compact-captures/, flow-compact-viewport-failure/, flow-compact-provenance-preflight/, flow-compact-confirmed-*, validation-flow-compact-confirmed-*, native-flow-compact-confirmed-integration*, flow-iterator-cacheless-candidate/, flow-iterator-replanning-old-path-failure/, flow-iterator-interrupted-gate/, flow-iterator-jdk-prerequisite-failure/, flow-iterator-restored-captures/, flow-iterator-utf8-preflight/, flow-iterator-utf8-confirmed-captures/, the earlier flow-retention-before/ and flow-retention-iterator/, performance-flow-compact/ and jdk-restoration*.json.
