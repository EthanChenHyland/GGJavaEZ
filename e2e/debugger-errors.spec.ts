import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DebugPause, DebugSession, SourceBreakpoint } from '../src/debugger/contracts'
import type { VisualizeResponse } from '../src/ide/contracts'
import { normalizeTrace } from '../src/instrumentation/normalize'
import { seek } from '../src/runtime/seek'

test.describe.configure({ timeout: 60_000 })
let ownedProjectId: string | null = null

async function importProject(request: APIRequestContext, fixture: string, files?: { path: string; content: string }[]) {
  const directory = resolve('fixtures/debug-v7', fixture)
  files ??= await Promise.all((await readdir(directory)).filter((name) => name.endsWith('.java')).map(async (name) => ({
    path: name, content: await readFile(resolve(directory, name), 'utf8'),
  })))
  const response = await request.post('/api/projects/import', { data: { name: `DebugQA-${fixture}-${randomUUID()}`, files } })
  expect(response.ok(), await response.text()).toBe(true)
  ownedProjectId = (await response.json()).id as string
  return ownedProjectId
}

async function openProject(page: Page, id: string, breakpoints: SourceBreakpoint[] = []) {
  await page.goto('/ide')
  await expect(page.getByRole('button', { name: 'Build', exact: true })).toBeEnabled()
  await page.evaluate(({ id, breakpoints }) => {
    localStorage.setItem('ggjavaez:project', id)
    localStorage.setItem(`ggjavaez:breakpoints:${id}`, JSON.stringify(breakpoints))
  }, { id, breakpoints })
  await page.reload()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Debug', exact: true })).toBeEnabled()
}

async function current(request: APIRequestContext): Promise<DebugSession | null> {
  const response = await request.get('/api/debug/current')
  expect(response.ok()).toBe(true)
  return response.json()
}

async function paused(page: Page, request: APIRequestContext, expected: Partial<DebugPause>, after = -1) {
  let session: DebugSession | null = null
  await expect.poll(async () => {
    session = await current(request)
    if (session?.status === 'failed') throw new Error(`Debug session failed: ${session.diagnostic}\n${session.stderr}`)
    return session?.status === 'paused' && !!session.pause && session.pause.rawEventCount > after
      && Object.entries(expected).every(([key, value]) => session!.pause![key as keyof DebugPause] === value)
  }, { timeout: 15_000, message: `Actual JVM pause ${JSON.stringify(expected)}` }).toBe(true)
  await expect(page.locator('.debug-live-state')).toContainText(`JVM PAUSED · ${session!.pause!.reason.toUpperCase()}`)
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled()
  return session!
}

async function startDebug(page: Page, request: APIRequestContext) {
  await page.getByRole('button', { name: 'Debug', exact: true }).click()
  const session = await paused(page, request, { reason: 'entry' })
  await expect(page.locator('.app-shell--embedded')).toBeVisible()
  await expect(page.locator('.debug-paused-line')).toBeVisible()
  return session
}

async function command(page: Page, request: APIRequestContext, name: string, expected: Partial<DebugPause>, previous: DebugSession) {
  await page.getByRole('button', { name, exact: true }).click()
  return paused(page, request, expected, previous.pause!.rawEventCount)
}

async function gutter(page: Page, line: number) {
  const number = page.locator('.monaco-editor .line-numbers').filter({ hasText: new RegExp(`^${line}$`) }).first()
  await expect(number).toBeVisible()
  await expect(page.locator('.monaco-editor .glyph-margin').first()).toBeVisible()
  const row = await number.boundingBox()
  const margin = await page.locator('.monaco-editor .glyph-margin').first().boundingBox()
  expect(row).not.toBeNull()
  expect(margin).not.toBeNull()
  await page.mouse.click(margin!.x + margin!.width / 2, row!.y + row!.height / 2)
}

async function visualize(page: Page, id: string) {
  const pending = page.waitForResponse((response) => response.url().endsWith(`/api/projects/${id}/visualize`) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Visualize', exact: true }).click()
  const response = await pending
  expect(response.ok(), await response.text()).toBe(true)
  const capture = await response.json() as VisualizeResponse
  expect(capture.build.success).toBe(true)
  if (capture.status === 'compile_failed') throw new Error('Expected executable QA source')
  const { trace } = normalizeTrace(capture.rawEvents, capture.sourceManifest, {
    status: capture.status, exitCode: capture.exitCode, diagnostic: capture.diagnostic,
  })
  await expect(page.locator('.app-shell--embedded')).toBeVisible()
  const slider = page.getByRole('slider', { name: 'Scrub execution' })
  await expect(slider).toHaveAttribute('max', String(trace.events.length))
  await slider.fill(String(trace.events.length))
  return { capture, trace, slider }
}

test.afterEach(async ({ request }) => {
  const session = await current(request)
  if (session && session.projectId === ownedProjectId && ['starting', 'running', 'paused'].includes(session.status)) {
    const response = await request.post(`/api/debug/${session.sessionId}/command`, { data: { command: 'stop' } })
    expect(response.ok()).toBe(true)
  }
  ownedProjectId = null
})

test('real gutter toggles persist, remove, and distinguish a nonexecutable breakpoint', async ({ page, request }) => {
  const id = await importProject(request, 'stepping')
  await openProject(page, id)
  await gutter(page, 5)
  await expect(page.locator('.debug-breakpoint')).toHaveCount(1)
  expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`ggjavaez:breakpoints:${id}`)!), id))
    .toEqual([{ fileId: 'Main.java', line: 5 }])
  await gutter(page, 5)
  await expect(page.locator('.debug-breakpoint')).toHaveCount(0)
  await gutter(page, 5)
  await page.reload()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.locator('.debug-breakpoint')).toHaveCount(1)
  await page.getByRole('button', { name: 'J Person.java', exact: true }).click()
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('class Person')
  await gutter(page, 3)
  await startDebug(page, request)
  await expect(page.locator('.debug-breakpoint-row').filter({ hasText: 'Person.java:3' })).toContainText('non executable')
  const session = await current(request)
  expect(session!.breakpoints).toContainEqual(expect.objectContaining({ fileId: 'Main.java', line: 5, status: 'verified' }))
  expect(session!.breakpoints).toContainEqual(expect.objectContaining({ fileId: 'Person.java', line: 3, status: 'non_executable' }))
  await page.locator('.debug-breakpoint-row').filter({ hasText: 'Person.java:3' }).click()
  await expect(page.locator('.debug-breakpoint-row')).toHaveCount(1)
  await expect.poll(async () => (await current(request))!.breakpoints.length).toBe(1)
})

test('actual multifile breakpoint and Into/Over/Out synchronize source, objects, and arrays', async ({ page, request }) => {
  const id = await importProject(request, 'stepping')
  await openProject(page, id, [{ fileId: 'Main.java', line: 5 }])
  let session = await startDebug(page, request)
  session = await command(page, request, 'Continue', { reason: 'breakpoint', className: 'Main', line: 5 }, session)
  await expect(page.locator('.debug-panel .debug-value').filter({ hasText: 'requestedAge' })).toContainText('18')
  const picker = page.getByRole('combobox', { name: 'Select runtime entity' })
  const person = picker.locator('option').filter({ hasText: /^Person #/ }).first()
  const personId = await person.getAttribute('value')
  expect(personId).toBeTruthy()
  await picker.selectOption(personId!)
  await expect(page.getByRole('complementary', { name: 'Runtime inspector' })).toContainText('12')
  await page.getByRole('button', { name: 'Show live pause', exact: true }).click()
  session = await command(page, request, 'Step Into', { className: 'Worker', methodName: 'update', line: 3 }, session)
  await expect(page.locator('.ide-tab.is-active')).toContainText('Worker.java')
  await expect(page.locator('.debug-paused-line')).toBeVisible()
  await expect(page.locator('.debug-panel')).toContainText('Worker.update()')
  session = await command(page, request, 'Step Into', { className: 'Person', methodName: 'setAge', line: 9 }, session)
  await expect(page.locator('.ide-tab.is-active')).toContainText('Person.java')
  await expect(page.locator('.debug-panel .debug-value').filter({ hasText: 'this' })).toHaveCount(1)
  await expect(page.locator('.debug-panel .debug-value').filter({ hasText: /^age/ })).toContainText('18')
  session = await command(page, request, 'Step Out', { className: 'Worker', methodName: 'update', line: 4 }, session)
  await expect(page.locator('.ide-tab.is-active')).toContainText('Worker.java')
  session = await command(page, request, 'Step Over', { className: 'Worker', methodName: 'update', line: 5 }, session)
  await expect(page.locator('.debug-panel .debug-value').filter({ hasText: /^ages/ })).toContainText('→')
  const arrayId = await picker.locator('option').filter({ hasText: /^int\[\] #/ }).first().getAttribute('value')
  expect(arrayId).toBeTruthy()
  await picker.selectOption(arrayId!)
  await expect(page.getByRole('complementary', { name: 'Runtime inspector' })).toContainText('Indexed elements')
  await expect(page.getByRole('complementary', { name: 'Runtime inspector' }).locator('.inspector-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Show live pause', exact: true }).click()
  session = await command(page, request, 'Step Into', { className: 'Worker', methodName: 'read', line: 10 }, session)
  await expect(page.locator('.debug-panel .debug-value').filter({ hasText: /^index/ })).toContainText('0')
  session = await command(page, request, 'Step Out', { className: 'Worker', methodName: 'update', line: 6 }, session)
  session = await command(page, request, 'Step Out', { className: 'Main', methodName: 'main', line: 6 }, session)
  await expect(page.locator('.ide-tab.is-active')).toContainText('Main.java')
  await expect(page.locator('.debug-panel .debug-value').filter({ hasText: /^result/ })).toContainText('18')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect.poll(async () => (await current(request))!.status).toBe('exited')
  await expect(page.locator('.debug-live-state')).toContainText('JVM EXITED')
  const final = await current(request)
  expect(final!.exitCode).toBe(0)
  expect(final!.stdout.trim()).toBe('18')
  expect(final!.rawEvents.filter((event) => event.type === 'object' && event.className === 'Person')).toHaveLength(1)
})

test('Pause JVM suspends real execution at a project boundary and Stop Debug reaps it', async ({ page, request }) => {
  const id = await importProject(request, 'pause', [{ path: 'Main.java', content: 'public class Main {\n public static void main(String[] args) throws Exception {\n  int i = 0;\n  while (i < 100) {\n   i++;\n   Thread.sleep(25);\n  }\n  System.out.println(i);\n }\n}\n' }])
  await openProject(page, id)
  const initial = await startDebug(page, request)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause JVM', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Pause JVM', exact: true }).click()
  const session = await paused(page, request, { reason: 'pause' }, initial.pause!.rawEventCount)
  const count = session.rawEvents.length
  const later = await request.get(`/api/debug/${session.sessionId}`)
  expect((await later.json()).rawEvents).toHaveLength(count)
  await expect(page.locator('.debug-paused-line')).toBeVisible()
  await page.getByRole('button', { name: 'Stop Debug', exact: true }).click()
  await expect(page.locator('.debug-live-state')).toContainText('JVM STOPPED')
  expect((await current(request))!.status).toBe('stopped')
  await expect(page.getByRole('button', { name: 'Stop Debug', exact: true })).toBeDisabled()
})

test('null exception pause is inspectable, causal rewind selects its assignment, and returns to failure', async ({ page, request }) => {
  const id = await importProject(request, 'null')
  await openProject(page, id)
  const initial = await startDebug(page, request)
  await command(page, request, 'Continue', { reason: 'exception', className: 'Main', line: 4 }, initial)
  const panel = page.locator('.error-explorer')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'NullPointerException', exact: true })).toBeVisible()
  await expect(panel.locator('.debug-source')).toContainText('Main.java:4')
  await panel.locator('.debug-value').filter({ hasText: /^name/ }).click()
  await expect(panel.locator('.debug-value.is-selected').filter({ hasText: /^name/ })).toContainText('null')
  const selectedName = page.getByRole('combobox', { name: 'Select runtime entity' })
  const nameId = await selectedName.locator('option').filter({ hasText: / · name$/ }).first().getAttribute('value')
  expect(nameId).toBeTruthy()
  await expect(selectedName).toHaveValue(nameId!)
  await page.getByRole('button', { name: 'Explore runtime' }).click()
  await panel.getByRole('button', { name: 'Trace Cause', exact: true }).click()
  await expect(panel.locator('.cause-list li')).toHaveCount(1)
  await expect(panel.locator('.cause-list')).toContainText('null')
  const slider = page.getByRole('slider', { name: 'Scrub execution' })
  const failureCursor = Number(await slider.inputValue())
  await panel.locator('.cause-list button').first().click()
  await expect.poll(async () => Number(await slider.inputValue())).toBeLessThan(failureCursor)
  await expect(panel.locator('.cause-list button').first()).toHaveAttribute('aria-current', 'step')
  await expect(page.locator('.executing-line')).toBeVisible()
  await expect(page.locator('.debug-paused-line')).toHaveCount(0)
  await expect(page.locator('.world-label')).toContainText('FREE EXPLORE')
  await panel.getByRole('button', { name: 'Return to failure', exact: true }).click()
  await expect(slider).toHaveValue(String(failureCursor))
  await expect(page.locator('.debug-paused-line')).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect.poll(async () => (await current(request))!.terminalStatus).toBe('program_crashed')
  await panel.getByText('Actual JVM stderr / stack trace', { exact: true }).click()
  await expect(panel.locator('.error-summary pre')).toContainText('Main.main(Main.java:4)')
  await expect(panel).toBeVisible()
})

test('nested propagation seeks real unwind states in Classic and Spatial', async ({ page, request }) => {
  const id = await importProject(request, 'nested')
  await openProject(page, id)
  const { trace } = await visualize(page, id)
  await page.getByRole('button', { name: 'ERROR EXPLORER', exact: true }).click()
  const panel = page.locator('.error-explorer')
  const stack = panel.locator('.error-stack details summary button')
  await expect(stack).toHaveText(['Main.b()', 'Main.a()', 'Main.main()'])
  await expect(panel.locator('.exception-path button')).toHaveCount(4)
  expect(trace.events.filter((event) => event.type === 'UNWIND_EXCEPTION')).toHaveLength(3)
  await panel.getByRole('button', { name: 'Return to failure', exact: true }).click()
  const slider = page.getByRole('slider', { name: 'Scrub execution' })
  const crash = String(trace.events.findIndex((event) => event.type === 'THROW_EXCEPTION') + 1)
  await expect(slider).toHaveValue(crash)
  await page.getByRole('button', { name: 'Classic', exact: true }).click()
  await expect(page.locator('.classic-runtime')).toContainText('b()')
  await expect(page.locator('.classic-runtime')).toContainText('a()')
  await expect(page.locator('.classic-runtime [data-exception-state="origin"]')).toHaveCount(1)
  await panel.locator('.exception-path button').filter({ hasText: /^Unwind/ }).first().click()
  await expect(panel.locator('.exception-path [aria-current="step"]')).toHaveCount(1)
  await expect(panel.locator('.error-stack')).toContainText('unwound')
  await expect(page.locator('.classic-runtime [data-exception-state="unwound"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Spatial', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Runtime world' }).locator('canvas')).toBeVisible()
  await panel.getByRole('button', { name: 'Return to failure', exact: true }).click()
  await expect(slider).toHaveValue(crash)
  await panel.getByText('Actual JVM stderr / stack trace', { exact: true }).click()
  await expect(panel.locator('.error-summary pre')).toContainText('Main.b(Main.java:12)')
})

for (const [fixture, exception] of [['bounds', 'ArrayIndexOutOfBoundsException'], ['divide', 'ArithmeticException'], ['explicit', 'IllegalArgumentException']] as const) {
  test(`real ${fixture} failure exposes its actual exception and source`, async ({ page, request }) => {
    const id = await importProject(request, fixture)
    await openProject(page, id)
    const { capture, trace } = await visualize(page, id)
    expect(capture.status).toBe('program_crashed')
    await page.getByRole('button', { name: 'ERROR EXPLORER', exact: true }).click()
    const panel = page.locator('.error-explorer')
    await expect(panel.getByRole('heading', { name: exception, exact: true })).toBeVisible()
    await expect(panel.locator('.debug-source')).toContainText('Main.java:')
    const exceptionEvent = trace.events.find((event) => event.type === 'THROW_EXCEPTION')
    expect(exceptionEvent).toMatchObject({ className: `java.lang.${exception}`, explicit: fixture === 'explicit' })
    if (fixture === 'bounds') {
      await expect(panel.locator('.debug-value').filter({ hasText: /^index/ })).toContainText('5')
      await panel.locator('.error-causes details summary').filter({ hasText: /int\[\]/ }).click()
      await expect(panel.locator('.error-causes .debug-value')).toHaveCount(3)
    }
    if (fixture === 'divide') await expect(panel.locator('.debug-value').filter({ hasText: /^y/ })).toContainText('0')
    if (fixture === 'explicit') await expect(panel.locator('.error-summary')).toContainText('bad value')
  })
}

for (const fixture of ['caught', 'finally'] as const) {
  test(`real ${fixture} lifecycle reconstructs catch, continuation, and handler order`, async ({ page, request }) => {
    const id = await importProject(request, fixture)
    await openProject(page, id)
    const { capture, trace, slider } = await visualize(page, id)
    expect(capture.status).toBe('complete')
    await page.getByRole('button', { name: 'ERROR EXPLORER', exact: true }).click()
    const panel = page.locator('.error-explorer')
    await expect(panel.locator('.debug-eyebrow')).toContainText('CAUGHT')
    await expect(panel.locator('.exception-path button').filter({ hasText: /^Catch/ })).toHaveCount(1)
    const catchIndex = trace.events.findIndex((event) => event.type === 'CATCH_EXCEPTION')
    if (fixture === 'finally') {
      const handlerIndex = trace.events.findIndex((event) => event.type === 'FINALLY_ENTER')
      const unwindIndex = trace.events.findIndex((event) => event.type === 'UNWIND_EXCEPTION')
      expect(handlerIndex).toBeGreaterThan(0)
      expect(unwindIndex).toBeGreaterThan(handlerIndex)
      expect(catchIndex).toBeGreaterThan(unwindIndex)
      await expect(panel.locator('.exception-path button').filter({ hasText: /^Finally/ })).toHaveCount(1)
    }
    await panel.locator('.exception-path button').filter({ hasText: /^Catch/ }).click()
    await expect(slider).toHaveValue(String(catchIndex + 1))
    await expect(panel.locator('.error-stack')).toContainText('caught here')
    await page.getByRole('button', { name: 'Classic', exact: true }).click()
    await expect(page.locator('.classic-runtime')).toContainText('main()')
    await expect(page.locator('.classic-runtime [data-exception-state="caught"]')).toHaveCount(1)
    await page.getByRole('button', { name: 'Spatial', exact: true }).click()
    await expect(slider).toHaveValue(String(catchIndex + 1))
    await slider.fill(String(trace.events.length))
    await page.getByRole('button', { name: 'CONSOLE', exact: true }).click()
    await expect(page.locator('.ide-console-output')).toContainText('continued')
    const output = fixture === 'caught' ? 'recovered\ncontinued\n' : 'normal try\nnormal finally\nfailing try\nexceptional finally\nrecovered\ncontinued\n'
    expect(capture.stdout).toBe(output)
  })
}

test('ordered stdout/stderr reconstruct only the selected prefix and retain full process output', async ({ page, request }) => {
  const id = await importProject(request, 'ordered-output', [{ path: 'Main.java', content: 'public class Main {\n public static void main(String[] args) {\n  System.out.println("first");\n  int x = 7;\n  System.err.println("middle");\n  System.out.println("last=" + x);\n }\n}\n' }])
  await openProject(page, id)
  const { trace, slider } = await visualize(page, id)
  const consoleEvents = trace.events.flatMap((event, index) => event.type === 'CONSOLE_WRITE' ? [{ event, cursor: index + 1 }] : [])
  expect(consoleEvents.map(({ event }) => [event.channel, event.text])).toEqual([
    ['stdout', 'first\n'], ['stderr', 'middle\n'], ['stdout', 'last=7\n'],
  ])
  await page.getByRole('button', { name: 'CONSOLE', exact: true }).click()
  const output = page.locator('.ide-console-output')
  const prefixes = output.locator(':scope > pre')
  await slider.fill(String(consoleEvents[0].cursor - 1))
  await expect(prefixes).toHaveCount(0)
  await slider.fill(String(consoleEvents[0].cursor))
  await expect(prefixes).toHaveText(['first\n'])
  await slider.fill(String(consoleEvents[1].cursor))
  await expect(prefixes).toHaveText(['first\n', 'middle\n'])
  await slider.fill(String(trace.events.length))
  await expect(prefixes).toHaveText(['first\n', 'middle\n', 'last=7\n'])
  await slider.fill(String(consoleEvents[0].cursor))
  await expect(prefixes).toHaveCount(1)
  await output.getByText('Full process output · includes output without proven timing', { exact: true }).click()
  await expect(output.locator('.ide-console-terminal')).toContainText('last=7')
  await expect(output.locator('.ide-console-terminal .ide-console-full-stderr')).toContainText('middle')
  expect(seek(trace, consoleEvents[0].cursor).console.map((entry) => entry.text)).toEqual(['first\n'])
})
