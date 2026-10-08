# Phase 5.5 — Spatial 2.0 torture audit

Base `b7bbb9a21d1f069d88a13912433131a8be040e60`, branch `kiro-runtime-audit`. This checkpoint hardens the existing product. Phase 6 is excluded. [VALIDATION.md](VALIDATION.md) records accepted gates; [VISUAL-QA.md](VISUAL-QA.md) records original-size review; [PERFORMANCE.md](PERFORMANCE.md) separates measurement domains. This report describes bounded evidence, not a claim that arbitrary Java or all camera views can be fully observed/readable.

## Architecture and ownership

One ExecutionSession, one build and one application JVM remain authoritative per run. RuntimeState/ExecutionGraph, immutable source manifests, persistent history, canonical commands and append-only anchors retain their existing contracts. No runtime schema, semantic colors, production recorder budgets or dependencies changed. Display summaries never rewrite recorded identities/values. Unknown/opaque/unobserved state remains explicit; Console is canonical process output.

The lead owned contracts, camera, editor follow-up, fixture construction, recorder control repair, integration, all workload release and final QA. Averroes supplied bounded caption fitting and connector geometry reuse in ReferenceCurve, ReturnFlow, SemanticFlow and focused tests. The lead reviewed the actual diff, then added shared represented-body routing, array-header attachments and projected caption collision handling. Newton and Noether hit account usage limits without handoffs; no completion is attributed to them. Worker files were frozen before final measurements.

## Fresh ugly-program corpus

All nine cases are ordinary Java projects compiled and executed by the production runner, independently rerun through the IDE. Java output/exit, archive replay, rebatching, pure/persistent equality, history immutability and stable anchors are checked. Exact final counts/output hashes are in `jvm/*.json` and `media/browser/*/proof.json`.

| Project | What it stresses | Observed result / scope |
| --- | --- | --- |
| 01-text-and-fields | Deep package, 90+ character method, nested generic Maps, 0/1/5/20/100 fields, control characters and a 5,131 UTF-16-unit string | Actual `TEXT_AND_FIELDS 5131`; 100-field object retained. Faces show bounded marked text/rows, Inspector wraps exact recorded names. Recorded string summaries remain bounded; omitted original string bytes are not invented. |
| 02-arrays-cycles-collections | Empty/single/5/100/10,001-cell arrays, sparse index 10,000, 100 inbound references, ragged/shared/null rows, cycles/self-alias, List/Map/Set/Queue and 1,000-member collection | FULL: 7,492 raw / 9,852 semantic, 4 frames, 33 objects. Sparse `[10000]` is exactly 73; shared rows retain object identity; 32-cell observation prefixes and bounded previews disclosed. |
| 03-recursion-and-wide-calls | Mutual depth 220, then wide branches beyond the observer cutoff | STOPPED_LIMIT at 128 live frames, while Java finishes `CALL_LANDSCAPE 160 221`. No fabricated post-limit wide tree/end event. |
| 04-statics-and-exceptions | Lazy static state 7→12→15, wrapped/rethrown causes, finally, four catches followed by uncaught failure | Actual nonzero exit, exact stdout and checked stderr/cause text. Recorded throws/catches/unwinds remain inspectable; opaque Throwable fields are not fabricated. |
| 05-output-and-input | Blank/Unicode/4,096-character input, 2,000 stdout and 2,000 stderr lines | Observer stops at 256 objects; Java still reads all input and emits exact stdout/stderr including final completion. Console/archive remain complete beyond the semantic prefix. |
| 06-small-debug | Constructor, aliases/arrays, 0→18 mutation and depth-four recursion | FULL actual `DEBUG_SHAPE 18 true`; controls and camera exercised separately using one real Debug session. |
| 07-observed-wide-and-deep | Depth 70 below cap, 30 branches and 60 leaves all within observation limits | FULL: 162 retained invocations, maximum recorded frame depth 71; output `OBSERVED_LANDSCAPE 900 70`. Covers real wide-call geography rather than relying on case 03's unobserved tail. |
| 08-many-lazy-statics | 24 lazily initialized class families | FULL, sum 300, actual class state includes Family24 value 24; no eager fabricated class state. |
| 09-quiet-tiny | Two frames, a simple 17→18 calculation, no output | FULL, 12 raw / 24 semantic events; small completed world remains selectable and focusable. |

## Final audit matrix

FIXED denotes a reproduced defect repaired and checked. PASS denotes accepted bounded coverage without a reproduced regression. KNOWN LIMIT preserves a deliberate or unmeasured boundary. Existing browser regression names below refer to the final accepted full suite, not an assumed prior pass.

| Category | Status | Failure / severity | Root cause and action | Evidence |
| --- | --- | --- | --- | --- |
| Layout | PASS | Deep/wide/sparse geography; medium risk | Preserve caller/type append geography and anchors; no per-cursor layout | Nine JVM prefix/equality checks; observed depth/wide fixtures; spatial presentation tests |
| Labels | FIXED | Long identities, multiline text and name/value overlap; medium | Minimum scale overrode face fit; row/name/type text unbounded. Width wins; shared control escaping/marked summaries; Inspector wraps | Shared face/identity tests; all five-size DOMRange assertions; 01 and 06 original stills |
| Camera | PASS | Follow versus manual input, rapid changes; medium risk | Existing user-input priority retained | Fresh replay manual drag cancels Follow without pausing history; camera controls, soak |
| Focus | PASS | Small, huge, sparse and deep subjects; medium risk | Actual selected body/owner remains source; no identity-only substitute | Nine five-size Focus runs; sparse/large/ragged detail captures; native expanded runtime |
| Home | FIXED | Sparse envelope over-framing; low/medium | Empty envelope corners treated as occupied. Fit actual padded cuboid corners with fallback | Camera projection test; accepted same-model 64.028→59.229 range; soak 54 commands |
| Semantic zoom | PASS | Repeated macro/meso/micro crossings; medium risk | Preserve catalog-derived extent/hysteresis and bounded planner | Camera unit tests; sustained orbit/dolly; full spatial/browser regressions |
| References | FIXED | Array target floating below body, paths across header/neighbor cells, overlapping captions; medium | Shared actual header attachment; bounded represented-solid route for references and flows; stable caption priority collision yield | Ragged actual-model test, route tests, original detail stills, tube cleanup tests |
| Provenance | PASS | Unknown/derived/observed ambiguity; high risk | No semantic rewrite; exact graph evidence continues to prove arrows | Prior actual-JVM suites, four canonical rich digests, full coverage gates |
| Arrays | PASS | Huge/sparse/ragged/shared arrays; medium risk | Exact length/indices with bounded cell windows and prefix disclosure | 02 sparse value 73 at 10000, large/ragged desktop+narrow captures |
| Collections | PASS | 1,000 members/null and object keys; medium risk | Preserve verified JDK summary and bounded preview, no imagined members | Topology fixture; size 1000 Inspector/faces; prior collection coverage |
| Recursion | KNOWN LIMIT | Observer depth cap; high if execution killed | Limits unchanged; explicitly partial prefix, actual process continues | 03 exact completed output at live-frame cap; 07 full observed depth 71 |
| Exceptions | PASS | Wrapped/rethrow/finally/uncaught; medium risk | Actual throw/catch/unwind paths; opaque library boundaries explicit | 04 actual failing Java and opaque exception detail; prior debugger/exception suites |
| Static state | PASS | Many lazy families; medium risk | Recorded initialized classes only, persistent exact fields | 04 7→12→15; 08 24 actual families; prior statics tests |
| Timeline | PASS | Long history/random/reverse seeks; medium risk | Persistent replay/materialization semantics unchanged | Nine replays/prefix checks; 30 seeded UI seeks; fresh history video |
| Console | FIXED | Repeated presentation scan over I/O prefixes; medium | Append-aware weak presentation cache; exact cold/backward fallback | 1,000 versus 500,500 visit counter; cross-session/prefix/Unicode tests |
| stdin | PASS | Blank/delayed/Unicode/long reads; high risk | Submitted bytes distinct from consumed facts; waits independent of observer | Two real delayed UI waits in one session; case 05 long input; stdin proof |
| stdout | PASS | 2,000 lines and post-observer tail; high risk | Exact process pipes/archive retained | Fresh 05 byte/hash equality and final FINISHED; existing large-world output |
| stderr | PASS | 2,000 separate lines and uncaught causes; high risk | Channel identity preserved | Fresh 04 stderr assertions and 05 exact bytes/hash |
| IDE shell | PASS | Dirty/closed tabs, completed/stale worlds; medium risk | Shared canonical commands/source ownership preserved | Native edit/save/Run; existing IDE/recording handoff and tab suites |
| Menus | PASS | Inactive targets and dismissal; medium risk | Canonical registry, explicit target, keyboard focus restore | Seven tab actions, folder/file menus, Close to Right/Others/Saved regressions |
| Rename | PASS | Dirty nested folders, lost response/conflict; high risk | Existing receipt/byte-preserving/source-binding barriers retained | Existing canonical Save All/lost rename response/folder history, server filesystem tests |
| Quick Open | PASS | 1,000 duplicate basenames; medium risk | Exact relative path and keyboard selection | Fresh 1,001-file project selects `many/g0999/Shared.java`, identity 999 |
| Command Palette | PASS | Contextual actions/keyboard lists; medium risk | Existing registry and availability retained | Spatial shell palette/fuzzy path keyboard regression from Monaco |
| Debug | FIXED | Step Out skipped inline immediate caller; high | Normal return boundary only for active Step Out, outside recorder lock; no invented events | Actual scalar/void server tests; fresh 35-second pause, constructor/recursive steps, history independence |
| Responsive | PASS | 760×900 narrow / 1440×650 short; medium risk | Existing drawers/expand runtime retained; minimum face fit bounded | All nine worlds at five sizes; long-name range checks; actual native 847×771 expanded Focus |
| Accessibility | PASS | Keyboard/focus/reduced-motion workflows; medium risk | Labels, registry focus and motion policy preserved | Keyboard-only large Quick Open; menus/dialogs; camera reduced-motion regression. No full assistive-technology certification claimed |
| Performance / GPU | PASS | Sustained rendering and UI tails; medium risk | Finite opt-in async probe, geometry reuse and bounded routes | Final 180.873 s, 643 actions, 6,464 renders; measured GPU and CPU distributions |
| Memory | KNOWN LIMIT | Warm heap growth / finite duration; medium | Semantic retention measured separately; no universal leak assertion | Four rich probes; one-page five Runs; five reloads; ~6.93 MiB soak heap growth |
| Long sessions | KNOWN LIMIT | Semantic event/object/frame budgets; medium | Java continues; retained trace is explicit last-observed prefix | 03 live-frame and 05 object cutoff exact output; existing observer saturation/browser tests |
| Repeated runs | PASS | Stale asynchronous/session/source state; high risk | Existing session ownership preserved, previous world explicitly labeled after bad build | Five edited Runs, unique sessions/exact values/output, build failure then repair, no broken-source executing highlight |
| Project switching / JDT | FIXED | Explicit Retry stuck at workspace 409; medium | Only exact restart/not-open 409 reopens own project; retained draft flushes new generation | Two actual windows, unsaved MissingType draft diagnosed, disk unchanged; other errors remain errors |

## Visual convergence and limits

The renderer remains genuine cuboid geometry at stable XYZ coordinates. Source, Inspector and timeline complement an explorable runtime; fixes did not introduce decorative scenery or a separate dashboard visualization. Macro presentation retains topology clusters/quiet volumes; meso shows relationships; micro/Focus shows bounded real state. Cluster membership and label/cell budgets remain deterministic presentation, not invented runtime structure.

Moderate headings now keep their full names when they can fit; extreme names/types shrink only to a readable floor before marked ellipsis. Controls become visible escapes. Generic summaries retain exact recorded type in Inspector/source. Huge strings retain only actually recorded bounded evidence, not fabricated full content. Large object faces disclose hidden rows; large collections disclose preview bounds. Inspector exact-name wrapping no longer collides with values.

Reference picking remains separate from hairline drawing. Real array targets attach to real header geometry; ordinary/history/active flow routes share represented-body obstacles. Caption collisions yield deterministically while paths/ports remain selectable. This is a bounded local route (48 solids), not a universal projected collision-free solver. Arbitrary orbit may still project unrelated links over a face; full arbitrary-camera optimization is outside this checkpoint.

Short/narrow views can reduce on-world detail; runtime expansion is available and was used hands-on to inspect the face clearly. Not every piece of every box is simultaneously readable at all distances: overview intentionally suppresses detail, huge structures use windows/Inspector, and the user must Focus/expand for exact inspection.

## Lifecycle and runtime boundaries

Debug stays distinct from recorded-history replay: scrubbing to zero does not resume a paused JVM; Return to Live returns to the same actual head/session. The 35-second pause survives the watchdog. Completed worlds retain selection, Focus and exploration; replay remains explorable. Failed builds retain an explicitly labeled previous recording and suppress executing-line highlighting on incompatible source.

JDT still owns one language project per bridge. Explicit Retry now safely recovers displacement and unsaved text; simultaneous multi-project language work is not provided. Rename remains a path operation, not Java symbol refactoring. Recorder caps, unsupported/native/library boundaries, concurrency/identity rules and runtime coverage remain those documented in the Phase 4 coverage checkpoint. This hardening does not claim universal Java instrumentation.

## Recommended cinematic milestone

Keep RuntimeState → immutable scene catalog → bounded spatial planner → shared geometry. Add shared interactive/capture material and lighting tiers, neutral environment reflections, controlled body transmission with opaque readable faces, bounded contact shading/AO and optional capture-only depth of field. Validate semantic contrast and GPU/pass disposal before adding passes. No runtime architectural rewrite is required. Cross-GPU budgets, material samples, cold asset/text readiness and physical presentation remain blockers; see [CINEMATIC-READINESS.md](CINEMATIC-READINESS.md). No Phase 6 work was started.
