import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ProjectStore } from './projects.mjs'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, rename: vi.fn(actual.rename), open: vi.fn(actual.open) }
})
const nativeFs = await vi.importActual('node:fs/promises')

const temporaryRoots = []

async function makeStore() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-java-projects-'))
  temporaryRoots.push(root)
  return { root, store: new ProjectStore(path.join(root, '.ggjavaez')) }
}

afterEach(async () => {
  vi.mocked(fs.rename).mockReset().mockImplementation(nativeFs.rename)
  vi.mocked(fs.open).mockReset().mockImplementation(nativeFs.open)
  await Promise.all(temporaryRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function seedPending(store, id, from, to, operationId = 'crash-test') {
  const root = await store.getProjectRoot(id)
  const source = path.join(root, ...from.split('/'))
  const stat = await fs.lstat(source, { bigint: true })
  const temporary = path.posix.join(path.posix.dirname(from), '.ggjavaez-tmp-11111111-1111-4111-8111-111111111111')
  const receipt = { path: to, from, to, kind: stat.isDirectory() ? 'directory' : 'file', operationId, generation: 1 }
  const journal = { version: 1, generation: 0, receipts: [], pending: { receipt, temporary, identity: { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) } } }
  await fs.writeFile(path.join(store.journalRoot, `${id}.json`), JSON.stringify(journal))
  return { root, source, temporary: path.join(root, ...temporary.split('/')), destination: path.join(root, ...to.split('/')), receipt }
}

describe('ProjectStore', () => {
  it('preserves wrapper binaries and build metadata on folder import', async () => {
    const { store } = await makeStore()
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0, 0x80])
    const project = await store.importProject('Gradle', [
      { path: 'build.gradle.kts', content: 'plugins { java }' },
      { path: 'gradle/wrapper/gradle-wrapper.jar', content: bytes.toString('base64'), encoding: 'base64' },
    ])
    expect(await fs.readFile(path.join(await store.getProjectRoot(project.id), 'gradle/wrapper/gradle-wrapper.jar'))).toEqual(bytes)
    expect((await store.readFile(project.id, 'build.gradle.kts')).content).toContain('plugins')
    await expect(store.importProject('Bad bytes', [{ path: 'wrapper.jar', content: 'not base64!', encoding: 'base64' }])).rejects.toMatchObject({ status: 400 })
  })
  it('creates one persistent starter and keeps metadata out of the tree', async () => {
    const { store } = await makeStore()
    const first = await store.ensureStarter()
    expect(await store.ensureStarter()).toEqual(first)
    expect(await store.listProjects()).toEqual([first])
    expect(first).toEqual({ id: expect.any(String), name: 'Java Starter', createdAt: expect.any(String) })
    expect(await store.getTree(first.id)).toEqual([{ path: 'Main.java', name: 'Main.java', kind: 'file' }])
    expect((await store.readFile(first.id, 'Main.java')).content).toContain('public class Main')
    expect(await store.listJavaFiles(first.id)).toEqual([path.join(await store.getProjectRoot(first.id), 'Main.java')])
  })

  it('supports nested tree, file, folder, rename and delete operations', async () => {
    const { store } = await makeStore()
    const { id } = await store.createProject('Demo')
    expect(await store.createFolder(id, 'src')).toEqual({ path: 'src' })
    const file = await store.createFile(id, 'src/Main.java', 'class Main {}\n')
    expect(file.revision).toMatch(/^[0-9a-f]{64}$/)
    await store.createFolder(id, 'test')
    expect(await store.renameEntry(id, 'src/Main.java', 'test/App.java')).toEqual({ path: 'test/App.java' })
    expect(await store.getTree(id)).toEqual([
      { path: 'src', name: 'src', kind: 'directory', children: [] },
      { path: 'test', name: 'test', kind: 'directory', children: [{ path: 'test/App.java', name: 'App.java', kind: 'file' }] },
    ])
    expect(await store.listJavaFiles(id)).toEqual([path.join(await store.getProjectRoot(id), 'test/App.java')])
    expect(await store.deleteEntry(id, 'test')).toEqual({ ok: true })
    expect(await store.getTree(id)).toEqual([{ path: 'src', name: 'src', kind: 'directory', children: [] }])
  })

  it('uses revisions to reject stale and concurrent saves while preserving a complete file', async () => {
    const { store } = await makeStore()
    const { id } = await store.createProject('Edits')
    const initial = await store.createFile(id, 'Main.java', 'one')
    const outcomes = await Promise.allSettled([
      store.writeFile(id, 'Main.java', 'two', initial.revision),
      store.writeFile(id, 'Main.java', 'three', initial.revision),
    ])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = outcomes.find(result => result.status === 'rejected')
    expect(rejected.reason.status).toBe(409)
    const winner = outcomes.find(result => result.status === 'fulfilled').value
    expect(await store.readFile(id, 'Main.java')).toEqual(winner)
    await expect(store.writeFile(id, 'Main.java', 'stale', initial.revision)).rejects.toMatchObject({ status: 409 })
    const saved = await store.writeFile(id, 'Main.java', 'final', winner.revision)
    expect(saved.content).toBe('final')
    expect(await fs.readFile(path.join(await store.getProjectRoot(id), 'Main.java'), 'utf8')).toBe('final')
    expect((await fs.readdir(await store.getProjectRoot(id))).filter(name => name.startsWith('.ggjavaez-tmp-'))).toEqual([])
  })

  it('imports relative files and rejects collisions without making a partial project', async () => {
    const { store } = await makeStore()
    const project = await store.importProject('Imported', [
      { path: 'src/Main.java', content: 'class Main {}' },
      { path: 'README.md', content: 'hello' },
    ])
    expect((await store.readFile(project.id, 'src/Main.java')).content).toBe('class Main {}')
    await expect(store.importProject('Bad', [{ path: 'a', content: '' }, { path: 'a/b.java', content: '' }])).rejects.toMatchObject({ status: 400 })
    await expect(store.importProject('Bad', [{ path: 'a.java', content: '' }, { path: 'a.java', content: '' }])).rejects.toMatchObject({ status: 400 })
    expect(await store.listProjects()).toEqual([project])
  })

  it('rejects traversal, host paths, backslashes, reserved paths and invalid IDs', async () => {
    const { store } = await makeStore()
    const { id } = await store.createProject('Safe')
    for (const unsafe of ['../escape', 'src/../escape', '/tmp/escape', 'src\\escape', 'src//escape', 'src/./escape', '.ggjavaez-project.json', 'src/.ggjavaez-tmp-a', 'C:drive']) {
      await expect(store.createFile(id, unsafe, 'x')).rejects.toMatchObject({ status: 400 })
      await expect(store.readFile(id, unsafe)).rejects.toMatchObject({ status: 400 })
    }
    await expect(store.getTree('../bad')).rejects.toMatchObject({ status: 400 })
    await expect(store.createFile(id, 'missing/file.java', '')).rejects.toMatchObject({ status: 404 })
    await expect(store.createFile(id, 'ok.java', '')).resolves.toMatchObject({ path: 'ok.java' })
    await expect(store.createFile(id, 'ok.java', '')).rejects.toMatchObject({ status: 409 })
    await expect(store.renameEntry(id, 'ok.java', '../escape')).rejects.toMatchObject({ status: 400 })
  })

  it('rejects symlinks in reads, trees, Java discovery and recursive deletion', async () => {
    const { root, store } = await makeStore()
    const { id } = await store.createProject('Links')
    const projectRoot = await store.getProjectRoot(id)
    const outside = path.join(root, 'outside.java')
    await fs.writeFile(outside, 'outside')
    await fs.symlink(outside, path.join(projectRoot, 'Link.java'))
    await expect(store.readFile(id, 'Link.java')).rejects.toMatchObject({ status: 400 })
    await expect(store.writeFile(id, 'Link.java', 'bad', 'x')).rejects.toMatchObject({ status: 400 })
    await expect(store.getTree(id)).rejects.toMatchObject({ status: 400 })
    await expect(store.listJavaFiles(id)).rejects.toMatchObject({ status: 400 })
    await fs.mkdir(path.join(projectRoot, 'nested'))
    await fs.symlink(root, path.join(projectRoot, 'nested', 'escape'))
    await expect(store.deleteEntry(id, 'nested')).rejects.toMatchObject({ status: 400 })
    await expect(store.renameEntry(id, 'nested', 'moved')).rejects.toMatchObject({ status: 400 })
    expect(await fs.readFile(outside, 'utf8')).toBe('outside')
  })

  it('keeps project roots isolated and refuses a folder move into itself', async () => {
    const { store } = await makeStore()
    const first = await store.createProject('First')
    const second = await store.createProject('Second')
    await store.createFolder(first.id, 'src')
    await store.createFolder(first.id, 'src/nested')
    await expect(store.renameEntry(first.id, 'src', 'src/nested/moved')).rejects.toMatchObject({ status: 400 })
    await expect(store.readFile(second.id, 'src/nested/moved')).rejects.toMatchObject({ status: 404 })
    expect(await store.getTree(first.id)).toEqual([{ path: 'src', name: 'src', kind: 'directory', children: [{ path: 'src/nested', name: 'nested', kind: 'directory', children: [] }] }])
  })

  it('rejects a symlinked project or workspace root', async () => {
    const { root, store } = await makeStore()
    const { id } = await store.createProject('Safe')
    const projectRoot = await store.getProjectRoot(id)
    await fs.rename(projectRoot, `${projectRoot}-moved`)
    await fs.symlink(`${projectRoot}-moved`, projectRoot)
    await expect(store.getProjectRoot(id)).rejects.toMatchObject({ status: 400 })
    const link = path.join(root, 'managed-link')
    await fs.symlink(path.join(root, '.ggjavaez'), link)
    await expect(new ProjectStore(link).listProjects()).rejects.toMatchObject({ status: 400 })
  })

  it('renames active/inactive filesystem targets without rewriting bytes or Java symbols', async () => {
    const { store } = await makeStore()
    const source = 'package old;\r\npublic class Account { String s = "Account"; }\r\n'
    const binary = Buffer.from([0, 255, 128, 13, 10, 0])
    const { id } = await store.importProject('Targets', [
      { path: 'src/old/Account.java', content: source },
      { path: 'src/old/Inactive.java', content: 'class Inactive {}' },
      { path: 'src/old/data.bin', content: binary.toString('base64'), encoding: 'base64' },
    ])
    const revision = (await store.readFile(id, 'src/old/Account.java')).revision
    await store.renameEntry(id, 'src/old/Inactive.java', 'src/old/Other.java')
    await store.renameEntry(id, 'src/old/Account.java', 'src/old/CustomerAccount.java', { operationId: 'active-file', content: 'unsaved draft must never be written' })
    await store.renameEntry(id, 'src/old', 'src/new')
    expect(await store.readFile(id, 'src/new/CustomerAccount.java')).toEqual({ path: 'src/new/CustomerAccount.java', content: source, revision })
    expect((await store.readFile(id, 'src/new/Other.java')).content).toBe('class Inactive {}')
    expect(await fs.readFile(path.join(await store.getProjectRoot(id), 'src/new/data.bin'))).toEqual(binary)
  })

  it.each(['CON.java', 'COM1.txt', 'bad?.java', 'trailing.', 'trailing ', 'folder/AUX.java'])('rejects new portable destination %s while preserving the source', async destination => {
    const { store } = await makeStore()
    const { id } = await store.importProject('Invalid', [{ path: 'Main.java', content: 'class Main {}' }])
    await store.createFolder(id, 'folder')
    await expect(store.renameEntry(id, 'Main.java', destination)).rejects.toMatchObject({ status: 400 })
    await expect(store.createFile(id, destination)).rejects.toMatchObject({ status: 400 })
    await expect(store.createFolder(id, destination)).rejects.toMatchObject({ status: 400 })
    expect((await store.readFile(id, 'Main.java')).content).toBe('class Main {}')
  })

  it('keeps legacy imports readable, saveable, deleteable and movable to portable names', async () => {
    const { store } = await makeStore()
    const { id } = await store.importProject('Legacy', [{ path: 'CON.java', content: 'old' }, { path: 'trailing.', content: 'delete me' }])
    expect((await store.getTree(id)).map(entry => entry.path)).toContain('CON.java')
    const old = await store.readFile(id, 'CON.java')
    await store.writeFile(id, 'CON.java', 'saved', old.revision)
    await store.renameEntry(id, 'CON.java', 'Main.java')
    expect((await store.readFile(id, 'Main.java')).content).toBe('saved')
    await store.deleteEntry(id, 'trailing.')
  })

  it('handles no-op and file/folder case-only moves using actual directory spelling', async () => {
    const { store } = await makeStore()
    const { id } = await store.importProject('Case', [{ path: 'src/Account.java', content: 'same bytes' }])
    expect(await store.renameEntry(id, 'src/Account.java', 'src/Account.java')).toEqual({ path: 'src/Account.java' })
    const noop = await store.renameEntry(id, 'src', 'src', { operationId: 'noop' })
    expect(noop).toEqual({ path: 'src', from: 'src', to: 'src', kind: 'directory', operationId: 'noop', generation: 0 })
    const moved = await store.renameEntry(id, 'src/Account.java', 'src/account.java', { operationId: 'case-file' })
    expect(moved.generation).toBe(1)
    expect(await store.renameEntry(id, 'src', 'SRC', { operationId: 'case-folder' })).toMatchObject({ kind: 'directory', generation: 2 })
    expect(await store.getTree(id)).toEqual([{ path: 'SRC', name: 'SRC', kind: 'directory', children: [{ path: 'SRC/account.java', name: 'account.java', kind: 'file' }] }])
    expect((await store.readFile(id, 'SRC/account.java')).content).toBe('same bytes')
    await expect(store.renameEntry(id, 'missing', 'missing')).rejects.toMatchObject({ status: 404 })
    await expect(store.createFile(id, 'src/New.java')).rejects.toMatchObject({ status: 400 })
  })

  it('rejects case/normalization aliases and occupied file/folder/package destinations on every host', async () => {
    const { store } = await makeStore()
    const { id } = await store.importProject('Conflict', [
      { path: 'src/old/Main.java', content: 'old' }, { path: 'src/new/Main.java', content: 'new' }, { path: 'café.txt', content: 'accent' },
    ])
    for (const destination of ['src/new', 'src/NEW', 'cafe\u0301.txt']) {
      await expect(store.renameEntry(id, 'src/old', destination)).rejects.toMatchObject({ status: 409 })
    }
    await expect(store.renameEntry(id, 'src/old/Main.java', 'src/new/Main.java')).rejects.toMatchObject({ status: 409 })
    await expect(store.createFile(id, 'CAFÉ.TXT')).rejects.toMatchObject({ status: 409 })
    await expect(store.createFolder(id, 'src/NEW')).rejects.toMatchObject({ status: 409 })
    await expect(store.renameEntry(id, 'src/old/Main.java', 'missing/Main.java')).rejects.toMatchObject({ status: 404 })
    expect((await store.readFile(id, 'src/old/Main.java')).content).toBe('old')
    expect((await store.readFile(id, 'src/new/Main.java')).content).toBe('new')
  })

  it('persists nonce receipts, replays lost responses, isolates projects, and rejects nonce reuse', async () => {
    const { store } = await makeStore()
    const first = await store.importProject('First', [{ path: 'A.java', content: 'one' }])
    const second = await store.importProject('Second', [{ path: 'A.java', content: 'two' }])
    const receipt = await store.renameEntry(first.id, 'A.java', 'B.java', { operationId: 'move-1' })
    expect(receipt).toEqual({ path: 'B.java', from: 'A.java', to: 'B.java', kind: 'file', operationId: 'move-1', generation: 1 })
    const restarted = new ProjectStore(store.root)
    expect(await restarted.renameEntry(first.id, 'A.java', 'B.java', { operationId: 'move-1' })).toEqual(receipt)
    await restarted.createFile(first.id, 'A.java', 'new source')
    expect(await restarted.renameEntry(first.id, 'A.java', 'B.java', { operationId: 'move-1' })).toEqual(receipt)
    expect((await restarted.readFile(first.id, 'A.java')).content).toBe('new source')
    await expect(restarted.renameEntry(first.id, 'A.java', 'C.java', { operationId: 'move-1' })).rejects.toMatchObject({ status: 409 })
    expect(await restarted.renameEntry(second.id, 'A.java', 'B.java', { operationId: 'move-1' })).toMatchObject({ generation: 1 })
    expect(JSON.stringify(await restarted.getTree(first.id))).not.toContain(store.root)
    expect(JSON.stringify(receipt)).not.toContain(store.root)
  })

  it('serializes competing store instances and preserves the destination winner', async () => {
    const { store } = await makeStore()
    const { id } = await store.importProject('Queue', [{ path: 'A.java', content: 'A' }, { path: 'B.java', content: 'B' }])
    const other = new ProjectStore(store.root)
    const outcomes = await Promise.allSettled([
      store.renameEntry(id, 'A.java', 'Winner.java', { operationId: 'first' }),
      other.renameEntry(id, 'B.java', 'Winner.java', { operationId: 'second' }),
    ])
    expect(outcomes.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
    expect(outcomes[1].reason.status).toBe(409)
    expect((await other.readFile(id, 'Winner.java')).content).toBe('A')
    expect((await other.readFile(id, 'B.java')).content).toBe('B')
  })

  it('rolls back a failed final move, preserving bytes and allowing the same nonce to retry', async () => {
    const { store } = await makeStore()
    const { id } = await store.importProject('Rollback', [{ path: 'A.java', content: 'original\r\n' }])
    const root = await store.getProjectRoot(id)
    let failOnce = true
    vi.mocked(fs.rename).mockImplementation(async (from, to) => {
      if (to === path.join(root, 'a.java') && failOnce) {
        failOnce = false
        throw Object.assign(new Error(`native failure exposes ${root}`), { code: 'EIO' })
      }
      return nativeFs.rename(from, to)
    })
    await expect(store.renameEntry(id, 'A.java', 'a.java', { operationId: 'rollback' })).rejects.toMatchObject({ status: 500, message: 'Rename failed; the original entry was restored' })
    expect((await store.readFile(id, 'A.java')).content).toBe('original\r\n')
    expect(await fs.readdir(root)).toEqual(expect.arrayContaining(['A.java']))
    expect((await fs.readdir(root)).some(name => name.startsWith('.ggjavaez-tmp-'))).toBe(false)
    expect(await store.renameEntry(id, 'A.java', 'a.java', { operationId: 'rollback' })).toMatchObject({ generation: 1 })
  })

  it('recovers a completed move after receipt persistence failed', async () => {
    const { store } = await makeStore()
    const { id } = await store.importProject('Lost commit', [{ path: 'A.java', content: 'original' }])
    const journalPath = path.join(store.journalRoot, `${id}.json`)
    let journalWrites = 0
    vi.mocked(fs.rename).mockImplementation(async (from, to) => {
      if (to === journalPath && ++journalWrites === 2) throw Object.assign(new Error('receipt disk failure'), { code: 'EIO' })
      return nativeFs.rename(from, to)
    })
    await expect(store.renameEntry(id, 'A.java', 'B.java', { operationId: 'lost-commit' })).rejects.toMatchObject({ status: 503 })
    const restarted = new ProjectStore(store.root)
    expect(await restarted.renameEntry(id, 'A.java', 'B.java', { operationId: 'lost-commit' })).toMatchObject({ generation: 1 })
    expect((await restarted.readFile(id, 'B.java')).content).toBe('original')
  })

  it('keeps a pending move recoverable when an initial rollback also fails', async () => {
    const { store } = await makeStore()
    const { id } = await store.importProject('Retry rollback', [{ path: 'A.java', content: 'preserved' }])
    const root = await store.getProjectRoot(id)
    let blockFinal = true
    let blockRollback = true
    vi.mocked(fs.rename).mockImplementation(async (from, to) => {
      if (to === path.join(root, 'B.java') && blockFinal) {
        blockFinal = false
        throw Object.assign(new Error('final move blocked'), { code: 'EIO' })
      }
      if (to === path.join(root, 'A.java') && blockRollback) {
        blockRollback = false
        throw Object.assign(new Error('rollback blocked'), { code: 'EIO' })
      }
      return nativeFs.rename(from, to)
    })
    await expect(store.renameEntry(id, 'A.java', 'B.java', { operationId: 'retry-rollback' })).rejects.toMatchObject({ status: 503 })
    const restarted = new ProjectStore(store.root)
    // Reads recover the original path before exposing any incomplete state.
    expect((await restarted.readFile(id, 'A.java')).content).toBe('preserved')
    expect(await restarted.renameEntry(id, 'A.java', 'B.java', { operationId: 'retry-rollback' })).toMatchObject({ generation: 1 })
  })

  it('sanitizes journal preparation failures and leaves all project bytes in place', async () => {
    const { store } = await makeStore()
    const { id } = await store.importProject('Prepare failure', [{ path: 'A.java', content: 'untouched' }])
    vi.mocked(fs.rename).mockImplementation(async (from, to) => {
      if (to === path.join(store.journalRoot, `${id}.json`)) throw Object.assign(new Error(`disk denied ${store.root}`), { code: 'EACCES' })
      return nativeFs.rename(from, to)
    })
    await expect(store.renameEntry(id, 'A.java', 'B.java', { operationId: 'prepare-failure' })).rejects.toMatchObject({ status: 500, message: 'Project rename failed; retry with the same operation ID' })
    expect((await store.readFile(id, 'A.java')).content).toBe('untouched')
    await expect(store.readFile(id, 'B.java')).rejects.toMatchObject({ status: 404 })
    expect((await fs.readdir(store.journalRoot)).some(name => name.startsWith('.ggjavaez-tmp-'))).toBe(false)
  })

  it('cleans an incomplete journal temporary when syncing intent fails before any move', async () => {
    const { store } = await makeStore()
    const { id } = await store.importProject('Sync failure', [{ path: 'A.java', content: 'unchanged' }])
    vi.mocked(fs.open).mockImplementation(async (target, ...options) => {
      const handle = await nativeFs.open(target, ...options)
      if (typeof target === 'string' && target.startsWith(path.join(store.journalRoot, '.ggjavaez-tmp-'))) {
        handle.sync = async () => { throw Object.assign(new Error('sync failed'), { code: 'EIO' }) }
      }
      return handle
    })
    await expect(store.renameEntry(id, 'A.java', 'B.java', { operationId: 'sync-failure' })).rejects.toMatchObject({ status: 500 })
    expect((await store.readFile(id, 'A.java')).content).toBe('unchanged')
    expect(await fs.readdir(store.journalRoot)).toEqual([])
  })

  it('reports missing recovery parents as uncertainty and leaves the moved bytes untouched', async () => {
    const { store } = await makeStore()
    const { id } = await store.importProject('Missing parent', [{ path: 'src/A.java', content: 'original' }])
    const pending = await seedPending(store, id, 'src/A.java', 'B.java')
    await fs.rename(pending.source, pending.destination)
    await fs.rmdir(path.dirname(pending.source))
    await expect(new ProjectStore(store.root).renameEntry(id, 'src/A.java', 'B.java', { operationId: 'crash-test' })).rejects.toMatchObject({ status: 409 })
    expect(await fs.readFile(pending.destination, 'utf8')).toBe('original')
  })

  it.each(['prepared', 'staged', 'completed', 'completed-case-only'])('recovers a %s journal across store restart', async phase => {
    const { store } = await makeStore()
    const { id } = await store.importProject('Recovery', [{ path: 'src/A.java', content: 'bytes' }])
    const pending = await seedPending(store, id, 'src/A.java', phase === 'completed-case-only' ? 'src/a.java' : 'src/B.java')
    if (phase !== 'prepared') await fs.rename(pending.source, pending.temporary)
    if (phase.startsWith('completed')) await fs.rename(pending.temporary, pending.destination)
    const restarted = new ProjectStore(store.root)
    expect(await restarted.renameEntry(id, pending.receipt.from, pending.receipt.to, { operationId: 'crash-test' })).toEqual(pending.receipt)
    expect((await restarted.readFile(id, pending.receipt.to)).content).toBe('bytes')
    expect((await fs.readdir(path.dirname(pending.source))).some(name => name.startsWith('.ggjavaez-tmp-'))).toBe(false)
  })

  it('rolls back a staged crash with an occupied destination without overwriting either file', async () => {
    const { store } = await makeStore()
    const { id } = await store.importProject('Occupied recovery', [{ path: 'A.java', content: 'source' }])
    const pending = await seedPending(store, id, 'A.java', 'B.java')
    await fs.rename(pending.source, pending.temporary)
    await fs.writeFile(pending.destination, 'external destination')
    await expect(new ProjectStore(store.root).renameEntry(id, 'A.java', 'B.java', { operationId: 'crash-test' })).rejects.toMatchObject({ status: 409 })
    expect(await fs.readFile(pending.source, 'utf8')).toBe('source')
    expect(await fs.readFile(pending.destination, 'utf8')).toBe('external destination')
  })

  it('fails closed on uncertain identity, corrupt journals, symlinked journals and invalid nonces', async () => {
    const { root, store } = await makeStore()
    const { id } = await store.importProject('Uncertain', [{ path: 'A.java', content: 'original' }])
    for (const operationId of ['', '../bad', 'x'.repeat(129), 123]) {
      await expect(store.renameEntry(id, 'A.java', 'B.java', { operationId })).rejects.toMatchObject({ status: 400 })
    }
    const pending = await seedPending(store, id, 'A.java', 'B.java')
    await fs.rename(pending.source, pending.destination)
    await fs.writeFile(pending.source, 'replacement')
    await expect(new ProjectStore(store.root).createFile(id, 'C.java')).rejects.toMatchObject({ status: 409 })
    expect(await fs.readFile(pending.source, 'utf8')).toBe('replacement')
    expect(await fs.readFile(pending.destination, 'utf8')).toBe('original')
    const journalPath = path.join(store.journalRoot, `${id}.json`)
    await fs.writeFile(journalPath, '{invalid')
    await expect(store.renameEntry(id, 'A.java', 'C.java')).rejects.toMatchObject({ status: 409 })
    const outside = path.join(root, 'outside.json')
    await fs.writeFile(outside, '{}')
    await fs.rm(journalPath)
    await fs.symlink(outside, journalPath)
    await expect(store.renameEntry(id, 'A.java', 'C.java')).rejects.toMatchObject({ status: 400 })
    expect(await fs.readFile(outside, 'utf8')).toBe('{}')
  })

  it('bounds receipt retention and never retries an evicted nonce by moving a missing source', async () => {
    const { store } = await makeStore()
    const { id } = await store.importProject('Bound', [{ path: 'File0.java', content: 'constant bytes' }])
    let last
    for (let index = 0; index < 130; index++) {
      last = await store.renameEntry(id, `File${index}.java`, `File${index + 1}.java`, { operationId: `operation-${index}` })
    }
    const journal = JSON.parse(await fs.readFile(path.join(store.journalRoot, `${id}.json`), 'utf8'))
    expect(journal.receipts).toHaveLength(128)
    expect(journal.generation).toBe(130)
    expect(await store.renameEntry(id, last.from, last.to, { operationId: last.operationId })).toEqual(last)
    await expect(store.renameEntry(id, 'File0.java', 'File1.java', { operationId: 'operation-0' })).rejects.toMatchObject({ status: 404 })
    expect((await store.readFile(id, 'File130.java')).content).toBe('constant bytes')
  })
})
