# Milestone 6 trace boundary (lead-owned)

This contract specializes ADR-006. No worker changes these semantics independently.

## Flow and ownership

`compileProject(..., {debug:true})` → offline `AsmInstrumentationProvider` → transformed project classes → configured JVM + `Recorder` → NDJSON raw events → `TraceNormalizer` → schema-v2 `TraceDocument` → existing reducer/layout/scene. Normal Run uses the original classes and runner. The bridge exposes one finite Visualize result; browser components see normalized data and capability/terminal reports only.

The offline transformer must fail the request if a project class cannot be transformed. It instruments classes under the compiled project directory only. The recorder must not call user `toString`, `equals`, or `hashCode`. It must preserve Java evaluation order, return values, exception behavior, and successful-operation timing. A transformed class passing bytecode verification is necessary but does not alone establish semantic correctness.

## Raw NDJSON v1

One UTF-8 JSON object per line. All records contain `v:1`, monotonic `seq` starting at 0, `threadId` (decimal JVM thread ID as string), `type`, and `frameId` (string or null). Operation records also contain `className` (binary name), `methodName`, `descriptor` (JVM descriptor), `line` (positive source line or null), and `site` (stable instruction ordinal within the method, not a guessed source column). Emit only observed facts. A process exit is reported by the provider envelope, never by a forged recorder event.

Raw values:

```ts
type RawValue =
  | {kind:'int'|'long'|'float'|'double'|'boolean'|'char'|'byte'|'short'; value:number|boolean|string}
  | {kind:'string'; value:string}
  | {kind:'null'}
  | {kind:'ref'; objectId:string; className:string}
  | {kind:'unsupported'; javaType:string};
```

`objectId` is assigned by `IdentityHashMap` in the recorder and is stable within the run; arrays and objects share one ID sequence. No ID is derived from labels, `toString`, or identity hash alone. `frameId` is freshly assigned on every method entry. Only one project thread can be normalized in the initial slice; extra project threads are reported unsupported.

Event payloads (all retain the common fields above):

| `type` | Required payload | Meaning |
| --- | --- | --- |
| `object` | `objectId,className,fields:[{owner,name,descriptor,value}]` | First safe observation of a user object after constructor initialization; fields are actual JVM defaults/current values. |
| `array` | `objectId,elementType:'int',elements:number[]` | First observation of an `int[]`, including its current element values. |
| `enter` | `frameId,callerFrameId,className,methodName,descriptor,receiver:RawValue|null,parameters:[{slot,name,descriptor,value}]` | Project method entry; constructor entry after safe `this` access. |
| `line` | `frameId,line` | Reached JVM line-number site. |
| `local` | `frameId,slot,name,descriptor,liveRange,value` | Successful local store, or initial parameter observation at entry. `liveRange` is stable debug-table identity for that lexical variable. |
| `local_end` | `frameId,slot,liveRange` | Debug live-range end was reached; does not assert a source block closed. |
| `field` | `frameId,objectId,owner,name,descriptor,value` | Successful instance field store. |
| `array_read` | `frameId,objectId,index,value:number` | Successful `iaload`. |
| `array_write` | `frameId,objectId,index,value:number` | Successful `iastore`. No source operand is claimed. |
| `branch` | `frameId,opcode,site,left:RawValue,right?:RawValue,taken:boolean` | Actual JVM conditional branch decision, not automatically a Java `if`/loop fact. |
| `return` | `frameId,value:RawValue` | Actual non-void return operand. |
| `exit` | `frameId` | Normal method exit, after the return operand event where applicable. |
| `throw` | `frameId,objectId,className,message,explicit:boolean` | Observed exception object at explicit `athrow` or first exceptional project-frame unwind. `explicit:false` does not claim the exact JVM instruction. |
| `unwind` | `frameId,objectId` | This project frame is exiting exceptionally. |
| `catch` | `frameId,objectId` | An actual handler entry was reached. |

The provider may add bounded diagnostic metadata, but must not change these fields or invent semantic observations. A recorder failure, malformed record, sequence gap, or lost output makes the run `instrumentation_failed` or `partial`, not supported.

## Normalized schema v2

Curated schema v1 stays byte-for-byte compatible. V2 reuses existing event names and IDs where evidence supports them. It permits `RETURN_VALUE.destination:null` for an unobserved caller destination, and `ARRAY_WRITE.from` absent when the operand origin is unknown. It adds `THROW_EXCEPTION`, `CATCH_EXCEPTION`, `UNWIND_EXCEPTION`, and `PROGRAM_ABORT` so a crash or cap can retain the last valid live frames. `PROGRAM_END` means successful completion only. The v2 document includes a source manifest of actual project-relative paths and content; execution events use `fileId` equal to that path. An unresolved source location is `null`, and capability explains why.

The normalizer creates derived `PROGRAM_START`, and successful `PROGRAM_END` from the process envelope. It creates `DECLARE_LOCAL` on first observed store/parameter and `ASSIGN_LOCAL` on later stores; a value is never emitted before the store happens. A reference assignment becomes `CREATE_REFERENCE`/`CLEAR_REFERENCE` (object registration precedes it). Method return events never claim a destination slot without direct evidence. `ARRAY_READ` has no destination unless an explicit data-flow observation proves it; `ARRAY_WRITE` has no fabricated origin. JVM branch events may become a separate low-level `BRANCH_EVALUATE` fact; source-level condition/loop labels require a documented derivation and per-run capability. Console stdout/stderr is captured independently by the process provider; it is not interleaved with raw probe events unless ordering is observed.

The terminal envelope is `{status:'complete'|'program_crashed'|'instrumentation_failed'|'limit_exceeded'|'unsupported',exitCode,diagnostic,metrics}`. A non-complete trace remains inspectable only if validation confirms a contiguous honest prefix and the final abort event; its UI state cannot say Complete. Hard caps: 20,000 raw events, 8 MiB raw trace, 30 s wall time, at most 256 live objects/arrays and 128 live frames for the first version. Caps can be tuned with measured evidence, never silently truncated.

Capability is per feature: `{status:'supported'|'partial'|'unsupported',reason,observedEvents}` for methods, locals, objects, fields, references, int arrays, indexed reads/writes, source mapping, branches, loops, scopes, returns, exceptions, console. The aggregate status is the minimum of the features required by the executed program, not a claim about all Java. Preflight and post-run findings both contribute.

## Source and visual rules

The class manifest resolves package plus `SourceFile` to exactly one project-relative Java path and retains its content hash. Never assume `Main.java`. The actual code tab for `currentSource.fileId` must be opened/highlighted during guided execution; selecting a runtime entity may navigate to its actual file. Real traces use the same `createLayout`, `buildSceneModel`, Classic, Spatial, Theater, playback, selection, and inspector. Stable entity IDs reserve anchors over the whole finite trace. Aborted executions retain their last valid state for inspection.
