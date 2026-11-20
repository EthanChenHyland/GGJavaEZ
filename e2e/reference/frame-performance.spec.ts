import {expect,test} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import {browserErrors,home,ready} from './harness'

test('opt-in native frame observations include the whole render and preserve runtime truth',async({page})=>{
 const errors=browserErrors(page)
 await page.goto('/examples?qa=1');await expect.poll(()=>page.evaluate(()=>typeof window.__ggjavaezQA?.ready==='function')).toBe(true);await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezWorld!.framePerformance())).toBeNull()
 await page.goto('/examples?qa=1&perf=1');await expect.poll(()=>page.evaluate(()=>typeof window.__ggjavaezQA?.ready==='function')).toBe(true);await ready(page)
 const slider=page.getByRole('slider',{name:'Recorded execution position'});await slider.focus();await page.keyboard.press('End');await home(page)
 const facts=()=>page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene();return{cursor:scene.cursor,recording:scene.recordingId,anchors:Object.fromEntries(Object.entries(scene.entities).map(([id,node])=>[id,node.anchor]))}})
 const before=await facts(),pose=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
 const safe=await page.evaluate(()=>window.__ggjavaezQA!.shellRects().safeFrame)
 const beforeOrbit=await page.evaluate(()=>window.__ggjavaezWorld!.framePerformance()!.submittedFrames)
 const x=safe.x+safe.width*.6,y=safe.y+safe.height*.65
 await page.mouse.move(x,y);await page.mouse.down()
 for(let step=0;step<60;step++){
  await page.mouse.move(x+Math.sin(step/10)*70,y+Math.cos(step/10)*15)
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())))
 }
 await page.mouse.up();await ready(page)
 expect(await facts()).toEqual(before);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).not.toEqual(pose)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.framePerformance()?.submittedFrames??0)).toBeGreaterThan(30)
 const interactive=await page.evaluate(()=>{const world=window.__ggjavaezWorld!;return{probe:world.framePerformance()!,renderer:world.renderer(),quality:world.quality()}})
 expect(interactive.probe.droppedSamples).toBe(0);expect(interactive.probe.lifecycleIssues).toEqual({})
 expect(interactive.probe.samples.at(-1)!.calls).toBe(interactive.renderer.calls)
 expect(interactive.probe.samples.some(sample=>sample.continuous)).toBe(true)
 expect(interactive.probe.samples.filter(sample=>sample.id>beforeOrbit&&sample.continuous).length).toBeGreaterThan(20)
 for(const[sampleIndex,sample]of interactive.probe.samples.entries()){
  expect(sample.id).toBe(sampleIndex+1);expect(sample.cpuSubmissionMs).toBeGreaterThanOrEqual(0);expect(sample.calls).toBeGreaterThan(0)
  expect(sample.tier).toBe('INTERACTIVE');expect(sample.displayFrameId).toBeGreaterThanOrEqual(sample.id)
 }
 if(interactive.probe.gpuSupport==='available')await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld!.framePerformance()!.gpuMeasuredSamples)).toBeGreaterThan(0)
 let cinematic=null
 if(interactive.quality.availability.enabled){
  await page.locator('summary[aria-label="Timeline settings"]').click();await page.getByRole('button',{name:'Rendering quality: INTERACTIVE',exact:true}).click();await ready(page)
  cinematic=await page.evaluate(()=>window.__ggjavaezWorld!.framePerformance()!)
  expect(cinematic.samples.some(sample=>sample.tier==='CINEMATIC')).toBe(true);expect(cinematic.lifecycleIssues).toEqual({});expect(await facts()).toEqual(before)
  await page.getByRole('button',{name:'Rendering quality: CINEMATIC',exact:true}).click();await ready(page)
 }
 const final=await page.evaluate(()=>window.__ggjavaezWorld!.framePerformance()!)
 expect(final.maxPendingGpuQueries).toBe(8);expect(final.pendingGpuQueries).toBeLessThanOrEqual(8);expect(errors).toEqual([])
 await writeFile('.ggjavaez/qa/reference-exact/frame-performance-native.json',JSON.stringify({method:'Native Person recording orbit and actual quality controls; lifecycle smoke, not Dense_Sample or sustained performance approval',before,interactive,cinematic,final,errors},null,2)+'\n')
})
