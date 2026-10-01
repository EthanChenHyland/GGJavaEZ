import type { RuntimeSlot, TraceDocument } from '../contracts/runtime'
import type { LayoutState, SceneScopeNode, Vec3, WorldAnchor } from '../contracts/world'
import { worldUnits } from '../theme/tokens'

/** Reserve lexical blocks once. Sibling blocks share a band because their lifetimes cannot overlap. */
export function createScopedLayout(trace: TraceDocument): LayoutState {
  const anchors: Record<string, WorldAnchor> = {}
  const scopes: NonNullable<LayoutState['scopes']> = {}
  const declarations = new Map<string, RuntimeSlot[]>()
  const definitions = new Map<string, { id: string; frameId: string; parentId: string | null; label: string }>()
  const methods = trace.events.filter((event) => event.type === 'ENTER_METHOD')
  for (const event of trace.events) {
    if (event.type === 'ENTER_SCOPE' && !definitions.has(event.scopeId)) {
      definitions.set(event.scopeId, { id: event.scopeId, frameId: event.frameId, parentId: event.parentId, label: event.labelScope })
      declarations.set(event.scopeId, [])
    }
    if (event.type === 'DECLARE_LOCAL' && event.slot.scopeId) {
      const slots = declarations.get(event.slot.scopeId)
      if (slots && !slots.some((slot) => slot.id === event.slot.id)) slots.push(event.slot)
    }
  }
  const children = (id: string) => [...definitions.values()].filter((scope) => scope.parentId === id)
  const span = (id: string, depth: number): number => (depth ? worldUnits.scope.headingGap : 0) +
    (declarations.get(id)?.length ?? 0) * worldUnits.scope.rowGap + Math.max(0, ...children(id).map((child) => span(child.id, depth + 1)))
  for (const method of methods) {
    const root = [...definitions.values()].find((scope) => scope.frameId === method.frameId && scope.parentId === null)
    const depth = method.callerFrameId ? 1 : 0
    const content = root ? span(root.id, 0) : worldUnits.scope.rowGap * method.locals.length
    const height = 1.35 + content + (method.returnType && method.returnType !== 'void' ? worldUnits.scope.rowGap : 0)
    // Sequential calls reuse a semantic call band; their invocation IDs stay distinct.
    const position: Vec3 = depth === 0 ? [-3.6, -0.5, 1.1] : [-3.6, 3.75, -1.15]
    const size: Vec3 = [worldUnits.frame[0], height, worldUnits.frame[2]]
    const ports: WorldAnchor['ports'] = {}
    const top = position[1] + height / 2 - 1.12
    const reserve = (id: string, scopeDepth: number, start: number) => {
      const definition = definitions.get(id)!
      const slots = declarations.get(id) ?? []
      const gap = scopeDepth ? worldUnits.scope.headingGap : 0
      const scopeHeight = Math.max(worldUnits.scope.rowGap, span(id, scopeDepth))
      const scopeAnchor: WorldAnchor = {
        entityId: id, region: 'stack',
        position: [position[0], start - scopeHeight / 2 + 0.14, position[2] + size[2] / 2 + scopeDepth * worldUnits.scope.depthOffset],
        size: [size[0] - scopeDepth * worldUnits.scope.inset * 2 - 0.22, scopeHeight + 0.08, worldUnits.scope.plateDepth],
        ports: {}, bodyPort: [position[0], start, position[2] + size[2] / 2],
      }
      slots.forEach((slot, index) => {
        ports[slot.id] = [position[0] + size[0] / 2 + 0.04, start - gap - index * worldUnits.scope.rowGap,
          position[2] + size[2] / 2 + 0.05 + scopeDepth * worldUnits.scope.depthOffset]
        scopeAnchor.ports[slot.id] = ports[slot.id]
      })
      scopes[id] = { ...definition, depth: scopeDepth, slotIds: slots.map((slot) => slot.id), anchor: scopeAnchor } satisfies SceneScopeNode & { frameId: string }
      const next = start - gap - slots.length * worldUnits.scope.rowGap
      children(id).forEach((child) => reserve(child.id, scopeDepth + 1, next))
    }
    if (root) reserve(root.id, 0, top)
    if (method.returnType && method.returnType !== 'void') ports[`return:${method.frameId}`] = [position[0] + size[0] / 2 + 0.04, top - content - 0.08, position[2] + size[2] / 2 + 0.05]
    anchors[method.frameId] = { entityId: method.frameId, region: 'stack', position, size, ports, bodyPort: [position[0] + size[0] / 2, position[1], position[2]] }
  }
  const allocations = trace.events.filter((event) => event.type === 'ALLOCATE_OBJECT')
  allocations.forEach((event, index) => {
    const position: Vec3 = [3.45, -0.05, -0.65 - index * 3]
    anchors[event.objectId] = { entityId: event.objectId, region: 'heap', position, size: worldUnits.object, ports: {},
      bodyPort: [position[0] - worldUnits.object[0] / 2 - 0.04, position[1] + 0.1, position[2] + worldUnits.object[2] * 0.18] }
  })
  const nodes = Object.values(anchors)
  const min = [0, 1, 2].map((axis) => Math.min(...nodes.map((node) => node.position[axis] - node.size[axis] / 2)))
  const max = [0, 1, 2].map((axis) => Math.max(...nodes.map((node) => node.position[axis] + node.size[axis] / 2)))
  const center = min.map((value, axis) => (value + max[axis]) / 2) as unknown as Vec3
  const size = min.map((value, axis) => max[axis] - value) as unknown as Vec3
  const points: Vec3[] = nodes.flatMap((node) => [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => [
    node.position[0] + x * (node.size[0] / 2 + 0.3), node.position[1] + y * (node.size[1] / 2 + 0.45), node.position[2] + z * (node.size[2] / 2 + 0.3),
  ] as Vec3))))
  return { anchors, scopes, homeTarget: center, bounds: { center, size, points }, stackDepth: 1, layoutKind: 'scoped' }
}
