# ADR 007 — Visual debugger and error history

The lead owns these interfaces. Milestones 1–6's pipeline and identities remain canonical.

## Execution control

Use a cooperative JVM probe controller behind a Node `DebugManager`. The existing ASM transformer already visits project source lines after recorder method entry; a control checkpoint at those boundaries can block the **actual application thread** before the next project instruction, after flushing its canonical state. This avoids competing JDI object/invocation IDs and unsafe target method invocation while suspended. JDI was evaluated: native breakpoint/step facilities are appropriate for a future arbitrary-location debugger, but a stop before an injected recorder entry would require a separate snapshot/identity reconciliation path. M7 keeps one runtime model.

`DebugControl.java` owns a dedicated loopback control connection and daemon command reader. `Recorder.line` calls its checkpoint after emitting the line. Method entry also emits a line/checkpoint where no line probe follows (notably constructors). One command thread can request Continue, Pause, Into, Over, Out, update breakpoints, or Stop; it never reads program stdin. Pause is deferred to the next project checkpoint, including after a library call returns. Blocking native/library code cannot be immediately paused or stepped internally. Stop kills the owned process group. Stepping compares the captured project stack depth and thread ID; Into visits the next project line, Over the next same/shallower depth, Out the next shallower depth. Each accepted pause has actual thread/frame/source metadata.

Breakpoints use project-relative file IDs and exact executable source lines resolved from original class line tables. Nonexecutable lines remain visibly unverified; they never silently shift. Debug session metadata is control state, not a second variable model. Paused values come from the flushed recorder prefix → normalizer → RuntimeState. Unsupported values remain explicit capability limits. Multiple project threads remain unsupported for visualization; control metadata retains thread IDs.

## Shared changes / ownership

- `src/debugger/contracts.ts` fixes the bridge DTO and commands.
- Raw events add `console` (`channel`, `text`) and `finally` (`objectId`); schema stays raw v1 / normalized v2.
- `TraceEventBase.threadId` preserves actual recorder origin.
- `CONSOLE_WRITE` allows null frame for shutdown/output outside project code. Runtime console entries have optional channel; legacy entries remain valid.
- `FINALLY_ENTER` denotes execution of an actual compiler catch-all handler. Normal-path finally code is shown as its real source/line sequence, not inferred lexical blocks.
- Exceptions are emitted once per active propagation episode, before catch/unwind, with the deepest observed source. Catches close episodes; catch-all finally does not. Instrumentation-generated rethrows must not become fresh explicit throws.
- Live prefixes normalize without PROGRAM_END/ABORT; final prefixes use the existing terminal rules. Same session demoId prevents canvas remounts. Timeline position can stay historical while the JVM runs; explicit live-pause navigation is separate from scrub.
- Causality is a pure query over normalized trace events. It returns proven slot/field/array writes, parameter bindings, and return destinations only; chronological neighbors are never claimed as dependencies.
- Ordered console capture wraps System.out/err without calling user methods. App writes share the recorder sequence lock. Direct native/file-descriptor output and replaced streams remain separate terminal output without invented timing.

## Integration rules

Debugger worker owns `DebugControl.java`, `server/debug-manager.mjs`, backend tests and provider preparation exports. Exception worker owns Recorder/OfflineTransformer, raw event types, normalizer, reducer and validator plus focused tests. Causality worker owns `src/debugger/causality*` and examples. Performance worker owns shared label/font primitives and performance scripts. Lead owns IDE bridge routes/client, source gutter, controls, Error Explorer, App integration, scene exception cues, contracts, QA and final review. Workers must not invent shared schemas or alter semantics without reconciliation.
