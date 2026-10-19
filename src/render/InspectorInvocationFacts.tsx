import type {RuntimeState} from '../contracts/runtime'
import type {SceneFrame,SceneModel,ValueText} from '../contracts/worldV2'
import {invocationInspection} from './invocationInspection'
function Exact({value}:{value:ValueText}){
 return <span>{value.exact}<small> · {value.observation}</small>{value.reason&&<small> · {value.reason}</small>}{value.recordedLength!==undefined&&<small> · Recorded length: {value.recordedLength}</small>}</span>
}
export function InspectorInvocationFacts({runtime,scene,node}:{runtime:RuntimeState;scene:SceneModel;node:SceneFrame}){
 const facts=invocationInspection(runtime,scene,node)
 return <section className="gg-inspector-control" aria-label="Recorded invocation details">
  <p>{facts.callerKind}: {facts.callerTitle??(facts.callerId?`${facts.callerId} · not present at this point in time`:'No caller recorded')}</p>
  <p>Receiver: {facts.receiver?<Exact value={facts.receiver}/>:facts.receiverState==='none'?'No receiver · recorded static call':facts.receiverId?`${facts.receiverId} · type not recorded`:'Not recorded'}</p>
  {facts.returnState!=='pending'&&<p>Return: {facts.returnValue?<Exact value={facts.returnValue}/>:facts.returnState==='void'?'void':'Value not recorded'}</p>}
 </section>
}
