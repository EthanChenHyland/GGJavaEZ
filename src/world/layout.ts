import { arrayElementSlotId, type TraceDocument, type RuntimeSlot } from '../contracts/runtime'
import type { LayoutState, Vec3, WorldAnchor } from '../contracts/world'
import { worldUnits } from '../theme/tokens'

function portsForSlots(position: Vec3, size: Vec3, slots: RuntimeSlot[], region: 'stack' | 'heap', spacious = false): Record<string, Vec3> {
  const top = position[1] + size[1] / 2 - (region === 'stack' ? spacious ? 1.15 : 0.95 : 1.07)
  const gap = region === 'stack' ? spacious ? 0.44 : 0.32 : 0.52
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
  let stackDepth = 0
  const hasArrays = trace.events.some((event) => event.type === 'ALLOCATE_ARRAY')
  const theaterAnchors: Record<string, WorldAnchor> = {}

  for (const event of trace.events) {
    if (event.type === 'ENTER_METHOD') {
      frameSlots[event.frameId] = [...event.locals]
      frameDepths[event.frameId] = event.callerFrameId ? (frameDepths[event.callerFrameId] ?? 0) + 1 : 0
      stackDepth = Math.max(stackDepth, frameDepths[event.frameId])
    }
    if (event.type === 'DECLARE_LOCAL' && !frameSlots[event.frameId]?.some((slot) => slot.id === event.slot.id)) frameSlots[event.frameId]?.push(event.slot)
  }
  for (const event of trace.events) {
    if (event.type === 'ENTER_METHOD' && event.returnType && event.returnType !== 'void') {
      frameSlots[event.frameId].push({ id: `return:${event.frameId}`, name: 'return', javaType: event.returnType, role: 'return', value: { kind: 'uninitialized' } })
    }
  }

  for (const event of trace.events) {
    if (event.type === 'ENTER_METHOD') {
      const depth = event.callerFrameId ? (frameDepths[event.callerFrameId] ?? 0) + 1 : 0
      frameDepths[event.frameId] = depth
      const position: Vec3 = stackDepth > 1
        ? [-4.7 + depth * 0.9, (stackDepth - depth) * 2.2 - 0.3, -3 + depth * 1.1]
        : depth === 0
        ? [hasArrays ? -4.9 : -3.45, -0.25, 1.1]
        : [-3.35 + (depth - 1) * 0.32, 1.65 + (depth - 1) * 1.65, -0.8 - childOrdinal++ * 0.85]
      const slots = frameSlots[event.frameId] ?? []
      const size: Vec3 = [worldUnits.frame[0], Math.max(worldUnits.frame[1], hasArrays ? 1.5 + slots.length * 0.44 : 1.12 + slots.length * 0.34), worldUnits.frame[2]]
      anchors[event.frameId] = {
        entityId: event.frameId,
        region: 'stack',
        position,
        size,
        ports: portsForSlots(position, size, slots, 'stack', hasArrays),
        bodyPort: [position[0] + size[0] / 2, position[1], position[2]],
      }
    }

    if (event.type === 'ALLOCATE_ARRAY') {
      const position: Vec3 = [3.45, -0.05, -0.65 - objectOrdinal++ * 3]
      const reserveArray = (expanded: boolean, target: Record<string, WorldAnchor>) => {
        const dimensions = expanded ? worldUnits.arrayTheater : worldUnits.arraySpatial
        const cellSize: Vec3 = dimensions.cell
        const step = dimensions.step
        const width = Math.max(cellSize[0], (event.elements.length - 1) * step + cellSize[0])
        const ports: Record<string, Vec3> = {}
        event.elements.forEach((_, index) => {
          const id = arrayElementSlotId(event.objectId, index)
          const cellPosition: Vec3 = [position[0] + (index - (event.elements.length - 1) / 2) * step, -0.3, position[2]]
          const port: Vec3 = [cellPosition[0], cellPosition[1] + cellSize[1] / 2 + 0.50, cellPosition[2] + cellSize[2] / 2 + 0.04]
          ports[id] = port
          target[id] = { entityId: id, region: 'heap', position: cellPosition, size: cellSize, ports: { [id]: port }, bodyPort: port }
        })
        target[event.objectId] = { entityId: event.objectId, region: 'heap', position,
          size: [width, dimensions.boundaryHeight, dimensions.boundaryDepth], ports,
          bodyPort: [position[0] - Math.min(width, worldUnits.arrayHeader.maxWidth) / 2 - 0.04, position[1] + dimensions.boundaryHeight / 2 - worldUnits.arrayHeader.topInset, position[2] + worldUnits.arrayHeader.depth / 2] }
      }
      reserveArray(false, anchors)
      reserveArray(true, theaterAnchors)
    }

    if (event.type === 'ALLOCATE_OBJECT') {
      const position: Vec3 = [3.45 + (objectOrdinal % 2) * 0.5, -0.05, -0.65 - objectOrdinal * 1.55]
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

  if (stackDepth <= 1 && !hasArrays) return { anchors, homeTarget: worldUnits.homeTarget, stackDepth }
  const boundsFor = (reserved: Record<string, WorldAnchor>) => {
    const nodes = Object.values(reserved)
    const min = [0, 1, 2].map((axis) => Math.min(...nodes.map((node) => node.position[axis] - node.size[axis] / 2)))
    const max = [0, 1, 2].map((axis) => Math.max(...nodes.map((node) => node.position[axis] + node.size[axis] / 2)))
    const center = min.map((value, axis) => (value + max[axis]) / 2) as unknown as Vec3
    const size = min.map((value, axis) => max[axis] - value) as unknown as Vec3
    const points: Vec3[] = nodes.flatMap((node) => [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [
      node.position[0] + x * (node.size[0] / 2 + 0.35),
      node.position[1] + y * (node.size[1] / 2 + (hasArrays && node.region === 'heap' && !node.entityId.includes(':element:') ? 1.1 : 0.5)),
      node.position[2] + z * (node.size[2] / 2 + 0.12),
    ] as Vec3))))
    return { center, size, points }
  }
  const bounds = boundsFor(anchors)
  const expanded = { ...anchors, ...theaterAnchors }
  const theaterBounds = hasArrays ? boundsFor(expanded) : undefined
  return { anchors, homeTarget: bounds.center, stackDepth, bounds, layoutKind: hasArrays ? 'array' : 'deepStack',
    ...(theaterBounds ? { theater: { anchors: expanded, bounds: theaterBounds, homeTarget: theaterBounds.center } } : {}) }
}
