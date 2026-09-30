# Final validation — Milestone 11.5

2026-09-30, macOS Chrome, baseline `dfa3091` plus final Milestone 11.5 changes. Gates were run after the last compact Focus typography correction. Retained logs remove ANSI color escapes and trailing whitespace only. One browser worker serializes all real JVM/build/capture workloads; unit tests finish before the browser suite. No extra JVM workload was run during graph replay measurement.

| Command | Result | Log |
| --- | --- | --- |
| `npm test` | 591 tests across 62 files passed, 47.61s | [Unit/integration](unit-final.txt) |
| `npm run build` | TypeScript project build and Vite production build passed | [Build/typecheck](build-final.txt) |
| `npm run lint` | Configured `eslint src` passed | [Lint](lint-final.txt) |
| `npm run test:e2e` | 85/85 passed, 6.7m; retries 0, workers 1 | [Browser](browser-final.txt) |
| `git diff --check` | Passed before staging and commit | Git whitespace check |

Fresh actual UI projects: Maven banking (Run/stdin/JDT/edit/save/Debug/failure), Gradle dispatch, plain graph stress, and bounded plain large/tiny/int-array Focus. Source definitions are in `fixtures/product-audit-v11_5`. Checkpoint session summaries include outputs, recorder facts and capability limitations. Synthetic Windows/Linux shortcuts establish matching/label contracts only; native runs were not performed.

Retained graph reload **5,266 ms**; individual scrubs **212/302/840 ms** at cursors 10,776/7,184/21,553. The scrub metric is UI commit plus two browser animation frames; these are individual samples, not GPU presentation, percentiles or an FPS guarantee.

Build warnings remain: large Monaco/runtime chunks and the ineffective Troika dynamic-import split. Tests include inherited Three CJS deprecation warnings. These do not make the gates fail, and bundle/Classic scale debt remains explicit.

Earlier interrupted/failed convergence runs are not counted as acceptance. The final backend includes bounded generated JDT cache retention (eight data indexes / one active config); directory count does not bound bytes in one index. Source files, managed projects and tool installations were preserved.

## Launch

```sh
cd /Users/ethius/VSCode/GGJavaEZ
npm run dev
```

Open http://127.0.0.1:5173/ide. The owned dev instance is left running; do not launch a second copy while it is active.
