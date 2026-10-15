import {expect,it} from 'vitest'
import type {RawRuntimeEvent} from '../instrumentation/contracts'
import {normalizeTrace} from '../instrumentation/normalize'
import {seek} from '../runtime'
import {createLayoutEngine} from './layoutEngine'
import {createSceneProjector} from './sceneProjector'
import {createFlowCatalog} from './flowCatalog'
import {planPresentation} from './presentationPlanner'
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
 expect(plan.curves.filter(curve=>curve.kind==='return').map(curve=>curve.id)).toEqual([sourceEdge.id])
 expect(plan.headings.filter(heading=>heading.id==='RETURNS')).toHaveLength(1)
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
