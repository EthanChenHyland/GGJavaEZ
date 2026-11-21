import {expect,test} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
test('the real GPU gates quality, Interactive never requests Cinematic, and tier switches retain the canvas',async({page})=>{
 const errors:string[]=[],requests:string[]=[]
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
 page.on('request',request=>{if(/cinematicMaterials|cinematicPasses/.test(request.url()))requests.push(request.url())})
 await page.goto('/examples?qa=1')
 await expect.poll(()=>page.evaluate(()=>typeof window.__ggjavaezWorld?.ready==='function')).toBe(true)
 await page.evaluate(()=>window.__ggjavaezWorld!.ready())
 const slider=page.getByRole('slider',{name:'Recorded execution position'});await slider.focus();await page.keyboard.press('End')
 await page.getByRole('button',{name:'Home',exact:true}).click()
 await page.evaluate(()=>window.__ggjavaezWorld!.ready())
 const canvas=page.locator('.world-canvas canvas');await canvas.evaluate(node=>node.setAttribute('data-quality-canvas','same'))
 const initial=await page.evaluate(()=>window.__ggjavaezWorld!.quality())
 const initialResources=await page.evaluate(()=>window.__ggjavaezWorld!.resources())
 let cinematic:typeof initial|null=null
 expect(initial.setting).toBe('INTERACTIVE');expect(initial.active).toBe('INTERACTIVE');expect(initial.compiled,'Unloaded Cinematic materials must not be marked compiled').toBe(false);expect(initial.capabilities).not.toBeNull();expect(requests).toEqual([])
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/quality-interactive-native.png'})
 await page.locator('summary[aria-label="Timeline settings"]').click()
 const quality=page.getByRole('button',{name:'Rendering quality: INTERACTIVE',exact:true})
 if(!initial.availability.enabled){
  await expect(quality).toHaveAttribute('aria-disabled','true');expect(await quality.getAttribute('title')).toContain(initial.availability.reason)
  const caps=initial.capabilities!;expect(caps.webgl2&&caps.halfFloatColorBuffer&&caps.maxSamples>=4&&caps.maxTextureSize>=4096&&!caps.softwareRasterizer).toBe(false)
  await quality.click();expect(requests).toEqual([])
 }else{
  await quality.click();await page.evaluate(()=>window.__ggjavaezWorld!.ready())
  cinematic=await page.evaluate(()=>window.__ggjavaezWorld!.quality())
  expect(cinematic).toMatchObject({setting:'CINEMATIC',active:'CINEMATIC',compiled:true,cinematicStatus:'ready'})
  expect(requests.filter(url=>/cinematicMaterials/.test(url)).length).toBe(1)
  expect(requests.filter(url=>/cinematicPasses/.test(url)).length).toBe(1)
  expect(await page.evaluate(()=>window.__ggjavaezWorld!.effects())).toMatchObject({ready:true,cinematic:true,failure:''})
  const cinematicResources=await page.evaluate(()=>window.__ggjavaezWorld!.resources())
  expect(cinematicResources.composerTargets).toBeGreaterThan(initialResources.composerTargets)
  expect(cinematicResources.floor?.reflection).toMatchObject({failed:false})
  expect(cinematicResources.floor?.reflection?.captures).toBeGreaterThan(0)
  expect(cinematicResources.floor?.reflection?.meshes).toBeGreaterThan(0)
  expect(cinematicResources.floor?.reflection?.meshes).toBeLessThanOrEqual(cinematicResources.reflectorBatches)
  await page.screenshot({path:'.ggjavaez/qa/reference-exact/quality-cinematic-native.png'})
  await page.getByRole('button',{name:'Rendering quality: CINEMATIC',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.quality().active)).toBe('INTERACTIVE')
  await page.evaluate(()=>window.__ggjavaezWorld!.ready())
  const restored=await page.evaluate(()=>window.__ggjavaezWorld!.resources())
  expect(restored.composerTargets).toBe(initialResources.composerTargets)
  expect(restored.floor).toMatchObject({targets:0,reflection:null})
 }
 await expect(canvas).toHaveAttribute('data-quality-canvas','same');expect(errors).toEqual([])
 await writeFile('.ggjavaez/qa/reference-exact/quality-native.json',JSON.stringify({initial,cinematic,cinematicExecuted:cinematic!==null,requests,canvasRetained:true,errors},null,2)+'\n')
})

test('missing float colour attachments keep the Interactive world and timeline usable',async({page})=>{
 const errors:string[]=[]
 page.on('pageerror',error=>errors.push(error.message))
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
 await page.addInitScript(()=>{
  const getExtension=WebGL2RenderingContext.prototype.getExtension
  WebGL2RenderingContext.prototype.getExtension=function(this:WebGL2RenderingContext,name:string){
   return name==='EXT_color_buffer_float'?null:Reflect.apply(getExtension,this,[name])
  } as typeof getExtension
 })
 await page.goto('/examples?qa=1')
 await page.waitForFunction(()=>!!window.__ggjavaezWorld?.ready)
 const slider=page.getByRole('slider',{name:'Recorded execution position'})
 await slider.focus();await page.keyboard.press('End')
 await page.evaluate(()=>window.__ggjavaezWorld!.ready())
 const result=await page.evaluate(()=>{
  const world=window.__ggjavaezWorld!
  return {scene:world.scene().cursor,quality:world.quality(),effects:world.effects(),resources:world.resources(),environment:world.environment()}
 })
 expect(result.scene).toBeGreaterThan(0)
 expect(result.quality).toMatchObject({active:'INTERACTIVE',availability:{enabled:false},capabilities:{halfFloatColorBuffer:false}})
 expect(result.effects).toMatchObject({ready:true,failure:'',buffer:'ldr'})
 expect(result.environment).toBeNull()
 expect(result.resources.floor).toMatchObject({targets:0,reflection:null})
 expect(result.resources.composerTargets).toBeLessThan(8)
 expect(errors).toEqual([])
})
