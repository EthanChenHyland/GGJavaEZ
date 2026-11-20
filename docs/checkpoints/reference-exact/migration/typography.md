# Runtime typography migration — 2026-10-09

The renderer now uses synchronous Inter advance widths and ASCII pair kerning instead of a fixed average-character-width estimate. Titles reserve the measured identity width before fitting; rows have separate name, declared-type and value columns. Rendering previews do not mutate captured values or Inspector evidence. Unsupported local glyphs use Java Unicode escapes in the world preview; the Inspector retains the captured spelling.

`scripts/reference/prepare-runtime-fonts.mjs` pins every variable axis in the existing font sources and writes static 400/500/600 derivatives under `public/fonts/runtime/`. The derivatives add U+27E8/U+27E9 for the required availability markers and use the distinct family name Visual Java Inter. Original font sources and their metadata remain untouched. The OFL accompanies the derived assets. `generate-inter-metrics.mjs` reads these exact derived files. Both scripts use the existing FontTools interpreter (or `VJ_FONTTOOLS_PYTHON`); neither installs dependencies.

The original readiness assertion required one bounded regular-weight job. It now requires exactly three jobs with distinct weight URLs and the same finite alphabet, rejects readiness after only two complete, verifies both existing Drei cache keys after all three complete, and verifies repeated prewarm calls schedule no extra jobs. This preserves the original readiness guarantee while covering the weight-specific glyph atlases actually used by the faces.

Focused properties cover 100 randomized Unicode fitting cases and 100 projected font-size cases, including the exact 11 CSS pixel boundary. Captured String content containing ` · ` retains its literal rather than being split at the first delimiter. The projection check currently runs per text instance; per-entity/coarse-pose scheduling remains open and no large-world text performance approval is claimed.

Connector routing preserves canonical terminal coordinates and world reservations. Clear cubic paths remain smooth; obstructed paths use the bounded exterior visibility grid and clearance-checked short fillets. Routes sharing an endpoint pair are memoized within the plan. The queue uses a binary heap rather than scanning its entire pending frontier. A further 100 randomized cases verify deterministic routing, unchanged anchors, exact endpoints and no crossing of represented test faces. These checks do not close every clause of Property 40 or the dense-world routing budget.

The Cinematic normal-pass failure check injects an interrupted draw and verifies restoration of connector visibility, hidden-line state, materials, background, override, target, clear state and shadow updates. This closes the discovered failure path without weakening graphics recovery assertions.

## Preview and medium-row correction — 2026-10-10

The initial row abbreviation reduced references to `#id` and used full captured
String text on the face. That discarded the runtime type/known summary length
required by the face contract, and could send an unbounded String into a glyph
layout. Faces now retain `ValueText.text`: the bounded preview, runtime identity,
array length, collection size and recorder observation information already
produced by the pure value formatter. Inspector exact text is unchanged.

The prior abbreviated-reference assertion is replaced with the required typed
reference and known-length assertion. Added cases verify a 1,000-character
String stays bounded to its 48-character face preview while exact captured text
remains available, and verify array/collection summary sizes. This repairs the
assertion's earlier mismatch with Requirements 12.7 and the value-text contract;
it does not relax captured-value equality. MEDIUM rows now show `name → value`
with no type column, while CLOSE retains the declared-type grid.

## Structural-label placement direction — 2026-10-11

Lead contract: headings and cluster text retain real 3D anchor planes. Scale only
their glyph groups to a readable nominal minimum, then admit deterministic
non-overlapping projected rectangles inside the actual Safe Frame and outside
Inspector. Selected cluster labels outrank optional headings and background
cluster labels; larger real counts and stable IDs break ties. Counts never
abbreviate. Runtime body anchors, camera pose, semantic detail measurement,
membership and source evidence are unchanged. This is structural text, not a
screen-space substitute for the runtime solids.

Frame ordering is camera/motion at priority 0, structural text-group placement
at 0.25, text matrices/visibility at 0.5, and the existing compositor at 1. Font
visibility accounts for the actual ancestor scale and visibility, so batched
glyphs cannot ignore a culled parent or use the unscaled font size. Placement
is cached by actual camera/projection/viewport/plan inputs and adds no demand
render loop. Optional text that cannot fit is omitted. Cluster navigation,
ownership hierarchy and formal reference convergence remain separate open work.

Captions also avoid the projected bounds of actual represented solids and I/O.
They try at most five bounded vertical positions in the same real 3D plane;
headings try their canonical position and at most two font heights of lift in
the same plane, then omit if every candidate is blocked. No body or camera
moves. Structural font sizing measures the actual projected world-Y glyph span,
including oblique views, rather than distance alone.

Lift is bounded to four projected font heights, keeping captions close to their
volumes. The forensic panel participates in body clearance. Package previews use
the existing type formatter only when no different current canonical grouping
key has the same short name; ambiguous previews retain the qualified key and
literal dollar names remain literal. Inspector and identity keys stay exact.

## Heading clearance and empty-world presentation — 2026-10-11

Region headings now try at most two font heights of upward clearance while
retaining their original X/Z text plane. Two placement tests prove bounded
clearance, immutable canonical input and omission when all candidates are
blocked. The real debugger checks invoke Home at all five target viewports,
measure both rendered region headings inside Safe Frame at ≥12 CSS pixels,
and retain the manually scrolled Source view through narrow collapse/reopen.
The earlier manual-camera-preservation assertions still run before explicit Home.

Without either an editable or recorded runtime, the entire WebGL environment
uses the specified 45% opacity. The recorded-source route is explicitly excluded
from this idle state. Ready sits in the actual space beside Source/Explorer,
above region headings, with bounded width at narrow sizes. This presentation
does not refit the camera or create runtime entities. Desktop and narrow browser
checks measure prompt clearance, environment opacity and heading non-overlap.

The focused eight browser checks passed in 54.2 seconds. Original-size lead
review covered all five Home captures, all five pause captures and both idle
captures. Clearer small-program headings do not close global heading placement,
cluster ownership/travel, expanded Source/debug-toolbar overlap, dense route
hierarchy or the complete reference comparison.

## WebGL-unavailable font prewarming — 2026-10-11

Lead direction: the shared `preloadRuntimeText` entry point checks the same
graphics capability probe as the World before starting atlas work. Tokens and
legacy label imports can run before Canvas, so guarding only Canvas did not
prevent Troika from starting SDF generation against a null graphics context.
A negative probe starts no atlas worker and populates no font cache keys. A
later supported call still warms all three weights once and preserves the
existing all-jobs readiness barrier and both cache keys. Active context recovery
and shared text disposal are unchanged.

Both WebGL-disabled browser cases now observe all page/Console errors, warnings
and runtime-atlas font requests rather than ignoring the SDF diagnostics. They
still require usable Source/timeline, real Java execution and exact process
output with no World canvas. Process completion is independent of retained page
publication; the real-run check waits for the actual nonempty timeline.
This targets unsupported-graphics initialization, not overall visual approval.

## Header contrast over the navigable World — 2026-10-11

The Header now carries a translucent dark vertical backing across its existing
height, with the existing glass blur/saturation. Active navigation retains a
dark glass base beneath its blue tint. Header layout, shell layers, Safe Frame,
world lighting, floor materials and runtime geometry are unchanged.

Five fresh dense-JVM browser checks use Home and native keyboard orbit, with
no private pose setter or substitute background. They temporarily hide Header
glyphs to sample each enabled text/icon run's actual composited pixel background,
then restore the glyphs and capture the original viewport. Minimum measured
contrast across the ten states is 8.995:1, above the 4.5:1 requirement. Disabled
controls are excluded; this makes no contrast claim for inactive text. Both
sampling and capture preserve the real Cursor, anchors, Focus and camera pose.

All five checks passed in 33.0 seconds. Original-size lead review covered all
five orbit captures, including bright floor reflections visible immediately
below the Header. These are ignored diagnostics rather than replacements for
the formal reference comparison. Broad floating-surface/world contrast and
final visual approval remain open.
