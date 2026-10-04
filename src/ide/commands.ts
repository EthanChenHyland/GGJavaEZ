import type { DebugCommand } from '../debugger/contracts'
import type { ProjectFile, SourceLocation } from './contracts'
import { assertWorkspacePath, pathIsWithin } from './pathChanges'
import type { Shortcut } from './shortcuts'

export interface ResourceTarget { projectId: string; path: string; kind: 'file' | 'directory' }
export interface CommandContext {
  projectId: string
  /** Host increments on workspace replacement/resource identity changes, including path reuse. */
  workspaceGeneration: number
  /** Explicit menu targets take precedence over the active editor. */
  target?: ResourceTarget
}
export type CommandTab = ProjectFile & { draft: string }
export interface CommandClosedDraft { path: string; draft: string; revision: string; dirty: boolean }
export interface CommandSnapshot {
  projectId: string
  workspaceGeneration: number
  tabs: readonly CommandTab[]
  activePath: string | null
  resources: readonly ResourceTarget[]
  /** Complete persisted draft index for files which are not open in tabs. */
  closedDrafts: readonly CommandClosedDraft[]
  debugState: 'inactive' | 'starting' | 'running' | 'paused' | 'stopped'
  languageReady: boolean
  editorPath: string | null
}
export interface CommandArguments {
  'file.open': { location?: SourceLocation }
  'file.save': Record<string, never>
  'file.saveAll': Record<string, never>
  'editor.close': Record<string, never>
  'editor.closeOthers': Record<string, never>
  'editor.closeRight': Record<string, never>
  'editor.closeSaved': Record<string, never>
  'file.new': { path?: string; content?: string }
  'java.newClass': { path?: string }
  'folder.new': { path?: string }
  'resource.rename': { to?: string }
  'resource.delete': Record<string, never>
  'explorer.reveal': Record<string, never>
  'resource.copyPath': Record<string, never>
  'java.renameSymbol': { newName?: string }
  'debug.startOrContinue': Record<string, never>
  'debug.pause': Record<string, never>
  'debug.stepOver': Record<string, never>
  'debug.stepInto': Record<string, never>
  'debug.stepOut': Record<string, never>
  'debug.stop': Record<string, never>
  'workbench.quickOpen': Record<string, never>
  'workbench.commandPalette': Record<string, never>
}
export type IdeCommandId = keyof CommandArguments
export interface CommandDefinition {
  id: IdeCommandId
  title: string
  category: 'File' | 'Editor' | 'Java' | 'Debug' | 'Workbench'
  scope: 'workspace' | 'editor'
  bindings: readonly Shortcut[]
}
export type CommandAvailability = { enabled: true } | { enabled: false; reason: string }
export type CommandResult = { status: 'completed' | 'cancelled'; paths: readonly string[] }
export type DirtyDecision = 'save' | 'discard' | 'cancel'
export interface ClosePlan {
  context: CommandContext
  paths: readonly string[]
  discardPaths: readonly string[]
  expectedTabs: readonly CommandTab[]
}
export interface DeletePlan {
  context: CommandContext
  target: ResourceTarget
  dirtyPaths: readonly string[]
  expectedTabs: readonly CommandTab[]
  expectedClosedDrafts: readonly CommandClosedDraft[]
  decision: Exclude<DirtyDecision, 'cancel'>
}
export interface CommandOperations {
  open(target: ResourceTarget, location: SourceLocation | undefined, context: CommandContext): Promise<void>
  /** Compare original revision and captured draft before writing; report conflicts without discarding. */
  save(target: ResourceTarget, expected: CommandTab, context: CommandContext): Promise<void>
  /** Includes closed drafts and original revisions. No silent overwrite on conflicts. */
  saveAll(context: CommandContext): Promise<void>
  /** Synchronous validated commit: close all paths and discard requested drafts together. */
  close(plan: ClosePlan): void
  createFile(projectId: string, path: string, content: string, context: CommandContext): Promise<void>
  createJavaClass(projectId: string, path: string, context: CommandContext): Promise<void>
  createFolder(projectId: string, path: string, context: CommandContext): Promise<void>
  /** Owns filesystem receipt, draft preservation, persistence and reconciliation. Never symbol rename. */
  rename(target: ResourceTarget, to: string, context: CommandContext): Promise<void>
  /** Owns save/discard + filesystem deletion, including version checks for closed drafts. */
  delete(plan: DeletePlan): Promise<void>
  reveal(target: ResourceTarget, context: CommandContext): Promise<void>
  copyText(text: string, context: CommandContext): Promise<void>
  renameSymbol(target: ResourceTarget, newName: string | undefined, context: CommandContext): Promise<void>
  startDebug(context: CommandContext): Promise<void>
  debug(command: DebugCommand, context: CommandContext): Promise<void>
  quickOpen(context: CommandContext): Promise<void>
  commandPalette(context: CommandContext): Promise<void>
}
export interface IdeCommandHost {
  snapshot(): CommandSnapshot
  /** Async adapters revalidate context after their own awaits and before committing effects. */
  operations: Partial<CommandOperations>
  prompts: {
    path?(request: { command: 'file.new' | 'java.newClass' | 'folder.new' | 'resource.rename'; context: CommandContext; initialPath: string }): Promise<string | null>
    dirty?(request: { command: IdeCommandId; context: CommandContext; paths: readonly string[]; dirtyPaths: readonly string[] }): Promise<DirtyDecision>
    /** One delete prompt also handles dirty open and closed files. */
    delete?(request: { context: CommandContext; target: ResourceTarget; dirtyPaths: readonly string[] }): Promise<DirtyDecision>
  }
}

const definition = (id: IdeCommandId, title: string, category: CommandDefinition['category'], bindings: readonly Shortcut[] = [], scope: CommandDefinition['scope'] = 'workspace'): CommandDefinition =>
  Object.freeze({ id, title, category, scope, bindings: Object.freeze(bindings.map((binding) => Object.freeze({ ...binding }))) })

export const ideCommandDefinitions: Readonly<Record<IdeCommandId, CommandDefinition>> = Object.freeze({
  'file.open': definition('file.open', 'Open', 'File'),
  'file.save': definition('file.save', 'Save', 'File', [{ code: 'KeyS', primary: true }]),
  'file.saveAll': definition('file.saveAll', 'Save All', 'File', [{ code: 'KeyS', primary: true, shift: true }]),
  'editor.close': definition('editor.close', 'Close', 'Editor'),
  'editor.closeOthers': definition('editor.closeOthers', 'Close Others', 'Editor'),
  'editor.closeRight': definition('editor.closeRight', 'Close to Right', 'Editor'),
  'editor.closeSaved': definition('editor.closeSaved', 'Close Saved', 'Editor'),
  'file.new': definition('file.new', 'New File', 'File'),
  'java.newClass': definition('java.newClass', 'New Java Class', 'Java'),
  'folder.new': definition('folder.new', 'New Folder', 'File'),
  'resource.rename': definition('resource.rename', 'Rename File/Folder', 'File'),
  'resource.delete': definition('resource.delete', 'Delete', 'File'),
  'explorer.reveal': definition('explorer.reveal', 'Reveal in Explorer', 'File'),
  'resource.copyPath': definition('resource.copyPath', 'Copy Path', 'File'),
  'java.renameSymbol': definition('java.renameSymbol', 'Rename Symbol', 'Java', [{ code: 'F2' }], 'editor'),
  'debug.startOrContinue': definition('debug.startOrContinue', 'Start/Continue Debug', 'Debug', [{ code: 'F5' }]),
  'debug.pause': definition('debug.pause', 'Pause Debug', 'Debug'),
  'debug.stepOver': definition('debug.stepOver', 'Step Over', 'Debug', [{ code: 'F10' }]),
  'debug.stepInto': definition('debug.stepInto', 'Step Into', 'Debug', [{ code: 'F11' }]),
  'debug.stepOut': definition('debug.stepOut', 'Step Out', 'Debug', [{ code: 'F11', shift: true }]),
  'debug.stop': definition('debug.stop', 'Stop Debug', 'Debug', [{ code: 'F5', shift: true }]),
  'workbench.quickOpen': definition('workbench.quickOpen', 'Quick Open', 'Workbench', [{ code: 'KeyP', primary: true }]),
  'workbench.commandPalette': definition('workbench.commandPalette', 'Command Palette', 'Workbench', [{ code: 'KeyP', primary: true, shift: true }]),
})

export class CommandUnavailable extends Error {
  constructor(message: string) { super(message); this.name = 'CommandUnavailable' }
}
const dirty = (tab: CommandTab) => tab.draft !== tab.content
const completed = (paths: readonly string[] = []): CommandResult => ({ status: 'completed', paths })
const cancelled = (): CommandResult => ({ status: 'cancelled', paths: [] })
const sameTab = (a: CommandTab, b: CommandTab) => a.path === b.path && a.draft === b.draft && a.content === b.content && a.revision === b.revision
const checkedDecision = (decision: DirtyDecision): DirtyDecision => {
  if (!['save', 'discard', 'cancel'].includes(decision)) throw new CommandUnavailable('Invalid unsaved-changes decision')
  return decision
}

/** No UI, DOM, persistence, filesystem, or runtime-state ownership. */
export function createIdeCommandService(host: IdeCommandHost) {
  let queue: Promise<void> = Promise.resolve()
  const guard = (context: CommandContext): CommandSnapshot => {
    const state = host.snapshot()
    if (!context.projectId || state.projectId !== context.projectId || state.workspaceGeneration !== context.workspaceGeneration) throw new CommandUnavailable('Command belongs to an older workspace')
    if (context.target) {
      const target = context.target
      assertWorkspacePath(target.path)
      if (target.projectId !== context.projectId || !state.resources.some((entry) => entry.projectId === target.projectId && entry.path === target.path && entry.kind === target.kind)) throw new CommandUnavailable('Command target is stale or belongs to another project')
    }
    return state
  }
  const targetFile = (context: CommandContext, state: CommandSnapshot, activeFallback: boolean): ResourceTarget => {
    const target = context.target ?? (activeFallback && state.activePath ? { projectId: context.projectId, path: state.activePath, kind: 'file' as const } : undefined)
    if (!target || target.kind !== 'file' || !state.resources.some((entry) => entry.projectId === context.projectId && entry.path === target.path && entry.kind === 'file')) throw new CommandUnavailable('A project file target is required')
    return target
  }
  const targetTab = (context: CommandContext, state: CommandSnapshot): CommandTab => {
    const target = targetFile(context, state, true)
    const tab = state.tabs.find((item) => item.path === target.path)
    if (!tab) throw new CommandUnavailable('An open editor target is required')
    return tab
  }
  const resource = (context: CommandContext): ResourceTarget => {
    if (!context.target) throw new CommandUnavailable('An explicit resource target is required')
    return context.target
  }
  const operation = (id: IdeCommandId, state: CommandSnapshot): keyof CommandOperations => {
    if (id.startsWith('editor.')) return 'close'
    if (id.startsWith('debug.')) return id === 'debug.startOrContinue' && state.debugState !== 'paused' ? 'startDebug' : 'debug'
    const names = { 'file.open': 'open', 'file.save': 'save', 'file.saveAll': 'saveAll', 'file.new': 'createFile', 'java.newClass': 'createJavaClass', 'folder.new': 'createFolder', 'resource.rename': 'rename', 'resource.delete': 'delete', 'explorer.reveal': 'reveal', 'resource.copyPath': 'copyText', 'java.renameSymbol': 'renameSymbol', 'workbench.quickOpen': 'quickOpen', 'workbench.commandPalette': 'commandPalette' } as const
    return names[id as keyof typeof names]
  }
  const requireAvailable = (id: IdeCommandId, context: CommandContext) => {
    const state = guard(context)
    if (!host.operations[operation(id, state)]) throw new CommandUnavailable('Command operation is not connected')
    if (id === 'file.open') targetFile(context, state, false)
    if (id === 'file.save' || id.startsWith('editor.') && id !== 'editor.closeSaved') targetTab(context, state)
    if (['resource.rename', 'resource.delete', 'explorer.reveal', 'resource.copyPath'].includes(id)) resource(context)
    if (['file.new', 'java.newClass', 'folder.new'].includes(id) && context.target?.kind === 'file') throw new CommandUnavailable('Creation requires a folder target or project root')
    if (id === 'java.renameSymbol') {
      const target = targetFile(context, state, true)
      if (!target.path.endsWith('.java') || state.editorPath !== target.path || !state.languageReady) throw new CommandUnavailable('Rename Symbol requires the current Java editor and ready language service')
    }
    if (['debug.stepOver', 'debug.stepInto', 'debug.stepOut'].includes(id) && state.debugState !== 'paused') throw new CommandUnavailable('Stepping requires a paused debugger')
    if (id === 'debug.startOrContinue' && !['inactive', 'stopped', 'paused'].includes(state.debugState)) throw new CommandUnavailable('Debugger is already starting or running')
    if (id === 'debug.pause' && state.debugState !== 'running') throw new CommandUnavailable('Pause requires a running debugger')
    if (id === 'debug.stop' && !['starting', 'running', 'paused'].includes(state.debugState)) throw new CommandUnavailable('There is no active debugger')
    return state
  }
  const unchangedTabs = (context: CommandContext, expected: readonly CommandTab[]) => {
    const state = guard(context)
    for (const tab of expected) {
      const current = state.tabs.find((item) => item.path === tab.path)
      if (!current || !sameTab(current, tab)) throw new CommandUnavailable(`Editor changed while preparing command: ${tab.path}`)
    }
    return state
  }
  const closeEditors = async (id: IdeCommandId, context: CommandContext, initial: CommandSnapshot): Promise<CommandResult> => {
    const target = id === 'editor.closeSaved' ? undefined : targetTab(context, initial)
    const index = target ? initial.tabs.findIndex((tab) => tab.path === target.path) : -1
    const selected = initial.tabs.filter((tab, tabIndex) => id === 'editor.closeSaved' ? !dirty(tab) : id === 'editor.close' ? tab.path === target!.path : id === 'editor.closeOthers' ? tab.path !== target!.path : tabIndex > index)
      .map((tab) => ({ ...tab }))
    if (!selected.length) return completed()
    const paths = selected.map((tab) => tab.path), dirtyPaths = selected.filter(dirty).map((tab) => tab.path)
    let decision: DirtyDecision = 'discard'
    if (dirtyPaths.length) {
      if (!host.prompts.dirty) throw new CommandUnavailable('An unsaved-changes prompt is required')
      decision = checkedDecision(await host.prompts.dirty({ command: id, context, paths, dirtyPaths }))
      if (decision === 'cancel') return cancelled()
    }
    requireAvailable(id, context)
    unchangedTabs(context, selected)
    const expected = [...selected]
    if (decision === 'save') {
      if (!host.operations.save) throw new CommandUnavailable('Save operation is not connected')
      for (const tab of selected.filter(dirty)) {
        unchangedTabs(context, expected)
        await host.operations.save({ projectId: context.projectId, path: tab.path, kind: 'file' }, tab, context)
        const current = guard(context).tabs.find((item) => item.path === tab.path)
        if (!current || dirty(current) || current.draft !== tab.draft) throw new CommandUnavailable(`Editor changed while saving: ${tab.path}`)
        expected[expected.findIndex((item) => item.path === tab.path)] = { ...current }
      }
    }
    requireAvailable(id, context)
    unchangedTabs(context, expected)
    // The host validates and commits once. No tab closes while prompts/saves are pending.
    host.operations.close!({ context, paths, discardPaths: decision === 'discard' ? dirtyPaths : [], expectedTabs: expected })
    return completed(paths)
  }
  const run = async <K extends IdeCommandId>(id: K, context: CommandContext, args: CommandArguments[K]): Promise<CommandResult> => {
    const live = requireAvailable(id, context), ops = host.operations
    const initial: CommandSnapshot = { ...live, tabs: live.tabs.map((tab) => ({ ...tab })), resources: live.resources.map((entry) => ({ ...entry })), closedDrafts: live.closedDrafts.map((draft) => ({ ...draft })) }
    if (id.startsWith('editor.')) return closeEditors(id, context, initial)
    if (id === 'file.open') {
      const target = targetFile(context, initial, false), location = (args as CommandArguments['file.open']).location
      if (location && location.path !== target.path) throw new CommandUnavailable('Navigation location does not match the command target')
      await ops.open!(target, location, context)
      return completed([target.path])
    }
    if (id === 'file.save') {
      const tab = targetTab(context, initial)
      if (dirty(tab)) await ops.save!(targetFile(context, initial, true), { ...tab }, context)
      return completed([tab.path])
    }
    if (id === 'file.saveAll') { await ops.saveAll!(context); return completed() }
    if (id === 'file.new' || id === 'java.newClass' || id === 'folder.new' || id === 'resource.rename') {
      const renameTarget = id === 'resource.rename' ? resource(context) : undefined
      let path = id === 'resource.rename' ? (args as CommandArguments['resource.rename']).to : (args as CommandArguments['file.new']).path
      if (path === undefined) {
        if (!host.prompts.path) throw new CommandUnavailable('A path prompt is required')
        const name = id === 'java.newClass' ? 'NewClass.java' : id === 'folder.new' ? 'new-folder' : 'new-file.txt'
        const initialPath = renameTarget?.path ?? (context.target ? `${context.target.path}/${name}` : name)
        const answer = await host.prompts.path({ command: id, context, initialPath })
        if (answer === null) return cancelled()
        path = answer
      }
      assertWorkspacePath(path)
      requireAvailable(id, context)
      if (renameTarget) {
        if (path === renameTarget.path) return completed([path])
        if (renameTarget.kind === 'directory' && pathIsWithin(path, renameTarget.path)) throw new CommandUnavailable('Cannot move a folder into itself')
        await ops.rename!(renameTarget, path, context)
      } else {
        if (context.target && path.split('/').slice(0, -1).join('/') !== context.target.path) throw new CommandUnavailable('Destination must be a child of the selected folder')
        if (id === 'file.new') await ops.createFile!(context.projectId, path, (args as CommandArguments['file.new']).content ?? '', context)
        else if (id === 'java.newClass') await ops.createJavaClass!(context.projectId, path, context)
        else await ops.createFolder!(context.projectId, path, context)
      }
      return completed([path])
    }
    if (id === 'resource.delete') {
      const target = resource(context)
      const expectedTabs = initial.tabs.filter((tab) => pathIsWithin(tab.path, target.path))
      const expectedClosedDrafts = initial.closedDrafts.filter((draft) => pathIsWithin(draft.path, target.path))
      const dirtyPaths = [...new Set([...expectedTabs.filter(dirty).map((tab) => tab.path), ...expectedClosedDrafts.filter((draft) => draft.dirty).map((draft) => draft.path)])]
      if (!host.prompts.delete) throw new CommandUnavailable('A delete confirmation is required')
      const decision = checkedDecision(await host.prompts.delete({ context, target, dirtyPaths }))
      if (decision === 'cancel') return cancelled()
      requireAvailable(id, context)
      unchangedTabs(context, expectedTabs)
      const current = guard(context)
      const currentClosed = current.closedDrafts.filter((draft) => pathIsWithin(draft.path, target.path))
      if (currentClosed.length !== expectedClosedDrafts.length || expectedClosedDrafts.some((draft) => !currentClosed.some((item) => item.path === draft.path && item.draft === draft.draft && item.revision === draft.revision && item.dirty === draft.dirty))) throw new CommandUnavailable('Closed drafts changed while confirming deletion')
      const currentDirty = [...new Set([...current.tabs.filter(dirty).map((tab) => tab.path), ...currentClosed.filter((draft) => draft.dirty).map((draft) => draft.path)].filter((path) => pathIsWithin(path, target.path)))]
      if (currentDirty.length !== dirtyPaths.length || currentDirty.some((path) => !dirtyPaths.includes(path))) throw new CommandUnavailable('Dirty files changed while confirming deletion')
      await ops.delete!({ context, target, dirtyPaths, decision, expectedTabs, expectedClosedDrafts })
      return completed([target.path])
    }
    if (id === 'explorer.reveal') { const target = resource(context); await ops.reveal!(target, context); return completed([target.path]) }
    if (id === 'resource.copyPath') { const target = resource(context); await ops.copyText!(target.path, context); return completed([target.path]) }
    if (id === 'java.renameSymbol') { const target = targetFile(context, initial, true); await ops.renameSymbol!(target, (args as CommandArguments['java.renameSymbol']).newName, context); return completed([target.path]) }
    if (id === 'debug.startOrContinue') { if (initial.debugState === 'paused') await ops.debug!('continue', context); else await ops.startDebug!(context); return completed() }
    if (id.startsWith('debug.')) {
      const command = { 'debug.pause': 'pause', 'debug.stepOver': 'stepOver', 'debug.stepInto': 'stepInto', 'debug.stepOut': 'stepOut', 'debug.stop': 'stop' } as const
      await ops.debug!(command[id as keyof typeof command], context)
      return completed()
    }
    if (id === 'workbench.quickOpen') await ops.quickOpen!(context)
    else if (id === 'workbench.commandPalette') await ops.commandPalette!(context)
    return completed()
  }
  return {
    definitions: ideCommandDefinitions,
    availability(id: IdeCommandId, context: CommandContext): CommandAvailability {
      try { requireAvailable(id, context); return { enabled: true } }
      catch (error) { return { enabled: false, reason: error instanceof Error ? error.message : String(error) } }
    },
    execute<K extends IdeCommandId>(id: K, context: CommandContext, args: CommandArguments[K]): Promise<CommandResult> {
      try {
        const state = requireAvailable(id, context)
        const fallback = !context.target && (id === 'file.save' || id.startsWith('editor.') && id !== 'editor.closeSaved' || id === 'java.renameSymbol') ? targetFile(context, state, true) : undefined
        const target = context.target ?? fallback
        const capturedContext = { ...context, ...(target ? { target: { ...target } } : {}) }
        const capturedArgs = structuredClone(args)
        const result = queue.then(() => run(id, capturedContext, capturedArgs))
        queue = result.then(() => {}, () => {})
        return result
      } catch (error) { return Promise.reject(error) }
    },
  }
}
