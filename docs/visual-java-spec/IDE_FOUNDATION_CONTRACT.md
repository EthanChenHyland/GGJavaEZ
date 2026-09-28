# Milestone 5 IDE bridge contract

The curated runtime pipeline, `RuntimeState`, and genuine Three.js world remain unchanged. `/` is the visualizer; `/ide` is the editable IDE. `Run` executes actual Java. `Visualize` opens only a curated trace until instrumentation exists. The IDE must never synthesize trace events from an arbitrary JVM run.

`src/ide/contracts.ts` owns browser DTOs. Paths in DTOs are project-relative POSIX paths. They never expose host absolute paths. Project IDs are opaque server identifiers. All HTTP endpoints are same-origin under `/api`, return JSON unless specified, and errors use `{error: string}` with appropriate status. The Node bridge binds loopback only. It performs filesystem operations only inside its managed `.ggjavaez` workspace. User Java runs with the user's OS privileges; it is not sandboxed.

## HTTP API

- `GET /api/health` → `{jdk: JdkStatus}`; `POST /api/jdk/detect` body `{home?: string | null}` → `JdkStatus`. A configured home persists in managed workspace settings. Java and javac must come from the same JDK.
- `GET /api/projects` → `ProjectSummary[]`; `POST /api/projects` body `{name}` → `ProjectSummary`; `POST /api/projects/import` body `{name, files: {path,content}[]}` → `ProjectSummary`. Imports copy browser-selected file content into the managed workspace and preserve relative paths.
- `GET /api/projects/:id/tree` → `ProjectEntry[]`; `GET /api/projects/:id/files?path=` → `ProjectFile`; `PUT /api/projects/:id/files` body `{path,content,revision}` → `ProjectFile` (409 on stale revision); `POST /api/projects/:id/files` body `{path,content?}` → `ProjectFile`; `POST /api/projects/:id/folders` body `{path}` → `{path}`; `POST /api/projects/:id/rename` body `{from,to}` → `{path}`; `DELETE /api/projects/:id/entries?path=` → `{ok:true}`.
- `POST /api/projects/:id/build` body `{}` → `BuildResult`; `POST /api/projects/:id/run` body `{mainClass}` → `RunResponse`. Run compiles all project `.java` files before starting and returns a null run on compile failure. One active run is allowed; rerun stops and reaps the previous process. Build output is deterministic under `.ggjavaez/build/<id>/classes` and rebuilt cleanly.
- `GET /api/runs/current` → `RunSnapshot | null`; `GET /api/runs/:id/events?after=<event id>` → SSE (`event: run`, JSON `RunEvent`); `POST /api/runs/:id/input` body `{text}` → `{ok:true}`; `POST /api/runs/:id/stop` → `RunSnapshot`.

POST and PUT requests carry JSON content type. The bridge verifies loopback Host and the browser Origin against the local Vite/bridge origins for mutations, validates project IDs and relative paths, rejects traversal, symlinks and paths outside the managed root, and limits upload and request sizes. Spawn executable paths directly, never interpolated shell strings. Build and Run are serialized and stop any previous JVM before replacing classes. Switching projects stops a live run; reloading the same project reconnects. The bridge may select the first compiled standard main class when none is supplied; a project without a standard main returns a successful build with a null run.

The managed workspace is ignored by Git and persists on disk. Drafts and tab sessions persist in browser local storage. Each draft retains its original server revision through reload, so a concurrent disk edit produces a 409 rather than an overwrite. Dirty close/switch actions require Save, Discard, or Cancel. Discard explicitly removes the draft. Runtime history is a buffered, bounded in-memory process record, not a normalized execution trace. Requests are limited to 8 MiB; process output is capped at 8 MiB and compilation at 30 seconds. POSIX process groups are terminated on Stop and main-process exit. Deliberately detached user processes are not contained; this is not a sandbox.

## Ownership boundaries

- Lead: this contract, HTTP bridge, Vite/dev integration, route integration, final design review and QA.
- Project worker: `server/projects.mjs` and its tests only. Export `ProjectStore` with `ensureStarter`, `listProjects`, `createProject`, `importProject`, `getTree`, `readFile`, `writeFile`, `createFile`, `createFolder`, `renameEntry`, `deleteEntry`, `getProjectRoot`, `listJavaFiles`. Constructor takes managed workspace root. Methods return API DTOs, except root/files list can be absolute paths for server use.
- JDK worker: `server/jdk.mjs`, `server/compiler.mjs` and tests only. Export `detectJdk(home?)`, `compileProject(projectRoot,buildDir,jdkHome?)`, `parseJavacDiagnostics(output,projectRoot)`; compile result follows `BuildResult`. Resolve path metadata only inside the project. JDK config storage belongs to lead bridge.
- Runner worker: `server/runner.mjs`, `server/exceptions.mjs` and tests only. Export `RunManager` (`start`, `stop`, `input`, `snapshot`, `current`, `subscribe`) and `parseRuntimeException`. Run manager owns process lifecycle and buffered events; HTTP integration belongs to lead.
- IDE worker: `src/ide/IdeWorkspace.tsx`, `src/ide/EditableJavaEditor.tsx`, `src/ide/client.ts`, `src/ide/ide.css` and focused tests only. Uses DTOs above; no writes to existing visualizer or bridge. Local drafts persist under project ID/path until saved. A dirty tab cannot be closed or its project switched without a save/discard decision. Monaco retains a future executing-line decoration interface.

## Future Error Explorer

`CompileDiagnostic`, `RuntimeException`, `StackTraceFrame`, `SourceLocation`, and `ExecutionFailure` carry truthful output from javac/JVM. `causalTraceId` is `null` until actual instrumentation produces a normalized history. The raw javac output and raw stack trace must always remain accessible.
