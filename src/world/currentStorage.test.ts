import {expect,it} from 'vitest'
import type {TraceDocument,TraceEvent} from '../contracts/runtime'
import {projectTrace} from '../testing/projectTrace'
import {planPresentation} from './presentationPlanner'
import {faceRows,faceRowPort} from './faceRows'
import {motionSubjects} from '../motion/overlayGeometry'
const int=(value:number)=>({kind:'primitive' as const,javaType:'int' as const,value})
const payloads:object[]=[{type:'PROGRAM_START'},
 {type:'ALLOCATE_OBJECT',objectId:'reader',displayId:1,className:'java.util.Scanner',fields:[]},
 {type:'ALLOCATE_ARRAY',objectId:'array',displayId:2,elementType:'int',length:1,elements:[int(8)],observed:true},
 {type:'ENTER_METHOD',frameId:'frame',callerFrameId:null,className:'Unit',methodName:'read',locals:[{id:'reader-ref',name:'reader',javaType:'java.util.Scanner',value:{kind:'reference',javaType:'java.util.Scanner',objectId:'reader'}}]},
 ...Array.from({length:20},(_,index)=>({type:'DECLARE_LOCAL',frameId:'frame',slot:{id:`late:${index}`,name:`late${index}`,javaType:index===16?'java.util.Scanner':'int',value:index===16?{kind:'uninitialized'}:int(index)}})),
 {type:'ASSIGN_LOCAL',frameId:'frame',slotId:'late:19',value:int(7)},
 {type:'INPUT_READ',frameId:'frame',readerObjectId:'reader',method:'nextInt',inputIndex:0,destinationSlotId:'late:18',text:'7',value:int(7)},
 {type:'ARRAY_READ',frameId:'frame',objectId:'array',index:0,value:int(8),destinationSlotId:'late:17'},
 {type:'CREATE_REFERENCE',sourceSlot:{kind:'frame',frameId:'frame',slotId:'late:16'},javaType:'java.util.Scanner',targetObjectId:'reader'},
 {type:'LINE_EXECUTE',frameId:'frame'},
]
const trace:TraceDocument={schemaVersion:2,demoId:'current-storage-unit',sourceFiles:[{fileId:'Unit.java',name:'Unit.java',content:'// captured unit operation'}],events:payloads.map((payload,seq)=>({...payload,seq,eventId:`current-storage/${seq}`,source:'type'in payload&&payload.type==='LINE_EXECUTE'?{fileId:'Unit.java',line:1}:null,label:'Recorded operation',importance:'normal'} as TraceEvent))}
it.each([['declaration',24,'late:19'],['assignment',25,'late:19'],['input',26,'late:18'],['array read',27,'late:17'],['reference binding',28,'late:16']] as const)('promotes the captured current %s destination without selection, camera guidance or graph provenance',(_,cursor,slotId)=>{
 const projection=projectTrace(trace),body=projection.layout.anchors.frame,saved=JSON.stringify(projection.layout)
 const scene=projection.project(cursor),plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}}),node=scene.entities.frame,presented=plan.entities.get('frame')!
 expect(faceRows(node,presented).visible.some(row=>row.slotId===slotId)).toBe(true)
 expect(scene.cursorEvent!.storageIds).toContain(slotId)
 expect(faceRowPort(node,presented,slotId)).not.toBeNull();expect(motionSubjects(scene,plan).has(slotId)).toBe(true)
 expect(body.ports[slotId]).toBeUndefined();expect(scene.entities.frame.anchor).toBe(body)
 expect(plan.curves.filter(curve=>curve.kind==='flow'||curve.kind==='return')).toEqual([])
 const cleared=projection.project(29),clearedPlan=planPresentation({scene:cleared,layout:projection.layout,detailLevel:'CLOSE',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})
 expect(cleared.cursorEvent!.storageIds).toEqual([])
 expect(faceRows(cleared.entities.frame,clearedPlan.entities.get('frame')!).visible.some(row=>row.slotId===slotId)).toBe(false)
 expect(JSON.stringify(projection.layout)).toBe(saved)
 const restored=projection.project(cursor),restoredPlan=planPresentation({scene:restored,layout:projection.layout,detailLevel:'CLOSE',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})
 expect(faceRowPort(restored.entities.frame,restoredPlan.entities.get('frame')!,slotId)).toEqual(faceRowPort(node,presented,slotId))
})
