import { randomUUID, createHash } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'

const META = '.ggjavaez-project.json'
const TEMP_PREFIX = '.ggjavaez-tmp-'
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
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

function relativeParts(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 || value.startsWith('/') || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value)) {
    fail(400, 'Invalid project path')
  }
  const parts = value.split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || part === META || part.startsWith(TEMP_PREFIX) || part.includes(':'))) {
    fail(400, 'Invalid project path')
  }
  return parts
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
  const handle = await fs.open(directory, constants.O_RDONLY)
  try { await handle.sync() } finally { await handle.close() }
}

async function atomicReplace(target, content) {
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
    this.queue = Promise.resolve()
  }

  async #locked(operation) {
    const next = this.queue.then(operation, operation)
    this.queue = next.catch(() => {})
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

  async listProjects() {
    await this.#ready()
    const entries = await fs.readdir(this.projectsRoot, { withFileTypes: true })
    const projects = []
    for (const entry of entries) {
      if (!ID_PATTERN.test(entry.name)) continue
      if (entry.isSymbolicLink()) fail(400, 'Symlinks are not allowed in projects')
      if (!entry.isDirectory()) continue
      projects.push((await this.#project(entry.name)).summary)
    }
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
    const { root } = await this.#project(id)
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
  }

  async readFile(id, relativePath) {
    const { root } = await this.#project(id)
    return this.#read(root, relativePath)
  }

  async writeFile(id, relativePath, content, expectedRevision) {
    if (typeof content !== 'string' || typeof expectedRevision !== 'string') fail(400, 'Invalid file save')
    return this.#locked(async () => {
      const { root } = await this.#project(id)
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
      const { root } = await this.#project(id)
      const { target, stat } = await this.#entry(root, relativePath, { parentOnly: true, allowMissing: true })
      if (stat) fail(409, 'Project entry already exists')
      await atomicCreate(target, content)
      return { path: relativePath, content, revision: revision(content) }
    })
  }

  async createFolder(id, relativePath) {
    return this.#locked(async () => {
      const { root } = await this.#project(id)
      const { target, stat } = await this.#entry(root, relativePath, { parentOnly: true, allowMissing: true })
      if (stat) fail(409, 'Project entry already exists')
      await fs.mkdir(target)
      return { path: relativePath }
    })
  }

  async renameEntry(id, from, to) {
    return this.#locked(async () => {
      const { root } = await this.#project(id)
      const source = await this.#entry(root, from)
      const destination = await this.#entry(root, to, { parentOnly: true, allowMissing: true })
      if (destination.stat) fail(409, 'Project entry already exists')
      if (source.stat.isDirectory() && within(source.target, destination.target)) fail(400, 'Cannot move a folder into itself')
      await verifyTreeNoLinks(source.target)
      await fs.rename(source.target, destination.target)
      return { path: to }
    })
  }

  async deleteEntry(id, relativePath) {
    return this.#locked(async () => {
      const { root } = await this.#project(id)
      const { target } = await this.#entry(root, relativePath)
      await verifyTreeNoLinks(target)
      await fs.rm(target, { recursive: true })
      return { ok: true }
    })
  }

  async getProjectRoot(id) {
    return (await this.#project(id)).root
  }

  async listJavaFiles(id) {
    const root = await this.getProjectRoot(id)
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
  }
}
