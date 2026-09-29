import { useCallback, useEffect, useReducer } from 'react'
import type { PlaybackState } from '../contracts/interaction'
import type { TraceDocument } from '../contracts/runtime'
import { DEFAULT_PLAYBACK_STATE, transitionPlayback } from './playbackState'

/** One hook instance should be owned above source, scene, inspector, and timeline. */
export interface PlaybackApi {
  state: PlaybackState
  playPause: () => void
  stepForward: () => void
  stepBack: () => void
  seekTo: (cursor: number) => void
  setSpeed: (speed: PlaybackState['speed']) => void
  reset: () => void
}

const BASE_EVENT_MS = 680

export function usePlayback(trace: TraceDocument): PlaybackApi {
  const [state, dispatch] = useReducer(transitionPlayback, DEFAULT_PLAYBACK_STATE)
  const eventCount = trace.events.length

  // A different trace always begins at its ready state. Keep the user's speed choice.
  useEffect(() => {
    dispatch({ type: 'reset' })
  }, [trace.demoId])

  useEffect(() => {
    if (!state.playing || state.cursor >= eventCount) return
    const timer = window.setTimeout(() => {
      dispatch({ type: 'tick', eventCount })
    }, BASE_EVENT_MS / state.speed)
    return () => window.clearTimeout(timer)
  }, [eventCount, state.cursor, state.playing, state.speed])

  const playPause = useCallback(() => dispatch({ type: 'toggle', eventCount }), [eventCount])
  const stepForward = useCallback(() => dispatch({ type: 'stepForward', eventCount }), [eventCount])
  const stepBack = useCallback(() => dispatch({ type: 'stepBack' }), [])
  const seekTo = useCallback((cursor: number) => dispatch({ type: 'seek', cursor, eventCount }), [eventCount])
  const setSpeed = useCallback((speed: PlaybackState['speed']) => dispatch({ type: 'setSpeed', speed }), [])
  const reset = useCallback(() => dispatch({ type: 'reset' }), [])

  return { state, playPause, stepForward, stepBack, seekTo, setSpeed, reset }
}
