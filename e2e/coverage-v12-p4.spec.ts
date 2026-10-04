import { expect, test } from '@playwright/test'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const output = `${process.env.VJ_QA_OUTPUT_ROOT ?? 'docs/checkpoints/v12-p4'}/coverage`
const cases = [
  ['oop', '16-static-nested', /Channel #/],
  ['arrays', '03-reference-arrays', /Parcel\[\] #/],
  ['statics', '01-static-initialization', /<clinit>/],
  ['collections', '07-array-list', /ArrayList #/],
  ['stdin-stdout', '25-cross-feature-dispatch', /Dispatch #/],
  ['dependency', '22-maven-dependency', /main/],
  ['exception', '29-exception-interactions', /main/],
  ['large-world', '28-bounded-values', /long\[\] #/],
] as const

test.afterEach(async ({ request }) => {
  const current = await (await request.get('/api/execution/current')).json()
  if (current && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(current.phase))
    await request.post(`/api/execution/${current.id}/stop?transport=delta`, { data: {} })
})

async function projectFiles(root: string, prefix = ''): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === 'expected.facts.json') continue
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await projectFiles(join(root, entry.name), relative))
    else files.push({ path: relative, content: await readFile(join(root, entry.name), 'utf8') })
  }
  return files
}

for (const [view, fixture, preferred] of cases) test(`Phase 4 ${view}: real project, retained world and inspection`, async ({ page, request }) => {
  test.setTimeout(120000)
  const root = `fixtures/acceptance-v12-p4/${fixture}`
  const spec = JSON.parse(await readFile(`${root}/expected.facts.json`, 'utf8'))
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const imported = await request.post('/api/projects/import', { data: { name: `Phase4 ${view}`, files: await projectFiles(root) } })
  expect(imported.ok(), await imported.text()).toBe(true)
  const { id } = await imported.json()
  await page.addInitScript(projectId => localStorage.setItem('ggjavaez:project', projectId), id)
  await page.goto('/ide')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const current = async () => (await request.get('/api/execution/current')).json()
  let sent = false
  await expect.poll(async () => {
    const session = await current()
    if (session?.projectId !== id) return 'other'
    if (session.phase === 'WAITING_FOR_INPUT' && !sent && spec.stdin) {
      sent = true
      await request.post(`/api/execution/${session.id}/input`, { data: { text: spec.stdin } })
    }
    return session.phase
  }, { timeout: 90000 }).toBe('COMPLETED')
  const completed = await current()
  expect(completed.exitCode).toBe(spec.exitCode)
  expect(completed.stdout).toBe(spec.stdout)
  expect(completed.stderr).toBe(spec.stderr)
  expect(completed.recording.state).toBe('FULL')
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
  const scrub = page.getByRole('slider', { name: 'Scrub execution' })
  await expect.poll(async () => Number(await scrub.getAttribute('max'))).toBeGreaterThan(5)
  const max = (await scrub.getAttribute('max'))!
  await scrub.fill(max)
  const picker = page.getByRole('combobox', { name: 'Select runtime entity' })
  const options = await picker.locator('option').evaluateAll(nodes => nodes.map(node => ({ value: (node as HTMLOptionElement).value, label: node.textContent ?? '' })))
  const chosen = options.find(option => preferred.test(option.label)) ?? (view === 'statics' ? options.find(option => option.value.startsWith('jvm:frame:')) : undefined) ?? options.find(option => option.value.startsWith('jvm:object:')) ?? options.find(option => option.value.startsWith('jvm:frame:'))
  expect(chosen).toBeDefined()
  await picker.selectOption(chosen!.value)
  const inspector = page.getByRole('complementary', { name: 'Runtime inspector' })
  await expect(inspector).toBeVisible()
  if (view === 'statics') await expect(inspector).toContainText('Class statics')
  if (view === 'collections') await expect(inspector).toContainText('SEMANTIC SUMMARY')
  await mkdir(output, { recursive: true })
  await page.getByRole('button', { name: 'Overview', exact: true }).first().click()
  if (['oop', 'statics', 'collections'].includes(view)) await expect(page.locator('.array-status')).toHaveCount(0)
  if (view === 'arrays') await expect(page.locator('.array-status')).toContainText('Parcel #')
  if (view === 'large-world') await expect(page.locator('.array-status')).toContainText('prefix')
  const readouts = page.locator('.runtime-status-readouts > section')
  const bounds = await readouts.evaluateAll(nodes => nodes.map(node => {
    const rect = node.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom }
  }))
  for (let index = 1; index < bounds.length; index++) expect(bounds[index].top).toBeGreaterThan(bounds[index - 1].bottom)
  const densitySummary = page.locator('.world-detail-summary')
  if (await densitySummary.count() && bounds.length) {
    const summary = (await densitySummary.boundingBox())!
    expect(summary.y >= bounds.at(-1)!.bottom || summary.y + summary.height <= bounds[0].top).toBe(true)
  }
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${output}/${view}-overview-1440x900.png` })
  await inspector.getByRole('button', { name: 'Focus', exact: true }).click()
  const sizes = view === 'oop' || view === 'collections' ? [[1728, 1117], [1440, 900], [1280, 800], [760, 900]] : [[1440, 900]]
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(650)
    await page.screenshot({ path: `${output}/${view}-focus-${width}x${height}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  if (view === 'collections') {
    const populatedCursor = await page.evaluate(async ({ session, objectId }) => {
      const modulePath = '/src/instrumentation/normalize.ts'
      const { TraceNormalizer } = await import(modulePath)
      const normalizer = new TraceNormalizer(session.sourceManifest)
      normalizer.append(session.rawEvents)
      const result = normalizer.finish({ status: 'complete', exitCode: 0, diagnostic: null })
      const event = result.trace.events.find((event: { type: string; objectId?: string; library?: { size?: number } }) =>
        event.type === 'OBJECT_OBSERVE' && event.objectId === objectId && event.library?.size === 2)
      normalizer.history.dispose()
      return event?.seq + 1
    }, { session: completed, objectId: chosen!.value })
    expect(Number.isSafeInteger(populatedCursor)).toBe(true)
    await scrub.fill(String(populatedCursor))
    await expect(inspector).toContainText('LIST · size 2')
    await inspector.getByRole('button', { name: 'Focus', exact: true }).click()
    await page.waitForTimeout(700)
    await page.screenshot({ path: `${output}/collections-populated-focus-1440x900.png` })
  }
  await scrub.fill('1'); await scrub.fill(max)
  await expect(picker.locator(`option[value="${chosen!.value}"]`)).toHaveCount(1)
  expect((await current()).id).toBe(completed.id)
  expect(errors).toEqual([])
  await writeFile(`${output}/${view}-proof.json`, JSON.stringify({ fixture, exitCode: completed.exitCode,
    recording: completed.recording, semanticEvents: Number(max), selected: chosen, errors }, null, 2) + '\n')
})
