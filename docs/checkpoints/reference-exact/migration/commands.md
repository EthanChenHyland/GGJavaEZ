# Command registry migration — 2026-10-09

Scope: the command sidecar owns `src/ide/commands.ts`, `src/ide/shortcuts.ts`, their tests and command dispatch portions of `src/workspace/useWorkspace.tsx`. No rendering, backend, runtime, source-proof, filesystem transaction, or debugger implementation changes are included. No commit or heavyweight validation was performed by the sidecar.

Binding authority: reconstruction `design.md`, Components §4 (command table), §11–13 (Selection/Focus/camera/Trace); `tasks.md` 5.3 and 5.5; Requirements 5.3–5.5, 5.14–5.16, 19.3–19.4, 19.10, 20.4, 21.6–21.10. Every `docs/visual-java-spec` Markdown file and all twelve reference PNGs were read/viewed at original size before editing. Later root direction establishes Escape precedence: pending dialogs/palette → open Inspector → Focus → Trace, with typing/Monaco retaining their keys.

## Exact registry migrations

| Prior assertion/behavior | Replacement | Reason and preserved coverage |
| --- | --- | --- |
| Exact registry inventory includes `workbench.runtimeFocus` | Exact inventory removes that ID and adds nine canonical navigation IDs and three view IDs | Design explicitly removes the legacy layout action. The test still asserts the complete ordered registry; no subset/count-only replacement of the old assertion. |
| `Alt+Shift+F` changes workspace layout | `navigation.focusSelection` uses the actual camera and canonical interaction stores | Requires a focusable Selection; rejects empty/Connector/Flow selections with a disabled reason. Keyboard dispatch leaves this chord to typing and Monaco, per root instruction. |
| Palette definition binds only primary+Shift+P | Exact binding array also includes F1 | Requirement 5.3. Both shortcuts resolve to one palette command on macOS, Windows and Linux. |
| Scope union is workspace/editor | Adds world scope; Home binds physical KeyH only in world scope | No invented bare F/T bindings. Exact modifier matching remains unchanged. Typing, Monaco and Shell controls cannot dispatch world Home. |
| Presentation commands with empty project ID fail the workspace guard | Navigation/view commands use the connected shell adapter in viewer and IDE | File/execution guards, resource identity and generation checks remain intact. Added tests explicitly retain project rejection for file Save and execution Run. |
| Presentation commands wait in the filesystem queue | Navigation/view actions dispatch immediately after generation/availability checks | Added test holds an actual command-service file operation pending and verifies Home dispatch completes before it releases. Filesystem/debug operation serialization is unchanged. |
| Inspector availability requires legacy Selection/visualization | Uses canonical Selection OR Focus | Root's Focus fallback remains actionable after Selection is cleared. The sidecar never clears Selection/Focus when toggling visibility. |
| Legacy Escape exits runtime layout; canvas can then handle Escape again | Global handler chooses the existing Inspector visibility command, then Exit Focus, then Explore to exit Trace; consumes default and propagation exactly once | Uses `shellStore.inspectorHidden` and canonical Selection/Focus. Pending dialogs, picker, menus and composing input retain control. Source/Inspector chrome does not fall through to camera navigation. |

## Architecture

Registry definitions remain immutable. `isShellCommand` includes canonical navigation/view commands; `isPresentationCommand` selects the immediate lane and viewer authorization. `worldCommandAvailability` is pure and tests real selection kinds, focus presence, current drawable Flow admission, mounted World and actual GPU/context readiness. The workspace reads fresh store values on every availability/execute check instead of caching navigation enablement at its last render. Palette subscriptions use canonical Selection/Focus and GPU availability without subscribing to per-frame camera pose updates.

The operation adapter calls only the existing `cameraStore`/`interactionStore`/`qualityStore` actions. Explore enables Follow; Follow explicitly enables Follow; Home/Focus/Exit Focus are central camera intents; each Trace command enters Trace then selects the requested scope. Quality uses the existing lazy `selectQuality` path and actual cinematic capability reason. Reduced motion toggles the in-app preference; OS preference remains independent.

The physical-key matcher is unchanged. New pure helpers enforce scope and Escape precedence before the global handler consumes an event. Disabled in-scope registered chords are consumed without executing. Unbound chords and out-of-scope world chords are left alone.

## Root integration required

`navigation.followPath` must validate against the **current PresentationPlan**, not an old graph, source guess or QA-only global. `registerWorldCommandSurface({ hasPresentedFlow(id) })` is the production adapter seam in `commands.ts`. The mounted World owner must register a getter backed by the latest plan and return the cleanup function on unmount. A valid ID is an individually drawable Flow curve (including return/exception flow kinds), excluding Connector/call curves and bundles. Example:

```ts
const commandPlan = useRef(plan)
commandPlan.current = plan
useEffect(() => registerWorldCommandSurface({
  hasPresentedFlow: id => commandPlan.current.curves.some(curve =>
    curve.id === id && ['flow', 'return', 'exception', 'binding-history'].includes(curve.kind)),
}), [])
```

Until root wires that seam, Follow Path is deliberately disabled with “Select a Flow presented at this point in time.” It never claims an unavailable path is drawable. Adapter tests cover live plan changes, unmount, and cleanup from an older replaced surface.

Root retains ownership of Mode_Bar/Inspector controls and must bind them to these same registry IDs where the final contract requires shared dispatch/disabled reasons. The current Shell still directly calls `workbench.source`, `workbench.edit` and `workbench.tools`; those compatibility entries are retained here to avoid breaking another owner's rendering files. Their final removal/rename and the remaining full Requirement 5.14 inventory (Restart, Errors, Expand/Collapse Source, etc.) belong to root's shell convergence. Return to Live's existing host behavior is preserved; viewer-local playback integration remains root-owned.

Root integration: WorldSurface now registers the latest plan and recorded-event presence through the production adapter; availability no longer treats an empty mounted canvas as a recording. Mode_Bar buttons dispatch the registry IDs with its current disabled reasons. The browser command check exercises viewer F1, palette Home, physical H, Alt+Shift+F, Selection clearing in Focus, Inspector-only Escape and subsequent Focus exit. Root ran the 75 focused checks and seven reconstruction browser checks successfully; remaining registry inventory and shell convergence above remain open.

## Checks and requested validation

Sidecar checks: inspected actual code, command call sites and full assigned diff; `git diff --check` on owned paths. No test/build/dev/JVM/npm commands were run, per root slot ownership. Test assertions were expanded, never skipped or weakened. No semantic golden or reference image was modified.

Root should run the command/shortcut tests, retained `src/ide/commandIntegration.test.ts`, typecheck and lint in its serialized slot. Then exercise real viewer and IDE palette/keyboard actions: F1 and primary+Shift+P open exactly once; H works only with World focus; Alt+Shift+F focuses the canonical Selection without layout changes; unbound F/T and typing/Monaco keys stay local; disabled Focus does nothing; Focus survives Inspector Escape/close and Selection clearing; the next Escape exits Focus; Trace scopes keep cursor/selection/pose; Follow Path is enabled only for a drawable current Flow; GPU-disabled Cinematic shows its actual reason; all actions leave semantic cursor/runtime/backend state intact.
