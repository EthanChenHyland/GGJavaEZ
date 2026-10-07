# Phase 5 validation — complete

Base `3b1364d8d9b6ed45560adf07d86901084382d30b`; branch `kiro-runtime-audit`. Phase 5 only. Publication is verified separately after the dedicated commit. No Phase 6 work.

## Authoritative gates

| Gate | Actual result | Scope / evidence |
| --- | --- | --- |
| Default unit/integration | **1351 passed, 52 opt-in skipped / 1403; 107 passed, 4 skipped files / 111; 145.34 s** | Final October 7 run; includes Inspector, overflow-owner Focus and graphless I/O production fixes |
| Build and typecheck | **Pass** | `npm run build` runs `tsc -b` then Vite; 3428 modules, Vite 507 ms |
| Lint | **Pass** | `npm run lint` |
| Full browser | **106/106, 9.1 min** | Retained October 4 accepted suite; genuine editing, Run/Debug, providers, source lifecycle, navigation, time travel, Classic, coverage and dense-world audit |
| Short Inspector + shell browser | **8/8, 25.5 s** | After final compact-container CSS; actual first observed row contained at all four requested sizes, real recording limits/unsupported-thread behavior, six shell tests |
| Final focused browser | **8/8, 20.8 s** | October 7: six Person navigation/source/reduced-motion/local-asset cases, actual JVM constructor history, new authored graphless input/output case |
| Acceptance inventory | **191 passed, 4 expected failures / 195; 166.63 s** | Four failures are declared acceptance boundaries, not unexpected regressions |
| Explicit real-JVM coverage + provenance | **85 passed / 5 files; 67.64 s** | 33-project Phase 4 inventory, strict accepted recordings, renamed/line-shift invariance, Phase 3 provenance and actual-JVM performance probes |
| Incremental performance | **1 passed, 6.89 s** | `incremental/performance.json` |
| Rich history / memory | **1 passed, 4.56 s** | Four exact Phase 4 graph digests; retained largest workload 353.33 MiB vs 353.18 MiB |
| CPU presentation measurement | **3 passed, 0.78 s** | `projection/spatial2.json`; accepted cached JVM data, not new JVM/WebGL work |
| Focus / overflow regression | **16 passed, 147 ms** | Genuine owner Focus for overflow locals/fields/statics; departed targets fail closed |
| Authored I/O projection | **5 passed, 226 ms** | Actual consumed/written facts, stable anchors, graph authority, mounted path browser companion |
| Golden audit | **98 entries** | All 49 curated hashes unchanged; 36 JVM presentation hashes intentionally change for approved geography; semantic digests unchanged |

The 106-case full browser run predates the last Inspector/overflow/I/O refinements. The two focused eight-case runs validate those changes and affected interactions; they are overlapping runs, not 122 distinct cases. The final I/O test explicitly chooses All flow, matching the existing rule that Relevant flow during playback reserves current transfer for animation. Opt-in skips are not counted as runtime verification. No test expected Java result was weakened to approve a visual change.

## Reproduction commands

```sh
npm test
npm run build
npm run lint
VJ_QA_OUTPUT_ROOT=docs/checkpoints/v12-p5/browser-accepted npx playwright test --reporter=line
VJ_QA_OUTPUT_ROOT=docs/checkpoints/v12-p5/browser-short-inspector npx playwright test e2e/observer-saturation-v12.spec.ts e2e/spatial-shell-v12-p5.spec.ts
VJ_QA_OUTPUT_ROOT=docs/checkpoints/v12-p5/browser-edges npx playwright test e2e/person.spec.ts e2e/provenance-v12.spec.ts e2e/spatial-io-v12-p5.spec.ts --reporter=line
GGJAVA_MAVEN_PATH="$PWD/.ggjavaez/tools/maven/bin/mvn" GGJAVA_GRADLE_PATH="$PWD/.ggjavaez/tools/gradle/bin/gradle" npm run test:acceptance
VJ_PHASE4_JVM=1 VJ_PHASE3_JVM=1 GGJAVA_MAVEN_PATH="$PWD/.ggjavaez/tools/maven/bin/mvn" GGJAVA_GRADLE_PATH="$PWD/.ggjavaez/tools/gradle/bin/gradle" VJ_PHASE4_OUTPUT_ROOT=.ggjavaez/qa/v12-p5/accepted VJ_PHASE4_PROBE=1 VJ_PERF_OUTPUT_ROOT=docs/checkpoints/v12-p5/jvm npx vitest run tests/coverage-v12-p4 tests/provenance/real-jvm.test.mjs tests/provenance/performance-jvm.test.mjs --execArgv=--expose-gc --maxWorkers=1 --fileParallelism=false
```

Run workloads serially against one owned bridge/Vite pair. The managed pinned Maven/Gradle paths above must exist; commands do not provision them. CPU presentation probes use the locally accepted cache, deliberately excluded from Git. See PERFORMANCE.md for the measured methods and limits. Local complete logs remain in the ignored `.ggjavaez/qa/p5-*.log`; superseded generated JSON is preserved under `.ggjavaez/qa/p5-superseded-reports`, and portable final metrics and selected visual evidence are retained here.

## Environment and limits

Actual tested host: macOS arm64, Apple M4 Pro, 24 GiB; Node 24.20.0, **OpenJDK 26.0.2.1**. Maven/Gradle use existing managed pinned tools. Release-17 compilation does not establish JDK-17 runtime compatibility. No second-machine, Windows/Linux-native or isolated GPU timing claim. The production bundle still warns about large main/source-editor chunks and Troika static/dynamic imports; build succeeds.

## Subagents and lead review

| Agent | Focused ownership |
| --- | --- |
| Beauvoir | IDE shell, rail, menus, picker, canonical commands, New Java Class and strict shell browser tests |
| Raman | Shared frame/object/array/class surfaces, reference picking, Classic statics and sparse/reference arrays |
| Planck | Bounded semantic zoom, actual clustering, quiet-volume instancing/picking, represented Home bounds and observed I/O |
| Hooke | Front-face Focus, Home, one-hop context, camera insets/manual override and LOD stability |
| Erdos | Workspace browser migration; identified manual source-width reset, fixed by lead while preserving the assertion |
| Goodall | Independent original-resolution critique of 42 historical final captures; four actionable findings, no blanket milestone approval |
| Banach | Final narrowly owned authored graphless I/O projection and five regression tests |
| Lead | Locked architecture/contracts/tokens, append layout, source integration, provenance queries/routing, Inspector, worker-diff reconciliation, all serialized gates, visual polish, manual audit, documentation and publication |

All delegated edits were reviewed and integrated by the lead. No parallel recorder/normalizer/backend contract changes or worker commits were accepted. The second independent resumed visual review could not complete because of its usage limit; it is not counted as an approval. The lead completed final QA directly.
