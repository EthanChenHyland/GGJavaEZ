import { bridge as legacyBridge } from './client'
import { assertWorkspacePath, pathIsWithin, transitionWorkspacePaths, type WorkspacePathChange, type WorkspacePathState } from './pathChanges'

/** Filesystem acknowledgement only; generation is the rename-only project sequence. */
export interface RenameReceipt {
  path: string
  from: string
  to: string
  kind: 'file' | 'directory'
  operationId: string
  generation: number
}
export interface PersistedDraft { draft: string; revision: string }
export type DraftStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>
export const draftStorageKey = (projectId: string, path: string) => `ggjavaez:draft:${projectId}:${path}`
export const renameIntentKey = (projectId: string) => `ggjavaez:rename-intent:${projectId}`

export function withStorageTransaction<T>(storage: DraftStorage, work: (transaction: DraftStorage) => T): T {
  const before = new Map<string, string | null>()
  const capture = (key: string) => { if (!before.has(key)) before.set(key, storage.getItem(key)) }
  const transaction: DraftStorage = {
    get length() { return storage.length }, key: (index) => storage.key(index), getItem: (key) => storage.getItem(key),
    setItem: (key, value) => { capture(key); storage.setItem(key, value) },
    removeItem: (key) => { capture(key); storage.removeItem(key) },
  }
  try { return work(transaction) } catch (error) {
    for (const [key, value] of before) if (value !== null) storage.setItem(key, value)
    for (const [key, value] of before) if (value === null) storage.removeItem(key)
    throw error
  }
}

export function readProjectDrafts(storage: DraftStorage, projectId: string): Record<string, PersistedDraft> {
  const prefix = draftStorageKey(projectId, '')
  const entries: [string, PersistedDraft][] = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!key?.startsWith(prefix)) continue
    const path = key.slice(prefix.length)
    assertWorkspacePath(path)
    const raw = storage.getItem(key)
    if (raw === null) continue
    let value: PersistedDraft
    try { value = JSON.parse(raw) } catch { throw new Error(`Draft needs recovery before file operations: ${path}`) }
    if (!value || typeof value.draft !== 'string' || typeof value.revision !== 'string') throw new Error(`Draft needs recovery before file operations: ${path}`)
    entries.push([path, value])
  }
  return Object.fromEntries(entries)
}

/** Copy every destination before removing any original; roll back on storage failure. */
export function persistDraftPathChange(storage: DraftStorage, projectId: string, change: WorkspacePathChange): void {
  const drafts = readProjectDrafts(storage, projectId)
  const empty: WorkspacePathState = { tabs: [], drafts, activePath: null, breakpoints: [], workingDirectory: '.', navigation: null }
  const result = transitionWorkspacePaths(empty, change)
  const source = change.kind === 'rename' ? change.from : change.path
  const touched = new Set(Object.keys(drafts).filter((path) => pathIsWithin(path, source)))
  if (change.kind === 'rename') for (const path of [...touched]) touched.add(change.to + path.slice(source.length))
  const before = new Map([...touched].map((path) => [path, storage.getItem(draftStorageKey(projectId, path))]))
  try {
    for (const path of touched) if (Object.hasOwn(result.state.drafts, path)) storage.setItem(draftStorageKey(projectId, path), JSON.stringify(result.state.drafts[path]))
    for (const path of touched) if (!Object.hasOwn(result.state.drafts, path)) storage.removeItem(draftStorageKey(projectId, path))
  } catch (error) {
    // Originals are written first; failed destination cleanup must not destroy recoverable text.
    for (const [path, value] of before) if (value !== null) storage.setItem(draftStorageKey(projectId, path), value)
    for (const [path, value] of before) if (value === null) storage.removeItem(draftStorageKey(projectId, path))
    throw error
  }
}

/** Persisted projections use the same segment-aware transition as live workspace state. */
export function persistProjectPathChange(storage: DraftStorage, projectId: string, change: WorkspacePathChange): void {
  const sessionKey = `ggjavaez:session:${projectId}`, breakpointKey = `ggjavaez:breakpoints:${projectId}`, launchKey = `ggjavaez:launch:${projectId}`
  const session = JSON.parse(storage.getItem(sessionKey) ?? '{}') as { paths?: string[]; active?: string }
  const breakpoints = JSON.parse(storage.getItem(breakpointKey) ?? '[]') as { fileId: string; line: number }[]
  const launch = JSON.parse(storage.getItem(launchKey) ?? '{}') as { workingDirectory?: string; cwdInvalid?: boolean }
  const result = transitionWorkspacePaths({ tabs: (session.paths ?? []).map((path) => ({ path })), drafts: readProjectDrafts(storage, projectId),
    activePath: session.active || null, breakpoints, workingDirectory: launch.cwdInvalid ? null : launch.workingDirectory ?? '.', navigation: null }, change)
  withStorageTransaction(storage, (transaction) => {
    persistDraftPathChange(transaction, projectId, change)
    transaction.setItem(sessionKey, JSON.stringify({ ...session, paths: result.state.tabs.map((tab) => tab.path), active: result.state.activePath ?? '' }))
    transaction.setItem(breakpointKey, JSON.stringify(result.state.breakpoints))
    transaction.setItem(launchKey, JSON.stringify({ ...launch, workingDirectory: result.state.workingDirectory ?? launch.workingDirectory ?? '.', cwdInvalid: launch.cwdInvalid === true || result.workingDirectoryDeleted }))
  })
}

export function validateRenameReceipt(value: unknown, from: string, to: string, operationId: string): RenameReceipt {
  const receipt = value as RenameReceipt | null
  if (!receipt || receipt.from !== from || receipt.to !== to || receipt.path !== to || receipt.operationId !== operationId ||
    !['file', 'directory'].includes(receipt.kind) || !Number.isSafeInteger(receipt.generation) || receipt.generation < 0) throw new Error('Invalid filesystem rename receipt')
  return { path: receipt.path, from, to, kind: receipt.kind, operationId, generation: receipt.generation }
}

/** One retry for uncertain transport/server failure; both attempts use the same caller nonce. */
export async function requestRename(projectId: string, from: string, to: string, operationId: string, fetcher: typeof fetch = fetch): Promise<RenameReceipt> {
  assertWorkspacePath(from); assertWorkspacePath(to)
  if (!operationId) throw new Error('Rename operation ID is required')
  let failure: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response
    try {
      response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/rename`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from, to, operationId }),
      })
    } catch (error) { failure = error; continue }
    let payload: unknown
    try { payload = await response.json() } catch (error) { failure = error; continue }
    if (!response.ok) {
      failure = new Error((payload as { error?: string })?.error ?? `Rename failed (${response.status})`)
      if (response.status < 500) throw failure
      continue
    }
    try { return validateRenameReceipt(payload, from, to, operationId) } catch (error) { failure = error }
  }
  throw failure
}

/** Existing calls retain their legacy contracts; receipt rename is an explicit extension. */
export const bridge = { ...legacyBridge, renameWithReceipt: requestRename }
