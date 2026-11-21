import {describe,expect,it} from 'vitest'
import {loadRecursionTrace} from '../examples/traces'
import {projectTrace} from '../testing/projectTrace'
import {seek} from '../runtime'
import {historyForTrace} from '../runtime/history'
import {createVirtualClock} from '../motion/clock'
import {createTransitionPlayer} from '../motion/transitionPlayer'
import {planPresentation} from '../world/presentationPlanner'
import {faceRows,faceRowPort} from '../world/faceRows'
import {accessibleEntities} from '../interaction/accessibleEntities'
import {inspectorRows} from './inspection'
import {buildSolidBatch} from './SolidBatch'
import {frameStatusText} from '../world/frameStatus'
const trace=loadRecursionTrace(),projection=projectTrace(trace),layout=projection.layout
const cut=(cursor:number)=>{const scene=projection.project(cursor);return {scene,plan:planPresentation({scene,layout,detailLevel:'CLOSE',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})}}

describe('production deep-stack successors',()=>{
 it('preserves six ordered invocation bodies and all recorded parameters without inventing operand or return storage',()=>{
  const {scene,plan}=cut(19),state=seek(trace,19)
  expect(scene.order.frames).toHaveLength(6)
  for(const [index,id]of scene.order.frames.entries()){
   const node=scene.entities[id];if(node.kind!=='frame')throw new Error('Expected invocation')
   const model=faceRows(node,plan.entities.get(id)!),surfaces=buildSolidBatch(scene,plan).filter(solid=>solid.role==='face'&&model.visible.some(row=>row.slotId===solid.pick.id))
   expect(surfaces.filter(solid=>!solid.part)).toHaveLength(model.visible.length)
   for(const row of model.visible)expect(surfaces.filter(solid=>solid.pick.id===row.slotId&&solid.part?.startsWith('primitive-chip'))).toHaveLength(row.value.kind==='primitive'?2:0)
   for(const row of model.visible){const port=faceRowPort(node,plan.entities.get(id)!,row.slotId)!;expect(port[1]).toBeLessThan(node.anchor.position[1]+node.anchor.size[1]/2);expect(port[1]).toBeGreaterThan(node.anchor.position[1]-node.anchor.size[1]/2)}
   if(index)expect(node.rows.find(row=>row.name==='n')?.value.exact).toBe(String(6-index))
   if(index>0&&index<5)expect(Object.values(state.frames[id].locals).find(slot=>slot.name==='child')?.value.kind).toBe('uninitialized')
   if(index===5)expect(Object.values(state.frames[id].locals).some(slot=>slot.name==='child')).toBe(false)
   expect(node.rows.some(row=>row.slotId.startsWith('return:'))).toBe(false)
   expect(node.rows.some(row=>row.name==='child')).toBe(false)
   if(index){const parent=scene.entities[scene.order.frames[index-1]].anchor;expect(node.anchor.position[1]).toBeLessThan(parent.position[1]);expect(node.anchor.position[2]-node.anchor.size[2]/2).toBeGreaterThan(parent.position[2]+parent.size[2]/2)}
  }
 })
 it('keeps every invocation at its canonical anchor across actual descent, unwind, completion and reverse replay',()=>{
  const saved=JSON.stringify(layout),cursors=Array.from({length:trace.events.length+1},(_,cursor)=>cursor)
  for(const cursor of [...cursors,...cursors.reverse()]){
   const scene=projection.project(cursor),state=seek(trace,cursor)
   expect(scene.order.frames).toEqual(Object.keys(state.frames))
   for(const id of scene.order.frames)expect(scene.entities[id].anchor).toBe(layout.anchors[id])
  }
  expect(projection.project(36).order.frames).toHaveLength(6)
  expect(JSON.stringify(layout)).toBe(saved)
 })
 it('preserves the exact recorded 3 × 2 return into caller storage after exit without manufacturing graph provenance',()=>{
  const before=seek(trace,25),returned=seek(trace,26),after=seek(trace,28),transfer=returned.returns.find(item=>item.frameId==='frame:factorial:3')!
  expect(before.returns.some(item=>item.frameId===transfer.frameId)).toBe(false)
  expect(transfer).toMatchObject({value:{kind:'primitive',value:6},expression:'3 × 2',destination:{frameId:'frame:factorial:4',slotId:'slot:factorial:4:child'}})
  expect(after.returns.find(item=>item.frameId===transfer.frameId)).toEqual(transfer)
  expect(after.frames[transfer.destination!.frameId].locals[transfer.destination!.slotId].value).toMatchObject({kind:'primitive',value:6})
  for(const cursor of[26,27,28]){
   const {scene,plan}=cut(cursor)
   expect(scene.entities[transfer.frameId].anchor).toBe(layout.anchors[transfer.frameId])
   expect(scene.returnFlows).toEqual([]);expect(plan.curves.filter(curve=>curve.kind==='return')).toEqual([])
  }
  expect(projection.project(28).entities[transfer.frameId]).toMatchObject({live:false,status:{kind:'returned',value:{exact:'6'}}})
 })
 it('keeps invocation activity and typed values inspectable with camera guidance absent',()=>{
  const {scene,plan}=cut(19),catalog=accessibleEntities(scene,plan,point=>({x:point[0],y:-point[1],visible:true}))
  expect(catalog.filter(item=>item.selection.kind==='frame')).toHaveLength(6)
  const active=scene.entities['frame:factorial:1'];if(active.kind!=='frame')throw new Error('Expected frame')
  expect(active.topOfStack).toBe(true);expect(frameStatusText(active.status)).toMatch(/^line /)
  expect(inspectorRows(active).at(0)).toMatchObject({name:'n',type:'int',value:{exact:'1'}})
  expect(inspectorRows(active).count).toBe(1)
 })
 it('animates only the recorded played interval and snaps scrubbing without turning graphless return facts into Flows',()=>{
  const clock=createVirtualClock(),player=createTransitionPlayer({trace,history:historyForTrace(trace)},clock)
  player.cursorChanged({from:25,to:26,reason:'play',speed:1,reducedMotion:false})
  const played=player.sample(clock.now(),()=>true)
  expect(played.overlays).toHaveLength(1)
  expect(played.overlays[0].step).toMatchObject({eventId:trace.events[25].eventId,seq:25,kind:'return',flowId:null})
  expect(played.overlays[0].step.transition.value).toMatchObject({kind:'primitive',value:6})
  player.scrubStarted();player.cursorChanged({from:26,to:25,reason:'scrub',speed:1,reducedMotion:false})
  expect(player.sample(clock.now(),()=>true)).toEqual({overlays:[],settle:null,animating:false})
  expect(cut(26).plan.curves.filter(curve=>curve.kind==='return')).toEqual([])
  expect(seek(trace,26).frames['frame:factorial:3'].returnValue).toMatchObject({kind:'primitive',value:6})
 })
 it('retains all six completed real invocations without creating a final destination or extra frame',()=>{
  const {scene,plan}=cut(36)
  expect(scene.order.frames).toHaveLength(6);expect(scene.liveStack).toEqual([])
  expect(scene.order.frames).toEqual(Object.keys(seek(trace,36).frames))
  for(const id of scene.order.frames)expect(scene.entities[id]).toMatchObject({kind:'frame',live:false,status:{kind:'returned'}})
  expect(scene.entities['frame:recursion-main:1']).toMatchObject({status:{kind:'returned',value:null}})
  expect(scene.returnFlows).toEqual([]);expect(plan.curves.filter(curve=>curve.kind==='return')).toEqual([])
 })
})
