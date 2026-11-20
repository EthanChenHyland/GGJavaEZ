import type {Selection} from '../contracts/interaction'
import type {RuntimeState,SourceLocation,TraceDocument} from '../contracts/runtime'
import type {Evidence,PresentationPlan,SceneModel} from '../contracts/world'
import {arrayCellTarget} from '../world/arrayCellTarget'
import {notRecordedValue,valueText} from '../world/valueText'
import {focusSourceLocation} from '../shell/source/sourceSync'
import {inspectorEntity,inspectorRetiredLocal,inspectorSelectionTitle} from './inspection'

/** Read captured, applied-prefix evidence only. This never navigates, changes
 * execution source, opens a workspace file or guesses a source path. */
export function inspectorActionTarget(trace:TraceDocument,runtime:RuntimeState,scene:SceneModel,plan:PresentationPlan,selection:Selection){
 const node=inspectorEntity(scene,selection),retired=node?null:inspectorRetiredLocal(runtime,selection)
 const flow=selection?.kind==='flow'?runtime.executionGraph?.edges.find(edge=>edge.id===selection.id):undefined
 const binding=selection?.kind==='reference'?scene.historicalBindings.find(binding=>binding.id===selection.id):undefined
 const reference=selection?.kind==='reference'?scene.references.find(reference=>reference.id===selection.id):undefined
 const cluster=selection?.kind==='cluster'?plan.clusters.find(cluster=>cluster.id===selection.id):undefined
 const bundle=selection?.kind==='bundle'?plan.bundles.find(bundle=>bundle.id===selection.id):undefined
 const present=!!selection&&(selection.kind==='reference'?!!(binding||reference):selection.kind==='flow'?!!flow:selection.kind==='cluster'?!!cluster:selection.kind==='bundle'?!!bundle:!!(node||retired))
 const title=selection?inspectorSelectionTitle(selection,node,{flowKind:flow?.kind,cluster,bundle,retiredName:retired?.row.name}):''
 const valid=(location:SourceLocation|null|undefined):SourceLocation|null=>{
  if(!location||!Number.isInteger(location.line)||location.line<1)return null
  const file=trace.sourceFiles.find(file=>file.fileId===location.fileId)
  return file&&location.line<=file.content.split('\n').length?location:null
 }
 const fromEvidence=(evidence:Evidence|undefined)=>{
  for(const seq of[evidence?.changedSeq,evidence?.introducedSeq]){
   if(seq===null||seq===undefined||seq<0||seq>=scene.cursor)continue
   const event=trace.events[seq]
   if(event&&evidence?.eventIds.includes(event.eventId)){const location=valid(event.source);if(location)return location}
  }
  return null
 }
 let source:SourceLocation|null=null
 if(present){
  if(flow)source=valid(flow.context.source)
  else if(binding){if(binding.introducedSeq>=0&&binding.introducedSeq<scene.cursor&&trace.events[binding.introducedSeq]?.eventId===binding.introducedEventId)source=valid(trace.events[binding.introducedSeq]?.source)}
  else if(reference)source=fromEvidence(reference.evidence)
  else if(retired)source=valid(retired.lifetime.source)
  else if(node){
   if(selection?.kind==='slot'&&node.kind!=='array'){
    const row=node.kind==='frame'||node.kind==='class'?node.rows.find(row=>row.slotId===selection.id)
     :node.kind==='object'?node.groups.flatMap(group=>group.rows).find(row=>row.slotId===selection.id)
     :node.entries.find(row=>row.slotId===selection.id||row.keySlotId===selection.id)
    source=fromEvidence(row?.evidence)
   }else source=valid(focusSourceLocation(scene,node.id,trace))??(node.kind==='class'?fromEvidence(node.evidence):null)
  }
 }
 const cell=arrayCellTarget(scene,selection?.kind==='slot'?selection.id:null)
 const array=cell?runtime.objects[cell.array.id]?.array:undefined
 const slot=cell?(array?.elements[cell.index]??array?.sparseElements?.[cell.index]):undefined
 const copiedValue=cell?slot?valueText(slot.value,{context:'exact',objects:runtime.objects}):notRecordedValue():null
 return{present,source,copyText:present?copiedValue?.exact??title:null,copyObservation:copiedValue?.observation??'OBSERVED',title,
  key:JSON.stringify([scene.recordingId,scene.cursor,selection?.kind,selection?.id])}
}
