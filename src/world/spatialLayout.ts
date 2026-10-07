import { arrayElementSlotId, type RuntimeSlot, type TraceEvent, type RuntimeTypeMetadata } from '../contracts/runtime'
import type { LayoutState, Vec3, WorldAnchor } from '../contracts/world'
import { persistentPut, persistentRecord } from '../runtime/storage'
import { worldUnits } from '../theme/tokens'

const frameSize: Vec3 = [worldUnits.frame[0], 3.6, 1.6]
const rowLimit = 6
const arrayColumns = 8
const shelfPitch = 12.6

/** Private incremental bookkeeping publishes immutable anchor roots, not runtime truth. */
export function createSpatialLayoutBuilder() {
  let anchors = persistentRecord<WorldAnchor>({})
  let count = 0, rootCount = 0, stackDepth = 0
  let cached: LayoutState | undefined
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  const frames = new Map<string, { depth: number; children: number; slots: Set<string>; row: number }>()
  const shelves = new Map<string, { x: number; y: number; nextZ: number }>()
  const shelfCounts = { project: 0, external: 0 }
  const arrays = new Map<string, { prefix: number; sparse: Map<number, number> }>()
  const occupied = new Map<number, Map<number, number>>()
  // Later observations may add sparse cells beside earlier arrays. An append-only
  // spatial index protects both those cells and future allocations: reservations
  // resolve collisions when created, never by moving an existing identity.
  const geometry = new Map<string, WorldAnchor>()
  const buckets = new Map<string, Set<string>>()
  const gridStep = 4
  const keys = (position: Vec3, size: Vec3) => {
    const low = position.map((value, axis) => Math.floor((value - size[axis] / 2 - 0.4) / gridStep))
    const high = position.map((value, axis) => Math.floor((value + size[axis] / 2 + 0.4) / gridStep))
    const result: string[] = []
    for (let x = low[0]; x <= high[0]; x++) for (let y = low[1]; y <= high[1]; y++) for (let z = low[2]; z <= high[2]; z++) result.push(`${x},${y},${z}`)
    return result
  }
  const intersects = (position: Vec3, size: Vec3, clearance = 0.4) => {
    const checked = new Set<string>()
    for (const key of keys(position, size)) for (const id of buckets.get(key) ?? []) {
      if (checked.has(id)) continue
      checked.add(id)
      const other = geometry.get(id)!
      if ([0, 1, 2].every(axis => Math.abs(position[axis] - other.position[axis]) < (size[axis] + other.size[axis]) / 2 + clearance)) return true
    }
    return false
  }
  const occupy = (anchor: WorldAnchor) => {
    geometry.set(anchor.entityId, anchor)
    for (const key of keys(anchor.position, anchor.size)) {
      let bucket = buckets.get(key)
      if (!bucket) { bucket = new Set(); buckets.set(key, bucket) }
      bucket.add(anchor.entityId)
    }
  }
  const freeColumn = (depth: number, proposal: number): number => {
    let next = occupied.get(depth)
    if (!next) { next = new Map(); occupied.set(depth, next) }
    let column = proposal
    const path: number[] = []
    while (next.has(column)) { path.push(column); column = next.get(column)! }
    for (const item of path) next.set(item, column)
    return column
  }

  const include = (anchor: WorldAnchor) => {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], anchor.position[axis] - anchor.size[axis] / 2 - 0.4)
      max[axis] = Math.max(max[axis], anchor.position[axis] + anchor.size[axis] / 2 + 0.4)
    }
  }
  const put = (anchor: WorldAnchor, newGeometry = false, reservation = newGeometry) => {
    anchors = persistentPut(anchors, anchor.entityId, anchor)
    if (newGeometry) include(anchor)
    if (reservation) occupy(anchor)
    cached = undefined
  }
  const shelf = (type: string, metadata?: RuntimeTypeMetadata) => {
    let item = shelves.get(type)
    if (!item) {
      const external = metadata && metadata.ownership !== 'PROJECT'
      const ordinal = shelfCounts[external ? 'external' : 'project']++
      const columns = external ? 2 : 3
      item = { x: 4.6 + ordinal % columns * shelfPitch,
        y: external ? 12.5 + Math.floor(ordinal / columns) * 10.2 : -Math.floor(ordinal / columns) * 10.2, nextZ: 0 }
      shelves.set(type, item)
    }
    return item
  }
  const heapPosition = (type: string, size: Vec3, metadata?: RuntimeTypeMetadata): Vec3 => {
    const lane = shelf(type, metadata)
    const result: [number, number, number] = [lane.x, lane.y, lane.nextZ - size[2] / 2]
    while (intersects(result, size)) result[2] -= size[2] + 2.1
    lane.nextZ = result[2] - size[2] / 2 - 2.1
    return result
  }
  const ports = (position: Vec3, size: Vec3, slots: readonly RuntimeSlot[], stack = false) =>
    persistentRecord(Object.fromEntries(slots.slice(0, stack ? 8 : rowLimit).map((slot, index) => [slot.id,
      [position[0] + size[0] / 2 - 0.24, position[1] + size[1] / 2 - (stack ? 0.95 : 1.07) - index * (stack ? 0.32 : 0.52), position[2] + size[2] / 2 + 0.055] as Vec3])))

  const reserveCell = (objectId: string, index: number, ordinal: number, sparse = false) => {
    const parent = anchors[objectId]
    if (!parent) return
    const id = arrayElementSlotId(objectId, index)
    if (anchors[id]) return
    const cellSize = worldUnits.arraySpatial.cell
    const columns = Math.min(arrayColumns, Math.max(1, arrays.get(objectId)?.prefix ?? 1))
    const position: [number, number, number] = sparse
      ? [parent.position[0] + (ordinal % arrayColumns - 3.5) * worldUnits.arraySpatial.step, parent.position[1] - 0.3, parent.position[2] - 2.8 - Math.floor(ordinal / arrayColumns) * 1.6]
      : [parent.position[0] + (ordinal % columns - (columns - 1) / 2) * worldUnits.arraySpatial.step,
        parent.position[1] + parent.size[1] / 2 - 1.65 - Math.floor(ordinal / columns) * 1.4, parent.position[2]]
    if (sparse) while (intersects(position, cellSize, 0.08)) position[2] -= 1.6
    const port: Vec3 = [position[0] + cellSize[0] / 2 - 0.12, position[1], position[2] + cellSize[2] / 2 + 0.055]
    put({ entityId: id, region: 'heap', position, size: cellSize, ports: { [id]: port }, bodyPort: port }, true, sparse)
    put({ ...parent, ports: persistentPut(parent.ports, id, port) })
  }
  const reserveSparse = (objectId: string, index: number) => {
    const array = arrays.get(objectId)
    if (!array || anchors[arrayElementSlotId(objectId, index)]) return
    const ordinal = array.sparse.size
    array.sparse.set(index, ordinal)
    reserveCell(objectId, index, ordinal, true)
  }

  const reserveIo = (id: 'stdin' | 'stdout' | 'stderr') => {
    const entityId = `io:${id}`
    if (anchors[entityId]) return
    const position: Vec3 = id === 'stdin' ? [-12, 4.6, 2] : [id === 'stdout' ? 4.6 : 9.6, 8.7, 2]
    const size: Vec3 = [2.8, 0.8, 0.55], port: Vec3 = [position[0] - 1.25, position[1], position[2] + 0.33]
    put({ entityId, region: 'io', position, size, ports: {}, bodyPort: port }, true)
  }
  const appendEvent = (event: TraceEvent) => {
    if (event.type === 'INPUT_READ') reserveIo('stdin')
    if (event.type === 'OUTPUT_WRITE') reserveIo('stdout')
    if (event.type === 'CONSOLE_WRITE') reserveIo(event.channel)
    if (event.type === 'EXECUTION_FACT') {
      if (event.fact.kind === 'call-return' && event.fact.inputText !== undefined) reserveIo('stdin')
      if (event.fact.kind === 'io' && event.fact.channel !== 'stdin') reserveIo(event.fact.channel)
    }
    if (event.type === 'ENTER_METHOD' && !anchors[event.frameId]) {
      const caller = event.callerFrameId ? frames.get(event.callerFrameId) : undefined
      const parent = event.callerFrameId ? anchors[event.callerFrameId] : undefined
      const depth = caller ? caller.depth + 1 : 0
      const sibling = caller ? caller.children++ : rootCount++
      // Each proposal belongs to its actual caller. Occupancy resolves cousins
      // locally without moving parents or assigning a global arrival grid.
      const proposal = parent ? Math.round((-5.6 - parent.position[0]) / 6.4) + sibling : sibling
      let column = freeColumn(depth, proposal)
      const y = parent ? parent.position[1] - 4.25 : 1.3
      const candidate = (ordinal: number): Vec3 => [-5.6 - ordinal % 4 * 6.4, y,
        (parent ? parent.position[2] - 1.8 : 0) - Math.floor(ordinal / 4) * 4]
      let position = candidate(column)
      while (intersects(position, frameSize)) { column = freeColumn(depth, column + 1); position = candidate(column) }
      occupied.get(depth)!.set(column, freeColumn(depth, column + 1))
      const [x, , z] = position
      stackDepth = Math.max(stackDepth, depth)
      const returns: RuntimeSlot[] = event.returnType && event.returnType !== 'void'
        ? [{ id: `return:${event.frameId}`, name: 'return', javaType: event.returnType, value: { kind: 'uninitialized' }, role: 'return' }] : []
      const slots = [...returns, ...event.locals]
      frames.set(event.frameId, { depth, children: 0, slots: new Set(slots.map(s => s.id)), row: slots.length })
      put({ entityId: event.frameId, region: 'stack', position, size: frameSize, ports: ports(position, frameSize, slots, true),
        bodyPort: [x + frameSize[0] / 2, y, z + frameSize[2] / 2 + 0.055] }, true)
    }
    if (event.type === 'DECLARE_LOCAL') {
      const frame = frames.get(event.frameId), anchor = anchors[event.frameId]
      if (frame && anchor && !frame.slots.has(event.slot.id)) {
        if (frame.row < 8) {
          const port: Vec3 = [anchor.position[0] + anchor.size[0] / 2 - 0.24,
            anchor.position[1] + anchor.size[1] / 2 - 0.95 - frame.row * 0.32, anchor.position[2] + anchor.size[2] / 2 + 0.055]
          put({ ...anchor, ports: persistentPut(anchor.ports, event.slot.id, port) })
        }
        frame.slots.add(event.slot.id); frame.row++
      }
    }
    if (event.type === 'ALLOCATE_OBJECT' && !anchors[event.objectId]) {
      const size: Vec3 = [worldUnits.object[0], Math.min(4.6, Math.max(worldUnits.object[1], 1.5 + Math.max(0, Math.min(rowLimit, event.fields.length) - 1) * 0.52)), worldUnits.object[2]]
      const position = heapPosition(event.metadata?.runtimeType ?? event.className, size, event.metadata)
      put({ entityId: event.objectId, region: 'heap', position, size, ports: ports(position, size, event.fields),
        bodyPort: [position[0] - size[0] / 2 + 0.16, position[1], position[2] + size[2] / 2 + 0.055] }, true)
    }
    if (event.type === 'OBJECT_OBSERVE') {
      const anchor = anchors[event.objectId]
      if (anchor && event.fields) {
        let next = anchor.ports
        const capacity = Math.min(rowLimit, Math.floor((anchor.size[1] - 1.5) / 0.52) + 1)
        for (const field of event.fields) if (!next[field.id] && Object.keys(next).length < capacity) {
          const row = Object.keys(next).length
          const port: Vec3 = [anchor.position[0] + anchor.size[0] / 2 - 0.24, anchor.position[1] + anchor.size[1] / 2 - 1.07 - row * 0.52, anchor.position[2] + anchor.size[2] / 2 + 0.055]
          next = persistentPut(next, field.id, port)
        }
        if (next !== anchor.ports) put({ ...anchor, ports: next })
      }
      for (const cell of event.arrayElements ?? []) reserveSparse(event.objectId, cell.index)
    }
    if (event.type === 'ALLOCATE_ARRAY' && !anchors[event.objectId]) {
      const columns = Math.min(arrayColumns, Math.max(1, event.elements.length))
      const rows = Math.max(1, Math.ceil(event.elements.length / columns))
      const size: Vec3 = [Math.max(3.8, (columns - 1) * worldUnits.arraySpatial.step + worldUnits.arraySpatial.cell[0]), rows * 1.4 + 1.7, 1.7]
      const position = heapPosition(`${event.elementType}[]`, size, event.metadata)
      arrays.set(event.objectId, { prefix: event.elements.length, sparse: new Map() })
      put({ entityId: event.objectId, region: 'heap', position, size, ports: persistentRecord({}),
        bodyPort: [position[0] - size[0] / 2 + 0.16, position[1] + size[1] / 2 - 0.42, position[2] + 0.9] }, true)
      event.elements.forEach((_, index) => reserveCell(event.objectId, index, index))
    }
    if (event.type === 'ARRAY_READ' || event.type === 'ARRAY_WRITE') reserveSparse(event.objectId, event.index)
    if (event.type === 'CLASS_OBSERVE') {
      const existing = anchors[event.classId]
      if (!existing) {
        const lane = shelf(event.className, event.metadata)
        const size: Vec3 = [worldUnits.object[0], 4.1, 1.1]
        const position: Vec3 = [lane.x, lane.y + 4.8, 0]
        put({ entityId: event.classId, region: 'class', position, size, ports: ports(position, size, event.fields),
          bodyPort: [position[0] - size[0] / 2 + 0.16, position[1], position[2] + 0.6] }, true)
      } else {
        let next = existing.ports
        for (const slot of event.fields) if (!next[slot.id] && Object.keys(next).length < rowLimit) {
          const row = Object.keys(next).length
          next = persistentPut(next, slot.id, [existing.position[0] + existing.size[0] / 2 - 0.24, existing.position[1] + existing.size[1] / 2 - 1.07 - row * 0.52, existing.position[2] + existing.size[2] / 2 + 0.055] as Vec3)
        }
        if (next !== existing.ports) put({ ...existing, ports: next })
      }
    }
    count++
  }
  return {
    get length() { return count },
    append(events: readonly TraceEvent[], from = 0) { for (let index = from; index < events.length; index++) appendEvent(events[index]) },
    get state(): LayoutState {
      if (!cached) {
        if (min[0] === Infinity) cached = { anchors, homeTarget: worldUnits.homeTarget, stackDepth, layoutKind: 'spatial2' }
        else {
          const center = min.map((value, axis) => (value + max[axis]) / 2) as unknown as Vec3
          const size = min.map((value, axis) => max[axis] - value) as unknown as Vec3
          cached = { anchors, homeTarget: center, stackDepth, layoutKind: 'spatial2', bounds: { center, size } }
        }
      }
      return cached
    },
  }
}
