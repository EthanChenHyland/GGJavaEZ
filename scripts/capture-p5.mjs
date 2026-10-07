import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const output = resolve(process.env.VJ_QA_OUTPUT_ROOT ?? 'docs/checkpoints/v12-p5/iteration-2')
const current = await (await fetch('http://127.0.0.1:8787/api/execution/current')).json()
if (!current || !['COMPLETED','FAILED'].includes(current.phase)) throw new Error('A retained terminal execution is required; capture never launches Java')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width:1440,height:900 }, deviceScaleFactor:1 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(id => localStorage.setItem('ggjavaez:project', id), current.projectId)
  await page.goto('http://127.0.0.1:5173/ide')
  await page.getByRole('slider', {name:'Scrub execution'}).waitFor()
  const picker = page.getByRole('combobox', {name:'Select runtime entity'})
  await picker.locator('option').filter({hasText:/dispatch\.service\.Dispatch #/}).first().waitFor({state:'attached',timeout:30000})
  // The retained recording can publish incrementally. Fit Home after the entire
  // terminal head is ingested, so future geometry does not distort the capture.
  const slider = page.getByRole('slider', {name:'Scrub execution'})
  let previous = '', stable = 0
  for (let attempt = 0; attempt < 60 && stable < 4; attempt++) {
    const maximum = await slider.getAttribute('max')
    stable = maximum === previous ? stable + 1 : 0
    previous = maximum
    await page.waitForTimeout(200)
  }
  if (stable < 4) throw new Error('Terminal timeline did not settle')
  await slider.fill(previous)
  const options = await picker.locator('option').evaluateAll(nodes => nodes.map(node => ({ value:node.value,label:node.textContent })))
  const selected = options.find(node => /Dispatch #/.test(node.label)) ?? options.find(node => node.value.startsWith('jvm:object:'))
  if (!selected) throw new Error('No actual recorded object')
  const closeTools = page.getByRole('button', {name:'Collapse bottom panel', exact:true})
  if (await closeTools.count()) await closeTools.click()
  for (const [width,height] of [[1728,1117],[1440,900],[1280,800],[760,900]]) {
    await page.setViewportSize({width,height})
    await picker.selectOption('')
    await page.waitForTimeout(100)
    await page.getByRole('button',{name:'Overview',exact:true}).click()
    await page.waitForTimeout(750)
    await page.screenshot({path:`${output}/overview-${width}x${height}.png`})
    await picker.selectOption(selected.value)
    await page.getByRole('complementary',{name:'Runtime inspector'}).getByRole('button',{name:'Focus',exact:true}).click()
    await page.waitForTimeout(750)
    await page.screenshot({path:`${output}/focus-${width}x${height}.png`})
    await page.getByRole('button',{name:'Return to world',exact:true}).click()
  }
  await writeFile(`${output}/proof.json`,JSON.stringify({ projectId:current.projectId,sessionId:current.id,selected,errors },null,2)+'\n')
  if(errors.length) throw new Error(errors.join('\n'))
} finally { await browser.close() }
