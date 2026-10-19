import {expect,test,type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
import type {TraceDocument,TraceEvent} from '../../src/contracts/runtime'
import {browserErrors,follow,home,ready,seekCursor,selectEntity} from './harness'
const trace:TraceDocument=JSON.parse(readFileSync('src/examples/demos/control/trace.json','utf8'))
const inputs=trace.events.filter((event):event is Extract<TraceEvent,{type:'INPUT_READ'}>=>event.type==='INPUT_READ')
const outputs=trace.events.filter((event):event is Extract<TraceEvent,{type:'OUTPUT_WRITE'}>=>event.type==='OUTPUT_WRITE')
const corrected=trace.events.find((event):event is Extract<TraceEvent,{type:'DECLARE_LOCAL'}>=>event.type==='DECLARE_LOCAL'&&event.slot.name==='corrected')!
const returned=trace.events.find((event):event is Extract<TraceEvent,{type:'RETURN_VALUE'}>=>event.type==='RETURN_VALUE'&&event.frameId===corrected.frameId)!
const scanner=trace.events.find((event):event is Extract<TraceEvent,{type:'ALLOCATE_OBJECT'}>=>event.type==='ALLOCATE_OBJECT'&&event.className==='Scanner')!
const reference=trace.events.find((event):event is Extract<TraceEvent,{type:'CREATE_REFERENCE'}>=>event.type==='CREATE_REFERENCE'&&event.targetObjectId===scanner.objectId)!
const rail=(page:Page)=>page.getByRole('slider',{name:'Recorded execution position'})
const inspector=(page:Page)=>page.getByRole('complementary',{name:'Selection inspector'})
const consolePane=(page:Page)=>page.getByLabel('Program console',{exact:true})
const play=(page:Page)=>page.getByRole('button',{name:'Play recorded execution',exact:true})
const pause=(page:Page)=>page.getByRole('button',{name:'Pause playback',exact:true})
async function open(page:Page){
 await page.goto('/examples?qa=1');await page.getByRole('combobox',{name:'Runtime example'}).selectOption('control')
 await expect(rail(page)).toHaveAttribute('aria-valuenow','0');await ready(page)
}
async function showConsole(page:Page){if(!await consolePane(page).isVisible())await page.getByRole('button',{name:'CONSOLE',exact:true}).click();await expect(consolePane(page)).toBeVisible()}
async function source(page:Page,event:TraceEvent){
 if(!event.source)throw new Error('Expected captured source')
 const text=trace.sourceFiles.find(file=>file.fileId===event.source!.fileId)!.content.split(/\r?\n/)[event.source.line-1].trim()
 if(page.viewportSize()!.width<1024&&!await page.locator('.monaco-editor').isVisible())await page.getByRole('button',{name:'Show source drawer',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.target?.line)).toBe(event.source.line)
 await expect(page.locator('.monaco-editor .view-line').filter({hasText:text}).first()).toBeVisible()
 await expect(page.locator('.executing-line')).toHaveCount(1)
}
async function capturedConsole(page:Page,cursor:number,exact=false){
 await showConsole(page)
 const applied=trace.events.slice(0,cursor).filter((event):event is typeof inputs[number]|typeof outputs[number]=>event.type==='INPUT_READ'||event.type==='OUTPUT_WRITE')
 const list=consolePane(page).getByRole('list',{name:'Recorded console rows'})
 await expect(list.getByRole('listitem')).toHaveCount(applied.length)
 await expect(list.locator('.console-line-preview')).toHaveText(applied.map(event=>event.text.replace(/\r?\n$/,'')))
 await expect.poll(()=>list.locator('.console-line-glyph').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')))).toEqual(applied.map(event=>event.type==='INPUT_READ'?'stdin':'stdout'))
 if(exact)for(const [index,event] of applied.entries()){
  await consolePane(page).getByRole('button',{name:`Open Recorded console row ${index+1}`,exact:true}).click()
  expect(await consolePane(page).getByRole('region',{name:`Exact Recorded console row ${index+1}`,exact:true}).locator('pre').textContent()).toBe(event.text)
  await consolePane(page).getByRole('button',{name:'Close exact text',exact:true}).click()
 }
}
async function pickCorrected(page:Page){
 await home(page);await selectEntity(page,corrected.frameId)
 await inspector(page).getByRole('button',{name:'Select corrected storage',exact:true}).focus();await page.keyboard.press('Enter');await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'slot',id:corrected.slot.id})
 await expect(inspector(page).getByRole('button',{name:'Inspect corrected',exact:true})).toHaveText('0')
}
test('console contains only consumed inputs and committed outputs, including reverse steps',async({page})=>{
 const errors=browserErrors(page);await open(page)
 expect(inputs.map(event=>event.value.kind==='primitive'?event.value.value:null)).toEqual([-7,42,130])
 expect(outputs.map(event=>event.value.kind==='primitive'?event.value.value:null)).toEqual([0,42,100,142])
 await capturedConsole(page,0)
 const io=[...inputs,...outputs].sort((a,b)=>a.seq-b.seq)
 for(const event of io){
  await seekCursor(page,event.seq);await capturedConsole(page,event.seq)
  await page.getByRole('button',{name:'Next Event',exact:true}).click();await ready(page)
  await expect(rail(page)).toHaveAttribute('aria-valuenow',String(event.seq+1));await capturedConsole(page,event.seq+1,true)
  await page.getByRole('button',{name:'Previous Event',exact:true}).click();await ready(page)
  await expect(rail(page)).toHaveAttribute('aria-valuenow',String(event.seq));await capturedConsole(page,event.seq)
 }
 await seekCursor(page,trace.events.length);await capturedConsole(page,trace.events.length,true)
 for(const event of io.slice().reverse()){await seekCursor(page,event.seq);await capturedConsole(page,event.seq)}
 await seekCursor(page,0);await capturedConsole(page,0);expect(errors).toEqual([])
})
test('Explore and Home share selection, value, source, console and cursor; switching preserves playback',async({page})=>{
 const errors=browserErrors(page);await open(page);await seekCursor(page,returned.seq+1);await pickCorrected(page);await showConsole(page)
 for(const mode of ['Explore','Home','Explore','Home']){
  await page.getByRole('button',{name:mode,exact:true}).click();await ready(page)
  await expect(rail(page)).toHaveAttribute('aria-valuenow',String(returned.seq+1))
  expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'slot',id:corrected.slot.id})
  await expect(inspector(page).getByRole('button',{name:'Inspect corrected',exact:true})).toHaveText('0')
  await source(page,returned);await capturedConsole(page,returned.seq+1)
  await expect(page.locator('.gg-time-event')).toHaveText(`Executing: ${returned.label}`)
 }
 await home(page);await selectEntity(page,scanner.objectId)
 await page.getByLabel('Playback speed',{exact:true}).filter({visible:true}).selectOption('0.5');await play(page).click()
 for(const mode of ['Explore','Home']){
  const before=Number(await rail(page).getAttribute('aria-valuenow'))
  await page.getByRole('button',{name:mode,exact:true}).click();await ready(page)
  await expect(pause(page)).toBeVisible();expect(Number(await rail(page).getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(before)
  expect(await page.evaluate(()=>window.__ggjavaezQA!.selection()?.id)).toBe(scanner.objectId)
 }
 await expect.poll(async()=>Number(await rail(page).getAttribute('aria-valuenow'))).toBeGreaterThan(returned.seq+1)
 await pause(page).click();await capturedConsole(page,Number(await rail(page).getAttribute('aria-valuenow')));expect(errors).toEqual([])
})
test('completion retains 0, 42, 100, 142 and explicit Replay finishes once without looping',async({page})=>{
 test.setTimeout(Math.max(30000,trace.events.length*170+20000))
 const errors=browserErrors(page);await open(page);await seekCursor(page,outputs.at(-1)!.seq+1)
 await page.getByLabel('Playback speed',{exact:true}).filter({visible:true}).selectOption('4');await play(page).click()
 await expect(play(page)).toHaveAttribute('aria-disabled','true',{timeout:10000})
 await expect(rail(page)).toHaveAttribute('aria-valuenow',String(trace.events.length));await capturedConsole(page,trace.events.length,true)
 await expect(page.getByRole('button',{name:'Next Event',exact:true})).toHaveAttribute('aria-disabled','true')
 await page.waitForTimeout(800);await expect(rail(page)).toHaveAttribute('aria-valuenow',String(trace.events.length))
 await page.getByLabel('Playback speed',{exact:true}).filter({visible:true}).selectOption('0.5')
 await page.locator('summary[aria-label="Timeline settings"]').click()
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/control-replay-console-menu-native.png'})
 await page.getByRole('button',{name:'Replay from before execution',exact:true}).click()
 await expect(rail(page)).toHaveAttribute('aria-valuenow','0');await capturedConsole(page,0);await expect(pause(page)).toBeVisible()
 await page.getByLabel('Playback speed',{exact:true}).filter({visible:true}).selectOption('4')
 await expect(play(page)).toHaveAttribute('aria-disabled','true',{timeout:trace.events.length*170+10000})
 await expect(rail(page)).toHaveAttribute('aria-valuenow',String(trace.events.length));await capturedConsole(page,trace.events.length,true)
 await home(page);await selectEntity(page,outputs.at(-1)!.frameId!)
 await expect(inspector(page).getByText('Recorded scopes · 0 active / 3 captured',{exact:true})).toBeVisible()
 const frames=await page.evaluate(()=>Object.values(window.__ggjavaezWorld!.scene().entities).flatMap(node=>node.kind==='frame'?[{id:node.id,live:node.live,rows:node.rows.length}]:[]))
 expect(frames).toHaveLength(trace.events.filter(event=>event.type==='ENTER_METHOD').length)
 expect(frames.every(frame=>!frame.live&&frame.rows===0)).toBe(true)
 await page.waitForTimeout(800);await expect(rail(page)).toHaveAttribute('aria-valuenow',String(trace.events.length));expect(errors).toEqual([])
})
async function cameraState(page:Page){return page.evaluate(async()=>{const path='/src/camera/cameraStore.ts',shared=await import(path),state=shared.useCameraStore.getState();return{mode:state.mode,follow:state.follow}})}
async function pickReference(page:Page,id:string){
 if(await inspector(page).isVisible())await inspector(page).getByRole('button',{name:'Close inspector',exact:true}).click()
 await ready(page)
 const points=await page.evaluate(async id=>{
  const path='/src/camera/projection.ts',shared=await import(path),pose=window.__ggjavaezQA!.cameraPose(),rect=document.querySelector('.world-canvas canvas')!.getBoundingClientRect()
  const delta=pose.position.map((value,index)=>value-pose.target[index]),distance=Math.hypot(...delta)
  const camera=shared.projectionCamera({target:pose.target,distance,yawDeg:Math.atan2(delta[0],delta[2])*180/Math.PI,pitchDeg:-Math.asin(delta[1]/distance)*180/Math.PI},rect)
  const curve=window.__ggjavaezWorld!.plan().curves.find(curve=>curve.id===id),safe=window.__ggjavaezQA!.shellRects().safeFrame
  if(!curve)throw new Error('Captured Scanner reference has no presented curve')
  return curve.points.slice(1).flatMap((to,index)=>{
   const from=curve.points[index],point=from.map((value,axis)=>(value+to[axis])/2),p=shared.screenPoint(point,camera,rect),x=rect.x+p.x,y=rect.y+p.y
   return p.z>-1&&p.z<1&&x>safe.x&&x<safe.x+safe.width&&y>safe.y&&y<safe.y+safe.height?[{x,y}]:[]
  })
 },id)
 expect(points.length).toBeGreaterThan(0)
 for(const point of points){
  await page.mouse.click(point.x,point.y);await ready(page)
  if(await page.evaluate(id=>{const selection=window.__ggjavaezQA!.selection();return selection?.kind==='reference'&&selection.id===id},id))return
  if(await inspector(page).isVisible())await inspector(page).getByRole('button',{name:'Close inspector',exact:true}).click()
 }
 throw new Error('Actual depth-tested Scanner curve was not pickable')
}
test('exploration cancels Follow while advancing; Focus, Home and Trace use the real Scanner relationship',async({page})=>{
 const errors=browserErrors(page);await page.emulateMedia({reducedMotion:'reduce'});await open(page);await seekCursor(page,reference.seq+1)
 const declaration=trace.events.find((event):event is Extract<TraceEvent,{type:'DECLARE_LOCAL'}>=>event.type==='DECLARE_LOCAL'&&event.slot.id===reference.sourceSlot.slotId)!
 await home(page);await selectEntity(page,declaration.frameId)
 await inspector(page).getByRole('button',{name:`Select ${declaration.slot.name} storage`,exact:true}).click();await ready(page)
 await follow(page);expect((await cameraState(page)).follow).toBe(true)
 await play(page).click();await page.locator('.world-canvas').focus();await page.keyboard.press('+');await ready(page)
 expect((await cameraState(page)).follow).toBe(false);await expect(pause(page)).toBeVisible()
 await expect.poll(async()=>Number(await rail(page).getAttribute('aria-valuenow'))).toBeGreaterThan(reference.seq+1)
 expect((await cameraState(page)).follow).toBe(false);await pause(page).click();await seekCursor(page,reference.seq+1)
 const actual=await page.evaluate(id=>window.__ggjavaezWorld!.scene().references.find(ref=>ref.sourceSlotId===id&&ref.targetId!==null),reference.sourceSlot.slotId)
 expect(actual?.targetId).toBe(scanner.objectId)
 for(const mode of ['Explore','Home']){
  await page.getByRole('button',{name:mode,exact:true}).click();await ready(page)
  await home(page);await selectEntity(page,scanner.objectId);await page.getByRole('button',{name:'Focus',exact:true}).click();await ready(page)
  expect((await cameraState(page)).mode).toBe('FOCUS')
  expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget()?.targetId)).toBe(scanner.objectId)
  await expect(inspector(page).locator('.inspector-heading strong')).toHaveText(`Scanner #${scanner.displayId}`)
  await home(page);expect((await cameraState(page)).mode).toBe('EXPLORE')
  await selectEntity(page,declaration.frameId);await inspector(page).getByRole('button',{name:`Select ${declaration.slot.name} storage`,exact:true}).click()
  await page.getByRole('button',{name:'Trace',exact:true}).click();await ready(page)
  await expect(page.getByRole('button',{name:'Trace',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(page.getByRole('group',{name:'Trace scope'})).toBeVisible()
  await pickReference(page,actual!.id)
  await expect(inspector(page)).toContainText(`Recorded reference · ${reference.sourceSlot.slotId} → ${scanner.objectId}`)
  await expect(inspector(page).getByRole('button',{name:`Inspect ${declaration.slot.name}`,exact:true})).toHaveText(`Scanner #${scanner.displayId}`)
  await expect(rail(page)).toHaveAttribute('aria-valuenow',String(reference.seq+1))
  if(mode==='Home')await page.screenshot({path:'.ggjavaez/qa/reference-exact/control-scanner-trace-native.png'})
 }
 expect(errors).toEqual([])
})
test('narrow console expansion is keyboard accessible and inspector dismissal preserves execution',async({page})=>{
 const errors=browserErrors(page);await page.setViewportSize({width:760,height:900});await open(page);await seekCursor(page,returned.seq+1)
 await source(page,returned)
 const consoleTab=page.getByRole('button',{name:'CONSOLE',exact:true})
 await consoleTab.focus();await page.keyboard.press('Enter');await expect(consolePane(page)).toBeVisible();await capturedConsole(page,returned.seq+1,true)
 const rows=consolePane(page).getByRole('list',{name:'Recorded console rows'});await rows.focus();await expect(rows).toBeFocused()
 await pickCorrected(page)
 const close=inspector(page).getByRole('button',{name:'Close inspector',exact:true});await close.focus();await page.keyboard.press('Enter')
 await expect(inspector(page)).toHaveCount(0);await expect(rail(page)).toHaveAttribute('aria-valuenow',String(returned.seq+1))
 await source(page,returned);await capturedConsole(page,returned.seq+1)
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/control-narrow-console-native.png'})
 await page.getByRole('button',{name:'Collapse bottom panel',exact:true}).focus();await page.keyboard.press('Enter');await expect(consolePane(page)).toBeHidden()
 await page.getByRole('button',{name:'Expand bottom panel',exact:true}).focus();await page.keyboard.press('Enter');await expect(consolePane(page)).toBeVisible()
 await seekCursor(page,inputs[0].seq);await capturedConsole(page,inputs[0].seq);expect(errors).toEqual([])
})
