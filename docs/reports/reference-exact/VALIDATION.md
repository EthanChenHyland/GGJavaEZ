# Reference reconstruction validation

## Shell integration checkpoint

The root and `/ide` routes now use the same full-viewport shell. `/examples` uses its recording-viewer composition. Header, source, time dock, inspector and drawers take their rectangles from `computeShellLayout` and the frozen v4 tokens. One runtime canvas survives project opening, execution publication and failed rebuilds.

Operational state has separate selector-based workspace, editor, execution, debug, timeline, interaction and shell stores. Save All attempts every open and closed draft before reporting failures; failed saves prevent launch. Previous committed ingest/history survives a new pending attempt until accepted normalized events publish the replacement. Project switch and unmount dispose every retained ingest.

Checks completed on 2026-10-08:

- Production build/typecheck passed. The interim application chunk remains oversized (1,035.78 kB gzip); Monaco separation remains required.
- Default unit gate: 1,499 passed, 63 opt-in skipped, 1,562 total across 121 files (115 passed, 6 skipped). These skips are not real-JVM validation.
- Focused shell/state/command/source-binding checks: 185 passed across seven files.
- Browser reconstruction checks: two passed. Five viewport rectangles match the shared layout; actual Java Run followed by invalid-source rebuild preserves the same canvas, recording, cursor and runtime identities.
- A separate actual Java execution produced captured output `AGE 18`, Completed status and exit code 0 without browser page errors.

Screenshots are local QA artifacts under `.ggjavaez/qa/reference-exact/`. Their review confirms the shell composition but identifies the legacy world spacing as a substantial remaining visual gap. This checkpoint does **not** approve reference convergence, the renderer, subsystem extraction, accessibility, performance or the final JVM/browser gates. The legacy renderer and compatibility tokens are interim dependencies to remove as reconstruction proceeds.

## Runtime integration checkpoint — 2026-10-09

The production Shell now renders the complete prefix SceneModel through persistent XYZ layout reservations and a separate budgeted PresentationPlan. Stack, heap, arrays, class shelves and captured I/O use shared instanced solids, face text and connector batches. Flow attachment requires prefix-visible storage/provenance; a return cannot attach to an earlier value merely because the eventual destination already exists. Inspector evidence queries retain recorded adjacency independently of drawable geometry.

The camera and canonical interaction stores own Explore, Follow, Home, Focus, saved-pose restoration and Trace. Selection alone never moves the camera. The command registry dispatches navigation in both IDE and recording viewer without waiting behind filesystem work. Escape closes the Inspector before exiting Focus or Trace. Clearing Selection in Focus keeps the Inspector on its target. Command changes and exact test-inventory migrations are recorded in `docs/checkpoints/reference-exact/migration/commands.md`.

The semantic timeline is an external store with deterministic forward/backward reconstruction, Replay, Return to Live and bounded milestone labels. Motion consumes committed adjacent states and recorded edge identities; it never delays event application. LIVE backlog expiry and first published batches have explicit coverage. Reduced motion retains static semantic emphasis. Allocation currently scales a transient outline rather than the canonical body; this is an unfinished presentation detail.

Array windows preserve canonical index identity separately from temporary geometry and monotonically retain prior window revisions across presentation changes. Pointer-down captures the window revision and stale picks are rejected. In-bounds uncaptured cells remain unavailable. Inspector lists use bounded physical pages so every logical index remains reachable without a count-sized values array or browser-sized scroll extent.

Read-only recorded source and editable Monaco have separate lazy boundaries. Monaco contribution services load before Java provider registration, avoiding first-open Suggest/Code Action service errors. Static local Inter 400/500/600 font assets serve the shared glyph batch. The capture barrier waits for glyph layouts, environment, settled camera/motion and active quality readiness; scene/window/plan/pose/resource changes restart its stable-frame interval.

Interactive uses shared acrylic Fresnel materials. Cinematic is requested only after explicit selection and uses real physical transmission, actual GPU capability checks, shader preparation and the frame-time governor. This checkpoint does not yet contain the required selective bloom, SMAA or complete Cinematic post-processing.

Validation on the checkpoint tree:

- `npm run build`: passed, including TypeScript. Bootstrap is 72.48 kB gzip; AppRoot is 223.99 kB gzip. Monaco API (699.96 kB gzip), its contributions (144.60 kB gzip), recorded editor and Cinematic materials are separate chunks. Vite still reports large lazy chunks; cold-load/retention budgets are not yet proven.
- `npm run lint`: passed; no disabled rules were added.
- Default unit gate: 1,666 passed, 63 opt-in skipped, 1,729 total across 158 files (152 passed, six skipped), in 157.15 seconds. These skips do not satisfy the explicit real-JVM gates. An initial property run exposed reduced-motion initialization after a scrub; the binding now initializes that preference before the first action, with an additional regression test. All 19 focused motion checks and the subsequent full unit gate passed.
- Focused command/shortcut, retained command integration, array identity, virtual-list and Inspector evidence checks: 75 passed across six files, with the added completeness/reachability properties configured for 100 runs.
- Reconstruction browser checks: seven passed in 19.6 seconds. These include five viewport shell rectangles, a real Java Run and failed rebuild retaining the canvas/history/IDs, semantic timeline boundaries, source highlighting, selection/Trace camera invariance, Focus pose restoration, projectless palette/shortcuts, Inspector Escape precedence and actual hardware-gated Cinematic selection without replacing the canvas.
- A separate real Java capture produced cursor 70, Completed/exit 0 and no browser errors. Its captured renderer report was 18 draw calls, 8,088 triangles, 29 geometries and 13 textures. This is an earlier small-program observation, not a dense-scene or post-processing performance gate.

Original-resolution comparisons against `best.png` remain **unapproved**: connector paths cross face-label regions; the completed-run floor loses the reference grid/reflection hierarchy; face typography and composition need another polish pass. Remaining work also includes first-known collection/ownership placement, exception and specialized presentations, source scroll policy, operational adapter extraction, legacy browser locator migration, full post-processing/resource disposal and measured performance. The 66-property inventory, 16 comparable real-Java states, final acceptance/explicit real-JVM/torture/debug/soak suites, retained browser suite and production cleanup have not passed their final gate. This is a stable integration checkpoint, not completion of A–G.

## Renderer foundation checkpoint — 2026-10-09

The runtime bodies now use one rounded template and shared vertex expansion that preserves a 0.10-unit bevel under unequal instance dimensions (bounded for thin trays). Shared depth/distance variants and rounded merged outlines use the same expansion; the canonical cuboid pick envelope and runtime anchors remain unchanged.

The render owner uses half-float targets, explicit emissive and protection masks, UnrealBloomPass, lower-corner fog, SMAA and final ACES/sRGB conversion. Every ordinary surface—including glyphs, plates, grid and reflections—is excluded from bloom. Mask proxies preserve original vertex transforms and Troika batching/discard paths, restore originals in `finally`, and own their disposal. Blue/violet emitter extraction uses peak HDR channel radiance at the unchanged 1.0 threshold so their semantic colors contribute consistently within the specified radiance range. CINEMATIC lazily adds half-resolution GTAO (radius 0.6, intensity 0.8), with rounded-body normals and an actual sharp text mask. DOF remains disabled pending a separate tilted-face readability proof.

**Installed API reconciliation:** Three 0.186's `SMAAPass` explicitly requires linear-sRGB input before `OutputPass`. The implementation follows that actual shader contract, placing SMAA immediately before final ACES/sRGB conversion rather than applying it to encoded output. This ordering departure from the design table is intentional; no specification was rewritten.

The managed floor retains the actual drei reflector material and blur implementation while explicitly owning targets and cleanup. Removing the perspective-depth threshold that nearly erased reflections restores the completed-run grid/reflection hierarchy. Its position/extent follow reserved bounds, with the specified 1/4-unit grid, 256/1024 reflection targets, Interactive gradient contact blobs and Cinematic contact maps of shadow-casting runtime solids only. Cinematic contact maps regenerate on plan changes; structural surfaces cannot shadow themselves.

The canvas now renders on demand. Camera travel, motion, glyph completion, quality settling and capture barriers request required redraws; idle gaps do not become slow-frame watchdog samples. Draw-call observation counts the whole display frame, including reflection, mask and post-processing passes. A pre-mount WebGL probe leaves the source and timeline usable without a graphics context. Actual context recovery rebuilds effects, floor targets and the local environment without replacing the canvas or semantic state; the retained recovery extension supports Retry after the two-second failure notice.

Current verification:

- Build/typecheck and lint passed. Bootstrap is 72.49 kB gzip, AppRoot 273.33 kB gzip, shared Troika 230.28 kB gzip; Cinematic passes are a separate 8.55 kB gzip chunk and materials remain separate. The aggregate cold-load/retention budget is still unproven.
- Full default unit gate: 1,675 passed, 63 opt-in skipped, 1,738 total across 162 files (156 passed, six skipped), in 152.91 seconds. These skips still require their explicit real-JVM gates. Focused rendering/quality/motion checks also passed: 86 tests across 14 files, including 100 randomized rounded-envelope/radius cases. The semantic bright-pass check passed in the full gate.
- Eleven reconstruction browser checks passed in 27.5 seconds. Added checks prove zero settled idle redraws, seek redraw, actual graphics-context loss/restoration with equal recording/cursor/Selection/pose and the same canvas, and source/timeline availability without WebGL. Cinematic checks now require exactly one material request and one effects request, no such requests during Interactive, and ready effects without failure. The no-WebGL IDE check also executed actual Java to Completed and verified retained process output and a nonempty recording.
- Latest actual Java captures completed at cursor 70 without browser or shader errors in both tiers. Interactive reported 78 total draw calls, 43,611 triangles, 32 geometries and 29 textures; hardware-enabled Cinematic reported 115 calls, 56,843 triangles, 34 geometries and 43 textures, with compiled physical materials and ready lazy effects. These are small-program observations, not dense-scene performance results.

The current original-size comparison shows recovered floor depth and reflections, but remains **unapproved** for reference convergence. Connector routing, synchronous typography fitting/visibility, edge depth polish, composition, haze, focus readability captures, large-world profiling and long-lived resource measurements still need work. This foundation does not close milestone E or the whole A–G reconstruction.
