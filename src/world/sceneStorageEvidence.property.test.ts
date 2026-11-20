import {expect,it} from 'vitest'
import fc from 'fast-check'
import type {RuntimeSlot,TraceDocument,TraceEvent} from '../contracts/runtime'
import {seek} from '../runtime'
import {projectTrace} from '../testing/projectTrace'
const int=(value:number)=>({kind:'primitive' as const,javaType:'int' as const,value})
const classId='jvm:class:unit.Registry'
// Feature: reference-exact-rebuild, Property 25: projections use only prefix evidence
it('Property 25: first assignments order locals, first writes admit statics, and repeated writes never leak into earlier prefixes (100 runs)',()=>{
 fc.assert(fc.property(fc.shuffledSubarray([0,1,2,3,4,5],{minLength:2,maxLength:6}),fc.array(fc.integer({min:0,max:1000}),{minLength:2,maxLength:20}),(order,values)=>{
  const local=(index:number):RuntimeSlot=>({id:`local/${index}`,name:`value${index}`,javaType:'int',value:{kind:'uninitialized'}})
  const inputs:object[]=[{type:'PROGRAM_START'},
   {type:'CLASS_OBSERVE',classId,className:'unit.Registry',initialization:'observed',fields:order.map(index=>({id:`static/${index}`,name:`stored${index}`,javaType:'int',value:int(42)}))},
   {type:'ENTER_METHOD',frameId:'frame',callerFrameId:null,className:'unit.Entry',methodName:'read',locals:[{id:'parameter',name:'input',javaType:'int',role:'parameter',value:int(9)},...[...order].sort((a,b)=>a-b).map(local)]},
   ...order.flatMap((index,at)=>[{type:'ASSIGN_LOCAL',frameId:'frame',slotId:`local/${index}`,value:int(values[at%values.length])},{type:'SET_STATIC',classId,slotId:`static/${index}`,value:int(index)}]),
   ...values.flatMap((value,at)=>[{type:'ASSIGN_LOCAL',frameId:'frame',slotId:`local/${order[at%order.length]}`,value:int(value)},{type:'SET_STATIC',classId,slotId:`static/${order[at%order.length]}`,value:int(value)}])]
  const trace:TraceDocument={schemaVersion:2,demoId:'storage-evidence-unit',sourceFiles:[],events:inputs.map((input,seq)=>({...input,seq,eventId:`unit/${seq}`,source:null,label:'Captured storage',importance:'normal'}as TraceEvent))}
  const projection=projectTrace(trace),anchors=JSON.stringify(projection.layout),cursors=Array.from({length:trace.events.length+1},(_,index)=>index)
  // The projector already knows the complete future trace. Both directions must
  // still expose only facts accepted before this exact cursor.
  for(const cursor of[...cursors,...cursors.reverse()]){
   const state=seek(trace,cursor),before=JSON.stringify(state),scene=projection.project(cursor),prefix=trace.events.slice(0,cursor)
   const locals=new Map<string,string>(),statics=new Map<string,string>()
   for(const event of prefix){if(event.type==='ASSIGN_LOCAL'&&event.value.kind==='primitive')locals.set(event.slotId,String(event.value.value));if(event.type==='SET_STATIC'&&event.value.kind==='primitive')statics.set(event.slotId,String(event.value.value))}
   const frame=scene.entities.frame
   if(frame){if(frame.kind!=='frame')throw new Error('Expected captured frame');expect(frame.rows.map(row=>[row.slotId,row.value.exact])).toEqual([['parameter','9'],...locals]);expect(frame.anchor).toBe(projection.layout.anchors.frame)}
   const shelf=scene.entities[classId]
   if(shelf){if(shelf.kind!=='class')throw new Error('Expected captured class');expect(shelf.rows.map(row=>[row.slotId,row.value.exact])).toEqual(order.map(index=>`static/${index}`).filter(id=>statics.has(id)).map(id=>[id,statics.get(id)]));expect(shelf.anchor).toBe(projection.layout.anchors[classId])}
   expect(JSON.stringify(state)).toBe(before)
  }
  expect(JSON.stringify(projection.layout)).toBe(anchors)
 }),{numRuns:100})
})
