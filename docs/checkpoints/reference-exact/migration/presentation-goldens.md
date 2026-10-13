# Presentation golden review — 2026-10-13

The root approves `tests/golden/layoutEngineGolden.json` as the replacement for the retired `tests/golden/layoutGolden.json`, as required by tasks 2.2 and 13.1. This is approval of deterministic production geography, not reference screenshot approval or a whole-product milestone.

| File | SHA-256 | Decision |
| --- | --- | --- |
| Retired `tests/golden/layoutGolden.json` at `44f5bc2391bdf191eed9bd2a2874bf12f7828d27` | `85b8925da880b35e76c66aba6f6e56cf3a66dbc5e4e2ba5bf531824e52984fe3` | Preserved in Git history; removed from the active suite |
| Replacement `tests/golden/layoutEngineGolden.json` | `b411424a8d01e49246773ecec0efdcda596b342147d5de5e9b6da57d7bdd62c5` | Reviewed replacement baseline |

Reason: the corrected brief explicitly replaces curated/special-theater and Spatial 2.0 geography with the production `createLayoutEngine`. The old golden selected different algorithms using capture metadata. The replacement uses the same engine for both routes and preserves the exact original 98 case keys and their order: Person 10, recursion 18, arrays 42 and control 28, including every curated and JVM-tagged prefix. There is no reduction of corpus, prefixes or identity checks.

Reviewed difference: all 98 layout hashes deliberately change. The new contract contains persistent canonical anchors, placement evidence, region bounds and headings, rather than old layout-kind/theater branches. Frames use recorded caller/sibling order and reserved cuboid capacity; object/array reservations use first observation and central dimensions; virtual cell windows remain separate from semantic identity. Existing ports and bodies remain fixed across appends. Capture metadata alone produces no geometry difference: all 49 curated/JVM prefix pairs have identical new hashes. The test independently compares batch construction with varied prefix append boundaries at every case, verifies earlier snapshot hashes, and checks every previously reserved body position, size and slot port.

The root reviewed the layout formulas and central-token use, the replacement test and all-case key/hash comparison, and the independent layout/port/topology property checks. Initial generation used the prescribed `VJ_WRITE_GOLDEN=1`. Confirmation ran without that flag: five files and 26 tests passed, including both golden checks, the 100-run layout properties, reference topology, retained actual-JVM presentation and the unchanged 3×4096-cell/1000-invocation projection corpus. Evidence: `.ggjavaez/qa/reference-exact/presentation-successors-confirmed.log`. A missing or differing golden now fails normally; there is no default regeneration.

Only the obsolete presentation golden and test are removed. Execution events, reducer, graph, history and provenance goldens/expectations are not regenerated. The broader legacy renderer/test/CSS cleanup and final fresh reference comparison remain open.
