# Independent Phase 5 visual review

Status: scoped visual critique, not milestone approval. Root decides and implements any fixes. This pass changes only this document and runs no browser, tests, JVM, build or performance workload.

## Evidence and review count

**42 final screenshots directly inspected at original resolution: 23 coverage images, 3 supplemental narrow captures and 16 product-audit images.** Each filename below was opened individually with original-resolution image inspection. Directory inventory, JSON proof files, previous iteration images and other final screenshots are not counted as reviewed.

Coverage paths are relative to `browser-final/coverage/`:

- `arrays-focus-1440x900.png`
- `arrays-overview-1440x900.png`
- `collections-focus-1280x800.png`
- `collections-focus-1440x900.png`
- `collections-focus-1728x1117.png`
- `collections-focus-760x900.png`
- `collections-overview-1440x900.png`
- `collections-populated-focus-1440x900.png`
- `dependency-focus-1440x900.png`
- `dependency-overview-1440x900.png`
- `exception-focus-1440x900.png`
- `exception-overview-1440x900.png`
- `large-world-focus-1440x900.png`
- `large-world-overview-1440x900.png`
- `oop-focus-1280x800.png`
- `oop-focus-1440x900.png`
- `oop-focus-1728x1117.png`
- `oop-focus-760x900.png`
- `oop-overview-1440x900.png`
- `statics-focus-1440x900.png`
- `statics-overview-1440x900.png`
- `stdin-stdout-focus-1440x900.png`
- `stdin-stdout-overview-1440x900.png`

Supplemental paths are relative to `browser-final/`:

- `m11/person-completed-760x900.png`
- `provenance/constructor-focus-760x900.png`
- `screenshots/partial-760x900.png`

Product-audit paths are relative to `browser-final/product-audit-v11_5/`:

- `banking-code-760x900.png`
- `banking-completed-1440x900.png`
- `banking-completed-1728x1117.png`
- `banking-completed-760x900.png`
- `banking-debug-entry-1440x900.png`
- `banking-debug-entry-760x900.png`
- `banking-focus-1440x900.png`
- `banking-focus-1280x800.png`
- `banking-focus-1728x1117.png`
- `banking-focus-760x900.png`
- `banking-focus-active-1440x900.png`
- `banking-focus-active-760x900.png`
- `banking-focus-completed-760x900.png`
- `banking-focus-completed-1280x800.png`
- `banking-focus-completed-1728x1117.png`
- `banking-input-760x900.png`

**12 reference image files directly inspected at original resolution for comparison**, counted separately from implementation screenshots:

- Root `best.png`.
- Root `ChatGPT Image Oct 3, 2026, 02_20_44 PM.png`.
- Root `ChatGPT Image Oct 3, 2026, 02_21_05 PM.png`.
- Root `ChatGPT Image Oct 3, 2026, 02_21_08 PM.png`.
- Root `ChatGPT Image Oct 3, 2026, 02_21_12 PM.png`.
- Root `ChatGPT Image Oct 3, 2026, 02_21_17 PM.png`.
- Spec `06_true3d_person_runtime.png`.
- Spec `07_true3d_object_inspector.png`.
- Spec `08_true3d_recursion.png`.
- Spec `09_true3d_array_sort.png`.
- Spec `10_true3d_reference_sheet.png`.
- Spec `11_true3d_scene_language.png`.

Reference files contain some repeated compositions; this is a file review count, not a count of distinct visual concepts. Full Markdown/spec and earlier reference inspection from the preceding assignment remain applicable.

## Visually evidenced blockers and scoped recommendations

### R1 — narrow Inspector spends the visible budget before showing values

In `coverage/oop-focus-760x900.png`, the Inspector occupies approximately X=490–750, Y=174–505. Its footer starts around Y=443. Ownership, Runtime type and Java class metadata consume nearly all of the body: the first `rate / 13` row starts around Y=427 and is cut by the footer. The selected world face still shows `rate int 13`, but the Inspector does not provide a complete immediately readable field row.

In `coverage/collections-focus-760x900.png`, metadata fills the same body and the visible content stops at the Java class heading. The `No recorded values` summary visible at larger sizes is below the first visible portion. These are default presentation failures at the requested narrow viewport, even if scrolling can retrieve the content.

The supplemental `provenance/constructor-focus-760x900.png` and `screenshots/partial-760x900.png` are more severe when Console remains open: the world is roughly 320px high, and the Inspector exposes an identity, a metadata heading and its footer without observed field values. In provenance, the identity also breaks `Extension` across lines. Source and Console are readable; their coexistence exposes the insufficient Inspector content budget.

The later `product-audit-v11_5/banking-focus-760x900.png` is useful counterevidence: expanded runtime Focus with Source collapsed exposes both `owner → String #8` and `balance 118` clearly on the world face and in Inspector. The active and completed deposit Focus captures at 760 likewise expose `this → Account #13` and `amount 25` in both places. R1 applies to short runtime/Inspector layouts sharing height with Source or Console; it is not a general failure of 760-wide Focus.

**Recommendation:** prioritize observed fields/elements/locals immediately after identity in short layouts; collapse or condense ownership/type metadata, reserve at least one complete value row above the footer, and retain an obvious scroll affordance for overflow. Preserve exact identities/types in expandable metadata. Consider a compact Inspector sheet or a deliberate detail expansion when Source and Console are both open. Do not shrink value typography to fit more metadata. Stills establish the visible deficiency, not whether scrolling or keyboard access is broken.

### R2 — long contextual readouts extend beneath the Inspector

Both `coverage/large-world-overview-1440x900.png` and `coverage/large-world-focus-1440x900.png` show the long green array-value summary at approximately Y=210 continuing into the translucent Inspector at X≈1148. Text is visible behind its heading/identity area. This is a concrete collision between supporting runtime text and the selected entity's DOM panel, rather than distant 3D context leaving the viewport.

The supplemental `screenshots/partial-760x900.png` similarly shows the Visualization partial banner continuing behind the Inspector, obscuring part of the recording-budget explanation.

**Recommendation:** give contextual array/partial readouts the same unobstructed rectangle used for selected geometry. Bound or wrap the visible prefix and keep the observed-prefix/total-length disclosure explicit; retain all recorded values in Inspector/Console as appropriate. Avoid using Inspector translucency as the solution. No evidence here requires changing runtime data or camera behavior.

### R3 — microscopic native face captions duplicate macro overview names

Explicit macro states in `coverage/statics-overview-1440x900.png`, `coverage/dependency-overview-1440x900.png`, `coverage/exception-overview-1440x900.png` and `coverage/stdin-stdout-overview-1440x900.png` retain tiny native face titles/rows near readable external method/type annotations. Individual projected letters on these small solids are only a few pixels high. The warm/cyan routes and labels then compete with this texture. The redundant `completed` subtitle also repeats the status already in several external invocation names.

The overview of Dispatch is a useful example: the external `Dispatch #5` identity is legible, while its native field face becomes fine horizontal noise. The OOP overview also relies on very small native labels without the readable external overview naming seen in the explicit macro captures.

The banking completed captures at 1440 and 760 reinforce this finding: external invocation/object names remain legible around very small retained bodies, while native face titles/rows contribute unreadable texture. Small projected bodies at an overview scale are intentional; the duplication of unreadable detail is the issue.

**Recommendation:** suppress native text captions/slot values for macro representatives and other records whose projected captions are below a readable threshold; keep their genuine bodies, inset information surfaces, semantic edges, attached endpoints and stable anchors. Retain bounded external overview names/counts and exact Inspector values. Keep full native face detail when Focus/meso/micro provides sufficient pixel size. This should be a shared LOD/text-budget decision; avoid deleting geometry or special-casing project names. Root should decide whether the OOP overview needs an earlier projected-size transition to the same readable annotation policy.

This is a legibility/polish blocker, not evidence that macro aggregation itself is wrong.

### R4 — small array identity header has insufficient text separation

In `coverage/arrays-focus-1440x900.png`, `Main$Parcel[] #3` and `length 3` meet in the same narrow header line with little separation. The lower `HEAP · ARRAY` caption is partially cut at the header boundary, and a relationship route runs through that lower header region. The three indexed cuboids, null value and reference IDs are otherwise individually readable.

**Recommendation:** allocate distinct measured identity and length regions, or move length to a second line; reserve the lower caption's baseline and keep exterior routes outside that caption rectangle. Maintain the same array cuboids and actual indices. Root should verify the settled state before selecting the smallest typography/spacing fix; these stills do not prove a routing regression in every array.

## Architecture, depth and reference comparison

The shared rectangular vocabulary is evident across frame, object, array and class-storage captures. Overview solids have perspective, top/side faces and cast shadows. Selected OOP, collection and Dispatch objects expose right-side extrusion. This is genuine spatial depth in the stills; I do not identify a fake-3D or broad flatness blocker.

The reference images make selected faces substantially more dominant and expose stronger top planes. Current Focus captures favor a near-front view with a thin top plane and a dark side. At 1728, OOP and ArrayList titles/values are large and clear; at 1440, Dispatch's four fields and populated ArrayList entries are readable. At 760, with Source visible, the selected body is much smaller. Improving narrow information allocation is more justified than increasing bloom or rebuilding the spatial architecture.

The app uses much less glow than the concepts. There are no giant halos or washed-out text in the reviewed stills. This follows the binding design-system preference for controlled emphasis; reference brightness is not a target to copy literally. Secondary face/side contrast could be improved as polish, but a generalized glow increase would not address the evidenced issues.

Completed invocation geometry is neutral and retained, heap geometry is purple, class storage is neutral, and catch emphasis is localized red. The exception capture is a completed caught/unwound history, not an active uncaught crash; it should not become a globally red scene. The populated collection at History 84/160 and the empty list at Live 160/160 are different observed states, not a visual mismatch.

## Intentional LOD, viewport context and boundary checks

- Macro type/call summaries and quiet-record counts are intentional. Missing full slot detail on distant, unselected bodies is not itself a blocker. Tiny text still being rendered alongside readable macro names is the specific R3 issue.
- Cropped neighboring frames in statics/dependency/exception Focus are off-viewport context. The selected face remains contained above the timeline. Do not force all context into every Focus view or arbitrarily relocate stable bodies.
- Some world connections continue toward off-screen neighbors. A line leaving the canvas does not prove a broken reference. In the inspected source-visible captures, scene geometry/routes stop at the source boundary; there is no visually evidenced WebGL line painted across Monaco text. World context behind the Inspector is distinct from a selected-value readout crossing its panel, as in R2.
- Source syntax and active-line bands remain readable at 760. Long Java lines clip horizontally within Monaco and show a scrollbar; that is ordinary source viewport behavior, not lost code. Source selection synchronization and editor lifecycle cannot be certified from pixels alone.
- Narrow world selectors shorten long identities within their controls; the full identity remains available in the Inspector. The wrapped provenance Inspector title and metadata-first content allocation are separate issues.
- Static screenshots cannot verify orbit/pan/dolly, camera interruption, stable anchors through replay, motion correctness, picking or frame rate. Their apparent consistency is not a behavioral acceptance result.

## Product-audit follow-up and evidence limits

The first banking captures arrived during review. The 16 individually inspected files are listed above. Expanded object Focus at 1280, 1440 and 1728 has readable selected identity/values and genuine extrusion, with no supporting text crossing Inspector. Completed deposit Focus at 1280 and 1728 also retains readable local values. The 760 object/active/completed Focus captures confirm readable selected values when runtime owns enough vertical space. Inbound reference entries remain available in the tall Inspector; off-screen inbound world routes are not missing-reference evidence. At 1280, the inbound references heading reaches the footer boundary, while both selected fields remain wholly visible; that is secondary overflow, unlike R1's hidden primary value rows.

`banking-input-760x900.png` shows Source, Console input and runtime sharing height. Source is horizontally scrolled, visibly clipping line beginnings within Monaco; that state alone does not establish a source-rendering defect. Its unselected meso frame is small, and its native captions are weak at that scale, consistent with the projected-text budget concern in R3. No selected Inspector is present in this capture.

**Root follow-up requiring lifecycle evidence:** both banking debug-entry captures (1440 and 760) show `Paused · entry`, Live 8/8 and source line 13 highlighted, but no visible frame/object body in the world—only a floor fragment. This is an observed blank-runtime state, not a depth/style complaint. Root should reconcile it with the entry event's available entities and settled publication/camera state. Stills cannot determine whether it reflects a transient capture, unavailable runtime data or a camera/publication defect; do not treat this image as proof of a coherent debug-entry world.

Graph-stress, large-record, empty-record, array and banking failure/exception product captures have not yet appeared in the inspected inventory and are not counted as reviewed. An existing screenshot in another iteration is not a substitute for final evidence. Highest priorities remain unobscured selected values at 760, contextual readouts outside Inspector and removal of unreadable duplicate macro captions. This document is an independent critique with explicit evidence limits, not a completion endorsement.


## Lead reconciliation after the independent pass

The historical critique above is retained without changing its evidence count or treating it as approval. Lead reviewed the final revisions directly: R1 values-before-metadata plus short-container chrome passes complete-row containment at four sizes; R2 supporting readouts stay within the unobstructed region; R3 native macro captions are suppressed while bounded external names and real inset bodies remain; R4 uses measured array heading regions and exterior attachments. Blank banking Debug entry is corrected by a one-time first-actual-invocation fit under Home/Guided ownership. Final test and capture provenance is in VALIDATION.md, VISUAL-QA.md and QA-MANIFEST.json.
