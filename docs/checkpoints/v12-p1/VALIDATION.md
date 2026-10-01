# Phase 1 — observer saturation, final validation

Base: `971ed26`, branch `kiro-runtime-audit`. Completed on 2026-10-01. This checkpoint implements the user's Phase 1 scope only. Phase 0 evidence and all acceptance Java sources are unchanged. No Phase 2 transport, constructor, value expansion, spatial layout or IDE shell redesign was implemented.

## Execution and observation

Recorder budget paths no longer use `Runtime.halt(86)`. The server no longer terminates the application for recorder saturation, invalid observer data or unsupported extra application threads. Those paths stop observation and retain a valid prefix. Actual child exit remains authoritative; successful Java exit is COMPLETED with PARTIAL visualization, while an actual nonzero exit remains a runtime failure. Preparation fallback can select plain execution only before application launch. Recorder exhaustion never starts another application JVM.

`RecordingStatus` reports FULL, STOPPED_LIMIT, STOPPED_UNSUPPORTED or STOPPED_ERROR, with reason, budget, last successfully written sequence and whether execution continued. Defaults remain **20,000 raw records, 8 MiB, 256 identities and 128 live frames**. One bounded `capture_saturated` control record is reserved outside semantic capacity. A separate atomic status snapshot remains at most 1 KiB and carries real input-wait state after saturation.

Normalization emits `CAPTURE_STOP`; the reducer retains last observed active frames, values, references and source with status `partial`. It never invents later returns, unwinds or program completion. The timeline ends at **Last recorded event**, independently of the Java process. Inspector values identify the last recorded state. Process Console continues independently of scrubbing that prefix.

The active watchdog excludes wrapped stdin waits and Debug pauses. Preparation has its own deadline. Defaults are 30 seconds active execution, 30 seconds per preparation stage and an independent 10-minute hard safety deadline in every process state. If a stopped recorder loses its input status snapshot, active accounting is suspended without inventing WAITING; the hard deadline still applies. A stale FULL snapshot cannot falsely establish input state after saturation. Explicit user Stop remains authoritative.

## Budget results — unchanged production defaults

These real-JVM characterization tests assert actual complete stdout, stderr, natural exit 0, contiguous raw sequence, exactly one bounded stop record, no semantic append after stop, valid normalization and a partial final world.

| Capacity | Result | Actual final output |
| --- | --- | --- |
| 256 identities | STOPPED_LIMIT / objects; Java completes | `DONE 44850` |
| 20,000 raw events | STOPPED_LIMIT / events; Java completes | `DONE 2666466670000` |
| 8 MiB trace bytes | STOPPED_LIMIT / bytes; Java completes | 10,000,000 `x` bytes, newline, `DONE`, newline |
| 128 live frames | STOPPED_LIMIT / live frames; Java completes | `DONE 200` |

Additional boundary tests exhaust dependencies during observe/local/parameter/enter and drop the whole staged group, rather than publishing dangling identities or invalid frame references. A 40-million-character String and 12-million-element int array complete under `-Xmx96m`; observer serialization stops before constructing an oversized payload. This verifies bounded saturation behavior, not new generalized value coverage.

## Input, pause, threads, console and cleanup

- **stdin:** the same JVM remains alive after a 5.5-second wait with a 4-second active watchdog. After recording saturation, a 3-second input wait with a 2-second watchdog also completes. ACC10 waits **60 seconds**, exceeding the previous default threshold, then reaches its original output and exit 0. Byte/bulk reads, zero-length reads and EOF are preserved after saturation.
- **Debug pause:** a real breakpoint pause after saturation remains alive for 3 seconds with a 2-second active watchdog. Continue, Step and stdin work with a frozen raw watermark. Overflow control context remains bounded at 128 entries. Another application thread can write while the first is paused, proving the debugger does not retain the recorder writer lock across the pause.
- **Extra application thread:** Java reaches its worker and final output with exit 0 and STOPPED_UNSUPPORTED. Recording stops before the foreign thread's first semantic probe; the retained semantic prefix contains one thread. No fake single-thread continuation is emitted.
- **Console:** browser QA reads stdin after object saturation and obtains exact stdout `WAITING AFTER RECORDING\nDONE 65\n` and stderr `REAL STDERR AFTER RECORDING\n`. Scrubbing and reload preserve actual completed-process output separately from observed values. HTTP downloads match those original streams.
- **Output beyond inline capacity:** unified Run/Debug archives original pipe bytes in private local files. Inline DTO retention stays bounded at 32 MiB combined. The integrated mock test downloads **33 MiB + 5 stdout bytes**, validates SHA-256 and the final `DONE\n` marker, and checks separate stderr. A helper test also verifies split UTF-8 bytes. No asynchronous output queue is introduced. Archive failure is explicit and never kills Java.
- **Stop and subsequent Run:** tests stop a saturated process waiting for input, reap it, then start a clean session with empty stdout and FULL recording. The new process accepts input and completes; the prior session remains unchanged. Explicit debugger Stop still terminates on request, using its existing exit 87 control path.
- **Cleanup:** recorder maps/pending payloads clear on stop; tests observe sizes `0,0,0`. Writers close at Java shutdown. Output descriptors close at exit; archive directories delete on eviction/disposal. Managers in QA dispose their sessions; graceful bridge shutdown now disposes retained archives. File/status readers, event retention and debug control queues remain bounded. No unrelated user process was terminated.

## Acceptance projects 13 and 14

Original sources and stdout expectations are unchanged. Exit-86 characterization is preserved in Phase 0, while current assertions now require real completion, explicit recording status and a valid CAPTURE_STOP prefix. Full graph/history targets retain their exact original counts as later-phase expected failures; production limits were not raised.

**ACC13:** actual exit 0, complete session, STOPPED_LIMIT / objects, last semantic raw sequence 3074. Retained raw records: 3076 including stop control; normalized events: 3849; final world: partial.

```text
MEMBERS 3000
FOLLOWS 12000
REACHABLE 2929
FARTHEST 10
```

**ACC14:** actual exit 0, complete session, STOPPED_LIMIT / events, last semantic raw sequence 19999. Retained raw records: 20001 including stop control; normalized events: 24765; final world: partial.

```text
PROCESSED 2400
MAX_QUEUE 400
CLOCK 5163
```

Complete corpus evidence: [acceptance-results.json](acceptance-results.json). Final affected-case rerun after the stale-status guard: [acceptance-after-telemetry.json](acceptance-after-telemetry.json). This includes both acceptance invariance variants for ACC10/13/14.

## Final validation totals

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run build` | Pass; existing large-chunk and Troika dynamic-import warnings remain |
| `npm test` | **69 files; 721 passed + 2 expected failures**, 98.94 seconds |
| `npm run test:acceptance` | **159 passed + 36 expected failures**, 157.76 seconds |
| ACC10/13/14 after final telemetry guard | **23 passed + 5 expected failures**, 167 excluded by test filter; 75.67 seconds |
| Original browser regression suite | **85 passed**, 6.9 minutes, no retries |
| New observer saturation browser suite | **2 passed**, 12.4 seconds, no retries |
| Unique browser total | **87 passed**, no remaining failures or skipped baseline tests |
| Changed `.mjs` syntax and `git diff --check` | Pass |

The two unit expected failures are the unchanged constructor characterization. Acceptance expected failures still exercise exact deferred semantic/history targets. They are not silently skipped or weakened. Characterization suites are included in `npm test`. The Java worker separately verified 20 passing checks plus the two constructor expected failures; the server worker verified 52 passing checks before the root's additional stale-FULL-sidecar case. These overlap the final full suite and are not added to its total.

Reproduction commands (JVM/build workloads were serialized):

```sh
npm run typecheck
npm run lint
npm run build
npm test
GGJAVA_MAVEN_PATH="$PWD/.ggjavaez/tools/maven/bin/mvn" GGJAVA_GRADLE_PATH="$PWD/.ggjavaez/tools/gradle/bin/gradle" VJ_ACCEPTANCE_REPORT=docs/checkpoints/v12-p1/acceptance-results.json npm run test:acceptance
GGJAVA_MAVEN_PATH="$PWD/.ggjavaez/tools/maven/bin/mvn" GGJAVA_GRADLE_PATH="$PWD/.ggjavaez/tools/gradle/bin/gradle" VJ_ACCEPTANCE_REPORT=docs/checkpoints/v12-p1/acceptance-after-telemetry.json VJ_SUITE=acceptance ./node_modules/.bin/vitest run tests/acceptance/acceptance.test.mjs -t 'acc10|acc13|acc14' --maxWorkers=1 --fileParallelism=false
VJ_QA_OUTPUT_ROOT=docs/checkpoints/v12-p1/browser-regressions npm run test:e2e -- --grep-invert 'object saturation keeps|unsupported thread leaves'
./node_modules/.bin/playwright test e2e/observer-saturation-v12.spec.ts
```

Local command logs are retained in this directory but excluded from Git by the existing `*.log` rule. Generated bulk browser media also stays local. Machine-readable final results and the reviewed screenshot manifest are committed.

### Baseline and convergence findings

Phase 0 ran in Linux/software WebGL; this run used macOS, Node 24.20.0, OpenJDK 26.0.2.1, Maven 3.9.16, Gradle 9.4.1 and the configured Chrome browser. Its 76-pass/5-fail/4-unrun browser baseline is **not an identical environment comparison**. All 85 original browser tests pass here, including the previously flaky software-rendered picking tests. No baseline flake remains in this run, and no assertion was relaxed to obtain green status.

Initial acceptance attempts exposed missing build-tool discovery in temporary workspaces, then macOS `/var` versus `/private/var` canonical spelling. Explicit existing tool paths and canonicalizing the isolated harness root fixed these environmental failures; production project boundary validation stayed intact. Initial unit convergence fixed an obsolete thread-abort assertion and stopped control-record thread IDs being treated as semantic concurrency. The new browser test initially used an ambiguous details selector; narrowing it to the visualization section fixed the test. Final runs above are green.

The old 500 ms running-deadline unit failure had included helper preparation. Separating preparation and active watchdog accounting resolves that pre-existing failure without relaxing its active-execution assertion. Existing Three.Clock, shadow-map and CommonJS deprecation warnings remain. This phase makes no bundle-size or GPU percentile claim.

## Visual QA and polish

Reviewed final partial-world screenshots at **1728×1117, 1440×900, 1280×800 and 760×900**, plus a **1440×900 world overview**, at full size. Compared with true-3D references 06 and 11 and the binding design/QA rules. All screenshots identify successful Java completion separately from the last recorded visual state and show actual console output.

The polish pass moved last-recorded explanatory copy into the existing inspector header after a paragraph squeezed the field columns. The selected object's `number: int 255` is readable in its native 3D face and inspector at all four sizes. The overview has unmistakable cuboid depth and runtime-derived rows. Focus deliberately faces the selected front face with visible thin edges. No extra glow, decorative scene, new geometry system, camera architecture or spatial layout was introduced. Existing dense-world overview/LOD remains a later concern. At the narrow viewport, the existing Console scroll area holds output below the fold.

Screenshots are local under `screenshots/`; filenames, dimensions and SHA-256 are in [screenshots.json](screenshots.json). Original regression media was redirected into this checkpoint, preserving historical checkpoint artifacts.

## Architecture discoveries and remaining limits

- Saturation must be transactional across recursively discovered payload dependencies. Stopping midway through a parent/child event group otherwise leaves a semantically invalid prefix.
- Semantic trace capacity cannot also be the authority for process output, input waits or debugger control. These now have separate bounded control/retention paths.
- Atomic sidecar replacement can fail while leaving readable stale status. State/budget/watermark matching is necessary before trusting input telemetry after stop.
- Identity maps remain strong while FULL, bounded at 256 and cleared at stop. Weak identity semantics and possible pre-stop GC effects remain deferred.
- Input telemetry covers the installed wrapper. Replaced streams/direct descriptor reads cannot be inferred truthfully. The explicit hard safety deadline can terminate intentional waits or pauses after 10 minutes; it is separate from observer saturation.
- Complete output archives consume disk proportionally to actual output, retained for at most 32 sessions and deleted on graceful disposal. Disk failure is reported. Abrupt bridge termination can leave temporary archives. The legacy finite provider retains only bounded inline output and reports truncation, without complete archive downloads.
- Full snapshot transport and repeated normalization/seek/layout costs remain; this is not an O(n²) fix. [performance.json](performance.json) records existing acceptance stage timings, not GPU presentation or percentile measurements.
- Constructor nesting, generalized arrays/collections/long values, call provenance, concurrency worlds, static fields and later layout/LOD work remain deferred. No later phase was started.

## Delegation and root ownership

Herschel owned Recorder/DebugControl and budget characterization. Arendt owned live/finite server observation, watchdog behavior and session tests. Newton owned normalization, partial reducer/validation and timeline semantics. The lead locked contracts, reviewed all worker diffs, integrated execution/console/archive/UI behavior, migrated acceptance metadata, serialized real JVM QA, ran final validation and reviewed/polished screenshots. Workers made no commits.

The owned dev server is left running with exactly one Vite listener on 5173 and one bridge listener on 8787. Launch after stopping that existing instance: `npm run dev -- --port 5173`. Stop work after the separate Phase 1 commit; do not begin Phase 2.
