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
