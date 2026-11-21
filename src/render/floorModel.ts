import type { LayoutState, Vec3, WorldAnchor } from '../contracts/world'
import type { QualityTier } from './quality/qualityStore'

/** Shared floor palette and optical limits for every runtime presentation. */
export const floorStyle = Object.freeze({
  surface: '#080B14', studio: '#1A2034', grid: '#52617C',
  minorSpacing: 1, majorSpacing: 4, minExtent: 80, extentScale: 2.5,
  clearance: .16, maxReservedGap: .65, contactLift: .012,
  maxContacts: 40, maxContactHeight: 3,
  reflectionResolution: 384, reflectionBlur: 2.25, reflectionStrength: .38, reflectionPeak: .06,
})

export interface FloorModel {
  position: Vec3
  extent: number
  opacity: number
  studioCenter: readonly [number, number]
  studioRadius: number
  reflection: boolean
}

type GroundAnchor = Pick<WorldAnchor, 'position' | 'size'>

export function underside(anchor: GroundAnchor): number {
  return anchor.position[1] - anchor.size[1] / 2
}

export function floorModel(
  layout: Pick<LayoutState, 'bounds'>, quality: QualityTier, hasRecording: boolean,
  represented: readonly GroundAnchor[] = [], home: readonly GroundAnchor[] = [],
): FloorModel {
  const bounds = layout.bounds
  const [x, y, z] = bounds?.center ?? [0, -6, 0]
  const reservedBottom = y - (bounds?.size[1] ?? 0) / 2
  const representedBottom = represented.reduce((low, anchor) => Math.min(low, underside(anchor)), Infinity)
  // Preserve nearby reserved clearance through scrubs. Distant reservations can
  // put the stage far below every rendered body, so cap their contribution.
  const bottom = Number.isFinite(representedBottom)
    ? Math.min(representedBottom, Math.max(reservedBottom, representedBottom - floorStyle.maxReservedGap))
    : reservedBottom
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const { position, size } of home) {
    minX = Math.min(minX, position[0] - size[0] / 2)
    maxX = Math.max(maxX, position[0] + size[0] / 2)
    minZ = Math.min(minZ, position[2] - size[2] / 2)
    maxZ = Math.max(maxZ, position[2] + size[2] / 2)
  }
  const radius = home.length ? Math.max(maxX - minX, maxZ - minZ) * .82 : 20
  return {
    position: [x, bottom - (bounds || represented.length ? floorStyle.clearance : 0), z],
    extent: Math.max(floorStyle.minExtent, floorStyle.extentScale * Math.max(...bounds?.size ?? [0])),
    opacity: hasRecording ? 1 : .42,
    studioCenter: home.length ? [(minX + maxX) / 2, (minZ + maxZ) / 2] : [x, z],
    studioRadius: Math.max(16, Math.min(radius, 34)),
    reflection: hasRecording && quality === 'CINEMATIC',
  }
}
