/** Workspace paths only. Recorded source manifests and runtime IDs never enter this module. */
export interface PathTab { path: string }
export interface PathBreakpoint { fileId: string; line: number }
export interface PathNavigation { path: string }

export interface WorkspacePathState<
  Tab extends PathTab = PathTab,
  Draft = unknown,
  Breakpoint extends PathBreakpoint = PathBreakpoint,
  Navigation extends PathNavigation = PathNavigation,
> {
  tabs: readonly Tab[]
  /** Includes persisted drafts for closed files. Values are retained verbatim. */
  drafts: Readonly<Record<string, Draft>>
  activePath: string | null
  /** Desired workspace breakpoints, not a running session's resolved breakpoints. */
  breakpoints: readonly Breakpoint[]
  /** null explicitly means a deleted working directory needs a new selection. */
  workingDirectory: string | null
  navigation: Navigation | null
}

export type WorkspacePathChange =
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'delete'; path: string }

export interface WorkspacePathTransition<
  Tab extends PathTab,
  Draft,
  Breakpoint extends PathBreakpoint,
  Navigation extends PathNavigation,
> {
  state: WorkspacePathState<Tab, Draft, Breakpoint, Navigation>
  affectedPaths: readonly string[]
  /** Returned for the host's explicit discard/recovery policy, never silently destroyed. */
  removedTabs: readonly Tab[]
  removedDrafts: Readonly<Record<string, Draft>>
  workingDirectoryDeleted: boolean
}

/** Canonical relative syntax, independent of native filesystem name/case rules. */
export function assertWorkspacePath(path: string): void {
  if (typeof path !== 'string' || !path || path.includes('\\') || path.includes(':') ||
    [...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
    path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid project-relative path: ${path}`)
  }
}

export function pathIsWithin(path: string, ancestor: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`)
}

export function renamedPath(path: string, from: string, to: string): string {
  assertWorkspacePath(from)
  assertWorkspacePath(to)
  return pathIsWithin(path, from) ? to + path.slice(from.length) : path
}

/**
 * Apply a committed filesystem change to workspace state, without mutating the input.
 * The host supplies the complete draft index and separately reconciles diagnostics,
 * models, language state, persistence, and session-aware recorded-source bindings.
 */
export function transitionWorkspacePaths<
  Tab extends PathTab,
  Draft,
  Breakpoint extends PathBreakpoint,
  Navigation extends PathNavigation,
>(state: WorkspacePathState<Tab, Draft, Breakpoint, Navigation>, change: WorkspacePathChange): WorkspacePathTransition<Tab, Draft, Breakpoint, Navigation> {
  const source = change.kind === 'rename' ? change.from : change.path
  assertWorkspacePath(source)
  if (change.kind === 'rename') {
    assertWorkspacePath(change.to)
    if (change.to !== source && pathIsWithin(change.to, source)) throw new Error('Cannot move an entry into itself')
  }
  const affected = (path: string) => pathIsWithin(path, source)
  const map = (path: string) => change.kind === 'rename' && affected(path) ? change.to + path.slice(source.length) : path
  const heldPaths = new Set([...state.tabs.map((tab) => tab.path), ...Object.keys(state.drafts)])
  if (change.kind === 'rename') {
    const destinations = new Map<string, string>()
    for (const path of heldPaths) {
      const destination = map(path)
      const previous = destinations.get(destination)
      if (previous !== undefined && previous !== path) throw new Error(`Workspace path collision: ${destination}`)
      destinations.set(destination, path)
    }
  }

  const removing = change.kind === 'delete'
  const removedTabs = removing ? state.tabs.filter((tab) => affected(tab.path)) : []
  const removedDrafts = Object.fromEntries(Object.entries(state.drafts).filter(([path]) => removing && affected(path)))
  const tabs = state.tabs.filter((tab) => !removing || !affected(tab.path)).map((tab) => {
    const path = map(tab.path)
    return path === tab.path ? tab : { ...tab, path }
  })
  const drafts = Object.fromEntries(Object.entries(state.drafts).filter(([path]) => !removing || !affected(path)).map(([path, draft]) => [map(path), draft]))
  const breakpoints = state.breakpoints.filter((point) => !removing || !affected(point.fileId)).map((point) => {
    const fileId = map(point.fileId)
    return fileId === point.fileId ? point : { ...point, fileId }
  })
  const workingDirectoryDeleted = removing && state.workingDirectory !== null && affected(state.workingDirectory)
  const navigation = state.navigation === null || removing && affected(state.navigation.path) ? null
    : map(state.navigation.path) === state.navigation.path ? state.navigation : { ...state.navigation, path: map(state.navigation.path) }
  const activePath = state.activePath === null ? null : removing && affected(state.activePath) ? tabs.at(-1)?.path ?? null : map(state.activePath)
  const affectedPaths = [...new Set([
    ...heldPaths, ...state.breakpoints.map((point) => point.fileId),
    ...(state.activePath === null ? [] : [state.activePath]),
    ...(state.workingDirectory === null ? [] : [state.workingDirectory]),
    ...(state.navigation === null ? [] : [state.navigation.path]),
  ].filter(affected))]
  return {
    state: { ...state, tabs, drafts, activePath, breakpoints, navigation,
      workingDirectory: workingDirectoryDeleted ? null : state.workingDirectory === null ? null : map(state.workingDirectory) },
    affectedPaths, removedTabs, removedDrafts, workingDirectoryDeleted,
  }
}
