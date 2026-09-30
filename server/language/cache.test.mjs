import { test } from 'vitest'
import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pruneLanguageCaches } from './cache.mjs'

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'ggjava-language-cache-'))
  try { await run(root, join(root, 'language')) }
  finally { await rm(root, { recursive: true, force: true }) }
}
async function cache(path, timestamp) {
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'index'), 'generated')
  const time = new Date(timestamp)
  await utimes(path, time, time)
  return path
}
async function absent(path) {
  await assert.rejects(lstat(path), { code: 'ENOENT' })
}

test('global default budget retains active and seven newest across projects, touching incoming recency', async () => {
  await fixture(async (_, language) => {
    const paths = []
    for (let index = 0; index < 12; index++) {
      paths.push(await cache(join(language, 'data', `project-${index % 3}`, `jdtls-v-${index}`), 1000 + index * 1000))
    }
    const active = paths[0]
    const result = await pruneLanguageCaches(language, { dataRoot: active })
    assert.equal(result.retainedDataCaches.length, 8)
    assert.equal(result.removedDataCaches.length, 4)
    assert.deepEqual(new Set(result.retainedDataCaches), new Set([active, ...paths.slice(5)]))
    assert.ok((await lstat(active)).mtimeMs > 12000)
    for (const path of paths.slice(1, 5)) await absent(path)
    // On the next launch the formerly incoming cache is now recent enough to reuse.
    await pruneLanguageCaches(language, { dataRoot: paths[11] })
    assert.ok((await lstat(active)).isDirectory())
  })
})

test('zero budget still protects exact active data and config paths; only numeric configs are removed', async () => {
  await fixture(async (_, language) => {
    const active = await cache(join(language, 'data', 'p', 'jdtls-active'), 1000)
    const inactive = await cache(join(language, 'data', 'p', 'jdtls-inactive'), 2000)
    const configRoot = await cache(join(language, 'config', '105'), 1000)
    const oldConfig = await cache(join(language, 'config', '104'), 2000)
    const namedConfig = await cache(join(language, 'config', 'config_mac'), 3000)
    await writeFile(join(language, 'config', '106'), 'unrelated numeric file')
    const result = await pruneLanguageCaches(language, { dataRoot: active, configRoot, maxDataCaches: 0 })
    assert.deepEqual(result.retainedDataCaches, [active])
    assert.deepEqual(result.removedConfigCaches, [oldConfig])
    await absent(inactive)
    assert.equal(await readFile(join(configRoot, 'index'), 'utf8'), 'generated')
    assert.equal(await readFile(join(namedConfig, 'index'), 'utf8'), 'generated')
    assert.equal(await readFile(join(language, 'config', '106'), 'utf8'), 'unrelated numeric file')
  })
})

test('unrelated files, directories, source, tools and symlink candidates remain untouched', async () => {
  await fixture(async (root, language) => {
    const project = join(language, 'data', 'p')
    const outside = await cache(join(root, 'projects', 'source'), 1000)
    await mkdir(project, { recursive: true })
    await mkdir(join(language, 'config'), { recursive: true })
    await mkdir(join(language, 'tools'), { recursive: true })
    await writeFile(join(language, 'tools', 'jdtls.jar'), 'tool')
    await writeFile(join(project, 'jdtls-file'), 'not a directory')
    const unrelated = await cache(join(project, 'source'), 1000)
    const malformed = await cache(join(project, 'jdtls-'), 1000)
    const links = [join(project, 'jdtls-link'), join(language, 'data', 'linked-project'), join(language, 'config', '1')]
    for (const path of links) await symlink(outside, path, 'dir')
    await cache(join(project, 'jdtls-old'), 1000)
    await pruneLanguageCaches(language, { dataRoot: links[0], configRoot: links[2], maxDataCaches: 0 })
    for (const path of links) assert.ok((await lstat(path)).isSymbolicLink())
    for (const path of [outside, unrelated, malformed]) assert.equal(await readFile(join(path, 'index'), 'utf8'), 'generated')
    assert.equal(await readFile(join(project, 'jdtls-file'), 'utf8'), 'not a directory')
    assert.equal(await readFile(join(language, 'tools', 'jdtls.jar'), 'utf8'), 'tool')
    await absent(join(project, 'jdtls-old'))
  })
})

test('missing trees are harmless and symlinked language/data/config roots are not traversed', async () => {
  await fixture(async (root, language) => {
    assert.deepEqual(await pruneLanguageCaches(language, {}), { removedDataCaches: [], removedConfigCaches: [], retainedDataCaches: [] })
    const outside = join(root, 'outside')
    const retained = await cache(join(outside, 'p', 'jdtls-old'), 1000)
    const numeric = await cache(join(outside, '1'), 1000)
    await mkdir(language)
    await symlink(outside, join(language, 'data'), 'dir')
    await symlink(outside, join(language, 'config'), 'dir')
    await pruneLanguageCaches(language, { maxDataCaches: 0 })
    assert.ok((await lstat(retained)).isDirectory())
    assert.ok((await lstat(numeric)).isDirectory())
    const linkedRoot = join(root, 'linked-language')
    await symlink(language, linkedRoot, 'dir')
    await pruneLanguageCaches(linkedRoot, { maxDataCaches: 0 })
    assert.deepEqual(await readdir(outside), ['1', 'p'])
  })
})

test('active paths outside the generated namespace are untouched and invalid budgets fail before mutation', async () => {
  await fixture(async (root, language) => {
    const outside = await cache(join(root, 'project-source'), 1000)
    const generated = await cache(join(language, 'data', 'p', 'jdtls-old'), 1000)
    for (const maxDataCaches of [-1, 1.5, Infinity, NaN]) {
      await assert.rejects(pruneLanguageCaches(language, { dataRoot: outside, maxDataCaches }), RangeError)
    }
    assert.ok((await lstat(generated)).isDirectory())
    await pruneLanguageCaches(language, { dataRoot: outside, configRoot: outside, maxDataCaches: 0 })
    await absent(generated)
    assert.equal((await lstat(outside)).mtimeMs, 1000)
  })
})
