# Remaining older browser cases — 2026-10-26

Default inventory at f262899 discovers 294 cases in 81 files. Of these, 202 belong to the current reference/camera/playback suite; that classification is not a passing whole-suite claim. The two original command receipt cases now pass in the separate 17-case integration gate. Seventy-four older cases remain for individual migration/disposition. Two new actual-JVM resize/refocus cases bring fresh discovery to 296 cases in 82 files (222 current-classified, 74 older); this is not an exhaustive passing result. Formal 80-case reference matrix and opt-in suites remain separate.

| Original file | Cases | Status |
| --- | ---: | --- |
| `commands-v12-p4.spec.ts` | 2 | [Migrated; both preserved cases pass](command-receipts.md) |
| `coverage-v12-p4.spec.ts` | 8 | [Migrated; exact fixture outputs with explicit presentation dispositions](coverage-browser.md) |
| `debugger-errors.spec.ts` | 11 | [Migrated; original JVM semantics and exact prefixes retained, 23-case integration passes](debugger-browser-successors.md) |
| `ide-recording-handoff.spec.ts` | 1 | [Migrated with requirement 1.21 Console disposition and prior-label fix](recording-handoff.md) |
| `ide.spec.ts` | 10 | [Migrated; original Java/backend checks, native Source Escape fix and full 20-case source integration pass](ide-browser-successors.md) |
| `incremental-v12.spec.ts` | 2 | [Migrated; unchanged workload and transport proof; wider Console latency failure retained](incremental-browser.md) |
| `m11-persistence.spec.ts` | 2 | [Migrated; original Java, history/replay and editing preserved](persistence-browser.md) |
| `observer-saturation-v12.spec.ts` | 2 | [Migrated; exact saturation/thread corpus and captured prefix retained](observer-browser.md) |
| `product-audit-m11_5.spec.ts` | 4 | OPEN |
| `provenance-v12.spec.ts` | 1 | [Migrated; exact constructor proof retained](provenance-browser.md) |
| `real-visualize.spec.ts` | 5 | [Migrated; five preserved cases and six original Java sources](arbitrary-java-browser-successors.md) |
| `recursion.spec.ts` | 4 | [Migrated; captured expressions restored, unchanged trace and 37-case integration pass](recursion-browser-successors.md) |
| `spatial-io-v12-p5.spec.ts` | 1 | [Migrated with its original curated recording and captured read/write evidence](io-labels-and-shell-workflows.md) |
| `spatial-shell-v12-p5.spec.ts` | 6 | [Migrated with the same managed files, actions and assertions](io-labels-and-shell-workflows.md) |
| `torture-details-v12-p5_5.spec.ts` | 4 | [Migrated with four matching retained JVM session IDs](torture-detail-successors.md) |
| `torture-lifecycle-v12-p5_5.spec.ts` | 5 | [Migrated; original JVM, JDT, large picker and repair workloads pass](lifecycle-browser-successors.md) |
| `torture-motion-v12-p5_5.spec.ts` | 1 | [Migrated; native opt-in capture and same-recording replay pass](motion-browser-successor.md) |
| `torture-v12-p5_5.spec.ts` | 9 | [Migrated; nine actual JVM fixtures pass at the five viewport sizes](torture-browser-successors.md) |
| `unified-m10.spec.ts` | 9 | [Migrated with nine passing cases and 12 distinct JVM sessions](unified-browser-successors.md) |
| `workspace-m8.spec.ts` | 5 | [Migrated to the current Source, Focus and Dock contracts](workspace-browser-successors.md) |

No original case is removed or marked skipped by this ledger. Saved discovery list and per-file counts are in the ignored QA evidence directory. Each later disposition must link its preserved assertions, exact source and actual executed result.


On source4b798b34, all ten original IDE cases pass in the 20-case source integration (zero skipped/failed/flaky). This reduces the remaining older disposition count from 74 to 64. The earlier 296-case discovery/classification remains historical; the same test population now has 232 current-classified and 64 remaining older cases, not a passing whole-browser result. [Explicit retired-surface replacements, failure archives and Source Escape fix](ide-browser-successors.md).

On source4c52141b, all eleven debugger cases pass in the 23-case integration (zero skipped/failed/flaky). This reduces the remaining older disposition count from 64 to 53. The historical 296-case population now has 243 current-classified and 53 remaining older cases; this is not a passing whole-browser result. [Explicit presentation replacements, rejected status experiment and final evidence](debugger-browser-successors.md).

Fresh default discovery on source44fd57fa lists 298 cases in 83 files after adding two current Error Explorer navigation cases. The historical classification is 245 current-classified/53 older still OPEN; neither classification nor the 39-case focused integration is a passing whole-browser result. [Independent source/frame/event actions](error-navigation.md).

On final driver source 7c9eaa1a, all four curated recursion cases pass inside the 37-case integration. This reduces the older remainder from 53 to 49. The historical 298-case population now has 249 current-classified/49 older cases; this is not a passing whole-browser result. The curated cases launch no JVM; the related integration attaches 29 distinct actual JVM IDs. [Original assertions, return metadata fix, timing failure and qualification boundaries](recursion-browser-successors.md).


## Complete unavailable-flow evidence cases — 2026-11-04

Two new actual-JVM desktop/narrow paging and prefix cases pass in the current 49-case focused gate. They add coverage rather than migrate an older case. Fresh default discovery is 300 cases/84 files: 251 current-classified and 49 older cases remain. Neither discovery nor classification is an exhaustive passing result. The previous 135-case parent gate retains its own source boundary. [Evidence and qualification](compact-unavailable-flows.md).


## Error Explorer prefix evidence — 2026-11-04

Four new actual-JVM prefix and history-return cases cover desktop and narrow widths. Fresh default discovery on source1e715790 lists 304 cases/85 files: 255 current-classified and 49 older cases remain. The complete source validation and final 25-case native integration pass. The changed future-Unwind locators in existing navigation/debugger successors preserve their original runtime, selection, camera, Focus and JVM assertions. Event-0 future-frame presentation is replaced by stronger empty-prefix assertions; the missing-current-frame guard remains separately covered. Discovery and classification do not imply exhaustive browser acceptance. [Evidence and source boundary](error-prefix-evidence.md).


## Arbitrary Java workflows — 2026-11-04

All five `real-visualize.spec.ts` cases pass on driver source `efaa1bb2` with the six original Java sources byte-equivalent and original execution assertions preserved. The older remainder drops 49→44; fresh discovery remains 304 cases/85 files, with 260 current-classified. This is a focused passing result, not exhaustive browser acceptance. The prior source's full units/build and 25-case gate retain their exact qualification boundary. [Retired-surface dispositions and evidence](arbitrary-java-browser-successors.md).

## Focus connection mask — 2026-11-04

Two new actual-JVM desktop/narrow Focus cases bring exact-source discovery to
306 cases/86 files: 262 current-classified and 44 older cases. They add coverage
without retiring an older case. Their exact-source preflight passes 2/2; the
first larger gate's failures, unchanged confirmations and fresh full rerun
remain separately qualified. Discovery is not exhaustive passing acceptance.
[Behavior, visual findings and source boundaries](focus-connection-mask.md).

## I/O and shell workflows — 2026-11-06

All seven original cases pass in the 12-case native gate on source `a3ab39c5`. The default inventory still discovers 320 cases in 87 files, with 283 classified against current surfaces and 37 still open in the table. [Exact results and retained assertions](io-labels-and-shell-workflows.md).


## Existing lifecycle workflows — 2026-11-06

All five original lifecycle cases pass on source `a0aa0467`. Default discovery stays at 320 cases in 87 files, with 288 classified against current surfaces and 32 open in the table. This is a focused browser result. [Preserved workloads, prerequisite and exact-source evidence](lifecycle-browser-successors.md).


## Existing Java history motion — 2026-11-06

The original opt-in motion case passes on source `0598422c`. Default discovery remains 320 cases in 87 files, with 289 classified against current surfaces and 31 still open in the table. The motion case retains its explicit opt-in. [Exact-source video and cursor evidence](motion-browser-successor.md).


## Existing Java torture browser workflows — 2026-11-12

All nine migrated cases pass on source `f7b30fab`. Default discovery remains 320 cases in 87 files, with 298 classified against current surfaces and 22 open in the table. [Execution evidence, captures and remaining visual findings](torture-browser-successors.md).

## Retained Java torture detail views — 2026-11-12

All four retained detail cases and four prerequisite runs pass on source `80e77e5e`. Default discovery remains 320 cases in 87 files, with 302 classified against current surfaces and 18 open in the table. [Preserved targets, source-qualified results and visual findings](torture-detail-successors.md).

## Unified execution workflows — 2026-11-13

All nine unified cases pass on source `2198f118`. Default discovery remains 323 cases in 88 files, with 314 classified against current surfaces and nine open in the table. [Source, earlier failures and session evidence](unified-browser-successors.md).

## Workspace workflows — 2026-11-13

All five workspace cases pass on source `1a704c41`. Default discovery remains 323 cases in 88 files, with 319 classified against current surfaces and four product-audit cases still open. [Source and fixture dispositions](workspace-browser-successors.md).
