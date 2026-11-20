import {useMemo} from 'react'
import type {RuntimeState,ScalarValue} from '../contracts/runtime'
import {VirtualList} from '../shell/VirtualList'
import {valueText} from '../world/valueText'

const exact=(value:ScalarValue)=>valueText(value,{context:'exact'})
/** Applied-prefix facts belonging to this invocation. VM jump direction is
 * deliberately distinct from a captured Java expression's Boolean result. */
export function InspectorControlFacts({runtime,frameId}:{runtime:RuntimeState;frameId:string}){
 const loops=useMemo(()=>Object.values(runtime.loops).filter(loop=>loop.frameId===frameId),[runtime.loops,frameId])
 const scopes=useMemo(()=>Object.values(runtime.scopes).filter(scope=>scope.frameId===frameId).sort((a,b)=>a.depth-b.depth),[runtime.scopes,frameId])
 const condition=runtime.conditions[frameId],branch=runtime.branch?.frameId===frameId?runtime.branch:null
 if(!condition&&!branch&&!loops.length&&!scopes.length)return null
 return <section className="gg-inspector-control" aria-label="Recorded control flow">
  <strong>Recorded control flow · owning frame</strong>
  {condition&&<div className="gg-inspector-condition" data-condition-id={condition.conditionId}>
   <code>{condition.expression}</code>
   <strong>{`${exact(condition.operands[0].value).exact} ${condition.operator} ${exact(condition.operands[1].value).exact} → ${condition.result}`}</strong>
   {condition.operands.map((operand,index)=>{const value=exact(operand.value);return <p key={index} title={value.reason}>{operand.label}: {value.exact}</p>})}
   <p className="branch-path">{condition.takenLabel} · skipped: {condition.skippedLabel}</p>
  </div>}
  {loops.length>0&&<VirtualList key={`loops:${frameId}`} className="gg-inspector-control-list" count={loops.length} rowHeight={52} label="Recorded loops">{index=>{
   const loop=loops[index];return <div className="gg-inspector-control-row" data-loop-id={loop.loopId} data-loop-iteration={loop.iteration}><strong>{loop.status==='ended'?`Loop ended · ${loop.iteration} iterations`:`Iteration ${loop.iteration}`}</strong><small title={loop.loopId}>{loop.loopId}</small></div>
  }}</VirtualList>}
  {scopes.length>0&&<details><summary>Recorded scopes · {scopes.filter(scope=>scope.status==='active').length} active / {scopes.length} captured</summary>
   <VirtualList key={`scopes:${frameId}`} className="gg-inspector-control-list" count={scopes.length} rowHeight={52} label="Recorded scopes">{index=>{
    const scope=scopes[index];return <div className="gg-inspector-control-row" title={`${scope.id} · depth ${scope.depth}${scope.parentId?` · parent ${scope.parentId}`:''}`}><strong>{scope.label} · {scope.status}</strong><small>{scope.exitedAt?`Closed at ${scope.exitedAt}`:`Entered at ${scope.enteredAt}`}</small></div>
   }}</VirtualList>
  </details>}
  {branch&&<details><summary>Captured VM branch</summary>
   <p>Jump {branch.taken?'taken':'not taken'} · Java condition result unavailable</p>
   <p title={exact(branch.left).reason}>Left operand: {exact(branch.left).exact}</p>
   {branch.right===undefined?<p>No second operand recorded</p>:<p title={exact(branch.right).reason}>Right operand: {exact(branch.right).exact}</p>}
   <p className="gg-inspector-id">Opcode {branch.opcode} · site {branch.site} · {branch.eventId}</p>
  </details>}
 </section>
}
