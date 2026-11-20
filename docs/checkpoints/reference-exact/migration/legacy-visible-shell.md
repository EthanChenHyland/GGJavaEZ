# Legacy visible shell removal

This bounded cleanup removes `src/app/App.tsx` and `src/ui/Inspector.tsx`.
It extracts the Inspector's pure `formatValue` into
`src/debugger/formatValue.ts` and changes only the corresponding imports in
`src/debugger/DebugPanel.tsx`, `src/debugger/ErrorExplorer.tsx`, and
`src/examples/ControlFlowStatus.tsx`. These seven paths are the complete
owned implementation change set; the lead integrates it with the Flow checkpoint.

## Dependency evidence

The production entry is `index.html` → `src/main.tsx` → `src/app/AppRoot.tsx`.
AppRoot mounts `Shell` for both the workspace and `/examples`; the examples
route supplies its recording through that same Shell. `Shell` retains the
debugger and Error Explorer. `WorldSurface` imports the current
`src/render/Inspector.tsx`, not the deleted Inspector.

Before editing, a TypeScript AST/module-resolution scan examined 604 tracked
JavaScript/TypeScript modules and 3,041 literal import, export, import-type,
and require references. No reference resolved to `src/app/App.tsx`.
The old Inspector had exactly four consumers: the dead App imported both
Inspector and formatValue; DebugPanel, ErrorExplorer, and ControlFlowStatus
imported only formatValue. The App's exported RuntimeNavigation and
EmbeddedExecution types had no consumers; active users import the existing
`src/shell/runtimeContracts.ts` definitions.

Repository-wide `rg` searches covered explicit App/Inspector paths, shorter
relative module specifiers, formatValue, those exported type names, and glob
loaders, including hidden configuration but excluding generated output,
dependencies, and Git internals. No `import.meta.glob` or `require.context`
loader exists in source, scripts, or checked test directories. The AST scan's
14 nonliteral dynamic imports were individually inspected: they target
instrumentation, trace generation, execution scheduling, camera/navigation,
interaction, world helpers, server instrumentation, or Fiber modules.
None selects either deleted view.

After editing, a second scan examined 603 remaining modules, including the
new formatter, and 3,011 literal module references. No relative import,
export, import-type, or require references either deleted path. Existing
historical documentation still mentions the removed modules; those records
were not rewritten outside this cleanup's authorized scope.

## Preserved semantics and boundaries

The entire exported formatter declaration was compared byte-for-byte with
`HEAD:src/ui/Inspector.tsx` and is identical. Its declaration SHA-256 is
`724f4d732a1e2eeb50c6023d6adfa6501ef145bc24b67a5ec308a5dac3edb85f`.
Unavailable reasons, uninitialized values, null, primitive/string JSON
formatting, and reference arrows retain exactly their existing behavior.
Known references display the recorded object's className and displayId;
missing objects retain the canonical objectId. No identity is parsed,
rewritten, inferred, or allocated. Existing caller-specific handling of
uninitialized values is unchanged.

The complete inherited AGENTS/spec/reference audit remains applicable; this
cleanup additionally consulted the implementation discipline, runtime
architecture, production route, and migration deletion requirements.
No runtime, world, contracts, renderer, CSS, tests, scripts, semantic
goldens, or shared validation report is edited. Legacy tested primitives
remain intact. This is a partial migration cleanup, not completion of the
broader legacy renderer/style deletion gate.

## Checks and remaining integration work

No root heavy check was running at the process snapshot before validation.
`npx eslint src/debugger/formatValue.ts src/debugger/DebugPanel.tsx
src/debugger/ErrorExplorer.tsx src/examples/ControlFlowStatus.tsx` passed
with exit 0. Static formatter equality and post-removal dependency checks
passed. `git diff --check` passed for the owned paths.

`npx tsc --project tsconfig.app.json --noEmit --incremental false --pretty
false` returned exit 2 with four errors in concurrently edited Flow files:

- `src/world/exceptionPanelPlacement.test.ts:50`: its FlowCatalog fixture
  lacks `prefix`.
- `src/world/flowTopology.ts:46`: FrameStatus is not narrowed before reading
  `returnValue`.
- `src/world/presentationPlanner.ts:271`: the flow bundle lacks `flowIds`.
- `src/world/presentationPlanner.ts:279`: the plan lacks `flowPresentation`.

No diagnostic named an owned cleanup file. The lead resolved all four shared
Flow contract errors before the integrated checks. The final application and
strict browser typechecks, broad source lint and production build pass. The
integrated default unit suite passes 1,950 tests with 70 opt-in skips in
162.45 seconds. The lead reviewed the removal/import diff and independently
confirmed the formatter declaration is byte-identical. Complete browser results
are recorded in the shared validation report after that run finishes.
