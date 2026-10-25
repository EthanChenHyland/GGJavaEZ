import {afterEach,expect,it,vi} from 'vitest'
import type {SceneModel,SceneClass,SceneArray,SceneReference} from '../contracts/world'
import {heroTrace} from '../testing/heroTrace'
import {projectTrace} from '../testing/projectTrace'
import {planPresentation} from '../world/presentationPlanner'
import {arrayElementSlotId} from '../contracts/runtime'
import {useInteractionStore} from '../interaction/interactionStore'
import {connectorHoverLabel,currentConnectorHover} from './connectorHover'
function fixture(){
 const {trace,cursor}=heroTrace(),projection=projectTrace(trace),scene=projection.project(cursor)
 const plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})
 return{scene,plan}
}
afterEach(()=>useInteractionStore.getState().resetRecording())
it('shows captured method/variable or object/field metadata and target type/identity without mutating evidence',()=>{
 const {scene,plan}=fixture(),before=JSON.stringify(scene)
 for(const [sourceId,name,origin,target]of [['entry','primary','Root.main','Record #3'],['first-record','label','Record #3','String #2']]as const){
  const reference=scene.references.find(reference=>reference.sourceId===sourceId&&(sourceId==='entry'?reference.sourceSlotId==='primary':reference.sourceSlotId.endsWith('/label')))!
  expect(reference).toBeDefined();const label=connectorHoverLabel(scene,plan,reference.id)!
  expect(label).toContain(origin);expect(label).toContain(` · ${sourceId==='entry'?name:`domain.Record.${name}`} → `);expect(label).toContain(target)
 }
 expect(JSON.stringify(scene)).toBe(before)
})
it('uses static metadata and canonical in-bounds array indices in unit metadata fixtures',()=>{
 const {scene,plan}=fixture(),base=scene.entities['first-record'];if(base.kind!=='object')throw new Error('Object fixture')
 const field=base.groups[0].rows[0],statics:SceneClass={kind:'class',id:'opaque-class',title:'Registry',packageName:'domain',initialization:'observed',rows:[{...field,slotId:'opaque-static',name:'current'}],anchor:base.anchor,evidence:base.evidence}
 const original=scene.entities.arguments;if(original.kind!=='array')throw new Error('Array fixture')
 const array:SceneArray={...original,id:'opaque-array',title:'Record[]',displayId:41,length:2}
 const references:SceneReference[]=[{id:'unit-static-ref',sourceId:statics.id,sourceSlotId:'opaque-static',targetId:base.id,role:'class-object',overlay:null,evidence:base.evidence},{id:'unit-array-ref',sourceId:array.id,sourceSlotId:arrayElementSlotId(array.id,1),targetId:base.id,role:'object-object',overlay:null,evidence:base.evidence}]
 const unit:SceneModel={...scene,entities:{...scene.entities,[statics.id]:statics,[array.id]:array},references}
 expect(connectorHoverLabel(unit,plan,references[0].id)).toBe('Registry · current → Record #3')
 expect(connectorHoverLabel(unit,plan,references[1].id)).toBe('Record[] #41 · [1] → Record #3')
 const unavailable={...unit,references:[{...references[1],sourceSlotId:'opaque-array:element:99'}]}
 expect(connectorHoverLabel(unavailable,plan,references[1].id)).toContain('captured storage (name unavailable here)')
})
it('does not turn opaque storage IDs or missing targets into invented Java metadata',()=>{
 const {scene,plan}=fixture(),reference=scene.references[0],id='not:a:Java:variable'
 const unknown={...scene,references:[{...reference,sourceSlotId:id}]},label=connectorHoverLabel(unknown,plan,reference.id)!
 expect(label).toContain('captured storage (name unavailable here)');expect(label).not.toContain(id)
 expect(connectorHoverLabel({...unknown,entities:{}},plan,reference.id)).toBeNull()
 expect(connectorHoverLabel(scene,plan,'absent')).toBeNull()
})
it('distinguishes captured shadowed fields by declaring type while preserving canonical slot identity',()=>{
 const {scene,plan}=fixture(),base=scene.entities['first-record'];if(base.kind!=='object')throw new Error('Object fixture')
 const original=base.groups[0].rows[0],groups=['base.Parent','domain.Record'].map((declaringClass,index)=>({declaringClass,rows:[{...original,slotId:`opaque-field-${index}`,name:'label',declaringClass}]}))
 const references=groups.map((group,index)=>({...scene.references.find(reference=>reference.sourceId===base.id&&reference.targetId==='first-label')!,id:`shadow-ref-${index}`,sourceSlotId:group.rows[0].slotId}))
 const unit={...scene,entities:{...scene.entities,[base.id]:{...base,groups}},references}
 expect(connectorHoverLabel(unit,plan,references[0].id)).toBe('Record #3 · base.Parent.label → String #2')
 expect(connectorHoverLabel(unit,plan,references[1].id)).toBe('Record #3 · domain.Record.label → String #2')
})
it('rejects hover from another recording, cursor, plan or absent curve',()=>{
 const {scene,plan}=fixture(),id=plan.curves[0].id,hover={kind:'connector' as const,id,pointer:[20,30]as const,presentation:{recordingId:scene.recordingId,cursor:scene.cursor,revision:plan.revision}}
 expect(currentConnectorHover(hover,scene,plan)).toBe(id)
 expect(currentConnectorHover(hover,{...scene,recordingId:'another'},plan)).toBeNull()
 expect(currentConnectorHover(hover,{...scene,cursor:scene.cursor-1},plan)).toBeNull()
 expect(currentConnectorHover(hover,scene,{...plan,revision:plan.revision+1})).toBeNull()
 expect(currentConnectorHover({...hover,id:'absent'},scene,plan)).toBeNull()
 expect(currentConnectorHover({...hover,kind:'entity'},scene,plan)).toBeNull()
})
it('changes only hover and avoids duplicate subscriptions for identical pointer facts',()=>{
 const store=useInteractionStore,initial=store.getState();initial.select({kind:'object',id:'first-record'});const before=store.getState(),changed=vi.fn(),unsubscribe=store.subscribe(changed)
 const hover={kind:'connector' as const,id:'ref/unit',pointer:[20,30]as const,presentation:{recordingId:'unit',cursor:4,revision:2}}
 before.setHover(hover);before.setHover({...hover,pointer:[20,30],presentation:{...hover.presentation}})
 expect(changed).toHaveBeenCalledOnce();expect(store.getState().selection).toBe(before.selection);expect(store.getState().focus).toBe(before.focus);expect(store.getState().trace).toBe(before.trace)
 before.setHover(null);before.setHover(null);expect(changed).toHaveBeenCalledTimes(2);unsubscribe()
})
