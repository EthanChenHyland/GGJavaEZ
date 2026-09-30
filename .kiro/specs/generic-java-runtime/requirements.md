# Requirements — Generic Java Runtime World

## Introduction

GGJavaEZ / Visual Java is a browser Java IDE. Its defining feature is that a real Java program, running in one real JVM, becomes a persistent and navigable 3D execution world. The product direction is a **familiar IDE shell with radically better runtime visualization**.

Earlier milestones grew the system through curated examples: Person, factorial, bubble sort, arrays and control flow. This spec makes the **generic Spatial runtime** understand arbitrary Java programs through Java runtime semantics rather than example recognition. It also defines the bounded work that remains before that is true.

Target pipeline:

```text
arbitrary Java project → project/build model → one real JVM → generic instrumentation
→ normalized semantic events → generic RuntimeState (+ history index) → stable spatial layout
→ Spatial runtime (live → completed → persistent explorable world)
```

Evidence for each requirement is in [audit.md](audit.md). Architecture is in [design.md](design.md). Phased work is in [tasks.md](tasks.md).

### Glossary

- **ExecutionSession**: the single authoritative record of one Run or Debug. It is owned by the bridge.
- **Raw event**: an NDJSON record written by the Recorder in the JVM.
- **Semantic event**: a normalized `TraceEvent`. It is the only input to RuntimeState.
- **RuntimeState**: the semantic truth at a cursor. It never contains positions, camera state or animation state.
- **History index**: an append-only, per-entity record of semantic changes, used for scrubbing and history queries.
- **Anchor**: the stable world placement of an entity. Once assigned, its position never changes within a session.
- **Evidence level**: `observed` (dynamic probe), `proven` (static bytecode dataflow joined with a dynamic event), `correlated` (heuristic), or `unknown`.
- **Invocation status**: `active` (top of its thread's stack), `suspended` (waiting on a callee), `completed`, `unwound` or `interrupted`.
- **Project code**: classes compiled from the project's source roots. Everything else is **library code**.
- **Saturation**: the Recorder has reached a capture limit and stops observing, while the program continues unchanged.

---

## Requirement 1 — Visualization never alters program execution

**User story:** As a developer, I want Run to execute my program exactly as `java` would, so that visualization limits never kill or change my program.

1. WHEN any capture limit is reached (events, bytes, identities, live frames, duration), THE Recorder SHALL enter saturation, emit one terminal `capture_saturated` raw record, and stop emitting further probe records. It SHALL NOT call `halt`, `exit` or throw into user code.
2. WHEN saturation occurs, THE program SHALL continue running. Console I/O SHALL continue through the original streams, and the ExecutionSession SHALL remain RUNNING until the JVM exits by itself or the user presses Stop.
3. WHEN a second application thread emits probe events and multi-thread visualization is not enabled, THE system SHALL NOT terminate the JVM. It SHALL mark thread coverage partial and continue to record the first thread, or record all threads once Requirement 18 is implemented.
4. WHILE the program is waiting for stdin, or paused by the debugger, THE capture-duration budget SHALL NOT advance.
5. THE Recorder SHALL NOT retain strong references to user objects solely for identity. Identity maps SHALL use weak keys or a bounded identity scheme that does not change reachability.
6. THE Recorder SHALL buffer output and SHALL NOT perform one flush syscall per probe. It SHALL flush at debugger pause and checkpoint boundaries, on saturation, at shutdown, and at least every 50 ms while events are pending.
7. WHEN Stop is requested, THE system SHALL terminate the JVM process tree as today. Stop is the only visualization-side action that ends a program.

## Requirement 2 — One authoritative session

**User story:** As a developer, I want the console, source highlight and runtime world to come from the same single execution.

1. THE system SHALL keep exactly one ExecutionSession per Run or Debug, backed by exactly one JVM process.
2. Console output, instrumentation events, source synchronization and the Spatial world SHALL all derive from that JVM. The system SHALL NOT rerun Java to recover or complete a trace.
3. Run SHALL remain the primary action and SHALL record the Spatial world by default. Debug SHALL use the same session model with debugger control added.
4. Run without visualization SHALL remain available as a secondary command, following VS Code's "Run Without Debugging" placement.

## Requirement 3 — Incremental, bounded-cost ingestion

**User story:** As a developer running a long program, I want the live world to keep up without the IDE slowing down as the trace grows.

1. THE bridge SHALL publish raw events to the client as **deltas** (events after sequence *k*), with a resumable cursor. It SHALL NOT resend the full event array on every publish.
2. THE client SHALL normalize incrementally: appending *m* raw events SHALL cost O(*m*) amortized, independent of the prefix length.
3. THE reducer, history index, layout and transition index SHALL each accept appended semantic events in O(*m*) amortized.
4. WHEN the client reconnects, THE bridge SHALL resume from the client's last acknowledged sequence number.
5. Normalization and reduction of large batches SHALL NOT block the main thread for more than 8 ms per animation frame. Work MAY move to a Web Worker.
6. THE full-trace `normalizeTrace` function SHALL remain as a pure wrapper over the incremental normalizer, and SHALL produce byte-identical output for identical input.

## Requirement 4 — Generic semantic vocabulary (trace schema v3)

**User story:** As a maintainer, I want one Java-semantic vocabulary that both real captures and curated fixtures use, so that the renderer never needs a provenance switch.

1. THE normalized schema SHALL express the concepts THREAD, INVOCATION/FRAME, CLASS (static storage), VARIABLE, VALUE, OBJECT, FIELD, REFERENCE, ARRAY, CALL, RETURN, READ, WRITE, BRANCH, EXCEPTION, INPUT, OUTPUT and LIBRARY BOUNDARY, as defined in design §3.
2. Every event SHALL carry `threadId`.
3. THE value model SHALL distinguish `uninitialized` (declared, not yet assigned) from `unavailable` with a reason (`unsupported-type`, `unrepresentable`, `not-observed`, `saturated`).
4. `ALLOCATE_OBJECT` semantics SHALL be documented and labelled as *first observation*. An `origin` field SHALL record whether the object was first observed at constructor entry, as a value, or by re-snapshot.
5. Curated-only duplicates (`EVALUATE_CONDITION`, `INPUT_READ`, `OUTPUT_WRITE`, `ARRAY_COMPARE`, `LOOP_ITERATION`, `ENTER_SCOPE`/`EXIT_SCOPE`) SHALL be confined to the examples module. They SHALL either be adapted to generic events or rendered only by examples/Theater code.
6. Transient per-event facts (`RuntimeState.branch`, `RuntimeState.arrayActivity`) SHALL move out of RuntimeState into SemanticTransition, or become history-index queries.
7. Schema changes SHALL be versioned. Schema-v2 traces, including curated fixtures and retained sessions, SHALL continue to load.

## Requirement 5 — Value and storage coverage

**User story:** As a developer, I want the common Java storage kinds visible in the world.

1. THE system SHALL observe arrays of every primitive element type, object arrays, and multidimensional arrays (as arrays of array references), including `main(String[] args)`. This covers allocation, element reads and writes, and element references.
2. THE system SHALL observe static fields of project classes. It SHALL record class initialization (`<clinit>`), static writes (`PUTSTATIC`), and the initial static values at first class observation. Static state SHALL appear as one CLASS storage entity per project class.
3. THE system SHALL represent reference-typed return values as return transfers, not only scalar returns.
4. `long` values SHALL be transported as decimal strings and preserved exactly. NaN and ±Infinity SHALL be represented exactly as labelled values.
5. Project superclass constructors and `this(...)` delegation SHALL appear **nested** under the constructor that invoked them. The constructor entry point SHALL remain verifier-safe.
6. Inner-class outer-instance links (`this$0`) SHALL be represented as a labelled synthetic reference, not silently dropped.
7. Large arrays SHALL remain observable. Transport MAY summarize contents beyond a configurable element bound, with an explicit `truncated` marker, and SHALL still report element writes at any index.

## Requirement 6 — Call sites and provenance

**User story:** As a developer, I want to see where each value came from, where arguments went, and where a return value landed, without invented data flow.

1. THE system SHALL emit a CALL event at every invoke instruction in project code. The event SHALL carry the call-site source line, bytecode site, invoke kind, declared owner/name/descriptor, receiver identity when observable, and the caller frame.
2. WHEN the callee is project code, THE resulting ENTER_METHOD SHALL reference its CALL. The difference between declared owner and actual class SHALL be available as a dispatch fact.
3. THE system SHALL compute static operand provenance by bytecode dataflow for these consumers: local stores, field and static writes, array stores, invoke arguments and receivers, and return operands. The provenance SHALL identify the unique producer (local load, field/static read, array read, invoke result, constant, or `new`). Provenance SHALL be marked `proven` only when the producer is unique on all paths.
4. RETURN transfers SHALL carry a destination when the invoke result's unique consumer is a local store, field write, array store or argument. Otherwise the destination SHALL be `null` with reason `expression`.
5. Parameter slots SHALL carry the proven origin of each argument when available.
6. THE name/value correlation heuristic SHALL NOT be presented as a data flow by default. If it is retained, it SHALL be visually distinct and labelled "correlated".
7. THE system SHALL NOT fabricate provenance. An unknown origin SHALL remain local to its destination.

## Requirement 7 — Library boundaries and library values

**User story:** As a developer using the JDK and dependencies, I want library calls and collections to appear as honest summaries instead of invisible gaps.

1. WHEN project code invokes library code, THE system SHALL record a LIBRARY_CALL boundary. The boundary SHALL include the declared target, argument summaries with provenance, the return summary with destination, and any stdin/stdout/stderr bytes consumed or produced during the call.
2. Library calls SHALL render as collapsed library nodes attached to the calling invocation, collapsible by package (for example `java.util`, `com.google.gson`).
3. THE system SHALL summarize library values of these kinds, based on JDK interfaces rather than class names from examples: `java.util.Collection`, `java.util.Map`, boxed primitives, `Optional`, `CharSequence`, enums and records. Each summary SHALL include the class, the size, and up to *k* elements or entries, with references to project objects preserved.
4. Library-value summaries SHALL be re-observed at project-code boundaries: when passed as an argument, stored, returned, or used as a receiver after a library call. Each summary SHALL be labelled "observed at event N". Summaries SHALL NOT claim continuous tracking.
5. WHEN a project object may have been mutated outside probes (it was passed to library code, or handled by reflection), THE system SHALL re-snapshot it at the next boundary. It SHALL emit field corrections with evidence `resnapshot` instead of leaving stale values presented as current.

## Requirement 8 — Invocation lifecycle and persistent history

**User story:** As a developer, I want active calls to stand out, completed calls to grey out in place, and the finished program to become the complete execution map.

1. Every observed invocation SHALL remain in the world, at its original anchor, from entry until the session is discarded.
2. Invocation status SHALL be one of `active`, `suspended`, `completed`, `unwound` or `interrupted`. It SHALL be rendered with distinct shared tokens. `active` SHALL be the most visually prominent, and `completed` SHALL be greyed.
3. WHEN a method returns, its geometry SHALL transition from ACTIVE to COMPLETED in place. It SHALL NOT disappear, move, or be replaced by a summary scene.
4. WHEN main completes, THE accumulated geometry SHALL itself be the completed execution map. No layout change or scene swap SHALL occur.
5. Objects, arrays, fields, class storage and references SHALL keep full-contrast data styling after completion. Historical *invocations* are greyed; recorded *data* is not uniformly dimmed.
6. Completed entities SHALL be labelled as historical records ("completed at event N", "last observed at event N"). They SHALL NOT be presented as live JVM state.
7. Call relationships (caller → callee, with call site) SHALL persist as history edges. They SHALL be filterable, and they SHALL NOT disappear when the callee returns.
8. Console input and output entries SHALL persist their relationship to the invocation, and to the proven value where one exists.

## Requirement 9 — Truthful data freshness

1. Every slot (local, field, static, element) SHALL record `changedAt` (the last semantic write event) and `observedAt` (the last event that confirmed its value).
2. THE Inspector SHALL show freshness ("set at event N", "observed at event N", "may be stale: passed to library at event M").
3. Staleness SHALL be derived from recorded facts only.

## Requirement 10 — Deterministic replay and arbitrary scrub

1. For any cursor *c*, THE materialized RuntimeState SHALL be identical, by deep equality and hash, regardless of the path taken to reach *c*.
2. Scrubbing SHALL NOT rerun Java, SHALL NOT change anchors, and SHALL NOT depend on animation or camera state.
3. Seek SHALL NOT deep-clone full state per call. States SHALL be immutable (frozen in development builds).
4. Live prefix growth SHALL extend, not invalidate, checkpoint caches and the history index.

## Requirement 11 — Generic stable spatial layout

**User story:** As a developer, I want any program's execution laid out as a readable call tree and heap, stable while it grows.

1. Layout SHALL be a pure, append-only function of the ordered semantic event prefix. An anchor assigned at prefix *k* SHALL be identical in every longer prefix.
2. Invocation placement SHALL reflect the call tree. A callee SHALL be placed adjacent to its caller's region, and recursion and sequential calls SHALL be distinguishable by structure alone.
3. The heap SHALL be organized by generic keys: class shelves, with CLASS storage entities heading their shelf. Arrays and library values SHALL be placed on the same shelf system. Placement SHALL NOT depend on class names, variable names, line numbers or event counts.
4. Layout SHALL NOT branch on trace provenance (`capture.origin`), or on whole-trace predicates such as "has arrays" or "has scopes". Region bounds MAY grow; framing changes SHALL follow Requirement 13 camera rules.
5. Headings, floor, labels and camera framing SHALL derive from actual world bounds. No fixture-coordinate constants are permitted.
6. Frames with more slots than their face can show SHALL expose an overflow terminal and keep all slots accessible in the Inspector. Ports SHALL match the rendered rows.

## Requirement 12 — Scale through semantics, not shrinking

**User story:** As a developer running a large program, I want the world to stay legible and interactive.

1. THE system SHALL provide semantic zoom with at least three levels: *map* (clusters), *structure* (entities without values), and *detail* (values). Levels SHALL be selected by camera distance and screen-space size, without moving anchors.
2. THE system SHALL cluster consecutive sibling invocations of the same method under one caller into a "×N" cluster entity, expandable in place, and SHALL collapse recursion runs deeper than a threshold into a depth cluster.
3. THE system SHALL collapse library calls by package, and SHALL emphasise project code by default.
4. THE system SHALL filter flow edges (by selection, by kind, and by time window), and SHALL cap drawn edges by screen-space budget rather than by fixed recency.
5. THE system SHALL support invocation isolation (a subtree) and object isolation (the object's 1-hop reference neighbourhood).
6. THE system SHALL cull by frustum and distance, use instancing for quiet entities, and adapt labels so they are hidden below a legible pixel size.
7. Reducing detail SHALL NOT delete runtime identities, anchors or recorded facts.

## Requirement 13 — Camera and Focus

1. User camera input SHALL always win over automated camera movement.
2. Focus (entity inspection) SHALL support: active frame, completed frame, object, empty object, large object (paged rows), array (virtualized cells), deep recursion, failure, Debug pause and program completion.
3. Focus SHALL exit only on explicit user action (Exit Focus, Escape, Home, selecting another entity's Focus) or when a new session replaces the world. A replaced session SHALL show a visible notice. Execution events, completion, failure, pause and live growth SHALL NOT exit Focus.
4. Focus SHALL offer "with context" (1-hop references and caller/callee) and "isolated" variants.
5. The IDE-layout expansion of the runtime panel SHALL be named "Maximize Runtime" and SHALL be distinct from entity Focus.
6. Automated framing changes, such as world bounds growth, SHALL NOT move the camera while the user is interacting or in Focus.

## Requirement 14 — Semantic motion from semantic events

1. Motion SHALL follow ExecutionEvent → RuntimeState transition → SemanticTransition → PresentationAnimation.
2. The system SHALL communicate generically, when the evidence exists: assignment; argument → parameter; receiver → this; local → field; return → destination; reference binding; array read/write; allocation (first observation); stdin → value; value → stdout; exception propagation.
3. Every animated flow SHALL carry an evidence level. `unknown` origins SHALL animate only at the destination.
4. Runtime correctness SHALL NOT depend on animation state. Skipping, cancelling or disabling animation SHALL yield identical RuntimeState.
5. Reduced-motion preferences SHALL override the animation-quality setting. The High quality level SHALL remain the default when no preference is stored.

## Requirement 15 — Genericity guardrails

1. Generic modules (`instrumentation`, `runtime`, `world`, `scene`, `motion`, `navigation`, `ide`) SHALL NOT import from the examples/Theater module. This SHALL be enforced by lint.
2. A lint rule SHALL reject fixture identifiers in generic modules: `Person`, `setAge`, `factorial`, `bubble`, `swap`, `Scanner`-specific checks, fixture IDs, and fixture coordinates.
3. **Identifier-permutation invariance:** for every acceptance project, a variant with all project identifiers renamed (classes, methods, fields, locals, packages) SHALL produce an isomorphic world. The entity graph, anchors and statuses SHALL be identical up to renaming.
4. **Source-shift invariance:** inserting comments or blank lines SHALL change only source locations, not anchors or structure.
5. The existing examples (Person, recursion, arrays, control) SHALL be retained as regression fixtures. Each SHALL also run through the real-JVM generic path using its `Main.java`.

## Requirement 16 — Specialized Theaters

1. Curated traces and specialized views (for example, the array Theater with comparison wording, and scope bands) SHALL live in an examples/Theater module.
2. A Theater MAY consume generic RuntimeState. Generic Spatial SHALL NOT depend on any Theater.
3. `/examples` SHALL continue to work.

## Requirement 17 — Project model

1. Plain, Maven single-module and Gradle single-project builds SHALL continue to work, including multi-package source trees and resolved dependencies.
2. Dependencies SHALL remain on the classpath without being transformed. Their calls SHALL appear as library boundaries (Requirement 7).
3. Maven multi-module and Gradle multi-project builds are deferred (see design §12). They SHALL fail with a clear message and SHALL never silently mis-build.

## Requirement 18 — Threads

1. Near term: see Requirement 1.3.
2. Later phase: THE system SHALL model THREAD entities with per-thread stacks. Each thread SHALL have its own spatial lane. Events SHALL be interleaved by the Recorder's global sequence. Synchronization semantics are deferred.

## Requirement 19 — IDE follows VS Code conventions

**User story:** As a VS Code user, I want to know immediately how to open, edit, run, debug and inspect.

1. The IDE SHALL provide an application command palette (Ctrl/Cmd+Shift+P) and Quick Open (Ctrl/Cmd+P), backed by one command registry that also drives menus, the shortcut help and context menus.
2. Keybindings SHALL follow VS Code defaults: F5 Start Debugging/Continue; Ctrl+F5 Run (visualized); Shift+F5 Stop; Ctrl/Cmd+Shift+F5 Restart; F10, F11 and Shift+F11 for Over, Into and Out; F9 toggles a breakpoint; Ctrl/Cmd+S Save (globally); Ctrl/Cmd+J toggles the panel; Ctrl/Cmd+Shift+E Explorer; Ctrl/Cmd+Shift+M Problems; Ctrl/Cmd+` terminal/Console. The Alt+Shift family SHALL be removed where it conflicts with VS Code.
3. A bottom status bar SHALL replace the top status strip and the editor footer.
4. Bottom-panel tabs (Problems, Output/Console, Debug) SHALL be static. The panel SHALL NOT open or close itself except: reveal Console on stdin wait, and reveal Problems on build failure.
5. The Debug view SHALL provide Call Stack (selecting a frame updates Variables and the editor), Variables (expandable, for the selected frame), Breakpoints (enable/disable/remove) and a floating debug toolbar with icons.
6. The More actions gear, hidden workspace modes and per-mode widths SHALL be removed. Their actions SHALL move to the palette, menus or view title bars.
7. Explorer SHALL support New Java Class by class name, with inline input and a package inferred from the selected folder. It SHALL also support inline rename, delete with a single confirmation, and remapping of breakpoints on rename.
8. Runtime view controls SHALL be consolidated into the view title bar: Follow toggle, Reset View, Focus/Exit Focus, Maximize Runtime, and representation. Flow filter and motion quality SHALL move to settings.
9. The runtime world SHALL remain the innovative surface. New non-standard IDE chrome SHALL NOT be added for visual differentiation.

## Requirement 20 — Performance budgets

The system SHALL meet the budgets in design §10, measured on the reference machine with the harness defined in tasks Phase 0.

## Requirement 21 — Regression preservation

1. All existing unit, integration and browser tests SHALL pass, or SHALL be migrated with a written rationale where the behaviour intentionally changes. For example, exact-coordinate assertions become property assertions (stability, non-overlap, adjacency).
2. The existing product-audit fixtures (banking-maven, dispatch-gradle, graph-stress-plain, focus-shapes-plain) SHALL remain passing acceptance projects.
3. The spec invariants in design §1 SHALL be covered by automated tests.

## Requirement 22 — Honest capability reporting

1. The coverage report SHALL be generated per session from observed facts and per-feature status. `FULL` SHALL mean "no observed construct in this run was degraded". It SHALL NOT mean Java-complete.
2. `JAVA-VISUALIZATION-COVERAGE.md` SHALL be updated at the end of each phase from acceptance results, not from intent.
