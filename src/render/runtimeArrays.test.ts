import {describe,expect,it} from 'vitest'
import {arrayElementSlotId,type TraceDocument,type TraceEvent} from '../contracts/runtime'
import {loadArrayTrace} from '../examples/traces'
import {projectTrace} from '../testing/projectTrace'
import {seek} from '../runtime'
import {planPresentation} from '../world/presentationPlanner'
import {presentedFlowPorts} from '../world/flowTopology'
import {arrayCellTarget} from '../world/arrayCellTarget'
import {accessibleEntities} from '../interaction/accessibleEntities'
import {inspectorEntity,inspectorRows} from './inspection'
import {buildSolidBatch} from './SolidBatch'
import {focusFraming} from '../camera/focusFraming'
import {frontFace,projectionCamera,screenPoint} from '../camera/projection'
import {camera as tokens} from '../theme/tokens'
import type {Selection} from '../contracts/interaction'
const objectId='array-23',frameId='main',int=(value:number)=>({kind:'primitive' as const,javaType:'int' as const,value})
function recording(values=[3,8,1,6,2],writes=true):TraceDocument{
 const payloads:object[]=[{type:'PROGRAM_START'},{type:'ENTER_METHOD',frameId,callerFrameId:null,className:'Example',methodName:'main',returnType:'void',locals:[]},{type:'ALLOCATE_ARRAY',objectId,displayId:23,elementType:'int',elements:values.map(int)},
  ...['nums','i','j','temp'].map((name,index)=>({type:'DECLARE_LOCAL',frameId,slot:{id:`main:${name}`,name,javaType:index?'int':'int[]',value:index?int([0,0,1,8][index]):{kind:'reference',objectId,javaType:'int[]'}}})),
  ...(writes?[{type:'ARRAY_COMPARE',frameId,objectId,indices:[1,2],values:[int(8),int(1)],operator:'>',result:true},{type:'ARRAY_READ',frameId,objectId,index:1,value:int(8),destinationSlotId:'main:temp'},{type:'ARRAY_WRITE',frameId,objectId,index:1,value:int(1),from:{kind:'element',index:2}},{type:'ARRAY_WRITE',frameId,objectId,index:2,value:int(8),from:{kind:'slot',frameId,slotId:'main:temp'}}]:[]),
  {type:'LINE_EXECUTE',frameId},{type:'EXIT_METHOD',frameId},{type:'PROGRAM_END'}]
 return{schemaVersion:2,demoId:'captured-array-unit',sourceFiles:[{fileId:'Unit.java',name:'Unit.java',content:'// explicit unit records'}],events:payloads.map((payload,seq)=>({...payload,eventId:`array-unit/${seq}`,seq,source:'type' in payload&&payload.type==='LINE_EXECUTE'?{fileId:'Unit.java',line:1}:null,label:'Recorded operation',importance:'normal'} as TraceEvent))}
}
const trace=recording(),projection=projectTrace(trace),layout=projection.layout
const view=(cursor:number,selection:Selection={kind:'object',id:objectId})=>{const scene=projection.project(cursor),plan=planPresentation({scene,layout,detailLevel:'CLOSE',selection,focusTargetId:null,trace:{active:false,scope:'relevant'}}),node=scene.entities[objectId];if(node?.kind!=='array')throw new Error('Expected recorded array');return{scene,plan,node,window:plan.cellWindows.get(objectId)!}}

describe('production array presentation successors',()=>{
 it('projects all five actual indexed values and equal cells with exact heap/reference identity',()=>{
  const {scene,plan,node,window}=view(7)
  expect(node).toMatchObject({id:objectId,title:'int[]',displayId:23,length:5})
  expect(node.cells.map(cell=>[cell.index,cell.value.exact,cell.slotId])).toEqual([3,8,1,6,2].map((value,index)=>[index,String(value),arrayElementSlotId(objectId,index)]))
  expect(window.visible).toEqual([0,1,2,3,4]);expect(new Set([...window.mapping.values()].map(cell=>JSON.stringify(cell.anchor.size))).size).toBe(1)
  expect(scene.references).toMatchObject([{sourceId:frameId,sourceSlotId:'main:nums',targetId:objectId}])
  const curve=plan.curves.find(curve=>curve.id===scene.references[0].id)!
  expect(curve.destinationAnchor?.entityId).toBe(objectId)
 })
 it('retains immutable body and cell geometry through both sequential writes, reverse seeks and Focus requests',()=>{
  const saved=JSON.stringify(layout),initial=view(7)
  for(const cursor of[7,10,11,10,7]){
   const {node,window}=view(cursor)
   expect(node.anchor).toBe(initial.node.anchor)
   for(const[slotId,cell]of window.mapping){expect(cell.anchor.position).toEqual(initial.window.mapping.get(slotId)!.anchor.position);expect(cell.anchor.size).toEqual(initial.window.mapping.get(slotId)!.anchor.size)}
  }
  expect(projection.project(2).entities[objectId]).toBeUndefined();expect(JSON.stringify(layout)).toBe(saved)
 })
 it('preserves all 122 fixture events, observed cells and four lexical storage identities through forward and reverse replay',()=>{
  const fixture=loadArrayTrace(),actual=projectTrace(fixture),cursors=Array.from({length:fixture.events.length+1},(_,i)=>i),saved=JSON.stringify(actual.layout)
  expect(fixture.events).toHaveLength(122)
  expect(new Set(fixture.events.flatMap(event=>event.type==='DECLARE_LOCAL'?[event.slot.id]:[])).size).toBe(4)
  for(const cursor of[...cursors,...cursors.reverse()]){
   const state=seek(fixture,cursor),scene=actual.project(cursor)
   for(const id of scene.order.objects){const array=scene.entities[id];if(array.kind!=='array')continue;expect(array.cells.map(cell=>cell.value.exact)).toEqual(state.objects[id].array!.elements.map(cell=>cell.value.kind==='primitive'?String(cell.value.value):'uninitialized'));expect(array.anchor).toBe(actual.layout.anchors[id])}
   for(const id of scene.order.frames){const frame=scene.entities[id];if(frame.kind!=='frame')continue;expect(frame.rows.every(row=>state.frames[id].locals[row.slotId]!==undefined)).toBe(true)}
  }
  expect(JSON.stringify(actual.layout)).toBe(saved)
 })
 it('Focus fits each real cell volume above the shelf and cell selection retains the exact inbound reference context',()=>{
  const {scene,node,window}=view(7),viewport={width:1440,height:900},safe={x:380,y:90,width:1030,height:650}
  for(const[slotId,cell]of window.mapping){
   expect(arrayCellTarget(scene,slotId)).toMatchObject({array:node,index:cell.index,slotId})
   expect(inspectorEntity(scene,{kind:'slot',id:slotId})).toBe(node)
   const camera=projectionCamera(focusFraming(cell.anchor,tokens.focus,safe,viewport),viewport)
   for(const point of frontFace(cell.anchor).map(point=>screenPoint(point,camera,viewport))){expect(point.x).toBeGreaterThanOrEqual(safe.x);expect(point.x).toBeLessThanOrEqual(safe.x+safe.width);expect(point.y).toBeGreaterThanOrEqual(safe.y);expect(point.y).toBeLessThanOrEqual(safe.y+safe.height)}
   expect(scene.references.some(reference=>reference.targetId===node.id)).toBe(true)
  }
  expect(arrayCellTarget(scene,'missing')).toBeNull()
 })
 it('retains exact comparison and read evidence while the next unrelated event clears current activity',()=>{
  expect(seek(trace,8).arrayActivity).toMatchObject({kind:'compare',indices:[1,2],values:[int(8),int(1)],operator:'>',result:true})
  expect(view(8).node.activity).toBeNull()
  expect(seek(trace,9).arrayActivity).toMatchObject({kind:'read',index:1,value:int(8),destinationSlotId:'main:temp'})
  expect(view(9).node.activity).toEqual({kind:'read',index:1})
  expect(view(12).node.activity).toBeNull()
  expect(inspectorRows(view(12).node).at(1).value.exact).toBe('1')
 })
 it('shows each captured assignment and exact element/local origin without inventing an atomic swap or graph edge',()=>{
  expect(view(10).node.cells.map(cell=>cell.value.exact)).toEqual(['3','1','1','6','2'])
  expect(seek(trace,10).arrayMutations.at(-1)).toMatchObject({index:1,before:int(8),after:int(1),from:{kind:'element',index:2}})
  expect(view(11).node.cells.map(cell=>cell.value.exact)).toEqual(['3','1','8','6','2'])
  expect(seek(trace,11).arrayMutations.at(-1)).toMatchObject({index:2,before:int(1),after:int(8),from:{kind:'slot',frameId,slotId:'main:temp'}})
  expect(view(11).node.activity).toEqual({kind:'write',index:2})
  expect(view(12).node.activity).toBeNull();expect(view(11).plan.curves.some(curve=>curve.kind==='flow')).toBe(false)
 })
 it('provides exact array/cell selections and Inspector values while hidden geometry has no keyboard or pointer targets',()=>{
  const slotId=arrayElementSlotId(objectId,2),{scene,plan,node}=view(7,{kind:'slot',id:slotId}),catalog=accessibleEntities(scene,plan,point=>({x:point[0],y:-point[1],visible:true}))
  expect(catalog.find(item=>item.id===slotId)).toMatchObject({label:'int[] #23 [2]',selection:{kind:'slot',id:slotId}})
  expect(catalog.filter(item=>item.selection.kind==='slot')).toHaveLength(5)
  expect(inspectorRows(node).at(2).value.exact).toBe('1')
  expect(presentedFlowPorts(scene,plan.entities,plan.cellWindows)({kind:'slot',id:slotId})?.point).toEqual(layout.anchors[slotId].bodyPort)
  const hidden={...plan,entities:new Map([...plan.entities].map(([id,item])=>[id,{...item,pickable:false}])),clusters:[]}
  expect(accessibleEntities(scene,hidden,point=>({x:point[0],y:point[1],visible:true}))).toEqual([])
  expect(buildSolidBatch(scene,hidden).some(item=>item.pickable)).toBe(false)
 })
 it('keeps complete sorted and duplicate values truthful at completion without inferring algorithm-specific status',()=>{
  for(const values of[[1,2,3,6,8],[1,2,2,6,8],[3,8,1,6,2]]){
   const recorded=recording(values,false),actual=projectTrace(recorded),scene=actual.project(recorded.events.length),array=scene.entities[objectId]
   if(array.kind!=='array')throw new Error('Expected actual array')
   expect(array.cells.map(cell=>cell.value.exact)).toEqual(values.map(String));expect(array.length).toBe(5);expect(Object.hasOwn(array,'ascending')).toBe(false)
   expect(scene.order.frames).toEqual([frameId]);expect(scene.liveStack).toEqual([])
   expect(scene.references[0].targetId).toBe(objectId)
  }
 })
})
