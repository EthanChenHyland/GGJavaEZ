import { describe, expect, it } from 'vitest'
import { bindRenamedSources, createSourceBindings, projectSessionBreakpoints, recordedBreakpointPath, restoreSourceBindings, sourceSha256, unbindDeletedSources, verifiedWorkspaceSource } from './sourceBindings'
import type { RenameReceipt } from './bridge'
import type { ResolvedBreakpoint, SourceBreakpoint } from '../debugger/contracts'

const sources = Object.freeze([
  Object.freeze({ fileId: 'src/a/Run.java', content: 'recorded', sha256: 'recorded-hash' }),
  Object.freeze({ fileId: 'src/ab/Other.java', content: 'other', sha256: 'other-hash' }),
])
const receipt = (from = 'src/a', to = 'lib/a', generation = 7, operationId = 'operation-7'): RenameReceipt => ({ from, to, path: to, kind: 'directory', generation, operationId })
const hash = async (content: string) => content === 'recorded' ? 'recorded-hash' : content === 'other' ? 'other-hash' : 'different-hash'

describe('recorded source bindings remain external to immutable captured sources', () => {
  it('follows a receipt-proven folder move on segment boundaries without rewriting snapshots', () => {
    const original = createSourceBindings('project', sources)
    const moved = bindRenamedSources(original, receipt())
    expect(moved.sources.map((source) => source.workspacePath)).toEqual(['lib/a/Run.java', 'src/ab/Other.java'])
    expect(original.sources[0].workspacePath).toBe('src/a/Run.java')
    expect(sources[0]).toEqual({ fileId: 'src/a/Run.java', content: 'recorded', sha256: 'recorded-hash' })
  })
  it('maps a file move and a later folder move, preserving the original captured identity', async () => {
    const first = bindRenamedSources(createSourceBindings('project', sources), { ...receipt('src/a/Run.java', 'src/a/Changed.java'), kind: 'file' })
    const second = bindRenamedSources(first, receipt('src/a', 'lib/new', 8, 'operation-8'))
    expect(await verifiedWorkspaceSource(second, 'src/a/Run.java', async (path) => path === 'lib/new/Changed.java' ? 'recorded' : null, hash)).toBe('lib/new/Changed.java')
  })
  it('requires recorded hash equality after a move and rejects dirty source text', async () => {
    const bindings = bindRenamedSources(createSourceBindings('project', sources), receipt())
    expect(await verifiedWorkspaceSource(bindings, 'src/a/Run.java', async () => 'recorded', hash)).toBe('lib/a/Run.java')
    expect(await verifiedWorkspaceSource(bindings, 'src/a/Run.java', async () => 'dirty newer content', hash)).toBeNull()
    expect(await verifiedWorkspaceSource(bindings, 'src/a/Run.java', async () => null, hash)).toBeNull()
  })
  it('does not guess a new binding by filename or matching contents without a receipt', async () => {
    const bindings = createSourceBindings('project', sources)
    const files: Record<string, string> = { 'copied/Run.java': 'recorded' }
    expect(await verifiedWorkspaceSource(bindings, 'src/a/Run.java', async (path) => files[path] ?? null, hash)).toBeNull()
    expect(await verifiedWorkspaceSource(bindings, 'unknown.java', async () => 'recorded', hash)).toBeNull()
  })
  it('translates desired workspace breakpoints to captured IDs only for verified text', async () => {
    const bindings = bindRenamedSources(createSourceBindings('project', sources), receipt())
    expect(await recordedBreakpointPath(bindings, 'lib/a/Run.java', async () => 'recorded', hash)).toBe('src/a/Run.java')
    expect(await recordedBreakpointPath(bindings, 'lib/a/Run.java', async () => 'changed', hash)).toBeNull()
    expect(await recordedBreakpointPath(bindings, 'copied/Run.java', async () => 'recorded', hash)).toBeNull()
  })
  it('makes repeated delivery of the same receipt idempotent and rejects conflicting/stale receipts', () => {
    const moved = bindRenamedSources(createSourceBindings('project', sources), receipt())
    expect(bindRenamedSources(moved, { ...receipt() })).toBe(moved)
    expect(() => bindRenamedSources(moved, receipt('src/a', 'elsewhere'))).toThrow('Conflicting')
    expect(() => bindRenamedSources(moved, receipt('src/ab', 'lib/ab', 6, 'operation-6'))).toThrow('Stale')
  })
  it('disables source associations after a missing rename sequence rather than guessing', async () => {
    const first = bindRenamedSources(createSourceBindings('project', sources), receipt())
    const gap = bindRenamedSources(first, receipt('lib/a', 'third/a', 9, 'operation-9'))
    expect(gap.sources.every((source) => source.workspacePath === null)).toBe(true)
    expect(await verifiedWorkspaceSource(gap, 'src/a/Run.java', async () => 'recorded', hash)).toBeNull()
  })
  it('marks deletion unbound and cannot bind a recreated file at the same path', async () => {
    const deleted = unbindDeletedSources(createSourceBindings('project', sources), 'src/a')
    expect(await verifiedWorkspaceSource(deleted, 'src/a/Run.java', async () => 'recorded', hash)).toBeNull()
    expect(deleted.sources[1].workspacePath).toBe('src/ab/Other.java')
  })
  it('restores a persisted proven binding only for the same project and captured hashes', () => {
    const moved = bindRenamedSources(createSourceBindings('project', sources), receipt())
    expect(restoreSourceBindings('project', sources, JSON.parse(JSON.stringify(moved)))).toEqual(moved)
    expect(restoreSourceBindings('other', sources, moved).sources[0].workspacePath).toBe('src/a/Run.java')
    expect(restoreSourceBindings('project', [{ ...sources[0], sha256: 'new-run-hash' }, sources[1]], moved).sources[0].workspacePath).toBe('src/a/Run.java')
  })
  it('rejects persisted path substitutions without receipt evidence and malformed paths', () => {
    const fresh = createSourceBindings('project', sources)
    expect(restoreSourceBindings('project', sources, { ...fresh, sources: [{ ...fresh.sources[0], workspacePath: 'copy/Run.java' }, fresh.sources[1]] })).toEqual(fresh)
    expect(restoreSourceBindings('project', sources, { ...fresh, sources: [{ ...fresh.sources[0], workspacePath: '../escape' }, fresh.sources[1]] })).toEqual(fresh)
  })
  it('restores an intentionally unbound deletion without reviving a recreated source', () => {
    const deleted = unbindDeletedSources(bindRenamedSources(createSourceBindings('project', sources), receipt()), 'lib/a')
    expect(restoreSourceBindings('project', sources, deleted)).toEqual(deleted)
  })
  it('uses actual SHA-256 of UTF-8 content', async () => {
    expect(await sourceSha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
  it('accepts a fresh no-op nonce at the same generation and restores the proven binding chain', () => {
    const first = bindRenamedSources(createSourceBindings('project', sources), receipt())
    const noOp = bindRenamedSources(first, receipt('lib/a', 'lib/a', 7, 'no-op'))
    expect(noOp.sources).toEqual(first.sources)
    expect(noOp.renameGeneration).toBe(7)
    expect(restoreSourceBindings('project', sources, noOp)).toEqual(noOp)
    const next = bindRenamedSources(noOp, receipt('lib/a', 'moved/a', 8, 'next'))
    expect(next.sources[0].workspacePath).toBe('moved/a/Run.java')
  })

})

describe('verified session breakpoint acknowledgments projected into workspace display', () => {
  it('projects exact verified and nonexecutable acknowledgments without changing desired or captured arrays', async () => {
    const bindings = createSourceBindings('project', sources)
    const desired = Object.freeze([
      Object.freeze({ fileId: 'src/a/Run.java', line: 5, status: 'pending' as const, reason: null }),
      Object.freeze({ fileId: 'src/ab/Other.java', line: 3, status: 'pending' as const, reason: null }),
    ])
    const acknowledgments = Object.freeze([
      Object.freeze({ fileId: 'src/a/Run.java', line: 5, status: 'verified' as const, reason: null }),
      Object.freeze({ fileId: 'src/ab/Other.java', line: 3, status: 'non_executable' as const, reason: 'No executable location on this line' }),
      Object.freeze({ fileId: 'src/a/Run.java', line: 9, status: 'verified' as const, reason: null }),
    ])
    // The reader represents an open draft for Run.java and a persisted closed draft for Other.java.
    const effective: Record<string, string> = { 'src/a/Run.java': 'recorded', 'src/ab/Other.java': 'other' }
    const projected = await projectSessionBreakpoints(bindings, desired, { projectId: 'project', breakpoints: acknowledgments }, async (path) => effective[path] ?? null, hash)
    expect(projected).toEqual(acknowledgments.slice(0, 2))
    expect(projected[0]).not.toBe(desired[0])
    expect(projected[1]).not.toBe(acknowledgments[1])
    expect(desired.map((point) => point.status)).toEqual(['pending', 'pending'])
    expect(acknowledgments).toHaveLength(3)
    expect(sources[0].fileId).toBe('src/a/Run.java')
  })
  it('projects a captured ID through file and folder moves using actual SHA-256', async () => {
    const content = 'package arbitrary;\nclass Launch { int value = 7; }\n'
    const captured = Object.freeze([{ fileId: 'module/pkg/Launch.java', content, sha256: await sourceSha256(content) }])
    const first = bindRenamedSources(createSourceBindings('project', captured), { ...receipt('module/pkg/Launch.java', 'module/pkg/Renamed.java'), kind: 'file' })
    const bindings = bindRenamedSources(first, receipt('module/pkg', 'other/nested', 8, 'folder-move'))
    const desired = Object.freeze([{ fileId: 'other/nested/Renamed.java', line: 2 }])
    const acknowledgments = Object.freeze([{ fileId: 'module/pkg/Launch.java', line: 2, status: 'verified' as const, reason: null }])
    expect(await projectSessionBreakpoints(bindings, desired, { projectId: 'project', breakpoints: acknowledgments }, async (path) => path === desired[0].fileId ? content : null)).toEqual([
      { fileId: 'other/nested/Renamed.java', line: 2, status: 'verified', reason: null },
    ])
    expect(acknowledgments[0].fileId).toBe('module/pkg/Launch.java')
    expect(captured[0].fileId).toBe('module/pkg/Launch.java')
    expect(desired).toEqual([{ fileId: 'other/nested/Renamed.java', line: 2 }])
  })
  it.each(['pending', 'verified', 'non_executable', 'unresolved'] as const)('retains server %s status and reason only after source verification', async (status) => {
    const bindings = createSourceBindings('project', sources)
    const desired = [{ fileId: sources[0].fileId, line: 5 }]
    const session = { projectId: 'project', breakpoints: [{ ...desired[0], status, reason: 'Server evidence' }] }
    expect(await projectSessionBreakpoints(bindings, desired, session, async () => 'recorded', hash)).toEqual([{ ...desired[0], status, reason: 'Server evidence' }])
    expect(await projectSessionBreakpoints(bindings, desired, session, async () => 'dirty newer text', hash)).toEqual([{ ...desired[0], status: 'pending', reason: null }])
  })
  it('leaves changed open and closed drafts pending independently of other verified files', async () => {
    const bindings = createSourceBindings('project', sources)
    const desired = sources.map((source) => ({ fileId: source.fileId, line: 2 }))
    const session = { projectId: 'project', breakpoints: desired.map((point): ResolvedBreakpoint => ({ ...point, status: 'verified', reason: null })) }
    const effective: Record<string, string> = { [sources[0].fileId]: 'dirty open', [sources[1].fileId]: 'other' }
    expect((await projectSessionBreakpoints(bindings, desired, session, async (path) => effective[path], hash)).map((point) => point.status)).toEqual(['pending', 'verified'])
    effective[sources[0].fileId] = 'recorded'; effective[sources[1].fileId] = 'dirty closed'
    expect((await projectSessionBreakpoints(bindings, desired, session, async (path) => effective[path], hash)).map((point) => point.status)).toEqual(['verified', 'pending'])
  })
  it('does not add removed/session-only breakpoints or guess bindings by filenames or hash-equivalent copies', async () => {
    const bindings = createSourceBindings('project', sources)
    const desired: readonly SourceBreakpoint[] = [{ fileId: 'copy/Run.java', line: 5 }, { fileId: sources[0].fileId, line: 8 }]
    const session = { projectId: 'project', breakpoints: [{ fileId: sources[0].fileId, line: 5, status: 'verified' as const, reason: null }] }
    expect(await projectSessionBreakpoints(bindings, desired, session, async () => 'recorded', hash)).toEqual(desired.map((point) => ({ ...point, status: 'pending', reason: null })))
    expect(await projectSessionBreakpoints(bindings, [], session, async () => 'recorded', hash)).toEqual([])
  })
  it('rejects foreign projects, deleted bindings and missing rename-sequence evidence', async () => {
    const fresh = createSourceBindings('project', sources)
    const desired = [{ fileId: sources[0].fileId, line: 5 }]
    const session = { projectId: 'project', breakpoints: [{ ...desired[0], status: 'verified' as const, reason: null }] }
    let reads = 0
    const read = async () => { reads++; return 'recorded' }
    for (const [bindings, acknowledgment] of [
      [fresh, { ...session, projectId: 'foreign' }],
      [unbindDeletedSources(fresh, 'src/a'), session],
      [bindRenamedSources(bindRenamedSources(fresh, receipt()), receipt('lib/a', 'other/a', 9, 'missing-sequence')), session],
    ] as const) {
      expect(await projectSessionBreakpoints(bindings, desired, acknowledgment, read, hash)).toEqual([{ ...desired[0], status: 'pending', reason: null }])
    }
    expect(reads).toBe(0)
  })
  it('checks effective text and hashes once per source when several desired lines share it', async () => {
    const bindings = createSourceBindings('project', sources)
    const desired = [2, 3, 5].map((line) => ({ fileId: sources[0].fileId, line }))
    const session = { projectId: 'project', breakpoints: desired.map((point): ResolvedBreakpoint => ({ ...point, status: 'verified', reason: null })) }
    let reads = 0, hashes = 0
    const projected = await projectSessionBreakpoints(bindings, desired, session, async () => { reads++; return 'recorded' }, async (content) => { hashes++; return hash(content) })
    expect(projected.every((point) => point.status === 'verified')).toBe(true)
    expect(reads).toBe(1)
    expect(hashes).toBe(1)
  })
  it('leaves ambiguous acknowledgments or bindings pending instead of selecting one', async () => {
    const bindings = createSourceBindings('project', sources)
    const desired = [{ fileId: sources[0].fileId, line: 5 }]
    const ack: ResolvedBreakpoint = { ...desired[0], status: 'verified', reason: null }
    const duplicate = { projectId: 'project', breakpoints: [ack, { ...ack, status: 'non_executable' as const }] }
    expect((await projectSessionBreakpoints(bindings, desired, duplicate, async () => 'recorded', hash))[0].status).toBe('pending')
    const ambiguous = { ...bindings, sources: [...bindings.sources, { fileId: 'another/captured.java', sha256: 'recorded-hash', workspacePath: desired[0].fileId }] }
    expect((await projectSessionBreakpoints(ambiguous, desired, { projectId: 'project', breakpoints: [ack] }, async () => 'recorded', hash))[0].status).toBe('pending')
  })
  it('keeps unavailable or unreadable source pending and clears obsolete desired status/reason', async () => {
    const bindings = createSourceBindings('project', sources)
    const desired = Object.freeze([{ fileId: sources[0].fileId, line: 5, status: 'verified' as const, reason: 'Obsolete display state' }])
    const session = { projectId: 'project', breakpoints: [{ ...desired[0], reason: null }] }
    const pending = [{ fileId: desired[0].fileId, line: 5, status: 'pending', reason: null }]
    expect(await projectSessionBreakpoints(bindings, desired, session, async () => null, hash)).toEqual(pending)
    expect(await projectSessionBreakpoints(bindings, desired, session, async () => { throw new Error('Source unavailable') }, hash)).toEqual(pending)
    expect(desired[0].reason).toBe('Obsolete display state')
  })
})
