import { randomUUID, createHash } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { PROJECT_META as META, PROJECT_TEMP_PREFIX as TEMP_PREFIX, projectPathParts as relativeParts, portableNameKey } from './project-paths.mjs'

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const OPERATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const TEMP_NAME_PATTERN = new RegExp(`^${TEMP_PREFIX}${ID_PATTERN.source.slice(1, -1)}$`)
const RECEIPT_LIMIT = 128
const workspaceQueues = new Map()
const STARTER_SOURCE = `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, Visual Java!");
    }
}
`

function fail(status, message) {
  const error = new Error(message)
  error.status = status
  error.statusCode = status
  throw error
}

function validName(name) {
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 80 || /[\x00-\x1f\x7f/\\]/.test(name)) {
    fail(400, 'Invalid project name')
  }
  return name.trim()
}

function revision(content) {
  return createHash('sha256').update(content).digest('hex')
}

function within(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

async function statNoLink(target, missing = false) {
  let stat
  try {
    stat = await fs.lstat(target)
  } catch (error) {
    if (error.code === 'ENOENT' && missing) return null
    if (error.code === 'ENOENT') fail(404, 'Project entry not found')
    throw error
  }
  if (stat.isSymbolicLink()) fail(400, 'Symlinks are not allowed in projects')
  if (!stat.isFile() && !stat.isDirectory()) fail(400, 'Unsupported project entry')
  return stat
}

async function syncDirectory(directory) {
  // Node cannot fsync directories on some Windows filesystems. File data is
  // still synced; native power-loss durability there is not promised.
  let handle
  try {
    handle = await fs.open(directory, constants.O_RDONLY)
    await handle.sync()
  } catch (error) {
    if (process.platform !== 'win32' || !['EISDIR', 'EPERM', 'EACCES', 'EINVAL', 'ENOTSUP'].includes(error.code)) throw error
  } finally {
    await handle?.close()
  }
}

async function atomicReplace(target, content) {
  const directory = path.dirname(target)
  const temporary = path.join(directory, `${TEMP_PREFIX}${randomUUID()}`)
  const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    try {
      await handle.writeFile(content, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fs.rename(temporary, target)
    await syncDirectory(directory)
  } finally {
    await fs.rm(temporary, { force: true })
  }
}

async function atomicCreate(target, content) {
  const directory = path.dirname(target)
  const temporary = path.join(directory, `${TEMP_PREFIX}${randomUUID()}`)
  const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    await handle.writeFile(content, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    try {
      await fs.link(temporary, target)
    } catch (error) {
      if (error.code === 'EEXIST') fail(409, 'Project entry already exists')
      throw error
    }
    await syncDirectory(directory)
  } finally {
    await fs.rm(temporary, { force: true })
  }
}

async function verifyTreeNoLinks(target) {
  const stat = await statNoLink(target)
  if (stat.isDirectory()) {
    for (const name of await fs.readdir(target)) await verifyTreeNoLinks(path.join(target, name))
  }
}

export class ProjectStore {
  constructor(workspaceRoot) {
    if (typeof workspaceRoot !== 'string' || !workspaceRoot) throw new TypeError('A managed workspace root is required')
    this.root = path.resolve(workspaceRoot)
    this.projectsRoot = path.join(this.root, 'projects')
    this.journalRoot = path.join(this.root, 'rename-journal')
  }

  async #locked(operation) {
    // Share the existing serialization boundary across store instances in this
    // process. The bridge remains responsible for build/manifest barriers.
    const previous = workspaceQueues.get(this.root) ?? Promise.resolve()
    const next = previous.then(operation, operation)
    const tail = next.catch(() => {})
    workspaceQueues.set(this.root, tail)
    void tail.then(() => { if (workspaceQueues.get(this.root) === tail) workspaceQueues.delete(this.root) })
    return next
  }

  async #ready() {
    await fs.mkdir(this.root, { recursive: true })
    const rootStat = await statNoLink(this.root)
    if (!rootStat.isDirectory()) fail(400, 'Managed workspace is not a directory')
    await fs.mkdir(this.projectsRoot, { recursive: true })
    const projectsStat = await statNoLink(this.projectsRoot)
    if (!projectsStat.isDirectory()) fail(400, 'Projects root is not a directory')
    if (!within(await fs.realpath(this.root), await fs.realpath(this.projectsRoot))) fail(400, 'Projects root escapes managed workspace')
  }

  async #project(id) {
    await this.#ready()
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) fail(400, 'Invalid project ID')
    const projectRoot = path.join(this.projectsRoot, id)
    const stat = await statNoLink(projectRoot)
    if (!stat.isDirectory()) fail(404, 'Project not found')
    if (!within(await fs.realpath(this.projectsRoot), await fs.realpath(projectRoot))) fail(400, 'Project escapes managed workspace')
    const metaPath = path.join(projectRoot, META)
    const metaStat = await statNoLink(metaPath)
    if (!metaStat.isFile()) fail(404, 'Project not found')
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'))
    if (meta.id !== id || typeof meta.name !== 'string' || typeof meta.createdAt !== 'string') fail(400, 'Invalid project metadata')
    return { root: projectRoot, summary: meta }
  }

  async #entry(projectRoot, relativePath, { allowMissing = false, parentOnly = false } = {}) {
    const parts = relativeParts(relativePath)
    let current = projectRoot
    const last = parentOnly ? parts.length - 1 : parts.length
    for (let index = 0; index < last; index++) {
      current = path.join(current, parts[index])
      const stat = await statNoLink(current)
      if (index < last - 1 && !stat.isDirectory()) fail(400, 'Path parent is not a directory')
    }
    if (parentOnly) {
      const parentStat = await statNoLink(current)
      if (!parentStat.isDirectory()) fail(400, 'Path parent is not a directory')
    }
    const target = path.join(projectRoot, ...parts)
    if (!within(projectRoot, target)) fail(400, 'Path escapes project')
    return { target, stat: await statNoLink(target, allowMissing) }
  }

  async #read(projectRoot, relativePath) {
    const { target, stat } = await this.#entry(projectRoot, relativePath)
    if (!stat.isFile()) fail(400, 'Project entry is not a file')
    const handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      if (!(await handle.stat()).isFile()) fail(400, 'Project entry is not a file')
      const content = await handle.readFile('utf8')
      return { path: relativePath, content, revision: revision(content) }
    } finally {
      await handle.close()
    }
  }

  async #destination(root, relativePath, sourcePath) {
    const parts = relativeParts(relativePath, { portable: true })
    let parent = root
    // Do not return a spelling that names a different path on a case-sensitive
    // host. Existing parent components must have their actual directory spelling.
    for (const part of parts.slice(0, -1)) {
      const names = await fs.readdir(parent)
      if (!names.includes(part)) {
        if (names.some(name => portableNameKey(name) === portableNameKey(part))) fail(400, 'Path parent spelling does not match the project')
        fail(404, 'Project entry not found')
      }
      parent = path.join(parent, part)
      if (!(await statNoLink(parent)).isDirectory()) fail(400, 'Path parent is not a directory')
    }
    const name = parts.at(-1)
    const allowedSource = sourcePath && path.posix.dirname(sourcePath) === path.posix.dirname(relativePath) ? path.posix.basename(sourcePath) : null
    const collisions = (await fs.readdir(parent)).filter(existing => portableNameKey(existing) === portableNameKey(name))
    if (collisions.some(existing => existing !== allowedSource)) fail(409, 'Project entry already exists')
    const entry = await this.#entry(root, relativePath, { parentOnly: true, allowMissing: true })
    return { ...entry, identity: entry.stat ? await this.#identity(entry.target) : null }
  }

  async #journal(id) {
    await fs.mkdir(this.journalRoot, { recursive: true })
    if (!(await statNoLink(this.journalRoot)).isDirectory()) fail(400, 'Invalid rename journal')
    const target = path.join(this.journalRoot, `${id}.json`)
    const stat = await statNoLink(target, true)
    if (!stat) return { version: 1, generation: 0, receipts: [], pending: null }
    if (!stat.isFile() || stat.size > 512 * 1024) fail(409, 'Invalid rename journal; recovery required')
    const handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW)
    let journal
    try { journal = JSON.parse(await handle.readFile('utf8')) } catch { fail(409, 'Invalid rename journal; recovery required') } finally { await handle.close() }
    try {
      if (journal.version !== 1 || !Number.isSafeInteger(journal.generation) || journal.generation < 0 || !Array.isArray(journal.receipts) || journal.receipts.length > RECEIPT_LIMIT) throw new Error()
      const seen = new Set()
      const validateReceipt = receipt => {
        if (!receipt || Object.keys(receipt).sort().join(',') !== 'from,generation,kind,operationId,path,to' || receipt.path !== receipt.to || !['file', 'directory'].includes(receipt.kind) || !Number.isSafeInteger(receipt.generation) || receipt.generation < 0) throw new Error()
        relativeParts(receipt.from)
        relativeParts(receipt.to, { portable: true })
        if (receipt.operationId !== null && (typeof receipt.operationId !== 'string' || !OPERATION_PATTERN.test(receipt.operationId))) throw new Error()
      }
      for (const receipt of journal.receipts) {
        validateReceipt(receipt)
        if (!receipt.operationId || seen.has(receipt.operationId) || receipt.generation > journal.generation) throw new Error()
        seen.add(receipt.operationId)
      }
      if (journal.pending !== null) {
        const { receipt, temporary, identity } = journal.pending
        validateReceipt(receipt)
        if (receipt.from === receipt.to || receipt.generation !== journal.generation + 1 || seen.has(receipt.operationId) || path.posix.dirname(temporary) !== path.posix.dirname(receipt.from) || !TEMP_NAME_PATTERN.test(path.posix.basename(temporary)) || !identity || Object.keys(identity).sort().join(',') !== 'birthtimeNs,dev,ino' || !['dev', 'ino', 'birthtimeNs'].every(key => typeof identity[key] === 'string' && /^\d+$/.test(identity[key]))) throw new Error()
      }
    } catch { fail(409, 'Invalid rename journal; recovery required') }
    return journal
  }

  async #saveJournal(id, journal) {
    await atomicReplace(path.join(this.journalRoot, `${id}.json`), JSON.stringify(journal))
  }

  async #identity(target) {
    const stat = await fs.lstat(target, { bigint: true })
    return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) }
  }

  async #exactEntry(root, relativePath, temporary = false) {
    // Internal staging paths are never accepted as browser paths.
    const parts = temporary ? relativePath.split('/') : relativeParts(relativePath)
    const parentPath = parts.slice(0, -1).join('/')
    const parent = parentPath ? (await this.#entry(root, parentPath)).target : root
    if (!(await statNoLink(parent)).isDirectory()) fail(400, 'Path parent is not a directory')
    const target = path.join(parent, parts.at(-1))
    if (!(await fs.readdir(parent)).includes(parts.at(-1))) return { target, stat: null, identity: null }
    const stat = await statNoLink(target)
    return { target, stat, identity: await this.#identity(target) }
  }

  #matches(entry, pending) {
    return entry.stat && (entry.stat.isDirectory() ? 'directory' : 'file') === pending.receipt.kind && ['dev', 'ino', 'birthtimeNs'].every(key => pending.identity[key] === entry.identity[key])
  }

  async #commitRename(id, journal) {
    const receipt = journal.pending.receipt
    const committed = { version: 1, generation: receipt.generation, receipts: receipt.operationId ? [...journal.receipts, receipt].slice(-RECEIPT_LIMIT) : journal.receipts, pending: null }
    await this.#saveJournal(id, committed)
    return committed
  }

  async #recoverRename(id, root, journal) {
    if (!journal.pending) return journal
    const pending = journal.pending
    const source = await this.#exactEntry(root, pending.receipt.from)
    const destination = await this.#exactEntry(root, pending.receipt.to)
    const temporary = await this.#exactEntry(root, pending.temporary, true)
    if (this.#matches(destination, pending) && !source.stat && !temporary.stat) {
      await syncDirectory(path.dirname(source.target))
      await syncDirectory(path.dirname(destination.target))
      return this.#commitRename(id, journal)
    }
    if (this.#matches(source, pending) && !temporary.stat && !this.#matches(destination, pending)) {
      const cleared = { ...journal, pending: null }
      await this.#saveJournal(id, cleared)
      return cleared
    }
    if (this.#matches(temporary, pending) && !source.stat) {
      // A crash before the final move is rolled back. The caller may retry the
      // same nonce after recovery; no unrelated destination is overwritten.
      await fs.rename(temporary.target, source.target)
      await syncDirectory(path.dirname(source.target))
      const cleared = { ...journal, pending: null }
      await this.#saveJournal(id, cleared)
      return cleared
    }
    fail(409, 'Rename outcome is uncertain; recovery required before changing this project')
  }

  async #mutableProject(id) {
    const project = await this.#project(id)
    let journal = await this.#journal(id)
    try { journal = await this.#recoverRename(id, project.root, journal) } catch (error) {
      if (error.status === 404) fail(409, 'Rename outcome is uncertain; recovery required before changing this project')
      if (error.status) throw error
      fail(503, 'Rename recovery could not be completed; retry with the same operation ID')
    }
    return { ...project, journal }
  }

  async #createProject(name, files) {
    await this.#ready()
    const summary = { id: randomUUID(), name: validName(name), createdAt: new Date().toISOString() }
    const projectRoot = path.join(this.projectsRoot, summary.id)
    const stagingRoot = path.join(this.projectsRoot, `${TEMP_PREFIX}${randomUUID()}`)
    await fs.mkdir(stagingRoot)
    try {
      await atomicCreate(path.join(stagingRoot, META), JSON.stringify(summary))
      for (const file of files) {
        const parts = relativeParts(file.path)
        const directory = path.join(stagingRoot, ...parts.slice(0, -1))
        await fs.mkdir(directory, { recursive: true })
        await atomicCreate(path.join(stagingRoot, ...parts), file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content)
      }
      await fs.rename(stagingRoot, projectRoot)
      await syncDirectory(this.projectsRoot)
      return summary
    } catch (error) {
      await fs.rm(stagingRoot, { recursive: true, force: true })
      throw error
    }
  }

  async ensureStarter() {
    return this.#locked(async () => {
      const projects = await this.listProjects()
      return projects[0] ?? this.#createProject('Java Starter', [{ path: 'Main.java', content: STARTER_SOURCE }])
    })
  }

  async projectSummary(id) {
    return (await this.#project(id)).summary
  }

  async listProjects() {
    await this.#ready()
    const entries = await fs.readdir(this.projectsRoot, { withFileTypes: true })
    const directories = []
    for (const entry of entries) {
      if (!ID_PATTERN.test(entry.name)) continue
      if (entry.isSymbolicLink()) fail(400, 'Symlinks are not allowed in projects')
      if (entry.isDirectory()) directories.push(entry)
    }
    // Metadata reads are independent. Bound concurrency rather than serializing
    // every project or opening the whole managed catalog at once. Each read
    // retains the same root, symlink, containment and metadata checks.
    const projects = new Array(directories.length)
    let next = 0
    await Promise.all(Array.from({ length: Math.min(8, directories.length) }, async () => {
      for (;;) {
        const index = next++
        if (index >= directories.length) return
        projects[index] = (await this.#project(directories[index].name)).summary
      }
    }))
    return projects.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  }

  async createProject(name) {
    return this.#locked(() => this.#createProject(name, []))
  }

  async importProject(name, files) {
    if (!Array.isArray(files)) fail(400, 'Import files must be an array')
    const seen = new Set()
    for (const file of files) {
      if (!file || typeof file.content !== 'string') fail(400, 'Invalid import file')
      if (file.encoding !== undefined && file.encoding !== 'base64') fail(400, 'Invalid import encoding')
      if (file.encoding === 'base64' && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) fail(400, 'Invalid binary import')
      relativeParts(file.path)
      if (seen.has(file.path)) fail(400, 'Duplicate import path')
      seen.add(file.path)
    }
    for (const file of files) {
      const parts = file.path.split('/')
      for (let i = 1; i < parts.length; i++) {
        if (seen.has(parts.slice(0, i).join('/'))) fail(400, 'A file cannot also be an import directory')
      }
    }
    return this.#locked(() => this.#createProject(name, files))
  }

  async getTree(id) {
    return this.#locked(async () => {
      const { root } = await this.#mutableProject(id)
      const walk = async (directory, prefix = '') => {
        const names = await fs.readdir(directory)
        const result = []
        for (const name of names) {
          if (name === META || name.startsWith(TEMP_PREFIX) || ['.git', 'target', 'build', '.gradle', '.idea'].includes(name)) continue
          const absolute = path.join(directory, name)
          const stat = await statNoLink(absolute)
          const relative = prefix ? `${prefix}/${name}` : name
          if (stat.isDirectory()) result.push({ path: relative, name, kind: 'directory', children: await walk(absolute, relative) })
          else result.push({ path: relative, name, kind: 'file' })
        }
        return result.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1))
      }
      return walk(root)
    })
  }

  async readFile(id, relativePath) {
    return this.#locked(async () => {
      const { root } = await this.#mutableProject(id)
      return this.#read(root, relativePath)
    })
  }

  async writeFile(id, relativePath, content, expectedRevision) {
    if (typeof content !== 'string' || typeof expectedRevision !== 'string') fail(400, 'Invalid file save')
    return this.#locked(async () => {
      const { root } = await this.#mutableProject(id)
      const current = await this.#read(root, relativePath)
      if (current.revision !== expectedRevision) fail(409, 'File changed on disk. Your draft was not overwritten; copy it to a new file or discard it and reload.')
      const { target } = await this.#entry(root, relativePath)
      await atomicReplace(target, content)
      return { path: relativePath, content, revision: revision(content) }
    })
  }

  async createFile(id, relativePath, content = '') {
    if (typeof content !== 'string') fail(400, 'Invalid file content')
    return this.#locked(async () => {
      const { root } = await this.#mutableProject(id)
      const { target, stat } = await this.#destination(root, relativePath)
      if (stat) fail(409, 'Project entry already exists')
      await atomicCreate(target, content)
      return { path: relativePath, content, revision: revision(content) }
    })
  }

  async createFolder(id, relativePath) {
    return this.#locked(async () => {
      const { root } = await this.#mutableProject(id)
      const { target, stat } = await this.#destination(root, relativePath)
      if (stat) fail(409, 'Project entry already exists')
      await fs.mkdir(target)
      return { path: relativePath }
    })
  }

  // Receipts are filesystem-only acknowledgements. Their generation counts
  // committed renames, not builds or trace/source-manifest versions. Keep the
  // nonce through transport retries; the last 128 nonce receipts are persisted.
  async renameEntry(id, from, to, options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) fail(400, 'Invalid rename options')
    const operationId = options.operationId ?? null
    if (operationId !== null && (typeof operationId !== 'string' || !OPERATION_PATTERN.test(operationId))) fail(400, 'Invalid rename operation ID')
    relativeParts(from)
    relativeParts(to, { portable: true })
    return this.#locked(async () => {
      const { root, journal } = await this.#mutableProject(id)
      const previous = operationId && journal.receipts.find(receipt => receipt.operationId === operationId)
      if (previous) {
        if (previous.from !== from || previous.to !== to) fail(409, 'Rename operation ID was already used for different paths')
        return { ...previous }
      }
      const source = await this.#exactEntry(root, from)
      if (!source.stat) fail(404, 'Project entry not found')
      await verifyTreeNoLinks(source.target)
      const kind = source.stat.isDirectory() ? 'directory' : 'file'
      const receipt = { path: to, from, to, kind, operationId, generation: journal.generation }
      if (from === to) {
        if (operationId) await this.#saveJournal(id, { ...journal, receipts: [...journal.receipts, receipt].slice(-RECEIPT_LIMIT) })
        return operationId ? receipt : { path: to }
      }
      if (kind === 'directory' && portableNameKey(to).startsWith(`${portableNameKey(from)}/`)) fail(400, 'Cannot move a folder into itself')
      const destination = await this.#destination(root, to, from)
      if (destination.stat && !this.#matches(destination, { identity: source.identity, receipt })) fail(409, 'Project entry already exists')
      if (journal.generation === Number.MAX_SAFE_INTEGER) fail(409, 'Rename generation limit reached')
      receipt.generation++
      const temporary = path.posix.join(path.posix.dirname(from), `${TEMP_PREFIX}${randomUUID()}`)
      const temporaryTarget = path.join(root, ...temporary.split('/'))
      const pending = { ...journal, pending: { receipt, temporary, identity: source.identity } }
      // Durable intent precedes any move. Only names change; file contents,
      // symbols, dirty drafts and captured execution records are never written.
      await this.#saveJournal(id, pending)
      try {
        await fs.rename(source.target, temporaryTarget)
        if (await statNoLink(destination.target, true)) fail(409, 'Project entry already exists')
        await fs.rename(temporaryTarget, destination.target)
      } catch (error) {
        try {
          const currentSource = await this.#exactEntry(root, from)
          const staged = await this.#exactEntry(root, temporary, true)
          if (!currentSource.stat && this.#matches(staged, pending.pending)) {
            await fs.rename(staged.target, currentSource.target)
            await syncDirectory(path.dirname(currentSource.target))
          } else if (!this.#matches(currentSource, pending.pending) || staged.stat) {
            fail(409, 'Rename rollback is uncertain')
          }
          await this.#saveJournal(id, { ...journal, pending: null })
        } catch { fail(503, 'Rename recovery required; retry with the same operation ID') }
        if (error.status) throw error
        if (['EEXIST', 'ENOTEMPTY'].includes(error.code)) fail(409, 'Project entry already exists')
        fail(500, 'Rename failed; the original entry was restored')
      }
      try {
        await syncDirectory(path.dirname(source.target))
        if (path.dirname(destination.target) !== path.dirname(source.target)) await syncDirectory(path.dirname(destination.target))
        await this.#commitRename(id, pending)
      } catch { fail(503, 'Rename may have completed; retry with the same operation ID') }
      return operationId ? receipt : { path: to }
    }).catch(error => {
      if (error.status) throw error
      fail(500, 'Project rename failed; retry with the same operation ID')
    })
  }

  async deleteEntry(id, relativePath) {
    return this.#locked(async () => {
      const { root } = await this.#mutableProject(id)
      const { target } = await this.#entry(root, relativePath)
      await verifyTreeNoLinks(target)
      await fs.rm(target, { recursive: true })
      return { ok: true }
    })
  }

  async getProjectRoot(id) {
    return this.#locked(async () => (await this.#mutableProject(id)).root)
  }

  async listJavaFiles(id) {
    return this.#locked(async () => {
      const { root } = await this.#mutableProject(id)
      const files = []
      const walk = async directory => {
        for (const name of await fs.readdir(directory)) {
          if (name === META || name.startsWith(TEMP_PREFIX)) continue
          const absolute = path.join(directory, name)
          const stat = await statNoLink(absolute)
          if (stat.isDirectory()) await walk(absolute)
          else if (name.endsWith('.java')) files.push(absolute)
        }
      }
      await walk(root)
      return files.sort()
    })
  }
}
