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
