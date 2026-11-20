import {openDock} from './dockActions'
import {expect,test} from '@playwright/test'
import {browserErrors} from './harness'
const observeFallback=(page:Parameters<typeof browserErrors>[0])=>{
 const errors=browserErrors(page),warnings:string[]=[],fonts:string[]=[]
 page.on('console',message=>{if(message.type()==='warning')warnings.push(message.text())})
 page.on('request',request=>{if(request.url().includes('/fonts/runtime/VisualJavaInter-'))fonts.push(request.url())})
 return {errors,warnings,fonts}
}
test('the settled world uses demand rendering and redraws after a timeline seek',async({page})=>{
 await page.goto('/examples?qa=1')
 await page.waitForFunction(()=>!!window.__ggjavaezWorld?.ready)
 await page.getByRole('slider',{name:'Recorded execution position'}).focus();await page.keyboard.press('End')
 await page.getByRole('button',{name:'Home',exact:true}).click();await page.evaluate(()=>window.__ggjavaezWorld!.ready())
 const idle=await page.evaluate(async()=>{
  // Allow the last capture invalidation to drain, then measure an actual idle interval.
  await new Promise(resolve=>setTimeout(resolve,100));const frame=window.__ggjavaezWorld!.renderer().frame
  await new Promise(resolve=>setTimeout(resolve,300));return window.__ggjavaezWorld!.renderer().frame-frame
 })
 expect(idle).toBe(0)
 const frame=await page.evaluate(()=>window.__ggjavaezWorld!.renderer().frame)
 await page.getByRole('slider',{name:'Recorded execution position'}).focus();await page.keyboard.press('Home')
 await page.evaluate(()=>window.__ggjavaezWorld!.ready())
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().cursor)).toBe(0)
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.renderer().frame)).toBeGreaterThan(frame)
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.effects().failure)).toBe('')
})
test('an actual lost graphics context restores the same canvas, recording, selection and camera',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message))
 await page.goto('/examples?qa=1')
 await page.waitForFunction(()=>!!window.__ggjavaezWorld?.ready)
 await page.getByRole('slider',{name:'Recorded execution position'}).focus();await page.keyboard.press('End')
 await page.getByRole('button',{name:'Home',exact:true}).click();await page.evaluate(()=>window.__ggjavaezWorld!.ready())
 const world=page.locator('.world-canvas');await world.focus();await page.keyboard.press('Tab')
 await expect(page.getByRole('listbox',{name:'Runtime entities'})).toBeFocused()
 await page.evaluate(()=>window.__ggjavaezWorld!.ready())
 const canvas=page.locator('.world-canvas canvas');await canvas.evaluate(node=>node.setAttribute('data-context-canvas','same'))
 const before=await page.evaluate(()=>({recording:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor,selection:window.__ggjavaezWorld!.selection(),pose:window.__ggjavaezQA!.cameraPose()}))
 expect(before.selection).not.toBeNull()
 const available=await canvas.evaluate(node=>{const gl=(node as HTMLCanvasElement).getContext('webgl2');const extension=gl?.getExtension('WEBGL_lose_context');Object.defineProperty(node,'__qaContext',{value:extension,configurable:true});extension?.loseContext();return !!extension})
 expect(available).toBe(true)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.quality().contextLost)).toBe(true)
 await canvas.evaluate(node=>(Reflect.get(node,'__qaContext') as WEBGL_lose_context).restoreContext())
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.quality().contextLost)).toBe(false)
 await page.evaluate(()=>window.__ggjavaezWorld!.ready())
 const after=await page.evaluate(()=>({recording:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor,selection:window.__ggjavaezWorld!.selection(),pose:window.__ggjavaezQA!.cameraPose()}))
 expect(after).toEqual(before);await expect(canvas).toHaveAttribute('data-context-canvas','same')
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.effects())).toMatchObject({ready:true,failure:''})
 expect(errors).toEqual([])
})
test('without WebGL the recording source and timeline remain usable',async({page})=>{
 const observed=observeFallback(page)
 await page.addInitScript(()=>{
  const getContext=HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type==='webgl'||type==='webgl2')return null;return Reflect.apply(getContext,this,[type,...args])} as typeof getContext
 })
 await page.goto('/examples?qa=1')
 await expect(page.getByRole('status').filter({hasText:'The 3D World requires WebGL'})).toBeVisible()
 const slider=page.getByRole('slider',{name:'Recorded execution position'});await slider.focus();await page.keyboard.press('End')
 await expect(slider).toHaveAttribute('aria-valuenow',await slider.getAttribute('aria-valuemax')??'')
 await expect(page.locator('.ide-editor-panel')).toBeVisible();await expect(page.locator('.world-canvas canvas')).toHaveCount(0)
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/graphics-fallback-recording.png'})
 expect(observed).toEqual({errors:[],warnings:[],fonts:[]})
})
test('without WebGL the IDE still runs actual Java and retains its process output',async({page,request})=>{
 const observed=observeFallback(page)
 const imported=await request.post('/api/projects/import',{data:{name:`Graphics fallback ${Date.now()}`,files:[{path:'Main.java',content:'public class Main { public static void main(String[] args) { System.out.println("FALLBACK_OK"); } }\n'}]}})
 expect(imported.ok()).toBe(true);const {id}=await imported.json()
 await page.addInitScript(id=>localStorage.setItem('ggjavaez:project',id),id)
 await page.addInitScript(()=>{
  const getContext=HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type==='webgl'||type==='webgl2')return null;return Reflect.apply(getContext,this,[type,...args])} as typeof getContext
 })
 await page.goto('/?qa=1');await expect(page.locator('.monaco-editor')).toBeVisible()
 await expect(page.getByRole('status').filter({hasText:'The 3D World requires WebGL'})).toBeVisible()
 await page.getByRole('button',{name:'Run',exact:true}).click()
 await expect(page.locator('.shell-state')).toContainText('Completed',{timeout:45000})
 await openDock(page,'Console')
 await expect(page.getByLabel('Program console')).toContainText('FALLBACK_OK')
 await expect.poll(async()=>Number(await page.getByRole('slider',{name:'Recorded execution position'}).getAttribute('aria-valuemax'))).toBeGreaterThan(0)
 await expect(page.locator('.world-canvas canvas')).toHaveCount(0)
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/graphics-fallback-jvm.png'})
 expect(observed).toEqual({errors:[],warnings:[],fonts:[]})
})
