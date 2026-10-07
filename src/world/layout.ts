import type { TraceDocument, RuntimeSlot } from '../contracts/runtime'
import type { LayoutState, Vec3 } from '../contracts/world'
import { createSpatialLayoutBuilder } from './spatialLayout'

/** Information rows and real ports share this coordinate grammar. */
export function portsForSlots(position: Vec3, size: Vec3, slots: RuntimeSlot[], region: 'stack' | 'heap', spacious = false): Record<string, Vec3> {
  const top = position[1] + size[1] / 2 - (region === 'stack' ? spacious ? 1.15 : 0.95 : 1.07)
  const gap = region === 'stack' ? spacious ? 0.44 : 0.32 : 0.52
  return Object.fromEntries(slots.map((slot, index) => [slot.id,
    [position[0] + size[0] / 2 + 0.04, top - index * gap, position[2] + size[2] * 0.18] as Vec3]))
}

/** Batch and streaming consume the identical append-only spatial policy. */
export function createLayout(trace: TraceDocument): LayoutState {
  const builder = createSpatialLayoutBuilder()
  builder.append(trace.events)
  return builder.state
}
export const createLayoutBuilder = createSpatialLayoutBuilder
