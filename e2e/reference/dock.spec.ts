import {expect,test,type Page} from '@playwright/test'
import {browserErrors,ready,runFixture,seekCursor} from './harness'
import {openDock} from './dockActions'
import {surfaceTextContrast} from './dockContrast'
const dock=(page:Page)=>page.getByRole('navigation',{name:'Dock',exact:true})
async function worldFacts(page:Page){return page.evaluate(()=>({canvas:[document.querySelector('canvas')!.width,document.querySelector('canvas')!.height],pose:window.__ggjavaezQA!.cameraPose(),cursor:window.__ggjavaezQA!.cursor(),selection:window.__ggjavaezQA!.selection()}))}
for(const viewport of [{width:1920,height:1117},{width:1728,height:1117},{width:1440,height:650},{width:1440,height:900},{width:1280,height:800},{width:1024,height:768},{width:760,height:900}])test(`Dock geometry, toggle ownership, remembered resize and status focus ${viewport.width}x${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});const errors=browserErrors(page)
 await page.goto('/examples?qa=1');await page.waitForFunction(()=>!!window.__ggjavaezQA);await ready(page);await page.getByRole('application',{name:'Three-dimensional Java runtime world'}).focus();await page.keyboard.press('ArrowLeft');await ready(page)
 const before=await worldFacts(page),strip=dock(page),buttons=strip.locator('[data-dock-tool]')
 expect(await buttons.allTextContents()).toEqual(['Console0','Problems0','Debug0','Errors0'])
 const band=(await strip.boundingBox())!,time=(await page.locator('.world-timeline').boundingBox())!
 expect(band.height).toBeGreaterThanOrEqual(16);expect(band.height).toBeLessThanOrEqual(24);expect(band.y).toBeGreaterThanOrEqual(time.y+time.height-1);expect(band.y+band.height).toBeLessThanOrEqual(viewport.height+1)
 for(const button of await buttons.all()){const box=(await button.boundingBox())!;expect(box.height).toBe(24);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height+1)}
 const console=strip.getByRole('button',{name:'Console',exact:true});await console.click()
 const drawer=page.getByRole('region',{name:'Console drawer',exact:true});await expect(drawer).toBeVisible()
 let rect=(await drawer.boundingBox())!;expect(Math.abs(rect.height-.30*viewport.height)).toBeLessThanOrEqual(1);expect(rect.y+rect.height).toBeLessThanOrEqual(time.y+1)
 const resize=page.getByRole('separator',{name:'Resize Dock drawer',exact:true});await resize.focus();await page.keyboard.press('End');rect=(await drawer.boundingBox())!;expect(Math.abs(rect.height-.45*viewport.height)).toBeLessThanOrEqual(1)
 await console.click();await expect(drawer).toBeHidden();await console.click();expect(Math.abs((await drawer.boundingBox())!.height-.45*viewport.height)).toBeLessThanOrEqual(1)
 const handle=(await resize.boundingBox())!;await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+handle.width/2,time.y-.36*viewport.height);await page.mouse.up()
 expect(Math.abs((await drawer.boundingBox())!.height-.36*viewport.height)).toBeLessThanOrEqual(2)
 await strip.getByRole('button',{name:'Problems',exact:true}).click();await expect(page.getByRole('region',{name:'Problems drawer',exact:true})).toBeVisible();await expect(drawer).toHaveCount(0);expect(Math.abs((await page.getByRole('region',{name:'Problems drawer',exact:true}).boundingBox())!.height-.36*viewport.height)).toBeLessThanOrEqual(2)
 await strip.getByRole('button',{name:'Problems',exact:true}).click();await expect(strip.locator('[data-dock-tool][aria-expanded=true]')).toHaveCount(0)
 const status=strip.getByRole('button',{name:/^Java language service /});await status.click()
 const popover=page.getByRole('dialog',{name:'Workspace status',exact:true});await expect(popover).toBeVisible();await expect(popover).toContainText('Language service');await expect(popover).toContainText('Build system');await expect(popover).toContainText('20,000 raw events · 8 MiB · 256 object identities · 128 live frames');await expect(popover).toContainText('JDK')
 await page.keyboard.press('Escape');await expect(popover).toHaveCount(0);await expect(status).toBeFocused()
 await status.click();await expect(popover).toBeVisible();await page.getByRole('application',{name:'Three-dimensional Java runtime world'}).click({position:{x:viewport.width/2,y:120}});await expect(popover).toHaveCount(0);await expect(status).toBeFocused()
 const paint=await status.evaluate(button=>{const box=button.getBoundingClientRect(),style=getComputedStyle(button),extension=Math.max(0,parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset));return{left:box.left-extension,top:box.top-extension,right:box.right+extension,bottom:box.bottom+extension}});expect(paint.left).toBeGreaterThanOrEqual(0);expect(paint.top).toBeGreaterThanOrEqual(0);expect(paint.right).toBeLessThanOrEqual(viewport.width);expect(paint.bottom).toBeLessThanOrEqual(viewport.height)
 expect(await worldFacts(page)).toEqual(before);expect(errors).toEqual([])
 await page.keyboard.press('Escape');await page.screenshot({path:`.ggjavaez/qa/reference-exact/dock-closed-${viewport.width}x${viewport.height}.png`})
 await status.click();const contrasts=[];for(const selector of ['.shell-dock-strip','.shell-status-popover']){const runs=await surfaceTextContrast(page,selector);expect(runs.length).toBeGreaterThan(3);for(const run of runs)expect(run.minimum,`${selector}: ${run.label}`).toBeGreaterThanOrEqual(4.5);contrasts.push({selector,runs})}await test.info().attach('dock-composited-text-contrast',{body:JSON.stringify({viewport,contrasts}),contentType:'application/json'});await page.screenshot({path:`.ggjavaez/qa/reference-exact/dock-status-${viewport.width}x${viewport.height}.png`});await popover.getByRole('button',{name:'Configure JDK',exact:true}).click();const jdk=page.getByRole('dialog',{name:'Configure JDK',exact:true});await expect(jdk).toBeVisible();await expect(jdk.getByLabel('JDK home')).toBeFocused();await page.keyboard.press('F1');await expect(page.getByRole('dialog',{name:'Command Palette',exact:true})).toHaveCount(0);await expect(jdk).toBeVisible();await page.keyboard.press('Escape');await expect(jdk).toHaveCount(0)
})

test('actual JVM Console count follows listed rows and cursor commits within 100 ms',async({page,request})=>{
 test.setTimeout(60000);await page.emulateMedia({reducedMotion:'reduce'});const errors=browserErrors(page),session=await runFixture(page,request,'domain')
 await openDock(page,'Console');const badge=dock(page).locator('[data-dock-tool=console] .shell-dock-count'),console=page.getByLabel('Program console',{exact:true})
 const listed=()=>console.locator('.console-lines-heading>span').allTextContents().then(values=>values.reduce((count,value)=>count+Number(value.replace(/[^0-9]/g,'')),0))
 expect(Number(await badge.textContent())).toBe(await listed());expect(Number(await badge.textContent())).toBeGreaterThan(0)
 const runs=await surfaceTextContrast(page,'.shell-dock-drawer');await test.info().attach('dock-actual-console-text-contrast',{body:JSON.stringify({sessionId:session.id,runs}),contentType:'application/json'});for(const run of runs)expect(run.minimum,run.label).toBeGreaterThanOrEqual(4.5);await page.screenshot({path:'.ggjavaez/qa/reference-exact/dock-console-actual.png'})
 const observation=await page.evaluateHandle(()=>{
  const samples:{elapsed:number;count:number;listed:number}[]=[];let cursor:string|null=null,start=0,matched=false
  const inspect=()=>{
   const next=document.querySelector('[aria-label="Recorded execution position"]')?.getAttribute('aria-valuenow')??null
   if(cursor!==next){cursor=next;start=performance.now();matched=false}
   const count=Number(document.querySelector('[data-dock-tool=console] .shell-dock-count')?.textContent),listed=Array.from(document.querySelectorAll('[aria-label="Program console"] .console-lines-heading>span'),node=>Number(node.textContent?.replace(/[^0-9]/g,''))).reduce((a,b)=>a+b,0)
   if(!matched&&count===listed){samples.push({elapsed:performance.now()-start,count,listed});matched=true}
  };inspect();const observer=new MutationObserver(inspect);observer.observe(document.querySelector('.shell')!,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-valuenow']})
  return{samples,disconnect:()=>observer.disconnect()}
 })
 try{
  for(const cursor of [0,1,0]){await seekCursor(page,cursor);expect(Number(await badge.textContent())).toBe(await listed())}
  await page.getByRole('slider',{name:'Recorded execution position'}).focus();await page.keyboard.press('End');await ready(page);expect(Number(await badge.textContent())).toBe(await listed())
  const samples=await observation.evaluate(value=>value.samples);await test.info().attach('dock-count-dom-commit-timing',{body:JSON.stringify({sessionId:session.id,measurement:'Observed cursor DOM commit to matching listed-output row count',samples}),contentType:'application/json'});expect(samples.length).toBeGreaterThan(3);for(const sample of samples)expect(sample.elapsed).toBeLessThanOrEqual(100)
 }finally{await observation.evaluate(value=>value.disconnect());await observation.dispose()}
 const status=dock(page).getByRole('button',{name:/^Java language service /});await status.click();const popover=page.getByRole('dialog',{name:'Workspace status',exact:true})
 await expect(popover.locator('dd').nth(0)).toContainText(session.build!.jdk.version??'Version not reported');await expect(popover.locator('dd').nth(2)).toContainText('plain')
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/dock-status-actual.png'});expect(errors).toEqual([])
})

for(const state of ['starting','unavailable','failed'] as const)test(`Dock reports language ${state}, preserves its exact reason and keeps editing available`,async({page,request})=>{
 const response=await request.post('/api/projects/import',{data:{name:`Dock status ${state} ${Date.now()}`,files:[{path:'Main.java',content:'public class Main { public static void main(String[] args) {} }\n'}]}});expect(response.ok()).toBe(true);const {id}=await response.json(),reason=`Injected Language Service ${state}: exact reported reason`
 // Protocol fault injection exercises presentation only; no JVM run or real
 // language-service availability claim is made by this case.
 await page.route(/\/api\/projects\/[^/]+\/language(?:\/open)?$/,async route=>{const response=await route.fetch();expect(response.ok()).toBe(true);const snapshot=await response.json();await route.fulfill({response,json:{...snapshot,status:state,message:reason}})})
 await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),id);await page.goto('/?qa=1')
 const status=dock(page).getByRole('button',{name:`Java language service ${state}`,exact:true});await expect(status).toBeVisible();await expect(status.locator('svg')).toHaveCount(2)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA?.source()?.readOnly)).toBe(false);const editor=page.getByRole('textbox',{name:'Editor content',exact:true});await editor.focus();await page.keyboard.press('ControlOrMeta+Home');await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.position)).toEqual({lineNumber:1,column:1});await page.keyboard.insertText('// status probe\n');await expect(page.locator('.ide-tab.is-active .ide-dirty')).toBeVisible()
 await status.click();const popover=page.getByRole('dialog',{name:'Workspace status',exact:true});await expect(popover).toContainText(reason);await expect(popover.locator('dd').nth(1)).toContainText(state)
 if(state!=='starting')await expect(popover.getByRole('button',{name:'Retry Java',exact:true})).toBeVisible()
 await page.keyboard.press('Escape');await expect(popover).toHaveCount(0);await expect(status).toBeFocused();await expect(page.locator('.ide-status-line,.ide-jdk')).toHaveCount(0)
})
