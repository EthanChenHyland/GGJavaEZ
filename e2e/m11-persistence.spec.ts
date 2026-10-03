import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import type { ExecutionSession } from '../src/execution/contracts'

test.describe.configure({ mode: 'serial', timeout: 90_000 })

const captureRoot = process.env.VJ_QA_OUTPUT_ROOT ? `${process.env.VJ_QA_OUTPUT_ROOT}/m11` : 'docs/checkpoints/m11'

async function project(request: APIRequestContext, name: string, files: { path: string; content: string }[]) {
  const response = await request.post('/api/projects/import', { data: { name: `M11 ${name} ${randomUUID()}`, files } })
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()).id as string
}

async function open(page: Page, id: string) {
  await page.addInitScript((projectId) => {
    localStorage.setItem('ggjavaez:project', projectId)
    localStorage.removeItem('ggjavaez:runtime-view')
    localStorage.removeItem('ggjavaez:animation-quality')
  }, id)
  await page.goto('/ide')
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.getByLabel('Runtime ready')).toBeVisible()
}

async function phase(request: APIRequestContext, id: string, wanted: ExecutionSession['phase']) {
  await expect.poll(async () => {
    const session = await (await request.get('/api/execution/current')).json() as ExecutionSession | null
    return session?.projectId === id ? session.phase : 'different project'
  }, { timeout: 45_000, intervals: [100, 250, 500] }).toBe(wanted)
  return (await (await request.get('/api/execution/current')).json()) as ExecutionSession
}

test('real Person execution leaves navigable historical calls and final state; Replay does not rerun Java', async ({ page, request }) => {
  const id = await project(request, 'Person persistence', [
    { path: 'Main.java', content: 'public class Main {\n  public static void main(String[] args) {\n    Person p = new Person("Ethan");\n    p.setAge(18);\n    System.out.println(p.age);\n  }\n}\n' },
    { path: 'Person.java', content: 'public class Person {\n  String name;\n  int age;\n  Person(String name) { this.name = name; }\n  void setAge(int age) { this.age = age; }\n}\n' },
  ])
  await open(page, id)
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const completed = await phase(request, id, 'COMPLETED')
  expect(completed.stdout).toContain('18')
  expect(completed.rawEvents.some((event) => event.type === 'field')).toBe(true)
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Spatial', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('combobox', { name: 'Rendering quality' })).toHaveValue('high')
  await expect(page.getByRole('slider', { name: 'Scrub execution' })).toHaveValue(/\d+/)
  const picker = page.getByRole('combobox', { name: 'Select runtime entity' })
  await expect(picker).toContainText('main() · completed')
  await expect(picker).toContainText('setAge() · completed')
  await expect(picker).toContainText('Person #')
  const personId = await picker.locator('option').filter({ hasText: /^Person #/ }).first().getAttribute('value')
  expect(personId).toBeTruthy()
  await picker.selectOption(personId!)
  const inspector = page.getByRole('complementary', { name: 'Runtime inspector' })
  await expect(inspector).toContainText('18')
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('setAge')
  await expect.poll(() => page.evaluate(() => performance.getEntriesByName('visual-java:text-preload-ready').length)).toBeGreaterThan(0)
  // Source/Inspector DOM can arrive before the text atlas and the guided move
  // settle. Capture the readable world rather than a transient loading frame.
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${captureRoot}/person-before-focus-1440x900.png`, animations: 'disabled' })
  await inspector.getByRole('button', { name: 'Focus', exact: true }).click()
  await page.waitForTimeout(650)
  await page.screenshot({ path: `${captureRoot}/person-focus-1440x900.png`, animations: 'disabled' })
  await inspector.getByRole('button', { name: 'Return to world', exact: true }).click()
  await page.getByRole('button', { name: 'Expand runtime' }).click()
  await page.getByRole('button', { name: 'Overview' }).click()
  await mkdir(captureRoot, { recursive: true })
  for (const [width, height] of [[1728, 1117], [1440, 900], [1280, 800], [760, 900]]) {
    await page.setViewportSize({ width, height })
    await page.getByRole('button', { name: 'Overview' }).click()
    await page.waitForTimeout(450)
    await page.screenshot({ path: `${captureRoot}/person-completed-${width}x${height}.png`, animations: 'disabled' })
  }
  await page.getByRole('slider', { name: 'Scrub execution' }).fill('0')
  await expect(page.getByRole('slider', { name: 'Scrub execution' })).toHaveValue('0')
  await page.getByRole('button', { name: /Return to Live/ }).click()
  const max = await page.getByRole('slider', { name: 'Scrub execution' }).getAttribute('max')
  await expect(page.getByRole('slider', { name: 'Scrub execution' })).toHaveValue(max!)
  await page.getByRole('combobox', { name: 'Playback speed' }).selectOption('4')
  await page.getByRole('button', { name: 'Replay recorded history' }).click()
  await expect.poll(() => page.getByRole('slider', { name: 'Scrub execution' }).inputValue(), { timeout: 30_000 }).toBe(max!)
  const current = (await (await request.get('/api/execution/current')).json()) as ExecutionSession
  expect(current.id).toBe(completed.id)
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
})

test('a general nested-package project can be opened, edited, saved, and run', async ({ page, request }) => {
  const id = await project(request, 'General tools project', [
    { path: 'visualjava.project.json', content: '{"sourceRoots":["src"]}' },
    { path: 'src/tools/Main.java', content: 'package tools;\n\npublic class Main {\n  public static void main(String[] args) {\n    System.out.println(Formatter.message(7));\n  }\n}\n' },
    { path: 'src/tools/Formatter.java', content: 'package tools;\n\nfinal class Formatter {\n  static String message(int value) { return "generic=" + value; }\n}\n' },
  ])
  await open(page, id)

  // The explorer must handle a real source root and package directory, not
  // only the root-level Main.java used by the demo fixture.
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

  await page.locator('.monaco-editor').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('package tools;\n\npublic class Main {\n  public static void main(String[] args) {\n    System.out.println("edited-general-project");\n  }\n}\n')
  await expect(page.locator('.ide-dirty')).toBeVisible()
  await page.getByLabel('More actions').click()
  await page.getByRole('button', { name: 'Save All', exact: true }).click()
  await expect(page.locator('.ide-dirty')).toHaveCount(0)

  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const completed = await phase(request, id, 'COMPLETED')
  expect(completed.exitCode).toBe(0)
  expect(completed.stdout).toContain('edited-general-project')
  expect(completed.stdout).not.toContain('Person')
  expect(completed.build?.javaProject?.sourceRoots).toContain('src')
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
})
