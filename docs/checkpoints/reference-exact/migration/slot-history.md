# Projector slot-evidence retention — 2026-10-19

Presentation-only SlotHistory previously retained every assignment and every write ordinal even though its readers used only first-assignment order and whether any write preceded a Cursor. It now retains firstAssignment/firstWrite scalar ordinals. Exact observation sequences stay intact for changed-at evidence at arbitrary historical prefixes. No RuntimeState, reducer, ExecutionGraph, source binding, recorded value, canonical port, event schema or history cache changes.

A new100-run Property25 checks every forward/reverse prefix of randomized assignment order and rewrites, with known parameter identity, uninitialized locals, observation-only statics and later actual writes. Expected exact values/order come from accepted unit events. The projector knows the entire future recording, so future-write leakage fails. The property passes on both parent and optimized code. Focused projection/scope/static/row integration passes51/51 across8files,6.72seconds,exit0 (`unit-slot-history-before.log`, `unit-slot-history-confirmed.log`). No behavior oracle or tolerance changes.

Two serial runs use the unchanged `tests/perf/reference-world.test.mjs` seeded corpus and explicit-GC method. Both **fail** the25% retained-presentation ratio gate. Source/hash-bound details: `perf-slot-history-comparison.json`; complete reports/logs: `perf-slot-history-{before,after}/modern-world-performance.json` and `perf-slot-history-{before,after}.log`.

| Requested raw records | Before presentation bytes | After presentation bytes | Before projector bytes | After projector bytes | After presentation / semantic |
| --- | ---: | ---: | ---: | ---: | ---: |
|200|1,659,400|1,895,872|198,216|177,440|2.043 FAIL ≤0.25|
|5000|9,763,704|9,415,520|2,515,616|2,432,816|0.761 FAIL ≤0.25|
|20000|37,553,440|35,949,256|11,230,792|9,614,368|0.646 FAIL ≤0.25|

At20000 the projector index is1,616,424bytes smaller (14.4%), while complete retained presentation is1,604,184bytes smaller (4.3%). The smallest corpus's complete retained estimate increases despite its smaller projector index; no universal total-memory improvement or statistical confidence is claimed. Existing100-batch20k/1k update ratios are1.104before/1.069after, both within the unchanged2× limit. This is generated CPU/retention evidence; actual Dense latency/memory, GPU and final acceptance remain open.

The separate profiled Console diagnostic executes five fresh actual-JVM waits at each desktop/narrow viewport, with no source changes: all10 focus correctly and measure5.4–27.6ms through the same two-RAF boundary, without an overlapping long task. CPU profiles and `console-readiness-observations-{1440,760}.json` retain profiling overhead. They do not reproduce or waive the frozen113-case run's223.2ms failure. The original acceptance test and200ms budget remain unchanged.

Full defaults pass **2096/2166 with70 explicit opt-in skips**,223files (216passed/seven skipped),180.82seconds,exit0 (`unit-slot-history-full.log`). The one new property accounts for the increase from57809e1. Build/typecheck, strict browser TS, lint and protected/reference guards pass. Main entry71931gzip bytes; entry/shell closures72359/662758 diagnostics; Monaco/Cinematic stay split. No semantic/golden/performance source or timeout/budget changes.

Affected native checks pass **7/7**, zero skips,37.8seconds (`browser-slot-history-native.log`): existing million-line Console, both real-JVM Console/channel/stdin cases, both real paused-debugger/HISTORY cases and both retired-local replay cases. Original Console readiness measures22.5ms desktop/5.3ms narrow; source-bound copies are `slot-history-console-wait-{1440x900,760x900}.json`. This focused pass does not relabel the earlier frozen113-case failure or establish a new complete113-case gate.

Two separate actual-JVM comparable-state cases pass **2/2**,30.4seconds, with four native/1728 captures and no numerical layout misses. Their existing native-resize re-Focus step is moved from an absent contextual card button to the explicit registered Focus Selection command; the90-second limits, runtime checks and capture thresholds remain. Four archived originals in `focus-native-capture-context-confirmed-captures/` are hash-bound to their two session IDs and reviewed by the lead at original size against best.png. Review remains **OPEN** for Source/Inspector overlap, excessive wire glow, opaque fronts, weak reflected grounding and cramped/truncated row text. This is not the complete80-session96-capture matrix. The initial incorrectly anchored focused grep discovered zero tests and exited1; `browser-focus-native-capture-context.log` is retained, never counted as validation. The corrected inventory lists exactly2 before execution.

No whole-product milestone is approved. Remaining memory/latency, visual convergence, old-source/browser cleanup and final A–G gates remain open.


## Inline ordinal histories — 2026-10-22

Private slot observations and owner changes now keep an empty history as `undefined`, a singleton as a number, and repeated observations as the same ordered list. Every ordinal, including repeats, survives. The strict-before cursor rule, caught-exception clearing and complete public scene outputs are unchanged. RuntimeSlot timestamps are deliberately not substituted: a rejected diagnostic loses changed-at evidence in all 33 checked workloads. Only `src/world/sceneProjector.ts` changes production code; no existing test, schema, reducer, layout, camera or rendering owner changes.

Exact comparisons against 7c64b26 pass 32,794 complete scenes over 6,603 append batches, using one saved actual Dense JVM trace, 32 generated workloads and four curated fixtures. That corpus has no caught prefixes, so a separate finally/catch/continuation fixture checks 119 complete scenes, including five caught and ten cleared prefixes and captured parameters without slot timestamps. Inputs remain unchanged. These are saved/protocol comparisons, not fresh JVM executions.

Full defaults pass 2,155 cases with 70 existing opt-in skips (2,225 total), 233 files, 175.01 seconds. Typechecks, lint, build, reference integrity and protected-source checks pass. All 948 source hashes remain stable through validation/native capture; fingerprint `f8b804b5b0154672116c81ef98a359b29c78b78b2ca742301b423579a357f65b`. Build main-entry gzip is 71,761 bytes; entry/Shell static closures are 72,189 / 670,151 diagnostic bytes. AST inventory: 667 tracked modules, 2,324 literal edges, 259 production-reachable modules, no retirement targets, 35 nonliteral imports.

Native checks pass 21/21, zero skips/failures/flaky, 139.393 seconds. Eight distinct attached actual JVM IDs plus the verified recovery annotation identify nine known IDs; curated array cases are not actual JVM runs. Hero/Focus, historical bindings, collection/array picking, retired locals, scopes, provenance, Inspector and hardware Cinematic forensic evidence pass. All thirteen originals in `.ggjavaez/qa/reference-exact/ordinal-history-captures/` are hash-bound and root-reviewed against best.png. Small/cutoff text, dominant glow/crossings, matte fronts, flat Cinematic sides, dense grid, weak reflections and clipped context remain OPEN.

Two serial runs of the unchanged explicit-GC generated Node probe complete all stages, each 1/1 executed with zero skips, and both exit 1 at the unchanged 0.25 presentation/semantic budget. Digests and graph counts match. The after probe precedes only the final comment clarification; executable code is identical.

| Actual raw / normalized records | Projector before / after bytes | Presentation before / after bytes | After ratio | Budget result |
| --- | ---: | ---: | ---: | --- |
| 208 / 367 | 177,616 / 165,704 | 1,620,784 / 1,618,480 | 1.74399 | FAIL |
| 5,024 / 8,875 | 2,107,752 / 1,898,368 | 8,884,112 / 8,682,656 | 0.69754 | FAIL |
| 20,018 / 35,346 | 9,612,680 / 8,794,320 | 34,011,128 / 33,220,784 | 0.59554 | FAIL |

The largest pair observes 818,360 fewer projector bytes (8.5%) and 790,344 fewer complete presentation bytes (2.3%); these process deltas establish neither statistical confidence nor isolated allocation sizes. LINE scaling passes at 1.08694 against 2. Generated retention/scaling evidence does not replace actual Dense latency, WebGL/GPU or sustained rendering. Earlier Dense seek p50/Focus failures retain their own source boundary. Whole A–G acceptance remains OPEN. Raw reports, exact proofs, rejected diagnostic, source snapshot and checksums are retained in `.ggjavaez/qa/reference-exact/ordinal-history-evidence.json` and its referenced files.


## Canonical source-event ordinals — 2026-10-22

Owner source histories now retain accepted source-event ordinals rather than separate `{seq, source}` wrapper objects. The accepted append-only event catalog owns captured locations. The same strict-before lookup resolves the captured location at the selected cursor; no source is inferred from runtime slot timestamps. Only `src/world/sceneProjector.ts` changes production code. Existing tests, imports, runtime/backend contracts, layout, camera and rendering stay byte-identical.

Exact parent comparisons against ecf60be pass 32,794 complete scenes over 6,603 append batches on the saved actual Dense trace, 32 generated workloads and four curated fixtures. A separate catch/finally fixture passes 119 complete scenes (five caught, ten cleared prefixes), retaining evidence for captured parameters with missing slot timestamps. All inputs remain unchanged. The after-memory probe and parent comparison precede only the final explanatory comment; executable code is identical.

Full defaults pass 2,155 / 2,225 with 70 existing opt-in skips, 233 files, 176.47 seconds. Typechecks, lint, build, references and protected-source checks pass. All 948 source hashes remain stable during validation and native execution; fingerprint `3e2014b27626afe852d941a8fa9542c17f2e5672dce641179eefd3b10e3a4fea`. Build main-entry gzip: 71,761 bytes; entry/Shell closure diagnostics 72,189 / 670,116. AST: 667 tracked modules, 2,324 literal edges, 259 production-reachable, no retirement targets, 35 nonliteral imports.

Native 21/21, zero skips/failures/flaky, 139.227 seconds: eight attached actual JVM IDs plus the verified recovery execution identify nine known IDs. Curated array cases remain separately classified. Replay, array/collection picking, history, retired locals, scopes, provenance, source/Inspector and hardware Cinematic forensic checks pass. Thirteen originals are archived in `.ggjavaez/qa/reference-exact/source-ordinals-captures/`; the lead opens four (Hero, Focus, Cinematic forensic and narrow historical binding) against best.png. The other nine are archived but not root-approved. No intended visual change; existing glow, clipping, cutoff text, flat materials and weak reflection findings remain OPEN. This is not a full-matrix visual gate.

The unchanged serial explicit-GC generated Node probe completes all stages, 1/1 executed and zero skips before/after; both runs exit 1 at all three retained-memory failures. The before report is `perf-occupancy-before/` from the clean ecf60be source, before the separately rejected occupancy experiment. Digests/graph counts match.

| Actual raw / normalized records | Projector before / after bytes | Presentation before / after bytes | After ratio / 0.25 budget |
| --- | ---: | ---: | --- |
| 208 / 367 | 162,424 / 152,792 | 1,604,552 / 1,607,992 | 1.71785 FAIL |
| 5,024 / 8,875 | 1,902,256 / 1,663,064 | 8,674,976 / 8,393,440 | 0.67999 FAIL |
| 20,018 / 35,346 | 8,800,016 / 7,729,728 | 33,284,360 / 32,128,344 | 0.57550 FAIL |

Largest observed deltas are 1,070,288 fewer projector bytes (12.2%) and 1,156,016 fewer complete presentation bytes (3.5%). The smallest presentation delta increases. These process measurements do not establish statistical confidence or universal memory reduction. Single-event scaling passes at 1.09919 against 2 (before 1.01123). Actual Dense latency, sustained GPU and final retention/whole-product gates remain OPEN; older actual browser results retain their source boundaries.

A singleton spatial-bucket candidate is rejected and restored byte-for-byte to ecf60be. It matches 36,000 collision answers over 1,200 additions at three cell sizes and 6,603 complete immutable layouts, but shows no useful retention gain: largest layout delta increases 6,602,816 → 6,637,168 bytes and complete presentation 33,284,360 → 33,319,640. The rejected candidate/diff, comparison and decision remain ignored QA evidence; no optimization claim or production change is made from it.

Checksums and raw evidence are indexed by `.ggjavaez/qa/reference-exact/source-ordinals-evidence.json`. Whole A–G acceptance remains OPEN.
