import type { Selection } from '../contracts/interaction'
import type { SceneModel } from '../contracts/world'
import { planSpatialPresentation, spatialBudgets, type SpatialPresentationOptions } from './spatialPresentation'

export const detailBudget = spatialBudgets.micro

/** Compatibility seam for consumers that need only the bounded detail scene.
 * The full catalog remains authoritative for identity lookup and time travel. */
export function detailedScene(scene: SceneModel, selection: Selection, options: SpatialPresentationOptions = {}): SceneModel {
  return planSpatialPresentation(scene, selection, options).scene
}
