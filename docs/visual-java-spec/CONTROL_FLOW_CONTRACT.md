# Milestone 4 — Control flow, scope, and console

Extends the one trace → reducer → layout → SceneModel pipeline. Existing examples retain their semantics and anchors. No JVM or IDE platform work.

## Locked runtime contracts

- `ENTER_SCOPE` opens an explicitly named lexical block in the current frame. Parent must be the innermost active block of that frame, or null for its root. Lexical scope IDs can be reused after closure; invocation IDs remain distinct. `EXIT_SCOPE` requires innermost order, removes exactly that scope's locals, and closes their lifetime records. `EXIT_METHOD` closes all remaining scopes and their variables, including return unwinding; `RETURN_VALUE` still evaluates/transfers before the frame exits. No events execute after a return.
- `RuntimeSlot.scopeId` is optional for existing traces; Milestone 4 declarations and parameters always carry it and require an active owning scope. Parameters are declared after explicit root scope entry. Scope/lifetime histories live in RuntimeState; departed variables have no live geometry. `variableLifetimes` records each activation of a lexical slot with declaration source, last value/change, and exit event. Mutations and caller return destinations update its live record.
- `EVALUATE_CONDITION` records a two-operand concrete comparison (`<`, `>`, `<=`, `==`), observed named-slot values, verified result, expression and taken/skipped path labels. Conditions persist per frame as the latest evaluated fact. `LOOP_ITERATION` records a one-based iteration or the completed count when ended. Sequential iterations and termination derive from normalized events, not source/view guesses.
- `INPUT_READ` models Scanner.nextInt at an existing Scanner object and reference, verifies zero-based consumed input index, Java int text/value, and updates an already-declared destination. `OUTPUT_WRITE` records a concrete scalar, exact text, and optional observed source slot. Both append immutable `ConsoleEntry` facts; seeking/replay reconstruct the prefix. No console DOM state executes Java.
- Fixture `control`, source `src/demos/control/Main.java`, JSON `trace.json`, loader `loadControlTrace`: clamp three inputs -7, 42, 130 to 0, 42, 100, accumulate 142. Explicit if / else if / else each has a corrected local and block lifetime. Main's for scope owns i; each iteration body owns raw and score. No shadowing in this example.

## Shared projection and visual grammar

Lead owns reserved layout and SceneModel. `SceneFrameNode.scopes` contains active blocks with persistent slab anchors, label, depth and slot IDs. `SceneSlot.scopeId/scopeDepth` groups rows in both renderers. Reserved lexical rows and scope heading bands never compact or reshuffle during seek. Main/callee remain primary extruded stack geometry; active nested scopes add shallow inset stack-material slabs, using shared worldUnits.scope and existing semantic colors. A closed block and its variables disappear. Root scope need not add a slab because its method body is already the container.

Conditions and iteration facts share a calm status surface across Classic/Spatial. Source, current-event guidance, named observed operands, result, path, and iteration remain readable with reduced motion. Guidance controls emphasis, never existence/value truth. No extra Theater: both existing representations explain these facts directly.

Console is a generic read-only React surface receiving `ConsoleEntry[]`, active event and execution status, with no trace/demo coupling. The shell enables it by I/O event capability, preserving old examples' composition. Desktop console sits below source; runtime-focus/narrow layouts use a small expandable secondary surface. Lead controls shell/inspector integration and camera reservation.

Existing tokens, lighting, geometry, navigation, playback, selection and history remain canonical. Spatial scope rows keep real world ports, all camera commands remain centralized, deliberate user camera input cancels Follow while execution continues.

## Ownership

Runtime worker: state.ts, trace.ts, runtime/index.ts, control fixture/runtime tests. Classic worker: classic adapter/renderer/CSS/tests. Spatial worker: FrameSolid.tsx and focused primitive tests. Console worker: standalone ConsolePane and CSS/tests. Lead: all contracts, layout/scene model, App/styles/Inspector, navigation integration, captures, QA and commit. Workers must read AGENTS/specs/full-size references; no contract changes or commits without lead reconciliation.
