import type { TimelineStore, TimelineAction, TimelineState } from '../timeline/timelineStore'
import type { CursorChangeReason, TransitionPlayer } from './transitionPlayer'

function reasonFor(action: TimelineAction, after: TimelineState): CursorChangeReason {
  if (action.type === 'head') return 'live'
  if (action.type === 'tick') return after.direction === 'forward' ? 'play' : 'reverse'
  if (action.type === 'stepForward' || action.type === 'stepBack') return 'step'
  if (action.type === 'replay') return 'replay'
  if (action.type === 'returnLive' || action.type === 'lens' || action.type === 'reset') return 'lens'
  return after.scrubbing ? 'scrub' : 'seek'
}

/** One binding per player, surviving effect reattachment without replaying a prefix. */
export function createTimelineMotionBinding(player: TransitionPlayer, timeline: TimelineStore, reduced: () => boolean) {
  let initialized = false, lastCursor = 0
  return () => {
    // Subscribe before examining the head: no already-published first batch is lost.
    const unsubscribe = timeline.subscribeAction((before, after, action) => {
      lastCursor = after.cursor
      if (action.type === 'beginScrub') { player.scrubStarted(); return }
      if (action.type === 'endScrub') { player.scrubEnded(after.cursor); return }
      const lensChanged = before.lens !== after.lens
      if (before.cursor === after.cursor && !lensChanged && action.type !== 'reset') return
      player.cursorChanged({ from: before.cursor, to: after.cursor, reason: lensChanged && action.type === 'head' ? 'lens' : reasonFor(action, after), speed: after.speed, reducedMotion: reduced() })
    })
    const state = timeline.getSnapshot().state
    if (!initialized) {
      initialized = true
      lastCursor = state.cursor
      // Scrub can be the first interaction before any semantic cursor change.
      // Initialize the preference even for an empty HISTORY prefix.
      player.cursorChanged({from:state.cursor,to:state.cursor,reason:'seek',speed:state.speed,reducedMotion:reduced()})
      if (state.scrubbing) player.scrubStarted()
      else if (state.lens === 'LIVE' && state.cursor > 0) player.cursorChanged({ from: 0, to: state.cursor, reason: 'live', speed: state.speed, reducedMotion: reduced() })
    } else if (lastCursor !== state.cursor) {
      player.cursorChanged({ from: lastCursor, to: state.cursor, reason: state.lens === 'LIVE' ? 'live' : 'seek', speed: state.speed, reducedMotion: reduced() })
      lastCursor = state.cursor
    }
    return unsubscribe
  }
}
