# Reference-chip attachment geometry

Parent: `224c422`. The original measured inset has a right edge 0.26 u inside
the permanent storage/frame-boundary port. A new unit fails on the unchanged
production geometry: actual reference attachment x=2.4 versus chip edge x=2.14.
Five companion cases pass. Exact source, RED log and files are preserved in
`reference-chip-ports/alignment-red/`.

The root's shared direction distinguishes a reference-chip attachment from a
primitive value-transfer terminal. Reference attachments use the visible chip's
right edge and front plane. Primitive transfers retain their existing frame-
boundary coordinates, more than one port diameter away from the primitive chip.
Null/unavailable values expose neither attachment. RuntimeState, Graph facts,
recording IDs, entity anchors and persistent storage coordinates stay unchanged.

`valueChipGeometry` supplies the same physical constants to the actual inset
renderer and reference-port resolver. Frame/Object/Class value insets share it;
arrays and collection entries retain their separate existing geometry. A visible
captured reference chip owns a 0.16-u sphere independently of connector admission.
The existing endpoint instance batch merges a curve terminal with that chip
marker, so dim alpha is not blended twice and hover still highlights/restores
both endpoints. No extra draw batch is added when the existing endpoint batch
is present. No missing relationship or substitute curve is fabricated.

The read-only native observation walks actual visible InstancedMesh buffers,
reads each sphere transform/radius and instance alpha, and identifies the chip
portion of that same batch. The existing four actual-JVM chip-picking cases now
compare every rendered reference marker with the actual value-inset geometry,
verify base diameter/opacity, and reject reference markers at primitive chip
edges. Their original picking, Focus, source identity, cursor, references and
camera assertions remain.

Seven earlier coordinate assertions equated the visible attachment with a
permanent storage point. They now distinguish storage and reference-chip planes.
All original scope/value/identity, source-anchor, stable-layout, flow partition,
bundle constituent and reverse-order assertions remain. The original failures
and test bytes remain under `legacy-anchor-expectation/`,
`legacy-flow-anchor-expectation/` and `legacy-storage-point-expectations/`.
The original fixtures and all Java sources are unchanged.

Focused checks pass 90/90. The broader World/render integration passes 653/653
across 98 files (39.84 seconds). Source `b568613e` has 978 inputs and 18 changed
product/test files. Fresh typecheck, browser types and lint pass. The native
preflight passes 4/4 with zero failures/skips/flaky in 38.489 seconds; exact
source, report, output and captures are preserved under
`reference-chip-ports/preflight-confirmed/`. Desktop reference and narrow primitive
captures were reviewed full-size. Alignment and transfer/chip separation are
visible; excessive glow/crossings, matte faces, aliasing and clipping remain OPEN.

All eight source-validation checks pass: 2,237 default tests passed, 70 explicit
opt-in skips, 2,307 total across 240 files (286.66 seconds), plus typecheck,
browser types, lint, build metrics, reference safety and protected guards.
Skipped JVM opt-in suites are not counted as passing.

The final integrated native gate passes 60/60, zero failures/skips/flaky, in
604.618 seconds (runner 605.176). It attaches 49 distinct standard actual JVM
session IDs across 49 cases; those IDs are not a claim about every OS process
or every historical-session attachment. It preserves 65 originals, seven
reviewed at full size and 58 unreviewed, under
`reference-chip-ports-final-captures/`. The same gate includes 25 hero/object/
recursion/return/exception viewports, complete unavailable-flow paging, Inspector
source and Focus actions, history/reference bundles, return provenance,
forensic recovery, arrays, ownership, the four strengthened port cases, null
Frame guards and all five arbitrary-Java successors.

Build entry gzip is 72,163 bytes; Shell static JS closure is 675,300 bytes.
AST: 696 modules, 2,464 literal edges, 267 production-reachable modules,
42 nonliteral sites and zero obsolete targets. Default browser discovery stays
304 cases/85 files; the older remainder stays 44. These are discovery and
classification, not exhaustive browser acceptance.

The unchanged protected Node benchmark runs on integrated production source,
with 79 local inputs; only faceRows and the new geometry helper differ from the
preceding closure. All three raw corpus hashes match the prior protected run.
All three 25% retention budgets still FAIL: 1,560,496 / 6,127,880 / 22,812,128
presentation bytes; large ratio 40.974685%. LINE ratio 1.220114 passes 2x. These
are synthetic CPU/retention measurements, not JVM or GPU evidence, and do not
establish a memory improvement. Fresh Dense run `1d05f818` records actual FULL JVM `a66958b0` (7,492 raw /
9,852 normalized Events), completed Java exit 0. All ten stages finish with zero
browser/stage/lifecycle errors and zero suspended requests. The benchmark exits
1 and archive exits 0; runner wall time is 481.390 seconds. Current budgets:

| Metric | Measured | Unchanged limit | Result |
| --- | ---: | ---: | --- |
| Seek p50 | 114.190 ms | 55 ms | FAIL |
| Seek p95 | 132.689 ms | 112 ms | FAIL |
| Focus p95 | 200.138 ms | 125 ms | FAIL |
| Home p95 | 216.737 ms | 152 ms | FAIL |
| Cold-load median | 5,028.218 ms | 5,300 ms | PASS |

Orbit medians are 16.7 ms at all five viewports; p95 intervals are
17.4/17.4/17.4/17.1/17.8 ms, CPU p95 2.8/3.3/2.8/2.6/4.1 ms, calls at most 102.
Maximum intervals are 532.7/21.4/240.9/287.9/932.6 ms, so long frame stalls remain.
The 61,277.7-ms soak has zero median drift and +0.056537% whole-frontend post-GC
heap growth; that is not isolated presentation retention. Four external budget
rows remain NOT_MEASURED. The Dense original was root-reviewed with visual
findings still OPEN. Exact source, full reports, profiles, snapshot and image
are archived in `performance-reference-chip-ports/`.

The current cold sample passes, but this single execution establishes no causal
speedup or statistical non-regression against older runs. No older measurement
is relabelled as current.
This is a presentation geometry fix, not whole A–G completion or final visual
acceptance. Array/collection port geometry, remaining array behavior, older
browser successors, memory/latency budgets and reference convergence remain OPEN.
