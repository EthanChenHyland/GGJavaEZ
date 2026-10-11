import {expect,test,type Page} from '@playwright/test'
import {PerspectiveCamera,Vector3} from 'three'
import {browserErrors,home,ready,runFixture,seekCursor,stopOwnedSession} from './harness'
import type {PresentedCurve} from '../../src/contracts/worldV2'
test.afterEach(async({request})=>stopOwnedSession(request))

async function command(page:Page,label:string){
 await page.locator('.world-canvas').focus();await page.keyboard.press('F1')
 await page.getByRole('combobox',{name:'Search commands'}).fill(label)
 await page.getByRole('option').filter({has:page.getByText(`Navigation: ${label}`,{exact:true})}).click()
 await expect(page.getByRole('dialog',{name:'Command Palette'})).toHaveCount(0)
}
async function selectFlow(page:Page):Promise<PresentedCurve>{
 const snapshot=await page.evaluate(()=>({pose:window.__ggjavaezQA!.cameraPose(),safe:window.__ggjavaezQA!.shellRects().safeFrame,curves:window.__ggjavaezWorld!.plan().curves.filter(curve=>curve.kind==='flow'&&curve.sourceAnchor&&curve.destinationAnchor),bodies:window.__ggjavaezWorld!.worldProjection().entities}))
 expect(snapshot.curves.length).toBeGreaterThan(0)
 const viewport=page.viewportSize()!,camera=new PerspectiveCamera(36,viewport.width/viewport.height,.05,10000)
 camera.position.set(...snapshot.pose.position);camera.lookAt(...snapshot.pose.target);camera.updateMatrixWorld()
 const safe=snapshot.safe,candidates=snapshot.curves.flatMap(curve=>curve.points.slice(1).map((point,index)=>{
  const p=new Vector3(...point).lerp(new Vector3(...curve.points[index]),.5).project(camera)
  return{x:(p.x+1)*viewport.width/2,y:(1-p.y)*viewport.height/2,z:p.z}
 })).filter(point=>point.z>-1&&point.z<1&&point.x>safe.x+4&&point.x<safe.x+safe.width-4&&point.y>safe.y+4&&point.y<safe.y+safe.height-4)
 // Prefer exposed route segments. Every selection is a real rendered-line click.
 const covered=(point:{x:number;y:number})=>snapshot.bodies.some(body=>body.bounds&&point.x>=body.bounds.x&&point.x<=body.bounds.x+body.bounds.width&&point.y>=body.bounds.y&&point.y<=body.bounds.y+body.bounds.height)
 candidates.sort((a,b)=>Number(covered(a))-Number(covered(b)))
 for(const point of candidates.slice(0,100)){
  await page.mouse.click(point.x,point.y)
  const selected=await page.evaluate(()=>{const selection=window.__ggjavaezQA!.selection();return selection?.kind==='flow'?window.__ggjavaezWorld!.plan().curves.find(curve=>curve.id===selection.id):null})
  if(selected?.sourceAnchor&&selected.destinationAnchor){await ready(page);return selected}
 }
 throw new Error('No presented flow could be selected through its actual rendered route')
}
const scenarios=[{width:1728,height:1117},{width:1440,height:900},{width:1280,height:800},{width:760,height:900},{width:1440,height:650},{width:1440,height:900,reduced:true}]
for(const scenario of scenarios)test(`Follow Path travels, frames and cancels without changing runtime ${scenario.width}x${scenario.height}${'reduced'in scenario?' reduced':''}`,async({page,request})=>{
 test.setTimeout(60000)
 await page.setViewportSize(scenario);await page.emulateMedia({reducedMotion:'no-preference'})
 const errors=browserErrors(page)
 await runFixture(page,request,'domain')
 const cursor=await page.evaluate(()=>window.__ggjavaezWorld!.recordedEvents().findIndex(event=>event.type==='SET_FIELD'&&event.value.kind==='primitive'&&event.value.value===18)+1)
 expect(cursor).toBeGreaterThan(0);await seekCursor(page,cursor);await home(page)
 await command(page,'Trace: All');await ready(page)
 const selected=await selectFlow(page)
 const facts=()=>page.evaluate(()=>({recording:window.__ggjavaezWorld!.scene().recordingId,cursor:window.__ggjavaezWorld!.scene().cursor,selection:window.__ggjavaezWorld!.selection(),anchors:Object.fromEntries(Object.entries(window.__ggjavaezWorld!.scene().entities).map(([id,node])=>[id,node.anchor]))}))
 const before=await facts(),start=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
 if('reduced'in scenario){
  await page.locator('.world-canvas').focus();await page.keyboard.press('F1')
  await page.getByRole('combobox',{name:'Search commands'}).fill('Toggle Reduced Motion')
  await page.getByRole('option').filter({has:page.getByText('View: Toggle Reduced Motion',{exact:true})}).click()
 }
 await page.evaluate(()=>window.__ggjavaezQA!.clock.step(0))
 await command(page,'Follow Path')
 const step=async(ms:number)=>page.evaluate(async(ms)=>{window.__ggjavaezQA!.clock.step(ms);await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));return window.__ggjavaezQA!.cameraPose()},ms)
 await step(0)
 if(!('reduced'in scenario)){const middle=await step(500);expect(middle).not.toEqual(start);expect(await step(499)).not.toEqual(middle);await step(1)}
 await ready(page)
 if('reduced'in scenario)expect(await page.evaluate(()=>window.__ggjavaezWorld!.plan().detailLevel)).toBe('CLOSE')
 const snapshot=await page.evaluate(id=>({pose:window.__ggjavaezQA!.cameraPose(),body:window.__ggjavaezWorld!.worldProjection().entities.find(body=>body.id===id)?.bounds,shell:window.__ggjavaezQA!.shellRects()}),selected.destinationAnchor!.entityId)
 expect(snapshot.pose).not.toEqual(start)
 expect(snapshot.body).toBeTruthy()
 const safe={...snapshot.shell.safeFrame}
 if(scenario.width<1024&&snapshot.shell.inspector)safe.height=Math.min(safe.y+safe.height,snapshot.shell.inspector.y-scenario.height*.01)-safe.y
 expect(snapshot.body!.x).toBeGreaterThanOrEqual(safe.x-.01);expect(snapshot.body!.y).toBeGreaterThanOrEqual(safe.y-.01)
 expect(snapshot.body!.x+snapshot.body!.width).toBeLessThanOrEqual(safe.x+safe.width+.01);expect(snapshot.body!.y+snapshot.body!.height).toBeLessThanOrEqual(safe.y+safe.height+.01)
 expect(await facts()).toEqual(before)
 await expect(page.getByRole('button',{name:'Trace',exact:true})).toHaveAttribute('aria-pressed','true')
 await expect(page.getByRole('button',{name:'All',exact:true})).toHaveAttribute('aria-pressed','true')
 await page.screenshot({path:`.ggjavaez/qa/reference-exact/follow-path-${scenario.width}x${scenario.height}${'reduced'in scenario?'-reduced':''}.png`})
 if(!('reduced'in scenario)){
  await command(page,'Follow Path');await step(0);const travelling=await step(200)
  await page.locator('.world-canvas').focus()
  if(scenario.width===1728||scenario.width===760){
   const button=scenario.width===760?'right':'left'
   await page.mouse.move(safe.x+safe.width/2,safe.y+safe.height/2);await page.mouse.down({button})
   await page.mouse.move(safe.x+safe.width/2+24,safe.y+safe.height/2+12,{steps:3});await page.mouse.up({button})
  }else if(scenario.width===1280){
   await page.mouse.move(safe.x+safe.width/2,safe.y+safe.height/2);await page.mouse.wheel(0,240)
  }else await page.keyboard.press('ArrowRight')
  const cancelled=await step(0)
  expect(cancelled).not.toEqual(travelling)
  expect(await step(2000)).toEqual(cancelled)
  expect(await facts()).toEqual(before)
  await expect(page.getByRole('button',{name:'Trace',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(page.getByRole('button',{name:'All',exact:true})).toHaveAttribute('aria-pressed','true')
  if(scenario.height===650){
   await command(page,'Follow Path');await step(0);await step(200)
   // The semantic seek also starts a settle overlay. Advance the deliberately
   // frozen clock before waiting for visual readiness.
   const slider=page.getByRole('slider',{name:'Recorded execution position'})
   await slider.focus();await page.keyboard.press('Home')
   await expect(slider).toHaveAttribute('aria-valuenow','0')
   const changedPrefix=await step(0)
   expect(await step(2000)).toEqual(changedPrefix)
   expect(await page.evaluate(()=>window.__ggjavaezWorld!.scene().cursor)).toBe(0)
   expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual(before.selection)
   await expect(page.getByRole('button',{name:'Trace',exact:true})).toHaveAttribute('aria-pressed','true')
   await expect(page.getByRole('button',{name:'All',exact:true})).toHaveAttribute('aria-pressed','true')
  }
 }
 await page.evaluate(()=>window.__ggjavaezQA!.clock.resume());await ready(page)
 expect(errors).toEqual([])
})
