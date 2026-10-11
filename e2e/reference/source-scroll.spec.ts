import {expect,test,type Page} from '@playwright/test'
import {browserErrors,currentSession,ready} from './harness'
let ownedProject:string|null=null
test.afterEach(async({request})=>{
 const session=await currentSession(request)
 if(session?.projectId===ownedProject&&['BUILDING','STARTING','RUNNING','WAITING_FOR_INPUT','PAUSED'].includes(session.phase)){
  const response=await request.post(`/api/execution/${session.id}/stop`,{data:{}});expect(response.ok()).toBe(true)
 }
 ownedProject=null
})

test('recorded Source loads on its first narrow display and retains its read-only view',async({page})=>{
 await page.setViewportSize({width:760,height:900})
 const requests:string[]=[],errors=browserErrors(page)
 page.on('request',request=>{if(/monaco|EditableJavaEditor|RecordedSourceEditor/i.test(request.url()))requests.push(request.url())})
 await page.goto('/examples?qa=1')
 await page.waitForFunction(()=>!!window.__ggjavaezWorld?.ready)
 await page.getByRole('slider',{name:'Recorded execution position'}).focus();await page.keyboard.press('End')
 await ready(page)
 await expect(page.getByRole('button',{name:'Show source drawer',exact:true})).toContainText('.java')
 await expect(page.locator('.monaco-editor')).toHaveCount(0);expect(requests).toEqual([])
 const before=await page.evaluate(()=>({cursor:window.__ggjavaezQA!.cursor(),pose:window.__ggjavaezQA!.cameraPose(),selection:window.__ggjavaezQA!.selection()}))
 await page.getByRole('button',{name:'Show source drawer',exact:true}).click()
 await expect(page.locator('.monaco-editor')).toBeVisible();await sourceSettled(page)
 await expect.poll(async()=>(await editorView(page))?.readOnly).toBe(true)
 const view=(await editorView(page))!;expect(requests.length).toBeGreaterThan(0)
 await page.getByRole('button',{name:/^(Collapse source|Close source drawer)$/}).click()
 await expect(page.locator('.monaco-editor')).toBeAttached();await expect(page.locator('.monaco-editor')).toBeHidden()
 await page.getByRole('button',{name:'Show source drawer',exact:true}).click();await sourceSettled(page)
 await expect(page.locator('.monaco-editor')).toBeVisible()
 const reopened=(await editorView(page))!
 expect(reopened.readOnly).toBe(true);expect(reopened.modelUri).toBe(view.modelUri)
 expect(reopened.first).toBe(view.first);expect(reopened.position).toEqual(view.position);expect(reopened.selection).toEqual(view.selection)
 expect(await page.evaluate(()=>({cursor:window.__ggjavaezQA!.cursor(),pose:window.__ggjavaezQA!.cameraPose(),selection:window.__ggjavaezQA!.selection()}))).toEqual(before)
 expect(errors).toEqual([])
})
async function pausePosition(page:Page){
 return page.locator('.monaco-editor').evaluate(editor=>{
  const area=editor.getBoundingClientRect(),line=editor.querySelector('.debug-paused-line')?.getBoundingClientRect()
  return line?{fraction:(line.y+line.height/2-area.y)/area.height,pitch:line.height}:null
 })
}
async function editorView(page:Page){
 return page.evaluate(()=>window.__ggjavaezQA!.source())
}
async function sourceSettled(page:Page){
 await expect.poll(()=>page.locator('.ide-editor-panel').evaluate(panel=>{const r=panel.getBoundingClientRect(),style=getComputedStyle(panel);return Math.max(Math.abs(r.height-Number.parseFloat(style.getPropertyValue('--source-height'))),Math.abs(r.width-Number.parseFloat(style.getPropertyValue('--source-width'))))})).toBeLessThan(1)
}
for(const viewport of [{width:1728,height:1117},{width:1440,height:900},{width:1280,height:800},{width:760,height:900},{width:1440,height:650}])test(`real debugger source scrolling and compact controls ${viewport.width}x${viewport.height}`,async({page,request})=>{
 await page.setViewportSize(viewport)
 test.setTimeout(60000)
 const editorRequests:string[]=[]
 page.on('request',request=>{if(/monaco|EditableJavaEditor|RecordedSourceEditor/i.test(request.url()))editorRequests.push(request.url())})
 const errors=browserErrors(page),lines=Array.from({length:240},(_,i)=>`    // source ${i+1}`)
 lines[0]='public class ScrollApp {';lines[1]='    public static void main(String[] args) {'
 lines[89]='        int quantity = 1;';lines[90]='        quantity += 2;'
 lines[99]='        System.out.println("QTY " + quantity);';lines[238]='    }';lines[239]='}'
 const response=await request.post('/api/projects/import',{data:{name:`Source scrolling ${Date.now()}`,files:[{path:'ScrollApp.java',content:lines.join('\n')+'\n'},{path:'Aux.java',content:'final class Aux {}\n'}]}})
 expect(response.ok()).toBe(true);const{id}=await response.json();ownedProject=id
 await page.addInitScript(id=>{
  localStorage.setItem('ggjavaez:project',id)
  localStorage.setItem(`ggjavaez:breakpoints:${id}`,JSON.stringify([{fileId:'ScrollApp.java',line:91}]))
 },id)
 await page.goto('/?qa=1')
 if(viewport.width<1024){
  await expect(page.getByRole('button',{name:'Show source drawer',exact:true})).toContainText('Aux.java')
  await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled()
  await page.waitForFunction(()=>!!window.__ggjavaezWorld?.ready);await ready(page)
  await expect(page.locator('.monaco-editor')).toHaveCount(0)
  expect(editorRequests).toEqual([])
  await page.getByRole('button',{name:'Show source drawer',exact:true}).click()
 }
 await expect(page.locator('.monaco-editor')).toBeVisible()
 await page.getByRole('button',{name:'Debug',exact:true}).click()
 await expect.poll(async()=>{const session=await currentSession(request);return session&&session.projectId===id&&session.phase==='PAUSED'?session.pause?.reason:null},{timeout:15000}).toBe('entry')
 await page.getByRole('button',{name:'Continue',exact:true}).click()
 await expect.poll(async()=>{const session=await currentSession(request);return session&&session.projectId===id&&session.phase==='PAUSED'?session.pause?.line:null},{timeout:15000}).toBe(91)
 if(viewport.width<1024&&await page.locator('.monaco-editor').isHidden())await page.getByRole('button',{name:'Show source drawer',exact:true}).click()
 await ready(page);await sourceSettled(page)
 await expect.poll(async()=>(await editorView(page))?.target).toEqual({mark:'paused',line:91})
 await test.info().attach('source-pause-observation',{body:JSON.stringify(await editorView(page)),contentType:'application/json'})
 try{await expect.poll(async()=>{const position=await pausePosition(page);return !!position&&position.fraction>=1/3&&position.fraction<=2/3}).toBe(true)}catch(error){await test.info().attach('source-pause-failure',{body:JSON.stringify(await editorView(page)),contentType:'application/json'});throw error}
 const first=(await pausePosition(page))!
 expect(first.fraction).toBeGreaterThanOrEqual(1/3);expect(first.fraction).toBeLessThanOrEqual(2/3)
 expect(first.pitch).toBeGreaterThanOrEqual(Math.max(20,viewport.height*.029)*.9);expect(first.pitch).toBeLessThanOrEqual(Math.max(20,viewport.height*.029)*1.1)
 const controls=page.getByRole('toolbar',{name:'JVM debugger controls'})
 await expect(controls.getByRole('button')).toHaveCount(6)
 const header=page.getByRole('banner'),headerButtons=await header.getByRole('button').all()
 const rectangles=await Promise.all(headerButtons.map(button=>button.boundingBox()))
 for(let index=0;index<rectangles.length;index++){
  const rect=rectangles[index]!;expect(rect).not.toBeNull()
  expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(viewport.width)
  for(const other of rectangles.slice(index+1))expect(Math.min(rect.x+rect.width,other!.x+other!.width)-Math.max(rect.x,other!.x)).toBeLessThanOrEqual(0)
 }
 for(const name of ['Continue','Step Over','Step Into','Step Out','Stop debugger','Inspect debugger']){
  const rect=await controls.getByRole('button',{name,exact:true}).boundingBox(),bar=await controls.boundingBox()
  expect(rect).not.toBeNull();expect(bar).not.toBeNull()
  expect(rect!.width).toBeGreaterThanOrEqual(24);expect(rect!.height).toBeGreaterThanOrEqual(24)
  expect(rect!.x).toBeGreaterThanOrEqual(bar!.x);expect(rect!.x+rect!.width).toBeLessThanOrEqual(bar!.x+bar!.width)
  expect(rect!.y).toBeGreaterThanOrEqual(bar!.y);expect(rect!.y+rect!.height).toBeLessThanOrEqual(bar!.y+bar!.height)
 }
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/source-debug-${viewport.width}x${viewport.height}.png`})
 const before=await page.evaluate(()=>({cursor:window.__ggjavaezQA!.cursor(),pose:window.__ggjavaezQA!.cameraPose(),selection:window.__ggjavaezQA!.selection()}))
 await page.locator('.monaco-editor').hover()
 const hit=await page.locator('.monaco-editor').evaluate(editor=>{const r=editor.getBoundingClientRect();return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,500)}})
 await test.info().attach('wheel-hit',{body:JSON.stringify(hit),contentType:'application/json'})
 // Native Chrome on macOS normalizes a wheel packet to a physical notch.
 // Use real repeated gestures and observe Monaco instead of assuming pixels.
 for(let gesture=0;gesture<64&&(await editorView(page))!.first>1;gesture++){
  const previous=(await editorView(page))!.scrollTop
  await page.mouse.wheel(0,-300)
  await expect.poll(async()=>(await editorView(page))!.scrollTop).toBeLessThan(previous)
 }
 try{expect((await editorView(page))!.first).toBe(1)}finally{
  await test.info().attach('editor-after-wheel',{body:JSON.stringify({source:await editorView(page),world:await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())}),contentType:'application/json'})
 }
 const top=(await editorView(page))!
 await page.getByRole('button',{name:'Expand source for editing',exact:true}).click();await ready(page);await sourceSettled(page)
 await expect(page.locator('.monaco-editor')).toBeVisible()
 const expanded=(await editorView(page))!
 expect(expanded.first).toBe(top.first);expect(expanded.position).toEqual(top.position);expect(expanded.selection).toEqual(top.selection)
 expect(expanded.last).toBeLessThan(91)
 await page.keyboard.press('ControlOrMeta+p')
 await page.getByRole('combobox',{name:'Search project files',exact:true}).fill('Aux.java')
 await page.getByRole('option',{name:'Aux.java Aux.java',exact:true}).click()
 await expect.poll(async()=>(await editorView(page))?.modelUri.endsWith('/Aux.java')).toBe(true)
 await page.getByRole('tab',{name:/ScrollApp.java/}).getByRole('button',{name:'J ScrollApp.java',exact:true}).click()
 await expect.poll(async()=>(await editorView(page))?.modelUri.endsWith('/ScrollApp.java')).toBe(true)
 const restored=(await editorView(page))!
 expect(restored.first).toBe(top.first);expect(restored.position).toEqual(top.position);expect(restored.selection).toEqual(top.selection)
 if(viewport.width<1024){
  expect(editorRequests.length).toBeGreaterThan(0)
  await page.getByRole('button',{name:/^(Collapse source|Close source drawer)$/}).click()
  await expect(page.locator('.monaco-editor')).toBeAttached();await expect(page.locator('.monaco-editor')).toBeHidden()
  await page.getByRole('button',{name:'Show source drawer',exact:true}).click();await sourceSettled(page)
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const reopened=(await editorView(page))!
  expect(reopened.modelUri).toBe(restored.modelUri);expect(reopened.first).toBe(top.first)
  expect(reopened.position).toEqual(top.position);expect(reopened.selection).toEqual(top.selection)
 }
 expect(await page.evaluate(()=>({cursor:window.__ggjavaezQA!.cursor(),pose:window.__ggjavaezQA!.cameraPose(),selection:window.__ggjavaezQA!.selection()}))).toEqual(before)
 // Home must fit both real region headings, independent of a transient Source
 // drawer. Changing the camera is explicit; restoring Source must retain its
 // manually scrolled model view.
 if(viewport.width<1024)await page.getByRole('button',{name:/^(Collapse source|Close source drawer)$/}).click()
 await page.getByRole('button',{name:'Home',exact:true}).click();await ready(page)
 const headings=await page.evaluate(()=>({labels:window.__ggjavaezWorld!.structuralLabels().filter(label=>label.kind==='heading'&&['STACK','HEAP'].includes(label.id)),safe:window.__ggjavaezQA!.shellRects().safeFrame}))
 await test.info().attach('source-home-headings',{body:JSON.stringify(headings),contentType:'application/json'})
 expect(headings.labels.map(label=>label.id).sort()).toEqual(['HEAP','STACK'])
 for(const label of headings.labels){
  expect(label.visible).toBe(true);expect(label.minimumFontPixels).toBeGreaterThanOrEqual(12)
  const rect=label.bounds!,safe=headings.safe
  expect(rect.x).toBeGreaterThanOrEqual(safe.x);expect(rect.y).toBeGreaterThanOrEqual(safe.y)
  expect(rect.x+rect.width).toBeLessThanOrEqual(safe.x+safe.width);expect(rect.y+rect.height).toBeLessThanOrEqual(safe.y+safe.height)
 }
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/source-home-${viewport.width}x${viewport.height}.png`})
 if(viewport.width<1024)await page.getByRole('button',{name:'Show source drawer',exact:true}).click()
 await sourceSettled(page)
 expect((await editorView(page))!.first).toBe(top.first)
 await page.getByRole('button',{name:'Step Over',exact:true}).click()
 await expect.poll(async()=>{const session=await currentSession(request);return session&&session.projectId===id&&session.phase==='PAUSED'?session.pause?.line:null},{timeout:15000}).toBe(100)
 await ready(page);await sourceSettled(page);await expect.poll(async()=>(await editorView(page))?.target).toEqual({mark:'paused',line:100})
 await expect.poll(async()=>{const position=await pausePosition(page);return !!position&&position.fraction>=1/3&&position.fraction<=2/3}).toBe(true)
 const next=(await pausePosition(page))!
 expect(next.fraction).toBeGreaterThanOrEqual(1/3);expect(next.fraction).toBeLessThanOrEqual(2/3)
 expect(errors).toEqual([])
})
