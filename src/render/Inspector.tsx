import { useEffect, useMemo, useState } from 'react'
import { Crosshair, Copy, X, CornerUpLeft } from 'lucide-react'
import type { Selection } from '../contracts/interaction'
import type { RuntimeState } from '../contracts/runtime'
import type { PresentationPlan, SceneModel } from '../contracts/worldV2'
import type { FlowCatalog } from '../world/flowCatalog'
import { frameStatusText } from '../world/frameStatus'
import { inspectorEntity, inspectorRetiredLocal, inspectorProvenance, inspectorRows, type InspectorRow } from './inspection'
import { VirtualList } from '../shell/VirtualList'
import { arrayCellTarget } from '../world/arrayCellTarget'
import { canFocusWorldSelection } from '../interaction/focusTarget'
import {historicalSceneReference} from '../world/historicalReference'
import {InspectorControlFacts} from './InspectorControlFacts'
import './inspector.css'
export function Inspector({selection,scene,runtime,flows,plan,onClose,onFocus,onReturn,onSelectRow,onSelectEntity}:{
 selection:Selection;scene:SceneModel;runtime:RuntimeState;flows?:FlowCatalog;plan:PresentationPlan
 onClose():void;onFocus():void;onReturn():void;onSelectRow(slotId:string):void;onSelectEntity(selection:NonNullable<Selection>):void
}) {
 const [expanded,setExpanded]=useState<InspectorRow|null>(null),[copyMessage,setCopyMessage]=useState('');
 const [historyOpen,setHistoryOpen]=useState(false)
 const [flowsOpen,setFlowsOpen]=useState(false)
 const node=useMemo(()=>inspectorEntity(scene,selection),[scene,selection])
 const retired=useMemo(()=>node?null:inspectorRetiredLocal(runtime,selection),[node,runtime,selection])
 const rows=useMemo(()=>node?inspectorRows(node):retired?{count:1,at:()=>retired.row}:null,[node,retired])
 const flow=useMemo(()=>selection?.kind==='flow'?runtime.executionGraph?.edges.find(edge=>edge.id===selection.id):undefined,[selection,runtime.executionGraph])
 const provenance=useMemo(()=>inspectorProvenance(flows,selection,node,scene.cursor,flow),[flows,selection,node,scene.cursor,flow])
 const flowEvidence=flow?provenance.find(item=>item.edgeId===flow.id):undefined
 const referenceMap=useMemo(()=>new Map([...scene.references,...scene.historicalBindings.map(historicalSceneReference)].map(ref=>[ref.id,ref])),[scene.references,scene.historicalBindings])
 useEffect(()=>{setExpanded(null);setCopyMessage('')},[selection?.id])
 useEffect(()=>{setExpanded(null);setCopyMessage('')},[scene.cursor])
 if(!selection)return null
 const reference=selection.kind==='reference'?referenceMap.get(selection.id):null
 const historicalBinding=selection.kind==='reference'?scene.historicalBindings.find(item=>item.id===selection.id):null
 const cluster=selection.kind==='cluster'?plan.clusters.find(item=>item.id===selection.id):null
 const bundle=selection.kind==='bundle'?plan.bundles.find(item=>item.id===selection.id):undefined
 const canFocus=canFocusWorldSelection(scene,plan,selection),unavailableReference=reference?(historicalBinding?plan.historicalReferencePresentation:plan.referencePresentation).unavailable.find(item=>item.id===reference.id):undefined
 const bundleReferences=(bundle?.referenceIds??[]).flatMap(id=>referenceMap.has(id)?[referenceMap.get(id)!]:[])
 const title=flow?flow.kind:cluster?`Cluster · ${cluster.label} ×${cluster.members}`:bundle?`${bundle.count} ${bundle.kind==='connector'?'current references':bundle.kind==='binding-history'?'historical bindings':'recorded flows'}`:node?node.kind==='frame'?`${node.title} #${node.invocationNumber}`:node.kind==='class'?node.title:`${node.title} #${node.displayId}`:retired?retired.row.name:selection.kind==='cluster'?'Cluster':selection.kind==='bundle'?'Bundle is not in the current presentation':selection.id
 const status=node?.kind==='frame'?frameStatusText(node.status):node?.kind==='array'?`length ${node.length} · ${node.cells.length} cells captured`:node?.kind==='collection'?`size ${node.size} · ${node.recordedEntries} entries captured · ${node.size-node.recordedEntries} not recorded`:node?.kind==='object'?`${node.fieldCount} fields`:node?.kind==='class'?`static · ${node.initialization}`:retired?'Scope closed · last captured local value':flow?'Recorded graph edge':cluster?`Structural summary · ${cluster.members} recorded entities`:bundle?'Structural summary':selection.kind==='cluster'?'Cluster is not in the current presentation':'Not present at this point in time'
 const source=node?.kind==='frame'?node.sourceLine:node?.kind==='object'?node.allocationSite:retired?.lifetime.source??flow?.context.source
 const copy=(text:string)=>void navigator.clipboard.writeText(text).then(()=>setCopyMessage('Captured text copied'),()=>setCopyMessage('Clipboard access unavailable'))
 const selectedCell=arrayCellTarget(scene,selection.kind==='slot'?selection.id:null)
 const inbound=node?scene.references.filter(item=>item.targetId===node.id):[]
 return <aside className="inspector glass gg-inspector" aria-label="Selection inspector" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose()}}}>
  <div className="inspector-heading"><strong className={cluster?'inspector-cluster-title':undefined} title={title}>{cluster?<><span>Cluster · {cluster.label}</span><span> ×{cluster.members}</span></>:title}</strong><button aria-label="Close inspector" title="Close inspector" onClick={onClose}><X size={16}/></button></div>
  <p>{status}</p>
  <div className="inspector-actions"><button aria-label="Focus selection" title={canFocus?'Focus selection':'Select a present runtime entity or cluster to Focus'} aria-disabled={!canFocus} onClick={()=>{if(canFocus)onFocus()}}><Crosshair size={14}/>Focus</button><button onClick={onReturn}><CornerUpLeft size={14}/>Return to World</button><button onClick={()=>copy(title)}><Copy size={14}/>Copy</button></div>
  {reference&&<p className="gg-inspector-id">Recorded reference · {reference.sourceSlotId} → {reference.targetId}</p>}
  {historicalBinding&&<p className="gg-inspector-id">Historical binding · introduced at Event {historicalBinding.introducedSeq} · {historicalBinding.endKind} at Event {historicalBinding.endSeq}</p>}
  {unavailableReference&&<p>{unavailableReference.reason}</p>}
  {flow&&<details open><summary>Recorded flow</summary><p className="gg-inspector-id">{flow.from} → {flow.to}</p><p>{flow.evidence}{flowEvidence&&` · Event ${flowEvidence.evidence.introducedSeq}`} · {flow.eventId}</p>{!plan.curves.some(curve=>curve.id===flow.id)&&<p>Recorded evidence has no presented semantic ports at this point in time.</p>}</details>}
  {bundle&&<><p className="gg-inspector-id">{bundle.from} → {bundle.to}</p><p>This line groups recorded {bundle.kind==='flow'?'flows':bundle.kind==='binding-history'?'historical bindings':'references'} between these bodies or clusters.</p></>}
  {bundle&&bundle.kind!=='flow'&&<VirtualList key={bundle.id} className="inspector-values inspector-members" count={bundleReferences.length} rowHeight={76} label="Bundle references">{index=>{
    const ref=bundleReferences[index];return <button className="inspector-member inspector-reference-member" title={`${ref.sourceSlotId} → ${ref.targetId}`} aria-label={`Inspect recorded reference ${ref.id}`} onClick={()=>onSelectEntity({kind:'reference',id:ref.id})}><span>{ref.sourceSlotId}<small>→ {ref.targetId}</small><small>{ref.role}{ref.overlay?` · ${ref.overlay}`:''}</small></span></button>;
  }}</VirtualList>}
  {bundle?.kind==='flow'&&<VirtualList key={bundle.id} className="inspector-values inspector-members" count={bundle.flowIds.length} rowHeight={76} label="Bundle flows">{index=>{
   const id=bundle.flowIds[index];return <button className="inspector-member" aria-label={`Inspect recorded flow ${id}`} title={id} onClick={()=>onSelectEntity({kind:'flow',id})}><span>{id}<small>Recorded graph edge</small></span></button>
  }}</VirtualList>}
  {source&&<p className="gg-inspector-source">{source.fileId}:{source.line}</p>}
  {node&&'ownership'in node&&<p>{node.ownership} · stable identity <span className="gg-inspector-id">{node.id}</span></p>}
  {retired&&<p className="gg-inspector-id">Recorded lifetime · declared at {retired.lifetime.declaredAt} · last captured at {retired.lifetime.lastChangedAt} · closed at {retired.lifetime.exitedAt}</p>}
  {selection.kind==='slot'&&<p className="gg-inspector-id">Selected storage lifetime: {selection.id}</p>}
  {(node?.kind==='frame'||retired)&&<InspectorControlFacts runtime={runtime} frameId={node?.kind==='frame'?node.id:retired!.lifetime.frameId}/>}
  {cluster&&<VirtualList key={cluster.id} className="inspector-values inspector-members" count={cluster.memberIds.length} rowHeight={52} label="Cluster members">{index=>{
    const member=scene.entities[cluster.memberIds[index]],kind=member.kind==='frame'?'frame':member.kind==='class'?'class':'object';
    const label=member.kind==='frame'?`${member.title} #${member.invocationNumber}`:member.kind==='class'?`${member.title} static state`:`${member.title} #${member.displayId}`;
    return <button className="inspector-member" title={member.id} aria-label={`Select ${label}`} onClick={()=>onSelectEntity({kind,id:member.id})}><span>{label}<small>{member.kind} · {member.id}</small></span></button>;
  }}</VirtualList>}
  {!cluster&&!bundle&&<VirtualList key={selection.id} className="inspector-values" count={rows?.count??0} rowHeight={52} label="Recorded values" initialIndex={selectedCell?.index??0}>{index=>{
    const row=rows!.at(index);return <div className="inspector-value"><span title={row.slotId}>{row.key?.exact??row.name}<small>{row.type}</small></span>{node?.kind==='array'&&<button aria-label={`Reveal index ${index}`} title={`Reveal the recorded identity of index ${index}`} onClick={()=>onSelectRow(row.slotId)}>↗</button>}{node?.kind==='frame'&&<button aria-label={`Select ${row.name} storage`} title={`Select recorded ${row.name} storage`} aria-pressed={selection.kind==='slot'&&selection.id===row.slotId} onClick={()=>onSelectRow(row.slotId)}>↗</button>}<button title={`${row.value.observation}${row.value.reason?` · ${row.value.reason}`:''} · Inspect captured value`} aria-label={`Inspect ${row.name}`} onClick={()=>setExpanded(row)}>{row.value.exact}</button></div>;
  }}</VirtualList>}
  {expanded&&<section className="gg-inspector-expanded" aria-label={`Captured ${expanded.name}`}><strong>{expanded.name} · {expanded.value.observation}</strong><pre>{expanded.value.exact}</pre>{expanded.value.recordedLength!==undefined&&<p>Recorded length: {expanded.value.recordedLength}</p>}{expanded.value.reason&&<p>{expanded.value.reason}</p>}<button onClick={()=>copy(expanded.value.exact)} aria-label={`Copy ${expanded.name}`}><Copy size={14}/>Copy captured value</button><button onClick={()=>setExpanded(null)}>Close detail</button></section>}
  {copyMessage&&<p role="status">{copyMessage}</p>}
  {node&&<details><summary>{inbound.length} inbound recorded references</summary><VirtualList count={inbound.length} rowHeight={52} label="Inbound references" className="gg-inspector-inbound">{index=><p className="gg-inspector-id">{inbound[index].sourceSlotId} → {inbound[index].targetId}</p>}</VirtualList></details>}
  {!cluster&&!bundle&&<details><summary>Recorded evidence · {provenance.length} graph records</summary>
   {node&&<><p>{node.evidence.kind} · applied prefix {runtime.cursor}</p><VirtualList count={node.evidence.eventIds.length} rowHeight={32} label="Event evidence" className="gg-inspector-events">{index=><p className="gg-inspector-id">{node.evidence.eventIds[index]}</p>}</VirtualList></>}
   {!runtime.executionGraph&&<p>This recording contains no execution graph. Captured runtime values remain available above.</p>}
   {runtime.executionGraph&&provenance.length===0&&!flow&&<p>No adjacent graph evidence was recorded for this selection at this prefix.</p>}
   <VirtualList count={provenance.length} rowHeight={76} label="Graph evidence" className="gg-inspector-provenance">{index=>{const item=provenance[index];return <div className="gg-inspector-record"><strong>{item.kind} · {item.graphEvidence}</strong><span title={`${item.from} → ${item.to}`}>{item.from} → {item.to}</span><small title={item.spatial.reason??''}>{item.evidence.introducedSeq} · {item.eventId} · {item.spatial.drawable?'spatial mapping available':'not drawable'}</small></div>}}</VirtualList>
  </details>}
  <details><summary>Current reference presentation · {plan.referencePresentation.counts.current} recorded</summary>
   <p>{plan.referencePresentation.counts.individual} individual · {plan.referencePresentation.counts.bundled} aggregated · {plan.referencePresentation.counts.internal} inside collapsed clusters · {plan.referencePresentation.counts.unavailable} unavailable · {plan.referencePresentation.counts.scopeExcluded} excluded by Trace scope</p>
   <VirtualList count={plan.referencePresentation.unavailable.length} rowHeight={76} label="Unavailable reference geometry" className="gg-inspector-provenance">{index=>{const item=plan.referencePresentation.unavailable[index],ref=referenceMap.get(item.id);return <div className="gg-inspector-record"><strong title={item.id}>{item.id}</strong><span title={ref?`${ref.sourceSlotId} → ${ref.targetId}`:item.id}>{ref?`${ref.sourceSlotId} → ${ref.targetId}`:item.id}</span><small title={item.reason}>{item.reason}</small></div>}}</VirtualList>
  </details>
  <details open={historyOpen} onToggle={event=>setHistoryOpen(event.currentTarget.open)}><summary>Historical bindings · {plan.historicalReferencePresentation.counts.recorded} recorded</summary>
   {historyOpen&&<><p>{plan.historicalReferencePresentation.counts.individual} individual · {plan.historicalReferencePresentation.counts.bundled} aggregated · {plan.historicalReferencePresentation.counts.internal} inside collapsed clusters · {plan.historicalReferencePresentation.counts.unavailable} unavailable · {plan.historicalReferencePresentation.counts.scopeExcluded} excluded by Trace scope · {plan.historicalReferencePresentation.counts.lifetimeExcluded} retired or unavailable endings</p>
   <VirtualList count={scene.historicalBindings.length} rowHeight={76} label="Historical bindings" className="gg-inspector-provenance">{index=>{const binding=scene.historicalBindings[index];return <button className="inspector-member inspector-reference-member" aria-label={`Inspect historical binding ${binding.id}`} title={`${binding.sourceSlotId} → ${binding.targetId}`} onClick={()=>onSelectEntity({kind:'reference',id:binding.id})}><span>{binding.sourceSlotId}<small>→ {binding.targetId}</small><small>Event {binding.introducedSeq} → {binding.endSeq} · {binding.endKind}</small></span></button>}}</VirtualList></>}
  </details>
  <details open={flowsOpen} onToggle={event=>setFlowsOpen(event.currentTarget.open)}><summary>Flow presentation · {plan.flowPresentation.counts.recorded} supported records</summary>
   {flowsOpen&&<><p>{plan.flowPresentation.counts.individual} individual · {plan.flowPresentation.counts.bundled} aggregated · {plan.flowPresentation.counts.unavailable} unavailable · {plan.flowPresentation.counts.scopeExcluded} outside the current scope or context budget</p>
   <VirtualList count={plan.flowPresentation.unavailable.length} rowHeight={76} label="Unavailable flow ports" className="gg-inspector-provenance">{index=>{const item=plan.flowPresentation.unavailable[index];return <button className="inspector-member" aria-label={`Inspect unavailable flow ${item.id}`} onClick={()=>onSelectEntity({kind:'flow',id:item.id})}><span>{item.id}<small>{item.reason}</small></span></button>}}</VirtualList></>}
  </details>
 </aside>
}
