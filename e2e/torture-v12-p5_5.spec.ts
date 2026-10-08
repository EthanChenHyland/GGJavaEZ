import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExecutionSession } from '../src/execution/contracts'
import { normalizeTrace } from '../src/instrumentation/normalize'

const output = process.env.VJ_TORTURE_BROWSER_OUTPUT ?? '.ggjavaez/qa/v12-p5_5/browser'
const sizes = [[1728,1117],[1440,900],[1280,800],[760,900],[1440,650]] as const
const cases = [
  ['01-text-and-fields', /Hundred #/], ['02-arrays-cycles-collections', /int\[\] #/],
  ['03-recursion-and-wide-calls', /right\(\)/], ['04-statics-and-exceptions', /wrapped\(\)/],
  ['05-output-and-input', /main\(\)/], ['06-small-debug', /Cell #/],
  ['07-observed-wide-and-deep', /depth\(\)/], ['08-many-lazy-statics', /Family12/], ['09-quiet-tiny', /quiet\(\)/],
] as const
async function files(root: string, prefix = ''): Promise<Array<{path:string;content:string}>> {
  const result: Array<{path:string;content:string}> = []
  for(const item of await readdir(root,{withFileTypes:true})) {
    if(item.name==='expected.facts.json') continue
    const path=prefix?`${prefix}/${item.name}`:item.name
    if(item.isDirectory()) result.push(...await files(join(root,item.name),path))
    else result.push({path,content:await readFile(join(root,item.name),'utf8')})
  }
  return result
}
async function current(request: APIRequestContext) { return (await (await request.get('/api/execution/current')).json()) as ExecutionSession | null }
async function closeTools(page: Page) {
  const button=page.getByRole('button',{name:'Collapse bottom panel',exact:true})
  if(await button.count()) await button.click()
}
test.afterEach(async ({request})=>{
  const session=await current(request)
  if(session&&['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(session.phase))
    await request.post(`/api/execution/${session.id}/stop?transport=delta`,{data:{}})
})
for(const [name,preferred] of cases) test(`Phase 5.5 ${name}: actual Java and five-size occupied-world inspection`,async({page,request})=>{
  test.setTimeout(180000)
  const spec=JSON.parse(await readFile(`fixtures/torture-v12-p5_5/${name}/expected.facts.json`,'utf8'))
  const existing=await current(request)
  expect(existing&&['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(existing.phase)).toBeFalsy()
  const imported=await request.post('/api/projects/import',{data:{name:`Torture ${name}`,files:await files(`fixtures/torture-v12-p5_5/${name}`)}})
  expect(imported.ok(),await imported.text()).toBe(true)
  const {id}=await imported.json()
  const errors: string[]=[]; page.on('pageerror',error=>errors.push(error.message))
  await page.addInitScript(projectId=>{localStorage.setItem('ggjavaez:project',projectId);window.__VJ_QA_RENDER_METRICS__=true},id)
  await page.goto('/ide')
  await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled()
  await page.getByRole('button',{name:'Run',exact:true}).click()
  let inputSent=false
  await expect.poll(async()=>{
    const session=await current(request)
    if(session?.projectId!==id) return 'other'
    if(session.phase==='WAITING_FOR_INPUT'&&!inputSent&&spec.stdin!==undefined) {
      inputSent=true
      // This first stress recording supplies all three actual lines. Separate
      // delayed-input/Debug tests exercise wait/resume without a new trace model.
      await request.post(`/api/execution/${session.id}/input`, { data: { text: spec.stdin } })
    }
    return session.phase
  },{timeout:100000,intervals:[100,250,500]}).toBe(spec.expectedExit==='nonzero'?'FAILED':'COMPLETED')
  const session=(await current(request))!
  if(spec.stdout!==undefined) expect(session.stdout).toBe(spec.stdout)
  if(spec.stderr!==undefined) expect(session.stderr).toBe(spec.stderr)
  if(spec.outputLines) {
    expect(session.stdout).toBe('READY\nINPUT 0 🟣中文 4096\n'+Array.from({length:spec.outputLines},(_,i)=>`OUT ${i}\n`).join('')+'FINISHED\n')
    expect(session.stderr).toBe(Array.from({length:spec.outputLines},(_,i)=>`ERR ${i}\n`).join(''))
  }
  const normalized=normalizeTrace(session.rawEvents,session.sourceManifest,{status:session.terminalStatus!,exitCode:session.exitCode,diagnostic:session.diagnostic,recording:session.recording})
  const max=normalized.trace.events.length
  const scrub=page.getByRole('slider',{name:'Scrub execution'})
  await expect(scrub).toHaveAttribute('max',String(max),{timeout:60000})
  await scrub.fill(String(max))
  const picker=page.getByRole('combobox',{name:'Select runtime entity'})
  const options=await picker.locator('option').evaluateAll(nodes=>nodes.map(node=>({value:(node as HTMLOptionElement).value,label:node.textContent??''})))
  const chosen=options.find(option=>preferred.test(option.label))??options.find(option=>option.value.startsWith('jvm:object:'))??options.find(option=>option.value.startsWith('jvm:frame:'))
  expect(chosen).toBeDefined()
  await closeTools(page)
  await mkdir(`${output}/${name}`,{recursive:true})
  const views=[]
  for(const [width,height] of sizes) {
    await page.setViewportSize({width,height})
    await picker.selectOption('');await page.getByRole('button',{name:'Overview',exact:true}).click();await page.waitForTimeout(750)
    await page.screenshot({path:`${output}/${name}/overview-${width}x${height}.png`})
    views.push({width,height,mode:'overview',metrics:await page.evaluate(()=>window.__VJ_RENDER_METRICS__)})
    await picker.selectOption(chosen!.value)
    const inspector=page.getByRole('complementary',{name:'Runtime inspector'})
    await expect(inspector).toBeVisible()
    await inspector.getByRole('button',{name:'Focus',exact:true}).click();await page.waitForTimeout(750)
    const rows=await inspector.locator('.inspector-row').evaluateAll(nodes=>nodes.slice(0,6).map(node=>{
      const name=node.querySelector('span')!,value=node.querySelector('strong')!,range=document.createRange();range.selectNodeContents(name)
      const valueRect=value.getBoundingClientRect(),rowRect=node.getBoundingClientRect()
      return {text:name.textContent,value:value.textContent,nameRights:Array.from(range.getClientRects()).map(rect=>rect.right),
        valueLeft:valueRect.left,valueRight:valueRect.right,rowRight:rowRect.right}
    }))
    for(const row of rows){for(const right of row.nameRights) expect(right).toBeLessThanOrEqual(row.valueLeft-4);expect(row.valueRight).toBeLessThanOrEqual(row.rowRight)}
    await page.screenshot({path:`${output}/${name}/focus-${width}x${height}.png`})
    views.push({width,height,mode:'focus',metrics:await page.evaluate(()=>window.__VJ_RENDER_METRICS__)})
    await expect(picker).toHaveValue(chosen!.value)
    await page.getByRole('button',{name:'Return to world',exact:true}).click()
  }
  await page.setViewportSize({width:1440,height:900})
  await scrub.fill('1');await scrub.fill(String(max))
  await expect(picker.locator(`option[value="${chosen!.value}"]`)).toHaveCount(1)
  expect((await current(request))!.id).toBe(session.id)
  expect(errors).toEqual([])
  await writeFile(`${output}/${name}/proof.json`,JSON.stringify({sessionId:session.id,projectId:id,mainClass:session.mainClass,recording:session.recording,
    rawEvents:session.rawEvents.length,semanticEvents:max,exitCode:session.exitCode,chosen,views,errors},null,2)+'\n')
  await mkdir('.ggjavaez/qa/v12-p5_5/payloads',{recursive:true})
  await writeFile(`.ggjavaez/qa/v12-p5_5/payloads/${name}.json`,JSON.stringify(session))
})
