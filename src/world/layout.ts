import type { TraceDocument, RuntimeSlot } from '../contracts/runtime'
import type { LayoutState, Vec3, WorldAnchor } from '../contracts/world'
import { worldUnits } from '../theme/tokens'

function portsForSlots(position: Vec3, size: Vec3, slots: RuntimeSlot[], region: 'stack' | 'heap'): Record<string, Vec3> {
  const top = position[1] + size[1] / 2 - (region === 'stack' ? 0.64 : 0.96)
  const gap = region === 'stack' ? 0.32 : 0.46
  return Object.fromEntries(slots.map((slot, index) => [
    slot.id,
    [position[0] + size[0] / 2 + 0.04, top - index * gap, position[2] + size[2] * 0.18] as Vec3,
  ]))
}

/** Reserve all known anchors once. Visibility may change with time; coordinates never do. */
export function createLayout(trace: TraceDocument): LayoutState {
  const anchors: Record<string, WorldAnchor> = {}
  const frameSlots: Record<string, RuntimeSlot[]> = {}
  const frameDepths: Record<string, number> = {}
  let childOrdinal = 0
  let objectOrdinal = 0

  for (const event of trace.events) {
    if (event.type === 'ENTER_METHOD') frameSlots[event.frameId] = [...event.locals]
    if (event.type === 'DECLARE_LOCAL') frameSlots[event.frameId]?.push(event.slot)
  }

  for (const event of trace.events) {
    if (event.type === 'ENTER_METHOD') {
      const depth = event.callerFrameId ? (frameDepths[event.callerFrameId] ?? 0) + 1 : 0
      frameDepths[event.frameId] = depth
      const position: Vec3 = depth === 0
        ? [-3.65, -0.2, 1.25]
        : [-3.55 + (depth - 1) * 0.32, 1.45 + (depth - 1) * 1.45, -0.7 - childOrdinal++ * 0.75]
      const slots = frameSlots[event.frameId] ?? []
      const size: Vec3 = [worldUnits.frame[0], Math.max(worldUnits.frame[1], 0.84 + slots.length * 0.34), worldUnits.frame[2]]
      anchors[event.frameId] = {
        entityId: event.frameId,
        region: 'stack',
        position,
        size,
        ports: portsForSlots(position, size, slots, 'stack'),
        bodyPort: [position[0] + size[0] / 2, position[1], position[2]],
      }
    }

    if (event.type === 'ALLOCATE_OBJECT') {
      const position: Vec3 = [3.75 + (objectOrdinal % 2) * 0.5, -0.05, -0.6 - objectOrdinal * 1.55]
      objectOrdinal++
      const size = worldUnits.object
      anchors[event.objectId] = {
        entityId: event.objectId,
        region: 'heap',
        position,
        size,
        ports: portsForSlots(position, size, event.fields, 'heap'),
        bodyPort: [position[0] - size[0] / 2 - 0.04, position[1] + 0.1, position[2] + size[2] * 0.18],
      }
    }
  }

  return { anchors, homeTarget: worldUnits.homeTarget }
}
