import { expect, test } from '@playwright/test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ExecutionSession } from '../src/execution/contracts'
import {openDock} from './reference/dockActions'

test.describe.configure({ mode: 'serial', timeout: 90_000 })
test.afterEach(async({page},info)=>{
  await mkdir('.ggjavaez/qa/reference-exact/ide-successors',{recursive:true})
  if(!page.isClosed())await page.screenshot({path:`.ggjavaez/qa/reference-exact/ide-successors/${info.title.replace(/[^a-zA-Z0-9]+/g,'-')}.png`})
})

async function imported(request: import('@playwright/test').APIRequestContext, name: string, files: { path: string; content: string }[]) {
  const response = await request.post('/api/projects/import', { data: { name: `${name}-${randomUUID()}`, files } })
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()).id as string
}
async function openProject(page: import('@playwright/test').Page, id: string) {
  await page.addInitScript((projectId) => localStorage.setItem('ggjavaez:project', projectId), id)
  await page.goto('/ide')
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled()
  await expect(page.locator('.monaco-editor')).toBeVisible()
}
async function openExplorer(page:import('@playwright/test').Page){
  const explorer=page.getByRole('tree',{name:'Project explorer',exact:true})
  if(!await explorer.isVisible())await page.getByRole('button',{name:'Show project explorer',exact:true}).click()
  await expect(explorer).toBeVisible()
}
// Phase5 replaces the More-actions Save All/Build buttons with canonical palette entries.
// The tests still verify the actual saved revisions and compiler diagnostics below.
async function paletteCommand(page: import('@playwright/test').Page, id: 'file.saveAll' | 'execution.build') {
  await page.keyboard.press('ControlOrMeta+Shift+P')
  const palette = page.getByRole('dialog', { name: 'Command Palette', exact: true })
  const search = palette.getByRole('combobox', { name: 'Search commands', exact: true })
  await search.fill(id)
  await expect(palette.getByRole('option')).toHaveCount(1)
  await expect(palette.getByRole('option')).toHaveAttribute('aria-disabled', 'false')
  await search.press('Enter')
  await expect(palette).toHaveCount(0)
}
async function executionPhase(request: import('@playwright/test').APIRequestContext, projectId: string, phase: ExecutionSession['phase']) {
  await expect.poll(async () => {
    const response = await request.get('/api/execution/current')
    const session = await response.json() as ExecutionSession | null
    return session?.projectId === projectId ? session.phase : 'different project'
  }, { timeout: 45_000, intervals: [100, 250, 500] }).toBe(phase)
  const session=await (await request.get('/api/execution/current')).json() as ExecutionSession
  await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:session.id,phase:session.phase,rawEvents:session.rawEvents.length,buildSuccess:session.build?.success}),contentType:'application/json'})
  return session
}
async function openConsole(page: import('@playwright/test').Page,phase:'COMPLETED'|'WAITING_INPUT'='COMPLETED') {
  await expect(page.locator('.shell-state')).toHaveAttribute('data-state',phase)
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))))
  await openDock(page,'Console')
  await expect(page.locator('.ide-console-output')).toBeVisible()
}
const consoleText = (page: import('@playwright/test').Page, channel: 'stdout' | 'stderr') =>
  page.locator(`.ide-console-output .console-line.ide-console-${channel} .console-line-preview`).allTextContents().then((lines) => lines.join(''))

test('real IDE edits and saves Java files across tabs and reload', async ({ page, request }) => {
  const id = await imported(request, 'Edits', [
    { path: 'Main.java', content: 'public class Main { public static void main(String[] args) { System.out.println("Before"); } }' },
    { path: 'Helper.java', content: 'class Helper {}' },
  ])
  await openProject(page, id)
  await openExplorer(page)
  await page.locator('.ide-tree-name').filter({ hasText: 'Main.java' }).click()
  await expect(page.locator('.ide-editor-foot')).toContainText('Main.java')
  await page.locator('.monaco-editor').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('public class Main { public static void main(String[] args) { System.out.println("After"); } }')
  await expect(page.locator('.ide-dirty')).toBeVisible()
  await paletteCommand(page, 'file.saveAll')
  await expect(page.locator('.ide-dirty')).toHaveCount(0)
  await page.locator('.ide-tree-name').filter({ hasText: 'Helper.java' }).click()
  await expect(page.locator('.ide-tab')).toHaveCount(2)
  await page.reload()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.locator('.ide-tab')).toHaveCount(2)
  const file = await (await request.get(`/api/projects/${id}/files?path=Main.java`)).json()
  expect(file.content).toContain('After')
})

test('javac Problems navigate to the exact file and Monaco marker', async ({ page, request }) => {
  const id = await imported(request, 'Compiler', [{ path: 'Main.java', content: 'public class Main {\n public static void main(String[] args) {\n  UnknownType x;\n }\n}\n' }])
  await openProject(page, id)
  await paletteCommand(page, 'execution.build')
  const problem = page.locator('.ide-problem').filter({ hasText: 'cannot find symbol' }).first()
  await expect(problem).toContainText('cannot find symbol')
  await problem.click()
  await expect(page.locator('.monaco-editor .squiggly-error')).toBeVisible()
  await expect(page.locator('.ide-editor-foot')).toContainText('Main.java')
})

test('Run streams actual stdout, stderr and completion into the console', async ({ page, request }) => {
  const id = await imported(request, 'Output', [{ path: 'Main.java', content: 'public class Main { public static void main(String[] args) { System.out.println("Hello GGJavaEZ"); System.err.println("error channel"); } }' }])
  await openProject(page, id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const session = await executionPhase(request, id, 'COMPLETED')
  expect(session.rawEvents.length).toBeGreaterThan(0)
  expect(session.stdout).toContain('Hello GGJavaEZ')
  expect(session.stderr).toContain('error channel')
  await expect(page.locator('.shell-state')).toHaveAttribute('data-state','COMPLETED')
  await openConsole(page)
  await expect.poll(() => consoleText(page, 'stdout')).toContain('Hello GGJavaEZ')
  await expect.poll(() => consoleText(page, 'stderr')).toContain('error channel')
  await expect(page.getByRole('slider', { name: 'Recorded execution position' })).toBeVisible()
})

test('runtime failure retains trace and navigates its project frame', async ({ page, request }) => {
  const id = await imported(request, 'Crash', [{ path: 'Main.java', content: 'public class Main {\n public static void main(String[] a) {\n  String value = null;\n  System.out.println(value.length());\n }\n}\n' }])
  await openProject(page, id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const session = await executionPhase(request, id, 'FAILED')
  expect(session.failureKind).toBe('runtime')
  expect(session.terminalStatus).toBe('program_crashed')
  expect(session.rawEvents.length).toBeGreaterThan(0)
  await openDock(page,'Errors')
  const explorer = page.getByRole('region', { name: 'Error Explorer' })
  await expect(explorer).toContainText('NullPointerException')
  await explorer.locator('.debug-source').filter({ hasText: 'Main.java:4' }).click()
  await expect(page.locator('.ide-editor-foot')).toContainText('Main.java')
  await expect(page.locator('.monaco-editor .gg-source-exception-line')).toBeVisible()
})

test('Run opens the runtime and timeline inside the IDE workspace', async ({ page, request }) => {
  const id = await imported(request, 'Workspace', [{ path: 'Main.java', content: 'public class Main { public static void main(String[] args) { int answer = 42; System.out.println(answer); } }' }])
  await openProject(page, id)
  const startRequest = page.waitForRequest((entry) => entry.method() === 'POST' && new URL(entry.url()).pathname === `/api/projects/${id}/execution`)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  expect((await startRequest).postDataJSON()).toMatchObject({ kind: 'run', withoutVisualization: false })
  const session = await executionPhase(request, id, 'COMPLETED')
  expect(session.rawEvents.length).toBeGreaterThan(0)
  await expect(page).toHaveURL(/\/ide$/)
  await expect(page.locator('.shell .world-canvas canvas')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Runtime world' })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Recorded execution position' })).toBeVisible()
  await expect(page.locator('.ide-editor-panel')).toBeVisible()
  await openConsole(page)
  await expect.poll(() => consoleText(page, 'stdout')).toContain('42')
})

test('dirty drafts survive reload and close offers save, discard or cancel', async ({ page, request }) => {
  const id = await imported(request, 'Draft', [{ path: 'Main.java', content: 'class Main {}' }])
  await openProject(page, id)
  await page.locator('.monaco-editor').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('class Main { int kept = 7; }')
  await page.getByRole('button', { name: 'Close Main.java' }).click()
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  page.on('dialog', (dialog) => dialog.accept())
  await page.reload()
  await expect(page.locator('.ide-dirty')).toBeVisible()
  await expect(page.locator('.monaco-editor')).toContainText('kept')
  await page.getByRole('button', { name: 'Close Main.java' }).click()
  await page.getByRole('dialog',{name:'Unsaved changes',exact:true}).getByRole('button', { name: 'Save',exact:true }).click()
  await expect(page.locator('.ide-tab')).toHaveCount(0)
  expect((await (await request.get(`/api/projects/${id}/files?path=Main.java`)).json()).content).toContain('kept = 7')
})

test('project tree creates, renames and deletes relative files with confirmation', async ({ page, request }) => {
  const id = await imported(request, 'Tree', [{ path: 'Main.java', content: 'class Main {}' }])
  await openProject(page, id)
  await openExplorer(page)
  await page.getByRole('button', { name: 'Create Folder' }).click()
  await page.getByRole('dialog', { name: 'New Folder' }).getByRole('textbox').fill('src')
  await page.getByRole('dialog', { name: 'New Folder' }).getByRole('button', { name: 'Create' }).click()
  await expect(page.locator('.ide-tree-name').filter({ hasText: 'src' })).toBeVisible()
  await page.getByRole('button', { name: 'Create File' }).click()
  await page.getByRole('dialog', { name: 'New File' }).getByRole('textbox').fill('src/Helper.java')
  await page.getByRole('dialog', { name: 'New File' }).getByRole('button', { name: 'Create' }).click()
  await expect(page.locator('.ide-tab')).toHaveCount(2)
  await page.getByRole('treeitem', { name: 'J Helper.java' }).press('F2')
  await page.getByRole('dialog', { name: 'Rename' }).getByRole('textbox').fill('src/Utility.java')
  await page.getByRole('dialog', { name: 'Rename' }).getByRole('button', { name: 'Rename' }).click()
  await expect(page.locator('.ide-tab').filter({ hasText: 'Utility.java' })).toBeVisible()
  await page.getByRole('treeitem', { name: 'J Utility.java' }).press('Delete')
  await page.getByRole('dialog', { name: 'Delete' }).getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('.ide-tree-name').filter({ hasText: 'Utility.java' })).toHaveCount(0)
})

test('Scanner stdin and Stop/rerun stay connected to the actual JVM', async ({ page, request }) => {
  const id = await imported(request, 'Scanner', [{ path: 'Main.java', content: 'import java.util.Scanner; public class Main { public static void main(String[] a) { System.out.println("Name?"); System.out.println("Hello " + new Scanner(System.in).nextLine()); } }' }])
  await openProject(page, id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const first = await executionPhase(request, id, 'WAITING_FOR_INPUT')
  await openConsole(page,'WAITING_INPUT')
  await expect.poll(() => consoleText(page, 'stdout')).toContain('Name?')
  await page.getByLabel('Console input').fill('Ada')
  await page.getByLabel('Console input').press('Enter')
  const completed = await executionPhase(request, id, 'COMPLETED')
  expect(completed.id).toBe(first.id)
  expect(completed.rawEvents.some((event) => event.type === 'stdin_read')).toBe(true)
  await expect.poll(() => consoleText(page, 'stdout')).toContain('Hello Ada')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const second = await executionPhase(request, id, 'WAITING_FOR_INPUT')
  expect(second.id).not.toBe(first.id)
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  const stopped = await executionPhase(request, id, 'STOPPED')
  expect(stopped.id).toBe(second.id)
  await expect(page.getByLabel('Console input')).toBeDisabled()
  await expect(page.locator('.shell-state')).toContainText('Stopped by user')
})

test('draft reload does not overwrite a newer server revision', async ({ page, request }) => {
  const id = await imported(request, 'Conflict', [{ path: 'Main.java', content: 'class Main {}' }])
  await openProject(page, id)
  await page.locator('.monaco-editor').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('class Main { int myDraft = 1; }')
  const disk = await (await request.get(`/api/projects/${id}/files?path=Main.java`)).json()
  await request.put(`/api/projects/${id}/files`, { data: { path: 'Main.java', revision: disk.revision, content: 'class Main { int externalEdit = 2; }' } })
  page.on('dialog', (dialog) => dialog.accept())
  await page.reload()
  await expect(page.locator('.monaco-editor')).toContainText('myDraft')
  await paletteCommand(page, 'file.saveAll')
  await page.getByRole('button',{name:/^Java language service /}).click()
  await expect(page.getByRole('dialog',{name:'Workspace status',exact:true})).toContainText('File changed on disk')
  expect((await (await request.get(`/api/projects/${id}/files?path=Main.java`)).json()).content).toContain('externalEdit')
})

test('folder import preserves Java source paths and source expansion is keyboard accessible', async ({ page,request }) => {
  const root = await mkdtemp(join(tmpdir(), 'ggjavaez-import-'))
  try {
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src', 'Main.java'), 'public class Main { public static void main(String[] a) { System.out.println("Imported"); } }')
    await page.goto('/ide')
    await expect(page.getByRole('heading', { name:'Open Project', exact:true })).toBeVisible()
    await page.locator('input[type=file]').setInputFiles(root)
    await expect(page.locator('.ide-editor-foot')).toContainText('src/Main.java')
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(page.locator('.shell-state')).toHaveAttribute('data-state','COMPLETED', { timeout: 45_000 })
    const projectId=await page.getByRole('button',{name:'Project menu',exact:true}).getAttribute('data-project-id')
    expect(projectId).toBeTruthy()
    const session=await executionPhase(request,projectId!,'COMPLETED')
    expect(session.stdout).toContain('Imported')
    const slider=page.getByRole('slider',{name:'Recorded execution position',exact:true})
    await expect(slider).toHaveAttribute('aria-valuetext','Program completed')
    const cursor=await slider.getAttribute('aria-valuenow')
    const editor = page.locator('.ide-editor-panel')
    await expect(page.locator('.shell .world-canvas canvas')).toBeVisible()
    const viewport=page.viewportSize()!
    await expect.poll(async () => {
      const width = (await editor.boundingBox())!.width
      return Math.abs(width - Math.max(340,Math.min(470,viewport.width*.25)))
    }).toBeLessThan(2)
    const before = (await editor.boundingBox())!.width
    await page.getByRole('button', { name: 'Expand source for editing',exact:true }).focus()
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await editor.boundingBox())!.width).toBeGreaterThan(before)
    await expect.poll(async()=>Math.abs((await editor.boundingBox())!.width-viewport.width*.48)).toBeLessThan(viewport.width*.02)
    await page.locator('.monaco-editor').click()
    await page.keyboard.press('Escape')
    await expect.poll(async()=>Math.abs((await editor.boundingBox())!.width-viewport.width*.48)).toBeLessThan(viewport.width*.02)
    await page.getByRole('button',{name:'Collapse source',exact:true}).focus()
    await page.keyboard.press('Escape')
    await expect.poll(async()=>Math.abs((await editor.boundingBox())!.width-before)).toBeLessThan(2)
    await expect(page.getByRole('slider',{name:'Recorded execution position',exact:true})).toHaveAttribute('aria-valuenow',cursor!)
    expect((await (await request.get('/api/execution/current')).json() as ExecutionSession).id).toBe(session.id)
    await openConsole(page)
    await expect.poll(() => consoleText(page, 'stdout')).toContain('Imported')
  } finally { await rm(root, { recursive: true, force: true }) }
})
