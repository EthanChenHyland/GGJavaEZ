# Phase 4 semantic memory gate

## Workload and result

The gate ran before coverage expansion, using the unchanged Phase 3 paired generator, seeds, batches and graph semantics. Node 24.20.0, Apple M4 Pro, 24 GiB RAM; explicit GC. One construction per configuration in each process, not repeated statistical trials. Inputs were held outside the retained-memory interval. Measurements include trace, history, graph and checkpoint roots; they are not isolated graph bytes or browser/GPU measurements.

| Rich semantic events | Before MiB | After MiB | Before append ms | After append ms |
| ---: | ---: | ---: | ---: | ---: |
| 462 | 2.97 | 0.95 | 6.65 | 5.07 |
| 9,788 | 48.49 | 17.75 | 115.88 | 90.42 |
| 38,302 | 183.40 | 65.89 | 528.02 | 347.85 |
| 190,031 | 817.76 | 353.18 | 2,560.00 | 1,965.53 |

At the largest workload, retention falls **56.8%**, and append time falls **23.2%** in this paired observation. Approximate retained bytes per rich semantic event fall from 4,512 to 1,949. The original Phase 3 checkpoint reported roughly 818 MiB / 2,429 ms; the new clean reproduction is the before column above. These timings are single observations, not percentile or confidence claims.

The largest graph retains exactly 6,814 invocations, 6,813 calls, 67,849 values and 110,408 edges. The 1,024-event checkpoint interval and 188 retained state roots are unchanged. All four graph SHA-256 digests match exactly between the before and after probes. Existing invocation/value/source/edge payloads were preserved.

## Root cause and implementation

Persistent Record storage previously allocated sparse 32-child arrays at each of six hash levels, including a complete path for a single key. The replacement is a prefix-compressed hash trie: leaves stop at a unique entry, branches use a bitmap and packed children, and full-hash collisions retain explicit key comparisons. Updating a record copies only its lookup path. Iteration order, numeric-key ordering, tombstones, reinsert order, JSON shape and immutable historical roots retain their existing meaning. Persistent Vector storage is unchanged.

The bounded 38,302-event heap diagnostic drops total snapshot shallow self bytes from 212,827,354 to 97,714,761. Unique trie child-array backing falls from 101,912,968 to 18,433,320 bytes. Categories overlap and include the test runner and inputs; these are neither dominator-retained values nor graph-only totals.

The snapshot audit includes execution contexts, source locations/files, method records, graph edge/value payloads, semantic fact envelopes, checkpoint/state holders, persistent entries and child arrays. Context, edge and value node counts and shallow bytes remain equal. String/descriptor/source duplication was considered, but the demonstrated dominant avoidable cost was the persistent Record's sparse child storage. This change does not introduce string interning, numeric IDs, mutable global state or compacted-away evidence. Temporary normalization metadata and collection expansion are measured separately after integration.

## Evidence and limits

- [Clean reproduced baseline](baseline-clean/performance.json) and [packed-map result](packed-map/performance.json): timing and retained heap.
- [Before heap summary](baseline/heap-summary.json) and [after heap summary](packed-map-profile/heap-summary.json): bounded allocation attribution. Heap-dump runs are excluded from the clean timing comparison.
- Raw heap snapshots remain local ignored diagnostics; no source text or machine-local paths are exported in the summaries.
- New collision and seeded mixed-operation tests check historical persistence and ordered JSON against ordinary records. Graph-prefix and incremental normalizer equivalence remain required gates.
- Coverage expansion adds useful facts and can increase retained memory. The final same-workload probe and collection/array/cross-feature measurements are recorded in PERFORMANCE.md; the storage improvement does not remove the need for Phase 5 rendering budgets.
