# One Shell Picker — 2026-10-19

Quick Open, Command Palette and workspace symbols now render through `src/shell/picker/Picker.tsx`, sharing the mounted-surface focus owner, listbox/options, keyboard selection and single-activation guard. File and command selection still call the existing command service. Symbol search still uses the existing LanguageClient/JDT transport and200ms debounce; it retains server ordering and local-project filtering, rejects stale query/project/cleanup responses, and bounds the same80 local symbols. Missing/invalid recorded positions stay explicitly disabled instead of the predecessor's invented line-one location. Open errors remain inspectable and allow retry.

Quick Open matches the actual relative path with shared fuzzy scoring, preserving character order across query tokens and ranking exact filenames first. The former100-result truncation is removed. Fixed48px rows virtualize the complete result set; Home/End, arrows and native scrolling reach row5,000. Offscreen active descendants remain mounted for accessible identity. Commands retain category/title/shortcut and disabled reason; Enter/click activates once. Backdrop pointer default is prevented before normal close/restoration, avoiding browser focus falling back to body after DOM removal. Escape, Close and ordinary activation restore surviving openers through the existing owner.

`src/ide/WorkspacePicker.tsx`, `SymbolSearch.tsx`, the unused two-line `IdeWorkspace.tsx` alias and26 superseded search CSS rules are physically removed. The entire workspace hook is byte-identical to parent9065627 except its erased PickerItem type import/annotation (`picker-operation-equivalence.json`); no filesystem, draft, JDT, execution, normalized/runtime/graph/history or source-proof operation changes. New Picker styling uses frozen UI/semantic variables and fonts≥12px. Task3.4 remains open for DirtyRun and the remaining dispatcher consolidation; Header/Dock, old hooks and final cleanup are separate open work.

## Per-case reconciliation

All16 original `src/ide/spatialShell.test.tsx` cases move to `src/shell/picker/pickerCommands.test.tsx`; no case is retired. Exact-source comparison after import/component renames passes.

| Original case | Successor |
| --- | --- |
| accepts subsequences and path/name tokens instead of requiring a substring | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| ranks contiguous and basename matches above scattered path matches | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| keeps existing order for an empty query and rejects unrelated items | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| normalizes query whitespace and case while preserving stable equal-score order | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| can find a command by its registry id and a file by folder and basename together | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| matches command categories and preserves disabled reasons in the keyboard list | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| provides exactly the seven conventional tab commands | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| shows file actions for files and creation actions for folders/root | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| wraps keyboard navigation and supports Home/End and empty lists | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| offers canonical Reveal and Copy Path for both resource kinds without duplicate actions | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| accepts a class name or optional extension within the selected folder | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| uses plain, Maven/Gradle and test source roots without including them in the package | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| chooses the most specific declared source root | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| supports Unicode Java names and rejects keywords, traversal and invalid packages | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| handles source-root files and package-boundary lookalikes without guessing a package | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |
| uses conventional roots while metadata is pending, and respects an explicit empty model | Same case and assertions in `pickerCommands.test.tsx`; imports/component name only. |

Eight new symbol-model cases cover exact positions/order, local filtering/80 bound, unavailable positions, query race, cleanup success/error, project replacement, real error/recovery and empty queries. Two file cases cover exact ranking among5,000, stable catalog, actual-path-only matching, all5,000 matches and reverse-token rejection.

## Browser evidence and limits

The first20-case run has17passes/three new-case failures,116.45s: two focus assertions followed a second native double-click after the surface had already closed; the symbol chord was sent before the UI's language readiness caught up with the endpoint. Ordinary single-click focus assertions remain, with double-click single activation checked separately. The next3-case run has one actual-JDT pass/two backdrop focus failures,19.54s; it demonstrates pointer default overriding restoration. That production defect is fixed. The combined run then passes20/20,93.52s,zero skips/flaky, covering editor lifetime, Explorer, menus, commands and all five real Java workflows. Subsequent path-order regression is reproduced RED, then the three Picker cases pass3/3,8.53s. After readability/count polish, final Picker cases pass3/3,8.70s,zero skips/flaky. The manifest lists the five exact source/test paths changed after the20-case run; this is not a new full native/formal gate.

Seven final images and source/report hashes live in `picker-captures/`; root opened every original. Six are isolated production Picker fixtures at1440/760, one is actual JDT in the production Shell. Native tests prove all5,000 matches reachable with<30 mounted options, exact file activation, disabled reasons/no action, single click and double click activation counts, Tab/Shift+Tab, End/wrap, Close/Escape/backdrop focus, and actual server source position/content. Final isolated input-event-to-two-RAF values are recorded in the archive, each≤200ms; these do not include full-app5,000-file Editor/Explorer/WebGL cost. Whole A–G acceptance, Dense/memory, final visual/motion, legacy-browser migration and final exhaustive gates remain OPEN.

Focused integration passes108/108. Defaults pass **2118/2188 with70 explicit opt-in skips**,227files (220passed/seven skipped),180.99seconds,exit0 (`validation-picker-full-unit.log`): previous2108 plus eight symbol and two file cases; all16 moved originals remain. Build/typecheck, strict browser TS, lint and reference/protected guards pass. Main71761gzip bytes; entry/shell closures72189/664015 diagnostic bytes; Monaco/Cinematic stay split. Full production/test source hashes are unchanged from the final captures through validation. AST635modules/2196literal edges/244production reachable/zero superseded renderer targets. Native inventory134cases/45files; default226cases/65files, including92older cases. The20-case browser run includes six distinct actual JVM sessions; the final symbol case runs actual JDT, not a new JVM capture. Final isolated5,000-file query measurements are34.50ms/23.90ms at1440/760 respectively. No full native/formal/Dense/final visual acceptance is inferred.
