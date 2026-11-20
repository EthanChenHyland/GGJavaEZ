# Compact private layout slot metadata

Parent: `feb37166`. Layout's private per-entity cache held complete RuntimeSlots
and their values, although its only read was `declaringClass` when spacing heap
groups. Empty entities also created unused inner maps. Runtime, trace and
history already own the captured values; layout needs identities and geometry
metadata.

The cache now retains first-seen slot order and the latest declaring-class
strings for heap slots only. A partial observation preserves omitted group
metadata; a supplied slot without a declaring class clears that slot's group.
An empty group map is removed. Frame, class and compact library geometry do
not retain unused value/group maps. Existing permanent ports, body anchors,
bounds, cluster metadata and append semantics are unchanged. No runtime,
Graph, normalization, history, camera or shared schema changes.

An explicit-GC diagnostic fails on the parent because a released caller's
unused value remains alive through layout. The same diagnostic passes after
the change, with the actual slot port still present. Its source, RED/GREEN logs
and captured parent remain in `compact-layout-slot-metadata/`. This optional
retention diagnostic is not counted as default or actual-JVM acceptance.

The committed regression covers partial inherited-group observations, missing
group metadata, newly fitting ports, unchanged prior ports/anchors and retained
public snapshots. Focused layout/array/projector checks pass 17/17 in three
files. A separate exact parent/candidate comparison covers 57 traces: four
unchanged curated, 36 generated, 16 explicit normalized ownership/group unit
fixtures and one saved actual Dense JVM execution (`a7e27010`, 7,492 raw/9,852
normalized Events). Complete LayoutState equality holds across 1,157 prefixes,
28,312 anchor observations, 52,171 port observations and 171 retained old
snapshots, with batch/append equality and no geometry tolerance. Synthetic unit
records are not described as JVM evidence.

Before choosing the change, a documented optional snapshot from the unchanged
protected benchmark separated its LINE calibration worlds from the generated
corpus. Shallow map/table counts identify the private cache; they are not
dominator sizes or isolated retained semantic values. The snapshot and bounded
ownership reports remain under `retention-ownership-baseline/`.

An initial candidate probe uses the three unchanged protected raw corpus hashes
and exits 1: all three 25% retention budgets still fail. The large corpus reports
22,361,624 presentation bytes / 55,674,808 semantic bytes (40.164708%); its layout
stage is 6,139,840 bytes. Parent measurements remain separately qualified.
LINE 1.200529 passes 2×. This one probe is not statistical evidence of a gain;
the smaller corpus has substantial allocation noise. It predates the added
regression test and retains its own source `4d4cc3d9`.

Final two-file source is `b5256fb366ed6f189133ff2640bf5f725c8a9eab99cf28ee5e9e392ce9814217`
over 981 inputs. All eight source checks pass: 2,246 default tests passed,
70 explicit opt-in skips, 2,316 total/241 files (302.24 seconds), plus typecheck,
browser types, lint, build, build metrics, reference safety and protected guards.
Opt-in skips are not executed JVM passes. Entry gzip is 72,162 bytes; Shell
static JS closure is 676,213 bytes. AST inventory has 699 modules, 2,476 literal
edges, 268 production-reachable modules, 42 nonliteral sites and zero inventoried
obsolete targets.

The fresh native integration passes 69/69, zero failures/skips/flaky, in
700.802 seconds (runner 701.366 seconds). It attaches 53 distinct standard
actual-JVM IDs across 53 cases; those are not counts of every OS process or
historical attachment. Exact source/reports/test artifacts/comparisons and
79 originals remain in `compact-layout-slot-metadata-final-captures/`.
Four originals were reviewed full-size and 75 remain unreviewed. Both GPU tiers
execute; all eight face/chip palette samples equal their frozen expected RGB
bytes. Existing material, glow, clipping, return/long-stack and array/motion
findings remain OPEN.

The protected Node comparison runs parent/candidate/candidate/parent in four
separate processes (22.202/22.372/22.863/23.022 seconds). Parent runs use the
captured original layout module through an explicit resolver; the original
benchmark, corpus hashes, GC calls, seek counts and budgets remain unchanged.
Both candidate runs use the default production configuration. All 12 retention
budget rows still FAIL; all four LINE ratios pass 2× (1.602263/1.202622/
1.738244/1.278320). Timing is mixed and no speedup claim follows.

| Corpus target | First pair: presentation bytes saved | Reverse pair: bytes saved |
| --- | ---: | ---: |
| 200 | −3,632 | 10,248 |
| 5,000 | 115,168 | 113,736 |
| 20,000 | 450,728 | 451,120 |

Medium/large total retention decreases in both pairs; the smallest corpus is
noisy. Large layout-stage differences are 447,632 / 405,504 bytes, illustrating
that individual stage accounting also varies. These measurements are not
portable object sizes or a statistical latency result.

The second candidate run reports 1,553,176 / 6,013,344 / 22,360,232 presentation
bytes against 927,896 / 12,377,040 / 55,677,520 semantic bytes. Ratios are
1.673869 / 0.485847 / 0.401603, all above 25%. Three retained plans account for
1,232,280 / 974,992 / 1,756,784 bytes. `production-node/` preserves that exact
second candidate report with its source/command boundary; it is not an extra
claimed execution. All original runs and comparison summaries remain in
`compact-layout-slot-metadata/counterbalanced-*`.

Fresh Dense run `1514bab2` records actual FULL JVM `e94d507d` (7,492 raw /
9,852 normalized Events), completed Java exit 0. All ten stages complete with
zero browser/stage/lifecycle errors and zero suspended requests. Runner time
is 492.251 seconds; benchmark exit 1 and archive exit 0. Seek p50 115.997 ms
exceeds 55; seek p95 134.527 exceeds 112; Focus p95 200.786 exceeds 125; Home
p95 231.572 exceeds 152; cold median 5,556.662 exceeds 5,300. All five latency
limits FAIL in this execution. These single-source samples do not establish a
causal latency improvement or statistical non-regression against older runs.

Orbit medians are 16.7 ms at all five viewports; p95 intervals are
17.5/17.3/17.5/17.5/17.7 ms, CPU p95 3.6/3.9/3.9/4.0/6.0 ms, calls at most
102. Maximum intervals are 791.0/863.8/903.9/704.8/999.0 ms, so long stalls
remain. The 61,815.5-ms soak has zero median drift and +0.095072% whole-frontend
post-GC heap growth, not isolated presentation retention. Four external rows
remain NOT_MEASURED. Exact source, full reports, profiles, snapshot, environment
and original image are archived in `performance-compact-layout-slot-metadata/`.
The original Dense image is root-reviewed; array/index readability, matte
materials, route glow, aliasing and peripheral clipping remain OPEN.

The private ownership reduction and functional preservation are verified.
All retention budgets and these five Dense latency limits remain unresolved.
No budget/workload changes; whole-product A–G remains OPEN.
Default browser discovery stays 306 cases/86 files, with 262 current-classified
and 44 older cases still requiring disposition. Discovery is not exhaustive
passing acceptance.
