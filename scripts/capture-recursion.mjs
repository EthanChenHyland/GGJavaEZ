import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const output = 'docs/checkpoints/recursion-v2'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-webgl', '--use-gl=angle'] })
for (const [width, height] of [[1440,900],[1728,1117],[1280,800],[760,900]]) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto(process.env.REVIEW_URL ?? 'http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  await page.getByLabel('Runtime example').selectOption('recursion')
  for (const [stage, cursor] of [['first-call',8],['max-depth',19],['mid-return',26],['final-result',36]]) {
    await page.getByRole('slider', { name: 'Scrub execution' }).fill(String(cursor))
    for (const representation of ['Classic','Spatial']) {
      await page.getByRole('button', { name: representation, exact:true }).click()
      await page.getByRole('button', { name: 'Overview', exact:true }).click()
      await page.waitForTimeout(850)
      await page.screenshot({ path:`${output}/${representation.toLowerCase()}-${stage}-${width}x${height}.png` })
    }
  }
  if (width === 1440 || width === 760) {
    await page.getByRole('slider', { name: 'Scrub execution' }).fill('19')
    await page.getByLabel('Select runtime entity').selectOption('frame:factorial:3')
    for (const representation of ['Classic','Spatial']) {
      await page.getByRole('button', { name: representation, exact:true }).click()
      await page.getByRole('button', { name: 'Focus selected entity', exact:true }).click()
      await page.waitForTimeout(850)
      await page.screenshot({ path:`${output}/${representation.toLowerCase()}-focused-${width}x${height}.png` })
    }
  }
  if (width === 1440 || width === 760) {
    await page.getByRole('button', { name: 'Close inspector', exact: true }).click()
    await page.getByRole('button', { name: 'Spatial', exact: true }).click()
    await page.getByRole('slider', { name: 'Scrub execution' }).fill('26')
    await page.getByRole('button', { name: 'Follow execution', exact: true }).click()
    await page.waitForTimeout(850)
    await page.screenshot({ path: `${output}/spatial-guided-return-${width}x${height}.png` })
    await page.getByLabel('Runtime example').selectOption('person')
    await page.getByRole('slider', { name: 'Scrub execution' }).fill('18')
    for (const representation of ['Classic', 'Spatial']) {
      await page.getByRole('button', { name: representation, exact: true }).click()
      await page.getByRole('button', { name: 'Overview', exact: true }).click()
      await page.waitForTimeout(850)
      await page.screenshot({ path: `${output}/person-regression-${representation.toLowerCase()}-${width}x${height}.png` })
    }
  }
  await page.close()
}
await browser.close()
