import {expect,test,type Page} from '@playwright/test'
import {writeFile} from 'node:fs/promises'
import manifest from '../../fixtures/reference-exact/manifest.json' with {type:'json'}
import {browserErrors,currentSession,home,openFixture,ready,stopOwnedSession} from './harness'
const viewports=[{width:1728,height:1117},{width:1440,height:900},{width:1280,height:800},{width:760,height:900},{width:1440,height:650}]
const atmosphere=(page:Page)=>page.evaluate(()=>window.__ggjavaezWorld!.atmosphere())
test.afterEach(async({request})=>stopOwnedSession(request))
test('real world region haze stays structural, dims without a recording and survives all responsive cuts',async({page,request})=>{
 test.setTimeout(60000)
 const errors=browserErrors(page),id=await openFixture(page,request,'domain');await ready(page)
 const empty=await atmosphere(page)
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/region-haze-empty-native.png'})
 expect(await page.evaluate(()=>Object.keys(window.__ggjavaezWorld!.scene().entities))).toEqual([])
 const pending=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${id}/execution`&&response.request().method()==='POST')
 await page.getByRole('button',{name:'Run',exact:true}).click()
 const response=await pending;expect(response.ok()).toBe(true);const started=await response.json()
 await expect.poll(async()=>{const session=await currentSession(request);return session&&session.id===started.id?session.phase:null},{timeout:45000}).toBe('COMPLETED')
 const session=(await currentSession(request))!;expect(session.build?.success).toBe(true);expect(session.rawEvents.length).toBeGreaterThan(0);expect(session.stdout).toBe(manifest.domain.stdout)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld?.scene().recordingId)).toBe(`execution:${session.id}`)
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezWorld?.recordedEvents().at(-1)?.type)).toBe('PROGRAM_END')
 const slider=page.getByRole('slider',{name:'Recorded execution position'});await slider.focus();await page.keyboard.press('End');await ready(page)
 const facts=()=>page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene();return{recordingId:scene.recordingId,cursor:scene.cursor,entities:scene.entities}})
 const initial=await facts(),observations=[]
 expect(await page.evaluate(()=>{const scene=window.__ggjavaezWorld!.scene();return{frames:scene.order.frames.length,objects:scene.order.objects.length,classes:scene.order.classes.length,references:scene.references.length}})).toEqual(manifest.domain.sceneCounts)
 const check=(items:Awaited<ReturnType<typeof atmosphere>>,opacity:number)=>{
  expect(items.map(item=>item.region).sort()).toEqual(['HEAP','STACK'])
  for(const item of items){
   expect(item).toMatchObject({color:item.region==='STACK'?'#0a2463':'#24104f',visible:true,depthTest:true,depthWrite:false,castShadow:false,size:[32,28,1],maskSize:[64,64]})
   expect(item.opacity).toBeCloseTo(opacity,8);expect(item.maxLinearTint).toBeLessThan(1)
  }
 }
 check(empty,.58*.45)
 for(const viewport of viewports){
  await page.setViewportSize(viewport);await home(page)
  const actual=await atmosphere(page);check(actual,.58)
  expect(await facts()).toEqual(initial)
  const headings=await page.evaluate(()=>window.__ggjavaezWorld!.plan().headings)
  for(const item of actual)expect(item.position[2]).toBeLessThan(headings.find(heading=>heading.id===item.region)!.position[2])
  observations.push({viewport,actual})
  await page.screenshot({path:`.ggjavaez/qa/reference-exact/region-haze-home-${viewport.width}x${viewport.height}.png`})
 }
 expect(errors).toEqual([])
 await writeFile('.ggjavaez/qa/reference-exact/region-haze-native.json',JSON.stringify({realJvmExecuted:true,sessionId:session.id,rawEvents:session.rawEvents.length,empty,observations,errors},null,2)+'\n')
})
