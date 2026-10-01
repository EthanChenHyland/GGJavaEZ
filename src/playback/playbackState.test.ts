import { describe, expect, it } from 'vitest'
import { DEFAULT_PLAYBACK_STATE, transitionPlayback } from './playbackState'
import type { PlaybackState } from '../contracts/interaction'
import { seek } from '../runtime'
import { loadPersonTrace } from '../examples/traces'

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

describe('finite playback boundaries', () => {
  const speeds: PlaybackState['speed'][] = [0.5, 1, 2, 4]

  it.each([1, 21])('naturally completes %i events at every speed and never loops on later ticks', (eventCount) => {
    for (const speed of speeds) {
      let state = transitionPlayback({ ...DEFAULT_PLAYBACK_STATE, speed }, { type: 'toggle', eventCount })
      for (let cursor = 1; cursor <= eventCount; cursor++) {
        state = transitionPlayback(state, { type: 'tick', eventCount })
        expect(state).toEqual({ cursor, speed, playing: cursor < eventCount })
      }
      const completed = state
      for (let tick = 0; tick < 10; tick++) {
        state = transitionPlayback(state, { type: 'tick', eventCount })
        expect(state).toBe(completed)
      }
    }
  })

  it('forward at completion stays final; back from completion pauses at the preceding event', () => {
    for (const speed of speeds) {
      const completed = { cursor: 21, playing: false, speed }
      expect(transitionPlayback(completed, { type: 'stepForward', eventCount: 21 })).toEqual(completed)
      const previous = transitionPlayback(completed, { type: 'stepBack' })
      expect(previous).toEqual({ cursor: 20, playing: false, speed })
      expect(transitionPlayback(previous, { type: 'stepForward', eventCount: 21 })).toEqual(completed)
    }
  })

  it('every manual cursor transition pauses, clamps to an endpoint, and preserves speed', () => {
    for (const speed of speeds) {
      for (const playing of [false, true]) {
        for (let cursor = 0; cursor <= 21; cursor++) {
          const state = { cursor, playing, speed }
          expect(transitionPlayback(state, { type: 'stepForward', eventCount: 21 })).toEqual({ cursor: Math.min(cursor + 1, 21), playing: false, speed })
          expect(transitionPlayback(state, { type: 'stepBack' })).toEqual({ cursor: Math.max(cursor - 1, 0), playing: false, speed })
          for (const destination of [0, 21, -10, 100]) {
            expect(transitionPlayback(state, { type: 'seek', cursor: destination, eventCount: 21 })).toEqual({ cursor: Math.max(0, Math.min(destination, 21)), playing: false, speed })
          }
        }
      }
    }
  })

  it('empty traces remain paused at zero through toggle, tick, steps, seek, and reset', () => {
    for (const speed of speeds) {
      let state = { ...DEFAULT_PLAYBACK_STATE, speed }
      const actions = [
        { type: 'toggle', eventCount: 0 },
        { type: 'tick', eventCount: 0 },
        { type: 'stepForward', eventCount: 0 },
        { type: 'stepBack' },
        { type: 'seek', cursor: 0, eventCount: 0 },
        { type: 'seek', cursor: 21, eventCount: 0 },
        { type: 'seek', cursor: -1, eventCount: 0 },
        { type: 'reset' },
      ] as const
      for (const action of actions) {
        state = transitionPlayback(state, action)
        expect(state).toEqual({ cursor: 0, playing: false, speed })
      }
    }
  })

  it('Play pauses a running trace, resumes a paused trace, and explicitly replays only from completion', () => {
    for (let cursor = 0; cursor <= 21; cursor++) {
      const paused = { cursor, playing: false, speed: 4 as const }
      expect(transitionPlayback(paused, { type: 'tick', eventCount: 21 })).toBe(paused)
      const running = transitionPlayback(paused, { type: 'toggle', eventCount: 21 })
      expect(running).toEqual({ cursor: cursor === 21 ? 0 : cursor, playing: true, speed: 4 })
      expect(transitionPlayback(running, { type: 'toggle', eventCount: 21 })).toEqual({ ...running, playing: false })
    }
  })

  it('repeated complete Person replays and endpoint seeks reconstruct identical runtime snapshots', () => {
    const trace = loadPersonTrace()
    const eventCount = trace.events.length
    expect(eventCount).toBe(21)
    const initial = seek(trace, 0)
    const final = seek(trace, eventCount)
    let state = { cursor: eventCount, playing: false, speed: 4 as PlaybackState['speed'] }
    for (let replay = 0; replay < 3; replay++) {
      state = transitionPlayback(state, { type: 'toggle', eventCount })
      expect(state.cursor).toBe(0)
      expect(seek(trace, state.cursor)).toEqual(initial)
      while (state.playing) state = transitionPlayback(state, { type: 'tick', eventCount })
      expect(state.cursor).toBe(eventCount)
      expect(seek(trace, state.cursor)).toEqual(final)
      for (const cursor of [0, eventCount, 0, eventCount]) {
        state = transitionPlayback(state, { type: 'seek', cursor, eventCount })
        expect(seek(trace, state.cursor)).toEqual(cursor === 0 ? initial : final)
      }
    }
  })
})
