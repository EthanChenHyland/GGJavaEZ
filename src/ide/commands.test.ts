import { describe, expect, it, vi } from 'vitest'
import { createIdeCommandService, ideCommandDefinitions, type CommandContext, type CommandOperations, type CommandSnapshot, type CommandTab, type DirtyDecision, type IdeCommandHost, type ResourceTarget } from './commands'

const tab = (path: string, changed = false): CommandTab => ({ path, content: `${path}:saved`, draft: `${path}:${changed ? 'draft' : 'saved'}`, revision: `${path}:revision` })
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function fixture() {
  let state: CommandSnapshot = {
    projectId: 'project', workspaceGeneration: 1,
    tabs: [tab('a/A.java'), tab('a/B.java', true), tab('b/C.java', true)],
    activePath: 'a/A.java',
    resources: [
      ...['a', 'b'].map((path): ResourceTarget => ({ projectId: 'project', path, kind: 'directory' })),
      ...['a/A.java', 'a/B.java', 'a/Closed.java', 'b/C.java'].map((path): ResourceTarget => ({ projectId: 'project', path, kind: 'file' })),
    ],
    closedDrafts: [{ path: 'a/Closed.java', draft: 'closed dirty content', revision: 'original revision', dirty: true }],
    debugState: 'inactive', languageReady: true, editorPath: 'a/A.java',
  }
  const save = async (target: ResourceTarget, expected: CommandTab) => {
    const current = state.tabs.find((item) => item.path === target.path)
    if (!current || current.draft !== expected.draft || current.revision !== expected.revision) throw new Error('Save conflict')
    state = { ...state, tabs: state.tabs.map((item) => item.path === target.path ? { ...item, content: expected.draft, revision: `${expected.revision}:saved` } : item) }
  }
  const operations = {
    open: vi.fn<CommandOperations['open']>(async () => {}),
    save: vi.fn<CommandOperations['save']>(save),
    saveAll: vi.fn<CommandOperations['saveAll']>(async () => {}),
    close: vi.fn<CommandOperations['close']>((plan) => {
      state = { ...state, tabs: state.tabs.filter((item) => !plan.paths.includes(item.path)) }
    }),
    createFile: vi.fn<CommandOperations['createFile']>(async () => {}),
    createJavaClass: vi.fn<CommandOperations['createJavaClass']>(async () => {}),
    createFolder: vi.fn<CommandOperations['createFolder']>(async () => {}),
    rename: vi.fn<CommandOperations['rename']>(async () => {}),
    delete: vi.fn<CommandOperations['delete']>(async () => {}),
    reveal: vi.fn<CommandOperations['reveal']>(async () => {}),
    copyText: vi.fn<CommandOperations['copyText']>(async () => {}),
    renameSymbol: vi.fn<CommandOperations['renameSymbol']>(async () => {}),
    startDebug: vi.fn<CommandOperations['startDebug']>(async () => {}),
    debug: vi.fn<CommandOperations['debug']>(async () => {}),
    quickOpen: vi.fn<CommandOperations['quickOpen']>(async () => {}),
    commandPalette: vi.fn<CommandOperations['commandPalette']>(async () => {}),
  }
  const prompts = {
    path: vi.fn<NonNullable<IdeCommandHost['prompts']['path']>>(async () => null),
    dirty: vi.fn<NonNullable<IdeCommandHost['prompts']['dirty']>>(async () => 'cancel'),
    delete: vi.fn<NonNullable<IdeCommandHost['prompts']['delete']>>(async () => 'cancel'),
  }
  const host: IdeCommandHost = { snapshot: () => state, operations, prompts }
  const service = createIdeCommandService(host)
  return {
    host, operations, prompts, service, applySave: save,
    get state() { return state },
    set(next: Partial<CommandSnapshot>) { state = { ...state, ...next } },
    context(path?: string): CommandContext {
      return { projectId: state.projectId, workspaceGeneration: state.workspaceGeneration,
        ...(path ? { target: { ...(state.resources.find((item) => item.path === path) ?? { projectId: state.projectId, path, kind: 'file' as const }) } } : {}) }
    },
  }
}

describe('canonical command definitions and target enforcement', () => {
  it('defines file, editor, resource, language, debugger and palette actions once', () => {
    expect(Object.keys(ideCommandDefinitions)).toEqual([
      'file.open', 'file.save', 'file.saveAll', 'editor.close', 'editor.closeOthers', 'editor.closeRight', 'editor.closeSaved',
      'file.new', 'java.newClass', 'folder.new', 'resource.rename', 'resource.delete', 'explorer.reveal', 'resource.copyPath', 'java.renameSymbol',
      'debug.startOrContinue', 'debug.pause', 'debug.stepOver', 'debug.stepInto', 'debug.stepOut', 'debug.stop', 'workbench.quickOpen', 'workbench.commandPalette',
      'execution.run', 'execution.runWithoutVisualization', 'execution.build', 'execution.stop',
      'workbench.explorer', 'workbench.source', 'workbench.edit', 'workbench.tools', 'workbench.console', 'workbench.problems', 'workbench.debugger',
      'workbench.inspector', 'workbench.runtimeFocus', 'workbench.returnLive', 'workbench.launch', 'workbench.symbols', 'workbench.jdk',
      'workbench.restartJava', 'workbench.importProject', 'workbench.newProject',
    ])
    expect(ideCommandDefinitions['java.renameSymbol']).toMatchObject({ scope: 'editor', bindings: [{ code: 'F2' }] })
    expect(ideCommandDefinitions['resource.rename'].bindings).toEqual([])
    expect(ideCommandDefinitions['debug.stepOut'].bindings).toEqual([{ code: 'F11', shift: true }])
    expect(ideCommandDefinitions['workbench.quickOpen'].bindings).toEqual([{ code: 'KeyP', primary: true }])
    expect(ideCommandDefinitions['workbench.commandPalette'].bindings).toEqual([{ code: 'KeyP', primary: true, shift: true }])
    expect(Object.isFrozen(ideCommandDefinitions)).toBe(true)
  })
  it('saves the explicit inactive tab rather than the active editor', async () => {
    const f = fixture()
    await f.service.execute('file.save', f.context('a/B.java'), {})
    expect(f.operations.save).toHaveBeenCalledWith(f.context('a/B.java').target, tab('a/B.java', true), expect.any(Object))
    expect(f.state.tabs[0]).toEqual(tab('a/A.java'))
    expect(f.state.activePath).toBe('a/A.java')
  })
  it('delegates Save All once to the complete open/closed draft owner', async () => {
    const f = fixture()
    await f.service.execute('file.saveAll', f.context(), {})
    expect(f.operations.saveAll).toHaveBeenCalledOnce()
    expect(f.operations.save).not.toHaveBeenCalled()
    expect(f.state.closedDrafts[0].draft).toBe('closed dirty content')
  })
  it('rejects foreign, stale, nonexistent and wrong-kind context targets before side effects', async () => {
    const f = fixture()
    const contexts: CommandContext[] = [
      { ...f.context('a/B.java'), projectId: 'foreign' },
      { ...f.context('a/B.java'), workspaceGeneration: 0 },
      { ...f.context(), target: { projectId: 'foreign', path: 'a/B.java', kind: 'file' } },
      f.context('missing.java'),
      { ...f.context(), target: { projectId: 'project', path: 'a/B.java', kind: 'directory' } },
    ]
    for (const context of contexts) {
      expect(f.service.availability('file.open', context).enabled).toBe(false)
      await expect(f.service.execute('file.open', context, {})).rejects.toThrow()
    }
    expect(f.operations.open).not.toHaveBeenCalled()
  })
  it('requires explicit resource targets and a matching source navigation location', async () => {
    const f = fixture()
    await expect(f.service.execute('resource.rename', f.context(), { to: 'a/New.java' })).rejects.toThrow('explicit resource')
    await expect(f.service.execute('file.open', f.context(), {})).rejects.toThrow('file target')
    await expect(f.service.execute('file.open', f.context('a/A.java'), { location: { path: 'b/C.java', line: 1, column: 1 } })).rejects.toThrow('does not match')
    expect(f.operations.rename).not.toHaveBeenCalled()
    expect(f.operations.open).not.toHaveBeenCalled()
  })
  it('rejects disconnected operations through availability and execution', async () => {
    const f = fixture()
    delete f.host.operations.quickOpen
    expect(f.service.availability('workbench.quickOpen', f.context())).toEqual({ enabled: false, reason: 'Command operation is not connected' })
    await expect(f.service.execute('workbench.quickOpen', f.context(), {})).rejects.toThrow('not connected')
  })
})

describe('bulk editor close transactions', () => {
  it.each(['editor.closeOthers', 'editor.closeRight'] as const)('%s cancellation closes and discards nothing', async (id) => {
    const f = fixture(), before = structuredClone(f.state)
    const result = await f.service.execute(id, f.context('a/B.java'), {})
    expect(result).toEqual({ status: 'cancelled', paths: [] })
    expect(f.operations.close).not.toHaveBeenCalled()
    expect(f.operations.save).not.toHaveBeenCalled()
    expect(f.state).toEqual(before)
  })
  it('closes all selected paths in one commit after a discard decision', async () => {
    const f = fixture()
    f.prompts.dirty.mockResolvedValue('discard')
    await f.service.execute('editor.closeOthers', f.context('a/B.java'), {})
    expect(f.operations.close).toHaveBeenCalledOnce()
    expect(f.operations.close.mock.calls[0][0]).toMatchObject({ paths: ['a/A.java', 'b/C.java'], discardPaths: ['b/C.java'] })
    expect(f.state.tabs.map((item) => item.path)).toEqual(['a/B.java'])
    expect(f.state.closedDrafts).toHaveLength(1)
  })
  it('uses the clicked tab position for Close to Right without closing left tabs', async () => {
    const f = fixture()
    f.prompts.dirty.mockResolvedValue('save')
    await f.service.execute('editor.closeRight', f.context('a/B.java'), {})
    expect(f.operations.save.mock.calls.map(([target]) => target.path)).toEqual(['b/C.java'])
    expect(f.operations.close.mock.calls[0][0]).toMatchObject({ paths: ['b/C.java'], discardPaths: [] })
    expect(f.state.tabs.map((item) => item.path)).toEqual(['a/A.java', 'a/B.java'])
  })
  it('closes saved tabs without prompting, saving, or discarding dirty tabs/drafts', async () => {
    const f = fixture()
    const beforeDirty = f.state.tabs.filter((item) => item.draft !== item.content), beforeClosed = f.state.closedDrafts
    await f.service.execute('editor.closeSaved', f.context(), {})
    expect(f.operations.close.mock.calls[0][0]).toMatchObject({ paths: ['a/A.java'], discardPaths: [] })
    expect(f.state.tabs).toEqual(beforeDirty)
    expect(f.state.closedDrafts).toBe(beforeClosed)
    expect(f.prompts.dirty).not.toHaveBeenCalled()
    expect(f.operations.save).not.toHaveBeenCalled()
  })
  it('closes nothing when a later save fails; completed saves are not falsely rolled back', async () => {
    const f = fixture()
    f.prompts.dirty.mockResolvedValue('save')
    f.operations.save.mockImplementation(async (target, expected) => {
      if (target.path === 'b/C.java') throw new Error('Disk revision conflict')
      await f.applySave(target, expected)
    })
    await expect(f.service.execute('editor.closeOthers', f.context('a/A.java'), {})).rejects.toThrow('Disk revision conflict')
    expect(f.operations.close).not.toHaveBeenCalled()
    expect(f.state.tabs).toHaveLength(3)
    expect(f.state.tabs[1].content).toBe(f.state.tabs[1].draft)
    expect(f.state.tabs[2].content).not.toBe(f.state.tabs[2].draft)
  })
  it('rejects a draft edit made while an unsaved-changes prompt is pending', async () => {
    const f = fixture(), started = deferred<void>(), answer = deferred<DirtyDecision>()
    f.prompts.dirty.mockImplementation(async () => { started.resolve(); return answer.promise })
    const closing = f.service.execute('editor.closeRight', f.context('a/B.java'), {})
    await started.promise
    f.set({ tabs: f.state.tabs.map((item) => item.path === 'b/C.java' ? { ...item, draft: 'newer text' } : item) })
    answer.resolve('discard')
    await expect(closing).rejects.toThrow('Editor changed')
    expect(f.operations.close).not.toHaveBeenCalled()
    expect(f.state.tabs[2].draft).toBe('newer text')
  })
  it('rejects a project change while confirming close', async () => {
    const f = fixture(), started = deferred<void>(), answer = deferred<DirtyDecision>()
    f.prompts.dirty.mockImplementation(async () => { started.resolve(); return answer.promise })
    const closing = f.service.execute('editor.close', f.context('a/B.java'), {})
    await started.promise
    f.set({ projectId: 'different-project', workspaceGeneration: 2 })
    answer.resolve('discard')
    await expect(closing).rejects.toThrow('older workspace')
    expect(f.operations.close).not.toHaveBeenCalled()
  })
  it('captures an active fallback at invocation rather than following later active-tab changes', async () => {
    const f = fixture()
    f.set({ activePath: 'a/B.java' })
    const started = deferred<void>(), answer = deferred<DirtyDecision>()
    f.prompts.dirty.mockImplementation(async () => { started.resolve(); return answer.promise })
    const closing = f.service.execute('editor.close', f.context(), {})
    await started.promise
    f.set({ activePath: 'b/C.java' })
    answer.resolve('discard')
    await closing
    expect(f.operations.close.mock.calls[0][0].paths).toEqual(['a/B.java'])
    expect(f.state.tabs.map((item) => item.path)).toContain('b/C.java')
  })
  it('rejects a new edit during save before committing any close', async () => {
    const f = fixture()
    f.prompts.dirty.mockResolvedValue('save')
    f.operations.save.mockImplementation(async (target, expected) => {
      await f.applySave(target, expected)
      f.set({ tabs: f.state.tabs.map((item) => item.path === target.path ? { ...item, draft: 'typed during save' } : item) })
    })
    await expect(f.service.execute('editor.closeRight', f.context('a/B.java'), {})).rejects.toThrow('while saving')
    expect(f.operations.close).not.toHaveBeenCalled()
  })
  it('treats a rightmost target as a no-op', async () => {
    const f = fixture()
    expect(await f.service.execute('editor.closeRight', f.context('b/C.java'), {})).toEqual({ status: 'completed', paths: [] })
    expect(f.operations.close).not.toHaveBeenCalled()
  })
})

describe('resource commands with injected operations and prompts', () => {
  it('renames a dirty file without saving or symbol edits and preserves its draft', async () => {
    const f = fixture(), before = structuredClone(f.state)
    await f.service.execute('resource.rename', f.context('a/B.java'), { to: 'a/Renamed.java' })
    expect(f.operations.rename).toHaveBeenCalledWith(f.context('a/B.java').target, 'a/Renamed.java', expect.any(Object))
    expect(f.operations.save).not.toHaveBeenCalled()
    expect(f.operations.renameSymbol).not.toHaveBeenCalled()
    expect(f.state).toEqual(before)
  })
  it('does not apply a cancelled rename or a stale rename prompt', async () => {
    const f = fixture()
    expect(await f.service.execute('resource.rename', f.context('a/B.java'), {})).toEqual({ status: 'cancelled', paths: [] })
    f.prompts.path.mockImplementation(async () => { f.set({ workspaceGeneration: 2 }); return 'a/New.java' })
    await expect(f.service.execute('resource.rename', f.context('a/B.java'), {})).rejects.toThrow('older workspace')
    expect(f.operations.rename).not.toHaveBeenCalled()
  })
  it('validates destinations, no-op rename and a folder move into itself', async () => {
    const f = fixture()
    await expect(f.service.execute('resource.rename', f.context('a/B.java'), { to: '../escape' })).rejects.toThrow('Invalid project-relative path')
    await expect(f.service.execute('resource.rename', f.context('a'), { to: 'a/nested' })).rejects.toThrow('into itself')
    expect(await f.service.execute('resource.rename', f.context('a/B.java'), { to: 'a/B.java' })).toEqual({ status: 'completed', paths: ['a/B.java'] })
    expect(f.operations.rename).not.toHaveBeenCalled()
  })
  it('propagates filesystem conflicts without pretending the move succeeded', async () => {
    const f = fixture()
    f.operations.rename.mockRejectedValue(new Error('Destination already exists'))
    await expect(f.service.execute('resource.rename', f.context('a/B.java'), { to: 'a/A.java' })).rejects.toThrow('Destination already exists')
    expect(f.operations.save).not.toHaveBeenCalled()
    expect(f.state.tabs[1].path).toBe('a/B.java')
  })
  it('injects creation operations and respects a selected folder target', async () => {
    const f = fixture()
    await f.service.execute('file.new', f.context('a'), { path: 'a/Notes.txt', content: 'notes' })
    await f.service.execute('java.newClass', f.context('a'), { path: 'a/New.java' })
    await f.service.execute('folder.new', f.context('a'), { path: 'a/nested' })
    expect(f.operations.createFile).toHaveBeenCalledWith('project', 'a/Notes.txt', 'notes', expect.any(Object))
    expect(f.operations.createJavaClass).toHaveBeenCalledWith('project', 'a/New.java', expect.any(Object))
    expect(f.operations.createFolder).toHaveBeenCalledWith('project', 'a/nested', expect.any(Object))
    await expect(f.service.execute('file.new', f.context('a'), { path: 'b/Elsewhere.txt' })).rejects.toThrow('selected folder')
    await expect(f.service.execute('file.new', f.context('a/A.java'), { path: 'a/New.txt' })).rejects.toThrow('folder target')
  })
  it('includes dirty open and closed descendants in one delete decision and cancellation preserves all', async () => {
    const f = fixture(), before = structuredClone(f.state)
    expect(await f.service.execute('resource.delete', f.context('a'), {})).toEqual({ status: 'cancelled', paths: [] })
    expect(f.prompts.delete.mock.calls[0][0].dirtyPaths).toEqual(['a/B.java', 'a/Closed.java'])
    expect(f.prompts.dirty).not.toHaveBeenCalled()
    expect(f.operations.delete).not.toHaveBeenCalled()
    expect(f.state).toEqual(before)
  })
  it('passes all expected open/closed versions to the deletion operation without early discard', async () => {
    const f = fixture()
    f.prompts.delete.mockResolvedValue('discard')
    await f.service.execute('resource.delete', f.context('a'), {})
    expect(f.operations.delete.mock.calls[0][0]).toMatchObject({
      target: f.context('a').target, decision: 'discard', dirtyPaths: ['a/B.java', 'a/Closed.java'],
      expectedTabs: [tab('a/A.java'), tab('a/B.java', true)], expectedClosedDrafts: f.state.closedDrafts,
    })
    expect(f.operations.close).not.toHaveBeenCalled()
    expect(f.operations.save).not.toHaveBeenCalled()
    expect(f.state.closedDrafts).toHaveLength(1)
  })
  it('rejects changes to a closed draft even when its path and dirty status stay the same', async () => {
    const f = fixture()
    f.prompts.delete.mockImplementation(async () => {
      f.set({ closedDrafts: [{ ...f.state.closedDrafts[0], draft: 'new closed draft' }] })
      return 'discard'
    })
    await expect(f.service.execute('resource.delete', f.context('a'), {})).rejects.toThrow('Closed drafts changed')
    expect(f.operations.delete).not.toHaveBeenCalled()
    expect(f.state.closedDrafts[0].draft).toBe('new closed draft')
  })
  it('rejects invalid prompt decisions rather than treating them as discard', async () => {
    const f = fixture()
    f.prompts.dirty.mockResolvedValue(undefined as unknown as DirtyDecision)
    await expect(f.service.execute('editor.close', f.context('a/B.java'), {})).rejects.toThrow('Invalid unsaved-changes decision')
    expect(f.operations.close).not.toHaveBeenCalled()
  })
  it('copies the explicit project-relative path and reveals without implicitly opening', async () => {
    const f = fixture()
    await f.service.execute('resource.copyPath', f.context('b/C.java'), {})
    await f.service.execute('explorer.reveal', f.context('b'), {})
    expect(f.operations.copyText).toHaveBeenCalledWith('b/C.java', expect.any(Object))
    expect(f.operations.reveal).toHaveBeenCalledWith(f.context('b').target, expect.any(Object))
    expect(f.operations.open).not.toHaveBeenCalled()
  })
  it.each(['a/A.java', 'b'])('Reveal and Copy Path keep the explicit %s target when another editor is active', async (path) => {
    const f = fixture(), context = f.context(path)
    f.set({ activePath: 'a/B.java' })
    expect(f.service.availability('explorer.reveal', context)).toEqual({ enabled: true })
    expect(f.service.availability('resource.copyPath', context)).toEqual({ enabled: true })
    await f.service.execute('explorer.reveal', context, {})
    await f.service.execute('resource.copyPath', context, {})
    expect(f.operations.reveal).toHaveBeenCalledWith(context.target, context)
    expect(f.operations.copyText).toHaveBeenCalledWith(path, context)
    expect(f.operations.open).not.toHaveBeenCalled()
    expect(f.operations.rename).not.toHaveBeenCalled()
    expect(f.state.activePath).toBe('a/B.java')
  })
})

describe('language, debug and invocation serialization', () => {
  it('keeps Java symbol rename separate and requires the owning Java editor', async () => {
    const f = fixture()
    await f.service.execute('java.renameSymbol', f.context('a/A.java'), { newName: 'ChangedSymbol' })
    expect(f.operations.renameSymbol).toHaveBeenCalledWith(f.context('a/A.java').target, 'ChangedSymbol', expect.any(Object))
    expect(f.operations.rename).not.toHaveBeenCalled()
    await expect(f.service.execute('java.renameSymbol', f.context('a/B.java'), {})).rejects.toThrow('current Java editor')
    f.set({ languageReady: false })
    await expect(f.service.execute('java.renameSymbol', f.context('a/A.java'), {})).rejects.toThrow('ready language service')
  })
  it('dispatches Start/Continue and actual debugger step commands according to live state', async () => {
    const f = fixture()
    await f.service.execute('debug.startOrContinue', f.context(), {})
    expect(f.operations.startDebug).toHaveBeenCalledOnce()
    f.set({ debugState: 'paused' })
    await f.service.execute('debug.startOrContinue', f.context(), {})
    await f.service.execute('debug.stepOver', f.context(), {})
    await f.service.execute('debug.stepInto', f.context(), {})
    await f.service.execute('debug.stepOut', f.context(), {})
    expect(f.operations.debug.mock.calls.map(([command]) => command)).toEqual(['continue', 'stepOver', 'stepInto', 'stepOut'])
    f.set({ debugState: 'running' })
    await expect(f.service.execute('debug.stepOver', f.context(), {})).rejects.toThrow('paused debugger')
    await expect(f.service.execute('debug.startOrContinue', f.context(), {})).rejects.toThrow('already starting or running')
    await f.service.execute('debug.pause', f.context(), {})
    await f.service.execute('debug.stop', f.context(), {})
    expect(f.operations.debug.mock.calls.slice(-2).map(([command]) => command)).toEqual(['pause', 'stop'])
  })
  it('delegates palette and Quick Open without adding their UI', async () => {
    const f = fixture()
    await f.service.execute('workbench.quickOpen', f.context(), {})
    await f.service.execute('workbench.commandPalette', f.context(), {})
    expect(f.operations.quickOpen).toHaveBeenCalledOnce()
    expect(f.operations.commandPalette).toHaveBeenCalledOnce()
  })
  it('serializes operations, captures arguments, and revalidates queued workspace context', async () => {
    const f = fixture(), started = deferred<void>(), finish = deferred<void>()
    f.operations.open.mockImplementation(async () => { started.resolve(); await finish.promise })
    const first = f.service.execute('file.open', f.context('a/A.java'), {})
    await started.promise
    const args = { to: 'a/New.java' }, context = f.context('a/B.java')
    const next = f.service.execute('resource.rename', context, args)
    args.to = 'a/Mutated.java'
    context.target!.path = 'b/C.java'
    expect(f.operations.rename).not.toHaveBeenCalled()
    finish.resolve()
    await first
    await next
    expect(f.operations.rename.mock.calls[0].slice(0, 2)).toEqual([{ projectId: 'project', path: 'a/B.java', kind: 'file' }, 'a/New.java'])
  })
  it('rejects a queued command after a generation change and remains usable after failure', async () => {
    const f = fixture(), started = deferred<void>(), finish = deferred<void>()
    f.operations.open.mockImplementation(async () => { started.resolve(); await finish.promise })
    const first = f.service.execute('file.open', f.context('a/A.java'), {})
    await started.promise
    const next = f.service.execute('resource.rename', f.context('a/B.java'), { to: 'a/New.java' })
    f.set({ workspaceGeneration: 2 })
    finish.resolve()
    await first
    await expect(next).rejects.toThrow('older workspace')
    expect(f.operations.rename).not.toHaveBeenCalled()
    await f.service.execute('resource.copyPath', f.context('a/B.java'), {})
    expect(f.operations.copyText).toHaveBeenCalledOnce()
  })
})


describe('Spatial shell registry integration', () => {
  it('routes shell actions through the same serialized dispatcher', async () => {
    const f = fixture()
    const shell = vi.fn<CommandOperations['shell']>(async () => {})
    f.host.operations.shell = shell
    await f.service.execute('execution.run', f.context(), {})
    await f.service.execute('workbench.source', f.context(), {})
    expect(shell.mock.calls.map(([id]) => id)).toEqual(['execution.run', 'workbench.source'])
    expect(shell.mock.calls[0][1]).toEqual(f.context())
  })
  it('discloses a real disabled reason and rechecks state before dispatch', async () => {
    const f = fixture()
    f.host.operations.shell = vi.fn(async () => {})
    f.set({ shellAvailability: { 'execution.stop': { enabled: false, reason: 'No active execution' } } })
    expect(f.service.availability('execution.stop', f.context())).toEqual({ enabled: false, reason: 'No active execution' })
    await expect(f.service.execute('execution.stop', f.context(), {})).rejects.toThrow('No active execution')
    expect(f.host.operations.shell).not.toHaveBeenCalled()
    f.set({ shellAvailability: { 'execution.stop': { enabled: true } } })
    await f.service.execute('execution.stop', f.context(), {})
    expect(f.host.operations.shell).toHaveBeenCalledOnce()
  })
  it('rejects a palette selection captured in an earlier project generation', async () => {
    const f = fixture(), context = f.context()
    f.host.operations.shell = vi.fn(async () => {})
    f.set({ workspaceGeneration: 2 })
    await expect(f.service.execute('execution.run', context, {})).rejects.toThrow('older workspace')
    expect(f.host.operations.shell).not.toHaveBeenCalled()
  })
  it('makes project creation/import available before a project exists without exposing Run', async () => {
    const f = fixture()
    f.set({ projectId: '', tabs: [], resources: [], closedDrafts: [], activePath: null })
    f.host.operations.shell = vi.fn(async () => {})
    await f.service.execute('workbench.newProject', f.context(), {})
    await f.service.execute('workbench.importProject', f.context(), {})
    await expect(f.service.execute('execution.run', f.context(), {})).rejects.toThrow('Open a project first')
    expect(f.host.operations.shell).toHaveBeenCalledTimes(2)
  })
})
