import {expect,it} from 'vitest'
import type {Selection} from '../contracts/interaction'
import {arrayElementSlotId} from '../contracts/runtime'
import {loadPersonTrace,loadArrayTrace,loadControlTrace} from '../examples/traces'
import {seek} from '../runtime'
import {projectTrace} from '../testing/projectTrace'
import {sparseTrace,sparseArrayId} from '../testing/sparseTrace'
import {planPresentation} from '../world/presentationPlanner'
import {inspectorEntity} from './inspection'
import {inspectorActionTarget} from './inspectorActions'
function view(trace:ReturnType<typeof loadPersonTrace>,cursor:number,selection:Selection){
 const runtime=seek(trace,cursor),world=projectTrace(trace),scene=world.project(cursor),plan=planPresentation({scene,layout:world.layout,detailLevel:'CLOSE',selection,focusTargetId:null,trace:{active:false,scope:'relevant'}})
 return{runtime,scene,plan,target:inspectorActionTarget(trace,runtime,scene,plan,selection)}
}
it('reveals only the captured allocation line and copies the visible object identity at every applicable prefix',()=>{
 const trace=loadPersonTrace(),selection={kind:'object' as const,id:'object:person:17'}
 for(const cursor of[18,9,18,8,0,18]){
  const {target,runtime}=view(trace,cursor,selection),before=JSON.stringify(runtime)
  if(cursor>=9){expect(target.source).toEqual({fileId:'Main.java',line:18});expect(target.copyText).toBe('Person #17');expect(target.present).toBe(true)}
  else expect(target).toMatchObject({present:false,source:null,copyText:null})
  expect(JSON.stringify(runtime)).toBe(before)
 }
})
it('resolves frame, field and local source only from their applied captured evidence',()=>{
 const trace=loadPersonTrace()
 expect(view(trace,18,{kind:'frame',id:'frame:person-setAge:1'}).target.source).toEqual({fileId:'Main.java',line:10})
 expect(view(trace,18,{kind:'slot',id:'slot:object:person:17:age'}).target.source).toEqual({fileId:'Main.java',line:10})
 expect(view(trace,18,{kind:'slot',id:'slot:frame:person-setAge:1:age'}).target.source).toEqual({fileId:'Main.java',line:9})
})
it('copies the exact selected indexed value through reverse writes instead of the array header',()=>{
 const trace=loadArrayTrace(),allocation=trace.events.find(event=>event.type==='ALLOCATE_ARRAY')!
 if(allocation.type!=='ALLOCATE_ARRAY')throw new Error('Expected array')
 const write=trace.events.find(event=>event.type==='ARRAY_WRITE')!;if(write.type!=='ARRAY_WRITE')throw new Error('Expected write')
 const selection={kind:'slot' as const,id:arrayElementSlotId(allocation.objectId,write.index)}
 const before=view(trace,write.seq,selection).target,after=view(trace,write.seq+1,selection).target
 expect(before.copyText).toBe('8');expect(after.copyText).toBe('3');expect(before.source).toEqual(allocation.source)
 expect(view(trace,write.seq,selection).target.copyText).toBe('8')
 expect(after.copyText).not.toBe(after.title)
})
it('keeps sparse unknown-cell status explicit and does not guess a source file',()=>{
 const trace=sparseTrace(),target=view(trace,trace.events.length,{kind:'slot',id:arrayElementSlotId(sparseArrayId,28)}).target
 expect(target).toMatchObject({present:true,source:null,copyText:'⟨not recorded⟩',copyObservation:'UNAVAILABLE'})
})
it('resolves a real current reference only after its binding appears, never by borrowing an object with the same opaque text',()=>{
 const trace=loadPersonTrace(),state=view(trace,18,{kind:'object',id:'object:person:17'}),reference=state.scene.references.find(ref=>ref.sourceSlotId==='slot:frame:main:1:p')!
 expect(view(trace,18,{kind:'reference',id:reference.id}).target.source).toEqual({fileId:'Main.java',line:18})
 expect(view(trace,13,{kind:'reference',id:reference.id}).target).toMatchObject({present:false,source:null,copyText:null})
 const invalid={kind:'reference' as const,id:'object:person:17'}
 expect(inspectorEntity(state.scene,invalid)).toBeNull();expect(view(trace,18,invalid).target.present).toBe(false)
})
it('preserves a closed local recorded source without exposing a future declaration',()=>{
 const trace=loadControlTrace(),declared=trace.events.find(event=>event.type==='DECLARE_LOCAL'&&event.slot.name==='corrected')!
 if(declared.type!=='DECLARE_LOCAL')throw new Error('Expected corrected')
 const selected={kind:'slot' as const,id:declared.slot.id}
 expect(view(trace,declared.seq,selected).target).toMatchObject({present:false,source:null})
 const closed=view(trace,trace.events.length,selected).target
 expect(closed.present).toBe(true);expect(closed.source).toEqual(declared.source);expect(closed.copyText).toBe('corrected')
})
it('rejects out-of-file and absent-file source associations without changing captured identity',()=>{
 const trace=loadPersonTrace(),selection={kind:'object' as const,id:'object:person:17'},state=view(trace,18,selection),node=state.scene.entities[selection.id]
 if(node.kind!=='object')throw new Error('Expected object')
 for(const source of[{fileId:'Main.java',line:9999},{fileId:'missing.java',line:1},{fileId:'Main.java',line:0}]){
  const scene={...state.scene,entities:{...state.scene.entities,[node.id]:{...node,allocationSite:source}}}
  expect(inspectorActionTarget(trace,state.runtime,scene,state.plan,selection)).toMatchObject({source:null,copyText:'Person #17'})
 }
})
it('missing selection, flow, cluster and bundle remain unavailable rather than copying a placeholder identity',()=>{
 const trace=loadPersonTrace()
 for(const selection of[null,...(['flow','cluster','bundle']as const).map(kind=>({kind,id:'not captured'}))])expect(view(trace,18,selection).target).toMatchObject({present:false,source:null,copyText:null})
})
