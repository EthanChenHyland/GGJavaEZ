import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, readdir, readFile, realpath, rm } from 'node:fs/promises'
import { arch, platform } from 'node:os'
import { join, resolve, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LspTransport, languageError } from './language/transport.mjs'
import { ProjectUris, sanitizeHostPaths } from './language/uris.mjs'

const REQUESTS = new Set([
  'textDocument/completion', 'completionItem/resolve', 'textDocument/hover',
  'textDocument/signatureHelp', 'textDocument/definition', 'textDocument/declaration',
  'textDocument/references', 'textDocument/prepareRename', 'textDocument/rename',
  'textDocument/documentSymbol', 'textDocument/codeAction', 'codeAction/resolve',
  'workspace/symbol', 'workspace/executeCommand',
])
const NOTIFICATIONS = new Set([
  'textDocument/didOpen', 'textDocument/didChange', 'textDocument/didSave',
  'textDocument/didClose', 'workspace/didChangeWatchedFiles',
  'workspace/didChangeConfiguration',
])
const EDIT_COMMANDS = new Set(['java.edit.organizeImports', 'java.apply.workspaceEdit'])
const REQUEST_DEADLINE = 20000
const INITIALIZE_DEADLINE = 15000
const MAX_NOTIFICATIONS = 512

function jdkMajor(jdk) { return Number(String(jdk?.version ?? '').match(/^\d+/)?.[0] ?? 0) }
function defer() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  promise.catch(() => {})
  return { promise, resolve, reject }
}
function safeMessage(error) { return sanitizeHostPaths(error?.message ?? error).slice(0, 400) }
function within(root, path) {
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith('/')
}
function plainSourceRoot(root) { return root === '.' ? '.' : root }
export function configurationValue(settings, section) {
  if (!section) return { java: settings }
  if (section === 'java') return settings
  if (!section.startsWith('java.')) return null
  return section.slice(5).split('.').reduce((value, key) => value?.[key], settings) ?? null
}
function classpathEntries(value) {
  const entries = Array.isArray(value) ? value : value?.classpaths
  return Array.isArray(entries) ? entries.filter(item => typeof item === 'string').map(item => {
    try { return item.startsWith('file:') ? new URL(item).pathname : resolve(item) } catch { return item }
  }) : null
}
function classpathMismatch(model, observed, projectRoot) {
  const actual = classpathEntries(observed)
  if (!actual) return null
  const outputs = new Set([model.classesDir, ...(model.outputRoots ?? [])].filter(Boolean).map(item => resolve(item)))
  const expected = (model.runtimeClasspath ?? []).filter(item => typeof item === 'string').map(item => resolve(item)).filter(item => !outputs.has(item))
  const received = actual.map(item => resolve(item)).filter(item =>
    !outputs.has(item) && (expected.includes(item) || !within(projectRoot, item)))
  return expected.length === received.length && expected.every((item, index) => item === received[index]) ? false : true
}

export function javaSettings(model, jdk, projectRoot, cacheRoot) {
  const major = jdkMajor(jdk)
  const sourcePaths = (model.sourceRoots ?? []).map(plainSourceRoot)
  const libraries = (model.compileClasspath ?? []).filter(path =>
    typeof path === 'string' && /\.(?:jar|zip)$/i.test(path))
  return {
    home: jdk.home,
    configuration: {
      runtimes: [{ name: `JavaSE-${major}`, path: jdk.home, default: true }],
    },
    project: {
      sourcePaths,
      referencedLibraries: libraries,
      outputPath: cacheRoot,
    },
    import: {
      maven: { enabled: model.buildSystem === 'maven', offline: true },
      gradle: { enabled: model.buildSystem === 'gradle', offline: true },
    },
    autobuild: { enabled: false },
    maxConcurrentBuilds: 1,
    maven: { downloadSources: false, downloadJavadoc: false, updateSnapshots: false },
    implementationsCodeLens: { enabled: false },
    referencesCodeLens: { enabled: false },
    format: { onType: { enabled: false } },
    saveActions: { organizeImports: false },
    completion: { enabled: true, guessMethodArguments: true },
    signatureHelp: { enabled: true },
    telemetry: { enabled: false },
  }
}

export function launchConfig(installation, jdk, dataRoot, configRoot) {
  const system = platform()
  const machine = arch()
  const config = system === 'darwin' ? (machine === 'arm64' ? 'config_mac_arm' : 'config_mac')
    : system === 'linux' ? 'config_linux' : system === 'win32' ? 'config_win' : null
  if (!config) throw languageError(`JDT LS is unsupported on ${system}`, 503)
  return { config: join(installation, config), args: [
    '-Declipse.application=org.eclipse.jdt.ls.core.id1',
    '-Dosgi.bundles.defaultStartLevel=4',
    '-Declipse.product=org.eclipse.jdt.ls.core.product',
    '-Dosgi.checkConfiguration=true',
    '-Xms64m', '-Xmx512m', '-XX:ActiveProcessorCount=2',
    '-XX:MaxMetaspaceSize=256m', '-XX:ReservedCodeCacheSize=96m',
    '-XX:MaxDirectMemorySize=128m',
    '-Dfile.encoding=UTF-8', '-Djava.awt.headless=true',
    '-Dlog.protocol=false', '-Dlog.level=WARNING',
    ...(jdkMajor(jdk) >= 24 ? ['-Djdk.xml.maxGeneralEntitySizeLimit=0', '-Djdk.xml.totalEntitySizeLimit=0'] : []),
    '--add-modules=ALL-SYSTEM',
    '--add-opens', 'java.base/java.util=ALL-UNNAMED',
    '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
    '-jar', null, '-configuration', configRoot, '-data', dataRoot,
  ] }
}

export class JavaLanguageService {
  constructor({ workspaceRoot, installation, spawnProcess = spawn, transportFactory = (input, output) => new LspTransport(input, output) } = {}) {
    this.workspaceRoot = resolve(workspaceRoot)
    this.installation = installation ?? process.env.GGJAVA_JDTLS_HOME ?? join(this.workspaceRoot, 'tools', 'jdtls', '1.61.0')
    this.spawnProcess = spawnProcess
    this.transportFactory = transportFactory
    this.current = null
    this.generation = 0
    this.lifecycle = Promise.resolve()
  }

  status(projectId) {
    const session = this.current
    if (!session || session.projectId !== projectId) return {
      projectId, generation: this.generation, status: 'stopped', message: null,
      diagnostics: [], metrics: {},
    }
    return {
      projectId, generation: session.generation, status: session.status,
      message: session.message, diagnostics: [...session.diagnostics.values()],
      metrics: {
        uptimeMs: Date.now() - session.startedAt,
        classpathMismatch: session.classpathMismatch == null ? null : Number(session.classpathMismatch),
        ...session.transport?.stats,
      },
    }
  }

  async open({ projectId, projectRoot, model, jdk }) {
    const root = resolve(projectRoot)
    if (!within(this.workspaceRoot, root)) throw languageError('Language project is outside managed workspace', 400)
    const uris = new ProjectUris(projectId, root)
    const old = this.current
    if (old && old.projectId === projectId && old.root === root &&
        old.revision === model?.revision && old.jdk?.home === jdk?.home &&
        !['failed', 'unavailable', 'stopped'].includes(old.status)) return this.status(projectId)
    const session = this.#newSession({ projectId, root, uris, model, jdk, documents: new Map() })
    this.current = session
    if (old) this.#cancel(old)
    this.lifecycle = this.lifecycle.catch(() => {}).then(async () => {
      if (old) await this.#dispose(old)
      if (this.current === session) await this.#start(session)
    }).catch(error => this.#fail(session, error))
    return this.status(projectId)
  }

  async restart(projectId) {
    const old = this.#require(projectId)
    const documents = new Map(old.documents)
    const session = this.#newSession({ projectId, root: old.root, uris: old.uris,
      model: old.model, jdk: old.jdk, documents })
    this.current = session
    this.#cancel(old)
    this.lifecycle = this.lifecycle.catch(() => {}).then(async () => {
      await this.#dispose(old)
      if (this.current === session) await this.#start(session)
    }).catch(error => this.#fail(session, error))
    return this.status(projectId)
  }

  async stop() {
    const old = this.current
    this.current = null
    this.generation++
    if (old) this.#cancel(old)
    this.lifecycle = this.lifecycle.catch(() => {}).then(() => old ? this.#dispose(old) : undefined)
    await this.lifecycle
  }

  async request(projectId, method, params) {
    const session = this.#require(projectId)
    if (!REQUESTS.has(method)) throw languageError(`Unsupported language request: ${method}`, 400)
    if (method === 'workspace/executeCommand' && !EDIT_COMMANDS.has(params?.command)) {
      throw languageError('This Java command is unavailable in draft-only editing', 422)
    }
    const deadline = Date.now() + REQUEST_DEADLINE
    await this.#ready(session, deadline)
    if (this.current !== session) throw languageError('Language generation changed', 409)
    const incoming = this.#restoreOpaque(session, method, session.uris.mapIncoming(params))
    let result
    try {
    if (method === 'workspace/executeCommand') {
      if (session.commandEdits) throw languageError('Java edit command already running', 429)
      session.commandEdits = []
      try {
        result = await session.transport.request(method, incoming, { timeoutMs: Math.max(1, deadline - Date.now()) })
        if (session.commandEdits.length) {
          if (session.commandEdits.length !== 1 || result && typeof result === 'object' && ('changes' in result || 'documentChanges' in result)) {
            throw languageError('Java command returned multiple workspace edits', 422)
          }
          result = session.commandEdits[0]
        }
        if (result != null && (typeof result !== 'object' || !('changes' in result || 'documentChanges' in result))) {
          throw languageError('Java command did not return a draft workspace edit', 422)
        }
      } finally { session.commandEdits = null }
    } else result = await session.transport.request(method, incoming, { timeoutMs: Math.max(1, deadline - Date.now()) })
    } catch (error) { throw languageError(safeMessage(error), error?.status ?? 502, error?.code ?? -32002) }
    if (this.current !== session) throw languageError('Language generation changed', 409)
    if (method === 'textDocument/rename') return result == null ? null : session.uris.workspaceEdit(result)
    if (method === 'workspace/executeCommand' && result && typeof result === 'object' && ('changes' in result || 'documentChanges' in result)) {
      return session.uris.workspaceEdit(result)
    }
    if (method === 'textDocument/codeAction' && Array.isArray(result)) {
      result.forEach(action => { if (action?.edit) session.uris.workspaceEdit(action.edit) })
    }
    if (method === 'codeAction/resolve' && result?.edit) session.uris.workspaceEdit(result.edit)
    return session.uris.mapOutgoing(this.#hideOpaque(session, result))
  }

  async notify(projectId, method, params) {
    const session = this.#require(projectId)
    if (!NOTIFICATIONS.has(method)) throw languageError(`Unsupported language notification: ${method}`, 400)
    const translated = session.uris.mapIncoming(params)
    if (method.startsWith('textDocument/')) this.#trackDocument(session, method, translated)
    if (!session.initialized) {
      if (session.notifications.length >= MAX_NOTIFICATIONS) throw languageError('Too many queued language notifications', 429)
      session.notifications.push([method, translated])
      return
    }
    session.transport.notify(method, translated)
  }

  #newSession({ projectId, root, uris, model, jdk, documents }) {
    return {
      projectId, root, uris, model, revision: model?.revision, jdk, documents,
      generation: ++this.generation, status: 'starting', message: 'Starting Java language service…',
      diagnostics: new Map(), notifications: [], ready: defer(), initialized: false,
      classpathMismatch: null, opaque: new Map(), serviceReady: false, projectsImported: false,
      startedAt: Date.now(), commandEdits: null, closing: false,
    }
  }
  #require(projectId) {
    if (!this.current || this.current.projectId !== projectId) throw languageError('Language project is not open', 409)
    return this.current
  }
  #cancel(session) {
    session.closing = true
    session.ready.reject(languageError('Language generation changed', 409))
    session.transport?.cancelPending?.(languageError('Language generation changed', 409))
    session.diagnostics.clear()
  }
  async #ready(session, deadline) {
    const ms = Math.max(1, deadline - Date.now())
    let timer
    try { await Promise.race([
      session.ready.promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(languageError('Language initialization timed out', 504)), ms) }),
    ]) } catch (error) { throw languageError(safeMessage(error), error?.status ?? 503, error?.code ?? -32002) }
    finally { clearTimeout(timer) }
  }
  #trackDocument(session, method, params) {
    const uri = params?.textDocument?.uri
    if (!uri) throw languageError('Language document URI is required', 400)
    if (method === 'textDocument/didOpen') {
      const { text, version } = params.textDocument
      if (typeof text !== 'string' || !Number.isInteger(version) || version < 1) throw languageError('Invalid language document', 400)
      session.documents.set(uri, { text, version })
    } else if (method === 'textDocument/didChange') {
      const previous = session.documents.get(uri)
      const version = params.textDocument.version
      if (!previous || !Number.isInteger(version) || version <= previous.version) throw languageError('Stale language document version', 409)
      const changes = params.contentChanges
      if (!Array.isArray(changes) || changes.length !== 1 || typeof changes[0]?.text !== 'string' || changes[0].range) {
        throw languageError('Only full-text draft changes are supported', 400)
      }
      session.documents.set(uri, { text: changes[0].text, version })
    } else if (method === 'textDocument/didClose') session.documents.delete(uri)
  }

  #token(session, value) {
    const token = randomUUID()
    if (session.opaque.size >= 512) session.opaque.delete(session.opaque.keys().next().value)
    session.opaque.set(token, value)
    return { __ggjavaToken: token }
  }
  #hideOpaque(session, value, depth = 0) {
    if (depth > 48 || !value || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(item => this.#hideOpaque(session, item, depth + 1))
    const result = {}
    for (const [key, item] of Object.entries(value)) {
      if (key === 'data' && item !== undefined) result[key] = this.#token(session, item)
      else if (key === 'arguments' && typeof value.command === 'string' && Array.isArray(item) && item.length) {
        result[key] = [this.#token(session, item)]
      } else result[key] = this.#hideOpaque(session, item, depth + 1)
    }
    return result
  }
  #restoreOpaque(session, method, params) {
    if (!params || typeof params !== 'object') return params
    if (['completionItem/resolve', 'codeAction/resolve'].includes(method) && params.data?.__ggjavaToken) {
      const value = session.opaque.get(params.data.__ggjavaToken)
      if (value === undefined) throw languageError('Stale language resolution data', 409)
      return { ...params, data: value }
    }
    if (method === 'workspace/executeCommand' && params.arguments?.[0]?.__ggjavaToken) {
      const value = session.opaque.get(params.arguments[0].__ggjavaToken)
      if (!Array.isArray(value)) throw languageError('Stale language command', 409)
      return { ...params, arguments: value }
    }
    return params
  }

  async #start(session) {
    try {
      const jdk = session.jdk
      if (!jdk?.available || !jdk.home || !jdk.javaPath || jdkMajor(jdk) < 21) {
        throw languageError('JDT LS requires a complete JDK 21 or newer', 503)
      }
      const actualRoot = await realpath(session.root)
      const actualWorkspace = await realpath(this.workspaceRoot)
      if (!within(actualWorkspace, actualRoot)) throw languageError('Language project left managed workspace', 400)
      const installation = resolve(this.installation)
      const marker = await readFile(join(installation, 'ggjavaez-install.json'), 'utf8').then(JSON.parse).catch(() => null)
      if (!process.env.GGJAVA_JDTLS_HOME &&
          (marker?.version !== '1.61.0' || marker?.sha256 !== '338e7e73d61836651ba2453919a0d34fa763eb4e7c03342092309bffb8934c64')) {
        throw languageError('JDT LS 1.61.0 is not installed; run setup-java-language.mjs', 503)
      }
      const launch = launchConfig(installation, jdk)
      const configRoot = join(this.workspaceRoot, 'language', 'config', String(session.generation))
      const dataRoot = join(this.workspaceRoot, 'language', 'data', session.projectId, `jdtls-${marker?.version ?? 'override'}-${session.revision ?? 'unknown'}`)
      await mkdir(join(configRoot, '..'), { recursive: true })
      await rm(configRoot, { recursive: true, force: true })
      await cp(launch.config, configRoot, { recursive: true })
      await mkdir(dataRoot, { recursive: true })
      await mkdir(join(this.workspaceRoot, 'language', 'output', session.projectId), { recursive: true })
      const jars = (await readdir(join(installation, 'plugins'))).filter(name => /^org\.eclipse\.equinox\.launcher_.*\.jar$/.test(name))
      if (jars.length !== 1) throw languageError('JDT LS launcher archive is missing or ambiguous', 503)
      const args = launch.args
      args[args.indexOf(null)] = join(installation, 'plugins', jars[0])
      args[args.indexOf('-configuration') + 1] = configRoot
      args[args.indexOf('-data') + 1] = dataRoot
      const env = { ...process.env }
      for (const key of ['CLIENT_HOST', 'CLIENT_PORT', 'CLIENT_PIPE', 'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS']) delete env[key]
      if (session.closing || this.current !== session) return
      const child = this.spawnProcess(jdk.javaPath, args, { shell: false, detached: process.platform !== 'win32', windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'], cwd: session.root, env })
      session.child = child
      session.stderr = ''
      child.stderr.on('data', chunk => { session.stderr = (session.stderr + chunk.toString('utf8')).slice(-8192) })
      child.on('error', error => this.#fail(session, error))
      child.on('exit', (code, signal) => {
        session.transport?.close(languageError('JDT LS process exited', 503))
        if (!session.closing) this.#fail(session, languageError(`JDT LS exited (${code ?? signal ?? 'unknown'})`, 503))
      })
      const transport = this.transportFactory(child.stdout, child.stdin)
      session.transport = transport
      transport.on('notification', (method, params) => this.#notification(session, method, params))
      transport.on('closed', error => { if (!session.closing) this.#fail(session, error) })
      transport.onRequest = (method, params) => this.#serverRequest(session, method, params)
      const settings = javaSettings(session.model, jdk, session.root,
        join(this.workspaceRoot, 'language', 'output', session.projectId))
      session.settings = settings
      const rootUri = pathToFileURL(session.root).href
      await transport.request('initialize', {
        processId: process.pid, clientInfo: { name: 'Visual Java', version: '0.1.0' },
        rootUri, workspaceFolders: [{ name: session.projectId, uri: rootUri }],
        initializationOptions: { bundles: [], workspaceFolders: [rootUri], settings: { java: settings } },
        capabilities: {
          workspace: { workspaceFolders: true, configuration: true, applyEdit: true,
            workspaceEdit: { documentChanges: true, resourceOperations: [] },
            symbol: { dynamicRegistration: false } },
          textDocument: {
            synchronization: { dynamicRegistration: false, didSave: true },
            completion: { completionItem: { snippetSupport: true, resolveSupport: { properties: ['documentation', 'detail', 'additionalTextEdits'] } } },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            signatureHelp: { signatureInformation: { documentationFormat: ['markdown', 'plaintext'], parameterInformation: { labelOffsetSupport: true } } },
            definition: { linkSupport: true }, references: {}, rename: { prepareSupport: true },
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
            codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ['quickfix', 'refactor', 'source.organizeImports'] } }, resolveSupport: { properties: ['edit', 'command'] } },
          },
        },
        trace: 'off',
      }, { timeoutMs: INITIALIZE_DEADLINE })
      if (session.closing || this.current !== session) return
      transport.notify('initialized', {})
      session.initialized = true
      // Restart reconstructs unsaved drafts as open documents in the new process.
      for (const [uri, document] of session.documents) transport.notify('textDocument/didOpen', {
        textDocument: { uri, languageId: 'java', version: document.version, text: document.text },
      })
      for (const [method, params] of session.notifications) {
        if (method.startsWith('textDocument/')) continue // already reconstructed from latest draft
        transport.notify(method, params)
      }
      session.notifications = []
      session.status = 'indexing'
      session.message = 'Importing and indexing Java project…'
      this.#refreshReady(session)
    } catch (error) { this.#fail(session, error) }
  }

  #notification(session, method, params) {
    if (this.current !== session || session.closing) return
    if (method === 'textDocument/publishDiagnostics') {
      const uri = session.uris.toBrowser(params?.uri)
      if (!uri) return
      if (!Array.isArray(params.diagnostics) || params.diagnostics.length > 2000) return
      const group = { uri, diagnostics: params.diagnostics.map(item => session.uris.mapOutgoing(item)).filter(Boolean) }
      if (Number.isInteger(params.version)) group.version = params.version
      if (group.diagnostics.length) session.diagnostics.set(uri, group)
      else session.diagnostics.delete(uri)
    } else if (method === 'language/status') {
      if (params?.type === 'Starting') session.status = 'indexing'
      if (params?.type === 'ServiceReady') session.serviceReady = true
      this.#refreshReady(session)
    } else if (method === 'language/eventNotification') {
      if (params?.eventType === 'ProjectsImported' || params?.eventType === 200) {
        session.projectsImported = true
        this.#refreshReady(session)
      }
    }
  }

  #refreshReady(session) {
    if (!session.initialized || session.closing || !session.serviceReady || !session.projectsImported) return
    if (session.status === 'ready') return
    session.status = 'ready'
    session.message = jdkMajor(session.jdk) >= 26 ? 'Java 26 semantic coverage is provisional with JDT LS 1.61.0.' : null
    session.ready.resolve()
    void this.#checkClasspath(session)
  }

  async #checkClasspath(session) {
    const source = session.model?.sourcePaths?.[0]
    if (!source || !session.transport || session.closing) return
    try {
      const uri = session.uris.fromRelative(source)
      const result = await session.transport.request('workspace/executeCommand', {
        // JDT's JSONUtility accepts this extension argument as a JSON string.
        command: 'java.project.getClasspaths', arguments: [uri, JSON.stringify({ scope: 'runtime' })],
      }, { timeoutMs: 8000 })
      if (session.closing || this.current !== session) return
      const mismatch = classpathMismatch(session.model, result, session.root)
      session.classpathMismatch = mismatch
      if (mismatch) session.message = 'JDT LS and build classpaths differ; build model remains authoritative.'
    } catch { /* Query is advisory and is unsupported by some JDT project imports. */ }
  }

  #serverRequest(session, method, params) {
    if (this.current !== session || session.closing) throw languageError('Stale language generation', 409)
    if (method === 'workspace/configuration') return (params?.items ?? []).map(item => configurationValue(session.settings, item.section))
    if (method === 'workspace/workspaceFolders') return [{ name: session.projectId, uri: session.uris.rootUri }]
    if (method === 'window/workDoneProgress/create' || method === 'client/registerCapability' || method === 'client/unregisterCapability') return null
    if (method === 'workspace/applyEdit') {
      if (!session.commandEdits) return { applied: false, failureReason: 'Only explicit draft actions may apply edits' }
      try {
        session.uris.workspaceEdit(params?.edit)
        session.commandEdits.push(params.edit)
        return { applied: true }
      } catch (error) { return { applied: false, failureReason: safeMessage(error) } }
    }
    throw languageError(`Unsupported JDT LS client request: ${method}`, 400, -32601)
  }
  #fail(session, error) {
    if (session.closing || this.current !== session) return
    session.status = error?.status === 503 ? 'unavailable' : 'failed'
    session.message = safeMessage(error)
    session.ready.reject(error)
    session.transport?.close(error)
    if (session.child && session.child.exitCode === null) this.#kill(session.child)
  }
  #kill(child) {
    try {
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL')
      else child.kill('SIGKILL')
    } catch { try { child.kill('SIGKILL') } catch { /* already exited */ } }
  }
  async #dispose(session) {
    session.closing = true
    const child = session.child
    const transport = session.transport
    if (!child) return
    if (transport && !transport.closed) {
      try { await transport.request('shutdown', null, { timeoutMs: 1500 }); transport.notify('exit', null) } catch { /* forced cleanup below */ }
      transport.close()
    }
    child.stdin?.end()
    if (child.exitCode !== null) return
    await new Promise(done => {
      const timer = setTimeout(() => { this.#kill(child); done() }, 2000)
      child.once('exit', () => { clearTimeout(timer); done() })
    })
  }
}
