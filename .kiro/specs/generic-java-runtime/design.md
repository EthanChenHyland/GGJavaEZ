# Design — Generic Java Runtime World

Status: **proposed; awaiting review. No implementation until approved.**
Inputs: [requirements.md](requirements.md) and [audit.md](audit.md). The existing contracts in `src/contracts/*` and the ADRs in `docs/architecture/` are preserved unless this document explicitly supersedes them.

The guiding rule is to **keep the pipeline and fix what flows through it**. The layered architecture (ExecutionSession → Recorder → normalizer → pure reducer → anchors → scene → motion) is sound. The work is: widen observation, add provenance, make every stage incremental, replace the non-generic placement function, and move curated code out of the generic modules. No stage is rewritten wholesale.

---

## 0. Subsystem dispositions

| Subsystem | Disposition | Summary |
|---|---|---|
| ExecutionSession / `ExecutionManager` | **KEEP** · FIX | Keep one session and one JVM. FIX: publish deltas and never kill on visualization limits |
| `DebugManager` control protocol (TCP hello/ack/paused, watermark) | **KEEP** · FIX | FIX: remove the thread-gate SIGKILL; pause and stdin time must not count toward duration |
| Offline bytecode transformation (ASM, project classes only) | **KEEP** · GENERALIZE | Add probes (§2). Load-time agent is **DEFER** |
| `Recorder.java` | **FIX** · GENERALIZE | Saturation instead of halt; buffered I/O; weak identities; raw v2; library/collection summaries |
| Raw NDJSON v1 | **GENERALIZE** → v2 | Compact, frame-scoped context, string longs, new record types. The v1 reader stays for retained sessions |
| `normalize.ts` | **FIX** · GENERALIZE | Incremental class; provenance join; per-thread stacks; no throw on second thread |
| `contracts/runtime.ts` (schema v2) | **GENERALIZE** → v3 | Additive: `threadId`, `unavailable`, arrays of any element type, CLASS storage, CALL, library values, freshness. v2 still loads |
| `runtime/state.ts` `applyEvent` | **KEEP** as reference semantics · FIX perf | Remains the correctness oracle. The hot path moves to the history index |
| `runtime/seek.ts` | **REMOVE** (replaced) | Replaced by the history index cursor view. No `structuredClone`; append-aware |
| `runtime/trace.ts` `validateTrace` | **KEEP** · FIX | Validates incrementally; no full re-validation per publish |
| `world/layout.ts` | **GENERALIZE** | New generic placement (§6). Curated branches move out |
| `world/scopedLayout.ts`, recursion staircase, Person poses | **REMOVE from generic** → examples module | Kept for `/examples` only |
| `world/sceneModel.ts` | **KEEP** · FIX | Invocation-status vocabulary, per-frame exception state, freshness, CLASS/library nodes |
| `world/detailedScene.ts` | **GENERALIZE** → LOD system | Priority by semantics and screen space, not recency index |
| `world/isolatedScene.ts` / entity Focus | **KEEP** · FIX | Add a "with context" variant, paged rows, virtualized arrays |
| `motion/semanticTransition.ts`, `flowPresentation.ts` | **KEEP** · FIX | Evidence from provenance. Heuristic correlation leaves default display |
| Scene primitives (`FrameSolid`, `ObjectSolid`, `ArraySolid`, `ArchiveSolids`, `RuntimeSlot`, `RuntimeLabel`) | **KEEP** · GENERALIZE | New CLASS storage, library node, cluster/deck primitives from the same token set |
| `RuntimeCanvas.tsx` | **FIX** | Remove the hard-coded HEAP label, floor and `hasArrays` rendering branches |
| Navigation (`navigation.ts`, `NavigationController`, `cameraMotion`, `cameraConstraints`) | **KEEP** invariants · FIX | Remove the Person pose and magic zoom constants from the generic path; framing from bounds only |
| Playback / Timeline | **KEEP** · FIX | Density-aware for 10⁵–10⁶ events; cursor from history index |
| Classic 2D | **KEEP optional** · DEFER scale | Fix array overlap only; large-world Classic stays deferred |
| Array Theater | **KEEP** as specialized | Generic data (any array). Compare/"swap" wording stays in the examples module |
| Curated traces `src/demos/*` | **KEEP** as regression fixtures | Plus real-JVM runs of their `Main.java` through the generic path |
| Build providers (plain/Maven/Gradle), JDK discovery, JDT LS | **KEEP** | Multi-module and multi-project are **DEFER** |
| `IdeWorkspace.tsx` | **GENERALIZE** (decompose) | Stores and hooks; command registry; VS Code conventions (§11) |
| More actions gear, workspace modes, Focus source drawer, legacy bridge endpoints, `ide/visualize.ts`, unmounted `TraceInspector` | **REMOVE** | TraceInspector may become a dev-only command |

---

## 1. Invariants (binding on all future work)

Each invariant has an automated test named in tasks.md. **An agent may not weaken an invariant without an approved ADR.**

| ID | Invariant |
|---|---|
| INV-1 | **One session, one JVM.** A Run or Debug has exactly one ExecutionSession and one JVM process. Console, trace, source sync and world all come from it. Java is never rerun to recover visualization. |
| INV-2 | **Visualization never changes program behaviour.** No limit, unsupported construct, thread or client failure terminates or alters the JVM. Only Stop ends a program early. |
| INV-3 | **RuntimeState is semantic truth only.** No positions, camera state, animation state, selection, LOD or evidence styling. |
| INV-4 | **Events are the only input to truth.** RuntimeState at cursor *c* is a pure function of `events[0..c)`. The history index and `applyEvent` must agree at every cursor. |
| INV-5 | **Deterministic scrub.** `materialize(c)` is identical whatever the path (forward, backward, jump). It is hash-checked in tests. |
| INV-6 | **Stable identities.** Frame, object, class, slot, reference and thread IDs are stable for the session. Display IDs never change once assigned. |
| INV-7 | **Append-only anchors.** Once assigned in prefix *k*, an anchor's position is identical in all longer prefixes, across scrubbing, LOD changes, quality tiers, Focus and representation changes. Size may grow only for `active` entities, and only along a declared growth axis. |
| INV-8 | **No provenance switch.** Generic layout, scene, camera and motion never branch on `capture.origin`, trace ID, class/method/variable names, line numbers, or whole-trace predicates such as "has arrays" or "has scopes". |
| INV-9 | **No invented facts.** Every flow has an evidence level. `correlated` is never drawn as a data flow by default, and `unknown` animates only at the destination. |
| INV-10 | **History is retained in place.** Invocations never disappear or move on return. Completion changes status styling only. No scene swap happens at program end. |
| INV-11 | **History is labelled as history.** Completed or last-observed entities are never presented as live JVM state. Data keeps full-contrast styling; invocations grey. |
| INV-12 | **User camera input wins.** Automated camera moves are cancelled by user input and never start during interaction or Focus. |
| INV-13 | **Focus exits only by user action** or session replacement (with a notice). |
| INV-14 | **Motion is presentation.** Skipping or disabling motion yields identical RuntimeState. Reduced motion overrides the quality setting. High quality is the fresh default. |
| INV-15 | **Generic modules do not import examples/Theater.** This is lint-enforced. |
| INV-16 | **Incremental cost.** Appending *m* events costs O(*m*) amortized in transport, normalization, indexing, layout and transitions. |
| INV-17 | **Detail reduction never deletes truth.** LOD, clustering, culling and budgets affect rendering only. |
| INV-18 | **Spatial is the default representation; Run is the primary action.** |

---

## 2. Instrumentation

### 2.1 Recorder runtime (FIX)

- **Saturation.** `limit(reason)` sets `SATURATED = true`, writes `{"t":"saturated","reason":…}`, flushes, and returns. Every probe first checks `SATURATED` (a static volatile read) and returns immediately. DebugControl stays connected, so the pause and stop commands keep working.
- **Limits.** These are defaults, configurable per launch: raw events 2,000,000; bytes 256 MiB; identities 200,000; live frames per thread 4,096; duration 10 min of *running* time.
  - The duration clock is maintained by the server and excludes `stdin_wait` → `stdin_read` intervals and debugger pauses.
  - UI copy states the limits.
- **Buffering.** A 64 KiB `BufferedWriter`. Flushes happen on:
  - a daemon `visualjava-flush` thread every 50 ms;
  - `stdin_wait`;
  - a DebugControl checkpoint that will pause;
  - saturation;
  - shutdown.

  The flush thread emits no probe records. The pause watermark protocol is unchanged, because the Recorder flushes before sending `paused`.
- **Weak identity.** An internal `WeakIdentityMap` (WeakReference, `System.identityHashCode` buckets, periodic ReferenceQueue purge). IDs come from a monotonic counter and are never reused. The `SEEN` set is replaced by an `observedEpoch` per identity entry (see re-snapshot, §2.4).
- **Threads.** Every record carries a thread number. A thread's first record is preceded by `thread_start {name, daemon}`. Stacks stay ThreadLocal. The global `seq` stays under the output lock, which gives a total order.
- **Frame token.** At method entry the transformer stores the Recorder `Frame` in a fresh local slot and passes it to the `catch`, `unwind`, `exit` and `local` hooks. The Recorder reconciles its ThreadLocal stack to that token: frames above it are popped and marked `unwound` with reason `unobserved-exit`. This makes stack bookkeeping robust to constructor pre-`super` failures and to library callbacks that throw across untransformed frames.

### 2.2 Raw schema v2 (GENERALIZE)

Records are compact NDJSON: `{"v":2,"s":<seq>,"th":<n>,"t":"<type>","f":"<frameId>"|null,"ln":<line>|null,"st":<site>|null, …payload}`. Owner, method and descriptor appear **only on `enter` and `call`**. The normalizer resolves them from frame context, which cuts bytes per event by about 2–3×. `long` values are strings. Floats use `"NaN"`, `"Infinity"` and `"-Infinity"` strings with `kind`. Record types:

| Type | Payload | New? |
|---|---|---|
| `thread_start` | name, daemon | new |
| `class_init` | class, statics[] (owner, name, desc, value) at first `<clinit>` entry or first static probe | new |
| `enter` | owner, method, desc, callerFrame, callId, receiver, params[] | extended (`callId`) |
| `receiver_ready` | objectId (constructor, after `super`/`this`) | new |
| `call` | callId, owner, name, desc, invokeKind (static/virtual/interface/special/dynamic), receiver?, args[]? (library callee only, summarized) | new |
| `call_return` | callId, value (library callee only; project callees use `return`) | new |
| `constructed` | objectId, newSite, className (after `INVOKESPECIAL <init>` in the caller) | new |
| `line`, `local`, `local_end` | unchanged semantics | — |
| `field` | objectId, owner, name, desc, value | unchanged |
| `static` | owner, name, desc, value (`PUTSTATIC`) | new |
| `array` | objectId, elementType (Z/B/C/S/I/J/F/D/L…/[), length, elements (≤ bound), truncated? | generalized |
| `array_read` / `array_write` | objectId, index, value | generalized to all `xALOAD`/`xASTORE` |
| `object` | objectId, class, fields[], epoch, origin (`receiver`/`value`/`resnapshot`) | extended |
| `library` | objectId, class, kind (`collection`/`map`/`boxed`/`optional`/`charseq`/`enum`/`other`), size?, items[≤k], epoch | new |
| `branch` | opcode, operands (including original long/float/double for `xCMP`), taken | extended |
| `switch` | opcode, key, targetIndex | new |
| `return`, `exit`, `throw`, `catch`, `cleanup` (renamed from `finally`), `unwind` | unchanged semantics | rename |
| `console`, `stdin_wait`, `stdin_read` | + callId of the enclosing library call if any | extended |
| `saturated` | reason | new |

### 2.3 Transformer probes (GENERALIZE)

Added to `OfflineTransformer.transformMethod`. All of them are verifier-checked by the existing `CheckClassAdapter`.

1. **All array opcodes:** `NEWARRAY` (all types), `ANEWARRAY`, `MULTIANEWARRAY`, `xALOAD`, `xASTORE` (including `AALOAD`/`AASTORE`/`BALOAD`…), and `ARRAYLENGTH` (optional, off by default).
2. **Statics:** `PUTSTATIC` (value after the store). `GETSTATIC` is not probed; reads are covered by static provenance (§2.5).
3. **Call sites:** before every `INVOKE*` except calls into `visualjava/*`.
   - Emit `call` with `callId`, which is unique per dynamic call: a Recorder counter passed through a per-thread "pending call" slot, and consumed by the callee's `enter` if the callee is transformed.
   - After the invoke, when the callee is not project code (known statically from the owner, which is not in the project class set — dispatch to project overrides of library methods is still detected at runtime because `enter` consumes the pending call): emit `call_return` with the result, via DUP of the result.
   - Receiver and arguments are captured only for library callees, and only by summary.
   - A configurable `callProbes` level is available (`all` | `project-boundary` | `off`); the default is `all`.
4. **Constructor nesting.**
   - Emit `enter` at the **true start** of `<init>`, with a `null` receiver. Parameters are legal to load before `super`.
   - Emit `receiver_ready(this)` immediately after the `super(...)`/`this(...)` invocation.
   - The unwind try-range still starts after `receiver_ready`, because a handler covering an uninitialized `this` is avoided. Pre-`super` failures are reconciled by the frame token (§2.1).
   - Result: superclass and delegated constructors nest under the subclass constructor.
   - A **spike is required** (tasks P3.1) to confirm verifier acceptance across `javac` 17/21/25 output.
5. **Allocation completion:** after `INVOKESPECIAL <init>` at a call site whose `NEW` was in the same method, `DUP` the constructed reference and emit `constructed`. This gives allocation site and completion time for project **and** library objects (for example `new ArrayList<>()`).
6. **Wide compares:** before `LCMP`, `FCMPL`/`FCMPG` and `DCMPL`/`DCMPG`, capture both operands. The following `IFxx` branch record carries them.
7. **Switches:** before `TABLESWITCH`/`LOOKUPSWITCH`, emit the key.
8. **Outer-instance stores:** `PUTFIELD this$N` before `super()` is recorded after `receiver_ready`, as a synthetic reference field marked `synthetic: outer`.
9. **invokedynamic** (lambda/method-reference creation): record `call` with `invokeKind: dynamic` and the bootstrap method name and target handle (from the constant pool). The functional object is summarized as `library/other`. Captures are **DEFER**.

### 2.4 Value observation (GENERALIZE)

`raw(value, descriptor)` handles values as follows:

| Value | Encoding |
|---|---|
| null | `null` |
| primitive | primitive (long as a string) |
| String | `string` (value semantics; the identity is intentionally not tracked) |
| array | `ref` + `array` record (any element type). Elements beyond `arrayElementBound` (default 256) are omitted, with `truncated: true` and `length` |
| project object | `ref` + `object` record |
| boxed primitive | `boxed` (value + box class) |
| other library object | `ref` + `library` record, or `unsupported` if summarization is unsafe |

- **Safe summarization.** A library object is summarized only if every method used (`size`, `iterator`, `entrySet`, `get`, `isPresent`, `name`, `ordinal`) resolves to a declaring class loaded by the bootstrap or platform loader. Otherwise it is `unsupported` with reason `user-override`. This mirrors the existing `safeMessage` rule, so user code is never executed. `ConcurrentModificationException`, `RuntimeException` and cyclic nesting are caught, and the value becomes `unavailable`.
- **Re-snapshot.** An `object` or `library` record is re-emitted (with a new epoch) when the object:
  - (a) is observed again after being passed to a library call (argument or receiver), or
  - (b) is observed again after a `call_return` of a reflective API (`java.lang.reflect.*`, `MethodHandle`).

  Only changed fields are emitted, as `origin: resnapshot`. This addresses stale final data without continuous tracking.

### 2.5 Static operand provenance (new)

At transform time, run ASM `Analyzer<SourceValue>` with `SourceInterpreter` for each method. For each *consumer* instruction, record its unique producer when all paths agree. Consumers are xSTORE, PUTFIELD, PUTSTATIC, xASTORE (value and index), INVOKE (receiver and each argument), xRETURN and ATHROW. Producers are:

```text
local(slot, liveRange) | field(owner,name) | static(owner,name) | arrayElement(site)
| invokeResult(site) | constant(value) | new(site) | param(index) | computed(opcode)
```

`computed` means an arithmetic or other expression. It is still useful: "value produced by `iadd` at line L". The output is a per-class `provenance.json`, alongside `executableLines`, keyed by `(owner, method+desc, site)`. It adds **no runtime cost**.

The normalizer joins each dynamic consumer event with this table:

- `local` → the slot ID in the same frame, with that live range.
- `invokeResult(site)` → the most recent completed call at that site in this frame. This is correct because JVM operand-stack discipline is LIFO within a frame.
- `field`/`static` → the owning slot of the receiver or class. For fields, a receiver producer is required as well; if the receiver is not uniquely provable, the evidence downgrades to `unknown`.

The result is `evidence: proven`.

---

## 3. Semantic schema v3 (GENERALIZE)

The change is additive to `contracts/runtime.ts`. The TypeScript names below are normative.

```ts
type ThreadId = string                                  // "jvm:thread:<n>"
type RuntimeValue =
  | { kind: 'uninitialized' }                           // declared, never assigned
  | { kind: 'unavailable'; reason: 'unsupported-type' | 'unrepresentable' | 'not-observed' | 'saturated' | 'user-override'; javaType?: string }
  | { kind: 'null' }
  | { kind: 'primitive'; javaType: PrimitiveType; value: number | boolean | string }  // long: decimal string; float/double special: 'NaN' | 'Infinity' | '-Infinity'
  | { kind: 'stringSummary'; javaType: 'String'; value: string }
  | { kind: 'boxed'; javaType: string; value: PrimitiveValue }
  | { kind: 'reference'; javaType: string; objectId: ObjectId }

interface RuntimeSlot { /* existing */ changedAt?: EventId; observedAt?: EventId; origin?: Provenance; synthetic?: 'outer' }
interface Provenance { evidence: 'observed' | 'proven' | 'correlated' | 'unknown'; from?: FlowEndpointRef; site?: number }

interface RuntimeArray { elementType: string /* JVM element type */; length: number; elements: RuntimeSlot[]; truncatedFrom?: number }
interface RuntimeObject { /* existing */ kind: 'project' | 'array' | 'library'; origin: 'constructed' | 'receiver' | 'value' | 'resnapshot'; observedAt: EventId; library?: LibrarySummary }
interface LibrarySummary { kind: 'collection' | 'map' | 'optional' | 'charseq' | 'enum' | 'other'; size?: number; items: RuntimeSlot[]; truncated?: boolean }
interface RuntimeClass { id: ClassId; className: string; statics: Record<SlotId, RuntimeSlot>; initializedAt: EventId }
interface RuntimeCall { id: CallId; callerFrameId: FrameId; site: number; source: SourceLocation | null; invokeKind: InvokeKind;
  declared: { owner: string; name: string; descriptor: string }; receiverObjectId?: ObjectId; calleeFrameId?: FrameId;
  library?: { args: RuntimeValue[]; result?: RuntimeValue; io: EventId[] }; status: 'pending' | 'returned' | 'threw' }
interface RuntimeThread { id: ThreadId; name: string; activeFrameIds: FrameId[]; status: 'running' | 'ended' }
interface RuntimeFrame { /* existing */ threadId: ThreadId; callId?: CallId;
  status: 'active' | 'returned' | 'unwound' | 'interrupted' }   // 'suspended' is derived: status active && not top of its thread
interface RuntimeState { /* existing */ threads: Record<ThreadId, RuntimeThread>; classes: Record<ClassId, RuntimeClass>; calls: Record<CallId, RuntimeCall> }
```

New events: `THREAD_START`, `THREAD_END`, `CLASS_INIT`, `SET_STATIC`, `CALL`, `CALL_RETURN` (library), `OBJECT_CONSTRUCTED`, `OBJECT_RESNAPSHOT`, `LIBRARY_OBSERVE`, `SWITCH_EVALUATE`, `CAPTURE_SATURATED`.

Changed events:
- `ENTER_METHOD` gains `threadId` and `callId?`.
- `RETURN_VALUE` value becomes `RuntimeValue` (a reference is allowed), and gains `destination` with provenance.
- `ALLOCATE_ARRAY` gains a generalized element type.
- `FINALLY_ENTER` is renamed `CLEANUP_HANDLER_ENTER`; the v2 name is accepted as an alias.

Rules:
- `RuntimeState.activeFrameIds` remains as an alias to the **main thread's** stack, for v2 consumers.
- `RuntimeState.branch` and `arrayActivity` are deprecated. They become derived from the event at the cursor, and are removed in P2 after consumers migrate.
- Curated-only events stay valid in the examples module's own reducer extension (§9). The generic reducer rejects them in v3 traces.

---

## 4. Normalization (FIX + GENERALIZE)

```ts
class TraceNormalizer {
  constructor(manifest: InstrumentationSourceManifest, provenance: ProvenanceTable)
  append(raw: readonly RawRuntimeEvent[]): TraceEvent[]   // O(raw.length) amortized
  finish(terminal: NormalizationTerminal): { tail: TraceEvent[]; capability: VisualizationCapabilityReport }
}
export function normalizeTrace(...) // = new TraceNormalizer(...).append(all) + finish; kept for tests and retained sessions
```

- The normalizer keeps **lookup tables only** (frames by ID, each with thread, class, method and slot map; object registration; pending references; call stack per thread; last completion per call site per frame). It does not run `applyEvent` on each event. Validation against the reducer happens in the history index in dev/test mode (§5).
- **Per-thread stacks.** A second thread is recorded, not rejected. Until thread lanes ship (P8), the scene shows non-main threads' invocations in a single "other threads" lane. The capability for `threads` is `partial`.
- **Provenance join** as in §2.5.
- **Library boundary join.** `console` and `stdin_read` records inside a library `call` are attached to that call. Example: `stdin_read` inside `Scanner.nextInt` followed by `call_return(42)` whose proven consumer is local `n` gives the flow `stdin → call → n` with evidence `proven`.
- Unrepresentable or unsupported values normalize to `unavailable{reason}`, never `uninitialized`.
- Raw v1 is still accepted (via an adapter) for retained v11.5 sessions.

**Transport.** The bridge no longer keeps `rawEvents` as JS objects in the session DTO.

- The trace file is the durable source.
- `DebugManager.#refresh` validates each line once (seq, required fields) and keeps only counters, the thread set, pause watermarks and byte offsets for every 4,096 seqs (the seek index).
- The DTO carries `rawEventCount`.
- SSE sends `event: raw` with `{fromSeq, lines}` deltas, plus separate `event: session` messages for metadata only.
- `GET /api/execution/:id/raw?from=<seq>&limit=<n>` serves resume and reload.
- The client acknowledges the highest seq it has processed. Reconnect resumes from there.

---

## 5. RuntimeState and the history index (FIX)

`applyEvent` remains the **reference semantics** (INV-4). It is too slow as the hot path because of its O(entities) object spreads. The hot path is a new `HistoryIndex`:

```ts
class HistoryIndex {
  append(events: readonly TraceEvent[]): void           // O(events) amortized; validates invariants
  get length(): number
  view(cursor: number): CursorView                      // O(Δ) from the last view if |Δ| small, else O(E log n)
  materialize(cursor: number): RuntimeState             // v2/v3-compatible frozen object; LRU-cached; for Inspector/Debug/tests
  entityTimeline(id: string): readonly HistoryEntry[]   // slot value history, frame status history, etc.
  provenanceOf(slotId: string, cursor: number): Provenance | undefined
}
```

- **Storage** is columnar and append-only:
  - Frames and invocations: `enteredAt`, `exitedAt`, status, thread.
  - Slots: an array of `(seq, value, provenance)` plus `declaredAt`/`removedAt`.
  - Objects: `firstObservedAt`, plus epochs.
  - Classes and calls: similar records.
  - Console entries.
  - Exceptions: every episode, not just the last.
- **Cursor view.** A `CursorView` answers "state of entity X at *c*" by binary search. The scene builder uses it directly.
- **Validation.** In dev and test, `append` also folds with `applyEvent` on sampled cursors (every 1,024 events and at the end) and asserts deep equality. CI runs full equivalence on the acceptance traces.
- **Seek replacement.** `seek.ts` is replaced. There is no `structuredClone`; states returned by `materialize` are frozen in development builds. Live growth extends the index and never invalidates it (INV-16).
- **Reducer performance fixes** (still needed for the oracle and v2 consumers):
  - Replace `Object.values(objects).some(displayId)` with a displayId set.
  - Stop copying `console`/`returns` arrays per event, by using persistent append lists.
  - Leave the other spreads as they are; they are acceptable off the hot path.

---

## 6. Generic spatial layout (GENERALIZE)

A new `world/genericLayout.ts` replaces the JVM branch of `createLayout`. It has an incremental API (`LayoutBuilder.append(events)`). Anchors live in an append-only store. It satisfies INV-7 and INV-8.

### 6.1 Regions

Region boxes are disjoint, and each grows only along declared axes:

| Region | Contents | Growth |
|---|---|---|
| **Invocation plane** | Per-thread slab at z = `lane(thread) × Z_LANE` | +x (time), −y (depth) |
| **Heap** | Behind the invocation plane at z ≤ −Z_HEAP_GAP | Class shelves; +x per instance, −z per new shelf |
| **Library** | Library nodes attached under their calling invocation, in the gap row between depths | +x |
| **I/O ports** | stdin/stdout/stderr ports at the invocation-plane's left edge (x < 0) | fixed |

Headings, floor and fog are computed from region bounds, never from constants (fixes D6, D7).

### 6.2 Invocation placement — L1, time-ordered monotone rows (baseline)

```text
col(i) = max(col(parent(i)), nextFree[thread][depth(i)])
nextFree[thread][depth(i)] = col(i) + 1
x = col × PITCH_X,  y = −depth × PITCH_Y,  z = lane(thread)
```

Properties:
- Append-only, and overlap-free per row.
- A child is never left of its parent, and a recursion chain descends in a single column.
- Sequential calls advance right.
- A finished program reads as a 3D icicle/flame map of its execution (INV-10).

Frame size is fixed per status. Overflow slots use the existing overflow terminal and Inspector (fixes D4, where ports are generated from the same rows the face renders).

**L2, deck compaction (candidate).** Consecutive calls from the same caller to the same method share one column and recede in −z by `PITCH_DECK`. Their subtrees use a per-card sub-plane. This greatly reduces width for loop-driven calls.

**ADR-012** (to be written in P5.1) chooses L1 or L2 after a bounded spike, measured on the acceptance corpus against these metrics:
- overlap = 0;
- append-only = 100%;
- caller–callee mean anchor distance;
- world extent;
- number of frames within the default Home view.

L1 ships first if L2 does not beat it by ≥ 30% on extent with equal adjacency.

### 6.3 Heap placement — class shelves

- Shelves are keyed by generic type identity: project class, array element type, or library kind plus class. They are created in first-appearance order.
- The shelf head is a **CLASS storage** cuboid (statics) for project classes that have statics or that were initialized.
- Instances append along +x at the class's uniform pitch. All instances of a class have the same observed field count, so rows are regular. Arrays and library values use width proportional to `min(length, bound)` with a virtualized cell strip.
- A shelf exceeding `W_MAX` wraps to a continuation row directly behind it.
- Nothing depends on names, values or event counts.
- Reference edges run from the invocation plane back into the heap, which makes Z-depth semantically meaningful (true-3D requirement).

### 6.4 Removed from the generic path

`hasArrays`, `layoutKind` flipping, `capture.origin` checks, the fixed 3.6 frame height with mismatched ports, `-4.9/6.4/4.2` grid constants, and the Person and recursion curated placements (which move to the examples module). `bounds` is computed incrementally as running min/max, without `Math.min(...spread)`.

---

## 7. Scene, LOD and rendering (FIX + GENERALIZE)

### 7.1 Scene model

- Frames carry an `invocationStatus` (`active` | `suspended` | `completed` | `unwound` | `interrupted`). This replaces the three overlapping flags.
- Exception state is per frame, across **all** episodes.
- Slots carry freshness (`changedAt`/`observedAt`).
- New node kinds: `class`, `library-call`, `library-value`, `cluster`.
- History edges are drawn from `RuntimeCall` records (caller → callee with a call-site port), and persist after return.

### 7.2 Semantic LOD (replaces `detailedScene` recency budgets)

| Level | Chosen when | Renders |
|---|---|---|
| **Map** | Projected entity < 24 px, or overview distance | Instanced cuboids with status colour; clusters/decks as single cuboids with a count; shelves as class slabs with a count; no text |
| **Structure** | 24–120 px | Headers (method/class plus display ID); slot rows as plates without values; drawn reference edges limited to the screen-space budget |
| **Detail** | > 120 px, selected, focused, active top frame, or pinned | Full face text and values; ports; flows |

- **Priority** when budgets bind: active stack → selection/Focus neighbourhood → current event's endpoints → pinned → nearest to camera. The old "last N by index" rule is removed.
- **Budgets** are per frame and hardware-tier driven: detailed entities ≤ 150, drawn edges ≤ 400, labels ≤ 600. They never delete truth (INV-17).
- **Culling:** frustum and distance culling on instanced batches. Label culling below a 9 px cap height.
- **Library collapsing:** library-call nodes collapse by package into one "java.util · 37 calls" node per invocation. Expanding one is a presentation state only.
- **Project emphasis:** project invocations and objects render at full weight. Library nodes are compact and neutral.

### 7.3 Rendering fixes

- Remove the RuntimeCanvas hard-coded HEAP label and floor.
- Add `ClassSolid`, `LibraryNodeSolid` and `ClusterSolid`, built from the shared `SolidBody` and tokens.
- Grey applies to completed and unwound invocations only. Data stays at full contrast, with a small "last observed @N" affordance in structure and detail LOD (INV-11).

### 7.4 Focus

- Keep `isolatedScene`. Add a `context` mode, which is the default: the 1-hop reference neighbourhood, caller/callee, and the class shelf head.
- Large objects page their rows at 16 per page, with page controls on the face and in the Inspector.
- Arrays virtualize at 64 visible cells, with an index scrubber.
- Recursion Focus shows a depth indicator and "go to caller/callee".
- A session replacement shows "Previous focus ended: new run".
- Naming: the IDE panel expansion becomes "Maximize Runtime" (§11). Only entity inspection is called Focus.

---

## 8. Motion (KEEP pipeline, FIX evidence)

- `deriveSemanticTransition` reads provenance from the event (the normalizer attaches `origin`). The name-based `correlatedSource` becomes an opt-in, off by default, and is labelled "correlated" (fixes D12).
- **New transitions:**
  - `call` (call-site port → callee header);
  - `argument` (producer slot → parameter slot);
  - `receiver` (producer → `this`);
  - `return` (return slot → proven destination, or caller header if the value was used in an expression);
  - `library-call` / `library-return`;
  - `stdin → value` (via the library call);
  - `value → stdout`;
  - `static-write`;
  - `constructed`;
  - `resnapshot` (a subtle "refreshed" pulse, not a flow).
- `transitionsForTrace` is fed by the history index. It is no longer a separate reducer pass. It is keyed by session trace ID, not `demoId`.
- The flow filter applies to *history*: selection (default), the current event, or the time window. The fixed 6/24 caps are replaced by the screen-space edge budget.
- Reduced motion, High as the default, and user camera priority are unchanged (INV-12, INV-14).

---

## 9. Module boundaries: examples and Theater

```text
src/examples/      curated traces, loaders, scopedLayout, recursion staircase & Person poses,
                   ControlFlowStatus, ARRAY_COMPARE/INPUT_READ/OUTPUT_WRITE/LOOP/SCOPE reducer extension,
                   bubble-sort captions, /examples route
src/theater/       specialized views over generic RuntimeState (array Theater: generic data, no algorithm words)
generic modules    instrumentation, runtime, world, scene, motion, navigation, playback, ide, ui
```

- An ESLint `no-restricted-imports` rule forbids generic → examples/theater imports, except through a single registration point in `app/`.
- A custom lint rule rejects fixture literals in generic modules (list in requirements 15.2).
- Curated traces remain schema v2. The examples module wraps the generic reducer with its extension events.

---

## 10. Performance budgets

**Reference machine:** Apple M-series (M2 or later) or an equivalent x86 laptop with a discrete or integrated GPU, Chrome stable, 1440×900 at DPR 2, and default High quality.

**Measurement:** p50/p95 over ≥ 30 samples via the Phase 0 harness. Microbenchmarks use synthetic generated traces (§13) and run in Vitest bench. Browser metrics come from Playwright with `performance.now()` and `requestAnimationFrame` sampling. Results go to `docs/checkpoints/<phase>/performance.json`.

| Area | Metric | Budget |
|---|---|---|
| Recorder | Sustained raw throughput (single thread, event-dense loop) | ≥ 1,000,000 raw events/s written; overhead ≤ 25× vs uninstrumented on probe-dense microbenchmark, ≤ 5× on acceptance projects |
| Trace ingestion | Normalize + index, amortized per semantic event | ≤ 3 µs (≥ 330k events/s) main-thread-equivalent |
| Trace ingestion | Cost independence | Batch of 1k events at prefix 500k costs ≤ 1.5× the same batch at prefix 1k |
| Live latency | Recorder write → visible scene, program emitting ≤ 20k events/s | p95 ≤ 250 ms |
| Main thread | Longest ingest/scene task during live run | ≤ 8 ms per frame (time-sliced) |
| Scene update | Cursor +1 step, world of 5k invocations / 2k objects | p95 ≤ 6 ms to commit |
| Camera interaction | Orbit/pan/dolly frame time, 5k invocations / 2k objects, default LOD | p95 ≤ 16.7 ms (60 fps); p99 ≤ 25 ms |
| Camera interaction | Same at 50k invocations / 10k objects | p95 ≤ 22 ms (≥ 45 fps) |
| Camera interaction | Input → camera response | ≤ 1 frame |
| Large execution load | Retained session of 100k semantic events / 5k invocations / 1k objects → interactive | ≤ 2.0 s (baseline today: 5.3 s for 21k) |
| Large execution load | 1M semantic events | First interactive frame ≤ 1.5 s (progressive); fully indexed ≤ 8 s |
| Scrubbing | Adjacent step (±1) | p95 ≤ 16 ms to visible frame |
| Scrubbing | Arbitrary jump at 100k events | p95 ≤ 50 ms state view; ≤ 100 ms to visible frame (baseline: 840 ms at 21k) |
| Scrubbing | Determinism | 100% identical state hashes across 1,000 random seek paths |
| Persistent history | Client memory for 1M semantic events | ≤ 350 MB JS heap; ≤ 200 bytes per event amortized in the index |
| Persistent history | Server memory per session | O(1) in events (file-backed); ≤ 64 MB resident for 1M events |
| Transport | Bytes per published delta | Proportional to new events; full resend only on explicit reload |

A phase is not complete unless its budgets are met, or a written deviation has been reviewed.

---

## 11. IDE integration (GENERALIZE toward VS Code conventions)

- **State decomposition** (no visual change in step 1):
  - `useProjectWorkspace` (tree, tabs, drafts, save).
  - `useExecutionSession` (session, SSE deltas, ingest pipeline). It uses one `isActivePhase(phase)` helper instead of five repeated phase lists.
  - `useBreakpoints`, the single source of truth: pending/verified status comes from the server, and paths are remapped on rename.
  - `layoutStore` and a `runtimeStore` (zustand, like navigation) for cursor, lens and selection. This replaces the `onRuntimeChange`/`runtimeNavigation` revision counters.
  - `mainClass`, `projectStatus` and `javaProject` become derived values.
- **Command registry** `{id, title, category, keybinding, when, run}`. It drives the command palette (Ctrl/Cmd+Shift+P), Quick Open (Ctrl/Cmd+P), context menus, the Explorer title actions, the shortcut help and the status bar items. The More actions gear is removed. Monaco F1 stays as the editor-scoped palette.
- **Keybindings:** VS Code defaults, per requirement 19.2. Alt+Shift+F is removed, so Format Document works.
- **Layout:**
  - Activity bar: Explorer, Search/Symbols, Run & Debug.
  - A single side bar.
  - Editor group, then the Runtime view.
  - Static bottom panel (Problems, Console, Debug Console/Error Explorer).
  - Bottom status bar.

  Workspace modes, per-mode widths, automatic panel open/close, and the Focus source drawer are removed. Maximize Runtime is a view-title toggle, like VS Code's Maximize Panel.
- **Run & Debug view:**
  - Call Stack, with threads once P8 ships.
  - Variables for the selected frame, expandable objects, arrays and library summaries, and freshness.
  - Breakpoints with enable/disable checkboxes.
  - A floating icon toolbar: Continue/Pause, Over, Into, Out, Restart, Stop.
  - Variables come from recorded facts. The view title says "Recorded values" to stay honest. Watch expressions are **DEFER**.
- **Runtime view title bar:** Follow execution (toggle), Reset View, Focus / Exit Focus, Maximize Runtime, and Representation (Spatial | Classic, plus Theater when available). Flow filter, motion quality and guided cues move to Settings. The entity picker `<select>` is removed; Call Stack and Variables cover navigation.
- **Explorer:**
  - New Java Class asks only for a class name, via inline input, with the package from the selected folder.
  - Inline rename; a single delete confirmation that merges the unsaved-changes decision.
  - Reveal Active File moves into the command registry.
- **Dead code removal:** `ide/visualize.ts`, legacy `bridge.run/visualize/debug*/stop/input/events` and their server routes (after checking that e2e tests do not use them), and the unmounted `TraceInspector`, which becomes a dev-only command.

---

## 12. Deferred / not attempted in the immediate phases

- Load-time Java agent, dynamic/generated class instrumentation, hidden classes, and lambda capture binding.
- File I/O semantics (file identities, byte flows); only the library boundary node appears.
- Reflection *operations* as first-class visuals; only re-snapshot correctness.
- GC, reachability, object death and weak/soft references.
- Lexical scopes and source-level loops as entities. Bytecode back-edge "loop regions" may be proposed later with an ADR.
- Thread synchronization: monitors, happens-before, locks, `wait`/`notify`, virtual-thread scheduling. P8 covers only thread lanes.
- Debugger expression evaluation, Watch, conditional breakpoints, logpoints, hot swap and set-value.
- Maven multi-module, Gradle multi-project, JPMS module paths, and Kotlin/Scala.
- Native Windows validation; the Windows build-tool wrappers.
- Classic 2D large-world virtualization.
- Library *internals* (JDK source-level frames).
- Binary trace format. NDJSON v2 must meet the budgets first.
- Multi-session comparison / diff worlds.

---

## 13. Test strategy

- **Synthetic trace generator** (`src/testing/traceGen.ts`). It is seeded and produces valid v3 traces with configurable shape: invocation count, depth distribution, fan-out, object count, field counts, reference density, arrays, exceptions and threads. It is used for benchmarks and property tests, and contains no fixture names.
- **Property tests:**
  - INV-4/5: history index vs `applyEvent`, and random seek paths.
  - INV-7: anchors of every prefix equal the full-trace anchors.
  - INV-8: the lint rule, plus an identifier-permutation run.
  - Non-overlap of anchors.
  - INV-10: entity count is monotone over the cursor.
- **Real-JVM acceptance corpus:** `fixtures/acceptance-v12/` (tasks P0.4). Each project has `expected.facts.json`, which lists the entity/relationship facts that must be present, the evidence levels, and the invariance checks. It never lists coordinates.
- **Invariance harness:** a source-rewrite script produces the renamed and line-shifted variants of each acceptance project. The harness compares the normalized worlds up to identifier renaming.
- **Existing suites:** the 591 unit and 85 browser tests stay green. Exact-coordinate tests of the JVM layout are migrated to property tests with rationale. Curated fixture coordinate tests remain within the examples module.

---

## 14. Risks and required spikes

| Risk | Mitigation |
|---|---|
| Constructor true-start `enter` and frame-token verifier acceptance | Spike P3.1 across javac 17/21/25 and Kotlin-free corpora. Fall back to the current post-`super` entry, plus synthetic nesting from call-site `call` records (the `INVOKESPECIAL <init>` call is known) |
| Call probes add overhead | `callProbes` level; budgets in §10; measure on acceptance projects |
| Library summarization executes user code | Bootstrap/platform-declaring-class rule; tests with user subclasses of `ArrayList`/`HashMap` overriding `size()` |
| Static provenance precision with complex control flow | Unique-producer rule only; everything else is `unknown`. Unit tests over javac patterns (ternary, compound assignment, `++`, switch expressions, try-with-resources) |
| History index diverges from reducer | Oracle equivalence in CI (INV-4) |
| Layout L1 width at scale | LOD decks/clusters (§7.2); L2 spike |
| Scope creep in the IDE work | P7 limited to the registry, keybindings, status bar, static panel, Debug view and removals. No new novel chrome |
