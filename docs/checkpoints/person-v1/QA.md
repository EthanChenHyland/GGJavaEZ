# Person vertical slice — QA checkpoint

## Scope and implementation

Deterministic Person mock trace only. No recursion, arrays, AI integration, or JVM capture. The repository preserves baseline specification commit `b3729fb`, contract/scaffold commit `cc2636a`, and initial integrated slice `7a54343`.

Pipeline: validated JSON events → pure reducer/checkpoint replay → runtime snapshot → reserved XYZ anchors → scene model → real R3F cuboids, information faces, and reference curves. Selection and camera interpolation are presentation state. Returned frames retain identity in history but leave the live stack; Person #17 persists after program completion without fabricated GC.

The 21-event fixture binds constructor/setAge `this` on method entry. `p` is uninitialized until constructor return. Strings are labeled summaries, not fabricated heap identities. Object/frame anchors are reserved once from the complete trace, and the same anchors are used in both playback directions.

## Captures reviewed

All captures use the actual app in installed Chrome, WebGL enabled. Compared against full-size local references 06–11 and the design, motion, spatial, and camera contracts. The other reference frames were also inspected.

- `hero-1440x900.png`, `hero-1728x1117.png`, `hero-1280x800.png`
- `hero-760x900.png`: narrow runtime with synchronized source strip
- `allocation-1440x900.png`: Person #17 with Java default field values
- `constructor-1440x900.png`: constructor frame, `this`, and uninitialized `p`
- `selected-1440x900.png`: identity, fields, and inbound references
- `focused-1440x900.png`: selected entity fitted above the inspector shelf
- `trace-path-1440x900.png`: live named relationship and endpoint context
- `runtime-focus-1440x900.png`: source reduced to executing-line strip
- `orbit-1440x900.png`: changed perspective and visible depth
- `reduced-motion-1440x900.png`: complete semantics without travel

## Visual convergence

Initial output had dark bodies, undersized labels, overly steep orbit, and inspector occlusion. Polish increased true body depth and top/side visibility, enlarged labels, distinguished body/information-face materials, removed competing glow, constrained polar orbit, prevented drag from selecting entities, and moved desktop inspection to a shelf below the solids. Camera focus accounts for that shelf and attached captions; narrow Home fits the persistent composition. Short values remain on one line. Stack/heap regions, call hierarchy, and references use one shared rectangular vocabulary.

A still overview shows true perspective, occlusion, top/side surfaces, shadows, and different stack/heap Z anchors. The backdrop is a minimal shadow plane; every visible runtime body corresponds to actual mock state. No decorative city geometry or CSS perspective is used.

## Functional coverage

Unit tests cover trace validation, pure reducer inputs, replay isolation, all cursor snapshots forward/backward, live references, stable scene anchors, playback bounds/speed, semantic zoom hysteresis, navigation memory, camera path endpoints, view fitting, and guided Home behavior.

Browser checks cover age stepping/reconstruction, source synchronization, selection, reference hit testing, Focus/Trace/Home, orbit/pan/dolly, exploration while playback continues, Follow toggle, keyboard inspection, runtime-focus mode, low-effects state preservation, arbitrary scrubbing, reduced motion, and loading without remote editor/font assets.

## Performance

`performance.json` records installed Chrome headless with ANGLE WebGL at 1440×900, balanced quality, production build. WebGL draw timestamps show approximately 60 fps during allocation and orbit (median ~16.7 ms). Idle demand rendering produced zero draws during the sampled second. Scrub median ~5.6 ms / p95 ~10.6 ms includes Playwright transport.

Collected main-thread JS heap: 16.6 MB before repeated seeking, 18.0 MB after 100 seeks, 18.5 MB after 200 seeks. This bounded sample does not establish a long-term heap plateau or GPU-memory stability. Custom reference picking buffers are explicitly disposed. Geometry remains visible at low effects; quality tiers never move entities.

## Known limits

- Curated deterministic execution only; source is read-only. String values use explicit summaries.
- Production build retains large dependency chunks (Three.js/R3F and lazily loaded Monaco). It builds successfully; the warning remains visible.
- Performance evidence is a short desktop/headless sample, not a broad hardware or long-duration soak claim.
- Very distant or rear views intentionally simplify/hide face details; keyboard inspector and Home provide reliable recovery.

## Final acceptance record

Final lead review closed the focus source-label clipping and STACK/status overlap: the camera preserves `main.p`, the selected Person information face, both endpoints, and the mutation caption above the inspector. Narrow Home fits the complete persistent composition. The final overview unmistakably reads as real solid geometry; orbit and pan change occlusion/perspective.

Validation: typecheck passed, lint passed, 25 unit tests passed, 6 browser tests passed, production build passed. Build retains the documented dependency chunk warning. All twelve screenshots were captured and reviewed. Milestone 1 / first Person vertical slice is accepted within its mock-trace scope.

Delegation: Feynman handled trace/reducer; Fermat handled solids/reference primitives and presentation motion; Euler handled navigation and camera fit; Boole handled playback/timeline and local/lazy Monaco; Euclid performed read-only visual QA. The lead reviewed changes, chose integration and visual fixes, and ran final QA.
