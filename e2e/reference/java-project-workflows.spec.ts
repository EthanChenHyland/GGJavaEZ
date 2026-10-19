import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import type { ExecutionSession } from '../../src/execution/contracts'
import type { BuildResult } from '../../src/ide/contracts'
import type { JavaProject } from '../../src/ide/javaProject'
import { normalizeTrace } from '../../src/instrumentation/normalize'

// Real bridge, JDT LS, build tools and JVM. Run only in the root's serialized QA window.
test.describe.configure({ timeout: 180_000, mode: 'serial' })
const fixtureRoot = resolve('fixtures/projects-m9')
const imported = new Set<string>()
const browserFailures=new WeakMap<Page,string[]>()
test.beforeEach(({page})=>{const errors:string[]=[];browserFailures.set(page,errors);page.on('pageerror',error=>errors.push(error.message))})

type ImportFile = { path: string; content: string; encoding?: 'base64' }
async function fixtureFiles(name: string): Promise<ImportFile[]> {
  const root = join(fixtureRoot, name)
  const files: ImportFile[] = []
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['target', 'build', '.gradle', '.git', '.idea'].includes(entry.name)) continue
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) { await visit(absolute); continue }
      if (!entry.isFile()) throw new Error(`Unsupported fixture entry: ${absolute}`)
      const path = relative(root, absolute).split('\\').join('/')
      if (path.endsWith('.md')) continue
      const bytes = await readFile(absolute)
      files.push(/\.(jar|class|zip)$/i.test(path) ? { path, content: bytes.toString('base64'), encoding: 'base64' } : { path, content: bytes.toString('utf8') })
    }
  }
  await visit(root)
  expect(files.filter((file) => file.path.endsWith('.java')).length, `${name} fixture Java sources`).toBeGreaterThan(0)
  return files
}
async function importFixture(request: APIRequestContext, name: string) {
  const files = await fixtureFiles(name)
  const response = await request.post('/api/projects/import', { data: { name: `M9 ${name} ${randomUUID()}`, files } })
  expect(response.ok(), `${name} import: ${await response.text()}`).toBe(true)
  const id = (await response.json()).id as string
  imported.add(id)
  return { id, files }
}
async function openProject(page: Page, id: string) {
  await page.addInitScript((projectId) => localStorage.setItem('ggjavaez:project', projectId), id)
  await page.goto('/?qa=1')
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
  await expect(page.locator('.ide-project-status')).toHaveCount(0)
}
async function projectModel(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/projects/${id}/java-project`)
  expect(response.ok(), await response.text()).toBe(true)
  return response.json() as Promise<JavaProject>
}
async function languageReady(page: Page, request: APIRequestContext, id: string) {
  await expect.poll(async () => {
    const response = await request.get(`/api/projects/${id}/language`)
    if (!response.ok()) return `HTTP ${response.status()}`
    const snapshot = await response.json() as { status: string; message?: string }
    if (['failed', 'unavailable'].includes(snapshot.status)) throw new Error(`Java language service ${snapshot.status}: ${snapshot.message}`)
    return snapshot.status
  }, { timeout: 90_000, intervals: [1000, 2000, 3000] }).toBe('ready')
  await expect(page.locator('.ide-status-line .is-error, .ide-status-line .is-warning')).toHaveCount(0)
}
function source(files: ImportFile[], suffix: string) {
  const matches = files.filter((file) => file.path.endsWith(suffix))
  expect(matches, `unique source ${suffix}`).toHaveLength(1)
  return matches[0]
}
function position(content: string, needle: string, occurrence = 0, offset = 0) {
  let index = -1
  for (let n = 0; n <= occurrence; n++) index = content.indexOf(needle, index + 1)
  expect(index, `source contains ${needle}`).toBeGreaterThanOrEqual(0)
  const before = content.slice(0, index + offset)
  return { line: before.split('\n').length - 1, character: before.length - before.lastIndexOf('\n') - 1 }
}
async function semantic<T>(request: APIRequestContext, id: string, method: string, path: string, at: { line: number; character: number }, extra = {}) {
  const uri = `inmemory://ggjavaez/${id}/${path}`
  const response = await request.post(`/api/projects/${id}/language/request`, { data: { method, params: { textDocument: { uri }, position: at, ...extra } } })
  expect(response.ok(), `${method}: ${await response.text()}`).toBe(true)
  return response.json() as Promise<T>
}
async function openFile(page: Page, path: string) {
  await page.keyboard.press('ControlOrMeta+p')
  const picker=page.getByRole('dialog',{name:'Quick Open',exact:true})
  await picker.getByRole('combobox',{name:'Search project files',exact:true}).fill(path)
  await picker.getByRole('option').filter({hasText:path}).first().click()
  await expect(page.locator('.ide-tab.is-active')).toContainText(path.split('/').at(-1)!)
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.modelUri)).toContain('/'+path)
}
async function clickWord(page: Page, lineText: string, word: string) {
  const line = page.locator('.monaco-editor .view-line').filter({ hasText: lineText }).first()
  await expect(line).toBeVisible()
  const point = await line.evaluate((element, token) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const index = node.textContent?.indexOf(token) ?? -1
      if (index < 0) continue
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + token.length)
      const rect = range.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }
    return null
  }, word)
  expect(point, `visible Monaco token ${word}`).not.toBeNull()
  await page.mouse.click(point!.x, point!.y)
}
async function waitExecution(request: APIRequestContext, id: string, phase: ExecutionSession['phase'] = 'COMPLETED') {
  await expect.poll(async () => {
    const response = await request.get('/api/execution/current')
    expect(response.ok(), await response.text()).toBe(true)
    const session = await response.json() as ExecutionSession | null
    return session?.projectId === id ? session.phase : null
  }, { timeout: 45_000, intervals: [100, 250, 500] }).toBe(phase)
  return (await (await request.get('/api/execution/current')).json()) as ExecutionSession
}
// Phase5 routes Build and Launch Settings through the canonical workspace palette.
// Keep the real response, build-model, launch-payload and execution assertions unchanged.
async function paletteCommand(page: Page, id: 'execution.build' | 'workbench.launch') {
  await page.keyboard.press('ControlOrMeta+Shift+P')
  const palette = page.getByRole('dialog', { name: 'Command Palette', exact: true })
  const search = palette.getByRole('combobox', { name: 'Search commands', exact: true })
  await search.fill(id)
  await expect(palette.getByRole('option')).toHaveCount(1)
  await expect(palette.getByRole('option')).toHaveAttribute('aria-disabled', 'false')
  await search.press('Enter')
  await expect(palette).toHaveCount(0)
}
async function buildFromUI(page: Page, id: string): Promise<BuildResult> {
  const pending = page.waitForResponse((response) => response.url().endsWith(`/api/projects/${id}/build`) && response.request().method() === 'POST')
  await paletteCommand(page, 'execution.build')
  const response = await pending
  expect(response.ok(), await response.text()).toBe(true)
  return response.json() as Promise<BuildResult>
}
async function runFromUI(page: Page, request: APIRequestContext, id: string) {
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/projects/${id}/execution` && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const response = await pending
  expect(response.ok(), await response.text()).toBe(true)
  expect(response.request().postDataJSON()).toMatchObject({ kind: 'run', withoutVisualization: false })
  const started = await response.json() as ExecutionSession
  expect(started.projectId).toBe(id)
  const completed = await waitExecution(request, id)
  expect(completed.id).toBe(started.id)
  expect(completed.build?.success, completed.build?.rawOutput).toBe(true)
  expect(completed.exitCode).toBe(0)
  test.info().annotations.push({type:'actual-jvm-session',description:completed.id})
  return completed
}
async function debugFromUI(page: Page, id: string) {
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/projects/${id}/execution` && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Debug', exact: true }).click()
  const response = await pending
  expect(response.ok(), await response.text()).toBe(true)
  expect(response.request().postDataJSON()).toMatchObject({ kind: 'debug' })
  const started = await response.json() as ExecutionSession
  expect(started.projectId).toBe(id)
  test.info().annotations.push({type:'actual-jvm-session',description:started.id})
  return started
}
async function paused(request: APIRequestContext, expected: Partial<NonNullable<ExecutionSession['pause']>>, after = -1) {
  await expect.poll(async () => {
    const response = await request.get('/api/execution/current')
    const session = await response.json() as ExecutionSession | null
    if (session?.phase === 'FAILED') throw new Error(session.diagnostic ?? session.stderr)
    return session?.kind === 'debug' && session.phase === 'PAUSED' && !!session.pause && session.pause.rawEventCount > after &&
      Object.entries(expected).every(([key, value]) => session.pause![key as keyof NonNullable<ExecutionSession['pause']>] === value)
  }, { timeout: 30_000 }).toBe(true)
  return (await (await request.get('/api/execution/current')).json()) as ExecutionSession
}

test.afterEach(async ({ request,page }) => {
  expect(browserFailures.get(page)??[]).toEqual([])
  const response = await request.get('/api/execution/current')
  if (response.ok()) {
    const session = await response.json() as ExecutionSession | null
    if (session && imported.has(session.projectId) && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(session.phase))
      await request.post(`/api/execution/${session.id}/stop`, { data: {} })
  }
})

test('plain Java stays one-step build, visualizing Run and Debug', async ({ page, request }) => {
  const { id } = await importFixture(request, 'people-plain')
  await openProject(page, id)
  const model = await projectModel(request, id)
  expect(model.buildSystem).toBe('plain')
  await expect(page.locator('.ide-project-status')).toHaveCount(0)
  const build = await buildFromUI(page, id)
  expect(build.success, build.rawOutput).toBe(true)
  expect(build.javaProject?.buildSystem).toBe('plain')
  expect(build.mainClasses.length).toBeGreaterThan(0)
  const capture = await runFromUI(page, request, id)
  expect(capture.rawEvents.length).toBeGreaterThan(0)
  await expect(page.locator('.world-canvas canvas')).toBeVisible()
  const debug = await debugFromUI(page, id)
  expect((await paused(request, { reason: 'entry' })).id).toBe(debug.id)
  await expect(page.locator('.debug-paused-line')).toBeVisible()
})

test('Maven people app resolves semantic Java and cross-package execution', async ({ page, request }) => {
  const { id, files } = await importFixture(request, 'people-maven')
  await openProject(page, id)
  const model = await projectModel(request, id)
  expect(model.buildSystem).toBe('maven')
  expect(model.sourceRoots).toContain('src/main/java')
  await expect(page.locator('.ide-project-status')).toHaveCount(0)
  await languageReady(page, request, id)
  const main = source(files, '/Main.java'), person = source(files, '/Person.java'), service = source(files, '/PersonService.java')
  const mainUri = `inmemory://ggjavaez/${id}/${main.path}`
  const completion = await semantic<{ items?: { label: string }[] } | { label: string }[]>(request, id, 'textDocument/completion', main.path, position(main.content, 'PersonService', 0, 6), { context: { triggerKind: 1 } })
  expect(JSON.stringify(completion)).toMatch(/PersonService|Person/)
  const member = await semantic<unknown>(request, id, 'textDocument/completion', main.path, position(main.content, 'getName', 0, 3), { context: { triggerKind: 1 } })
  expect(JSON.stringify(member)).toContain('getName')
  const hover = await semantic<unknown>(request, id, 'textDocument/hover', main.path, position(main.content, 'getName', 0, 3))
  expect(JSON.stringify(hover)).toMatch(/getName|String/)
  const signatures = await semantic<{ signatures: { label: string }[] }>(request, id, 'textDocument/signatureHelp', main.path, position(main.content, 'create(', 0, 7), { context: { triggerKind: 1, isRetrigger: false } })
  expect(signatures.signatures.length).toBeGreaterThan(0)
  const definition = await semantic<unknown>(request, id, 'textDocument/definition', main.path, position(main.content, 'PersonService', 1, 5))
  expect(JSON.stringify(definition)).toContain(service.path)
  const references = await semantic<unknown>(request, id, 'textDocument/references', person.path, position(person.content, 'getName', 0, 3), { context: { includeDeclaration: true } })
  expect(JSON.stringify(references)).toContain(mainUri)
  await openFile(page, main.path)
  const organize = await request.post(`/api/projects/${id}/language/request`, { data: { method: 'textDocument/codeAction', params: {
    textDocument: { uri: mainUri }, range: { start: { line: 0, character: 0 }, end: { line: main.content.split('\n').length - 1, character: 0 } },
    context: { diagnostics: [], only: ['source.organizeImports'] },
  } } })
  expect(organize.ok(), await organize.text()).toBe(true)
  expect(JSON.stringify(await organize.json())).toMatch(/organize|import/i)

  await clickWord(page, 'getName', 'getName')
  await page.keyboard.press('F12')
  await expect(page.locator('.ide-tab.is-active')).toContainText('Person.java')
  // Monaco native UI: a field rename also updates related accessors and callers.
  await openFile(page, person.path)
  await clickWord(page, 'private int age', 'age')
  await page.keyboard.press('F2')
  await expect(page.locator('.rename-input')).toBeVisible()
  await page.locator('.rename-input').fill('yearsOld')
  await page.keyboard.press('Enter')
  await expect(page.locator('.ide-dirty')).toHaveCount(2)
  await page.keyboard.press('ControlOrMeta+Shift+S')
  await expect(page.locator('.ide-dirty')).toHaveCount(0)
  for (const path of [person.path, service.path]) {
    const response = await request.get(`/api/projects/${id}/files?path=${encodeURIComponent(path)}`)
    expect((await response.json()).content).toMatch(/yearsOld|YearsOld/)
  }

  const build = await buildFromUI(page, id)
  expect(build.success, build.rawOutput).toBe(true)
  expect(build.javaProject?.buildSystem).toBe('maven')
  const capture = await runFromUI(page, request, id)
  expect(capture.stdout).toMatch(/Ethan/)
  expect(capture.terminalStatus).toBe('complete')
  expect(capture.sourceManifest.classes.some((entry) => entry.className === 'com.example.model.Person' && entry.fileId === person.path)).toBe(true)
  expect(capture.rawEvents.some((event) => event.className === 'com.example.service.PersonService')).toBe(true)
  await expect(page.locator('.world-canvas canvas')).toBeVisible()
  const replay = normalizeTrace(capture.rawEvents, capture.sourceManifest, { status: capture.terminalStatus!, exitCode: capture.exitCode, diagnostic: capture.diagnostic })
  const personStep = replay.trace.events.findIndex((event) => event.source?.fileId === person.path && event.source.line > 0)
  expect(personStep).toBeGreaterThanOrEqual(0)
  await page.getByRole('slider', { name: 'Recorded execution position' }).fill(String(personStep + 1))
  await expect(page.locator('.ide-tab.is-active')).toContainText('Person.java')
  await expect(page.locator('.executing-line')).toBeVisible()

  // A breakpoint in another package must resolve to its real file and current line.
  const breakpointLine = position(person.content, 'this.age', 0).line + 1
  await page.evaluate(({ id, fileId, line }) => localStorage.setItem(`ggjavaez:breakpoints:${id}`, JSON.stringify([{ fileId, line }])), { id, fileId: person.path, line: breakpointLine })
  await page.reload()
  const debug = await debugFromUI(page, id)
  const entry = await paused(request, { reason: 'entry' })
  expect(entry.id).toBe(debug.id)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  const hit = await paused(request, { reason: 'breakpoint', className: 'com.example.model.Person', line: breakpointLine }, entry.pause!.rawEventCount)
  await expect(page.locator('.ide-tab.is-active')).toContainText('Person.java')
  await expect(page.locator('.debug-paused-line')).toBeVisible()
  // The same debugger step-out command now has the explicit visible label "Step Out".
  await page.getByRole('button', { name: 'Step Out', exact: true }).click()
  await paused(request, { className: 'com.example.service.PersonService' }, hit.pause!.rawEventCount)
})

test('Gradle uses its project model and wrapper for build, Run and capture', async ({ page, request }) => {
  const { id, files } = await importFixture(request, 'people-gradle')
  expect(files.some((file) => file.path === 'gradlew')).toBe(true)
  await openProject(page, id)
  const model = await projectModel(request, id)
  expect(model.buildSystem).toBe('gradle')
  expect(model.sourceRoots).toContain('src/main/java')
  await expect(page.locator('.ide-project-status')).toHaveCount(0)
  await languageReady(page, request, id)
  const main = source(files, '/Main.java')
  const gson = await semantic<unknown>(request, id, 'textDocument/completion', main.path,
    position(main.content, 'Gson', 0, 2), { context: { triggerKind: 1 } })
  expect(JSON.stringify(gson)).toContain('Gson')
  const build = await buildFromUI(page, id)
  expect(build.success, build.rawOutput).toBe(true)
  expect(build.javaProject?.buildSystem).toBe('gradle')
  expect(build.mainClasses.length).toBeGreaterThan(0)
  const capture = await runFromUI(page, request, id)
  expect(capture.build?.success, capture.build?.rawOutput).toBe(true)
  expect(capture.rawEvents.length).toBeGreaterThan(0)
})

test('multiple mains and program arguments use one selected launch target', async ({ page, request }) => {
  const { id } = await importFixture(request, 'multiple-mains')
  await openProject(page, id)
  const build = await buildFromUI(page, id)
  expect(build.success, build.rawOutput).toBe(true)
  expect(build.mainClasses.length).toBeGreaterThanOrEqual(2)
  const target = build.mainClasses.at(-1)!
  await paletteCommand(page, 'workbench.launch')
  const dialog = page.getByRole('dialog', { name: 'Launch configuration' })
  await dialog.getByLabel('Main class').selectOption(target)
  await dialog.getByLabel('Program arguments').fill('["M9_TARGET_ARG"]')
  await dialog.getByRole('button', { name: 'Save configuration' }).click()
  // Reopening the real Launch dialog proves the saved selection; no persistent main-class combobox remains.
  await paletteCommand(page,'workbench.launch')
  await expect(page.getByRole('dialog',{name:'Launch configuration'}).getByLabel('Main class',{exact:true})).toHaveValue(target)
  await page.screenshot({path:'.ggjavaez/qa/reference-exact/shell-launch-selected-1440x900.png'})
  await page.keyboard.press('Escape')
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/projects/${id}/execution` && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const response = await pending
  expect(response.ok(), await response.text()).toBe(true)
  expect(response.request().postDataJSON()).toMatchObject({ kind: 'run', mainClass: target, programArgs: ['M9_TARGET_ARG'] })
  const started = await response.json() as ExecutionSession
  test.info().annotations.push({type:'actual-jvm-session',description:started.id})
  const capture = await waitExecution(request, id)
  expect(capture.id).toBe(started.id)
  expect(capture.exitCode).toBe(0)
  expect(capture.build?.success, capture.build?.rawOutput).toBe(true)
  expect(capture.stdout).toContain('M9_TARGET_ARG')
  expect(capture.mainClass).toBe(target)
  expect(capture.rawEvents.some((event) => event.className === target)).toBe(true)
})

test('broken Maven POM exposes useful build output in Problems', async ({ page, request }) => {
  const { id, files } = await importFixture(request, 'people-maven')
  const pom = source(files, 'pom.xml')
  await openProject(page, id)
  const file = await (await request.get(`/api/projects/${id}/files?path=pom.xml`)).json() as { revision: string }
  const saved = await request.put(`/api/projects/${id}/files`, { data: { path: 'pom.xml', revision: file.revision, content: pom.content.replace('</project>', '<broken></project>') } })
  expect(saved.ok(), await saved.text()).toBe(true)
  const build = await buildFromUI(page, id)
  expect(build.success).toBe(false)
  expect(build.rawOutput || build.diagnostics.map((entry) => entry.message).join(' ')).toMatch(/pom|xml|Maven|project/i)
  await expect(page.getByRole('button', { name: /^PROBLEMS/ })).toBeVisible()
  await expect(page.locator('.ide-problems')).toContainText(/pom|xml|Maven|project/i)
})
