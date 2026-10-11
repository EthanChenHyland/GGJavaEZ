# Console line virtualization — 2026-10-11

Lead direction: the Shell's `ConsoleOutput` adapts existing recorder-prefix,
run-event and process-pipe owners without changing execution or reduction.
Recorder and run-event ordering remains explicit. Pipe channels have separate
lists labelled "cross-channel order not recorded"; their relation to recorder
output is also unknown. Equal text does not prove duplicate ownership. Archive
links and cap/failure notices retain the actual ExecutionSession identity.

`ConsoleLineIndex` retains offsets into captured chunks. Adjacent stdout/stderr
writes join across chunk boundaries without adding characters. A channel switch
keeps its captured boundary; input submissions stay distinct. CRLF, blank lines,
Unicode and a final unterminated line remain exact. Growing pipe strings scan
only their suffix; reverse/replaced prefixes discard future offsets and chunks.
Only visible summaries allocate strings, with a 160-code-unit preview. Selecting
a row opens its full, copyable text in a separate wrapping/scrolling detail view.

`ConsoleLines` owns physical pages of at most 4,096 rows and three-row overscan
per side. The logical index is independent of browser scroll-height limits.
First, Last, numbered jump, page controls and keyboard boundary navigation keep
every row reachable. Actual ResizeObserver dimensions determine mounted rows.
Short lists shrink to their row count. Manual navigation stops live following;
Last explicitly resumes it. New output preserves a manually chosen scroll view.
The old workspace effect that always scrolled the whole Console is retired.

Validation distinguishes the isolated million-line production-component fixture
from real JVM cases. The fixture checks measured first/last presentation within
200 ms, offscreen row count, arbitrary index reachability, manual-scroll retention,
append/replacement, exact long text and stderr's orange/glyph. Real desktop and
narrow cases check process stdout/stderr, unchanged submitted text, recorder
ordering, visibly accessible pipe groups, zero-cursor rewind and exact restored
text. Unit tests cover offsets, boundaries, rewind, suffix scans and archive/order
ownership. Receipts live under `.ggjavaez/qa/reference-exact/`.

This increment does not claim all Runtime I/O acceptance criteria. Input-wait
focus timing/unknown knowledge, separate submission receipts for partial/zero-event
runs, closed-stdin feedback, retained-world Console association through a new
pending/failed attempt, every legacy browser selector, the independent
acceptance/performance suites and final A–G convergence still need validation or
implementation. The world I/O renderer and semantic goldens remain untouched.

## Retained Console association — 2026-10-11

Lead direction: `executionStore.worldExecution` is the process/archive metadata
owner of the committed World. It commits atomically with the accepted nonempty
visualization publication, receives only matching-session metadata, and retires
on World or project replacement. A pending/failed attempt cannot overwrite it.
No execution, normalizer, reducer or history contract changes.

`bindConsole` compares the actual recording, session and runtime-prefix identities
without parsing IDs. `BoundConsoleOutput` keeps previous-run recorded output and
its pipe/archive metadata together, and presents the current attempt in a separate
labelled section. New build diagnostics belong to that new attempt. A verified
build failure has no program output; it does not create empty process lists.
Current process input stays with the existing input owner. Curated recordings
cannot borrow workspace pipes, build messages or archives. A stale runtime prefix
contributes no rows until the matching prefix arrives.

Tests cover matching metadata, pending/building/starting/waiting/failed attempts,
wrong retained identities, stale prefixes, curated isolation, no-first-event runs,
and actual rendered archive links. The real failed-rebuild browser case verifies
both session IDs, zero-prefix/End/Home scrubbing, retained stdout and separate,
visibly reachable new-build diagnostics while keeping all earlier canvas/history
assertions. This narrows the retained Console gap; broader Prior_World/source
binding, input and final acceptance/performance/visual gates remain open.
