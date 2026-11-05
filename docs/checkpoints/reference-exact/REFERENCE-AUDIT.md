# Reference audit

Implementation evidence as of 2026-10-13; final reference convergence remains open. The authoritative interpretation is the corrected specification at commit 68b394c98eee45c5e07a1f3b6340049449185941, especially audit.md. This report records the implementation's comparison boundary, not approval of all captures.

## Original images

All six original roots match their tracked twins and the twins at the corrected specification baseline. The read-only integrity command is `node scripts/reference/check-references.mjs`. It also checks root tracked status and exactly five user-owned root images. Neither that command nor capture tooling copies, stages or modifies the originals.

| Reference | Root | Twin under docs/visual-java-spec/references | MD5 | Ownership |
| --- | --- | --- | --- | --- |
| R1 | best.png | docs/visual-java-spec/references/06_true3d_person_runtime.png | 38a1b2005368d3cbe6543b17b4efd32f | tracked |
| R2 | ChatGPT Image Oct 3, 2026, 02_21_17 PM.png | docs/visual-java-spec/references/07_true3d_object_inspector.png | e9d35d690da9a09fe99f6778be6361e8 | untracked, user-owned |
| R3 | ChatGPT Image Oct 3, 2026, 02_21_12 PM.png | docs/visual-java-spec/references/08_true3d_recursion.png | 646bafb3401b9455f16ed9077fb4d29d | untracked, user-owned |
| R4 | ChatGPT Image Oct 3, 2026, 02_21_08 PM.png | docs/visual-java-spec/references/09_true3d_array_sort.png | 9daf4cafd88d61582c44d1552f0f94bc | untracked, user-owned |
| R5 | ChatGPT Image Oct 3, 2026, 02_21_05 PM.png | docs/visual-java-spec/references/10_true3d_reference_sheet.png | 1981d474a7209abe6dd9c9a4db634826 | untracked, user-owned |
| R6 | ChatGPT Image Oct 3, 2026, 02_20_44 PM.png | docs/visual-java-spec/references/11_true3d_scene_language.png | e01bbbe9ddce4ba3e6dc25927dc175bb | untracked, user-owned |

The B0–B5 schematic boards establish runtime ontology and navigation; R1–R6 establish the production finish. All originals were inspected at their original dimensions during the lead orientation. On 2026-10-13 the lead compared best.png again at 1672×941 with the actual completed Dense_Sample capture at 1440×900. That comparison identified remaining connector congestion, title truncation and floor/edge lighting differences; it does not substitute for comparable-state Hero review.

## Design versus runtime fiction

Cuboid proportions, acrylic depth, typography, source position and time controls follow the references. Captured Java identities, values, frames and references determine contents. Locals remain rows of their actual invocation, recursion follows the recorded call tree, returns only appear inside the applied prefix, and recorded collection previews never imply unobserved contents. A reference object number is not an implementation ID. Color roles stay central: cyan stack/execution, violet heap, teal class state, amber mutation/return and red exceptions.

Hero uses the shared 36° FOV, +8° yaw and −13° pitch; Focus uses a side view within the specified 18–24° yaw and −11° to −5° pitch. Exact framing, responsive surfaces and projected readability are validated from real captures rather than fitted to fixed demo coordinates. Source remains actual Monaco, including project/source binding safeguards.

## Comparable states

The production browser harness declares 16 states × five QA viewports (80 cases), plus one native-resolution capture per state (96 images). Each must belong to the latest complete real-JVM matrix, match its capture hash and pass the review gate. The native interaction suite is a separate 69-case gate and does not certify this matrix.

| State | Actual Java workload | Tracked reference |
| --- | --- | --- |
| runtime-hero | domain | 06_true3d_person_runtime.png |
| io | io | 06_true3d_person_runtime.png |
| object-inspection | domain | 07_true3d_object_inspector.png |
| recursion | recursion | 08_true3d_recursion.png |
| array-operation | array | 09_true3d_array_sort.png |
| completed | domain | 10_true3d_reference_sheet.png (recorded sheet crop) |
| focus | domain | 10_true3d_reference_sheet.png (recorded sheet crop) |
| return | recursion | 10_true3d_reference_sheet.png (recorded sheet crop) |
| array | array | 10_true3d_reference_sheet.png (recorded sheet crop) |
| far | dense | 10_true3d_reference_sheet.png (recorded sheet crop) |
| debug | debug | 11_true3d_scene_language.png (recorded sheet crop) |
| exception | exception | 11_true3d_scene_language.png (recorded sheet crop) |
| history | domain | 11_true3d_scene_language.png (recorded sheet crop) |
| free | dense | 11_true3d_scene_language.png (recorded sheet crop) |
| medium | dense | 11_true3d_scene_language.png (recorded sheet crop) |
| close | dense | 11_true3d_scene_language.png (recorded sheet crop) |

Final original-size review, side-by-side assets and diff assets remain required. REVIEW.md is the hash-bound review ledger; scripts/reference/convergence.mjs fails for missing or stale evidence and unresolved discrepancies.

## Current reconstruction increment — 2026-10-15

Scope sections, retired/late row geometry, historical Focus brightness, true sibling-ID reservation, front-only caption clearance, channel collision participation and editable-model ownership now receive production fixes and mapped successor checks. Nine old world test consumers and all six navigation test consumers use the current pipeline, retaining their case counts/corpora; obsolete production source/CSS/contracts removal remains outstanding. The native scoped capture is inspected at original size against best.png and still has material/lighting/grid/typography differences. The first full 70-case run fails 65/5; targeted recovery passes all 13 affected cases. Full convergence is pending, so A–G and reference-exact completion remain unapproved. Detailed evidence and the old/new oracle mapping are in `migration/scoped-faces.md`.


## Return evidence and Classic successors — 2026-10-15, ongoing

Return provenance now follows the stricter corrected Requirements 10.4/10.8 and 17.1/17.5: actual graph edges and prefix-visible consumers authorize curves; direct legacy return destinations do not. Candidate IDs now equal source edge IDs, and the graphless fallback is removed. This resolves the identified evidence-boundary defect without claiming visual or A–G completion.

## Classic implementation retirement — 2026-10-15

All 52 Classic cases now have production successors; the obsolete Classic renderer/CSS/selector and dead layout adapters are removed after consumer review. Shared physical chips and graph-owned return captions improve truth and consistency. Remaining old 3D primitives/browser/CSS/contracts, actual region-heading visibility, reference-level materials/composition and unchanged Dense performance failures remain open. [Migration and failed/corrected evidence](migration/face-motion-classic-removal.md).

## Focus anchor reconciliation — 2026-10-25

Two actual native failures established stale Focus geometry after array-window repacking. The camera correction now passes four whole-face/cancellation cases at desktop/narrow widths with normal/reduced motion. The latest 51-case combined gate still has one source-editor loading failure; the unchanged Dense benchmark still fails three latency budgets. [Source, reviewed captures and failed-gate accounting](migration/focus-anchor-reconciliation.md). Whole-product A–G and final reference convergence remain OPEN.

## Recorded source containment — 2026-10-25

Recorded-editor asset failure is now contained within Source instead of removing the workbench and runtime World. Two controlled failures and normal source/debugger/navigation/rendering workflows pass in a 63-case native gate. Eight of 77 originals are reviewed; final reference/motion convergence and three Dense latency budgets remain OPEN. [Scope and evidence](migration/recorded-source-containment.md).

## Stable World text renders — 2026-10-25

Equivalent text wrappers retain fixed fonts, exact content, all semantic annotations and camera-based cutoff behavior. No token, geometry, reference-image or performance-threshold changes. Known visual differences remain OPEN. [Evidence, boundaries and remaining failures](migration/world-text-memo.md). Whole A–G remains OPEN.

## Complete Frame value insets — 2026-10-25

Requirements 9.7/9.10 now extend the shared inset treatment to remaining Frame value kinds while preserving exact null/unrecorded distinctions. Heap null remains plain per 10.7. This does not approve universal Port behavior, motion or reference convergence. [Evidence, boundaries and remaining failures](migration/frame-value-chips.md). Whole A–G remains OPEN.


## Reference-chip attachment geometry — 2026-11-04

Requirement 9.8 attachment geometry is measured against the actual inset: non-null reference ports are centered on its right edge and remain visible independently of curves. Primitive chips stay port-free while proven value-transfer terminals retain frame-boundary geometry. Desktop/narrow actual-instance audits and all 60 integrated native cases pass. This is a narrow reference convergence fix; array/collection port geometry, global rendering and whole-product acceptance remain OPEN. [Exact source, regression and current measurements](migration/reference-chip-ports.md). Whole A–G remains OPEN.


## Focus connection hierarchy and target readability — 2026-11-04

Requirement 19.6 retains its reference-only neighborhood and now caps indirect connections even under Trace All or foreign selection. Actual rounded-target masking and an explicit faded-Focus depth modifier recover an obscured constructor without moving runtime geometry or the camera. Fresh native integration passes 69/69; reviewed originals still show wider material, glow and composition differences. [Exact source, failed/corrected evidence and outstanding work](migration/focus-connection-mask.md). Whole A–G remains OPEN.


## Private layout metadata compaction — 2026-11-04

Private layout metadata compaction targets measured retention while preserving every public anchor/port/bound/placement field in exact comparisons. Current full source validation and native 69/69 pass. ABBA shows a repeated medium/large retention reduction, while every memory budget and five fresh Dense latency limits still fail. The whole-product material, array, composition and reference/motion findings remain OPEN. [Evidence and boundaries](migration/compact-layout-slot-metadata.md).


## Array captions and precise cell Focus — 2026-11-04

Actual mounted array glyphs now verify above-cell index placement, centred values, heading/preceding-row ink clearance and exact-index Focus emphasis. Real cell front faces retain Requirement 19.5 bands and angles; reference cuts retain the focused semantic slot. Fresh 93/93 native success does not complete arrays or A–G: reference chips/ports independent of curve budgets, collection ports, trailing array-value truncation, global materials/routes/composition/motion and performance acceptance remain OPEN. [Exact scope, failed/corrected evidence and source qualification](migration/array-label-placement.md).
