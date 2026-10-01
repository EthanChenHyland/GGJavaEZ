# Phase 1 observer saturation contract

User-authorized scope supersedes tasks P1's older combined transport plan. Default budgets stay 20,000 raw events, 8 MiB, 256 identities, 128 live frames. Delta streaming, weak identities, constructor semantics and expanded values remain deferred.

- `RecordingStatus`: FULL, STOPPED_LIMIT, STOPPED_UNSUPPORTED, STOPPED_ERROR; reason, triggering budget (or null), last successfully written semantic raw sequence (or null), executionContinued.
- Recorder writes exactly one v1 `capture_saturated` control record with `recording`. This reserved record is outside the semantic event/byte budgets (at most 1 KiB). Its sequence is contiguous. No semantic events follow it.
- A bounded, atomically replaced `<trace>.status.json` sidecar holds `{v:1, recording, waitingForInput:boolean}`. It updates at saturation and actual stdin read boundaries, including after saturation. It is independent of the semantic trace and cannot grow into an event queue. Recorder errors must not throw into application probes.
- Second application thread stops recording before any of its semantic probes are written. Retained old mixed-thread captures preserve only the first thread prefix and report STOPPED_UNSUPPORTED; they never fabricate a single-thread continuation.
- Debug checkpoints remain operational after saturation with bounded control bookkeeping and a frozen raw watermark. They do not claim to add visual facts. Explicit Stop remains authoritative.
- Server separates actual exit (`complete` / `program_crashed`) from observer state. Exit 0 + stopped recorder becomes COMPLETED/PARTIAL with a visible reason. No plain-run restart after child launch.
- Normalization emits additive schema-v2 `CAPTURE_STOP` instead of PROGRAM_END/PROGRAM_ABORT for an otherwise valid stopped recording. Reducer status `partial` retains active frames and last observed values; no synthetic unwinds, returns or final state. Genuine process failure stays separately visible in ExecutionSession.
- Timeline terminal copy distinguishes last recorded event from Java completion. Full process console remains independent of recorder console ordering.
- Active watchdog excludes actual input waits and debugger pauses. After stopped observation, missing, corrupt or stale FULL sidecars leave input state unknown; the active watchdog is suspended while the independent hard deadline remains authoritative. Preparation deadlines are separate. A hard process safety deadline remains applicable and explicit; Stop works in all states.

Write ownership: root contracts, ExecutionManager, IDE wiring, acceptance migration, QA/report; Java worker Recorder/DebugControl + recorder characterization; server worker DebugManager/instrumentation-provider + session characterization; client worker normalizer/reducer/validation/Timeline + targeted tests. All JVM workloads serialized by lead.

## Acceptance migration rationale

Phase 0's immutable PHASE0.md and Git commit971ed26 retain all previous exit86 evidence. CURRENT killedAtIdentityBudget/killedAtEventBudget assertions become stronger `partialRecording` assertions: actual Java success plus explicit budget, continued execution, and valid CAPTURE_STOP state. PROGRAM_ABORT assertions become CAPTURE_STOP assertions. Program sources and their output expectations are unchanged. `completes` and the 60-second REPL idle fact are promoted. Full graph (3,000 members/12,000 follows) remains exactly asserted, now a P5 target; 200,000-event/5,000-invocation history remains exactly asserted, now a P2 target. This follows the user's explicit bounded-prefix scope and prohibition on raising limits or starting delta transport. Exact long serialization remains an expected failure, outside the Phase 1 user scope despite its older P1 label. Constructor expected-fail targets remain untouched.

## Process output archive

Normal Run/Debug retains complete pipe bytes in private temporary stdout/stderr files, independent of semantic budgets. Inline DTO memory stays bounded at 32 MiB combined. Downloads use a local channel-whitelisted endpoint, without exposing filesystem paths. No queued output or delta trace protocol is introduced. Archives close descriptors on exit and delete files at 32-session eviction or graceful bridge disposal. Disk failure is explicit and never kills Java. Legacy finite helper returns bounded inline output with a truncation flag.
