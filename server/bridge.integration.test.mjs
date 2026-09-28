import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let child
let workspace
let base
async function freePort() {
  return new Promise((resolve) => { const socket = createServer(); socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)) }) })
}
async function api(path, method = 'GET', data) {
  const response = await fetch(`${base}${path}`, { method, headers: data === undefined ? undefined : { 'content-type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) })
  return { status: response.status, data: await response.json() }
}
async function project(name, files) {
  const result = await api('/projects/import', 'POST', { name, files })
  expect(result.status).toBe(201)
  return result.data.id
}
async function finished(runId, timeout = 5000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const { data } = await api(`/runs/${runId}`)
    if (data.status === 'exited') return data
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  throw new Error('Timed out waiting for Java exit')
}

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ggjavaez-bridge-'))
  const port = await freePort()
  base = `http://127.0.0.1:${port}/api`
  child = spawn(process.execPath, ['server/bridge.mjs'], { cwd: process.cwd(), env: { ...process.env, GGJAVA_WORKSPACE: workspace, GGJAVA_PORT: String(port) }, stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    try { if ((await api('/health')).status === 200) return } catch { /* booting */ }
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  throw new Error('Bridge failed to start')
}, 10000)
afterAll(async () => { child?.kill('SIGTERM'); await rm(workspace, { recursive: true, force: true }) })

describe('local bridge real Java workflow', () => {
  it('runs a multi-file program with stdout and stderr', async () => {
    const id = await project('Multi file', [
      { path: 'Main.java', content: 'public class Main { public static void main(String[] a) { System.out.println(Helper.message()); System.err.println("stderr works"); } }' },
      { path: 'Helper.java', content: 'public class Helper { static String message() { return "Hello GGJavaEZ"; } }' },
    ])
    const { data: build } = await api(`/projects/${id}/build`, 'POST', {})
    expect(build.success).toBe(true)
    expect(build.mainClasses).toContain('Main')
    const { data: response } = await api(`/projects/${id}/run`, 'POST', { mainClass: 'Main' })
    const run = await finished(response.run.runId)
    expect(run.exitCode).toBe(0)
    expect(run.events.filter((event) => event.kind === 'stdout').map((event) => event.text).join('')).toContain('Hello GGJavaEZ')
    expect(run.events.filter((event) => event.kind === 'stderr').map((event) => event.text).join('')).toContain('stderr works')
    expect(run.events.at(-1).elapsedMs).toBeGreaterThanOrEqual(0)
  }, 10000)

  it('retains exact javac syntax and unresolved-symbol errors with project locations', async () => {
    const id = await project('Broken', [{ path: 'Main.java', content: 'public class Main {\n public static void main(String[] a) {\n  int x =\n }\n}\n' }])
    const first = (await api(`/projects/${id}/build`, 'POST', {})).data
    expect(first.success).toBe(false)
    expect(first.diagnostics[0].location.path).toBe('Main.java')
    expect(first.diagnostics[0].location.line).toBe(4)
    expect(first.diagnostics[0].raw).toContain('error: illegal start of expression')
    const file = (await api(`/projects/${id}/files?path=Main.java`)).data
    await api(`/projects/${id}/files`, 'PUT', { path: 'Main.java', revision: file.revision, content: 'public class Main { public static void main(String[] a) { UnknownType thing; } }' })
    const second = (await api(`/projects/${id}/build`, 'POST', {})).data
    expect(second.success).toBe(false)
    expect(second.diagnostics.some((item) => item.message.includes('cannot find symbol'))).toBe(true)
    expect(second.rawOutput).toContain('cannot find symbol')
  }, 10000)

  it('captures runtime exception frames and maps them to source', async () => {
    const id = await project('Crash', [{ path: 'Main.java', content: 'public class Main {\n public static void main(String[] a) {\n  String value = null;\n  System.out.println(value.length());\n }\n}\n' }])
    const response = (await api(`/projects/${id}/run`, 'POST', { mainClass: 'Main' })).data
    const run = await finished(response.run.runId)
    expect(run.exitCode).not.toBe(0)
    expect(run.exception.type).toContain('NullPointerException')
    expect(run.exception.rawStackTrace).toContain('Main.java:4')
    expect(run.exception.frames[0].location).toEqual({ path: 'Main.java', line: 4, column: null })
  }, 10000)

  it('feeds Scanner input and stops/restarts a long-running process', async () => {
    const scanner = await project('Input', [{ path: 'Main.java', content: 'import java.util.Scanner; public class Main { public static void main(String[] a) { System.out.println("got " + new Scanner(System.in).nextLine()); } }' }])
    const response = (await api(`/projects/${scanner}/run`, 'POST', { mainClass: 'Main' })).data
    expect(response.run.status).toBe('running')
    expect((await api(`/runs/${response.run.runId}/input`, 'POST', { text: '42\n' })).status).toBe(200)
    const inputRun = await finished(response.run.runId)
    expect(inputRun.events.find((event) => event.kind === 'stdin').text).toBe('42\n')
    expect(inputRun.events.filter((event) => event.kind === 'stdout').map((event) => event.text).join('')).toContain('got 42')
    const loop = await project('Loop', [{ path: 'Main.java', content: 'public class Main { public static void main(String[] a) throws Exception { while (true) Thread.sleep(1000); } }' }])
    const first = (await api(`/projects/${loop}/run`, 'POST', { mainClass: 'Main' })).data.run
    const second = (await api(`/projects/${loop}/run`, 'POST', { mainClass: 'Main' })).data.run
    expect((await api(`/runs/${first.runId}`)).data.status).toBe('exited')
    expect((await api(`/runs/${second.runId}/stop`, 'POST', {})).data.status).toBe('exited')
  }, 15000)
})
