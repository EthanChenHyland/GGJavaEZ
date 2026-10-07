import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import type { ExecutionSession } from '../src/execution/contracts'

test.describe.configure({ mode: 'serial', timeout: 90_000 })

async function currentPhase(request: APIRequestContext, projectId: string, phase: ExecutionSession['phase']) {
  await expect.poll(async () => {
    const session = await (await request.get('/api/execution/current')).json() as ExecutionSession | null
    return session?.projectId === projectId ? session.phase : 'different project'
  }, { timeout: 45_000 }).toBe(phase)
  return await (await request.get('/api/execution/current')).json() as ExecutionSession
}

test('a new failed or console-only session labels the previous world and shows only current output', async ({ page, request }) => {
  const created = await request.post('/api/projects/import', { data: {
    name: `Recording handoff ${randomUUID()}`,
    files: [{ path: 'Main.java', content: 'public class Main { public static void main(String[] args) { System.out.println("first-output"); } }' }],
  } })
  expect(created.ok(), await created.text()).toBe(true)
  const { id } = await created.json() as { id: string }
  await page.addInitScript((projectId) => localStorage.setItem('ggjavaez:project', projectId), id)
  await page.goto('/ide')
  await expect(page.locator('.monaco-editor')).toBeVisible()

  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const first = await currentPhase(request, id, 'COMPLETED')
  expect(first.rawEvents.length).toBeGreaterThan(0)
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
  const picker = page.getByRole('combobox', { name:'Select runtime entity' })
  await expect(picker).toContainText('main() · completed')
  await expect(page.getByRole('status', { name: 'Previous recording' })).toHaveCount(0)

  await page.locator('.monaco-editor').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('public class Main { public static void main(String[] args) { MissingType broken; } }')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await currentPhase(request, id, 'FAILED')
  await expect(page.getByRole('status', { name: 'Previous recording' })).toBeVisible()
  await expect(page.locator('.spatial-view canvas')).toBeVisible()
  await expect(picker).toContainText('main() · completed')
  await expect(page.getByRole('button', { name: /^PROBLEMS/ })).toBeVisible()
  await expect(page.locator('.ide-problems')).toContainText('cannot find symbol')
  await expect(page.locator('.monaco-editor .executing-line')).toHaveCount(0)
  await page.getByRole('button', { name: 'CONSOLE', exact: true }).click()
  await expect(page.locator('.ide-console-output')).not.toContainText('first-output')

  await page.locator('.monaco-editor').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText('public class Main { public static void main(String[] args) { System.out.println("second-output"); } }')
  // Spatial 2.0 routes this action through the shared command palette.
  await page.keyboard.press('ControlOrMeta+Shift+P')
  const palette = page.getByRole('dialog', { name: 'Command Palette' })
  await palette.getByRole('combobox').fill('Run without visualization')
  await palette.getByRole('option').filter({ hasText: 'Run without visualization' }).click()
  const second = await currentPhase(request, id, 'COMPLETED')
  expect(second.id).not.toBe(first.id)
  expect(second.support).toBe('RUN_ONLY')
  await expect(page.getByRole('status', { name: 'Previous recording' })).toBeVisible()
  await expect(picker).toContainText('main() · completed')
  await expect(page.locator('.ide-console-output')).toContainText('second-output')
  await expect(page.locator('.ide-console-output')).not.toContainText('first-output')
  await expect(page.locator('.monaco-editor .executing-line')).toHaveCount(0)
})
