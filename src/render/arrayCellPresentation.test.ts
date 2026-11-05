import {expect,it} from 'vitest'
import {arrayElementSlotId,type TraceDocument,type TraceEvent} from '../contracts/runtime'
import type {Selection} from '../contracts/interaction'
import {projectTrace} from '../testing/projectTrace'
import {planPresentation} from '../world/presentationPlanner'
import {buildSolidBatch} from './SolidBatch'
import {color} from '../theme/tokens'
const int=(value:number)=>({kind:'primitive' as const,javaType:'int' as const,value})
const id='opaque-array',frameId='frame',slot=(index:number)=>arrayElementSlotId(id,index)
const payloads=[{type:'PROGRAM_START'},{type:'ENTER_METHOD',frameId,callerFrameId:null,className:'Example',methodName:'main',locals:[]},{type:'ALLOCATE_ARRAY',objectId:id,displayId:23,elementType:'int',elements:[8,1,1].map(int)},{type:'LINE_EXECUTE',frameId},{type:'ARRAY_READ',frameId,objectId:id,index:1,value:int(1)},{type:'EXIT_METHOD',frameId},{type:'PROGRAM_END'}]
const trace:TraceDocument={schemaVersion:2,demoId:'array-target-unit',sourceFiles:[{fileId:'Unit.java',name:'Unit.java',content:'class Example {}'}],events:payloads.map((payload,seq)=>({...payload,eventId:`unit/${seq}`,seq,source:{fileId:'Unit.java',line:1},label:'Recorded array unit',importance:'normal'} as TraceEvent))}
const projection=projectTrace(trace)
function view(selection:Selection=null,focusTargetId:string|null=null,cursor=4){
 const scene=projection.project(cursor),plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection,focusTargetId,trace:{active:false,scope:'relevant'}})
 return{scene,plan,window:plan.cellWindows.get(id)!,cells:buildSolidBatch(scene,plan).filter(body=>body.role==='heap'&&body.pick.kind==='slot')}
}
it('preserves the selected cell reason and emphasizes exactly that physical cell',()=>{
 const selected=view({kind:'slot',id:slot(0)})
 expect(selected.window.budgetOverflow.reasons.get(slot(0))).toContain('selected')
 expect(selected.cells.filter(body=>body.edge===color.semantic.execution).map(body=>body.pick.id)).toEqual([slot(0)])
})
it('preserves the focused cell reason and emphasizes only its actual volume',()=>{
 const focused=view(null,slot(2))
 expect(focused.window.budgetOverflow.reasons.get(slot(2))).toContain('focused')
 expect(focused.cells.filter(body=>body.edge===color.semantic.execution).map(body=>body.pick.id)).toEqual([slot(2)])
})
it('caps other physical cells during cell Focus even when another cell is selected or current',()=>{
 for(const state of [view(null,slot(2)),view({kind:'slot',id:slot(0)},slot(2),5)]){
  const before=JSON.stringify(state.scene)
  expect(state.cells.find(body=>body.pick.id===slot(2))!.opacity).toBe(1)
  for(const cell of state.cells.filter(body=>body.pick.id!==slot(2)))expect(cell.opacity).toBeLessThanOrEqual(.25)
  expect(state.cells.every(body=>body.pickable)).toBe(true)
  expect(state.window.mapping.size).toBe(3)
  expect(JSON.stringify(state.scene)).toBe(before)
 }
})
it('distinguishes recorded current access from selected and focused cells',()=>{
 const active=view({kind:'slot',id:slot(0)},slot(2),5)
 expect(active.window.budgetOverflow.reasons.get(slot(0))).toContain('selected')
 expect(active.window.budgetOverflow.reasons.get(slot(1))).toContain('current')
 expect(active.window.budgetOverflow.reasons.get(slot(2))).toContain('focused')
 expect(active.cells.every(body=>body.edge===color.semantic.execution)).toBe(true)
})
it('emphasizes all subdivisions for whole-array selection without inventing selected index pins',()=>{
 const selected=view({kind:'object',id})
 expect(selected.cells).toHaveLength(3)
 expect(selected.cells.every(body=>body.edge===color.semantic.execution)).toBe(true)
 expect([...selected.window.budgetOverflow.reasons.values()].flat()).not.toContain('selected')
})
it('keeps canonical geometry and IDs unchanged through selection, Focus and reverse access',()=>{
 const initial=view()
 for(const actual of [view({kind:'slot',id:slot(0)}),view(null,slot(2)),view(null,null,5),view()]){
  expect(actual.scene.entities[id].anchor).toBe(initial.scene.entities[id].anchor)
  for(const [key,cell] of actual.window.mapping){expect(cell.anchor).toEqual(initial.window.mapping.get(key)!.anchor);expect(cell.port).toEqual(initial.window.mapping.get(key)!.port)}
 }
})

it('limits cell Focus references to that exact storage even when other indices share its target',()=>{
 const arrayId='reference-array',reference=(objectId:string)=>({kind:'reference',javaType:'Item',objectId})
 const records=[{type:'PROGRAM_START'},{type:'ENTER_METHOD',frameId:'references-main',callerFrameId:null,className:'Unit',methodName:'main',locals:[]},...['first','second'].map(objectId=>({type:'ALLOCATE_OBJECT',objectId,displayId:objectId==='first'?1:2,className:'Item',fields:[],metadata:{ownership:'PROJECT',runtimeType:'Item',packageName:''}})),
  {type:'ALLOCATE_ARRAY',objectId:arrayId,displayId:3,elementType:'Item',elements:[reference('first'),reference('second'),reference('first')],metadata:{ownership:'PROJECT',runtimeType:'Item[]',packageName:''}},{type:'EXIT_METHOD',frameId:'references-main'},{type:'PROGRAM_END'}]
 const document:TraceDocument={schemaVersion:2,demoId:'unit/cell-focus-references',sourceFiles:[],events:records.map((record,seq)=>({...record,seq,eventId:`unit/cell-focus/${seq}`,source:null,label:'Explicit normalized reference-array unit',importance:'normal'}))as TraceEvent[]}
 const actual=projectTrace(document),scene=actual.project(document.events.length),saved=JSON.stringify(scene),target=arrayElementSlotId(arrayId,0)
 const direct=scene.references.find(ref=>ref.sourceSlotId===target)!,foreign=scene.references.find(ref=>ref.sourceSlotId===arrayElementSlotId(arrayId,2))!
 expect(direct.targetId).toBe('first');expect(foreign.targetId).toBe('first')
 for(const active of[false,true])for(const selected of[false,true]){
  const plan=planPresentation({scene,layout:actual.layout,detailLevel:'CLOSE',focusTargetId:target,selection:selected?{kind:'reference',id:foreign.id}:null,trace:{active,scope:'all'}})
  expect(plan.framing.focus!.neighbours).toEqual(['first'])
  expect(plan.curves.find(curve=>curve.id===direct.id)!.opacity).toBe(1)
  expect(plan.curves.find(curve=>curve.id===foreign.id)!.opacity).toBeLessThanOrEqual(.25)
  expect(plan.entities.get('second')!.opacity).toBeLessThanOrEqual(.25)
  expect(plan.referencePresentation.counts.current).toBe(3)
 }
 expect(JSON.stringify(scene)).toBe(saved)
})
