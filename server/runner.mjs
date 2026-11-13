import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { isAbsolute, relative, sep } from 'node:path'
import { performance } from 'node:perf_hooks'
import { parseRuntimeException } from './exceptions.mjs'
import { javaLaunchArgs, launchRequest } from './launch.mjs'

const DEFAULT_MAX_EVENTS = 4096
const STOP_GRACE_MS = 1200
const MAX_SAVED_RUNS = 32
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

function safeSourcePaths(projectRoot, paths) {
  if (!Array.isArray(paths)) return []
  return paths.flatMap((value) => {
    if (typeof value !== 'string') return []
    const path = (isAbsolute(value) ? relative(projectRoot, value) : value).split(sep).join('/')
    if (!path || path.startsWith('/') || path.split('/').some((part) => part === '..' || part === '.')) return []
    return [path]
  })
}

/** Owns one live JVM child while retaining completed runs for event replay. */
export class RunManager {
  constructor({ spawnProcess = spawn, maxEvents = DEFAULT_MAX_EVENTS, stopGraceMs = STOP_GRACE_MS } = {}) {
    this.spawnProcess = spawnProcess
    this.maxEvents = maxEvents
    this.stopGraceMs = stopGraceMs
    this.runs = new Map()
    this.latest = null
    this.pending = Promise.resolve()
  }

  #serialize(task) {
    const result = this.pending.then(task, task)
    this.pending = result.catch(() => {})
    return result
  }

  #snapshot(run) {
    if (!run) return null
    return structuredClone({
      runId: run.runId,
      projectId: run.projectId,
      mainClass: run.mainClass,
      status: run.status,
      startedAt: run.startedAt,
      events: run.events,
      exitCode: run.exitCode,
      exception: run.exception,
    })
  }

  #emit(run, event) {
    const value = { id: ++run.nextEventId, ...event }
    run.events.push(value)
    if (run.events.length > this.maxEvents) run.events.splice(0, run.events.length - this.maxEvents)
    for (const listener of run.listeners) {
      try { listener(structuredClone(value)) } catch { /* A subscriber cannot interrupt process collection. */ }
    }
  }

  /**
   * Start a compiled Java main class. All paths are supplied by the trusted bridge.
   * @param {{projectId:string, mainClass:string, javaPath:string, classesDir:string, projectRoot:string, sourcePaths?:string[], classpath?:string[], programArgs?:string[], jvmArgs?:string[], workingDirectory?:string}} options
   */
  start(options) {
    return this.#serialize(async () => {
      const { projectId, mainClass, javaPath, classesDir, projectRoot, sourcePaths = [] } = options
      if ([projectId, mainClass, javaPath, classesDir, projectRoot].some((value) => typeof value !== 'string' || !value)) {
        throw new TypeError('projectId, mainClass, javaPath, classesDir, and projectRoot are required')
      }
      const launch = launchRequest(options)
      if (this.latest?.status === 'running') await this.#stopRun(this.latest)

      // Executable and arguments are passed separately. Java never runs through a shell.
      const child = this.spawnProcess(javaPath, javaLaunchArgs(launch), {
        cwd: launch.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        detached: process.platform !== 'win32',
        windowsHide: true,
      })
      const processStartedAt = performance.now()
      let elapsedMs = null
      const recordExit = () => { elapsedMs ??= performance.now() - processStartedAt }
      const run = {
        runId: randomUUID(), projectId, mainClass, status: 'running',
        startedAt: new Date().toISOString(), events: [], exitCode: null, exception: null,
        child, sourcePaths: safeSourcePaths(projectRoot, sourcePaths), stderr: '', listeners: new Set(), nextEventId: 0,
        stopped: false, closed: null, resolveClosed: null, launchError: null, outputBytes: 0,
      }
      run.closed = new Promise((resolve) => { run.resolveClosed = resolve })
      this.runs.set(run.runId, run)
      this.latest = run
      while (this.runs.size > MAX_SAVED_RUNS) this.runs.delete(this.runs.keys().next().value)

      const stdoutDecoder = new TextDecoder()
      const stderrDecoder = new TextDecoder()
      const collect = (kind, text) => {
        if (!text) return
        run.outputBytes += Buffer.byteLength(text)
        if (run.outputBytes > MAX_OUTPUT_BYTES) {
          if (!run.stopped) {
            run.stopped = true
            this.#emit(run, { kind: 'stderr', text: '\nOutput limit reached (8 MiB). Process terminated.\n' })
            this.#signal(run, 'SIGKILL')
          }
          return
        }
        if (kind === 'stderr') run.stderr += text
        this.#emit(run, { kind, text })
      }
      child.stdout?.on('data', (chunk) => collect('stdout', stdoutDecoder.decode(chunk, { stream: true })))
      child.stderr?.on('data', (chunk) => collect('stderr', stderrDecoder.decode(chunk, { stream: true })))
      child.stdin?.on('error', () => { /* An exit during input is reported by write/close. */ })
      child.on('error', (error) => {
        run.launchError = error
        collect('stderr', `${error.message}\n`)
      })
      // Reap processes launched in the JVM's inherited group when its main process exits.
      child.once('exit', () => {
        recordExit()
        if (process.platform !== 'win32') this.#signal(run, 'SIGKILL')
      })
      child.once('close', (exitCode, signal) => {
        if (!run.launchError) recordExit()
        collect('stdout', stdoutDecoder.decode())
        collect('stderr', stderrDecoder.decode())
        run.exitCode = exitCode
        if (!run.stopped && (exitCode !== 0 || signal)) {
          run.exception = parseRuntimeException(run.stderr, run.sourcePaths)
        }
        run.status = 'exited'
        this.#emit(run, {
          kind: 'exit', exitCode, signal,
          ...(elapsedMs !== null ? { elapsedMs: Math.round(elapsedMs) } : {}),
          exception: run.exception,
        })
        run.listeners.clear()
        run.resolveClosed()
      })

      await new Promise((resolve) => {
        if (child.pid && !run.launchError) return resolve()
        child.once('spawn', resolve)
        child.once('error', resolve)
      })
      if (run.launchError) await run.closed
      return this.#snapshot(run)
    })
  }

  async #stopRun(run) {
    if (run.status === 'exited') return this.#snapshot(run)
    run.stopped = true
    try { run.child.stdin?.end() } catch { /* The child may already be closing. */ }
    this.#signal(run, 'SIGTERM')
    const timer = setTimeout(() => {
      if (run.status === 'running') {
        this.#signal(run, 'SIGKILL')
      }
    }, this.stopGraceMs)
    timer.unref?.()
    try { await run.closed } finally { clearTimeout(timer) }
    return this.#snapshot(run)
  }

  #signal(run, signal) {
    try {
      if (process.platform !== 'win32' && run.child.pid) process.kill(-run.child.pid, signal)
      else run.child.kill(signal)
    } catch { try { run.child.kill(signal) } catch { /* already exited */ } }
  }

  /** Stop and reap a run. Omitting runId stops the latest run. */
  stop(runId) {
    return this.#serialize(async () => {
      const run = runId ? this.runs.get(runId) : this.latest
      return run ? this.#stopRun(run) : null
    })
  }

  /** Write exact text to stdin. The caller decides whether to include a newline. */
  async input(runId, text) {
    const run = this.runs.get(runId)
    if (!run || run !== this.latest || run.status !== 'running' || run.stopped) {
      throw new Error('Run is not accepting input')
    }
    if (typeof text !== 'string' || text.length > 65536) throw new TypeError('Input must be text under 64 KiB')
    await new Promise((resolve, reject) => run.child.stdin.write(text, (error) => error ? reject(error) : resolve()))
    this.#emit(run, { kind: 'stdin', text })
    return { ok: true }
  }

  snapshot(runId) { return this.#snapshot(this.runs.get(runId)) }
  current() { return this.#snapshot(this.latest) }

  /** Replay events after an ID, then receive future events. Returns an unsubscribe function. */
  subscribe(runId, callback, after = 0) {
    const run = this.runs.get(runId)
    if (!run) return null
    if (typeof callback !== 'function') throw new TypeError('Subscriber must be a function')
    let cursor = Number.isSafeInteger(after) && after >= 0 ? after : 0
    const listener = (event) => {
      if (event.id <= cursor) return
      cursor = event.id
      callback(structuredClone(event))
    }
    if (run.status === 'running') run.listeners.add(listener)
    for (const event of run.events.slice()) listener(event)
    return () => run.listeners.delete(listener)
  }
}
