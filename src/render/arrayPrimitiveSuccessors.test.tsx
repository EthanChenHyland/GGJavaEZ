import {expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {arrayElementSlotId,type RuntimeState,type TraceDocument,type TraceEvent} from '../contracts/runtime'
import type {Selection} from '../contracts/interaction'
import type {DetailLevel,Vec3} from '../contracts/worldV2'
import {seek} from '../runtime'
import {projectTrace} from '../testing/projectTrace'
import {sparseTrace,sparseArrayId} from '../testing/sparseTrace'
import {planPresentation} from '../world/presentationPlanner'
import {computeArrayWindow} from '../world/arrayWindow'
import {presentedFlowPorts} from '../world/flowTopology'
import {inspectorEntity,inspectorRows} from './inspection'
import {InspectorArrayFacts,arrayWriteSummary} from './InspectorArrayFacts'
import {buildSolidBatch} from './SolidBatch'
import {useCameraStore} from '../camera/cameraStore'
import {color} from '../theme/tokens'
import {Vector3} from 'three'
import {projectionCamera} from '../camera/projection'
import {projectedFontPixels,worldTextVisible} from './text/textSystem'
const objectId='array',frameId='main',tempId='slot:arrays-main:1:temp'
const int=(value:number)=>({kind:'primitive' as const,javaType:'int' as const,value})
const cell=(index:number)=>arrayElementSlotId(objectId,index)
function recording(extra:object[]=[]):TraceDocument{
 const payloads=[{type:'PROGRAM_START'},{type:'ENTER_METHOD',frameId,callerFrameId:null,className:'Example',methodName:'main',returnType:'void',locals:[]},{type:'ALLOCATE_ARRAY',objectId,displayId:23,elementType:'int',elements:[8,1,1].map(int)},{type:'DECLARE_LOCAL',frameId,slot:{id:tempId,name:'temp',javaType:'int',value:int(1)}},...extra,{type:'EXIT_METHOD',frameId},{type:'PROGRAM_END'}]
 return{schemaVersion:2,demoId:'array-primitive-unit',sourceFiles:[{fileId:'Unit.java',name:'Unit.java',content:'class Example {}'}],events:payloads.map((payload,seq)=>({...payload,eventId:`primitive/${seq}`,seq,source:{fileId:'Unit.java',line:1},label:'Recorded array operation',importance:'normal'} as TraceEvent))}
}
function view(extra:object[]=[],selection:Selection={kind:'object',id:objectId},detailLevel:DetailLevel='CLOSE',focusTargetId:string|null=null){
 const trace=recording(extra),projection=projectTrace(trace),cursor=4+extra.length,runtime=seek(trace,cursor),scene=projection.project(cursor)
 const plan=planPresentation({scene,layout:projection.layout,detailLevel,selection,focusTargetId,trace:{active:false,scope:'relevant'}}),node=scene.entities[objectId]
 if(node.kind!=='array')throw new Error('Expected array')
 return{trace,projection,cursor,runtime,scene,plan,node,window:plan.cellWindows.get(objectId)}
}
const facts=(runtime:RuntimeState,id=objectId,index:number|null=null)=>renderToStaticMarkup(<InspectorArrayFacts runtime={runtime} objectId={id} index={index}/>)
const write={type:'ARRAY_WRITE',frameId,objectId,index:0,value:int(1),from:{kind:'element',index:1}}
const compare={kind:'compare' as const,eventId:'compare',objectId,indices:[0,1] as const,values:[int(8),int(1)] as const,operator:'>' as const,result:true}
function translatedLocalPort(actual:ReturnType<typeof view>,destination:Vec3){
 const node=actual.scene.entities[frameId];if(node.kind!=='frame')throw new Error('Expected invocation')
 const original=presentedFlowPorts(actual.scene,actual.plan.entities,actual.plan.cellWindows)({kind:'slot',id:tempId})!.point
 const delta=destination.map((value,index)=>value-original[index]),move=(point:Vec3):Vec3=>[point[0]+delta[0],point[1]+delta[1],point[2]+delta[2]]
 const shifted={...node,anchor:{...node.anchor,position:move(node.anchor.position),bodyPort:move(node.anchor.bodyPort),ports:Object.fromEntries(Object.entries(node.anchor.ports).map(([id,point])=>[id,id===tempId?destination:move(point)]))},rows:node.rows.map(row=>({...row,port:row.port?row.slotId===tempId?destination:move(row.port):null}))}
 return presentedFlowPorts({...actual.scene,entities:{...actual.scene.entities,[frameId]:shifted}},actual.plan.entities,actual.plan.cellWindows)({kind:'slot',id:tempId})?.point
}

it('uses every supplied world position and equal supplied cell volume without deriving a rail',()=>{
 const actual=view(),positions:Vec3[]=[[1.2,-.3,-.65],[3.45,-.3,-.65],[6,-.3,-.65]]
 const mapping=new Map([...actual.window!.mapping].map(([id,entry],index)=>[id,{...entry,anchor:{...entry.anchor,position:positions[index],size:[1.5,1.45,1.35] as Vec3}}]))
 const plan={...actual.plan,cellWindows:new Map([[objectId,{...actual.window!,mapping}]])},before=JSON.stringify([...mapping])
 const solids=buildSolidBatch(actual.scene,plan).filter(body=>body.role==='heap'&&body.pick.kind==='slot')
 expect(solids.map(body=>body.anchor.position)).toEqual(positions)
 expect(solids.map(body=>body.anchor.size)).toEqual(positions.map(()=>[1.5,1.45,1.35]))
 expect(actual.node).toMatchObject({title:'int[]',displayId:23,length:3})
 expect(actual.node.cells.map(item=>item.value.exact)).toEqual(['8','1','1']);expect(JSON.stringify([...mapping])).toBe(before)
})
// Display follows the supplied recorded result; the reducer separately validates
// comparison consistency. The renderer must never re-evaluate Java expressions.
it.each([true,false])('renders the supplied comparison result %s with neutral operand labels',result=>{
 const runtime={...view().runtime,arrayActivity:{...compare,result}},html=facts(runtime)
 expect(html).toContain('Left [0]:');expect(html).toContain('Right [1]:');expect(html).toContain(`Result ${result}`)
 expect(html).toContain('Operator &gt;');expect(html).toContain('>8</span>');expect(html).toContain('>1</span>');expect(html).not.toContain('>j<')
})
it('keeps actual intermediate duplicate values visible during an indexed write',()=>{
 const actual=view([write]),html=facts(actual.runtime)
 expect(actual.node.cells.map(item=>item.value.exact)).toEqual(['1','1','1'])
 expect(html).toContain('[1] → [0]');expect(html).toContain('>8</span> → <span');expect(html).toContain('>1</span>')
 const ports=presentedFlowPorts(actual.scene,actual.plan.entities,actual.plan.cellWindows)
 expect(ports({kind:'slot',id:cell(1)})?.point).toEqual(actual.window!.mapping.get(cell(1))!.port)
 expect(ports({kind:'slot',id:cell(0)})?.point).toEqual(actual.window!.mapping.get(cell(0))!.port)
 expect(actual.plan.curves.some(curve=>curve.kind==='flow')).toBe(false)
})
it('uses the supplied local origin for the temp write and does not fabricate missing origins',()=>{
 const actual=view([{...write,from:{kind:'slot',frameId,slotId:tempId}}]),html=facts(actual.runtime)
 expect(html).toContain('temp → [0]');expect(html).toContain(`Source storage: main · ${tempId}`)
 const ports=presentedFlowPorts(actual.scene,actual.plan.entities,actual.plan.cellWindows)
 expect(ports({kind:'slot',id:tempId})?.point).toEqual(actual.projection.layout.anchors[frameId].ports[tempId])
 expect(translatedLocalPort(actual,[-5,-1,1])).toEqual([-5,-1,1])
 expect(ports({kind:'slot',id:'missing'})).toBeNull()
 const absent=view([{...write,from:undefined}]);expect(facts(absent.runtime)).toContain('Write [0] · source storage not recorded here')
 expect(absent.plan.curves.some(curve=>curve.kind==='flow')).toBe(false)
})
it('labels an actual read into temp and preserves its destination port without inventing a graph route',()=>{
 const actual=view([{type:'ARRAY_READ',frameId,objectId,index:0,value:int(8),destinationSlotId:tempId}]),html=facts(actual.runtime)
 expect(html).toContain('Read [0] = ');expect(html).toContain('>8</span>');expect(html).toContain('Destination: temp')
 const ports=presentedFlowPorts(actual.scene,actual.plan.entities,actual.plan.cellWindows)
 expect(ports({kind:'slot',id:tempId})?.point).toEqual(actual.projection.layout.anchors[frameId].ports[tempId])
 expect(translatedLocalPort(actual,[-5,-1,1])).toEqual([-5,-1,1])
 expect(actual.plan.curves.some(curve=>curve.kind==='flow')).toBe(false)
})
it('retains physical cell selection and its latest causal history at close detail',()=>{
 const actual=view([write,{type:'LINE_EXECUTE',frameId}],{kind:'slot',id:cell(0)}),html=facts(actual.runtime,objectId,0)
 expect(actual.runtime.arrayActivity).toBeNull();expect(html).toContain('Last captured write to [0]')
 expect(arrayWriteSummary(actual.runtime.arrayMutations,objectId,0)).toMatchObject({count:1,write:{before:int(8),after:int(1)}})
 expect(inspectorEntity(actual.scene,{kind:'slot',id:cell(0)})).toBe(actual.node)
 expect(buildSolidBatch(actual.scene,actual.plan).filter(body=>body.role==='heap'&&body.pick.kind==='slot'&&body.edge===color.semantic.execution).map(body=>body.pick.id)).toEqual([cell(0)])
 expect(facts(seek(actual.trace,4),objectId,0)).toBe('')
 expect(facts(seek(actual.trace,actual.cursor),objectId,0)).toBe(html)
})
it('keeps captured comparison facts and committed indexed values independent of camera guidance',()=>{
 const previous=useCameraStore.getState().follow,actual=view(),runtime={...actual.runtime,arrayActivity:compare}
 try{
  useCameraStore.getState().enableFollow();const guided=facts(runtime)
  useCameraStore.getState().userInput();expect(facts(runtime)).toBe(guided)
  expect(actual.node.cells.map(item=>item.value.exact)).toEqual(['8','1','1'])
  expect(guided).toContain('Result true');expect(actual.plan.curves.some(curve=>curve.kind==='flow')).toBe(false)
 }finally{useCameraStore.setState({follow:previous})}
})
it('ignores another array activity and emphasizes all subdivisions for object selection',()=>{
 const actual=view();expect(facts({...actual.runtime,arrayActivity:{...compare,objectId:'other'}})).toBe('')
 const solids=buildSolidBatch(actual.scene,actual.plan).filter(body=>body.role==='heap')
 expect(solids).toHaveLength(4);expect(solids.every(body=>body.edge===color.semantic.execution)).toBe(true)
})
it('keeps sparse indices 29 and 511 and their exact values without expanding a 512-cell recording',()=>{
 const trace=sparseTrace({indices:[0,29,511],length:512,extra:[{type:'OBJECT_OBSERVE',objectId:sparseArrayId,arrayElements:[{index:0,value:int(8)},{index:29,value:int(1)},{index:511,value:int(1)}]}]}),projection=projectTrace(trace),scene=projection.project(trace.events.length),node=scene.entities[sparseArrayId]
 if(node.kind!=='array')throw new Error('Expected sparse array')
 const before=JSON.stringify(node),window=computeArrayWindow({recordingId:scene.recordingId,arrayId:node.id,recordedLength:512,anchor:node.anchor,requestedIndices:[0,29,511],nominalCellBudget:3})
 expect(node.cells.map(item=>[item.index,item.value.exact])).toEqual([[0,'8'],[29,'1'],[511,'1']]);expect(window.mapping.size).toBe(3)
 const rows=inspectorRows(node);expect(rows.count).toBe(512);expect(rows.at(29).value.exact).toBe('1');expect(rows.at(511).value.exact).toBe('1');expect(rows.at(28).value.observation).toBe('UNAVAILABLE')
 expect(JSON.stringify(node)).toBe(before)
})
it('suppresses sub-11-pixel far cell text while retaining array identity and physical cells',()=>{
 const actual=view([],null,'FAR'),window=actual.window
 expect(window?.visible).toEqual([0,1,2])
 const camera=projectionCamera({target:actual.node.anchor.position,distance:250,yawDeg:8,pitchDeg:-13},{width:1440,height:900})
 for(const entry of window!.mapping.values())expect(worldTextVisible(projectedFontPixels(.34,new Vector3(...entry.anchor.position),camera,900))).toBe(false)
 expect(actual.node).toMatchObject({title:'int[]',displayId:23,length:3})
 expect(buildSolidBatch(actual.scene,actual.plan).some(body=>body.pick.kind==='object'&&body.pick.id===objectId)).toBe(true)
 expect(buildSolidBatch(actual.scene,actual.plan).filter(body=>body.role==='heap'&&body.pick.kind==='slot')).toHaveLength(3)
})
it.each(['selection','Focus'] as const)('keeps exact Inspector values available through far %s and close inspection',mode=>{
 const actual=mode==='selection'?view([],{kind:'object',id:objectId},'FAR'):view([],null,'CLOSE',objectId)
 const rows=inspectorRows(actual.node);expect(Array.from({length:rows.count},(_,index)=>rows.at(index).value.exact)).toEqual(['8','1','1'])
 if(mode==='Focus')expect(actual.window?.visible).toEqual([0,1,2])
})
it('does not infer a variable name from an opaque origin ID without captured name evidence',()=>{
 const actual=view(),runtime={...actual.runtime,frames:{},variableLifetimes:[],arrayActivity:null,arrayMutations:[{eventId:'write',objectId,index:0,before:int(8),after:int(1),from:{kind:'slot' as const,frameId,slotId:'temp'}}]}
 const html=facts(runtime)
 expect(html).toContain('Captured storage (name not recorded) → [0]');expect(html).not.toContain('<p>temp →')
 expect(html).toContain('Source storage: main · temp')
})
