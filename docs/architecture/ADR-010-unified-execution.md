# ADR 010 — One execution, two lenses

Status: locked by lead for Milestone 10. Extends ADR 006/007/009 and the existing normalized trace → reducer → persistent spatial layout → SceneModel pipeline.

## Canonical process and data contract

`ExecutionSession` in `src/execution/contracts.ts` is the sole user-facing execution record. The bridge owns at most one active Java child. `Run` builds once and starts one instrumented JVM when preparation succeeds; `Debug` uses the same prepared recorder plus cooperative source control. If instrumentation preparation fails, ordinary Run starts one plain JVM and records `RUN_ONLY` with the reason. An advanced Run without visualization also selects the plain runner. A build failure creates a failed session with compiler Problems and no JVM or runtime world. An already-started program must never be rerun as a hidden fallback after an execution/capture failure.

Phases: `IDLE → BUILDING → STARTING → RUNNING ↔ WAITING_FOR_INPUT → COMPLETED | FAILED | STOPPED`; Debug may transition `RUNNING ↔ PAUSED`. A terminal session retains its finite trace, output, failure and exit status. `kind` names the control capability, not a second UI execution universe. `support` is `FULL`, `PARTIAL` or `RUN_ONLY`, determined only from observed coverage. `FULL` is awarded only after a successful terminal capture; a live prefix remains provisional. A program that exits with code zero despite a capture failure completes with `RUN_ONLY` or the verified partial prefix, without a hidden second execution. Unsupported values, source facts and cross-channel order are never fabricated.

The raw recorder's monotonic `seq` is authoritative for recorder probes and wrapped `System.out`/`System.err` writes. Those writes normalize to `CONSOLE_WRITE` at the same timeline cursor. A wrapper around the actual `System.in` read emits `stdin_wait` before blocking and `stdin_read` after the JVM receives bytes. Only the latter normalizes to rewindable `CONSOLE_INPUT`; submitted bytes are never presented as consumed before that probe. OS stdout/stderr pipes are retained as full process output with **unknown** placement relative to probes; direct file-descriptor/native writes and replaced streams are also unknown. No sorting by wall-clock arrival claims stronger causality.

The server streams revisioned session snapshots through SSE, throttled to about 10 Hz outside phase transitions, and retains every supported event within existing recorder bounds. Session IDs stay fixed through the process lifetime. Normalization rebuilds a valid live prefix; stable frame/object IDs remain from the recorder. Spatial anchors are keyed by those identities and do not move when a live prefix grows or the user scrubs.

## Timeline and interface contract

The JVM is never controlled by timeline navigation. `LIVE` follows the newest normalized event prefix; `HISTORY` holds an explicit cursor while new facts may continue arriving. Stepping, scrubbing and replay enter HISTORY; Return to Live sets the cursor to the newest prefix. Debug Continue/Into/Over/Out control the JVM and remain distinct from timeline playback. Source, inspector, Classic/Spatial/Theater, Console and Error Explorer project the *same* selected prefix. Wrapped console output rewinds with that prefix; raw process output is a separate disclosed stream.

The primary shell shows Run and Debug when idle; Stop or contextual Debug stepping while active. Build keeps editor emphasis; first trace event may move to runtime emphasis once, unless the user has explicitly resized/revealed a pane. Focus is a reversible view state. Only Spatial/Classic/eligible Theater are representation choices. Healthy build/LSP details and empty Problems remain quiet; failures surface exactly where actionable. Runtime solids, world anchors, semantic materials and camera ownership remain unchanged.

## Compatibility

Keep the prior `/run`, `/visualize`, `/debug` paths and curated fixtures for regression/diagnostics during migration. The new `/execution` path is the primary user flow. Plain runner remains available for unsupported configurations and troubleshooting. No separate reducer, spatial engine or Java project model is introduced.
