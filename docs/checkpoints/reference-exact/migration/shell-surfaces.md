# Shared Shell surface ownership — 2026-10-19

`DialogFrame` and `CommandMenu` share one mounted-surface stack. Parent identity handles child-before-parent layout effects; later sibling dialogs cover earlier nested subtrees. Only the top owner handles Escape/Tab. Dialogs cycle visible enabled controls, redirect escaped focus and restore a surviving displayed opener after DOM removal, otherwise the Editor/World fallback. Pointer dismissal preserves the clicked target's focus. StrictMode cleanup/remount, duplicate registration and parent cycles are covered. Transient layers derive from the central Shell layer; portal output remains inspectable through server-rendered markup.

Path/create/rename, Delete, unsaved changes and Launch use the shared frame and glass styles. Delete lists the exact affected dirty paths or states there are no unsaved files. Path and unsaved-save failures appear inside the dialog. Required Save / Don't Save / Cancel labels replace Save and continue / Discard / Cancel; the underlying save/discard/cancel values and operations are unchanged. Launch preserves exact JSON string arguments, working-directory text and the saved main; a saved main absent from the latest build is explicitly labelled rather than silently replaced. Both existing search UIs join the same focus owner, but their rendering/data consolidation into one Picker remains pending.

The old `src/ide/WorkspaceMenu.tsx`, `LaunchDialog.tsx` and `ProjectExplorer.css` are physically removed. Active Explorer/first-use styling now belongs to Shell's explorer partial. This is not completion of the Header project menu, remaining legacy class hooks, single Picker, DirtyRun decision or the complete R2/R12 deletion gate.

## Browser reconciliation

All four former `e2e/explorer-usability.spec.ts` cases move to `e2e/reference/explorer-workflows.spec.ts`; none is retired. Original serial mode,30-second case limits and filesystem assertions remain.

| Original case | Current successor and preserved evidence |
| --- | --- |
| First use, narrow | Remains unselected; import-copy/New Project/managed selection, Cancel and missing-project recovery. Opens the real narrow Source drawer after choosing a project. |
| Root creation | Same new-file/new-folder defaults, Tab/Shift+Tab wrapping, actual creation and empty-project defaults. Opens Explorer through the registered command after Shell hydration. |
| Dirty file Delete | Cancel retains dirty editor and exact original server content; confirmed Delete removes the file with404. Adds exact affected-path list assertion. |
| Dirty folder Delete/menu keys | Same first/End/wrapped menu focus and Escape opener restoration; Save and delete sends the exact edited source before descendant404. Adds exact descendant list assertion. |

The helper observes the actual mounted Source URI before typing, because Monaco's DOM can precede its onMount callback. It does not create/edit a model or set application state. The existing two editor-model lifetime cases update only the required Don't Save label, preserving all model/view/draft/persistence assertions.

Five new mounted-production fixture cases cover nested topmost ownership, both Tab directions, disabled controls/reasons/activation, menu bounds and wrap, pointer/Tab dismissal, single activation, parent/child focus, whole-subtree removal, repeated StrictMode remount, exact Launch arrays/errors and retained unlisted main at1440×900 and760×900. These fixtures are not actual-JVM execution tests.

## Results and retained failures

Focused unit integration87/87 passes. Full defaults pass **2103/2173 with70 explicit opt-in skips**,225files (218passed/seven skipped),184.54seconds,exit0 (`validation-shell-surfaces-full-unit.log`): previous2091 plus five stack and seven parser cases. Build/typecheck, strict browser TS, lint and reference/protected guards pass. Main71763gzip bytes; entry/shell closures72191/663441 diagnostic bytes; Monaco/Cinematic remain split. Twelve workspace operation initializers, including the whole command operation object, compare byte-identically with parent9e2a612 (`shell-surfaces-operation-equivalence.json`). No emitted-asset equivalence is claimed for this visible change.

The final affected browser execution passes **12/12, zero failures/skips/flaky**,29.60seconds (`browser-shell-surfaces-verified.json/log`). Earlier runs are retained: initial5passed/5failed/2not-run39.25s (hydration, menu intrinsic width and select-label issues); next10/1/1,32.10s (delete-message capitalization); intermediate12/12,28.86s; polish10/1/1,31.83s (typing before mounted Source ownership). No partial run is called a complete pass and no timeout is enlarged. A separate added width check reproduces the screenshot's narrow first-use defect at40px,exit1,2.17s (`browser-first-use-width-red.json/log`). The chooser now occupies the available width beside the peek tab; the final run checks ≥430px at760×720 and unclipped ≥24px action targets.

Eight fresh captures are archived with full source-tree and PNG hashes in `shell-surfaces-captures/`; root opened all originals and best.png. Four are actual project-workspace captures; four are isolated shared-component fixtures. UI geometry is readable at these tested sizes. Populated World glow/truncation/material/reflection problems, general Source/Inspector overlap, all-viewports/contrast/video/capture approval and performance gates remain OPEN. Parent9e2a612's separate frozen113/113 native pass is recorded in styles-tokens; this new affected12-case pass is not a new full122-case or formal80-session gate. Whole A–G acceptance remains open.

Post-stage AST inventory:630modules/2184literal edges/242production reachable/zero superseded renderer targets. Native inventory122cases/42files; default219cases/63files, including97older cases. The four Explorer cases are migrated rather than removed from default coverage.
