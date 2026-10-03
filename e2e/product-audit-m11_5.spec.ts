import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { inspectRetainedWorld } from './product-audit-capture'
import type { ExecutionSession } from '../src/execution/contracts'
import { normalizeTrace } from '../src/instrumentation/normalize'

test.describe.configure({ mode: 'serial', timeout: 180_000 })
test.use({ video: { mode:'on', size:{ width:1440, height:900 } }, actionTimeout:15000 })
const output = process.env.VJ_QA_OUTPUT_ROOT ? `${process.env.VJ_QA_OUTPUT_ROOT}/product-audit-v11_5` : 'docs/checkpoints/product-audit-v11_5'

async function capture(page: Page, name: string) {
  await mkdir(output, { recursive: true })
  for (const [width, height] of [[1728, 1117], [1440, 900], [1280, 800], [760, 900]]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${output}/${name}-${width}x${height}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
}

async function importFolder(page: Page, name: string) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Open Project', exact: true })).toBeVisible()
  const chooser = page.waitForEvent('filechooser')
  await page.locator('.ide-first-use').getByRole('button', { name: 'Import folder (copy)' }).click()
  await (await chooser).setFiles(resolve(`fixtures/product-audit-v11_5/${name}`))
  await expect(page.locator('.ide-first-use')).toHaveCount(0)
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
  return await page.evaluate(() => localStorage.getItem('ggjavaez:project')!)
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
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Open Project', exact: true })).toBeVisible()
  await capture(page, 'startup')
  const id = await importFolder(page, 'banking-maven')
  await page.getByRole('button', { name:'Show project explorer' }).click()
  await expect(page.getByRole('treeitem', { name: 'bank', exact: true })).toBeVisible()
  await page.locator('.ide-tree-name[title="src/main/java/audit/bank/Main.java"]').click()
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
  await page.getByLabel('More actions').click()
  await page.getByRole('button', { name:'Launch settings', exact:true }).click()
  await expect(page.getByRole('dialog')).toContainText('First runnable main')
  await page.getByRole('button', { name:'Cancel', exact:true }).click()
  await capture(page, 'banking-code')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await phase(request, id, 'WAITING_FOR_INPUT')
  await expect(page.getByRole('textbox', { name: 'Console input' })).toBeVisible()
  await capture(page, 'banking-input')
  await page.getByRole('textbox', { name: 'Console input' }).fill('Mira 25 7')
  await page.getByRole('button', { name: 'Send ↵' }).click()
  const session = await phase(request, id, 'COMPLETED')
  await evidence('banking', session)
  expect(session.stdout).toContain('BALANCE 118')
  expect(session.build?.javaProject?.buildSystem).toBe('maven')
  expect(session.rawEvents.some(event => event.type === 'field')).toBe(true)
  await expect(page.getByRole('button', { name: 'Spatial', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('combobox', { name: 'Rendering quality' })).toHaveValue('high')
  const picker = page.getByRole('combobox', { name: 'Select runtime entity' })
  await expect(picker).toContainText('main() · completed')
  await capture(page, 'banking-completed')
  // Replay representative real observations without restarting the JVM.
  const trace = normalizeTrace(session.rawEvents, session.sourceManifest, {
    status:'complete', exitCode:session.exitCode, diagnostic:session.diagnostic,
  }).trace
  await page.getByRole('button', { name:'Expand runtime' }).click()
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
    await page.getByRole('slider', { name:'Scrub execution' }).fill(String(index))
    await page.waitForTimeout(650)
    await page.getByRole('button', { name:'Next event', exact:true }).click()
    await expect(page.locator('.vj-timeline__count')).toContainText(`${index + 1} / ${trace.events.length}`)
    motionEvidence.push({ cursor:index + 1, type:trace.events[index].type, label:trace.events[index].label })
    await page.waitForTimeout(850)
  }
  await writeFile(`${output}/banking-motion.json`, JSON.stringify({ sessionId:session.id, approximateVideoStartMs:motionStart, approximateVideoEndMs:Date.now()-videoStart, samples:motionEvidence }, null, 2))
  expect((await (await request.get('/api/execution/current')).json()).id).toBe(session.id)
  await page.getByRole('button', { name:/Return to Live/ }).click()
  await page.getByRole('button', { name:'Restore IDE layout' }).click()
  const account = await picker.locator('option').filter({ hasText: /^audit\.bank\.Account #/ }).first().getAttribute('value')
  expect(account).toBeTruthy()
  await picker.selectOption(account!)
  await page.getByRole('complementary', { name: 'Runtime inspector' }).getByRole('button', { name: 'Focus', exact: true }).click()
  await page.getByRole('button', { name: 'Expand runtime' }).click()
  await capture(page, 'banking-focus')
  await expect(page.getByRole('button', { name: 'Restore IDE layout' })).toBeVisible()
  await page.getByRole('button', { name:'Restore IDE layout' }).click()
  await page.getByRole('button', { name:'Show project explorer' }).click()
  await page.locator('.ide-tree-name[title="src/main/java/audit/bank/Account.java"]').click()
  await page.locator('.ide-tree-name[title="src/main/java/audit/bank/Account.java"]').click({ button:'right' })
  await capture(page, 'explorer-context')
  await page.keyboard.press('Escape')
  await page.locator('.monaco-editor').click()
  await page.keyboard.press('Control+G')
  await page.locator('.quick-input-widget input').fill('22')
  await page.keyboard.press('Enter')
  await page.keyboard.press('F9')
  await expect(page.locator('.debug-breakpoint')).toBeVisible()
  await page.keyboard.press('F9')
  await expect(page.locator('.debug-breakpoint')).toHaveCount(0)
  await page.keyboard.press('F1')
  await page.locator('.quick-input-widget input').fill('>Toggle Breakpoint')
  await expect(page.locator('.quick-input-widget')).toContainText('Toggle Breakpoint')
  await page.keyboard.press('Escape')
  const number = page.locator('.monaco-editor .line-numbers').filter({ hasText:/^22$/ }).first()
  await expect(number).toBeVisible()
  const row = await number.boundingBox()
  const margin = await page.locator('.monaco-editor .glyph-margin').first().boundingBox()
  await page.mouse.click(margin!.x + margin!.width / 2, row!.y + row!.height / 2)
  await expect(page.locator('.debug-breakpoint')).toBeVisible()
  await page.getByRole('button', { name:'Debug', exact:true }).click()
  await phase(request, id, 'PAUSED')
  await expect(page.locator('.debug-live-state')).toContainText('entry')
  await capture(page, 'banking-debug-entry')
  await page.getByRole('button', { name:'Continue', exact:true }).click()
  await phase(request, id, 'WAITING_FOR_INPUT')
  await page.getByRole('textbox', { name:'Console input' }).fill('Mira 25 7')
  await page.getByRole('button', { name:'Send ↵' }).click()
  const pause = await phase(request, id, 'PAUSED')
  expect(pause.pause?.reason).toBe('breakpoint')
  await expect(picker).toContainText('deposit()')
  const deposit = await picker.locator('option').filter({ hasText:/^deposit\(\)/ }).first().getAttribute('value')
  await picker.selectOption(deposit!)
  await page.getByRole('complementary', { name:'Runtime inspector' }).getByRole('button', { name:'Focus', exact:true }).click()
  await page.getByRole('button', { name:'Expand runtime' }).click()
  await capture(page, 'banking-focus-active')
  await page.getByRole('button', { name:'Continue', exact:true }).click()
  const debugEnd = await phase(request, id, 'COMPLETED')
  await evidence('banking-debug', debugEnd)
  await expect(page.getByRole('button', { name:'Restore IDE layout' })).toBeVisible()
  await expect(page.locator('.world-label')).toContainText('ISOLATED')
  await expect(picker).toHaveValue(deposit!)
  await capture(page, 'banking-focus-completed')
  // Failure must retain the user-selected main record and the immersive view.
  await page.getByRole('button', { name:'Run', exact:true }).click()
  await phase(request, id, 'WAITING_FOR_INPUT')
  // Process metadata arrives independently of the coalesced world. Select the
  // new session's observed main, after the retained previous recording is replaced.
  await expect(page.getByRole('status', { name:'Previous recording' })).toHaveCount(0)
  await expect(picker.locator('option').filter({ hasText:/^main\(\) · invocation/ })).toHaveCount(1)
  const main = await picker.locator('option').filter({ hasText:/^main\(\)/ }).first().getAttribute('value')
  await picker.selectOption(main!)
  await page.getByRole('complementary', { name:'Runtime inspector' }).getByRole('button', { name:'Focus', exact:true }).click()
  await page.getByRole('textbox', { name:'Console input' }).fill('Mira -25 7')
  await page.getByRole('button', { name:'Send ↵' }).click()
  const failed = await phase(request, id, 'FAILED')
  expect(failed.failureKind).toBe('runtime')
  await evidence('banking-failure', failed)
  await expect(page.getByRole('region', { name:'Error Explorer' })).toContainText('negative deposit')
  await expect(page.getByRole('button', { name:'Restore IDE layout' })).toBeVisible()
  await expect(picker).toHaveValue(main!)
  await expect(page.locator('.world-label')).toContainText('ISOLATED')
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
  await expect(page.getByRole('combobox', { name: 'Select runtime entity' })).toContainText('main() · completed')
  await capture(page, 'dispatch-completed')
})

test('fresh plain graph stress project executes and leaves a navigable recorded world', async ({ page, request }) => {
  const id = await importFolder(page, 'graph-stress-plain')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const session = await phase(request, id, 'COMPLETED')
  await evidence('graph', session)
  expect(session.stdout).toContain('CHECKSUM 69089')
  expect(session.rawEvents.length).toBeGreaterThan(3000)
  expect(session.rawEvents.some(event => event.type === 'catch')).toBe(true)
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
  await capture(page, 'graph-completed')
  await inspectRetainedWorld(page, request)
})

test('real large object, empty object and int array retain readable Focus at every viewport', async ({ page, request }) => {
  const id = await importFolder(page, 'focus-shapes-plain')
  await page.getByRole('button', { name:'Run', exact:true }).click()
  const session = await phase(request, id, 'COMPLETED')
  expect(session.stdout).toContain('FIELDS 78 ARRAY 11')
  await evidence('focus-shapes', session)
  const picker = page.getByRole('combobox', { name:'Select runtime entity' })
  await expect(picker).toContainText('LargeRecord')
  for (const [name, match] of [['large-object', /LargeRecord #/], ['tiny-object', /TinyRecord #/], ['int-array', /int\[\] #/]] as const) {
    const selected = await picker.locator('option').filter({ hasText:match }).first().getAttribute('value')
    expect(selected).toBeTruthy()
    await picker.selectOption(selected!)
    await page.getByRole('complementary', { name:'Runtime inspector' }).getByRole('button', { name:'Focus', exact:true }).click()
    if (name === 'large-object') await page.getByRole('button', { name:'Expand runtime', exact:true }).click()
    await expect(page.locator('.world-label').filter({ hasText:'ISOLATED' })).toBeVisible()
    if (name === 'large-object') await expect(page.locator('.inspector-row')).toHaveCount(13)
    if (name === 'int-array') await expect(page.locator('.inspector')).toContainText('11')
    await capture(page, `focus-${name}`)
    await expect(picker).toHaveValue(selected!)
    await page.getByRole('button', { name:'Return to world', exact:true }).click()
  }
  expect((await (await request.get('/api/execution/current')).json()).id).toBe(session.id)
})
