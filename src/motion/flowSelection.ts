import type {SemanticTransition} from './semanticTransition'

export function transitionIsFlow(transition: SemanticTransition): boolean {
  return Boolean(transition.evidence !== 'local' && transition.from && transition.to && transition.kind !== 'frame-enter' && transition.kind !== 'frame-exit')
}

export function relevantFlowHistory(transitions: readonly SemanticTransition[], selectedId: string | null, cursor: number, limit = 8): SemanticTransition[] {
  const prior = transitions.filter((item) => item.seq < cursor && transitionIsFlow(item))
  const relevant = selectedId ? prior.filter((item) => item.from?.id === selectedId || item.to?.id === selectedId) : prior
  return relevant.slice(-limit)
}
