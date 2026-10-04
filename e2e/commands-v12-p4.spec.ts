import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const output = `${process.env.VJ_QA_OUTPUT_ROOT ?? 'docs/checkpoints/v12-p4'}/commands`
async function rename(page: Page, from: string, to: string) {
  const showExplorer = page.getByRole('button', { name: 'Show project explorer', exact: true })
  if (await showExplorer.isVisible()) await showExplorer.click()
  await expect(page.locator(`.ide-tree-name[title="${from}"]`)).toBeVisible()
  await page.locator(`.ide-tree-name[title="${from}"]`).press('F2')
  const dialog = page.getByRole('dialog', { name: 'Rename', exact: true })
  await dialog.getByRole('textbox').fill(to)
  await dialog.getByRole('button', { name: 'Rename', exact: true }).click()
  await expect(page.locator(`.ide-tree-name[title="${to}"]`)).toBeVisible()
}

test('canonical Save All includes closed drafts; lost rename response preserves the dirty editor', async ({ page, request }) => {
  test.setTimeout(90000)
  const imported = await request.post('/api/projects/import', { data: { name: 'Phase4 receipt commands', files: [
    { path: 'Main.java', content: 'class Main {}' }, { path: 'notes.txt', content: 'original' },
  ] } })
  const { id } = await imported.json()
  const note = await (await request.get(`/api/projects/${id}/files?path=notes.txt`)).json()
  await page.addInitScript(({ id, revision }) => {
    localStorage.setItem('ggjavaez:project', id)
    localStorage.setItem(`ggjavaez:draft:${id}:notes.txt`, JSON.stringify({ revision, draft: 'closed unsaved text' }))
  }, { id, revision: note.revision })
  await page.goto('/ide')
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.locator('.ide-more-actions > summary').click()
  await page.getByRole('button', { name: 'Save All', exact: true }).click()
  await expect.poll(async () => (await (await request.get(`/api/projects/${id}/files?path=notes.txt`)).json()).content).toBe('closed unsaved text')
  await page.locator('.monaco-editor').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('class Main { int unsaved = 7; }')
  await expect(page.locator('.ide-dirty')).toBeVisible()
  const nonces: string[] = []
  await page.route(`**/api/projects/${id}/rename`, async route => {
    nonces.push(route.request().postDataJSON().operationId)
    if (nonces.length === 1) { await route.fetch(); await route.abort('failed') }
    else await route.continue()
  })
  await rename(page, 'Main.java', 'Moved.java')
  expect(nonces).toHaveLength(2)
  expect(nonces[1]).toBe(nonces[0])
  await expect(page.locator('.ide-tab.is-active')).toContainText('Moved.java')
  await expect(page.locator('.ide-dirty')).toBeVisible()
  expect((await (await request.get(`/api/projects/${id}/files?path=Moved.java`)).json()).content).toBe('class Main {}')
  expect((await request.get(`/api/projects/${id}/files?path=Main.java`)).status()).toBe(404)
  await page.getByRole('button', { name: 'Close Moved.java', exact: true }).click()
  await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('.ide-tab')).toContainText('Moved.java')
  await page.locator('.monaco-editor').click()
  await page.keyboard.press('ControlOrMeta+S')
  await expect.poll(async () => (await (await request.get(`/api/projects/${id}/files?path=Moved.java`)).json()).content).toBe('class Main { int unsaved = 7; }')
  await expect(page.locator('.ide-dirty')).toHaveCount(0)
})

test('folder rename keeps captured sources immutable and proves the new highlight binding', async ({ page, request }) => {
  test.setTimeout(90000)
  const source = 'public class Main {\n public static void main(String[] args) {\n  int value = 12;\n  System.out.println(value);\n }\n}\n'
  const imported = await request.post('/api/projects/import', { data: { name: 'Phase4 source binding', files: [{ path: 'src/Main.java', content: source }] } })
  const { id } = await imported.json()
  await page.addInitScript(id => localStorage.setItem('ggjavaez:project', id), id)
  await page.goto('/ide')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const current = async () => (await request.get('/api/execution/current')).json()
  await expect.poll(async () => { const session = await current(); return session?.projectId === id ? session.phase : 'other' }, { timeout: 45000 }).toBe('COMPLETED')
  const captured = await current()
  expect(captured.stdout).toBe('12\n')
  const cursor = await page.evaluate(async session => {
    const modulePath = '/src/instrumentation/normalize.ts'
    const { TraceNormalizer } = await import(modulePath)
    const normalizer = new TraceNormalizer(session.sourceManifest)
    normalizer.append(session.rawEvents)
    const result = normalizer.finish({ status: 'complete', exitCode: 0, diagnostic: null })
    const line = result.trace.events.find((event: { type: string; source?: { line: number } }) => event.type === 'LINE_EXECUTE' && event.source?.line === 4)
    normalizer.history.dispose()
    return line.seq + 1
  }, captured)
  await page.getByRole('slider', { name: 'Scrub execution' }).fill(String(cursor))
  await expect(page.locator('.monaco-editor .executing-line')).toBeVisible()
  await rename(page, 'src', 'moved')
  await expect(page.locator('.ide-editor-foot')).toContainText('moved/Main.java')
  await expect(page.locator('.monaco-editor .executing-line')).toBeVisible()
  const after = await current()
  expect(after.id).toBe(captured.id)
  expect(after.sourceManifest).toEqual(captured.sourceManifest)
  expect(after.rawEvents).toEqual(captured.rawEvents)
  expect((await (await request.get(`/api/projects/${id}/files?path=moved%2FMain.java`)).json()).content).toBe(source)
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: `${output}/rename-history-1440x900.png` })
  await page.locator('.monaco-editor').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(source.replace('12', '99'))
  await expect(page.locator('.ide-dirty')).toBeVisible()
  await expect(page.locator('.monaco-editor .executing-line')).toHaveCount(0)
  expect((await current()).sourceManifest).toEqual(captured.sourceManifest)
})
