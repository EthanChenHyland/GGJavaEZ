import { arrayElementSlotId, type TraceDocument, type RuntimeSlot } from '../contracts/runtime'
import type { LayoutState, Vec3, WorldAnchor } from '../contracts/world'
import { worldUnits } from '../theme/tokens'

export function portsForSlots(position: Vec3, size: Vec3, slots: RuntimeSlot[], region: 'stack' | 'heap', spacious = false): Record<string, Vec3> {
  const top = position[1] + size[1] / 2 - (region === 'stack' ? spacious ? 1.15 : 0.95 : 1.07)
  const gap = region === 'stack' ? spacious ? 0.44 : 0.32 : 0.52
  return Object.fromEntries(slots.map((slot, index) => [
    slot.id,
    [position[0] + size[0] / 2 + 0.04, top - index * gap, position[2] + size[2] * 0.18] as Vec3,
  ]))
}

/** Generic (JVM-capture) layout. Reserve all known anchors once; coordinates never change.
 * Curated example layouts live in src/examples/curatedLayout.ts and are selected only by
 * the composition seam src/app/layoutForTrace.ts. Remaining generic debt (hasArrays flag,
 * fixed live frame height) is tracked as audit D2/D4 and replaced in Phase 5. */
export function createLayout(trace: TraceDocument): LayoutState {
  const anchors: Record<string, WorldAnchor> = {}
  const frameSlots: Record<string, RuntimeSlot[]> = {}
  const frameDepths: Record<string, number> = {}
  const liveOrdinalByDepth: Record<number, number> = {}
  let heapX = 1.55
  let heapZ = 0.2
  let heapRowDepth = 0
  let stackDepth = 0
  const hasArrays = trace.events.some((event) => event.type === 'ALLOCATE_ARRAY')
  // A JVM capture has no known final depth. Its positions depend only on identity/order.
  const theaterAnchors: Record<string, WorldAnchor> = {}
  const reserveHeapPosition = (width: number, depth: number): Vec3 => {
    // Append-only shelves: allocation order reserves position, never current values.
    if (heapX > 1.55 && heapX + width > 25.55) { heapZ -= heapRowDepth + 1.2; heapX = 1.55; heapRowDepth = 0 }
    const position: Vec3 = [heapX + width / 2, -0.05, heapZ - depth / 2]
    heapX += width + 1.2
    heapRowDepth = Math.max(heapRowDepth, depth)
    return position
  }


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
      const returned: RuntimeSlot = { id: `return:${event.frameId}`, name: 'return', javaType: event.returnType, role: 'return', value: { kind: 'uninitialized' } }
      frameSlots[event.frameId].unshift(returned)
    }
  }

  for (const event of trace.events) {
    if (event.type === 'ENTER_METHOD') {
      const depth = event.callerFrameId ? (frameDepths[event.callerFrameId] ?? 0) + 1 : 0
      frameDepths[event.frameId] = depth
      const sibling = liveOrdinalByDepth[depth] ?? 0
      liveOrdinalByDepth[depth] = sibling + 1
      const column = sibling % 4
      const row = Math.floor(sibling / 4)
      const position: Vec3 = [-4.9 - column * 6.4, -depth * 4.2, -3 - row * 2.6]
      const slots = frameSlots[event.frameId] ?? []
      const size: Vec3 = [worldUnits.frame[0], 3.6, worldUnits.frame[2]]
      anchors[event.frameId] = {
        entityId: event.frameId,
        region: 'stack',
        position,
        size,
        ports: portsForSlots(position, size, slots, 'stack', false),
        bodyPort: [position[0] + size[0] / 2, position[1], position[2]],
      }
    }

    if (event.type === 'ALLOCATE_ARRAY') {
      const arrayWidth = Math.max(worldUnits.arrayTheater.cell[0], (event.elements.length - 1) * worldUnits.arrayTheater.step + worldUnits.arrayTheater.cell[0])
      const position = reserveHeapPosition(arrayWidth, Math.max(worldUnits.arraySpatial.boundaryDepth, worldUnits.arrayTheater.boundaryDepth))
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
      // ObjectSolid places rows from the top face at 0.52-unit intervals.
      // Reserve enough height for the final row and its lower padding.
      const height = Math.max(worldUnits.object[1], 1.5 + Math.max(0, event.fields.length - 1) * 0.52)
      const size: Vec3 = [worldUnits.object[0], height, worldUnits.object[2]]
      const position = reserveHeapPosition(size[0], size[2])
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

  if (!Object.keys(anchors).length) return { anchors, homeTarget: worldUnits.homeTarget, stackDepth }
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
