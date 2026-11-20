import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { inspectRetainedWorld } from './product-audit-capture'
import type { ExecutionSession } from '../src/execution/contracts'
import { normalizeTrace } from '../src/instrumentation/normalize'
import { focusSelection, home, ready, seekCursor } from './reference/harness'
import { openDock } from './reference/dockActions'
import { clearTortureSelection, pickTortureEntity } from './reference/tortureNavigation'

test.describe.configure({ timeout: 180_000 })
const ownedProjects = new Set<string>()
test.afterEach(async ({ request }) => {
  const current = await (await request.get('/api/execution/current')).json() as ExecutionSession | null
  if (current && ownedProjects.has(current.projectId) && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(current.phase)) {
    const response = await request.post(`/api/execution/${current.id}/stop`, { data: {} })
    expect(response.ok()).toBe(true)
  }
  ownedProjects.clear()
})
test.use({ video: { mode:'on', size:{ width:1440, height:900 } }, actionTimeout:15000 })
const output = process.env.VJ_QA_OUTPUT_ROOT ? `${process.env.VJ_QA_OUTPUT_ROOT}/product-audit-v11_5` : 'docs/checkpoints/product-audit-v11_5'

const canvas = (page: Page) => page.locator('.world-canvas canvas')
const timeline = (page: Page) => page.getByRole('slider', { name: 'Recorded execution position', exact: true })
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Selection inspector', exact: true })

async function showExplorer(page: Page) {
  if (!await page.locator('.ide-project-panel').isVisible()) await page.getByRole('button', { name: 'Show project explorer', exact: true }).click()
  await expect(page.locator('.ide-project-panel')).toBeVisible()
}

async function closeDock(page: Page) {
  const button = page.getByRole('navigation', { name: 'Dock', exact: true }).locator('button[data-dock-tool][aria-expanded="true"]')
  if (await button.count()) await button.click()
}

async function retained(page: Page, session: ExecutionSession) {
  await expect.poll(() => page.evaluate(() => window.__ggjavaezWorld?.scene().recordingId), { timeout: 60000 }).toBe(`execution:${session.id}`)
  const trace = normalizeTrace(session.rawEvents, session.sourceManifest, { status: session.terminalStatus ?? 'live', exitCode: session.exitCode, diagnostic: session.diagnostic, recording: session.recording }).trace
  await expect.poll(async () => Number(await timeline(page).getAttribute('aria-valuemax')), { timeout: 60000 }).toBeGreaterThanOrEqual(trace.events.length)
  await ready(page)
}

async function entity(page: Page, predicate: (node: import('../src/contracts/world').SceneEntity) => boolean) {
  const entities = await page.evaluate(() => Object.values(window.__ggjavaezWorld!.scene().entities))
  const node = entities.find(predicate)
  expect(node).toBeDefined()
  return node!.id
}

async function frame(page: Page, method: string, completed = false) {
  const id = await page.evaluate(method => window.__ggjavaezWorld!.recordedEvents().find(event => event.type === 'ENTER_METHOD' && event.methodName === method), method)
  if (id?.type !== 'ENTER_METHOD') throw new Error(`Missing observed invocation ${method}`)
  const result = await page.evaluate(id => window.__ggjavaezWorld!.scene().entities[id], id.frameId)
  expect(result?.kind).toBe('frame')
  if (completed) expect(result).toMatchObject({ live: false })
  return id.frameId
}

async function expectFocus(page: Page, id: string) {
  await expect.poll(() => page.evaluate(() => window.__ggjavaezQA!.focusTarget()?.targetId)).toBe(id)
  expect(await page.evaluate(() => window.__ggjavaezQA!.selection()?.id)).toBe(id)
}

async function focus(page: Page, id: string) {
  await clearTortureSelection(page)
  await home(page)
  await pickTortureEntity(page, id)
  await inspector(page).getByRole('button', { name: 'Focus selection', exact: true }).click()
  await ready(page)
  await expectFocus(page, id)
}

async function returnToWorld(page: Page) {
  await inspector(page).getByRole('button', { name: 'Return to World', exact: true }).click()
  await ready(page)
}

async function capture(page: Page, name: string, focusId?: string) {
  await mkdir(output, { recursive: true })
  for (const [width, height] of [[1728, 1117], [1440, 900], [1280, 800], [760, 900]]) {
    await page.setViewportSize({ width, height })
    if (focusId) {
      await focusSelection(page)
      await expectFocus(page, focusId)
    } else await page.waitForTimeout(600)
    await page.screenshot({ path: `${output}/${name}-${width}x${height}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
}

async function importFolder(page: Page, name: string) {
  await page.goto('/?qa=1')
  await page.waitForFunction(() => typeof window.__ggjavaezQA?.ready === 'function')
  await expect(page.getByRole('heading', { name: 'Open Project', exact: true })).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await page.locator('.ide-first-use').getByRole('button', { name: 'Import folder (copy)' }).click()
  await (await chooser).setFiles(resolve(`fixtures/product-audit-v11_5/${name}`))
  await expect(page.locator('.ide-first-use')).toHaveCount(0)
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
  const id = await page.evaluate(() => localStorage.getItem('ggjavaez:project'))
  expect(id).toBeTruthy()
  ownedProjects.add(id!)
  return id!
}

async function phase(request: APIRequestContext, projectId: string, wanted: ExecutionSession['phase']) {
  await expect.poll(async () => {
    const current = await (await request.get('/api/execution/current')).json() as ExecutionSession | null
    return current?.projectId === projectId ? current.phase : 'different project'
  }, { timeout: 120_000, intervals: [200, 500, 1000] }).toBe(wanted)
  return await (await request.get('/api/execution/current')).json() as ExecutionSession
}

async function evidence(name: string, session: ExecutionSession) {
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/${name}-session.json`, JSON.stringify({
    id: session.id, projectId: session.projectId, phase: session.phase,
    support: session.support, supportReason: session.supportReason,
    terminalStatus: session.terminalStatus, diagnostic: session.diagnostic,
    exitCode: session.exitCode, stdout: session.stdout, stderr: session.stderr,
    rawEvents: session.rawEvents.length,
    invocations: session.rawEvents.filter(event => event.type === 'enter').length,
    objects: session.rawEvents.filter(event => event.type === 'object' || event.type === 'array').length,
    rawEventKinds: [...new Set(session.rawEvents.map(event => event.type))],
    capability: session.capability,
    javaProject: session.build?.javaProject,
  }, null, 2))
}

test('fresh Maven banking project imports, edits, saves, accepts stdin and retains its world', async ({ page, request }) => {
  test.setTimeout(300000)
  const videoStart = Date.now()
  await page.goto('/?qa=1')
  await page.waitForFunction(() => typeof window.__ggjavaezQA?.ready === 'function')
  await expect(page.getByRole('heading', { name: 'Open Project', exact: true })).toBeVisible()
  await capture(page, 'startup')
  const id = await importFolder(page, 'banking-maven')
  await showExplorer(page)
  await expect(page.getByRole('treeitem', { name: 'bank', exact: true })).toBeVisible()
  await page.locator('.ide-tree-name[title="src/main/java/audit/bank/Main.java"]').click()
  await page.keyboard.press('Alt+Shift+E')
  await expect(page.locator('.ide-editor-foot')).toContainText('audit/bank/Main.java')
  await page.locator('.monaco-editor').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText((await readFile('fixtures/product-audit-v11_5/banking-maven/src/main/java/audit/bank/Main.java', 'utf8')) + '\n// Saved through the product audit UI.\n')
  await expect(page.locator('.ide-dirty')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Shift+S')
  await expect(page.locator('.ide-dirty')).toHaveCount(0)
  // Semantic suggestions must be visible in the editor, not only available by API.
  await expect.poll(async () => (await (await request.get(`/api/projects/${id}/language`)).json()).status, { timeout:90000, intervals:[500,1000] }).toBe('ready')
  const code = await readFile('fixtures/product-audit-v11_5/banking-maven/src/main/java/audit/bank/Main.java', 'utf8')
  await page.locator('.monaco-editor').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('package audit.bank;\npublic class Main { void probe() { new LedgerService().')
  await page.keyboard.press('Control+Space')
  await expect(page.locator('.suggest-widget.visible')).toContainText('post', { timeout:20000 })
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(code + '\n// Saved through the product audit UI.\n')
  await page.keyboard.press('ControlOrMeta+Shift+S')
  await expect(page.locator('.ide-dirty')).toHaveCount(0)
  await page.keyboard.press('F1')
  const palette = page.getByRole('dialog', { name: 'Command Palette', exact: true })
  const search = palette.getByRole('combobox', { name: 'Search commands', exact: true })
  await search.fill('workbench.launch')
  await expect(palette.getByRole('option')).toHaveCount(1)
  await expect(palette.getByRole('option')).toHaveAttribute('aria-disabled', 'false')
  await search.press('Enter')
  await expect(palette).toHaveCount(0)
  await expect(page.getByRole('dialog')).toContainText('First runnable main')
  await page.getByRole('button', { name:'Cancel', exact:true }).click()
  await capture(page, 'banking-code')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await phase(request, id, 'WAITING_FOR_INPUT')
  await expect(page.getByRole('textbox', { name: 'Console input' })).toBeVisible()
  await capture(page, 'banking-input')
  await page.getByRole('textbox', { name: 'Console input' }).fill('Mira 25 7')
  await page.getByRole('button', { name: /^Send/ }).click()
  const session = await phase(request, id, 'COMPLETED')
  await evidence('banking', session)
  expect(session.stdout).toContain('BALANCE 118')
  expect(session.build?.javaProject?.buildSystem).toBe('maven')
  expect(session.rawEvents.some(event => event.type === 'field')).toBe(true)
  await retained(page, session)
  await expect(canvas(page)).toBeVisible()
  const quality = await page.evaluate(() => window.__ggjavaezWorld!.quality())
  expect(quality).toMatchObject({ setting: 'INTERACTIVE', active: 'INTERACTIVE' })
  await frame(page, 'main', true)
  await capture(page, 'banking-completed')
  // Replay representative real observations without restarting the JVM.
  const trace = normalizeTrace(session.rawEvents, session.sourceManifest, {
    status:'complete', exitCode:session.exitCode, diagnostic:session.diagnostic,
  }).trace
  await closeDock(page)
  const motionStart = Date.now() - videoStart
  const samples = [
    trace.events.findIndex(event => event.type === 'CONSOLE_INPUT'),
    trace.events.findIndex(event => event.type === 'ENTER_METHOD' && event.methodName === 'post'),
    trace.events.findIndex(event => event.type === 'ALLOCATE_OBJECT' && event.className.endsWith('.Account')),
    trace.events.findIndex(event => event.type === 'DECLARE_LOCAL' && event.slot.role === 'parameter' && event.slot.name === 'amount'),
    trace.events.findIndex(event => event.type === 'SET_FIELD' && event.value.kind === 'primitive' && event.value.value === 125),
    trace.events.findIndex(event => event.type === 'RETURN_VALUE'),
    trace.events.findIndex(event => event.type === 'EXIT_METHOD' && trace.events.some(enter => enter.type === 'ENTER_METHOD' && enter.frameId === event.frameId && enter.methodName === 'deposit')),
    trace.events.findIndex(event => event.type === 'CONSOLE_WRITE' && event.text.includes('BALANCE')),
    trace.events.findIndex(event => event.type === 'EXIT_METHOD' && trace.events.some(enter => enter.type === 'ENTER_METHOD' && enter.frameId === event.frameId && enter.methodName === 'main')),
    trace.events.findIndex(event => event.type === 'PROGRAM_END'),
  ]
  expect(samples.every(index => index >= 0)).toBe(true)
  const motionEvidence = []
  for (const index of samples) {
    await seekCursor(page, index)
    await page.waitForTimeout(650)
    await page.getByRole('button', { name:'Next Event', exact:true }).click()
    await expect(timeline(page)).toHaveAttribute('aria-valuenow', String(index + 1))
    await expect(timeline(page)).toHaveAttribute('aria-valuemax', String(trace.events.length))
    motionEvidence.push({ cursor:index + 1, type:trace.events[index].type, label:trace.events[index].label })
    await page.waitForTimeout(850)
  }
  await writeFile(`${output}/banking-motion.json`, JSON.stringify({ sessionId:session.id, approximateVideoStartMs:motionStart, approximateVideoEndMs:Date.now()-videoStart, samples:motionEvidence }, null, 2))
  expect((await (await request.get('/api/execution/current')).json()).id).toBe(session.id)
  await page.getByRole('button', { name:/Return to Live/ }).click()
  await ready(page)
  const account = await entity(page, node => node.kind === 'object' && node.title.endsWith('Account'))
  await focus(page, account)
  await capture(page, 'banking-focus')
  await returnToWorld(page)
  await showExplorer(page)
  await page.locator('.ide-tree-name[title="src/main/java/audit/bank/Account.java"]').click()
  await page.locator('.ide-tree-name[title="src/main/java/audit/bank/Account.java"]').click({ button:'right' })
  const explorerMenu = page.getByRole('menu', { name: 'Actions for src/main/java/audit/bank/Account.java', exact: true })
  await expect(explorerMenu).toBeVisible()
  await capture(page, 'explorer-context')
  await page.keyboard.press('Escape')
  await expect(explorerMenu).toHaveCount(0)
  if (await page.locator('.ide-project-panel').isVisible()) {
    await page.getByRole('button', { name: 'Show project explorer', exact: true }).click()
    await expect(page.locator('.ide-project-panel')).toBeHidden()
  }
  await page.getByRole('button', { name: 'Expand source for editing', exact: true }).click()
  await page.locator('.monaco-editor').click()
  await page.keyboard.press('Control+G')
  await page.locator('.quick-input-widget input').fill('22')
  await page.keyboard.press('Enter')
  await page.keyboard.press('F9')
  await expect(page.locator('.debug-breakpoint')).toBeVisible()
  await page.keyboard.press('F9')
  await expect(page.locator('.debug-breakpoint')).toHaveCount(0)
  await page.locator('.monaco-editor .view-lines').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: /Toggle Breakpoint/ })).toBeVisible()
  await page.keyboard.press('Escape')
  const number = page.locator('.monaco-editor .line-numbers').filter({ hasText:/^22$/ }).first()
  await expect(number).toBeVisible()
  const row = await number.boundingBox()
  const margin = await page.locator('.monaco-editor .glyph-margin').first().boundingBox()
  await page.mouse.click(margin!.x + margin!.width / 2, row!.y + row!.height / 2)
  await expect(page.locator('.debug-breakpoint')).toBeVisible()
  await page.getByRole('button', { name:'Debug', exact:true }).click()
  const entry = await phase(request, id, 'PAUSED')
  await retained(page, entry)
  await expect(page.getByRole('toolbar', { name: 'JVM debugger controls' }).getByRole('status')).toContainText('entry')
  await expect.poll(() => page.evaluate(() => window.__ggjavaezWorld!.worldProjection().entities.filter(body => body.live && body.bounds?.visible).length), { timeout: 15000 }).toBeGreaterThan(0)
  await capture(page, 'banking-debug-entry')
  await page.getByRole('button', { name:'Continue', exact:true }).click()
  await phase(request, id, 'WAITING_FOR_INPUT')
  await expect(page.getByRole('region', { name:'Console drawer', exact:true })).toBeVisible({ timeout:15000 })
  await expect(page.getByRole('textbox', { name:'Console input' })).toBeEnabled()
  await page.getByRole('textbox', { name:'Console input' }).fill('Mira 25 7')
  await page.getByRole('button', { name: /^Send/ }).click()
  const pause = await phase(request, id, 'PAUSED')
  expect(pause.pause?.reason).toBe('breakpoint')
  expect(pause.id).toBe(entry.id)
  await retained(page, pause)
  const deposit = await frame(page, 'deposit')
  await closeDock(page)
  await focus(page, deposit)
  await capture(page, 'banking-focus-active')
  await page.getByRole('button', { name:'Continue', exact:true }).click()
  const debugEnd = await phase(request, id, 'COMPLETED')
  await evidence('banking-debug', debugEnd)
  expect(debugEnd.id).toBe(entry.id)
  await retained(page, debugEnd)
  await expectFocus(page, deposit)
  await capture(page, 'banking-focus-completed')
  // Failure must retain the user-selected main record and the immersive view.
  await page.getByRole('button', { name:'Run', exact:true }).click()
  // Process metadata arrives independently of the coalesced world. Select the
  // new session's observed main, after the retained previous recording is replaced.
  const waiting = await phase(request, id, 'WAITING_FOR_INPUT')
  await retained(page, waiting)
  await expect(page.getByRole('status').filter({ hasText: 'Previous run' })).toHaveCount(0)
  const main = await frame(page, 'main')
  await closeDock(page)
  await focus(page, main)
  await openDock(page, 'Console')
  await page.getByRole('textbox', { name:'Console input' }).fill('Mira -25 7')
  await page.getByRole('button', { name: /^Send/ }).click()
  const failed = await phase(request, id, 'FAILED')
  expect(failed.failureKind).toBe('runtime')
  await evidence('banking-failure', failed)
  expect(failed.id).toBe(waiting.id)
  await retained(page, failed)
  await expectFocus(page, main)
  const errors = page.getByRole('region', { name: 'Error Explorer', exact: true })
  if (!await errors.isVisible()) await openDock(page, 'Errors')
  await expect(errors).toContainText('negative deposit')
  await capture(page, 'banking-focus-failure')
  // Desktop already shows the stack; narrow layouts disclose it as a tab.
  await page.setViewportSize({ width:760, height:900 })
  await page.getByRole('region', { name:'Error Explorer' }).getByRole('button', { name:'Stack & path', exact:true }).click()
  await capture(page, 'banking-error-stack')
})

test('fresh Gradle dispatch project runs interface dispatch, inheritance and dependency code', async ({ page, request }) => {
  const id = await importFolder(page, 'dispatch-gradle')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const session = await phase(request, id, 'COMPLETED')
  await evidence('dispatch', session)
  expect(session.stdout).toContain('TOTAL 28')
  expect(session.build?.javaProject?.buildSystem).toBe('gradle')
  expect(session.rawEvents.some(event => event.type === 'enter' && event.className?.includes('ExpressDelivery'))).toBe(true)
  await retained(page, session)
  await frame(page, 'main', true)
  await capture(page, 'dispatch-completed')
})

test('fresh plain graph stress project executes and leaves a navigable recorded world', async ({ page, request }) => {
  const id = await importFolder(page, 'graph-stress-plain')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const session = await phase(request, id, 'COMPLETED')
  await evidence('graph', session)
  expect(session.stdout).toContain('CHECKSUM 69089')
  expect(session.rawEvents.length).toBeGreaterThan(3000)
  // Phase 4 observes the real String map keys as well as Nodes. Those actual
  // identities reach the unchanged 256-object budget before the final catch;
  // recording must stop honestly while the same Java process completes it.
  expect(session.recording).toMatchObject({ state: 'STOPPED_LIMIT', budget: 'objects', executionContinued: true })
  expect(session.support).toBe('PARTIAL')
  expect(session.exitCode).toBe(0)
  expect(session.stdout).toContain('CAUGHT 1')
  expect(session.rawEvents.filter(event => event.type === 'capture_saturated')).toHaveLength(1)
  expect(session.rawEvents.some(event => event.type === 'catch')).toBe(false)
  await retained(page, session)
  await expect(canvas(page)).toBeVisible()
  await capture(page, 'graph-completed')
  await inspectRetainedWorld(page, request)
})

test('real large object, empty object and int array retain readable Focus at every viewport', async ({ page, request }) => {
  const id = await importFolder(page, 'focus-shapes-plain')
  await page.getByRole('button', { name:'Run', exact:true }).click()
  const session = await phase(request, id, 'COMPLETED')
  expect(session.stdout).toContain('FIELDS 78 ARRAY 11')
  await evidence('focus-shapes', session)
  await retained(page, session)
  await closeDock(page)
  for (const [name, title] of [['large-object', 'LargeRecord'], ['tiny-object', 'TinyRecord'], ['int-array', 'int[]']] as const) {
    const selected = await entity(page, node => node.title.endsWith(title))
    await focus(page, selected)
    if (name === 'large-object') {
      await expect(inspector(page).getByRole('list', { name: 'Recorded values', exact: true }).getByRole('listitem').first()).toHaveAttribute('aria-setsize', '13')
    }
    if (name === 'int-array') await expect(inspector(page)).toContainText('11')
    await capture(page, `focus-${name}`, selected)
    await expectFocus(page, selected)
    await returnToWorld(page)
  }
  expect((await (await request.get('/api/execution/current')).json()).id).toBe(session.id)
})
