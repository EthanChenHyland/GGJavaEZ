import {expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import type {RuntimeState} from '../contracts/runtime'
import type {SceneFrame} from '../contracts/world'
import type {ExecutionGraph,GraphInvocation} from '../contracts/executionGraph'
import {loadPersonTrace,loadRecursionTrace} from '../examples/traces'
import {seek} from '../runtime'
import {projectTrace} from '../testing/projectTrace'
import {valueText} from '../world/valueText'
import {invocationInspection} from './invocationInspection'
import {InspectorInvocationFacts} from './InspectorInvocationFacts'
const person=loadPersonTrace(),projection=projectTrace(person)
it('exposes only the selected invocation\'s captured return expression across forward and reverse prefixes',()=>{
 const trace=loadRecursionTrace(),world=projectTrace(trace)
 for(const cursor of[19,25,26,27,36,25,26,19]){
  const runtime=seek(trace,cursor),scene=world.project(cursor),node=scene.entities['frame:factorial:3']
  if(node.kind!=='frame')throw new Error('Missing captured invocation')
  const before=JSON.stringify(runtime),expected=cursor>=26?'3 × 2':null
  expect(invocationInspection(runtime,scene,node).returnExpression).toBe(expected)
  const html=renderToStaticMarkup(<InspectorInvocationFacts runtime={runtime} scene={scene} node={node}/>)
  expect(html.includes('Recorded return expression:')).toBe(expected!==null)
  if(expected!==null)expect(html).toContain(expected)
  const noExpression={...runtime,returns:runtime.returns.map(({expression,...transfer})=>{void expression;return transfer})}
  expect(invocationInspection(noExpression,scene,node).returnExpression).toBeNull()
  expect(JSON.stringify(runtime)).toBe(before)
 }
})
function frameAt(cursor:number,id='frame:person-setAge:1'){
 const runtime=seek(person,cursor),scene=projection.project(cursor),node=scene.entities[id]
 if(node?.kind!=='frame')throw new Error('Expected explicit captured frame')
 return{runtime,scene,node}
}
function graphFor(id:string,invocation:Partial<GraphInvocation>={}):ExecutionGraph{
 return{invocations:{[id]:{id,method:{owner:'Unit',name:'work',descriptor:'()I'},callerInvocationId:null,parameterIds:[],status:'active',enteredAt:'unit/enter',...invocation}},calls:{},values:{},storage:{},objects:{},io:{},edges:[],incoming:{},outgoing:{},results:{},reads:{}}
}
it('shows captured caller signature/identity and receiver without changing any Person prefix',()=>{
 for(const cursor of[16,17,18,19,18,17,16]){
  const {runtime,scene,node}=frameAt(cursor),before=JSON.stringify(runtime),facts=invocationInspection(runtime,scene,node)
  expect(facts.callerKind).toBe('Caller');expect(facts.callerId).toBe('frame:main:1');expect(facts.callerTitle).toContain('Main.main(');expect(facts.callerTitle).toContain('#1')
  expect(facts.receiver?.exact).toBe('Person #17');expect(facts.receiver?.observation).toBe('OBSERVED');expect(facts.receiverId).toBe('object:person:17')
  const html=renderToStaticMarkup(<InspectorInvocationFacts runtime={runtime} scene={scene} node={node}/>);expect(html).toContain('Recorded invocation details');expect(html).toContain('Receiver:')
  expect(JSON.stringify(runtime)).toBe(before)
 }
})
it('keeps absent caller and receiver unavailable rather than inferring static main from its name',()=>{
 const {runtime,scene,node}=frameAt(2,'frame:main:1'),facts=invocationInspection(runtime,scene,node)
 expect(facts).toMatchObject({callerId:null,callerTitle:null,receiver:null,receiverState:'unavailable',returnState:'pending'})
 expect(renderToStaticMarkup(<InspectorInvocationFacts runtime={runtime} scene={scene} node={node}/>)).toContain('No caller recorded')
})
it('never calls an observed ancestor a direct caller across opaque code',()=>{
 const {runtime,scene,node}=frameAt(18),executionGraph=graphFor(node.id,{observedAncestorInvocationId:'frame:main:1'})
 const facts=invocationInspection({...runtime,executionGraph},scene,node)
 expect(facts.callerKind).toBe('Observed ancestor');expect(facts.callerTitle).toContain('Main.main(')
 const absent=invocationInspection({...runtime,executionGraph:graphFor(node.id,{callerInvocationId:'opaque caller not captured'})},scene,node)
 expect(absent.callerId).toBe('opaque caller not captured');expect(absent.callerTitle).toBeNull()
})
it('uses captured static-call evidence for no receiver and preserves unavailable constructor receivers',()=>{
 const {runtime,scene,node}=frameAt(18),frame=runtime.frames[node.id],executionGraph=graphFor(node.id,{callId:'unit/static'})
 executionGraph.calls['unit/static']={id:'unit/static',callerInvocationId:null,declared:executionGraph.invocations[node.id].method,invokeKind:'static',context:{owner:'Unit',name:'work',descriptor:'()I',frameId:null,site:0,rawSeq:0,source:null},argumentValueIds:[],argumentOriginSlotIds:[],calleeInvocationId:node.id,status:'pending'}
 const withoutReceiver:RuntimeState={...runtime,executionGraph,frames:{...runtime.frames,[node.id]:{...frame,locals:{}}}}
 expect(invocationInspection(withoutReceiver,scene,node).receiverState).toBe('none')
 const slot=Object.values(frame.locals).find(slot=>slot.name==='this')!
 const unavailable:RuntimeState={...runtime,frames:{...runtime.frames,[node.id]:{...frame,locals:{[slot.id]:{...slot,value:{kind:'unavailable',reason:'constructor receiver not initialized'}}}}}}
 expect(invocationInspection(unavailable,scene,node).receiver).toMatchObject({observation:'UNAVAILABLE',reason:'constructor receiver not initialized'})
})
it('retains graph-only receiver identity and discloses missing receiver type without inventing Object',()=>{
 const {runtime,scene,node}=frameAt(18),frame=runtime.frames[node.id],base={...runtime,frames:{...runtime.frames,[node.id]:{...frame,locals:{}}}}
 const found=invocationInspection({...base,executionGraph:graphFor(node.id,{receiverObjectId:'object:person:17'})},scene,node)
 expect(found.receiver?.exact).toBe('Person #17')
 const missing=invocationInspection({...base,executionGraph:graphFor(node.id,{receiverObjectId:'opaque receiver'})},scene,node)
 expect(missing.receiver).toBeNull();expect(missing.receiverId).toBe('opaque receiver');expect(missing.receiverState).toBe('unavailable')
})
it('shows every captured recursive return at each forward and reverse prefix, including consumed returns',()=>{
 const trace=loadRecursionTrace(),world=projectTrace(trace)
 let seen=0
 for(const cursor of[...Array.from({length:trace.events.length+1},(_,i)=>i),...Array.from({length:trace.events.length+1},(_,i)=>trace.events.length-i)]){
  const runtime=seek(trace,cursor),scene=world.project(cursor)
  for(const frame of Object.values(runtime.frames)){
   const node=scene.entities[frame.id];if(node?.kind!=='frame'||frame.returnValue===undefined)continue
   expect(invocationInspection(runtime,scene,node).returnValue).toEqual(valueText(frame.returnValue,{context:'exact',objects:runtime.objects}));seen++
  }
 }
 expect(seen).toBeGreaterThan(0)
})
it('distinguishes void, missing and exact graph return values with observed metadata',()=>{
 const {runtime,scene,node}=frameAt(20),frame=runtime.frames[node.id]
 expect(invocationInspection(runtime,scene,node).returnState).toBe('unavailable')
 const voidState={...runtime,frames:{...runtime.frames,[node.id]:{...frame,returnType:'void'}}}
 expect(invocationInspection(voidState,scene,node).returnState).toBe('void')
 const graph=graphFor(node.id,{method:{owner:'Unit',name:'work',descriptor:'()V'}})
 expect(invocationInspection({...runtime,executionGraph:graph},scene,node).returnState).toBe('void')
 const value={kind:'primitive' as const,javaType:'long' as const,value:'9223372036854775807'},returned=graphFor(node.id,{returnValueId:'unit/result'})
 returned.values['unit/result']={id:'unit/result',kind:'return',value,eventId:'unit/return',context:{owner:'Unit',name:'work',descriptor:'()J',frameId:node.id,site:0,rawSeq:0,source:null}}
 expect(invocationInspection({...runtime,executionGraph:returned},scene,node).returnValue?.exact).toBe(value.value)
 const unknown:SceneFrame={...node,status:{kind:'returned',value:null}}
 const unavailable={...runtime,frames:{...runtime.frames,[node.id]:{...frame,returnValue:{kind:'unavailable' as const,reason:'return capture ended'}}}}
 const facts=invocationInspection(unavailable,scene,unknown);expect(facts.returnValue).toMatchObject({observation:'UNAVAILABLE',reason:'return capture ended'});expect(facts.returnState).toBe('captured')
})
