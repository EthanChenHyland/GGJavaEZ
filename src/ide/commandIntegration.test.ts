import { describe, expect, it, vi } from 'vitest'
import { bridge, draftStorageKey, persistDraftPathChange, persistProjectPathChange, readProjectDrafts, requestRename, validateRenameReceipt, withStorageTransaction, type DraftStorage } from './bridge'
import { createIdeCommandService, type CommandSnapshot } from './commands'
import { transitionWorkspacePaths } from './pathChanges'

function storage(initial: Record<string, string> = {}): DraftStorage & { entries: Map<string, string>; failKey: string | null } {
  const entries = new Map(Object.entries(initial))
  return {
    entries, failKey: null,
    get length() { return entries.size }, key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem(key, value) { if (key === this.failKey) throw new Error('Storage quota'); entries.set(key, value) },
    removeItem: (key) => { entries.delete(key) },
  }
}
const draft = (text = 'closed unsaved', revision = 'original-disk-revision') => JSON.stringify({ draft: text, revision })
const receipt = { path: 'lib/a', from: 'src/a', to: 'lib/a', kind: 'directory' as const, operationId: 'rename-nonce', generation: 12 }

describe('rename receipt transport', () => {
  it('retries a lost reply with exactly the same nonce and paths', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Reply lost after filesystem move'))
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt)))
    expect(await requestRename('project', 'src/a', 'lib/a', 'rename-nonce', fetcher)).toEqual(receipt)
    expect(fetcher).toHaveBeenCalledTimes(2)
    const bodies = fetcher.mock.calls.map(([, request]) => JSON.parse(request!.body as string))
    expect(bodies).toEqual([{ from: 'src/a', to: 'lib/a', operationId: 'rename-nonce' }, { from: 'src/a', to: 'lib/a', operationId: 'rename-nonce' }])
  })
  it('retries an uncertain 500 but does not retry a destination conflict', async () => {
    const unavailable = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Uncertain move' }), { status: 500 })).mockResolvedValueOnce(new Response(JSON.stringify(receipt)))
    await expect(requestRename('project', 'src/a', 'lib/a', 'rename-nonce', unavailable)).resolves.toEqual(receipt)
    const conflict = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'Destination exists' }), { status: 409 }))
    await expect(requestRename('project', 'src/a', 'lib/a', 'rename-nonce', conflict)).rejects.toThrow('Destination exists')
    expect(conflict).toHaveBeenCalledOnce()
  })
  it('rejects mismatched acknowledgements and bounds ambiguous retries to two attempts', async () => {
    expect(() => validateRenameReceipt({ ...receipt, from: 'elsewhere' }, 'src/a', 'lib/a', 'rename-nonce')).toThrow('Invalid filesystem')
    expect(() => validateRenameReceipt({ ...receipt, generation: -1 }, 'src/a', 'lib/a', 'rename-nonce')).toThrow('Invalid filesystem')
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ ...receipt, operationId: 'wrong-nonce' })))
    await expect(requestRename('project', 'src/a', 'lib/a', 'rename-nonce', fetcher)).rejects.toThrow('Invalid filesystem')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('preserves the existing legacy rename request and response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ path: 'B.java' })))
    vi.stubGlobal('fetch', fetcher)
    try {
      expect(await bridge.rename('project', 'A.java', 'B.java')).toEqual({ path: 'B.java' })
      expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ from: 'A.java', to: 'B.java' })
    } finally { vi.unstubAllGlobals() }
  })
})

describe('complete browser draft and path persistence', () => {
  it('migrates open and closed drafts, retaining original revisions and sibling prefixes', () => {
    const store = storage({
      [draftStorageKey('project', 'src/a/Open.java')]: draft('open unsaved'),
      [draftStorageKey('project', 'src/a/nested/Closed.java')]: draft(),
      [draftStorageKey('project', 'src/ab/Sibling.java')]: draft('sibling'),
      [draftStorageKey('other', 'src/a/Other.java')]: draft('other project'),
    })
    persistDraftPathChange(store, 'project', { kind: 'rename', from: 'src/a', to: 'lib/a' })
    expect(readProjectDrafts(store, 'project')).toEqual({
      'lib/a/Open.java': { draft: 'open unsaved', revision: 'original-disk-revision' },
      'lib/a/nested/Closed.java': { draft: 'closed unsaved', revision: 'original-disk-revision' },
      'src/ab/Sibling.java': { draft: 'sibling', revision: 'original-disk-revision' },
    })
    expect(readProjectDrafts(store, 'other')['src/a/Other.java'].draft).toBe('other project')
  })
  it('rolls back copied destinations if quota fails before originals can be removed', () => {
    const store = storage({ [draftStorageKey('project', 'src/a/A.java')]: draft('A'), [draftStorageKey('project', 'src/a/B.java')]: draft('B') })
    const before = new Map(store.entries)
    store.failKey = draftStorageKey('project', 'lib/a/B.java')
    expect(() => persistDraftPathChange(store, 'project', { kind: 'rename', from: 'src/a', to: 'lib/a' })).toThrow('Storage quota')
    expect(store.entries).toEqual(before)
    store.failKey = null
    persistDraftPathChange(store, 'project', { kind: 'rename', from: 'src/a', to: 'lib/a' })
    persistDraftPathChange(store, 'project', { kind: 'rename', from: 'src/a', to: 'lib/a' })
    expect(readProjectDrafts(store, 'project')['lib/a/B.java'].draft).toBe('B')
  })
  it('rejects a held closed-draft destination collision without overwriting either value', () => {
    const store = storage({ [draftStorageKey('project', 'src/a/A.java')]: draft('original'), [draftStorageKey('project', 'lib/a/A.java')]: draft('destination') })
    const before = new Map(store.entries)
    expect(() => persistDraftPathChange(store, 'project', { kind: 'rename', from: 'src/a', to: 'lib/a' })).toThrow('collision')
    expect(store.entries).toEqual(before)
  })
  it('keeps malformed or legacy drafts recoverable rather than silently overwriting them', () => {
    const store = storage({ [draftStorageKey('project', 'src/a/A.java')]: 'legacy unsaved text' })
    expect(() => persistDraftPathChange(store, 'project', { kind: 'rename', from: 'src/a', to: 'lib/a' })).toThrow('needs recovery')
    expect(store.getItem(draftStorageKey('project', 'src/a/A.java'))).toBe('legacy unsaved text')
  })
  it('updates persisted tabs, active path, breakpoints and cwd together', () => {
    const store = storage({
      [draftStorageKey('project', 'src/a/Closed.java')]: draft(),
      'ggjavaez:session:project': JSON.stringify({ paths: ['src/a/Open.java', 'src/ab/Other.java'], active: 'src/a/Open.java' }),
      'ggjavaez:breakpoints:project': JSON.stringify([{ fileId: 'src/a/Closed.java', line: 7 }]),
      'ggjavaez:launch:project': JSON.stringify({ mainClass: 'example.Entry', workingDirectory: 'src/a/data', programArgs: ['keep'] }),
    })
    persistProjectPathChange(store, 'project', { kind: 'rename', from: 'src/a', to: 'lib/a' })
    expect(JSON.parse(store.getItem('ggjavaez:session:project')!)).toEqual({ paths: ['lib/a/Open.java', 'src/ab/Other.java'], active: 'lib/a/Open.java' })
    expect(JSON.parse(store.getItem('ggjavaez:breakpoints:project')!)).toEqual([{ fileId: 'lib/a/Closed.java', line: 7 }])
    expect(JSON.parse(store.getItem('ggjavaez:launch:project')!)).toMatchObject({ mainClass: 'example.Entry', workingDirectory: 'lib/a/data', programArgs: ['keep'] })
    persistProjectPathChange(store, 'project', { kind: 'delete', path: 'lib/a' })
    expect(JSON.parse(store.getItem('ggjavaez:session:project')!)).toEqual({ paths: ['src/ab/Other.java'], active: 'src/ab/Other.java' })
    expect(JSON.parse(store.getItem('ggjavaez:launch:project')!)).toMatchObject({ cwdInvalid: true, mainClass: 'example.Entry' })
    expect(readProjectDrafts(store, 'project')).toEqual({})
  })
  it('rolls back every projection if a later session or binding write fails', () => {
    const store = storage({ [draftStorageKey('project', 'src/a/A.java')]: draft(), 'ggjavaez:session:project': JSON.stringify({ paths: ['src/a/A.java'], active: 'src/a/A.java' }) })
    const before = new Map(store.entries)
    store.failKey = 'ggjavaez:source-bindings:project:session'
    expect(() => withStorageTransaction(store, (transaction) => {
      persistProjectPathChange(transaction, 'project', { kind: 'rename', from: 'src/a', to: 'lib/a' })
      transaction.setItem('ggjavaez:source-bindings:project:session', '{}')
    })).toThrow('Storage quota')
    expect(store.entries).toEqual(before)
  })
})

describe('canonical command plus receipt and persistence composition', () => {
  it('moves dirty open and closed state after acknowledgement without issuing a Save', async () => {
    const store = storage({ [draftStorageKey('project', 'src/a/Open.java')]: draft('dirty open'), [draftStorageKey('project', 'src/a/Closed.java')]: draft() })
    let workspace = { tabs: [{ path: 'src/a/Open.java', content: 'disk', draft: 'dirty open', revision: 'original-disk-revision' }],
      drafts: readProjectDrafts(store, 'project'), activePath: 'src/a/Open.java', breakpoints: [{ fileId: 'src/a/Closed.java', line: 4 }], workingDirectory: 'src/a/data', navigation: { path: 'src/a/Open.java', line: 2, column: 1 } }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(receipt)))
    const save = vi.fn(), rename = vi.fn(async () => {
      const acknowledged = await requestRename('project', 'src/a', 'lib/a', 'rename-nonce', fetcher)
      const result = transitionWorkspacePaths(workspace, { kind: 'rename', from: acknowledged.from, to: acknowledged.to })
      persistProjectPathChange(store, 'project', { kind: 'rename', from: acknowledged.from, to: acknowledged.to })
      workspace = { ...result.state, tabs: [...result.state.tabs], drafts: readProjectDrafts(store, 'project'), breakpoints: [...result.state.breakpoints], activePath: result.state.activePath!, workingDirectory: result.state.workingDirectory!, navigation: result.state.navigation! }
    })
    const snapshot = (): CommandSnapshot => ({ projectId: 'project', workspaceGeneration: 1, tabs: workspace.tabs, activePath: workspace.activePath,
      resources: [{ projectId: 'project', path: 'src/a', kind: 'directory' }], closedDrafts: [{ path: 'src/a/Closed.java', draft: 'closed unsaved', revision: 'original-disk-revision', dirty: true }],
      debugState: 'inactive', languageReady: false, editorPath: workspace.activePath })
    const commands = createIdeCommandService({ snapshot, operations: { rename, save }, prompts: {} })
    await commands.execute('resource.rename', { projectId: 'project', workspaceGeneration: 1, target: { projectId: 'project', path: 'src/a', kind: 'directory' } }, { to: 'lib/a' })
    expect(save).not.toHaveBeenCalled()
    expect(workspace).toMatchObject({ activePath: 'lib/a/Open.java', workingDirectory: 'lib/a/data', navigation: { path: 'lib/a/Open.java' }, breakpoints: [{ fileId: 'lib/a/Closed.java', line: 4 }] })
    expect(workspace.tabs[0]).toMatchObject({ path: 'lib/a/Open.java', draft: 'dirty open', revision: 'original-disk-revision' })
    expect(workspace.drafts['lib/a/Closed.java']).toEqual({ draft: 'closed unsaved', revision: 'original-disk-revision' })
  })
})
