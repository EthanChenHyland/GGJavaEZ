import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { RunManager } from './runner.mjs'

function managerFor(script, options = {}) {
  const calls = []
  const spawnProcess = (file, args, spawnOptions) => {
    calls.push({ file, args, spawnOptions })
    return spawn(process.execPath, ['-e', script], spawnOptions)
  }
  const manager = new RunManager({ spawnProcess, stopGraceMs: 80, ...options })
  const start = () => manager.start({
    projectId: 'project-1', mainClass: 'demo.Main', javaPath: '/jdk/bin/java',
    classesDir: '/build/classes', projectRoot: process.cwd(), sourcePaths: ['demo/Main.java'],
  })
  return { manager, start, calls }
}

async function waitForExit(manager, runId) {
  const snapshot = manager.snapshot(runId)
  if (snapshot.status === 'exited') return snapshot
  return new Promise((resolve) => {
    manager.subscribe(runId, (event) => {
      if (event.kind === 'exit') resolve(manager.snapshot(runId))
    }, snapshot.events.at(-1)?.id ?? 0)
  })
}

describe('RunManager', () => {
  it('terminates an inherited child process group on Stop', async () => {
    if (process.platform === 'win32') return
    const { manager, start } = managerFor('const { spawn } = require("node:child_process"); const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" }); process.stdout.write(String(child.pid)); setInterval(() => {}, 1000)')
    const run = await start()
    const pid = await new Promise((resolve) => manager.subscribe(run.runId, (event) => { if (event.kind === 'stdout') resolve(Number(event.text)) }))
    await manager.stop(run.runId)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(() => process.kill(pid, 0)).toThrow()
  })
  it('spawns Java directly and replays stdout, stderr, and exit in event order', async () => {
    const { manager, start, calls } = managerFor(
      'process.stdout.write("hello "); process.stderr.write("warning\\n"); process.stdout.write("world\\n")',
    )
    const run = await start()
    const done = await waitForExit(manager, run.runId)
    expect(calls[0].file).toBe('/jdk/bin/java')
    expect(calls[0].args).toEqual(['-cp', '/build/classes', 'demo.Main'])
    expect(calls[0].spawnOptions.shell).toBe(false)
    expect(done.status).toBe('exited')
    expect(done.exitCode).toBe(0)
    expect(done.events.map((event) => event.id)).toEqual(done.events.map((_, index) => index + 1))
    expect(done.events.filter((event) => event.kind === 'stdout').map((event) => event.text).join(''))
      .toBe('hello world\n')
    expect(done.events.find((event) => event.kind === 'stderr').text).toBe('warning\n')
    const replay = []
    manager.subscribe(run.runId, (event) => replay.push(event), done.events[0].id)
    expect(replay).toEqual(done.events.slice(1))
    expect(manager.current()).toEqual(done)
  })

  it('passes exact stdin text and records what was accepted', async () => {
    const { manager, start } = managerFor(
      'process.stdin.setEncoding("utf8"); process.stdin.once("data", value => { process.stdout.write(value); process.exit(0) })',
    )
    const run = await start()
    expect(await manager.input(run.runId, '42\n')).toEqual({ ok: true })
    const done = await waitForExit(manager, run.runId)
    expect(done.events.find((event) => event.kind === 'stdin').text).toBe('42\n')
    expect(done.events.filter((event) => event.kind === 'stdout').map((event) => event.text).join(''))
      .toBe('42\n')
    await expect(manager.input(run.runId, 'later')).rejects.toThrow('not accepting input')
  })

  it('stops and reaps the previous child before a restart', async () => {
    const { manager, start } = managerFor('setInterval(() => {}, 1000)')
    const first = await start()
    const second = await start()
    const old = manager.snapshot(first.runId)
    expect(old.status).toBe('exited')
    expect(old.events.at(-1).kind).toBe('exit')
    expect(second.runId).not.toBe(first.runId)
    const stopped = await manager.stop(second.runId)
    expect(stopped.status).toBe('exited')
    expect(stopped.events.filter((event) => event.kind === 'exit')).toHaveLength(1)
    expect(await manager.stop(second.runId)).toEqual(stopped)
  })

  it('escalates to SIGKILL when a child ignores SIGTERM', async () => {
    const { manager, start } = managerFor(
      'process.on("SIGTERM", () => {}); process.stdout.write("ready"); setInterval(() => {}, 1000)',
      { stopGraceMs: 40 },
    )
    const run = await start()
    await new Promise((resolve) => manager.subscribe(run.runId, (event) => {
      if (event.kind === 'stdout' && event.text?.includes('ready')) resolve()
    }))
    const stopped = await manager.stop(run.runId)
    expect(stopped.status).toBe('exited')
    expect(stopped.events.at(-1).signal).toBe('SIGKILL')
  })

  it('attaches a truthful parsed exception to a failed run', async () => {
    const { manager, start } = managerFor(
      'process.stderr.write("Exception in thread \\"main\\" java.lang.IllegalStateException: bad\\n\\tat demo.Main.main(Main.java:9)\\n"); process.exitCode = 1',
    )
    const run = await start()
    const done = await waitForExit(manager, run.runId)
    expect(done.exitCode).toBe(1)
    expect(done.exception.type).toBe('java.lang.IllegalStateException')
    expect(done.exception.frames[0].location).toEqual({ path: 'demo/Main.java', line: 9, column: null })
    expect(done.events.at(-1).exception).toEqual(done.exception)
  })

  it('bounds buffered replay without resetting event IDs', async () => {
    const { manager, start } = managerFor(
      'process.stdout.write("out"); process.stderr.write("err")',
      { maxEvents: 2 },
    )
    const run = await start()
    const done = await waitForExit(manager, run.runId)
    expect(done.events).toHaveLength(2)
    expect(done.events.at(-1).kind).toBe('exit')
    expect(done.events[0].id).toBeGreaterThan(1)
  })

  it('reports a failed launch as an exited run instead of hanging', async () => {
    const manager = new RunManager()
    const run = await manager.start({
      projectId: 'project-1', mainClass: 'Main', javaPath: '/definitely/missing/java',
      classesDir: '/build/classes', projectRoot: process.cwd(),
    })
    expect(run.status).toBe('exited')
    expect(run.exception).toBeNull()
    expect(run.events.some((event) => event.kind === 'stderr')).toBe(true)
    expect(run.events.at(-1).kind).toBe('exit')
  })

  it('keeps buffered events intact when a subscriber mutates its copy', async () => {
    const { manager, start } = managerFor('setTimeout(() => process.stdout.write("safe"), 10)')
    const run = await start()
    const unsubscribe = manager.subscribe(run.runId, (event) => { event.text = 'changed' })
    const done = await waitForExit(manager, run.runId)
    unsubscribe()
    expect(done.events.find((event) => event.kind === 'stdout').text).toBe('safe')
  })
})
