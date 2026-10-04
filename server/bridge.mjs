import http from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ProjectStore } from './projects.mjs'
import { detectJdk } from './jdk.mjs'
import { BuildService } from './build-service.mjs'
import { JavaLanguageService } from './language-service.mjs'
import { resolveLaunch } from './launch.mjs'
import { RunManager } from './runner.mjs'
import { runInstrumented } from './instrumentation-provider.mjs'
import { buildInstrumentationSourceManifest } from './instrumentation-sources.mjs'
import { DebugManager } from './debug-manager.mjs'
import { ExecutionManager } from './execution-manager.mjs'
import { createExecutionBuild } from './execution-build.mjs'
import { transportOptions, handleExecutionRequest } from './execution-transport.mjs'

const repository = resolve(fileURLToPath(new URL('..', import.meta.url)))
const workspace = resolve(process.env.GGJAVA_WORKSPACE || join(repository, '.ggjavaez'))
const port = Number(process.env.GGJAVA_PORT || 8787)
const projects = new ProjectStore(workspace)
const runs = new RunManager()
const debuggerSessions = new DebugManager()
const executions = new ExecutionManager({
  ...createExecutionBuild({ serialized, build: (id, debug) => builds.build(id, { debug }),
    getProjectRoot: (id) => projects.getProjectRoot(id), buildManifest: buildInstrumentationSourceManifest }),
  resolveLaunch,
  getProjectRoot: (id) => projects.getProjectRoot(id),
  publicBuild,
  runs,
  debuggerSessions,
})
const settingsFile = join(workspace, 'settings.json')
let settings = { jdkHome: null }
const builds = new BuildService({ workspaceRoot: workspace, projects, getJdk: () => detectJdk(settings.jdkHome) })
const language = new JavaLanguageService({ workspaceRoot: workspace })
let executionQueue = Promise.resolve()
function serialized(work) {
  const next = executionQueue.then(work, work)
  executionQueue = next.catch(() => {})
  return next
}

const flattenEntries = entries => entries.flatMap(entry => [entry, ...flattenEntries(entry.children ?? [])])
const withinEntry = (path, ancestor) => path === ancestor || path.startsWith(`${ancestor}/`)
const languageUri = (id, path) => `inmemory://ggjavaez/${encodeURIComponent(id)}/${path.split('/').map(encodeURIComponent).join('/')}`
async function filesystemChanged(id, changes) {
  // File routes share the build queue: an old pending model cannot be published
  // after invalidation, and the next Build/Run resolves the actual new tree.
  await builds.pending.get(id)?.catch(() => {})
  builds.models.delete(id)
  if (language.status(id).status === 'stopped') return
  try {
    await language.notify(id, 'workspace/didChangeWatchedFiles', {
      changes: changes.map(({ path, type }) => ({ uri: languageUri(id, path), type })),
    })
  } catch (error) {
    // A stopped/unavailable JDT must not turn a committed filesystem move into
    // an apparent failure. The client's next open refreshes the derived model.
    console.warn('Java watched-file notification unavailable:', error.message)
  }
}

await mkdir(workspace, { recursive: true })
try { settings = { ...settings, ...JSON.parse(await readFile(settingsFile, 'utf8')) } } catch { /* defaults */ }

function json(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  response.end(JSON.stringify(data))
}

function rejectCrossOrigin(request) {
  const host = request.headers.host || ''
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return true
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return false
  const origin = request.headers.origin
  if (!origin) return false // CLI clients and same-origin requests without Origin
  try {
    const source = new URL(origin)
    return !['localhost', '127.0.0.1'].includes(source.hostname) || !['5173', String(port)].includes(source.port)
  } catch { return true }
}

async function body(request) {
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) return {}
  if (!(request.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('Expected application/json'), { status: 415 })
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 8 * 1024 * 1024) throw Object.assign(new Error('Request too large'), { status: 413 })
    chunks.push(chunk)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }) }
}

async function build(projectId, debug = false) {
  return builds.build(projectId, { debug })
}

function publicBuild(result) {
  const { project, ...dto } = result
  return { ...dto, ...(project ? { javaProject: builds.toDTO(project) } : {}) }
}

function segments(pathname) { return pathname.split('/').filter(Boolean) }

const server = http.createServer(async (request, response) => {
  try {
    if (rejectCrossOrigin(request)) return json(response, 403, { error: 'Local bridge only accepts same-origin loopback requests' })
    const url = new URL(request.url || '/', `http://${request.headers.host}`)
    const parts = segments(url.pathname)
    const method = request.method
    if (url.pathname === '/api/health' && method === 'GET') return json(response, 200, { jdk: await detectJdk(settings.jdkHome) })
    if (await handleExecutionRequest(request, response, url, executions, { body, json })) return
    if (url.pathname === '/api/debug/current' && method === 'GET') return json(response, 200, debuggerSessions.current(transportOptions(url)))
    if (parts[0] === 'api' && parts[1] === 'debug' && parts[2]) {
      const id = parts[2]
      const transport = transportOptions(url)
      if (!debuggerSessions.snapshot(id, { transport: 'delta' })) return json(response, 404, { error: 'Debug session not found' })
      if (parts.length === 3 && method === 'GET') return json(response, 200, debuggerSessions.snapshot(id, transport))
      if (parts[3] === 'command' && method === 'POST') return json(response, 200, await debuggerSessions.command(id, (await body(request)).command, transport))
      if (parts[3] === 'input' && method === 'POST') return json(response, 200, await debuggerSessions.input(id, (await body(request)).text))
      if (parts[3] === 'breakpoints' && method === 'POST') return json(response, 200, await debuggerSessions.setBreakpoints(id, (await body(request)).breakpoints, transport))
    }
    if (url.pathname === '/api/jdk/detect' && method === 'POST') {
      const payload = await body(request)
      const jdk = await detectJdk(payload.home ?? null)
      if (jdk.available) {
        settings.jdkHome = payload.home ?? null
        await writeFile(settingsFile, JSON.stringify(settings, null, 2))
      }
      return json(response, 200, jdk)
    }
    if (url.pathname === '/api/projects' && method === 'GET') return json(response, 200, await projects.listProjects())
    if (url.pathname === '/api/projects' && method === 'POST') return json(response, 201, await projects.createProject((await body(request)).name))
    if (url.pathname === '/api/projects/import' && method === 'POST') {
      const { name, files } = await body(request)
      return json(response, 201, await projects.importProject(name, files))
    }
    if (parts[0] === 'api' && parts[1] === 'projects' && parts[2] && parts.length >= 4) {
      const id = parts[2]
      const action = parts[3]
      if (action === 'java-project' && method === 'GET') return json(response, 200, builds.toDTO(await builds.resolve(id, { refresh: true })))
      if (action === 'language') {
        if (parts.length === 4 && method === 'GET') { await projects.getProjectRoot(id); return json(response, 200, language.status(id)) }
        if (parts[4] === 'open' && method === 'POST') {
          await body(request)
          const projectRoot = await projects.getProjectRoot(id)
          const model = await builds.resolve(id)
          return json(response, 200, await language.open({ projectId: id, projectRoot, model, jdk: model.jdk }))
        }
        if (parts[4] === 'restart' && method === 'POST') { await body(request); await projects.getProjectRoot(id); return json(response, 200, await language.restart(id)) }
        if (parts[4] === 'request' && method === 'POST') { const payload = await body(request); return json(response, 200, await language.request(id, payload.method, payload.params)) }
        if (parts[4] === 'notify' && method === 'POST') { const payload = await body(request); await language.notify(id, payload.method, payload.params); return json(response, 200, { ok: true }) }
      }
      if (action === 'tree' && method === 'GET') return json(response, 200, await projects.getTree(id))
      if (action === 'files' && method === 'GET') return json(response, 200, await projects.readFile(id, url.searchParams.get('path')))
      if (action === 'files' && method === 'PUT') {
        const { path, content, revision } = await body(request)
        return json(response, 200, await serialized(async () => {
          const result = await projects.writeFile(id, path, content, revision)
          await filesystemChanged(id, [{ path, type: 2 }])
          return result
        }))
      }
      if (action === 'files' && method === 'POST') {
        const { path, content } = await body(request)
        return json(response, 201, await serialized(async () => {
          const result = await projects.createFile(id, path, content ?? '')
          await filesystemChanged(id, [{ path, type: 1 }])
          return result
        }))
      }
      if (action === 'folders' && method === 'POST') {
        const { path } = await body(request)
        return json(response, 201, await serialized(async () => {
          const result = await projects.createFolder(id, path)
          await filesystemChanged(id, [{ path, type: 1 }])
          return result
        }))
      }
      if (action === 'rename' && method === 'POST') {
        const { from, to, operationId } = await body(request)
        return json(response, 200, await serialized(async () => {
          const receipt = await projects.renameEntry(id, from, to, { operationId })
          const moved = flattenEntries(await projects.getTree(id)).filter(entry => entry.kind === 'file' && withinEntry(entry.path, to))
          const paths = moved.length ? moved.map(entry => entry.path) : [to]
          await filesystemChanged(id, paths.flatMap(path => [
            { path: from + path.slice(to.length), type: 3 }, { path, type: 1 },
          ]))
          return receipt
        }))
      }
      if (action === 'entries' && method === 'DELETE') {
        const path = url.searchParams.get('path')
        return json(response, 200, await serialized(async () => {
          const removed = flattenEntries(await projects.getTree(id)).filter(entry => entry.kind === 'file' && withinEntry(entry.path, path))
          const result = await projects.deleteEntry(id, path)
          await filesystemChanged(id, (removed.length ? removed.map(entry => entry.path) : [path]).map(path => ({ path, type: 3 })))
          return result
        }))
      }
      if (action === 'build' && method === 'POST') { await body(request); return json(response, 200, await serialized(async () => { await executions.stop(undefined, { transport: 'delta' }); await debuggerSessions.stop(undefined, { transport: 'delta' }); await runs.stop(); return publicBuild(await build(id)) })) }
      if (action === 'debug' && method === 'POST') {
        const configuration = await body(request)
        const { breakpoints } = configuration
        return json(response, 200, await serialized(async () => {
          await executions.stop(undefined, { transport: 'delta' })
          await runs.stop(); await debuggerSessions.stop(undefined, { transport: 'delta' })
          const compilation = await build(id, true)
          const sourceManifest = { sources: [], classes: [] }
          if (!compilation.success || !compilation.mainClasses.length) return {
            sessionId: `compile:${id}`, projectId: id, revision: 0, status: 'failed', pause: null, breakpoints: [], rawEvents: [],
            sourceManifest, build: publicBuild(compilation), stdout: '', stderr: '', exitCode: null, terminalStatus: null,
            diagnostic: compilation.success ? 'No public static main(String[]) entry point found' : 'Compilation failed. See Problems.',
          }
          const launch = await resolveLaunch(compilation.project, configuration)
          const projectRoot = await projects.getProjectRoot(id), classesDir = compilation.project.classesDir
          const manifest = await buildInstrumentationSourceManifest(projectRoot, classesDir, compilation.project.sourcePaths)
          return debuggerSessions.start({ projectId: id, projectRoot, classesDir, ...launch,
            javaPath: compilation.jdk.javaPath, javacPath: compilation.jdk.javacPath, sourceManifest: manifest,
            build: publicBuild(compilation), breakpoints: breakpoints ?? [], rawEventLimit: 20000, rawByteLimit: 8 * 1024 * 1024, timeoutMs: 30000 })
        }))
      }
      if (action === 'run' && method === 'POST') {
        const configuration = await body(request)
        return json(response, 200, await serialized(async () => {
          await executions.stop(undefined, { transport: 'delta' })
          await runs.stop()
          await debuggerSessions.stop(undefined, { transport: 'delta' })
          const result = await build(id)
          if (!result.success || !result.mainClasses.length) return { build: publicBuild(result), run: null }
          const projectRoot = await projects.getProjectRoot(id)
          const launch = await resolveLaunch(result.project, configuration)
          const run = await runs.start({ projectId: id, classesDir: result.project.classesDir, projectRoot, ...launch, javaPath: result.jdk.javaPath, sourcePaths: result.project.sourcePaths })
          return { build: publicBuild(result), run }
        }))
      }
      if (action === 'visualize' && method === 'POST') {
        const configuration = await body(request)
        return json(response, 200, await serialized(async () => {
          await executions.stop(undefined, { transport: 'delta' })
          await runs.stop()
          await debuggerSessions.stop(undefined, { transport: 'delta' })
          const compilation = await build(id, true)
          const emptyManifest = { sources: [], classes: [] }
          if (!compilation.success) return { build: publicBuild(compilation), status: 'compile_failed', diagnostic: 'Compilation failed',
            sourceManifest: emptyManifest, rawEvents: [], capability: null, stdout: '', stderr: '', exitCode: null, metrics: null }
          if (!compilation.mainClasses.length) return { build: publicBuild(compilation), status: 'unsupported', diagnostic: 'No public static main(String[]) entry point found',
            sourceManifest: emptyManifest, rawEvents: [], capability: null, stdout: '', stderr: '', exitCode: null, metrics: null }
          const launch = await resolveLaunch(compilation.project, configuration)
          const projectRoot = await projects.getProjectRoot(id)
          const classesDir = compilation.project.classesDir
          const manifest = await buildInstrumentationSourceManifest(projectRoot, classesDir, compilation.project.sourcePaths)
          const capture = await runInstrumented({ projectId: id, projectRoot, classesDir, ...launch,
            javaPath: compilation.jdk.javaPath, javacPath: compilation.jdk.javacPath,
            sourcePaths: manifest.sources.map((source) => source.fileId), rawEventLimit: 20000,
            rawByteLimit: 8 * 1024 * 1024, timeoutMs: 30000 })
          return { build: publicBuild(compilation), ...capture, sourceManifest: manifest }
        }))
      }
    }
    if (url.pathname === '/api/runs/current' && method === 'GET') return json(response, 200, runs.current())
    if (parts[0] === 'api' && parts[1] === 'runs' && parts[2]) {
      const runId = parts[2]
      if (!runs.snapshot(runId)) return json(response, 404, { error: 'Run not found' })
      if (parts[3] === 'events' && method === 'GET') {
        response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' })
        response.write(': connected\n\n')
        const unsubscribe = runs.subscribe(runId, (event) => response.write(`event: run\ndata: ${JSON.stringify(event)}\n\n`), Number(url.searchParams.get('after') || 0))
        if (!unsubscribe) { response.end(); return }
        request.on('close', unsubscribe)
        return
      }
      if (parts[3] === 'input' && method === 'POST') { const { text } = await body(request); await runs.input(runId, text); return json(response, 200, { ok: true }) }
      if (parts[3] === 'stop' && method === 'POST') { await body(request); return json(response, 200, await runs.stop(runId)) }
      if (parts.length === 3 && method === 'GET') return json(response, 200, runs.snapshot(runId))
    }
    if (process.env.GGJAVA_SERVE_DIST === '1' && method === 'GET' && !url.pathname.startsWith('/api/')) {
      const filename = ['/', '/ide', '/examples'].includes(url.pathname) ? 'index.html' : decodeURIComponent(url.pathname.slice(1))
      if (filename.includes('..') || filename.startsWith('/')) throw Object.assign(new Error('Invalid asset'), { status: 400 })
      const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', woff2: 'font/woff2', ttf: 'font/ttf' }
      const data = await readFile(join(repository, 'dist', filename))
      response.writeHead(200, { 'content-type': types[filename.split('.').at(-1)] || 'application/octet-stream' })
      return response.end(data)
    }
    return json(response, 404, { error: 'Not found' })
  } catch (error) {
    const status = error.status || error.statusCode || (error.code === 'ENOENT' ? 404 : error.code === 'EEXIST' ? 409 : 500)
    if (status >= 500) console.error(error)
    if (!response.headersSent) json(response, status, { error: status >= 500 ? 'Bridge operation failed' : error.message })
    else response.end()
  }
})

server.listen(port, '127.0.0.1', () => console.log(`GGJavaEZ bridge listening on http://127.0.0.1:${port}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await language.stop(); await debuggerSessions.dispose(); await runs.stop(); server.close(); process.exit(0) })
