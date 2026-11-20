import { expect, test, type Page } from '@playwright/test'
import { browserErrors } from './harness'
import type { ExplorerLifetimeSnapshot } from './fixtures/explorer-row-lifetime'

const firstPath = 'src/File0000.java'
const firstRow = (page: Page) => page.locator(`.ide-tree-name[title="${firstPath}"]`)
const snapshot = (page: Page): Promise<ExplorerLifetimeSnapshot> => page.evaluate(() => window.explorerRowLifetime.snapshot())
// Observe after React's native event/commit and a paint opportunity. This is not
// a timed 200ms Quick Open measurement or a substitute for the full Shell gate.
const settled = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

test('isolated production Explorer retains 5000 cached file rows and dispatches current committed callbacks and permissions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const errors = browserErrors(page)
  await page.goto('/e2e/reference/fixtures/explorer-row-lifetime.html')
  await expect(page.getByRole('treeitem')).toHaveCount(5001) // 5000 actual files and their directory.
  await firstRow(page).focus(); await expect(firstRow(page)).toBeFocused(); await settled(page)
  const initial = await snapshot(page)
  expect(initial.nameReads, 'Positive instrumentation sanity: production rendering read names').toBeGreaterThanOrEqual(5000)

  await page.getByRole('button', { name: 'Hide Explorer', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Explorer fixture pane' })).toHaveCount(0) // hidden, still mounted below
  expect(await page.locator('.ide-tree-name[role="treeitem"]').count()).toBe(5001)
  await settled(page)
  expect((await snapshot(page)).nameReads - initial.nameReads, 'Hiding must not reconstruct cached rows').toBe(0)
  const baseline = (await snapshot(page)).nameReads
  for (let update = 1; update <= 3; update++) {
    await page.getByRole('button', { name: 'Unrelated update', exact: true }).click()
    await expect.poll(async () => (await snapshot(page)).committed?.unrelated).toBe(update)
  }
  await page.getByRole('button', { name: 'Open Quick Open', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Quick Open', exact: true })
  await expect(picker.getByRole('combobox', { name: 'Search project files', exact: true })).toBeFocused()
  await expect(picker).toContainText('5000 files')
  await settled(page)
  expect((await snapshot(page)).nameReads - baseline, 'Real Picker mounting over hidden Explorer must perform zero row-name reads').toBe(0)
  await page.keyboard.press('Escape'); await expect(picker).toHaveCount(0)
  await page.getByRole('button', { name: 'Show Explorer', exact: true }).click()
  await firstRow(page).focus(); await settled(page)
  expect((await snapshot(page)).nameReads - baseline, 'Unrelated state and hide/show must preserve cached rows').toBe(0)

  for (const [index, activation] of ['right-click', 'ellipsis', 'Shift+F10'].entries()) {
    const owner = index + 1, before = await snapshot(page)
    await page.getByRole('button', { name: 'Replace callbacks', exact: true }).click()
    await expect.poll(async () => (await snapshot(page)).committed?.owner).toBe(owner)
    await settled(page)
    expect((await snapshot(page)).nameReads - before.nameReads, `${activation}: callback replacement must leave row JSX cached`).toBe(0)
    if (activation === 'right-click') await firstRow(page).click({ button: 'right' })
    else if (activation === 'ellipsis') {
      await firstRow(page).hover()
      await page.getByRole('button', { name: `Actions for ${firstPath}`, exact: true }).click()
    } else { await firstRow(page).focus(); await page.keyboard.press('Shift+F10') }
    const menu = page.getByRole('menu', { name: `Actions for ${firstPath}`, exact: true })
    await expect(menu).toBeVisible()
    const opened = await snapshot(page)
    expect(opened.events.filter(event => event.kind === 'context').at(-1), activation).toMatchObject({
      owner, path: firstPath, context: { projectId: `fixture-project-${owner}`, workspaceGeneration: owner,
        target: { projectId: `fixture-project-${owner}`, path: firstPath, kind: 'file' } },
    })

    const rename = menu.getByRole('menuitem', { name: 'Rename', exact: true })
    await expect(rename).toHaveAttribute('aria-disabled', 'false')
    // Native fixture shortcut changes props without an outside pointer event
    // dismissing the production menu. The menu must update while rows stay cached.
    await page.keyboard.press('Alt+Shift+L')
    await expect.poll(async () => (await snapshot(page)).committed?.allowRename).toBe(false)
    await expect(rename).toHaveAttribute('aria-disabled', 'true')
    await expect(rename).toHaveAccessibleDescription(`Rename blocked by fixture policy ${owner}`)
    const commandCount = (await snapshot(page)).events.filter(event => event.kind === 'command').length
    const rect = await rename.boundingBox(); expect(rect).not.toBeNull()
    await page.mouse.click(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2)
    await expect(rename).toBeFocused(); await page.keyboard.press('Enter'); await settled(page)
    expect((await snapshot(page)).events.filter(event => event.kind === 'command')).toHaveLength(commandCount)
    await expect(menu).toBeVisible()
    await page.keyboard.press('Alt+Shift+L'); await expect(rename).toHaveAttribute('aria-disabled', 'false')
    await menu.getByRole('menuitem', { name: 'Copy Path', exact: true }).click()
    await expect(menu).toHaveCount(0)
    await expect.poll(async () => (await snapshot(page)).events.filter(event => event.kind === 'command').length).toBe(commandCount + 1)
    const after = await snapshot(page)
    expect(after.events.filter(event => event.kind === 'command').at(-1), activation).toMatchObject({ owner, command: 'resource.copyPath', path: firstPath,
      context: { projectId: `fixture-project-${owner}`, workspaceGeneration: owner, target: { projectId: `fixture-project-${owner}`, path: firstPath, kind: 'file' } } })
    expect(after.events.filter(event => event.kind === 'availability').slice(-5).every(event => event.owner === owner)).toBe(true)
    expect(after.nameReads - before.nameReads, `${activation}: menu/permission changes must not reconstruct file rows`).toBe(0)
  }

  await firstRow(page).focus(); await firstRow(page).press('Enter')
  expect((await snapshot(page)).events.filter(event => event.kind === 'open').at(-1)).toMatchObject({ owner: 3, path: firstPath })
  await firstRow(page).press('F2')
  expect((await snapshot(page)).events.filter(event => event.kind === 'action').at(-1)).toMatchObject({ owner: 3, action: 'rename', path: firstPath })
  // Positive control: if the observer were disconnected, zero-read assertions
  // above would be vacuous. A real active-prop change must read names again.
  const beforeSelection = (await snapshot(page)).nameReads
  await page.getByRole('button', { name: 'Select next file', exact: true }).click()
  await expect(page.locator('.ide-tree-name[title="src/File0001.java"]')).toHaveAttribute('aria-selected', 'true')
  await expect(firstRow(page)).toHaveAttribute('aria-selected', 'false')
  expect((await snapshot(page)).nameReads - beforeSelection).toBeGreaterThanOrEqual(5000)
  await test.info().attach('explorer-row-lifetime-observations', { body: JSON.stringify({
    boundary: 'Isolated production ProjectExplorer/Picker/CommandMenu; synthetic callback ownership and policy; no JVM, filesystem effects, full Shell or latency claim.',
    initial, final: await snapshot(page),
  }, null, 2), contentType: 'application/json' })
  expect(errors).toEqual([])
})
