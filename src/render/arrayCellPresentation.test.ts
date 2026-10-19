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
