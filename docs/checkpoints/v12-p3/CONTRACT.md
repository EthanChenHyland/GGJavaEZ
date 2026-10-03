# Phase 3 integration contract

Base d2dbedd, branch kiro-runtime-audit. Preserve all Phase 1 process/observer limits and Phase 2 incremental/history contracts. No shell or Spatial redesign. One serialized JVM/build QA slot, owned by the lead.

## Additive raw v1 facts

Retained raw v1 remains valid. New optional `origin` on consumers is a bytecode producer recipe. Recipes are `unknown`, `local {slot,liveRange?}`, `constant {value}`, `call_result {site}`, `field_read {site}`, `array_read {site}`, `new {site}`, or `computed {site,opcode,inputs: Origin[]}`. Recipes are derived conservatively from original ASM instruction analysis, never names/source lines. Ambiguous merges are unknown. Recipes are bounded in depth/size; unsupported producers degrade to unknown, never fail Java.

New facts:
- `call {callId,invokeKind,owner,name,callDescriptor,receiver:RawValue|null,arguments:RawValue[],argumentOrigins:Origin[],receiverOrigin:Origin}`. `frameId` is caller, original `site` is static identity. Constructors MUST NOT pass uninitialized receivers to probes; record null and bind later. Library operands may be unsupported summaries.
- `call_return {callId,value:RawValue}` after successful invoke, including project callees; `value` is null for void. Constructor result may be initialized receiver. Never probe uninitialized values.
- `enter` gains optional `callId`; actual class/method/descriptor identify runtime dispatch. Legacy callerFrameId retained. Constructor enter occurs before super with null receiver; parameters are legal before super. `receiver_ready {receiver:RawValue}` after actual initializing call.
- `field_read {objectId,owner,name,descriptor,value:RawValue}` after successful GETFIELD. Existing int array reads/writes receive origin as applicable.
- `constructed {objectId,className,newSite?}` optional explicit completion; constructor call_return carrying the initialized receiver proves that invocation completed; only explicit completed NEW marks the whole object constructed, because super/this calls can return earlier.
- `console` and `stdin_read` gain optional `callId` of actual in-flight call. `call_return` may carry `inputText` only when actual successful input-library consumption is observed. Read-ahead bytes alone NEVER prove a token was consumed.

Frame-token reconciliation handles pre-super failure without a verifier-invalid catch range. Preserve DebugControl metadata and user exception semantics. Probe errors stop observation only. New hooks follow existing budgets/transaction capture, never invoke user callbacks.

## Semantic graph

Lead owns raw TypeScript types, normalization, graph contracts/reducer/history integration. Semantic trace v2 adds `EXECUTION_FACT` carrying normalized graph facts; no rendering dependency. The graph is part of deterministic RuntimeState, uses the existing ReductionStorage (persistent maps/vectors on hot path; plain pure reducer oracle). Facts retain original JVM context and stable IDs. Value nodes are observed dynamic values, variable/field nodes name storage, object nodes retain actual identity, invocation nodes retain actual descriptor, call nodes retain declared method/site and dynamically resolved callee. Edges use IDs, event evidence and source identity, never entity copies. Indexed incoming/outgoing edges support queries without whole-history scans. CAPTURE_STOP records an observation boundary; open invocations are queryable as recorded-prefix-ended without fabricating return/unwind.

Confidence: `observed`, `bytecode-derived`, `unknown`. Correlations cannot produce generic flow arrows. Source-only/name/label matching is removed. Unknown consumption creates a distinct value, not a false transfer. Library formatting is represented by actual call and emitted text; no invented fine-grained origins.

## Ownership

Java worker: OfflineTransformer.java, Recorder.java, optional new Java producer analyzer and focused Java integration tests (no JVM until lead grants slot). Lead: TypeScript graph/contracts/normalizer and integration. Motion worker: semanticTransition.ts and related tests only; remove correlations and consume additive graph provenance after contracts arrive. QA worker: Phase 3 fixtures/tests and documentation only after interface lock. No worker commits/pushes. Every handoff lists paths, decisions, checks and limits.

## Convergence additions

Direct load edges retain optional originSlotId while from references an immutable dynamic value version. Calls retain per-argument and receiver origin slot IDs, so aliases cannot erase which operand was supplied. Graph direct callers require a matched actual call; unobserved library boundaries use observedAncestorInvocationId separately. Initial reflected fields use OBSERVE with no invented writer. Successful construction maps the original NEW site to its initialized identity. New reference RETURN_VALUE facts carry RuntimeValue; retained legacy recordings normalize unchanged. An observed unavailable graph return permits actual method exit without claiming a concrete scalar value.
