# Phase 3: execution graph and value provenance

Base d2dbedd on kiro-runtime-audit. Phase 1 observer/process separation and production budgets are unchanged; Phase 2 transport, publication, history and storage are extended in place. No Spatial 2.0 or IDE shell rewrite.

## Observation and evidence

Original bytecode is analyzed with ASM SourceInterpreter before injection. Bounded producer recipes cover local loads, constants, successful invocation results, instance field reads, int-array reads, allocation completion and arithmetic/conversions. Merged, unsupported or temporally ambiguous producers stay unknown. Source locations help navigation, never establish data flow. Actual consumer values are observed; the graph checks a known producer against that observation rather than searching for equal values. Computed values retain distinct identity, opcode and operand edges.

Calls have dynamic IDs, original bytecode sites and declared owner/name/descriptor. Project method entry joins only the pending call whose actual resolved target and full descriptor match. Declared interface/reference type remains separate from the observed receiver and entered implementation. Unobserved library callbacks retain a nearest observed ancestor separately; it is not asserted as a direct caller. Constructor receivers are null at true-start entry and become known only after successful initialization. Verifier-safe frame tokens reconcile actual exceptional unwinds before super without covering uninitialized this with an invalid handler.

Successful Scanner consumption uses the library's actual successful match, preserving lexemes such as `018`. Wrapped stdin reads are separate input-byte facts and cannot establish token consumption. Failed reads have no successful value return. Console pipe output remains canonical, independently of recording. Graph output relates the real in-flight operation to exactly the wrapped emitted text. It does not invent formatting or concatenation operands. Unsupported/replaced streams and native writes retain earlier ordering limitations.

## Semantic roots and queries

Additive raw v1 fields and facts preserve retained archives. New recordings carry provenanceVersion 1. The normalizer emits existing runtime facts plus `EXECUTION_FACT` events. Legacy recordings keep their exact Phase 2 normalization. Each new fact updates optional `RuntimeState.executionGraph` below React/Three, through the same ReductionStorage seam as the pure reducer and efficient engine.

Maps hold invocations, calls, immutable value versions, variable/field/cell storage, objects and I/O. Edges contain stable IDs, evidence (`observed`, `bytecode-derived`, `unknown`), source and exact invocation/method/descriptor/site context. They reference nodes rather than copying them. Storage points to its current value version and actual writer. Snapshot fields use OBSERVE, never a fabricated FIELD_WRITE or writer. Direct load edges also retain originSlotId: aliases share object identity while preserving which source slot actually supplied an operand.

Object `allocatedAt` is the first recorded object observation, not a probe of the uninitialized NEW operand or a claimed physical allocation timestamp. The original NEW site is joined only after successful construction; receiver readiness and whole-object completion remain separate facts.

Incoming/outgoing edge indexes make lookup proportional to a node's degree. `invocationInputs`, `fieldOrigin`, `returnDestinations`, `operationOutput`, `exceptionPath` and `invocationCompletion` answer renderer questions directly. Return-to-local and return-to-argument share the observed return version; a()+b() creates a separate computed result. Reference returns retain the same object ID, and null returns create no object edge.

CAPTURE_STOP and failed observation mark one observation boundary. Active graph invocations then query as recorded-prefix-ended. Their runtime state remains last observed; no missing return, unwind, value or successful call result is manufactured. Normal/exceptional completions remain distinct, and geometry remains retained.

## Incrementality and rendering

The existing persistent maps/vectors copy changed paths only. Graph roots participate in existing bounded history checkpoints and deterministic seeks. Appends never rebuild the graph prefix. Live publication uses the same immutable presentation prefix, transport cursor and throttling as Phase 2. Values and edges intentionally add linear retained semantic data; measured costs and boundaries are in PERFORMANCE.md.

Generic motion consumes only new graph edges and proven slot identities. Name/value correlations are removed. Computed/literal/unknown evaluation values have no newly invented geometry; motion stays at a known destination when no real source subdivision exists. No changes to camera, material, shell or layout policy are required. [best.png guidance](BEST_REFERENCE.md) is for the future visual milestone.

## Opaque pre-initialization callback boundary

An uninstrumented dependency can swallow a pre-super constructor failure and later re-enter project code before an observed caller handler runs. If a new entry has no exact matched call while the retained caller constructor is still uninitialized, that ancestor cannot be trusted. Observation stops as unsupported before emitting the ambiguous entry. Java and canonical Console continue. This intentionally also stops a legitimate opaque callback at that ambiguous boundary rather than asserting a false ancestor or inventing an unwind. Direct matched constructor chains and observed caller handlers remain supported.

## Inherited field identity

Instance-field probes retain the original Java instruction and resolve only their metadata owner from the symbolic owner plus exact field name/descriptor, following declaration/interface/superclass lookup. This joins inherited reads/writes to the same declaring-owner field observed in the object snapshot, while hidden fields remain distinct. Missing declaration metadata stops observation only after an original field operation succeeds; an original linkage failure or unexecuted operation is preserved. No name/value search over runtime fields is used.
