import {describe,expect,it} from 'vitest'
import {arrayElementSlotId,referenceIdForSlot} from '../contracts/runtime'
import {sparseTrace,sparseArrayId as arrayId,sparseHeapId as heapId,sparseClassId as classId,sparseInt as int} from '../testing/sparseTrace'
import {projectTrace} from '../testing/projectTrace'
import {seek} from '../runtime'
import {planPresentation} from '../world/presentationPlanner'
import {presentedFlowPorts} from '../world/flowTopology'
import {accessibleEntities} from '../interaction/accessibleEntities'
import {inspectorRows,inspectorEntity} from './inspection'
import {buildSolidBatch} from './SolidBatch'
import {budgets} from '../theme/tokens'
import type {Selection} from '../contracts/interaction'
function view(options:Parameters<typeof sparseTrace>[0]={},selection:Selection={kind:'object',id:arrayId}){
 const trace=sparseTrace(options),projection=projectTrace(trace),scene=projection.project(trace.events.length),plan=planPresentation({scene,layout:projection.layout,detailLevel:'CLOSE',selection,focusTargetId:null,trace:{active:false,scope:'relevant'}})
 const array=scene.entities[arrayId],storage=scene.entities[classId];if(array.kind!=='array'||storage.kind!=='class')throw new Error('Expected actual sparse/class records')
 return{trace,projection,scene,plan,array,storage,window:plan.cellWindows.get(arrayId)!}
}

describe('production static/sparse successors',()=>{
 it('projects recorded class identity and written static values without allocating a class object',()=>{
  const {scene,storage,trace}=view(),before=JSON.stringify(seek(trace,trace.events.length))
  expect(storage).toMatchObject({kind:'class',id:classId,title:'Registry',initialization:'observed'})
  expect(storage.rows.map(row=>[row.slotId,row.value.kind])).toEqual([['static:counter','primitive'],['static:entries','reference'],['static:unknown','not-recorded']])
  expect(storage.rows[0].value.exact).toBe('7');expect(storage.rows[1].value).toMatchObject({targetId:arrayId});expect(storage.rows[2].value.reason).toBe('not observed')
  expect(scene.order.objects).toEqual([heapId,arrayId]);expect(scene.order.objects).not.toContain(classId)
  expect(JSON.stringify(seek(trace,trace.events.length))).toBe(before)
 })
 it('attaches static references to exact storage and heap identity with shared Inspector ownership',()=>{
  const {scene,plan,storage,array}=view(),reference=scene.references.find(reference=>reference.sourceSlotId==='static:entries')!,curve=plan.curves.find(curve=>curve.id===reference.id)!
  expect(reference).toMatchObject({sourceId:classId,sourceSlotId:'static:entries',targetId:arrayId,role:'class-object'})
  expect(curve.points[0]).toEqual(storage.anchor.ports['static:entries']);expect(curve.destinationAnchor?.entityId).toBe(array.id)
  expect(inspectorEntity(scene,{kind:'class',id:classId})).toBe(storage)
  expect(inspectorEntity(scene,{kind:'slot',id:'static:entries'})).toBe(storage)
 })
 it('preserves bodies and written static ports through class observation reordering, omission and completion',()=>{
  const initial=view(),completed=view({extra:[{type:'CLASS_OBSERVE',classId,className:'domain.Registry',initialization:'completed',fields:[]}]})
  for(const id of Object.keys(initial.scene.entities))expect(completed.scene.entities[id].anchor).toEqual(initial.scene.entities[id].anchor)
  expect(completed.storage.initialization).toBe('completed');expect(completed.storage.rows).toEqual(initial.storage.rows)
  // Omitted observations do not retire already written static storage.
  expect(completed.storage.anchor.ports).toEqual(initial.storage.anchor.ports)
  const observed=initial.trace.events.find(event=>event.type==='CLASS_OBSERVE')!
  expect(initial.projection.project(observed.seq).entities[classId]).toBeUndefined()
  for(const node of Object.values(initial.projection.project(observed.seq).entities))expect(node.anchor).toEqual(initial.scene.entities[node.id].anchor)
 })
 it('exposes class selection, exact full values and hidden-geometry traversal exclusion',()=>{
  const {scene,plan,storage}=view({}, {kind:'class',id:classId}),catalog=accessibleEntities(scene,plan,point=>({x:point[0],y:point[1],visible:true}))
  expect(catalog.find(item=>item.id===classId)).toMatchObject({selection:{kind:'class',id:classId},label:'Registry static state'})
  expect(inspectorRows(storage).at(1).value).toMatchObject({targetId:arrayId})
  expect(plan.headings.some(heading=>heading.id==='CLASS STATE')).toBe(true)
  const hidden={...plan,entities:new Map([...plan.entities].map(([id,item])=>[id,{...item,pickable:false}])),clusters:[]}
  expect(accessibleEntities(scene,hidden,point=>({x:point[0],y:point[1],visible:true}))).toEqual([])
  expect(buildSolidBatch(scene,hidden).some(item=>item.pickable)).toBe(false)
 })
 it('keeps fixed cell dimensions independent of million/two-million logical lengths and preserves actual sparse indices',()=>{
  const a=view(),b=view({length:2000000})
  expect(a.array.cells.map(cell=>cell.index)).toEqual([0,1,2,750000,999999]);expect(a.array.length).toBe(1000000)
  expect(b.array.anchor.size).toEqual(a.array.anchor.size)
  for(const [slotId,cell]of a.window.mapping)expect(b.window.mapping.get(slotId)!.anchor).toEqual(cell.anchor)
  const rows=inspectorRows(a.array);expect(rows.count).toBe(1000000);expect(rows.at(999999).value.exact).toBe('999999');expect(rows.at(500000).value.kind).toBe('not-recorded')
 })
 it('retains canonical geometry through reversed observations, changed captured values and a late sparse index',()=>{
  const initial=view({indices:[0,999999]}),updated=view({indices:[0,999999],extra:[{type:'OBJECT_OBSERVE',objectId:arrayId,arrayElements:[{index:999999,value:int(42)},{index:100,value:int(100)},{index:0,value:int(0)}]}]})
  expect(updated.array.anchor).toEqual(initial.array.anchor)
  expect(updated.array.cells.map(cell=>cell.index)).toEqual([0,100,999999])
  expect(inspectorRows(updated.array).at(999999).value.exact).toBe('42')
  expect(initial.array.cells.map(cell=>cell.index)).toEqual([0,999999])
  expect(inspectorRows(initial.array).at(999999).value.exact).toBe('999999')
 })
 it('bounds virtual cells while retaining all forty observations and a selected index 3900',()=>{
  const slotId=arrayElementSlotId(arrayId,3900),{scene,plan,array,window}=view({indices:Array.from({length:40},(_,i)=>i*100)},{kind:'slot',id:slotId})
  expect(array.cells).toHaveLength(40);expect(window.visible).toContain(3900);expect(window.mapping.size+window.presentedEllipses.length).toBeLessThanOrEqual(budgets.CLOSE.cells)
  expect(inspectorRows(array).at(3900).value.exact).toBe('3900')
  expect(presentedFlowPorts(scene,plan.entities,plan.cellWindows)({kind:'slot',id:slotId})?.point).toEqual(window.mapping.get(slotId)!.port)
  expect(buildSolidBatch(scene,plan).some(item=>item.pick.id===slotId&&item.pickable)).toBe(true)
 })
 it('attaches a reference-array edge to its actual selected cell and preserves the full long target identity',()=>{
  const slotId=arrayElementSlotId(arrayId,750000),id=referenceIdForSlot(slotId),{scene,plan,array,window,trace}=view({references:true},{kind:'reference',id})
  expect(array.componentType).toBe('Box');expect(seek(trace,trace.events.length).objects[arrayId].array!.elementType).toBe('domain.Box');expect(inspectorRows(array).at(750000).value).toMatchObject({targetId:heapId})
  expect(scene.references.find(reference=>reference.id===id)).toMatchObject({sourceId:arrayId,sourceSlotId:slotId,targetId:heapId})
  const curve=plan.curves.find(curve=>curve.id===id)!;expect(curve.points[0]).toEqual(window.mapping.get(slotId)!.port);expect(curve.destinationAnchor?.entityId).toBe(heapId)
  expect(array.cells.filter(cell=>cell.index!==750000).every(cell=>cell.value.kind==='null')).toBe(true)
 })
 it('retains a selected late reference and exact separate sparse write source/destination indices',()=>{
  const indices=Array.from({length:40},(_,i)=>i),slotId=arrayElementSlotId(arrayId,39),referenceId=referenceIdForSlot(slotId)
  const referenced=view({indices,references:true,extra:[{type:'OBJECT_OBSERVE',objectId:arrayId,arrayElements:[{index:39,value:{kind:'reference',javaType:'domain.Box',objectId:heapId}}]}]},{kind:'reference',id:referenceId})
  expect(referenced.window.mapping.has(slotId)).toBe(true);expect(referenced.plan.curves.some(curve=>curve.id===referenceId)).toBe(true)
  const writing=view({indices,extra:[{type:'ARRAY_WRITE',frameId:'observed-call',objectId:arrayId,index:39,value:int(38),from:{kind:'element',index:38}}]})
  expect(writing.array.activity).toEqual({kind:'write',index:39});expect(writing.window.visible).toContain(39)
  expect(seek(writing.trace,writing.trace.events.length).arrayMutations.at(-1)).toMatchObject({index:39,before:int(39),after:int(38),from:{kind:'element',index:38}})
  expect(writing.array.cells).toHaveLength(40)
 })
 it('keeps five small actual cells in canonical index order and equal physical volumes',()=>{
  const {array,window,projection}=view({indices:[0,1,2,3,4],length:5})
  expect(array.length).toBe(5);expect(window.visible).toEqual([0,1,2,3,4])
  for(const [slotId,cell]of window.mapping){expect(cell.anchor.position).toEqual(projection.layout.anchors[slotId].position);expect(cell.anchor.size).toEqual(projection.layout.anchors[slotId].size)}
 })
 it('retains current sparse read evidence, clears stale emphasis and captures a new cell only upon the actual read',()=>{
  const indices=Array.from({length:40},(_,i)=>i),read={type:'ARRAY_READ',frameId:'observed-call',objectId:arrayId,index:39,value:int(39)}
  const current=view({indices,extra:[read]}),stale=view({indices,extra:[read,{type:'LINE_EXECUTE',frameId:'observed-call'}]})
  expect(current.array.activity).toEqual({kind:'read',index:39});expect(current.window.visible).toContain(39);expect(stale.array.activity).toBeNull()
  expect(current.array.cells.some(cell=>cell.index===999999)).toBe(false)
  expect(()=>view({indices,extra:[{...read,index:999999,value:int(999999)}]})).toThrow('Array value must be a concrete Java int')
  const captured=view({indices,extra:[{...read,index:999999,value:int(999999),observed:true}]})
  expect(captured.array.cells.find(cell=>cell.index===999999)?.value.exact).toBe('999999');expect(captured.window.visible).toContain(999999)
 })
 it('does not infer complete or sorted contents from ascending sparse observations',()=>{
  const {array}=view({indices:[100,900]})
  expect(array.cells.map(cell=>cell.value.exact)).toEqual(['100','900']);expect(array.length).toBe(1000000)
  expect(inspectorRows(array).at(500).value.kind).toBe('not-recorded');expect(Object.hasOwn(array,'ascending')).toBe(false)
 })
})
