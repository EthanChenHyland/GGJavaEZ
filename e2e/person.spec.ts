import { expect, test } from '@playwright/test'

test('the Person state can be inspected and reconstructed in either direction', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Go to event 18: age: 0 → 18' }).click()
  await page.getByRole('button', { name: 'Home' }).first().click()
  await expect(page.getByText('Mutation · age: 0 → 18')).toBeVisible()
  await page.waitForTimeout(700)
  await page.mouse.click(1200, 470)
  await expect(page.getByRole('heading', { name: 'Person #17' })).toBeVisible()
  await expect(page.locator('.inspector-row').filter({ hasText: 'age' })).toContainText('18')

  await page.getByRole('button', { name: 'Previous event' }).click()
  await expect(page.locator('.inspector-row').filter({ hasText: 'age' })).toContainText('0')
  await page.getByRole('button', { name: 'Next event' }).click()
  await expect(page.locator('.inspector-row').filter({ hasText: 'age' })).toContainText('18')

  await page.locator('button[title="Focus selected entity"]').click()
  await expect(page.locator('.world-label')).toContainText('FOCUS ENTITY')
  await page.locator('button[title="Trace selected relationship"]').click()
  await expect(page.locator('.world-label')).toContainText('TRACE PATH')
  await page.getByRole('button', { name: 'Home' }).first().click()
  await expect(page.locator('.world-label')).toContainText('HOME')
})

test('camera input takes control while playback continues', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Go to event 9: Allocate Person #17' }).click()
  await page.getByRole('button', { name: 'Play execution' }).click()
  await expect(page.getByRole('button', { name: 'Pause execution' })).toBeVisible()

  await page.mouse.move(690, 450)
  await page.mouse.down()
  await page.mouse.move(760, 480, { steps: 10 })
  await page.mouse.up()
  await expect(page.locator('.world-label')).toContainText('FREE EXPLORE')
  await expect(page.getByLabel('Runtime inspector')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pause execution' })).toBeVisible()
  await expect.poll(async () => Number((await page.locator('.vj-timeline__count').innerText()).split('/')[0].trim())).toBeGreaterThan(9)
})

test('reference picking, pan, and dolly work in the same world', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Go to event 18: age: 0 → 18' }).click()
  await page.getByRole('button', { name: 'Home' }).first().click()
  await page.waitForTimeout(700)
  // Pick the reference at its position beneath the compact canvas toolbar.
  await page.mouse.click(980, 490)
  await expect(page.getByRole('heading', { name: 'Reference path' })).toBeVisible()
  await expect(page.locator('.inspector')).toContainText('Person #17')
  await page.getByRole('button', { name: 'Close inspector' }).click()

  const canvas = page.locator('.world-canvas canvas').first()
  const before = await canvas.screenshot()
  await page.mouse.move(960, 520)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(1005, 535, { steps: 8 })
  await page.mouse.up({ button: 'right' })
  const afterPan = await canvas.screenshot()
  expect(afterPan.equals(before)).toBe(false)
  await expect(page.locator('.world-label')).toContainText('FREE EXPLORE')

  await page.mouse.move(970, 500)
  await page.mouse.wheel(0, -380)
  await page.waitForTimeout(150)
  const afterDolly = await canvas.screenshot()
  expect(afterDolly.equals(afterPan)).toBe(false)
  await page.getByRole('button', { name: 'Home' }).first().click()
  await expect(page.locator('.world-label')).toContainText('HOME')
})


test('keyboard inspection, source focus, Follow toggle, and low effects preserve state', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Go to event 18: age: 0 → 18' }).click()
  await page.getByLabel('Select runtime entity').selectOption('object:person:17')
  await expect(page.getByRole('heading', { name: 'Person #17' })).toBeVisible()
  await page.getByRole('button', { name: 'Runtime focus mode' }).click()
  await expect(page.locator('.source-current-line')).toContainText('this.age = age')
  await page.getByLabel('Rendering quality').selectOption('low')
  await expect(page.locator('.inspector-row').filter({ hasText: 'age' })).toContainText('18')
  await page.getByRole('button', { name: 'Follow execution', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Follow execution', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Return to execution' })).toBeVisible()
  await page.getByRole('button', { name: 'Return to execution' }).click()
  await expect(page.locator('.world-label')).toContainText('GUIDED FOLLOW')
})

test('reduced motion and arbitrary scrubbing retain exact source and object state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  for (const [cursor, age] of [[18, '18'], [10, '0'], [17, '0'], [18, '18']]) {
    await page.getByRole('slider', { name: 'Scrub execution' }).fill(String(cursor))
    await page.getByLabel('Select runtime entity').selectOption('object:person:17')
    await expect(page.locator('.inspector-row').filter({ hasText: 'age' })).toContainText(age)
  }
  await page.getByRole('button', { name: 'Runtime focus mode' }).click()
  await expect(page.locator('.source-current-line')).toContainText('10')
})

test('the runtime and source load using local assets only', async ({ page }) => {
  const errors: string[] = []
  const remote: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
    remote.push(url.origin)
    return route.abort()
  })
  await page.goto('/')
  await page.getByRole('button', { name: /^Go to event 18:/ }).click()
  await expect(page.locator('.monaco-editor .executing-line')).toBeVisible()
  await page.getByLabel('Select runtime entity').selectOption('object:person:17')
  await expect(page.getByRole('heading', { name: 'Person #17' })).toBeVisible()
  await page.waitForTimeout(400)
  expect(errors).toEqual([])
  expect(remote).toEqual([])
})
