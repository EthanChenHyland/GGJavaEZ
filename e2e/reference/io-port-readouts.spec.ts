import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { SceneIo } from '../../src/contracts/world'
import type { ExecutionSession } from '../../src/execution/contracts'
import { normalizeTrace } from '../../src/instrumentation/normalize'
import { fitWorldText } from '../../src/render/text/textSystem'
import { browserErrors, currentSession, focusSelection, home, ready, seekCursor, selectEntity, startFixture, stopOwnedSession } from './harness'

const ownedProjects = new Set<string>()
test.describe.configure({ timeout: 120000 })
test.afterEach(async ({ request }) => {
  const session = await currentSession(request)
  if (session && ownedProjects.has(session.projectId) && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(session.phase)) {
    expect((await request.post(`/api/execution/${session.id}/stop`, { data: {} })).ok()).toBe(true)
  }
  await stopOwnedSession(request)
})

async function finished(page: Page, request: APIRequestContext, started: ExecutionSession, stdout: string, stderr: string) {
  await expect.poll(async () => {
    const session = await currentSession(request)
    return session?.id === started.id ? session.phase : null
  }, { timeout: 45000 }).toBe('COMPLETED')
  const session = (await currentSession(request))!
  expect(session.id).toBe(started.id)
  expect(session.build?.success).toBe(true)
  expect(session.exitCode).toBe(0)
  expect(session.terminalStatus).toBe('complete')
  expect(session.recording?.state).toBe('FULL')
  expect(session.rawEvents.length).toBeGreaterThan(0)
  expect(session.sourceManifest.sources.length).toBeGreaterThan(0)
  expect(session.stdout).toBe(stdout)
  expect(session.stderr).toBe(stderr)
  const normalized = normalizeTrace(session.rawEvents, session.sourceManifest, {
    status: session.terminalStatus!, exitCode: session.exitCode, diagnostic: session.diagnostic,
    ...(session.recording ? { recording: session.recording } : {}),
    ...(session.capability ? { capability: session.capability } : {}),
  }, `execution:${session.id}`).trace.events.length
  await expect.poll(() => page.evaluate(() => window.__ggjavaezWorld?.scene().recordingId)).toBe(`execution:${session.id}`)
  await expect(page.getByRole('slider', { name: 'Recorded execution position', exact: true })).toHaveAttribute('aria-valuemax', String(normalized), { timeout: 45000 })
  await seekCursor(page, normalized)
  await home(page)
  return session
}

async function expectPort(page: Page, channel: SceneIo['id'], expected: { lines: number; preview: string; consumedText?: string | null; display: string }) {
  await ready(page)
  const observed = await page.evaluate(channel => {
    const world = window.__ggjavaezWorld!
    return { io: world.scene().io.find(io => io.id === channel), labels: world.ioText().filter(label => label.channel === channel) }
  }, channel)
  expect(observed.io).toMatchObject({ id: channel, lines: expected.lines, preview: expected.preview,
    ...(expected.consumedText !== undefined ? { consumedText: expected.consumedText } : {}) })
  // One physical glyph member must contain both rows; metadata in a hidden DOM
  // readout or independently completed count/preview members cannot satisfy it.
  expect(observed.labels).toHaveLength(1)
  const label = observed.labels[0], io = observed.io!
  const glyph = channel === 'stderr' ? '⚠' : channel === 'stdout' ? '→' : '←'
  const fitted = fitWorldText(`${glyph} ${expected.display}`, io.anchor.size[0] - .24, .32, 500, 0, Infinity, 'end')
  expect(label.text).toBe(`${expected.lines}\n${fitted}`)
  expect(label.opacity).toBeGreaterThan(0)
  expect(label.fontPixels).toBeGreaterThanOrEqual(11)
  expect(label.bounds).not.toBeNull()
  expect(label.bounds!.width).toBeGreaterThan(0)
  expect(label.bounds!.height).toBeGreaterThan(0)
  return observed
}

async function worldState(page: Page) {
  return page.evaluate(() => {
    const qa = window.__ggjavaezQA!, scene = window.__ggjavaezWorld!.scene()
    return { recordingId: scene.recordingId, cursor: scene.cursor, selection: qa.selection(), focus: qa.focusTarget(), pose: qa.cameraPose(), overlays: qa.appState().overlays }
  })
}

async function keyboardPreview(page: Page, channel: SceneIo['id'], expected: { lines: number; captured: string; truncated: boolean; available?: boolean }) {
  await ready(page)
  const before = await worldState(page)
  const opener = page.getByRole('group', { name: 'Recorded I/O endpoints', exact: true }).getByRole('button', { name: `Inspect recorded ${channel}`, exact: true })
  await opener.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: `${channel} captured preview`, exact: true })
  await expect(dialog).toBeVisible()
  const details = dialog.locator('[data-io-preview="true"]'), available = expected.available ?? true
  await expect(details).toHaveAttribute('data-recording-id', before.recordingId)
  await expect(details).toHaveAttribute('data-cursor', String(before.cursor))
  await expect(details).toHaveAttribute('data-channel', channel)
  await expect(details).toHaveAttribute('data-source-truncated', String(expected.truncated))
  await expect(details).toHaveAttribute('data-preview-available', String(available))
  await expect(details).toContainText(`Cursor ${before.cursor} · ${expected.lines} recorded ${expected.lines === 1 ? 'line' : 'lines'}`)
  const content = dialog.getByLabel(`${channel} raw captured prefix`, { exact: true })
  expect(await content.textContent()).toBe(expected.captured + (expected.truncated ? '…' : ''))
  // A source-derived ellipsis is presentation, never part of the raw prefix.
  expect(await content.evaluate(node => Array.from(node.childNodes).filter(child => child.nodeType === Node.TEXT_NODE).map(child => child.textContent).join(''))).toBe(expected.captured)
  await expect(content.locator('[data-derived-ellipsis="true"]')).toHaveCount(expected.truncated ? 1 : 0)
  const copy = dialog.getByRole('button', { name: 'Copy captured prefix', exact: true })
  if (available) await expect(copy).toBeEnabled()
  else {
    await expect(copy).toBeDisabled()
    await expect(details).toContainText('No recorded stdin consumption at this Cursor.')
  }
  await expect(content).toBeFocused()
  // Exercise the existing modal keyboard trap and restoration rather than a
  // pointer close, which could accidentally hide an Escape-to-World regression.
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Open Console', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
  await ready(page)
  expect(await worldState(page)).toEqual(before)
}

test('real Java stdout/stderr ports retain exact counts, bounded previews and keyboard World Focus through reverse seeks', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = browserErrors(page), sixty = '0123456789'.repeat(6)
  const stdoutChunks = ['A', 'B', '\r', '\n' + sixty, 'overflow', '\r', '\nlast']
  const stderrChunks = ['E', 'R', '\r\n' + sixty + 'tail']
  const content = ['public class Main {', '  public static void main(String[] args) {',
    ...stdoutChunks.map(text => `    System.out.print(${JSON.stringify(text)});`),
    ...stderrChunks.map(text => `    System.err.print(${JSON.stringify(text)});`), '  }', '}', ''].join('\n')
  const imported = await request.post('/api/projects/import', { data: { name: `IO port readouts ${randomUUID()}`, files: [{ path: 'Main.java', content }] } })
  expect(imported.ok(), await imported.text()).toBe(true)
  const { id } = await imported.json() as { id: string }
  ownedProjects.add(id)
  await page.addInitScript(id => localStorage.setItem('ggjavaez:project', id), id)
  await page.goto('/?qa=1')
  await page.waitForFunction(() => typeof window.__ggjavaezQA?.ready === 'function')
  await expect(page.getByRole('button', { name: 'Project menu', exact: true })).toHaveAttribute('data-project-id', id)
  const run = page.getByRole('button', { name: 'Run', exact: true })
  await expect(run).toBeEnabled()
  const starting = page.waitForResponse(response => new URL(response.url()).pathname === `/api/projects/${id}/execution` && response.request().method() === 'POST')
  await run.click()
  const response = await starting
  expect(response.ok()).toBe(true)
  const session = await finished(page, request, await response.json() as ExecutionSession, stdoutChunks.join(''), stderrChunks.join(''))
  const outputs = await page.evaluate(() => window.__ggjavaezWorld!.recordedEvents().flatMap(event =>
    event.type === 'EXECUTION_FACT' && event.fact.kind === 'io' && event.fact.channel !== 'stdin'
      ? [{ cursor: event.seq + 1, channel: event.fact.channel, text: event.fact.text }] : []))
  // Recorder call boundaries, not stdout/stderr pipe delivery order, define
  // the cuts. No cross-channel ordering is inferred from terminal buffering.
  const out = outputs.filter(event => event.channel === 'stdout'), err = outputs.filter(event => event.channel === 'stderr')
  expect(out.map(event => event.text)).toEqual(stdoutChunks)
  expect(err.map(event => event.text)).toEqual(stderrChunks)
  const expectedOut = [
    { lines: 1, preview: 'A' }, { lines: 1, preview: 'AB' }, { lines: 1, preview: 'AB' },
    { lines: 2, preview: sixty }, { lines: 2, preview: sixty + '…' },
    { lines: 2, preview: sixty + '…' }, { lines: 3, preview: 'last' },
  ]
  const expectedErr = [{ lines: 1, preview: 'E' }, { lines: 1, preview: 'ER' }, { lines: 2, preview: sixty + '…' }]
  let outAnchor: SceneIo['anchor'] | undefined, errAnchor: SceneIo['anchor'] | undefined
  for (const index of [0, 1, 3, 4, 5, 6, 1, 4]) {
    await seekCursor(page, out[index].cursor)
    const observed = await expectPort(page, 'stdout', { ...expectedOut[index], display: expectedOut[index].preview })
    outAnchor ??= observed.io!.anchor
    expect(observed.io!.anchor).toEqual(outAnchor)
  }
  for (const index of [0, 1, 2, 0, 2]) {
    await seekCursor(page, err[index].cursor)
    const observed = await expectPort(page, 'stderr', { ...expectedErr[index], display: expectedErr[index].preview })
    errAnchor ??= observed.io!.anchor
    expect(observed.io!.anchor).toEqual(errAnchor)
  }
  await seekCursor(page, out[3].cursor)
  await keyboardPreview(page, 'stdout', { lines: 2, captured: sixty, truncated: false })
  await seekCursor(page, out[4].cursor)
  const frameId = await page.evaluate(() => {
    const scene = window.__ggjavaezWorld!.scene()
    return scene.order.frames.find(id => scene.entities[id].kind === 'frame' && scene.entities[id].live)
  })
  expect(frameId, 'An actual live project frame is available for World Focus').toBeTruthy()
  await selectEntity(page, frameId!)
  await focusSelection(page)
  expect((await worldState(page)).overlays).toContain('FOCUS')
  expect((await worldState(page)).focus).not.toBeNull()
  await keyboardPreview(page, 'stdout', { lines: 2, captured: sixty, truncated: true })
  await seekCursor(page, err[2].cursor)
  await keyboardPreview(page, 'stderr', { lines: 2, captured: sixty, truncated: true })
  await seekCursor(page, 0)
  expect(await page.evaluate(() => window.__ggjavaezWorld!.scene().io)).toEqual([])
  expect(await page.evaluate(() => window.__ggjavaezWorld!.ioText())).toEqual([])
  await expect(page.getByRole('group', { name: 'Recorded I/O endpoints', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
  await test.info().attach('io-port-readout-cuts', { body: JSON.stringify({ sessionId: session.id, realJvm: true, stdout: session.stdout, stderr: session.stderr, outputs }), contentType: 'application/json' })
})

test('real Scanner input exposes only its current consumed lexeme and clears on forward/reverse cursors', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors = browserErrors(page), unconsumed = 'UNCONSUMED TEXT'
  const started = await startFixture(page, request, 'io')
  await expect.poll(async () => {
    const session = await currentSession(request)
    return session?.id === started.id ? session.phase : null
  }, { timeout: 15000 }).toBe('WAITING_FOR_INPUT')
  // The existing fixture calls nextInt once. Extra submitted bytes, including
  // any Scanner read-ahead, must never become a second consumption or preview.
  const submitted = `007\n${unconsumed}\n`
  expect((await request.post(`/api/execution/${started.id}/input`, { data: { text: submitted } })).ok()).toBe(true)
  const session = await finished(page, request, started, 'READY\nOUT 7\n', 'CHECK 7\n')
  const input = await page.evaluate(() => {
    const events = window.__ggjavaezWorld!.recordedEvents()
    return {
      head: events.length,
      consumes: events.flatMap(event => event.type === 'EXECUTION_FACT' && event.fact.kind === 'call-return' && event.fact.inputText !== undefined
        ? [{ cursor: event.seq + 1, text: event.fact.inputText }] : []),
      readAhead: events.flatMap(event => event.type === 'EXECUTION_FACT' && event.fact.kind === 'io' && event.fact.channel === 'stdin'
        ? [{ cursor: event.seq + 1, text: event.fact.text }] : []),
    }
  })
  expect(input.consumes).toHaveLength(1)
  const consumed = input.consumes[0]
  expect(consumed.text).toBe('007') // Exact matched text, not the numeric value 7.
  expect(consumed.cursor + 1).toBeLessThanOrEqual(input.head)
  await seekCursor(page, consumed.cursor - 1)
  expect(await page.evaluate(() => window.__ggjavaezWorld!.scene().io.some(io => io.id === 'stdin'))).toBe(false)
  expect(await page.evaluate(() => window.__ggjavaezWorld!.ioText().some(label => label.channel === 'stdin'))).toBe(false)
  await expect(page.getByRole('button', { name: 'Inspect recorded stdin', exact: true })).toHaveCount(0)
  await seekCursor(page, consumed.cursor)
  await expectPort(page, 'stdin', { lines: 1, preview: '007', consumedText: '007', display: '007' })
  await keyboardPreview(page, 'stdin', { lines: 1, captured: '007', truncated: false })
  await seekCursor(page, consumed.cursor + 1)
  // The historical summary still has "007"; current-edge availability must
  // nevertheless clear, rather than falling back to that retained summary.
  await expectPort(page, 'stdin', { lines: 1, preview: '007', consumedText: null, display: '—' })
  await keyboardPreview(page, 'stdin', { lines: 1, captured: '', truncated: false, available: false })
  await seekCursor(page, input.head)
  await expectPort(page, 'stdin', { lines: 1, preview: '007', consumedText: null, display: '—' })
  await expectPort(page, 'stdout', { lines: 2, preview: 'OUT 7', display: 'OUT 7' })
  await expectPort(page, 'stderr', { lines: 1, preview: 'CHECK 7', display: 'CHECK 7' })
  const finalIo = await page.evaluate(() => window.__ggjavaezWorld!.scene().io.map(({ id, lines, preview, consumedText }) => ({ id, lines, preview, consumedText })))
  expect(JSON.stringify(finalIo)).not.toContain(unconsumed)
  await seekCursor(page, consumed.cursor)
  await expectPort(page, 'stdin', { lines: 1, preview: '007', consumedText: '007', display: '007' })
  await seekCursor(page, consumed.cursor - 1)
  expect(await page.evaluate(() => window.__ggjavaezWorld!.scene().io.some(io => io.id === 'stdin'))).toBe(false)
  expect(errors).toEqual([])
  await test.info().attach('stdin-port-consumption-cuts', { body: JSON.stringify({ sessionId: session.id, realJvm: true, submitted, ...input, finalIo }), contentType: 'application/json' })
})
