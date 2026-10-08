import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { ExecutionSession } from '../src/execution/contracts'
import { normalizeTrace } from '../src/instrumentation/normalize'
import { seek } from '../src/runtime/seek'
const output='.ggjavaez/qa/v12-p5_5/lifecycle'
test.use({video:{mode:'on',size:{width:1440,height:900}}})
async function imported(request:APIRequestContext,name:string,files:Array<{path:string;content:string}>) {
  const response=await request.post('/api/projects/import',{data:{name,files}})
  expect(response.ok(),await response.text()).toBe(true);return (await response.json()).id as string
}
async function open(page:Page,id:string){await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),id);await page.goto('/ide');await expect(page.locator('.monaco-editor')).toBeVisible()}
async function current(request:APIRequestContext){return (await (await request.get('/api/execution/current')).json()) as ExecutionSession|null}
async function phase(request:APIRequestContext,id:string,expected:string){await expect.poll(async()=>{const session=await current(request);return session?.projectId===id?session.phase:'other'},{timeout:60000,intervals:[100,250,500]}).toBe(expected);return (await current(request))!}
async function paused(request:APIRequestContext,id:string,after=-1){await expect.poll(async()=>{const session=await current(request);return session?.projectId===id&&session.phase==='PAUSED'&&(session.pause?.rawEventCount??-1)>after},{timeout:30000,intervals:[100,250,500]}).toBe(true);return (await current(request))!}
test.afterEach(async({request})=>{const session=await current(request);if(session&&['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(session.phase))await request.post(`/api/execution/${session.id}/stop?transport=delta`,{data:{}})})

test('fresh Debug preserves a 35-second pause, constructor/array/recursive steps and the independent history cursor',async({page,request})=>{
  test.setTimeout(150000)
  const content=await readFile('fixtures/torture-v12-p5_5/06-small-debug/DebugShape.java','utf8')
  const id=await imported(request,'Torture Debug lifecycle',[{path:'DebugShape.java',content}]);await open(page,id)
  await page.getByRole('button',{name:'Debug',exact:true}).click()
  let session=await paused(request,id);expect(session.pause?.reason).toBe('entry');const sessionId=session.id
  const pauseMs=process.env.VJ_DEBUG_DIAGNOSTIC==='1'?100:35000;await page.waitForTimeout(pauseMs);expect((await current(request))!.phase).toBe('PAUSED');expect((await current(request))!.id).toBe(sessionId)
  const steps=[]
  for(const [command,method] of [['Step Into','<init>'],['Step Out','main'],['Step Over','main'],['Step Into','descend'],['Step Into','descend'],['Step Out','descend']] as const){
    const before=session.pause!.rawEventCount
    await page.getByRole('button',{name:command,exact:true}).click();session=await paused(request,id,before)
    steps.push({command,pause:session.pause}); console.log(JSON.stringify(steps.at(-1)));expect(session.id).toBe(sessionId);expect(session.pause?.methodName,command).toBe(method)
  }
  await page.getByRole('slider',{name:'Scrub execution'}).fill('0')
  await expect(page.getByRole('button',{name:/Return to Live/})).toBeVisible();expect((await current(request))!.phase).toBe('PAUSED')
  await page.getByRole('button',{name:/Return to Live/}).click()
  await page.getByRole('button',{name:'Continue',exact:true}).click();const done=await phase(request,id,'COMPLETED')
  expect(done.stdout).toBe('DEBUG_SHAPE 18 true\n');expect(done.recording?.state).toBe('FULL');expect(done.id).toBe(sessionId)
  await mkdir(output,{recursive:true})
  await page.screenshot({path:`${output}/debug-completed-1440x900.png`})
  await writeFile(`${output}/debug-proof.json`,JSON.stringify({sessionId,pausedMs:pauseMs,steps,recording:done.recording,stdout:done.stdout},null,2)+'\n')
  const video=page.video()!;await page.close();await video.saveAs(`${output}/fresh-debug.webm`)
})

test('fresh stdin waits twice, accepts a blank line and Unicode, then leaves exact Console and history',async({page,request})=>{
  test.setTimeout(90000)
  const content='import java.util.Scanner;\npublic class DelayedInput {\n public static void main(String[] args) {\n  Scanner console = new Scanner(System.in);\n  System.out.println("FIRST");\n  String first = console.nextLine();\n  System.out.println("SECOND");\n  String second = console.nextLine();\n  System.out.println("DONE "+first.length()+" "+second);\n }\n}\n'
  const id=await imported(request,'Torture delayed input',[{path:'DelayedInput.java',content}]);await open(page,id)
  await page.getByRole('button',{name:'Run',exact:true}).click();const waiting=await phase(request,id,'WAITING_FOR_INPUT')
  await page.waitForTimeout(1000);await page.getByRole('textbox',{name:'Console input'}).fill('');await page.getByRole('button',{name:/Send/}).click()
  await expect.poll(async()=>(await current(request))!.stdout,{timeout:30000}).toContain('SECOND\n')
  await phase(request,id,'WAITING_FOR_INPUT');await page.waitForTimeout(1000)
  await page.getByRole('textbox',{name:'Console input'}).fill('🟣中文');await page.getByRole('button',{name:/Send/}).click()
  const done=await phase(request,id,'COMPLETED');expect(done.id).toBe(waiting.id);expect(done.stdout).toBe('FIRST\nSECOND\nDONE 0 🟣中文\n')
  expect(done.rawEvents.filter(event=>event.type==='stdin_read').length).toBeGreaterThanOrEqual(2)
  await mkdir(output,{recursive:true});await page.screenshot({path:`${output}/stdin-completed-1440x900.png`})
  await writeFile(`${output}/stdin-proof.json`,JSON.stringify({sessionId:done.id,stdout:done.stdout,recording:done.recording,delaysMs:[1000,1000]},null,2)+'\n')
})

test('actual displaced JDT Retry reopens its own project and retains an unsaved draft',async({page,request,context})=>{
  test.setTimeout(120000)
  const disk='public class Main { public static void main(String[] args) {} }\n'
  const first=await imported(request,'Torture JDT first',[{path:'Main.java',content:disk}]);await open(page,first)
  await expect(page.locator('.ide-status-language')).toContainText('JDT ready',{timeout:40000})
  const draft='public class Main { MissingType retainedUnsavedDraft; public static void main(String[] args) {} }\n'
  await page.locator('.monaco-editor').click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.insertText(draft);await expect(page.locator('.ide-dirty')).toHaveCount(1)
  const second=await imported(request,'Torture JDT second',[{path:'Main.java',content:disk}]);const other=await context.newPage();await open(other,second)
  await expect(other.locator('.ide-status-language')).toContainText('JDT ready',{timeout:40000})
  await expect(page.getByRole('button',{name:'Retry Java',exact:true})).toBeVisible({timeout:10000})
  await page.getByRole('button',{name:'Retry Java',exact:true}).click();await expect(page.locator('.ide-status-language')).toContainText('JDT ready',{timeout:40000})
  await expect(page.locator('.ide-dirty')).toHaveCount(1)
  expect((await (await request.get(`/api/projects/${first}/files?path=Main.java`)).json()).content).toBe(disk)
  await expect.poll(async()=>JSON.stringify(await (await request.get(`/api/projects/${first}/language`)).json()),{timeout:20000}).toContain('MissingType')
  await mkdir(output,{recursive:true});await page.screenshot({path:`${output}/jdt-retry-draft-1440x900.png`})
  await writeFile(`${output}/jdt-proof.json`,JSON.stringify({first,second,diskUnchanged:true,draftRetained:true,diagnosticForDraft:true},null,2)+'\n');await other.close()
})

test('Quick Open resolves an exact late path among 1000 duplicate basenames using keyboard only',async({page,request})=>{
  test.setTimeout(120000)
  const files=Array.from({length:1000},(_,index)=>{const folder=`g${String(index).padStart(4,'0')}`;return {path:`many/${folder}/Shared.java`,content:`package many.${folder}; class Shared { int identity=${index}; }\n`}})
  files.unshift({path:'Main.java',content:'class Main {}\n'})
  const id=await imported(request,'Torture 1000 files',files);await open(page,id)
  await page.keyboard.press('ControlOrMeta+P');const dialog=page.getByRole('dialog',{name:'Quick Open',exact:true});await expect(dialog).toBeVisible()
  const input=dialog.getByRole('combobox',{name:'Search project files'});await input.fill('many/g0999/Shared.java')
  await expect(dialog.getByRole('option').first()).toContainText('many/g0999/Shared.java');await input.press('Enter')
  await expect(dialog).toHaveCount(0);await expect(page.locator('.ide-editor-foot')).toContainText('many/g0999/Shared.java')
  await expect(page.locator('.monaco-editor')).toContainText('identity=999')
  await mkdir(output,{recursive:true});await page.screenshot({path:`${output}/quick-open-1000-1440x900.png`})
  await writeFile(`${output}/quick-open-proof.json`,JSON.stringify({projectId:id,files:1001,selected:'many/g0999/Shared.java',keyboardOnly:true},null,2)+'\n')
})

test('five edited real Runs replace the world in one page; failed build and repair retain exact source ownership', async ({ page, request }) => {
  test.setTimeout(150000)
  const source = (value:number) => `public class Repeated { static class Cell { int value; } public static void main(String[] args) { Cell cell=new Cell(); cell.value=${value}; System.out.println("VALUE ${value}"); } }\n`
  const id = await imported(request, 'Torture repeated world ownership', [{ path:'Repeated.java', content:source(1) }])
  await page.addInitScript(() => { window.__VJ_QA_RENDER_METRICS__ = true })
  await open(page,id)
  const cdp=await page.context().newCDPSession(page)
  await cdp.send('Performance.enable');await cdp.send('HeapProfiler.enable')
  const samples:Array<{sessionId:string;value:number;heap:number;renderer:unknown}> = []
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
  async function edit(content:string) {
    await page.locator('.monaco-editor').click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.insertText(content)
    await page.keyboard.press('ControlOrMeta+S');await expect(page.locator('.ide-dirty')).toHaveCount(0)
    await expect.poll(async()=>(await (await request.get(`/api/projects/${id}/files?path=Repeated.java`)).json()).content).toBe(content)
  }
  for(let value=1;value<=5;value++) {
    if(value>1)await edit(source(value))
    await page.getByRole('button',{name:'Run',exact:true}).click()
    const done=await phase(request,id,'COMPLETED')
    expect(done.stdout).toBe(`VALUE ${value}\n`)
    expect(samples.every(sample=>sample.sessionId!==done.id)).toBe(true)
    const trace=normalizeTrace(done.rawEvents,done.sourceManifest,{status:done.terminalStatus!,exitCode:done.exitCode,diagnostic:done.diagnostic,recording:done.recording}).trace
    const state=seek(trace,trace.events.length)
    const cell=Object.values(state.objects).find(object=>object.className.endsWith('$Cell'))!
    expect(Object.values(cell.fields).find(field=>field.name==='value')!.value).toEqual({kind:'primitive',javaType:'int',value})
    const slider=page.getByRole('slider',{name:'Scrub execution'})
    await expect(slider).toHaveAttribute('max',String(trace.events.length),{timeout:30000});await slider.fill(String(trace.events.length))
    const picker=page.getByRole('combobox',{name:'Select runtime entity'});await picker.selectOption(cell.id)
    await page.getByRole('complementary',{name:'Runtime inspector'}).getByRole('button',{name:'Focus',exact:true}).click();await page.waitForTimeout(700)
    await expect.poll(()=>page.evaluate(()=>Boolean(window.__VJ_RENDER_METRICS__))).toBe(true)
    await cdp.send('HeapProfiler.collectGarbage')
    const metrics=await cdp.send('Performance.getMetrics')
    samples.push({sessionId:done.id,value,heap:metrics.metrics.find(item=>item.name==='JSHeapUsedSize')!.value,renderer:await page.evaluate(()=>window.__VJ_RENDER_METRICS__)})
    await page.getByRole('button',{name:'Return to world',exact:true}).click()
    if(value===3) {
      await edit('public class Repeated { this is not Java; }\n')
      await page.getByRole('button',{name:'Run',exact:true}).click();const failed=await phase(request,id,'FAILED')
      expect(failed.failureKind).toBe('build');expect(failed.id).not.toBe(done.id);expect(failed.rawEvents).toEqual([])
      await expect(page.getByRole('status',{name:'Previous recording'})).toBeVisible()
      await expect(page.locator('.monaco-editor .executing-line')).toHaveCount(0)
    }
  }
  expect(errors).toEqual([])
  await mkdir(output,{recursive:true});await page.screenshot({path:`${output}/repeated-repaired-1440x900.png`})
  await writeFile(`${output}/repeated-proof.json`,JSON.stringify({projectId:id,samples,failedBuildLabelsPreviousWorld:true,failedSourceHasNoExecutionHighlight:true,errors,method:'Five actual edited Runs and one failed build in one browser document; CDP GC whole frontend heap and actual renderer counters, not isolated semantic or GPU bytes.'},null,2)+'\n')
})
