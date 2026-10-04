# Phase 4 — generic Java semantics and IDE commands

Base: `0e05c4384dc7fb103d0b5e43f693a1d0be7ead82`, branch `kiro-runtime-audit`. Phase 4 preserves the Phases 0–3 execution, graph, incremental history and spatial identity contracts. Phase 5 / Spatial 2.0 is deferred. This report accompanies the dedicated Phase 4 commit; no prior history is rewritten.

## Implementation and tested bounds

- Packed, prefix-compressed bitmap hash-trie Record storage replaces sparse six-level child arrays. Persistent Vector storage, facade APIs, ordering, JSON and historical roots retain their meaning. Full-hash collisions compare actual keys. The memory gate passed before runtime expansion.
- All eight primitives retain their actual observed values. Long is canonical signed 64-bit decimal text; float/double retain negative zero and nonfinite labels; char retains one UTF-16 code unit, including surrogates. NaN payload bits are outside the model.
- Per-declaring-class static storage is separate from heap instances. Actual project GETSTATIC/PUTSTATIC and `<clinit>` entry/completion retain ordering and writer evidence. Initial snapshots/read refreshes are observations. A first store with no prior observation has unavailable old value. Frame inspection exposes observed class statics even when no instance or `<clinit>` frame exists.
- One array architecture supports all primitive/reference components and real nested/ragged arrays, aliases and null rows. The recorder borrows the successful original opcode operand, rather than rereading storage. Full length, a 32-cell prefix and sparse observed out-of-prefix cells are retained. No allocation scales to an enormous unobserved length. Unknown prior values remain unavailable. Reads/resnapshots do not fabricate writes.
- String references retain actual identities and aliases, a 256-UTF-16-unit preview and full length. JDK implementation byte arrays/coder/hash fields are suppressed. Text beyond the preview is unavailable in recorded history.
- Exact verified bootstrap JDK adapters expose List, Set, Map, Queue and Deque storage: ArrayList, LinkedList, HashMap, TreeMap, HashSet, TreeSet and ArrayDeque. Snapshots retain actual item/key/value identities, nulls, size and truthful order; maximum 32 child references (16 map entries), bounded node/table scans. Receiver calls refresh supported summaries and retire old membership without changing historical roots. This is last-observed storage, not general internal library instrumentation.
- PROJECT / LIBRARY / JDK / SYNTHETIC ownership, runtime type, package, record/enum/synthetic flags and record components are renderer-independent metadata. Records, enums, nested/inner/anonymous classes, project lambda bodies and method-reference callbacks are verified. Dynamic/capture relationships remain unknown where bytecode evidence cannot prove them.
- File operations describe successful supported original calls, with source/call IDs, bounded text/counts and a path only when established. Files factories establish buffered-resource evidence; in-memory StringReader/StringWriter wrappers never become file endpoints. Arbitrary CharSequence callbacks are not invoked. No I/O is repeated for observation.
- Actual Maven and Gradle builds resolve external commons-lang3 3.17.0. Entered reflective project calls remain real invocations; indirect causality/writes remain partial. Custom-loader execution is tested but newly defined original bytes have no general instrumentation hook. Multiple project threads stop the observer unsupported while application execution continues.

These are conservative bounded semantics, not complete Java support. See the [current coverage matrix](../../../JAVA-VISUALIZATION-COVERAGE.md).

## Transparency and integration review

One Run retains one build, one application JVM and one authoritative ExecutionSession. Observer budgets are unchanged and never kill/restart a valid JVM. FULL / STOPPED_LIMIT / STOPPED_UNSUPPORTED / STOPPED_ERROR remain distinct. Canonical stdin/stdout/stderr, explicit Stop, debug control, contiguous raw deltas, immutable LIVE/HISTORY, completed invocations and stable identities/XYZ are preserved.

The observer now resides in a named `visualjava.observer` module. `java.util` reflective access is opened to that module only; a real-JVM regression proves application ArrayList private-field access stays denied while structural collection observation succeeds. This follows the targeted module-opening model in [the official Java documentation](https://dev.java/learn/organizing/modules/add-exports-opens/). Test-only budget introspection explicitly opens the observer package; production launch does not.

Lead audit corrections additionally guard packaging/boxing after observation stops, reject successful inherited nonproject field accesses with a truthful unsupported prefix, suppress inherited exception-message callback dispatch, and emit stdin consumption only after a successful read. Failed buffered reads clear waiting state without a fabricated consumption fact. All original operations still execute first and retain their own exceptions/results.

RuntimeState and ExecutionGraph contain no camera, XYZ, material, glow or animation timing. Class/summary snapshots record observations, not guessed causality. Source identifiers and VM lambda address normalization in invariance tests do not discard relationships, values, geometry or events; JSON schema keys are preserved. Former Phase 0 target facts now supported by this implementation were promoted to current assertions, not removed. The original acceptance Java programs were unchanged.

## Actual toolchain

Native host: macOS 15.5 arm64, Apple M4 Pro, 24 GiB. Node 24.20.0. Actual Java and javac: OpenJDK **26.0.2.1**. Maven **3.9.16**, Gradle **9.4.1**, verified with their actual version commands. Dependency corpus projects explicitly compile with release **17**; plain projects and observer helpers use this installed javac's default target. Release 17 compilation does not establish JDK 17/21/25 runtime compatibility. No such runtimes were tested.

All application-JVM, build, browser and performance workloads ran serially under lead ownership in the final pass. Earlier worker coordination mistakes are not used as gate evidence: the lead reviewed contracts/diffs, froze worker writes, reconciled integration, and reran production coverage and all required gates. No production recorder limits were raised.

## Regression gates

All final gates below completed under serialized lead ownership. Machine-readable totals and the reviewed screenshot inventory are in [QA-RESULTS.json](QA-RESULTS.json).

| Gate | Result |
| --- | --- |
| Typecheck, ESLint, production build | **Passed** after final browser polish |
| Full unit/integration | **1,204 passed, 52 opt-in skipped / 1,256**; 94 passed and four skipped files / 98; 146.55 seconds |
| Original Phase 0 acceptance | **191 passed, 4 expected failures / 195**; unchanged large-history/object-budget gaps |
| Fresh Phase 4 production JVM corpus | **30 passed**; 29 FULL and one intentional STOPPED_LIMIT case |
| Phase 4 identifier / line-shift invariance | **4 passed**, each uses three actual JVM recordings |
| Phase 3 real-JVM provenance/goldens | **17 passed**; combined final JVM run **51 tests / 3 files** |
| Transformer / transparency / budget audit | 13 transformer cases and all 16 recorder budget cases passed; budget private-reflection fixture corrected for test-only JPMS access |
| Synthetic rich / incremental / actual-JVM performance | **3 passed**; additional isolated incremental rerun **1 passed** |
| Browser suite | **100 passed / 100**, 9.4 minutes; final eight-case polish rerun **8 passed**, 56.5 seconds; earlier focused QA **14 passed** |

[Original acceptance evidence](acceptance.json) and [30 fresh project reports](coverage-results.json) contain exact outcomes. Source-bearing accepted trace caches and raw process logs remain local ignored QA data. The opt-in JVM/performance skips in default unit runs are separately exercised, not reported as passes. Build emits existing large-chunk and ineffective Troika dynamic-import warnings; unit output also contains the dependency Three.js CommonJS deprecation warning. None is a failing gate.

The fresh corpus contains 30 projects covering static initialization, all primitive arrays, reference arrays, ragged arrays, primitive edges, String aliasing, seven collection families, records/enums/nested/inner/anonymous classes, lambdas/method references, file I/O, Maven/Gradle dependencies, reflection, a realistic cross-feature multi-package dispatch program, hostile callbacks, dynamic loading, huge bounded values, interacting exceptions and intentional budget saturation. Assertions target actual semantic identities/types/values/relationships; independent archive/reload, pure/persistent reduction and seeded history seeks are included.

## Memory and performance evidence

[MEMORY.md](MEMORY.md) documents the controlled same-workload gate: **817.76 → 353.18 MiB** retained at 190,031 enriched events (**56.8% lower**), **2,560.00 → 1,965.53 ms** append (**23.2% lower** in one paired observation). All four graph digests remain identical. The largest graph retains 6,814 invocations, 6,813 calls, 67,849 values and 110,408 edges; checkpoint policy and evidence payloads remain intact. Heap attribution demonstrates packed child-array backing reduction, rather than silently deleting graph information.

[PERFORMANCE.md](PERFORMANCE.md) distinguishes final semantic pipeline measurements from browser rendering. Final integrated rich retention is **354.45 MiB**, append **1,844.74 ms**. The incremental 122,139-event probe normalizes in **668.14 ms** with 239 bounded checkpoints; its 184.58 MiB retention includes generator input and exported JSON, a different measurement scope. The real deep-call probe captures a valid 33,337-event prefix under the unchanged budget while Java completes all 7,200 calls and exits 0. Array/collection/cross-feature actual-JVM costs, seeded seeks and exact graph counts are reported separately. Single construction samples and explicit-GC deltas are not isolated graph bytes or GPU percentiles.

## IDE command and rename audit

Canonical typed commands live outside React and receive an explicit resource target plus workspace generation. Buttons, menus and keyboard surfaces call these operations: Open, Save, Save All, Close, Close Others, Close to Right, Close Saved, New File, New Java Class, New Folder, Rename File/Folder, Delete, Reveal in Explorer and Copy Path. Debug/F2/Quick Open/Command Palette definitions share dispatch and availability rules. The existing palette UI remains deferred; command definitions and adapters are ready.

Save All includes dirty closed-file drafts and validates revisions. Bulk Close resolves dirty decisions before any tab closes; cancellation preserves every tab. Delete uses one explicit dirty-file decision and handles saved/discarded open and closed descendants. Filesystem Rename preserves unsaved editor bytes without silently saving them and remains separate from JDT Rename Symbol.

Rename updates active/inactive tabs, draft keys, Explorer, breakpoints, navigation/recent session paths and working directory; invalidates derived build/model state; retires old Monaco URIs; sends canonical JDT watched-file changes and reopens documents. Java class-file rename remains a byte-preserving filesystem operation; changed class/main semantics must be resolved by JDT editing and the next Build/Run. It never guesses a new Java main class from a filename.

Durable nonce receipts make an uncertain response retry idempotent, including after ProjectStore reconstruction. Case-only moves stage privately and roll back where possible. Recovery uses recorded inode identity and fails closed when ambiguous. The last 128 committed receipts are retained; generation counts committed renames only, including verified no-ops without advancing it. The queue is in-process: no claim of protection against a second server or external editor performing concurrent native moves. Portable destination rules cover Windows device names, trailing spaces/dots, invalid characters and Unicode/case aliases synthetically; only macOS has native verification.

Final audit closed the build-to-manifest race: execution compilation and its source-manifest capture now share the file-command queue. A private WeakMap associates each source snapshot (or capture failure) with its exact compilation result, without adding source payloads to public Build DTOs or keying evidence by a reused output directory. Capture failure preserves successful compilation and the existing plain-run fallback. Tests hold capture behind a barrier, prove Rename waits, and prove a later build cannot replace earlier evidence.

Captured source manifests, graph identities/events and world anchors are immutable. Rename applies an external receipt-backed source binding and rechecks effective editor bytes against captured SHA-256. Edited/deleted/unproven paths never receive a false recorded highlight. Browser QA found and fixed highlight rebinding after a folder move; retained history now resolves against its own captured trace rather than a newer execution's manifest. An uncertain first Rename response, dirty Cancel/Save and source-manifest/raw-event immutability are exercised in the browser.

Editor-tab right-click menus can call explicit-target Close/Close Others/Close to Right/Close Saved/Rename/Reveal/Copy Path. Explorer menus can call shared Open/Create/Rename/Delete/Reveal/Copy Path. No new menu-specific filesystem logic is necessary for Phase 5.

## Browser and visual review

Focused QA exercises real OOP, reference arrays, static state, collections, stdin/stdout, a dependency build, exceptions and a large-value world, plus completed history, Focus, source rebinding and file commands. Screenshots use **1728×1117, 1440×900, 1280×800 and 760×900**. The complete suite passes all 100 cases (9.4 minutes), including all previously skipped serial cases. After the last CSS correction, the eight-case Phase 4 rerun passes and refreshes its 23 screenshots and eight semantic proof reports. Assertions cover nonoverlapping call/array/density readouts, actual reference values, explicit bounded prefixes and absence of launch-argument noise.

The first final unit run found one stale observer-helper classpath assertion (1,200 passed, one failed, 52 skipped). It now verifies the helper on a named module path, unchanged ordered application/dependency classpath, and java.util opened only to the observer rather than ALL-UNNAMED. The final queue/capture/projection/launch focused run passes 49 tests / four files.

The first complete browser run found four failures (91 passed, four failed, five serially skipped). Two were product regressions: breakpoint acknowledgments were not projected into workspace presentation, and passive object resnapshots navigated selection to the caller rather than a defining/writing source. The corrections preserve independent desired breakpoints and immutable captured sources. Two assertions required semantic reconciliation: repeated snapshots of one Person must still produce exactly one allocation/identity with age 18, and the graph-stress fixture now observes String map-key identities alongside Nodes. Its unchanged 256-object limit stops the prefix before the final catch; the test requires STOPPED_LIMIT/objects, one saturation marker, no fabricated catch, successful exit 0 and actual stdout `CAUGHT 1`. Smaller exception cases still require captured catches. No budgets or Java fixture programs were changed to pass the browser tests.

The polish remains within Phase 4: call/array readouts use one stacked layout instead of overlapping absolute boxes; empty launch-argument arrays do not create misleading banners; selected/currently active/nonempty arrays expose real reference/null values and explicit bounded-prefix length; object selection navigates actual allocation/write source instead of passive caller snapshots; bounded heap faces expose an explicit overflow/inspection cue, semantic summaries distinguish observed collection/String values, hidden off-face fields do not emit misleading visible-face edges, and reference-array edges attach to actual cell faces. Statics and sparse cells remain accessible in Inspector. No scene/camera/material/IDE shell redesign was performed; best.png is untouched. Direct full-size screenshot review covered all eight 1440×900 overview scenes; OOP and collection Focus at the four required sizes; populated collection history and command/rename history; and all eight category Focus views, including arrays, statics, dependencies, stdin/stdout, exceptions and large values. The dense cross-feature overview exposed the remaining quiet-volume-summary overlap; it now sits below the scene, clear of the top return readout, with a geometric browser assertion. Comparison with references 06–11/design documents protects the rectangular runtime geometry and restrained palette. Overview images visibly retain top/side faces, perspective, extrusion and real connectors; frontal Focus is intentionally optimized for surface reading. A temporary in-app browser check also confirmed editor startup; no user source was edited or included in checkpoint evidence. Spatial 2.0 is still needed for the intended dominant 3D hierarchy, dense labels and clustering; these screenshots are regression evidence, not a claim of visual perfection.

## Delegation and convergence

| Worker | Focused contribution |
| --- | --- |
| Bacon | Canonical IDE commands, resource transitions, source bindings, bridge/JDT integration; final verified breakpoint projection |
| Tesla | Successful original typed-array opcode probes and verifier fixtures |
| Euclid | Exact JDK collection/String/file helpers and safe access capabilities |
| Banach | Primitive validators, pure runtime classes/arrays/observations, equivalence tests |
| Helmholtz | Portable filesystem paths, durable nonce rename receipts/recovery and filesystem tests |
| Harvey | Thirty fresh Java projects, semantic assertions, invariance and accepted JVM evidence |
| Copernicus | Read-only instrumentation/transparency audit; lead fixed the reported issues |
| Carver | Final stacked call/array readouts and truthful generic value/prefix presentation |

The lead retained shared contracts, packed storage, normalization/provenance, recorder integration, source-capture barrier, visual review, serialized gates, final diff review and commit/push ownership. Worker summaries were checked against actual changes; completed workers are frozen/closed. An inherited sidecar briefly assumed lead authority earlier; its competing integration writes were reconciled before final validation. No worker summary alone is treated as passing evidence.

## Remaining limits and Phase 5 blockers

- Observed prefix/history is bounded. Huge String/array/collection contents and indirect library/reflective mutations are incomplete; unseen values are unavailable. Concurrency has no complete ordering model and is deliberately unsupported by the observer.
- Exact JDK collection layouts are verified only on the actual runtime. Unknown/custom subclasses, unsafe layouts and user callbacks stay opaque. Dynamic original class definitions and arbitrary native/library internals lack general probes. Java remains local and unsandboxed; build plugins execute normally.
- Projection still enumerates retained entities; detailed cuboids, text, draw calls, reference routing and picking need visible-entity budgets. Long array prefixes widen camera fit. Readability cannot be solved by shrinking thousands of objects.
- Stable class/ownership/package/type/call/time metadata supports future clustering/library collapsing. Dedicated spatial class storage, sparse array cells, I/O endpoints, relevant-flow filtering, semantic zoom and dense-world Focus remain Phase 5 work.
- No universal 5,000-object, GPU percentile, Windows/Linux native filesystem, or untested JDK runtime compatibility claim is made.

Phase 4 establishes truthful generic bounded semantics and one underlying IDE command architecture. The next milestone can consume those contracts to build the best.png-style hierarchy without program-specific rendering knowledge. It must address the rendering blockers explicitly; it does not begin in this phase.
