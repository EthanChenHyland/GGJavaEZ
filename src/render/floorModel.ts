import type { LayoutState, PresentationPlan, SceneModel, Vec3 } from '../contracts/world'
import type { QualityTier } from './quality/qualityStore'

/** Floor-specific values from corrected design §19.5 / task 8.2. */
export const floorStyle = Object.freeze({
  minor: '#1B3A7A', major: '#2A5BC0', surface: '#172745', contact: '#03050C',
  minorSpacing: 1, majorSpacing: 4, minExtent: 80, extentScale: 2.5,
  clearance: .5, contactLift: .012, gridLift: .03,
  gridFadeExtent: 1.5,
})

export interface FloorModel {
  position: Vec3
  extent: number
  opacity: number
  resolution: 256 | 1024
  mirror: .35 | .5
  blur: readonly [number, number]
}
export interface ContactFootprint {
  id: string
  position: Vec3
  size: readonly [number, number]
  opacity: number
}

export function floorModel(layout: Pick<LayoutState, 'bounds'>, quality: QualityTier, hasRecording: boolean): FloorModel {
  const bounds = layout.bounds
  const cinematic = quality === 'CINEMATIC'
  return {
    position: bounds ? [bounds.center[0], bounds.center[1] - bounds.size[1] / 2 - floorStyle.clearance, bounds.center[2]] : [0, -6, 0],
    extent: bounds ? Math.max(floorStyle.minExtent, floorStyle.extentScale * Math.max(...bounds.size)) : floorStyle.minExtent,
    opacity: hasRecording ? 1 : .45,
    resolution: cinematic ? 1024 : 256,
    mirror: cinematic ? .5 : .35,
    blur: cinematic ? [300, 100] : [0, 0],
  }
}

/** Only represented runtime solids cast grounding marks; this never enumerates the unbudgeted scene. */
export function contactFootprints(scene: Pick<SceneModel, 'entities'>, plan: Pick<PresentationPlan, 'entities' | 'clusters'>, floorY: number): ContactFootprint[] {
  const footprints: ContactFootprint[] = []
  for (const [id, presented] of plan.entities) {
    const node = scene.entities[id]
    if (!node || node.kind === 'class' || presented.opacity <= 0) continue
    const { position, size } = node.anchor
    const distance = Math.max(0, position[1] - size[1] / 2 - floorY)
    footprints.push({ id, position: [position[0], floorY + floorStyle.contactLift, position[2]],
      size: [size[0] + 1.2, size[2] + 1.2], opacity: presented.opacity * .32 / (1 + distance * .12) })
  }
  for (const cluster of plan.clusters) {
    if (cluster.anchor.region !== 'stack' && cluster.anchor.region !== 'heap' && cluster.anchor.region !== 'library') continue
    const { position, size } = cluster.anchor
    footprints.push({ id: cluster.id, position: [position[0], floorY + floorStyle.contactLift, position[2]],
      size: [size[0] + 1.2, size[2] + 1.2], opacity: cluster.opacity * .2 })
  }
  return footprints
}
