# Rejected routing experiments — 2026-10-25

Neither experiment changes production code. Parent source is a9206fa; offline variants and reports are retained under `.ggjavaez/qa/reference-exact/connector-edge-grid-*` and `connector-clearance-scalar-*`.

The saved actual JVM session 2d460259-4d7b-4c02-a17c-6a26d35156eb contains 7,492 raw / 9,852 normalized events. Three detail levels × fifty actual cell targets × selection/Focus produce 300 plans, 20,103 route calls and 6,530 unique inputs. Of those, 5,707 require an exterior corridor after direct-curve clearance fails.

A bounded orthogonal-edge lookup preserves exact corridor coordinates for all 5,707 captured inputs and 1,000 generated cases. Seven interleaved helper samples after one warmup each have median 142.571 → 125.195 ms (ratio 0.8781). That isolated helper improvement does not establish browser command benefit; the current profile contains only 88.574 ms inclusive in its grid search across the extra command pairs. Added edge storage and algorithm complexity are not introduced for this limited result.

A scalar face-clipping variant also preserves the captured results and 4,000 generated polyline decisions. Its prepared-helper median is 13.464 → 14.266 ms (ratio 1.0596), so it is rejected. The earlier unprepared-helper comparison (69.154/69.167 ms) is separately retained and is not treated as the production prepared-call method. The initial generic Vitest invocation discovers zero ignored probe files and exits 1; explicit isolated configs then execute both probes successfully. No benchmark thresholds, production routing policy, route geometry or runtime semantics change. The three Dense latency failures remain OPEN.
