# Milestone 2 — Recursion

Continues clean baseline `7dc740a`. The defining architecture remains trace → pure reducer → persistent layout → shared SceneModel → Classic/Spatial. Curated examples are replaceable trace/source inputs; no separate recursion execution engine, JVM instrumentation, IDE import, arrays, or AI features were added.

## What works

- Finite 36-event factorial(5) fixture with six distinct invocation IDs, n parameters, declared evaluation operands, exact caller relationships, and return sequence 1 → 2 → 6 → 24 → 120.
- RETURN_VALUE transfers the scalar to the direct caller and records the callee result. EXIT_METHOD then pops it. Invalid return order, types, destinations, duplicate returns, missing returns, and execution after return are rejected.
- Exhaustive forward, reverse, and shuffled reconstruction of all 37 cursors; immutable snapshots and stable reserved XYZ anchors and ports.
- Classic conventional rectangular frames, active indication, return arrows and guided value travel. Spatial real R3F extruded frame solids, XYZ descent, directed return curves, restrained guided value travel, and matching receiver emphasis.
- Shared source highlighting, finite playback/Replay, arbitrary seeks, selection, inspector, view switching, Home, Focus, zoom, Follow, orbit, pan, and dolly. Manual input interrupts Follow without pausing execution, including immediately after switching examples.
- Returned frame history is inspectable; departed frames have no live geometry. Final result remains 120 after main exits; the empty world correctly has no live calls or heap allocations.
- Person remains available and its complete existing browser suite passes.

## Visual review and convergence

Captured matching Classic/Spatial states at cursors 8 (first recursive call), 19 (maximum depth/base-case line), 26 (mid-return, 3 × 2 = 6), and 36 (final result). Sizes: 1440×900, 1728×1117, 1280×800, 760×900. Also captured selected/focused factorial(3), contextual return Follow, and Person mutation regression views at 1440×900 and 760×900: 42 screenshots.

Reviewed the full matrix and representative full-resolution captures against references 06–11, particularly the rectangular recursion geometry in 08 and navigable-world composition in 10/11, plus DESIGN_SYSTEM, VISUAL_LANGUAGE, SPATIAL_WORLD_SPEC, CAMERA_AND_NAVIGATION, SCENE_CONSISTENCY, and POLISH_AND_QA. The final solids expose top and side faces, perspective size changes, separated Z anchors, occlusion, and contact shadows. No scenery, glow bloom, CSS perspective, or decorative tunnel was added.

Issues found and fixed:

1. Initial negative-Z descent caused overlapping frames and unreadable overview text. Reversed depth progression toward the camera and separated vertical levels.
2. Initial full-box camera fitting reserved empty space and made the stack too small. Fit padded corners of occupied runtime geometry; the reserved composition remains independent of cursor.
3. Enlarged invocation/slot typography for deep stacks and made active-frame labeling explicit. Focus provides large readable detail; overview prioritizes the entire six-call depth structure.
4. Matched return colors and amber sender/receiver emphasis across representations. Expression operands are labeled call results rather than source-code locals.
5. Fixed inspection of the synthetic return subdivision through the shared selection model.
6. Moved the Classic no-allocation label away from the bottom controls.
7. Capture automation found the narrow inspector heading pushing its Close button into the adjacent body. Allowed heading wrapping and protected button width; verified real pointer dismissal at 760px.

Theater exploration: the first compressed depth composition was less explanatory than the expanded stack. The final Spatial arrangement, focused invocation, and contextual Follow already provide the proposed expanded call-depth experience. A third mode would duplicate it, so Theater remains explicitly unavailable.

Classic and Spatial have opposite screen-space call direction by intent: the conventional Classic top is the newest call; Spatial descends from main to the base case. Depth, identities, values, active frame, source, return state, and selection remain identical. Cross-mode browser tests verify preservation without changing execution.

## Validation

- Typecheck, ESLint, and production build passed.
- 91 unit tests across 12 files passed, including every recursion cursor, invalid lifecycle cases, persistent layout, deep Classic projection, actual recursive camera composition, and existing Person/playback/camera tests.
- 16 browser tests passed: all 12 existing Person/refinement/navigation tests and four recursion tests. These cover finite natural completion, Replay, cross-mode playback/selection/source, deep frame removal/restoration, return values and operands, historical inspection, free navigation during playback, Home/Focus/Zoom/Follow, narrow inspector dismissal, and example isolation.
- Production installed Chrome/ANGLE, 1440×900, balanced quality: orbit 60 fps, median frame interval 16.67 ms; zero idle draws in one second; guided base-case transition median 16.7 ms, p95 33.34 ms, 53.3 fps over its short sample.
- Scrub round trip median 4.81 ms / p95 8.85 ms, including browser automation. Collected JS heap 18.41 → 19.20 → 19.72 MB across 0/100/200 seeks. This bounded sample does not establish long-term GPU/heap stability. Raw evidence: [performance.json](performance.json).
- Git diff reviewed; no duplicated reducer, timeline, design tokens, or runtime scene engine.

## Delegation and integration

- Hypatia: deterministic fixture, shared reducer/validation extension, return lifecycle tests.
- Arendt: deep Classic projection, active frames, return propagation, projection tests.
- Ptolemy: reserved-world camera fitting, semantic return attention, contextual Follow, navigation tests and layout review.
- Lead: shared contracts, XYZ composition, Spatial return primitive, example integration, source/inspector/timeline integration, test reconciliation, full visual QA, polish, performance review, and final validation.

## Known limits

- Only curated traces execute. Source printing is synchronized to its line and retained result; there is no instrumented stdout stream or real Java execution.
- Deep-stack overview text is smaller than Classic frontal text; Focus and inspector provide detail. No dense/arbitrary-depth stack layout is claimed.
- Theater is unavailable for this fixture; Trace Path is disabled because factorial has no object references.
- Camera collision bounds remain conservative cuboid clearance. Dense-world routing and extreme viewport proportions need future validation.
- Existing large Monaco/Three dependency chunk warnings and test-runner Three CJS deprecation warnings remain.

Launch: `npm run dev`, then choose **Recursion · factorial(5)** in the Example selector.
