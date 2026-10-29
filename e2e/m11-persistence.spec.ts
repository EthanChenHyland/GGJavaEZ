import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import {TraceNormalizer} from '../src/instrumentation/normalize'
import {browserErrors,currentSession,home,focusSelection,ready,seekCursor,selectEntity} from './reference/harness'
import {projectCommand} from './reference/menuActions'
import type { ExecutionSession } from '../src/execution/contracts'

test.describe.configure({ mode: 'serial', timeout: 90_000 })

const captureRoot = process.env.VJ_QA_OUTPUT_ROOT ? `${process.env.VJ_QA_OUTPUT_ROOT}/m11` : '.ggjavaez/qa/reference-exact/persistence'

const ownedProjects=new Set<string>()
test.afterEach(async({request})=>{const session=await currentSession(request);if(session&&ownedProjects.has(session.projectId)&&['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(session.phase))expect((await request.post(`/api/execution/${session.id}/stop`,{data:{}})).ok()).toBe(true)})

async function project(request: APIRequestContext, name: string, files: { path: string; content: string }[]) {
  await mkdir(captureRoot,{recursive:true})
  const previous=await currentSession(request);expect(!previous||!['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(previous.phase),'Preserve unrelated active execution').toBe(true)
  const response = await request.post('/api/projects/import', { data: { name: `M11 ${name} ${randomUUID()}`, files } })
  expect(response.ok(), await response.text()).toBe(true)
  const id=(await response.json()).id as string;ownedProjects.add(id);return id
}

async function open(page: Page, id: string) {
  await page.addInitScript((projectId) => {
    localStorage.setItem('ggjavaez:project', projectId)
    localStorage.removeItem('ggjavaez:runtime-view')
    localStorage.removeItem('ggjavaez:animation-quality')
  }, id)
  await page.goto('/?qa=1')
  await page.waitForFunction(id=>document.querySelector('[data-project-id]')?.getAttribute('data-project-id')===id,id)
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.getByLabel('Runtime ready')).toBeVisible();await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled()
}

async function phase(request: APIRequestContext, id: string, wanted: ExecutionSession['phase']) {
  await expect.poll(async () => {
    const session = await (await request.get('/api/execution/current')).json() as ExecutionSession | null
    return session?.projectId === id ? session.phase : 'different project'
  }, { timeout: 45_000, intervals: [100, 250, 500] }).toBe(wanted)
  return (await (await request.get('/api/execution/current')).json()) as ExecutionSession
}

test('real Person execution leaves navigable historical calls and final state; Replay does not rerun Java', async ({ page, request }) => {
  const errors=browserErrors(page)
  const id = await project(request, 'Person persistence', [
    { path: 'Main.java', content: 'public class Main {\n  public static void main(String[] args) {\n    Person p = new Person("Ethan");\n    p.setAge(18);\n    System.out.println(p.age);\n  }\n}\n' },
    { path: 'Person.java', content: 'public class Person {\n  String name;\n  int age;\n  Person(String name) { this.name = name; }\n  void setAge(int age) { this.age = age; }\n}\n' },
  ])
  await open(page, id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const completed = await phase(request, id, 'COMPLETED')
  expect(completed.stdout).toContain('18')
  expect(completed.rawEvents.some((event) => event.type === 'field')).toBe(true)
  expect(completed.stdout).toBe('18\n');expect(completed.exitCode).toBe(0);expect(completed.recording?.state).toBe('FULL');expect(completed.build?.success).toBe(true)
  await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:completed.id,rawEvents:completed.rawEvents.length,buildSuccess:true}),contentType:'application/json'})
  await expect(page.locator('.world-canvas canvas')).toBeVisible()
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld?.scene().recordingId)).toBe(`execution:${completed.id}`)
  const normalizer=new TraceNormalizer(completed.sourceManifest);normalizer.append(completed.rawEvents)
  const normalized=normalizer.finish({status:'complete',exitCode:0,diagnostic:null}),maximum=normalized.trace.events.length;normalizer.history.dispose()
  const rail=page.getByRole('slider',{name:'Recorded execution position',exact:true});await expect(rail).toHaveAttribute('aria-valuemax',String(maximum));await seekCursor(page,maximum);await home(page)
  expect(await page.evaluate(()=>window.__ggjavaezWorld!.quality().setting)).toBe('INTERACTIVE')
  // Historical invocation states remain canonical even when their bodies are budgeted.
  const scene=await page.evaluate(()=>window.__ggjavaezWorld!.scene())
  for(const method of ['main(','setAge('])expect(Object.values(scene.entities).some(node=>node.kind==='frame'&&node.title.includes(method)&&node.status.kind==='returned')).toBe(true)
  const person=Object.values(scene.entities).find(node=>node.kind==='object'&&node.title==='Person');expect(person).toBeDefined()
  await selectEntity(page,person!.id)
  const inspector=page.getByRole('complementary',{name:'Selection inspector',exact:true})
  await expect(inspector).toContainText('18');await expect(inspector.getByRole('button',{name:'Inspect age',exact:true})).toHaveText('18')
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('setAge')
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('visual-java:text-preload-ready').length)).toBeGreaterThan(0)
  // Source/Inspector DOM can arrive before the text atlas and the guided move
  // settle. Capture the readable world rather than a transient loading frame.
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${captureRoot}/person-before-focus-1440x900.png`, animations: 'disabled' })
  await focusSelection(page)
  await page.waitForTimeout(650)
  await page.screenshot({ path: `${captureRoot}/person-focus-1440x900.png`, animations: 'disabled' })
  await home(page)
  await mkdir(captureRoot, { recursive: true })
  for (const [width, height] of [[1728, 1117], [1440, 900], [1280, 800], [760, 900]]) {
    await page.setViewportSize({ width, height })
    await home(page)
    await page.waitForTimeout(450)
    await page.screenshot({ path: `${captureRoot}/person-completed-${width}x${height}.png`, animations: 'disabled' })
  }
  // Requirements 30.7/30.11 allow the narrow sheet to cover timeline controls.
  // Dismiss that real surface before exercising the underlying pointer targets.
  await inspector.getByRole('button',{name:'Close inspector',exact:true}).click();await expect(inspector).toHaveCount(0)
  await seekCursor(page,0);await expect(rail).toHaveAttribute('aria-valuenow','0')
  await page.getByRole('button',{name:'Return to Live',exact:true}).click();await expect(rail).toHaveAttribute('aria-valuenow',String(maximum));await ready(page)
  await page.locator('summary[aria-label="Timeline settings"]').click()
  const settings=page.locator('.gg-time-settings-menu')
  await settings.getByRole('combobox',{name:'Playback speed',exact:true}).selectOption('4')
  await settings.getByRole('button',{name:'Replay from before execution',exact:true}).click()
  await expect.poll(()=>rail.getAttribute('aria-valuenow'),{timeout:30000}).toBe(String(maximum))
  const current = (await (await request.get('/api/execution/current')).json()) as ExecutionSession
  expect(current.id).toBe(completed.id)
  expect(await page.evaluate(id=>window.__ggjavaezWorld!.scene().entities[id]?.id,person!.id)).toBe(person!.id)
  await expect(page.locator('.world-canvas canvas')).toBeVisible();expect(errors).toEqual([])
})

test('a general nested-package project can be opened, edited, saved, and run', async ({ page, request }) => {
  const errors=browserErrors(page)
  const id = await project(request, 'General tools project', [
    { path: 'visualjava.project.json', content: '{"sourceRoots":["src"]}' },
    { path: 'src/tools/Main.java', content: 'package tools;\n\npublic class Main {\n  public static void main(String[] args) {\n    System.out.println(Formatter.message(7));\n  }\n}\n' },
    { path: 'src/tools/Formatter.java', content: 'package tools;\n\nfinal class Formatter {\n  static String message(int value) { return "generic=" + value; }\n}\n' },
  ])
  await open(page, id)

  // The explorer must handle a real source root and package directory, not
  // only the root-level Main.java used by the demo fixture.
  const showExplorer = page.getByRole('button', { name: 'Show project explorer', exact: true })
  if (await showExplorer.isVisible()) await showExplorer.click()
  const sourceRoot = page.getByRole('treeitem', { name: 'src', exact: true })
  await expect(sourceRoot).toBeVisible()
  if (await sourceRoot.getAttribute('aria-expanded') === 'false') await sourceRoot.click()
  const packageDirectory = page.getByRole('treeitem', { name: 'tools', exact: true })
  await expect(packageDirectory).toBeVisible()
  if (await packageDirectory.getAttribute('aria-expanded') === 'false') await packageDirectory.click()
  const main = page.getByRole('treeitem', { name: 'J Main.java', exact: true })
  await expect(main).toBeVisible()
  await main.click()
  await expect(page.locator('.ide-editor-foot')).toContainText('src/tools/Main.java')

  await projectCommand(page,'workbench.explorer');await expect(page.getByRole('tree',{name:'Project explorer',exact:true})).toBeHidden()
  await page.getByRole('textbox',{name:'Editor content',exact:true}).focus()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('package tools;\n\npublic class Main {\n  public static void main(String[] args) {\n    System.out.println("edited-general-project");\n  }\n}\n')
  await expect(page.locator('.ide-dirty')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Shift+P')
  const palette = page.getByRole('dialog', { name: 'Command Palette', exact: true })
  const search = palette.getByRole('combobox', { name: 'Search commands', exact: true })
  await search.fill('file.saveAll')
  await expect(palette.getByRole('option')).toHaveCount(1)
  await expect(palette.getByRole('option')).toHaveAttribute('aria-disabled', 'false')
  await search.press('Enter')
  await expect(palette).toHaveCount(0)
  await expect(page.locator('.ide-dirty')).toHaveCount(0)

  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const completed = await phase(request, id, 'COMPLETED')
  expect(completed.exitCode).toBe(0);expect(completed.recording?.state).toBe('FULL');expect(completed.build?.success).toBe(true);expect(completed.rawEvents.length).toBeGreaterThan(0)
  await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:completed.id,rawEvents:completed.rawEvents.length,buildSuccess:true}),contentType:'application/json'})
  expect(completed.stdout).toContain('edited-general-project')
  expect(completed.stdout).not.toContain('Person')
  expect(completed.build?.javaProject?.sourceRoots).toContain('src')
  await expect(page.locator('.world-canvas canvas')).toBeVisible();expect(errors).toEqual([])
})
