import {expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {loadControlTrace} from '../examples/traces'
import {projectTrace} from '../testing/projectTrace'
import {seek} from '../runtime'
import {planPresentation} from '../world/presentationPlanner'
import {Inspector} from './Inspector'
import {canFocusWorldSelection} from '../interaction/focusTarget'
import {inspectorEntity,inspectorRetiredLocal} from './inspection'
import {buildSolidBatch} from './SolidBatch'
import {faceRowPort} from '../world/faceRows'
import type {RuntimeState} from '../contracts/runtime'
const trace=loadControlTrace(),projection=projectTrace(trace)
const declarations=trace.events.filter(event=>event.type==='DECLARE_LOCAL'&&event.slot.name==='corrected')
function view(cursor:number,id:string,runtime=seek(trace,cursor)){
 const selection={kind:'slot' as const,id},scene=projection.project(cursor)
 const plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection,focusTargetId:null,trace:{active:false,scope:'relevant'}})
 const html=renderToStaticMarkup(<Inspector selection={selection} scene={scene} runtime={runtime} plan={plan} onClose={()=>{}} onFocus={()=>{}} onReturn={()=>{}} onSelectRow={()=>{}} onSelectEntity={()=>{}}/>)
 return{runtime,scene,plan,html,selection}
}
it('keeps all three captured branch locals inspectable after method exit without restoring their world rows or ports',()=>{
 expect(declarations).toHaveLength(3)
 for(const declaration of declarations){
  if(declaration.type!=='DECLARE_LOCAL')throw new Error('Expected declaration')
  const returned=trace.events.find(event=>event.type==='RETURN_VALUE'&&event.frameId===declaration.frameId&&event.seq>declaration.seq)!
  if(returned.type!=='RETURN_VALUE'||returned.value.kind!=='primitive')throw new Error('Expected captured primitive return')
  const exit=trace.events.find(event=>event.type==='EXIT_METHOD'&&event.frameId===declaration.frameId&&event.seq>returned.seq)!
  const {scene,plan,runtime,selection,html}=view(exit.seq+1,declaration.slot.id)
  const retired=inspectorRetiredLocal(runtime,selection)!
  expect(retired.row).toMatchObject({name:'corrected',type:'int',value:{exact:String(returned.value.value),observation:'OBSERVED'}})
  expect(retired.lifetime.exitedAt).toBe(exit.eventId)
  expect(inspectorEntity(scene,selection)).toBeNull();expect(canFocusWorldSelection(scene,plan,selection)).toBe(false)
  expect(faceRowPort(scene.entities[declaration.frameId],plan.entities.get(declaration.frameId)!,selection.id)).toBeNull()
  expect(buildSolidBatch(scene,plan).some(body=>body.pick.id===selection.id)).toBe(false)
  expect(html).toContain('Scope closed · last captured local value')
  expect(html).toContain('Inspect corrected');expect(html).not.toContain('Select corrected storage')
  expect(html).toContain(`>${returned.value.value}</button>`)
  expect(html).toMatch(/aria-label="Focus selection"[^>]*aria-disabled="true"/)
 }
})
it('returns to the current face and original physical row when replay crosses the scope ending backward',()=>{
 const declaration=declarations[0];if(declaration.type!=='DECLARE_LOCAL')throw new Error('Expected declaration')
 const exit=trace.events.find(event=>event.type==='EXIT_METHOD'&&event.frameId===declaration.frameId&&event.seq>declaration.seq)!
 const first=view(exit.seq,declaration.slot.id),anchor=first.scene.entities[declaration.frameId].anchor,port=faceRowPort(first.scene.entities[declaration.frameId],first.plan.entities.get(declaration.frameId)!,declaration.slot.id)
 expect(port).not.toBeNull()
 for(const cursor of[exit.seq+1,exit.seq,exit.seq+1,exit.seq]){
  const {runtime,scene,selection,plan,html}=view(cursor,declaration.slot.id)
  expect(scene.entities[declaration.frameId].anchor).toBe(anchor)
  if(cursor===exit.seq){expect(inspectorRetiredLocal(runtime,selection)).toBeNull();expect(inspectorEntity(scene,selection)?.id).toBe(declaration.frameId);expect(faceRowPort(scene.entities[declaration.frameId],plan.entities.get(declaration.frameId)!,declaration.slot.id)).toEqual(port);expect(html).toMatch(/aria-label="Focus selection"[^>]*aria-disabled="false"/)}
  else expect(html).toContain('Scope closed')
 }
})
it('never exposes a future lifetime before its declaration, including after a later closed selection',()=>{
 for(const declaration of [...declarations].reverse()){
  if(declaration.type!=='DECLARE_LOCAL')throw new Error('Expected declaration')
  view(trace.events.length,declaration.slot.id)
  const {runtime,selection,html}=view(declaration.seq,declaration.slot.id)
  expect(inspectorRetiredLocal(runtime,selection)).toBeNull()
  expect(html).toContain('Not present at this point in time')
  expect(html).not.toContain('Inspect corrected')
 }
})
it('uses the last applied lifetime of reused loop storage and never restores an earlier value over a live redeclaration',()=>{
 const declared=trace.events.filter(event=>event.type==='DECLARE_LOCAL'&&event.slot.name==='score')
 expect(declared).toHaveLength(3)
 for(const [index,event] of declared.entries()){
  if(event.type!=='DECLARE_LOCAL')throw new Error('Expected declaration')
  const exit=trace.events.find(item=>item.type==='EXIT_SCOPE'&&item.frameId===event.frameId&&item.scopeId===event.slot.scopeId&&item.seq>event.seq)!
  const active=seek(trace,event.seq+1),selection={kind:'slot' as const,id:event.slot.id}
  expect(inspectorRetiredLocal(active,selection)).toBeNull()
  const closed=inspectorRetiredLocal(seek(trace,exit.seq+1),selection)!
  expect(closed.lifetime.declaredAt).toBe(event.eventId)
  expect(closed.row.value.exact).toBe(String([0,42,100][index]))
 }
})
it('preserves explicitly unavailable captured values without inventing Java defaults or changing runtime history',()=>{
 const state=seek(trace,trace.events.length),life=state.variableLifetimes.find(life=>life.slot.name==='corrected')!
 const runtime:RuntimeState={...state,variableLifetimes:state.variableLifetimes.map(item=>item===life?{...item,slot:{...item.slot,value:{kind:'unavailable',reason:'local capture failed'}}}:item)}
 const before=JSON.stringify(runtime),{html,selection}=view(runtime.cursor,life.slot.id,runtime)
 expect(inspectorRetiredLocal(runtime,selection)?.row.value).toMatchObject({kind:'not-recorded',observation:'UNAVAILABLE',reason:'local capture failed'})
 expect(html).toContain('⟨not recorded⟩');expect(html).not.toContain('>0</button>')
 expect(JSON.stringify(runtime)).toBe(before)
})
it('does not reinterpret an absent entity or reference selection as a retired storage lifetime',()=>{
 const state=seek(trace,trace.events.length),id=state.variableLifetimes[0].slot.id
 for(const kind of ['object','frame','reference','flow','cluster','bundle'] as const)expect(inspectorRetiredLocal(state,{kind,id})).toBeNull()
 expect(inspectorRetiredLocal(state,{kind:'slot',id:'not recorded'})).toBeNull()
 expect(inspectorRetiredLocal(state,null)).toBeNull()
})
