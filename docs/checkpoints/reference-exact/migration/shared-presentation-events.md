# Shared presentation event witnesses

The projector's reference-binding reader and FlowCatalog currently retain
separate event-ID maps for the same accepted TraceDocument. The protected
20,000-event diagnostic on `502e760` retains 26,192,576 presentation bytes
(47.02% of semantic retention; the 25% gate fails). Its private binding-reader
map alone has a 1,835,048-byte V8 backing table. These shallow table sizes are
not dominator sizes or a complete attribution.

The lead's shared contract for the candidate is one canonical envelope index
per exact TraceDocument identity, held through weak keys and weak values, with
no key based on recording IDs.
The World compiler explicitly gives its initial document to both readers so
new document wrappers during streaming cannot create duplicate owners.
Standalone binding readers retain their own index unless given that exact shared
owner. The index validates each incoming envelope completely before extending
its map. It contains actual opaque-ID event witnesses, not parsed IDs or
sequence guesses. Each consumer keeps its own admitted ordinal and exposes
only witnesses below that ordinal, even if another consumer has extended the
shared backing table. Runtime, Graph, history, source, and JVM contracts stay
unchanged. No UI or QA mutation API is added.

Live consumers own the index strongly; the registry has no retained document
back-reference and does not retain an unused index merely because its document
is still open. Prefix snapshots and flow accounting remain independent of this
lookup owner. Invalid envelopes must not advance either reader or publish a
partial suffix.

Existing mutable normalized fixtures retain their prior behavior. A reader
keeps its already-admitted event witnesses when a fixture replaces a consumed
event object with the same ID. If an incoming, unconsumed witness differs from
the shared table, admission returns a private branch containing that reader's
admitted witnesses and its incoming suffix. The other reader stays unchanged.
Ordinary immutable normalized JVM streams retain one shared table. No original
collection, scene, or flow test is changed to accommodate this contract.

The first implementation is rejected and archived: its reference-identity
guard breaks the unchanged `collectionFace` first-source-unknown test (2,215
default passes, one failure, 70 explicit opt-in skips). Its strong registry
value also retains an unused index for all 30 explicit-GC diagnostic turns
while the trace remains open. The corrected weak value releases that index
at the first observed GC turn with the trace still retained. This is an
observed Node lifecycle check, not a portable GC scheduling guarantee.

Corrected-source focused checks pass 35/35, including the original failing
collection test unchanged. Exact parent comparisons cover 38 recordings (four
curated, 32 generated and two saved actual JVM sessions), 136 streaming appends,
912 complete scenes, 1,632 full plans, 9,696 flow queries and 114 retained prior
snapshots. All match. Saved JVM replay is not a fresh native execution.

The separate layout-row prototype is not production: 53 traces, 7,659 complete
incremental states, 212 scenes, nine plans and 265 historical snapshots match
the committed layout. One protected candidate run saves about 0.38 MB on the
largest corpus but still fails every retention gate. Its measurements and
initial scratch-import failures remain under the ignored QA directory.

Four fresh corrected-source processes run parent/candidate/candidate/parent
with the unmodified protected test, original 200/5,000/20,000 targets, 100 LINE
samples after 20 warmups, explicit GC and 100 spread seeks. Loaded parent
module hashes and all raw workload hashes match. At 20,000 events, the parent
retains 26,218,288 / 26,218,024 bytes; the candidate retains 24,403,216 /
24,402,192 bytes, about 1.82 MB less (6.9%). Ratios fall from 47.078% / 47.071%
to 43.823% / 43.804%. **All twelve 25% retention gates still fail.** LINE ratios
are 1.216 / 1.612 / 1.633 / 1.263; all pass the unchanged 2x limit. The larger
candidate ratios have smaller 1,000-object denominators; no latency improvement
or statistical performance approval is claimed. All original per-seek semantic,
prefix, complete-flow and plan-accounting assertions execute. These are Node
generated-provenance measurements, not JVM/GPU measurements or a budget waiver.

The six changed/new source inputs have inventory hash `80f38870` (971 inputs);
the ignored prototypes are excluded. This is not a completed whole-product
milestone or visual approval.

All eight source checks now pass, including 2,217 default passes, 70 explicit
opt-in skips, 2,287 total tests and 238 files (297.58 seconds). Entry gzip is
71,733 bytes; diagnostic Shell static closure is 673,481 bytes. AST inventory
has 689 modules, 2,426 literal edges, 264 production-reachable modules, 41
nonliteral sites and zero obsolete targets. The protected Node dependency
closure is 77 files, with only the index and its three world consumers changed.

The first native integration executes all 135 cases: 134 pass and one fails,
zero skipped/flaky, in 1,359.936 seconds. The failing object-inspection viewport
records a background `textDocument/codeAction` HTTP 504, caught by its existing
browser-error assertion. All 188 original captures, 95 distinct attached JVM
session IDs, source maps, reports and the failure trace are preserved in
`shared-presentation-events-native-first-run/`. A scratch report-output filename
mismatch is corrected only for subsequent runs; the archive reads the exact
configured first report directly, and preserves that original config/runner.
No assertion, timeout, retry or viewport is changed. Three intentional unchanged
repetitions of the failed case then pass, with three distinct actual JVM IDs,
zero retries, in 65.975 seconds. Only the last fixed-name wide/native PNGs survive
those repetitions; they are not three new cases or three complete capture sets.
The second complete 135-case gate passes 135/135, zero failures/skips/flaky,
in 1,343.236 seconds (runner 1,343.834 seconds). It attaches 95 distinct actual
JVM session IDs across 94 cases with JVM attachments; other cases exercise
curated or non-JVM browser behavior. Case count is not process count. Its 188
original captures are archived, four root-reviewed and 184 unreviewed. The first
failure stays a failure; its reproduction and the second complete run are
separate results. No original test, assertion, timeout or retry is changed.

Fresh original hero, narrow object-inspection, return and exception captures
are compared at full size against unchanged best.png and references 07/08/10.
Aliasing, matte faces, route glow/crossings, clipping, long exception labels,
structural heading placement and the call stack/return label under Time Dock
remain OPEN. Exact functional equivalence is not visual convergence approval.
The maintained default browser population still has 49 older cases; this gate
does not relabel that population as fully passing.

The final ignored evidence includes `shared-presentation-events-captures/`,
`shared-presentation-events-source.json`, `shared-presentation-events/` (exact
parent/plan proof, four protected Node processes, lifetime probes, rejected
candidate and source-qualified summaries), the first native failure archive,
the three-repetition confirmation archive, build/dependency inventories and
the eight validation logs. The separate fresh Dense archive is
`performance-shared-presentation-events/`.

Dense run `42fcf420-a960-4b71-a049-1a57550b7684` executes actual FULL JVM session
`8ef308bb-ed45-4807-ac08-ab8fc12b95da` (7,492 raw / 9,852 normalized Events),
completed with JVM exit zero. All ten benchmark stages complete with zero
browser errors, stage failures, suspended requests or recorded lifecycle issues.
The benchmark runner exits **one** in 475.955 seconds; successful archiving is
not a benchmark pass. Seek p50/p95 are 99.232/116.754 ms (limits 55/112), Focus
p95 183.950 ms (125), Home p95 200.423 ms (152), and cold median 5,442.190 ms
(5,300): all five FAIL. No causal latency improvement is claimed from this
single run or comparison with earlier sources.

Orbit medians are 16.7 ms at all five viewports; p95 intervals are
17.1/17.5/17.5/18.0/17.9 ms, CPU p95 3.4/3.1/3.2/3.3/4.8 ms, and calls at most
102. Maximum frame intervals are 95.7/608.3/733.8/836.7/702.4 ms, so this does
not establish freedom from jank. The measured 61,064.6 ms soak has zero median
frame drift and +0.074121% whole-frontend post-GC heap growth, not isolated
presentation retention. Four external browser rows remain NOT_MEASURED; the
separate protected Node and built-byte results retain their own attribution.
The fresh original Dense PNG is root-reviewed at full size, with aliasing,
cutoff labels, peripheral array/body clipping, glow and material hierarchy
still OPEN. No overall performance or visual approval is granted.

This ownership change does not resolve Error Explorer's complete-episode
presentation before the Cursor (25.10), primitive chip Ports (9.8), array-index
placement (14.2), changing-window keyboard continuity, the 49 older browser
cases, or the outstanding material/text/route/composition polish. The fresh
formal Dense run still has five latency/load failures on this source.
Semantic/runtime/golden/fixture/camera boundaries remain byte-identical to the
parent. Whole A–G remains OPEN.
