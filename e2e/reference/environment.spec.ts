import {expect,test} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {browserErrors,home,ready,runFixture,seekCursor,selectEntity,stopOwnedSession} from './harness'

test.afterEach(async({request})=>stopOwnedSession(request))
test('the static lighting environment survives runtime updates and rebuilds after context recovery',async({page,request})=>{
 test.setTimeout(90000)
 const errors=browserErrors(page),session=await runFixture(page,request,'domain');await home(page)
 const initial=await page.evaluate(()=>window.__ggjavaezWorld!.environment())
 expect(initial).not.toBeNull();expect(initial!.captureVersion).toBeGreaterThan(0)
 const samples:{action:string;environment:typeof initial}[]=[]
 async function sample(action:string){await ready(page);samples.push({action,environment:await page.evaluate(()=>window.__ggjavaezWorld!.environment())})}
 const maximum=Number(await page.getByRole('slider',{name:'Recorded execution position'}).getAttribute('aria-valuemax'))
 for(const fraction of [.2,.4,.6,.8,1,.7,.3,0,1]){await seekCursor(page,Math.round(maximum*fraction));await sample(`seek ${fraction}`)}
 const object=await page.evaluate(()=>window.__ggjavaezWorld!.scene().order.objects[0])
 await selectEntity(page,object);await sample('select object')
 await page.locator('.world-canvas').focus();await page.keyboard.press('Enter');await sample('focus object')
 await home(page);await sample('home')
 const quality=await page.evaluate(()=>window.__ggjavaezWorld!.quality())
 expect(quality.availability.enabled,'Native GPU must execute the Cinematic environment check').toBe(true)
 await page.locator('summary[aria-label="Timeline settings"]').click()
 await page.getByRole('button',{name:'Rendering quality: INTERACTIVE',exact:true}).click();await sample('cinematic')
 await page.getByRole('button',{name:'Rendering quality: CINEMATIC',exact:true}).click();await sample('interactive')
 await page.locator('summary[aria-label="Timeline settings"]').click()
 const canvas=page.locator('.world-canvas canvas');await canvas.evaluate(node=>node.setAttribute('data-environment-canvas','same'))
 const before=await page.evaluate(()=>({recording:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor,selection:window.__ggjavaezWorld!.selection(),pose:window.__ggjavaezQA!.cameraPose()}))
 const available=await canvas.evaluate(node=>{const extension=(node as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context');Object.defineProperty(node,'__qaEnvironmentContext',{value:extension});extension?.loseContext();return !!extension})
 expect(available).toBe(true)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.quality().contextLost)).toBe(true)
 await canvas.evaluate(node=>(Reflect.get(node,'__qaEnvironmentContext') as WEBGL_lose_context).restoreContext())
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.quality().contextLost)).toBe(false);await ready(page)
 const recovered=await page.evaluate(()=>window.__ggjavaezWorld!.environment())
 expect(recovered).not.toBeNull();expect(recovered!.id).not.toBe(initial!.id);expect(recovered!.captureVersion).toBeGreaterThan(0)
 const recoveredSamples=[]
 for(const fraction of [.5,1]){await seekCursor(page,Math.round(maximum*fraction));recoveredSamples.push(await page.evaluate(()=>window.__ggjavaezWorld!.environment()))}
 await home(page)
 const after=await page.evaluate(()=>({recording:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor,selection:window.__ggjavaezWorld!.selection(),pose:window.__ggjavaezQA!.cameraPose()}))
 await expect(canvas).toHaveAttribute('data-environment-canvas','same');expect(after).toEqual(before)
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/environment-recovered-native.png'})
 await writeFile('.ggjavaez/qa/reference-exact/environment-native.json',JSON.stringify({sessionId:session.id,initial,samples,recovered,recoveredSamples,errors},null,2)+'\n')
 expect(errors).toEqual([])
 for(const sample of samples)expect.soft(sample.environment,sample.action).toEqual(initial)
 for(const environment of recoveredSamples)expect.soft(environment,'seek after context recovery').toEqual(recovered)
})
