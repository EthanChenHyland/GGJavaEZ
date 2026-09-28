import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ProjectStore } from './projects.mjs'

const temporaryRoots = []

async function makeStore() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-java-projects-'))
  temporaryRoots.push(root)
  return { root, store: new ProjectStore(path.join(root, '.ggjavaez')) }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

describe('ProjectStore', () => {
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
})
