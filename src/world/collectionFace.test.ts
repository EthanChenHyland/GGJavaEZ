import {describe,expect,it} from 'vitest'
import type {TraceDocument,TraceEvent} from '../contracts/runtime'
import {seek} from '../runtime'
import {createLayoutEngine} from './layoutEngine'
import {createSceneProjector} from './sceneProjector'
import {planPresentation} from './presentationPlanner'
import {faceRows} from './faceRows'
import {collectionEntryFace} from './collectionFace'
import {buildSolidBatch} from '../render/SolidBatch'

// Explicit normalized unit fixtures, not JVM/browser acceptance evidence.
function fixture(map=false,source=true){
 const base=(seq:number)=>({seq,eventId:`unit/${seq}`,source:source?{fileId:'Unit.java',line:1}:null,label:'Unit',importance:'normal' as const})
 const reference={kind:'reference' as const,javaType:'Unit',objectId:'target'}
 const events:TraceEvent[]=[
  {...base(0),type:'PROGRAM_START'},
  {...base(1),type:'ALLOCATE_OBJECT',objectId:'container',displayId:1,className:map?'java.util.HashMap':'java.util.ArrayList',fields:[],metadata:{ownership:'JDK',runtimeType:map?'java.util.HashMap':'java.util.ArrayList',packageName:'java.util'}},
  {...base(2),type:'ALLOCATE_OBJECT',objectId:'target',displayId:2,className:'Unit',fields:[],metadata:{ownership:'PROJECT',runtimeType:'Unit',packageName:''}},
  {...base(3),type:'OBJECT_OBSERVE',objectId:'container',fields:[],replaceFields:true,library:map?{kind:'MAP',size:40,entries:Array.from({length:16},()=>({key:reference,value:reference}))}:{kind:'LIST',size:40,items:Array.from({length:32},()=>reference)}},
 ]
 const trace:TraceDocument={schemaVersion:2,demoId:'unit-collection',sourceFiles:[{fileId:'Unit.java',name:'Unit.java',content:'// normalized unit fixture'}],events}
 const layout=createLayoutEngine(),projector=createSceneProjector(trace)
 const sceneAt=(cursor:number)=>projector.project(seek(trace,cursor),layout.state,{sessionEnded:true,pausedAtLiveHead:false,liveHead:events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
 return{events,trace,layout,sceneAt}
}
describe('collection reservations and physical entry faces',()=>{
 it('reserves first-source geometry once, without leaking a later summary into an earlier prefix',()=>{
  const f=fixture();f.layout.append(f.events.slice(0,2));const initial=f.layout.state.anchors.container
  expect(initial.region).toBe('heap');expect(initial.size).toEqual([5.2,9.93,2.3]);expect(initial.ports).toEqual({})
  expect(f.sceneAt(2).entities.container.kind).toBe('object')
  f.layout.append(f.events);expect(f.layout.state.anchors.container).toEqual(initial)
  const scene=f.sceneAt(4);expect(scene.entities.container.kind).toBe('collection');expect(scene.references.length).toBe(32)
  expect(f.sceneAt(2).entities.container.kind).toBe('object');expect(f.sceneAt(2).references).toEqual([])
  const batch=createLayoutEngine();batch.append(f.events);expect(batch.state).toEqual(f.layout.state)
 })
 it('keeps first-source-unknown compact geography even when later source/ownership/summary become known',()=>{
  const f=fixture(false,false);f.layout.append(f.events.slice(0,2));const initial=f.layout.state.anchors.container
  f.events[3]={...f.events[3],source:{fileId:'Unit.java',line:1},metadata:{ownership:'PROJECT',runtimeType:'java.util.ArrayList',packageName:'java.util'}} as TraceEvent
  f.layout.append(f.events);expect(f.layout.state.anchors.container).toEqual(initial);expect(initial.region).toBe('library');expect(initial.size).toEqual([4.2,2.4,1.6])
  const node=f.sceneAt(4).entities.container;expect(faceRows(node,{detail:'CLOSE'}).visible).toEqual([])
 })
 it.each([false,true])('draws exactly the visible List/Map chips and proven reference ports (Map=%s)',map=>{
  const f=fixture(map);f.layout.append(f.events);const scene=f.sceneAt(4),node=scene.entities.container
  expect(node.kind).toBe('collection');if(node.kind!=='collection')throw new Error('Expected captured summary')
  expect(node.entries.length).toBe(map?16:32);expect(node.size).toBe(40)
  for(const [detail,count]of [['MEDIUM',8],['CLOSE',map?16:24]]as const){
   const plan=planPresentation({scene,layout:f.layout.state,detailLevel:detail,selection:{kind:'object',id:node.id},focusTargetId:node.id,trace:{active:false,scope:'relevant'}})
   // Focus intentionally forces CLOSE; measure the same shared renderer model
   // at each target detail directly, without changing runtime facts.
   const presented={...plan.entities.get(node.id)!,detail};plan.entities=new Map([[node.id,presented]])
   const visible=faceRows(node,presented).visible;expect(visible.length).toBe(count)
   const solids=buildSolidBatch(scene,plan),chips=solids.filter(solid=>solid.pick.kind==='slot')
   expect(chips.length).toBe(count*(map?2:1))
   for(let index=0;index<count;index++){
    const entry=node.entries[index],geometry=collectionEntryFace(node.anchor,index,map)!
    expect(entry.port).toEqual(geometry.value)
    for(const [id,port]of [[entry.slotId,entry.port],...(map?[[entry.keySlotId!,entry.keyPort!]]as const:[])]as const){
     const chip=chips.find(solid=>solid.pick.id===id)!.anchor;expect(port![0]).toBe(chip.position[0]);expect(port![1]).toBe(chip.position[1]);expect(port![2]).toBeCloseTo(chip.position[2]+chip.size[2]/2)
    }
   }
   const columnCounts=chips.filter(solid=>!map||node.entries.some(entry=>entry.slotId===solid.pick.id)).reduce((counts,solid)=>{counts[solid.anchor.position[0]<node.anchor.position[0]?0:1]++;return counts},[0,0])
   expect(columnCounts).toEqual(detail==='MEDIUM'?[8,0]:map?[12,4]:[12,12])
  }
  expect(node.entries.slice(24).every(entry=>entry.port===null&&(!map||entry.keyPort===null))).toBe(true)
  const plan=planPresentation({scene,layout:f.layout.state,detailLevel:'CLOSE',selection:{kind:'object',id:node.id},focusTargetId:node.id,trace:{active:false,scope:'relevant'}})
  expect(plan.referencePresentation.counts).toMatchObject({current:32,individual:map?32:24,unavailable:map?0:8})
 })
 it('rejects absent/invalid entry indices and geometry beyond the reserved face',()=>{
  const f=fixture();f.layout.append(f.events);const anchor=f.layout.state.anchors.container
  for(const index of [-1,.5,24,1_000_000])expect(collectionEntryFace(anchor,index)).toBeNull()
  expect(collectionEntryFace({...anchor,size:[4.2,2.4,1.6]},0)).toBeNull()
 })
})
