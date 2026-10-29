import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import type { ExecutionSession } from '../src/execution/contracts'
import {TraceNormalizer} from '../src/instrumentation/normalize'
import {browserErrors,currentSession,ready,home,seekCursor,selectEntity,focusSelection} from './reference/harness'
import {openDock} from './reference/dockActions'

const screenshots = process.env.VJ_QA_OUTPUT_ROOT ? `${process.env.VJ_QA_OUTPUT_ROOT}/screenshots` : '.ggjavaez/qa/reference-exact/observer'

test.describe.configure({ mode: 'serial', timeout: 120_000 })
let ownedProjectId: string | null = null
test.afterEach(async ({ request }) => {
  const session = await (await request.get('/api/execution/current')).json() as ExecutionSession | null
  if (session?.projectId === ownedProjectId && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(session.phase))
    expect((await request.post(`/api/execution/${session.id}/stop`, { data: {} })).ok()).toBe(true)
  ownedProjectId = null
})
async function openProject(page: Page, request: APIRequestContext, source: string) {
  const previous=await currentSession(request);expect(!previous||!['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(previous.phase),'Preserve unrelated active execution').toBe(true)
  const response = await request.post('/api/projects/import', { data: { name: `Observer ${Date.now()}`, files: [{ path: 'Main.java', content: source }] } })
  expect(response.ok(), await response.text()).toBe(true)
  const { id } = await response.json()
  ownedProjectId = id
  await page.addInitScript((value) => localStorage.setItem('ggjavaez:project', value), id)
  await page.goto('/?qa=1')
  await page.waitForFunction(id=>document.querySelector('[data-project-id]')?.getAttribute('data-project-id')===id,id)
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

async function acceptedPrefix(page:Page,session:ExecutionSession){
  expect(session.build?.success).toBe(true);expect(session.rawEvents.length).toBeGreaterThan(0)
  const normalizer=new TraceNormalizer(session.sourceManifest);normalizer.append(session.rawEvents)
  const normalized=normalizer.finish({status:'complete',exitCode:session.exitCode,diagnostic:null}),max=normalized.trace.events.length;normalizer.history.dispose()
  expect(normalized.trace.events.at(-1)?.type).toBe('CAPTURE_STOP')
  await expect(page.getByRole('slider',{name:'Recorded execution position',exact:true})).toHaveAttribute('aria-valuemax',String(max))
  await seekCursor(page,max)
  expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().recording)).toEqual(session.recording)
  expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().recordingId)).toBe(`execution:${session.id}`)
  await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:session.id,rawEvents:session.rawEvents.length,normalizedEvents:max,recording:session.recording,buildSuccess:true}),contentType:'application/json'})
  return max
}

test('object saturation keeps stdin, complete console, natural exit and inspectable last-observed world', async ({ page, request }) => {
  const errors=browserErrors(page)
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
  await expect(page.getByRole('slider', { name: 'Recorded execution position',exact:true })).toBeVisible()
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
  await expect(page.locator('.shell-state-label')).toContainText('Partial recording')
  await openDock(page,'Console')
  await expect(page.locator('.ide-console-output')).toContainText('DONE 65')
  await expect(page.locator('.ide-console-output')).toContainText('REAL STDERR AFTER RECORDING')
  await expect(page.locator('.gg-time-event')).toContainText('Last recorded event')
  const max=await acceptedPrefix(page,done)
  await seekCursor(page,1)
  await expect(page.locator('.ide-console-output')).toContainText('DONE 65')
  await seekCursor(page,max)
  await expect(page.locator('.world-canvas canvas')).toBeVisible()
  await expect(page.locator('.gg-time-partial')).toContainText('objects')
  await expect(page.locator('.gg-time-partial')).toHaveAttribute('title',`STOPPED_LIMIT · raw lastRecordedSeq: ${done.recording!.lastRecordedSeq}`)
  // LIVE means the accepted semantic boundary, independently labelled partial.
  await seekCursor(page,1);await page.getByRole('button',{name:'Return to Live',exact:true}).click()
  await expect(page.locator('.gg-time-lens')).toHaveText('LIVE');await expect(page.getByRole('slider',{name:'Recorded execution position',exact:true})).toHaveAttribute('aria-valuenow',String(max));await ready(page);await home(page)
  await mkdir(screenshots, { recursive: true })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${screenshots}/partial-overview-1440x900.png` })
  await page.getByRole('button',{name:'Close Console drawer',exact:true}).click()
  const item=await page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene();return scene.order.objects.map(id=>scene.entities[id]).filter(node=>node.kind==='object'&&node.title==='Main$Item').at(-1)})
  expect(item?.kind).toBe('object');if(!item||item.kind!=='object')throw new Error('Last captured Item is missing')
  const cluster=await page.evaluate(id=>window.__ggjavaezWorld!.plan().clusters.find(cluster=>cluster.memberIds.includes(id)),item.id)
  if(cluster){
    await selectEntity(page,cluster.id)
    const members=page.getByRole('list',{name:'Cluster members',exact:true}),target=members.getByRole('button',{name:`Select ${item.title} #${item.displayId}`,exact:true})
    for(let step=0;step<cluster.members&&!await target.count();step++){await members.hover();await page.mouse.wheel(0,260);await page.waitForTimeout(50)}
    await target.click();await ready(page)
  }else await selectEntity(page,item.id)
  const inspector=page.getByRole('complementary',{name:'Selection inspector',exact:true})
  await expect(inspector.locator('.inspector-heading')).toContainText(`${item.title} #${item.displayId}`)
  const number=item.groups.flatMap(group=>group.rows).find(row=>row.name==='number');expect(number).toBeDefined()
  await expect(inspector.getByRole('button',{name:'Inspect number',exact:true})).toHaveText(number!.value.exact)
  expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().recording)).toEqual(done.recording)
  await expect(page.locator('.gg-time-partial')).toContainText(done.recording!.reason!)
  await focusSelection(page)
  for (const [width, height] of [[1728, 1117], [1440, 900], [1280, 800], [760, 900]]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(600)
    const firstValue = inspector.getByRole('list',{name:'Recorded values',exact:true}).getByRole('listitem').first()
    await expect(firstValue).toContainText('number')
    const visibleValue = await firstValue.evaluate(row => {
      const body = row.closest('[role=list]')!.getBoundingClientRect()
      const value = row.getBoundingClientRect()
      return value.top >= body.top && value.bottom <= body.bottom
    })
    expect(visibleValue, `first observed row is fully visible at ${width}×${height}`).toBe(true)
    await page.screenshot({ path: `${screenshots}/partial-${width}x${height}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.reload()
  expect((await currentSession(request))?.id).toBe(done.id)
  await openDock(page,'Console')
  await expect(page.locator('.ide-console-output')).toContainText('DONE 65')
  await acceptedPrefix(page,done)
  await expect(page.locator('.gg-time-event')).toContainText('Last recorded event')
  expect(errors).toEqual([])
})

test('unsupported thread leaves a successful run and a truthful recorded prefix', async ({ page, request }) => {
  const errors=browserErrors(page)
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
  await openDock(page,'Console')
  await expect(page.locator('.ide-console-output')).toContainText('WORKER 7')
  await expect(page.locator('.ide-console-output')).toContainText('THREAD DONE')
  await expect(page.locator('.gg-time-event')).toContainText('Last recorded event')
  await acceptedPrefix(page,done)
  await expect(page.locator('.shell-state-label')).toContainText('Partial recording')
  await expect(page.locator('.gg-time-partial')).toContainText(done.recording!.reason!);expect(errors).toEqual([])
})
