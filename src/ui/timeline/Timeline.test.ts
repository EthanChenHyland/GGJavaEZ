import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TraceDocument, TraceEvent } from '../../contracts/runtime'
import type { PlaybackApi } from '../../playback'
import { DEFAULT_PLAYBACK_STATE, transitionPlayback } from '../../playback/playbackState'
import { markerIndices, resolveTimelinePosition, Timeline } from './Timeline'

const events = (count: number): TraceEvent[] => Array.from({ length: count }, (_, seq) => ({
  type: 'PROGRAM_START', eventId: `event:${seq}`, seq, source: null, label: `Event ${seq}`,
  importance: seq % 13 === 0 ? 'major' : 'quiet',
}))

describe('large real trace timeline', () => {
  it('keeps exact markers for short traces and samples a bounded ordered set for 20k probes', () => {
    expect(markerIndices(events(24))).toEqual(Array.from({ length: 24 }, (_, index) => index))
    const selected = markerIndices(events(20_000))
    expect(selected.length).toBeLessThanOrEqual(240)
    expect(selected[0]).toBe(0)
    expect(selected.at(-1)).toBe(19_999)
    expect(new Set(selected).size).toBe(selected.length)
    expect(selected).toEqual([...selected].sort((a, b) => a - b))
  })
  it('leaves room between neighboring dots at narrow widths without moving event coordinates', () => {
    const selected = markerIndices(events(20000), 40)
    const requiredGap = Math.ceil(19999 / 39)
    expect(selected[0]).toBe(0)
    expect(selected.at(-1)).toBe(19999)
    for (let i = 1; i < selected.length; i++) expect(selected[i] - selected[i - 1]).toBeGreaterThanOrEqual(requiredGap)
    expect(markerIndices(events(2), 1)).toEqual([0, 1])
  })
})

const recorded: TraceDocument = { schemaVersion: 2, demoId: 'debug:one-session', sourceFiles: [], events: events(6) }
const playback = (cursor: number, playing = false): PlaybackApi => ({
  state: { cursor, playing, speed: 1 },
  playPause: () => {}, stepForward: () => {}, stepBack: () => {}, seekTo: () => {}, setSpeed: () => {}, reset: () => {},
})

describe('live and historical execution rail', () => {
  it('advances LIVE with the observed prefix while HISTORY holds its explicit cursor', () => {
    expect(resolveTimelinePosition(3, 1, { lens: 'LIVE', liveCursor: 3 })).toEqual({ cursor: 3, liveCursor: 3 })
    expect(resolveTimelinePosition(6, 1, { lens: 'LIVE', liveCursor: 6 })).toEqual({ cursor: 6, liveCursor: 6 })
    expect(resolveTimelinePosition(6, 1, { lens: 'HISTORY', liveCursor: 6 })).toEqual({ cursor: 1, liveCursor: 6 })
    expect(resolveTimelinePosition(6, 1, { lens: 'LIVE', liveCursor: 6 })).toEqual({ cursor: 6, liveCursor: 6 })
    const first = renderToStaticMarkup(createElement(Timeline, { trace: { ...recorded, events: recorded.events.slice(0, 3) }, playback: playback(1),
      execution: { phase: 'RUNNING', lens: 'LIVE', liveCursor: 3, onReturnToLive: () => {} },
    }))
    const grown = renderToStaticMarkup(createElement(Timeline, { trace: recorded, playback: playback(1),
      execution: { phase: 'RUNNING', lens: 'LIVE', liveCursor: 6, onReturnToLive: () => {} },
    }))
    expect(first).toContain('3 / 3')
    expect(grown).toContain('6 / 6')
  })

  it('shows separate historical playhead, live head, and Return to Live without debugger controls', () => {
    const html = renderToStaticMarkup(createElement(Timeline, { trace: recorded, playback: playback(2),
      execution: { phase: 'PAUSED', lens: 'HISTORY', liveCursor: 6, onReturnToLive: () => {} },
    }))
    expect(html).toContain('HISTORY')
    expect(html).toContain('2 / 6')
    expect(html).toContain('Return to Live')
    expect(html).toContain('Live head at event 6')
    expect(html).toContain('Replay recorded history')
    expect(html).not.toContain('Continue JVM')
    expect(html).toContain('value="2"')
  })

  it('keeps a completed execution replayable, then returns to its latest state', () => {
    const started = transitionPlayback({ ...DEFAULT_PLAYBACK_STATE, cursor: 6 }, { type: 'toggle', eventCount: 6 })
    expect(started).toMatchObject({ cursor: 0, playing: true })
    const replayed = transitionPlayback(started, { type: 'tick', eventCount: 6 })
    expect(resolveTimelinePosition(6, replayed.cursor, { lens: 'HISTORY', liveCursor: 6 }).cursor).toBe(1)
    expect(resolveTimelinePosition(6, replayed.cursor, { lens: 'LIVE', liveCursor: 6 }).cursor).toBe(6)
    const html = renderToStaticMarkup(createElement(Timeline, { trace: recorded, playback: playback(6),
      execution: { phase: 'COMPLETED', lens: 'LIVE', liveCursor: 6, onReturnToLive: () => {} },
    }))
    expect(html).toContain('Replay recorded history')
    expect(html).toContain('LIVE')
    expect(html).not.toContain('Return to Live')
  })

  it('keeps the curated playback labels and controls when no session is supplied', () => {
    const html = renderToStaticMarkup(createElement(Timeline, { trace: recorded, playback: playback(2) }))
    expect(html).toContain('Play execution')
    expect(html).toContain('Reset execution')
    expect(html).not.toContain('Live head at event')
    expect(html).not.toContain('Return to Live')
  })
})
