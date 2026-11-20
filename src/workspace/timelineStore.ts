import { createStore } from 'zustand/vanilla'
import type { TimelineLens } from '../execution/contracts'

export interface TimelineState {
  timelineLens: TimelineLens
}
export const timelineStore = createStore<TimelineState>(() => ({
  timelineLens: 'LIVE',
}))
