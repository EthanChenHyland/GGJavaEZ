import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAYBACK_STATE, transitionPlayback } from './playbackState'

describe('playback cursor transitions', () => {
  it('steps through 0..N and stops on the final event', () => {
    let state = transitionPlayback(DEFAULT_PLAYBACK_STATE, { type: 'toggle', eventCount: 3 })
    expect(state).toEqual({ cursor: 0, playing: true, speed: 1 })
    state = transitionPlayback(state, { type: 'tick', eventCount: 3 })
    state = transitionPlayback(state, { type: 'tick', eventCount: 3 })
    state = transitionPlayback(state, { type: 'tick', eventCount: 3 })
    expect(state).toEqual({ cursor: 3, playing: false, speed: 1 })
    expect(transitionPlayback(state, { type: 'toggle', eventCount: 3 })).toEqual({ cursor: 0, playing: true, speed: 1 })
  })

  it('manual stepping and scrubbing pause and stay within trace bounds', () => {
    const playing = transitionPlayback(DEFAULT_PLAYBACK_STATE, { type: 'toggle', eventCount: 5 })
    expect(transitionPlayback(playing, { type: 'seek', cursor: 4, eventCount: 5 })).toEqual({ cursor: 4, playing: false, speed: 1 })
    const stepped = transitionPlayback(playing, { type: 'stepForward', eventCount: 5 })
    expect(stepped).toEqual({ cursor: 1, playing: false, speed: 1 })
    expect(transitionPlayback(stepped, { type: 'tick', eventCount: 5 })).toBe(stepped)
    expect(transitionPlayback(stepped, { type: 'seek', cursor: 99, eventCount: 5 }).cursor).toBe(5)
    expect(transitionPlayback(stepped, { type: 'seek', cursor: -4, eventCount: 5 }).cursor).toBe(0)
    expect(transitionPlayback(stepped, { type: 'stepBack' }).cursor).toBe(0)
  })

  it('preserves playback speed across reset', () => {
    const fast = transitionPlayback(DEFAULT_PLAYBACK_STATE, { type: 'setSpeed', speed: 4 })
    const advanced = transitionPlayback(fast, { type: 'stepForward', eventCount: 2 })
    expect(transitionPlayback(advanced, { type: 'reset' })).toEqual({ cursor: 0, playing: false, speed: 4 })
    expect(transitionPlayback(DEFAULT_PLAYBACK_STATE, { type: 'toggle', eventCount: 0 })).toEqual(DEFAULT_PLAYBACK_STATE)
  })
})
