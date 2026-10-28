import { expect, test } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import type { ExecutionSession } from '../src/execution/contracts'
import {currentSession,focusSelection,home,ready,seekCursor,selectEntity} from './reference/harness'
import {openDock} from './reference/dockActions'

const outputRoot = process.env.VJ_QA_OUTPUT_ROOT ?? '.ggjavaez/qa/reference-exact'
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
  const previous=await currentSession(request);expect(!previous||!['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(previous.phase),'Preserve unrelated active execution').toBe(true)
  const content = await readFile('tests/provenance/fixtures/inheritance/InheritanceMain.java', 'utf8')
  const imported = await request.post('/api/projects/import', { data: { name: `Provenance QA ${Date.now()}`, files: [{ path: 'InheritanceMain.java', content }] } })
  expect(imported.ok(), await imported.text()).toBe(true)
  const { id } = await imported.json()
  ownedProject = id
  await page.addInitScript(projectId => localStorage.setItem('ggjavaez:project', projectId), id)
  await page.goto('/?qa=1')
  // Project hydration precedes the existing editor/Run checks.
  await page.waitForFunction(id=>document.querySelector('[data-project-id]')?.getAttribute('data-project-id')===id,id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const current = async () => await (await request.get('/api/execution/current')).json() as ExecutionSession
  await expect.poll(async () => {
    const session = await current()
    return session?.projectId === id ? session.phase : 'other'
  }, { timeout: 45000 }).toBe('COMPLETED')
  const done = await current()
  expect(done.exitCode).toBe(0)
  expect(done.stdout).toBe('34\n')
  expect(done.recording?.state).toBe('FULL');expect(done.build?.success).toBe(true);expect(done.rawEvents.length).toBeGreaterThan(0)
  await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:done.id,rawEvents:done.rawEvents.length,buildSuccess:true}),contentType:'application/json'})
  const proof = await page.evaluate(async session => {
    const modulePath = '/src/instrumentation/normalize.ts'
    const { TraceNormalizer } = await import(modulePath)
    const normalizer = new TraceNormalizer(session.sourceManifest)
    for (let from = 0; from < session.rawEvents.length; from += 32) normalizer.append(session.rawEvents.slice(from, from + 32))
    const result = normalizer.finish({ status: 'complete', exitCode: 0, diagnostic: null })
    const graph = normalizer.state.executionGraph
    if(!graph)throw new Error('Captured constructor graph is missing')
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
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld?.scene().recordingId)).toBe(`execution:${done.id}`)
  await openDock(page,'Console');await expect(page.getByLabel('Program console')).toContainText('34')
  await expect(page.locator('.world-canvas canvas')).toBeVisible()
  const scrub=page.getByRole('slider',{name:'Recorded execution position',exact:true})
  await expect.poll(async()=>Number(await scrub.getAttribute('aria-valuemax'))).toBe(proof.semanticEvents)
  await seekCursor(page,proof.semanticEvents);await home(page)
  const object=await page.evaluate(()=>Object.values(window.__ggjavaezWorld!.scene().entities).find(node=>node.kind==='object'&&node.title.includes('Extension')))
  expect(object?.kind).toBe('object');const objectId=object!.id
  expect(objectId).toBe(proof.constructors[0].receiverObjectId)
  await seekCursor(page,1)
  expect(await page.evaluate(id=>window.__ggjavaezWorld!.scene().entities[id]??null,objectId)).toBeNull()
  await seekCursor(page,proof.semanticEvents);await home(page)
  expect(await page.evaluate(id=>window.__ggjavaezWorld!.scene().entities[id]??null,objectId)).toEqual(object)
  await selectEntity(page,objectId)
  const inspector=page.getByRole('complementary',{name:'Selection inspector',exact:true})
  await expect(inspector).toContainText('inherited');await expect(inspector).toContainText('own')
  await focusSelection(page)
  await mkdir(`${outputRoot}/provenance`, { recursive: true })
  for (const [width, height] of [[1728, 1117], [1440, 900], [1280, 800], [760, 900]]) {
    await page.setViewportSize({ width, height })
    await ready(page);await focusSelection(page)
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${outputRoot}/provenance/constructor-focus-${width}x${height}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  // Enter History explicitly: a viewport capture may already be at LIVE.
  await seekCursor(page,proof.semanticEvents-1)
  await expect(page.locator('.gg-time-lens')).toHaveText('HISTORY')
  await page.getByRole('button', { name: 'Return to Live',exact:true }).click()
  await ready(page)
  await expect(scrub).toHaveAttribute('aria-valuenow',String(proof.semanticEvents))
  await expect(page.locator('.gg-time-lens')).toHaveText('LIVE')
  await page.reload()
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld?.scene().recordingId)).toBe(`execution:${done.id}`)
  await ready(page);await openDock(page,'Console')
  await expect(page.getByLabel('Program console')).toContainText('34')
  await expect(page.locator('.world-canvas canvas')).toBeVisible()
  expect(await page.evaluate(id=>window.__ggjavaezWorld!.scene().entities[id]??null,objectId)).toEqual(object)
  expect(await page.evaluate(id=>window.__ggjavaezWorld!.plan().entities.has(id),objectId)).toBe(true)
  expect((await current()).id).toBe(done.id)
  expect(errors).toEqual([])
  await writeFile(`${outputRoot}/provenance/browser-proof.json`, JSON.stringify({ ...proof, exitCode: done.exitCode, stdout: done.stdout, errors }, null, 2) + '\n')
})
