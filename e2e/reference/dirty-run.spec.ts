import {expect,test,type APIRequestContext,type Page} from '@playwright/test'
import {browserErrors,currentSession,ready} from './harness'
import type {ExecutionSession} from '../../src/execution/contracts'
import {draftStorageKey} from '../../src/ide/bridge'
const original={
 'Main.java':'public class Main { public static void main(String[] args) { Aux aux = new Aux(); System.out.println("VALUE " + aux.value); } }\n',
 'Aux.java':'class Aux { int value = 7; }\n',
}
async function file(request:APIRequestContext,id:string,path:string){const response=await request.get(`/api/projects/${id}/files?path=${encodeURIComponent(path)}`);expect(response.ok()).toBe(true);return response.json() as Promise<{content:string;revision:string}>}
async function openFile(page:Page,path:string){
 await page.keyboard.press('ControlOrMeta+p');await page.getByRole('combobox',{name:'Search project files',exact:true}).fill(path)
 await page.getByRole('option',{name:`${path} ${path}`,exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.modelUri)).toContain('/'+path)
 await page.getByRole('button',{name:'Expand source for editing',exact:true}).click()
 await expect(page.locator('.monaco-editor')).toBeVisible()
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.readOnly)).toBe(false)
}
async function edit(page:Page,path:string,marker:string){await openFile(page,path);await page.getByRole('textbox',{name:'Editor content',exact:true}).focus();await page.keyboard.press('ControlOrMeta+Home');await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.position)).toEqual({lineNumber:1,column:1});await page.keyboard.insertText(marker)}
async function world(page:Page){return page.evaluate(()=>{
 const qa=window.__ggjavaezQA!,scene=qa.scene()!
 return {execution:qa.appState().execution,recordingId:scene.recordingId,cursor:qa.cursor(),selection:qa.selection(),focus:qa.focusTarget(),anchors:Object.fromEntries(Object.entries(scene.entities).map(([id,node])=>[id,node.anchor]))}
})}
async function setup(page:Page,request:APIRequestContext){
 const imported=await request.post('/api/projects/import',{data:{name:`Dirty Run ${Date.now()}`,files:Object.entries(original).map(([path,content])=>({path,content}))}});expect(imported.ok()).toBe(true);const {id}=await imported.json() as {id:string}
 await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),id);await page.goto('/?qa=1');await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled()
 const started=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${id}/execution`&&response.request().method()==='POST');await page.getByRole('button',{name:'Run',exact:true}).click();const response=await started;expect(response.ok()).toBe(true);const baseline=await response.json() as ExecutionSession
 await expect.poll(async()=>(await currentSession(request))?.phase,{timeout:30000}).toBe('COMPLETED')
 expect((await currentSession(request))?.stdout).toBe('VALUE 7\n');expect((await currentSession(request))!.rawEvents.length).toBeGreaterThan(0)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA?.scene()?.recordingId)).toBe(`execution:${baseline.id}`)
 await page.getByRole('slider',{name:'Recorded execution position'}).focus();await page.keyboard.press('End');await ready(page)
 await page.locator('.world-canvas canvas').evaluate(node=>node.setAttribute('data-dirty-run-canvas','retained'))
 test.info().annotations.push({type:'actual-jvm-session',description:baseline.id});return{id,baseline}
}
function gate(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve});return{promise,release}}
for(const viewport of [{width:1440,height:900},{width:760,height:900}])test(`dirty Run waits for Cancel or every required save ${viewport.width}x${viewport.height}`,async({page,request})=>{
 test.setTimeout(60000);await page.setViewportSize(viewport);const errors=browserErrors(page),{id,baseline}=await setup(page,request)
 const markers={'Main.java':'// changed main\n','Aux.java':'// changed auxiliary\n'}
 await expect(page.locator('.shell-source-changed')).toHaveCount(0)
 for(const [path,marker]of Object.entries(markers))await edit(page,path,marker)
 await expect(page.locator('.shell-source-changed')).toHaveText('Source changed since this run')
 const before=await world(page),attempts:string[]=[]
 page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname===`/api/projects/${id}/execution`)attempts.push(request.url())})
 const run=page.getByRole('button',{name:'Run',exact:true}),dialog=page.getByRole('dialog',{name:'Unsaved changes before Run',exact:true})
 await run.click();await expect(dialog).toBeVisible();await expect(dialog.getByRole('list',{name:'Unsaved files'}).getByRole('listitem')).toHaveText(['Main.java','Aux.java'])
 await expect(dialog.getByRole('button',{name:'Save All and Run',exact:true})).toBeEnabled();await expect(dialog.getByRole('button',{name:"Don't Save",exact:true})).toHaveCount(0)
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/dirty-run-decision-${viewport.width}x${viewport.height}.png`})
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(run).toBeFocused();expect(await world(page)).toEqual(before);expect(attempts).toEqual([])
 for(const [path,content]of Object.entries(original))expect((await file(request,id,path)).content).toBe(content)
 await page.keyboard.press('Alt+Shift+r');await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(run).toBeFocused();expect(await world(page)).toEqual(before);expect(attempts).toEqual([])
 await page.keyboard.press('F1');const palette=page.getByRole('dialog',{name:'Command Palette',exact:true});await palette.getByRole('combobox').fill('Run Without Visualization');await palette.getByRole('option').click()
 await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).toHaveCount(0);expect(await world(page)).toEqual(before);expect(attempts).toEqual([])
 const gates={'Main.java':gate(),'Aux.java':gate()},saves:string[]=[]
 await page.route(`**/api/projects/${id}/files`,async route=>{
  if(route.request().method()!=='PUT'){await route.continue();return}
  const path=route.request().postDataJSON().path as keyof typeof gates;saves.push(path);await gates[path].promise;await route.continue()
 })
 try{
  await run.click();await dialog.getByRole('button',{name:'Save All and Run',exact:true}).click()
  await expect.poll(()=>saves).toEqual(['Main.java']);await expect(dialog.getByRole('button',{name:'Save All and Run',exact:true})).toBeDisabled();await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeDisabled();expect(attempts).toEqual([]);expect((await currentSession(request))!.id).toBe(baseline.id);expect(await world(page)).toEqual(before)
  gates['Main.java'].release();await expect.poll(()=>saves).toEqual(['Main.java','Aux.java']);expect(attempts).toEqual([]);expect((await file(request,id,'Main.java')).content).toBe(markers['Main.java']+original['Main.java']);expect((await file(request,id,'Aux.java')).content).toBe(original['Aux.java'])
  gates['Aux.java'].release();await expect(dialog).toHaveCount(0);await expect.poll(()=>attempts.length).toBe(1)
  await expect.poll(async()=>{const session=await currentSession(request);return session?.id!==baseline.id?session?.phase:null},{timeout:30000}).toBe('COMPLETED')
  const completed=(await currentSession(request))!;expect(completed.stdout).toBe('VALUE 7\n');expect(completed.rawEvents.length).toBeGreaterThan(0);test.info().annotations.push({type:'actual-jvm-session',description:completed.id})
  for(const path of Object.keys(original)as(keyof typeof original)[])expect((await file(request,id,path)).content).toBe(markers[path]+original[path])
  await expect(page.locator('.ide-dirty')).toHaveCount(0);await expect(page.locator('.shell-source-changed')).toHaveCount(0);await expect(page.locator('.world-canvas canvas')).toHaveAttribute('data-dirty-run-canvas','retained');expect(errors).toEqual([])
 }finally{Object.values(gates).forEach(g=>g.release())}
})
test('dirty Run reports a failed open save, still saves a closed draft, and retries before launch',async({page,request})=>{
 test.setTimeout(60000);const errors=browserErrors(page),{id,baseline}=await setup(page,request),marker='// retained open draft\n'
 await edit(page,'Main.java',marker)
 // A persisted, unopened draft models crash recovery; the production Save All
 // owner must load/check/save it without creating an Editor model.
 const aux=await file(request,id,'Aux.java'),closed='// restored closed draft\n'+original['Aux.java'],closedKey=draftStorageKey(id,'Aux.java')
 await page.evaluate(({key,draft,revision})=>localStorage.setItem(key,JSON.stringify({draft,revision})),{key:closedKey,draft:closed,revision:aux.revision})
 expect((await page.evaluate(()=>window.__ggjavaezQA!.editorModels())).modelUris.some(uri=>uri.endsWith('/Aux.java'))).toBe(false)
 const before=await world(page),attempts:string[]=[],saves:string[]=[]
 page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname===`/api/projects/${id}/execution`)attempts.push(request.url())})
 await page.route(`**/api/projects/${id}/files`,async route=>{
  if(route.request().method()!=='PUT'){await route.continue();return}
  const path=route.request().postDataJSON().path as string;saves.push(path)
  if(path==='Main.java')await route.fulfill({status:409,json:{error:'Simulated source revision conflict'}})
  else await route.continue()
 })
 const dialog=page.getByRole('dialog',{name:'Unsaved changes before Run',exact:true})
 await page.getByRole('button',{name:'Run',exact:true}).click();await expect(dialog.getByRole('listitem')).toHaveText(['Main.java','Aux.java']);await dialog.getByRole('button',{name:'Save All and Run',exact:true}).click()
 await expect(dialog.getByRole('alert')).toContainText('Main.java: Simulated source revision conflict');await expect(dialog.getByRole('button',{name:'Save All and Run',exact:true})).toBeEnabled()
 expect(saves).toEqual(['Main.java','Aux.java']);expect(attempts).toEqual([]);expect(await world(page)).toEqual(before);expect((await currentSession(request))!.id).toBe(baseline.id)
 await expect(dialog.getByRole('listitem')).toHaveText(['Main.java']);await expect(page.locator('.ide-dirty')).toHaveCount(1)
 expect((await file(request,id,'Main.java')).content).toBe(original['Main.java']);expect((await file(request,id,'Aux.java')).content).toBe(closed)
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).draft,draftStorageKey(id,'Main.java'))).toBe(marker+original['Main.java'])
 expect(await page.evaluate(key=>localStorage.getItem(key),closedKey)).toBeNull();expect((await page.evaluate(()=>window.__ggjavaezQA!.editorModels())).modelUris.some(uri=>uri.endsWith('/Aux.java'))).toBe(false)
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/dirty-run-save-error-1440x900.png'})
 await page.unroute(`**/api/projects/${id}/files`);await dialog.getByRole('button',{name:'Save All and Run',exact:true}).click();await expect(dialog).toHaveCount(0);await expect.poll(()=>attempts.length).toBe(1)
 await expect.poll(async()=>{const session=await currentSession(request);return session?.id!==baseline.id?session?.phase:null},{timeout:30000}).toBe('COMPLETED')
 const completed=(await currentSession(request))!;expect(completed.stdout).toBe('VALUE 7\n');expect(completed.rawEvents.length).toBeGreaterThan(0);test.info().annotations.push({type:'actual-jvm-session',description:completed.id})
 expect((await file(request,id,'Main.java')).content).toBe(marker+original['Main.java']);await expect(page.locator('.ide-dirty')).toHaveCount(0);await expect(page.locator('.world-canvas canvas')).toHaveAttribute('data-dirty-run-canvas','retained')
 expect(errors.filter(message=>message.includes('409'))).toHaveLength(1);expect(errors.filter(message=>!message.includes('409'))).toEqual([])
})
