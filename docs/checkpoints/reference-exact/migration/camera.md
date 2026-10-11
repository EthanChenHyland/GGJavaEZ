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
