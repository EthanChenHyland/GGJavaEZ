import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { VisualizeResponse } from '../src/ide/contracts'
import type { ExecutionSession, StartExecutionRequest } from '../src/execution/contracts'
import { normalizeTrace } from '../src/instrumentation/normalize'
import type { RawRuntimeEvent } from '../src/instrumentation/contracts'
import { home, ready, seekCursor, selectEntity } from './reference/harness'
import { openDock } from './reference/dockActions'

const projectId = 'm8-workspace-fixture'
const widthKey = 'ggjavaez:p5:source-width'
const evidence = JSON.parse(await readFile(new URL('../docs/checkpoints/debug-v7/performance.json', import.meta.url), 'utf8')) as {
  fixtures: { person: { payload: VisualizeResponse } }
}
const person = evidence.fixtures.person.payload

// A small protocol fixture exercises the investigative UI only. Real exception
// capture and cooperative JVM stepping remain covered by debugger-errors.spec.ts.
function failureFixture(): VisualizeResponse {
  const content = 'public class Main {\n  public static void main(String[] args) {\n    String name = null;\n    System.out.println(name.length());\n  }\n}\n'
  const sha256 = createHash('sha256').update(content).digest('hex')
  const context = { v: 1 as const, threadId: '3', frameId: 'f1', className: 'Main', methodName: 'main', descriptor: '([Ljava/lang/String;)V', site: 0 }
  const rawEvents: RawRuntimeEvent[] = [
    { ...context, seq: 0, line: 2, type: 'enter', callerFrameId: null, receiver: null, parameters: [] },
    { ...context, seq: 1, line: 3, type: 'local', slot: 1, liveRange: 'name', name: 'name', descriptor: 'Ljava/lang/String;', value: { kind: 'null' } },
    { ...context, seq: 2, line: 4, type: 'line' },
    { ...context, seq: 3, line: 4, type: 'throw', objectId: 'exception1', className: 'java.lang.NullPointerException', message: 'name is null', explicit: false },
    { ...context, seq: 4, line: 4, type: 'unwind', objectId: 'exception1' },
  ]
  return {
    ...person, status: 'program_crashed', exitCode: 1, diagnostic: 'JVM exited with code 1',
    capability: null, metrics: null, rawEvents, stdout: '',
    stderr: 'java.lang.NullPointerException: name is null\n\tat Main.main(Main.java:4)\n',
    sourceManifest: {
      sources: [{ fileId: 'Main.java', name: 'Main.java', content, sha256 }],
      classes: [{ className: 'Main', sourceFile: 'Main.java', fileId: 'Main.java', sourceSha256: sha256, status: 'resolved', candidates: ['Main.java'] }],
    },
  }
}

async function workspace(page: Page, payload = person) {
  const files = new Map(payload.sourceManifest.sources.map((file) => [file.fileId, { path: file.fileId, content: file.content, revision: 'fixture-1' }]))
  const saved: string[] = []
  const starts: StartExecutionRequest[] = []
  const session: ExecutionSession = {
    id: 'm8-workspace-execution', revision: 1, projectId, mainClass: 'Main', kind: 'run',
    phase: payload.status === 'complete' ? 'COMPLETED' : 'FAILED',
    support: 'PARTIAL', supportReason: null, build: payload.build,
    rawEvents: payload.rawEvents, sourceManifest: payload.sourceManifest, capability: payload.capability,
    stdout: payload.stdout, stderr: payload.stderr, runEvents: [], pause: null, breakpoints: [],
    terminalStatus: payload.status === 'compile_failed' ? null : payload.status,
    exitCode: payload.exitCode, diagnostic: payload.diagnostic,
    failureKind: payload.status === 'complete' ? null : payload.status === 'compile_failed' ? 'build' : 'runtime',
    startedAt: '2026-09-28T00:00:00Z',
  }
  // Keep every API call in this browser context: no imports, process stops,
  // compilation or debugger commands can affect another concurrently running test.
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === `/api/execution/${session.id}/events`) {
      await route.fulfill({ status: 204 })
      return
    }
    let body: unknown
    if (url.pathname === '/api/projects') body = [{ id: projectId, name: 'M8 workspace fixture', createdAt: '2026-09-28T00:00:00Z' }]
    else if (url.pathname === '/api/projects/' + projectId) body = { id: projectId, name: 'M8 workspace fixture', createdAt: '2026-09-28T00:00:00Z' }
    else if (url.pathname === '/api/health') body = { jdk: payload.build.jdk }
    else if (url.pathname === '/api/execution/current') body = null
    else if (url.pathname === '/api/projects/' + projectId + '/tree') body = [...files.values()].map(({ path }) => ({ path, name: path, kind: 'file' }))
    else if (url.pathname === '/api/projects/' + projectId + '/java-project') body = {
      projectId, revision: 'fixture-1', buildSystem: 'plain', status: 'ready', diagnostic: null,
      sourceRoots: ['.'], testSourceRoots: [], outputRoots: [], dependencies: [], runnableTargets: ['Main'], elapsedMs: 0,
    }
    else if (url.pathname.startsWith('/api/projects/' + projectId + '/language')) body = url.pathname.endsWith('/notify')
      ? { ok: true } : { projectId, generation: 1, status: 'unavailable', message: 'Fixture has no language server', diagnostics: [], metrics: {} }
    else if (url.pathname === '/api/projects/' + projectId + '/execution' && request.method() === 'POST') {
      const options = request.postDataJSON() as StartExecutionRequest
      expect(options.kind).toBe('run')
      expect(['', 'Main']).toContain(options.mainClass)
      expect(options.withoutVisualization).not.toBe(true)
      starts.push(options)
      body = session
    }
    else if (url.pathname === '/api/projects/' + projectId + '/files') {
      if (request.method() === 'PUT') {
        const update = request.postDataJSON() as { path: string; content: string }
        const file = { path: update.path, content: update.content, revision: 'fixture-' + (saved.length + 2) }
        files.set(update.path, file)
        saved.push(update.path)
        body = file
      } else body = files.get(url.searchParams.get('path') ?? '')
    } else throw new Error('Unexpected workspace fixture request: ' + request.method() + ' ' + url.pathname)
    await route.fulfill({ json: body })
  })
  await page.addInitScript((id) => localStorage.setItem('ggjavaez:project', id), projectId)
  await page.goto('/?qa=1')
  await page.waitForFunction(() => typeof window.__ggjavaezQA?.ready === 'function')
  await expect(page.getByRole('button', { name: 'Project menu', exact: true })).toHaveAttribute('data-project-id', projectId)
  if (page.viewportSize()!.width >= 1024) await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
  return { files, saved, starts }
}

async function visualize(page: Page, payload = person) {
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(canvas(page)).toBeVisible()
  const trace = normalizeTrace(payload.rawEvents, payload.sourceManifest, {
    status: payload.status === 'compile_failed' ? 'complete' : payload.status,
    exitCode: payload.exitCode, diagnostic: payload.diagnostic,
  }).trace
  await expect(timeline(page)).toHaveAttribute('aria-valuemax', String(trace.events.length))
  await ready(page)
  return trace
}

async function selectPerson(page: Page) {
  const trace = await visualize(page)
  const mutation = trace.events.findIndex((event) => event.type === 'SET_FIELD' && event.value.kind === 'primitive' && event.value.value === 18)
  expect(mutation).toBeGreaterThan(-1)
  const cursor = mutation + 1
  const event = trace.events[mutation]
  if (event.type !== 'SET_FIELD') throw new Error('Expected the captured Person mutation')
  await seekCursor(page, cursor)
  await home(page)
  await selectEntity(page, event.objectId)
  await expect(inspector(page)).toContainText('18')
  await expect(page.locator('.ide-tab.is-active')).toContainText('Person.java')
  return { cursor, id: event.objectId }
}

const timeline = (page: Page) => page.getByRole('slider', { name: 'Recorded execution position', exact: true })
const canvas = (page: Page) => page.locator('.world-canvas canvas')
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Selection inspector', exact: true })
const editor = (page: Page) => page.locator('.ide-editor-panel')
const sourceButton = (page: Page) => page.getByRole('button', { name: 'Show source drawer', exact: true })
const runWidth = (width: number) => Math.max(340, Math.min(470, width * .25))

async function sameSelection(page: Page, selected: { cursor: number; id: string }) {
  await expect(timeline(page)).toHaveAttribute('aria-valuenow', String(selected.cursor))
  expect(await page.evaluate(() => window.__ggjavaezQA!.selection()?.id)).toBe(selected.id)
}

async function sourceWidth(page: Page, pixels: number) {
  await expect.poll(async () => Math.abs((await editor(page).boundingBox())!.width - pixels)).toBeLessThan(2)
}

async function dimensions(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  expect(box, selector + ' must have a visible layout box').not.toBeNull()
  return box!
}

test('source expands for editing, Run restores the runtime wing, and Focus preserves cursor and selection', async ({ page }) => {
  const fixture = await workspace(page)
  const width = page.viewportSize()!.width
  await expect(page.getByLabel('Runtime ready')).toBeVisible()
  await sourceWidth(page, width * .48)
  await page.getByRole('button', { name: 'Expand source for editing', exact: true }).click()
  await sourceWidth(page, width * .48)
  const selected = await selectPerson(page)
  expect(fixture.starts).toHaveLength(1)
  const originalCanvas = await canvas(page).elementHandle()
  const sourceState = () => page.evaluate(() => {
    const qa = window.__ggjavaezQA!, source = qa.source()
    return { modelUri: source?.modelUri, position: source?.position, selection: source?.selection, models: qa.editorModels().modelUris }
  })
  const originalSource = await sourceState()
  expect(originalCanvas).not.toBeNull()
  expect(originalSource.modelUri).toContain('/Person.java')
  await expect(page.locator('.ide-project-panel')).toBeHidden()
  await expect(editor(page)).toBeVisible()
  await expect(page.locator('.executing-line')).toBeVisible()
  await sourceWidth(page, runWidth(width))
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.getByRole('button', { name: 'Expand source for editing', exact: true }).click()
    await sourceWidth(page, width * .48)
    expect(await sourceState()).toEqual(originalSource)
    await page.getByRole('button', { name: 'Collapse source', exact: true }).click()
    await sourceWidth(page, runWidth(width))
    await inspector(page).getByRole('button', { name: 'Focus selection', exact: true }).click()
    await ready(page)
    await sourceWidth(page, width * .22)
    await expect(page.locator('.executing-line')).toBeVisible()
    await sameSelection(page, selected)
    await inspector(page).getByRole('button', { name: 'Return to World', exact: true }).click()
    await ready(page)
    await sourceWidth(page, runWidth(width))
    await expect(inspector(page)).toContainText('18')
    await sameSelection(page, selected)
    expect(await originalCanvas!.evaluate(node => node === document.querySelector('.world-canvas canvas'))).toBe(true)
    await expect.poll(sourceState).toMatchObject({ modelUri: originalSource.modelUri, position: originalSource.position, selection: originalSource.selection })
  }
})

test('keyboard explorer, bottom tools, inspector and Save All remain usable from Monaco', async ({ page }) => {
  const fixture = await workspace(page)
  const selected = await selectPerson(page)
  // Open and dirty two real Monaco models; saving all must reach both files.
  for (const path of ['Main.java', 'Person.java']) {
    if (!await page.locator('.ide-project-panel').isVisible()) await page.keyboard.press('Alt+Shift+E')
    await page.locator('.ide-tree-name').filter({ hasText: path }).click()
    await page.keyboard.press('Alt+Shift+E')
    await page.locator('.monaco-editor .view-lines').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.insertText('\n// M8 save all\n')
  }
  await expect(page.locator('.ide-dirty')).toHaveCount(2)
  await page.keyboard.press('ControlOrMeta+Shift+S')
  await expect(page.locator('.ide-dirty')).toHaveCount(0)
  expect(fixture.saved.sort()).toEqual(['Main.java', 'Person.java'])
  expect([...fixture.files.values()].every((file) => file.content.includes('// M8 save all'))).toBe(true)
  expect([...fixture.files.values()].every((file) => file.content.endsWith('\n// M8 save all\n'))).toBe(true)
  await sameSelection(page, selected)
  await expect(page.locator('.ide-project-panel')).toBeHidden()
  // macOS Option+Shift+E reports an accented symbol while code stays KeyE.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '´', code: 'KeyE', altKey: true, shiftKey: true, bubbles: true, cancelable: true })))
  await expect(page.locator('.ide-project-panel')).toBeVisible()
  await page.keyboard.press('Alt+Shift+E')
  const dock = page.getByRole('navigation', { name: 'Dock', exact: true })
  const console = dock.getByRole('button', { name: 'Console', exact: true })
  if (await console.getAttribute('aria-expanded') === 'true') await console.click()
  await page.locator('.monaco-editor .view-lines').click()
  await page.keyboard.press('Alt+Shift+B')
  await expect(console).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('region', { name: 'Console drawer', exact: true })).toBeVisible()
  await page.keyboard.press('Alt+Shift+B')
  await expect(console).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Alt+Shift+I')
  await expect(inspector(page)).toHaveCount(0)
  await page.keyboard.press('Alt+Shift+I')
  await expect(inspector(page)).toContainText('18')
})

test('crossing the narrow breakpoint collapses explorer and Focus keeps executing source reachable', async ({ page }, testInfo) => {
  await workspace(page)
  const selected = await selectPerson(page)
  await page.keyboard.press('Alt+Shift+E')
  await expect(page.locator('.ide-project-panel')).toBeVisible()
  await page.setViewportSize({ width: 760, height: 900 })
  await expect(page.locator('.ide-project-panel')).toBeHidden()
  await expect(sourceButton(page)).toBeVisible()
  const allocation = await page.evaluate(id => {
    const node = window.__ggjavaezWorld!.scene().entities[id]
    return node?.kind === 'object' ? node.allocationSite : null
  }, selected.id)
  expect(allocation).toBeTruthy()
  await page.keyboard.press('Alt+Shift+F')
  await ready(page)
  await expect(editor(page)).toBeHidden()
  expect((await dimensions(page, '.world-canvas canvas')).width).toBeGreaterThan(650)
  expect((await dimensions(page, '.world-canvas canvas')).height).toBeGreaterThan(450)
  await sourceButton(page).click()
  await expect(page.locator('.executing-line')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__ggjavaezQA!.source()?.target)).toMatchObject({ mark: 'focus', line: allocation!.line })
  await expect(page.locator('.ide-tab.is-active')).toContainText(allocation!.fileId.split('/').at(-1)!)
  await page.keyboard.press('Alt+Shift+E')
  await expect(page.locator('.ide-tree-name').filter({ hasText: 'Main.java' })).toBeVisible()
  await page.keyboard.press('Alt+Shift+E')
  await expect(page.locator('.ide-project-panel')).toBeHidden()
  await expect(editor(page)).toBeVisible()
  await page.getByRole('button', { name: 'Collapse source', exact: true }).click()
  await expect(editor(page)).toBeHidden()
  await sameSelection(page, selected)
  await inspector(page).getByRole('button', { name: 'Return to World', exact: true }).click()
  await home(page)
  await page.screenshot({ path: testInfo.outputPath('focus-from-code-760x900.png'), animations: 'disabled' })
  await sourceButton(page).click()
  await expect(page.locator('.executing-line')).toBeVisible()
  await expect(page.locator('.ide-tab.is-active')).toContainText('Person.java')
  await expect(canvas(page)).toBeVisible()
  await sameSelection(page, selected)
})

test('narrow Error Explorer exposes source, cause rewind, stderr and return to failure while keeping the world', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 })
  const payload = failureFixture()
  await workspace(page, payload)
  const trace = await visualize(page, payload)
  const throwCursor = trace.events.findIndex((event) => event.type === 'THROW_EXCEPTION') + 1
  await seekCursor(page, trace.events.length)
  await openDock(page, 'Errors')
  const panel = page.getByRole('region', { name: 'Error Explorer', exact: true })
  await expect(panel.getByRole('heading', { name: 'NullPointerException', exact: true })).toBeVisible()
  await expect(canvas(page)).toBeVisible()
  await panel.locator('.debug-source').click()
  await expect(editor(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__ggjavaezQA!.source()?.target?.line)).toBe(4)
  await panel.getByText('Actual JVM stderr / stack trace', { exact: true }).click()
  await expect(panel.locator('.error-summary pre')).toContainText('Main.main(Main.java:4)')
  await panel.getByRole('button', { name: 'Stack & path', exact: true }).click()
  await panel.locator('.debug-value').filter({ hasText: /^name/ }).click()
  await panel.getByRole('button', { name: 'Trace Cause', exact: true }).click()
  await expect(panel.locator('.cause-list button')).toHaveCount(1)
  await panel.locator('.cause-list button').click()
  await expect.poll(async () => Number(await timeline(page).getAttribute('aria-valuenow'))).toBeLessThan(throwCursor)
  await expect(panel.locator('.cause-list button')).toHaveAttribute('aria-current', 'step')
  await panel.getByRole('button', { name: 'Return to failure', exact: true }).click()
  await expect(timeline(page)).toHaveAttribute('aria-valuenow', String(throwCursor))
  await panel.getByRole('button', { name: 'Failure', exact: true }).click()
  await page.keyboard.press('Alt+Shift+B')
  await expect(panel).toBeHidden()
  expect((await dimensions(page, '.world-canvas canvas')).height).toBeGreaterThan(250)
  await page.keyboard.press('Alt+Shift+B')
  await expect(panel.getByRole('heading', { name: 'NullPointerException', exact: true })).toBeVisible()
})

test('specified Source widths hold across reload, Run and Focus under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(key => localStorage.setItem(key, '34'), widthKey)
  await workspace(page)
  const width = page.viewportSize()!.width
  await expect(canvas(page)).toBeVisible()
  await sourceWidth(page, width * .48)
  const selected = await selectPerson(page)
  await sourceWidth(page, runWidth(width))
  expect(await page.evaluate(key => localStorage.getItem(key), widthKey)).toBeNull()
  expect(await editor(page).evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
  await page.reload()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(canvas(page)).toBeVisible()
  await sourceWidth(page, width * .48)
  expect(await editor(page).evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s')
  expect(await selectPerson(page)).toEqual(selected)
  await sourceWidth(page, runWidth(width))
  await page.keyboard.press('Alt+Shift+F')
  await ready(page)
  await sourceWidth(page, width * .22)
  await sameSelection(page, selected)
  await inspector(page).getByRole('button', { name: 'Return to World', exact: true }).click()
  await ready(page)
  await sourceWidth(page, runWidth(width))
  await sameSelection(page, selected)
})
