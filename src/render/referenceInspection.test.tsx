import {expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {loadPersonTrace} from '../examples/traces'
import {projectTrace} from '../testing/projectTrace'
import {sparseTrace,sparseArrayId,sparseClassId} from '../testing/sparseTrace'
import {seek} from '../runtime'
import {referenceInspection} from './referenceInspection'
import {InspectorReferences} from './InspectorReferences'
import {historicalSceneReference} from '../world/historicalReference'
import type {RuntimeState} from '../contracts/runtime'
const trace=loadPersonTrace(),world=projectTrace(trace)
it('names every captured Person inbound holder and target without changing prefix truth',()=>{
 for(const cursor of[18,14,10,18]){
  const runtime=seek(trace,cursor),scene=world.project(cursor),before=JSON.stringify(runtime)
  for(const reference of scene.references){
   const fact=referenceInspection(runtime,scene,reference)
   expect(fact.target).toBe('Person #17');expect(fact.source).toMatch(/^Frame /)
   expect(fact.holder).toBe(reference.sourceSlotId==='slot:frame:main:1:p'?'local p':'receiver this')
  }
  const html=renderToStaticMarkup(<InspectorReferences runtime={runtime} scene={scene} entityId="object:person:17" onSelect={()=>{}}/> )
  expect(html).toContain(`${scene.references.length} inbound recorded references`);expect(html).toContain('0 outbound recorded references');expect(JSON.stringify(runtime)).toBe(before)
 }
})
it('names static holding fields and real array index identities, never classes as heap objects',()=>{
 const trace=sparseTrace({references:true}),runtime=seek(trace,trace.events.length),scene=projectTrace(trace).project(trace.events.length)
 const statics=scene.references.find(ref=>ref.sourceSlotId==='static:entries')!
 expect(referenceInspection(runtime,scene,statics)).toMatchObject({source:'Class Registry',holder:'static field entries'})
 const indexed=scene.references.find(ref=>ref.sourceId===sparseArrayId)!
 expect(indexed).toBeDefined();expect(referenceInspection(runtime,scene,indexed).holder).toBe('index [750000]')
 const html=renderToStaticMarkup(<InspectorReferences runtime={runtime} scene={scene} entityId={sparseClassId} onSelect={()=>{}}/> )
 expect(html).toContain('1 outbound recorded references')
})
it('uses captured parameter and field names, and never extracts names from opaque storage IDs',()=>{
 const runtime=seek(trace,18),scene=world.project(18),reference=scene.references.find(ref=>ref.sourceSlotId==='slot:frame:main:1:p')!,frame=runtime.frames[reference.sourceId],slot=frame.locals[reference.sourceSlotId]
 const parameter:RuntimeState={...runtime,frames:{...runtime.frames,[frame.id]:{...frame,locals:{...frame.locals,[slot.id]:{...slot,role:'parameter'}}}}}
 expect(referenceInspection(parameter,scene,reference).holder).toBe('parameter p')
 const opaque={...reference,sourceSlotId:'opaque:name:tempting_guess'}
 expect(referenceInspection(runtime,scene,opaque).holder).toBe('Captured storage (name not recorded)')
 const object=runtime.objects['object:person:17'],field=Object.values(object.fields)[0]
 expect(referenceInspection(runtime,scene,{...reference,sourceId:object.id,sourceSlotId:field.id}).holder).toBe(`field ${field.name}`)
})
it('does not label a historical binding with current redeclared storage metadata',()=>{
 const runtime=seek(trace,18),scene=world.project(18),reference=scene.references[0]
 const binding=historicalSceneReference({id:'old-binding',referenceId:reference.id,sourceId:reference.sourceId,sourceSlotId:reference.sourceSlotId,targetId:reference.targetId,role:reference.role,introducedSeq:1,introducedEventId:'past',endSeq:2,endEventId:'ended',endKind:'overwritten'})
 expect(referenceInspection(runtime,scene,binding,true).holder).toBe('Captured storage (name not recorded)')
})
it('discloses missing endpoints and preserves technical identities without synthesizing titles',()=>{
 const runtime=seek(trace,18),scene=world.project(18),reference=scene.references[0]
 const fact=referenceInspection(runtime,scene,{...reference,sourceId:'missing owner',sourceSlotId:'missing storage',targetId:'missing target'})
 expect(fact).toEqual({source:'missing owner · not present',holder:'Captured storage (name not recorded)',target:'missing target · type not recorded'})
})
it('keeps outbound entries equal to actual non-null references rather than counting every object field',()=>{
 const runtime=seek(trace,18),scene=world.project(18),main='frame:main:1'
 const html=renderToStaticMarkup(<InspectorReferences runtime={runtime} scene={scene} entityId={main} onSelect={()=>{}}/> )
 expect(Object.keys(runtime.frames[main].locals)).toHaveLength(3)
 expect(html).toContain('1 outbound recorded references');expect(html).toContain('local p → Person #17')
})

it('rejects an array-cell index label when the recorded holder is a different owner',()=>{
 const trace=sparseTrace({references:true}),runtime=seek(trace,trace.events.length),scene=projectTrace(trace).project(trace.events.length)
 const reference=scene.references.find(ref=>ref.sourceId===sparseArrayId)!
 expect(referenceInspection(runtime,scene,{...reference,sourceId:'unrelated holder'}).holder).toBe('Captured storage (name not recorded)')
})
