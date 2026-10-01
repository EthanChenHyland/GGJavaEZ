# v12 Phase 1 — execution integrity

Base: `971ed26`, branch `kiro-runtime-audit`. Scope follows the user's Phase 1 request; later transport, constructor, storage, layout and IDE work is deferred.

## Changes

Recording and Java execution now have separate contracts. `RecordingStatus` carries state (`FULL`, `STOPPED_LIMIT`, `STOPPED_UNSUPPORTED`, `STOPPED_ERROR`), reason, triggering budget, last observed raw sequence and continued-execution flag. The additive v1 `capture_saturated` record reserves up to 1 KiB outside ordinary trace budgets. A bounded atomic sidecar carries recording status and actual input-wait state after recording ends.

The normalized schema-v2 `CAPTURE_STOP` closes observation, with reducer status `partial`. Active invocations, locals, references and source remain the last observed facts. No synthetic returns, unwinds or program end are emitted. Java's actual exit remains in ExecutionSession. Exit 0 is COMPLETED/PARTIAL; a nonzero exit is separately a runtime failure. Timeline copy identifies the last recorded event. Primary Console shows real process output after recording stops, independently of timeline scrubbing. Unified Run/Debug archives original pipe bytes in private local files while inline DTOs retain at most 32 MiB combined. Complete stdout/stderr downloads remain available beyond inline capacity; archive failures are explicit and never terminate Java.

Preparation fallback remains limited to failure before application child creation. A recorder stop never reruns Java. Explicit Stop still owns process termination. The active watchdog excludes actual stdin waits and Debug pauses; an independent ten-minute hard deadline applies in all states. If stopped observation loses input telemetry, active accounting is suspended without inventing a wait state; the hard deadline remains authoritative.

## Acceptance migration

See [CONTRACT.md](CONTRACT.md). Historical Phase 0 evidence is unchanged. Sources for all 14 acceptance programs are unchanged. Completion and long-idle input targets become required current facts; exact full graph/history assertions remain future targets, without lowering their thresholds or raising production limits.

## Validation

Final commands, totals, measured outputs and visual evidence are recorded after integration in VALIDATION.md and acceptance-results.json.

## Remaining scope

Full multithread worlds, constructor nesting, exact long/generalized arrays, weak identity implementation, incremental transport/reduction/history and generic layout/LOD remain deferred. Phase 1 does not claim large-world performance budgets or complete Java semantics. The observation prefix remains bounded by existing recorder limits.
