# Reference Convergence Pass 1

Compared real Java recordings with the independent baseline at `ab6111f1720d440c4b26aba263a4023089ef1841` and the original R1–R6 suite. The scope is camera, composition and shared geometry. The [visual scorecard](VISUAL-SCORECARD.md) records the affected 0–5 scores. The [backlog](BACKLOG.md) records the next sequence.

## Shared camera and world

- Home fits the actual caller chain and a Heap subject from the current action or observed bindings. It admits nearby representatives if their projected faces stay useful. Large completed trees begin at the recorded entry instead of following the most recent historical branch to its remote end. An explicitly selected sparse cell keeps its real array window available. Run and recording entry use the same Home solver. The historical reference harness still has its staged Hero command.
- Home and Follow use a 36° vertical perspective with shallow yaw −17° and pitch −18° and recursive yaw −26° and pitch −15°. Negative pitch puts the eye above the target. The 36° lens kept useful face scale across the short and narrow viewports while the new pose and geometry exposed top and side faces. Distance, elevation and lateral target come from actual visible geometry, shell bounds and structural text footprints. The world frame reserves Source, Header, debug controls, Console, Inspector and the Time Dock where they occupy space.
- Follow includes the current frame, recorded ancestry and captured field or cell writes. It adjusts when those subjects leave the composition. Entering Follow on a proved return can include that return's two recorded owners. Manual input still cancels camera ownership. Focus keeps its original face occupancy, orientation and orbit center, using the new available rectangle when a command runs.
- Thicker Stack solids step down and toward the eye along real caller relationships, with smaller successive height drops for deeper callers. Home and Follow fit a bounded chain of up to eight captured invocations. Frame allocation, lifetime and ports stay tied to first observation through scrubbing. The regression matrix checks captured Series at all five viewport sizes.
- Project objects, nonempty data arrays and collections occupy the foreground. Source-observed secondary scalar summaries and empty argument arrays use a rear shelf. Class state starts in a separate shallow band above Stack and left of Heap. Two columns keep additional types from marching across the Heap; later rows recede in depth.
- Heading placement clears body silhouettes and shell surfaces. The CLASS STATE title fits its full name, and RETURNS takes less space beside the recorded value. The 650 px tall view gives live recursive frames larger, unqualified method signatures in the same header space. The History source highlight restores visibility on resize while respecting a user's manual source scroll.
- The array tray moves as a unit. Its dimensions, cell spacing, stable indices, exact values and attachment ports retain the same local layout. The verified sorting write changes index 1 from 8 to 1, leaving the other cells `3, 1, 6, 2`.

## Evidence

The local captures and JSON are under `test-results/reference-pass1/verified/`. The original audit captures are under `test-results/reference-convergence/`. The same-driver replay on the baseline UI is in `test-results/reference-pass1/matched-baseline/`. These files are generated local evidence. The paired strips in `test-results/reference-pass1/comparisons/` use full-resolution inputs with the former app on the left. The native Person triptych puts the original R1 before both app captures. [Original references](AUDIT.md#reference-inventory).

| State | Audit evidence | Pass 1 evidence |
| --- | --- | --- |
| Person Home and narrower source | `supplement/person-home-*.png` | `person-home-*.png`, including the native 1672×941 and five target sizes |
| Person Follow and Focus | `supplement/person-focus-interactive.png` | `person-follow.png`, `person-focus.png` |
| Inventory write | `matrix/captures/history-native.png` | `inventory-domain-write.png`, `inventory-domain-write-760x900.png` |
| Indexed array write | `matrix/captures/array-operation-native.png` | `array-write.png` and its before/after cell record |
| Series descent and return | `matrix/captures/recursion-native.png`, `matrix/captures/return-native.png` | `series-deepest-follow.png`, `series-proven-return.png` with the recorded consumer edge, and the two `1440x650` captures |
| Completed, dense and FAR | `matrix/captures/completed-native.png`, `supplement/dense-home.png`, `matrix/captures/far-native.png` | `person-completed.png`, `dense-home.png`, `dense-far-from-home.png` |
| Class state | `supplement/statics-home.png` | `class-state-home.png` with actual `visits = 7` |

## Projected bounds

Measurements are CSS pixels in x/y/width/height order. Minimum clearance covers the full projected active frame and Person body within the measured command rectangle. The Source drawer is closed at 760×900, with the correct file and line available on its rail. The other four viewports show source line 18.

| Viewport | Command frame | Active frame | Person body | Minimum clearance |
| --- | --- | --- | --- | --- |
| 1728×1117 | 467/112/1236/838 | 537/495/420/350 | 1065/277/416/370 | 70 px |
| 1440×900 | 389/90/1030/675 | 445/398/354/295 | 888/216/349/309 | 57 px |
| 1280×800 | 366/80/895/600 | 418/354/306/255 | 799/195/304/269 | 53 px |
| 760×900 | 40/56/720/738 | 83/403/235/194 | 403/272/234/219 | 43 px |
| 1440×650 | 389/65/1030/472 | 549/283/291/242 | 895/139/286/247 | 12 px |

At native 1672×941, Person Home uses eye -3.50/2.50/20.59, target 2.87/-4.58/-0.24 and distance 22.90 world units. At 1440×900 deepest Follow, the eight Series frame bodies span approximately x623–1030 and y134–716 inside the command frame x389–1419 and y90–765. The projected class-state body lies clear of the Header. The same Inventory subject at 760×900 has 123 px right clearance. The capture JSON also records world-space anchors, projected region bounds, glyph metrics and camera poses. `comparisons/person-home-grayscale.png` shows the active frame and changed value with the same geometry and long routes visible in grayscale.

## Regression scope

The browser matrix exercises the real JVM and uses ordinary Home, Follow, seek, step and Focus controls. Source, execution IDs, static values, array changes and proven returns are captured at the relevant cursor. The camera and stable layout checks cover real three-dimensional face bounds, User Camera cancellation, immutable anchors and recorded neighbors. The original references are byte-checked against the audit's SHA-256 list.

- Application and reference typechecks, lint and the production build passed. The build emitted its large-chunk advisory.
- The presentation, geometry golden and reference measurement tests reported 1,934 passed and seven skipped. The reviewed golden changed only for presentation geography and still checks all 98 prefixes across the two metadata modes.
- The configured Java acceptance suite reported 191 passed and four expected failures. The broader Vitest run reported 2,347 passed, 70 skipped and one 5 s factorial integration timeout under concurrent load. The factorial case passed on isolated retest alongside the Unicode stream check.
- The focused browser suite passed all 21 array, Focus, recursion and source/debug checks. All six final real-JVM capture scenarios passed. The recursion gate checks all eight invocation bodies, the camera handoff and shallow-angle restoration at the five published viewport sizes.
- The nine comparable-state cases covered recursive descent, array write and return at 1728×1117, 760×900 and 1440×650, with native captures on the wide case. Eight passed on the first run. The short recursion case exposed missing live titles. The compact method titles passed the short recursion and return retest, and 39 targeted renderer and reference tests passed.

## Performance observations

The same browser driver ran five recordings before and after with the local JDK and the same action boundaries. These small samples were collected on one machine with background validation activity. They describe the interactive run and leave the fixed performance and memory gates open.

| Observation | Baseline | Pass 1 |
| --- | ---: | ---: |
| Home to first composition, median of 15 actions | 143.0 ms | 147.0 ms |
| Home to first composition, slowest of 15 actions | 184.5 ms | 281.8 ms |
| Home settling, median of 15 actions | 1,050.9 ms | 1,047.8 ms |
| Native Person Home, draw calls / triangles | 92 / 44,031 | 93 / 41,451 |
| Array write, draw calls / triangles | 72 / 25,357 | 72 / 25,357 |
| Dense Home, draw calls / triangles | 105 / 353,823 | 97 / 408,735 |
| Deepest Series Follow, draw calls / triangles | 68 / 38,721 | 80 / 39,813 |

The tighter Dense Home moves from MEDIUM to CLOSE, increasing the settled triangle count about 16%. The higher sampled Home maximum and the added recursive draw calls are the main resource follow-ups. Full performance and memory acceptance remains in Pass 6 under the fixed [performance baseline](PERFORMANCE-BASELINE.md).

## Remaining visual work

Bright and long routes still compete with the changed value, especially in Inventory and Focus. Repeated method qualifiers and value elision make small and distant text hard to scan. The wider recursive composition fits all bodies with smaller caller labels. Reflection and the bright floor edge can draw attention away from the faces. Dense Home gives the entry and Heap more space, while repeated slabs, suppressed headings and offscreen bodies still need a dedicated density pass. At 760×900 the active frame and changed object read in the same view, with cropped secondary material. Pass 2 should prioritize the active binding and value before the rendering and density passes.

## Execution boundary

The presentation continues to consume normalized runtime, graph and world data. This pass adds no process, filesystem or transport dependency to camera/layout. Local execution remains unsandboxed. A future hosted provider needs its own isolated execution boundary and a versioned event transport into the existing presentation input.
