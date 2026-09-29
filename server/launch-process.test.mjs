import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { RunManager } from './runner.mjs'
import { prepareInstrumented, runInstrumented } from './instrumentation-provider.mjs'
import { DebugManager } from './debug-manager.mjs'

const directories = []
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

function child() {
  const value = new EventEmitter()
  value.pid = undefined
  value.stdin = new PassThrough(); value.stdout = new PassThrough(); value.stderr = new PassThrough()
  value.kill = () => { queueMicrotask(() => value.emit('close', null)); return true }
  return value
}
async function fixture() {
  const projectRoot = await mkdtemp(join(tmpdir(), 'java-launch-process-')); directories.push(projectRoot)
  const classesDir = join(projectRoot, 'classes')
  const workingDirectory = join(projectRoot, 'data')
  const library = join(projectRoot, 'dependency')
  await mkdir(join(classesDir, 'com', 'example'), { recursive: true }); await mkdir(workingDirectory); await mkdir(library)
  await writeFile(join(classesDir, 'com', 'example', 'Main.class'), 'placeholder project bytes')
  await writeFile(join(classesDir, 'config.txt'), 'resource preserved')
  await writeFile(join(library, 'Foreign.class'), 'placeholder dependency bytes')
  return { projectId: 'p', projectRoot, classesDir, javaPath: '/configured/java', javacPath: '/configured/javac',
    mainClass: 'com.example.Main', classpath: [classesDir, library, join(projectRoot, 'ordered second.jar')],
    programArgs: ['with spaces', '', '-cp'], jvmArgs: ['-Xmx128m', '-Duser.name=launch'], workingDirectory }
}

function fakeTools(calls) {
  return (command, args, options) => {
    calls.push({ command, args, options })
    const value = child()
    queueMicrotask(async () => {
      try {
        if (command.endsWith('javac')) {
          // The test exercises subprocess contracts, not Java compilation.
        } else if (args.includes('visualjava.OfflineTransformer')) {
          const at = args.indexOf('visualjava.OfflineTransformer')
          await cp(args[at + 1], args[at + 2], { recursive: true })
          value.stdout.write(JSON.stringify({ classes: 1, localsWithoutDebug: 0, executableLines: { 'com.example.Main': [3] } }))
        } else {
          const trace = args.find((arg) => arg.startsWith('-Dvisualjava.trace=')).slice('-Dvisualjava.trace='.length)
          await writeFile(trace, JSON.stringify({ v: 1, seq: 0, threadId: '1', type: 'line', frameId: 'frame',
            className: 'com.example.Main', methodName: 'main', descriptor: '([Ljava/lang/String;)V', line: 3, site: 0 }) + '\n')
          value.stdout.write('expected output')
        }
        value.stdout.end(); value.stderr.end(); value.emit('close', 0)
      } catch (error) { value.stderr.write(error.message); value.emit('close', 1) }
    })
    return value
  }
}

it('Run passes ordered classpath, literal program tokens, user JVM args and cwd directly to a fake process', async () => {
  const request = await fixture()
  const calls = []; let processChild
  const manager = new RunManager({ spawnProcess: (command, args, options) => {
    calls.push({ command, args, options }); processChild = child(); queueMicrotask(() => processChild.emit('spawn')); return processChild
  } })
  const run = await manager.start(request)
  expect(calls[0]).toMatchObject({ command: request.javaPath, options: { cwd: request.workingDirectory, shell: false } })
  expect(calls[0].args).toEqual([...request.jvmArgs, '-cp', request.classpath.join(delimiter), request.mainClass, ...request.programArgs])
  await expect(manager.start({ ...request, jvmArgs: ['-Dvisualjava.trace=bad'] })).rejects.toThrow(/reserved/)
  expect(manager.current().runId).toBe(run.runId)
  expect(manager.current().status).toBe('running')
  await manager.stop()
})

it('capture supplies dependency paths to transformer and JVM while covering only staged project classes/resources', async () => {
  const request = await fixture(); const calls = []
  const prepared = await prepareInstrumented(request, { spawnProcess: fakeTools(calls) })
  try {
    const transformer = calls.find((call) => call.args.includes('visualjava.OfflineTransformer'))
    expect(transformer.args.slice(transformer.args.indexOf('visualjava.OfflineTransformer') + 1))
      .toEqual([request.classesDir, prepared.transformed, ...request.classpath.slice(1)])
    expect(prepared.coveredClasses).toEqual(['com.example.Main'])
    expect(await readFile(join(prepared.transformed, 'config.txt'), 'utf8')).toBe('resource preserved')
    await expect(access(join(prepared.transformed, 'Foreign.class'))).rejects.toThrow()
    expect(prepared.classpath).toEqual([prepared.transformed, prepared.helper, ...request.classpath.slice(1)])
    expect(prepared.args.slice(0, request.jvmArgs.length)).toEqual(request.jvmArgs)
    expect(prepared.args).toContain('-Xverify:all')
    expect(prepared.args.slice(prepared.args.indexOf('-cp') + 1)).toEqual([prepared.classpath.join(delimiter), request.mainClass, ...request.programArgs])
    expect(prepared.workingDirectory).toBe(request.workingDirectory)
  } finally { await prepared.cleanup(); await prepared.cleanup() }
  await expect(access(prepared.temp)).rejects.toThrow()
})

it('Visualize executes with the same cwd and literal program tokens through injected fake processes', async () => {
  const request = await fixture(); const calls = []
  const result = await runInstrumented(request, { spawnProcess: fakeTools(calls) })
  expect(result.status, result.diagnostic).toBe('complete')
  expect(result.stdout).toBe('expected output')
  expect(calls).toHaveLength(3)
  expect(calls[2].options).toMatchObject({ cwd: request.workingDirectory, shell: false })
  expect(calls[2].args.slice(-4)).toEqual([request.mainClass, ...request.programArgs])
  expect(result.capability.coveredClasses).toEqual(['com.example.Main'])
})

it('malformed capture arguments fail before spawning and clean a failed transform preparation', async () => {
  const request = await fixture(); const spawnProcess = vi.fn(fakeTools([]))
  const result = await runInstrumented({ ...request, jvmArgs: ['@untrusted-options'] }, { spawnProcess })
  expect(result.status).toBe('instrumentation_failed'); expect(spawnProcess).not.toHaveBeenCalled()
  let transformed
  const failTransform = (command, args) => {
    const value = child()
    if (args.includes('visualjava.OfflineTransformer')) transformed = args[args.indexOf('visualjava.OfflineTransformer') + 2]
    queueMicrotask(() => { value.stderr.write('verification failed'); value.emit('close', transformed ? 1 : 0) })
    return value
  }
  await expect(prepareInstrumented(request, { spawnProcess: failTransform })).rejects.toThrow(/Offline transform failed/)
  await expect(access(join(transformed, '..'))).rejects.toThrow()
})

it('Debug uses the resolved cwd and places authenticated internal properties after user options before the target', async () => {
  const request = await fixture(); const calls = []
  const prepare = (request) => prepareInstrumented(request, { spawnProcess: fakeTools([]) })
  const manager = new DebugManager({ prepare, spawnProcess: (command, args, options) => {
    calls.push({ command, args, options }); return child()
  } })
  try {
    await manager.start({ ...request, build: { success: true }, sourceManifest: { sources: [], classes: [] } })
    const { args, options } = calls[0]
    expect(options.cwd).toBe(request.workingDirectory)
    expect(args.slice(0, request.jvmArgs.length)).toEqual(request.jvmArgs)
    const cpIndex = args.indexOf('-cp')
    expect(args[cpIndex - 2]).toMatch(/^-Dvisualjava.debugPort=\d+$/)
    expect(args[cpIndex - 1]).toMatch(/^-Dvisualjava.debugToken=[a-f0-9]{64}$/)
    expect(args.slice(cpIndex + 2)).toEqual([request.mainClass, ...request.programArgs])
  } finally { await manager.stop() }
  const blockedPrepare = vi.fn()
  await expect(new DebugManager({ prepare: blockedPrepare }).start({ ...request, build: { success: true },
    sourceManifest: { sources: [], classes: [] }, jvmArgs: ['-Dvisualjava.debugPort=123'] })).rejects.toThrow(/reserved/)
  expect(blockedPrepare).not.toHaveBeenCalled()
})
