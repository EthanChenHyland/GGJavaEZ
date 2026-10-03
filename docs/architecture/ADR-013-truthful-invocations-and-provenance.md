# ADR-013 — True constructor entry and bytecode-derived provenance

Status: accepted for user-scoped v12 Phase 3. Base: d2dbedd. The user's Phase 3 scope supersedes the broader array/static/library phase numbering in `.kiro`; those coverage expansions remain deferred.

## Decision

Instrument constructor entry at the true beginning, with legal parameter loads and null receiver. Store a numeric recorder frame token in a fresh local. Instrument the actual initializing invokespecial, classified from the original receiver producer (`this`, not a nested NEW of the same class). After successful initialization emit receiver_ready and begin the catch range. Never pass uninitialized this/NEW receivers to recorder calls and never install the universal unwind handler across initialization.

Actual caller handlers receive the real throwable and reconcile outstanding pre-super frames by token, producing observed exceptional unwinds. Reconciliation without an observable throwable stops observation rather than inventing an unwind. Debug overflow bookkeeping remains bounded. Thus Derived→Base and Derived()→Derived(args)→Base have actual nested invocation identity, including failure before super and nested constructor arguments.

Before injecting probes, analyze original instructions with ASM SourceInterpreter. Recipes prove unique producers and remain bounded. Direct locals require a straight-line region without intervening writes/IINC; temporally ambiguous loads are unknown. Call probes preserve full descriptors, declared targets, receivers and arguments. Actual project entry links only an exact pending resolved target/descriptor. Call returns capture successful result and construction completion. JDK/library internals remain opaque; callbacks without an exact joined call have only an observed ancestor, not a fabricated direct caller.

The existing raw v1 envelope and semantic v2 schema gain additive fields/facts. This avoids breaking retained Phase 2 archives or replacing the incremental transport/history. RuntimeState receives an optional immutable ExecutionGraph whose transitions use the same plain/persistent reducer seam. No renderer derives semantics from fixture names, matching labels, equal-value searches or source proximity.

## Verifier evidence and limits

Installed runtime: OpenJDK 26. Focused verifier tests cover constructors, superclass/this chains, failure before initialization, nested same-class NEW arguments, synthetic pre-super stores, conditional super arguments, wide operands and stopped-probe operand restoration. Programs compiled with javac --release 17, 21 and 25 verify and execute on JDK 26. Actual JDK 17/21/25 runtimes are unavailable locally; this is class-file compatibility evidence, not a claim of testing those runtimes. Final gate totals are in [Phase 3 validation](../checkpoints/v12-p3/VALIDATION.md).

Pre-super synthetic outer-instance field recording remains outside this phase's coverage. Its bytecode continues to execute unchanged. Ambiguous merges, unsupported stack-copy producers, opaque library formatting and unsupported value types retain explicit unknown/unavailable provenance. Production caps, one JVM per Run, canonical Console, Focus/user camera rules and partial-prefix truth remain unchanged.

## Opaque pre-initialization callback boundary

An uninstrumented dependency can swallow a pre-super constructor failure and later re-enter project code before an observed caller handler runs. If a new entry has no exact matched call while the retained caller constructor is still uninitialized, that ancestor cannot be trusted. Observation stops as unsupported before emitting the ambiguous entry. Java and canonical Console continue. This intentionally also stops a legitimate opaque callback at that ambiguous boundary rather than asserting a false ancestor or inventing an unwind. Direct matched constructor chains and observed caller handlers remain supported.

Instance-field storage uses the resolved declaration owner, found from the original symbolic owner and exact name/descriptor without initializing user classes. The original instruction is unchanged. This avoids duplicate inherited fields and preserves field hiding. If metadata is unavailable, observation stops after the original operation succeeds, with no invented field identity or replacement of a real linkage error.
