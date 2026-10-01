import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import type { ExecutionSession } from '../src/execution/contracts'

test.describe.configure({ mode: 'serial', timeout: 120_000 })
let ownedProjectId: string | null = null
test.afterEach(async ({ request }) => {
  const session = await (await request.get('/api/execution/current')).json() as ExecutionSession | null
  if (session?.projectId === ownedProjectId && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(session.phase))
    await request.post(`/api/execution/${session.id}/stop`, { data: {} })
  ownedProjectId = null
})
async function openProject(page: Page, request: APIRequestContext, source: string) {
  const response = await request.post('/api/projects/import', { data: { name: `Observer ${Date.now()}`, files: [{ path: 'Main.java', content: source }] } })
  expect(response.ok(), await response.text()).toBe(true)
  const { id } = await response.json()
  ownedProjectId = id
  await page.addInitScript((value) => localStorage.setItem('ggjavaez:project', value), id)
  await page.goto('/ide')
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  return id as string
}
async function phase(request: APIRequestContext, id: string, wanted: ExecutionSession['phase']) {
  let session: ExecutionSession
  await expect.poll(async () => {
    session = await (await request.get('/api/execution/current')).json()
    return session?.projectId === id ? session.phase : 'different'
  }, { timeout: 60000, intervals: [200, 500] }).toBe(wanted)
  return session!
}

test('object saturation keeps stdin, complete console, natural exit and inspectable last-observed world', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const id = await openProject(page, request, `public class Main {
  static class Item { int number; Item(int n) { number = n; } }
  public static void main(String[] args) throws Exception {
    for (int i = 0; i < 300; i++) new Item(i);
    System.out.println("WAITING AFTER RECORDING");
    int value = System.in.read();
    System.err.println("REAL STDERR AFTER RECORDING");
    System.out.println("DONE " + value);
  }
}`)
  const waiting = await phase(request, id, 'WAITING_FOR_INPUT')
  expect(waiting.recording).toMatchObject({ state: 'STOPPED_LIMIT', budget: 'objects', executionContinued: true })
  await expect(page.locator('.ide-console-output')).toContainText('WAITING AFTER RECORDING')
  await expect(page.getByRole('slider', { name: 'Scrub execution' })).toBeVisible()
  const count = waiting.rawEvents.length
  await page.getByRole('textbox', { name: 'Console input' }).fill('A')
  await page.getByRole('button', { name: /Send/ }).click()
  const done = await phase(request, id, 'COMPLETED')
  expect(done.id).toBe(waiting.id)
  expect(done.exitCode).toBe(0)
  expect(done.rawEvents.length).toBe(count)
  expect(done.support).toBe('PARTIAL')
  const archivedOut = await request.get(`/api/execution/${done.id}/output/stdout`)
  const archivedErr = await request.get(`/api/execution/${done.id}/output/stderr`)
  expect(archivedOut.ok()).toBe(true)
  expect(await archivedOut.text()).toBe(done.stdout)
  expect(archivedErr.ok()).toBe(true)
  expect(await archivedErr.text()).toBe(done.stderr)
  await expect(page.locator('.ide-execution-status')).toContainText('COMPLETED')
  await expect(page.locator('.ide-console-output')).toContainText('DONE 65')
  await expect(page.locator('.ide-console-output')).toContainText('REAL STDERR AFTER RECORDING')
  await expect(page.locator('.vj-timeline__event')).toContainText('Last recorded event')
  const scrub = page.getByRole('slider', { name: 'Scrub execution' })
  const max = Number(await scrub.getAttribute('max'))
  await scrub.fill('1')
  await expect(page.locator('.ide-console-output')).toContainText('DONE 65')
  await scrub.fill(String(max))
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
  const partialDetail = page.locator('.ide-support-detail').filter({ has: page.locator('summary').filter({ hasText: 'Visualization partial' }) })
  await partialDetail.locator('summary').click()
  await expect(partialDetail).toContainText('objects')
  await partialDetail.locator('summary').click()
  await page.getByRole('button', { name: /Return to last recorded event/ }).click()
  await expect(page.locator('.vj-timeline__lens')).toHaveText('LAST RECORDED')
  await mkdir('docs/checkpoints/v12-p1/screenshots', { recursive: true })
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'docs/checkpoints/v12-p1/screenshots/partial-overview-1440x900.png' })
  const picker = page.getByRole('combobox', { name: 'Select runtime entity' })
  const objectId = await picker.locator('option').filter({ hasText: /Item #/ }).last().getAttribute('value')
  expect(objectId).toBeTruthy()
  await picker.selectOption(objectId!)
  await expect(page.getByRole('complementary', { name: 'Runtime inspector' })).toContainText('Last recorded state')
  await page.getByRole('complementary', { name: 'Runtime inspector' }).getByRole('button', { name: 'Focus', exact: true }).click()
  for (const [width, height] of [[1728, 1117], [1440, 900], [1280, 800], [760, 900]]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(600)
    await page.screenshot({ path: `docs/checkpoints/v12-p1/screenshots/partial-${width}x${height}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  await expect(page.locator('.ide-console-output')).toContainText('DONE 65')
  await expect(page.locator('.vj-timeline__event')).toContainText('Last recorded event')
  expect(errors).toEqual([])
})

test('unsupported thread leaves a successful run and a truthful recorded prefix', async ({ page, request }) => {
  const id = await openProject(page, request, `public class Main {
  static int work() { return 7; }
  public static void main(String[] args) throws Exception {
    Thread worker = new Thread(() -> System.out.println("WORKER " + work()));
    worker.start(); worker.join(); System.out.println("THREAD DONE");
  }
}`)
  const done = await phase(request, id, 'COMPLETED')
  expect(done.exitCode).toBe(0)
  expect(done.recording).toMatchObject({ state: 'STOPPED_UNSUPPORTED', budget: null, executionContinued: true })
  expect(new Set(done.rawEvents.filter((event) => event.type !== 'capture_saturated').map((event) => event.threadId)).size).toBe(1)
  await expect(page.locator('.ide-console-output')).toContainText('WORKER 7')
  await expect(page.locator('.ide-console-output')).toContainText('THREAD DONE')
  await expect(page.locator('.vj-timeline__event')).toContainText('Last recorded event')
  await expect(page.locator('.ide-support-detail summary').filter({ hasText: 'Visualization partial' })).toBeVisible()
})
