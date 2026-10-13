import {expect,it} from 'vitest'
import type {RawRuntimeEvent} from '../instrumentation/contracts'
import {normalizeTrace} from '../instrumentation/normalize'
import {seek} from '../runtime'
import {createLayoutEngine} from './layoutEngine'
import {createSceneProjector} from './sceneProjector'
import {createFlowCatalog} from './flowCatalog'
function recording(){
 const base={v:1,provenanceVersion:1,coverageVersion:1,threadId:'1',frameId:'main',className:'sample.Main',methodName:'main',descriptor:'()V',line:1,site:0} as const,int=(value:number)=>({kind:'int',value} as const)
 const events:RawRuntimeEvent[]=[
  {...base,type:'enter',seq:0,callerFrameId:null,receiver:null,parameters:[]},
  {...base,type:'local',seq:1,slot:2,name:'answer',descriptor:'I',liveRange:'2:0:999',value:int(1),origin:{kind:'constant',value:int(1)}},
  {...base,type:'call',seq:2,site:7,callId:'call',invokeKind:'static',owner:'sample.Worker',name:'value',callDescriptor:'()I',receiver:null,arguments:[],argumentOrigins:[],receiverOrigin:{kind:'unknown'}},
  {...base,type:'enter',seq:3,frameId:'child',className:'sample.Worker',methodName:'value',descriptor:'()I',callerFrameId:'main',callId:'call',receiver:null,parameters:[]},
  {...base,type:'return',seq:4,frameId:'child',className:'sample.Worker',methodName:'value',descriptor:'()I',value:int(7),origin:{kind:'constant',value:int(7)}},
  {...base,type:'exit',seq:5,frameId:'child',className:'sample.Worker',methodName:'value',descriptor:'()I'},
  {...base,type:'call_return',seq:6,site:7,callId:'call',value:int(7)},
  {...base,type:'local',seq:7,site:8,slot:2,name:'answer',descriptor:'I',liveRange:'2:0:999',value:int(7),origin:{kind:'call_result',site:7}},
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
 const returned=query(write.seq+1).filter(flow=>flow.kind==='return')
 expect(returned).toHaveLength(1);expect(returned[0].from).toEqual({kind:'frame',id:'jvm:frame:child'});expect(returned[0].to).toEqual({kind:'slot',id:'jvm:frame:main:local:2:2:0:999'})
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
