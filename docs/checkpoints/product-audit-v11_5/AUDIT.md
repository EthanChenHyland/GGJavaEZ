# Milestone 11.5 — product, runtime and usability audit

Baseline: `dfa3091`. **Completed audit, fixes and final lead acceptance — 2026-09-30.** This report was written before the separate milestone commit; final acceptance evidence is recorded below.

## Critical

| Finding | Resolution |
| --- | --- |
| Returned invocations disappeared during live execution; the final map replaced the scene. | **Fixed.** Every observed invocation remains continuously at its stable XYZ. Completed calls grey out; unwound calls retain exception context. Deleted outgoing dissolve/ghost geometry. |
| Recorder IDs restart in each JVM; selection could cross sessions. | **Fixed.** Workspace identity follows the owning session trace. Growing prefixes retain state; a genuinely new observed recording resets semantic selection. |
| A failed new build retained the old trace but reset its displayed cursor to zero, leaving an empty world. | **Fixed and targeted-browser verified.** Retained traces keep their terminal head/replay lens. Previous recording is explicitly labelled; Console/source/Error Explorer belong to the current session. The test asserts retained completed entities, not merely a mounted canvas. |
| Dirty file/folder deletion could discard drafts. | **Fixed and browser verified.** Affected descendants require Save / Discard / Cancel before mutation; Cancel preserves drafts. |
| Large recorded programs could look empty or stall navigation. | **Fixed and measured.** Camera clipping/fog follow world extent; quiet records retain instanced cuboids; expensive faces/connections and seek snapshots are bounded; large collision routes use linear candidate checks. No runtime identities/anchors are discarded. |
| Repeated project/revision indexing accumulated about 13 GB of JDT caches, exhausting this computer during QA. | **Fixed and measured.** Eight recent generated indexes and one active launch config remain; filesystem tests protect active paths, unrelated entries and symlinks. Source/projects/tools and the active index were preserved. The interrupted browser run is not counted as a passing gate. |

## Major

| Finding | Resolution |
| --- | --- |
| JVM layout depended on ID prefixes and curated shallow geometry. | **Fixed.** Explicit capture provenance selects generic append-only layout. Exact recorded callers drive return attention. Curated layout is isolated on `/examples`. |
| Parameter/stdout motion invented origins absent from capture. | **Fixed.** Unknown-origin changes stay local. Observed and correlated provenance remain distinct. |
| Startup automatically opened a starter; project entry was obscure on narrow screens. | **Fixed and rendered.** `/` and `/ide` show an explicit chooser unless a valid saved project exists. Open Project / Import folder (copy) / New Project are visible at 760 px. |
| New file/folder creation assumed `src/`; folder import implied editing originals. | **Fixed.** Contextual/root defaults and safe package inference; visible managed-copy wording. |
| Focus was occluded, could lose context on completion, or display blank faces. | **Fixed and rendered.** Isolate the owner at its original XYZ; approach the front face with a small depth reveal; re-fit scripted Focus on resize. Inspection bypasses overview label suppression. Selection and immersive layout survive returns, main completion, failure and Debug pause. |
| Tall objects were too small in immersive inspection; summary text collided with controls. | **Fixed and rendered.** Actual shelf insets, shared inspection text scales, full object row height, and summary placement below controls. Expand runtime collapses ordinary Console; pending input/error inspection remains available and Console can reopen visibly. |
| JDT remained indexing indefinitely; plain source roots/output paths were invalid. | **Fixed and measured.** Private output, source trigger URIs and Started + ServiceReady readiness; failure cannot resurrect as ready. Actual fresh-Maven completion offers the project method `post`. |
| Unrepresentable scalar updates left stale prior values; observed Strings in Object/CharSequence slots could invalidate normalization. | **Fixed.** Unsafe/nonfinite values become unavailable with partial coverage; Strings are accepted in known compatible supertypes. |
| Explorer visibility blocked Run's runtime emphasis; More actions remained over content. | **Fixed.** Explorer and pane-width ownership are separate; actions/Escape close More. |
| Classic siblings overlapped and return/reference history was inconsistent. | **Fixed for finite diagram projection.** Distinct sibling positions, truthful retained return sources and historical edges. Hidden Classic has no duplicate runtime DOM. Large-history virtualization remains optional Classic debt. |
| Successful `FULL` capture could imply every Java construct is supported. | **Clarified.** Visible Capture limits and the 33-concept coverage matrix separate execution success from bounded observation support. |

## Minor / polish

- Face-aligned, depth-tested labels replace billboard fragmentation and x-ray text.
- Neutral completion body/face/slot materials make detailed frames visibly grey; selection and exceptions retain shared accents. Long strings use marked readable face summaries with full Inspector values.
- Shared frame/heap inspection text scales and compact Inspector headings improve legibility. Long strings remain fully accessible in Inspector rather than being promised to fit a finite face.
- Object faces reserve all observed field rows. Frame faces disclose omitted rows and retain canonical terminals/full Inspector values.
- Timeline dots respect viewport density without shifting event coordinates or doubling the LIVE marker.
- Archived detail promotion does not replay entry/allocation motion. Reduced motion stays authoritative.
- Exact modifier matching, physical codes and native labels replace the duplicate Save All alias. Monaco's actual command/Go to Line contributions are loaded; F9 has a visible editor action/context menu.
- CSS cleanup removes 89 superseded declarations and 50 obsolete rules, roughly 19% of IDE CSS; responsive/reduced-motion effective declarations were compared.
- Generic return/array captions do not invent an algorithm or claim an arbitrary last return is main's result.

## Confirmed working

- One ExecutionSession → normalized trace → pure RuntimeState → persistent scene pipeline, central tokens and genuine WebGL XYZ cuboids.
- Final browser regression gate: **85/85 passed**, 6.7m.
- Latest full unit/integration gate: **591 tests / 62 files passed**, 47.61s; final typecheck/build and lint passed.
- Actual visible import/edit/save/Run with fresh Maven banking, Gradle dispatch and plain graph projects. Maven additionally verifies stdin, project-method completion, F9/F1/gutter Debug breakpoint, failure/source navigation and retained replay.
- A fourth bounded plain shape probe verifies 13-field object, zero-field object and 12-cell int-array Focus at all four target sizes.
- Free orbit/pan/dolly overrides camera scripts while recording/playback continues; Home, Focus, Follow, Trace Path and history navigation remain available.

## Removed legacy and preserved compatibility

Removed normal-route demo chooser/startup starter fallback, outgoing ReturningFrame component/state, duplicate visualization Console/status/raw-event copies, legacy Save All alias and concrete superseded CSS. `/examples`, curated traces, finite recorder/visualize compatibility APIs, and starter-helper tests remain deliberately. No claim of deleting every historical module.

## Post-V10 diff and subagent review

The lead reviewed `aae90db → 636436b → dfa3091` and the working diff. Shared ExecutionSession and semantic motion were useful foundations; completion still removed live frames, projections duplicated ownership, shallow fixture assumptions leaked into real layouts, and layered CSS/shortcut changes obscured behavior. This audit preserves shared runtime contracts and tokens while correcting projection, persistence, provenance and density. Commit metadata does not establish model authorship; findings concern code, not inferred authors.

Focused subagents: Pascal (Explorer/usability), Lovelace (causal-motion/shortcuts), Noether (runtime provenance/layout/picking), James (fresh Java sources), Planck (bounded replay/face geometry), Hume (JDT readiness/cache hygiene/coverage reports), and Rawls (CSS convergence). The lead reviewed diffs and owns integration, architecture, visual consistency and final QA.

## Rendered QA and first-use verdict

Required sizes: **1728×1117, 1440×900, 1280×800, 760×900**. Captures include chooser, project/source, Explorer menu, stdin/live Run, completed/grey world, Debug entry, active/completed/failing Focus, Error Explorer, fresh Gradle/large graph, and large/tiny/array Focus. Deep historical recursion Focus is included in the final graph run.

Comparison against references 06–11 and the design/camera/motion/QA documents checks actual extrusion, top/side faces, perspective, lighting, stable anchors, readable inspection and semantic colors. Grey history and purple heap data form the execution map from existing geometry. No decorative environment or per-project design system was added.

First-use answers are visible: chooser opens/imports Java; Explorer context menu creates classes/files/folders; Run/Debug execute; Console holds output/input; Spatial and the timeline identify execution; selection opens Inspector; Focus/Expand runtime enters inspection; Return to world/Exit Focus exits; source/Console/Inspector can reopen. Completion retains the accumulated world and replay.

## Remaining limitations

- Static fields, object/other primitive/multidimensional arrays, library/collection internals, generated-class loading, file-I/O semantics and multithread worlds are unsupported or partial. Reflection/library writes can leave last-observed fields stale. Unsafe long/nonfinite values are unavailable.
- Recorder limits: 20,000 raw events, 8 MiB trace, 30 s active recording, 256 cumulative identities and 128 live frames. Capture success is not complete Java coverage.
- Large Spatial restore takes several seconds; measured scrubs are individual UI commit plus two animation-frame wall times, not GPU/FPS or percentile guarantees.
- Optional Classic has no large-history virtualization. Spatial is the default; High motion remains the fresh-store default and reduced motion overrides it.
- Monaco/runtime bundle warnings remain. Native macOS UI was exercised; Windows/Linux shortcut contracts and labels were verified synthetically, not on those operating systems.
- Full arbitrary strings/values require Inspector or further zoom; finite overview faces cannot expose every row at every camera distance.

## Final validation appendix

All final gates passed after the compact-row typography correction: **591 tests / 62 files (47.61s)**, **85 browser tests (6.7m)**, build/typecheck, configured lint and diff whitespace checks. [Exact commands and retained logs](VALIDATION.md). The earlier ENOSPC and failed intermediate runs are diagnostic history, not acceptance evidence.

The lead reviewed final regenerated screenshots at all four sizes, including neutral completed frames, large graph overview, active/completed/failed and deep Focus, shape probes and first-use shell; references 06–11 remain the design comparison. RuntimeSlot text is now bounded by actual plate height, resolving the last compact failed-frame row overlap. [Visual review](VISUAL-QA.md), [semantic replay](banking-semantic-replay.mp4), [motion sample definition](banking-motion.json).

Retained graph reload **5,266 ms**; individual scrubs **212/302/840 ms** at cursors 10,776/7,184/21,553. The scrub metric is UI commit plus two browser animation frames; these are individual samples, not GPU presentation, percentiles or an FPS guarantee. The graph retains 1,756 invocations and 136 objects; reload and scrub use the same session and do not launch Java. Detail/seek/cache bounds mitigate costs but do not establish arbitrary-program scalability. Eight generated JDT indexes and one config remained after the passing full suite.

Milestone 11.5 acceptance applies to these measured workflows and the documented generic contracts. Missing Java observations and optional product debt remain explicitly listed above and in the coverage/simplification reports.
