# Milestone 4 — Control flow, scope, and console acceptance

Reviewed September 27, 2026, from the `98e7059` Milestone 3 baseline. The existing Person, recursion, and arrays/Theater slices remain on the same trace → pure reducer → semantic state → persistent layout → Classic/Spatial/Theater pipeline. This milestone adds no IDE or JVM instrumentation.

## Semantic slice

The curated `Main.java` reads three integers through a `Scanner`: `-7`, `42`, and `130`. `clamp` exercises `if`, `else if`, and `else`, returning `0`, `42`, and `100`; the for loop prints each score and then the total `142`. Its 72-event trace records source locations, branch operands/results and taken/skipped paths, loop iterations and termination, scope entry/exit, method calls/returns, and ordered input/output.

The reducer owns all execution truth. Console entries reconstruct from the current event cursor, so reverse stepping removes later I/O. Scoped variables exist in the live state and both representations only while their block is active. Each activation retains a lifetime record for inspection after closure; its former geometry disappears. Lexical scope and slot IDs retain reserved rows through repeated iterations and arbitrary scrubbing. The layout reserves real XYZ anchors once from the whole trace. The Scanner is a heap cuboid connected to the live `input` slot in the stack frame.

Classic renders nested block contours and rows. Spatial renders shallow extruded scope plates within the same stack cuboids and keeps row ports in world coordinates. Both use the same SceneModel, design tokens, source cursor, selection, inspector, and timeline. Branch and loop facts remain visible in the control status surface, independent of guidance. The console is a generic read-only projection of runtime entries. Theater remains disabled for this example because the two existing representations already show the method and block structure.

## Delegation and integration

| Agent | Focused work | Lead review and integration |
|---|---|
| Curie | Control trace, validation, reducer, lifecycle tests | Reviewed event preconditions, exact seek semantics, variable lifetime, snapshot isolation and fixture/source agreement |
| Singer | Classic scoped projection, renderer, styles and tests | Reviewed shared IDs, nested groups, active-only rows and selection |
| Feynman | Spatial scope plates, labels and primitive tests | Integrated with shared materials, frame geometry, row ports and final label polish |
| Hilbert | Generic console pane, styles and tests | Connected to cursor-derived entries and desktop/narrow shell |
| Raman | Browser regression coverage and initial visual review | Reconciled one historical-inspector test expectation, ran full suite and performed final screenshot QA |

Curie, Singer, and Raman reached their session limits after writing their work; the lead reviewed their files and performed all integration, tests, visual corrections, and acceptance checks. Shared contracts, spatial layout, navigation semantics, visual direction, and final QA remained lead-owned.

## Validation

- `npm run typecheck`: passed as part of the production build.
- `npm run lint`: passed.
- `npm test`: **308 tests passed in 22 files**. These cover prior milestones plus scoped lifetime, branching, loop facts, I/O rewind, validation, snapshot isolation, reserved anchors, and renderer projections.
- `npm run test:e2e -- --workers=1`: **29 browser tests passed**. All Person, recursion, arrays/Theater and new control tests pass, including mode switching, finite execution, reverse scrubbing, live/closed scope inspection, Scanner path, Home/Focus, and free exploration overriding Follow during playback.
- `npm run build`: passed. The existing Three.js/Monaco large-chunk advisory remains.
- Production preview smoke: Control reached cursor 21/72 with the first input in its console, and Person 21/21, Recursion 36/36, and Arrays/Theater 122/122 rendered; no page errors.
- `git diff --check`: passed.

The browser suite ran with one worker to avoid concurrent WebGL load; a prior multi-worker run had a Person picking timeout which passed when rerun serially. The suite also corrected a test assumption: the selected, closed variable remains in inspector history while it disappears from both runtime views.

## Screenshot and visual review

Fifty-four PNGs are retained in this directory: six semantic checkpoints × Classic/Spatial × **1440×900, 1728×1117, 1280×800, and 760×900**, plus selected Focus and free-orbit captures at 1440×900 and 760×900. Four contact sheets and the important full-size captures were inspected against true-3D references 06–11 and the binding design, visual language, spatial world, scene consistency, camera, motion, performance, and polish documents.

| State | Applied-event cursor |
|---|---:|
| Before first input | 13 |
| First input consumed | 14 |
| First taken branch and `corrected` declaration | 21 |
| First iteration body closed | 26 |
| Second loop iteration | 29 |
| Final output and completion | 72 |

- [1440×900 matrix](review-matrix-1440x900.jpg)
- [1728×1117 matrix](review-matrix-1728x1117.jpg)
- [1280×800 matrix](review-matrix-1280x800.jpg)
- [760×900 matrix](review-matrix-760x900.jpg)
- [Spatial taken branch](spatial-taken-branch-1440x900.png)
- [Spatial free orbit](spatial-orbit-1440x900.png)
- [Spatial Focus, narrow](spatial-focused-760x900.png)
- [Classic Focus, narrow](classic-focused-760x900.png)

The default and orbit captures show genuine top and side faces, separate Z placement of the call frames and heap object, perspective, occlusion, shadows, and the Scanner reference in 3D. The geometry remains runtime-derived: no decorative city, fake perspective cards, excessive bloom, or unrelated scene objects. Classic and Spatial show the same values and disappearances at each cursor. At 760 px the source compresses to the active line, the console expands beneath the runtime, and controls and inspector remain usable.

## Polish pass

1. Enlarged shallow scope captions and fitted long scoped row values, including `return pending`, within the frame face.
2. Reserved scoped Home bounds and kept the selected local's owning frame in the Focus composition above the inspector shelf.
3. Removed a floating STACK caption from the scoped 3D scene after an orbit capture showed it overlapping the clamp frame; the frame itself already identifies the stack.
4. Suppressed stale return-flow graphics in scoped scenes after the relevant return/exit event, while retaining semantic return history in state.
5. Preserved a selected closed variable's last value in the inspector and disabled Focus until it becomes live again on rewind.
6. Kept branch, loop, and scope facts compact above the geometry and the console outside the WebGL world, avoiding dashboard-like overlays on runtime solids.

## Performance and limits

See [performance.json](performance.json) for the measured sample. The target was installed Chrome headless with ANGLE WebGL at 1440×900, balanced quality. Render timestamps come from WebGL draw calls; scrub latency includes Playwright roundtrip. This is a bounded automated review, not a claim about every device.

- Orbit: **121 rendered frames at 60 fps** active cadence, with 16.666 ms median and p95 intervals.
- Input update: nine rendered frames at about 60 fps during the bounded transition; too few for a continuous-rate claim.
- Playback: **59.9 fps active cadence** across 13 rendered frames. Demand rendering pauses between discrete events, so the whole 1.65-second interval has a lower draw frequency; its 700 ms p95 interval is an idle gap, not a slow rendered frame.
- Idle: **zero rendered frames** in one settled second.
- Arbitrary scrubbing: **11.05 ms median / 22.09 ms p95** browser roundtrip across 100 seeks.
- Collected JS heap: **61.70 → 62.10 → 62.96 MB** before, after 100 seeks, and after 200 seeks. This bounded run shows no large rebuild spike; longer-run memory stability remains to be measured on physical target hardware.

The current inputs and outputs are deterministic mock trace facts, not interactive stdin or real JVM execution. Scanner parsing is limited to the curated `nextInt` case. Variable shadowing, more operators, exceptions, file I/O, Java project import, compiler/JDK integration, and AI assistance remain later work. Theater has no scoped-specific presentation. The production bundle still reports the existing large Three.js/Monaco chunk advisory.

Launch: `npm run dev -- --port 5173`.
