# Phase 1 server QA handoff

## Watchdog behavior when observation status is unavailable

`CaptureReader.inputStatusKnown` is internal bookkeeping, separate from the public `waitingForInput` boolean. A valid bounded sidecar establishes known input status. Missing, corrupt, or oversized sidecar data makes that status unknown; after recording stops, the server clears stale waiting state rather than inventing WAITING.

The active runtime watchdog counts time only while input status is known, or while recording remains FULL and legacy raw stdin controls can still report input waits. Debug pauses and known stdin waits exclude active time. When recording has stopped and input status is unknown, the active watchdog is suspended so observer telemetry failure alone cannot terminate a legitimate stdin wait. Stdin remains usable. The independent hard process safety deadline still applies in every state (default and maximum 10 minutes). Preparation has its own deadline.

## Serialized validation

Final command, run with the worker's exclusive JVM/build slot:

```sh
./node_modules/.bin/vitest run server/instrumentation-provider.test.mjs server/debug-manager.test.mjs tests/characterization/sessionBudgets.test.mjs --maxWorkers=1 --fileParallelism=false
```

Result: **3 files, 52 tests passed**, no failures or skips; 46.21 seconds. This includes real provider/debug/session workloads, long stdin waits, a long debug pause after saturation, saturation followed by stdin, second-thread continuation, and explicit Stop/reRun. Mocked checks cover malformed streams, status validation, unknown input status, hard deadlines, observer monitor rejection, preparation timing, and output retention.

Log: `/tmp/ggjavaez-p1-server-final-qa.log` (local temporary evidence). Earlier individually serialized suite logs: `/tmp/ggjavaez-p1-provider-qa.log`, `/tmp/ggjavaez-p1-debug-qa.log`, and `/tmp/ggjavaez-p1-session-qa.log`.

The mocked integrated archive test downloads all **33 MiB + 5 stdout bytes**, verifies the full SHA-256 including the ending `DONE\n` marker beyond the 32 MiB inline cap, and separately verifies stderr. It also checks archive descriptors are closed after process exit and the archive directory is removed by manager disposal. Actual nonzero process exit remains a crash regardless of recording saturation. Fixtures dispose managers for archive cleanup.

## Limits and integration ownership

Unified Run/Debug retains complete process output through the root-owned disk archive; its DTO remains bounded and reports `outputTruncated` for inline retention. The legacy finite instrumentation-provider result still retains at most 32 MiB and reports truncation; it drains output without killing the process. Full disk downloads and UI links belong to root integration.

This is focused server QA, not the root's complete unit, acceptance, build, or browser validation. Constructor and later semantic/streaming work remain outside Phase 1. No commits were made.

Root convergence added a stale FULL sidecar case: if atomic replacement fails, a valid old FULL snapshot cannot establish input state after saturation. The retained stop watermark/state/budget must match before sidecar input status is trusted. This adds one passing unit case beyond the worker's 52-test handoff; see final root validation.
