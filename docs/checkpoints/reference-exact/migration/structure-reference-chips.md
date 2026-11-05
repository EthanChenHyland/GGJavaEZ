# Array and collection reference chips

Array cells and captured collection entries now use the shared physical reference inset, with a persistent port on its right edge. Null, primitive, unavailable and absent-target values do not acquire reference insets or ports. Map keys and values retain their independent captured slot identities.

The change keeps canonical array/collection data-flow ports, runtime evidence, layout anchors, camera behavior and all golden files unchanged. Current-reference curves attach to the actual inset edge; historical bindings keep their captured storage geometry. Ports are generated independently of curves and remain visible when the reference scope removes those curves. Array insets and ports inherit the exact cell Focus cap. Array values stay centered, sit 0.019 units ahead of the physical fill front, and use trailing ellipses without changing the font size. The Inspector retains the full value.

The geometry helper extends the existing value-chip construction; materials, rounded inset geometry and semantic colors are shared with frame/object chips. QA exposes uploaded instance transforms read-only. Native checks compare those transforms with actual port transforms, click physical inset locations, and require the captured slot selection with unchanged camera, cursor and runtime facts.

## Source and failed evidence

Evidence is under ignored `.ggjavaez/qa/reference-exact/structure-reference-chips/`.

- The explicit normalized unit trace first failed with zero structure insets/ports against eight expected references. Its first invalid unavailable-allocation fixture is preserved separately and is not defect evidence.
- Earlier topology/value-plane unit expectations are archived before reconciliation. Generic flow-port identities and canonical geometry remain exact.
- `failed-fixture-assumption/`: four native setup failures used the Warehouse reference fixture while expecting Topology collections. One also exposed a partial-live-prefix setup race. The common fixture harness now independently normalizes the completed recording and waits for that exact length before End; all original fixture inventory assertions remain.
- `failed-pick-and-catalog/`: all four actual array phases passed. Desktop collection clicks hit legitimate reference curves at the chip center; narrow catalog setup examined only its first virtual window. Both limitations were resolved through real UI input, without store/QA selection setters.
- `failed-catalog-after-scan/`: source a2b6c9ba, two desktop passes/two narrow catalog failures, 155.185 seconds. Array/List/Map geometry, picks and no-curve ports passed on desktop. This failure remains archived.
- `native-confirmed/`: source 1361b5b8, all four desktop/narrow × normal/reduced cases pass, zero skips/failures/flaky, 250.522 seconds. Four distinct actual JVM attachments, 12 original PNGs, three reviewed full size. Selection uses native keys in the already-open virtual entity list and real cluster-member controls.
- `failed-full-units/`: same source, 2,260 passes/five failures/70 explicit opt-in skips, 287.70 seconds. Three legacy reference-origin assertions still expected cell centers; two collection tests counted inset rim/fill parts as whole rows. Original runtime identity, generic flow ports, row counts, columns and geometry assertions were retained; physical inset edges are checked separately.
- `floating-edge-comparison/`: 41 passes/one failure in a new independent Map edge assertion, differing by 8.88e-16 from floating addition order. Only that new coordinate check uses ten decimal places; original exact canonical assertions remain.

Current validation source: `cafbcb157db3ec973d989cf64375b2df16bf3a0e5f0f6e00ec74dd4435517675`, 991 inventoried inputs, 23 changed from d7da1c7. It differs from the four-case native source only in four reconciled unit test files; production/native-driver bytes are identical. The native source is not relabelled. Full default validation is freshly rerun from the current source.

## Validation

All eight checks pass: application/browser typechecks, lint, build, defaults, build measurements, reference integrity and the complete protected-substrate/camera/golden guard. Defaults: 2,265 passed / 70 existing explicit opt-in skips / 2,335 total across 244 files, 287.79 seconds; all eight steps total 311.887 seconds. The focused reconciled geometry set passes 42/42.

Actual main-entry gzip is 71,732 bytes; static entry/Shell JavaScript closures are 72,162/677,835 bytes. The latter are sums of separately gzipped resources, excluding CSS/fonts/workers/dynamic imports, not network timing. Earlier 72,162-byte entry figures refer to the static JS closure. Monaco/Cinematic remain split; the existing large-chunk warning is retained.

AST inventory: 708 modules / 2,523 literal edges / 272 production-reachable / 42 nonliteral sites / zero inventoried obsolete targets. Protected Node benchmark closure: 81 local inputs, five changed presentation inputs from the preceding array-label measurement, no removed inputs. Browser discovery: 320 cases in 87 files; discovery is not execution.

Fresh integrated native run: **99/99 pass**, zero skips/failures/flaky, 1223.357 seconds (runner 1223.925). The exact-source archive contains 133 original PNGs, 6 reviewed/127 unreviewed, and 79 distinct standard attached JVM session IDs across 79 cases. Session IDs are not a count of all OS processes. Both actual GPU tiers execute on ANGLE Metal / Apple M1 Pro; all eight face/chip RGB samples are exact. See `structure-reference-chips-final-captures/`.

Protected Node benchmark: one fresh unchanged execution, command exit 1, 22.181 seconds. LINE scaling ratio 1.350095238 passes the unchanged 2× limit. All three retained-presentation ratios fail the unchanged 25% budget:

| Raw target | Semantic retained B | Presentation retained B | Ratio |
| --- | ---: | ---: | ---: |
| 200 | 927400 | 1557904 | 1.679861980 |
| 5000 | 12370496 | 6013528 | 0.486118584 |
| 20000 | 55677000 | 22365920 | 0.401708425 |

All three raw corpus SHA values match the preceding array-caption benchmark. These are measured whole retained owners, not exact object sizes, isolated causal effects or GPU/browser evidence. Raw reports remain in `structure-reference-chips/production-node/`.

Fresh protected Dense browser run `629a6d1e-3ffc-4cbc-806f-5250d31e5fa5`, actual JVM `d6221278-ad43-4576-8ee8-7379742a98e9`: 7,492 raw / 9,852 normalized events, COMPLETED/FULL/exit 0. All ten stages finish with zero browser, stage, lifecycle or suspended-request failures. Benchmark exit 1; archive exit 0; runner 481.204 seconds. The browser gate fails, and overall performance approval remains incomplete.

| Measurement | Actual ms | Unchanged budget ms | Result |
| --- | ---: | ---: | --- |
| seek-p50 | 114.991292 | 55 | BUDGET_EXCEEDED |
| seek-p95 | 133.667667 | 112 | BUDGET_EXCEEDED |
| focus-p95 | 217.819458 | 125 | BUDGET_EXCEEDED |
| home-p95 | 237.409291 | 152 | BUDGET_EXCEEDED |
| cold-load-median | 5145.156375 | 5300 | PASS |

Five ≥30-second continuous orbit windows have median 16.7 ms each, p95 intervals 17.5 / 18.4 / 17.3 / 17.1 / 18.7 ms, CPU p95 3.2 / 3.6 / 3.5 / 3.5 / 5.8 ms, and a maximum of 103 calls. Their maximum intervals are 22.5 / 300.9 / 493.5 / 823.7 / 460.4 ms; stalls remain visible in the raw results. The 61406.9 ms soak reports zero median frame drift and +0.084310437% whole-frontend post-GC heap growth. That is not isolated presentation retention. The cold-load pass is one execution, not a causal/statistical improvement claim. Four external budget rows remain NOT_MEASURED in the browser report; separate Node/build evidence retains its own boundaries.

Full profiles, fresh environment, JVM snapshot, original Dense PNG and root review are archived in `performance-structure-reference-chips/`.

## Open acceptance

The new chips and ports do not approve the whole visual system. Full-size actual narrow screenshots show strong connector glow and routes crossing collection glyphs. Acrylic material quality, antialiasing, global routing/legibility, broader array/collection polish, the remaining older browser cases, exhaustive JVM opt-ins, final motion/reference review and whole A–G acceptance remain open. Performance failures are reported without budget waivers or causal speedup claims.
