import {expect,test,type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {PerspectiveCamera,Vector3} from 'three'
import type {TraceDocument,TraceEvent} from '../../src/contracts/runtime'
import {browserErrors,home,ready,seekCursor,selectEntity} from './harness'
const trace:TraceDocument=JSON.parse(readFileSync('src/examples/demos/control/trace.json','utf8'))
const declarations=trace.events.filter((event):event is Extract<TraceEvent,{type:'DECLARE_LOCAL'}>=>event.type==='DECLARE_LOCAL')
const inspector=(page:Page)=>page.getByRole('complementary',{name:'Selection inspector'})
const rail=(page:Page)=>page.getByRole('slider',{name:'Recorded execution position'})
// Focus Selection stays an explicit command while both contextual buttons
// become Exit Focus. Inspect that command without changing the existing Focus.
async function expectFocusSelection(page:Page,enabled:boolean){
 const before=await page.evaluate(()=>({cursor:window.__ggjavaezQA!.cursor(),pose:window.__ggjavaezQA!.cameraPose(),selection:window.__ggjavaezQA!.selection(),focus:window.__ggjavaezQA!.focusTarget()}))
 await page.locator('.world-canvas').focus();await page.keyboard.press('F1')
 await page.getByRole('combobox',{name:'Search commands'}).fill('Focus Selection')
 const option=page.getByRole('option').filter({has:page.getByText('Navigation: Focus Selection',{exact:true})})
 await expect(option).toHaveAttribute('aria-disabled',String(!enabled))
 if(!enabled){await page.keyboard.press('Enter');await expect(page.getByRole('dialog',{name:'Command Palette'})).toBeVisible()}
 await page.keyboard.press('Escape')
 expect(await page.evaluate(()=>({cursor:window.__ggjavaezQA!.cursor(),pose:window.__ggjavaezQA!.cameraPose(),selection:window.__ggjavaezQA!.selection(),focus:window.__ggjavaezQA!.focusTarget()}))).toEqual(before)
}
const leaveFocus=(page:Page)=>inspector(page).getByRole('button',{name:'Return to World',exact:true})
async function open(page:Page){
 await page.goto('/examples?qa=1');await page.getByRole('combobox',{name:'Runtime example'}).selectOption('control')
 await expect(rail(page)).toHaveAttribute('aria-valuenow','0');await ready(page)
}
async function face(page:Page,frameId:string,slotId:string){
 return page.evaluate(async({frameId,slotId})=>{
  const path='/src/world/faceRows.ts',chipPath='/src/world/facePlate.ts',shared=await import(path),chips=await import(chipPath),world=window.__ggjavaezWorld!,node=world.scene().entities[frameId],presented=world.plan().entities.get(frameId)
  if(node?.kind!=='frame'||!presented)throw new Error('Expected represented invocation')
  return{anchor:node.anchor,rows:node.rows,status:node.status,live:node.live,scopes:shared.faceRows(node,presented).scopes,chip:chips.facePlate(node,presented,slotId),port:shared.faceRowPort(node,presented,slotId)}
 },{frameId,slotId})
}
async function pickLocal(page:Page,frameId:string,slotId:string){
 await home(page);await selectEntity(page,frameId);await page.getByRole('button',{name:'Focus',exact:true}).click();await ready(page)
 const rowName=await page.evaluate(({frameId,slotId})=>{const node=window.__ggjavaezWorld!.scene().entities[frameId];return node.kind==='frame'?node.rows.find(row=>row.slotId===slotId)?.name:null},{frameId,slotId})
 expect(rowName).toBeTruthy()
 const before=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
 await inspector(page).getByRole('button',{name:`Select ${rowName} storage`,exact:true}).focus();await page.keyboard.press('Enter');await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(before)
 const target=await page.evaluate(async({frameId,slotId})=>{
  const path='/src/world/facePlate.ts',shared=await import(path),world=window.__ggjavaezWorld!
  return{plate:shared.facePlate(world.scene().entities[frameId],world.plan().entities.get(frameId),slotId),pose:window.__ggjavaezQA!.cameraPose()}
 },{frameId,slotId})
 expect(target.plate,'The selected local has an actual current chip').not.toBeNull()
 const viewport=page.viewportSize()!,camera=new PerspectiveCamera(36,viewport.width/viewport.height,.05,10000)
 camera.position.set(...target.pose.position);camera.lookAt(...target.pose.target);camera.updateMatrixWorld()
 const point=new Vector3(...target.plate!.position);point.z+=target.plate!.size[2]/2+.01;point.project(camera)
 expect(Math.abs(point.x)).toBeLessThan(1);expect(Math.abs(point.y)).toBeLessThan(1)
 await page.mouse.click((point.x+1)*viewport.width/2,(1-point.y)*viewport.height/2);await ready(page)
 expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'slot',id:slotId})
 await expect(leaveFocus(page)).toHaveAttribute('aria-disabled','false')
}
function exits(event:Extract<TraceEvent,{type:'DECLARE_LOCAL'}>){
 const returned=trace.events.find(item=>item.type==='RETURN_VALUE'&&item.frameId===event.frameId&&item.seq>event.seq)
 const exited=trace.events.find(item=>item.type==='EXIT_METHOD'&&item.frameId===event.frameId&&item.seq>(returned?.seq??event.seq))
 if(returned?.type!=='RETURN_VALUE'||exited?.type!=='EXIT_METHOD'||returned.value.kind!=='primitive')throw new Error('Missing captured branch return and exit')
 return{returned,exited,value:String(returned.value.value)}
}
function scopeChain(event:Extract<TraceEvent,{type:'DECLARE_LOCAL'}>){
 const chain:Extract<TraceEvent,{type:'ENTER_SCOPE'}>[]=[];let id=event.slot.scopeId
 while(id){const entered=trace.events.filter((item):item is Extract<TraceEvent,{type:'ENTER_SCOPE'}>=>item.type==='ENTER_SCOPE'&&item.frameId===event.frameId&&item.scopeId===id&&item.seq<event.seq).at(-1);if(!entered)throw new Error('Missing captured lexical parent');chain.unshift(entered);id=entered.parentId??undefined}
 return chain
}
// Successor of e2e/control.spec.ts's second case. Captured replay, not fresh JVM.
test('nested corrected survives return evaluation, leaves on method exit, and rewinds to its reserved row',async({page})=>{
 test.setTimeout(30000);await page.emulateMedia({reducedMotion:'reduce'});const errors=browserErrors(page);await open(page)
 const corrected=declarations.filter(event=>event.slot.name==='corrected');expect(corrected).toHaveLength(3)
 for(const declaration of corrected){
  const {returned,exited,value}=exits(declaration),chain=scopeChain(declaration);expect(chain.length).toBeGreaterThan(1)
  await seekCursor(page,declaration.seq+1);await pickLocal(page,declaration.frameId,declaration.slot.id)
  const initial=await face(page,declaration.frameId,declaration.slot.id)
  expect(initial.rows.find(row=>row.slotId===declaration.slot.id)?.scopeDepth).toBe(chain.length-1)
  expect(initial.scopes.dividers.map((divider:{label:string})=>divider.label)).toContain(chain.at(-1)!.labelScope)
  expect(initial.port).not.toBeNull();expect(initial.chip).not.toBeNull()
  await seekCursor(page,returned.seq+1)
  await expect(inspector(page).getByRole('button',{name:'Inspect corrected',exact:true})).toHaveText(value)
  await expectFocusSelection(page,true)
  expect((await face(page,declaration.frameId,declaration.slot.id)).port).toEqual(initial.port)
  await page.getByRole('button',{name:'Next Event',exact:true}).click();await ready(page)
  await expect(rail(page)).toHaveAttribute('aria-valuenow',String(exited.seq+1))
  const closed=await face(page,declaration.frameId,declaration.slot.id)
  expect(closed.rows.some(row=>row.slotId===declaration.slot.id)).toBe(false);expect(closed.port).toBeNull();expect(closed.chip).toBeNull();expect(closed.scopes.dividers.map((divider:{label:string})=>divider.label)).not.toContain(chain.at(-1)!.labelScope);expect(closed.live).toBe(false);expect(closed.status.kind).toBe('returning')
  expect(closed.anchor).toEqual(initial.anchor)
  await expect(inspector(page)).toContainText('Scope closed · last captured local value')
  await expect(inspector(page).locator('.inspector-heading strong')).toHaveText('corrected')
  await expect(inspector(page).getByRole('button',{name:'Inspect corrected',exact:true})).toHaveText(value)
  await expectFocusSelection(page,false)
  if(declaration===corrected[0]){
   await expect(leaveFocus(page)).toHaveAttribute('aria-disabled','false')
   await page.screenshot({path:'.ggjavaez/qa/reference-exact/retired-corrected-native.png'})
   await leaveFocus(page).click();await ready(page)
   expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget())).toBeNull()
   expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'slot',id:declaration.slot.id})
   const cardFocus=inspector(page).getByRole('button',{name:'Focus selection',exact:true})
   await expect(cardFocus).toHaveAttribute('aria-disabled','true')
   const returnedPose=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
   await cardFocus.focus();await page.keyboard.press('Enter');await ready(page)
   expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(returnedPose)
   expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget())).toBeNull()
   await home(page)
   const headerFocus=page.getByRole('button',{name:'Focus',exact:true})
   await expect(headerFocus).toHaveAttribute('aria-disabled','true')
   const pose=await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())
   await headerFocus.focus();await page.keyboard.press('Enter')
   await page.locator('.world-canvas').focus();await page.keyboard.press('Alt+Shift+F');await page.keyboard.press('Enter');await ready(page)
   expect(await page.evaluate(()=>window.__ggjavaezQA!.cameraPose())).toEqual(pose)
   expect(await page.evaluate(()=>window.__ggjavaezQA!.focusTarget())).toBeNull()
   expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'slot',id:declaration.slot.id})
  }
  await seekCursor(page,exited.seq+2);expect((await face(page,declaration.frameId,declaration.slot.id)).status.kind).toBe('returned')
  await seekCursor(page,exited.seq+1)
  await page.getByRole('button',{name:'Previous Event',exact:true}).click();await ready(page)
  await expect(rail(page)).toHaveAttribute('aria-valuenow',String(returned.seq+1))
  await expectFocusSelection(page,true)
  if(declaration===corrected[0])await expect(page.getByRole('button',{name:'Focus',exact:true})).toHaveAttribute('aria-disabled','false')
  expect((await face(page,declaration.frameId,declaration.slot.id)).port).toEqual(initial.port)
  expect((await face(page,declaration.frameId,declaration.slot.id)).chip).toEqual(initial.chip)
 }
 expect(errors).toEqual([])
})
// Successor of the original third case: same three activations and for ending.
test('each loop body removes raw and score; iterator leaves only when its for scope closes',async({page})=>{
 test.setTimeout(30000);const errors=browserErrors(page);await open(page)
 const raw=declarations.filter(event=>event.slot.name==='raw'),iterator=declarations.find(event=>event.slot.name==='i')!
 expect(raw).toHaveLength(3)
 for(const [index,declaration] of raw.entries()){
  const exit=trace.events.find(event=>event.type==='EXIT_SCOPE'&&event.frameId===declaration.frameId&&event.scopeId===declaration.slot.scopeId&&event.seq>declaration.seq)!
  const score=declarations.find(event=>event.slot.name==='score'&&event.frameId===declaration.frameId&&event.slot.scopeId===declaration.slot.scopeId&&event.seq>declaration.seq&&event.seq<exit.seq)!
  await seekCursor(page,exit.seq);await pickLocal(page,score.frameId,score.slot.id)
  const original=await face(page,score.frameId,score.slot.id),rawPort=(await face(page,declaration.frameId,declaration.slot.id)).port
  expect(original.port).not.toBeNull()
  // Fixed signature capacity (design 7.3/C1) may overflow unselected live rows;
  // every captured local remains in the Inspector and selected storage draws.
  for(const id of [declaration.slot.id,score.slot.id,iterator.slot.id])expect(original.rows.some(row=>row.slotId===id)).toBe(true)
  await expect(inspector(page).getByRole('button',{name:'Inspect raw',exact:true})).toHaveText(String([-7,42,130][index]))
  await expect(inspector(page).getByRole('button',{name:'Inspect score',exact:true})).toHaveText(String([0,42,100][index]))
  await expect(inspector(page).getByRole('button',{name:'Inspect i',exact:true})).toHaveText(String(index))
  await page.getByRole('button',{name:'Next Event',exact:true}).click();await ready(page)
  await expect(rail(page)).toHaveAttribute('aria-valuenow',String(exit.seq+1))
  const closed=await face(page,score.frameId,score.slot.id)
  for(const id of [declaration.slot.id,score.slot.id]){expect(closed.rows.some(row=>row.slotId===id)).toBe(false);expect((await face(page,score.frameId,id)).port).toBeNull();expect((await face(page,score.frameId,id)).chip).toBeNull()}
  expect(closed.rows.some(row=>row.slotId===iterator.slot.id)).toBe(true)
  await expect(inspector(page)).toContainText('Scope closed')
  await expect(inspector(page).getByRole('button',{name:'Inspect score',exact:true})).toHaveText(String([0,42,100][index]))
  await expectFocusSelection(page,false);await expect(leaveFocus(page)).toHaveAttribute('aria-disabled','false')
  expect(await page.evaluate(()=>window.__ggjavaezQA!.selection())).toEqual({kind:'slot',id:score.slot.id})
  if(index===0)await page.screenshot({path:'.ggjavaez/qa/reference-exact/retired-score-native.png'})
  await page.getByRole('button',{name:'Previous Event',exact:true}).click();await ready(page)
  expect((await face(page,score.frameId,score.slot.id)).port).toEqual(original.port)
  expect((await face(page,score.frameId,score.slot.id)).chip).toEqual(original.chip)
  expect((await face(page,declaration.frameId,declaration.slot.id)).port).toEqual(rawPort)
 }
 const iteratorExit=trace.events.find(event=>event.type==='EXIT_SCOPE'&&event.frameId===iterator.frameId&&event.scopeId===iterator.slot.scopeId&&event.seq>iterator.seq)!
 await seekCursor(page,iteratorExit.seq);await pickLocal(page,iterator.frameId,iterator.slot.id)
 const original=(await face(page,iterator.frameId,iterator.slot.id)).port
 await page.getByRole('button',{name:'Next Event',exact:true}).click();await ready(page)
 expect((await face(page,iterator.frameId,iterator.slot.id)).port).toBeNull()
 await expect(inspector(page)).toContainText('Scope closed');await expectFocusSelection(page,false)
 await seekCursor(page,iteratorExit.seq);expect((await face(page,iterator.frameId,iterator.slot.id)).port).toEqual(original)
 expect(errors).toEqual([])
})
