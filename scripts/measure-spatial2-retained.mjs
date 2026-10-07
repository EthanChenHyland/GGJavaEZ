import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// One already accepted terminal recording, with no build or Java launch.
// Baseline overrides isolate only the two final frontend cold-load corrections;
// all geometry, semantic facts, recorder budgets and backend routes stay equal.
const id = process.env.VJ_QA_SESSION_ID
if (!id) throw new Error('VJ_QA_SESSION_ID must name an actual retained terminal execution')
const output = resolve(process.env.VJ_QA_OUTPUT_ROOT ?? 'docs/checkpoints/v12-p5/cold')
const endpoint = `http://127.0.0.1:8787/api/execution/${encodeURIComponent(id)}`
const session = await (await fetch(`${endpoint}?transport=delta`)).json()
if (session.id !== id || !['COMPLETED','FAILED'].includes(session.phase)) throw new Error('Actual retained terminal execution required')
await mkdir(output, {recursive:true})
const samples = []
for (const mode of ['before','after','after']) {
  const browser = await chromium.launch({channel:'chrome',headless:true})
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}})
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(id => { localStorage.setItem('ggjavaez:project',id);window.__VJ_QA_RENDER_METRICS__=true }, session.projectId)
    await page.route('**/api/execution/current?transport=delta', async route => route.fulfill({response:await route.fetch({url:`${endpoint}?transport=delta`})}))
    const overrides = {client:false,options:false}
    if(mode === 'before') {
      await page.route('**/src/ide/client.ts*', async route => {
        const response = await route.fetch(), body = (await response.text()).replace('&limit=1024','')
        overrides.client = true
        await route.fulfill({response,body})
      })
      await page.route('**/src/ide/IdeWorkspace.tsx*', async route => {
        const response = await route.fetch(), original = await response.text()
        if((original.match(/\bprojectOptions\]/g) ?? []).length !== 2) throw new Error('Vite dev transform changed; option-allocation baseline needs review')
        const body = original.replaceAll('projectOptions]', 'projects.map(project => _jsxDEV("option", {value:project.id,children:project.name},project.id,false,{fileName:_jsxFileName,lineNumber:1225,columnNumber:1},this))]')
        overrides.options = true
        await route.fulfill({response,body})
      })
    }
    const started = performance.now()
    await page.goto('http://127.0.0.1:5173/ide')
    const picker = page.getByRole('combobox',{name:'Select runtime entity'})
    await expect(picker).toContainText(session.recording?.state === 'FULL' ? 'main() · completed' : 'main() · last recorded',{timeout:60000})
    const loadMs = performance.now()-started
    if(mode === 'before' && (!overrides.client || !overrides.options)) throw new Error('Baseline overrides were not applied')
    const slider = page.getByRole('slider',{name:'Scrub execution'})
    const max = Number(await slider.getAttribute('max'))
    const seeks = []
    for(const cursor of [Math.floor(max/2),Math.floor(max/3),max]) {
      const start = performance.now();await slider.fill(String(cursor))
      await expect(page.locator('.vj-timeline__count')).toContainText(`${cursor} / ${max}`)
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
      seeks.push({cursor,ms:performance.now()-start})
    }
    await page.getByRole('button',{name:'Overview',exact:true}).click();await page.waitForTimeout(800)
    const state = await page.evaluate(()=>({metrics:window.__VJ_RENDER_METRICS__,memory:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null}))
    const sample = {mode,loadMs,normalizedEvents:max,seeks,...state,overrides,errors}
    samples.push(sample)
    await page.screenshot({path:`${output}/${mode}-${samples.length}-1440x900.png`})
    if(errors.length)throw new Error(errors.join('\n'))
    console.log(JSON.stringify(sample))
  }finally{await browser.close()}
}
await writeFile(`${output}/comparison.json`,JSON.stringify({sessionId:id,rawEvents:session.rawEventCount,recording:session.recording,
  javaExit:session.exitCode,baseline:{loadMs:3214,seeksMs:[741,493,482]},samples,
  metric:'Fresh Chrome process per sample; retained actual session metadata endpoint redirected to its real backend snapshot. One local pre-fix baseline, two post-fix loads. Before overrides only client limit=256 and repeated project-option JSX allocation; same facts and rendering. Load ends at terminal runtime options, not physical GPU presentation. Seeks include Playwright action/UI commit and two animation frames; no cold-load p95 claim. Browser heap is uncollected whole frontend, not isolated semantic or GPU bytes.'},null,2)+'\n')
