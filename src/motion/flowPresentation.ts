import type { LayoutState, SceneModel, Vec3, WorldAnchor } from '../contracts/world'
import type { SemanticTransition, FlowEndpoint } from './semanticTransition'

export function ioPosition(id: 'stdin' | 'stdout' | 'stderr', scene: SceneModel): Vec3 {
  const anchor = scene.io?.find(endpoint => endpoint.id === id)?.anchor
  if (anchor) return anchor.bodyPort
  const bounds = scene.bounds
  const center = bounds?.center ?? [0, 0, 0]
  const bottom = bounds ? center[1] - bounds.size[1] / 2 : -1.2
  const front = bounds ? center[2] + bounds.size[2] / 2 : 1.4
  const offset = id === 'stdin' ? -1.5 : id === 'stdout' ? 0 : 1.5
  return [center[0] + offset, bottom - 0.55, front + 1.3]
}

const portIndices = new WeakMap<LayoutState['anchors'], Map<string, Vec3>>()
function portsFor(anchors: Record<string, WorldAnchor>) {
  let ports = portIndices.get(anchors)
  if (!ports) {
    ports = new Map()
    for (const anchor of Object.values(anchors)) for (const [id, port] of Object.entries(anchor.ports)) ports.set(id, port)
    portIndices.set(anchors, ports)
  }
  return ports
}

/** Resolve against reserved anchors, never the current visible entity count. */
export function endpointPosition(endpoint: FlowEndpoint | undefined, layout: LayoutState, scene: SceneModel): Vec3 | null {
  if (!endpoint) return null
  if (endpoint.kind === 'io') return ioPosition(endpoint.id, scene)
  const stage = scene.presentation === 'theater' && layout.theater ? layout.theater : layout
  if (endpoint.kind === 'slot') {
    return portsFor(stage.anchors).get(endpoint.id) ?? stage.anchors[endpoint.id]?.bodyPort ?? null
  }
  return stage.anchors[endpoint.id]?.bodyPort ?? null
}

export function transitionIsFlow(transition: SemanticTransition): boolean {
  return Boolean(transition.evidence !== 'local' && transition.from && transition.to && transition.kind !== 'frame-enter' && transition.kind !== 'frame-exit')
}

/** Depart and arrive beside actual face ports. The proud channel makes physical
 * attachment visible without running the long trail through an opaque cuboid.
 * The legacy behindZ argument remains API-compatible; it cannot hide transfers. */
export function semanticFlowPoints(from: Vec3, to: Vec3, _behindZ: number): Vec3[] {
  const front = Math.max(from[2], to[2]) + 0.45
  const side = 0.28
  return [from, [from[0] + side, from[1], from[2] + 0.12],
    [from[0] + side, from[1], front], [to[0] + side, to[1], front],
    [to[0] + side, to[1], to[2] + 0.12], to]
}

export function relevantFlowHistory(transitions: readonly SemanticTransition[], selectedId: string | null, cursor: number, limit = 8): SemanticTransition[] {
  const prior = transitions.filter((item) => item.seq < cursor && transitionIsFlow(item))
  const relevant = selectedId ? prior.filter((item) => item.from?.id === selectedId || item.to?.id === selectedId) : prior
  return relevant.slice(-limit)
}
