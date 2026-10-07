import { describe, expect, it, vi } from 'vitest'
import type { ExecutionSite, GraphEdge } from '../contracts/executionGraph'
import type { RuntimeState, TraceDocument, TraceEvent } from '../contracts/runtime'
import { emptyExecutionGraph } from '../runtime/executionGraph'
import { createInitialState } from '../runtime/state'
import { historyForTrace } from '../runtime/history'
import { recentFlowTransitions } from './semanticTransition'

const context: ExecutionSite = { owner:'Probe', name:'main', descriptor:'()V', frameId:'frame',site:0,rawSeq:0,source:null }
const value={kind:'primitive' as const,javaType:'int' as const,value:7}
function fixture(): {state:RuntimeState;trace:TraceDocument} {
  const state=createInitialState(),graph=emptyExecutionGraph()
  state.frames.frame={id:'frame',className:'Probe',methodName:'main',callerFrameId:null,depth:0,status:'active',enteredAt:'enter',locals:{from:{id:'from',name:'from',javaType:'int',value},to:{id:'to',name:'to',javaType:'int',value}}}
  graph.storage.from={id:'from',kind:'variable',ownerId:'frame',name:'from',javaType:'int'}
  graph.storage.to={id:'to',kind:'variable',ownerId:'frame',name:'to',javaType:'int'}
  const events:TraceEvent[]=Array.from({length:5000},(_,seq)=>({type:'LINE_EXECUTE',frameId:'frame',eventId:`trace:${seq}`,seq,label:'Observed',source:{fileId:'Probe.java',line:1},importance:'normal'}))
  events[0]={...events[0],type:'PROGRAM_START'}
  events[1]={...events[1],type:'ENTER_METHOD',frameId:'frame',callerFrameId:null,className:'Probe',methodName:'main',locals:Object.values(state.frames.frame.locals)}
  const edge:GraphEdge={id:'actual-transfer',kind:'ASSIGN',from:'from',to:'to',eventId:'trace:3',evidence:'bytecode-derived',context}
  graph.edges=[edge];graph.incoming.to=[0];graph.outgoing.from=[0]
  state.executionGraph=graph;state.cursor=events.length
  return {state,trace:{schemaVersion:2,demoId:'query',sourceFiles:[{fileId:'Probe.java',name:'Probe.java',content:'class Probe {}'}],events}}
}
describe('bounded accepted-graph presentation queries',()=>{
  it('finds selected old actual transfers without materializing any historical state or reading the trace prefix',()=>{
    const {state,trace}=fixture(),history=historyForTrace(trace), materialize=vi.spyOn(history,'materialize')
    const actual=trace.events[3]
    trace.events=new Proxy(trace.events,{get(target,key){if(/^\d+$/.test(String(key))&&Number(key)!==3)throw new Error('Scanned semantic history');return Reflect.get(target,key)}})
    const flow=recentFlowTransitions(trace,state,new Set(['to']),6)
    expect(flow).toHaveLength(1);expect(flow[0]).toMatchObject({seq:actual.seq,from:{kind:'slot',id:'from'},to:{kind:'slot',id:'to'},evidence:'bytecode-derived'})
    expect(materialize).not.toHaveBeenCalled();materialize.mockRestore()
  })
  it('resolves real class statics and sparse cell storage while leaving the accepted graph unchanged',()=>{
    const {state,trace}=fixture(),graph=state.executionGraph!
    state.classes={registry:{id:'registry',className:'Probe',initialization:'observed',observedAt:'class',statics:{shared:{id:'shared',name:'shared',javaType:'int',value}}}}
    state.objects.array={id:'array',className:'int[]',displayId:1,allocatedAt:'allocate',fields:{},array:{elementType:'int',length:1000,elements:[],sparseElements:{999:{id:'array:element:999',name:'[999]',javaType:'int',value}}}}
    graph.storage.shared={id:'shared',kind:'static',ownerId:'registry',name:'shared',javaType:'int'}
    graph.storage['array:element:999']={id:'array:element:999',kind:'array-element',ownerId:'array',name:'[999]',javaType:'int'}
    graph.edges=[{...graph.edges[0],kind:'STATIC_WRITE',from:'array:element:999',to:'shared'}];graph.incoming.shared=[0]
    const before=JSON.stringify(state)
    expect(recentFlowTransitions(trace,state,new Set(['shared']))[0]).toMatchObject({kind:'field-write',from:{kind:'slot',id:'array:element:999'},to:{kind:'slot',id:'shared'}})
    expect(JSON.stringify(state)).toBe(before)
  })
  it('never borrows an equal-valued source for unknown evidence',()=>{
    const {state,trace}=fixture();state.executionGraph!.edges[0].evidence='unknown'
    expect(recentFlowTransitions(trace,state,new Set(['to']))).toEqual([])
  })
  it('limits legacy demo materialization to its historical window',()=>{
    const {trace,state}=fixture()
    delete state.executionGraph
    const history=historyForTrace(trace),materialize=vi.spyOn(history,'materialize').mockReturnValue(state)
    recentFlowTransitions(trace,state,new Set())
    expect(materialize.mock.calls).toHaveLength(256)
    expect(Math.min(...materialize.mock.calls.map(([cursor])=>cursor))).toBe(trace.events.length-128)
    materialize.mockRestore()
  })
})
