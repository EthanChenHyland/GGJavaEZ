import type { LayoutState, SceneModel, Vec3 } from '../contracts/world'
import type { SemanticTransition, FlowEndpoint } from './semanticTransition'

export function ioPosition(id: 'stdin' | 'stdout' | 'stderr', scene: SceneModel): Vec3 {
  const bounds = scene.bounds
  const center = bounds?.center ?? [0, 0, 0]
  const bottom = bounds ? center[1] - bounds.size[1] / 2 : -1.2
  const front = bounds ? center[2] + bounds.size[2] / 2 : 1.4
  const offset = id === 'stdin' ? -1.5 : id === 'stdout' ? 0 : 1.5
  return [center[0] + offset, bottom - 0.55, front + 1.3]
}

/** Resolve against reserved anchors, never the current visible entity count. */
export function endpointPosition(endpoint: FlowEndpoint | undefined, layout: LayoutState, scene: SceneModel): Vec3 | null {
  if (!endpoint) return null
  if (endpoint.kind === 'io') return ioPosition(endpoint.id, scene)
  const stage = scene.presentation === 'theater' && layout.theater ? layout.theater : layout
  if (endpoint.kind === 'slot') {
    for (const anchor of Object.values(stage.anchors)) if (anchor.ports[endpoint.id]) return anchor.ports[endpoint.id]
    return stage.anchors[endpoint.id]?.bodyPort ?? null
  }
  return stage.anchors[endpoint.id]?.bodyPort ?? null
}

export function transitionIsFlow(transition: SemanticTransition): boolean {
  return Boolean(transition.from && transition.to && transition.kind !== 'frame-enter' && transition.kind !== 'frame-exit' && transition.kind !== 'exception')
}

/** Travel in a shared rear channel, entering only at semantic ports. This keeps
 * value trails off frame titles and field labels for any trace/layout. */
export function semanticFlowPoints(from: Vec3, to: Vec3, behindZ: number): Vec3[] {
  const rear = Math.min(behindZ, from[2] - 0.15, to[2] - 0.15)
  return [from, [from[0], from[1], rear], [to[0], to[1], rear], to]
}

export function relevantFlowHistory(transitions: readonly SemanticTransition[], selectedId: string | null, cursor: number, limit = 8): SemanticTransition[] {
  const prior = transitions.filter((item) => item.seq < cursor && transitionIsFlow(item))
  const relevant = selectedId ? prior.filter((item) => item.from?.id === selectedId || item.to?.id === selectedId) : prior
  return relevant.slice(-limit)
}
