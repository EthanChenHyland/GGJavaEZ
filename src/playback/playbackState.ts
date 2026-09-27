import type { PlaybackState } from '../contracts/interaction'

export const DEFAULT_PLAYBACK_STATE: PlaybackState = {
  cursor: 0,
  playing: false,
  speed: 1,
}

export type PlaybackAction =
  | { type: 'toggle'; eventCount: number }
  | { type: 'tick'; eventCount: number }
  | { type: 'stepForward'; eventCount: number }
  | { type: 'stepBack' }
  | { type: 'seek'; cursor: number; eventCount: number }
  | { type: 'setSpeed'; speed: PlaybackState['speed'] }
  | { type: 'reset' }

function boundedCursor(cursor: number, eventCount: number): number {
  if (!Number.isFinite(cursor)) return 0
  return Math.min(Math.max(Math.round(cursor), 0), eventCount)
}

/** Pure cursor transitions; rendering and runtime reconstruction consume the resulting cursor. */
export function transitionPlayback(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case 'toggle': {
      if (action.eventCount === 0) return { ...state, cursor: 0, playing: false }
      if (state.playing) return { ...state, playing: false }
      return {
        ...state,
        cursor: state.cursor >= action.eventCount ? 0 : state.cursor,
        playing: true,
      }
    }
    case 'tick': {
      if (!state.playing) return state
      const cursor = Math.min(state.cursor + 1, action.eventCount)
      return { ...state, cursor, playing: cursor < action.eventCount }
    }
    case 'stepForward':
      return { ...state, cursor: Math.min(state.cursor + 1, action.eventCount), playing: false }
    case 'stepBack':
      return { ...state, cursor: Math.max(state.cursor - 1, 0), playing: false }
    case 'seek':
      return { ...state, cursor: boundedCursor(action.cursor, action.eventCount), playing: false }
    case 'setSpeed':
      return { ...state, speed: action.speed }
    case 'reset':
      return { ...DEFAULT_PLAYBACK_STATE, speed: state.speed }
  }
}
