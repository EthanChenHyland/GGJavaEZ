import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

/**
 * Spec task 0.7: browser baseline of the unchanged product on its largest currently capturable
 * fresh project (ACC-14). Real UI: import → Run → live world → retained reload → scrub → orbit.
 * Phase 2 counterpart; original Phase 0 evidence remains unchanged. Numbers are environment-specific.
 */
const out = 'docs/checkpoints/v12-p2'
let ownedProject: string | null = null
test.afterEach(async ({ request }) => {
  if (!ownedProject) return
  const current = await (await request.get('/api/execution/current?transport=delta')).json()
  if (current?.projectId === ownedProject && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(current.phase))
    await request.post(`/api/execution/${current.id}/stop?transport=delta`, { data: {} })
  ownedProject = null
})
const pct = (values: number[], p: number) => { const s = [...values].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))].toFixed(1) }
async function frames(page: Page) { await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))) }
async function sampleFrames(page: Page, ms: number) {
  return page.evaluate((duration) => new Promise<number[]>((resolveFrames) => {
    const deltas: number[] = []; let last = performance.now(); const end = last + duration
    const tick = (now: number) => { deltas.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else resolveFrames(deltas) }
    requestAnimationFrame(tick)
  }), ms)
}

test('ACC-14 incremental browser performance', async ({ page, request, browserName }) => {
  test.setTimeout(process.env.VJ_ACC14_QUICK ? 90000 : 300000)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable'); await cdp.send('Network.enable')
  const streams = new Set<string>(); let streamBytes = 0
  cdp.on('Network.responseReceived', event => { if (event.response.mimeType === 'text/event-stream') streams.add(event.requestId) })
  cdp.on('Network.dataReceived', event => { if (streams.has(event.requestId)) streamBytes += event.dataLength })
  const cpu = async () => { const { metrics } = await cdp.send('Performance.getMetrics'); return metrics.find(m => m.name === 'TaskDuration')?.value ?? 0 }
  const report: Record<string, unknown> = { recordedAt: new Date().toISOString(), browser: `${browserName} ${page.context().browser()?.version()}`,
    viewport: '1440x900', note: 'macOS Chrome; actual WebGL renderer reported below. Phase 0 used Linux/software WebGL: browser comparison is not identical hardware. CPU uses CDP TaskDuration, frames are RAF timing, not physical GPU presentation.' }
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Open Project', exact: true })).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await page.locator('.ide-first-use').getByRole('button', { name: 'Import folder (copy)' }).click()
  await (await chooser).setFiles(resolve('fixtures/acceptance-v12/acc14-simulator-plain'))
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled({ timeout: 60000 })
  const projectId = await page.evaluate(() => localStorage.getItem('ggjavaez:project')!)

  ownedProject = projectId
  const cpuBefore = await cpu()
  const runStarted = Date.now()
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const picker = page.getByRole('combobox', { name: 'Select runtime entity' })
  await expect(picker).toContainText('main()', { timeout: 120000 })
  report.runClickToFirstWorldMs = Date.now() - runStarted
  let session: { phase: string; id: string; projectId: string; rawEventCount: number; terminalStatus: string | null; exitCode: number | null; stdout: string; recording: { state: string; budget: string } }
  await expect.poll(async () => { session = await (await request.get('/api/execution/current?transport=delta')).json(); return session.projectId === projectId && ['COMPLETED', 'FAILED', 'STOPPED'].includes(session.phase) },
    { timeout: 180000, intervals: [200, 500] }).toBe(true)
  report.runClickToTerminalPhaseMs = Date.now() - runStarted
  const scrub = page.getByRole('slider', { name: 'Scrub execution' })
  await expect.poll(async () => Number(await scrub.getAttribute('max')), { timeout: 120000 }).toBe(24765)
  report.runClickToFullWorldMs = Date.now() - runStarted
  report.session = { phase: session!.phase, terminalStatus: session!.terminalStatus, rawEvents: session!.rawEventCount, exitCode: session!.exitCode, stdout: session!.stdout, recording: session!.recording }
  expect(session!.exitCode).toBe(0); expect(session!.phase).toBe('COMPLETED')
  expect(session!.stdout).toBe('PROCESSED 2400\nMAX_QUEUE 400\nCLOCK 5163\n')
  expect(session!.recording.state).toBe('STOPPED_LIMIT')
  report.runBrowserTaskCpuMs = ((await cpu()) - cpuBefore) * 1000
  report.runTransportDecodedSseBytes = streamBytes
  report.webglRenderer = await page.evaluate(() => { const gl = document.querySelector('.spatial-view canvas')?.getContext('webgl2'); const extension = gl?.getExtension('WEBGL_debug_renderer_info'); return extension ? gl!.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable' })
  await mkdir(`${out}/screenshots`, { recursive: true })
  await page.screenshot({ path: `${out}/screenshots/acc14-partial-1440x900.png` })
  await writeFile(`${out}/acc14-browser-performance.json`, JSON.stringify(report, null, 2)+'\n')

  if (process.env.VJ_ACC14_QUICK) {
    report.probeStatus = 'Final-source Run-to-retained-head measurement only; dense-frame probe is reported separately.'
    report.completed = true
    await writeFile(`${out}/acc14-browser-performance.json`, JSON.stringify(report, null, 2)+'\n')
    return
  }
  const bytesBeforeReload = streamBytes
  const reloadStarted = Date.now()
  await page.reload()
  await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Scrub execution' }).getAttribute('max').catch(() => '0')), { timeout: 180000 }).toBe(24765)
  await frames(page)
  report.retainedReloadToInteractiveMs = Date.now() - reloadStarted
  report.reloadBrowserTaskCpuMs = (await cpu()) * 1000 // CDP TaskDuration resets at navigation.
  report.reloadTransportDecodedSseBytes = streamBytes - bytesBeforeReload
  await writeFile(`${out}/acc14-browser-performance.json`, JSON.stringify(report, null, 2)+'\n')
  const max = Number(await scrub.getAttribute('max'))
  report.normalizedEvents = max

  const jump: number[] = []
  for (const fraction of [0.5, 0.33, 0.9, 0.1, 0.75, 1, 0.25, 0.6]) {
    const cursor = Math.round(max * fraction), start = Date.now()
    await scrub.fill(String(cursor))
    await expect(page.locator('.vj-timeline__count')).toContainText(`${cursor} / ${max}`)
    await frames(page); jump.push(Date.now() - start)
    report.scrubJumpUiCommitPlusTwoFramesMs = { p50: pct(jump, 50), p95: pct(jump, 95), max: Math.max(...jump), samples: jump }
    await writeFile(`${out}/acc14-browser-performance.json`, JSON.stringify(report, null, 2)+'\n')
  }
  const adjacent: number[] = []
  const base = Math.round(max / 2)
  for (let i = 1; i <= 10; i++) {
    const start = Date.now()
    await scrub.fill(String(base + i))
    await expect(page.locator('.vj-timeline__count')).toContainText(`${base + i} / ${max}`)
    await frames(page); adjacent.push(Date.now() - start)
    report.scrubAdjacentUiCommitPlusTwoFramesMs = { p50: pct(adjacent, 50), p95: pct(adjacent, 95), samples: adjacent }
    await writeFile(`${out}/acc14-browser-performance.json`, JSON.stringify(report, null, 2)+'\n')
  }
  report.scrubJumpUiCommitPlusTwoFramesMs = { p50: pct(jump, 50), p95: pct(jump, 95), max: Math.max(...jump), samples: jump }
  report.scrubAdjacentUiCommitPlusTwoFramesMs = { p50: pct(adjacent, 50), p95: pct(adjacent, 95), samples: adjacent }

  await scrub.fill(String(max)); await frames(page)
  const idle = await sampleFrames(page, 2000)
  const canvas = page.locator('canvas').first()
  const box = (await canvas.boundingBox())!
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  await page.mouse.move(cx, cy); await page.mouse.down()
  const orbitFrames = sampleFrames(page, 3000)
  for (let i = 0; i < 60; i++) { await page.mouse.move(cx + Math.sin(i / 6) * 200, cy + Math.cos(i / 9) * 80); await page.waitForTimeout(40) }
  const orbit = await orbitFrames
  await page.mouse.up()
  const stats = (d: number[]) => ({ frames: d.length, p50: pct(d, 50), p95: pct(d, 95), p99: pct(d, 99), fps: +(1000 / (d.reduce((a, b) => a + b, 0) / d.length)).toFixed(1) })
  report.idleFrameMs = stats(idle)
  report.orbitFrameMs = stats(orbit)
  report.completed = true
  await mkdir(out, { recursive: true })
  await writeFile(`${out}/acc14-browser-performance.json`, `${JSON.stringify(report, null, 1)}\n`)
  console.log(JSON.stringify(report))
})
