import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExecutionSession } from '../src/execution/contracts'
import { normalizeTrace } from '../src/instrumentation/normalize'
import { browserErrors, focusSelection, home, seekCursor } from './reference/harness'
import { clearTortureSelection, pickTortureEntity } from './reference/tortureNavigation'

const output = process.env.VJ_TORTURE_BROWSER_OUTPUT ?? '.ggjavaez/qa/v12-p5_5/browser'
const payloads = process.env.VJ_TORTURE_BROWSER_PAYLOADS ?? '.ggjavaez/qa/v12-p5_5/payloads'
const ownedProjects = new Set<string>()
const activePhases = ['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED']
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
const inspector = (page: Page) => page.getByRole('complementary',{name:'Selection inspector',exact:true})
async function closeTools(page: Page) {
  const button = page.getByRole('navigation',{name:'Dock',exact:true}).locator('button[data-dock-tool][aria-expanded="true"]')
  if (await button.count()) await button.click()
}
test.afterEach(async ({request})=>{
  const session=await current(request)
  if(session&&ownedProjects.has(session.projectId)&&activePhases.includes(session.phase))
    await request.post(`/api/execution/${session.id}/stop?transport=delta`,{data:{}})
})
for(const [name,preferred] of cases) test(`Phase 5.5 ${name}: actual Java and five-size occupied-world inspection`,async({page,request})=>{
  test.setTimeout(180000)
  const spec=JSON.parse(await readFile(`fixtures/torture-v12-p5_5/${name}/expected.facts.json`,'utf8'))
  const existing=await current(request)
  expect(existing&&activePhases.includes(existing.phase)).toBeFalsy()
  const imported=await request.post('/api/projects/import',{data:{name:`Torture ${name}`,files:await files(`fixtures/torture-v12-p5_5/${name}`)}})
  expect(imported.ok(),await imported.text()).toBe(true)
  const {id}=await imported.json() as {id:string}
  ownedProjects.add(id)
  const errors=browserErrors(page)
  await page.addInitScript(projectId=>localStorage.setItem('ggjavaez:project',projectId),id)
  await page.goto('/?qa=1')
  await page.waitForFunction(()=>typeof window.__ggjavaezQA?.ready==='function')
  await page.waitForFunction(projectId=>document.querySelector('[data-project-id]')?.getAttribute('data-project-id')===projectId,id)
  await expect(page.getByRole('button',{name:'Project menu',exact:true})).toHaveAttribute('data-project-id',id)
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
  for(const text of spec.stderrContains??[])expect(session.stderr).toContain(text)
  expect(session.mainClass).toBe(spec.mainClass)
  if(spec.outputLines) {
    expect(session.stdout).toBe('READY\nINPUT 0 🟣中文 4096\n'+Array.from({length:spec.outputLines},(_,i)=>`OUT ${i}\n`).join('')+'FINISHED\n')
    expect(session.stderr).toBe(Array.from({length:spec.outputLines},(_,i)=>`ERR ${i}\n`).join(''))
  }
  await mkdir(payloads,{recursive:true})
  await writeFile(`${payloads}/${name}.json`,JSON.stringify(session))
  const normalized=normalizeTrace(session.rawEvents,session.sourceManifest,{status:session.terminalStatus!,exitCode:session.exitCode,diagnostic:session.diagnostic,recording:session.recording})
  const max=normalized.trace.events.length
  const scrub=page.getByRole('slider',{name:'Recorded execution position',exact:true})
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld?.scene().recordingId)).toBe(`execution:${session.id}`)
  await expect(scrub).toHaveAttribute('aria-valuemax',String(max),{timeout:60000})
  await seekCursor(page,max)
  const inventory=await page.evaluate(()=>{
    const world=window.__ggjavaezWorld!,scene=world.scene(),events=world.recordedEvents()
    const method=new Map(events.flatMap(event=>event.type==='ENTER_METHOD'?[[event.frameId,event.methodName]]as const:[]))
    return Object.values(scene.entities).map(entity=>({id:entity.id,kind:entity.kind,
      label:entity.kind==='frame'?`${method.get(entity.id)}() · ${entity.title}`
        :entity.kind==='class'?entity.title:`${entity.title} #${entity.displayId}`}))
  })
  const chosen=inventory.find(option=>preferred.test(option.label))
    ??inventory.find(option=>option.id.startsWith('jvm:object:'))
    ??inventory.find(option=>option.id.startsWith('jvm:frame:'))
  expect(chosen).toBeDefined()
  await closeTools(page)
  await mkdir(`${output}/${name}`,{recursive:true})
  const views=[]
  for(const [width,height] of sizes) {
    await page.setViewportSize({width,height})
    await clearTortureSelection(page);await home(page);await page.waitForTimeout(750)
    await page.screenshot({path:`${output}/${name}/overview-${width}x${height}.png`})
    views.push({width,height,mode:'overview',metrics:await page.evaluate(()=>window.__ggjavaezWorld!.renderer())})
    await pickTortureEntity(page,chosen!.id)
    await expect(inspector(page)).toBeVisible()
    await focusSelection(page);await page.waitForTimeout(750)
    const rows=await inspector(page).locator('.inspector-value').evaluateAll(nodes=>nodes.slice(0,6).map(node=>{
      const name=node.querySelector('span')!,value=node.querySelector('button:last-child')!,range=document.createRange()
      range.selectNodeContents(name)
      const valueRect=value.getBoundingClientRect(),rowRect=node.getBoundingClientRect(),nameRect=name.getBoundingClientRect()
      const clipped=getComputedStyle(name).overflowX==='hidden'
      return {text:name.textContent,value:value.textContent,
        nameRights:Array.from(range.getClientRects()).map(rect=>clipped?Math.min(rect.right,nameRect.right):rect.right),
        valueLeft:valueRect.left,valueRight:valueRect.right,rowRight:rowRect.right}
    }))
    for(const row of rows){for(const right of row.nameRights) expect(right).toBeLessThanOrEqual(row.valueLeft-4);expect(row.valueRight).toBeLessThanOrEqual(row.rowRight)}
    await page.screenshot({path:`${output}/${name}/focus-${width}x${height}.png`})
    const focused=await page.evaluate(id=>{
      const world=window.__ggjavaezWorld!,qa=window.__ggjavaezQA!
      const face=world.worldProjection().entities.find(body=>body.id===id)?.face??null
      return {metrics:world.renderer(),face,safeFrame:qa.shellRects().safeFrame,pose:qa.cameraPose()}
    },chosen!.id)
    views.push({width,height,mode:'focus',...focused,rows})
    await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.selection()?.id)).toBe(chosen!.id)
    await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.focusTarget()?.targetId)).toBe(chosen!.id)
    await inspector(page).getByRole('button',{name:'Return to World',exact:true}).click()
  }
  await page.setViewportSize({width:1440,height:900})
  await seekCursor(page,1);await seekCursor(page,max)
  expect(await page.evaluate(id=>!!window.__ggjavaezWorld!.scene().entities[id],chosen!.id)).toBe(true)
  expect((await current(request))!.id).toBe(session.id)
  expect(errors).toEqual([])
  await writeFile(`${output}/${name}/proof.json`,JSON.stringify({sessionId:session.id,projectId:id,mainClass:session.mainClass,recording:session.recording,
    rawEvents:session.rawEvents.length,semanticEvents:max,exitCode:session.exitCode,chosen,views,errors},null,2)+'\n')
})
