# Milestone 10 — Unified execution and product simplification

Baseline: clean `e7d3f56` (Milestones 1–9). [ADR 010](../../architecture/ADR-010-unified-execution.md) locks the single-session process, ordering and view-state contracts. This milestone changes the product flow without changing the normalized runtime reducer, persistent spatial anchors or semantic Three.js world geometry.

## What changed

- `Run` now builds and starts one instrumented real JVM. Its trace, stdout/stderr, consumed stdin, source location, timeline and 3D world project one `ExecutionSession`. `Debug` starts the same recording pipeline with cooperative controls and breakpoints. The bridge owns at most one active child, and starting a new session stops the old one.
- The session has explicit BUILDING, STARTING, RUNNING, WAITING_FOR_INPUT, PAUSED, COMPLETED, FAILED and STOPPED phases. Live recording retains every supported event while publishing bounded session snapshots to the browser. The browser normalizes a valid growing prefix; timeline presentation does not drive the JVM.
- LIVE follows the newest event. Scrub, step or replay enters HISTORY and holds its cursor while the JVM can continue. Return to Live rejoins the newest prefix. Console writes and consumed stdin probes normalize into that same ordered trace. Raw OS pipe output remains accessible separately with its cross-channel ordering limit disclosed.
- Unsupported instrumentation degrades to observed PARTIAL data, or a plain RUN_ONLY process if preparation fails before launch. A running program is never silently rerun. Compile failure leaves the editor and Problems visible, with no pretend runtime. A runtime exception remains in the same session and opens Error Explorer.
- The ordinary toolbar exposes Run and Debug, then contextual Stop or stepping controls. Visualize is no longer a competing primary action. Advanced Build, Save All and Run without visualization live under More. Healthy project/JDT status, empty Problems and unselected Inspector are quiet. Editor emphasis gives way to runtime emphasis when trace data arrives, unless the user has explicitly adjusted the layout. Focus remains a reversible view state.

## Browser and visual review

`capture-result.json` indexes a real Java Person run, stdin program, Debug pause and null failure. `screenshots/` contains **36 state-by-viewport captures**: Code idle, compiling, live Run, waiting for input, Debug paused, History, completed trace, failed execution with Error Explorer, and Runtime Focus at **1728×1117, 1440×900, 1280×800 and 760×900**. The compiling image uses an explicit BUILDING browser fixture because the real compile interval was too brief to reliably capture four sizes. The other execution states come from real JVM sessions. The History capture holds a prior frame at cursor 3 while its live Debug pause remains at cursor 4. Capture reported zero browser errors.

Reviewed the full-size reference images 06, 07 and 11 and the design-system, spatial-world, camera and polish specifications. At desktop sizes, stack and heap read as extruded cuboids with exposed side/top faces, cast shadows and a curved reference in actual X/Y/Z world space. Source highlighting, one timeline and console remain visible with the live world. Runtime Focus retains camera controls and a clear path back to source. The 760 px capture keeps console input usable and avoids a second persistent Inspector column. The material treatment remains more restrained than the glowing concepts; semantic blue stack, violet heap and cyan execution cues carry the hierarchy without decorative scenery.

Polish after the first review:

- Removed a fake empty runtime pane from idle/compiling and let the editor fill its space until trace data exists.
- Hid provisional “partial visualization” from the running status; support classification remains available when its evidence is settled.
- Repaired the narrow layout rule that hid Console input under a visible world, and reserved more useful Console height while live.
- Removed redundant Timeline/Reset/Theater controls when the current execution cannot use them; retained one shared timeline and an eligible view picker.
- Tightened the shallow live-world camera overview without moving any runtime anchor. Camera interaction continues to override guided motion.
- Waited for browser layout settling after viewport changes before capture so each screenshot reflects one stable shell and a rendered WebGL frame.

Some labels remain small in the 1280 and 760 px screenshots, particularly a single frame during a failure; selected entities and source/inspector context remain readable. The still captures clearly show real depth, and free orbit, pan and dolly are exercised during active recording.

## Performance sample

`performance.json` records one fresh 600-iteration local JVM run at 1440×900: **4,817 raw events in 2,386 ms** (about **2,014 events/s** observed), 121 session revisions but only **28 browser snapshots** (about 10 Hz during the busy interval), 23 timeline DOM updates, 15 Console DOM updates and 1,098 WebGL draw calls. The sampled browser had 256 animation frames with 16.7 ms median and 33.3 ms p95 frame gaps, a 100 ms maximum, and no page errors. This is a descriptive, single-machine browser sample, not a GPU presentation percentile or large-trace stress claim. Full event retention was checked against the terminal session.

## Validation

The test matrix covers one-process Run, stdout/stderr and stdin, live 3D updates, stopping, compile/runtime failures, Debug entry/breakpoint/step/continue, historical inspection without moving the paused JVM, Return to Live, explicit plain Run, and plain/Maven/Gradle/multi-package/multiple-main launches. Existing Person, recursion, arrays, control flow, source, camera, workspace, JDT/project and Error Explorer regressions remain in the same serial browser suite.

| Gate | Result |
| --- | --- |
| `npm test` | **521 passed**, 53 files |
| `npm run test:e2e -- --reporter=line` | **74 passed**, one browser worker |
| `npm run build` | Passed, including TypeScript; existing large-chunk/Troika import warnings |
| `npm run lint` | Passed |
| M10 capture | 36 screenshots, zero page errors |
| `git diff --check` and script syntax checks | Passed |

The default unit command now serializes test files because the real javac/recorder tests can exceed their deadlines when separate Vitest workers launch JVM compilation concurrently. The isolated prior timeout passed, and the final default command passed the full 521 tests.

## Delegation and integration

Focused agents handled the execution-manager/Debug backend, the embedded timeline and live/history projection, UX/backend audits, and migrations of the M8/M9/IDE/real-visualization/debugger browser regressions. The lead locked ADR 010 and the shared `ExecutionSession` contract, integrated routes and UI, reviewed agent diffs, ran all real JVM/browser workloads serially, captured and critiqued the visual matrix, fixed test and product issues, and completed the final validation gate.

## Known limits

- Raw process-pipe writes and recorder-wrapped output have no proven mutual total order; the historical Console uses only recorder-ordered writes, while the full process output is separately available.
- `FULL` requires a successful terminal capture. A live prefix is provisional; unsupported bytecode or unavailable capture may remain `PARTIAL` or `RUN_ONLY` with a reason.
- The streaming sample is bounded to a finite 4.8k-event trace. Very large traces may still incur growing full-snapshot transport and normalization cost; no broad throughput or GPU percentile claim is made.
- Existing JDT LS Java 26 and Gradle classpath advisory limits from Milestone 9 remain; this milestone does not change those providers.

## Reproduce

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5173/ide`. With the owned local dev server running and no other JVM/browser QA, `node scripts/capture-m10.mjs` and `node scripts/measure-m10.mjs` reproduce the visual and bounded performance artifacts.
