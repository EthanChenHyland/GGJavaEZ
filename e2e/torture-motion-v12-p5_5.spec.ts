import { expect, test } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { normalizeTrace } from '../src/instrumentation/normalize'
import { browserErrors, currentSession, focusSelection, follow, home, ready, seekCursor, selectEntity } from './reference/harness'

const output = process.env.VJ_QA_OUTPUT_ROOT ?? '.ggjavaez/qa/v12-p5_5/motion'
test.use({ video: { mode: 'on', size: { width: 1440, height: 900 } } })

test('accepted fresh Java history: allocation, constructor, mutation, recursion, output, exploration and completion motion', async ({ page, request }) => {
  test.skip(process.env.VJ_PHASE5_5_MOTION !== '1', 'Opt-in native video review of the fresh torture fixture and its retained history')
  test.setTimeout(120000)
  const content = await readFile('fixtures/torture-v12-p5_5/06-small-debug/DebugShape.java', 'utf8')
  const imported = await request.post('/api/projects/import', {
    data: { name: 'Torture history motion', files: [{ path: 'DebugShape.java', content }] },
  })
  expect(imported.ok()).toBe(true)
  const { id } = await imported.json() as { id: string }
  const errors = browserErrors(page)
  try {
    await page.addInitScript(id => localStorage.setItem('ggjavaez:project', id), id)
    await page.goto('/?qa=1')
    await expect(page.getByRole('button', { name: 'Project menu', exact: true })).toHaveAttribute('data-project-id', id)
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect.poll(async () => {
      const current = await currentSession(request)
      return current?.projectId === id ? current.phase : null
    }, { timeout: 45000 }).toBe('COMPLETED')
    const session = (await currentSession(request))!
    const endpoint = `/api/execution/${session.id}`
    const retained = await request.get(`${endpoint}?transport=delta`)
    expect(retained.ok()).toBe(true)
    expect(await retained.json()).toMatchObject({ id: session.id, phase: 'COMPLETED' })
    expect(session.stdout).toBe('DEBUG_SHAPE 18 true\n')
    expect(session.recording?.state).toBe('FULL')
    expect(session.build?.success).toBe(true)
    const trace = normalizeTrace(session.rawEvents, session.sourceManifest, {
      status: session.terminalStatus!, exitCode: session.exitCode, diagnostic: session.diagnostic, recording: session.recording,
    }).trace
    await expect.poll(() => page.evaluate(() => window.__ggjavaezWorld?.scene().recordingId)).toBe(`execution:${session.id}`)
    const slider = page.getByRole('slider', { name: 'Recorded execution position', exact: true })
    await expect(slider).toHaveAttribute('aria-valuemax', String(trace.events.length), { timeout: 60000 })
    const points = [
      { label: 'allocation', index: trace.events.findIndex(event => event.type === 'ALLOCATE_OBJECT' && event.className.endsWith('$Cell')) },
      { label: 'constructor', index: trace.events.findIndex(event => event.type === 'CREATE_REFERENCE' && event.sourceSlot.kind === 'frame' && event.sourceSlot.slotId.endsWith(':this')) },
      { label: 'deep-recursion', index: trace.events.filter(event => event.type === 'ENTER_METHOD' && event.methodName === 'descend').at(-1)?.seq ?? -1 },
      { label: 'mutation', index: trace.events.findIndex(event => event.type === 'SET_FIELD' && event.value.kind === 'primitive' && event.value.value === 18) },
      { label: 'return', index: trace.events.filter(event => event.type === 'RETURN_VALUE').at(-1)?.seq ?? -1 },
      { label: 'stdout', index: trace.events.findIndex(event => event.type === 'EXECUTION_FACT' && event.fact.kind === 'io' && event.fact.channel === 'stdout') },
      { label: 'complete', index: trace.events.length - 1 },
    ]
    // Constructor storage identity belongs to the recorder and may use a different slot encoding.
    if (points[1].index < 0) points[1].index = trace.events.findIndex(event => event.type === 'ENTER_METHOD' && event.methodName === '<init>')
    for (const point of points) expect(point.index, point.label).toBeGreaterThanOrEqual(0)
    await mkdir(output, { recursive: true })
    const samples = []
    const inspector = page.getByRole('complementary', { name: 'Selection inspector', exact: true })
    for (const point of points) {
      await seekCursor(page, point.index + 1)
      await home(page)
      await page.waitForTimeout(650)
      const event = trace.events[point.index]
      const entity = event.type === 'ALLOCATE_OBJECT' || event.type === 'SET_FIELD' ? event.objectId
        : event.type === 'ENTER_METHOD' || event.type === 'RETURN_VALUE' ? event.frameId : undefined
      if (entity) {
        await selectEntity(page, entity)
        await focusSelection(page)
        await expect.poll(() => page.evaluate(() => window.__ggjavaezQA!.focusTarget()?.targetId)).toBe(entity)
        await page.waitForTimeout(650)
      }
      await page.screenshot({ path: `${output}/${point.label}-1440x900.png` })
      samples.push({ label: point.label, cursor: point.index + 1, eventId: event.eventId, source: event.source, entity })
      if (entity) {
        await inspector.getByRole('button', { name: 'Return to World', exact: true }).click()
        await inspector.getByRole('button', { name: 'Close inspector', exact: true }).click()
        await ready(page)
      }
    }
    await seekCursor(page, 1)
    await page.getByLabel('Playback speed', { exact: true }).filter({ visible: true }).selectOption('4')
    await follow(page)
    const cameraMode = () => page.evaluate(async () => {
      const path = '/src/camera/cameraStore.ts'
      const shared = await import(path) as typeof import('../src/camera/cameraStore')
      const state = shared.useCameraStore.getState()
      return { mode: state.mode, follow: state.follow }
    })
    expect((await cameraMode()).follow).toBe(true)
    await page.getByRole('button', { name: 'Play recorded execution', exact: true }).click()
    const safe = await page.evaluate(() => window.__ggjavaezQA!.shellRects().safeFrame)
    const x = safe.x + safe.width * .35, y = safe.y + safe.height * .45
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 80, y + 20, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => (await cameraMode()).follow).toBe(false)
    const pause = page.getByRole('button', { name: 'Pause playback', exact: true })
    await expect(pause).toBeVisible()
    await page.waitForTimeout(1200)
    await expect.poll(async () => Number(await slider.getAttribute('aria-valuenow'))).toBeGreaterThan(1)
    await pause.click()
    await page.getByRole('button', { name: 'Return to Live', exact: true }).click()
    await expect(slider).toHaveAttribute('aria-valuenow', String(trace.events.length))
    expect((await currentSession(request))?.id).toBe(session.id)
    expect(await (await request.get(endpoint)).json()).toMatchObject({ id: session.id, phase: 'COMPLETED' })
    expect(errors).toEqual([])
    await writeFile(`${output}/motion-proof.json`, JSON.stringify({
      sessionId: session.id, rawEvents: session.rawEvents.length, normalizedEvents: trace.events.length,
      method: 'One actual completed JVM trace. Native timeline, selection, camera and replay controls; no JVM restart during history.',
      samples, errors,
    }, null, 2) + '\n')
    const video = page.video()!
    await page.close()
    await video.saveAs(`${output}/fresh-history.webm`)
  } finally {
    const session = await currentSession(request)
    if (session?.projectId === id && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(session.phase)) {
      expect((await request.post(`/api/execution/${session.id}/stop`, { data: {} })).ok()).toBe(true)
    }
  }
})
