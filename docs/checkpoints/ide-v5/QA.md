# Milestone 5 — IDE foundation and real Java execution

Reviewed 2026-09-28, starting from clean `a5fbeee`. The existing normalized reducer, scene model, Classic/Spatial/Theater representations, and navigation semantics were preserved. The only visualization-shell change is an IDE Workspace link.

## Delivered architecture

- `/ide`: editable multi-tab Monaco, project explorer, resizable editor/runtime/project panes, bottom Problems/Console/Timeline tabs, Save/Save All, Build/Run/Stop, JDK configuration, and import.
- `/`: the existing full runtime visualizer. Visualize opens this curated workspace. Real JVM runs never fabricate normalized trace events.
- Browser DTOs and bridge client in `src/ide/`; project storage, paired JDK discovery, javac compilation, child-JVM lifecycle, exception parsing, and HTTP routing in `server/`.
- Opaque project IDs and project-relative source locations; atomic revision-checked saves; persistent browser drafts, tabs and active file; explicit Save/Discard/Cancel for dirty close/project-switch actions.
- Future Error Explorer types retain compiler diagnostics, runtime exceptions, raw traces, parsed frames, and source locations. Causal trace IDs remain null.

## Validation

| Gate | Result |
| --- | --- |
| `npm test` | 340 passed in 29 files, including real javac/JVM bridge integration |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed; Monaco/Three.js chunk-size advisory remains |
| `npm run test:e2e` | 39 passed: all 29 existing visualization regressions plus 10 IDE workflows |
| Production browser smoke | Built `/ide` served by the bridge; starter compiled and ran to exit 0; no page errors |
| Java environment | OpenJDK 26.0.2.1; matching java/javac detected automatically |

Real Java checks covered Hello GGJavaEZ, multi-file calls, syntax errors, unresolved symbols, stdout, stderr, NullPointerException with navigable project frames, Scanner stdin, long-running Stop, rerun, and inherited child-process cleanup. Browser checks covered editable tabs, Save All, draft reload, dirty close decisions, revision conflicts after reload, file/folder creation, rename/delete, folder import preserving `src/Main.java`, Problems markers/navigation, console I/O, Stop/rerun, and keyboard pane resizing.

The first six-worker browser run had one camera screenshot equality failure; the targeted test passed alone, and the complete suite passed with two workers. Browser concurrency is now capped at two to reduce CPU/GPU contention. Tests and visualization semantics were not weakened.

## Screenshots reviewed

`node scripts/capture-ide.mjs` produced and the lead inspected all 16 PNGs in this folder:

| Viewport | Editable workspace + Scanner console | javac Problems | JVM exception | Person Spatial regression |
| --- | --- | --- | --- | --- |
| 1728 × 1117 | `workspace-1728x1117.png` | `problems-1728x1117.png` | `exception-1728x1117.png` | `person-regression-1728x1117.png` |
| 1440 × 900 | `workspace-1440x900.png` | `problems-1440x900.png` | `exception-1440x900.png` | `person-regression-1440x900.png` |
| 1280 × 800 | `workspace-1280x800.png` | `problems-1280x800.png` | `exception-1280x800.png` | `person-regression-1280x800.png` |
| 760 × 900 | `workspace-760x900.png` | `problems-760x900.png` | `exception-760x900.png` | `person-regression-760x900.png` |

The lead reviewed the full specification and references 00–11 before edits, including 06–11 as the true-3D direction. The Person regression retains visible top/side faces, separate XYZ frame/object anchors, shadow grounding, p/this relationships, age mutation, and source synchronization. The new IDE uses shared canvas/panel/border/text tokens and semantic accents without introducing decorative runtime geometry.

## Polish changes made

- Removed a non-semantic perspective-like icon from the idle runtime pane. The pane truthfully explains the current trace boundary and opens the full visualizer.
- Changed the narrow IDE layout to give Monaco full width, keeping Visualize as a compact, clear action. The runtime itself remains full size when opened.
- Compacted Problems rows and made exact compiler output expandable, so multiple diagnostics fit the bottom panel. Clicking retains precise file/line/column navigation and editor markers.
- Corrected actual compiler/runtime errors to the shared exception color. Success, stdout, stderr, stdin, and stopped/error process status are visually distinct.
- Corrected divider coordinate calculations; added arrow-key resizing and focus outlines. The dirty-file decision dialog traps keyboard focus and supports Escape.
- Preserved console chunks inline, avoiding artificial line breaks between stdout fragments. The console follows new output and retains a navigable structured stack summary alongside raw JVM text.
- Added separate Save and Save All controls; retained open tabs/active file and original draft revisions across reloads. A concurrent disk edit cannot silently replace either the server file or browser draft.
- Lazy-loaded the IDE/editor code instead of forcing Monaco into the visualizer's initial bundle.

## Delegation and integration

Focused subagents implemented project storage, JDK/compiler behavior, and JVM runner/exception parsing. An IDE subagent supplied a separate shell proposal; the lead reviewed its diff and integrated useful dirty-file decisions, raw-output access, and client tests into the lead-owned shell. The lead locked DTOs/API contracts, integrated the HTTP bridge and launch scripts, preserved visualizer contracts, and performed final QA. A separate QA reviewer hit an account usage limit; its unfinished review was not used as acceptance evidence.

## Security and remaining limits

The bridge binds loopback, validates Host/Origin, accepts structured spawn arguments, restricts its own filesystem actions to managed project/build paths, rejects traversal/symlinks, and checks save revisions. JVM and compiler children are terminated on shutdown; POSIX inherited process groups are cleaned up on Stop/exit. **User Java is not sandboxed** and runs with OS permissions. Deliberately detached processes are outside process-group cleanup, and Windows process-tree behavior has not been validated.

Imports include `.java` source only; standard public static main entry points are supported. No Java LSP, arbitrary-JVM visualization, debugger, instrumentation, Maven/Gradle, AI, or cloud runner is implemented. Source-frame links require a unique project path match. Run history is in memory, bounded to 32 runs/4,096 replay events; output is limited to 8 MiB per run and compilation to 30 seconds. Large Monaco/Three.js production chunks still trigger Vite's advisory. These are documented limitations, not fabricated capabilities.

## Launch

```sh
npm install
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173/ide`. For a built app: `npm run build` then `npm start`, and open `http://127.0.0.1:8787/ide`.
