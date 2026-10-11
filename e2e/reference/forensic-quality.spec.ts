import {expect,test} from '@playwright/test'
import {browserErrors,ready,runFixture,stopOwnedSession} from './harness'
test.afterEach(async({request})=>stopOwnedSession(request))
test('forensic body keeps its actual instance dimensions and recording through hardware-gated quality changes',async({page,request})=>{
 const errors=browserErrors(page)
 await runFixture(page,request,'exception')
 await page.getByRole('button',{name:'Home',exact:true}).click();await ready(page)
 const observe=()=>page.evaluate(()=>({bounds:window.__ggjavaezWorld!.worldProjection().exception?.bounds,prefix:window.__ggjavaezQA!.cursor(),recordingId:window.__ggjavaezWorld!.scene().recordingId,pose:window.__ggjavaezQA!.cameraPose()}))
 const before=await observe()
 expect(before.bounds?.visible).toBe(true)
 expect(before.bounds!.width).toBeGreaterThan(100)
 const expectUnchanged=async()=>{
  const after=await observe()
  expect({...after,bounds:null}).toEqual({...before,bounds:null})
  expect(after.bounds?.visible).toBe(before.bounds!.visible)
  // Updating world matrices may change floating-point rounding by 1e-13 px.
  // Keep geometry equal to ten decimals and semantic/camera state exact.
  for(const axis of ['x','y','width','height'] as const)expect(after.bounds![axis]).toBeCloseTo(before.bounds![axis],10)
 }
 const initial=await page.evaluate(()=>window.__ggjavaezWorld!.quality())
 await page.locator('summary[aria-label="Timeline settings"]').click()
 const quality=page.getByRole('button',{name:'Rendering quality: INTERACTIVE',exact:true})
 if(initial.availability.enabled){
  await quality.click();await ready(page)
  expect(await page.evaluate(()=>window.__ggjavaezWorld!.quality())).toMatchObject({active:'CINEMATIC',compiled:true,cinematicStatus:'ready'})
  await expectUnchanged()
  await page.getByRole('button',{name:'Rendering quality: CINEMATIC',exact:true}).click();await ready(page)
  expect(await page.evaluate(()=>window.__ggjavaezWorld!.quality().active)).toBe('INTERACTIVE')
 }else{
  await expect(quality).toHaveAttribute('aria-disabled','true')
  await quality.click();expect(await page.evaluate(()=>window.__ggjavaezWorld!.quality().active)).toBe('INTERACTIVE')
 }
 await expectUnchanged()
 expect(errors).toEqual([])
})
