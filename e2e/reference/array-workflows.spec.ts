import {selectRecording} from './menuActions'
import {expect,test,type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {PerspectiveCamera,Vector3} from 'three'
import {arrayElementSlotId,type TraceDocument,type TraceEvent} from '../../src/contracts/runtime'
import {browserErrors,follow,home,ready,seekCursor,selectEntity} from './harness'
const trace:TraceDocument=JSON.parse(readFileSync('src/examples/demos/arrays/trace.json','utf8'))
const allocation=trace.events.find((event):event is Extract<TraceEvent,{type:'ALLOCATE_ARRAY'}>=>event.type==='ALLOCATE_ARRAY')!
const objectId=allocation.objectId,slot=(index:number)=>arrayElementSlotId(objectId,index)
const writes=trace.events.filter((event):event is Extract<TraceEvent,{type:'ARRAY_WRITE'}>=>event.type==='ARRAY_WRITE')
const comparison=trace.events.find((event):event is Extract<TraceEvent,{type:'ARRAY_COMPARE'}>=>event.type==='ARRAY_COMPARE')!
const initial=trace.events.find(event=>event.type==='CREATE_REFERENCE')!.seq+1
const inspector=(page:Page)=>page.getByRole('complementary',{name:'Selection inspector'})
const operations=(page:Page)=>inspector(page).getByRole('region',{name:'Recorded array operations'})
const rail=(page:Page)=>page.getByRole('slider',{name:'Recorded execution position'})
const play=(page:Page)=>page.getByRole('button',{name:'Play recorded execution',exact:true})
const pause=(page:Page)=>page.getByRole('button',{name:'Pause playback',exact:true})
async function open(page:Page){
 await page.goto('/examples?qa=1');await selectRecording(page,'arrays')
 await expect(rail(page)).toHaveAttribute('aria-valuenow','0');await ready(page)
}
async function values(page:Page,expected:readonly string[]){
 for(const [index,value] of expected.entries())await expect(inspector(page).getByRole('button',{name:`Inspect [${index}]`,exact:true})).toHaveText(value)
}
async function source(page:Page,event:TraceEvent){
 if(!event.source)throw new Error('Expected recorded source')
 await expect.poll(()=>page.evaluate(()=>window.__ggjavaezQA!.source()?.target?.line)).toBe(event.source.line)
 await expect(page.locator('.monaco-editor .executing-line')).toHaveCount(1)
 const text=trace.sourceFiles.find(file=>file.fileId===event.source!.fileId)!.content.split(/\r?\n/)[event.source.line-1].trim()
 await expect(page.locator('.monaco-editor .view-line').filter({hasText:text}).first()).toBeVisible()
}
async function geometry(page:Page){return page.evaluate(id=>{
 const world=window.__ggjavaezWorld!,node=world.scene().entities[id],cellWindow=world.plan().cellWindows.get(id)
 if(node.kind!=='array'||!cellWindow)throw new Error('Expected current array and physical window')
 return{anchor:node.anchor,cells:[...cellWindow.mapping].map(([id,cell])=>({id,index:cell.index,position:cell.anchor.position,size:cell.anchor.size,port:cell.port}))}
},objectId)}
async function cameraState(page:Page){return page.evaluate(async()=>{const path='/src/camera/cameraStore.ts',shared=await import(path),state=shared.useCameraStore.getState();return{mode:state.mode,follow:state.follow}})}
async function pickCell(page:Page,index:number){
 if(await inspector(page).isVisible())await inspector(page).getByRole('button',{name:'Close inspector',exact:true}).click()
 await ready(page)
 const target=await page.evaluate(({id,index})=>{
  const world=window.__ggjavaezWorld!,cell=world.plan().cellWindows.get(id)?.mapping.get(`${id}:element:${index}`)
  if(!cell)throw new Error('Recorded array index has no current physical cell')
  return{cell,pose:window.__ggjavaezQA!.cameraPose()}
 },{id:objectId,index})
 const viewport=page.viewportSize()!,camera=new PerspectiveCamera(36,viewport.width/viewport.height,.05,10000)
 camera.position.set(...target.pose.position);camera.lookAt(...target.pose.target);camera.updateMatrixWorld()
 const point=new Vector3(...target.cell.anchor.position);point.z+=target.cell.anchor.size[2]/2+.02;point.project(camera)
 expect(Math.abs(point.x)).toBeLessThan(1);expect(Math.abs(point.y)).toBeLessThan(1)
 await page.mouse.click((point.x+1)*viewport.width/2,(1-point.y)*viewport.height/2);await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'slot',id:slot(index)})
 expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(target.pose)
 await expect(inspector(page)).toContainText(`index ${index} · length 5`)
}

// The retired three representations become actions in one persistent World.
test('array values, selection, source and comparison survive world navigation',async({page})=>{
 const errors=browserErrors(page);await open(page);await seekCursor(page,comparison.seq+1);await home(page);await selectEntity(page,objectId)
 for(const mode of ['Explore','Home','Explore','Home','Explore','Home']){
  await page.getByRole('button',{name:mode,exact:true}).click();await ready(page)
  await expect(rail(page)).toHaveAttribute('aria-valuenow',String(comparison.seq+1))
  expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'object',id:objectId})
  await values(page,['8','3','6','1','5'])
  await expect(operations(page)).toContainText('Left [0]: 8');await expect(operations(page)).toContainText('Right [1]: 3')
  await expect(operations(page)).toContainText('Operator > · Result true');await source(page,comparison)
 }
 await selectEntity(page,slot(1));await expect(inspector(page).getByRole('button',{name:'Inspect [1]',exact:true})).toHaveText('3')
 await expect(inspector(page)).toContainText('index 1 · length 5')
 expect(await page.evaluate(id=>window.__ggjavaezWorld!.plan().cellWindows.get(id)!.budgetOverflow.reasons.get(`${id}:element:1`),objectId)).toContain('selected')
 const j=trace.events.find((event):event is Extract<TraceEvent,{type:'DECLARE_LOCAL'}>=>event.type==='DECLARE_LOCAL'&&event.slot.name==='j')!
 await home(page);await selectEntity(page,j.frameId);await inspector(page).getByRole('button',{name:'Select j storage',exact:true}).click();await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'slot',id:j.slot.id})
 await expect(inspector(page).getByRole('button',{name:'Inspect j',exact:true})).toHaveText('0');expect(errors).toEqual([])
})
test('two indexed writes are truthful and reverse scrubs restore values in fixed cells',async({page})=>{
 const errors=browserErrors(page);await page.emulateMedia({reducedMotion:'reduce'});await open(page);await seekCursor(page,initial);await home(page);await selectEntity(page,objectId)
 const original=await geometry(page)
 for(const [cursor,expected] of [[writes[0].seq+1,['3','3','6','1','5']],[writes[1].seq+1,['3','8','6','1','5']],[writes[0].seq+1,['3','3','6','1','5']],[initial,['8','3','6','1','5']],[trace.events.length,['1','3','5','6','8']]] as const){
  await seekCursor(page,cursor);await values(page,expected);expect(await geometry(page)).toEqual(original)
 }
 await seekCursor(page,writes[1].seq+1);await page.getByRole('button',{name:'Previous Event',exact:true}).click();await ready(page);await values(page,['3','3','6','1','5'])
 await page.getByRole('button',{name:'Next Event',exact:true}).click();await ready(page);await values(page,['3','8','6','1','5'])
 expect(await geometry(page)).toEqual(original)
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/array-indexed-writes-native.png'});expect(errors).toEqual([])
})
test('unrelated Trace plans retain array windows while Focus updates index evidence',async({page})=>{
 const errors=browserErrors(page);await open(page);await seekCursor(page,comparison.seq+1);await home(page);await selectEntity(page,slot(1))
 const before=await page.evaluateHandle(id=>({plan:window.__ggjavaezWorld!.plan(),window:window.__ggjavaezWorld!.plan().cellWindows.get(id)!}),objectId)
 await page.getByRole('button',{name:'Trace',exact:true}).click();await ready(page)
 expect(await page.evaluate(({id,before})=>{
  const plan=window.__ggjavaezWorld!.plan();return {newPlan:plan!==before.plan,sameWindow:plan.cellWindows.get(id)===before.window}
 },{id:objectId,before})).toEqual({newPlan:true,sameWindow:true})
 await values(page,['8','3','6','1','5'])
 await page.getByRole('button',{name:'Focus',exact:true}).click();await ready(page)
 expect(await page.evaluate(({id,before})=>{
  const next=window.__ggjavaezWorld!.plan().cellWindows.get(id)!
  return {sameWindow:next===before.window,sameRevision:next.windowRevision===before.window.windowRevision,
   reasons:next.budgetOverflow.reasons.get(`${id}:element:1`)?.filter(reason=>reason==='selected'||reason==='focused'),
   previous:before.window.budgetOverflow.reasons.get(`${id}:element:1`)?.filter(reason=>reason==='selected'||reason==='focused')}
 },{id:objectId,before})).toEqual({sameWindow:false,sameRevision:true,reasons:['selected','focused'],previous:['selected']})
 await home(page);await seekCursor(page,writes[0].seq+1);await values(page,['3','3','6','1','5'])
 await seekCursor(page,comparison.seq+1);await values(page,['8','3','6','1','5'])
 await before.dispose();expect(errors).toEqual([])
})
test('sorting finishes naturally and Replay restarts once without looping',async({page})=>{
 const errors=browserErrors(page);await open(page);await seekCursor(page,trace.events.length-4);await home(page);await selectEntity(page,objectId)
 await page.getByLabel('Playback speed',{exact:true}).filter({visible:true}).selectOption('4');await play(page).click()
 await expect(play(page)).toHaveAttribute('aria-disabled','true');await expect(rail(page)).toHaveAttribute('aria-valuenow',String(trace.events.length))
 await expect(operations(page)).toContainText('14 captured indexed writes');await values(page,['1','3','5','6','8'])
 await page.waitForTimeout(500);await expect(rail(page)).toHaveAttribute('aria-valuenow',String(trace.events.length))
 await page.locator('summary[aria-label="Timeline settings"]').click();await page.getByRole('button',{name:'Replay from before execution',exact:true}).click()
 await expect(rail(page)).toHaveAttribute('aria-valuenow','0');await pause(page).click();expect(errors).toEqual([])
})
test('the World supports orbit, pan, dolly and cell Focus while playback keeps advancing',async({page})=>{
 const errors=browserErrors(page);await open(page);await seekCursor(page,comparison.seq+1);await follow(page);await play(page).click()
 const rect=await page.evaluate(()=>window.__ggjavaezQA!.shellRects().safeFrame),x=rect.x+rect.width*.55,y=rect.y+rect.height*.5
 const before=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+60,y+30,{steps:10});await page.mouse.up();await ready(page)
 expect((await cameraState(page)).follow).toBe(false);await expect(pause(page)).toBeVisible()
 expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).not.toEqual(before)
 await expect.poll(async()=>Number(await rail(page).getAttribute('aria-valuenow'))).toBeGreaterThan(comparison.seq+1)
 const orbit=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
 await page.mouse.down({button:'right'});await page.mouse.move(x+90,y+50,{steps:6});await page.mouse.up({button:'right'});await ready(page)
 const pan=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose());expect(pan).not.toEqual(orbit)
 await page.mouse.wheel(0,-200);await ready(page);expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).not.toEqual(pan)
 await seekCursor(page,comparison.seq+1);await home(page);await selectEntity(page,slot(0))
 await page.getByRole('button',{name:'Focus',exact:true}).click();await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget()?.targetId)).toBe(slot(0))
 await expect(inspector(page).getByRole('button',{name:'Inspect [0]',exact:true})).toHaveText('8')
 await home(page);await expect(rail(page)).toHaveAttribute('aria-valuenow',String(comparison.seq+1))
 await page.getByRole('button',{name:'Explore',exact:true}).click();await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection()?.id)).toBe(slot(0));expect(errors).toEqual([])
})
test('3D cell picking and guidance changes preserve committed values and indexed selection',async({page})=>{
 const errors=browserErrors(page)
 // Isolate the clipboard boundary; this verifies the real Copy action's exact
 // argument without reading or changing the user's system clipboard.
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{(window as unknown as {arrayCopiedText?:string}).arrayCopiedText=text}},configurable:true}))
 await open(page);await seekCursor(page,comparison.seq+1);await home(page);await pickCell(page,1)
 await expect(inspector(page).getByRole('button',{name:'Inspect [1]',exact:true})).toHaveText('3')
 await inspector(page).getByRole('button',{name:'Copy Value',exact:true}).click()
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {arrayCopiedText?:string}).arrayCopiedText)).toBe('3')
 await follow(page);await expect(rail(page)).toHaveAttribute('aria-valuenow',String(comparison.seq+1))
 await page.locator('.world-canvas').focus();await page.keyboard.press('+');await ready(page)
 expect((await cameraState(page)).follow).toBe(false);await expect(operations(page)).toContainText('Result true')
 await expect(inspector(page).getByRole('button',{name:'Inspect [1]',exact:true})).toHaveText('3')
 await follow(page);await page.getByRole('button',{name:'Trace',exact:true}).click();await ready(page)
 await expect(page.getByRole('button',{name:'Trace',exact:true})).toHaveAttribute('aria-pressed','true')
 const reference=await page.evaluate(id=>{const world=window.__ggjavaezWorld!,ref=world.scene().references.find(ref=>ref.targetId===id);return ref?{ref,drawn:world.plan().curves.some(curve=>curve.id===ref.id)}:null},objectId)
 expect(reference?.drawn).toBe(true)
 const holder=trace.events.find(event=>event.type==='DECLARE_LOCAL'&&event.slot.name==='nums')
 if(holder?.type!=='DECLARE_LOCAL')throw new Error('Expected actual array holder')
 expect(reference?.ref.sourceSlotId).toBe(holder.slot.id)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'slot',id:slot(1)})
 await page.screenshot({path:'.ggjavaez/qa/reference-exact/array-selected-cell-native.png'});expect(errors).toEqual([])
})
