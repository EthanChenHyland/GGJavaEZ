import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const output = 'docs/checkpoints/person-v1'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--use-gl=angle'] })

async function pageAt(width, height, cursor, file) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: new RegExp(`^Go to event ${cursor}:`) }).click()
  await page.getByRole('button', { name: 'Home' }).first().click()
  await page.waitForTimeout(850)
  await page.screenshot({ path: `${output}/${file}.png` })
  return page
}

for (const [width, height] of [[1440, 900], [1728, 1117], [1280, 800], [760, 900]]) {
  const page = await pageAt(width, height, 18, `hero-${width}x${height}`)
  if (width === 1440) {
    await page.mouse.click(1200, 470)
    await page.screenshot({ path: `${output}/selected-1440x900.png` })
    await page.getByRole('button', { name: 'Focus selected entity', exact: true }).click()
    await page.waitForTimeout(700)
    await page.screenshot({ path: `${output}/focused-1440x900.png` })
    await page.getByRole('button', { name: 'Trace selected relationship', exact: true }).click()
    await page.waitForTimeout(1100)
    await page.screenshot({ path: `${output}/trace-path-1440x900.png` })
    await page.getByRole('button', { name: 'Home', exact: true }).first().click()
    await page.getByRole('button', { name: 'Runtime focus mode' }).click()
    await page.waitForTimeout(850)
    await page.screenshot({ path: `${output}/runtime-focus-1440x900.png` })
    await page.getByRole('button', { name: 'Runtime focus mode' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Close inspector' }).click()
    await page.mouse.move(690, 450)
    await page.mouse.down()
    await page.mouse.move(760, 480, { steps: 10 })
    await page.mouse.up()
    await page.screenshot({ path: `${output}/orbit-1440x900.png` })
  }
  await page.close()
}

const constructor = await pageAt(1440, 900, 10, 'constructor-1440x900')
await constructor.close()
const allocation = await pageAt(1440, 900, 9, 'allocation-1440x900')
await allocation.close()
const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
await reduced.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await reduced.getByRole('button', { name: 'Go to event 18: age: 0 → 18' }).click()
await reduced.getByRole('button', { name: 'Home', exact: true }).first().click()
await reduced.waitForTimeout(400)
await reduced.screenshot({ path: `${output}/reduced-motion-1440x900.png` })
await reduced.close()
await browser.close()
