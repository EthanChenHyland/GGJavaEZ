# Milestone 9 — Java language intelligence and project builds

Baseline: clean `e19c940` (Milestones 1–8). ADR 009 and `M9_LANGUAGE_RESEARCH.md` record the language-server comparison and the chosen contracts before implementation. This milestone keeps the M8 Code / Visualize / Debug / Runtime Focus hierarchy and the existing trace, reducer, stable-anchor, camera, debugger and Error Explorer semantics.

## Implemented

- Eclipse JDT LS 1.61.0 runs as one owned local subprocess behind a generation-scoped Node JSON-RPC service. The browser sees project-relative `inmemory://ggjavaez/...` identities. The service bounds requests, validates URIs and edit targets, clears stale diagnostics on project switches, replays unsaved drafts on restart, and degrades to editing/build/execution if language startup fails. Installation is explicit via `scripts/setup-java-language.mjs`; normal app startup never downloads it.
- Monaco's native completion, hover, signature, definition, references, rename, symbols and code-action widgets use that semantic service. Organize imports and rename apply validated workspace edits to drafts before Save/Save All. Source, project and binary Java identities stay distinct. Language and compiler Problems retain separate provider data and deduplicate matching location/message entries.
- One derived Java project contract covers plain javac, Maven and Gradle. Project files remain filesystem records; build providers resolve source/test roots, production sources, dependencies, classpaths and outputs. Maven uses its effective POM and dependency plugin; Gradle uses its wrapper when present and a bounded init script built around public source-set APIs. Conventional single-module classpath projects are the documented scope.
- Build outputs stage production classes/resources in a managed classes directory. That staging path plus the resolved runtime dependencies is the canonical Run / Visualize / Debug classpath. Only project classes are instrumented. An advisory language-server query compares its observed classpath with the canonical build model and visibly flags disagreement; execution keeps the build model as authority.
- Multiple verified `main(String[])` targets share one selected launch configuration across Run, Visualize and Debug. Working directory, structured program arguments and restrained JVM arguments are validated on the server. Package-aware source manifests and debugger locations connect `Main` → `PersonService` → `Person` without short-name ambiguity. Runtime labels can be concise while the inspector retains the full binary class name.

## Browser and visual review

`capture-m9.json` indexes **30 app screenshots** at the established 1728×1117, 1440×900, 1280×800 and 760×900 sizes. Reviewed states: Maven Code, Monaco completion and hover, launch configuration, Maven Visualize at trace step 24, Runtime Focus, paused Debug, Gradle project status and broken-POM Problems. The actual WebGL world has distinct X/Y/Z stack and heap cuboids, visible top and side faces, shadows and curved runtime references. The 760 px Focus view preserves orbit controls, timeline, Source and Exit Focus. Visualize and Debug leave the world dominant; Code remains editor dominant. Comparison against references 06–11 and `DESIGN_SYSTEM.md`, `VISUAL_LANGUAGE.md`, `CAMERA_AND_NAVIGATION.md` and `POLISH_AND_QA.md` found no decorative world geometry, sci-fi-city styling or flat-card substitute.

Polish after the first capture:

- Captured a meaningful trace step instead of an empty pre-execution world, so the screenshot validates depth and source synchronization.
- Removed a JDT hover source line after host-path redaction, leaving the useful semantic signature.
- Shortened package-qualified type names only on bounded Spatial and Classic value faces, and moved long type labels clear of reference values. The runtime model and accessibility/inspector identity still retain the full type. The 1728 px recapture no longer has FQCN text crossing reference lines.
- Made classpath disagreement visible in the compact language status instead of hiding it solely in a tooltip.
- Used a readable QA project name in captures so a long generated identifier does not dominate the top bar.

The restrained material treatment is deliberately less luminous than the concept images. It preserves the semantic blue stack, violet heap and cyan execution cues and avoids excessive glow. Frame faces and references remain real Three.js geometry; runtime data determines the composition.

## Validation and performance

See `PERFORMANCE.md` and `performance.json` for bounded local measurements, including live Spatial orbit during Gradle build and language switching.

| Gate | Result |
| --- | --- |
| Full unit/integration `npm test` after label polish | **507 passed**, 52 files |
| Full serial browser `npx playwright test --workers=1 --reporter=list` | **65 passed**, including all M1–8 regressions and five M9 project flows |
| Configured `npm run lint` | Passed |
| `npm run build` (includes TypeScript) | Passed; existing large-chunk/Troika dynamic-import warnings remain |
| Capture script | 30 screenshots, zero page errors |
| `git diff --check` and M9 script syntax checks | Passed |

The browser gate exercised plain Java, Maven multi-package semantic navigation and field rename, Go to Definition, imports, build/Run/Visualize/Debug, cross-package breakpoint and Step Out, Gradle dependency completion plus wrapper build/Run/Visualize, multiple main targets with program arguments, and broken POM Problems. Existing Person, recursion, array, control-flow, debugger, Error Explorer, Trace Cause and M8 workspace tests all passed in the same serial run. The final source change after that full browser run shortened display-only type labels; a fresh unit run, build, lint and all 30 real-app captures validated the result.

## Delegation and integration

Focused agents handled JDT LS transport/lifecycle, Monaco semantic adapters, build-provider research/implementation, and bounded QA/performance preparation. The lead locked ADR 009 and the shared JavaProject/launch/source-identity contracts; integrated build and language routes, project-aware Run/Visualize/Debug and the M8 shell; reviewed their diffs; ran all real JVM/browser work serially; performed the final visual and performance pass. Agent work remained uncommitted until this convergence gate.

## Known support limits

- The pinned JDT LS documentation advertises language support through Java 25; Java 26 semantic coverage is provisional even though the selected OpenJDK 26.0.2.1 successfully compiled and ran the acceptance fixtures.
- JDT's advisory classpath query agrees with the Maven fixture and flags the Gradle fixture (`classpathMismatch=1`). Gson completion, Gradle compilation, Run and Visualize work in that fixture; the disagreement may include importer-only classpath entries and remains visible for investigation. This is not silently treated as parity.
- On OpenJDK 26, JDT LS method rename in the imported Maven fixture can fail internally with `BinaryModuleBinding.create` while searching imports. Cross-file semantic field rename (`age` → `yearsOld`) and Save All pass. No text-replacement fallback was added.
- Maven reactors, Gradle composite/multi-project builds, JPMS/modulepath, Android and mixed-language builds are outside the M9 provider contract. The selected source scopes are production classes; library internals are not trace targets. External definitions may be unavailable because arbitrary host files are not exposed through the project URI boundary.
- Local dependency caches can be populated by Maven/Gradle; offline cache misses surface as build failures. Setup scripts install pinned tools explicitly and are not run by `npm run dev`.

## Reproduce

```sh
npm install
node scripts/setup-java-language.mjs --download
node scripts/setup-build-tools.mjs --download
npm run dev
```

Open http://127.0.0.1:5173/ide. Once tools are installed, subsequent `npm run dev` starts locally without downloading them. Run `node scripts/capture-m9.mjs` and `node scripts/measure-m9.mjs` only with the owned dev server active and no concurrent JVM/browser QA; both import local fixtures and run real Java/build workloads.
