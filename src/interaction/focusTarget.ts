import type {Selection} from '../contracts/interaction'
import type {PresentationPlan,SceneModel} from '../contracts/world'
import {inspectorEntity} from '../render/inspection'
import {arrayCellTarget} from '../world/arrayCellTarget'
import {focusable,type InteractionState} from './interactionStore'

/** Recorded local history can be inspected after retirement, but only a
 * prefix-present owner or current structural cluster can receive Focus. */
export function canFocusWorldSelection(scene:SceneModel,plan:Pick<PresentationPlan,'clusters'>,selection:Selection):selection is NonNullable<Selection>{
 return focusable(selection)&&!!(inspectorEntity(scene,selection)||selection.kind==='cluster'&&plan.clusters.some(cluster=>cluster.id===selection.id))
}

/** Follow the current display slot of the semantic index. A missing array,
 * retired slot, or vanished representative has no physical camera target. */
export function spatialFocusTarget(scene:SceneModel,plan:Pick<PresentationPlan,'framing'|'clusters'|'cellWindows'>,focus:NonNullable<InteractionState['focus']>){
 const {targetId,kind}=focus
 if(kind==='cluster'){
  const anchor=plan.clusters.find(cluster=>cluster.id===targetId)?.anchor
  return anchor?{anchor,cell:null}:null
 }
 if(kind==='arrayCell'){
  const semanticCell=arrayCellTarget(scene,targetId)
  if(semanticCell){
   const cell=plan.cellWindows.get(semanticCell.array.id)?.mapping.get(targetId)
   return cell?{anchor:cell.anchor,cell}:null
  }
  const owner=plan.framing.focus?.targetId
  const anchor=owner?scene.entities[owner]?.anchor:null
  return anchor?{anchor,cell:null}:null
 }
 const anchor=scene.entities[targetId]?.anchor
 return anchor?{anchor,cell:null}:null
}
