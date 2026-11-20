import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProjectStore } from './projects.mjs'
import { PROJECT_META } from './project-paths.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), 'vj-project-summary-'))
  roots.push(root)
  const store = new ProjectStore(join(root, 'managed'))
  const summary = await store.createProject('Saved project')
  return { root, store, summary, directory: join(store.projectsRoot, summary.id) }
}

describe('single saved-project summary lookup', () => {
  it('returns the existing exact summary without validating unrelated catalog entries', async () => {
    const { store, summary } = await fixture()
    const unrelated = join(store.projectsRoot, randomUUID())
    await fs.mkdir(unrelated)
    await fs.writeFile(join(unrelated, PROJECT_META), JSON.stringify({ id: 'wrong', name: 'Invalid unrelated metadata', createdAt: summary.createdAt }))
    // Demonstrate that this real on-disk catalog fails the existing list path;
    // lookup must still validate and return only the requested saved project.
    await expect(store.listProjects()).rejects.toMatchObject({ status: 400, message: 'Invalid project metadata' })
    expect(await store.projectSummary(summary.id)).toEqual(summary)
    expect(Object.keys(await store.projectSummary(summary.id)).sort()).toEqual(['createdAt', 'id', 'name'])
  })

  it('rereads and revalidates metadata on every lookup rather than caching a previous summary', async () => {
    const { store, summary, directory } = await fixture()
    const metadata = join(directory, PROJECT_META)
    const first = await store.projectSummary(summary.id)
    const changed = { ...summary, name: 'Changed on disk' }
    await fs.writeFile(metadata, JSON.stringify(changed))
    expect(await store.projectSummary(summary.id)).toEqual(changed)
    expect(first).toEqual(summary)
    await fs.writeFile(metadata, JSON.stringify({ ...changed, id: randomUUID() }))
    await expect(store.projectSummary(summary.id)).rejects.toMatchObject({ status: 400, message: 'Invalid project metadata' })
  })

  it('preserves invalid-ID and missing-project rejection', async () => {
    const { store } = await fixture()
    for (const id of ['', '../outside', 'not-a-uuid', '00000000-0000-4000-8000-000000000000/extra', null, 7]) {
      await expect(store.projectSummary(id)).rejects.toMatchObject({ status: 400, message: 'Invalid project ID' })
    }
    await expect(store.projectSummary(randomUUID())).rejects.toMatchObject({ status: 404 })
  })

  it('rejects a UUID project directory replaced by a symlink after a valid lookup', async () => {
    const { root, store, summary, directory } = await fixture()
    expect(await store.projectSummary(summary.id)).toEqual(summary)
    const outside = join(root, 'outside-project')
    await fs.rename(directory, outside)
    await fs.symlink(outside, directory, 'dir')
    await expect(store.projectSummary(summary.id)).rejects.toMatchObject({ status: 400, message: 'Symlinks are not allowed in projects' })
  })

  it('rejects missing or symlinked metadata after a previously valid lookup', async () => {
    const { root, store, summary, directory } = await fixture()
    expect(await store.projectSummary(summary.id)).toEqual(summary)
    const metadata = join(directory, PROJECT_META), outside = join(root, 'outside-metadata.json')
    await fs.rename(metadata, outside)
    await expect(store.projectSummary(summary.id)).rejects.toMatchObject({ status: 404 })
    await fs.symlink(outside, metadata, 'file')
    await expect(store.projectSummary(summary.id)).rejects.toMatchObject({ status: 400, message: 'Symlinks are not allowed in projects' })
  })
})
