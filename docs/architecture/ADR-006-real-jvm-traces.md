# ADR 006 — Recorded JVM traces for editable Java

Status: accepted for Milestone 6 (2026-09-28). The lead owns changes to this decision and the shared contracts.

## Decision

Visualize compiles the saved project with full debug metadata, instruments only its compiled classes with pinned external ASM 9.10.1 in a **separate offline transform stage**, runs the transformed code in the configured real JDK, records a bounded finite stream of observed JVM events, and normalizes those events into the existing runtime pipeline. The transform writes a separate class directory and must fail the Visualize request if any project class cannot be transformed or verified. Normal Run keeps its uninstrumented compile/execute path. The provider interface and raw event contract are independent of the offline packaging so a startup agent or JDI companion can be added later.

The provider boundary owns `InstrumentedRunRequest`, `InstrumentedRunResult`, versioned `RawRuntimeEvent`, and `VisualizationCapabilityReport`. A separate `TraceNormalizer` maps only supported observed events to versioned `TraceDocument` events. React, the reducer, and the scene model know neither ASM nor JVM agent internals. An observation has provenance (`observed` or documented deterministic `derived`), thread, invocation, class/method descriptor, bytecode site, source file/line, and stable object identity where applicable. Ambiguous or incomplete critical capture produces a partial/unsupported report, never a silently complete trace. The envelope distinguishes completed, crashed, instrument-failed and trace-limit outcomes; the latter three do not get a success end marker.

Object and array IDs come from reference identity in one instrumented run; invocation IDs are newly assigned on every entry, including recursion. Slot identity combines invocation and debug local slot/lifetime, while fields combine object identity and declaring class/name. Presentation labels and display numbers are separate. Capture is initially limited to a single application thread, project classes and supported values. JDK/library internals are outside the traced world and must be reported as such.

## Alternatives considered

| Mechanism | Useful here | Why it is not the sole M6 recorder |
| --- | --- | --- |
| JDI | Method entry/exit, line steps, `this`, visible locals, field watchpoints, exceptions, future breakpoints/live debugging. Object mirrors have `uniqueID`. | No indexed array read/write or general allocation event request; line snapshots can miss intermediate mutations. Per-line VM suspension and mirror reads are costly. |
| `java.lang.instrument` startup agent plus ASM | Standard startup agent lifecycle and lazy class transformation. | Transformer failures can leave a class uninstrumented; project classes are already compiled and enumerable, so offline transformation offers a clearer fail-closed gate and deterministic coverage report. |
| Public JDK Class-File API | Stable public transform API in JDK 24+, no extra dependency. | Imposes JDK 24+ on the instrumentation build/runtime; the current toolchain is 26, but the IDE should retain room for earlier supported JDKs. |
| `jdk.internal` ASM | Bundled with a JDK. | Encapsulated, export flags and internal version are unsuitable as a product contract. |
| External ASM bytecode transformation | Captures exact store, field, array, call/return, branch and handler bytecodes with modest dependency size; ASM 9.10.1 lists support beyond Java 26. | Debug metadata remains optional/coarse; source-level lexical intent is not directly in bytecode. Needs verifier, exception and instrumentation failure tests. |
| JDI + bytecode hybrid immediately | Can add precise debugger state and exception location to bytecode events. | Two concurrent event clocks/identity systems complicate deterministic finite recording. Keep JDI as a later companion behind the same provider boundary for breakpoints and live stepping. |

## Truth and scope rules

- Compile Visualize with `-g:lines,vars,source`; source file mapping is based on compiled class/package metadata plus a manifest of actual project-relative paths and source content hashes. Ambiguous matches are reported rather than guessed. Operation ordering is bytecode ordering; multiple operations can share one source line.
- Constructor `this` is safe to inspect after the mandatory initialization call. If the first observable allocation is at this point, state that timing in the capability report. An object already observed must retain its ID on every subsequent reference and field event.
- Raw indexed reads and writes are observed at their actual bytecode instructions, after successful completion. A JVM `xastore` does not reveal the Java source expression supplying its value; unknown origins are recorded as unknown. No synthetic swap or comparison is inferred merely from adjacent values.
- Branch outcomes can be observed at conditional bytecodes. Mapping them to Java `if`/`for`/`while` labels or lexical blocks needs explicit deterministic analysis and provenance. If unavailable, expose the lower-level branch and mark source-level control semantics partial.
- Exceptions retain the last valid state, observed throw/handler/unwind data and raw JVM failure. Implicit exceptions and catches need explicit coverage tests before claiming exact throw/catch events.
- Apply hard event/byte caps and process deadlines. If exceeded, stop the JVM and retain a diagnostic/partial trace; never present the result as a complete execution. Normal Run remains available when visualization is unsupported.
- Curated schema-v1 fixtures remain unchanged. Real schema-v2 extensions should relax assumptions that only held for authored fixtures, especially named return destinations and known array-write origins, without weakening v1 validation.

## Acceptance evidence required

Real editable Person, factorial recursion, int-array bubble sort and control flow fixtures; two objects of one class; multi-file source navigation; exception preservation; stable replay; unsupported/trace-cap paths; normal Run and all curated regressions. The integration must pass build, typecheck, lint, unit/integration/browser suites, representative screenshot review at 1440×900, 1728×1117, 1280×800 and 760×900, plus measured trace and rendering performance.

Sources: [Java instrumentation API](https://docs.oracle.com/en/java/javase/26/docs/api/java.instrument/java/lang/instrument/ClassFileTransformer.html), [JDI event requests](https://docs.oracle.com/en/java/javase/26/docs/api/jdk.jdi/com/sun/jdi/request/package-summary.html), [JDK Class-File API](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/lang/classfile/package-summary.html), [ASM releases](https://asm.ow2.io/versions.html).
