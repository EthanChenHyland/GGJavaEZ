# Phase 5.5 accepted validation

Base `b7bbb9a21d1f069d88a13912433131a8be040e60`, branch `kiro-runtime-audit`. All final product gates are recorded in [gates/results.json](gates/results.json) with commands, timestamps, duration, exit code and logs. Checked-in logs normalize trailing whitespace/empty EOF lines only; commands, outcomes and diagnostics are retained. Heavy build/JVM/test/browser/profiling work was serialized by the lead. One owned Vite/bridge pair was reused; Clarity remained closed. No Phase 6 implementation, production recorder-limit increase, dependency change or semantic schema change is included.

## Gate results

| Gate | Accepted result | Wall duration | Evidence |
| --- | --- | ---: | --- |
| TypeScript | PASS | 3.63 s | [log](gates/typecheck.log) |
| ESLint | PASS | 1.87 s | [log](gates/lint.log) |
| Production Vite build | PASS | 4.07 s | [log](gates/build.log) |
| Unit/integration — 1,380 passed, 63 opt-in skips / 116 files | PASS | 147.13 s | [log](gates/unit.log) |
| Acceptance — 191 passed, four documented expected failures | PASS | 165.33 s | [log](gates/acceptance.log) |
| Prior actual JVM — 85 passed / five files | PASS | 64.81 s | [log](gates/prior-jvm.log) |
| Fresh torture JVM — nine passed | PASS | 41.07 s | [log](gates/fresh-jvm.log) |
| Rich graph — one test, four canonical sizes/digests | PASS | 5.10 s | [log](gates/rich-graph.log) |
| Full browser — 121 passed, five retained-session opt-in skips | PASS | 766.91 s | [log](gates/browser.log) |

The browser total includes five deliberate retained-session opt-in skips. Those exact detail/history cases were run separately immediately before the full gates and **all five passed (39.4 s)** against the final code. They use actual retained backend recordings and real transport, without a new JVM or fabricated payload. Their proofs and final videos are preserved in the media manifest. Suite counts are checks, not counts of distinct application JVM processes; unit/acceptance/prior JVM suites overlap in coverage.

### Corrected harness configuration

The initial prior-JVM gate passed 82/85 checks but failed three Maven/Gradle dependency cases because the temporary lead harness omitted the cached-tool environment variables for that gate. It stopped immediately. [rejected-environment log](gates/rejected-environment/prior-jvm.log) and its results preserve that attempt. The corrected harness supplies `GGJAVA_MAVEN_PATH` and `GGJAVA_GRADLE_PATH` to all remaining gates; the complete prior-JVM suite then passed. No product code changed for that correction, and already accepted typecheck/lint/build/unit/acceptance gates were not redundantly repeated.

## Semantic and real-JVM evidence

- Nine new ordinary Java projects independently compile/run via the production BuildService, actual OpenJDK **26.0.2.1**, recorder, normalizer, archive and persistent history. Exact output bytes/hashes, exit/status, graph/scene counts and processing probes are in `jvm/*.json`.
- Their final fresh-JVM gate passed **9/9 (40.64 s)**. The fully observed topology case has **7,492 raw / 9,852 semantic events, four frames and 33 objects**. Its 10,001-cell array records sparse `[10000] = 73`; aliases/ragged/shared/null rows retain identity. A separate fully observed wide/deep case retains 162 invocations with depth 71 and exact output.
- The depth-220 workload explicitly stops observation at the **128 live-frame** cap while Java emits its complete expected output. The 2,000+2,000 stdout/stderr workload explicitly stops observation at **256 objects**, while Java consumes all input and completes both exact pipes. No fictitious post-limit end/catch/value is synthesized.
- Pure/persistent replay, rebatching, archive behavior, past-root immutability and stable XYZ anchors are checked in each case. Runtime IDs and graph meanings remain unchanged by presentation hardening.
- Prior coverage/provenance/performance JVM gates passed **85 checks / five files (64.53 s)** with build tools configured. These are 85 assertions/cases, not 85 new JVM processes.
- The controlled rich-graph gate passed **one test covering four sizes (4.66 s)**. All four Phase 5 graph digests/counts match exactly at **462 / 9,788 / 38,302 / 190,031 semantic events**. Largest retained process delta is **354.56 MiB**, versus 353.33 MiB in Phase 5. Exact comparisons/method are in [rich/phase5-comparison.json](rich/phase5-comparison.json); these are separate explicit-GC samples, not GPU bytes.

## Product and lifecycle evidence

- All nine fresh programs run again through the actual IDE and retain their completed/last-observed worlds, source and Inspector. Each has Overview/Focus at five sizes, with no browser errors and DOMRange assertions preventing Inspector-name/value overlap.
- Actual Debug remains paused for **35 seconds**, steps through constructor/array/recursive behavior, scrubs history without resuming Java, returns to the same live head and Continues to exact `DEBUG_SHAPE 18 true`. Its final stepping proof/video are retained. The repaired normal-return Step Out boundary preserves the immediate inline caller, including void calls, without adding semantic events or waiting under the recorder lock.
- Two actual delayed input waits accept a blank line and Unicode and complete exactly `FIRST\nSECOND\nDONE 0 🟣中文\n` in one session. Long-input and large stdout/stderr are independently exercised by case 05.
- Two actual JDT windows displace the workspace; explicit Retry recovers its own project, retains an unsaved MissingType draft, diagnoses that draft and leaves disk unchanged. Other 409/errors remain errors. The bridge still owns one language project.
- Keyboard Quick Open selects exact path `many/g0999/Shared.java` from a 1,001-file project containing 1,000 duplicate basenames. Existing canonical menu/palette, Save All, dirty-tab, deletion, rename/receipt-loss, source-manifest and history-binding regressions pass.
- Five edited actual Java Runs plus a failed build and repair in one page retain distinct execution/source/output/field ownership. Failed build exposes a labeled Previous recording and no incompatible executing-line highlight. Renderer/GC measurements are retained; a finite experiment does not prove universal leak freedom.
- Manual orbit during active replay cancels Follow while replay continues. Home/Focus/Trace, completed-world exploration, reverse timeline, reduced motion and narrow keyboard-accessible panels are covered by the final browser regressions. Native hands-on edit/save/Run/Focus/expand work supplies separate direct product use.

## Visual and performance evidence

[VISUAL-QA.md](VISUAL-QA.md), [QA-MANIFEST.json](QA-MANIFEST.json) and [PERFORMANCE.md](PERFORMANCE.md) record original-size still/video review, exact media inventory, reference comparison, changes and limitations. Final three-minute soak: **180,873 ms, 643 actions, 6,464 WebGL renders, zero browser errors**. UI scrub p50/p95 **50.45/101.24 ms**; Focus **75.67/110.97 ms**; Home **86.50/138.49 ms**. WebGL submission CPU tail p50/p95 **0.60/3.70 ms**; asynchronous GPU commands **0.716/1.388 ms**. No FPS, physical presentation or VRAM-byte claim is made. Rendering intervals include deliberate idle/choreography gaps.

## Reproduction commands

From the repository root, dependencies already installed:

```sh
npm run typecheck
npm run lint
npm run build
npm test
GGJAVA_MAVEN_PATH="$PWD/.ggjavaez/tools/maven/bin/mvn" GGJAVA_GRADLE_PATH="$PWD/.ggjavaez/tools/gradle/bin/gradle" npm run test:acceptance
```

The actual prior-JVM, fresh-JVM and rich commands/environment are recorded exactly in `gates/results.json`. Maven/Gradle overrides point at the already provisioned tools; they are needed for temporary-workspace tests that do not share the bridge's default workspace cache.

With exactly one dev pair running:

```sh
npm run dev -- --port 5173 --strictPort
VJ_QA_OUTPUT_ROOT=docs/checkpoints/v12-p5_5/browser-accepted npx playwright test
```

Do not start a second dev process if the existing pair is running. Immediately after fresh torture browser runs, while those actual sessions remain in the bounded backend retention window:

```sh
VJ_PHASE5_5_DETAILS=1 VJ_PHASE5_5_MOTION=1 npx playwright test e2e/torture-details-v12-p5_5.spec.ts e2e/torture-motion-v12-p5_5.spec.ts
node scripts/torture-soak-p5_5.mjs
```

That last script defaults to a three-minute mixed renderer workload and documents its retained-session method in the emitted JSON. Run these workloads serially.

## Delivery and remaining limits

The dedicated Phase 5.5 commit carries these reports and intentionally retained owned evidence. The final GitHub delivery uses a normal push on `kiro-runtime-audit`, without squashing/rebasing/force-push. Local/remote tip and tracked-tree verification are reported with the delivered commit hash. Prior checkpoints/spec references and all five user root PNGs remain unchanged and unstaged; [preserved-user-images.json](preserved-user-images.json) records their read-only hashes.

Remaining limits: existing observer/native/library/runtime coverage, single-project JDT ownership, bounded local path routing, exact detail needing Focus/expand at small viewports, large editor/main chunks, finite soak/heap growth, no physical-frame/VRAM/cross-GPU certification, and simpler material/lighting than the cinematic references. [TORTURE-AUDIT.md](TORTURE-AUDIT.md) reports the full category matrix; [CINEMATIC-READINESS.md](CINEMATIC-READINESS.md) defines a future renderer tier using the same semantic world. No Phase 6 work was started.
