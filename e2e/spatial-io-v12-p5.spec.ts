import { expect, test } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'

test('authored graphless input and output keep mounted causal paths in the shared 3D world', async ({ page }) => {
  await page.addInitScript(() => { window.__VJ_QA_RENDER_METRICS__ = true })
  await page.goto('/examples')
  await page.getByRole('combobox', { name: 'Runtime example' }).selectOption('control')
  // Retained causal paths are an explicit display choice while this authored
  // program is in progress; Relevant flow reserves that state for animation.
  await page.getByRole('combobox', { name: 'Flow history' }).selectOption('all')
  const trace = JSON.parse(await readFile('src/examples/demos/control/trace.json', 'utf8')) as { events: Array<{ type: string; seq: number; label: string }> }
  for (const kind of ['INPUT_READ', 'OUTPUT_WRITE'] as const) {
    const event = trace.events.find(event => event.type === kind)!
    await page.getByRole('button', { name: `Go to event ${event.seq + 1}: ${event.label}`, exact: true }).click()
    await expect(page.locator('.vj-timeline__count')).toContainText(`${event.seq + 1} /`)
    await expect.poll(() => page.evaluate(() => Number(window.__VJ_RENDER_METRICS__?.flows ?? 0))).toBeGreaterThan(0)
    await expect(page.locator('.world-canvas canvas').first()).toBeVisible()
  }
  const output = process.env.VJ_QA_OUTPUT_ROOT ?? 'docs/checkpoints/v12-p5/browser-edges'
  await mkdir(output, { recursive: true })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${output}/curated-io-1440x900.png` })
})
