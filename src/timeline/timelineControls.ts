import type { TraceEvent } from '../contracts/runtime'
import type { TimelineAction, TimelineState } from './timelineStore'
export function timelineControls(state: TimelineState) {
  const empty = state.liveHead === 0
  return { empty, canPlayPause: !empty && (state.playing || !state.scrubbing && state.cursor < state.liveHead),
    canStepBack: !empty && state.cursor > 0, canStepForward: !empty && state.cursor < state.liveHead,
    canReverse: !empty && state.cursor > 0 && !state.scrubbing, canReplay: !empty,
    canReturnLive: !empty && state.lens === 'HISTORY' }
}
export function timelineKeyAction(key: string, state: TimelineState): TimelineAction | null {
  const controls = timelineControls(state)
  if (controls.empty) return null
  switch (key) {
    case ' ': case 'Spacebar': return controls.canPlayPause ? { type: 'playPause' } : null
    case 'ArrowLeft': return controls.canStepBack ? { type: 'stepBack' } : null
    case 'ArrowRight': return controls.canStepForward ? { type: 'stepForward' } : null
    case 'Home': return { type: 'seek', cursor: 0 }
    case 'End': return { type: 'returnLive' }
    default: return null
  }
}
export function timelineCaption(events: readonly TraceEvent[], state: Pick<TimelineState, 'cursor' | 'liveHead'>) {
  const event = state.cursor > 0 && state.cursor <= state.liveHead ? events[state.cursor - 1] : undefined
  return { caption: `${state.cursor} / ${state.liveHead}`, summary: event ? event.label : 'Before execution', seq: event?.seq ?? null }
}
