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
