import type { Selection } from '../contracts/interaction'
import type { ExecutionPhase, TimelineLens } from '../execution/contracts'
export interface RuntimeNavigation { revision: number; cursor: number; selection?: Selection }
export interface EmbeddedExecution {
  phase: ExecutionPhase
  lens: TimelineLens
  liveCursor: number
  onLensChange: (lens: TimelineLens, cursor: number) => void
}
