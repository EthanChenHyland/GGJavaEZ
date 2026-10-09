import { createStore } from 'zustand/vanilla'
import type { ResolvedBreakpoint } from '../debugger/contracts'
import type { BreakpointProjection } from './workspaceTypes'

export interface DebugState {
  breakpoints: ResolvedBreakpoint[]
  breakpointProjection: BreakpointProjection | null
}
export const debugStore = createStore<DebugState>(() => ({
  breakpoints: [],
  breakpointProjection: null,
}))
