# Milestone 9 — Bounded real-project performance

Evidence: `performance.json`, produced by `node scripts/measure-m9.mjs` against the owned local Vite/bridge process with OpenJDK 26.0.2.1, pinned JDT LS 1.61.0, Maven 3.9.16, Gradle wrapper 9.4.1 and installed Chrome headless. This run imported fresh Maven and Gradle fixtures and serialized Java/build work. These are single local samples, not general percentile claims.

| Operation | Observed wall time |
| --- | ---: |
| Fresh Maven model | 2761 ms |
| Cached Maven model lookup | 67 ms |
| Fresh Gradle model | 1897 ms |
| Maven build | 1014 ms |
| Gradle build | 2209 ms |
| Maven JDT process open through indexed ready | 2358 ms |
| First semantic completion after ready | 1904 ms |
| Subsequent completion | 10 ms |
| Go to Definition | 31 ms |
| Maven → Gradle JDT session switch through ready | 2870 ms |

The first completion includes cold semantic computation after the language server reports ready. Repeat completion is warm. Model timings include HTTP and fixture-specific build-tool invocations; they are not pure parser timings. The Maven advisory classpath comparison returned agreement (`0`). The Gradle comparison returned disagreement (`1`), displayed in the IDE status; the Gson symbol is available through semantic completion and the Gradle build succeeds. Canonical build output and runtime dependencies remain Run / Visualize / Debug authority.

At 1440×900 with the real Maven trace at step 24, the measurement sampled approximately 2.4 seconds of browser animation frames in each phase. It counted actual WebGL draw calls and drove pointer orbit during the Gradle build and JDT workspace switch:

| Phase | RAF samples | Median / p95 interval | WebGL draw calls |
| --- | ---: | ---: | ---: |
| After settling | 144 | 16.7 / 16.7 ms | 182 |
| Orbit while Gradle builds | 144 | 16.7 / 16.8 ms | 4,916 |
| Orbit while JDT switches projects | 144 | 16.7 / 16.7 ms | 4,749 |

The Spatial canvas remained visible after the switch. Draw calls show active rendering rather than an idle RAF-only claim. This supports UI responsiveness for this one bounded fixture and machine. RAF intervals and WebGL call counts do not measure GPU completion, physical presentation, rendered-frame submission duration or hardware-wide p95. The build and switch windows used the same current frontend and same scene, but the orbit path was driven in sequence, so this is not a controlled historical M8 throughput comparison. The earlier M8 renderer-submission study remains in `docs/checkpoints/gui-v8/PERFORMANCE.md`.

The model and language service initialize asynchronously; Monaco remains usable during project resolution. No auto-download or cloud language endpoint is in the startup path. Large projects, cold dependency caches, Gradle composites and long-run heap/RSS behavior were not measured here.
