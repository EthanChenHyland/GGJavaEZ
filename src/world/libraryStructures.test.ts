import {expect,it} from 'vitest'
import type {TraceDocument,TraceEvent} from '../contracts/runtime'
import {projectTrace} from '../testing/projectTrace'
import {createLayoutEngine} from './layoutEngine'
import {planPresentation} from './presentationPlanner'
import {firstObjectPresentation} from './firstObjectPresentation'
import {facePlate} from './facePlate'
import {faceRows} from './faceRows'
import {world} from '../theme/tokens'
const recording=(payloads:object[]):TraceDocument=>({schemaVersion:2,demoId:'library-reservation-unit',sourceFiles:[],events:payloads.map((payload,seq)=>({...payload,seq,eventId:`library-unit/${seq}`,source:null,label:'Recorded observation',importance:'normal'} as TraceEvent))})
it('source-unknown library arrays and known collection types reserve their fixed structural geometry before any captured contents',()=>{
 const trace=recording([{type:'PROGRAM_START'},
  {type:'ALLOCATE_ARRAY',objectId:'small',displayId:1,elementType:'int',length:2,elements:[],observed:true},
  {type:'ALLOCATE_ARRAY',objectId:'large',displayId:2,elementType:'int',length:1000000,elements:[],observed:true},
  {type:'ALLOCATE_OBJECT',objectId:'map',displayId:3,className:'java.util.HashMap',fields:[],metadata:{ownership:'JDK',runtimeType:'java.util.HashMap',packageName:'java.util'}},
  {type:'ALLOCATE_OBJECT',objectId:'ordinary',displayId:4,className:'foreign.Box',fields:[]},
  {type:'OBJECT_OBSERVE',objectId:'large',arrayElements:[{index:999999,value:{kind:'primitive',javaType:'int',value:42}}]},
  {type:'OBJECT_OBSERVE',objectId:'map',library:{kind:'MAP',size:1,entries:[{key:{kind:'primitive',javaType:'int',value:1},value:{kind:'primitive',javaType:'int',value:7}}]}},
 ])
 const engine=createLayoutEngine();engine.append(trace.events.slice(0,2));const first=engine.state.anchors.small,saved=JSON.stringify(first);engine.append(trace.events)
 const projection=projectTrace(trace),scene=projection.project(trace.events.length)
 expect(projection.project(5).entities.map.kind).toBe('object')
 for(const id of['small','large','map']){
  const event=trace.events.find(event=>'objectId'in event&&event.objectId===id)!;if(event.type!=='ALLOCATE_ARRAY'&&event.type!=='ALLOCATE_OBJECT')throw new Error('Expected allocation')
  expect(engine.state.anchors[id].region).toBe('library');expect(engine.state.anchors[id].size).toEqual(firstObjectPresentation(event).size)
 }
 expect(engine.state.anchors.ordinary.size).toEqual([4.2,2.4,1.6])
 expect(engine.state.anchors.small).toEqual(first);expect(JSON.stringify(first)).toBe(saved);expect(projection.layout).toEqual(engine.state)
 const bodies=scene.order.objects.map(id=>scene.entities[id].anchor)
 for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)expect(bodies[i].position.every((v,axis)=>Math.abs(v-bodies[j].position[axis])<(bodies[i].size[axis]+bodies[j].size[axis])/2-1e-6)).toBe(false)
 const slot='large:element:999999',plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection:{kind:'slot',id:slot},focusTargetId:'map',trace:{active:false,scope:'relevant'}})
 for(const cell of plan.cellWindows.get('large')!.mapping.values())for(let axis=0;axis<3;axis++)expect(Math.abs(cell.anchor.position[axis]-scene.entities.large.anchor.position[axis])+cell.anchor.size[axis]/2).toBeLessThanOrEqual(scene.entities.large.anchor.size[axis]/2+1e-8)
 const map=scene.entities.map;if(map.kind!=='collection')throw new Error('Expected captured Map')
 expect(faceRows(map,plan.entities.get('map')!).visible).toHaveLength(1)
 for(const slotId of[map.entries[0].slotId,map.entries[0].keySlotId!])expect(facePlate(map,plan.entities.get('map')!,slotId)).not.toBeNull()
})
it('ordinary library columns retain their previous positions and compact body dimensions exactly',()=>{
 const trace=recording([{type:'PROGRAM_START'},...['foreign.A','foreign.B','foreign.A'].map((className,index)=>({type:'ALLOCATE_OBJECT',objectId:`ordinary/${index}`,displayId:index+1,className,fields:[]}))]),projection=projectTrace(trace)
 for(let index=0;index<3;index++){
  const anchor=projection.layout.anchors[`ordinary/${index}`],column=index===1?1:0,row=index===2?1:0
  expect(anchor.size).toEqual([4.2,2.4,1.6])
  expect(anchor.position).toEqual([world.frame.w/2+world.regions.stackHeapGap+world.object.libraryW/2+column*(world.object.libraryW+1.2),world.regions.heapTopY-row*3.2-1.2,-world.object.depth/2-world.regions.libraryGapZ-.8])
 }
})
