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
open; task 3.3 and the A–G milestones are not marked complete.
