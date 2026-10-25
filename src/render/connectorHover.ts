import type {SceneModel,PresentationPlan} from '../contracts/world'
import type {WorldHover} from '../interaction/interactionStore'
import {arrayCellTarget} from '../world/arrayCellTarget'
import {inspectorEntityTitle} from './inspection'

export function currentConnectorHover(hover:WorldHover|null,scene:SceneModel,plan:PresentationPlan):string|null {
 const context=hover?.presentation
 return hover&&hover.kind!=='entity'&&context?.recordingId===scene.recordingId&&context.cursor===scene.cursor&&context.revision===plan.revision&&(plan.curves.some(curve=>curve.id===hover.id)||plan.bundles.some(curve=>curve.id===hover.id))?hover.id:null
}
/** Names come from captured metadata; opaque runtime IDs are never Java names. */
export function connectorHoverLabel(scene:SceneModel,plan:PresentationPlan,id:string):string|null {
 const reference=scene.references.find(reference=>reference.id===id)??scene.historicalBindings.find(binding=>binding.id===id)
 if(reference){
  const source=scene.entities[reference.sourceId],target=scene.entities[reference.targetId]
  if(!source||!target)return null
  let storage='captured storage (name unavailable here)'
  if(source.kind==='array'){
   const cell=arrayCellTarget(scene,reference.sourceSlotId)
   if(cell?.array.id===source.id)storage=`[${cell.index}]`
  }else if(source.kind==='collection'){
   const index=source.entries.findIndex(entry=>entry.slotId===reference.sourceSlotId||entry.keySlotId===reference.sourceSlotId)
   if(index>=0)storage=`preview entry ${index} ${source.entries[index].keySlotId===reference.sourceSlotId?'key':'value'}`
  }else if(source.kind==='object'){
   for(const group of source.groups){
    const row=group.rows.find(row=>row.slotId===reference.sourceSlotId)
    if(row){storage=[row.declaringClass??group.declaringClass,row.name].filter(Boolean).join('.');break}
   }
  }else{
   const row=source.rows.find(row=>row.slotId===reference.sourceSlotId)
   if(row)storage=row.name
  }
  const historical='introducedSeq'in reference?'Historical binding · ':''
  return`${historical}${inspectorEntityTitle(source)} · ${storage} → ${inspectorEntityTitle(target)}`
 }
 const bundle=plan.bundles.find(bundle=>bundle.id===id)
 if(bundle)return`${bundle.count} ${bundle.kind==='connector'?'current references':bundle.kind==='binding-history'?'historical bindings':'recorded flows'}`
 return plan.curves.find(curve=>curve.id===id)?.label??null
}
