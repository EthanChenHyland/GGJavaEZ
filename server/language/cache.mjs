import { lstat, readdir, rm, utimes } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const generatedDataName = /^jdtls-[A-Za-z0-9][A-Za-z0-9._-]*$/
const generatedConfigName = /^\d+$/

async function directory(path) {
  try {
    const stat = await lstat(path)
    return stat.isDirectory() && !stat.isSymbolicLink() ? stat : null
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function entries(path) {
  return await directory(path) ? readdir(path, { withFileTypes: true }) : []
}

// The caller serializes this with JDT disposal/launch. Only generated cache
// directories are eligible; no symlink is traversed to discover candidates.
export async function pruneLanguageCaches(languageRoot, { dataRoot, configRoot, maxDataCaches = 8 } = {}) {
  if (!Number.isSafeInteger(maxDataCaches) || maxDataCaches < 0) {
    throw new RangeError('maxDataCaches must be a nonnegative safe integer')
  }
  const root = resolve(languageRoot)
  const activeData = dataRoot == null ? null : resolve(dataRoot)
  const activeConfig = configRoot == null ? null : resolve(configRoot)
  const result = { removedDataCaches: [], removedConfigCaches: [], retainedDataCaches: [] }
  if (!await directory(root)) return result

  const caches = []
  const data = join(root, 'data')
  for (const project of await entries(data)) {
    if (!project.isDirectory() || project.isSymbolicLink()) continue
    const projectRoot = join(data, project.name)
    for (const entry of await entries(projectRoot)) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !generatedDataName.test(entry.name)) continue
      const path = join(projectRoot, entry.name)
      const stat = await directory(path)
      if (!stat) continue
      let mtimeMs = stat.mtimeMs
      if (path === activeData) {
        const now = new Date()
        await utimes(path, now, now)
        mtimeMs = now.getTime()
      }
      caches.push({ path, mtimeMs })
    }
  }
  caches.sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path))
  const protectedCaches = caches.filter(cache => cache.path === activeData)
  const retained = new Set([
    ...protectedCaches.map(cache => cache.path),
    ...caches.filter(cache => cache.path !== activeData)
      .slice(0, Math.max(0, maxDataCaches - protectedCaches.length)).map(cache => cache.path),
  ])
  for (const { path } of caches) {
    if (retained.has(path)) result.retainedDataCaches.push(path)
    else if (await directory(path)) {
      await rm(path, { recursive: true, force: true })
      result.removedDataCaches.push(path)
    }
  }

  const config = join(root, 'config')
  for (const entry of await entries(config)) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !generatedConfigName.test(entry.name)) continue
    const path = join(config, entry.name)
    if (path !== activeConfig && await directory(path)) {
      await rm(path, { recursive: true, force: true })
      result.removedConfigCaches.push(path)
    }
  }
  return result
}
