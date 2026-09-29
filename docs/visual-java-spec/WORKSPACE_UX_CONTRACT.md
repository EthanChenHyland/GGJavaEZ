# Milestone 8 — Spatial workspace contract

The shell changes emphasis; it does not create another execution model. The existing trace, reducer, stable anchors, scene model, navigation store, Monaco models, selection and event cursor remain authoritative.

## Workspace emphases

- **Code:** editor starts at 72% of the upper workspace after the explorer. Runtime remains mounted as a secondary preview. Build and Run use Code; Run reveals Console, failed compilation reveals Problems.
- **Runtime / Visualize:** source starts at 30%; the world receives the remaining 70%. Visualize records execution and selects this emphasis. Explorer and unused tools collapse. Spatial is the initial representation. Classic and eligible Theater remain local views of the same trace.
- **Debug:** source starts at 35%; runtime receives the remaining 65%. JVM controls appear here. Live pause and recorded playback are distinct. Inspect Debugger reveals the existing call stack, observed values and breakpoints. Exceptions reveal Error Explorer while retaining source and world.
- **Runtime Focus:** the same runtime fills the workspace. An explicit **Exit Focus** action restores layout; source and tools are revealable. Opening source retains the Monaco model and execution highlight. Selection reveals its existing contextual inspector. The camera is not reset by changing emphasis or opening a drawer. Desktop Focus source reserves a side strip; the embedded selection shelf is compact and existing Focus supplies its safe viewing rectangle. Debugger Home fitting includes the unchanged STACK heading footprint, including a trace whose reserved depth exceeds its current live depth.

Manual editor widths are remembered separately for Code, Runtime and Debug. Re-selecting an emphasis uses its remembered width. Source and canvas remain mounted during transitions. A project/trace replacement retains the established project and runtime lifecycle rules.

## Hierarchy and controls

Global Run, Visualize and Debug remain distinct. File commands stay compact. Camera actions form a floating two-column group with accessible labels and native tooltips; the view switcher belongs to the canvas. The embedded timeline sits at the bottom of the world, with event messages above it. It retains play/pause/replay, forward/back, scrub, speed and event/crash markers.

Bottom tool tabs reveal their selected tool. Re-selecting an open tab keeps it open; the dedicated collapse action closes the drawer. The drawer remains resizable. Tools are disclosed according to available data, rather than permanently displaying unavailable debugger/error sections.

An inspector is selection-dependent. Hiding it does not clear selection; selecting another entity reveals context again. Error Explorer suppresses the inspector only while its drawer is open. On narrow screens, Failure, Stack & path and Cause form a section switcher; value/cause navigation still uses the shared source/cursor/selection pipeline.

## Responsive and motion rules

Desktop reference viewports are 1728×1117, 1440×900 and 1280×800. At ≤900px the explorer becomes an overlay and closes once when crossing into this layout; the user may reopen it. Code gives Monaco full width. Runtime/Debug place the world above supporting source. At 760×900 debug actions wrap instead of becoming inaccessible off-screen. Focus retains full-width navigation and a source drawer.

Width/height transitions last 160ms only when reduced motion is not requested. Existing camera reduced-motion behavior remains authoritative. Home intentionally fits the current viewport; Free Explore retains its pose on workspace/viewport changes. Overview screenshots use an explicit Home action. A narrow aspect change may need Home to recover an overview from a freely explored desktop pose.

## Keyboard and disclosure

Discover shortcuts through **Shortcuts** in the status strip and control tooltips.

| Action | Shortcut |
| --- | --- |
| Save active file | Ctrl/Cmd+S (Monaco) |
| Save all open files | Ctrl/Cmd+Shift+S |
| Run / Visualize / Debug | Alt+Shift+R / V / D |
| Stop current run or debug session | Alt+Shift+X |
| Runtime Focus | Alt+Shift+F |
| Explorer / inspector / bottom tools | Alt+Shift+E / I / B |
| Exit Focus outside Monaco | Escape |

Alt+Shift avoids ordinary Monaco navigation/editing bindings. Workspace chords use physical key codes so macOS Option-produced symbols do not disable them. Unsaved-change dialogs retain their existing focus trap and take priority. Pane separators remain keyboard-resizable. All icon actions have accessible labels/tooltips; active emphasis, representation, guidance and follow states use `aria-pressed`.

## Persistence

Persist validated editor widths per emphasis and explorer collapse preference. Existing project, drafts, tabs and breakpoint persistence is unchanged. Opening the explorer from Focus restores the workspace before revealing the tree. Do not persist a transient workspace emphasis, live debugger pause, Focus, tool drawer or inspector visibility. Fresh sessions begin in Code unless reconnecting the actual bridge debugger. Runtime representation starts Spatial when a new trace mounts, preserving the existing representation behavior within that trace.

## Scope

No new language support, trace schema, layout algorithm, geometry, camera semantics, compiler or debugger protocol is introduced. Materials, colors, fonts and interaction highlights remain the shared runtime design system. No blur or decorative environment is added over WebGL.
