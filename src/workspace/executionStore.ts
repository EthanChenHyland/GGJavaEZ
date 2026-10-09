import { createStore } from 'zustand/vanilla'
import type { RuntimeState,TraceDocument } from '../contracts/runtime'
import type { ExecutionSession } from '../execution/contracts'
import type { BuildResult } from '../ide/contracts'
import type { VisualizationCapabilityReport } from '../instrumentation/contracts'

export interface ExecutionState {
  build: BuildResult | null
  endedAt: string | null
  execution: ExecutionSession | null
  visualization: { sessionId: string; trace: TraceDocument; capability: VisualizationCapabilityReport } | null
  runtime: RuntimeState | null
}
export const executionStore = createStore<ExecutionState>(() => ({
  build: null,
  endedAt: null,
  execution: null,
  visualization: null,
  runtime: null,
}))
