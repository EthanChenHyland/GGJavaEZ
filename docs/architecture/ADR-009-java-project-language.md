# ADR 009 — Java project and language intelligence

Status: selected before M9 implementation. Lead owns this contract.

## Direction

Use Eclipse JDT Language Server as the semantic authority, behind a local Node service and Monaco provider adapter. Do not implement Java symbol resolution, completion, type analysis or refactoring with source regexes. The mature alternatives and pinned distribution are recorded in the accompanying language research report before provisioning.

Keep filesystem records separate from a derived, versioned Java project. Plain javac, Maven and Gradle providers produce the same project/launch contract. Maven uses its effective model and dependency goals; Gradle uses a bridge-owned init script and public source-set APIs. Initial support is conventional single-module classpath Java projects, including custom roots. Unsupported reactors, composite builds, JPMS and mixed-language projects must report their limitations instead of guessing.

## Shared server contract

`BuildService({workspaceRoot, projects, getJdk})` owns resolution and building:

- `resolve(projectId, {refresh?:boolean})` → server JavaProject.
- `build(projectId, {debug?:boolean})` → existing BuildResult plus server-only `project`.
- `toDTO(project)` → browser JavaProject DTO, without absolute filesystem paths.

Server JavaProject: `projectId`, `revision`, `buildSystem` (`plain|maven|gradle`), `status` (`ready|failed`), `diagnostic`, `sourceRoots`, `testSourceRoots` (project-relative), `sourcePaths` (production project-relative Java paths), `outputRoots` (absolute original project outputs), `classesDir` (managed staging output), ordered `compileClasspath` and `runtimeClasspath` (absolute paths), `dependencies` (`{name,path}`), `jdk` (existing detected JDK), `runnableTargets` (binary class names), `elapsedMs`, `rawOutput`. Models and builds preserve classpath ordering and one revision; failed resolution never authorizes launch.

Build providers stage only project production classes/resources into `classesDir`. The staged output is the first entry of the effective execution classpath, followed by dependencies/resources not already staged. Colliding classes fail rather than silently overwrite. Instrumentation transforms only staged project classes and receives dependencies for verification as well as execution. Dependency libraries are never capture targets.

`LaunchConfiguration`: `mainClass`, `workingDirectory` (relative to project, default `.`), `programArgs:string[]`, `jvmArgs:string[]`. An empty main selects the first confirmed compiled standard main; an explicit invalid main fails. Browser remembers configurations per project. Server validates cwd containment and structured argument arrays. User arguments cannot replace classpath/main/module launch flags, agents or `visualjava.*` required properties. Run, Visualize and Debug accept the same configuration. Internal arguments remain server-owned.

Runner/capture request extensions: `classpath:string[]`, `programArgs:string[]`, `jvmArgs:string[]`, `workingDirectory:string` (validated absolute). Existing defaults remain compatible.

## Language boundary

One owned JDT LS process at a time, bounded heap, project-specific data cache, stdio Content-Length JSON-RPC. Explicit setup installs a pinned local distribution; normal startup never downloads tools. Failure leaves editing/build/execution usable. Status and diagnostics are generation-scoped, cleared on switch/restart, with bounded requests/output and owned-process cleanup.

`JavaLanguageService({workspaceRoot})`: `open({projectId,projectRoot,model,jdk})`, `status(projectId)`, `request(projectId,method,params)`, `notify(projectId,method,params)`, `restart(projectId)`, `stop()`. `open` returns a status snapshot promptly while initialization continues. `request` waits for initialization with a bounded deadline. Snapshot: `{projectId,generation,status,message,diagnostics:[{uri,diagnostics}],metrics}`. Status: `starting|indexing|ready|unavailable|failed|stopped`. All inbound/outbound source URIs use `inmemory://ggjavaez/{projectId}/{path}` at the browser boundary, with exact path mapping to managed real files. External declarations can degrade to unavailable locations; never navigate arbitrary host files. Request and notification methods are allowlisted.

HTTP: `POST /api/projects/:id/language/open`, `GET .../language`, `POST .../language/request {method,params}`, `POST .../language/notify {method,params}`, `POST .../language/restart`. Project semantics: `GET .../java-project`. React uses a generic frontend language client; it knows no JDT launch settings.

## Editor edits and diagnostics

Monaco providers handle completion, hover, signatures, definition, references, rename, symbols and semantic code actions. Open/change/save/close notifications use monotonically increasing document versions. Providers reject stale project responses. Workspace edits preload and validate every referenced file/version/range before changing anything, reject unsupported resource operations, and apply to Monaco models plus IDE drafts in one frontend transaction. Semantic edits stay dirty until Save/Save All; no partial disk writes. Preserve undo with model edit operations where possible.

Language problems retain `provider:language`; javac/build problems retain their genuine compiler text and raw output. Deduplicate only matching file/location/severity/message in the combined Problems list. Source identity remains project-relative path; semantic class identity remains exact binary FQCN; labels may be concise. Existing trace/reducer/anchor/camera/debug contracts remain unchanged.

## UX and process ownership

Preserve M8 Code/Visualize/Debug/Focus proportions, mounted runtime, timeline, inspector and keyboard behavior. Add compact status, contextual launch dialog and native Monaco popups. No permanent language/build panels. Initialization is asynchronous; editing remains available. Serialize expensive build/capture/browser QA workloads. Do not start overlapping JVM test suites or unrelated dev listeners.
