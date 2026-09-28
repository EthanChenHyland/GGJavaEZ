# Milestone 3 — Arrays, sorting, and Theater acceptance

Reviewed September 27, 2026, continuing the clean `1c40ff3` baseline. Lead retained architecture, shared contracts, layout/scene projection, cross-mode integration, visual decisions, final checks, and this acceptance review.

## Built and verified

The curated Java program sorts `[8, 3, 6, 1, 5]` into `[1, 3, 5, 6, 8]` through the existing semantic runtime pipeline. Its 122-event fixture includes one `int[] #23`, 34 indexed reads, ten comparisons, and seven swaps implemented as fourteen individual indexed writes. Source locations and the Java fixture agree byte-for-byte.

Each indexed cell retains `object:array:23:element:index` identity. Spatial and Theater reserve equal cuboid positions before execution. Scrubbing changes values in those locations; it never sorts geometry by value. The two writes in a swap preserve the intermediate duplicate value and the saved `temp` value. Scoped `i`, `j`, and `temp` variables reuse lexical IDs with permanent reserved rows.

Classic uses explicit indexed equal cells. Spatial uses genuine WebGL cuboids and face labels. Theater expands the same cells about their originating heap anchor, names the compared `j`/`j+1` pair, shows true/false comparison results, and exposes actual indexed-write origins and bounded value travel. Static causal paths/captions remain useful when paused or motion is reduced. Turning guidance off quiets emphasis without changing values or selection.

The same cursor, reducer, source, inspector, selection, and references feed all representations. Array objects, cells, and loop locals can be selected. Trace Path from a cell follows its containing array's actual `nums` reference; scalar locals do not invent paths. Orbit/pan/dolly, Zoom, Home/Reset, Focus, Follow, natural completion, and explicit Replay remain available. User input overrides automatic camera motion while playback continues.

## Delegation and review

| Agent | Assigned work | Lead reconciliation |
|---|---|---|
| Confucius | Trace fixture, validation, pure reducer, runtime tests | Reviewed lifecycle checks, all individual writes, observed values, origin validation, and reverse/random replay |
| Planck | Classic projection, renderer, focused tests; later read-only visual QA | Reviewed stable cells/rows, selection, static causality, and all reported visual issues |
| Linnaeus | ArraySolid, comparison/transfer primitives, focused tests | Reviewed anchors/material reuse; integrated and polished header, labels, endpoints, guidance |
| Mill | Array/Theater Home, representation memory, cell Focus, navigation tests | Reviewed controller diff; added physical collision volumes and caption-aware inspection framing |

No agent changed the shared runtime contracts independently or committed partial work.

## Validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: **178 tests passed in 17 files**, including all existing Person/Recursion tests.
- `npm run test:e2e`: **21 browser tests passed**; includes five array tests and all sixteen existing regressions.
- `npm run build`: passed. Existing large Three.js/Monaco chunk warning remains.
- Production preview smoke: exact first-swap inspector values verified, all three representations exercised, six array-object inspection and eight Person/Recursion regression screenshots captured, no page errors.
- `git diff --check`: passed.

Coverage includes every semantic cursor in forward/reverse/random order, all fourteen writes, malformed/out-of-bounds events, inactive origins, scoped local lifetime, snapshot isolation, persistent scene identities/positions, equal cuboids, stable cross-mode selection, finite playback, reduced motion, guidance, actual WebGL cell picking, and free navigation during playback.

An early Person coordinate-picking timeout occurred while browser tests and screenshot capture ran concurrently. The isolated test and subsequent full suites passed after capture work was serialized.

## Screenshot review

Eighty PNGs are retained here: sixty matching state checkpoints, six cell Focus captures, six array-object inspection captures, and eight existing-demo regressions. Four review matrices summarize the sixty checkpoint images.

| State | Applied-event cursor |
|---|---:|
| Initial array and `nums` reference | 5 |
| First comparison | 12 |
| First completed swap | 17 |
| Mid-sort, fourth completed swap | 50 |
| Final sorted state | 122 |

Matching Classic/Spatial/Theater captures cover **1440×900, 1728×1117, 1280×800, and 760×900**. Focus and object inspection cover 1440×900 and 760×900. Person mutation and maximum recursive depth were also reviewed in Classic/Spatial at those two sizes.

- [1440×900 matrix](review-matrix-1440x900.jpg)
- [1728×1117 matrix](review-matrix-1728x1117.jpg)
- [1280×800 matrix](review-matrix-1280x800.jpg)
- [760×900 matrix](review-matrix-760x900.jpg)
- [Theater comparison](theater-first-comparison-1440x900.png)
- [Theater temp write](theater-first-swap-1440x900.png)
- [Theater cell Focus, narrow](theater-focused-760x900.png)
- [Classic selected cell, narrow](classic-focused-760x900.png)
- [Array object inspection](theater-object-selected-760x900.png)

Compared against references 06–11 and the binding design, visual-language, spatial-world, motion, navigation, consistency, performance, and QA documents. Still images show actual top/side faces, perspective convergence, depth-separated stack/heap geometry, occlusion, and shadows. There are no CSS perspective cards, numeric-height bars, particles, decorative buildings, or bloom. The standard view remains a recognisable indexed array; Theater enlarges that representation and its causal explanation.

## Polish completed

1. Tightened stack/array composition while retaining the same heap origin and time-stable anchors.
2. Enlarged the reserved main frame, separated header/local rows, and increased array-specific local/type, index, reference, and identity label sizes.
3. Removed a colliding floating HEAP label and attached heap identity directly to the extruded array header.
4. Moved transfer endpoints above indices and values so arrowheads do not obscure committed data.
5. Made Classic selection distinguishable from comparison through a stronger outline, tinted cell face, and corner selection mark.
6. Reserved comparison captions and paired-cell context in Theater Focus; final desktop/narrow captures show the full caption above the inspector.
7. Used actual physical cell/header volumes for camera collision rather than blocking the empty array framing envelope.
8. Kept guidance behavior consistent across representations and added visible selection accents for 3D local rows.
9. Quieted dense timeline markers while preserving every event and the exact slider cursor.

## Performance

See [production review measurements](performance.json). Installed Chrome headless, ANGLE WebGL, balanced quality, 1440×900; draw-call timestamps identify actual rendered frames. Scrub measurements include browser automation roundtrip.

- Orbit: **60 fps**, 120 rendered frames, 16.666 ms median/p95 interval.
- Two-write playback/value travel: **59.9 fps active cadence**, 16.7 ms median and 16.8 ms p95. There are idle intervals between bounded animations; the whole-interval draw frequency is 27.3 Hz rather than continuous rendering.
- Idle demand rendering: **zero frames in one second** after settling.
- Allocation: four frames for the semantic update and reserved framing; too few samples for a continuous-rate claim.
- Scrub: **4.02 ms median / 9.74 ms p95** roundtrip.
- Collected JS heap: **18.60 → 19.47 → 19.79 MB** before/after 100/200 seeks; no repeated world reconstruction or unbounded growth observed in this bounded run.

## Acceptance and limits

Milestone 3 passes functional and visual acceptance for the curated five-element `int[]` bubble-sort slice. Person and Recursion remain functional and visually consistent.

Limits: deterministic mock execution; only curated examples and integer arrays are exposed. The fixed Classic container is sized for this small array. Theater changes presentation anchors directly with an interruptible camera transition rather than interpolating the entire stage. Individual Spatial inspection may crop peripheral cells; Home restores the complete reserved world. Hardware performance outside this review environment is not claimed. Large Three.js/Monaco production chunks remain a future loading optimization.

No real JVM execution, importing, full IDE, or AI integration was added.

Launch: `npm run dev -- --port 5173`.
