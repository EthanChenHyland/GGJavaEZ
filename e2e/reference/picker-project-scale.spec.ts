import {expect,test} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {ready,browserErrors} from './harness'
declare global {interface Window{__referenceQuickOpenKeyAt?:number|null}}
interface QaProject {id:string;name:string}
let ownedProjectId:string|null=null
for(const viewport of [{width:1440,height:900},{width:760,height:900}])test(`actual project Quick Open reaches 5000 files within its query budget ${viewport.width}x${viewport.height}`,async({page,request},testInfo)=>{
 test.setTimeout(240000);await page.setViewportSize(viewport);const errors=browserErrors(page)
 if(!ownedProjectId){
  const response=await request.get('/api/projects');expect(response.ok()).toBe(true);const projects=await response.json() as QaProject[]
  for(const project of (Array.isArray(projects)?projects:[]).filter(p=>p.name.startsWith('Native Quick Open 5000 ')).sort((a,b)=>b.name.localeCompare(a.name))){
   const main=await request.get(`/api/projects/${project.id}/files?path=Main.java`),last=await request.get(`/api/projects/${project.id}/files?path=generated%2Fp49%2FClass4999.java`)
   if(main.ok()&&last.ok()&&(await main.json()).content.includes('5000 FILE PROJECT')&&(await last.json()).content.includes('int value = 4999;')){ownedProjectId=project.id;break}
  }
 }
 if(!ownedProjectId){
  const files=[{path:'Main.java',content:'public class Main { public static void main(String[] args) { System.out.println("5000 FILE PROJECT"); } }\n'},...Array.from({length:4999},(_,i)=>{const n=i+1,name='Class'+String(n).padStart(4,'0'),pkg='p'+String(Math.floor(n/100)).padStart(2,'0');return{path:`generated/${pkg}/${name}.java`,content:`package generated.${pkg}; final class ${name} { int value = ${n}; }\n`}})]
  const response=await request.post('/api/projects/import',{data:{name:'Native Quick Open 5000 '+Date.now(),files}});expect(response.ok()).toBe(true);ownedProjectId=(await response.json()).id
 }
 const projectId=ownedProjectId!
 await page.addInitScript(id=>{
  localStorage.setItem('ggjavaez:project',id)
  window.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.code==='KeyP')window.__referenceQuickOpenKeyAt=performance.now()},true)
 },projectId)
 await page.goto('/?qa=1')
 await expect(page.getByRole('button',{name:'Project menu',exact:true})).toHaveAttribute('data-project-id',projectId,{timeout:30_000})
 await page.waitForFunction(()=>typeof window.__ggjavaezQA?.ready==='function')
 await ready(page)
 await page.locator('.world-canvas').focus()
 // Capture before the Shell's own window handler consumes the shortcut.
 const opening=page.evaluate(()=>new Promise<number>((resolve,reject)=>{
  window.__referenceQuickOpenKeyAt=null
  const cleanup=()=>{observer.disconnect();document.removeEventListener('focusin',check,true);clearTimeout(timeout)}
  const check=()=>{const at=window.__referenceQuickOpenKeyAt;if(typeof at==='number'&&document.activeElement?.getAttribute('aria-label')==='Search project files'){const elapsed=performance.now()-at;cleanup();resolve(elapsed)}}
  const observer=new MutationObserver(check);observer.observe(document.body,{subtree:true,childList:true,attributes:true});document.addEventListener('focusin',check,true)
  const timeout=setTimeout(()=>{cleanup();reject(new Error('Quick Open did not focus its query'))},3000)
 }))
 await page.keyboard.press('ControlOrMeta+p');const dialog=page.getByRole('dialog',{name:'Quick Open',exact:true}),input=page.getByRole('combobox',{name:'Search project files',exact:true});await expect(input).toBeFocused();const openMs=await opening
 await expect(dialog).toContainText('5000 files');expect(await page.locator('.world-canvas canvas').count()).toBe(1);expect(await dialog.getByRole('option').count()).toBeLessThan(30)
 await input.press('End');await expect(dialog.getByRole('option',{selected:true})).toHaveAttribute('aria-posinset','5000');await expect(dialog.getByRole('option',{selected:true})).toBeInViewport();await input.press('Home')
 const samples=[]
 for(const [query,expectedName] of [['Class4999.java','Class4999.java'],['CLASS0001.JAVA','Class0001.java'],['',null]] as const){
  // Register both the input clock and the frame checks in the browser.
  // A second automation round trip can arrive several paints after input.
  await input.evaluate((node,expectedName)=>{
   Reflect.set(node,'__referenceQuickOpenResult',new Promise<number>((resolve,reject)=>{
    node.addEventListener('input',()=>{
     const at=performance.now()
     const matches=()=>{
      const row=node.closest('[role="dialog"]')?.querySelector('[role="option"]')
      return expectedName?row?.getAttribute('aria-setsize')==='1'&&row.querySelector('strong')?.textContent===expectedName:row?.getAttribute('aria-setsize')==='5000'
     }
     const check=()=>{
      const elapsed=performance.now()-at
      if(matches())resolve(elapsed)
      else if(elapsed>=3000)reject(new Error('Quick Open did not display the expected result'))
      else requestAnimationFrame(check)
     }
     requestAnimationFrame(()=>requestAnimationFrame(check))
    },{capture:true,once:true})
   }))
  },expectedName)
  await input.fill(query)
  const elapsed=await input.evaluate(node=>Reflect.get(node,'__referenceQuickOpenResult') as Promise<number>)
  if(expectedName){await expect(dialog.getByRole('option')).toHaveCount(1);await expect(dialog.getByRole('option')).toContainText(expectedName)}
  else await expect(dialog).toContainText('5000 files')
  samples.push({query,inputEventToRenderedResultMs:elapsed,mountedRows:await dialog.getByRole('option').count()})
 }
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/picker-full-app-5000-${viewport.width}x${viewport.height}.png`})
 await input.fill('Class4999.java');await page.keyboard.press('Enter');await expect(dialog).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.modelUri)).toContain('/generated/p49/Class4999.java')
 const file=await request.get(`/api/projects/${projectId}/files?path=generated%2Fp49%2FClass4999.java`);expect(file.ok()).toBe(true);const content=(await file.json()).content;expect(content).toContain('int value = 4999;')
 const report=JSON.stringify({projectId,actualImportedSourceFiles:5000,fullProductionShell:true,actualWebglCanvas:await page.locator('.world-canvas canvas').count(),openKeyToFocusedQueryMs:openMs,samples,budgetMs:200,actualOpenedPath:'generated/p49/Class4999.java',errors,boundary:'Generated ordinary Java files imported via real project API; production Shell/Editor/Explorer/WebGL; no JVM capture or isolated Picker injection.'},null,2)+'\n'
 await writeFile(`.ggjavaez/qa/reference-exact/picker-full-app-5000-${viewport.width}x${viewport.height}.json`,report)
 await testInfo.attach('quick-open-timing',{body:report,contentType:'application/json'})
 expect(openMs).toBeLessThanOrEqual(200);for(const sample of samples){expect(sample.inputEventToRenderedResultMs,sample.query).toBeLessThanOrEqual(200);expect(sample.mountedRows).toBeLessThan(30)}expect(errors).toEqual([])
})
