import { useEffect, useMemo, useState } from 'react'
import { Crosshair, Copy, X, CornerUpLeft } from 'lucide-react'
import type { Selection } from '../contracts/interaction'
import type { RuntimeState } from '../contracts/runtime'
import type { PresentationPlan, SceneModel } from '../contracts/worldV2'
import type { FlowCatalog } from '../world/flowCatalog'
import { frameStatusText } from '../world/frameStatus'
import { inspectorEntity, inspectorProvenance, inspectorRows, type InspectorRow } from './inspection'
import { VirtualList } from '../shell/VirtualList'
import { arrayCellTarget } from '../world/arrayCellTarget'
import './inspector.css'
export function Inspector({selection,scene,runtime,flows,plan,onClose,onFocus,onReturn,onSelectRow}:{
 selection:Selection;scene:SceneModel;runtime:RuntimeState;flows?:FlowCatalog;plan:PresentationPlan
 onClose():void;onFocus():void;onReturn():void;onSelectRow(slotId:string):void
}) {
 const [expanded,setExpanded]=useState<InspectorRow|null>(null),[copyMessage,setCopyMessage]=useState('');
 const node=useMemo(()=>inspectorEntity(scene,selection),[scene,selection])
 const rows=useMemo(()=>node?inspectorRows(node):null,[node])
 const flow=useMemo(()=>selection?.kind==='flow'?runtime.executionGraph?.edges.find(edge=>edge.id===selection.id):undefined,[selection,runtime.executionGraph])
 const provenance=useMemo(()=>inspectorProvenance(flows,selection,node,scene.cursor,flow),[flows,selection,node,scene.cursor,flow])
 useEffect(()=>{setExpanded(null);setCopyMessage('')},[selection?.id])
 useEffect(()=>{setExpanded(null);setCopyMessage('')},[scene.cursor])
 if(!selection)return null
 const reference=selection.kind==='reference'?scene.references.find(item=>item.id===selection.id):null
 const cluster=selection.kind==='cluster'?plan.clusters.find(item=>item.id===selection.id):null
 const bundle=plan.bundles.find(item=>item.id===selection.id)
 const title=flow?flow.kind:cluster?`${cluster.label} · ${cluster.members} recorded entities`:bundle?`${bundle.count} recorded flows`:node?node.kind==='frame'?`${node.title} #${node.invocationNumber}`:node.kind==='class'?node.title:`${node.title} #${node.displayId}`:selection.id
 const status=node?.kind==='frame'?frameStatusText(node.status):node?.kind==='array'?`length ${node.length} · ${node.cells.length} cells captured`:node?.kind==='collection'?`size ${node.size} · ${node.recordedEntries} entries captured · ${node.size-node.recordedEntries} not recorded`:node?.kind==='object'?`${node.fieldCount} fields`:node?.kind==='class'?`static · ${node.initialization}`:flow?'Recorded graph edge':cluster||bundle?'Structural summary':'Not present at this point in time'
 const source=node?.kind==='frame'?node.sourceLine:node?.kind==='object'?node.allocationSite:flow?.context.source
 const copy=(text:string)=>void navigator.clipboard.writeText(text).then(()=>setCopyMessage('Captured text copied'),()=>setCopyMessage('Clipboard access unavailable'))
 const selectedCell=arrayCellTarget(scene,selection.kind==='slot'?selection.id:null)
 const inbound=node?scene.references.filter(item=>item.targetId===node.id):[]
 return <aside className="inspector glass gg-inspector" aria-label="Selection inspector" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose()}}}>
  <div className="inspector-heading"><strong title={title}>{title}</strong><button aria-label="Close inspector" title="Close inspector" onClick={onClose}><X size={16}/></button></div>
  <p>{status}</p>
  <div className="inspector-actions"><button aria-label="Focus selection" title="Focus selection" aria-disabled={!node} onClick={()=>{if(node)onFocus()}}><Crosshair size={14}/>Focus</button><button onClick={onReturn}><CornerUpLeft size={14}/>Return to World</button><button onClick={()=>copy(title)}><Copy size={14}/>Copy</button></div>
  {reference&&<p className="gg-inspector-id">Recorded reference · {reference.sourceSlotId} → {reference.targetId}</p>}
  {flow&&<details open><summary>Recorded flow</summary><p className="gg-inspector-id">{flow.from} → {flow.to}</p><p>{flow.evidence} · {flow.eventId}</p>{!plan.curves.some(curve=>curve.id===flow.id)&&<p>Recorded evidence has no presented semantic ports at this point in time.</p>}</details>}
  {bundle&&<p className="gg-inspector-id">{bundle.from} → {bundle.to}</p>}
  {source&&<p className="gg-inspector-source">{source.fileId}:{source.line}</p>}
  {node&&'ownership'in node&&<p>{node.ownership} · stable identity <span className="gg-inspector-id">{node.id}</span></p>}
  {selection.kind==='slot'&&<p className="gg-inspector-id">Selected storage lifetime: {selection.id}</p>}
  <VirtualList key={selection.id} className="inspector-values" count={rows?.count??0} rowHeight={52} label="Recorded values" initialIndex={selectedCell?.index??0}>{index=>{
    const row=rows!.at(index);return <div className="inspector-value"><span title={row.slotId}>{row.key?.exact??row.name}<small>{row.type}</small></span>{node?.kind==='array'&&<button aria-label={`Reveal index ${index}`} title={`Reveal the recorded identity of index ${index}`} onClick={()=>onSelectRow(row.slotId)}>↗</button>}<button title={`${row.value.observation}${row.value.reason?` · ${row.value.reason}`:''} · Inspect captured value`} aria-label={`Inspect ${row.name}`} onClick={()=>setExpanded(row)}>{row.value.exact}</button></div>;
  }}</VirtualList>
  {expanded&&<section className="gg-inspector-expanded" aria-label={`Captured ${expanded.name}`}><strong>{expanded.name} · {expanded.value.observation}</strong><pre>{expanded.value.exact}</pre>{expanded.value.recordedLength!==undefined&&<p>Recorded length: {expanded.value.recordedLength}</p>}{expanded.value.reason&&<p>{expanded.value.reason}</p>}<button onClick={()=>copy(expanded.value.exact)} aria-label={`Copy ${expanded.name}`}><Copy size={14}/>Copy captured value</button><button onClick={()=>setExpanded(null)}>Close detail</button></section>}
  {copyMessage&&<p role="status">{copyMessage}</p>}
  {node&&<details><summary>{inbound.length} inbound recorded references</summary><VirtualList count={inbound.length} rowHeight={52} label="Inbound references" className="gg-inspector-inbound">{index=><p className="gg-inspector-id">{inbound[index].sourceSlotId} → {inbound[index].targetId}</p>}</VirtualList></details>}
  <details><summary>Recorded evidence · {provenance.length} graph records</summary>
   {node&&<><p>{node.evidence.kind} · applied prefix {runtime.cursor}</p><VirtualList count={node.evidence.eventIds.length} rowHeight={32} label="Event evidence" className="gg-inspector-events">{index=><p className="gg-inspector-id">{node.evidence.eventIds[index]}</p>}</VirtualList></>}
   {!runtime.executionGraph&&<p>This recording contains no execution graph. Captured runtime values remain available above.</p>}
   {runtime.executionGraph&&provenance.length===0&&!flow&&<p>No adjacent graph evidence was recorded for this selection at this prefix.</p>}
   <VirtualList count={provenance.length} rowHeight={76} label="Graph evidence" className="gg-inspector-provenance">{index=>{const item=provenance[index];return <div className="gg-inspector-record"><strong>{item.kind} · {item.graphEvidence}</strong><span title={`${item.from} → ${item.to}`}>{item.from} → {item.to}</span><small title={item.spatial.reason??''}>{item.evidence.introducedSeq} · {item.eventId} · {item.spatial.drawable?'spatial mapping available':'not drawable'}</small></div>}}</VirtualList>
  </details>
 </aside>
}
