# Reference reconstruction validation

## Shell integration checkpoint

The root and `/ide` routes now use the same full-viewport shell. `/examples` uses its recording-viewer composition. Header, source, time dock, inspector and drawers take their rectangles from `computeShellLayout` and the frozen v4 tokens. One runtime canvas survives project opening, execution publication and failed rebuilds.

Operational state has separate selector-based workspace, editor, execution, debug, timeline, interaction and shell stores. Save All attempts every open and closed draft before reporting failures; failed saves prevent launch. Previous committed ingest/history survives a new pending attempt until accepted normalized events publish the replacement. Project switch and unmount dispose every retained ingest.

Checks completed on 2026-10-08:

- Production build/typecheck passed. The interim application chunk remains oversized (1,035.78 kB gzip); Monaco separation remains required.
- Default unit gate: 1,499 passed, 63 opt-in skipped, 1,562 total across 121 files (115 passed, 6 skipped). These skips are not real-JVM validation.
- Focused shell/state/command/source-binding checks: 185 passed across seven files.
- Browser reconstruction checks: two passed. Five viewport rectangles match the shared layout; actual Java Run followed by invalid-source rebuild preserves the same canvas, recording, cursor and runtime identities.
- A separate actual Java execution produced captured output `AGE 18`, Completed status and exit code 0 without browser page errors.

Screenshots are local QA artifacts under `.ggjavaez/qa/reference-exact/`. Their review confirms the shell composition but identifies the legacy world spacing as a substantial remaining visual gap. This checkpoint does **not** approve reference convergence, the renderer, subsystem extraction, accessibility, performance or the final JVM/browser gates. The legacy renderer and compatibility tokens are interim dependencies to remove as reconstruction proceeds.
