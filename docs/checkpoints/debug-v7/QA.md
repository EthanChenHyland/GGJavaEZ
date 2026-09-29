# Milestone 7 — debugger and Error Explorer

Milestone 7 extends the real JVM pipeline at `34111e4`. [ADR 007](../../architecture/ADR-007-visual-debugger.md) defines the cooperative control protocol and truth boundaries. Normal Run still uses uninstrumented classes. Visualize still records a finite trace. Debug runs the actual JVM, pauses its application thread at project source checkpoints, and appends the same recorder facts to the existing normalized trace, reducer, stable layout, and Classic/Spatial views.

## Acceptance review

- Source gutter breakpoints persist per project and file, show verified versus nonexecutable status, and can be changed while debugging. Entry, breakpoint, exception, and requested Pause states are actual stopped JVM states. Continue, Into, Over, Out, and Stop were exercised on a three-file project. Pause waits for the next project checkpoint; Stop reaps a process blocked away from one.
- Paused thread, source, call stack, locals, parameters, receiver, fields, nulls, and supported `int[]` cells come from the flushed recorder prefix. The selected timeline cursor may be historical while the JVM runs. “Show live pause” returns to its newest prefix. Scrubbing and source/selection navigation leave persistent runtime IDs and XYZ anchors in place.
- Error Explorer reconstructs the state at the observed throw before unwind, provides the actual class, safe message when available, exact source, stack at throw, values, JVM stderr, and clickable throw/unwind/catch/exceptional-cleanup history. Caught executions retain continuation. Classic and Spatial mark the same origin, unwound, caught, and cleanup frames on the shared runtime entities.
- Trace Cause is a pure normalized-trace query for recorded assignments, field/array writes, parameter/receiver bindings, allocation, and explicit return destinations. Prior writes are labeled value history; expression dependencies and unnamed destinations are never guessed. Clicking a cause seeks the timeline and source without moving a user-owned camera.
- Recorded `System.out`/`System.err` writes are sequenced with runtime events and replay only through the selected cursor. The full process streams remain separately available with their timing limitation stated. Normal Run, project editing, javac Problems, stdin/out/err, and prior Person/recursion/array/control scenes remain intact.

## Visual review and polish

The capture script `node scripts/capture-m7.mjs` records breakpoint and null-error views at **1440×900, 1728×1117, 1280×800, and 760×900**, plus nested pause, cause history, propagation, catch, exceptional cleanup, and expanded Classic/Spatial views. `capture.json` lists **21 screenshots and zero page errors**. The final images were reviewed at original resolution against references 06–11 and the design-system, spatial-world, camera/navigation, motion, and polish documents.

The runtime remains actual WebGL cuboids in XYZ with visible top/side faces, separated stack/heap depth, contact shadows, and physical references. Exception cues accent those same frames rather than adding decorative scenery. Classic shows the matching state on its existing frame diagram. The embedded IDE necessarily has a small canvas on a 760-pixel viewport; Expand Runtime gives the geometry a readable inspection surface without changing cursor or anchors.

Changes made during the polish pass:

1. Prewarmed both exact Drei font cache keys through one bounded promise. Fresh immediate first-object samples fell from **417/815 ms to 92/36 ms**; a stack-settled sample went **49→34 ms**. The metric ends at synchronized Fiber text render, not physical display, and is a bounded sample rather than a percentile. [PERFORMANCE.md](PERFORMANCE.md) contains the ablation and raw evidence.
2. Applied viewport-projected label density to deep stack frames. Compact overviews retain method identity and hit geometry; Focus restores native row text. The before/after world matrices and geometry bounds match exactly.
3. Kept the current source line in view when Monaco relayouts into the narrow stacked IDE. The paused breakpoint and null failure lines remain visible at 760×900.
4. Fitted a shallow live debugger world to its reserved bounds while preserving the exact curated Person Home camera. This changes camera framing only; entity positions, sizes, and ports are untouched.
5. Removed the duplicate floating Inspector while Error Explorer is open; picking still highlights real geometry. Separated recorded console output classes from the full terminal stream, so the two timing contracts are visually and programmatically distinct.

## Validation

- Production build, TypeScript typecheck, ESLint, and `git diff --check` passed. **437 unit/integration tests in 41 files** and **55 browser tests** passed. The Vite build retains large-bundle and ineffective dynamic-import advisories; neither blocks the local app or trace behavior.
- Real JVM integration covers source checkpoint verification, multifile stepping, cooperative Pause and process-group Stop, exception pause before unwind, control authentication, unsupported multiple threads, recorder limits, exception lifecycle, source mapping, custom exception message safety, console sequence, and stable replay.
- Browser workflows cover debugger gutter/control/inspection, null/bounds/divide/explicit/caught/finally/nested failures, Trace Cause, ordered console, and all 44 prior browser workflows. Earlier free-exploration and reverse-scrub tests continue to check camera ownership and stable runtime layout.

## Support and security limits

- This is project-source cooperative stepping. Native/library internals, blocked calls, and locations without safe compiled line checkpoints cannot be paused or stepped at an arbitrary bytecode location. A requested Pause takes effect at the next checkpoint. Compiler line tables determine executable breakpoint verification; no silent line relocation occurs.
- One project application thread is supported for visualization; raw thread IDs are retained, and a second project thread stops capture as unsupported. JDK/library objects, standard String internals, non-`int[]` arrays, some parameters (including `String[] args`), arbitrary object graphs, and expression evaluation are not invented. The Inspector exposes only observed slots. No arbitrary Java watch evaluation is run.
- Catch-all handler entry proves exceptional cleanup, not that the source lexically declared `finally`. Custom `getMessage()` overrides are not invoked during recording; their message may be unavailable. Complex suppressed/rethrown exception cases beyond the recorded propagation episode are not inferred.
- Direct native/file-descriptor output and replaced system streams have no proven recorder-clock position; only wrapped `System.out`/`System.err` writes are sequenced. Full process stdout/stderr is shown separately.
- User Java executes with the current OS account’s permissions. Capture limits and the loopback control token are not a sandbox; code running in the same JVM can read its own process properties. This tool is for trusted local projects. Large Three/Monaco bundles retain the production chunk advisory.

Launch from the repository root with `npm run dev`, then open `http://127.0.0.1:5173/ide`.
