import { createStore } from 'zustand/vanilla'
import type { RuntimeNavigation } from '../shell/runtimeContracts'
import type { Selection } from '../contracts/interaction'

export interface InteractionState {
  runtimeSelection: Selection
  runtimeNavigation: RuntimeNavigation | null
}
export const interactionStore = createStore<InteractionState>(() => ({
  runtimeSelection: null,
  runtimeNavigation: null,
}))
