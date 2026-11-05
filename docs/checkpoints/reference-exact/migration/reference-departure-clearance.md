# Collection departure clearance and stable connector picking

Current collection references now leave the right edge of their actual value chip, turn through the existing row gap, and exit the target-facing side before joining the exterior route. The former owner-center exit policy sent left-column List/Map references leftward through their own values. Actual captured source departures and a failing geometry regression establish the defect.

The internal individual-reference/router input adds an optional world-space departure waypoint, derived from the physical port plus 0.06 units in X and half the shared collection row pitch in Y. Only the source terminal's narrow column stem and row gap receive caption-clearance allowance. Foreign bodies, actual source/destination owner anchors, canonical data-flow ports, historical storage geometry, route-cache limits and geometry-based invalidation remain intact. Runtime/Graph/history contracts, layout anchors, camera and goldens are unchanged. Core widths, halo width, port radius, colors, opacity and bloom strengths are unchanged.

Read-only QA now observes collection/heading glyph-ink corners from the actual uploaded text matrix and rendered-font bounds. Native assertions reject reference segments through key/value/size/more/title/identity ink and check the target-facing exit, while retaining original exact chip/port transforms, real slot raycasts and camera/cursor/runtime facts. Unit coverage includes both columns, 24 List/16 Map entries, self-Map owner identity, route-cache invalidation and 100 foreign-obstacle configurations.

Overlapping segments also exposed a hover/click mismatch: rounded pointer coordinates changed an otherwise coincident hit distance by one floating-point ULP. Each actual line batch now chooses one original nearest intersection, using only 32 machine epsilons of distance for arithmetic ties. A Canvas event filter applies the same order across core-width bands. Binding references precede residual Flow bundles, then other paths; supplied order is stable within those classes. This keeps aggregated Flows inspectable at exact overlaps. True depth ordering and protected-body precedence remain; hit points/distances are unmodified and halo-only clicks have no selection handler. Captured geometry tests cover fractional/rounded/floored/ceiled pointers, reversed input order, mixed widths, bundle priority, a farther bundle that must lose, and original hit data.

The collection browser setup now dollies before scanning unrelated catalog entries when the target, its actual mapped cells and containing presented clusters cannot offer it. Selection still uses the real catalog/cluster controls and physical slot raycasts. All assertions and the 120-second timeout remain intact; no runtime/selection/camera setter is introduced.

## Source and preserved failed evidence

Archives are under ignored `.ggjavaez/qa/reference-exact/reference-departure-clearance/`. Each retains its own exact source and raw reports; earlier results are not relabelled current.

- `actual-jvm-red.json` and `red-source.json`: six real List/Map departures from one preceding committed JVM capture cross their own insets; the new explicit unit regression fails. Reusing that capture is not another JVM execution.
- `roof-channel-experiment/`, `gap-compile-collision/`, `invalid-map-bound/`: rejected routing design, a local-name transform error, and an over-bound unit fixture are preserved separately. The final route uses the actual row gap; the fixture respects the existing 16-entry Map bound.
- `native-confirmed/`: source `75922fc3`, four native cases pass, 261.718 s (runner 262.299); four standard JVM attachments, 12 original PNGs/three reviewed. `right-exit-polish/` retains source `df45c1ad` full8 and a deliberately interrupted integration (21 pass/80 not run, exit 130). Root replaced unnecessary rightward detours with target-facing exits. `source-exit-comparison.json` records shorter actual polylines, not timing improvement.
- `native-polished/`: source `09216e43`, four native cases pass, 254.868 s (runner 255.423); four JVM attachments, 12 PNGs/three reviewed. Its full8 passes 2,270 defaults/70 opt-in skips. `failed-native101/` then records 100 passes/one original narrow hover failure, 1255.301 s; an unchanged confirmation fails the same assertion. `hover-raycast-diagnostic/` separates read-only actual-browser observations from Node replay of uploaded geometry.
- `hover-picking-red/` preserves two new regression failures/16 passes with the stock raycast and identity filter. First picking source `897025e9` passes full8 (2,273 defaults/70 skips) and six focused native cases, 275.941 s (runner 276.482); six standard JVM attachments, 16 PNGs/two reviewed (`picking-native-confirmed/`). Broadened integration exposes two residual Flow-bundle selection failures. Root stops the owned process after 41 passes/two failures/one interruption/57 not run, exit 130, 452.366 s (runner 452.937). Exact source/full8, 46 PNGs/two reviewed and traces remain in `picking-shadowed-flow-bundles/`.
- `flow-picking-diagnostic/`: unchanged source `897025e9` fails the same original Flow-bundle assertion in a separate read-only JVM diagnostic. The saved nearest-hit lists include its core at 84 of 134 candidate points. Some of those hits share exact points and distances with individual Flow edges. `flow-picking-red/` preserves the resulting explicit regression (one failure/18 passes) before the priority correction.
- `catalog-timeout/`: source `6173be30` passes both original hover cases, both historical cases and both desktop collection cases, but both narrow collection cases time out during catalog navigation: six pass/two fail/zero skips or flaky, 450.941 s (runner 451.491). All 18 original PNGs/one reviewed, source and traces are retained. Decoded observations show repeated scans while the targets remain off-screen. A server codeAction timeout also remains in the raw log; no zero-server-error claim is made.
- `catalog-confirmed/`: current driver `7338d5e2` differs from `6173be30` only in offscreen catalog setup; production bytes are identical. Both original narrow normal/reduced cases pass without timeout/assertion changes, 131.959 s (runner 132.979), two standard JVM attachments, six original PNGs/two reviewed.

## Current validation

Exact current source: `7338d5e216212b623266b4802f468f66c360b063c9db06559a884ed29f8f8fdd`, 992 inventoried source/test/configuration inputs, 13 changed from `342a68e`. All eight checks pass: application/browser typechecks, lint, build, defaults, artifact measurements, reference integrity and the complete protected-substrate/camera/golden guard. Defaults: **2,274 passed / 70 existing explicit opt-in skips / 2,344 total**, 244 files, 291.81 s; all eight steps 316.149 s.

Actual main-entry gzip is 71,734 B. Static entry/Shell JavaScript closures are 72,164/678,366 B, sums of separately gzipped resources excluding CSS/fonts/workers/dynamic imports, not network timing. Monaco/Cinematic remain split and the large-chunk warning remains. Fresh AST inventory: 709 modules/2,527 literal edges/273 reachable/42 nonliteral sites/zero inventoried obsolete targets. The protected Node closure remains 81 inputs, five changed routing inputs from the preceding chip milestone, none removed; renderer picking is outside that Node closure. Browser discovery remains 320 cases/87 files; discovery is not execution.

Fresh integrated native run: **101/101 pass**, zero skips/failures/flaky, 1211.282 s (runner 1211.850). The exact-source archive contains 137 original PNGs, 5 reviewed/132 unreviewed, and 81 distinct standard attached JVM session IDs across 81 cases. Session attachments are not a count of all OS processes. Both actual GPU tiers execute on ANGLE Metal / Apple M1 Pro; all eight face/chip RGB samples are exact. Source, logs, reports, original captures and reviews are saved in `reference-departure-clearance-final-captures/`.

Fresh protected Node benchmark: command exit 1, 23.172 s. LINE update scaling ratio 1.354085985 passes the unchanged 2× limit. All three measured presentation/semantic retention ratios exceed the unchanged 25% budget:

| Raw target | Semantic retained B | Presentation retained B | Ratio |
| --- | ---: | ---: | ---: |
| 200 | 927216 | 1567896 | 1.690971683 |
| 5000 | 12374776 | 6015384 | 0.486100435 |
| 20000 | 55674064 | 22365336 | 0.401719120 |

All three raw corpus SHA values match the preceding committed chip benchmark. These are whole retained-owner measurements, not exact object sizes, isolated causal effects or browser/GPU evidence. Reports remain in `reference-departure-clearance/production-node/`.

Fresh Dense browser run `5745e58c-d21e-4882-a077-62648bd3be87` recorded JVM session `d6f4e742-ce95-4bfa-b2e5-eae185ed1118`. Java completed with exit code 0 and a full recording of 7,492 raw and 9,852 normalized events. All ten stages completed with zero browser, stage, lifecycle or suspended-request errors. The benchmark exited 1 and the archive exited 0. The runner took 480.725 seconds.

| Measurement | Actual ms | Budget ms | Result |
| --- | ---: | ---: | --- |
| seek-p50 | 103.575958 | 55 | BUDGET_EXCEEDED |
| seek-p95 | 133.922875 | 112 | BUDGET_EXCEEDED |
| focus-p95 | 238.576375 | 125 | BUDGET_EXCEEDED |
| home-p95 | 248.913125 | 152 | BUDGET_EXCEEDED |
| cold-load-median | 5030.126792 | 5300 | PASS |

| Viewport | Orbit median ms | Orbit p95 ms | Maximum interval ms | CPU p95 ms | Timing result |
| --- | ---: | ---: | ---: | ---: | --- |
| 1728x1117 | 16.7 | 17.5 | 527.9 | 3.4 | PASS |
| 1440x900 | 17.6 | 33.9 | 67.8 | 3.6 | BUDGET_EXCEEDED |
| 1280x800 | 33.3 | 33.7 | 224.7 | 3.9 | BUDGET_EXCEEDED |
| 760x900 | 33.3 | 34.2 | 154.9 | 4.0 | BUDGET_EXCEEDED |
| 1440x650 | 33.3 | 36.3 | 417.8 | 4.6 | BUDGET_EXCEEDED |

The orbit limits are 16.7 ms median and 33.3 ms p95. Draw calls peak at 103 and every submission CPU p95 meets the 6 ms limit. The 60,781 ms soak reports zero median frame drift and +0.227560236% whole-frontend post-GC heap growth. The browser report leaves four external rows unmeasured. The separate Node and build checks provide their own measurements.

The fresh command profile attributes 2,884.8 ms of sampled self CPU to Fiber’s development prop diff over the recorded interval. That aggregate identifies a hotspot for investigation. Raw profiles, fresh environment metadata and the reviewed Dense original are in `performance-reference-departure-clearance/`.

## Open acceptance

This increment protects current collection departures and corrects coincident connector picking. It does not approve global routing, strong connector glare, matte fronts, antialiasing, peripheral clipping, all array/collection polish, remaining browser coverage, exhaustive JVM opt-ins or final motion/reference review. Whole A–G and performance acceptance remain open. No budget, sample count, fixture byte or protected assertion is waived.
