# Reference convergence review

This is the lead's visual review record. No state is approved merely because a
browser test passes or an absolute-difference image exists. `npm run qa:reference`
requires the complete 80-case real-JVM matrix, all 96 ready captures, successful
rectangle checks, and a current review for each capture. Filtered diagnostic
captures are useful evidence but do not satisfy the exhaustive gate.

Each state has one unchanged reference twin in `e2e/reference/states.json`. Sheet
panels are cropped at explicit native pixel rectangles. Application screenshots
remain complete at each QA viewport and at the original twin's full native
resolution. Comparisons contain the full application screenshot inside the
reference panel without distortion; their captions and capture reports record
the contain scale and letterbox padding. Pixel differences include real runtime
content and shell controls; no pixel similarity score automatically approves
visual fidelity. Changes to a default pairing must be explained here.

Use state IDs from the catalog and `1728x1117`, `1440x900`, `1280x800`, `760x900`,
`1440x650`, or `native`. Copy the screenshot SHA256 from its capture report.
A `converged` review requires all measured tolerances and a lead inspection at
original resolution. A `necessary-deviation` requires a concrete reason; it
cannot waive failed rectangle measurements. An `open` row records the largest
visible discrepancy and the next production fix, keeping the gate unsuccessful.

| State | Viewport | SHA256 | Status | Largest discrepancy | Category | Fix | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| runtime-hero | native | 45480b93c5bfb99d574b533c4021609d0f8da5478c65899663cb44436b070e2e | open | Overlapping cyan routes and bright purple caps dominate the face hierarchy; lower context extends behind the Time Dock | contrast | Bundle background routes with exact provenance counts and refine shared body/face hierarchy before recapturing | Original-size fourth-matrix lead review; geometry success does not approve visual convergence |
| completed | native | 2bcdf070679f8dc8efc9f77856524e266c2cd9e44258a9ea554acbb6de436e60 | open | Flat violet caps and overlapping routes dominate completed object faces | material | Refine shared face/body lighting hierarchy and connector prominence then recapture | Original-size fourth-matrix lead review; geometry success does not approve visual convergence |
| focus | native | cd97afd8a85467879a669f3e337b8c2825e2d352354041cbcff625759fa40e37 | open | Bright neighbouring routes compete with the selected object and cross label rows | contrast | Refine route hierarchy while preserving actual endpoint identities and Focus geometry | Original-size fourth-matrix lead review; geometry success does not approve visual convergence |
| runtime-hero | 1440x650 | e5c562914e7c860ea9e085e5a0482ce0489d371f594cb9f01cf8cdf08adf3a7f | open | Bright overlapping routes and flat caps still overpower compact face labels | contrast | Refine shared route and material hierarchy then recapture | Original-size fourth-matrix lead review; the measured gate passes and the visual discrepancy remains open |
| io | native | 68312cb21d2bce5500accb48ccce05b77c3904855c13b0b3bd90bc4cfb00f6db | open | Bright flat heap surfaces and large off-screen context weaken the focused I/O composition | material | Refine shared body hierarchy and readable Home representatives without moving anchors | Original-size fourth-matrix lead review; geometry success does not approve visual convergence |
| object-inspection | native | 0cc9cf818231eb6ec9bd32faa997a9021ce69a22fc2a317e2e73186a0e9c7da8 | open | Cyan routes cross field-label regions and overpower the selected face | contrast | Preserve recorded endpoints while reducing overlapping background-route prominence | Original-size fourth-matrix lead review; geometry success does not approve visual convergence |
| object-inspection | 760x900 | 6f67bb757f76c882b501dc40d9e7d47cac803819bf4b5cdb0e3f5b36eae97730 | open | Overlapping bright routes compete with readable selected field rows | contrast | Refine route hierarchy and recapture at the same narrow dimensions | Original-size fourth-matrix lead review; the measured gate passes and the visual discrepancy remains open |
| recursion | native | 838f4dc4404e9c0c26afd187a2298f030df494002937ed1e3916a30793fc3155 | open | Adjacent frame headers overlap and structural headings are outside the nearest-four view | typography | Converge projected frame-header clearance and structural heading visibility without moving runtime anchors | Original-size fourth-matrix review; nearest-four Safe Frame, monotone face centres and recursion angles pass at all five sizes |
| array-operation | native | f7c79fa6a06a3ee62c7fca247672700b6e598ac5de980e1499d09c6eb02e157f | open | Array header length and identity overlap and the mutated cell lacks a clear static cue | typography | Reserve separate header columns and converge captured mutation emphasis | Original-size fourth-matrix lead review; geometry success does not approve visual convergence |
| array | native | b1ab62f4fc3000bb51fc4fc0df06a4606ba884d8d5741baf8c435a79d8bd0f2a | open | Header identities overlap and completion overview makes index labels too small | typography | Fit array title and identity independently and review Home readability | Original-size fourth-matrix lead review; the measured gate passes and the visual discrepancy remains open |
| return | native | 50cea221df76aeab0ebd25356b27dd918366b97e1d3300de32af036c10d68d39 | open | Whole-tower overview makes rows unreadable; the amber return is near the Time Dock and RETURNS uses the wrong semantic color | camera | Frame the actual returning invocation and proven destination, and use the shared amber return token for its heading | Original-size fourth-matrix review; the curve is attached only after the captured consuming write |
| far | native | f10bc7fb21dfdb726e6b63cd3f8f58f2a140e2e4f3860dc2639b4a5e979255f2 | open | Cluster names and exact counts are unreadable at FAR; tiny bodies provide weak group hierarchy | typography | Make structural cluster labels readable at the actual projected scale while retaining exact membership counts | Original-size fourth-matrix lead review; geometry success does not approve visual convergence |
| debug | native | 2a2e8a74e758475631d06a9d670936844e48280c3e98e9fa09cac849cb807962 | open | Compact Debug controls wrap outside the visible bar, and flat caps dominate the paused world | controls | Present all required Debug actions as compact accessible controls inside the actual bar, then refine shared materials | Original-size fourth-matrix lead review; geometry success does not approve visual convergence |
| exception | native | d3f6151c2f67b2712cd0220e67b7130bf1eeb552e78cf00d196632770a3f377e | open | Bright red routes overpower the throw path and the terminal throwing-frame face lacks observed throw-time rows | contrast | Reduce unrelated-route prominence and present only captured throw-time row evidence without fabricating missing stack or cause facts | Original-size fourth-matrix lead review; geometry success does not approve visual convergence |
| history | native | 2818b3f3cbab11c6cb05b0a290d239585998233cd045ba6eed65c0c6be9c2e89 | open | Bright overlapping routes and flat caps dominate the recorded mutation world | contrast | Refine route hierarchy and shared surfaces while retaining the exact History prefix and anchors | Original-size fourth-matrix lead review; geometry success does not approve visual convergence |
| free | native | c238338aec172f0d33867adb7c19e56600965ded9accce77d09c88b011b39a7f | open | Dense connector crossings dominate free exploration and erase region hierarchy | contrast | Bundle optional background paths with exact provenance counts and preserve individually mandatory routes | Original-size fourth-matrix lead review; geometry success does not approve visual convergence |
| medium | native | fad1d1ca99889796836bcc1db711dc8f24d6246b7db38d5beab47879654c7558 | open | Most context faces and group identities are unreadable; bright flat caps dominate hierarchy | typography | Converge readable MEDIUM name/value and group labels within the actual detail budgets | Original-size fourth-matrix lead review; geometry success does not approve visual convergence |
| close | native | ab67e7d62a8ed99ccd57b8913c42688f489eed6590ce27ca8cd8050fa2b3e9d6 | open | Foreground faces are cropped by source and timeline surfaces and flat caps overpower local rows | camera | Converge readable close exploration composition and shared surface hierarchy without overriding manual camera input | Original-size fourth-matrix lead review; geometry success does not approve visual convergence |

2026-10-15 ongoing root review: the captured scoped-face image is inspected against original-size best.png; structural section labels and actual row picking align, while opaque faces, bright grid/routes, clipped neighbors and abbreviated names remain open. The first full scope run is 65/5; corrected targeted native recovery is 13/13, and a fresh 70-case run is in progress. These functional checks do not close the visual review rows above.

The next provenance convergence pass must reconcile the remaining graphless return presentation fallback (`sceneProjector.returnFlows`, `presentationPlanner`'s `!input.flows` branch and `frameStatus`'s direct destination shortcut) with Requirements 10.4/10.8 and 17.1/17.5. The design mentions RuntimeState return destinations as candidates, but the requirements still demand an actual graph edge for a visible Flow and its stable edge ID. Structured captured return facts may remain without authorizing a graphless curve. Current fixture-oriented return checks are not final proof of this boundary; no synthesis of graph edges from legacy events is authorized. This follow-up remains open while source is frozen for the current checkpoint gates.


## Return evidence and Classic successors — 2026-10-15, ongoing

The return fallback identified above is now removed: projector candidates and Flow catalog use the same recorded graph return/consumer witness; frame values remain visible while that witness is absent. Targeted unit and fresh-JVM native evidence is recorded in migration/return-evidence.md. Earlier scope checkpoint confirmation is now 70/70 native, 3/3 cached CPU and 19/19 guardrails at pushed 5fd9f27. The visual findings in the table remain open.

Further frozen-source audit: motionSubjects in motion/overlayGeometry.ts still derives frame pulse rows from permanent row.port instead of the shared scoped/windowed faceRowPort, and uses legacy collection entry ports. The shared labels, picks and reference/Flow endpoints have moved to the bounded face/window mapping, so temporal emphasis must converge on that same physical mapping. Reproduce with actual scoped/captured late-row and Map-entry records after the current native gate; do not move canonical bodies or fabricate ports.

The return renderer audit also finds no consumer of PresentedCurve.label in the active render tree: ConnectorBatch draws lines/endpoints/arrows, while StructuralLabels handles only headings/clusters/bundles. Recorded return values therefore lack their required visible return captions (10.4/10.7). Add bounded graph-edge-owned captions with actual glyph observations and native visibility checks after the frozen native checkpoint; show operand lines only when captured, and preserve exact values in inspection.


## Focus connection hierarchy and target readability — 2026-11-04

The root reviews eight originals from exact source `18463b85` against the existing reference language. Constructor Focus text is recovered; both-tier palette bytes remain exact. Existing global review rows remain OPEN: indirect connection masking does not resolve bright direct routes, matte caps, context clutter, return caption placement, long-stack clipping, array label/mask behavior or the unreviewed images. Source-bound originals/hashes and failed/corrected runs are retained in [the Focus evidence ledger](migration/focus-connection-mask.md).


## Private layout metadata compaction — 2026-11-04

The root reviews the two-file layout change and explicit-GC value-release proof, with exact parent/candidate geometry comparisons across 57 traces. No runtime semantics or design token is changed. Existing visual review rows remain OPEN; removing unused private metadata does not close them. [Proof, source and remaining gates](migration/compact-layout-slot-metadata.md).


## Array captions and precise cell Focus — 2026-11-04

The root reviews the shared geometry, text-only font dependency, optional camera clearance and explicit guard exceptions. The unchanged presentation golden test remains; independent complete-state comparison accounts for all 98 cases, with only 40 array hashes changing by the intended cell/port offset and 58 identical. A read-only delegated review finds no additional scoped issues; it runs no functional tests. Six fresh original PNGs receive root full-size review; 111 remain unreviewed. Matte caps, route/outline glow, crossings, dense context and clipping remain OPEN. [Exact scope, failed/corrected evidence and source qualification](migration/array-label-placement.md).

## Array and collection reference chips — 2026-11-05

Reviewed the shared geometry, independent port generation, current-versus-historical attachment boundary, cell Focus opacity, real slot picks and read-only GPU-transform observation. Five older presentation expectations failed before reconciliation; original whole-row counts/geometry, generic data-flow ports and runtime identities remain exact, with new physical inset-edge assertions added. The only differences from the four-case native preflight are four unit test files; the complete eight-check validation and 99-case native run are freshly executed from `cafbcb15`. Node/Dense failures are recorded without waivers. Whole A–G remains open. [Scope, failed attempts, source qualifications and complete results](migration/structure-reference-chips.md).

## Collection departure clearance and stable connector picking — 2026-11-05

Reviewed actual-port departure geometry, narrow source-caption clearance, untouched owner anchors/cache bounds, machine-roundoff picking and residual Flow-bundle priority. Original hover/history cases exposed the two picker defects; their failures, read-only diagnostics and new failing regressions are preserved. Separate trace evidence identifies offscreen catalog scans; only test setup changes, retaining native selection, assertions and timeout. Current full8/native 101/101 pass; memory and broader visual acceptance remain open. [Implementation, failed evidence and exact source qualification](migration/reference-departure-clearance.md).

## Shared world inputs and glyph preparation — 2026-11-05

Reviewed the private render snapshot, narrowed mesh and label inputs, and the frame-scoped glyph reuse. Mask reuse requires inheritance from the batch material and the same uniform table. The regression checks both compatible masks, an independent pass and the next frame. The retained failures include the pre-fix unit exercise and test-only type errors. [Implementation and source evidence](migration/render-frame-preparation.md).
