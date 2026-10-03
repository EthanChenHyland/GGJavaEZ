# Phase 2 — incremental processing validation

Base `14e2a17`, branch `kiro-runtime-audit`. Phase 2 is processing/transport infrastructure. Phase 1 Java execution, recorder limits, process I/O and watchdog guarantees remain binding. No constructor/coverage expansion, Spatial placement redesign, IDE-shell work or Phase 3 is included.

## Architecture and correctness

- Normal live HTTP/SSE sends metadata plus raw v1 sequence ranges, with session identity and zero-based end-exclusive cursors. Metadata has an empty raw compatibility array. Explicit legacy readers still work.
- Accepted raw NDJSON is retained in a versioned local file with sparse offsets. Ordinary publication does not materialize all raw events. Archive initialization fails before any child; append/read/cleanup failures cannot turn recorder saturation into a JVM termination/relaunch.
- Duplicate/overlap facts are checked and applied once. Gaps are rejected before later facts and repaired from the range endpoint. Reconnect uses the committed cursor. Terminal metadata cannot finalize a prefix before its advertised raw head arrives.
- One normalizer/history validates and applies only new semantic facts. The pure two-argument reducer remains the correctness oracle. Every event in four curated traces and four seeded generated traces is compared, with saved prior snapshots checked for mutation. Random/backward/adjacent seeks and A→B→C→A reconstruction use immutable shared checkpoints.
- Normalizer golden output hashes were independently checked using isolated source from `14e2a17`. Existing malformed/source/thread/return/exception/partial cases and every two-chunk partition of the bounded fixtures retain exact output; seeded chunking also agrees. No snapshot expectation was regenerated to hide semantic drift.
- Layout output equals the existing batch oracle at every tested prefix, including mixed objects, shelf wrapping, tall objects and arrays. A large projection probe verifies all **13,292 anchors**. Persistent coordinates and ports do not reshuffle. Genericity guardrails remain enabled.
- History begins with 256-event spacing and retains at most 256 total roots; adaptive thinning doubles spacing. Events/entities grow with accepted truth. Defaults remain 20,000 raw records / 8 MiB / 256 identities / 128 live frames.
- Console updates are independent. LIVE/HISTORY and actual Java status remain separate from recording status. Project/session disposal releases the old ingest and pending publication task; weak caches follow trace ownership.

See [ARCHITECTURE.md](ARCHITECTURE.md), [CONTRACT.md](CONTRACT.md) and [PERFORMANCE.md](PERFORMANCE.md) for exact protocol, memory and scheduling boundaries.

## Convergence fixes

1. Persistent array targets initially allocated backing holes proportional to virtual length. Virtual length now avoids that allocation, bounds out-of-range reads, and preserves native iteration, descriptors and JSON. Record facades retain null and JavaScript integer-key ordering. Large projection fell from 10.645 seconds to about 0.29 seconds with identical anchors.
2. A raw archive failure before application spawn is preparation failure; Run can use its existing plain fallback once. A mocked startup test verifies no child and cleanup. Cleanup failures do not propagate into another Java launch.
3. Legacy inline session fixtures exposed missing client compatibility. Their new suffix now feeds the same ingest/history; duplicate snapshots preserve the head. Modern metadata never takes this compatibility path.
4. A response matcher now checks pathname, preserving the POST/build/launch assertions while accepting the delta query. The live camera test waits for actual observed content rather than the idle canvas, and additionally verifies continued Free Explore after natural completion and exact stdout.
5. ACC14 exposed mutable trace-array leakage into React despite a timer. Presentation now has a stable trace with persistent published-prefix roots bound to the same longer history. Console rerenders cannot reveal unpublished events, reconstruct or dispose that history. Prefix validation checks the selected prefix's terminal state. A focused test covers these boundaries.
6. Raw backlogs coalesce until the latest advertised head is accepted. Initial publication also uses the existing 100 ms cadence. Recorded facts are preserved; transient visual frames can be skipped. No new camera, material or placement system was introduced.
7. Person screenshot capture waits for source/text readiness and camera settling instead of capturing loading text and blank transient faces.
8. The banking failure test waits for the current recording and its observed main before selecting Focus. Immediate process metadata can precede the coalesced world; selecting the visibly labeled previous recording does not select a frame in the incoming session. Failure/completion retention assertions remain intact.
9. Final review found that Node `write(false)` accepts an in-flight frame. Immediate disconnect could resend large metadata forever without raw progress. The sender now pauses until `drain`, with a one-second stalled-drain deadline, preserving the buffer ceiling and resuming on the scheduled tick. Raw facts get a turn after backpressured metadata, so continually growing Console metadata cannot starve them. Mocked stalled/drained/fairness cases and real loopback HTTP with 512 KiB metadata verify progress without reconnecting or invoking Java control. The owned dev process was restarted after terminal completion to load the corrections.

## Original Java acceptance projects

The final full acceptance run passed **159 tests with 36 unchanged expected failures** in 160.46 seconds. Original Java and expected stdout are unchanged. Exact deferred graph/history/coverage targets remain expected failures; production budgets were not raised.

| Project | Actual Java result | Recording | Retained raw / semantic | Normalize + history | Layout + scene |
| --- | --- | --- | --- | --- | --- |
| ACC13 | Exit 0, complete | STOPPED_LIMIT / objects; partial world | 3,076 / 3,849 | 24 ms | 18 ms |
| ACC14 | Exit 0, complete | STOPPED_LIMIT / events; partial world | 20,001 / 24,765 | 159 ms | 389 ms |

ACC13:

```text
MEMBERS 3000
FOLLOWS 12000
REACHABLE 2929
FARTHEST 10
```

ACC14:

```text
PROCESSED 2400
MAX_QUEUE 400
CLOCK 5163
```

The capture stop preserves last recorded sequence 3074 / 19999. Later Java completion does not invent semantic returns/end events. [acceptance-results.json](acceptance-results.json) records all projects and invariance variants. Phase 0/1 evidence is unchanged.

## Final gates

- Typecheck, ESLint and production build passed. Changed `.mjs` modules passed Node syntax checks; evidence JSON parsed and `git diff --check` passed. Existing chunk-size, ineffective Troika dynamic-import and Three CommonJS deprecation warnings remain.
- Full unit/integration gate: **76 files, 834 passed, 2 unchanged expected constructor failures**, 102.16 seconds. The final archive/transport focused recheck passed **18 tests in 2 files**, including native HTTP backpressure, fairness and tick-budget checks.
- Full browser gate: **89 passed, no failures/skips/retries**, 7.3 minutes. The earlier two failures were corrected response/readiness checks; the full run includes all previously unrun project tests. Server convergence additionally passed **6 relevant browser tests** in 34.1 seconds, then **4 transport/partial-recording checks** in 20.8 seconds after enforcing the tick budget. The final loaded-server duplicate/reconnect/live-History check passed again in **7.6 seconds**. These rechecks cover Person/general editing/replay and partial recordings as well as delivery ordering.
- Full acceptance corpus: **159 passed, 36 unchanged expected coverage failures**, 160.46 seconds. A final-source ACC13/ACC14 recheck additionally passed **14 tests and 4 unchanged expected failures** in 8.54 seconds; 177 unrelated cases were deliberately not selected for this supplemental run. Their Java stdout, exit 0, partial runtime status and recorder budgets remain exact. [acceptance-converged-cases.json](acceptance-converged-cases.json) records final-source timings: ACC13 32 ms processing / 16 ms world; ACC14 139 ms / 418 ms.
- Final serialized performance gate: **4 files / 4 passed**, 25.15 seconds, including 6k/24k/122k/250k, policy, million-event and exact projection probes. At 122k, combined processing is 828.326 ms, **69.4×** faster than the same-machine baseline; scrub p50/p95 is 0.975/1.830 ms. Million-event construction is 8.495 seconds with 1821.5 MiB retained fixture memory and 30.8 ms scrub p95. No million-event rendering claim.
- Final-source Chrome algorithm probe: 122,139 semantic events in **628.9 ms** while the Person WebGL scene stays mounted. Slice p50/p95/max is 4.0/6.4/14.2 ms; scrub p50/p95 is 0.7/1.2 ms; concurrent RAF p95 is 16.8 ms across 38 intervals. This is not dense-world GPU timing.
- Delta duplicate/reconnect evidence: retransmission applied once, intentional disconnect resumed at committed raw cursor 27, History stayed fixed, original Java session reached exit 0 and complete stdout, completed reload worked, no browser errors. [transport-browser.json](transport-browser.json).
- Screenshot manifest: **86 captures, 18 reviewed at original resolution**, covering all four viewports. [screenshots.json](screenshots.json).

### Visual regression review

Captured desktop sizes are 1728×1117, 1440×900 and 1280×800, plus 760×900 narrow layout. Review covers Person overview/Focus/completed, partial-recording overview/Focus, banking failure Focus, Gradle dispatch, graph history and large-object/array Focus. References 06–11 and the binding design language were inspected; 06 and 11 were reopened during final convergence.

Overview captures retain real top/side faces, XYZ separation, cast shadows, shared stack/heap colors and attached reference endpoints. Focus deliberately favors the readable front face. No bloom, decorative scenery, camera/material rewrite or CSS perspective was added. Narrow layouts retain accessible timeline, inspector, source/Console and selection. Readiness-aware capture removes transient blank text/Monaco loading; persistent presentation prefixes and catch-up coalescing reduce transient rebuilds without moving existing anchors. Geometry comparisons verify exact placement, independently of screenshot appearance.

Existing overview LOD hides labels on quiet distant volumes; some long values truncate on faces while the inspector retains the complete value. Dense-world rows and long camera fits remain visually weak. These presentation limits are reported without a Spatial redesign in this phase. The screenshot manifest records dimensions and SHA-256 for local generated evidence under the repository's existing bulk-media ignore policy.

## Dense-world measurement boundary

The opt-in ACC14 probe is separate from the regular browser suite. Its full dense-frame attempt completed all eight jumps and ten adjacent samples, then hit its 300-second cap during orbit sampling. [acc14-dense-browser.json](acc14-dense-browser.json) retains those slow timings and the incomplete status. No completed orbit/fps result is claimed. The negative reload CPU delta was removed because CDP TaskDuration reset across navigation; the harness now uses a per-document measurement.

A bounded cached-session CPU profile identifies React/Three scene commits as substantial dense-scene work. [acc14-profile.json](acc14-profile.json) is diagnostic sampled CPU evidence, not a physical GPU presentation metric. Node history benchmarks and the browser algorithm probe remain separate from rendering roughly 12k cells. Dense geometry/text/scene/camera work remains a later presentation bottleneck. The post-presentation-fix Run-to-head measurement is reported separately; it preceded the final server drain correction and does not claim the dense-frame probe passed.

## Delegation and ownership

- McClintock: persistent runtime storage, engine/history/seek/validation and reducer test migration.
- Dalton: incremental normalization and golden/partition equivalence tests.
- Godel: retained raw archive, metadata/delta server transport and focused tests.
- Russell: append-aware projection and transition caches with unchanged geometry.

Workers left partial changes at their usage limit and made no commits. The lead reviewed and completed integration, storage/projection corrections, client scheduling/presentation prefix, compatibility/failure handling, benchmarks, visual QA and final review. JVM/build workloads were serialized; no workers were restarted to bypass limits.

## Reproduce

```sh
npm run typecheck
npm run lint
npm run build
npm test
GGJAVA_MAVEN_PATH="$PWD/.ggjavaez/tools/maven/bin/mvn" GGJAVA_GRADLE_PATH="$PWD/.ggjavaez/tools/gradle/bin/gradle" VJ_ACCEPTANCE_REPORT=docs/checkpoints/v12-p2/acceptance-results.json npm run test:acceptance
VJ_QA_OUTPUT_ROOT=docs/checkpoints/v12-p2 npm run test:e2e -- --reporter=line
VJ_ACC14_QUICK=1 npm run perf:browser -- perf-e2e/incremental-v12.spec.ts
# Full dense-frame probe has a 300-second cap and can exceed it; see limitations above.
npm run perf:browser -- perf-e2e/incremental-v12.spec.ts
npm run perf:incremental
```

Heavy probes and JVM suites must run one at a time. Command logs and generated media remain local under the existing ignore policy. JSON evidence, screenshot hashes and these reports are committed. Launch with `npm run dev`, then open `http://127.0.0.1:5173/ide`.
