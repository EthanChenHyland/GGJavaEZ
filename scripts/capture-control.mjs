import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
const trace = JSON.parse(await readFile('src/demos/control/trace.json', 'utf8'))
const events = trace.events
const firstInput = events.findIndex((event) => event.type === 'INPUT_READ')
const branch = events.findIndex((event) => event.type === 'DECLARE_LOCAL' && event.slot.name === 'corrected')
const loop = events.findIndex((event) => event.type === 'LOOP_ITERATION' && event.iteration === 2 && event.status === 'running')
const closed = events.findIndex((event) => event.type === 'EXIT_SCOPE' && events.some((entry) => entry.type === 'DECLARE_LOCAL' && entry.slot.name === 'raw' && entry.slot.scopeId === event.scopeId))
const stages = [['before-input',firstInput],['input-consumed',firstInput+1],['taken-branch',branch+1],['scope-closed',closed+1],['loop-iteration',loop+1],['final-output',events.length]]
const output = 'docs/checkpoints/control-v4'
await mkdir(output,{recursive:true})
await writeFile(`${output}/stages.json`,JSON.stringify(Object.fromEntries(stages),null,2)+'\n')
const browser = await chromium.launch({channel:'chrome',args:['--enable-webgl','--use-gl=angle']})
const errors=[]
for(const [width,height] of [[1440,900],[1728,1117],[1280,800],[760,900]]) {
 const page=await browser.newPage({viewport:{width,height}})
 page.on('pageerror',error=>errors.push(error.message))
 await page.goto(process.env.REVIEW_URL??'http://127.0.0.1:5173/',{waitUntil:'networkidle'})
 await page.getByLabel('Runtime example').selectOption('control')
 if(width===760) await page.getByRole('button',{name:'Expand console',exact:true}).click()
 for(const [stage,cursor] of stages) {
  await page.getByRole('slider',{name:'Scrub execution'}).fill(String(cursor))
  for(const view of ['Classic','Spatial']) {
   await page.getByRole('button',{name:view,exact:true}).click()
   await page.getByRole('button',{name:'Overview',exact:true}).click()
   await page.waitForTimeout(850)
   await page.screenshot({path:`${output}/${view.toLowerCase()}-${stage}-${width}x${height}.png`})
  }
 }
 if(width===1440||width===760) {
  await page.getByRole('slider',{name:'Scrub execution'}).fill(String(branch+1))
  await page.getByLabel('Select runtime entity').selectOption(events[branch].slot.id)
  for(const view of ['Classic','Spatial']) {
   await page.getByRole('button',{name:view,exact:true}).click()
   await page.getByRole('button',{name:'Focus selected entity',exact:true}).click()
   await page.waitForTimeout(850)
   await page.screenshot({path:`${output}/${view.toLowerCase()}-focused-${width}x${height}.png`})
  }
  await page.getByRole('button',{name:'Close inspector',exact:true}).click()
  await page.getByRole('button',{name:'Spatial',exact:true}).click()
  await page.getByRole('button',{name:'Overview',exact:true}).click()
  await page.waitForTimeout(850)
  await page.mouse.move(width*.65,height*.49)
  await page.mouse.down();await page.mouse.move(width*.65+75,height*.49+16,{steps:15});await page.mouse.up()
  await page.screenshot({path:`${output}/spatial-orbit-${width}x${height}.png`})
 }
 await page.close()
}
await browser.close()
if(errors.length)throw new Error(errors.join('\n'))
