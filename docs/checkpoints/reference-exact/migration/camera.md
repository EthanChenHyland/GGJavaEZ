# Home and recursive Follow reconciliation

Home uses the fixed Hero orientation (yaw 8°, pitch −13°) at every captured
depth. Recursive Follow is a separate presentation operation: at depth four or
greater it fits the innermost invocation and its three actual callers, using
yaw 18° and pitch −16°. Returning to depth three restores Hero orientation.
The caller chain comes from prefix-visible live frame identities; no layout,
execution, selection or trace contract changes.

Explicit Follow requests invalidate the demand-rendered world and reconsider
the current prefix, including History. Later qualifying entry, allocation,
throw and major field/array-write events include their captured subjects only
when they leave Safe Frame. A completed uncaught path also includes its actual
throwing frame, Throwable and structural panel. User input cancels travel and
disables Follow synchronously; stepping does not enable it again.

The recursion comparison now invokes the actual `Navigation: Follow` command
after Home. Its five viewport captures require the four nearest body bounds to
fit Safe Frame, monotone projected face centres and the frozen recursion angle
bounds. Native captures repeat those actual commands after resizing. No QA
camera setter or cursor setter is used. Off-centre perspective may reverse the
horizontal direction; monotonicity accepts either consistent direction, as
requirement 10.2 specifies no left-to-right direction.

Focus captures additionally prove the closest permitted height endpoint when
the desired width is incompatible with the target's aspect ratio. The existing
height and width bands are unchanged.

The graphics idle/recovery checks wait for the mounted world's existing QA API
before requesting readiness. A visible timeline can precede lazy WebGL mount.
The zero-idle-redraw, actual context recovery and state invariance assertions
remain intact. These changes do not approve visual reference convergence.

## Follow Path implementation contract

The presentation planner already resolves both endpoint solids for routing.
Presented curves now retain those proven source/destination anchors for camera
framing, including currently mapped array cells and IO endpoints. This metadata
belongs to the presentation plan; it does not add runtime events, graph edges or
inferred storage identities. Camera code never guesses an endpoint from an ID
or reconstructs another flow catalog.

Follow Path uses one 1,000 ms travel from the source Port through equal-distance
samples of the actual presented curve, then frames every corner of the actual
destination body. It respects the free area above a narrow Inspector sheet.
The camera's existing collision route protects the lens, while detour targets
advance in order along each semantic leg. The shared travel metric includes
both eye and target movement so a target-only leg cannot be discarded. Reduced
motion uses the final pose in one frame; ordinary user input retains the same
synchronous cancellation path. A changed selection or no-longer-presented flow
cancels stale path travel. Trace mode/scope, selection, prefix and anchors are
never changed by Follow Path.

Actual orbit, secondary-button pan, wheel zoom and keyboard interruption use the
same cancellation owner. Wheel capture now uses an owned native, non-passive
listener; React's passive wheel handler previously produced a Chrome console
error when preventing default scrolling. The listener is removed on unmount.
Completing a move refreshes semantic detail immediately, including a one-frame
reduced-motion move. Prefix/recording changes also cancel obsolete path travel.

Release validation: build, lint and reference TypeScript passed; all 27 actual
reconstruction browser checks passed in 2.1 minutes. The full default suite
passed 1,745 tests with 70 opt-in skips in 158.07 seconds. Six Follow Path cases
exercise the five QA viewports plus reduced motion, exact destination bounds,
unchanged runtime/Trace/selection/anchors, and real orbit, pan, wheel, keyboard
and prefix-change cancellation. All six diagnostic captures received
original-size lead inspection. This does not approve the full reference matrix
or close cluster travel and broader visual convergence.

## Cluster travel contract — generic clusters integrated

Lead direction: double-clicking a real presented Cluster requests a separate
camera intent with its actual recording, cursor and cluster identities. It
does not enter or exit Focus or replace its target. Keyboard Enter retains the
existing Focus action. The accepted destination identifies an actual
prefix-present member, which becomes an explicitly accounted detailed member;
the representative proxy is never reified as a runtime object. This pin retires
on manual navigation, a new camera intent or prefix/recording replacement.

The destination solver evaluates physical poses against the unchanged full
canonical-catalog semantic-zoom metric, including all hysteresis starting
levels. Generic travel targets MEDIUM; an actual ownership key targets CLOSE.
It frames the original proxy anchor and a real member in Safe Frame without
moving their anchors or forcing Detail_Level. Ordinary collision constraints
are applied before measurement, and a route ending short of the validated
destination is rejected. Travel
uses the shared eased 900 ms route, with the existing one-frame reduced-motion
and manual-input cancellation rules. No trace, graph, Lens or selection repair
is introduced by the camera intent.

The application now routes a native proxy double-click through this intent.
The planner pins its actual member through the ordinary mandatory budget,
removes it from residual counts, and releases the pin after cancellation.
The Inspector distinguishes a cluster absent from the current presentation
from a runtime entity absent at the Cursor; it invents neither a count nor an
expanded runtime object. A read-only QA observation exposes the unchanged Focus
target for native interaction checks.

Four solver/accounting tests use the normalized synthetic catalog, retaining
its conservative library ownership. They check every member corner after
ordinary collision constraints in all five viewports, canonical metric
hysteresis, unchanged anchors, exact accounting and invalid/absent targets.
An explicitly supplied ownership key exercises CLOSE math only; it is not
evidence that production ownership clustering exists. The camera-store test
also protects Focus, pre-Focus pose, Trace, selection and manual/Follow release.
Eight actual-JVM dense-fixture browser cases cover the five target viewports and
reduced motion, native face double-clicks, the shared 900 ms stepped clock,
actual detailed-member bounds, unchanged prefix/anchors/Focus, manual input and
cursor-change cancellation. Six initial focused checks and two additional heap
checks pass. The heap cases exercise desktop and narrow object geometry, and
the desktop case retains a different, actual frame as its Focus target.

Original-size inspection of these eight diagnostics confirms spatial depth and
readable Inspector status. Dense route crowding, foreground label clipping,
and narrow-sheet timeline occlusion remain visible; this is not visual approval.
Manual Focus pivot semantics after auxiliary camera travel also need the broader
Focus convergence audit; these checks prove identity retention and cancellation,
not that every Focus interaction criterion has passed.
Production ownership hierarchy, full reference comparison and final performance
and semantic acceptance gates remain open.

Release checks: build, lint and strict reference TypeScript pass. The full
default suite passes 1,809 tests with 70 opt-in skips in 157.31 seconds; all
48 final reconstruction browser checks pass in 4.8 minutes. AppRoot is
342.29 kB gzip. The eight final-run travel captures received original-size
lead review; none is marked as formal reference-matrix visual approval.

## Ownership hierarchy — implemented functional cut, visual convergence open

Ownership clustering uses actual normalized type-metadata observations, indexed
with semantic sequence numbers in placement data. Unknown ownership stays
unknown; conservative scene defaults and type-name prefixes cannot create an
ownership cluster. The ledger retains first-known ownership and classification
changes, resolved at the applied-prefix Cursor. Cluster anchors use the earliest
recorded observation of the same ownership key within the same canonical runtime
region. Later metadata and future members cannot change earlier membership.
Runtime state, graphs, normalized events, canonical bodies and ports stay intact.

FAR/MEDIUM residual library and JDK data use ownership keys. Existing mandatory
targets remain detailed; real external targets referenced by visible detailed
Frame rows or recorded project-object fields also remain detailed. The planner
uses the renderer's shared row-visibility model. Optional source detail must fit
together with those dependencies in its nominal budget rather than causing
optional traversal to invent mandatory overflow. Required dependencies may
overflow, with their actual reasons exposed. Quiet external volumes cannot
bypass ownership collapse. CLOSE exposes normal detail without moving bodies.

Region is the fixed spatial scope of a hierarchy; its grouping key is ownership,
type or package. Coarsening optional type groups uses recorded package ancestry,
with the root namespace as the final coarser package cut. Counts remain exact,
every identity appears once, and key identities/anchors persist across cuts and
rewinds. This cut is now connected to the production planner. It does not claim
the complete hierarchy/bundling milestone: collection, invocation-branch and
execution-age cuts and inter-cluster connector convergence still need their
own checks.

The real dense JVM bridge has 589 metadata observations, all bound to
prefix-present identities, including five JDK-owned objects/arrays. No runtime
alias or class-name inference is used. Thirteen new normalized-unit checks cover
the persistent ownership ledger, late/changed metadata, stable key anchors,
package cuts, row visibility, optional source/dependency costs and genuine
mandatory overflow. Together with existing camera/planner checks, all eighteen
focused checks pass. A unit fixture initially omitted PROGRAM_START and used an
ended-session context for a live-reference assertion; both fixture errors were
corrected before those results.

All nine existing cluster/metadata browser checks pass with the new cut. Six
explicit actual-JVM ownership checks cover all five target viewports and reduced
motion: FAR/MEDIUM collapse follows applied recorded metadata, selection does
not move the camera, native double-click reaches physical CLOSE in 900 ms (or
the reduced-motion final frame), and the original proxy anchor plus a real
detailed member's full bounds fit command Safe Frame. Desktop travel also
preserves a different actual focused frame. Every identity is counted once.

Original-size lead review of all six ownership destinations finds a remaining
visual limitation: library members can be behind foreground project solids
despite satisfying the geometric Safe Frame checks. The camera solver needs a
visibility-aware polish pass. Narrow Inspector/timeline occlusion and dense
foreground/glow readability remain open. These screenshots are diagnostics,
not formal reference approval or completion of A–G.

## Ownership visibility and Focus input — 2026-10-11

Ownership travel now ranks actual canonical cuboid sightlines through a bounded
set of physical camera angles. Arrays contribute their actual title plate,
not their reserved empty tray envelope; presented cells still need native
raycast verification. The solver retains ordinary collision admission, full
member bounds and original proxy centre inside command Safe Frame, and CLOSE
measured by the unchanged canonical global metric from every hysteresis state.
Generic type/package travel retains its prior angle search and MEDIUM target.

The renderer and camera share title/identity positions and world font sizes.
An ownership destination must project both headings at at least 12 CSS pixels
nominally and along both actual face-plane axes. This prevents nominally large
but horizontally compressed labels. Text sizes, canonical bodies, ports and
detail thresholds are unchanged. Sightlines remain a conservative ranking,
not a proof that every row or member in an arbitrary world is unobstructed.

The six actual-JVM ownership cases additionally click a fully framed detailed
member's centre through the native production raycast. Slot ownership comes
from actual recorded rows/entries/cells, never an alias spelling. After the
selection transition settles, read-only observation of actual WorldText
headings checks non-empty title, expected identity, positive rendered opacity
and the three projected size measurements. A single member click keeps the
camera, Focus and recorded runtime facts unchanged. All six refined diagnostic
captures received original-size lead review; narrow foreground overlap,
collection entry presentation and Inspector/timeline overlap remain open.

Manual non-shift arrow orbit and the first actual primary-pointer drag now
resolve the same actual Focus anchor as explicit Focus. They rebase the orbit
pivot while retaining the last safe eye for swept collision checks. Pointer
down or selection alone cannot rebase the camera; pan and dolly keep their
ordinary behavior. An absent Focus target supplies no replacement anchor.
Two native dense-JVM cases cover desktop and narrow layouts, auxiliary heap
travel, camera-stable clicks, keyboard orbit, pan then pointer orbit, and
restoration of the original pre-Focus pose.

Those native checks also exposed a shortcut scope bug: an open Inspector was
consuming World Escape globally. Dispatch now closes Inspector only while
keyboard focus is inside it. World Escape can exit Focus with the Inspector
still open; Inspector Escape preserves Focus and the camera. This scope change
does not alter the saved pre-Focus pose or any runtime identity.

This is a bounded camera/input convergence increment. The complete hierarchy,
inter-cluster connector convergence, broad visual polish, fresh formal 80/96
matrix, independent acceptance/performance gates and final A–G approval remain
open.

## Collection-sized members and stable proxy reservations — 2026-10-12

Structural proxies now reserve separate cuboids outside the immutable runtime
bands, rather than occupying their first member's body. Causal key introduction
order preserves their anchors when membership changes or a later ownership
observation arrives. Runtime geometry is not moved to make space.

The prior ownership travel notes above required an outgoing proxy centre in the
arrival view. CLOSE removes that ownership proxy. A remaining actual member
can be distant from its stable reservation, so ownership arrival now frames the
actual complete member at physical CLOSE with the same Safe Frame bounds and
tolerance. The centre assertion moves to that member, and the native gate also
requires the outgoing ownership proxy to be absent. Generic type/package
travel still frames its proxy centre. Actual face picking, camera/Focus/Cursor
stability and minimum 12-pixel heading checks remain required.

The bounded solver tries its existing centre-biased rectangle first and falls
back to the full actual Safe Frame only when no centred candidate is feasible.
No synthetic LOD, camera bypass or changed collision limits are introduced.
The repeated cancellation setup uses native Home only when no Focus exists;
zooming out from a distant member does not guarantee its proxy stays on-screen.
These changes and the common face/body press fix are documented in
`migration/collections.md`; final formal reference approval remains open.


## Closest perspective fit — 2026-10-20

`fitToSafeFrame` now solves the two perspective pan intervals directly in the camera's orthonormal basis. Their first overlap, together with the near plane and existing minimum distance, determines the closest fit at the requested angles. This replaces the iterative pan/binary-distance search and its unconditional 3% zoom-out. A relative 1e-10 numerical guard keeps exact boundary corners inside after the Three.js matrix round trip. No runtime anchors, canonical dimensions, FOV, fonts, camera ownership, collision constraints or zoom limits change.

Home converges on the actual projected structural-label footprint, stopping when all fitted corners are inside the Safe Frame, with a bound of 16 refinements. Removing the old distance margin first exposed five existing heading-visibility failures; those RED results are retained. The convergence correction passes those unchanged tests. The previous four iterations had depended on spare zoom-out rather than checking the final footprint.

Evidence is retained under `.ggjavaez/qa/reference-exact/`: `camera-fit-red.log` proves the old 7.925035 u fit violates the independently known 7.694209 u closest distance; `camera-fit-generated.log` includes 150 generated XYZ worlds with containment, immutable inputs and an independent Three.js projected-coordinate witness that no image-plane pan can fit a closer camera. `camera-fit-convergence.log` covers 186 camera/planner/text cases. `camera-fit-comparison.json` replays five matched saved actual-JVM scenes through exact parent camera modules and the new modules over the same presented cut. Home retains the same representative IDs while fitting 1.67–3.28% closer; most desktop Hero cuts remain constrained by their prescribed bands. This is a saved-input diagnostic, not fresh JVM or end-to-end performance evidence.

`font-angle-necessary.json` records 189 legal integer-degree yaw/pitch/FOV samples per saved viewport. Some desktop samples pass necessary body/title conditions; none of the sampled narrow cases do. These are necessary conditions only and finite samples, not a proof of continuous-angle infeasibility or full readability. Allocation-ordered type columns and fixed physical fonts remain unchanged; neither the specification nor tolerances are waived.

Fresh browser evidence and all eleven root-reviewed originals are archived in `camera-fit-captures/manifest.json`, bound to the 940-file source snapshot and native report. Six Hero captures include the additional native reference dimensions; five recursive Home captures exercise all viewport targets. Root comparison against `best.png` leaves World acceptance OPEN: small or absent deep-frame text, opaque matte faces, excessive connector glow/crossings, dense grid and clipped peripheral topology remain visible. The earlier files in `camera-fit-before-captures/` are retained as found and are not claimed as fully source-bound matched before images.


Validation on the unchanged source snapshot: full default units 2,144 passed / 70 existing explicit-opt-in skips / 2,214 total, 231 files (224/7), 180.50 seconds; native 16/16, zero skips/failures/flaky, 113.80 seconds, ten attached actual JVM session IDs (five Hero, five recursion). These are targeted checks, not the formal 80-session or final regression gate. Build, production/browser TypeScript, lint, references and protected substrate checks pass. Main entry is 71,761 gzip bytes; static entry closure 72,189 and Shell closure 668,756 diagnostic bytes, with Monaco and Cinematic split. `validation-camera-fit.json` records commands, exits and unchanged 940-file SHA-256 map. The intentional preservation-boundary exception is limited to `src/camera/projection.ts`, `src/camera/homeFraming.ts` and the focused projection test; all other camera files and all preserved backend/runtime files are unchanged. Fresh Dense performance, memory gates, full visual matrix and whole A–G acceptance remain OPEN.


## Avoid redundant collision queries — 2026-10-21

The visibility-graph solver now calculates a candidate path's distance before checking obstacle visibility. If that distance cannot improve the current shortest-path entry, it skips the visibility query. Every admitted edge still uses the original swept collision test against every solid; node order, strict-distance tie handling, parents, escape, target interpolation, limits and the large-world exterior fallback remain unchanged. This is confined to the existing camera presentation owner, with no runtime/backend or semantic changes.

The preceding query-hierarchy experiment preserved complete routes but saved only about 1% in the saved Dense diagnostic and made several routes slower. It was removed from production rather than retained as an extra abstraction. The replacement consists of one reordered guard and one short-circuited visibility condition.

Read-only comparison against the exact parent implementation preserves all 23 requested complete routes (33 route segments) on the saved actual Dense world's 38 collision boxes, plus 256 seeded generated routes including worlds above the existing 64-box fallback boundary. Inputs remain unchanged. Five alternating repetitions on the saved Dense cases total 804.470 ms before / 160.512 ms after; direct-path medians are essentially unchanged. These warm function timings are a diagnostic, not browser Focus/Home budget approval. Raw samples and exact comparison sources are retained in `camera-collision-route-proof.json` and its QA test/config. All 146 existing camera tests pass unchanged.

Full validation passes: 2,148 default tests / 70 existing explicit-opt-in skips / 2,218 total, 232 files (225/7), 181.16 seconds. Targeted native checks pass 16/16, zero skips/failures/flaky, 116.85 seconds, with ten attached actual JVM session IDs (five Hero, five recursion). Typechecks, lint, build, reference and protected-substrate checks pass. The 942-file source map is `f55d9aa6b07fea9d10df167b3bbcd02c1ec80483769d2769e9420a17e0b2dce6`; only this camera file differs from the prior checkpoint. Exact-source comparison proves every other byte of the camera constraint owner unchanged after the specified guard substitution (`camera-relaxation-owners.json`). Main entry is 71,765 gzip bytes, with 72,193 / 669,130 entry/Shell static-closure diagnostic bytes; Monaco and Cinematic remain split. All eleven original Hero/recursive captures are root-reviewed and source/report-bound in `camera-relaxation-captures/manifest.json`. Visual acceptance remains OPEN for undersized/absent labels, matte opaque faces, dominant connector glow/crossings, dense grid and clipped peripheral topology.

The fresh unchanged full Dense measurement also completes: Focus p95 150.426 ms and Home p95 182.679 ms, lower than the preceding 167.822 / 200.051 ms but still above 125 / 152 ms. Seek p50/p95 99.622 / 120.170 ms fail 55 / 112 ms. Cold loads, all five sustained orbit windows and soak pass. The final budget assertion exits 1, with every stage completed. Exact inputs/report/profiles are archived in `performance-camera-relaxation/manifest.json`; no latency, memory, visual or whole A–G pass is claimed.
