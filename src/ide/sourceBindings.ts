import type { RenameReceipt } from './bridge'
import type { ResolvedBreakpoint, SourceBreakpoint } from '../debugger/contracts'
import { assertWorkspacePath, pathIsWithin } from './pathChanges'

export interface CapturedSource { fileId: string; content: string; sha256: string }
export interface SourceBinding { fileId: string; sha256: string; workspacePath: string | null }
export interface SourceBindings {
  projectId: string
  sources: readonly SourceBinding[]
  renameGeneration: number | null
  receipts: readonly RenameReceipt[]
}
export function createSourceBindings(projectId: string, sources: readonly CapturedSource[]): SourceBindings {
  return { projectId, sources: sources.map(({ fileId, sha256 }) => ({ fileId, sha256, workspacePath: fileId })), renameGeneration: null, receipts: [] }
}

export function restoreSourceBindings(projectId: string, sources: readonly CapturedSource[], value: unknown): SourceBindings {
  const fresh = createSourceBindings(projectId, sources)
  try {
    const saved = value as SourceBindings
    if (saved.projectId !== projectId || !Array.isArray(saved.sources) || saved.sources.length !== sources.length || !Array.isArray(saved.receipts) ||
      saved.renameGeneration !== null && (!Number.isSafeInteger(saved.renameGeneration) || saved.renameGeneration < 0)) return fresh
    let proven = fresh
    for (const receipt of saved.receipts) {
      assertWorkspacePath(receipt.from); assertWorkspacePath(receipt.to)
      if (receipt.path !== receipt.to || !receipt.operationId || !['file', 'directory'].includes(receipt.kind) || !Number.isSafeInteger(receipt.generation) || receipt.generation < 0 || saved.renameGeneration === null || receipt.generation > saved.renameGeneration) return fresh
      proven = bindRenamedSources(proven, receipt)
    }
    if (proven.renameGeneration !== saved.renameGeneration) return fresh
    const restored = proven.sources.map((source) => {
      const entry = saved.sources.find((item) => item.fileId === source.fileId && item.sha256 === source.sha256)
      if (!entry || entry.workspacePath !== null && typeof entry.workspacePath !== 'string') throw new Error('Invalid stored source binding')
      if (entry.workspacePath !== null) {
        assertWorkspacePath(entry.workspacePath)
        if (entry.workspacePath !== source.workspacePath) throw new Error('Stored source path has no rename evidence')
      }
      return { ...source, workspacePath: entry.workspacePath }
    })
    return { ...fresh, sources: restored, renameGeneration: saved.renameGeneration, receipts: saved.receipts.map((receipt) => ({ ...receipt })) }
  } catch { return fresh }
}

/** A proven move changes the external binding only. Missing sequence evidence disables guesses. */
export function bindRenamedSources(bindings: SourceBindings, receipt: RenameReceipt): SourceBindings {
  const prior = bindings.receipts.find((item) => item.operationId === receipt.operationId)
  if (prior) {
    if (prior.from !== receipt.from || prior.to !== receipt.to || prior.path !== receipt.path || prior.kind !== receipt.kind || prior.generation !== receipt.generation) throw new Error('Conflicting source rename receipt')
    return bindings
  }
  // A verified no-op keeps the filesystem generation. It can have a new nonce.
  if (receipt.from === receipt.to && receipt.generation === bindings.renameGeneration)
    return { ...bindings, receipts: [...bindings.receipts, { ...receipt }] }
  if (bindings.renameGeneration !== null && receipt.generation <= bindings.renameGeneration) throw new Error('Stale source rename receipt')
  const gap = bindings.renameGeneration !== null && receipt.generation !== bindings.renameGeneration + 1
  return { ...bindings, renameGeneration: receipt.generation, receipts: [...bindings.receipts, { ...receipt }], sources: bindings.sources.map((source) => ({
    ...source, workspacePath: gap ? null : source.workspacePath !== null && pathIsWithin(source.workspacePath, receipt.from)
      ? receipt.to + source.workspacePath.slice(receipt.from.length) : source.workspacePath,
  })) }
}
export function unbindDeletedSources(bindings: SourceBindings, path: string): SourceBindings {
  return { ...bindings, sources: bindings.sources.map((source) => source.workspacePath !== null && pathIsWithin(source.workspacePath, path) ? { ...source, workspacePath: null } : source) }
}
export async function sourceSha256(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Compare effective editor text (including dirty drafts) against the recorded bytes. */
export async function verifiedWorkspaceSource(bindings: SourceBindings, fileId: string, read: (path: string) => Promise<string | null>, hash = sourceSha256): Promise<string | null> {
  const source = bindings.sources.find((item) => item.fileId === fileId)
  if (!source?.workspacePath) return null
  const path = source.workspacePath
  const content = await read(path)
  return content !== null && await hash(content) === source.sha256 ? path : null
}

export async function recordedBreakpointPath(bindings: SourceBindings, workspacePath: string, read: (path: string) => Promise<string | null>, hash = sourceSha256): Promise<string | null> {
  const source = bindings.sources.find((item) => item.workspacePath === workspacePath)
  return source && await verifiedWorkspaceSource(bindings, source.fileId, read, hash) ? source.fileId : null
}

/** Display-only projection. Desired paths and captured session breakpoint IDs remain immutable. */
export async function projectSessionBreakpoints(
  bindings: SourceBindings,
  desired: readonly SourceBreakpoint[],
  session: { projectId: string; breakpoints: readonly ResolvedBreakpoint[] },
  read: (path: string) => Promise<string | null>,
  hash = sourceSha256,
): Promise<ResolvedBreakpoint[]> {
  const verified = new Map<string, Promise<string | null>>()
  return Promise.all(desired.map(async (point): Promise<ResolvedBreakpoint> => {
    const pending: ResolvedBreakpoint = { ...point, status: 'pending', reason: null }
    if (session.projectId !== bindings.projectId || !Number.isInteger(point.line) || point.line < 1) return pending
    const candidates = bindings.sources.filter((source) => source.workspacePath === point.fileId)
    if (candidates.length !== 1) return pending
    const source = candidates[0]
    const acknowledgments = session.breakpoints.filter((ack) => ack.fileId === source.fileId && ack.line === point.line)
    if (acknowledgments.length !== 1) return pending
    if (!verified.has(source.fileId)) verified.set(source.fileId, verifiedWorkspaceSource(bindings, source.fileId, read, hash).catch(() => null))
    if (await verified.get(source.fileId) !== point.fileId) return pending
    const acknowledgment = acknowledgments[0]
    return { ...pending, status: acknowledgment.status, reason: acknowledgment.reason }
  }))
}
