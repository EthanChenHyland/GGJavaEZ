# Phase 2 integration contract

Base `14e2a17`, branch `kiro-runtime-audit`. The user's Phase 2 scope supersedes the older combined phase numbering in `.kiro`. Preserve Phase 1 recording/exit/I/O/watchdog semantics and production limits. No semantic vocabulary, constructor, shell or spatial placement redesign.

## Transport v1

Live metadata carries `transportVersion: 1`, `rawEventCount`, existing process fields and an empty compatibility `rawEvents` array. Raw messages carry `{version:1, sessionId, fromSequence, toSequence, events, recording}`. Ranges are zero-based and end-exclusive; every contained raw `seq` must equal its position. The resume cursor is the next unapplied raw sequence, not a semantic cursor. SSE uses separate `session` and `raw` events. `GET /api/execution/:id/raw?from=<next>&limit=<n>` supplies bounded ordered pages. Existing explicit legacy snapshot readers remain compatible; ordinary live publication must not clone full history.

Duplicate batches are idempotent only if they match retained sequence facts. Gaps are rejected before any later event is applied and recovered from the range endpoint at the last accepted sequence. Session mismatch, conflicting duplicates or impossible ranges are errors. Reconnection resumes the accepted cursor. Metadata indicating terminal/stop status is finalized only after its advertised raw head has been consumed. A slow SSE client gets bounded buffering/disconnection and resumes from retained history; it never blocks or terminates Java.

Node `write(false)` means the bounded frame was accepted. Pause publication until `drain`; disconnect only if draining stalls for one second or the buffer ceiling would be exceeded. Otherwise metadata larger than the socket high-water mark could trigger endless metadata-only reconnects. A real loopback HTTP test covers 512 KiB metadata followed by raw delivery.

## Core APIs

`createReductionEngine(initial?)` in `runtime/engine.ts`: `.apply(event)` advances validated semantic truth; `.state` exposes an immutable RuntimeState. Keep ordinary `applyEvent(state,event)` pure as the equivalence oracle. Shared semantic implementation may accept an internal storage strategy, with reference behavior as default. No global mutable RuntimeState and no mutation of previous checkpoints.

`ExecutionHistory` in `runtime/history.ts`: `.append(events)`, `.length`, `.state` (latest), `.materialize(cursor)`, `.dispose()`. It is independent of React/Three. Shape and semantic validation happen once at append. Checkpoints share immutable structure; interval and retention policies are bounded and measured. `seek` delegates to append-aware history so all existing consumers benefit. Register a live normalizer's trace/history to avoid a second full replay on UI publication. Event objects remain immutable. LIVE and historical cursor are independent.

`TraceNormalizer(manifest,demoId?)`: `.append(raw)` returns new semantic events only; `.snapshot(terminal)` produces current trace/capability without rescanning old raw input; `.finish(terminal)` adds the terminal semantic tail once and returns current result. `.trace` has stable identity and append-only event storage. PROGRAM_START occurs once. Existing `normalizeTrace` remains a pure batch wrapper and preserves existing output. Efficient reducer storage may support normalization lookups; there must be no whole-prefix reduction. Precompute source line counts.

The lead owns execution contract additions, client delta acceptance and scheduling, IDE/App integration, archive migration, batching measurement and final QA. Core worker owns engine/history/state/seek/trace validation; normalizer worker owns normalize module and its tests; server worker owns server transport and focused server tests. Shared interface changes must be reconciled by the lead. No parallel JVM/build workloads; request the lead's serialized slot. No worker commits.

## Presentation convergence

The normalizer-owned trace remains stable and append-only. React consumes a distinct stable presentation trace with immutable persistent event-prefix roots, advanced only at publication. `attachHistoryPrefix` binds that prefix to the same longer validated history without reconstruction or disposal. `validateTrace` examines the prefix cursor state. Metadata/Console rerenders cannot reveal unpublished appends. Raw backlogs coalesce until the latest advertised head is consumed; every accepted fact remains in history. Root added and equivalence-tested this boundary during ACC14 QA after workers completed; it changes no runtime vocabulary or placement rule.
