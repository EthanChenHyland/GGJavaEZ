import {expect,test,type APIRequestContext,type Page} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {browserErrors,ready} from './harness'
import {selectRecording} from './menuActions'
const launchName='AnIntentionallyLongJavaApplicationLaunchTargetForHeaderTruncation'
const source=`public class ${launchName} { public static void main(String[] args) { System.out.println("HEADER"); } }\n`
const viewports=[{width:1728,height:1117},{width:1440,height:900},{width:1280,height:800},{width:760,height:900},{width:1440,height:650}]
async function project(request:APIRequestContext,name:string){
 const response=await request.post('/api/projects/import',{data:{name:`Header ${name} ${Date.now()}`,files:[{path:launchName+'.java',content:source}]}})
 expect(response.ok()).toBe(true);return (await response.json()).id as string
}
async function open(page:Page,id:string){
 await page.addInitScript(value=>localStorage.setItem('ggjavaez:project',value),id);await page.goto('/?qa=1')
 await expect(page.getByRole('button',{name:'Project menu',exact:true})).toHaveAttribute('data-project-id',id)
 await expect(page.getByRole('button',{name:'Run',exact:true})).toBeEnabled();await ready(page)
}
function menuAction(page:Page,id:string){return page.getByRole('menuitem').and(page.locator(`[data-menu-action=${JSON.stringify(id)}]`))}
async function pointerClick(page:Page,control:ReturnType<Page['getByRole']>){const box=(await control.boundingBox())!;await page.mouse.click(box.x+box.width/2,box.y+box.height/2)}
async function state(page:Page){return page.evaluate(()=>({execution:window.__ggjavaezQA!.appState().execution,camera:window.__ggjavaezQA!.cameraPose(),pressed:Array.from(document.querySelectorAll('.shell-modes [aria-pressed=true]')).map(button=>button.getAttribute('aria-label'))}))}
for(const viewport of viewports)test(`Header menu, launch bounds and disabled reasons ${viewport.width}x${viewport.height}`,async({page,request})=>{
 test.setTimeout(60000);await page.setViewportSize(viewport);const errors=browserErrors(page),id=await project(request,'geometry');await open(page,id)
 const projectButton=page.getByRole('button',{name:'Project menu',exact:true}),menu=page.getByRole('menu',{name:'Project actions',exact:true})
 await projectButton.click();await expect(menu).toBeVisible()
 const rect=(await menu.boundingBox())!;expect(rect.x).toBeGreaterThanOrEqual(8);expect(rect.y).toBeGreaterThanOrEqual(8);expect(rect.x+rect.width).toBeLessThanOrEqual(viewport.width-8);expect(rect.y+rect.height).toBeLessThanOrEqual(viewport.height-8)
 await expect(menuAction(page,'project:'+id)).toHaveAttribute('aria-disabled','true')
 await expect(menuAction(page,'workbench.importProject')).toContainText('Creates a managed copy; originals stay in place.')
 if(viewport.width===1728||viewport.width===760)await page.screenshot({path:`.ggjavaez/qa/reference-exact/header-project-menu-${viewport.width}x${viewport.height}.png`})
 await projectButton.click();await expect(menu).toHaveCount(0);await expect(projectButton).toBeFocused()
 await projectButton.click();await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(projectButton).toBeFocused()
 const built=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${id}/build`&&response.request().method()==='POST')
 await page.keyboard.press('F1');const palette=page.getByRole('dialog',{name:'Command Palette',exact:true});await palette.getByRole('combobox').fill('execution.build');await palette.getByRole('option').click()
 const buildResponse=await built;expect(buildResponse.ok()).toBe(true);const build=await buildResponse.json();expect(build.success,build.rawOutput).toBe(true);expect(build.mainClasses).toContain(launchName)
 await expect(projectButton).toHaveAttribute('aria-disabled','false')
 await projectButton.click();await menuAction(page,'workbench.launch').click()
 const dialog=page.getByRole('dialog',{name:'Launch configuration',exact:true})
 await expect(dialog.getByLabel('Main class',{exact:true}).getByRole('option',{name:launchName,exact:true})).toHaveCount(1)
 await dialog.getByLabel('Main class',{exact:true}).selectOption(launchName);await dialog.getByRole('button',{name:'Save configuration',exact:true}).click()
 const launch=page.getByRole('button',{name:'Launch settings',exact:true});await expect(launch).toHaveAttribute('data-command-tooltip',new RegExp(launchName))
 await launch.focus();await expect(page.getByRole('tooltip')).toContainText(launchName);await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);await expect(launch).toBeFocused()
 const dimensions=await page.locator('.shell-header').evaluate(header=>{
  const box=(element:Element)=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}}
  const buttons=Array.from(header.querySelectorAll('button')).map(button=>({name:button.getAttribute('aria-label'),...box(button)})),text=header.querySelector<HTMLElement>('.shell-launch .shell-command-label')!
  return{header:box(header),cluster:box(header.querySelector('.shell-run-cluster')!),cube:box(header.querySelector('.shell-brand-cube svg')!),buttons,launch:{client:text.clientWidth,scroll:text.scrollWidth,display:getComputedStyle(text).display,overflow:getComputedStyle(text).textOverflow},stateIcon:box(header.querySelector('.shell-state svg')!)}
 })
 expect(dimensions.cluster.width).toBeLessThanOrEqual(.18*viewport.width+.01);expect(dimensions.cube.width).toBeGreaterThanOrEqual(36);expect(dimensions.cube.width).toBeLessThanOrEqual(44);expect(dimensions.stateIcon.width).toBeGreaterThan(0)
 for(const button of dimensions.buttons){expect(button.x,button.name!).toBeGreaterThanOrEqual(0);expect(button.x+button.width,button.name!).toBeLessThanOrEqual(viewport.width)}
 for(let a=0;a<dimensions.buttons.length;a++)for(let b=a+1;b<dimensions.buttons.length;b++){
  const first=dimensions.buttons[a],second=dimensions.buttons[b];expect(Math.min(first.x+first.width,second.x+second.width)-Math.max(first.x,second.x),`${first.name}/${second.name}`).toBeLessThanOrEqual(0)
 }
 if(viewport.width<1024){expect(dimensions.launch.display).toBe('none');for(const button of await page.locator('.shell-run-cluster button,.shell-modes button').all())await expect(button.locator('svg')).toBeVisible();await expect(page.locator('.shell-source-peek')).toHaveAttribute('title',new RegExp(launchName));expect(await page.locator('.shell-source-peek').evaluate(node=>getComputedStyle(node).overflow)).toBe('hidden')}
 else{expect(dimensions.launch.overflow).toBe('ellipsis');expect(dimensions.launch.scroll).toBeGreaterThan(dimensions.launch.client)}
 const stop=page.getByRole('button',{name:'Stop',exact:true});await expect(stop).toHaveAttribute('aria-disabled','true')
 const reason=await stop.getAttribute('aria-describedby');expect(reason).toBeTruthy();const text=await page.locator(`[id=${JSON.stringify(reason)}]`).textContent();expect(text?.length).toBeGreaterThan(0)
 const before=await state(page);await pointerClick(page,stop);await stop.focus();await expect(page.getByRole('tooltip')).toContainText(text!);await page.keyboard.press('Escape');await expect(stop).toBeFocused();await page.keyboard.press('Enter');expect(await state(page)).toEqual(before)
 await page.mouse.move(viewport.width/2,200);await page.locator('.world-canvas').focus();await expect(page.getByRole('tooltip')).toHaveCount(0)
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/header-controls-${viewport.width}x${viewport.height}.png`})
 await writeFile(`.ggjavaez/qa/reference-exact/header-controls-${viewport.width}x${viewport.height}.json`,JSON.stringify({viewport,dimensions,disabledReason:text},null,2)+'\n');expect(errors).toEqual([])
})
test('Header tooltip waits for hover, persists over its text, and opens immediately on keyboard focus',async({page,request})=>{
 const errors=browserErrors(page),id=await project(request,'tooltip');await open(page,id)
 await page.locator('.world-canvas').focus();await page.mouse.move(720,300)
 const timing=page.evaluate(()=>new Promise<number>(resolve=>{
  const start=(event:PointerEvent)=>{
   if(!(event.target instanceof Element)||!event.target.closest('[aria-label="Debug"]'))return
   document.removeEventListener('pointerover',start);const at=performance.now(),observer=new MutationObserver(()=>{if(document.querySelector('[role=tooltip]')){observer.disconnect();resolve(performance.now()-at)}});observer.observe(document.body,{childList:true,subtree:true})
  };document.addEventListener('pointerover',start)
 }))
 const debug=page.getByRole('button',{name:'Debug',exact:true});await debug.hover();await expect(page.getByRole('tooltip')).toBeVisible({timeout:1000});const elapsed=await timing;expect(elapsed).toBeGreaterThanOrEqual(790);expect(elapsed).toBeLessThanOrEqual(1000)
 await expect(page.getByRole('tooltip')).toContainText('Debug');const tip=(await page.getByRole('tooltip').boundingBox())!;await page.mouse.move(tip.x+tip.width/2,tip.y+tip.height/2)
 await page.evaluate(()=>new Promise<void>(resolve=>{const start=performance.now();function frame(){if(performance.now()-start>=300)resolve();else requestAnimationFrame(frame)}requestAnimationFrame(frame)}));await expect(page.getByRole('tooltip')).toBeVisible()
 await page.getByRole('button',{name:'Stop',exact:true}).hover();await expect(page.getByRole('tooltip')).toContainText('Stop',{timeout:1000});await expect(page.getByRole('tooltip')).toContainText('No active execution')
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/header-command-tooltip-1440x900.png'});await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0)
 await page.mouse.move(720,300);await debug.focus();await expect(page.getByRole('tooltip')).toBeVisible({timeout:200});await page.keyboard.press('Escape');await expect(debug).toBeFocused();await expect(page.getByRole('tooltip')).toHaveCount(0)
 await writeFile('.ggjavaez/qa/reference-exact/header-tooltip-timing.json',JSON.stringify({nativeHoverDelayMs:elapsed},null,2)+'\n');expect(errors).toEqual([])
})
test('Header curated recordings retain the Canvas and reject activation of the current recording',async({page})=>{
 const errors=browserErrors(page);await page.goto('/examples?qa=1');await expect(page.locator('.world-canvas canvas')).toBeVisible()
 await page.locator('.world-canvas canvas').evaluate(canvas=>canvas.setAttribute('data-header-retained','true'))
 for(const id of ['person','recursion','arrays','control']){
  const option={id}
  await selectRecording(page,option.id);await ready(page);await page.getByRole('button',{name:'Project menu',exact:true}).click()
  const item=menuAction(page,'recording:'+option.id);await expect(item).toHaveAttribute('aria-disabled','true');const before=await page.evaluate(()=>window.__ggjavaezWorld!.scene().recordingId)
  await pointerClick(page,item);await expect(page.getByRole('menu',{name:'Recordings',exact:true})).toBeVisible();expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().recordingId)).toBe(before)
  await page.keyboard.press('Escape');await expect(page.locator('.world-canvas canvas')).toHaveAttribute('data-header-retained','true')
 }
 expect(errors).toEqual([])
})
test('Header project switch preserves dirty decisions and commits only after explicit discard',async({page,request})=>{
 const errors=browserErrors(page),first=await project(request,'dirty'),second=await project(request,'destination');await open(page,first)
 await expect(page.locator('.monaco-editor')).toBeVisible();await page.getByRole('textbox',{name:'Editor content',exact:true}).focus();await page.keyboard.press('ControlOrMeta+Home')
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.position)).toEqual({lineNumber:1,column:1});await page.keyboard.insertText('// pending project switch\n');await expect(page.locator('.ide-dirty')).toBeVisible()
 const before=await page.evaluate(()=>window.__ggjavaezQA!.editorModels()),switchTo=async()=>{await page.getByRole('button',{name:'Project menu',exact:true}).click();await menuAction(page,'project:'+second).click()}
 await switchTo();const dialog=page.getByRole('dialog',{name:'Unsaved changes',exact:true});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Cancel',exact:true}).click()
 await expect(page.getByRole('button',{name:'Project menu',exact:true})).toHaveAttribute('data-project-id',first);expect(await page.evaluate(()=>window.__ggjavaezQA!.editorModels())).toEqual(before);await expect(page.locator('.ide-dirty')).toBeVisible()
 const saved=await request.get(`/api/projects/${first}/files?path=${launchName}.java`);expect(saved.ok()).toBe(true);expect((await saved.json()).content).toBe(source)
 await switchTo();await dialog.getByRole('button',{name:"Don't Save",exact:true}).click();await expect(page.getByRole('button',{name:'Project menu',exact:true})).toHaveAttribute('data-project-id',second)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.modelUri)).toContain('/'+second+'/');expect((await page.evaluate(()=>window.__ggjavaezQA!.editorModels())).modelUris.every(uri=>!uri.includes('/'+first+'/'))).toBe(true);expect(errors).toEqual([])
})
test('Escape dismisses a Header tooltip without also exiting the active Focus view',async({page})=>{
 const errors=browserErrors(page);await page.goto('/examples?qa=1')
 await page.getByRole('slider',{name:'Recorded execution position'}).focus();await page.keyboard.press('End');await page.getByRole('button',{name:'Home',exact:true}).click();await ready(page)
 await page.locator('.world-canvas').focus();await page.keyboard.press('Tab');await page.keyboard.press('Alt+Shift+F');await ready(page)
 const focus=page.getByRole('button',{name:'Focus',exact:true});await expect(focus).toHaveAttribute('aria-pressed','true');const target=await page.evaluate(()=>window.__ggjavaezQA!.focusTarget());expect(target).not.toBeNull()
 await focus.focus();await expect(page.getByRole('tooltip')).toContainText('Focus');const before=await state(page)
 await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);await expect(focus).toBeFocused();await expect(focus).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget())).toEqual(target);expect(await state(page)).toEqual(before);expect(errors).toEqual([])
})
