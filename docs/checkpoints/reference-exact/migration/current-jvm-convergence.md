# Current-source JVM convergence — 2026-11-03

Production source inventory 18789fe67841cef2ee3afbfd31df5d1d0c81dc4e3f450b81afcca441010bd395 (968 inputs), now committed as c1a3c8c17722a8a0946d0b215d9a9e438ba09128, is held unchanged across these serial gates. All use M1 Pro/Node 24.22.1, workspace-local Temurin 26.0.2.1+1 and UTF-8 locale. Maven/Gradle executables are explicit local tools. No Java fixture, semantic assertion, cap, timeout or production runner changes.

| Gate | Executed and passing | Required skips/failures | Actual target JVM starts | Boundary |
| --- | ---: | ---: | ---: | --- |
| Acceptance | 191 ordinary +4 expected-failure contracts /195 | 0 | 47/47 | 262.962 s; the four preserved target contracts are not proof of successful target behavior |
| Reference programs | 7/7 | 0 | 7/7 | 16.080 s; exact stdout/stderr/exit, FULL capture and final scene counts |
| Torture | 9/9 | 0 | 9/9 | 66.994 s; output, limits, archive/replay and stable anchors; optional per-case report/heap probes were not enabled |
| Prior coverage/provenance | 85/85 | 0 | 50/50 | 126.849 s; 33 non-JVM inventory cases +52 JVM-dependent cases; shared fixtures explain the distinct process count |

The count wrappers reject missing reports, count mismatch, all-skipped execution, pending/todo, unexpected failure or missing real child PIDs. A test-only pass-through observer calls the original DebugManager.start unchanged and records the returned session's child PID; it does not modify requests, return values, transports or process behavior. Uninstrumented behavior controls, build tools and helper JVMs are excluded from target-process counts. The prior suite uses 30 coverage launches, 12 rename/line variants, six shared/direct provenance fixtures and two provenance-performance launches. Its Node explicit-GC probes/raw traces are retained; they do not supply browser/GPU or isolated presentation-memory approval.

Source hashes are verified before/after. The reference reports preserve actual observed Java version, exact output and scene inventory. Goldens/protected semantic files remain unchanged; no new semantic-golden file is generated because the retained provenance golden is executable graph assertions. The complete default suite already passes layout-golden comparisons; exhaustive final cleanup validation remains required.

All these gates pass on this source; they do not approve the five remaining Dense latency/load failures, independent retention limits, four acceptance target gaps, primitive chip ports, array index placement/keyboard continuity, visual/motion convergence, older browser cases, debugger/soak/full-browser matrices or whole A–G completion.

Evidence under .ggjavaez/qa/reference-exact/: acceptance-current/, remaining-jvm-current/ (seven reference reports copied before subsequent workloads), prior-jvm-current/ (raw traces, semantic probes and provenance performance), final-acceptance-count-manifest.json, run-acceptance-current.py, run-remaining-jvm.py, run-prior-jvm-current.py and the exact pass-through observer/configs copied into each archive.
