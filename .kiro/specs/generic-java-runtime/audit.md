# Independent runtime & product audit — evidence baseline for this spec

Branch `kiro-runtime-audit` at `230ba41` (product baseline `product-audit-v11.5` = `4785c87`).
Everything below was checked against the source code itself. Milestone reports were treated as claims to verify. Where this audit disagrees with `JAVA-VISUALIZATION-COVERAGE.md`, the disagreement is stated.

Layer keys used throughout: **INST** instrumentation (Recorder/OfflineTransformer) · **NORM** event normalization · **STATE** RuntimeState reducer/seek · **LAYOUT** · **REND** rendering · **ANIM** motion · **SRC** source mapping · **PROJ** project/build model · **SCALE** scalability · **IDE**.

---

## 1. Verdict

The pipeline is shaped correctly: one ExecutionSession, one JVM, a pure reducer, anchors kept separate from truth, and motion derived from events. It is not yet generic, and it does not scale. Three kinds of problem block "arbitrary Java":

1. **Observation vocabulary is too narrow.** INST instruments only local stores, `PUTFIELD`, `int[]` and conditional jumps. The following are missing: call sites, static storage, object/other-primitive arrays, library values and provenance. Most of the "Partial" rows below come from INST and NORM, not from rendering.
2. **Visualization limits alter program execution.** A limit breach, a second project thread, or 30 s of wall time *including stdin waits* kills the user's JVM with `Runtime.halt(86)` or `SIGKILL`. That breaks the promise that Run runs the program.
3. **The system is quadratic in trace length.** Every 100 ms publish sends the full `rawEvents` array. The client re-normalizes and re-validates the whole trace, the reducer copies whole entity maps on every event, and `seek` deep-clones state. The 5.3 s reload and 840 ms scrub recorded for a 21k-event run are symptoms of this, not tuning issues.

The existing layout is stable but not a call-tree layout. Children are not placed near their callers, so a large execution becomes a depth × arrival-order grid rather than a readable map.

---

## 2. Demo / fixture assumption audit

No literal `Person`, `setAge`, `age`, `:p`, `#17`, `factorial` or `bubble` survives in generic production code. Production code has no Person-specific handling in the server or instrumentation; the only project there is the Hello-world starter. The remaining assumptions are **structural**:

| # | Location | Assumption | Path | Severity |
|---|---|---|---|---|
| D1 | `world/layout.ts` `createLayout` first line | Any `ENTER_SCOPE` event routes the whole trace to `scopedLayout` (two-band control demo: depth clamped to 1, fixed positions, objects without ports, arrays not laid out, `stackDepth: 1`) | curated-only today; **blocks generic** if JVM ever emits scopes | High (latent) |
| D2 | `layout.ts` `hasArrays` | One global flag decides frame x, frame height, ports, bounds padding, `layoutKind` `'array'` vs `'deepStack'` and theater anchors. On a live prefix `layoutKind` flips when the first array appears, which re-frames the camera and toggles the floor, HEAP label and Theater button | **JVM path** | Degrades |
| D3 | `layout.ts` `live` branch | Frame position is `[-4.9 - col*6.4, -depth*4.2, -3 - row*2.6]`, where `col,row` come from a **global per-depth ordinal**, not from the caller. Children are not near their parents. With 1,756 invocations the rows run hundreds of units deep in Z | JVM | Degrades (comprehension + scale) |
| D4 | `layout.ts` | Live frame height is fixed at 3.6, with 0.32 slot pitch, so about 8 slots fit. `RuntimeCanvas` passes `spacious` in array worlds, but live ports were computed non-spacious, so ports and rows can misalign | JVM | Degrades |
| D5 | `layout.ts` curated branches | Recursion staircase (`stackDepth > 1`), Person main/child positions, single heap column at x = 3.45 | curated-only | Acceptable once isolated |
| D6 | `RuntimeCanvas.tsx` | HEAP label hard-coded at the Person heap `[2.1, 2.18, -0.65]`; floor `[24,26]`/`[20,16]` centred at the origin | JVM | Degrades (cosmetic, but wrong) |
| D7 | `world/runtimeHeadings.ts` | At depth ≤ 1 the STACK heading uses the Person token position | JVM | Degrades |
| D8 | `navigation/cameraMotion.ts` `sceneHomePose` | The Person pose is kept for curated shallow scenes. For JVM worlds the zoom switches 0.87 ↔ 1.18 at a magic bounds height of 6 | JVM | Degrades |
| D9 | `navigation/cameraMotion.ts` `invocationContextPose` | The recursion descend/unwind camera is applied to *any* `stackDepth > 1` world | JVM | Degrades (designed for factorial) |
| D10 | `app/App.tsx` array status panel | Summarizes the **first** array only; bubble-sort wording "a > b · true → swap"; `int[]` fallback name | JVM (partially) | Degrades |
| D11 | `app/App.tsx` call-status panel | "Final result" requires a return destination, which JVM traces never have, so it always shows "Last return" | JVM | Cosmetic |
| D12 | `motion/semanticTransition.ts` `correlatedSource` | A same-name, same-value active local is presented as the source of an assignment or field write. This is the Person `this.age = age` pattern turned into a heuristic | JVM | Degrades (can mislead) |
| D13 | `runtime/state.ts` `INPUT_READ` | Requires a `Scanner` object and `nextInt` | curated-only | Acceptable once isolated |
| D14 | Curated-only vocabulary | `ENTER_SCOPE`, `EVALUATE_CONDITION`, `LOOP_ITERATION`, `ARRAY_COMPARE`, `INPUT_READ`, `OUTPUT_WRITE`, and `ControlFlowStatus` UI. These duplicate generic concepts that JVM traces express differently (`BRANCH_EVALUATE`, `CONSOLE_*`) | curated-only | Overloaded vocabulary |
| D15 | `classic/classicScene.ts` | Every array gets the same rect `{600,238,330×160}`, so multiple arrays overlap. Object projection is tuned to curated x ≈ 3.45 | JVM (Classic) | Degrades (optional view) |
| D16 | `classic/ClassicRuntime.tsx` | Deep world with no heap shows the "RETURN FLOW" heading (factorial composition) | JVM (Classic) | Cosmetic |
| D17 | `trace.capture.origin === 'jvm'` | A single boolean switches curated vs generic in layout, camera and `fitShallow`. Generic behaviour should not need a provenance switch; curated behaviour should live in its own module | both | Architectural |

**Conclusion:** the generic Spatial path still contains curated code paths and constants in the same modules. The fix is a module boundary (see design §9), not more `if (live)` branches.

---

## 3. Generic semantic vocabulary evaluation

| Concept | Present? | Notes |
|---|---|---|
| THREAD | **Missing** | A raw `threadId` exists. STATE has one `activeFrameIds` stack. NORM throws on a second thread, and the server SIGKILLs the JVM |
| INVOCATION / FRAME | Present (merged) | `RuntimeFrame` is both. Acceptable, but status is incomplete: `active` means top of stack only. Caller frames waiting on callees have no "suspended" state. The scene's `active` / `historical` / `invocationStatus` are three overlapping encodings |
| SCOPE | Curated-only | NORM rightly refuses to infer lexical scopes from LVT ranges. Keep refusing |
| VARIABLE / VALUE | Present, overloaded | `{kind:'uninitialized'}` is used for four distinct facts: declared-unassigned, unsupported type, unrepresentable scalar (long/NaN) and unobserved. Slots carry no `lastChangedAt` / `observedAt` |
| OBJECT | Present, misnamed | `ALLOCATE_OBJECT` actually means *first observed* (at constructor entry after `super()`, or first `raw()` encounter). There is no allocation site and no NEW timing |
| FIELD | Present | Instance fields only. No read events. Snapshot once, then `PUTFIELD`-only updates, so data goes stale after library or reflective writes |
| REFERENCE | Present | Identity is correctly bound to the source slot. Project-object and `int[]` targets only |
| ARRAY | Narrow | `RuntimeArray.elementType: 'int'` is hard-coded in contract, reducer and layout |
| CLASS / STATIC STORAGE | **Missing** | No entity for per-class static state |
| CALL (call site) | **Missing** | Only callee `enter`. No call-site line or instruction, declared target, invoke kind, arguments' origins or library callee |
| RETURN | Partial | Scalar only, and `destination: null` always on JVM |
| READ | Narrow | `int[]` reads only. No field, static or local reads (acceptable if static provenance replaces local reads; see design) |
| WRITE | Partial | Local stores, `PUTFIELD`, `IASTORE` |
| BRANCH | Partial + duplicated | `BRANCH_EVALUATE` (JVM) vs `EVALUATE_CONDITION` (curated). No switch. long/float/double compares lose their operands (`LCMP`/`FCMP`/`DCMP` happen before the `IFxx` probe) |
| EXCEPTION | Good | throw / catch / unwind / "finally" (misnamed: catch-all cleanup). Only the **last** exception drives scene exception state |
| INPUT / OUTPUT | Present + duplicated | `CONSOLE_*` (JVM) vs `INPUT_READ`/`OUTPUT_WRITE` (curated) |
| LIBRARY BOUNDARY | **Missing** | Library calls are invisible; they are neither nodes nor collapsed summaries |
| LIBRARY VALUE (collections, boxed, etc.) | **Missing** | Normalized to `uninitialized` |
| FUNCTIONAL OBJECT (lambda/method ref) | **Missing** | Only the synthetic body method appears |
| PROVENANCE / EVIDENCE | Presentation-only | `observed` / `correlated` / `local` exist in motion, but no provenance fact exists in the trace |
| Transient "last activity" in STATE | Overloaded | `RuntimeState.branch` and `arrayActivity` are per-event presentation facts stored in semantic truth |

---

## 4. Java coverage (independent classification)

Rating = what reaches the Spatial world from a real JVM run *today*. "Responsible layers" = where the missing work lives.

| Construct | Rating | Responsible layers | Evidence / gap |
|---|---|---|---|
| Primitive locals | Partial | INST, NORM | No LVT → skipped. `long` is emitted as a JSON number, so precision is lost at parse (`rawScalar` → unavailable). NaN/∞ unsupported |
| String | Partial | INST, STATE | Value summary only; no identity or aliasing. Acceptable model; needs explicit "value-semantics" labelling |
| Static fields | **Unsupported** | INST, NORM, STATE, LAYOUT, REND | No `PUTSTATIC`/`GETSTATIC` probe; no CLASS entity |
| Instance fields | Partial | INST, NORM | Snapshot once (`SEEN`) and then `PUTFIELD` only, so library or reflective writes go stale. No read events. Values shown as current may be stale |
| References | Partial | INST, NORM | Only project objects and `int[]`; library targets unavailable |
| null | Full | — | Within observed slots |
| Primitive arrays | Partial | INST, NORM, STATE, LAYOUT | `int[]` only. Very long arrays lay out one cell per element with no bound |
| Object arrays | **Unsupported** | INST, NORM, STATE, LAYOUT, REND | Includes `main(String[] args)` |
| Multidimensional arrays | **Unsupported** | INST, STATE, LAYOUT | — |
| Constructors | Partial | INST, NORM | Entry is injected **after** `super(...)`/`this(...)`. A chained or superclass project constructor therefore records as a **sibling** of the subclass constructor under the caller, not nested inside it. Inner-class `this$0` stores before `super()` are skipped |
| Static methods | Partial | NORM, STATE | Frames, parameters and scalar returns work. Reference returns are dropped. No call site |
| Instance methods | Partial | same + INST | Receiver works (`this`). No declared-vs-actual dispatch |
| Recursion | Partial | INST, LAYOUT, SCALE | A 128-frame live cap **halts the JVM**. Layout descends 4.2 units per level with no clustering |
| Branches | Partial | INST, NORM | No switch; reference operands skipped; wide compares lose operands |
| Loops | **Unsupported** (as a concept) | INST, NORM | Only repeated lines are visible. The coverage doc says Partial; this audit disagrees: nothing identifies a loop |
| Inheritance | Partial | INST, NORM, LAYOUT | Concrete class and inherited fields are correct. Constructor nesting is wrong (above). No hierarchy metadata |
| Method overriding | Partial | INST, NORM | The actual override frame appears; the call-site target does not |
| Dynamic dispatch | Partial | INST, NORM, REND | Requires call-site events |
| Interfaces | Partial | INST | Default and static methods work; relationships are not modelled |
| Abstract classes | Partial | INST | Through concrete subclasses |
| Enums | Partial | INST, STATE | Constants are static fields (unsupported); `values()` is an object array (unsupported) |
| Records | Partial | INST | Ordinary object path; no component metadata |
| Generics | Partial | NORM | Erased types only; boxed values unavailable |
| ArrayList | **Unsupported** | INST, NORM, STATE, LAYOUT, REND | Library value |
| HashMap | **Unsupported** | same | — |
| Set | **Unsupported** | same | — |
| Nested (static) classes | Partial | INST | Normal classes |
| Inner classes | Partial | INST | Synthetic outer link excluded and pre-`super` store skipped, so containment is invisible |
| Lambdas | Partial | INST | Synthetic body frames only; functional object and captures invisible |
| Method references | Partial | INST | Only if the target is a project method |
| Exceptions | Partial | INST, NORM, REND | Good flow. Exception objects are counted toward the 256-identity cap but never allocated as entities. Only the last exception influences the scene |
| Caught exceptions (multi-level) | Partial→Good | REND | Unwound frames are retained. Needs an acceptance test at ≥ 3 levels |
| stdin | Partial | INST, NORM | Chunk → frame; no chunk → variable provenance. **Wall-clock limit continues during input wait**, so interactive programs are killed after 30 s |
| stdout / stderr | Partial | INST, NORM | Text facts only; no value → stdout provenance |
| File I/O | **Unsupported** | INST, STATE | — |
| Third-party dependencies | Partial | INST, PROJ | Execute but invisible; no library boundary. Maven multi-module and Gradle multi-project are rejected by PROJ |
| Reflection | Partial | INST | Reflected project methods appear; reflective writes go stale |
| Dynamic class loading | **Unsupported** | INST, PROJ | Offline transform only |
| Multiple application threads | **Unsupported, and lethal** | INST, NORM, STATE, LAYOUT, server | The second thread's event makes `DebugManager.#fail` SIGKILL the JVM |

---

## 5. Execution-integrity findings (program behaviour altered by visualization)

| # | Finding | Evidence |
|---|---|---|
| X1 | Recorder `limit()` calls `Runtime.getRuntime().halt(86)` on events > 20,000, bytes > 8 MiB, identities > 256 or live frames > 128 | `Recorder.limit`, `id`, `enter`, `emit` |
| X2 | 256 **cumulative** identities, including exceptions and `int[]`. A program creating 300 small objects is killed | `Recorder.id` |
| X3 | A second project thread makes the server kill the JVM | `debug-manager.mjs` `#refresh` thread gate → `#fail` → `SIGKILL` |
| X4 | The 30 s capture timer keeps running during `WAITING_FOR_INPUT`, so it kills interactive programs | `debug-manager.mjs` timer; coverage doc confirms |
| X5 | Identity/seen maps hold strong references, so the Recorder changes GC behaviour and memory | `IdentityHashMap IDS/SEEN` |
| X6 | `OUT.flush()` runs **per event** under a global lock: one syscall per probe, which serializes all threads | `Recorder.emit` |

**Reproduced during this audit on OpenJDK 25.0.2.** The current `Recorder` and `OfflineTransformer` were built from source and run on a 12-line program. The program constructs `Derived extends Base` once and then 300 `Base` objects in a loop.

- The JVM printed `[VisualJava] trace limit exceeded: objects`, exited with **86**, and never reached its final `println`. This confirms X1 and X2.
- The trace records `Base.<init>` as frame `f2` with caller `f1` (`main`), and then `Derived.<init>` as `f3` with caller **`f1`**. The superclass constructor is therefore a *sibling that precedes* the subclass constructor, not its callee. This confirms the constructor row in §4.

---

## 6. Semantic-motion audit

| Motion | Today (JVM) | Derivable generically? |
|---|---|---|
| assignment | local-only pulse; "correlated" source by name heuristic | Yes, via static operand provenance (design §4.3) |
| argument → parameter | parameter appears with no origin | Yes: call-site operand producers |
| receiver → this | no origin | Yes: call-site receiver operand |
| local → field | correlated by name | Yes: `PUTFIELD` value producer |
| return → receiver (caller slot) | never (`destination: null`) | Yes: immediate consumer of the invoke result (xSTORE / PUTFIELD / arg) |
| reference binding | observed | Keep |
| array read/write | cell-local; no source/destination | Yes: producer/consumer of `xALOAD`/`xASTORE` |
| allocation | "first observed" pulse | Keep, relabelled; add constructor-completion timing |
| stdin → value | stdin → frame body | Yes: library-call boundary (`Scanner.nextInt`) that consumed stdin → provable consumer |
| value → stdout | io only | Yes: argument producers of the library call that wrote |
| exception propagation | frame → caller unwind chain | Keep |

The pipeline order ExecutionEvent → RuntimeState → SemanticTransition → PresentationAnimation is **correct and must be kept**. The problem is missing evidence, not the architecture. The name-correlation heuristic should leave the default presentation.

---

## 7. Completed-history audit

| Aspect | Status |
|---|---|
| Completed invocation retention | Good. `EXIT_METHOD` keeps the frame, and `sceneModel` projects every frame |
| Grey-out | Good. Neutral history materials (tokens 2.7) |
| Stable XYZ | Good within a session (layout is a pure function of ordered events). Weakened by D2 (live re-framing) |
| Final object state | Shown in normal heap colours (good), but **not marked as last observed**. Stale-after-library-write risk (§4 instance fields) |
| Historical control flow | Weak. Only the last `returnFlow`. No retained call edges with call sites, and branch history is not visual |
| Data provenance | Missing (see §6) |
| Persistent I/O relationships | Missing. Console entries retain `frameId` only |
| Replay / arbitrary scrub | Deterministic but O(n) cold and cloned. The cache resets on every live prefix |
| Truthfulness of history | Completed frames' reference edges are drawn as `historical`. Objects never "die" (no GC), which is acceptable if labelled |

---

## 8. Focus audit

Focus = navigation mode `FOCUS_ENTITY` with `isolatedSelection`. It is cleared only by Home, Follow, Trace Path, representation change or `returnToPrevious`. Execution events do not clear it (good).

| Case | Result | Gap |
|---|---|---|
| active frame | OK | Isolation hides the objects the frame references; no 1-hop context option |
| completed frame | OK | Not labelled as "completed at event N" |
| object / empty object / 13-field object | OK (measured) | Objects with more than about 20 fields, or long arrays, have no paging or virtualization |
| array | OK up to 12 cells | Detailed arrays expand every cell (unbounded) |
| deep recursion | OK (measured on graph) | `invocationContextPose` competes whenever Focus is not active |
| failure | OK | Only the last exception is reflected |
| Debug pause | OK | — |
| completion | OK | — |
| new session | Focus survives with a now-meaningless ID (falls back silently) | Needs an explicit exit and notice |

---

## 9. Scalability audit (measured: 21,553 events / 1,756 invocations / 136 objects → 5.3 s reload, 212–840 ms scrubs)

| Stage | Complexity today | Cause |
|---|---|---|
| Server publish | O(n) per 100 ms tick (clone + JSON of all `rawEvents`) | `ExecutionManager.#flush`, SSE `JSON.stringify(session)` |
| Client ingest | O(n) per tick → **O(n²)** per run | `IdeWorkspace.acceptExecution` → `normalizeTrace(all)` + `validateTrace(all)` |
| Reducer | O(entities) per event → O(n·E) | Object-spread of `frames`/`objects`/`console`/`returns`; `Object.values(objects).some(displayId)` |
| Seek | O(n) cold; `structuredClone(state)` on every call; cache invalidated on every length change | `seek.ts` |
| Layout | O(n) full recompute per prefix; `Math.min(...spread)` over all anchors (stack-overflow risk for large arrays) | `createLayout`, `boundsFor` |
| Scene | Full rebuild per cursor; `priority.includes` is O(r²) | `buildSceneModel`, `detailedScene` |
| Transitions | Incremental (good) but replays the reducer a second time | `transitionsForTrace` |
| Detail budget | "Most recent N" by index; not semantic | `detailedScene` |
| Classic | Unbounded SVG | optional |

---

## 10. IDE usability audit (summary)

What already works like VS Code: Explorer tree keys (arrows, Enter, F2, Delete, Shift+F10), context menu, Monaco tabs with dirty dots, gutter/F9 breakpoints, a visible Run button, and a Console tab.

Where the shell diverges without a good reason:
- No application command palette; F1 is Monaco-only. No Quick Open.
- Bespoke **More actions** gear that hides Save, Build, Launch settings, Find symbol, Run without visualization and JDK.
- Hidden `code`/`visualize`/`debug` **workspace modes** with per-mode split widths and automatic layout jumps.
- **Four "Focus" concepts**: workspace expansion (`runtimeExpanded`), entity camera Focus, the standalone `runtimeFocus`, and mode emphasis.
- Debug toolbar is a text strip ("Over/Into/Out") with **no F5/F10/F11/Shift+F11/Shift+F5**. Stop sits elsewhere. There is no Variables/Watch view, and locals come from the trace at the cursor.
- **Alt+Shift+letter** shortcut family, where VS Code's own bindings would serve. Alt+Shift+F steals Format Document.
- Status at the **top** plus an editor footer, instead of a bottom status bar.
- Bottom-panel tabs appear and disappear dynamically, and the panel opens and closes itself from about 10 call sites.
- Runtime toolbar overload: Home, Focus, Trace path, Explore, Follow, Guided, flow filter, representation, quality, entity picker, and two "Return to world" buttons.
- New Java Class asks for a project-relative path ending in `.java`, instead of offering inline tree input.
- Dead code: `ide/visualize.ts`, legacy `bridge.run/visualize/debug*`, and the unmounted `TraceInspector`.
- State smells: `IdeWorkspace.tsx` has about 46 `useState`, 22 `useRef` and 19 `useEffect`. Breakpoints are held in three places. `mainClass` is duplicated. Runtime cursor and selection sync two ways through revision counters.
