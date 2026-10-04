# Phase 4 fixture and coverage worker handoff

Owned additions only: `fixtures/acceptance-v12-p4/**` and
`tests/coverage-v12-p4/**`. No production, shared-contract, documentation-tree,
older-fixture or package-script changes. No commit. Root owns integration and QA.

## Corpus and execution counts

- 30 independent projects; 36 Java source files; 70 fixture files.
- Categories 1–24 match section 41 of the latest request, one project per category.
- 125 generic fact assertions plus exact stdout/stderr/exit/file behavior assertions.
- 33 inventory tests require no JVM.
- 30 opt-in acceptance cases each build once and launch one recorded JVM.
- Four opt-in invariance cases each launch base, identifier-renamed and line-shifted
  variants: 12 additional builds/JVMs. Total full opt-in suite: 42 JVM recordings.
- Archive/reload, rebatching and pure-reducer comparisons reuse each recorded run;
  they launch no additional JVM.

The worker has **not run tests, a JVM, a build, a browser or performance probes**.
Counts are authored inventory, not passing-test claims. First execution belongs
to the lead's serialized workload slot.

## Lead commands

Full suite, including inventory, JVM acceptance, archive/replay and invariance:

```sh
VJ_PHASE4_JVM=1 npx vitest run tests/coverage-v12-p4 --maxWorkers=1 --fileParallelism=false
```

First acceptance-only pass (30 real JVM recordings):

```sh
VJ_PHASE4_JVM=1 npx vitest run tests/coverage-v12-p4/coverage.jvm.test.mjs --maxWorkers=1 --fileParallelism=false
```

One scenario, for example callback safety:

```sh
VJ_PHASE4_JVM=1 VJ_PHASE4_CASE=27-adversarial npx vitest run tests/coverage-v12-p4/coverage.jvm.test.mjs --maxWorkers=1 --fileParallelism=false
```

Inventory only:

```sh
npx vitest run tests/coverage-v12-p4/corpus.test.mjs --maxWorkers=1 --fileParallelism=false
```

`VJ_PHASE4_CASE` is a substring filter for JVM suites. `VJ_PHASE4_JDK_HOME`
optionally selects the actual JDK through production `detectJdk`. Imports and
default skipped suites do not launch subprocesses. The runner also checks the
opt-in flag before creating a temporary workspace or calling build services.

## Harness files

| File | Responsibility |
| --- | --- |
| `runner.mjs` | Production BuildService → resolveLaunch → source manifest → DebugManager → contiguous raw deltas → TraceNormalizer/history → validateTrace/seek. Isolated project copy and production cleanup. |
| `facts.mjs` | Typed values, aliases, static ownership/mutations, nested array cells, collection membership/history, String identity, type metadata, library/reflection boundaries, successful I/O, exceptions, bounds and observer limits. |
| `replay.mjs` | Production CaptureReader/archive reload after original JVM cleanup, one-shot/incremental equivalence, varied packet boundaries, pure reducer comparison, immutable LIVE/HISTORY roots and semantic-document reload. |
| `corpus.test.mjs` | Category inventory, fresh-source guards, fact-handler completeness, cross-feature composition and dependency descriptor checks. |
| `coverage.jvm.test.mjs` | Thirty strict real production-path acceptance cases. No expected-failure wrappers. |
| `invariance.mjs` | Ordinal identity canonicalization including new summaries/statics/metadata and all ordered graph edges. Only ephemeral VM lambda addresses are normalized. |
| `invariance.jvm.test.mjs` | Identifier and comment/blank-line invariance for static initialization, reference arrays, ArrayList and captured lambdas. |
| `evidence.mjs` | Opt-in sanitized per-case summaries, accepted semantic trace caches and bounded semantic scrub/heap probes. |

The fact helper applies recorded DECLARE_LOCAL, ASSIGN_LOCAL, CREATE_REFERENCE
and CLEAR_REFERENCE transitions by exact frame/slot identity. Reference values
use the recorded slot's declared Java type and transition target object ID.
Identifier names select an assertion target; they never invent an origin or alias.

## Optional reusable evidence and bounded probes

Production build tools can be selected through `GGJAVA_MAVEN_PATH` and
`GGJAVA_GRADLE_PATH`. Isolated temporary workspaces do not automatically locate
tools under the repository's `.ggjavaez/tools`; pass the lead's configured paths.

```sh
VJ_PHASE4_JVM=1 VJ_PHASE4_OUTPUT_ROOT=.ggjavaez/qa/v12-p4 VJ_PHASE4_PROBE=1 npx vitest run tests/coverage-v12-p4/coverage.jvm.test.mjs --execArgv=--expose-gc --maxWorkers=1 --fileParallelism=false
```

`VJ_PHASE4_OUTPUT_ROOT` creates `cases/<case>.summary.json` and, only after all
behavior/fact/replay assertions pass, `traces/<case>.trace.json`. Failed reruns
remove any previous accepted trace of that case. Summaries include timings,
raw/semantic/graph counts, observer and Java statuses, output hashes/byte counts,
actual JDK version, dependency jar names and classpath labels. Absolute temporary
paths are redacted. Exact captured output-file contents are not copied into the
summary or trace. These caches support root browser/performance work without
another JVM run. Cached traces are canonical semantic documents, including
captured sources and bounded observations; they are not source manifests with
temporary host paths.

`VJ_PHASE4_PROBE=1` measures exactly 30 deterministic seeks from a seeded cursor
sequence on the accepted run. It records individual timings, median/maximum,
history statistics and, only with explicit GC available, process heap before/after
and retained delta in MiB. This delta includes the raw capture, normalized trace,
graph, bounded history, sources and harness; it does not isolate graph storage.
Negative/noisy deltas remain visible. No browser, frame rate, draw-call or GPU
claims are produced. Neither evidence nor probes launch another JVM.

## Scenario map

| Category | Project |
| --- | --- |
| 1 | `01-static-initialization` |
| 2 | `02-primitive-arrays` |
| 3 | `03-reference-arrays` |
| 4 | `04-ragged-arrays` |
| 5 | `05-value-edges` |
| 6 | `06-string-aliases` |
| 7 | `07-array-list` |
| 8 | `08-linked-list` |
| 9 | `09-hash-map` |
| 10 | `10-tree-map` |
| 11 | `11-hash-set` |
| 12 | `12-tree-set` |
| 13 | `13-queue-deque` |
| 14 | `14-record` |
| 15 | `15-enum` |
| 16 | `16-static-nested` |
| 17 | `17-inner-class` |
| 18 | `18-anonymous-class` |
| 19 | `19-lambda-capture` |
| 20 | `20-method-references` |
| 21 | `21-file-io` |
| 22 | `22-maven-dependency` |
| 23 | `23-gradle-dependency` |
| 24 | `24-reflection` |
| Extra | `25-cross-feature-dispatch` |
| Extra | `26-custom-loader` |
| Extra | `27-adversarial-callbacks` |
| Extra | `28-bounded-values` |
| Extra | `29-exception-interactions` |
| Extra | `30-observer-budget` |

The cross-feature Maven project contains seven source files across three packages,
interface/default-method dispatch, inheritance, statics, a record and enum, object
and ragged arrays, lists/maps/queue, captures/method references, caught exceptions,
consumed stdin, exact stdout/stderr, file I/O and Commons Lang returned data.
Maven and Gradle pin Commons Lang 3.17.0; no wrapper binaries or caches are added.
Build descriptors request release 17 and full debug information. That is a source
target, not a claim that JDK 17 was actually tested. The runner returns actual JDK
metadata, resolved dependencies, classpath entry count and measured phase timings
for lead reporting. Timings are not performance acceptance thresholds.

## Assumptions, limitations and integration notes

- Production observation defaults remain 20,000 events, 8 MiB and 30 seconds.
  Only the explicit budget fixture lowers the event cap to 24. Its 3,000-iteration
  Java computation must still finish with exact stdout/stderr after observation ends.
- Every ordinary project requires `FULL`, a normalized `ended` state, and no
  `Raw event` normalization diagnostic. Failures are intentional integration signals;
  the assertions are not weakened to match partial implementation.
- The custom-loader project compiles a fresh plugin at runtime with JavaCompiler
  and loads it with a custom URLClassLoader. Those bytes bypass the offline project
  transformer. It checks exact Java behavior, no fabricated plugin invocation and
  no false Method.invoke binding. It permits FULL or STOPPED_UNSUPPORTED observer
  status, documenting that FULL does not establish dynamic-class semantic coverage.
  It does not claim a complete class-loader model.
- Reflected project entry is asserted separately from a static call-site relationship.
  Missing provenance is allowed; binding Method.invoke as the actual project method
  is rejected. Lambda captures require observable project calls and final state;
  no guessed closure provenance is asserted.
- Collection histories must match ordered snapshots of the same observed identity.
  HashMap/HashSet ordering is not invented. LinkedList through Queue requires the
  explicit QUEUE/fifo logical view; ordinary LinkedList remains LIST/index.
- Hostile project Collection/Map subclasses require explicit OPAQUE summaries with
  a reason and no fabricated contents, while preserving ordinary user fields. The
  lead has identified and owns the necessary Recorder integration. Assertions remain
  strict. A guarded callback throws and increments a counter if observation calls
  user iterator/get/size/toArray/entrySet/equals/hashCode/comparator/toString code.
  This is callback observation safety, not a standalone adapter mock test.
- External projects require available Maven/Gradle and dependency resolution/cache.
  No tool installation, network prefetch or workload was performed by this worker.
- Capture/semantic reload uses real observed records. It verifies canonical long
  strings, nonfinite/-0 floating encodings, UTF-16 chars, object references and new
  static/library metadata survive through production parsing and normalization.
- Replay checks a bounded set of informative real cursors against pure reduction.
  It is not a browser responsiveness or large-scale asymptotic performance claim.
- No renderer coordinates, camera, animation or scene layout are fact targets.
  Inspector/browser presentation, cross-platform native behavior, profiler evidence,
  coverage-document classifications and full milestone validation remain root work.

Every path in the two owned trees is new. Review those complete trees as the worker
diff; no other worker's existing changes are part of this handoff.
