import type {RuntimeState} from '../contracts/runtime'
import type {SceneModel,SceneReference} from '../contracts/worldV2'
import type {Selection} from '../contracts/interaction'
import {VirtualList} from '../shell/VirtualList'
import {referenceInspection} from './referenceInspection'
export function InspectorReferenceFact({runtime,scene,reference,historical=false}:{runtime:RuntimeState;scene:SceneModel;reference:SceneReference;historical?:boolean}){
 const fact=referenceInspection(runtime,scene,reference,historical)
 return <p>{fact.source} → {fact.holder} → {fact.target}</p>
}
export function InspectorReferences({runtime,scene,entityId,onSelect}:{runtime:RuntimeState;scene:SceneModel;entityId:string;onSelect(selection:NonNullable<Selection>):void}){
 const inbound=scene.references.filter(reference=>reference.targetId===entityId),outbound=scene.references.filter(reference=>reference.sourceId===entityId)
 return <>{([['inbound',inbound],['outbound',outbound]]as const).map(([direction,references])=><details key={direction}><summary>{references.length} {direction} recorded references</summary>
  <VirtualList count={references.length} rowHeight={76} label={`${direction==='inbound'?'Inbound':'Outbound'} references`} className="gg-inspector-inbound">{index=>{
   const reference=references[index],fact=referenceInspection(runtime,scene,reference)
   return <button className="inspector-member inspector-reference-member" aria-label={`Inspect reference from ${fact.source} ${fact.holder}`} title={`${reference.sourceSlotId} → ${reference.targetId}`} onClick={()=>onSelect({kind:'reference',id:reference.id})}><span>{fact.source}<small>{fact.holder} → {fact.target}</small></span></button>
  }}</VirtualList>
 </details>)}</>
}
