import {useMemo} from 'react'
import type {ArrayMutation,ArrayValueOrigin,RuntimeState,RuntimeValue} from '../contracts/runtime'
import {valueText} from '../world/valueText'

/** Last captured write for this physical index (or the selected array). Only
 * applied-prefix history is searched; no layout, source or future trace scan. */
export function arrayWriteSummary(writes:readonly ArrayMutation[],objectId:string,index:number|null):{count:number;write:ArrayMutation|null}{
 let count=0,latest:ArrayMutation|null=null
 for(let cursor=writes.length-1;cursor>=0;cursor--){
  const write=writes[cursor]
  if(write.objectId!==objectId)continue
  count++
  if(!latest&&(index===null||write.index===index))latest=write
 }
 return{count,write:latest}
}
export function capturedSlotName(runtime:RuntimeState,slotId:string,frameId?:string):string|null{
 const frames=frameId?[frameId]:runtime.activeFrameIds
 for(const id of frames){const slot=runtime.frames[id]?.locals[slotId];if(slot)return slot.name}
 for(let index=runtime.variableLifetimes.length-1;index>=0;index--){
  const lifetime=runtime.variableLifetimes[index]
  if(lifetime.slot.id===slotId&&(!frameId||lifetime.frameId===frameId))return lifetime.slot.name
 }
 return null
}
function originLabel(runtime:RuntimeState,origin:ArrayValueOrigin):string{
 if(origin.kind==='element')return `[${origin.index}]`
 return capturedSlotName(runtime,origin.slotId,origin.frameId)??'Captured storage (name not recorded)'
}
function CapturedValue({runtime,value}:{runtime:RuntimeState;value:RuntimeValue}){
 const captured=valueText(value,{context:'exact',objects:runtime.objects})
 return <span title={`${captured.observation}${captured.reason?` · ${captured.reason}`:''}`}>{captured.exact}{captured.reason&&<small> · {captured.reason}</small>}{captured.recordedLength!==undefined&&<small> · Recorded length: {captured.recordedLength}</small>}</span>
}
function WriteFact({runtime,write}:{runtime:RuntimeState;write:ArrayMutation}){
 return <><p>{write.from?`${originLabel(runtime,write.from)} → [${write.index}]`:`Write [${write.index}] · source storage not recorded here`}</p><p><CapturedValue runtime={runtime} value={write.before}/> → <CapturedValue runtime={runtime} value={write.after}/></p>{write.from?.kind==='slot'&&<small className="gg-inspector-id">Source storage: {write.from.frameId} · {write.from.slotId}</small>}<small className="gg-inspector-id">{write.eventId}</small></>
}
/** These are captured array facts, not invented ExecutionGraph edges. The
 * World still routes only proven graph flows through present semantic ports. */
export function InspectorArrayFacts({runtime,objectId,index=null}:{runtime:RuntimeState;objectId:string;index?:number|null}){
 const activity=runtime.arrayActivity?.objectId===objectId?runtime.arrayActivity:null
 const {count,write}=useMemo(()=>arrayWriteSummary(runtime.arrayMutations,objectId,index),[runtime.arrayMutations,objectId,index])
 if(!activity&&!count)return null
 return <section className="gg-inspector-control" aria-label="Recorded array operations">
  {count>0&&<strong>Array history · {count} captured indexed writes</strong>}
  {activity&&<div className="gg-inspector-condition"><strong>Current captured {activity.kind}</strong>
   {activity.kind==='compare'?<><p>Left [{activity.indices[0]}]: <CapturedValue runtime={runtime} value={activity.values[0]}/></p><p>Right [{activity.indices[1]}]: <CapturedValue runtime={runtime} value={activity.values[1]}/></p><p>Operator {activity.operator} · Result {String(activity.result)}</p></>:activity.kind==='read'?<><p>Read [{activity.index}] = <CapturedValue runtime={runtime} value={activity.value}/></p><p>{activity.destinationSlotId?`Destination: ${capturedSlotName(runtime,activity.destinationSlotId)??'captured storage (name not recorded)'}`:'Destination not recorded'}</p></>:<WriteFact runtime={runtime} write={activity}/>}
   {activity.kind==='read'&&activity.destinationSlotId&&<small className="gg-inspector-id">Destination storage: {activity.destinationSlotId}</small>}
   {activity.kind!=='write'&&<small className="gg-inspector-id">{activity.eventId}</small>}
  </div>}
  {write&&(activity?.kind!=='write'||activity.eventId!==write.eventId)&&<div className="gg-inspector-condition"><strong>Last captured write{index===null?'':` to [${index}]`}</strong><WriteFact runtime={runtime} write={write}/></div>}
 </section>
}
