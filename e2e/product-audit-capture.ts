import { measureSpatialWorld, selectGraphNode } from './spatial-performance'
import { expect, type Page, type APIRequestContext } from '@playwright/test'
import type { ExecutionSession } from '../src/execution/contracts'
import { normalizeTrace } from '../src/instrumentation/normalize'
import { home, ready, seekCursor } from './reference/harness'
import { clearTortureSelection, pickTortureEntity } from './reference/tortureNavigation'
import { mkdir, writeFile } from 'node:fs/promises'
const outputRoot = process.env.VJ_QA_OUTPUT_ROOT ? `${process.env.VJ_QA_OUTPUT_ROOT}/product-audit-v11_5` : 'docs/checkpoints/product-audit-v11_5'

export async function inspectRetainedWorld(page: Page, request: APIRequestContext) {
  const current = await (await request.get('/api/execution/current')).json() as ExecutionSession
  expect(current.phase).toBe('COMPLETED')
  const started = Date.now()
  await page.addInitScript(id => localStorage.setItem('ggjavaez:project', id), current.projectId)
  await page.goto('/?qa=1')
  await page.waitForFunction(() => typeof window.__ggjavaezQA?.ready === 'function')
  await expect.poll(() => page.evaluate(() => window.__ggjavaezWorld?.scene().recordingId), { timeout: 60000 }).toBe(`execution:${current.id}`)
  const slider = page.getByRole('slider', { name: 'Recorded execution position', exact: true })
  const { trace } = normalizeTrace(current.rawEvents, current.sourceManifest, { status: current.terminalStatus ?? 'live', exitCode: current.exitCode, diagnostic: current.diagnostic, recording: current.recording })
  const max = trace.events.length
  await expect(slider).toHaveAttribute('aria-valuemax', String(max), { timeout: 60000 })
  await seekCursor(page, max)
  const inspector = page.getByRole('complementary', { name: 'Selection inspector', exact: true })
  const partial = current.recording && current.recording.state !== 'FULL'
  expect(current.exitCode).toBe(0)
  const main = await page.evaluate(() => {
    const world = window.__ggjavaezWorld!, event = world.recordedEvents().find(e => e.type === 'ENTER_METHOD' && e.methodName === 'main')
    return event?.type === 'ENTER_METHOD' ? world.scene().entities[event.frameId] : null
  })
  expect(main?.kind).toBe('frame')
  if (partial) await expect(page.locator('.gg-time-partial')).toBeVisible()
  else expect(main).toMatchObject({ live: false })
  const loadMs = Date.now() - started
  console.log('retained-load-ms', loadMs)
  await home(page)
  await mkdir(outputRoot, { recursive: true })
  for (const [width, height] of [[1728,1117], [1440,900], [1280,800], [760,900]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(700)
    await page.screenshot({ path: `${outputRoot}/graph-polished-${width}x${height}.png` })
  }
  await page.setViewportSize({ width:1440, height:900 })
  const timings: { cursor:number; uiCommitAndTwoFramesMs:number }[] = []
  for (const cursor of [Math.floor(max / 2), Math.floor(max / 3), max]) {
    const start = Date.now()
    await slider.fill(String(cursor))
    await expect(slider).toHaveAttribute('aria-valuenow', String(cursor))
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    timings.push({ cursor, uiCommitAndTwoFramesMs:Date.now() - start })
  }
  await writeFile(`${outputRoot}/large-world-measurements.json`, JSON.stringify({ sessionId:current.id, loadMs, normalizedEvents:max, rawEvents:current.rawEvents.length, recording:current.recording, timings, metric:'UI commit plus two browser animation frames; not GPU presentation or percentile statistics' }, null, 2))
  if (process.env.VJ_QA_OUTPUT_ROOT?.includes('v12-p5')) await measureSpatialWorld(page,outputRoot,loadMs,max,current.id)
  const selected = await selectGraphNode(page)
  await inspector.getByRole('button', { name: 'Focus selection', exact: true }).click()
  await seekCursor(page, max)
  await ready(page)
  expect(await page.evaluate(() => window.__ggjavaezQA!.focusTarget()?.targetId)).toBe(selected)
  for (const [width, height] of [[1440,900], [760,900]]) {
    await page.setViewportSize({ width,height }); await page.waitForTimeout(700)
    await page.screenshot({ path:`${outputRoot}/graph-focus-${width}x${height}.png` })
  }
  await inspector.getByRole('button', { name: 'Return to World', exact: true }).click()
  await ready(page)
  expect(await page.evaluate(() => window.__ggjavaezQA!.focusTarget())).toBeNull()
  const archived = await page.evaluate(() => {
    const world = window.__ggjavaezWorld!, scene = world.scene()
    const frames = Object.values(scene.entities).filter(node => node.kind === 'frame' && node.status.kind === 'returned')
    const frame = frames.filter(item => item.title.includes('.recursiveSum(')).at(-1) ?? frames.at(-1)
    if (!frame) throw new Error('The recording contains no completed invocation')
    const entry = world.recordedEvents().findIndex(event => event.type === 'ENTER_METHOD' && event.frameId === frame.id)
    if (entry < 0) throw new Error(`Missing recorded entry for ${frame.id}`)
    return { id: frame.id, cursor: entry + 1 }
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await clearTortureSelection(page)
  await seekCursor(page, archived.cursor)
  await home(page)
  await pickTortureEntity(page, archived.id)
  await inspector.getByRole('button', { name: 'Focus selection', exact: true }).click()
  await seekCursor(page, max)
  await ready(page)
  for (const [width,height] of [[1728,1117],[1440,900],[1280,800],[760,900]]) {
    await page.setViewportSize({ width,height }); await page.waitForTimeout(700)
    await page.screenshot({ path:`${outputRoot}/graph-deep-focus-${width}x${height}.png` })
  }
  expect(await page.evaluate(() => window.__ggjavaezQA!.selection()?.id)).toBe(archived.id)
  expect(await page.evaluate(() => window.__ggjavaezQA!.focusTarget()?.targetId)).toBe(archived.id)
  await expect(inspector).toContainText(/returned/i)
  await inspector.getByRole('button', { name: 'Return to World', exact: true }).click()
  expect((await (await request.get('/api/execution/current')).json()).id).toBe(current.id)
}
