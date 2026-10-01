import { expect, type Page, type APIRequestContext } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
const outputRoot = process.env.VJ_QA_OUTPUT_ROOT ? `${process.env.VJ_QA_OUTPUT_ROOT}/product-audit-v11_5` : 'docs/checkpoints/product-audit-v11_5'

export async function inspectRetainedWorld(page: Page, request: APIRequestContext) {
  const current = await (await request.get('/api/execution/current')).json()
  expect(current.phase).toBe('COMPLETED')
  const started = Date.now()
  await page.addInitScript(id => localStorage.setItem('ggjavaez:project', id), current.projectId)
  await page.goto('/ide')
  const picker = page.getByRole('combobox', { name: 'Select runtime entity' })
  await expect(picker).toContainText('main() · completed', { timeout: 60000 })
  const loadMs = Date.now() - started
  console.log('retained-load-ms', loadMs)
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await mkdir(outputRoot, { recursive: true })
  for (const [width, height] of [[1728,1117], [1440,900], [1280,800], [760,900]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(700)
    await page.screenshot({ path: `${outputRoot}/graph-polished-${width}x${height}.png` })
  }
  await page.setViewportSize({ width:1440, height:900 })
  const scrub = page.getByRole('slider', { name:'Scrub execution' })
  const max = Number(await scrub.getAttribute('max'))
  const timings: { cursor:number; uiCommitAndTwoFramesMs:number }[] = []
  for (const cursor of [Math.floor(max / 2), Math.floor(max / 3), max]) {
    const start = Date.now()
    await scrub.fill(String(cursor))
    await expect(page.locator('.vj-timeline__count')).toContainText(`${cursor} / ${max}`)
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    timings.push({ cursor, uiCommitAndTwoFramesMs:Date.now() - start })
  }
  await writeFile(`${outputRoot}/large-world-measurements.json`, JSON.stringify({ sessionId:current.id, loadMs, normalizedEvents:max, rawEvents:current.rawEvents.length, timings, metric:'UI commit plus two browser animation frames; not GPU presentation or percentile statistics' }, null, 2))
  const selected = await picker.locator('option').filter({ hasText: /^Node #/ }).first().getAttribute('value')
  expect(selected).toBeTruthy()
  await picker.selectOption(selected!)
  await page.getByRole('complementary', { name: 'Runtime inspector' }).getByRole('button', { name:'Focus', exact:true }).click()
  await page.getByRole('button', { name:'Expand runtime' }).click()
  await expect(page.locator('.world-label').filter({ hasText:'ISOLATED' })).toBeVisible()
  for (const [width, height] of [[1440,900], [760,900]]) {
    await page.setViewportSize({ width,height }); await page.waitForTimeout(700)
    await page.screenshot({ path:`${outputRoot}/graph-focus-${width}x${height}.png` })
  }
  await page.getByRole('button', { name:'Return to world', exact:true }).click()
  await expect(page.locator('.world-label').filter({ hasText:'ISOLATED' })).toHaveCount(0)
  // Promote an archived deep invocation without changing runtime identity.
  const recursive = await picker.locator('option').filter({ hasText:/^recursiveSum\(\).* · invocation \d+$/ }).last().getAttribute('value')
  expect(recursive).toBeTruthy()
  await picker.selectOption(recursive!)
  await page.getByRole('complementary', { name:'Runtime inspector' }).getByRole('button', { name:'Focus', exact:true }).click()
  for (const [width,height] of [[1728,1117],[1440,900],[1280,800],[760,900]]) {
    await page.setViewportSize({ width,height }); await page.waitForTimeout(700)
    await page.screenshot({ path:`${outputRoot}/graph-deep-focus-${width}x${height}.png` })
  }
  await expect(picker).toHaveValue(recursive!)
  await expect(page.locator('.inspector')).toContainText('RETURNED')
  await page.getByRole('button', { name:'Return to world', exact:true }).click()
  expect((await (await request.get('/api/execution/current')).json()).id).toBe(current.id)
}
