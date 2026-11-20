# Complete unavailable-flow snapshots

The committed parent is `4029d2f`. Its FlowTopology accounts for every supported
prefix edge, including edges with no drawable ports. Three retained detail-level
plans eagerly own an `{id, reason}` object for each unavailable edge, even though
Inspector reads this evidence through a virtual list.

The lead's shared contract is a complete read-only Array facade backed by a
private captured ID array and an immutable flat reason string. It preserves
every ID, exact reason text, ordering, count, numeric lookup, iteration and JSON
value. It captures no live FlowCatalog, SceneModel, event source or future prefix.
No evidence is filtered, truncated or evicted. The string payload stays in the
V8 heap; no typed-buffer move hides backing bytes from the protected heap probe.

Flow IDs provide stable identity. Per-read DTO object identity is not promised.
The sole production row consumer is Inspector's virtual list: it reads by index
and selects by captured Flow ID. It has no DTO identity cache or mutation. The
new facade and returned rows reject mutation, making snapshot ownership concrete.
Array values and recorded evidence, rather than transient DTO allocation, are
the preserved public behavior. No RuntimeState, Graph, history, event schema,
camera, material, source or JVM contract changes.

The ignored prototype passes three Array/value/serialization/immutability checks
over 25,000 entries and complete parent comparisons across 38 recordings, 760
scenes, 6,840 plans, 476,849 unavailable entries, all four existing reason strings
and 102 retained prior snapshots. Two recordings are saved actual JVM sessions;
these comparisons do not launch fresh JVMs or establish native/browser approval.

Four original protected generated-provenance processes run parent/candidate/
candidate/parent, with source-hash-verified ignored overlays and matching raw
workloads. Large-corpus retention is 24,403,632 / 24,402,176 bytes in the parent
and 22,806,928 / 22,844,880 bytes in the prototype (about 1.56–1.60 MB less).
Ratios remain 40.966–41.007%, so all twelve 25% gates still FAIL. All four LINE
ratios pass 2x. Small-corpus overhead remains unresolved.

A separate saved-JVM warm planner diagnosis uses independent catalogs/routers/
previous plans, 20 warmup pairs and 40 alternating measured pairs per cursor and
detail level, with GC outside clocks. Median ratios span 0.955–1.002 and tail
timings are mixed. This is not a statistical speedup, browser latency result,
fresh JVM run or performance-budget approval.

The production helper and topology match that measured prototype after reversing
only the helper name and local import paths. Integrated production comparisons
repeat the complete 6,840-plan proof against an exact `4029d2f` parent module;
the prototype experiment is not relabelled as a production execution.

The initial new browser driver fails twice by asking the native 64-step catalog
helper to select an offscreen/clustered object in the smaller inventory fixture.
Both real-JVM failures, exact driver/source, reports and traces are retained.
The helper bound and every ID/reason/paging/selection/prefix assertion stay
unchanged. The corrected new driver uses the existing 1,287-byte Topology Java
fixture, SHA256 `97e6a390f5349cb8a474d5ff2f5de3104bad8c3f86f46fea43ad4b9e841b10da`,
byte-identical to the fresh parent performance Java, and selects a genuinely
presented Frame. No maintained Java program or original test changes.

Two native desktop/narrow cases then pass in 23.591 seconds with two distinct
actual JVM session IDs. Both page through 7,420 unavailable rows to their exact
captured tail ID/reason, enforce the Inspector's 200-row total mount bound,
select the real graph edge without seeking or moving the camera, clear all flow
records at Event 0, and restore that captured edge at the exact normalized head.
All four originals and both failed preflight traces are retained separately.

Product/unit source `94e01c3e` (974 inputs) passes all eight full checks: 2,220
default passes, 70 explicit opt-in skips, 2,290 total tests/239 files, 307.42
seconds. Focused tests pass 24/24. Screenshot review then strengthens only the
new driver with native hover and at least 90% viewport visibility before its
tail capture. Final driver source `ff2fa076` has 973 other inputs and all 29
built resources byte-identical, with fresh browser typecheck and protected-path
guards. Vite explicitly excludes `e2e/**` from defaults. The earlier default,
build and lint executions are not relabelled as fresh final-driver executions;
`compact-unavailable-driver-qualification.json` records the exact boundary.
The strengthened two-case preflight passes again in 23.195 seconds, zero
failures/skips/flaky, with two distinct actual JVM IDs and four originals.

The fresh unmodified production Node probe retains 22,815,656 bytes at the
largest corpus, ratio 40.976%, with 1,757,696 bytes in the final-three-plan
stage. All three original 25% retention gates FAIL; LINE ratio 1.039672 passes
2x. This is a production execution, separate from the four counterbalanced
prototype overlays. Its transitive local dependency closure has 78 files,
with only FlowTopology and the new snapshot helper changed from the parent.

The final focused native integration passes 49/49, zero failures/skips/flaky,
in 524.712 seconds (runner 525.259 seconds), with 38 distinct attached actual
JVM session IDs. Its 54 original captures are archived; four are root-reviewed
and 50 are unreviewed. Hero, object, recursion, return and exception viewports,
complete unavailable evidence, Inspector, historical references, reference
bundles, return provenance, exception recovery, arrays and ownership travel
all execute. The parent's larger 135-case result stays historical on its own
source. Fresh default discovery is 300 cases/84 files, with 251 current-classified
and 49 older cases; this is not an exhaustive passing default-browser result.

Entry gzip is 71,733 bytes; diagnostic Shell static closure is 673,925 bytes.
AST inventory has 692 modules, 2,433 literal edges, 265 production-reachable
modules, 41 nonliteral sites and zero obsolete targets. The four reviewed native
originals show the actual paged tail and selected recorded graph edge without
invented spatial ports. Aliasing, matte faces, strong route glow/crossings,
long-stack/return clipping, bounded reason previews and peripheral framing
remain OPEN. Functional equality and native passes are not visual approval.

Fresh Dense run `4703adda-55c4-408e-ab41-b57389e3838e` executes FULL actual JVM
`76ccd51b-6d74-414b-a67c-d09a4c3d2014` (7,492 raw / 9,852 normalized Events),
completed with JVM exit zero. All ten stages complete with zero browser errors,
stage failures, suspended requests or recorded lifecycle issues. The benchmark
runner exits **one** in 482.905 seconds: seek p50/p95 100.660/132.587 ms (limits
55/112), Focus p95 200.430 ms (125), Home p95 231.764 ms (152), cold median
5,429.025 ms (5,300) all FAIL. No speedup or causal comparison is inferred from
this single execution against the earlier parent run.

Orbit medians are 16.7 ms at all five viewports; p95 intervals are
17.1/17.5/17.5/18.1/17.3 ms, CPU p95 3.3/3.6/3.4/3.6/5.0 ms, and calls at most
102. Maximum frame intervals 527.1/32.5/308.3/254.8/924.8 ms prevent no-jank
approval. The measured 61,497.4 ms soak has zero median frame drift and
+0.086107% whole-frontend post-GC heap growth, not isolated presentation
retention. Four external browser rows remain NOT_MEASURED; Node retention and
build-byte evidence retain their separate attribution. The fresh original
Dense PNG is root-reviewed at full size with no visual convergence approval.

Final ignored evidence includes `compact-unavailable-flows-captures/`,
`compact-unavailable-flows-source.json`, `compact-unavailable-flows-product-source.json`,
`compact-unavailable-driver-qualification.json`, `compact-flow-unavailable/`
(failed/confirmed preflights, complete parent proofs, paired controls, fresh
production Node result), build/AST inventories, eight validation logs, and
`performance-compact-unavailable-flows/`. Whole A–G, the 49 older browser cases,
retention budget, five Dense latency/load failures and visual polish remain OPEN.
This change affects only FlowPresentation.unavailable; Error Explorer's complete-
episode prefix issue (25.10) is unchanged. Runtime, Graph, history, camera, Java
fixtures, references and semantic goldens remain unchanged.
