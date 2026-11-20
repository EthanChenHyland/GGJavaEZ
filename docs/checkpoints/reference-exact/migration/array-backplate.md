# Array glass backplate

Detailed array trays now include a 0.12-world-unit glass sheet behind their cells, using the shared heap material and instance batches. The sheet occupies the tray's reserved rear depth. Its position and extent stay fixed as execution and virtualized cell windows change. Empty arrays retain the sheet and the title plate with their recorded type, identity and length.

Connector routing and camera visibility use the physical sheet. Routing distinguishes its front surface from the larger clearance reserved for text on ordinary bodies. The router cache includes that clearance, so a reused route reflects the actual obstacle geometry. The native observations read the uploaded sheet transform and verify that every cell's rear face meets its front face.

Source `75a7d72da15e70d1373e7a3181f8b0ef4d6837ab31319efaec38631fbc0bcbd3` passes all eight source checks in 305.810 seconds. Default units report 2,285 passes and 70 explicit opt-in skips across 244 files. Build, both TypeScript checks, lint, artifact measurements, reference integrity and protected-source checks pass. The main entry is 71,733 gzip bytes.

The integrated browser run passes 28 of 28 cases in 444.705 seconds with zero failures, skips or flakes. Its reports attach 22 distinct actual JVM sessions with positive raw-event counts. Coverage includes empty arrays, 5- and 33-element arrays, all five viewport sizes and both motion modes for virtual cell Focus, actual static and array connector attachments, array and collection reference-chip picking, and the actual face palette in both quality tiers. The archive contains 33 original PNGs and 22 JSON observations, each with a recorded hash. The earlier seven-case preflight and single empty-array case also pass.

The reviewed full-tray and empty-array captures show a continuous backing behind the title and cells. Close cell Focus still crops surrounding tray content. Connector crowding, material finish and complete reference convergence remain open. Evidence lives under `.ggjavaez/qa/reference-exact/array-backplate-prototype/`.

## Checkpoint close — 2026-11-18

This checkpoint ships the browser recovery, physical array title placement, colored floor reflections and glass backing. Full-source validation and the focused JVM/browser results above qualify the delivered source.

The remaining release work includes a fresh complete default browser run, the 80-session reference matrix with review of all 96 captures, the opt-in acceptance and torture gates on the final source, and the Dense latency and presentation-retention budgets. Earlier Dense seek and Focus results and all three protected Node retention ratios exceed their limits. Whole A–G completion remains open.

Shared render geometry, captured-array lookup and packed Flow indexing remain saved prototypes under ignored QA directories. The Flow prototype passes 44 overlay tests and compares 1,278 prefixes plus 31,416 queries against the parent over a saved actual JVM recording and 32 generated workloads. Its production integration and protected retention measurements remain pending.
