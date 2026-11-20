import {selectProject} from './menuActions'
import {expect,test,type Page} from '@playwright/test'
import {browserErrors} from './harness'
import {documentUri} from '../../src/language/protocol'
async function openFile(page:Page,path:string){
 await page.keyboard.press('ControlOrMeta+p')
 await page.getByRole('combobox',{name:'Search project files',exact:true}).fill(path)
 await page.getByRole('option',{name:`${path} ${path}`,exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.modelUri)).toMatch(new RegExp(`/${path.replace('.', '\\.')}$`))
}
async function inventory(page:Page){return page.evaluate(()=>window.__ggjavaezQA!.editorModels())}
for(const viewport of [{width:1440,height:900},{width:760,height:900}])test(`editable models retire on committed tab/project replacement ${viewport.width}x${viewport.height}`,async({page,request})=>{
 test.setTimeout(60000);await page.setViewportSize(viewport)
 const errors=browserErrors(page),requests:string[]=[]
 page.on('request',request=>{if(/monaco|EditableJavaEditor|RecordedSourceEditor/i.test(request.url()))requests.push(request.url())})
 const lines=Array.from({length:180},(_,index)=>`  // line ${index+1}`);lines[0]='class Main {';lines[179]='}'
 const projects:{id:string}[]=[]
 for(let index=0;index<2;index++){
  const response=await request.post('/api/projects/import',{data:{name:`Model ownership ${Date.now()} ${index}`,files:[{path:'Main.java',content:lines.join('\n')+'\n'},{path:'Aux.java',content:'class Aux {}\n'}]}})
  expect(response.ok()).toBe(true);projects.push(await response.json())
 }
 const [first,second]=projects
 await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),first.id)
 await page.goto('/?qa=1');await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled()
 if(viewport.width<1024){
  await expect(page.getByRole('button',{name:'Show source drawer',exact:true})).toContainText('Main.java')
  await expect(page.locator('.monaco-editor')).toHaveCount(0);expect(requests).toEqual([])
  expect(await inventory(page)).toEqual({loaded:false,modelUris:[],viewUris:[]})
  await page.getByRole('button',{name:'Show source drawer',exact:true}).click()
 }
 await expect(page.locator('.monaco-editor')).toBeVisible();await openFile(page,'Main.java')
 await page.getByRole('textbox',{name:'Editor content',exact:true}).focus();await page.keyboard.press('ControlOrMeta+Home')
 for(let index=0;index<25;index++)await page.keyboard.press('ArrowDown')
 await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Shift+ArrowRight')
 const before=await page.evaluate(()=>window.__ggjavaezQA!.source()!)
 expect(before.position?.lineNumber).toBe(26)
 await openFile(page,'Aux.java');await openFile(page,'Main.java')
 const restored=await page.evaluate(()=>window.__ggjavaezQA!.source()!)
 expect(restored.position).toEqual(before.position);expect(restored.selection).toEqual(before.selection);expect(restored.scrollTop).toBe(before.scrollTop)
 expect((await inventory(page)).modelUris).toEqual([documentUri(first.id,'Aux.java'),documentUri(first.id,'Main.java')].sort())
 expect((await inventory(page)).viewUris).toContain(documentUri(first.id,'Main.java'))
 await page.getByRole('button',{name:'Close Aux.java',exact:true}).click()
 await expect.poll(async()=>(await inventory(page)).modelUris).toEqual([documentUri(first.id,'Main.java')])
 expect((await inventory(page)).viewUris).not.toContain(documentUri(first.id,'Aux.java'))
 // Cancelled dirty closure must retain the actual model and view; discard then
 // commits closure and retires it. All decisions use the production dialog.
 await page.getByRole('textbox',{name:'Editor content',exact:true}).focus();await page.keyboard.press('ControlOrMeta+End');await page.keyboard.insertText('// unsaved')
 await expect(page.locator('.ide-dirty')).toBeVisible()
 await page.getByRole('button',{name:'Close Main.java',exact:true}).click()
 await expect(page.getByRole('dialog',{name:'Unsaved changes'})).toBeVisible()
 await page.getByRole('button',{name:'Cancel',exact:true}).click()
 expect((await inventory(page)).modelUris).toContain(documentUri(first.id,'Main.java'))
 await page.getByRole('button',{name:'Close Main.java',exact:true}).click();await page.getByRole('button',{name:"Don't Save",exact:true}).click()
 await expect.poll(async()=>(await inventory(page)).modelUris).toEqual([]);expect((await inventory(page)).viewUris).toEqual([])
 await openFile(page,'Main.java');await openFile(page,'Aux.java')
 await page.getByRole('button',{name:'Show project explorer',exact:true}).click()
 await selectProject(page,second.id)
 await expect(page.getByRole('button',{name:'Project menu',exact:true})).toHaveAttribute('aria-disabled','false')
 await page.keyboard.press('Alt+Shift+e')
 await expect(page.getByRole('tree',{name:'Project explorer',exact:true})).toBeHidden()
 if(viewport.width<1024)await page.getByRole('button',{name:'Show source drawer',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.modelUri)).toMatch(new RegExp(`/${second.id}/`))
 await expect.poll(async()=>(await inventory(page)).modelUris).toEqual([documentUri(second.id,'Main.java')])
 expect((await inventory(page)).viewUris).toEqual([])
 await expect(page.getByRole('tab',{name:/Main.java/})).toBeVisible()
 await expect(page.locator('.ide-editor-foot')).toContainText('Main.java')
 await expect(page.locator('.monaco-editor .view-line').first()).toContainText('class Main')
 await expect.poll(()=>page.locator('.ide-editor-panel').evaluate(panel=>{const rect=panel.getBoundingClientRect(),style=getComputedStyle(panel);return Math.abs(rect.width-Number.parseFloat(style.getPropertyValue('--source-width')))})).toBeLessThan(1)
 const idle=await page.evaluate(()=>{
  const prompt=document.querySelector('.ide-runtime-ready')!.getBoundingClientRect(),source=document.querySelector('.ide-editor-panel')!.getBoundingClientRect()
  return{opacity:getComputedStyle(document.querySelector('.world-canvas canvas')!).opacity,prompt:{x:prompt.x,y:prompt.y,width:prompt.width,height:prompt.height},sourceRight:source.right,shell:window.__ggjavaezQA!.shellRects(),headings:window.__ggjavaezWorld!.structuralLabels().filter(label=>label.visible)}
 })
 expect(idle.opacity).toBe('0.45');expect(idle.prompt.x).toBeGreaterThanOrEqual(idle.sourceRight+12)
 expect(idle.prompt.x+idle.prompt.width).toBeLessThanOrEqual(viewport.width)
 expect(idle.shell.header).not.toBeNull();expect(idle.shell.timeDock).not.toBeNull()
 expect(idle.prompt.y).toBeGreaterThanOrEqual(idle.shell.header!.height)
 expect(idle.prompt.y+idle.prompt.height).toBeLessThan(idle.shell.timeDock!.y)
 for(const label of idle.headings){const rect=label.bounds!;expect(Math.min(rect.y+rect.height,idle.prompt.y+idle.prompt.height)-Math.max(rect.y,idle.prompt.y)).toBeLessThanOrEqual(0)}
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/editor-models-${viewport.width}x${viewport.height}.png`})
 // Repeated project replacement cannot accumulate the previous project's
 // models or view caches, even when the original files are opened again.
 await page.getByRole('button',{name:'Show project explorer',exact:true}).click()
 await selectProject(page,first.id)
 await expect(page.getByRole('button',{name:'Project menu',exact:true})).toHaveAttribute('aria-disabled','false')
 await page.keyboard.press('Alt+Shift+e')
 await expect(page.getByRole('tree',{name:'Project explorer',exact:true})).toBeHidden()
 if(viewport.width<1024)await page.getByRole('button',{name:'Show source drawer',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.modelUri)).toMatch(new RegExp(`/${first.id}/`))
 expect((await inventory(page)).modelUris).toEqual([(await page.evaluate(()=>window.__ggjavaezQA!.source()!)).modelUri])
 expect(errors).toEqual([])
})
