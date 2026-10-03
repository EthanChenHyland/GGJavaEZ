# Offline JVM trace capture

`server/instrumentation-provider.mjs` compiles the Java helper sources with the configured `javac`, transforms every compiled project class with ASM, verifies transformed bytecode, then runs the transformed project on the configured `java` with `-Xverify:all`. The recorder writes UTF-8 NDJSON to a separate file. Normal program output remains on stdout/stderr. The provider returns raw events, a terminal status, bounded output, metrics and feature capability.

The four checked-in ASM 9.10.1 jars are pinned by SHA-256 in the provider and distributed under the BSD 3-Clause License (`lib/LICENSE-BSD-3-Clause.txt`). Artifacts were downloaded from `repo.maven.apache.org/maven2/org/ow2/asm/`.

The provider does not compile the user project. Its caller must compile with `-g:lines,vars,source` and pass the compiled classes directory plus the same configured JDK's `javaPath` and `javacPath`. It does not normalize or resolve source paths. The source manifest and trace normalizer belong to the bridge/normalizer integration.

Known capture bounds: only project class methods are transformed; JDK and library internals are opaque. Project objects are first observed after constructor initialization; `int[]` allocation is observed at `NEWARRAY` and successful indexed operations at `IALOAD`/`IASTORE`. Compound or library-provided arrays are first observed when referenced. Debug local metadata is required for named local stores. Bytecode branches are emitted without source-level loop labels. Throw origins retain the deepest observed project instruction; library/native internal origins remain unknown. Non-int arrays, library references and nonfinite floating values are explicit unsupported values. Original-bytecode producer recipes now prove supported int-array operands; ambiguous source expressions remain unknown.

Exception message inspection invokes `getMessage` only when its declaring class belongs to the bootstrap JDK class loader. Project or third-party overrides are never invoked by the recorder; their trace message is `null` (unavailable). The JVM's own uncaught-exception reporting can independently invoke user exception methods. A caught exception does not require that reporting.

Raw `finally` / normalized `FINALLY_ENTER` is a retained protocol name for entry into an actual catch-all exceptional cleanup handler. A null bytecode catch type does **not** prove a source-level `finally`: javac also emits such handlers for `synchronized` monitor release. The normalized label therefore says "Exceptional cleanup handler entered". Normal-path finally code remains ordinary observed source-line execution. No lexical classification is guessed from nearby lines or an opcode pattern.

## Phase 3 provenance

New captures retain raw v1 with provenanceVersion 1 and additive call/call_return, receiver_ready, field_read and constructed facts. Consumer origins describe original bytecode producers; names/lines do not prove flow. Constructor enter now occurs before super with null receiver; receiver_ready binds initialized this afterward. Exact descriptors and resolved dispatch preserve actual call relationships. Successful Scanner matches record consumption separately from read-ahead bytes. Calls skip argument packaging after recording stops.

See [ADR-013](../docs/architecture/ADR-013-truthful-invocations-and-provenance.md), the [integration contract](../docs/checkpoints/v12-p3/CONTRACT.md) and [graph architecture](../docs/checkpoints/v12-p3/ARCHITECTURE.md). The configured JVM remains the only application process, and all earlier observer budgets/process safety rules remain in effect.
