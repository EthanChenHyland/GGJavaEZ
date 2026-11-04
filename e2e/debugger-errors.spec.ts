import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFile, readdir,mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { DebugPause, SourceBreakpoint } from '../src/debugger/contracts'
import type { ExecutionSession } from '../src/execution/contracts'
import { normalizeTrace } from '../src/instrumentation/normalize'
import { seek } from '../src/runtime/seek'
import {ready,seekCursor,selectEntity,home} from './reference/harness'
import {openDock} from './reference/dockActions'

test.describe.configure({ timeout: 90_000 })
let ownedProjectId: string | null = null

async function importProject(request: APIRequestContext, fixture: string, files?: { path: string; content: string }[]) {
  const directory = resolve('fixtures/debug-v7', fixture)
  files ??= await Promise.all((await readdir(directory)).filter((name) => name.endsWith('.java')).map(async (name) => ({
    path: name, content: await readFile(resolve(directory, name), 'utf8'),
  })))
  const response = await request.post('/api/projects/import', { data: { name: `DebugQA-${fixture}-${randomUUID()}`, files } })
  expect(response.ok(), await response.text()).toBe(true)
  ownedProjectId = (await response.json()).id as string
  return ownedProjectId
}

async function openProject(page: Page, id: string, breakpoints: SourceBreakpoint[] = []) {
  await page.goto('/ide?qa=1')
  await page.evaluate(({ id, breakpoints }) => {
    localStorage.setItem('ggjavaez:project', id)
    localStorage.setItem(`ggjavaez:breakpoints:${id}`, JSON.stringify(breakpoints))
  }, { id, breakpoints })
  await page.reload()
  await page.waitForFunction(()=>typeof window.__ggjavaezQA?.ready==='function')
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Debug', exact: true })).toBeEnabled()
}

async function current(request: APIRequestContext): Promise<ExecutionSession | null> {
  const response = await request.get('/api/execution/current')
  expect(response.ok()).toBe(true)
  return response.json()
}

async function paused(page: Page, request: APIRequestContext, expected: Partial<DebugPause>, after = -1) {
  let session: ExecutionSession | null = null
  await expect.poll(async () => {
    session = await current(request)
    if (session?.projectId === ownedProjectId && session.phase === 'FAILED') throw new Error(`Debug session failed: ${session.diagnostic}\n${session.stderr}`)
    return session?.projectId === ownedProjectId && session.kind === 'debug' && session.phase === 'PAUSED' && !!session.pause && session.pause.rawEventCount > after
      && Object.entries(expected).every(([key, value]) => session!.pause![key as keyof DebugPause] === value)
  }, { timeout: 15_000, message: `Actual JVM pause ${JSON.stringify(expected)}` }).toBe(true)
  await expect(page.locator('.shell-state')).toHaveAttribute('data-state','DEBUG_PAUSED')
  await expect(page.getByRole('toolbar',{name:'JVM debugger controls'}).getByRole('status')).toContainText(`Paused · ${session!.pause!.reason}`)
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveAttribute('aria-disabled','false')
  const trace=normalizeTrace(session!.rawEvents,session!.sourceManifest,{status:session!.terminalStatus??'live',exitCode:session!.exitCode,diagnostic:session!.diagnostic}) .trace
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA?.appState().dimensions.view.recordingId??null)).toBe(`execution:${session!.id}`)
  await expect(page.getByRole('slider',{name:'Recorded execution position'})).toHaveAttribute('max',String(trace.events.length))
  await ready(page)
  return session!
}

async function startDebug(page: Page, request: APIRequestContext) {
  const pending = page.waitForResponse((response) => /\/api\/projects\/[^/]+\/execution$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Debug', exact: true }).click()
  const response = await pending
  expect(response.ok(), await response.text()).toBe(true)
  const started = await response.json() as ExecutionSession
  expect(started.kind).toBe('debug')
  expect(started.projectId).toBe(ownedProjectId)
  const session = await paused(page, request, { reason: 'entry' })
  expect(session.id).toBe(started.id)
  await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:session.id,phase:session.phase,buildSuccess:session.build?.success,rawEvents:session.rawEvents.length}),contentType:'application/json'})
  await expect(page.locator('.shell .world-canvas canvas')).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Recorded execution position' })).toBeVisible()
  await expect(page.locator('.debug-paused-line')).toBeVisible()
  return session
}

async function command(page: Page, request: APIRequestContext, name: string, expected: Partial<DebugPause>, previous: ExecutionSession) {
  const returnToLive = page.getByRole('button', { name: /Return to Live/ })
  if (await returnToLive.isVisible()) await returnToLive.click()
  await page.getByRole('button', { name: ({ Into: 'Step Into', Over: 'Step Over', Out: 'Step Out' } as Record<string, string>)[name] ?? name, exact: true }).click()
  const next = await paused(page, request, expected, previous.pause!.rawEventCount)
  expect(next.id).toBe(previous.id)
  return next
}

async function inspectDebugger(page: Page) {
  await openDock(page,'Debug drawer')
  await expect(page.getByRole('region',{name:'Debugger inspection',exact:true})).toBeVisible()
}

const debuggerPanel=(page:Page)=>page.getByRole('region',{name:'Debugger inspection',exact:true})
const pausedValue=(page:Page,name:string)=>debuggerPanel(page).getByRole('button',{name:`Inspect paused ${name}`,exact:true})
const inspector=(page:Page)=>page.getByRole('complementary',{name:'Selection inspector',exact:true})
async function entityId(page:Page,title:string){
  await ready(page)
  const id=await page.evaluate(title=>Object.values(window.__ggjavaezWorld!.scene().entities).find(node=>node.title===title)?.id,title)
  expect(id,`Actual captured entity ${title}`).toBeTruthy();return id!
}
async function selectCapturedEntity(page:Page,id:string){
  await home(page)
  for(let attempt=0;attempt<16;attempt++){
    await page.locator('.world-canvas').focus();await page.keyboard.press('Escape');await ready(page)
    const choices=await page.evaluate(id=>{
      const world=window.__ggjavaezWorld!,node=world.scene().entities[id],offered=[...document.querySelectorAll('[role="listbox"][aria-label="Runtime entities"] [role="option"]')].map(option=>decodeURIComponent(option.id.slice('world-entity-'.length)))
      return {direct:offered.includes(id),cluster:world.plan().clusters.find(cluster=>cluster.memberIds.includes(id)&&offered.includes(cluster.id))?.id,label:node&&node.kind!=='frame'&&node.kind!=='class'?`Select ${node.title} #${node.displayId}`:null}
    },id)
    if(choices.direct){await selectEntity(page,id);return}
    if(choices.cluster&&choices.label){
      await selectEntity(page,choices.cluster)
      const members=inspector(page).getByRole('list',{name:'Cluster members',exact:true}),member=members.getByRole('button',{name:choices.label,exact:true})
      for(let step=0;!await member.count()&&step<32;step++){await members.hover();await page.mouse.wheel(0,208);await ready(page)}
      await member.click();await ready(page);expect(await page.evaluate(()=>window.__ggjavaezWorld!.selection()?.id)).toBe(id);return
    }
    const close=page.getByRole('button',{name:'Close inspector',exact:true});if(await close.count())await close.click()
    await page.locator('.world-canvas').focus();await page.keyboard.press('-');await ready(page)
  }
  throw new Error(`Actual captured entity ${id} is not reachable through native World exploration`)
}
async function errorSection(page:Page,name:'Failure'|'Stack & path'|'Cause'){
  const tab=page.getByRole('region',{name:'Error Explorer',exact:true}).getByRole('button',{name,exact:true})
  // Desktop exposes all three columns; only the narrow layout has section tabs.
  if(await tab.isVisible())await tab.click()
}
async function returnToFailure(page:Page){
  const panel=page.getByRole('region',{name:'Error Explorer',exact:true})
  await errorSection(page,'Failure')
  await panel.getByRole('button',{name:'Return to failure',exact:true}).click()
  await ready(page)
}
async function frameRoles(page:Page){
  await ready(page)
  return page.evaluate(()=>{
    const world=window.__ggjavaezWorld!,rendered=world.worldProjection().entities
    return Object.values(world.scene().entities).flatMap(node=>node.kind==='frame'?[{id:node.id,title:node.title,role:node.exceptionRole,status:node.status.kind,drawn:rendered.some(body=>body.id===node.id&&!!body.face&&body.face.visible&&body.face.width>0&&body.face.height>0)}]:[])
  })
}
async function orbitWorld(page:Page){
  const before=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose()),viewport=page.viewportSize()!,x=viewport.width*.8,y=viewport.height*.3
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+48,y+16,{steps:6});await page.mouse.up();await ready(page)
  expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).not.toEqual(before)
}
async function recordedConsoleRows(page:Page,expected:readonly string[]){
  const region=page.getByRole('region',{name:'Recorded console',exact:true}),rows=region.locator('.console-line')
  await expect(rows).toHaveCount(expected.length)
  for(const[index,text]of expected.entries()){
    await rows.nth(index).click()
    await expect(region.getByRole('region',{name:`Exact Recorded console row ${index+1}`,exact:true}).locator('pre')).toHaveJSProperty('textContent',text)
    await region.getByRole('button',{name:'Close exact text',exact:true}).click()
  }
}

async function gutter(page: Page, line: number) {
  const number = page.locator('.monaco-editor .line-numbers').filter({ hasText: new RegExp(`^${line}$`) }).first()
  await expect(number).toBeVisible()
  await expect(page.locator('.monaco-editor .glyph-margin').first()).toBeVisible()
  const row = await number.boundingBox()
  const margin = await page.locator('.monaco-editor .glyph-margin').first().boundingBox()
  expect(row).not.toBeNull()
  expect(margin).not.toBeNull()
  await page.mouse.click(margin!.x + margin!.width / 2, row!.y + row!.height / 2)
}

async function runWithHistory(page: Page, request: APIRequestContext, id: string) {
  const pending = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/projects/${id}/execution` && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const response = await pending
  expect(response.ok(), await response.text()).toBe(true)
  const started = await response.json() as ExecutionSession
  expect(started.kind).toBe('run')
  expect(started.projectId).toBe(id)
  await expect.poll(async () => {
    const session = await current(request)
    return session?.projectId === id ? session.phase : 'other project'
  }, { timeout: 45_000, message: 'Recorded JVM execution reaches a terminal phase' }).toMatch(/^(COMPLETED|FAILED)$/)
  const capture = (await current(request))!
  expect(capture.id).toBe(started.id)
  expect(capture.kind).toBe('run')
  expect(capture.build?.success).toBe(true)
  expect(capture.support).not.toBe('RUN_ONLY')
  expect(capture.rawEvents.length).toBeGreaterThan(0)
  expect(capture.terminalStatus).not.toBeNull()
  const { trace } = normalizeTrace(capture.rawEvents, capture.sourceManifest, {
    status: capture.terminalStatus!, exitCode: capture.exitCode, diagnostic: capture.diagnostic,
    ...(capture.capability ? { capability: capture.capability } : {}),
  })
  await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:capture.id,phase:capture.phase,rawEvents:capture.rawEvents.length,buildSuccess:capture.build?.success}),contentType:'application/json'})
  await expect(page.locator('.shell .world-canvas canvas')).toBeVisible()
  const slider = page.getByRole('slider', { name: 'Recorded execution position' })
  await expect(slider).toHaveAttribute('max', String(trace.events.length))
  await seekCursor(page,trace.events.length)
  return { capture, trace, slider }
}

test.afterEach(async ({ request,page },info) => {
  await mkdir('.ggjavaez/qa/reference-exact/debugger-successors',{recursive:true})
  if(!page.isClosed())await page.screenshot({path:`.ggjavaez/qa/reference-exact/debugger-successors/${info.title.replace(/[^a-zA-Z0-9]+/g,'-')}.png`})
  const session = await current(request)
  if (session && session.projectId === ownedProjectId && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(session.phase)) {
    const response = await request.post(`/api/execution/${session.id}/stop`, { data: {} })
    expect(response.ok()).toBe(true)
  }
  ownedProjectId = null
})

test('real gutter toggles persist, remove, and distinguish a nonexecutable breakpoint', async ({ page, request }) => {
  const id = await importProject(request, 'stepping')
  await openProject(page, id)
  await gutter(page, 5)
  await expect(page.locator('.debug-breakpoint')).toHaveCount(1)
  expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`ggjavaez:breakpoints:${id}`)!), id))
    .toEqual([{ fileId: 'Main.java', line: 5 }])
  await gutter(page, 5)
  await expect(page.locator('.debug-breakpoint')).toHaveCount(0)
  await gutter(page, 5)
  await page.reload()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.locator('.debug-breakpoint')).toHaveCount(1)
  await page.getByRole('button',{name:'Show project explorer',exact:true}).click()
  await page.getByRole('treeitem', { name: 'J Person.java', exact: true }).click()
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('class Person')
  await page.getByRole('button',{name:'Refresh Project',exact:true}).focus()
  await page.keyboard.press('Alt+Shift+E')
  await expect(page.getByRole('tree',{name:'Project explorer',exact:true})).toBeHidden()
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('class Person')
  await gutter(page, 3)
  await startDebug(page, request)
  await inspectDebugger(page)
  await expect(debuggerPanel(page).getByRole('button',{name:'Remove breakpoint Person.java:3',exact:true})).toContainText('non executable')
  const session = await current(request)
  expect(session!.breakpoints).toContainEqual(expect.objectContaining({ fileId: 'Main.java', line: 5, status: 'verified' }))
  expect(session!.breakpoints).toContainEqual(expect.objectContaining({ fileId: 'Person.java', line: 3, status: 'non_executable' }))
  await debuggerPanel(page).getByRole('button',{name:'Remove breakpoint Person.java:3',exact:true}).click()
  await expect(debuggerPanel(page).getByRole('list',{name:'Source breakpoints',exact:true}).getByRole('listitem')).toHaveCount(1)
  await expect.poll(async () => (await current(request))!.breakpoints.length).toBe(1)
})

test('actual multifile breakpoint and Into/Over/Out synchronize source, objects, and arrays', async ({ page, request }) => {
  const id = await importProject(request, 'stepping')
  await openProject(page, id, [{ fileId: 'Main.java', line: 5 }])
  let session = await startDebug(page, request)
  await inspectDebugger(page)
  session = await command(page, request, 'Continue', { reason: 'breakpoint', className: 'Main', line: 5 }, session)
  await expect(pausedValue(page,'requestedAge')).toContainText('18')
  const personId=await entityId(page,'Person')
  await selectCapturedEntity(page,personId)
  await expect(inspector(page)).toContainText('12')
  session = await command(page, request, 'Into', { className: 'Worker', methodName: 'update', line: 3 }, session)
  await expect(page.locator('.ide-tab.is-active')).toContainText('Worker.java')
  await expect(page.locator('.debug-paused-line')).toBeVisible()
  await expect(debuggerPanel(page)).toContainText('Worker.update()')
  session = await command(page, request, 'Into', { className: 'Person', methodName: 'setAge', line: 9 }, session)
  await expect(page.locator('.ide-tab.is-active')).toContainText('Person.java')
  await expect(pausedValue(page,'this')).toHaveCount(1)
  await expect(pausedValue(page,'age')).toContainText('18')
  session = await command(page, request, 'Out', { className: 'Worker', methodName: 'update', line: 4 }, session)
  await expect(page.locator('.ide-tab.is-active')).toContainText('Worker.java')
  session = await command(page, request, 'Over', { className: 'Worker', methodName: 'update', line: 5 }, session)
  await expect(pausedValue(page,'ages').locator('code')).toContainText('#')
  const arrayId=await entityId(page,'int[]')
  expect(await page.evaluate(id=>Object.values(window.__ggjavaezWorld!.scene().entities).some(node=>node.kind==='frame'&&node.rows.some(row=>row.name==='ages'&&row.value.kind==='reference'&&row.value.targetId===id)),arrayId)).toBe(true)
  await selectCapturedEntity(page,arrayId)
  await expect(inspector(page).getByRole('list',{name:'Recorded values',exact:true})).toBeVisible()
  await expect(inspector(page).locator('.inspector-value')).toHaveCount(2)
  session = await command(page, request, 'Into', { className: 'Worker', methodName: 'read', line: 10 }, session)
  await expect(pausedValue(page,'index')).toContainText('0')
  session = await command(page, request, 'Out', { className: 'Worker', methodName: 'update', line: 6 }, session)
  session = await command(page, request, 'Out', { className: 'Main', methodName: 'main', line: 6 }, session)
  await expect(page.locator('.ide-tab.is-active')).toContainText('Main.java')
  await expect(pausedValue(page,'result')).toContainText('18')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect.poll(async () => (await current(request))!.phase).toBe('COMPLETED')
  await expect(page.locator('.shell-state')).toHaveAttribute('data-state','COMPLETED')
  const final = await current(request)
  expect(final!.exitCode).toBe(0)
  expect(final!.stdout.trim()).toBe('18')
  const personObservations = final!.rawEvents.filter((event) => event.type === 'object').filter((event) => event.className === 'Person')
  expect(personObservations.filter((event) => !event.resnapshot)).toHaveLength(1)
  expect(new Set(personObservations.map((event) => event.objectId)).size).toBe(1)
  const replay = normalizeTrace(final!.rawEvents, final!.sourceManifest, {
    status: final!.terminalStatus!, exitCode: final!.exitCode, diagnostic: final!.diagnostic,
  }).trace
  expect(replay.events.filter((event) => event.type === 'ALLOCATE_OBJECT' && event.className === 'Person')).toHaveLength(1)
  const personState = Object.values(seek(replay, replay.events.length).objects).find((object) => object.className === 'Person')!
  expect(Object.values(personState.fields).find((slot) => slot.name === 'age')!.value).toEqual({ kind: 'primitive', javaType: 'int', value: 18 })
})

test('Pause suspends real execution at a project boundary and topbar Stop reaps it', async ({ page, request }) => {
  const id = await importProject(request, 'pause', [{ path: 'Main.java', content: 'public class Main {\n public static void main(String[] args) throws Exception {\n  int i = 0;\n  while (i < 100) {\n   i++;\n   Thread.sleep(25);\n  }\n  System.out.println(i);\n }\n}\n' }])
  await openProject(page, id)
  const initial = await startDebug(page, request)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveAttribute('aria-disabled','false')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const session = await paused(page, request, { reason: 'pause' }, initial.pause!.rawEventCount)
  const count = session.rawEvents.length
  const later = await request.get(`/api/execution/${session.id}`)
  expect(later.ok()).toBe(true)
  expect((await later.json()).rawEvents).toHaveLength(count)
  await expect(page.locator('.debug-paused-line')).toBeVisible()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('.shell-state')).toContainText('Stopped by user')
  expect((await current(request))!.phase).toBe('STOPPED')
  // Spatial 2.0 retains a disabled canonical Stop control after the JVM exits.
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveAttribute('aria-disabled','true')
})

test('null exception pause is inspectable, causal rewind selects its assignment, and returns to failure', async ({ page, request }) => {
  const id = await importProject(request, 'null')
  await openProject(page, id)
  const initial = await startDebug(page, request)
  await command(page, request, 'Continue', { reason: 'exception', className: 'Main', line: 4 }, initial)
  const panel = page.locator('.error-explorer')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'NullPointerException', exact: true })).toBeVisible()
  await expect(panel.locator('.debug-source')).toContainText('Main.java:4')
  await errorSection(page,'Stack & path')
  await panel.locator('.debug-value').filter({ hasText: /^name/ }).click()
  await expect(panel.locator('.debug-value.is-selected').filter({ hasText: /^name/ })).toContainText('null')
  const selectedName=await page.evaluate(()=>window.__ggjavaezWorld!.selection())
  expect(selectedName?.kind).toBe('slot');expect(selectedName?.id).toBeTruthy()
  expect(await page.evaluate(id=>Object.values(window.__ggjavaezWorld!.scene().entities).some(node=>node.kind==='frame'&&node.rows.some(row=>row.slotId===id&&row.name==='name')),selectedName!.id)).toBe(true)
  await page.getByRole('button', { name: 'Explore',exact:true }).click()
  await panel.getByRole('button', { name: 'Trace Cause', exact: true }).click()
  await expect(panel.locator('.cause-list li')).toHaveCount(1)
  await expect(panel.locator('.cause-list')).toContainText('null')
  const slider = page.getByRole('slider', { name: 'Recorded execution position' })
  const failureCursor = Number(await slider.inputValue())
  await panel.locator('.cause-list button').first().click()
  await expect.poll(async () => Number(await slider.inputValue())).toBeLessThan(failureCursor)
  await expect(panel.locator('.cause-list button').first()).toHaveAttribute('aria-current', 'step')
  await expect(page.locator('.gg-source-history-line')).toBeVisible()
  await expect(page.locator('.debug-paused-line')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Explore',exact:true})).toHaveAttribute('aria-pressed','true')
  await returnToFailure(page)
  await expect(slider).toHaveValue(String(failureCursor))
  await expect(page.locator('.debug-paused-line')).toBeVisible()
  await page.getByRole('button', { name: /Return to Live/ }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect.poll(async () => (await current(request))!.terminalStatus).toBe('program_crashed')
  await expect(page.locator('.shell-state')).toHaveAttribute('data-state','FAILED')
  const crashed=(await current(request))!
  const finalHead=normalizeTrace(crashed.rawEvents,crashed.sourceManifest,{status:crashed.terminalStatus!,exitCode:crashed.exitCode,diagnostic:crashed.diagnostic}).trace.events.length
  await expect(slider).toHaveAttribute('max',String(finalHead))
  await expect(slider).toHaveValue(String(finalHead))
  await ready(page)
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
  await openDock(page,'Errors')
  await panel.getByText('Actual JVM stderr / stack trace', { exact: true }).click()
  await expect(panel.locator('.error-summary pre')).toContainText('Main.main(Main.java:4)')
  await expect(panel).toBeVisible()
})

test('nested propagation seeks real unwind states through World navigation', async ({ page, request }) => {
  const id = await importProject(request, 'nested')
  await openProject(page, id)
  const { trace } = await runWithHistory(page, request, id)
  await openDock(page,'Errors')
  const panel = page.locator('.error-explorer')
  await errorSection(page,'Stack & path')
  const stack = panel.locator('.error-stack details summary button')
  await expect(stack).toHaveText(['Main.b()', 'Main.a()', 'Main.main()'])
  await expect(panel.locator('.exception-path button')).toHaveCount(4)
  expect(trace.events.filter((event) => event.type === 'UNWIND_EXCEPTION')).toHaveLength(3)
  await returnToFailure(page)
  const slider = page.getByRole('slider', { name: 'Recorded execution position' })
  const throwIndex = trace.events.findIndex((event) => event.type === 'THROW_EXCEPTION')
  const throwEvent = trace.events[throwIndex]
  expect(throwEvent.type).toBe('THROW_EXCEPTION')
  if (throwEvent.type !== 'THROW_EXCEPTION') throw new Error('Missing actual throw')
  expect(trace.events[throwIndex + 1]).toMatchObject({ type: 'EXECUTION_FACT', fact: {
    kind: 'throw', exceptionId: throwEvent.exceptionId, invocationId: throwEvent.frameId,
  } })
  const crash = String(throwIndex + 2)
  await expect(slider).toHaveValue(crash)
  await home(page)
  const origin=await frameRoles(page)
  expect(origin.map(frame=>frame.title)).toEqual(expect.arrayContaining([expect.stringContaining('b()'),expect.stringContaining('a()')]))
  expect(origin.filter(frame=>frame.role==='origin')).toHaveLength(1)
  expect(origin.filter(frame=>frame.role==='origin').every(frame=>frame.drawn)).toBe(true)
  await errorSection(page,'Stack & path')
  await panel.locator('.exception-path button').filter({ hasText: /^Unwind/ }).first().click()
  await expect(panel.locator('.exception-path [aria-current="step"]')).toHaveCount(1)
  await expect(panel.locator('.error-stack')).toContainText('unwound')
  const unwound=await page.evaluate(()=>window.__ggjavaezWorld!.scene().exception!.unwound)
  expect(unwound).toHaveLength(1)
  expect((await frameRoles(page)).find(frame=>frame.id===unwound[0])).toMatchObject({role:'origin',status:'threw'})
  const unwindCursor=await slider.inputValue()
  await orbitWorld(page)
  await expect(slider).toHaveValue(unwindCursor)
  expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().exception!.unwound)).toEqual(unwound)
  expect((await frameRoles(page)).find(frame=>frame.id===unwound[0])).toMatchObject({role:'origin',status:'threw'})
  await expect(page.getByRole('application',{name:'Three-dimensional Java runtime world',exact:true}).locator('canvas')).toBeVisible()
  await returnToFailure(page)
  await expect(slider).toHaveValue(crash)
  await panel.getByText('Actual JVM stderr / stack trace', { exact: true }).click()
  await expect(panel.locator('.error-summary pre')).toContainText('Main.b(Main.java:12)')
})

for (const [fixture, exception] of [['bounds', 'ArrayIndexOutOfBoundsException'], ['divide', 'ArithmeticException'], ['explicit', 'IllegalArgumentException']] as const) {
  test(`real ${fixture} failure exposes its actual exception and source`, async ({ page, request }) => {
    const id = await importProject(request, fixture)
    await openProject(page, id)
    const { capture, trace } = await runWithHistory(page, request, id)
    expect(capture.phase).toBe('FAILED')
    expect(capture.terminalStatus).toBe('program_crashed')
    await openDock(page,'Errors')
    const panel = page.locator('.error-explorer')
    await expect(panel.getByRole('heading', { name: exception, exact: true })).toBeVisible()
    await expect(panel.locator('.debug-source')).toContainText('Main.java:')
    const exceptionEvent = trace.events.find((event) => event.type === 'THROW_EXCEPTION')
    expect(exceptionEvent).toMatchObject({ className: `java.lang.${exception}`, explicit: fixture === 'explicit' })
    if (fixture === 'bounds') {
      await expect(panel.locator('.debug-value').filter({ hasText: /^index/ })).toContainText('5')
      await errorSection(page,'Cause')
      await panel.locator('.error-causes details summary').filter({ hasText: /int\[\]/ }).click()
      await expect(panel.locator('.error-causes .debug-value')).toHaveCount(3)
    }
    if (fixture === 'divide') await expect(panel.locator('.debug-value').filter({ hasText: /^y/ })).toContainText('0')
    if (fixture === 'explicit') await expect(panel.locator('.error-summary')).toContainText('bad value')
  })
}

for (const fixture of ['caught', 'finally'] as const) {
  test(`real ${fixture} lifecycle reconstructs catch, continuation, and handler order`, async ({ page, request }) => {
    const id = await importProject(request, fixture)
    await openProject(page, id)
    const { capture, trace, slider } = await runWithHistory(page, request, id)
    expect(capture.phase).toBe('COMPLETED')
    expect(capture.terminalStatus).toBe('complete')
    await openDock(page,'Errors')
    const panel = page.locator('.error-explorer')
    await expect(panel.locator('.debug-eyebrow')).toContainText('CAUGHT')
    await expect(panel.locator('.exception-path button').filter({ hasText: /^Catch/ })).toHaveCount(1)
    const catchIndex = trace.events.findIndex((event) => event.type === 'CATCH_EXCEPTION')
    const catchEvent = trace.events[catchIndex]
    expect(catchEvent.type).toBe('CATCH_EXCEPTION')
    if (catchEvent.type !== 'CATCH_EXCEPTION') throw new Error('Missing actual catch')
    expect(trace.events[catchIndex + 1]).toMatchObject({ type: 'EXECUTION_FACT', fact: {
      kind: 'catch', exceptionId: catchEvent.exceptionId, invocationId: catchEvent.frameId,
    } })
    const catchCursor = String(catchIndex + 2)
    if (fixture === 'finally') {
      const handlerIndex = trace.events.findIndex((event) => event.type === 'FINALLY_ENTER')
      const unwindIndex = trace.events.findIndex((event) => event.type === 'UNWIND_EXCEPTION')
      expect(handlerIndex).toBeGreaterThan(0)
      expect(unwindIndex).toBeGreaterThan(handlerIndex)
      expect(catchIndex).toBeGreaterThan(unwindIndex)
      await expect(panel.locator('.exception-path button').filter({ hasText: /^Finally/ })).toHaveCount(1)
    }
    await errorSection(page,'Stack & path')
    await panel.locator('.exception-path button').filter({ hasText: /^Catch/ }).click()
    await expect(slider).toHaveValue(catchCursor)
    await expect(panel.locator('.error-stack')).toContainText('caught here')
    await home(page)
    const caught=await frameRoles(page)
    expect(caught.some(frame=>frame.title==='Main.main(String[])')).toBe(true)
    expect(caught.filter(frame=>frame.role==='caught')).toHaveLength(1)
    expect(caught.filter(frame=>frame.role==='caught').every(frame=>frame.drawn)).toBe(true)
    await orbitWorld(page)
    expect((await frameRoles(page)).filter(frame=>frame.role==='caught')).toHaveLength(1)
    await expect(slider).toHaveValue(catchCursor)
    await seekCursor(page,trace.events.length)
    await openDock(page,'Console')
    await expect(page.locator('.ide-console-output')).toContainText('continued')
    const output = fixture === 'caught' ? 'recovered\ncontinued\n' : 'normal try\nnormal finally\nfailing try\nexceptional finally\nrecovered\ncontinued\n'
    expect(capture.stdout).toBe(output)
  })
}

test('ordered stdout/stderr reconstruct only the selected prefix and retain full process output', async ({ page, request }) => {
  const id = await importProject(request, 'ordered-output', [{ path: 'Main.java', content: 'public class Main {\n public static void main(String[] args) {\n  System.out.println("first");\n  int x = 7;\n  System.err.println("middle");\n  System.out.println("last=" + x);\n }\n}\n' }])
  await openProject(page, id)
  const { trace } = await runWithHistory(page, request, id)
  const consoleEvents = trace.events.flatMap((event, index) => event.type === 'CONSOLE_WRITE' ? [{ event, cursor: index + 1 }] : [])
  expect(consoleEvents.map(({ event }) => [event.channel, event.text])).toEqual([
    ['stdout', 'first\n'], ['stderr', 'middle\n'], ['stdout', 'last=7\n'],
  ])
  await openDock(page,'Console')
  const output = page.locator('.ide-console-output')
  await seekCursor(page,consoleEvents[0].cursor-1)
  await recordedConsoleRows(page,[])
  await seekCursor(page,consoleEvents[0].cursor)
  await recordedConsoleRows(page,['first\n'])
  await seekCursor(page,consoleEvents[1].cursor)
  await recordedConsoleRows(page,['first\n','middle\n'])
  await seekCursor(page,trace.events.length)
  await recordedConsoleRows(page,['first\n','middle\n','last=7\n'])
  await seekCursor(page,consoleEvents[0].cursor)
  await recordedConsoleRows(page,['first\n'])
  await output.getByText('Full process output', { exact: true }).click()
  await expect(output.locator('.ide-console-terminal')).toContainText('last=7')
  await expect(output.locator('.ide-console-terminal').getByRole('region',{name:'stderr',exact:true})).toContainText('middle')
  expect(seek(trace, consoleEvents[0].cursor).console.map((entry) => entry.text)).toEqual(['first\n'])
})
