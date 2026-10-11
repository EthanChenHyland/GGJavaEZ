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
