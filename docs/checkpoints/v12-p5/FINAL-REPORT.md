# Phase 5 completion report — Spatial 2.0

Implementation, visual iteration, validation, hands-on audit and performance measurement are complete. The authorized dedicated commit uses `feat: transform GGJavaEZ into Spatial 2.0` and normal push to `origin/kiro-runtime-audit`; exact commit/remote tip and tracked status are reported after Git verification in the final handoff. Base is `3b1364d8d9b6ed45560adf07d86901084382d30b`. No squash, force push, rewritten Phase 0–4 history or Phase 6 work.

## Product transformation

GGJavaEZ now opens as one runtime workspace with a compact rail, adjustable genuine Monaco source wing, contextual Inspector and integrated timeline/Console. The actual observed invocation, object, array, class and I/O identities determine the genuine Three.js geometry. The same accumulated world remains after completion and supports time travel and free exploration. Ordinary Java projects still use the existing plain/Maven/Gradle providers, launch configuration, JDT, debugger and saved-source manifests; renderer behavior is not chosen by example/algorithm names.

Compared with `best.png`, runtime occupies the dominant workspace, source is subordinate when running, blue stack and purple heap have a shared rectangular grammar, references visibly attach to their real endpoints, and time controls belong to the world. The other root concepts inform recursive depth, arrays, focused faces, return history, exceptions and semantic zoom. Deliberate differences: restrained glow, opaque information surfaces, actual class storage, explicit bounded/unknown/partial disclosure, canonical process Console, no invented loop frames, guessed provenance or reconstructed opaque library internals. Concepts can show every label at once; arbitrary recorded programs use bounded labels, search, zoom, Focus and Inspector.

## Editing and shell

| Area | Implemented / retained behavior |
| --- | --- |
| Source integration | Real Monaco models, diagnostics, executing-line/source synchronization and dirty-draft recovery; adjustable source width persists independently of expanded editing |
| Explorer | Existing confinement, lifecycle and rename receipts remain authoritative; tree navigation, reveal, open, new file/folder/class and resource operations |
| Activity rail | Explorer, Quick Open, Run & Debug, Problems, Source and Console through canonical commands, not duplicate editor state |
| Editor-tab context menu | Close, Close Others, Close to Right, Close Saved, resource Rename, Reveal in Explorer, Copy Path; keyboard navigation and focus restoration |
| Explorer context menus | Context-appropriate open/rename/delete/reveal/copy and folder new-file/class/folder; availability checked against captured project generation |
| File Rename | Canonical existing filesystem operation, dirty-draft/path reconciliation and source/JDT barriers retained |
| JDT symbol Rename | Separate editor F2 / Java command, real language-service workspace edits; resource Rename does not masquerade as symbol refactoring |
| Quick Open | Case-insensitive ranked subsequence matching of actual project paths, bounded 100-result picker |
| Command Palette | Shared command registry, availability reasons, keyboard navigation; Build, Launch Settings, Java symbols/JDK and editor actions remain reachable |
| Run & Debug UX | Primary Run/Debug plus truthful Stop state; existing real build/launch, breakpoints, step commands, Console input and Error Explorer |

## Runtime geography and observation

| Area | Final behavior |
| --- | --- |
| Stack | Stable append-only invocations tied to recorded caller/sibling identity; four X columns with later Z bands |
| Recursion | Unique nested invocations descend below actual parents with real Z depth; no factorial-specific rule |
| Call history | Completed/unwound records remain at the same anchor; physical caller links require accepted graph CALL evidence |
| Heap | Deterministic project-type shelves separate from external/library shelves; append allocations down each type's Z lane |
| Static state | Neutral class-storage solids for real RuntimeClass identity/initialization/fields; no fake object instances |
| Object inspection / fields | Exact observed values precede metadata in Inspector; measured opaque faces, six physical field rows and explicit overflow |
| References | Actual frame/object/class/sparse-cell relationships; face ports, exterior channels, shared visible/picking/arrow route; no lines inferred from proximity |
| Provenance / return flows | Bounded graph adjacency and exact event identity; proven existing source/destination paths only, correlated/unknown evidence remains disclosed |
| Constructors | Actual allocation, constructor invocation and `this` binding; one-time first invocation framing under Home/Guided, no camera override in Free Explore |
| Primitive arrays | Physical indexed cuboids in bounded eight-column rows; true index/read/write/null/unavailable state, no invented swap or sort conclusion |
| Reference / ragged arrays | Actual array identities and cell references connect to real target arrays/objects; sparse observations append without shifting earlier anchors |
| Collections | Existing bounded library observations, genuine relationship previews, explicit last-observed state; no guessed internals or fabricated membership |
| I/O | Fixed stdin/stdout/stderr cuboids appear only after actual consumption/emission; submitted bytes alone are not consumed input; authored graphless traces remain compatible |
| Console | Canonical complete process pipes/exit/input; visualization limits do not truncate Java stdout or terminate the application |

## Navigation, time and execution lifecycle

| Area | Final behavior |
| --- | --- |
| Semantic zoom | Macro actual group names/counts, meso bounded entities, micro readable selected faces; representation changes without changing semantic state/anchors |
| Clustering / library collapsing | Actual membership and stable representative identity; external catalog separated; full catalog stays searchable/inspectable |
| Label budget | Bounded camera-facing overview names with overlap culling; suppress microscopic native macro text; selected Focus restores exact detailed faces |
| Home | Fit represented group bounds and selected context; distant last allocation does not crush the overview; explicit far selection still Focuses its unchanged anchor |
| Focus | Pan/dolly toward the front information face with modest side/top depth, viewport insets and at most two nearby observed neighbors; overflow slot frames actual owner |
| Trace | Follow the selected actual reference route and endpoint context; unknown/departed targets fail closed |
| Free navigation | Real orbit/right-pan/dolly; user input cancels automation immediately, including while playback advances |
| Timeline / time travel | Deterministic forward/backward steps, arbitrary scrub, Live/history distinction, Return to Live; direct scrub snaps without intermediate motion replay |
| Debug / breakpoints | Real project entry/breakpoint state, exact source, Step Over/Into/Out, Continue/Pause/Stop; actual first invocation remains visible |
| Exceptions / Error Explorer | Existing actual throw/unwind/catch/finally facts; localized red, retained call history, actual caught and uncaught source links |
| Partial recording | Explicit limits/reasons/last-recorded boundary; process continues, unobserved tail is not invented |
| Completed / failed world | Same accumulated runtime map persists on success, uncaught failure and later failed build; no replacement summary scene |
| Responsive behavior | Captured/asserted 1728×1117, 1440×900, 1280×800, 760×900; source/Console remain reachable, first selected row complete in short Inspector |
| Accessibility / reduced motion | Semantic buttons/menus/listboxes, keyboard commands/focus restoration/visible focus and keyboard dividers; reduced-motion navigation/transfer behavior tested. No formal WCAG certification claim |

## Rendering and performance

Presentation contracts were locked before parallel work. Shared bodies/inset faces/materials/typography/semantic colors cover frames, heap, arrays, class storage and history. Bounded LOD plans, quiet-volume instancing with separate bounded picking, selected-priority faces/cells, memoized immutable projections and coarse navigation relevance updates limit renderer work. Classic retains accurate statics/reference/sparse arrays and variable bounds while preserving curated small layouts. No RuntimeState, ExecutionGraph, recorder, normalizer, filesystem, provider, debugger or JDT semantics changed.

| Measurement | Evidence-backed result |
| --- | --- |
| Phase 4 dense load | 3214 ms |
| Phase 5 dense load | **1984 ms**, 38.3% lower on same ordinary graph-stress workload |
| Phase 4 three seek samples | 741 / 493 / 482 ms; not a distribution |
| Phase 5 matching seeks | 234 / 189 / 114 ms |
| Phase 5 30 seek p50 / p95 | **67.01 / 109.82 ms** |
| Five Focus p50 / p95 | **97.50 / 118.78 ms**; descriptive small sample |
| Five Home p50 / p95 | 181.93 / 188.89 ms; descriptive small sample |
| 30 orbit action p50 / p95 | 66.44 / 85.94 ms |
| Largest controlled semantic retention | **353.33 MiB vs Phase 4 353.18 MiB**, all four graph digests identical; earlier 817.76→353.18 improvement preserved |
| CPU presentation retained delta | About 1.12 MiB over constructed cross-feature history/catalog; excludes React/GPU/Troika/navigation |
| Final macro renderer counters | 27 mounted texts, 5 visible labels, 42 click targets, 125 draws, 22,496 triangles, 130 geometries, 4 textures |

Cold cause was repeated JSX allocation for 1933 existing project options and small retained transport catch-up batches; memoization and existing bounded limit 1024 preserve every project/raw fact. Guarded same-recording browser-only baseline comparison measured 3275→2280/2285 ms. UI action timing includes commit plus two frames; no physical GPU latency or FPS claim. PERFORMANCE.md separates JVM, CPU presentation, explicit-GC retention and whole-browser uncollected heap.

## Validation and reviewed evidence

**1351 unit/integration passed** with 52 explicit opt-in skips; **191 acceptance passed** with four declared expected failures; **106/106 full browser**, then **8/8 + 8/8** affected browser checks (overlapping cases); **85 explicit real-JVM tests / five files**. Build/typecheck and lint pass. Final full browser predates the last small Inspector/overflow/I/O changes; focused runs and final unit/build gates validate those refinements. All 49 curated hashes are unchanged; JVM presentation goldens intentionally update geography. VALIDATION.md has exact commands and chronology.

Visual review: **29 lead final originals**, **42 independent historical originals**, **14 lead iteration originals**, separately from 113 accepted captured PNGs. **Four videos sampled through nine original frames**; native manual sequence verifies **17 exact cursors**. QA-MANIFEST.json enumerates counted files. HANDS-ON.md records actual new-program editing, file rename, stdin, completed Box value, free exploration, Debug, caught/uncaught exceptions and failed-build retention. It distinguishes native actions from automated pan/dense/partial coverage.

Subagents: Beauvoir (shell), Raman (primitives/Classic), Planck (LOD/renderer), Hooke (camera), Erdos (workspace regressions), Goodall (42-still independent critique), Banach (authored I/O regression). Lead retained architecture, contracts, geography, integration, final visual fixes and serialized validation. REVIEW.md's four findings were fixed, not merely reported. A second resumed reviewer hit its usage limit and is not counted as approval.

## Remaining bounds and recommended Phase 5.5

Actual runtime tested: **OpenJDK 26.0.2.1 on macOS arm64**; release-17 build settings do not certify JDK-17 runtime compatibility. Existing project-level observation limits remain for threads, dynamic loaders, native/opaque operations, unavailable provenance, bounded arrays/collections/strings and relative process-pipe/recorder ordering. No new concurrency/JVM semantics were added.

Rendering limits: large Monaco/main chunks and Troika import warnings; arbitrary long labels/values and very short split layouts still require Focus/Inspector/scroll; full-catalog coarse traversal and text/GPU residency need sustained second-machine profiling. Older curated control readout overlap merits small-layout cleanup. The native audit reproduced an existing single-current-project JDT retry limitation after another QA workspace took ownership; project reopen restored it. Phase 5.5 should prioritize novice editing/Run recovery, long names/values, sparse/ragged-cell navigation, multi-workspace language-service retry and sustained GPU/text-memory torture audits. **Stop at Phase 5; do not begin Phase 6.**

## Visual references inspected — complete file inventory

- `best.png`
- `ChatGPT Image Oct 3, 2026, 02_20_44 PM.png`
- `ChatGPT Image Oct 3, 2026, 02_21_05 PM.png`
- `ChatGPT Image Oct 3, 2026, 02_21_08 PM.png`
- `ChatGPT Image Oct 3, 2026, 02_21_12 PM.png`
- `ChatGPT Image Oct 3, 2026, 02_21_17 PM.png`
- `docs/visual-java-spec/references/00_REFERENCE_BOARD.png`
- `docs/visual-java-spec/references/01_world_overview.png`
- `docs/visual-java-spec/references/02_navigation_modes.png`
- `docs/visual-java-spec/references/03_semantic_zoom.png`
- `docs/visual-java-spec/references/04_person_world_sequence.png`
- `docs/visual-java-spec/references/05_theater_continuity.png`
- `docs/visual-java-spec/references/06_true3d_person_runtime.png`
- `docs/visual-java-spec/references/07_true3d_object_inspector.png`
- `docs/visual-java-spec/references/08_true3d_recursion.png`
- `docs/visual-java-spec/references/09_true3d_array_sort.png`
- `docs/visual-java-spec/references/10_true3d_reference_sheet.png`
- `docs/visual-java-spec/references/11_true3d_scene_language.png`

The five root `ChatGPT Image Oct 3, 2026, ...` files above remain untracked and untouched. `best.png` and all specification references retain their original tracked bytes. They are user reference inputs, not checkpoint output.

## Launch

```sh
npm run dev -- --port5173
```

Open `http://127.0.0.1:5173/ide`. The existing owned dev pair is left running; do not launch a second listener on the same ports.
