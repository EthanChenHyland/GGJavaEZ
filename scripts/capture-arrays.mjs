import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const fixture = JSON.parse(await readFile('src/demos/arrays/trace.json', 'utf8'))
const events = fixture.events
const writes = events.flatMap((event, index) => event.type === 'ARRAY_WRITE' ? [index + 1] : [])
const allocation = events.find((event) => event.type === 'ALLOCATE_ARRAY')
const stages = [
  ['initial', events.findIndex((event) => event.type === 'CREATE_REFERENCE') + 1],
  ['first-comparison', events.findIndex((event) => event.type === 'ARRAY_COMPARE') + 1],
  ['first-swap', writes[1]],
  ['mid-sort', writes[Math.floor(writes.length / 2)]],
  ['final-sorted', events.length],
]
const output = 'docs/checkpoints/arrays-v3'
await mkdir(output, { recursive: true })
await writeFile(`${output}/stages.json`, JSON.stringify(Object.fromEntries(stages), null, 2) + '\n')
const browser = await chromium.launch({ channel:'chrome', args:['--enable-webgl','--use-gl=angle'] })
const errors = []
for (const [width,height] of [[1440,900],[1728,1117],[1280,800],[760,900]]) {
  const page = await browser.newPage({ viewport:{width,height} })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(process.env.REVIEW_URL ?? 'http://127.0.0.1:5173/', {waitUntil:'networkidle'})
  await page.getByLabel('Runtime example').selectOption('arrays')
  for (const [stage,cursor] of stages) {
    await page.getByRole('slider', {name:'Scrub execution'}).fill(String(cursor))
    for (const representation of ['Classic','Spatial','Theater']) {
      await page.getByRole('button', {name:representation,exact:true}).click()
      await page.getByRole('button', {name:'Overview',exact:true}).click()
      await page.waitForTimeout(850)
      await page.screenshot({path:`${output}/${representation.toLowerCase()}-${stage}-${width}x${height}.png`})
    }
  }
  if (width === 1440 || width === 760) {
    await page.getByRole('slider', {name:'Scrub execution'}).fill(String(stages[1][1]))
    await page.getByLabel('Select runtime entity').selectOption(`${allocation.objectId}:element:1`)
    for (const representation of ['Classic','Spatial','Theater']) {
      await page.getByRole('button', {name:representation,exact:true}).click()
      await page.getByRole('button', {name:'Focus selected entity',exact:true}).click()
      await page.waitForTimeout(850)
      await page.screenshot({path:`${output}/${representation.toLowerCase()}-focused-${width}x${height}.png`})
    }
  }
  await page.close()
}
await browser.close()
if (errors.length) throw new Error(errors.join('\n'))
