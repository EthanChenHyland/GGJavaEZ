import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const trace = JSON.parse(readFileSync('src/examples/demos/arrays/trace.json', 'utf8'))
const events: Array<{ type: string; objectId?: string; frameId?: string; slot?: { id: string; name: string } }> = trace.events
const objectId = events.find((event) => event.type === 'ALLOCATE_ARRAY')!.objectId!
const writes = events.flatMap((event, index) => event.type === 'ARRAY_WRITE' ? [index + 1] : [])
const comparison = events.findIndex((event) => event.type === 'ARRAY_COMPARE') + 1
const initial = events.findIndex((event) => event.type === 'CREATE_REFERENCE') + 1
const cursor = (page: import('@playwright/test').Page) => page.getByRole('slider', { name:'Scrub execution' })
const rows = (page: import('@playwright/test').Page) => page.locator('.inspector-row strong')
async function arrays(page: import('@playwright/test').Page) {
  await page.goto('/examples')
  await page.getByLabel('Runtime example').selectOption('arrays')
  await expect(cursor(page)).toHaveValue('0')
}

test('array values, selection, source and comparison survive all three representations', async ({ page }) => {
  await arrays(page)
  await cursor(page).fill(String(comparison))
  await page.getByLabel('Select runtime entity').selectOption(objectId)
  for (const view of ['Classic','Spatial','Theater','Classic','Theater','Spatial']) {
    await page.getByRole('button', { name:view, exact:true }).click()
    await expect(cursor(page)).toHaveValue(String(comparison))
    await expect(page.getByLabel('Select runtime entity')).toHaveValue(objectId)
    await expect(rows(page)).toHaveText(['8','3','6','1','5'])
    await expect(page.locator('.array-status')).toContainText('8 > 3 · true → swap')
    await expect(page.locator('.monaco-editor .executing-line')).toBeVisible()
  }
  await page.getByRole('button', { name:'Classic', exact:true }).click()
  await page.getByRole('button', { name:'Close inspector', exact:true }).click()
  await page.locator(`.classic-runtime [data-slot-id="${objectId}:element:1"]`).click()
  await expect(page.locator('.inspector')).toContainText('VALUE3')
  await expect(page.locator(`[data-slot-id="${objectId}:element:1"]`)).toHaveAttribute('aria-pressed','true')
  await expect(page.locator('[data-array-selection]')).toHaveCount(1)
  await expect(page.locator('.inspector')).toContainText('ARRAY · LENGTH · INDEX')
  const j = events.find((event) => event.slot?.name === 'j')!.slot!.id
  await page.getByLabel('Select runtime entity').selectOption(j)
  await expect(page.getByRole('heading', { name:'j',exact:true })).toBeVisible()
  await expect(page.locator('.inspector')).toContainText('VALUE0')
})

test('two indexed writes are truthful and reverse scrubs restore values in fixed cells', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' })
  await arrays(page)
  await cursor(page).fill(String(initial))
  await page.getByRole('button', { name:'Classic',exact:true }).click()
  await page.getByLabel('Select runtime entity').selectOption(objectId)
  const cells = page.locator('.classic-runtime [data-slot-id]').filter({ has: page.locator('rect') })
  // The inspector verifies exact committed values, including Java's intermediate duplicate.
  for (const [step,values] of [[writes[0],['3','3','6','1','5']],[writes[1],['3','8','6','1','5']],[writes[0],['3','3','6','1','5']],[initial,['8','3','6','1','5']],[events.length,['1','3','5','6','8']]] as const) {
    await cursor(page).fill(String(step))
    await expect(rows(page)).toHaveText([...values])
  }
  await expect(cells.first()).toBeVisible()
  await cursor(page).fill(String(writes[1]))
  await page.getByRole('button', { name:'Previous event',exact:true }).click()
  await expect(rows(page)).toHaveText(['3','3','6','1','5'])
  await page.getByRole('button', { name:'Next event',exact:true }).click()
  await expect(rows(page)).toHaveText(['3','8','6','1','5'])
})

test('sorting finishes naturally and Replay restarts once without looping', async ({ page }) => {
  await arrays(page)
  await cursor(page).fill(String(events.length - 4))
  await page.getByLabel('Playback speed').selectOption('4')
  await page.getByRole('button', { name:'Play execution',exact:true }).click()
  await expect(page.getByRole('button', { name:'Replay execution',exact:true })).toBeVisible()
  await expect(cursor(page)).toHaveValue(String(events.length))
  await expect(page.locator('.array-status')).toContainText('14 INDEXED WRITES')
  await expect(page.locator('.final-result')).toHaveText('[1, 3, 5, 6, 8]')
  await page.waitForTimeout(500)
  await expect(cursor(page)).toHaveValue(String(events.length))
  await page.getByRole('button', { name:'Replay execution',exact:true }).click()
  await expect(cursor(page)).toHaveValue('0')
  await page.getByRole('button', { name:'Pause execution',exact:true }).click()
})

test('Theater supports orbit, pan, dolly and cell focus while playback keeps advancing', async ({ page }) => {
  await arrays(page)
  await cursor(page).fill(String(comparison))
  await page.getByRole('button', { name:'Theater',exact:true }).click()
  await page.getByRole('button', { name:'Follow execution',exact:true }).click()
  await page.getByRole('button', { name:'Play execution',exact:true }).click()
  await page.mouse.move(940,490)
  await page.mouse.down()
  await page.mouse.move(1000,520,{ steps:10 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name:'Follow execution',exact:true })).toHaveAttribute('aria-pressed','false')
  await expect(page.getByRole('button', { name:'Pause execution',exact:true })).toBeVisible()
  await expect.poll(async () => Number(await cursor(page).inputValue())).toBeGreaterThan(comparison)
  await page.mouse.down({ button:'right' })
  await page.mouse.move(1030,540,{ steps:6 })
  await page.mouse.up({ button:'right' })
  await page.mouse.wheel(0,-200)
  await cursor(page).fill(String(comparison))
  await page.getByLabel('Select runtime entity').selectOption(`${objectId}:element:0`)
  await page.getByRole('button', { name:'Focus selected entity',exact:true }).click()
  await expect(page.locator('.world-label')).toContainText('FOCUS ENTITY')
  await page.getByRole('button', { name:'Home',exact:true }).click()
  await expect(cursor(page)).toHaveValue(String(comparison))
  await page.getByRole('button', { name:'Spatial',exact:true }).click()
  await expect(page.getByLabel('Select runtime entity')).toHaveValue(`${objectId}:element:0`)
})


test('3D cell picking and guidance toggle preserve committed values and indexed selection', async ({ page }) => {
  await arrays(page)
  await cursor(page).fill(String(comparison))
  await page.getByRole('button', { name:'Theater',exact:true }).click()
  await page.getByRole('button', { name:'Overview',exact:true }).click()
  await page.waitForTimeout(900)
  // The compact canvas toolbar moves the projected cell upward.
  await page.mouse.click(1005,460)
  await expect(page.getByLabel('Select runtime entity')).toHaveValue(`${objectId}:element:1`)
  await expect(page.locator('.inspector')).toContainText('VALUE3')
  await page.getByRole('button', { name:'Guided execution',exact:true }).click()
  await expect(cursor(page)).toHaveValue(String(comparison))
  await page.getByRole('button', { name:'Classic',exact:true }).click()
  await expect(page.locator('[data-array-activity]')).toHaveCount(0)
  await expect(page.locator('.inspector')).toContainText('VALUE3')
  await page.getByRole('button', { name:'Guided execution',exact:true }).click()
  await expect(page.locator('[data-array-activity]')).toHaveCount(1)
  await page.getByRole('button', { name:'Trace selected relationship',exact:true }).click()
  await expect(page.getByRole('heading', { name:'Reference path',exact:true })).toBeVisible()
  await expect(page.locator('.world-label')).toContainText('TRACE PATH')
})
