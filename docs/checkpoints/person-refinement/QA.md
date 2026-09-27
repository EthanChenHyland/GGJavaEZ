# Person refinement — Milestone 1.5 / 1.75

Continues baseline `d097e80`; preserves the normalized trace, reducer, stable identities, spatial anchors, design tokens, and source/timeline pipeline. No later demo or IDE scope was added.

## Implementation and review

Classic projects the shared SceneModel into an SVG stack/heap diagram. Spatial keeps genuine R3F cuboids and XYZ anchors. Both share the same cursor, selection, inspector, values, references, and source location. Hidden representations retain their viewport and ignore navigation commands. The separate Guidance control gates explanatory cues; source synchronization remains runtime truth. Theater is explicitly unavailable for Person.

Playback already had finite semantics. New boundary coverage proves automatic completion, retained final cursor, bounded forward stepping, backward stepping, first/last seeking, and explicit deterministic Replay. No second engine was introduced.

Navigation adds visible zoom/reset/overview controls through existing intents. Camera movement has finite distance and pan bounds, conservative near-plane collision clearance, swept movement, allocation recovery, and routes scripted moves around solids. User input still interrupts following while playback continues.

## Visual convergence

Reviewed Classic and Spatial at cursor 18 (age mutation), at 1440×900, 1728×1117, 1280×800, and 760×900. Reviewed selected/focused Person in both views at 1440×900 and 760×900: twelve final captures.

Compared against references 06–11 and DESIGN_SYSTEM, VISUAL_LANGUAGE, SCENE_CONSISTENCY, CAMERA_AND_NAVIGATION, and POLISH_AND_QA. References 08/09 inform only the shared geometry language; no recursion or sorting implementation was added. Final rendering preserves solid side/top faces, perspective, occlusion, shadows, semantic stack/heap colors, and the rectangular vocabulary. Glow remains restrained. Runtime entities are the composition; no decorative city or synthetic runtime entities were introduced.

Polish fixes made after capture review:

- Separated representation and navigation chrome from runtime drawing space.
- Added directed cone arrowheads and readable `p` / `this` labels in Spatial.
- Used separate arrow endpoints and named local slots in Classic.
- Reserved inspector space in Classic; kept focused Spatial entities above the inspector.
- Retained hidden viewports and prevented stale camera intents when switching.
- Corrected Classic instructions to pan/zoom; disabled rendering-quality controls there.
- Used the same bottom inspector shelf at the 760px review size so it cannot cover navigation controls.
- Updated the real reference-picking browser coordinate for the new canvas inset.

Classic's frontal text is intentionally easier to read at overview. Spatial trades that frontal view for genuine depth and exploration; Focus and the synchronized inspector support close reading. Selected Classic focus can crop surrounding frames, while preserving the target and inbound relationships.

## Validation

- Typecheck and lint passed.
- 50 unit tests passed, including runtime/anchor invariants, playback boundaries, Classic projection/viewport, and camera constraints.
- 12 browser tests passed, including natural completion/Replay, shared state across view switches, guidance independence, actual WebGL reference picking, free camera input during playback, explicit zoom/reset, and Classic keyboard inspection.
- Production build passed; the existing large dependency chunk warning remains.
- Production Chrome/ANGLE at 1440×900, balanced quality: 60 fps orbit, zero idle draws in one second, scrub median 5.6 ms / p95 10.8 ms (including browser automation roundtrip). Collected JS heap 17.0 → 18.6 → 19.1 MB across 0/100/200 seeks. Near baseline; this short sample does not establish long-term GPU/heap stability. Raw results: `performance.json`.

## Delegation

- Goodall: Classic adapter, renderer, viewport, accessibility, projection tests.
- Archimedes: shared navigation actions, collision constraints, hidden-view isolation, navigation tests.
- Ampere: finite-playback audit, exhaustive boundary tests, browser completion/view/guidance tests.
- Lead: contracts, integration, reference arrows, responsive chrome/inspector polish, visual comparison, complete validation and commit.

## Known limits

- Theater has no meaningful representation for this curated Person trace and remains unavailable.
- Classic Follow emphasizes execution; automatic camera choreography belongs to Spatial.
- Conservative cuboid collision bounds allow extra clearance at rounded corners; routing is validated for this small scene, not future dense scenes.
- Extreme viewport proportions can reach the bounded camera distance limit.
- Monaco and Three.js retain large dependency chunks. Source and trace remain replaceable inputs; arbitrary Java execution remains out of scope.

Launch from repository root: `npm run dev`.
