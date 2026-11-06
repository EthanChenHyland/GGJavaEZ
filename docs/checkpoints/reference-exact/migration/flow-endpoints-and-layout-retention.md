# Cold Flow endpoints and compact layout indexes

Spatial buckets store up to eight reservations in compact arrays. Denser buckets keep Set membership checks. Layout drops four private region lists and only replaces an anchor when a new port is reserved. The projector allocates slot indexes on the first observed slot and keeps the current reference block on its existing owner index. Published reference snapshots still come from the persistent reference tree.

Flow resolution now shares the physical endpoint resolver with motion. The catalog builds its own provenance record directly. Returns and reads resolve their captured consuming destinations without first building a motion transition. The motion path still constructs complete transitions from the same endpoints. A storage lookup reads its actual runtime owner once per resolution.

## Equivalence and validation

The isolated layout and projector comparison checks 36,000 collision outcomes and complete snapshots over 33 recordings, including the saved actual Dense recording. It covers duplicate reservations, negative coordinates, three bucket sizes, append boundaries and rewind. The layout-only source `e68bc1247bceb7d36890c222c13910b947f4aef862500ed933af5d4e7f6ec1cf` passes 81 focused cases, including the layout golden, and 12 native cases in 178.007 s with zero failures, skips or flaky retries.

The endpoint comparison matches 118,873 complete Flow records over 32 cuts from the saved Dense recording. It also matches all 4,905 motion transitions. The generated comparison covers 100 recordings and 1,000 cursor visits. Two paired timing diagnostics over the 32 Dense cuts measure before and after medians of 493.378 and 354.652 ms, then 485.681 and 348.887 ms. The timing loops consume each Flow result. Scene construction and equality checks are outside those timers. These are Node CPU diagnostics on a saved recording. The native command timings are measured separately.

The combined source `b65eb821386d41fd9638a69e64dcfa1f778a3ffbe691406af0a48a83a305beb7` inventories 993 inputs and six changes from `d593e00`. All eight validation checks pass in 334.087 s. The default suite passes 2,277 tests with 70 explicit opt-in skips across 244 files in 307.48 s. The combined native run passes 14 cases in 157.637 s with zero failures, skips or flaky retries. Cases cover recorded returns, exceptions, historical and bundled references, constructor inspection, unavailable evidence, Person replay and reduced motion. The full 110-case native gate belongs to `d593e00`.

## Generated retention

The unchanged protected Node run uses the same corpus hashes. LINE scaling is 1.199571613× for layout only and 1.113996127× for the combined source. Both pass the 2× limit. All retained-presentation ratios exceed 25%.

| Raw target | Parent bytes | Layout-only bytes | Combined bytes | Combined ratio |
| --- | ---: | ---: | ---: | ---: |
| 200 | 1573400 | 1561600 | 1749824 | 1.885700000 |
| 5000 | 5906512 | 5803592 | 5801768 | 0.469279639 |
| 20000 | 22277520 | 21921680 | 21906128 | 0.393189324 |

The layout-only run takes 28.661 s and the combined run takes 21.472 s. Both exit 1. These forced-GC deltas include runtime and host variation. The smallest combined corpus retains more bytes than the parent. Exact source, preflights, equality proofs and Node results are under `.ggjavaez/qa/reference-exact/` in `layout-retention/`, `layout-retention-prototype/`, `flow-endpoints-prototype/` and `endpoint-retention/`.

## Dense browser performance

Run `7e023caf-63e3-4b1b-bbe7-2b46862579f8` completes all ten stages in 474.290 s. Fresh JVM session `aed4e3d9-5d40-448d-8421-795abecf9f1f` records 7,492 raw and 9,852 normalized events with FULL capture. The report records zero browser, stage, lifecycle or suspended-request errors.

| Metric | Limit ms | Parent ms | Combined ms |
| --- | ---: | ---: | ---: |
| Seek p50 | 55 | 83.837 | 83.419 |
| Seek p95 | 112 | 116.852 | 116.560 |
| Focus p95 | 125 | 183.821 | 200.073 |
| Home p95 | 152 | 183.191 | 198.438 |
| Cold-load median | 5300 | 5008.656 | 5655.839 |

The combined run exceeds all five limits. The separate diagnostic seek profile samples 46.48 ms inclusive in catalog endpoint resolution, down from 82.27 ms in the parent run. The measured end-to-end seeks remain close. These are independent browser runs.

All five orbit windows pass with 16.7 ms medians, 17.5–17.8 ms p95, 2.4–2.6 ms p95 submission CPU and 99 maximum draw calls. The longest interval is 925.6 ms. The 60,929.5 ms soak reports zero median drift and +0.018012059% whole-frontend post-GC growth. The benchmark exits 1 and the archive exits 0. The reviewed Dense crop differs from the parent at 10 of 716,900 pixels. The full report, profiles and original are under `performance-endpoint-retention/` in the QA evidence directory. Latency, frame stalls, retention, visual polish and broader coverage remain open.
