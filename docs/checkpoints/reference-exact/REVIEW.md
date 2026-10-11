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
| runtime-hero | native | f363772ff759dfe0e819865440aef048c53507a6b86b789aa6d8958f39065fb7 | open | Overlapping cyan routes and bright purple caps dominate the face hierarchy; lower context extends behind the Time Dock | contrast | Bundle background routes with exact provenance counts and refine shared body/face hierarchy before recapturing | Original-size lead review of the third matrix capture; frozen horizontal geometry passes, visual convergence remains open |
| completed | native | e6eba42737ea5d7a6d6df00dfeb33ebe1f65acc6e419cb7af077dced9358ea3a | open | Flat violet caps and overlapping routes dominate completed object faces | material | Refine shared face/body lighting hierarchy and connector prominence then recapture | Original-size third-matrix review; actual dimming is present, visual convergence remains open |
| focus | native | a53b934cc08163b6568a3980586f303d4fc0e7ee9ec2b2f79f6faf7d963dadf4 | open | Bright neighbouring routes compete with the selected object and cross label rows | contrast | Refine route hierarchy while preserving actual endpoint identities and Focus geometry | Original-size third-matrix review; target height and angle pass, surrounding hierarchy remains open |
| runtime-hero | 1440x650 | 5e2a2ff70a8b0683b9e2e13a33ae2b01208951f37ddbe72a02a39c8fca9d2f75 | open | Bright overlapping routes and flat caps still overpower compact face labels | contrast | Refine shared route and material hierarchy then recapture | Original-size third-matrix review; the earlier frozen stack-band miss is resolved without tolerance changes |
| io | native | 73a804ef39ec345e86e6437749a70066d91925a782c586c2962ee57e5e2ce50f | open | Bright flat heap surfaces and large off-screen context weaken the focused I/O composition | material | Refine shared body hierarchy and readable Home representatives without moving anchors | Original-size third-matrix review; all three captured I/O endpoints are visible, visual convergence remains open |
| object-inspection | native | fa9af56aec0e7209b1bb36d89076a1dc728d3885f1ed0b6866e9b8c795c4f931 | open | Cyan routes cross field-label regions and overpower the selected face | contrast | Preserve recorded endpoints while reducing overlapping background-route prominence | Original-size third-matrix review; target height, angles and Inspector occlusion pass |
| object-inspection | 760x900 | b2a86d52b8dcd809ac40820c6d63f10da3a3b43e37057007fe2ed88414fb10d7 | open | Overlapping bright routes compete with readable selected field rows | contrast | Refine route hierarchy and recapture at the same narrow dimensions | Original-size third-matrix review; target is above the Inspector and within the unchanged height band |
| recursion | native | 9803b5aad26879105914ca6702235001de35f34372bb2afaf1af1f1ba198cc7a | open | Whole-tower framing makes deep invocation rows unreadable | camera | Implement Follow framing for the deepest frame and three actual ancestors separately from Home and Hero | Original-size third-matrix review; generic recorded recursion is present, camera convergence remains open |
| array-operation | native | 5924d74aca5a3172c1023771636e8aa78295be43177a3097ece43a02302a7645 | open | Array header length and identity overlap and the mutated cell lacks a clear static cue | typography | Reserve separate header columns and converge captured mutation emphasis | Original-size third-matrix review; captured sorting-loop write and temporary duplicate values remain truthful |
| array | native | df7cc289c4662db699944f75feee90d6402a04b3f98acc7e5f1c4fabf964c656 | open | Header identities overlap and completion overview makes index labels too small | typography | Fit array title and identity independently and review Home readability | Original-size third-matrix review; all five captured cells retain stable indices and final values |
