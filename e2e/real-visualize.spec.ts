import {expect,test,type Page,type APIRequestContext} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'
import type {ExecutionSession} from '../src/execution/contracts'
import {normalizeTrace} from '../src/instrumentation/normalize'
import {browserErrors,ready,seekCursor,selectEntity,home,follow} from './reference/harness'
import {openDock} from './reference/dockActions'

test.describe.configure({mode:'serial',timeout:90000})
const ownedProjects=new Set<string>(),errorsByPage=new WeakMap<Page,string[]>()
const slider=(page:Page)=>page.getByRole('slider',{name:'Recorded execution position',exact:true})
const inspector=(page:Page)=>page.getByRole('complementary',{name:'Selection inspector',exact:true})
const canvas=(page:Page)=>page.getByRole('region',{name:'Runtime world',exact:true}).locator('.world-canvas canvas')
async function project(request:APIRequestContext,name:string,files:{path:string;content:string}[]){
 const response=await request.post('/api/projects/import',{data:{name:`${name}-${randomUUID()}`,files}})
 expect(response.ok(),await response.text()).toBe(true)
 const id=(await response.json()).id as string;ownedProjects.add(id);return id
}
async function open(page:Page,id:string){
 errorsByPage.set(page,browserErrors(page))
 await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),id)
 await page.goto('/?qa=1')
 await page.waitForFunction(id=>typeof window.__ggjavaezQA?.ready==='function'&&document.querySelector('[data-project-id]')?.getAttribute('data-project-id')===id,id)
 await expect(page.locator('.monaco-editor')).toBeVisible()
 await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled()
}
async function executionPhase(request:APIRequestContext,projectId:string,phase:ExecutionSession['phase'],page:Page){
 await expect.poll(async()=>{const session=await(await request.get('/api/execution/current')).json() as ExecutionSession|null;return session?.projectId===projectId?session.phase:'different project'},{timeout:45000,intervals:[100,250,500]}).toBe(phase)
 const session=await(await request.get('/api/execution/current')).json() as ExecutionSession
 expect(session.projectId).toBe(projectId);expect(session.build?.success).toBe(true)
 await test.info().attach('actual-jvm-session',{body:JSON.stringify({id:session.id,rawEvents:session.rawEvents.length,buildSuccess:session.build?.success}),contentType:'application/json'})
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA?.appState().dimensions.view.recordingId)).toBe(`execution:${session.id}`)
 await slider(page).focus();await page.keyboard.press('End');await ready(page)
 await expect.poll(()=>page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene();return scene.cursor===scene.liveHead&&scene.liveHead>0})).toBe(true)
 await expect(canvas(page)).toBeVisible();await expect(page.locator('.shell-state')).toHaveAttribute('data-state',phase)
 return session
}
test.afterEach(async({page,request},info)=>{
 try{
  await mkdir('.ggjavaez/qa/reference-exact/arbitrary-java-successors/captures',{recursive:true})
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/arbitrary-java-successors/captures/${info.title.replace(/[^a-zA-Z0-9]+/g,'-')}.png`})
  expect(errorsByPage.get(page)??[]).toEqual([])
 }finally{
  const session=await(await request.get('/api/execution/current')).json() as ExecutionSession|null
  if(session&&ownedProjects.has(session.projectId)&&['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(session.phase))expect((await request.post(`/api/execution/${session.id}/stop`,{data:{}})).ok()).toBe(true)
 }
})

test('editable Person reaches the production World, stable scrubbing, source and inspector',async({page,request})=>{
  const id = await project(request, 'RealPerson', [
    { path: 'Main.java', content: 'public class Main {\n public static void main(String[] args) {\n  Person p = new Person("Ethan");\n  p.setAge(18);\n }\n}\n' },
    { path: 'Person.java', content: 'public class Person {\n String name;\n int age;\n Person(String name) { this.name = name; }\n void setAge(int age) { this.age = age; }\n}\n' },
  ])
  await open(page,id)
  await page.locator('.monaco-editor .view-line').filter({hasText:'p.setAge(18)'}).click()
  await page.keyboard.press('End');await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');await page.keyboard.insertText('19')
  await expect(page.locator('.ide-dirty')).toBeVisible()
  await page.getByRole('button',{name:'Run',exact:true}).click()
  const decision=page.getByRole('dialog',{name:'Unsaved changes before Run',exact:true})
  await expect(decision).toBeVisible();await decision.getByRole('button',{name:'Save All and Run',exact:true}).click()
  const session=await executionPhase(request,id,'COMPLETED',page)
  expect(session.rawEvents.some(event=>event.type==='field')).toBe(true)
  const max=Number(await slider(page).getAttribute('aria-valuemax'));expect(max).toBeGreaterThan(10)
  await expect(slider(page)).toHaveAttribute('aria-valuenow',String(max))
  const personId=await page.evaluate(()=>Object.values(window.__ggjavaezWorld!.scene().entities).find(node=>node.kind==='object'&&node.title==='Person')?.id)
  expect(personId).toBeTruthy();await home(page);await selectEntity(page,personId!)
  await expect(inspector(page).locator('.inspector-heading strong')).toContainText('Person')
  await expect(inspector(page).getByRole('button',{name:'Inspect age',exact:true})).toHaveText('19')
  // Selection is independent of source reveal. Preserve source synchronization
  // at an actual recorded setAge invocation in the original second Java file.
  const {trace}=normalizeTrace(session.rawEvents,session.sourceManifest,{status:session.terminalStatus!,exitCode:session.exitCode,diagnostic:session.diagnostic,recording:session.recording})
  const entered=trace.events.filter(event=>event.type==='ENTER_METHOD').find(event=>event.methodName==='setAge')!
  const executed=trace.events.filter(event=>event.type==='LINE_EXECUTE').find(event=>event.frameId===entered.frameId&&event.source?.fileId.endsWith('Person.java'))!
  expect(executed).toBeTruthy()
  await seekCursor(page,executed.seq+1)
  await expect(page.locator('.ide-tab.is-active')).toContainText('Person.java')
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.target?.line)).toBe(executed.source!.line)
  await seekCursor(page,1)
  expect(await page.evaluate(id=>!!window.__ggjavaezWorld!.scene().entities[id!],personId)).toBe(false)
  await seekCursor(page,max);await home(page);await selectEntity(page,personId!)
  expect(await page.evaluate(id=>window.__ggjavaezWorld!.scene().entities[id!].id,personId)).toBe(personId)
  await expect(inspector(page).getByRole('button',{name:'Inspect age',exact:true})).toHaveText('19')
  // The sole production World already fills the viewport. Source expansion
  // changes panels while retaining the real canvas and execution position.
  const world=canvas(page),identity=await world.elementHandle(),width=(await world.boundingBox())!.width
  expect(width).toBeGreaterThan(1440*.95)
  await page.getByRole('button',{name:'Expand source for editing',exact:true}).click();await ready(page)
  await expect(page.locator('.ide-editor-panel')).toBeVisible()
  const expandedWidth=(await page.locator('.ide-editor-panel').boundingBox())!.width
  await page.getByRole('button',{name:/^(Collapse source|Close source drawer)$/}).click()
  await ready(page)
  await expect(page.locator('.ide-editor-panel')).toBeVisible()
  await expect.poll(async()=>(await page.locator('.ide-editor-panel').boundingBox())!.width).toBeLessThan(expandedWidth)
  expect(await identity!.evaluate(node=>node===document.querySelector('.world-canvas canvas'))).toBe(true)
  expect((await world.boundingBox())!.width).toBe(width)
  await expect(slider(page)).toHaveAttribute('aria-valuenow',String(max))
  await expect(page.getByRole('region',{name:'Execution timeline',exact:true})).toBeVisible()
  await seekCursor(page,max-1);await page.getByRole('button',{name:'Return to Live',exact:true}).click()
  await expect(page.locator('.gg-time-dock')).toHaveAttribute('data-lens','LIVE')
  const saved=await(await request.get(`/api/projects/${id}/files?path=Main.java`)).json()
  expect(saved.content).toContain('p.setAge(19);')
})

test('real factorial uses the shared stack visualizer',async({page,request})=>{
  const id = await project(request, 'RealRecursion', [{ path: 'Main.java', content: 'public class Main { static int factorial(int n) { if(n<=1)return 1; return n*factorial(n-1); } public static void main(String[] args) { System.out.println(factorial(5)); } }' }])
  await open(page,id);await page.getByRole('button',{name:'Run',exact:true}).click()
  const session=await executionPhase(request,id,'COMPLETED',page)
  expect(session.rawEvents.filter(event=>event.type==='enter').length).toBeGreaterThan(5)
  expect(Number(await slider(page).getAttribute('aria-valuemax'))).toBeGreaterThan(8)
  // Classic/Spatial switches retire under the single production presentation.
  await expect(canvas(page)).toBeVisible();await seekCursor(page,8)
  await page.getByRole('combobox',{name:'Playback speed',exact:true}).selectOption('0.5')
  await follow(page);expect(await page.evaluate(()=>window.__ggjavaezQA!.navigationState().follow)).toBe(true)
  await page.getByRole('button',{name:'Play recorded execution',exact:true}).click()
  await expect(page.getByRole('button',{name:'Pause playback',exact:true})).toBeVisible()
  const safe=await page.evaluate(()=>window.__ggjavaezQA!.shellRects().safeFrame),before=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
  await page.mouse.move(safe.x+safe.width*.55,safe.y+safe.height*.55);await page.mouse.down()
  await page.mouse.move(safe.x+safe.width*.65,safe.y+safe.height*.6,{steps:8});await page.mouse.up()
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.navigationState().follow)).toBe(false)
  await expect(page.getByRole('button',{name:'Explore',exact:true})).toHaveAttribute('aria-pressed','true')
  expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).not.toEqual(before)
  await expect(page.getByRole('button',{name:'Pause playback',exact:true})).toBeVisible()
  await expect.poll(async()=>Number(await slider(page).getAttribute('aria-valuenow'))).toBeGreaterThan(8)
  await page.getByRole('button',{name:'Pause playback',exact:true}).click()
})

test('real int array uses shared World Focus, keeps indexed writes and reverse seeks',async({page,request})=>{
  const id = await project(request, 'RealArrays', [{ path: 'Main.java', content: 'public class Main { public static void main(String[] args) { int[] a={3,1}; if(a[0]>a[1]) { int temp=a[0]; a[0]=a[1]; a[1]=temp; } } }' }])
  await open(page,id);await page.getByRole('button',{name:'Run',exact:true}).click()
  const session=await executionPhase(request,id,'COMPLETED',page)
  expect(session.rawEvents.filter(event=>event.type==='array_write').length).toBeGreaterThanOrEqual(2)
  const max=Number(await slider(page).getAttribute('aria-valuemax'));expect(max).toBeGreaterThan(1)
  const arrayId=await page.evaluate(()=>Object.values(window.__ggjavaezWorld!.scene().entities).find(node=>node.kind==='array'&&node.componentType==='int')?.id)
  expect(arrayId).toBeTruthy();await home(page);await selectEntity(page,arrayId!)
  const values=async()=>{for(const[index,value]of['1','3'].entries())await expect(inspector(page).getByRole('button',{name:`Inspect [${index}]`,exact:true})).toHaveText(value)}
  await values()
  await inspector(page).getByRole('button',{name:'Focus selection',exact:true}).click();await ready(page)
  expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget()?.targetId)).toBe(arrayId)
  await expect(page.getByRole('button',{name:'Focus',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(canvas(page)).toBeVisible()
  await seekCursor(page,1)
  expect(await page.evaluate(id=>!!window.__ggjavaezWorld!.scene().entities[id!],arrayId)).toBe(false)
  await seekCursor(page,max);await home(page);await selectEntity(page,arrayId!);await values()
  expect(await page.evaluate(id=>window.__ggjavaezWorld!.scene().entities[id!].id,arrayId)).toBe(arrayId)
})

test('real control flow shows observed branches, source and stdout on the shared timeline',async({page,request})=>{
  const id = await project(request, 'RealControl', [{ path: 'Main.java', content: 'public class Main {\n public static void main(String[] args) {\n  int sum=0;\n  for(int i=0;i<3;i++) { if(i%2==0) sum+=i; }\n  System.out.println(sum);\n }\n}\n' }])
  await open(page,id);await page.getByRole('button',{name:'Run',exact:true}).click()
  const session=await executionPhase(request,id,'COMPLETED',page)
  expect(session.stdout).toContain('2');expect(session.rawEvents.some(event=>event.type==='branch')).toBe(true)
  expect(session.capability?.features.loops.status).toBe('partial')
  expect(Number(await slider(page).getAttribute('aria-valuemax'))).toBeGreaterThan(1)
  await openDock(page,'Console')
  const output=page.getByRole('region',{name:'Recorded console',exact:true}).locator('.console-line.ide-console-stdout .console-line-preview')
  const text=()=>output.allTextContents().then(lines=>lines.join(''))
  await expect.poll(text).toContain('2');await expect(page.locator('.ide-tab.is-active')).toContainText('Main.java')
  await seekCursor(page,0);await expect(output).toHaveCount(0);await expect(canvas(page)).toBeVisible()
  await page.getByRole('button',{name:'Return to Live',exact:true}).click();await expect.poll(text).toContain('2')
})

test('real uncaught exception retains an inspectable prefix and separate raw JVM stderr',async({page,request})=>{
  const id = await project(request, 'RealCrash', [{ path: 'Main.java', content: 'public class Main { public static void main(String[] args) { String value=null; System.out.println(value.length()); } }' }])
  await open(page,id);await page.getByRole('button',{name:'Run',exact:true}).click()
  const session=await executionPhase(request,id,'FAILED',page)
  expect(session.terminalStatus).toBe('program_crashed');expect(session.stderr).toContain('NullPointerException')
  expect(session.rawEvents.length).toBeGreaterThan(0)
  const max=Number(await slider(page).getAttribute('aria-valuemax'));expect(max).toBeGreaterThan(1)
  await openDock(page,'Errors')
  const explorer=page.getByRole('region',{name:'Error Explorer',exact:true})
  await expect(explorer.getByRole('heading',{name:'NullPointerException',exact:true})).toBeVisible()
  await explorer.getByText('Actual JVM stderr / stack trace',{exact:true}).click()
  await expect(explorer.locator('.error-summary pre')).toContainText('NullPointerException')
  await openDock(page,'Console');await page.locator('.ide-console-terminal summary').click()
  await expect(page.getByRole('region',{name:'stderr',exact:true}).locator('.console-line-preview').first()).toContainText('NullPointerException')
  await openDock(page,'Errors');await seekCursor(page,1)
  await expect(explorer.getByRole('heading',{name:'NullPointerException',exact:true})).toHaveCount(0)
  await expect(explorer).toContainText('No exception has been observed at this Event')
  await seekCursor(page,max);await expect(explorer.getByRole('heading',{name:'NullPointerException',exact:true})).toBeVisible()
})
