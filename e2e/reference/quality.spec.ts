import {expect,test} from '@playwright/test'
test('the real GPU gates quality, Interactive never requests Cinematic, and tier switches retain the canvas',async({page})=>{
 const errors:string[]=[],requests:string[]=[]
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
 page.on('request',request=>{if(/cinematicMaterials|cinematicPasses/.test(request.url()))requests.push(request.url())})
 await page.goto('/examples?qa=1')
 const slider=page.getByRole('slider',{name:'Recorded execution position'});await slider.focus();await page.keyboard.press('End')
 await page.getByRole('button',{name:'Home',exact:true}).click()
 await page.evaluate(()=>window.__ggjavaezWorld!.ready())
 const canvas=page.locator('.world-canvas canvas');await canvas.evaluate(node=>node.setAttribute('data-quality-canvas','same'))
 const initial=await page.evaluate(()=>window.__ggjavaezWorld!.quality())
 expect(initial.setting).toBe('INTERACTIVE');expect(initial.active).toBe('INTERACTIVE');expect(initial.capabilities).not.toBeNull();expect(requests).toEqual([])
 await page.locator('summary[aria-label="Timeline settings"]').click()
 const quality=page.getByRole('button',{name:'Rendering quality: INTERACTIVE',exact:true})
 if(!initial.availability.enabled){
  await expect(quality).toHaveAttribute('aria-disabled','true');expect(await quality.getAttribute('title')).toContain(initial.availability.reason)
  const caps=initial.capabilities!;expect(caps.webgl2&&caps.halfFloatColorBuffer&&caps.maxSamples>=4&&caps.maxTextureSize>=4096&&!caps.softwareRasterizer).toBe(false)
  await quality.click();expect(requests).toEqual([])
 }else{
  await quality.click();await page.evaluate(()=>window.__ggjavaezWorld!.ready())
  const cinematic=await page.evaluate(()=>window.__ggjavaezWorld!.quality())
  expect(cinematic).toMatchObject({setting:'CINEMATIC',active:'CINEMATIC',compiled:true,cinematicStatus:'ready'})
  expect(requests.filter(url=>/cinematicMaterials/.test(url)).length).toBe(1)
  expect(requests.filter(url=>/cinematicPasses/.test(url)).length).toBe(1)
  expect(await page.evaluate(()=>window.__ggjavaezWorld!.effects())).toMatchObject({ready:true,cinematic:true,failure:''})
  await page.getByRole('button',{name:'Rendering quality: CINEMATIC',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.quality().active)).toBe('INTERACTIVE')
 }
 await expect(canvas).toHaveAttribute('data-quality-canvas','same');expect(errors).toEqual([])
})
