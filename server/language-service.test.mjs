import { test } from 'vitest'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { JavaLanguageService, javaSettings, configurationValue } from './language-service.mjs'
import { ProjectUris } from './language/uris.mjs'
import { SHA256, VERSION, validateArchive } from '../scripts/setup-java-language.mjs'

function fakeProcess() {
  const child = new EventEmitter()
  child.pid = null
  child.exitCode = null
  child.stdout = new PassThrough()
  child.stdin = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = () => { child.exitCode = 0; child.emit('exit', 0, null) }
  child.stdin.on('finish', () => child.kill())
  return child
}
class FakeTransport extends EventEmitter {
  constructor(autoReady = true) { super(); this.autoReady = autoReady; this.calls = []; this.closed = false; this.stats = { requests: 0 } }
  async request(method, params) {
    this.calls.push({ method, params })
    this.stats.requests++
    if (method === 'workspace/executeCommand') return { classpaths: ['/deps/a.jar'] }
    if (method === 'textDocument/completion') return [{ label: 'Main', data: { uri: 'jdt://opaque/internal' } }]
    if (method === 'completionItem/resolve') return { ...params, detail: params.data.uri === 'jdt://opaque/internal' ? 'resolved' : 'lost' }
    if (method === 'textDocument/definition') return [
      { uri: params.textDocument.uri, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
      { uri: 'file:///private/outside/Secret.java', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
    ]
    return null
  }
  notify(method, params) {
    this.calls.push({ method, params })
    if (method === 'initialized' && this.autoReady) queueMicrotask(() => {
      this.emit('notification', 'language/status', { type: 'Started', message: 'Ready' })
      this.emit('notification', 'language/status', { type: 'ServiceReady', message: 'ServiceReady' })
    })
  }
  close() { this.closed = true }
}
async function fixture({ autoReady = true } = {}) {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'ggjava-language-'))
  const projectRoot = join(workspaceRoot, 'projects', 'alpha')
  const installation = join(workspaceRoot, 'tools', 'jdtls', VERSION)
  await mkdir(join(projectRoot, 'src'), { recursive: true })
  await mkdir(join(installation, 'plugins'), { recursive: true })
  for (const config of ['config_linux', 'config_mac', 'config_mac_arm', 'config_win']) await mkdir(join(installation, config))
  await writeFile(join(installation, 'plugins', 'org.eclipse.equinox.launcher_fake.jar'), '')
  await writeFile(join(installation, 'ggjavaez-install.json'), JSON.stringify({ version: VERSION, sha256: SHA256 }))
  await writeFile(join(projectRoot, 'src', 'Main.java'), 'class Main {}')
  const transports = []
  const service = new JavaLanguageService({ workspaceRoot, installation,
    spawnProcess: () => fakeProcess(),
    transportFactory: () => { const transport = new FakeTransport(autoReady); transports.push(transport); return transport },
  })
  const jdk = { available: true, home: '/jdk', javaPath: '/jdk/bin/java', version: '26' }
  const model = { revision: 1, buildSystem: 'plain', sourceRoots: ['src'], sourcePaths: ['src/Main.java'],
    compileClasspath: ['/deps/a.jar'], runtimeClasspath: ['/deps/a.jar'], outputRoots: [] }
  return { workspaceRoot, projectRoot, service, transports, model, jdk,
    cleanup: async () => { await service.stop(); await rm(workspaceRoot, { recursive: true, force: true }) } }
}
async function ready(service, projectId) {
  for (let index = 0; index < 40; index++) {
    if (service.status(projectId).status === 'ready') return
    await new Promise(done => setTimeout(done, 5))
  }
  assert.fail('fake language service did not initialize')
}
async function initialized(f) {
  for (let index = 0; index < 40; index++) {
    if (f.transports[0]?.calls.some(call => call.method === 'initialized')) return f.transports[0]
    await new Promise(done => setTimeout(done, 5))
  }
  assert.fail('fake language service did not initialize transport')
}

test('open is prompt, diagnostics and locations are project scoped, restart preserves draft', async () => {
  const f = await fixture()
  try {
    const first = await f.service.open({ projectId: 'alpha', projectRoot: f.projectRoot, model: f.model, jdk: f.jdk })
    assert.equal(first.status, 'starting')
    await ready(f.service, 'alpha')
    for (let index = 0; index < 40 && f.service.status('alpha').metrics.classpathMismatch === null; index++) {
      await new Promise(done => setTimeout(done, 5))
    }
    assert.equal(f.service.status('alpha').metrics.classpathMismatch, 0, JSON.stringify(f.transports[0].calls))
    const uri = 'inmemory://ggjavaez/alpha/src/Main.java'
    await f.service.notify('alpha', 'textDocument/didOpen', { textDocument: { uri, languageId: 'java', version: 1, text: 'class Main {}' } })
    f.transports[0].emit('notification', 'textDocument/publishDiagnostics', {
      uri: new ProjectUris('alpha', f.projectRoot).toServer(uri), version: 1,
      diagnostics: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, message: 'test' }],
    })
    assert.equal(f.service.status('alpha').diagnostics[0].uri, uri)
    const definitions = await f.service.request('alpha', 'textDocument/definition', { textDocument: { uri }, position: { line: 0, character: 1 } })
    assert.equal(definitions.length, 1)
    assert.equal(definitions[0].uri, uri)
    const completions = await f.service.request('alpha', 'textDocument/completion', { textDocument: { uri }, position: { line: 0, character: 1 } })
    assert.equal(JSON.stringify(completions).includes('jdt://'), false)
    const resolved = await f.service.request('alpha', 'completionItem/resolve', completions[0])
    assert.equal(resolved.detail, 'resolved')
    const restarted = await f.service.restart('alpha')
    assert.equal(restarted.status, 'starting')
    assert.equal(restarted.diagnostics.length, 0)
    assert.ok(restarted.generation > first.generation)
    await ready(f.service, 'alpha')
    assert.ok(f.transports[1].calls.some(call => call.method === 'textDocument/didOpen' && call.params.textDocument.uri.endsWith('/src/Main.java')))
    f.transports[0].emit('notification', 'textDocument/publishDiagnostics', { uri: new ProjectUris('alpha', f.projectRoot).toServer(uri), diagnostics: [{ message: 'stale' }] })
    assert.equal(f.service.status('alpha').diagnostics.length, 0)
  } finally { await f.cleanup() }
})

test('allowlist, version monotonicity, and URI escape checks', async () => {
  const f = await fixture()
  try {
    await f.service.open({ projectId: 'alpha', projectRoot: f.projectRoot, model: f.model, jdk: f.jdk })
    await ready(f.service, 'alpha')
    const uri = 'inmemory://ggjavaez/alpha/src/Main.java'
    await assert.rejects(f.service.request('alpha', 'shutdown', {}), /Unsupported/)
    await assert.rejects(f.service.request('alpha', 'workspace/executeCommand', { command: 'java.project.getClasspaths' }), /unavailable/)
    await f.service.notify('alpha', 'textDocument/didOpen', { textDocument: { uri, version: 1, text: 'x' } })
    await assert.rejects(f.service.notify('alpha', 'textDocument/didChange', { textDocument: { uri, version: 1 }, contentChanges: [{ text: 'y' }] }), /Stale/)
    const mapper = new ProjectUris('alpha', f.projectRoot)
    assert.throws(() => mapper.toServer('inmemory://ggjavaez/alpha/../outside.java'))
    assert.throws(() => mapper.toServer('inmemory://ggjavaez/other/src/Main.java'))
    assert.throws(() => mapper.workspaceEdit({ changes: { 'file:///private/outside.java': [] } }), /external/)
  } finally { await f.cleanup() }
})

test('pinned setup rejects an invalid local archive without extraction', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ggjava-language-archive-'))
  try {
    const file = join(dir, 'bad.tar.gz')
    await writeFile(file, 'invalid')
    await assert.rejects(validateArchive(file), /SHA-256 mismatch/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('settings keep canonical roots and dependencies apart from build output', () => {
  const settings = javaSettings({ buildSystem: 'plain', sourceRoots: ['src'], compileClasspath: ['/deps/a.jar', '/build/classes'] },
    { home: '/jdk', version: '26' }, '/project', '/cache/output')
  assert.deepEqual(settings.project.sourcePaths, ['src'])
  assert.deepEqual(settings.project.referencedLibraries, ['/deps/a.jar'])
  assert.equal(settings.configuration.runtimes[0].name, 'JavaSE-26')
  assert.equal(configurationValue(settings, 'java.import.maven.enabled'), false)
  assert.deepEqual(configurationValue(settings, 'java.configuration.runtimes'), settings.configuration.runtimes)
  assert.equal(configurationValue(settings, 'java.missing'), null)
  assert.equal(settings.project.outputPath, '')
  assert.deepEqual(javaSettings({ sourceRoots: ['.', 'src/main/java'] }, { home: '/jdk', version: '21' })
    .project.sourcePaths, ['', 'src/main/java'])
})

test('normal JDT startup uses Started and ServiceReady without a later ProjectsImported event', async () => {
  const f = await fixture({ autoReady: false })
  try {
    await f.service.open({ projectId: 'alpha', projectRoot: f.projectRoot, model: f.model, jdk: f.jdk })
    await initialized(f)
    assert.equal(f.service.status('alpha').status, 'indexing')
    const values = f.transports[0].onRequest('workspace/configuration', { items: [
      { section: 'java' }, { section: 'java.import.maven.enabled' }, { section: 'java.configuration.runtimes' },
    ] })
    assert.equal(values[1], false)
    assert.deepEqual(values[2], values[0].configuration.runtimes)
    f.transports[0].emit('notification', 'language/status', { type: 'ServiceReady' })
    assert.equal(f.service.status('alpha').status, 'indexing')
    f.transports[0].emit('notification', 'language/eventNotification', { eventType: 200, data: [] })
    assert.equal(f.service.status('alpha').status, 'indexing')
    f.transports[0].emit('notification', 'language/status', { type: 'Started', message: 'Ready' })
    assert.equal(f.service.status('alpha').status, 'ready')
  } finally { await f.cleanup() }
})

test('source triggers import arbitrary root and nested sources before editor didOpen', async () => {
  const f = await fixture({ autoReady: false })
  try {
    f.model.sourceRoots = ['.', 'src']
    f.model.sourcePaths = ['Main.java', 'src/Main.java']
    await writeFile(join(f.projectRoot, 'Main.java'), 'class Other {}')
    await f.service.open({ projectId: 'alpha', projectRoot: f.projectRoot, model: f.model, jdk: f.jdk })
    const transport = await initialized(f)
    const params = transport.calls.find(call => call.method === 'initialize').params
    const mapper = new ProjectUris('alpha', f.projectRoot)
    assert.deepEqual(params.initializationOptions.triggerFiles,
      ['Main.java', 'src/Main.java'].map(path => mapper.fromRelative(path)))
    assert.deepEqual(params.initializationOptions.settings.java.project.sourcePaths, ['', 'src'])
    assert.equal(params.initializationOptions.settings.java.project.outputPath, '')
    assert.equal(transport.calls.some(call => call.method === 'textDocument/didOpen'), false)
    transport.emit('notification', 'language/status', { type: 'Started' })
    assert.equal(f.service.status('alpha').status, 'indexing')
    transport.emit('notification', 'language/status', { type: 'ServiceReady' })
    assert.equal(f.service.status('alpha').status, 'ready')
  } finally { await f.cleanup() }
})

test('JDT import failure stays failed even if ServiceReady follows', async () => {
  const f = await fixture({ autoReady: false })
  try {
    await f.service.open({ projectId: 'alpha', projectRoot: f.projectRoot, model: f.model, jdk: f.jdk })
    const transport = await initialized(f)
    transport.emit('notification', 'language/status', { type: 'Error', message: 'Failed to import projects' })
    transport.emit('notification', 'language/status', { type: 'Started' })
    transport.emit('notification', 'language/status', { type: 'ServiceReady' })
    assert.equal(f.service.status('alpha').status, 'failed')
    assert.equal(f.service.status('alpha').message, 'Failed to import projects')
    await assert.rejects(f.service.request('alpha', 'textDocument/hover', {}), /Failed to import projects/)
  } finally { await f.cleanup() }
})

test('initialization status signals received before initialize response are preserved', async () => {
  const f = await fixture({ autoReady: false })
  const factory = f.service.transportFactory
  f.service.transportFactory = (...args) => {
    const transport = factory(...args)
    const request = transport.request.bind(transport)
    transport.request = async (method, params) => {
      if (method === 'initialize') {
        transport.emit('notification', 'language/status', { type: 'Started' })
        transport.emit('notification', 'language/status', { type: 'ServiceReady' })
        assert.notEqual(f.service.status('alpha').status, 'ready')
      }
      return request(method, params)
    }
    return transport
  }
  try {
    await f.service.open({ projectId: 'alpha', projectRoot: f.projectRoot, model: f.model, jdk: f.jdk })
    await ready(f.service, 'alpha')
  } finally { await f.cleanup() }
})

test('private JDT output does not count as a dependency mismatch; external entries still do', async () => {
  const f = await fixture({ autoReady: false })
  try {
    await f.service.open({ projectId: 'alpha', projectRoot: f.projectRoot, model: f.model, jdk: f.jdk })
    let transport = await initialized(f)
    const projectRoot = join(f.workspaceRoot, 'language', 'data', 'alpha', `jdtls-${VERSION}-1`, 'invisible')
    transport.request = async () => ({ projectRoot: pathToFileURL(projectRoot).href,
      classpaths: [join(projectRoot, 'bin'), '/deps/a.jar'] })
    transport.emit('notification', 'language/status', { type: 'Started' })
    transport.emit('notification', 'language/status', { type: 'ServiceReady' })
    await new Promise(done => setTimeout(done, 0))
    assert.equal(f.service.status('alpha').metrics.classpathMismatch, 0)
    await f.service.restart('alpha')
    for (let i = 0; i < 40 && !f.transports[1]?.calls.some(call => call.method === 'initialized'); i++) {
      await new Promise(done => setTimeout(done, 5))
    }
    transport = f.transports[1]
    transport.request = async () => ({ projectRoot: 'file:///external/project',
      classpaths: ['/external/project/bin', '/deps/a.jar'] })
    transport.emit('notification', 'language/status', { type: 'Started' })
    transport.emit('notification', 'language/status', { type: 'ServiceReady' })
    await new Promise(done => setTimeout(done, 0))
    assert.equal(f.service.status('alpha').metrics.classpathMismatch, 1)
  } finally { await f.cleanup() }
})
