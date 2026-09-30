import { expect, test, type Page } from '@playwright/test'

const finalCursor = 21

async function expectCursor(page: Page, cursor: number) {
  await expect(page.getByRole('slider', { name: 'Scrub execution' })).toHaveValue(String(cursor))
  await expect(page.locator('.vj-timeline__count')).toHaveText(`${cursor} / ${finalCursor}`)
}

async function expectSelectedPerson(page: Page) {
  await expectCursor(page, 18)
  await expect(page.getByLabel('Select runtime entity')).toHaveValue('object:person:17')
  await expect(page.getByRole('heading', { name: 'Person #17', exact: true })).toBeVisible()
  await expect(page.getByLabel('Runtime inspector').locator('.inspector-row').filter({ hasText: 'age' })).toContainText('18')
}

test('4× playback naturally completes, stays final, and explicitly replays deterministically', async ({ page }) => {
  await page.goto('/examples')
  await page.getByLabel('Playback speed').selectOption('4')
  await expectCursor(page, 0)
  await page.getByRole('button', { name: 'Play execution', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause execution', exact: true })).toBeVisible()
  // All 21 real timers must run; no seeks or mocked clocks in this completion check.
  await expect(page.getByRole('button', { name: 'Replay execution', exact: true })).toBeVisible({ timeout: 6_000 })
  await expectCursor(page, finalCursor)
  await expect(page.getByRole('button', { name: 'Next event', exact: true })).toBeDisabled()
  const finalEvent = await page.locator('.vj-timeline__event').innerText()
  await page.waitForTimeout(1_000)
  await expectCursor(page, finalCursor)
  await expect(page.getByRole('button', { name: 'Replay execution', exact: true })).toBeVisible()
  await expect(page.locator('.vj-timeline__event')).toHaveText(finalEvent)

  await page.getByRole('button', { name: 'Previous event', exact: true }).click()
  await expectCursor(page, 20)
  await expect(page.getByRole('button', { name: 'Play execution', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next event', exact: true }).click()
  await expectCursor(page, finalCursor)

  await page.getByRole('button', { name: 'Replay execution', exact: true }).click()
  await expectCursor(page, 0)
  await expect(page.getByRole('button', { name: 'Pause execution', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Replay execution', exact: true })).toBeVisible({ timeout: 6_000 })
  await expectCursor(page, finalCursor)
  await expect(page.locator('.vj-timeline__event')).toHaveText(finalEvent)
})

test('first and last seeks pause playback and reconstruct the same final Person state', async ({ page }) => {
  await page.goto('/examples')
  const scrub = page.getByRole('slider', { name: 'Scrub execution' })
  await page.getByRole('button', { name: 'Play execution', exact: true }).click()
  await scrub.fill(String(finalCursor))
  await expectCursor(page, finalCursor)
  await expect(page.getByRole('button', { name: 'Replay execution', exact: true })).toBeVisible()
  await page.getByLabel('Select runtime entity').selectOption('object:person:17')
  const inspector = page.getByLabel('Runtime inspector')
  await expect(inspector.locator('.inspector-row').filter({ hasText: 'age' })).toContainText('18')
  const finalEvent = await page.locator('.vj-timeline__event').innerText()

  for (let cycle = 0; cycle < 2; cycle++) {
    await scrub.fill('0')
    await expectCursor(page, 0)
    await expect(page.getByRole('button', { name: 'Previous event', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Play execution', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Outside this moment', exact: true })).toBeVisible()
    await scrub.fill(String(finalCursor))
    await expectCursor(page, finalCursor)
    await expect(page.getByRole('button', { name: 'Next event', exact: true })).toBeDisabled()
    await expect(page.getByRole('heading', { name: 'Person #17', exact: true })).toBeVisible()
    await expect(inspector.locator('.inspector-row').filter({ hasText: 'age' })).toContainText('18')
    await expect(page.locator('.vj-timeline__event')).toHaveText(finalEvent)
  }
})

test('Classic → Spatial preserves cursor, mutation, source, and selected Person identity', async ({ page }) => {
  await page.goto('/examples')
  await page.getByRole('slider', { name: 'Scrub execution' }).fill('18')
  await page.getByLabel('Select runtime entity').selectOption('object:person:17')
  await page.getByRole('button', { name: 'Runtime focus mode', exact: true }).click()
  await expectSelectedPerson(page)
  await expect(page.locator('.source-current-line')).toContainText('this.age = age')
  const execution = await page.locator('.vj-timeline__event').innerText()
  const guided = page.getByRole('button', { name: 'Guided execution', exact: true })
  await expect(guided).toHaveAttribute('aria-pressed', 'true')

  for (const view of ['Classic', 'Spatial', 'Classic', 'Spatial']) {
    await page.getByRole('button', { name: view, exact: true }).click()
    await expect(page.getByRole('button', { name: view, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expectSelectedPerson(page)
    await expect(page.locator('.source-current-line')).toContainText('this.age = age')
    await expect(page.locator('.vj-timeline__event')).toHaveText(execution)
    await expect(guided).toHaveAttribute('aria-pressed', 'true')
  }
})

test('Guided execution toggles independently of representation and retains shared state', async ({ page }) => {
  await page.goto('/examples')
  await page.getByRole('slider', { name: 'Scrub execution' }).fill('18')
  await page.getByLabel('Select runtime entity').selectOption('object:person:17')
  const guided = page.getByRole('button', { name: 'Guided execution', exact: true })
  await expect(guided).toHaveAttribute('aria-pressed', 'true')
  await guided.click()
  await expect(guided).toHaveAttribute('aria-pressed', 'false')
  for (const view of ['Classic', 'Spatial']) {
    const viewButton = page.getByRole('button', { name: view, exact: true })
    await viewButton.click()
    await expect(viewButton).toHaveAttribute('aria-pressed', 'true')
    await expectSelectedPerson(page)
    await expect(guided).toHaveAttribute('aria-pressed', 'false')
    await guided.click()
    await expect(guided).toHaveAttribute('aria-pressed', 'true')
    await expect(viewButton).toHaveAttribute('aria-pressed', 'true')
    await expectSelectedPerson(page)
    await guided.click()
    await expect(guided).toHaveAttribute('aria-pressed', 'false')
  }
})
