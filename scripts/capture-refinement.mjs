import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const output = 'docs/checkpoints/person-refinement'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-webgl', '--use-gl=angle'] })
for (const [width, height] of [[1440,900],[1728,1117],[1280,800],[760,900]]) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.goto('http://127.0.0.1:5173/', { waitUntil:'networkidle' })
  await page.getByRole('slider', { name:'Scrub execution' }).fill('18')
  for (const view of ['Classic','Spatial']) {
    await page.getByRole('button', { name:view, exact:true }).click()
    await page.getByRole('button', { name:'Overview', exact:true }).click()
    await page.waitForTimeout(800)
    await page.screenshot({ path:`${output}/${view.toLowerCase()}-${width}x${height}.png` })
  }
  if (width === 1440 || width === 760) {
    await page.getByLabel('Select runtime entity').selectOption('object:person:17')
    for (const view of ['Classic','Spatial']) {
      await page.getByRole('button', { name:view, exact:true }).click()
      await page.getByRole('button', { name:'Focus selected entity', exact:true }).click()
      await page.waitForTimeout(700)
      await page.screenshot({ path:`${output}/${view.toLowerCase()}-focused${width === 760 ? '-760x900' : ''}.png` })
    }
  }
  await page.close()
}
await browser.close()
