import type {Selection} from '../contracts/interaction'
import type {PresentationPlan,SceneModel} from '../contracts/worldV2'
import {inspectorEntity} from '../render/inspection'
import {focusable} from './interactionStore'

/** Recorded local history can be inspected after retirement, but only a
 * prefix-present owner or current structural cluster can receive Focus. */
export function canFocusWorldSelection(scene:SceneModel,plan:Pick<PresentationPlan,'clusters'>,selection:Selection):selection is NonNullable<Selection>{
 return focusable(selection)&&!!(inspectorEntity(scene,selection)||selection.kind==='cluster'&&plan.clusters.some(cluster=>cluster.id===selection.id))
}
