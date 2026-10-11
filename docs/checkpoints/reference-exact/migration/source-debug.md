# Source scrolling and Debug controls — 2026-10-10

Editable and recorded source now share one owned Monaco scroll binding. A
captured pause centers once using the final Source panel dimensions; hidden
drawers cannot consume that action. Later manual scrolling remains in place
until a different pause. Running follow waits two seconds after manual scroll;
Focus and History reveal only a new target outside the visible range. Resize
does not call an unconditional reveal or change the caret/selection. Listener,
timer, decoration and editor-action disposal belong to the mounted editor.

The source policy uses Focus first, then an actual debugger pause at the live
head, then the cursor event's source. Pause locations match exact binary class
identity, resolved manifest metadata and captured source hash. A stale reducer
line cannot consume a new pause's scroll action while source proof is pending.
Unknown locations retain the displayed file and remove the execution marker;
the footer says No project source. Runtime file opening keeps view state and
has a request guard, without the explicit navigation caret/focus action.
Workspace hash verification, rename bindings and dirty drafts are preserved.

The editable instance now survives file-tab changes. Monaco replaces its view
DOM node when `setModel` runs; the scroll binding therefore removes listeners
from the old node and attaches them to the current node. It waits for actual
visible ranges with a finite one-second deadline and owns cancellation of the
pending animation frame. View restoration completes before that deferred
scroll check. Explicit navigation is consumed once, rather than focusing the
caret again when an old tab returns. A pending attempt's pause cannot decorate
the retained previous recording; source proof checks both file identity and
line before a new pause can consume centering.

The six compact Debug controls remain in one fixed row: Continue/Pause, Over,
Into, Out, Stop and Inspect. They use command-registry enablement, accessible
names, disabled reasons and the same actions as the shortcuts. In a narrow
drawer its source controls sit below that bar. Expand Source opens the drawer
rather than closing it. The narrow peek reports the actual displayed source
location, or an unavailable dash rather than a guessed line one.

`source-scroll.spec.ts` imports an ordinary 240-line Java program through the
production bridge, sets a real breakpoint at line 91, and steps to line 100.
At each of the five required viewport sizes it checks both pauses in the middle
third, viewport-relative typography, all six control rectangles, native wheel
scrolling and unchanged first visible line/caret/selection/cursor/camera after
source expansion. The owner registers a read-only QA observation of the actual
Monaco model and visible range; this adds no eager Monaco import or editor
mutation API. Assertions use that range instead of virtualized DOM row counts.
Native macOS Chrome wheel packets are exercised repeatedly until the observed
range reaches line one; a single large delta is not assumed to be pixel scroll.

The strengthened fixture also includes a second Java file. Quick Open and a
real tab click make a round trip during the same suspended JVM pause; the
original source caret, selection, first visible line and world state remain
exact. The initial narrow hydration wait was corrected to the fixture's actual
alphabetically first file, Aux.java. This does not change pause or geometry
assertions. The final broad reconstruction browser run passes all 20 cases in
1.5 minutes, including all five strengthened source cases.

Five diagnostic cases passed in 37.7 seconds. All five complete screenshots
were inspected at original resolution against the unchanged scene-language
reference. Controls and paused glyph are readable; array header overlap and
flat bright body caps remain open. These diagnostic screenshots do not replace
the formal 80-case/96-capture matrix or its visual convergence reviews. Source
lazy mounting, exception source markers and the wider workspace cleanup remain
open at that checkpoint; task 3.3 and the A–G milestones are not marked complete.

## First editor display

A collapsed narrow drawer now has no mounted editor and does not request the
Monaco/editor modules. The first actual source display initiates the lazy load;
an empty panel alone does not consume that boundary. Later collapse retains the
editor and its view. This applies to editable and recorded Source. The fixture
harness waits for the hydrated file peek at narrow widths, without demanding
a hidden editor before Run.

The focused real-debugger narrow check passed in 9.4 seconds. The broader run
passed all 21 reconstruction browser checks in 1.5 minutes, including a new
recorded-viewer request/retention check and all five actual-JVM source cases.
Both narrow routes assert zero editor requests before display, a real module
load on opening, retained mounted models on collapse, and exact view/world
state on reopen. Recorded Source's actual Monaco read-only option is observed
through the owning editor. Build, lint and reference TypeScript passed; 68
existing source/layout/loader checks passed across five files in 321 ms.
AppRoot is 333.73 kB gzip. Exception markers, model-registry cleanup and broader
source/workspace migration remain open.

## Captured exception source

Editable and recorded Source now use the same decoration grammar for a captured
throw marker. It is a separate red line and `!` gutter indicator: it never
substitutes for the current execution, pause, History or Focus target. The actual
throw event must belong to the applied prefix of the explicitly identified
recording and resolve to one captured source file with a valid line. Caught
exceptions clear the marker; unwind retains it.

Editable files additionally require the existing hash-verified source binding,
the same recording session, displayed path and exact captured content. Dirty
drafts and other tabs cannot inherit the marker. Project/file generation changes
invalidate the proof. A short JVM that publishes directly at its terminal event
verifies throw provenance independently, without opening a file, moving the
caret or inventing a current source target. Runtime notifications carry their
recording identity atomically with the state because normalized event IDs can
repeat across recordings. Runtime/backend DTOs and reducers are unchanged.

Build, lint and strict reference TypeScript passed. All 21 reconstruction browser
checks passed in 1.5 minutes, including the actual uncaught JVM, dirty-source
invalidation and successful rerun, all five pause/tab/resize checks and both
narrow lazy-loading paths. A targeted ten-case run also passed in 59.4 seconds.
The terminal failure screenshot was inspected at original resolution: the
recorded throw line is marked while the footer and current source target remain
unavailable. This is a diagnostic, not a replacement for the formal 96-capture
visual review. Model registry retirement and wider workspace cleanup remain
open; task 3.3 and the A–G milestones remain incomplete.

## Settled pause viewport reconciliation

The later camera integration run exposed one narrow pause-centering failure.
Centering now waits until the panel reaches its final CSS dimensions, Monaco's
layout agrees with its displayed height, and a pending model-view restore has
finished. It then uses the actual editor layout once. The previous calculation
mixed a final panel height with an interim Monaco height; a late ResizeObserver
could consume the pause against that mismatched viewport. The existing finite
one-second frame retry owns cancellation, and hidden drawers cannot consume the
pause. Subsequent resize or manual scroll still does not recenter it.

Three consecutive actual narrow debugger runs passed in 26.5 seconds. The
middle-third bounds, font/pitch bounds, exact tab/resize/caret preservation and
later manual-scroll assertions are unchanged. The test also attaches the actual
owning editor's pause observation for future diagnosis.
