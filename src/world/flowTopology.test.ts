import {expect,it} from 'vitest'
import fc from 'fast-check'
import type {RuntimeSlot,RuntimeValue,TraceDocument,TraceEvent} from '../contracts/runtime'
import type {FlowTopologyInput} from './flowTopology'
import type {RecordedFlow} from './flowCatalog'
import {buildFlowTopology,presentedFlowPorts} from './flowTopology'
import {createFlowCatalog} from './flowCatalog'
import {createLayoutEngine} from './layoutEngine'
import {createSceneProjector} from './sceneProjector'
import {planPresentation} from './presentationPlanner'
import {seek} from '../runtime'
import {collectionEntryFace} from './collectionFace'
import {generateRawTrace} from '../testing/traceGen'
import {normalizeTrace} from '../instrumentation/normalize'
import {computeArrayWindow} from './arrayWindow'
import {faceRowPort} from './faceRows'
import {arrayReferenceChipPort} from './structureValueChipGeometry'

// Explicit normalized geometry and synthetic edge records are unit fixtures,
// not claimed Java/JVM execution evidence.
function fixture(){
 const slot=(id:string,value:RuntimeValue):RuntimeSlot=>({id,name:id,javaType:'Node',value}),ref:RuntimeValue={kind:'reference',javaType:'Node',objectId:'target'}
 const inputs=[{type:'PROGRAM_START'},{type:'ENTER_METHOD',frameId:'main',callerFrameId:null,className:'FlowUnit',methodName:'main',locals:[]},{type:'ALLOCATE_OBJECT',objectId:'target',displayId:1,className:'Node',fields:[]},
  {type:'ALLOCATE_OBJECT',objectId:'source',displayId:2,className:'Node',fields:Array.from({length:20},(_,i)=>slot(`opaque/field/${i}`,ref))},
  {type:'ALLOCATE_OBJECT',objectId:'map',displayId:3,className:'java.util.LinkedHashMap',fields:[],metadata:{ownership:'PROJECT',runtimeType:'java.util.LinkedHashMap',packageName:'java.util'}},
  {type:'OBJECT_OBSERVE',objectId:'map',fields:[slot('map:summary:entry:0:key',ref),slot('map:summary:entry:0:value',{kind:'null'})],replaceFields:true,library:{kind:'MAP',size:1,entries:[{key:ref,value:{kind:'null'}}]}},
  {type:'ALLOCATE_ARRAY',objectId:'array',displayId:4,elementType:'Node',elements:[ref,ref,ref],length:1000}]
 const events=inputs.map((input,seq)=>({...input,seq,eventId:`unit/${seq}`,label:'Explicit unit fixture',importance:'normal',source:null}))as TraceEvent[]
 const trace:TraceDocument={schemaVersion:2,demoId:'unit/flow-topology',sourceFiles:[],events},layout=createLayoutEngine();layout.append(events)
 const scene=createSceneProjector(trace).project(seek(trace,events.length),layout.state,{sessionEnded:true,pausedAtLiveHead:false,liveHead:events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
 const plan=planPresentation({scene,layout:layout.state,detailLevel:'CLOSE',selection:null,focusTargetId:null,trace:{active:false,scope:'relevant'}})
 const flow=(id:string,source='opaque/field/0',kind:RecordedFlow['kind']='assignment'):RecordedFlow=>({id,edgeIndex:0,kind,from:{kind:'slot',id:source},to:{kind:'object',id:'target'},evidenceSeqs:[2],evidenceEventIds:['unit/2'],valueText:null})
 const input:FlowTopologyInput={scene,entities:plan.entities,cellWindows:plan.cellWindows,flows:[],limit:2,mandatoryIds:new Set(),priority:()=>0,inScope:()=>true,aggregate:true}
 return{scene,plan,input,flow}
}
function assertPartition(result:ReturnType<typeof buildFlowTopology>,expected:string[]){
 const p=result.presentation,c=p.counts,ids=[...p.individualIds,...result.bundles.flatMap(bundle=>bundle.flows.map(flow=>flow.id)),...p.unavailable.map(item=>item.id),...p.scopeExcluded]
 expect(ids.slice().sort()).toEqual(expected.slice().sort());expect(new Set(ids).size).toBe(expected.length)
 expect(c.recorded).toBe(c.drawable+c.unavailable+c.scopeExcluded);expect(c.drawable).toBe(c.individual+c.bundled)
 expect(c.bundled).toBe(result.bundles.reduce((sum,bundle)=>sum+bundle.flows.length,0));expect(c.bundleCurves).toBe(result.bundles.length)
}
it('groups genuine directed semantic pairs and roles with exact constituents despite raw-version edge identities',()=>{
 const f=fixture(),flows=Array.from({length:100},(_,i)=>f.flow(`opaque version ${i}`,undefined,i%2?'assignment':'reference'))
 const result=buildFlowTopology({...f.input,flows});assertPartition(result,flows.map(flow=>flow.id));expect(result.individual).toHaveLength(2);expect(result.bundles).toHaveLength(2)
 expect(result.bundles.map(bundle=>bundle.flows.length).sort()).toEqual([49,49])
 for(const bundle of result.bundles){expect(new Set(bundle.flows.map(flow=>flow.kind)).size).toBe(1);expect(bundle.from.point).toEqual(faceRowPort(f.scene.entities.source,f.plan.entities.get('source')!,'opaque/field/0'))}
 expect(buildFlowTopology({...f.input,flows:[...flows].reverse()})).toEqual(result)
})
it('keeps the selected dense bundle and exact flow partition when other aggregates exceed the cut',()=>{
 const f=fixture(),flows=[f.flow('required'),f.flow('first',undefined,'reference'),f.flow('selected',undefined,'local-field')]
 const input={...f.input,flows,limit:1,mandatoryIds:new Set(['required'])}
 const selected=buildFlowTopology(input).bundles.find(bundle=>bundle.flows[0].id==='selected')!
 const bounded=buildFlowTopology({...input,bundleLimit:1,selectedBundleId:selected.id})
 expect(bounded.bundles).toEqual([selected])
 expect(bounded.presentation.scopeExcluded).toEqual(['first'])
 assertPartition(bounded,flows.map(flow=>flow.id))
})
it('never substitutes quiet/hidden/retired storage or collapsed bodies for real provenance ports',()=>{
 const f=fixture(),flows=[f.flow('visible'),f.flow('hidden','opaque/field/19'),f.flow('retired','missing lifetime')]
 const result=buildFlowTopology({...f.input,flows});assertPartition(result,flows.map(flow=>flow.id));expect(result.presentation.counts.unavailable).toBe(2)
 const entities=new Map(f.input.entities);entities.set('source',{...entities.get('source')!,mode:'quiet'})
 expect(buildFlowTopology({...f.input,entities,flows}).presentation.counts.unavailable).toBe(3)
 entities.delete('target');expect(buildFlowTopology({...f.input,entities,flows}).presentation.counts.unavailable).toBe(3)
})
it('keeps Map key geometry, leaves null values without ports and uses only captured current array cells',()=>{
 const f=fixture(),port=presentedFlowPorts(f.scene,f.plan.entities,f.plan.cellWindows),map=f.scene.entities.map
 if(map.kind!=='collection')throw new Error('Expected Map')
 expect(map.entries[0].port).toBeNull();const geometry=collectionEntryFace(map.anchor,0,true)!
 expect(port({kind:'slot',id:map.entries[0].slotId})).toBeNull()
 expect(port({kind:'slot',id:map.entries[0].keySlotId!})?.point).toEqual(geometry.key)
 const array=f.scene.entities.array,windows=new Map(f.plan.cellWindows)
 windows.set('array',computeArrayWindow({recordingId:f.scene.recordingId,arrayId:'array',recordedLength:1000,anchor:array.anchor,nominalCellBudget:1,requestedIndices:[500]}))
 const current=presentedFlowPorts(f.scene,f.plan.entities,windows)
 expect(current({kind:'slot',id:'array:element:500'})).toBeNull();expect(current({kind:'slot',id:'array:element:1'})).toBeNull()
})
it('withholds null or unavailable array and Map-key ports without moving surviving captured attachments',()=>{
 const f=fixture(),array=f.scene.entities.array,map=f.scene.entities.map
 if(array.kind!=='array'||map.kind!=='collection')throw new Error('Expected captured array and Map')
 const nullValue={kind:'null' as const,text:'null',exact:'null',observation:'OBSERVED' as const},missing={kind:'not-recorded' as const,text:'⟨not recorded⟩' as const,exact:'⟨not recorded⟩' as const,observation:'UNAVAILABLE' as const}
 const scene={...f.scene,entities:{...f.scene.entities,array:{...array,cells:array.cells.map((cell,index)=>index<2?{...cell,value:index===0?nullValue:missing}:cell)},map:{...map,entries:map.entries.map(entry=>({...entry,key:nullValue,value:array.cells[2].value}))}}}
 const port=presentedFlowPorts(scene,f.plan.entities,f.plan.cellWindows)
 expect(port({kind:'slot',id:array.cells[0].slotId})).toBeNull();expect(port({kind:'slot',id:array.cells[1].slotId})).toBeNull()
 const cell=f.plan.cellWindows.get(array.id)!.mapping.get(array.cells[2].slotId)!
 expect(port({kind:'slot',id:array.cells[2].slotId})).toEqual({point:arrayReferenceChipPort(cell.anchor),anchor:cell.anchor})
 expect(port({kind:'slot',id:map.entries[0].keySlotId!})).toBeNull();expect(port({kind:'slot',id:map.entries[0].slotId})?.point).toEqual(collectionEntryFace(map.anchor,0,true)!.value)
})
it('retains every drawable mandatory flow over budget and records scope exclusions separately (100 runs)',()=>{
 fc.assert(fc.property(fc.integer({min:1,max:50}),fc.integer({min:0,max:8}),(count,limit)=>{
  const f=fixture(),flows=Array.from({length:count},(_,i)=>f.flow(`edge/${i}`)),mandatoryIds=new Set(flows.slice(0,10).map(flow=>flow.id))
  const result=buildFlowTopology({...f.input,flows,limit,mandatoryIds});assertPartition(result,flows.map(flow=>flow.id))
  expect(result.individual.length).toBe(Math.max(Math.min(count,10),Math.min(count,limit)))
  if(mandatoryIds.size>limit)expect(result.individual.every(item=>mandatoryIds.has(item.flow.id))).toBe(true)
  const excluded=buildFlowTopology({...f.input,flows,inScope:()=>false});assertPartition(excluded,flows.map(flow=>flow.id));expect(excluded.presentation.counts.scopeExcluded).toBe(count)
 }),{numRuns:100})
})
it('rejects duplicate IDs and future evidence without producing curves',()=>{
 const f=fixture(),flow=f.flow('edge');expect(()=>buildFlowTopology({...f.input,flows:[flow,flow]})).toThrow('Duplicate')
 expect(()=>buildFlowTopology({...f.input,flows:[{...flow,evidenceSeqs:[f.scene.cursor]}]})).toThrow('outside')
})
it('accounts every supported accepted graph edge exactly once across cuts, scopes and rewind (100 runs)',()=>{
 const supported=new Set(['ARGUMENT_BIND','RECEIVER_BIND','ASSIGN','FIELD_WRITE','STATIC_WRITE','FIELD_READ','STATIC_READ','REFERENCE_BIND','ARRAY_READ','ARRAY_WRITE','RETURN','INPUT_CONSUME','OUTPUT','THROW','UNWIND','CATCH'])
 fc.assert(fc.property(fc.integer({min:1,max:100000}),seed=>{
  const raw=generateRawTrace({seed,rawEvents:65,maxDepth:5,classes:4,callRate:.5,provenance:true}),trace=normalizeTrace(raw.rawEvents,raw.manifest,{status:'complete',exitCode:0,diagnostic:null}).trace
  const layout=createLayoutEngine();layout.append(trace.events);const projector=createSceneProjector(trace),catalog=createFlowCatalog(),head=seek(trace,trace.events.length);catalog.extend(head.executionGraph!,trace)
  for(const cursor of [trace.events.length,Math.floor(trace.events.length/2),0,trace.events.length]){
   const scene=projector.project(seek(trace,cursor),layout.state,{sessionEnded:true,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
   const eventSeq=new Map(trace.events.map(event=>[event.eventId,event.seq])),expected=head.executionGraph!.edges.filter(edge=>supported.has(edge.kind)&&eventSeq.get(edge.eventId)!<cursor).map(edge=>edge.id)
   expect(catalog.prefix(cursor,scene).map(flow=>flow.id)).toEqual(expected)
   for(const detailLevel of ['FAR','MEDIUM','CLOSE']as const){
    const plan=planPresentation({scene,layout:layout.state,flows:catalog,detailLevel,selection:null,focusTargetId:null,trace:{active:true,scope:'all'}}),p=plan.flowPresentation
    const ids=[...p.individualIds,...plan.bundles.filter(bundle=>bundle.kind==='flow').flatMap(bundle=>bundle.flowIds),...p.unavailable.map(item=>item.id),...p.scopeExcluded]
    expect(ids.slice().sort()).toEqual(expected.slice().sort());expect(new Set(ids).size).toBe(expected.length);expect(p.counts.scopeExcluded).toBe(0);expect(p.counts.drawable).toBe(p.counts.individual+p.counts.bundled)
   }
  }
 }),{numRuns:100})
})

it('maps a tail array window without scanning the densely captured prefix',()=>{
 const f=fixture(),array=f.scene.entities.array
 if(array.kind!=='array')throw new Error('Expected array')
 const cells=Array.from({length:1000},(_,index)=>({...array.cells[0],index,slotId:`array:element:${index}`}))
 let reads=0
 const counted=new Proxy(cells,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.get(target,key,receiver)}})
 const scene={...f.scene,entities:{...f.scene.entities,array:{...array,cells:counted}}},windows=new Map(f.plan.cellWindows)
 const window=computeArrayWindow({recordingId:scene.recordingId,arrayId:'array',recordedLength:1000,anchor:array.anchor,nominalCellBudget:128,requestedIndices:[999]})
 windows.set('array',window)
 const port=presentedFlowPorts(scene,f.plan.entities,windows)
 for(const[id,cell]of window.mapping)expect(port({kind:'slot',id})?.point).toEqual(arrayReferenceChipPort(cell.anchor))
 expect(port({kind:'slot',id:'array:element:1000'})).toBeNull()
 expect(reads).toBeLessThanOrEqual(window.mapping.size)
})

it('bounds priority-policy queries to one per drawable flow while preserving the complete partition',()=>{
 const f=fixture(),flows=Array.from({length:256},(_,i)=>f.flow(`edge/${i}`)),calls=new Map<string,number>(),before=JSON.stringify(flows)
 const result=buildFlowTopology({...f.input,flows,mandatoryIds:new Set(flows.slice(0,5).map(flow=>flow.id)),priority(flow){calls.set(flow.id,(calls.get(flow.id)??0)+1);return Number(flow.id.slice(5))%4}})
 assertPartition(result,flows.map(flow=>flow.id));expect(result.individual).toHaveLength(5)
 expect([...calls.values()].reduce((sum,count)=>sum+count,0)).toBeLessThanOrEqual(flows.length)
 expect(JSON.stringify(flows)).toBe(before)
})

it('accounts the same complete flow partition from a single-pass iterator without an array owner',()=>{
 const f=fixture(),flows=Array.from({length:100},(_,index)=>f.flow(`single pass / ${index}`,index%5===0?'missing lifetime':undefined,index%2?'assignment':'reference'))
 const expected=buildFlowTopology({...f.input,flows});let visits=0,iterations=0
 const singlePass={*[Symbol.iterator](){iterations++;expect(iterations).toBe(1);for(const flow of flows){visits++;yield flow}}}
 const result=buildFlowTopology({...f.input,flows:singlePass});expect(result).toEqual(expected);expect(visits).toBe(flows.length);assertPartition(result,flows.map(flow=>flow.id))
})
