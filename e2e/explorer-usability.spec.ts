import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

async function openProject(page: Page, request: APIRequestContext, files: { path: string; content: string }[]) {
  const response = await request.post('/api/projects/import', {
    data: { name: `Explorer usability ${randomUUID()}`, files },
  })
  expect(response.ok(), await response.text()).toBe(true)
  const { id } = await response.json() as { id: string }
  await page.addInitScript((projectId) => localStorage.setItem('ggjavaez:project', projectId), id)
  await page.goto('/ide')
  await expect(page.getByRole('tree', { name: 'Project explorer' })).toBeVisible()
  await expect(page.locator('.ide-first-use')).toHaveCount(0)
  await expect(page.locator('.monaco-editor')).toBeVisible()
  return id
}

test('first use stays unselected and offers project actions on a narrow screen', async ({ page, request }) => {
  const response = await request.post('/api/projects/import', { data: {
    name: `First use ${randomUUID()}`,
    files: [{ path: 'Main.java', content: 'class Main {}' }],
  } })
  expect(response.ok(), await response.text()).toBe(true)
  const { id } = await response.json() as { id: string }
  await page.setViewportSize({ width: 760, height: 720 })
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('first-use-initialized')) {
      localStorage.removeItem('ggjavaez:project')
      sessionStorage.setItem('first-use-initialized', 'yes')
    }
    localStorage.setItem('ggjavaez:m8:explorer', 'closed')
  })
  await page.goto('/ide')

  const firstUse = page.locator('.ide-first-use')
  await expect(firstUse.getByRole('heading', { name: 'Open Project' })).toBeVisible()
  await expect(firstUse.getByRole('button', { name: 'Import folder (copy)' })).toBeVisible()
  await expect(firstUse.getByRole('button', { name: 'New Project' })).toBeVisible()
  await expect(firstUse.getByRole('combobox', { name: 'Open existing project' })).toContainText('First use')
  await firstUse.getByRole('button', { name: 'New Project' }).click()
  await expect(page.getByRole('dialog', { name: 'New Project' })).toBeVisible()
  await page.getByRole('dialog', { name: 'New Project' }).getByRole('button', { name: 'Cancel' }).click()

  await firstUse.getByRole('combobox', { name: 'Open existing project' }).selectOption(id)
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.evaluate(() => localStorage.setItem('ggjavaez:project', 'missing-project'))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Open Project' })).toBeVisible()
})

test('root-level creation suggests existing parents and import explains its copy', async ({ page, request }) => {
  await openProject(page, request, [{ path: 'Main.java', content: 'class Main {}' }])
  await expect(page.getByRole('button', { name: 'Import folder (copy)' })).toBeVisible()
  await expect(page.locator('.ide-import-note')).toContainText('originals stay in place')

  await page.getByRole('button', { name: 'Create File' }).click()
  const fileDialog = page.getByRole('dialog', { name: 'New File' })
  await expect(fileDialog.getByRole('textbox')).toHaveValue('new-file.txt')
  await fileDialog.getByRole('textbox').press('Shift+Tab')
  await expect(fileDialog.getByRole('button', { name: 'Create' })).toBeFocused()
  await fileDialog.getByRole('button', { name: 'Create' }).press('Tab')
  await expect(fileDialog.getByRole('textbox')).toBeFocused()
  await fileDialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.locator('.ide-tree-name').filter({ hasText: 'new-file.txt' })).toBeVisible()

  await page.getByRole('button', { name: 'Create Folder' }).click()
  const folderDialog = page.getByRole('dialog', { name: 'New Folder' })
  await expect(folderDialog.getByRole('textbox')).toHaveValue('new-folder')
  await folderDialog.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('treeitem', { name: 'new-folder' })).toBeVisible()

  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByRole('dialog', { name: 'New Project' }).getByRole('textbox').fill(`Empty ${randomUUID()}`)
  await page.getByRole('dialog', { name: 'New Project' }).getByRole('button', { name: 'Create' }).click()
  await expect(page.locator('.ide-tree .ide-empty')).toBeVisible()
  await page.getByRole('button', { name: 'Create File' }).click()
  await expect(page.getByRole('dialog', { name: 'New File' }).getByRole('textbox')).toHaveValue('new-file.txt')
  await page.getByRole('dialog', { name: 'New File' }).getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Create Folder' }).click()
  await expect(page.getByRole('dialog', { name: 'New Folder' }).getByRole('textbox')).toHaveValue('new-folder')
})

test('dirty file deletion requires a decision and Cancel preserves the draft', async ({ page, request }) => {
  const id = await openProject(page, request, [{ path: 'Main.java', content: 'class Main {}' }])
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.locator('.monaco-editor').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('class Main { int changed = 1; }')
  await expect(page.locator('.ide-dirty')).toBeVisible()

  const row = page.locator('.ide-tree-name[title="Main.java"]')
  await row.press('Delete')
  await expect(page.getByRole('dialog', { name: 'Delete' })).toContainText('unsaved files')
  await page.getByRole('dialog', { name: 'Delete' }).getByRole('button', { name: 'Cancel' }).click()
  await expect(row).toBeVisible()
  await expect(page.locator('.ide-dirty')).toBeVisible()
  expect((await (await request.get(`/api/projects/${id}/files?path=Main.java`)).json()).content).toBe('class Main {}')

  await row.press('Delete')
  await page.getByRole('dialog', { name: 'Delete' }).getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(row).toHaveCount(0)
  expect((await request.get(`/api/projects/${id}/files?path=Main.java`)).status()).toBe(404)
})

test('folder deletion covers dirty descendants and menu keys wrap through actions', async ({ page, request }) => {
  const id = await openProject(page, request, [{ path: 'src/Main.java', content: 'class Main {}' }])
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.locator('.monaco-editor').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('class Main { int saved = 2; }')
  await expect(page.locator('.ide-dirty')).toBeVisible()

  const folder = page.getByRole('treeitem', { name: 'src', exact: true })
  await folder.click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Actions for src' })
  await expect(menu.getByRole('menuitem', { name: 'New File' })).toBeFocused()
  await menu.getByRole('menuitem', { name: 'New File' }).press('End')
  await expect(menu.getByRole('menuitem', { name: 'Reveal in Explorer' })).toBeFocused()
  await menu.getByRole('menuitem', { name: 'Reveal in Explorer' }).press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'New File' })).toBeFocused()
  await menu.getByRole('menuitem', { name: 'New File' }).press('Escape')
  await expect(folder).toBeFocused()

  await folder.press('Delete')
  await expect(page.getByRole('dialog', { name: 'Delete' })).toContainText('unsaved files')
  const saved = page.waitForRequest(request => request.method() === 'PUT' && request.url().includes(`/api/projects/${id}/files`))
  await page.getByRole('dialog', { name: 'Delete' }).getByRole('button', { name: 'Save and delete' }).click()
  expect((await saved).postDataJSON().content).toBe('class Main { int saved = 2; }')
  await expect(folder).toHaveCount(0)
  expect((await request.get(`/api/projects/${id}/files?path=src/Main.java`)).status()).toBe(404)
})
