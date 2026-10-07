import { expect, test } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import type { ExecutionSession } from '../src/execution/contracts'

const outputRoot = process.env.VJ_QA_OUTPUT_ROOT ?? 'docs/checkpoints/v12-p3'
let ownedProject: string | null = null

test.afterEach(async ({ request }) => {
  if (!ownedProject) return
  const current = await (await request.get('/api/execution/current?transport=delta')).json() as ExecutionSession | null
  if (current?.projectId === ownedProject && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(current.phase))
    await request.post(`/api/execution/${current.id}/stop?transport=delta`, { data: {} })
  ownedProject = null
})

test('actual constructor graph survives browser normalization, history scrubbing, retained world and Focus', async ({ page, request }) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const content = await readFile('tests/provenance/fixtures/inheritance/InheritanceMain.java', 'utf8')
  const imported = await request.post('/api/projects/import', { data: { name: `Provenance QA ${Date.now()}`, files: [{ path: 'InheritanceMain.java', content }] } })
  expect(imported.ok(), await imported.text()).toBe(true)
  const { id } = await imported.json()
  ownedProject = id
  await page.addInitScript(projectId => localStorage.setItem('ggjavaez:project', projectId), id)
  await page.goto('/ide')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const current = async () => await (await request.get('/api/execution/current')).json() as ExecutionSession
  await expect.poll(async () => {
    const session = await current()
    return session?.projectId === id ? session.phase : 'other'
  }, { timeout: 45000 }).toBe('COMPLETED')
  const done = await current()
  expect(done.exitCode).toBe(0)
  expect(done.stdout).toBe('34\n')
  expect(done.recording?.state).toBe('FULL')
  const proof = await page.evaluate(async session => {
    const modulePath = '/src/instrumentation/normalize.ts'
    const { TraceNormalizer } = await import(modulePath)
    const normalizer = new TraceNormalizer(session.sourceManifest)
    for (let from = 0; from < session.rawEvents.length; from += 32) normalizer.append(session.rawEvents.slice(from, from + 32))
    const result = normalizer.finish({ status: 'complete', exitCode: 0, diagnostic: null })
    const graph = normalizer.state.executionGraph
    const nodes = Object.values(graph.invocations) as { id: string; method: { owner: string; name: string; descriptor: string }; callerInvocationId: string | null; receiverObjectId?: string; status: string }[]
    const outer = nodes.find(node => node.method.owner.endsWith('$Extension') && node.method.name === '<init>' && node.method.descriptor === '()V')!
    const inner = nodes.find(node => node.method.name === '<init>' && node.callerInvocationId === outer.id)!
    const base = nodes.find(node => node.method.name === '<init>' && node.callerInvocationId === inner.id)!
    const end = normalizer.state
    normalizer.history.materialize(1)
    const restored = normalizer.history.materialize(normalizer.history.length)
    const proof = { constructors: [outer, inner, base], diagnostics: result.capability.diagnostics,
      semanticEvents: normalizer.history.length, edges: graph.edges.length, retainedSameHead: restored === end }
    normalizer.history.dispose()
    return proof
  }, done)
  expect(proof.diagnostics).toEqual([])
  expect(proof.constructors.map(node => node.method.owner)).toEqual(['InheritanceMain$Extension', 'InheritanceMain$Extension', 'InheritanceMain$Foundation'])
  expect(proof.constructors.every(node => node.status === 'returned' && node.receiverObjectId === proof.constructors[0].receiverObjectId)).toBe(true)
  expect(proof.retainedSameHead).toBe(true)
  await page.getByRole('button', { name: 'Show Console', exact: true }).click()
  await expect(page.locator('.ide-console-output')).toContainText('34')
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
  const scrub = page.getByRole('slider', { name: 'Scrub execution' })
  await expect.poll(async () => Number(await scrub.getAttribute('max'))).toBe(proof.semanticEvents)
  const max = String(proof.semanticEvents)
  await scrub.fill(max)
  const picker = page.getByRole('combobox', { name: 'Select runtime entity' })
  const objectId = await picker.locator('option').filter({ hasText: /Extension #/ }).first().getAttribute('value')
  expect(objectId).toBe(proof.constructors[0].receiverObjectId)
  await scrub.fill('1')
  await expect(picker.locator(`option[value="${objectId}"]`)).toHaveCount(0)
  await scrub.fill(max)
  await expect(picker.locator(`option[value="${objectId}"]`)).toHaveCount(1)
  await picker.selectOption(objectId!)
  const inspector = page.getByRole('complementary', { name: 'Runtime inspector' })
  await expect(inspector).toContainText('inherited')
  await expect(inspector).toContainText('own')
  await inspector.getByRole('button', { name: 'Focus', exact: true }).click()
  await mkdir(`${outputRoot}/provenance`, { recursive: true })
  for (const [width, height] of [[1728, 1117], [1440, 900], [1280, 800], [760, 900]]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${outputRoot}/provenance/constructor-focus-${width}x${height}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: /Return to Live/ }).click()
  await expect(page.locator('.vj-timeline__lens')).toHaveText('LIVE')
  await page.reload()
  await page.getByRole('button', { name: 'Show Console', exact: true }).click()
  await expect(page.locator('.ide-console-output')).toContainText('34')
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Select runtime entity' }).locator(`option[value="${objectId}"]`)).toHaveCount(1)
  expect((await current()).id).toBe(done.id)
  expect(errors).toEqual([])
  await writeFile(`${outputRoot}/provenance/browser-proof.json`, JSON.stringify({ ...proof, exitCode: done.exitCode, stdout: done.stdout, errors }, null, 2) + '\n')
})
