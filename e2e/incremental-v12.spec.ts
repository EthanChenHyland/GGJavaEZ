import { expect, test } from '@playwright/test'
import { writeFile, mkdir } from 'node:fs/promises'

const outputRoot = process.env.VJ_QA_OUTPUT_ROOT ?? 'docs/checkpoints/v12-p2'
let ownedProject: string | null = null
test.afterEach(async ({ request }) => {
  if (!ownedProject) return
  const session = await (await request.get('/api/execution/current?transport=delta')).json()
  if (session?.projectId === ownedProject && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(session.phase))
    await request.post(`/api/execution/${session.id}/stop?transport=delta`, { data: {} })
  ownedProject = null
})

test('delta reconnect and duplicates preserve History while live Java advances', async ({ page, request }) => {
  test.setTimeout(90000)
  const imported = await request.post('/api/projects/import', { data: { name: `Delta QA ${Date.now()}`, files: [{ path: 'Main.java', content: `public class Main {
 public static void main(String[] args) throws Exception {
  int value = 0; java.util.Scanner input = new java.util.Scanner(System.in);
  System.out.println("FIRST WAIT"); input.nextLine();
  for (int i = 0; i < 160; i++) { value += i; Thread.sleep(12); }
  System.out.println("SECOND WAIT " + value); input.nextLine();
  System.out.println("DONE " + value);
 }
}` }] } })
  const { id } = await imported.json()
  ownedProject = id
  await page.addInitScript((id) => {
    localStorage.setItem('ggjavaez:project', id)
    const Native = window.EventSource
    const evidence = { urls: [] as string[], raw: 0, duplicate: false, disconnect: false }
    Object.assign(window, { deltaEvidence: evidence })
    window.EventSource = class extends Native {
      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options); evidence.urls.push(String(url))
        this.addEventListener('raw', event => {
          evidence.raw++
          if (!evidence.duplicate) {
            evidence.duplicate = true
            this.dispatchEvent(new MessageEvent('raw', { data: (event as MessageEvent).data }))
          }
          if (evidence.raw >= 4 && !evidence.disconnect) {
            evidence.disconnect = true; this.close(); this.dispatchEvent(new Event('error'))
          }
        })
      }
    }
  }, id)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/ide')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const current = async () => (await request.get('/api/execution/current?transport=delta')).json()
  await expect.poll(async () => (await current()).phase, { timeout: 30000 }).toBe('WAITING_FOR_INPUT')
  const first = await current()
  expect(first.rawEvents).toEqual([])
  const scrub = page.getByRole('slider', { name: 'Scrub execution' })
  await expect(scrub).toBeVisible()
  await expect.poll(async () => Number(await scrub.getAttribute('max'))).toBeGreaterThan(2)
  const firstMax = Number(await scrub.getAttribute('max'))
  await scrub.fill('2')
  await page.getByRole('textbox', { name: 'Console input' }).fill('A')
  await page.getByRole('button', { name: /Send/ }).click()
  await expect.poll(async () => (await current()).stdout, { timeout: 30000 }).toContain('SECOND WAIT 12720')
  await expect.poll(async () => Number(await scrub.getAttribute('max')), { timeout: 10000 }).toBeGreaterThan(firstMax + 100)
  await expect.poll(async () => (await current()).phase).toBe('WAITING_FOR_INPUT')
  await expect(scrub).toHaveValue('2')
  await expect(page.getByRole('button', { name: /Return to Live/ })).toBeVisible()
  const transport = await page.evaluate(() => (window as unknown as { deltaEvidence: { urls: string[]; duplicate: boolean; disconnect: boolean } }).deltaEvidence)
  expect(transport.duplicate).toBe(true); expect(transport.disconnect).toBe(true)
  expect(transport.urls.some(url => Number(new URL(url, 'http://127.0.0.1:5173').searchParams.get('from')) > 0)).toBe(true)
  await page.getByRole('button', { name: /Return to Live/ }).click()
  await page.getByRole('textbox', { name: 'Console input' }).fill('B')
  await page.getByRole('button', { name: /Send/ }).click()
  await expect.poll(async () => (await current()).phase).toBe('COMPLETED')
  const done = await current()
  expect(done.id).toBe(first.id); expect(done.exitCode).toBe(0)
  await expect(page.locator('.ide-console-output')).toContainText('DONE 12720')
  await expect.poll(async () => Number(await scrub.inputValue())).toBe(Number(await scrub.getAttribute('max')))
  await page.reload()
  await expect(page.locator('.ide-console-output')).toContainText('DONE 12720')
  await expect(page.getByRole('slider', { name: 'Scrub execution' })).toBeVisible()
  expect(errors).toEqual([])
  await mkdir(outputRoot, { recursive: true })
  await writeFile(`${outputRoot}/transport-browser.json`, JSON.stringify({ transport, rawEventCount: done.rawEventCount, stdout: done.stdout, exitCode: done.exitCode, errors }, null, 2)+'\n')
})

test('browser ingestion yields bounded slices while a real 3D scene stays mounted', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('/examples')
  await expect(page.locator('canvas').first()).toBeVisible()
  const report = await page.evaluate(async () => {
    const paths = { generator: '/src/testing/traceGen.ts', normalizer: '/src/instrumentation/normalize.ts', scheduler: '/src/execution/schedule.ts' }
    const { generateRawTrace } = await import(paths.generator)
    const { TraceNormalizer } = await import(paths.normalizer)
    const { yieldTraceWork } = await import(paths.scheduler)
    const input = generateRawTrace({ rawEvents: 100000, seed: 42 })
    const normalizer = new TraceNormalizer(input.manifest)
    const slices: number[] = [], frames: number[] = []
    let running = true, prior = performance.now()
    const frame = (now: number) => { frames.push(now-prior); prior = now; if (running) requestAnimationFrame(frame) }
    requestAnimationFrame(frame)
    const start = performance.now(); let slice = performance.now()
    for (let from = 0; from < input.rawEvents.length; from += 32) {
      normalizer.append(input.rawEvents.slice(from, from+32))
      if (performance.now()-slice >= 4) { slices.push(performance.now()-slice); await yieldTraceWork(); slice = performance.now() }
    }
    normalizer.finish({ status: 'complete', exitCode: 0, diagnostic: null })
    slices.push(performance.now()-slice); running = false
    const totalMs = performance.now()-start
    let seed = 12345; const jumps: number[] = []
    for (let i=0;i<30;i++) { seed=(seed*1664525+1013904223)>>>0; const t=performance.now(); normalizer.history.materialize(Math.floor(seed/2**32*normalizer.history.length)); jumps.push(performance.now()-t) }
    const pct = (values: number[], p: number) => [...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]
    const result = { rawEvents: input.rawEvents.length, semanticEvents: normalizer.history.length, totalMs,
      sliceMs: { p50: pct(slices,.5), p95: pct(slices,.95), max: Math.max(...slices), count: slices.length },
      scrubMs: { p50: pct(jumps,.5), p95: pct(jumps,.95), max: Math.max(...jumps) },
      concurrentFrameMs: { p50: pct(frames,.5), p95: pct(frames,.95), max: Math.max(...frames), count: frames.length },
      note: 'Algorithm ingestion in Chrome with existing Person WebGL scene mounted. This is not a rendered 122k-event world or a physical GPU presentation metric.' }
    normalizer.history.dispose()
    return result
  })
  expect(report.semanticEvents).toBeGreaterThan(120000)
  expect(report.sliceMs.p95).toBeLessThan(30)
  expect(report.concurrentFrameMs.count).toBeGreaterThan(5)
  await writeFile(`${outputRoot}/browser-performance.json`, JSON.stringify(report, null, 2)+'\n')
})
