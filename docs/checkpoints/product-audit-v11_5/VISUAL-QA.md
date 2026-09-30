# Visual QA — Milestone 11.5

## Method

The lead inspected rendered full-size screenshots, compared references 06–11 and the design/camera/motion documents, reviewed decoded semantic replay frames, and used browser assertions for identities, selection, lens and active session ownership. The supplied references guide extrusion, runtime vocabulary and spatial continuity; their unsupported object internals are not evidence of JVM coverage.

The screenshots use 1728×1117, 1440×900, 1280×800 and 760×900. Each viewport settles before capture. Retained graph reload/scrubbing is the same completed session; replay does not launch Java. JSON files record identities and measurement definitions.

## States reviewed

| Group | Review |
| --- | --- |
| `startup-*`, `banking-code-*`, `explorer-context-*` | Explicit project entry, managed-copy wording, code/editor conventions, visible contextual file actions; narrow entry does not require internal shortcuts. |
| `banking-input-*`, `banking-debug-entry-*` | Current source, real stdin and actual JVM pause coexist with the runtime; output and step controls are visible. |
| `banking-completed-*`, `dispatch-completed-*`, `person-completed-*` | Accumulated invocation bodies remain, retained data is distinct, references terminate on actual ports; whole-world depth is clear from extrusion and perspective. |
| `banking-focus-active-*`, `banking-focus-completed-*` | Front-face approach, readable `this`/parameter rows, same selection through main completion, visible Exit Focus and Return to world. |
| `banking-focus-failure-*`, `banking-error-stack-*` | Failed/unwound identity persists with red exception accents; source/error stack remains accessible at 760 px and Focus does not reset. |
| `graph-polished-*`, `graph-focus-*`, `graph-deep-focus-*` | Large persistent catalog, quiet instanced volumes and archived detail promotion at stable anchors; selected Node fields and deep recursive frame inspect independently of overview density. |
| `focus-large-object-*`, `focus-tiny-object-*`, `focus-int-array-*` | Tall 13-field body, honestly empty project object, and 12 indexed cuboids. All values remain in Inspector; face string summaries are explicitly ellipsized instead of shrinking into unreadable text. |

Final regenerated screenshots were reviewed after the passing 85-test suite. The captured states meet the depth, persistence, inspection and viewport acceptance criteria within the stated bounds.

## Critique and fixes

- **Flatness/depth:** kept real X/Y/Z solids and side/top reveal; canonical Focus approaches +Z rather than keeping a distant overview orientation. Free orbit/pan/dolly still takes ownership.
- **Clutter:** stopped mounting hidden Classic geometry, removed outgoing duplicates and normal-startup demo controls, closed action menus, separated Explorer visibility from manual pane sizing.
- **Completion:** screenshot inspection found dim blue detailed frames despite grey archival instances. Shared neutral body/face/slot tokens now make completed frames visibly grey; selection and exception accents remain semantic.
- **Labels:** removed billboarding/x-ray text, enabled fitting face details during Focus, enlarged inspection rows, shortened package labels while keeping full Java class/type in Inspector. Long strings use a marked face summary; numbers/references retain their exact displayed identity/value.
- **Containment:** all observed heap rows reserve body height. Bounded frame plates avoid crossing titles/bottom faces; overflow disclosure and canonical terminals keep Inspector/reference truth intact.
- **Controls/timeline:** array summary sits below inspection controls; event-dot density follows viewport width without moving event coordinates or duplicating the live-head dot.
- **Camera:** Focus isolates presentation at the same anchor, preserves completion/failure/debug view, re-fits on resize and reserves the actual Inspector shelf. Expanded runtime collapses ordinary Console; pending input and errors remain reachable.
- **Scale:** large-world far plane/fog use reserved extent; instanced history and bounded detail prevent an empty-looking or label-saturated world. Whole-world labels are intentionally not readable at every zoom.

## Motion evidence

`banking-semantic-replay.mp4` samples ten retained-trace transitions: input consumed, call entry, project object observation, parameter declaration, balance 100→125, scalar return, method exit, stdout, main exit and program end. Samples reset to just before each event and step once; they are representative replay transitions, not one uninterrupted live chronology. The recorder observation of an object is not claimed as an exact bytecode NEW timestamp. Unknown-origin parameter/I/O changes stay local rather than fabricating caller paths.

Review checks that written values are committed on the actual destination, completed bodies remain and grey out, the map emerges from accumulated geometry, and user-controlled camera work does not launch/reorder execution. Approximate capture times and event cursors are recorded in `banking-motion.json`; no GPU frame-time or smoothness percentile is claimed.

## Final lead acceptance

Passed for the recorded cases. Completed invocation solids are neutral grey in overview and inspection; final heap data remains purple/readable. Failed frames retain red exception context. The selected target survives call/main completion and failure without an unrelated scene or camera reset. Deep archived invocations promote at their original anchors. Free orbit/pan/dolly remains available during replay/recording and overrides scripted movement.

The last failed-frame screenshot exposed row text taller than its compact plate. Name, type and value glyph sizes are now bounded to 80% of plate height, including mutation-emphasis clearance. Refreshed failure/deep-frame and large-object screenshots show separate readable rows. Long string summaries are marked; full strings and omitted frame values remain in Inspector. This is bounded inspection legibility, not a promise that every value fits at every zoom.

Reviewed final semantic-video frames and the field-write sequence: balance commits from 100 to 125 on the Account face; exited frames remain grey cuboids, main changes from active to completed in place, and the accumulated execution map persists. Motion samples reset before individual events; unknown origins are not depicted as proven flows. The clip is extracted from the final browser run and preserves its aspect ratio.

84 PNGs retained: 74 fresh audit-state captures, six refreshed Person regression captures, and four `fresh-*` pre-change baselines. Target dimensions: 1728×1117, 1440×900, 1280×800 and 760×900. Historical M11 checkpoint images were restored after copying the refreshed regression captures here. Representative final artifacts: `banking-completed-1440x900.png`, `banking-focus-failure-760x900.png`, `graph-polished-1440x900.png`, `graph-deep-focus-760x900.png`, `focus-large-object-760x900.png`, and `person-completed-1440x900.png`.

Retained graph reload **5,266 ms**; individual scrubs **212/302/840 ms** at cursors 10,776/7,184/21,553. The scrub metric is UI commit plus two browser animation frames; these are individual samples, not GPU presentation, percentiles or an FPS guarantee.
