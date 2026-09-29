import http from 'node:http'
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ProjectStore } from './projects.mjs'
import { detectJdk } from './jdk.mjs'
import { compileProject } from './compiler.mjs'
import { RunManager } from './runner.mjs'
import { runInstrumented } from './instrumentation-provider.mjs'
import { buildInstrumentationSourceManifest } from './instrumentation-sources.mjs'
import { DebugManager } from './debug-manager.mjs'

const repository = resolve(fileURLToPath(new URL('..', import.meta.url)))
const workspace = resolve(process.env.GGJAVA_WORKSPACE || join(repository, '.ggjavaez'))
const port = Number(process.env.GGJAVA_PORT || 8787)
const projects = new ProjectStore(workspace)
const runs = new RunManager()
const debuggerSessions = new DebugManager()
const settingsFile = join(workspace, 'settings.json')
let settings = { jdkHome: null }
let executionQueue = Promise.resolve()
function serialized(work) {
  const next = executionQueue.then(work, work)
  executionQueue = next.catch(() => {})
  return next
}

await mkdir(workspace, { recursive: true })
try { settings = { ...settings, ...JSON.parse(await readFile(settingsFile, 'utf8')) } } catch { /* defaults */ }
await projects.ensureStarter()

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
  const projectRoot = await projects.getProjectRoot(projectId)
  const buildDir = join(workspace, 'build', projectId, 'classes')
  for (const directory of [workspace, join(workspace, 'build'), join(workspace, 'build', projectId), buildDir]) {
    await mkdir(directory, { recursive: true })
    const stat = await lstat(directory)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Object.assign(new Error('Invalid managed build directory'), { status: 400 })
  }
  return compileProject(projectRoot, buildDir, settings.jdkHome, { debug })
}

function segments(pathname) { return pathname.split('/').filter(Boolean) }

const server = http.createServer(async (request, response) => {
  try {
    if (rejectCrossOrigin(request)) return json(response, 403, { error: 'Local bridge only accepts same-origin loopback requests' })
    const url = new URL(request.url || '/', `http://${request.headers.host}`)
    const parts = segments(url.pathname)
    const method = request.method
    if (url.pathname === '/api/health' && method === 'GET') return json(response, 200, { jdk: await detectJdk(settings.jdkHome) })
    if (url.pathname === '/api/debug/current' && method === 'GET') return json(response, 200, debuggerSessions.current())
    if (parts[0] === 'api' && parts[1] === 'debug' && parts[2]) {
      const id = parts[2]
      if (!debuggerSessions.snapshot(id)) return json(response, 404, { error: 'Debug session not found' })
      if (parts.length === 3 && method === 'GET') return json(response, 200, debuggerSessions.snapshot(id))
      if (parts[3] === 'command' && method === 'POST') return json(response, 200, await debuggerSessions.command(id, (await body(request)).command))
      if (parts[3] === 'input' && method === 'POST') return json(response, 200, await debuggerSessions.input(id, (await body(request)).text))
      if (parts[3] === 'breakpoints' && method === 'POST') return json(response, 200, await debuggerSessions.setBreakpoints(id, (await body(request)).breakpoints))
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
      if (action === 'tree' && method === 'GET') return json(response, 200, await projects.getTree(id))
      if (action === 'files' && method === 'GET') return json(response, 200, await projects.readFile(id, url.searchParams.get('path')))
      if (action === 'files' && method === 'PUT') {
        const { path, content, revision } = await body(request)
        return json(response, 200, await projects.writeFile(id, path, content, revision))
      }
      if (action === 'files' && method === 'POST') {
        const { path, content } = await body(request)
        return json(response, 201, await projects.createFile(id, path, content ?? ''))
      }
      if (action === 'folders' && method === 'POST') return json(response, 201, await projects.createFolder(id, (await body(request)).path))
      if (action === 'rename' && method === 'POST') {
        const { from, to } = await body(request)
        return json(response, 200, await projects.renameEntry(id, from, to))
      }
      if (action === 'entries' && method === 'DELETE') return json(response, 200, await projects.deleteEntry(id, url.searchParams.get('path')))
      if (action === 'build' && method === 'POST') { await body(request); return json(response, 200, await serialized(async () => { await debuggerSessions.stop(); await runs.stop(); return build(id) })) }
      if (action === 'debug' && method === 'POST') {
        const { mainClass, breakpoints } = await body(request)
        return json(response, 200, await serialized(async () => {
          await runs.stop(); await debuggerSessions.stop()
          const compilation = await build(id, true)
          const sourceManifest = { sources: [], classes: [] }
          if (!compilation.success || !compilation.mainClasses.length) return {
            sessionId: `compile:${id}`, projectId: id, revision: 0, status: 'failed', pause: null, breakpoints: [], rawEvents: [],
            sourceManifest, build: compilation, stdout: '', stderr: '', exitCode: null, terminalStatus: null,
            diagnostic: compilation.success ? 'No public static main(String[]) entry point found' : 'Compilation failed. See Problems.',
          }
          const selected = compilation.mainClasses.includes(mainClass) ? mainClass : compilation.mainClasses[0]
          const projectRoot = await projects.getProjectRoot(id), classesDir = join(workspace, 'build', id, 'classes')
          const manifest = await buildInstrumentationSourceManifest(projectRoot, classesDir)
          return debuggerSessions.start({ projectId: id, projectRoot, classesDir, mainClass: selected,
            javaPath: compilation.jdk.javaPath, javacPath: compilation.jdk.javacPath, sourceManifest: manifest,
            build: compilation, breakpoints: breakpoints ?? [], rawEventLimit: 20000, rawByteLimit: 8 * 1024 * 1024, timeoutMs: 30000 })
        }))
      }
      if (action === 'run' && method === 'POST') {
        const { mainClass } = await body(request)
        return json(response, 200, await serialized(async () => {
          await runs.stop()
          await debuggerSessions.stop()
          const result = await build(id)
          if (!result.success) return { build: result, run: null }
          if (!result.mainClasses.length) return { build: result, run: null }
          const selected = result.mainClasses.includes(mainClass) ? mainClass : result.mainClasses[0]
          if (!result.mainClasses.includes(selected)) throw Object.assign(new Error('Select a main class found in the compiled project'), { status: 400 })
          const run = await runs.start({ projectId: id, mainClass: selected, classesDir: join(workspace, 'build', id, 'classes'), projectRoot: await projects.getProjectRoot(id), javaPath: result.jdk.javaPath, sourcePaths: await projects.listJavaFiles(id) })
          return { build: result, run }
        }))
      }
      if (action === 'visualize' && method === 'POST') {
        const { mainClass } = await body(request)
        return json(response, 200, await serialized(async () => {
          await runs.stop()
          await debuggerSessions.stop()
          const compilation = await build(id, true)
          const emptyManifest = { sources: [], classes: [] }
          if (!compilation.success) return { build: compilation, status: 'compile_failed', diagnostic: 'Compilation failed',
            sourceManifest: emptyManifest, rawEvents: [], capability: null, stdout: '', stderr: '', exitCode: null, metrics: null }
          if (!compilation.mainClasses.length) return { build: compilation, status: 'unsupported', diagnostic: 'No public static main(String[]) entry point found',
            sourceManifest: emptyManifest, rawEvents: [], capability: null, stdout: '', stderr: '', exitCode: null, metrics: null }
          const selected = compilation.mainClasses.includes(mainClass) ? mainClass : compilation.mainClasses[0]
          const projectRoot = await projects.getProjectRoot(id)
          const classesDir = join(workspace, 'build', id, 'classes')
          const manifest = await buildInstrumentationSourceManifest(projectRoot, classesDir)
          const capture = await runInstrumented({ projectId: id, projectRoot, classesDir, mainClass: selected,
            javaPath: compilation.jdk.javaPath, javacPath: compilation.jdk.javacPath,
            sourcePaths: manifest.sources.map((source) => source.fileId), rawEventLimit: 20000,
            rawByteLimit: 8 * 1024 * 1024, timeoutMs: 30000 })
          return { build: compilation, ...capture, sourceManifest: manifest }
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
      const filename = url.pathname === '/' || url.pathname === '/ide' ? 'index.html' : decodeURIComponent(url.pathname.slice(1))
      if (filename.includes('..') || filename.startsWith('/')) throw Object.assign(new Error('Invalid asset'), { status: 400 })
      const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', woff2: 'font/woff2', ttf: 'font/ttf' }
      const data = await readFile(join(repository, 'dist', filename))
      response.writeHead(200, { 'content-type': types[filename.split('.').at(-1)] || 'application/octet-stream' })
      return response.end(data)
    }
    return json(response, 404, { error: 'Not found' })
  } catch (error) {
    const status = error.status || (error.code === 'ENOENT' ? 404 : error.code === 'EEXIST' ? 409 : 500)
    if (status >= 500) console.error(error)
    if (!response.headersSent) json(response, status, { error: status >= 500 ? 'Bridge operation failed' : error.message })
    else response.end()
  }
})

server.listen(port, '127.0.0.1', () => console.log(`GGJavaEZ bridge listening on http://127.0.0.1:${port}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await debuggerSessions.stop(); await runs.stop(); server.close(); process.exit(0) })
