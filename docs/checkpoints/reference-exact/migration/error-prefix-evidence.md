# Error Explorer applied-prefix evidence

The parent is `369ec63`. Error Explorer previously chose its failure from a
completed-recording reconstruction. Event 0 therefore exposed future exception
class/message, stack values, path and crash status. Preparing the throw snapshot
could also read a paired Graph fact beyond the applied raw-throw prefix.

The implementation uses the existing recording-qualified RuntimeState for
exception evidence. A throw snapshot is clamped to the current prefix. The
observed path includes only applied Events; accepted future lifecycle Events
remain separate, clearly labelled navigation targets that are not applied.
Both lists are bounded by the selected throw witness and the next throw of the
same Throwable, so catch/rethrow episodes retain stable identity without merging.
Raw normalization, RuntimeState, ExecutionGraph, history and canonical exception
navigation semantics are unchanged.

Captured class names, input Event IDs, empty messages and unavailable-or-null
messages remain distinguishable. Captured path count, unknown bounds, absent
stack/cause-chain facts and recording status are explicit. Full-process stderr
stays separately labelled; it is never substituted for Graph-proven evidence.
Missing throw evidence disables only the throw seek, with a reason. Missing
frame/source actions retain independent guards. Reading evidence or revealing
source does not seek, change Selection, Focus or camera pose.

Explicit value-history navigation creates a recording-qualified return bookmark.
Before the inspected throw, its history queries the current prefix and reveals
no future exception metadata. Plain timeline scrubbing creates no bookmark.
When an earlier caught exception remains visible, the active Cause column keeps
an independent Return to inspected failure action; the earlier episode retains
its ordinary Return to failure. Repeated history clicks preserve the explicit
bookmark. No new CSS or alternate visual system is introduced.

The existing debugger and error-navigation future-Unwind locators move to the
separate recorded-navigation section. Their exact runtime, Cursor, Selection,
Focus, camera and JVM assertions remain. The old Event-0 future-stack guard
becomes stronger empty-prefix assertions; a separate unit retains the disabled
missing-current-frame guard. Original Java fixtures, deadlines and retries stay
unchanged.

Final source `1e715790` qualifies 976 product/test inputs, with five changed
product/test files relative to the parent. All eight validation checks pass:
typecheck, browser types, lint, build, default units, build metrics, reference
safety and protected boundaries. Default tests: **2,232 passed, 70 explicit
opt-in skips, 2,302 total / 240 files, 292.27 seconds**. Skipped JVM suites are
not counted as passing. Twelve new units cover prefix direction, raw/paired
facts, episode identity, immutability, availability guards and actual hook
lifetime including two-exception history return.

Entry static JS gzip is 72,164 bytes; Shell static closure is 674,859 bytes.
AST inventory: 694 modules, 2,446 literal edges, 265 production-reachable modules,
41 nonliteral sites and zero obsolete targets. Default browser discovery lists
304 cases across 85 files; 255 are current-classified and 49 older cases remain.
Discovery/classification is not an exhaustive browser passing result.

The final integrated browser gate passes **25/25**, zero failures/skips/flaky,
in **242.972 seconds**, with 23 distinct standard attached actual JVM session
IDs across 23 cases. IDs are attachment-qualified, not a count of OS processes
or all possible sessions. The archive preserves 32 originals, six root-reviewed
at full size and 26 unreviewed. It includes four new
actual-JVM prefix/bookmark cases, both independent action cases, all eleven
debugger workflows, five exception-reference viewports, two historical-reference
cases and forensic recovery. No older performance execution is relabelled as a
fresh measurement of this source.

Regression and intermediate evidence remains separate:

- `error-prefix/red/`: unchanged-parent five-unit RED and one actual-JVM desktop
  RED at Event 0, with exact source, capture, report and trace. The other viewport
  was not selected for that RED execution.
- `error-prefix/first-preflight-navigation-failures/`: 10 passes / five failures
  identifying a narrow driver section and existing navigation/history workflows.
- `error-prefix/rethrow-red/`: same-Throwable episode regression before its fix.
- `error-prefix-preflight-captures/`: intermediate source `44bf0591` passes 15/15,
  zero skips/failures/flaky, 148.181 seconds, 15 distinct attached actual JVM IDs,
  19 originals (three reviewed). `error-prefix/review-parent/` preserves its full
  2,231-pass/70-skip validation and adjacent 8/8 gate (88.275 seconds, six JVM IDs,
  11 captures). Independent review subsequently found the two-episode bookmark
  defect despite those passing gates.
- `error-prefix/two-episode-red/`: 11 passes / one RED for that review finding.
- `error-prefix/narrow-bookmark-review/`: intentionally interrupted default suite
  (exit 130) before moving the bookmark into the active narrow Cause column.
- `error-prefix/bookmark-driver-*-failures/`: three separate failed new-driver
  attempts, each with both traces. Corrections use the actual DECLARE_LOCAL
  binding, numeric QA cursor, separate process-output scope and exact ordered
  class/message paragraphs. Product code did not change for those corrections.
- `error-prefix/bookmark-confirmed-source6195/`: both new JVM cases pass in
  16.403 seconds; the subsequent browser typecheck found a driver union-narrowing
  error, so no full default suite was launched. Final source fixes that type and
  strengthens capture containment using native hover of the real return action.

This closes the targeted prefix/history defects. Whole A–G remains OPEN: visual/reference convergence, memory and
latency budgets, array/port behavior, older-browser migrations and final
exhaustive acceptance still require work.
