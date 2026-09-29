import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import type { ExecutionSession } from '../src/execution/contracts'

test.describe.configure({ mode: 'serial', timeout: 90_000 })

async function project(request: APIRequestContext, files: { path: string; content: string; encoding?: 'base64' }[]) {
  const response = await request.post('/api/projects/import', { data: { name: `M10 ${randomUUID()}`, files } })
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()).id as string
}

async function fixture(name: string) {
  const root = resolve('fixtures/projects-m9', name)
  const files: { path: string; content: string; encoding?: 'base64' }[] = []
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['target', 'build', '.gradle'].includes(entry.name)) continue
      const full = join(directory, entry.name)
      if (entry.isDirectory()) { await visit(full); continue }
      if (!entry.isFile() || entry.name.endsWith('.md')) continue
      const bytes = await readFile(full)
      const binary = /\.(jar|class|zip)$/i.test(entry.name)
      files.push({ path: relative(root, full).split('\\').join('/'), content: bytes.toString(binary ? 'base64' : 'utf8'), ...(binary ? { encoding: 'base64' as const } : {}) })
    }
  }
  await visit(root)
  return files
}

async function open(page: Page, id: string) {
  await page.addInitScript((value) => localStorage.setItem('ggjavaez:project', value), id)
  await page.goto('/ide')
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
}

async function current(request: APIRequestContext): Promise<ExecutionSession> {
  return await (await request.get('/api/execution/current')).json() as ExecutionSession
}

async function phase(request: APIRequestContext, id: string, wanted: ExecutionSession['phase']) {
  await expect.poll(async () => {
    const session = await current(request)
    if (session.projectId !== id) return 'different project'
    return session.phase
  }, { timeout: 45_000, intervals: [100, 250, 500] }).toBe(wanted)
  return current(request)
}

const personFiles = [
  { path: 'Main.java', content: 'public class Main {\n  public static void main(String[] args) {\n    Person p = new Person("Ethan");\n    System.out.println("Created " + p.name);\n    p.age = 18;\n    System.out.println("Age: " + p.age);\n  }\n}\n' },
  { path: 'Person.java', content: 'public class Person {\n  String name;\n  int age;\n  Person(String name) { this.name = name; }\n}\n' },
]

test('Run records one JVM, keeps truthful console and world in the same history', async ({ page, request }) => {
  const id = await project(request, personFiles)
  await open(page, id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const session = await phase(request, id, 'COMPLETED')
  expect(session.support).not.toBe('RUN_ONLY')
  expect(session.stdout).toContain('Created Ethan')
  expect(session.stdout).toContain('Age: 18')
  expect(session.rawEvents.some((event) => event.type === 'field')).toBe(true)
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Scrub execution' })).toBeVisible()
  await expect(page.locator('.ide-console-output')).toContainText('Created Ethan')
  await expect(page.locator('.ide-console-output')).toContainText('Age: 18')
  await page.getByRole('slider', { name: 'Scrub execution' }).fill('0')
  await expect(page.getByRole('button', { name: /Return to Live/ })).toBeVisible()
  await expect(page.locator('.ide-console-output > .ide-console-stdout')).toHaveCount(0)
  await page.getByRole('button', { name: /Return to Live/ }).click()
  await expect(page.locator('.ide-console-output')).toContainText('Age: 18')
  expect((await current(request)).id).toBe(session.id)
})

test('input stays in one live session and produces a consumed-input trace event', async ({ page, request }) => {
  const id = await project(request, [{ path: 'Main.java', content: 'import java.util.Scanner; public class Main { public static void main(String[] args) { System.out.println("Name?"); System.out.println("Hello " + new Scanner(System.in).nextLine()); } }' }])
  await open(page, id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const waiting = await phase(request, id, 'WAITING_FOR_INPUT')
  await expect(page.locator('.ide-execution-status')).toContainText('WAITING FOR INPUT')
  await page.getByRole('textbox', { name: 'Console input' }).fill('Ethan')
  await page.getByRole('button', { name: /Send/ }).click()
  const complete = await phase(request, id, 'COMPLETED')
  expect(complete.id).toBe(waiting.id)
  expect(complete.rawEvents.some((event) => event.type === 'stdin_read')).toBe(true)
  await expect(page.locator('.ide-console-output')).toContainText('Hello Ethan')
})

test('Debug pauses in the same session model while History leaves its live JVM untouched', async ({ page, request }) => {
  const id = await project(request, personFiles)
  await open(page, id)
  // Monaco glyph margin is the user breakpoint control.
  const line = page.locator('.monaco-editor .line-numbers').filter({ hasText: /^5$/ }).first()
  const box = await line.boundingBox()
  const margin = await page.locator('.monaco-editor .glyph-margin').first().boundingBox()
  expect(box).not.toBeNull()
  expect(margin).not.toBeNull()
  await page.mouse.click(margin!.x + margin!.width / 2, box!.y + box!.height / 2)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await phase(request, id, 'COMPLETED')
  await expect(page.locator('.debug-breakpoint')).toHaveCount(1)
  await page.getByRole('button', { name: 'Debug', exact: true }).click()
  const entry = await phase(request, id, 'PAUSED')
  expect(entry.kind).toBe('debug')
  expect(entry.breakpoints.some((point) => point.fileId === 'Main.java' && point.line === 5 && point.status === 'verified')).toBe(true)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect.poll(async () => {
    const session = await current(request)
    return session.phase === 'PAUSED' ? `${session.pause?.reason}:${session.pause?.line}` : session.phase
  }, { timeout: 30000, intervals: [100, 250, 500] }).toBe('breakpoint:5')
  const paused = await current(request)
  await page.getByRole('slider', { name: 'Scrub execution' }).fill('0')
  await expect(page.getByRole('button', { name: /Return to Live/ })).toBeVisible()
  expect((await current(request)).phase).toBe('PAUSED')
  await page.getByRole('button', { name: /Return to Live/ }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await phase(request, id, 'COMPLETED')
})

test('runtime failure keeps its world, prior timeline and Error Explorer', async ({ page, request }) => {
  const id = await project(request, [{ path: 'Main.java', content: 'public class Main { public static void main(String[] args) { Person p = null; System.out.println(p.name); } } class Person { String name; }' }])
  await open(page, id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const failed = await phase(request, id, 'FAILED')
  expect(failed.stderr).toContain('NullPointerException')
  expect(failed.rawEvents.length).toBeGreaterThan(0)
  await expect(page.getByRole('button', { name: 'ERROR EXPLORER' })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Scrub execution' })).toBeVisible()
})

test('compile failure stays in source and Problems without launching a world', async ({ page, request }) => {
  const id = await project(request, [{ path: 'Main.java', content: 'public class Main { public static void main(String[] a) { UnknownType value; } }' }])
  await open(page, id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const failed = await phase(request, id, 'FAILED')
  expect(failed.failureKind).toBe('build')
  expect(failed.rawEvents).toHaveLength(0)
  await expect(page.getByRole('button', { name: /PROBLEMS/ })).toBeVisible()
  await expect(page.locator('.spatial-view canvas')).toHaveCount(0)
})

test('Stop owns the current JVM and a subsequent Run has a fresh session', async ({ page, request }) => {
  const id = await project(request, [{ path: 'Main.java', content: 'public class Main { public static void main(String[] a) throws Exception { System.out.println("Started"); Thread.sleep(15000); } }' }])
  await open(page, id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const running = await phase(request, id, 'RUNNING')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  const stopped = await phase(request, id, 'STOPPED')
  expect(stopped.id).toBe(running.id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect.poll(async () => (await current(request)).id, { timeout: 30000 }).not.toBe(stopped.id)
  const next = await current(request)
  expect(next.projectId).toBe(id)
  await request.post(`/api/execution/${next.id}/stop`, { data: {} })
  await phase(request, id, 'STOPPED')
})

test('free orbit, pan and dolly remain available while live recording advances', async ({ page, request }) => {
  const id = await project(request, [{ path: 'Main.java', content: 'public class Main { public static void main(String[] a) throws Exception { int n = 0; for (int i = 0; i < 100; i++) { n += i; Thread.sleep(35); } System.out.println(n); } }' }])
  await open(page, id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const running = await phase(request, id, 'RUNNING')
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
  const box = await page.locator('.world-canvas').boundingBox()
  expect(box).not.toBeNull()
  const x = box!.x + box!.width * 0.55, y = box!.y + box!.height * 0.52
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 90, y + 38, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Return to execution' })).toBeVisible()
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(x + 45, y + 25, { steps: 3 })
  await page.mouse.up({ button: 'right' })
  await page.mouse.wheel(0, 280)
  expect((await current(request)).id).toBe(running.id)
  const done = await phase(request, id, 'COMPLETED')
  expect(done.rawEvents.length).toBeGreaterThan(running.rawEvents.length)
})

test('advanced Run without visualization uses the plain escape path quietly', async ({ page, request }) => {
  const id = await project(request, [{ path: 'Main.java', content: 'public class Main { public static void main(String[] a) { System.out.println("Plain escape"); } }' }])
  await open(page, id)
  await page.getByLabel('More actions').click()
  await page.getByRole('button', { name: 'Run without visualization' }).click()
  const done = await phase(request, id, 'COMPLETED')
  expect(done.support).toBe('RUN_ONLY')
  expect(done.rawEvents).toHaveLength(0)
  expect(done.stdout).toContain('Plain escape')
  await expect(page.locator('.ide-console-output')).toContainText('Plain escape')
})

test('plain, Maven, Gradle, multiple packages and explicit main launch through canonical execution', async ({ request }) => {
  for (const [name, expected] of [['people-plain', 'Ethan'], ['people-maven', 'Ethan'], ['people-gradle', 'Ethan']] as const) {
    const id = await project(request, await fixture(name))
    const response = await request.post(`/api/projects/${id}/execution`, { data: { kind: 'run' } })
    expect(response.ok(), await response.text()).toBe(true)
    const done = await phase(request, id, 'COMPLETED')
    expect(done.stdout).toContain(expected)
    expect(done.rawEvents.length).toBeGreaterThan(0)
    expect(done.mainClass).toContain('com.example.Main')
  }
  const id = await project(request, await fixture('multiple-mains'))
  const response = await request.post(`/api/projects/${id}/execution`, { data: { kind: 'run', mainClass: 'com.example.tools.AdminTool', programArgs: ['chosen'] } })
  expect(response.ok(), await response.text()).toBe(true)
  const done = await phase(request, id, 'COMPLETED')
  expect(done.stdout).toContain('AdminTool: chosen')
  expect(done.mainClass).toBe('com.example.tools.AdminTool')
})
