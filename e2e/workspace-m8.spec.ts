import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { VisualizeResponse } from '../src/ide/contracts'
import type { ExecutionSession, StartExecutionRequest } from '../src/execution/contracts'
import { normalizeTrace } from '../src/instrumentation/normalize'
import type { RawRuntimeEvent } from '../src/instrumentation/contracts'

const projectId = 'm8-workspace-fixture'
const widthKey = 'ggjavaez:m8:editor-widths'
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
  await page.goto('/ide')
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
  return { files, saved, starts }
}

async function visualize(page: Page, payload = person) {
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.locator('.ide-shell')).toHaveClass(/ide-shell--visualize/)
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
  const trace = normalizeTrace(payload.rawEvents, payload.sourceManifest, {
    status: payload.status === 'compile_failed' ? 'complete' : payload.status,
    exitCode: payload.exitCode, diagnostic: payload.diagnostic,
  }).trace
  await expect(page.getByRole('slider', { name: 'Scrub execution' })).toHaveAttribute('max', String(trace.events.length))
  return trace
}

async function selectPerson(page: Page) {
  const trace = await visualize(page)
  const mutation = trace.events.findIndex((event) => event.type === 'SET_FIELD' && event.value.kind === 'primitive' && event.value.value === 18)
  expect(mutation).toBeGreaterThan(-1)
  const cursor = String(mutation + 1)
  await page.getByRole('slider', { name: 'Scrub execution' }).fill(cursor)
  const picker = page.getByRole('combobox', { name: 'Select runtime entity' })
  const id = await picker.locator('option').filter({ hasText: /^Person #/ }).first().getAttribute('value')
  expect(id).toBeTruthy()
  await picker.selectOption(id!)
  await expect(page.getByRole('complementary', { name: 'Runtime inspector' })).toContainText('18')
  await expect(page.locator('.ide-tab.is-active')).toContainText('Person.java')
  return { cursor, id: id! }
}

async function dimensions(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  expect(box, selector + ' must have a visible layout box').not.toBeNull()
  return box!
}

test('Run adapts Code to Runtime, and Focus changes hierarchy without losing cursor or selection', async ({ page }) => {
  const fixture = await workspace(page)
  await expect(page.locator('.ide-shell')).toHaveClass(/ide-shell--code/)
  await expect(page.locator('.ide-runtime-panel')).toBeVisible()
  await expect(page.getByLabel('Runtime ready')).toBeVisible()
  await expect.poll(async () => (await dimensions(page, '.ide-editor-panel')).width / (await dimensions(page, '.ide-upper')).width).toBeGreaterThan(0.5)
  const selected = await selectPerson(page)
  expect(fixture.starts).toHaveLength(1)
  const canvas = await page.locator('.spatial-view canvas').elementHandle()
  const editor = await page.locator('.monaco-editor').elementHandle()
  expect(canvas).not.toBeNull()
  expect(editor).not.toBeNull()
  await expect(page.locator('.ide-project-panel')).toBeHidden()
  await expect(page.locator('.ide-editor-panel')).toBeVisible()
  await expect(page.locator('.executing-line')).toBeVisible()
  await expect.poll(async () => (await dimensions(page, '.ide-editor-panel')).width / (await dimensions(page, '.ide-upper')).width).toBeLessThan(0.4)
  await expect.poll(async () => (await dimensions(page, '.ide-runtime-panel')).width / (await dimensions(page, '.ide-upper')).width).toBeGreaterThan(0.6)
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.getByRole('button', { name: 'Expand runtime', exact: true }).click()
    await expect(page.locator('.ide-editor-panel')).toBeHidden()
    await expect.poll(async () => (await dimensions(page, '.ide-runtime-panel')).width / page.viewportSize()!.width).toBeGreaterThan(0.95)
    await page.getByRole('button', { name: 'Show source drawer', exact: true }).click()
    await expect(page.locator('.monaco-editor')).toBeVisible()
    await expect(page.locator('.executing-line')).toBeVisible()
    await page.getByRole('button', { name: 'Close source drawer', exact: true }).click()
    await page.getByRole('button', { name: 'Restore IDE layout', exact: true }).click()
    await expect(page.getByRole('slider', { name: 'Scrub execution' })).toHaveValue(selected.cursor)
    await expect(page.getByRole('combobox', { name: 'Select runtime entity' })).toHaveValue(selected.id)
    await expect(page.getByRole('complementary', { name: 'Runtime inspector' })).toContainText('18')
    expect(await canvas!.evaluate((element) => element === document.querySelector('.spatial-view canvas'))).toBe(true)
    expect(await editor!.evaluate((element) => element === document.querySelector('.monaco-editor'))).toBe(true)
  }
})

test('keyboard explorer, bottom tools, inspector and Save All remain usable from Monaco', async ({ page }) => {
  const fixture = await workspace(page)
  await selectPerson(page)
  // Open and dirty two real Monaco models; saving all must reach both files.
  for (const path of ['Main.java', 'Person.java']) {
    if (await page.getByRole('button', { name: 'Show project explorer', exact: true }).isVisible()) await page.keyboard.press('Alt+Shift+E')
    await page.locator('.ide-tree-name').filter({ hasText: path }).click()
    await page.locator('.monaco-editor .view-lines').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.insertText('\n// M8 save all\n')
  }
  await expect(page.locator('.ide-dirty')).toHaveCount(2)
  await page.keyboard.press('ControlOrMeta+Shift+S')
  await expect(page.locator('.ide-dirty')).toHaveCount(0)
  expect(fixture.saved.sort()).toEqual(['Main.java', 'Person.java'])
  expect([...fixture.files.values()].every((file) => file.content.includes('// M8 save all'))).toBe(true)
  await page.keyboard.press('Alt+Shift+E')
  await expect(page.locator('.ide-project-panel')).toBeHidden()
  // macOS Option+Shift+E reports an accented symbol while code stays KeyE.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '´', code: 'KeyE', altKey: true, shiftKey: true, bubbles: true, cancelable: true })))
  await expect(page.locator('.ide-project-panel')).toBeVisible()
  await page.keyboard.press('Alt+Shift+B')
  await expect(page.getByRole('button', { name: 'Collapse bottom panel', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'CONSOLE', exact: true })).toBeVisible()
  await page.keyboard.press('Alt+Shift+B')
  await expect(page.getByRole('button', { name: 'Expand bottom panel', exact: true })).toBeVisible()
  await page.keyboard.press('Alt+Shift+I')
  await expect(page.getByRole('complementary', { name: 'Runtime inspector' })).toHaveCount(0)
  await page.keyboard.press('Alt+Shift+I')
  await expect(page.getByRole('complementary', { name: 'Runtime inspector' })).toContainText('18')
})

test('crossing the narrow breakpoint collapses explorer and Focus keeps executing source reachable', async ({ page }, testInfo) => {
  await workspace(page)
  const selected = await selectPerson(page)
  await page.keyboard.press('Alt+Shift+E')
  await expect(page.locator('.ide-project-panel')).toBeVisible()
  await page.setViewportSize({ width: 760, height: 900 })
  await expect(page.locator('.ide-project-panel')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Show project explorer', exact: true })).toBeVisible()
  await expect(page.locator('.executing-line')).toBeVisible()
  await page.keyboard.press('Alt+Shift+F')
  await expect(page.locator('.ide-editor-panel')).toBeHidden()
  // Wait for the pane transition and canvas resize after entering Focus.
  await expect.poll(async () => (await dimensions(page, '.spatial-view canvas')).width).toBeGreaterThan(650)
  await expect.poll(async () => (await dimensions(page, '.spatial-view canvas')).height).toBeGreaterThan(450)
  await page.getByRole('button', { name: 'Show source drawer', exact: true }).click()
  await expect(page.locator('.executing-line')).toBeVisible()
  await expect(page.locator('.ide-tab.is-active')).toContainText('Person.java')
  await page.getByRole('button', { name: 'Close source drawer', exact: true }).click()
  await page.keyboard.press('Alt+Shift+F')
  await expect(page.getByRole('slider', { name: 'Scrub execution' })).toHaveValue(selected.cursor)
  await expect(page.getByRole('combobox', { name: 'Select runtime entity' })).toHaveValue(selected.id)
  await page.keyboard.press('Alt+Shift+E')
  await expect(page.locator('.ide-tree-name').filter({ hasText: 'Main.java' })).toBeVisible()
  await page.keyboard.press('Alt+Shift+E')
  await expect(page.locator('.ide-project-panel')).toBeHidden()
  await expect(page.locator('.ide-runtime-panel')).toBeVisible()
  await expect(page.locator('.ide-editor-panel')).toBeVisible()
  await page.keyboard.press('Alt+Shift+F')
  await expect(page.locator('.ide-runtime-panel')).toBeVisible()
  await expect(page.locator('.ide-editor-panel')).toBeHidden()
  await expect.poll(async () => (await dimensions(page, '.spatial-view canvas')).height).toBeGreaterThan(450)
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await page.waitForTimeout(650)
  await page.screenshot({ path: testInfo.outputPath('focus-from-code-760x900.png'), animations: 'disabled' })
  await page.getByRole('button', { name: 'Show source drawer', exact: true }).click()
  await expect(page.locator('.executing-line')).toBeVisible()
  await page.getByRole('button', { name: 'Restore IDE layout', exact: true }).click()
  await expect(page.locator('.ide-runtime-panel')).toBeVisible()
  await expect(page.locator('.ide-editor-panel')).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Scrub execution' })).toHaveValue(selected.cursor)
  await expect(page.getByRole('combobox', { name: 'Select runtime entity' })).toHaveValue(selected.id)
})

test('narrow Error Explorer exposes source, cause rewind, stderr and return to failure while keeping the world', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 })
  const payload = failureFixture()
  await workspace(page, payload)
  const trace = await visualize(page, payload)
  const throwCursor = String(trace.events.findIndex((event) => event.type === 'THROW_EXCEPTION') + 1)
  const panel = page.getByRole('region', { name: 'Error Explorer', exact: true })
  await expect(panel.getByRole('heading', { name: 'NullPointerException', exact: true })).toBeVisible()
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
  await expect(page.locator('.executing-line')).toBeVisible()
  await panel.locator('.debug-source').click()
  await expect(page.locator('.executing-line')).toBeVisible()
  await panel.getByText('Actual JVM stderr / stack trace', { exact: true }).click()
  await expect(panel.locator('.error-summary pre')).toContainText('Main.main(Main.java:4)')
  await panel.getByRole('button', { name: 'Stack & path', exact: true }).click()
  await panel.locator('.debug-value').filter({ hasText: /^name/ }).click()
  await panel.getByRole('button', { name: 'Trace Cause', exact: true }).click()
  await expect(panel.locator('.cause-list button')).toHaveCount(1)
  await panel.locator('.cause-list button').click()
  await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Scrub execution' }).inputValue())).toBeLessThan(Number(throwCursor))
  await expect(panel.locator('.cause-list button')).toHaveAttribute('aria-current', 'step')
  await panel.getByRole('button', { name: 'Failure', exact: true }).click()
  await panel.getByRole('button', { name: 'Return to failure', exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Scrub execution' })).toHaveValue(throwCursor)
  await page.keyboard.press('Alt+Shift+B')
  await expect(panel).toBeHidden()
  expect((await dimensions(page, '.spatial-view canvas')).height).toBeGreaterThan(250)
  await page.keyboard.press('Alt+Shift+B')
  await expect(panel.getByRole('heading', { name: 'NullPointerException', exact: true })).toBeVisible()
})

test('manual Runtime width survives reload and Focus under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await workspace(page)
  await expect(page.locator('.ide-shell')).toHaveClass(/ide-shell--code/)
  await expect(page.locator('.ide-runtime-panel')).toBeVisible()
  await expect.poll(async () => (await dimensions(page, '.ide-editor-panel')).width / (await dimensions(page, '.ide-upper')).width).toBeGreaterThan(0.5)
  await visualize(page)
  const divider = page.getByRole('separator', { name: 'Resize runtime pane', exact: true })
  await divider.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  const runtimeWidth = (await dimensions(page, '.ide-editor-panel')).width / (await dimensions(page, '.ide-upper')).width
  await expect.poll(async () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).visualize as number, widthKey)).toBeCloseTo(runtimeWidth * 100, 0)
  expect(await page.locator('.ide-editor-panel').evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s')
  await page.reload()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.locator('.ide-shell')).toHaveClass(/ide-shell--code/)
  await expect(page.locator('.ide-runtime-panel')).toBeVisible()
  await visualize(page)
  await expect.poll(async () => (await dimensions(page, '.ide-editor-panel')).width / (await dimensions(page, '.ide-upper')).width).toBeCloseTo(runtimeWidth, 2)
  await page.keyboard.press('Alt+Shift+F')
  await expect(page.locator('.ide-editor-panel')).toBeHidden()
  await page.keyboard.press('Alt+Shift+F')
  await expect(page.locator('.ide-editor-panel')).toBeVisible()
  await expect.poll(async () => (await dimensions(page, '.ide-editor-panel')).width / (await dimensions(page, '.ide-upper')).width).toBeCloseTo(runtimeWidth, 2)
})
