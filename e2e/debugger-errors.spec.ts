import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DebugPause, SourceBreakpoint } from '../src/debugger/contracts'
import type { ExecutionSession } from '../src/execution/contracts'
import { normalizeTrace } from '../src/instrumentation/normalize'
import { seek } from '../src/runtime/seek'

test.describe.configure({ timeout: 90_000 })
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
  await page.evaluate(({ id, breakpoints }) => {
    localStorage.setItem('ggjavaez:project', id)
    localStorage.setItem(`ggjavaez:breakpoints:${id}`, JSON.stringify(breakpoints))
  }, { id, breakpoints })
  await page.reload()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Debug', exact: true })).toBeEnabled()
}

async function current(request: APIRequestContext): Promise<ExecutionSession | null> {
  const response = await request.get('/api/execution/current')
  expect(response.ok()).toBe(true)
  return response.json()
}

async function paused(page: Page, request: APIRequestContext, expected: Partial<DebugPause>, after = -1) {
  let session: ExecutionSession | null = null
  await expect.poll(async () => {
    session = await current(request)
    if (session?.projectId === ownedProjectId && session.phase === 'FAILED') throw new Error(`Debug session failed: ${session.diagnostic}\n${session.stderr}`)
    return session?.projectId === ownedProjectId && session.kind === 'debug' && session.phase === 'PAUSED' && !!session.pause && session.pause.rawEventCount > after
      && Object.entries(expected).every(([key, value]) => session!.pause![key as keyof DebugPause] === value)
  }, { timeout: 15_000, message: `Actual JVM pause ${JSON.stringify(expected)}` }).toBe(true)
  await expect(page.locator('.debug-live-state')).toContainText(`Paused · ${session!.pause!.reason}`)
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled()
  return session!
}

async function startDebug(page: Page, request: APIRequestContext) {
  const pending = page.waitForResponse((response) => /\/api\/projects\/[^/]+\/execution$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Debug', exact: true }).click()
  const response = await pending
  expect(response.ok(), await response.text()).toBe(true)
  const started = await response.json() as ExecutionSession
  expect(started.kind).toBe('debug')
  expect(started.projectId).toBe(ownedProjectId)
  const session = await paused(page, request, { reason: 'entry' })
  expect(session.id).toBe(started.id)
  await expect(page.locator('.app-shell--embedded')).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Scrub execution' })).toBeVisible()
  await expect(page.locator('.debug-paused-line')).toBeVisible()
  return session
}

async function command(page: Page, request: APIRequestContext, name: string, expected: Partial<DebugPause>, previous: ExecutionSession) {
  const returnToLive = page.getByRole('button', { name: /Return to Live/ })
  if (await returnToLive.isVisible()) await returnToLive.click()
  await page.getByRole('button', { name, exact: true }).click()
  const next = await paused(page, request, expected, previous.pause!.rawEventCount)
  expect(next.id).toBe(previous.id)
  return next
}

async function inspectDebugger(page: Page) {
  await page.locator('.debug-toolbar').getByRole('button', { name: 'Inspect', exact: true }).click()
  await expect(page.locator('.debug-panel')).toBeVisible()
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

async function runWithHistory(page: Page, request: APIRequestContext, id: string) {
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/projects/${id}/execution` && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const response = await pending
  expect(response.ok(), await response.text()).toBe(true)
  const started = await response.json() as ExecutionSession
  expect(started.kind).toBe('run')
  expect(started.projectId).toBe(id)
  await expect.poll(async () => {
    const session = await current(request)
    return session?.projectId === id ? session.phase : 'other project'
  }, { timeout: 45_000, message: 'Recorded JVM execution reaches a terminal phase' }).toMatch(/^(COMPLETED|FAILED)$/)
  const capture = (await current(request))!
  expect(capture.id).toBe(started.id)
  expect(capture.kind).toBe('run')
  expect(capture.build?.success).toBe(true)
  expect(capture.support).not.toBe('RUN_ONLY')
  expect(capture.rawEvents.length).toBeGreaterThan(0)
  expect(capture.terminalStatus).not.toBeNull()
  const { trace } = normalizeTrace(capture.rawEvents, capture.sourceManifest, {
    status: capture.terminalStatus!, exitCode: capture.exitCode, diagnostic: capture.diagnostic,
    ...(capture.capability ? { capability: capture.capability } : {}),
  })
  await expect(page.locator('.app-shell--embedded')).toBeVisible()
  const slider = page.getByRole('slider', { name: 'Scrub execution' })
  await expect(slider).toHaveAttribute('max', String(trace.events.length))
  await slider.fill(String(trace.events.length))
  return { capture, trace, slider }
}

test.afterEach(async ({ request }) => {
  const session = await current(request)
  if (session && session.projectId === ownedProjectId && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(session.phase)) {
    const response = await request.post(`/api/execution/${session.id}/stop`, { data: {} })
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
  await page.getByRole('treeitem', { name: 'J Person.java', exact: true }).click()
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('class Person')
  await gutter(page, 3)
  await startDebug(page, request)
  await inspectDebugger(page)
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
  await inspectDebugger(page)
  session = await command(page, request, 'Continue', { reason: 'breakpoint', className: 'Main', line: 5 }, session)
  await expect(page.locator('.debug-panel .debug-value').filter({ hasText: 'requestedAge' })).toContainText('18')
  const picker = page.getByRole('combobox', { name: 'Select runtime entity' })
  const person = picker.locator('option').filter({ hasText: /^Person #/ }).first()
  const personId = await person.getAttribute('value')
  expect(personId).toBeTruthy()
  await picker.selectOption(personId!)
  await expect(page.getByRole('complementary', { name: 'Runtime inspector' })).toContainText('12')
  session = await command(page, request, 'Into', { className: 'Worker', methodName: 'update', line: 3 }, session)
  await expect(page.locator('.ide-tab.is-active')).toContainText('Worker.java')
  await expect(page.locator('.debug-paused-line')).toBeVisible()
  await expect(page.locator('.debug-panel')).toContainText('Worker.update()')
  session = await command(page, request, 'Into', { className: 'Person', methodName: 'setAge', line: 9 }, session)
  await expect(page.locator('.ide-tab.is-active')).toContainText('Person.java')
  await expect(page.locator('.debug-panel .debug-value').filter({ hasText: 'this' })).toHaveCount(1)
  await expect(page.locator('.debug-panel .debug-value').filter({ hasText: /^age/ })).toContainText('18')
  session = await command(page, request, 'Out', { className: 'Worker', methodName: 'update', line: 4 }, session)
  await expect(page.locator('.ide-tab.is-active')).toContainText('Worker.java')
  session = await command(page, request, 'Over', { className: 'Worker', methodName: 'update', line: 5 }, session)
  await expect(page.locator('.debug-panel .debug-value').filter({ hasText: /^ages/ })).toContainText('→')
  const arrayId = await picker.locator('option').filter({ hasText: /^int\[\] #/ }).first().getAttribute('value')
  expect(arrayId).toBeTruthy()
  await picker.selectOption(arrayId!)
  await expect(page.getByRole('complementary', { name: 'Runtime inspector' })).toContainText('Indexed elements')
  await expect(page.getByRole('complementary', { name: 'Runtime inspector' }).locator('.inspector-row')).toHaveCount(2)
  session = await command(page, request, 'Into', { className: 'Worker', methodName: 'read', line: 10 }, session)
  await expect(page.locator('.debug-panel .debug-value').filter({ hasText: /^index/ })).toContainText('0')
  session = await command(page, request, 'Out', { className: 'Worker', methodName: 'update', line: 6 }, session)
  session = await command(page, request, 'Out', { className: 'Main', methodName: 'main', line: 6 }, session)
  await expect(page.locator('.ide-tab.is-active')).toContainText('Main.java')
  await expect(page.locator('.debug-panel .debug-value').filter({ hasText: /^result/ })).toContainText('18')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect.poll(async () => (await current(request))!.phase).toBe('COMPLETED')
  await expect(page.locator('.ide-execution-status')).toContainText('COMPLETED')
  const final = await current(request)
  expect(final!.exitCode).toBe(0)
  expect(final!.stdout.trim()).toBe('18')
  const personObservations = final!.rawEvents.filter((event) => event.type === 'object' && event.className === 'Person')
  expect(personObservations.filter((event) => !event.resnapshot)).toHaveLength(1)
  expect(new Set(personObservations.map((event) => event.objectId)).size).toBe(1)
  const replay = normalizeTrace(final!.rawEvents, final!.sourceManifest, {
    status: final!.terminalStatus!, exitCode: final!.exitCode, diagnostic: final!.diagnostic,
  }).trace
  expect(replay.events.filter((event) => event.type === 'ALLOCATE_OBJECT' && event.className === 'Person')).toHaveLength(1)
  const personState = Object.values(seek(replay, replay.events.length).objects).find((object) => object.className === 'Person')!
  expect(Object.values(personState.fields).find((slot) => slot.name === 'age')!.value).toEqual({ kind: 'primitive', javaType: 'int', value: 18 })
})

test('Pause suspends real execution at a project boundary and topbar Stop reaps it', async ({ page, request }) => {
  const id = await importProject(request, 'pause', [{ path: 'Main.java', content: 'public class Main {\n public static void main(String[] args) throws Exception {\n  int i = 0;\n  while (i < 100) {\n   i++;\n   Thread.sleep(25);\n  }\n  System.out.println(i);\n }\n}\n' }])
  await openProject(page, id)
  const initial = await startDebug(page, request)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const session = await paused(page, request, { reason: 'pause' }, initial.pause!.rawEventCount)
  const count = session.rawEvents.length
  const later = await request.get(`/api/execution/${session.id}`)
  expect(later.ok()).toBe(true)
  expect((await later.json()).rawEvents).toHaveLength(count)
  await expect(page.locator('.debug-paused-line')).toBeVisible()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('.ide-execution-status')).toContainText('STOPPED')
  expect((await current(request))!.phase).toBe('STOPPED')
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
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
  await page.getByRole('button', { name: /Return to Live/ }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect.poll(async () => (await current(request))!.terminalStatus).toBe('program_crashed')
  await panel.getByText('Actual JVM stderr / stack trace', { exact: true }).click()
  await expect(panel.locator('.error-summary pre')).toContainText('Main.main(Main.java:4)')
  await expect(panel).toBeVisible()
})

test('nested propagation seeks real unwind states in Classic and Spatial', async ({ page, request }) => {
  const id = await importProject(request, 'nested')
  await openProject(page, id)
  const { trace } = await runWithHistory(page, request, id)
  await page.getByRole('button', { name: 'ERROR EXPLORER', exact: true }).click()
  const panel = page.locator('.error-explorer')
  const stack = panel.locator('.error-stack details summary button')
  await expect(stack).toHaveText(['Main.b()', 'Main.a()', 'Main.main()'])
  await expect(panel.locator('.exception-path button')).toHaveCount(4)
  expect(trace.events.filter((event) => event.type === 'UNWIND_EXCEPTION')).toHaveLength(3)
  await panel.getByRole('button', { name: 'Return to failure', exact: true }).click()
  const slider = page.getByRole('slider', { name: 'Scrub execution' })
  const throwIndex = trace.events.findIndex((event) => event.type === 'THROW_EXCEPTION')
  const throwEvent = trace.events[throwIndex]
  expect(throwEvent.type).toBe('THROW_EXCEPTION')
  if (throwEvent.type !== 'THROW_EXCEPTION') throw new Error('Missing actual throw')
  expect(trace.events[throwIndex + 1]).toMatchObject({ type: 'EXECUTION_FACT', fact: {
    kind: 'throw', exceptionId: throwEvent.exceptionId, invocationId: throwEvent.frameId,
  } })
  const crash = String(throwIndex + 2)
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
    const { capture, trace } = await runWithHistory(page, request, id)
    expect(capture.phase).toBe('FAILED')
    expect(capture.terminalStatus).toBe('program_crashed')
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
    const { capture, trace, slider } = await runWithHistory(page, request, id)
    expect(capture.phase).toBe('COMPLETED')
    expect(capture.terminalStatus).toBe('complete')
    await page.getByRole('button', { name: 'ERROR EXPLORER', exact: true }).click()
    const panel = page.locator('.error-explorer')
    await expect(panel.locator('.debug-eyebrow')).toContainText('CAUGHT')
    await expect(panel.locator('.exception-path button').filter({ hasText: /^Catch/ })).toHaveCount(1)
    const catchIndex = trace.events.findIndex((event) => event.type === 'CATCH_EXCEPTION')
    const catchEvent = trace.events[catchIndex]
    expect(catchEvent.type).toBe('CATCH_EXCEPTION')
    if (catchEvent.type !== 'CATCH_EXCEPTION') throw new Error('Missing actual catch')
    expect(trace.events[catchIndex + 1]).toMatchObject({ type: 'EXECUTION_FACT', fact: {
      kind: 'catch', exceptionId: catchEvent.exceptionId, invocationId: catchEvent.frameId,
    } })
    const catchCursor = String(catchIndex + 2)
    if (fixture === 'finally') {
      const handlerIndex = trace.events.findIndex((event) => event.type === 'FINALLY_ENTER')
      const unwindIndex = trace.events.findIndex((event) => event.type === 'UNWIND_EXCEPTION')
      expect(handlerIndex).toBeGreaterThan(0)
      expect(unwindIndex).toBeGreaterThan(handlerIndex)
      expect(catchIndex).toBeGreaterThan(unwindIndex)
      await expect(panel.locator('.exception-path button').filter({ hasText: /^Finally/ })).toHaveCount(1)
    }
    await panel.locator('.exception-path button').filter({ hasText: /^Catch/ }).click()
    await expect(slider).toHaveValue(catchCursor)
    await expect(panel.locator('.error-stack')).toContainText('caught here')
    await page.getByRole('button', { name: 'Classic', exact: true }).click()
    await expect(page.locator('.classic-runtime')).toContainText('main()')
    await expect(page.locator('.classic-runtime [data-exception-state="caught"]')).toHaveCount(1)
    await page.getByRole('button', { name: 'Spatial', exact: true }).click()
    await expect(slider).toHaveValue(catchCursor)
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
  const { trace, slider } = await runWithHistory(page, request, id)
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
  await output.getByText('Full process output', { exact: true }).click()
  await expect(output.locator('.ide-console-terminal')).toContainText('last=7')
  await expect(output.locator('.ide-console-terminal .ide-console-full-stderr')).toContainText('middle')
  expect(seek(trace, consoleEvents[0].cursor).console.map((entry) => entry.text)).toEqual(['first\n'])
})
