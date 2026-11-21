import {expect,it,vi} from 'vitest'
import * as transitions from '../motion/semanticTransition'
import type {RawRuntimeEvent} from '../instrumentation/contracts'
import type {TraceDocument,TraceEvent} from '../contracts/runtime'
import {normalizeTrace} from '../instrumentation/normalize'
import {seek} from '../runtime'
import {createLayoutEngine} from './layoutEngine'
import {createSceneProjector} from './sceneProjector'
import {createFlowCatalog} from './flowCatalog'
import {planPresentation} from './presentationPlanner'
import {returnCaptions} from '../render/returnCaptions'
function recording(consumes=true){
 const base={v:1,provenanceVersion:1,coverageVersion:1,threadId:'1',frameId:'main',className:'sample.Main',methodName:'main',descriptor:'()V',line:1,site:0} as const,int=(value:number)=>({kind:'int',value} as const)
 const events:RawRuntimeEvent[]=[
  {...base,type:'enter',seq:0,callerFrameId:null,receiver:null,parameters:[]},
  {...base,type:'local',seq:1,slot:2,name:'answer',descriptor:'I',liveRange:'2:0:999',value:int(1),origin:{kind:'constant',value:int(1)}},
  {...base,type:'call',seq:2,site:7,callId:'call',invokeKind:'static',owner:'sample.Worker',name:'value',callDescriptor:'()I',receiver:null,arguments:[],argumentOrigins:[],receiverOrigin:{kind:'unknown'}},
  {...base,type:'enter',seq:3,frameId:'child',className:'sample.Worker',methodName:'value',descriptor:'()I',callerFrameId:'main',callId:'call',receiver:null,parameters:[]},
  {...base,type:'return',seq:4,frameId:'child',className:'sample.Worker',methodName:'value',descriptor:'()I',value:int(7),origin:{kind:'constant',value:int(7)}},
  {...base,type:'exit',seq:5,frameId:'child',className:'sample.Worker',methodName:'value',descriptor:'()I'},
  {...base,type:'call_return',seq:6,site:7,callId:'call',value:int(7)},
  {...base,type:'local',seq:7,site:8,slot:2,name:'answer',descriptor:'I',liveRange:'2:0:999',value:int(7),origin:consumes?{kind:'call_result',site:7}:{kind:'constant',value:int(7)}},
  {...base,type:'local_end',seq:8,slot:2,liveRange:'2:0:999'},
  {...base,type:'exit',seq:9},
 ]
 const fileId='sample/Main.java',manifest={sources:[{fileId,name:'Main.java',content:'package sample; class Main {} class Worker {}',sha256:'0'}],classes:['sample.Main','sample.Worker'].map(className=>({className,sourceFile:'Main.java',fileId,sourceSha256:'0',status:'resolved' as const,candidates:[]}))}
 return normalizeTrace(events,manifest,{status:'complete',exitCode:0,diagnostic:null}).trace
}
it('retains recorded null assignment provenance without claiming a drawable slot port',()=>{
 const source='opaque/null/source',destination='opaque/null/destination',frameId='unit/null/frame'
 const inputs=[{type:'PROGRAM_START'},{type:'ENTER_METHOD',frameId,callerFrameId:null,className:'NullUnit',methodName:'run',locals:[source,destination].map(id=>({id,name:id,javaType:'java.lang.Object',value:{kind:'null'}}))},
  {type:'EXECUTION_FACT',fact:{kind:'write',context:{owner:'NullUnit',name:'run',descriptor:'()V',frameId,site:0,rawSeq:2,source:null},target:{id:source,kind:'variable',ownerId:frameId,name:'source',javaType:'java.lang.Object'},value:{kind:'null'},origin:{kind:'constant',value:{kind:'null'}}}},
  {type:'EXECUTION_FACT',fact:{kind:'write',context:{owner:'NullUnit',name:'run',descriptor:'()V',frameId,site:1,rawSeq:3,source:null},target:{id:destination,kind:'variable',ownerId:frameId,name:'destination',javaType:'java.lang.Object'},value:{kind:'null'},origin:{kind:'local',slotId:source}}}]
 const events=inputs.map((event,seq)=>({...event,seq,eventId:`unit/null/${seq}`,source:null,importance:'normal',label:'Explicit unit null storage'}))as TraceEvent[]
 const trace:TraceDocument={schemaVersion:2,demoId:'unit/null/ports',sourceFiles:[],events},layout=createLayoutEngine();layout.append(events)
 const state=seek(trace,events.length),scene=createSceneProjector(trace).project(state,layout.state,{sessionEnded:false,pausedAtLiveHead:false,liveHead:events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}}),catalog=createFlowCatalog();catalog.extend(state.executionGraph!,trace)
 const edge=[...catalog.iteratePrefix(scene.cursor,scene)].find(flow=>flow.from?.id===source&&flow.to?.id===destination)
 expect(edge).toBeDefined()
 const queries=catalog.query({cursor:scene.cursor,scene,priority:{selectedIds:new Set([destination]),focusedIds:new Set(),currentIds:new Set()},limit:40})
 expect(queries.some(flow=>flow.id===edge!.id)).toBe(false)
 expect(catalog.recordedProvenanceOf(destination,scene.cursor).find(flow=>flow.edgeId===edge!.id)?.spatial.drawable).toBe(false)
 const plan=planPresentation({scene,layout:layout.state,flows:catalog,detailLevel:'CLOSE',selection:{kind:'slot',id:destination},focusTargetId:null,trace:{active:true,scope:'all'}})
 expect(plan.curves.some(curve=>curve.id===edge!.id)).toBe(false)
 expect(plan.flowPresentation.unavailable.some(flow=>flow.id===edge!.id)).toBe(true)
 expect(catalog.recordedProvenanceOf(destination,scene.cursor).some(flow=>flow.edgeId===edge!.id)).toBe(true)
})
it('return destinations require prefix-visible assignment evidence, even when the destination already has a port',()=>{
 const trace=recording(),write=trace.events.find(event=>event.type==='EXECUTION_FACT'&&event.fact.kind==='write'&&event.fact.origin.kind==='call_result')!
 const layout=createLayoutEngine();layout.append(trace.events)
 const projector=createSceneProjector(trace),catalog=createFlowCatalog();catalog.extend(seek(trace,trace.events.length).executionGraph!,trace)
 const sceneAt=(cursor:number)=>projector.project(seek(trace,cursor),layout.state,{sessionEnded:false,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
 const query=(cursor:number)=>{const scene=sceneAt(cursor);return catalog.query({cursor,scene,priority:{selectedIds:new Set(),focusedIds:new Set(),currentIds:new Set()},limit:40})}
 expect(query(write.seq).filter(flow=>flow.kind==='return')).toEqual([])
 expect(sceneAt(write.seq).returnFlows).toEqual([])
 expect(sceneAt(write.seq).entities['jvm:frame:child']).toMatchObject({status:{kind:'returned',value:{exact:'7'}}})
 const returned=query(write.seq+1).filter(flow=>flow.kind==='return')
 expect(returned).toHaveLength(1);
 const scene=sceneAt(write.seq+1),graph=seek(trace,write.seq+1).executionGraph!,sourceEdge=graph.edges[returned[0].edgeIndex]
 expect(sourceEdge.kind).toBe('RETURN');expect(returned[0].id).toBe(sourceEdge.id)
 expect(scene.returnFlows).toMatchObject([{id:sourceEdge.id,frameId:'jvm:frame:child',destination:{entityId:'jvm:frame:main',slotId:'jvm:frame:main:local:2:2:0:999'}}])
 const input={scene,layout:layout.state,detailLevel:'CLOSE' as const,selection:null,focusTargetId:null,trace:{active:true,scope:'all' as const}}
 expect(planPresentation(input).curves.filter(curve=>curve.kind==='return')).toEqual([])
 const plan=planPresentation({...input,flows:catalog})
 const current=planPresentation({...input,flows:catalog,trace:{active:true,scope:'current'}})
 expect(scene.returnFlows[0].consumerSeq).toBe(write.seq)
 expect(current.curves.find(curve=>curve.id===sourceEdge.id)).toMatchObject({kind:'return',widthPx:2.5,arrow:true,label:'7'})
 expect(current.curves.some(curve=>curve.kind==='call'||curve.kind==='connector'||curve.kind==='binding-history')).toBe(false)
 expect(plan.curves.filter(curve=>curve.kind==='return').map(curve=>curve.id)).toEqual([sourceEdge.id])
 expect(plan.headings.filter(heading=>heading.id==='RETURNS')).toHaveLength(1)
 const returnHeading=plan.headings.find(heading=>heading.id==='RETURNS')!,returnBody=plan.curves.find(curve=>curve.kind==='return')!.sourceAnchor!
 const headingClearance=returnHeading.position[1]-(returnBody.position[1]+returnBody.size[1]/2)
 expect(headingClearance,'The return lane label follows its proved source rather than a distant root frame').toBeGreaterThanOrEqual(.5)
 expect(headingClearance).toBeLessThanOrEqual(1)
 expect(returnCaptions(scene,plan.curves)).toMatchObject([{flowId:sourceEdge.id,primary:'return 7',operands:null}])
 expect(returned[0].from).toEqual({kind:'frame',id:'jvm:frame:child'});expect(returned[0].to).toEqual({kind:'slot',id:'jvm:frame:main:local:2:2:0:999'})
 expect(query(trace.events.length).filter(flow=>flow.kind==='return')).toEqual([])
 expect(catalog.recordedProvenanceOf('jvm:frame:main:local:2:2:0:999',trace.events.length).length).toBeGreaterThan(0)
})
it('repeated rewinds resolve the same complete prefix as a fresh catalog across assignment and retirement',()=>{
 const trace=recording(),layout=createLayoutEngine();layout.append(trace.events)
 const projector=createSceneProjector(trace),graph=seek(trace,trace.events.length).executionGraph!
 const catalog=createFlowCatalog();catalog.extend(graph,trace)
 const write=trace.events.find(event=>event.type==='EXECUTION_FACT'&&event.fact.kind==='write'&&event.fact.origin.kind==='call_result')!
 const cursors=[write.seq+1,trace.events.length,write.seq,0,write.seq+1,trace.events.length,write.seq+1,write.seq]
 for(const cursor of cursors){
  const scene=projector.project(seek(trace,cursor),layout.state,{sessionEnded:false,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
  const fresh=createFlowCatalog();fresh.extend(graph,trace)
  const actual=catalog.prefix(cursor,scene)
  expect(actual).toEqual(fresh.prefix(cursor,scene))
  expect(actual.every(flow=>flow.evidenceSeqs.every(seq=>seq<cursor))).toBe(true)
  const transfers=actual.filter(flow=>flow.kind==='return'&&flow.from&&flow.to)
  if(cursor===write.seq||cursor===0)expect(transfers).toHaveLength(0)
  if(cursor===write.seq+1){expect(transfers).toHaveLength(1);expect(transfers[0].to).toEqual({kind:'slot',id:'jvm:frame:main:local:2:2:0:999'})}
 }
})

it('an equal caller value without a recorded return-consumer edge cannot create a return Flow',()=>{
 const trace=recording(false),layout=createLayoutEngine();layout.append(trace.events)
 const state=seek(trace,trace.events.find(event=>event.type==='REMOVE_LOCAL')!.seq),graph=state.executionGraph!
 const scene=createSceneProjector(trace).project(state,layout.state,{sessionEnded:false,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}})
 const catalog=createFlowCatalog();catalog.extend(graph,trace)
 expect(graph.edges.some(edge=>edge.kind==='RETURN')).toBe(true)
 expect(scene.entities['jvm:frame:main']).toMatchObject({rows:expect.arrayContaining([expect.objectContaining({value:expect.objectContaining({exact:'7'})})])})
 expect(scene.entities['jvm:frame:child']).toMatchObject({status:{kind:'returned',value:{exact:'7'}}})
 expect(scene.returnFlows).toEqual([])
 expect(catalog.prefix(scene.cursor,scene).filter(flow=>flow.kind==='return'&&flow.from&&flow.to)).toEqual([])
 const plan=planPresentation({scene,layout:layout.state,detailLevel:'CLOSE',selection:null,focusTargetId:null,trace:{active:true,scope:'all'},flows:catalog})
 expect(plan.curves.filter(curve=>curve.kind==='return')).toEqual([])
 expect(plan.headings.some(heading=>heading.id==='RETURNS')).toBe(false)
})
it('incremental return-face status changes when its consuming edge arrives and agrees with every rebuilt prefix',()=>{
 const trace=recording(),layout=createLayoutEngine();layout.append(trace.events)
 const projector=createSceneProjector(trace),fresh=createSceneProjector(trace),context={sessionEnded:false,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL' as const,reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}}
 let from=0
 projector.project(seek(trace,0),layout.state,context)
 const write=trace.events.find(event=>event.type==='EXECUTION_FACT'&&event.fact.kind==='write'&&event.fact.origin.kind==='call_result')!
 for(const cursor of [...Array.from({length:trace.events.length},(_,i)=>i+1),write.seq,write.seq+1,0,write.seq+1]){
  const scene=projector.advance(seek(trace,cursor),layout.state,trace.events,from,cursor,context);from=cursor
  const rebuilt=fresh.project(seek(trace,cursor),layout.state,context)
  expect(scene.entities).toEqual(rebuilt.entities)
  expect(scene.returnFlows).toEqual(rebuilt.returnFlows)
  if(cursor===write.seq)expect(scene.entities['jvm:frame:child']).toMatchObject({status:{kind:'returned',value:{exact:'7'}}})
  if(cursor===write.seq+1)expect(scene.entities['jvm:frame:child']).toMatchObject({status:{kind:'returned',value:null}})
 }
})

it('iterates every supported prefix without changing the eager snapshot identity through rewinds',()=>{
 const trace=recording(),layout=createLayoutEngine();layout.append(trace.events)
 const projector=createSceneProjector(trace),graph=seek(trace,trace.events.length).executionGraph!,catalog=createFlowCatalog();catalog.extend(graph,trace)
 const context={sessionEnded:false,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL' as const,reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}}
 for(const cursor of [trace.events.length,0,Math.floor(trace.events.length/2),trace.events.length-1,1,trace.events.length]){
  const scene=projector.project(seek(trace,cursor),layout.state,context),fresh=createFlowCatalog();fresh.extend(graph,trace)
  const expected=fresh.prefix(cursor,scene)
  expect([...catalog.iteratePrefix(cursor,scene)]).toEqual(expected)
  const eager=catalog.prefix(cursor,scene);expect(Object.isFrozen(eager)).toBe(true)
  expect([...catalog.iteratePrefix(cursor,scene)]).toEqual(eager);expect(catalog.prefix(cursor,scene)).toBe(eager)
  expect(eager.every(flow=>flow.evidenceSeqs.every(seq=>seq<cursor))).toBe(true)
 }
})
it('captures an iterator boundary before delayed consumption and graph append, despite interleaved rewind queries',()=>{
 const trace=recording(),layout=createLayoutEngine();layout.append(trace.events)
 const graph=seek(trace,trace.events.length).executionGraph!,supported=new Set(['ARGUMENT_BIND','RECEIVER_BIND','ASSIGN','FIELD_WRITE','STATIC_WRITE','FIELD_READ','STATIC_READ','REFERENCE_BIND','ARRAY_READ','ARRAY_WRITE','RETURN','INPUT_CONSUME','OUTPUT','THROW','UNWIND','CATCH'])
 const first=graph.edges.findIndex(edge=>supported.has(edge.kind));expect(first).toBeGreaterThanOrEqual(0)
 const catalog=createFlowCatalog();catalog.extend({...graph,edges:graph.edges.slice(0,first+1)},trace)
 const projector=createSceneProjector(trace),context={sessionEnded:false,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL' as const,reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}}
 const scene=projector.project(seek(trace,trace.events.length),layout.state,context),oracle=createFlowCatalog();oracle.extend({...graph,edges:graph.edges.slice(0,first+1)},trace)
 const expected=oracle.prefix(scene.cursor,scene)
 expect(expected).toHaveLength(1)
 const delayed=catalog.iteratePrefix(scene.cursor,scene),active=catalog.iteratePrefix(scene.cursor,scene)[Symbol.iterator](),initial=active.next();expect(initial.done).toBe(false)
 const empty=projector.project(seek(trace,0),layout.state,context)
 expect(catalog.query({cursor:0,scene:empty,priority:{selectedIds:new Set(),focusedIds:new Set(),currentIds:new Set()},limit:5})).toEqual([])
 catalog.extend(graph,trace)
 expect([...delayed]).toEqual(expected);expect([initial.value,...Array.from({[Symbol.iterator]:()=>active})]).toEqual(expected)
 const fresh=createFlowCatalog();fresh.extend(graph,trace)
 const current=[...catalog.iteratePrefix(scene.cursor,scene)];expect(current.length).toBeGreaterThan(expected.length);expect(current).toEqual(fresh.prefix(scene.cursor,scene))
})

it('reuses semantic endpoint derivation for repeated planning and invalidates it across a different resolved prefix',()=>{
 const trace=recording(),layout=createLayoutEngine();layout.append(trace.events)
 const projector=createSceneProjector(trace),catalog=createFlowCatalog();catalog.extend(seek(trace,trace.events.length).executionGraph!,trace)
 const context={sessionEnded:false,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL' as const,reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}}
 const scene=projector.project(seek(trace,trace.events.length),layout.state,context),spy=vi.spyOn(transitions,'graphTransitionEndpoints')
 try{
  const first=[...catalog.iteratePrefix(scene.cursor,scene)];expect(first.length).toBeGreaterThan(0);expect(spy).toHaveBeenCalled()
  spy.mockClear();expect([...catalog.iteratePrefix(scene.cursor,scene)]).toEqual(first);expect(spy).not.toHaveBeenCalled()
  const cursor=Math.floor(trace.events.length/2),earlier=projector.project(seek(trace,cursor),layout.state,context)
  expect([...catalog.iteratePrefix(cursor,earlier)].length).toBeGreaterThan(0);expect(spy).toHaveBeenCalled()
  spy.mockClear();expect([...catalog.iteratePrefix(scene.cursor,scene)]).toEqual(first);expect(spy).toHaveBeenCalled()
 }finally{spy.mockRestore()}
})

it('resumes a streamed return after a rewind without adopting the other cursor’s endpoints',()=>{
 const trace=recording(),layout=createLayoutEngine();layout.append(trace.events)
 const projector=createSceneProjector(trace),graph=seek(trace,trace.events.length).executionGraph!
 const catalog=createFlowCatalog(),oracle=createFlowCatalog();catalog.extend(graph,trace);oracle.extend(graph,trace)
 const write=trace.events.find(event=>event.type==='EXECUTION_FACT'&&event.fact.kind==='write'&&event.fact.origin.kind==='call_result')!
 const context={sessionEnded:false,pausedAtLiveHead:false,liveHead:trace.events.length,recording:{state:'FULL' as const,reason:null,budget:null,lastRecordedSeq:null,executionContinued:false}}
 const before=projector.project(seek(trace,write.seq),layout.state,context),after=projector.project(seek(trace,write.seq+1),layout.state,context)
 const expected=oracle.prefix(after.cursor,after),returned=expected.findIndex(flow=>flow.kind==='return')
 expect(returned).toBeGreaterThan(0);expect(expected[returned].to?.kind).toBe('slot')
 const active=catalog.iteratePrefix(after.cursor,after)[Symbol.iterator](),first=active.next()
 expect(first.value).toEqual(expected[0])
 const rewound=[...catalog.iteratePrefix(before.cursor,before)]
 expect(rewound.find(flow=>flow.kind==='return')?.to).toBeNull()
 expect([first.value,...Array.from({[Symbol.iterator]:()=>active})]).toEqual(expected)
})
