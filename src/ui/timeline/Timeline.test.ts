import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { TraceDocument, TraceEvent } from '../../contracts/runtime'
import type { PlaybackApi } from '../../playback'
import { DEFAULT_PLAYBACK_STATE, transitionPlayback } from '../../playback/playbackState'
import { markerIndices, resolveTimelinePosition, Timeline } from './Timeline'
import { normalizeTrace, type InstrumentationSourceManifest } from '../../instrumentation/normalize'
import type { RawRuntimeEvent, RecordingStatus } from '../../instrumentation/contracts'
import { seek, validateTrace } from '../../runtime'

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

describe('last recorded event terminal', () => {
  const manifest: InstrumentationSourceManifest = {
    sources: [{ fileId: 'Main.java', name: 'Main.java', content: 'class Main {}', sha256: 'hash' }],
    classes: [{ className: 'Main', sourceFile: 'Main.java', fileId: 'Main.java', sourceSha256: 'hash', status: 'resolved', candidates: ['Main.java'] }],
  }
  const raw: RawRuntimeEvent[] = [
    { v: 1, seq: 0, threadId: '1', type: 'enter', frameId: '1', className: 'Main', methodName: 'main',
      descriptor: '()V', line: 1, site: 0, callerFrameId: null, receiver: null, parameters: [] },
    { v: 1, seq: 1, threadId: '1', type: 'local', frameId: '1', className: 'Main', methodName: 'main',
      descriptor: 'I', line: 1, site: 1, slot: 1, name: 'value', liveRange: 'value', value: { kind: 'int', value: 7 } },
  ]
  const recording: RecordingStatus = { state: 'STOPPED_LIMIT', reason: 'Event budget reached', budget: 'events',
    lastRecordedSeq: 1, executionContinued: true }
  const trace = validateTrace(normalizeTrace(raw, manifest, {
    status: 'live', exitCode: null, diagnostic: null, recording,
  }).trace)

  it.each(['RUNNING', 'COMPLETED', 'FAILED'] as const)('shows a closed visual prefix independently of actual Java phase %s', (phase) => {
    const final = seek(trace, trace.events.length)
    expect(final).toMatchObject({ status: 'partial', activeFrameIds: ['jvm:frame:1'], recordingStop: recording })
    expect(Object.values(final.frames['jvm:frame:1'].locals)[0].value).toMatchObject({ value: 7 })
    const html = renderToStaticMarkup(createElement(Timeline, { trace, playback: playback(trace.events.length),
      execution: { phase, lens: 'LIVE', liveCursor: trace.events.length, onReturnToLive: () => {} },
    }))
    expect(html).toContain('class="vj-timeline__event" aria-live="polite">Last recorded event · Event budget reached')
    expect(html).toContain('LAST RECORDED')
    expect(html).toContain(`Last recorded event at event ${trace.events.length}`)
    expect(html).toContain('Replay recorded history')
    expect(html).not.toContain('Live head at event')
    expect(html).not.toContain('Program completed')
    expect(html).not.toContain('Program failed')
  })

  it('can scrub backward through a partial state and return to its last observed endpoint', () => {
    const final = seek(trace, trace.events.length)
    const previous = seek(trace, trace.events.length - 1)
    expect(previous.status).toBe('running')
    expect(previous.frames).toEqual(final.frames)
    expect(seek(trace, trace.events.length)).toEqual(final)
    const html = renderToStaticMarkup(createElement(Timeline, { trace, playback: playback(2),
      execution: { phase: 'COMPLETED', lens: 'HISTORY', liveCursor: trace.events.length, onReturnToLive: () => {} },
    }))
    expect(html).toContain('Return to last recorded event')
    expect(html).toContain('HISTORY')
    expect(html).not.toContain('Return to Live')
    expect(html).toContain('value="2"')
  })

  it('keeps the Java completion label for an actually complete observed trace', () => {
    const trace = validateTrace(normalizeTrace([...raw, { ...raw[0], type: 'exit', seq: 2, frameId: '1' }], manifest,
      { status: 'complete', exitCode: 0, diagnostic: null }).trace)
    expect(seek(trace, trace.events.length).status).toBe('ended')
    const html = renderToStaticMarkup(createElement(Timeline, { trace, playback: playback(trace.events.length) }))
    expect(html).toContain('Program completed')
    expect(html).not.toContain('Last recorded event')
  })
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
