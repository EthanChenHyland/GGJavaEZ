# Offline JVM trace capture

`server/instrumentation-provider.mjs` compiles the two Java helper sources with the configured `javac`, transforms every compiled project class with ASM, verifies transformed bytecode, then runs the transformed project on the configured `java` with `-Xverify:all`. The recorder writes UTF-8 NDJSON to a separate file. Normal program output remains on stdout/stderr. The provider returns raw events, a terminal status, bounded output, metrics and feature capability.

The four checked-in ASM 9.10.1 jars are pinned by SHA-256 in the provider and distributed under Apache License 2.0 (`lib/LICENSE-2.0.txt`). Artifacts were downloaded from `repo.maven.apache.org/maven2/org/ow2/asm/`.

The provider does not compile the user project. Its caller must compile with `-g:lines,vars,source` and pass the compiled classes directory plus the same configured JDK's `javaPath` and `javacPath`. It does not normalize or resolve source paths. The source manifest and trace normalizer belong to the bridge/normalizer integration.

Known capture bounds: only project class methods are transformed; JDK and library internals are opaque. Project objects are first observed after constructor initialization; `int[]` allocation is observed at `NEWARRAY` and successful indexed operations at `IALOAD`/`IASTORE`. Compound or library-provided arrays are first observed when referenced. Debug local metadata is required for named local stores. Bytecode branches are emitted without source-level loop labels. A handler is observed at entry and project frames unwind exceptionally; implicit exception throw sites cannot be claimed exactly. Non-int arrays, library references and nonfinite floating values are explicit unsupported values. Source-level array operand origins are unknown.
