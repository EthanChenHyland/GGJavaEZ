import { expect, it } from 'vitest'
import { acceptedNormalizedHead } from './playbackState'
import { createTimelineState, reconcileTimelineHost, transitionTimeline, type TimelineAction } from './timelineStore'
import { timelineCaption, timelineControls, timelineKeyAction } from './timelineControls'
import type { TraceEvent } from '../contracts/runtime'

it('applies normalized prefixes in both directions, including the empty prefix of a nonempty trace', () => {
  let state = createTimelineState('first', 3)
  state = transitionTimeline(state, { type: 'stepForward' })
  expect(state.cursor).toBe(1)
  state = transitionTimeline(state, { type: 'stepBack' })
  expect(state.cursor).toBe(0)
  state = transitionTimeline(state, { type: 'seek', cursor: 999 })
  expect(state.cursor).toBe(3)
  expect(transitionTimeline(state, { type: 'seek', cursor: -3 }).cursor).toBe(0)
  expect(transitionTimeline(state, { type: 'seek', cursor: NaN }).cursor).toBe(0)
  expect(transitionTimeline(state, { type: 'seek', cursor: 1.8 }).cursor).toBe(2)
})

it('Replay starts at zero and forward/reverse playback stops at its own endpoint', () => {
  let state = transitionTimeline(createTimelineState('recording', 2), { type: 'replay' })
  expect(state).toMatchObject({ cursor: 0, playing: true, direction: 'forward', lens: 'HISTORY' })
  state = transitionTimeline(state, { type: 'tick' })
  expect(state).toMatchObject({ cursor: 1, playing: true })
  state = transitionTimeline(state, { type: 'tick' })
  expect(state).toMatchObject({ cursor: 2, playing: false })
  state = transitionTimeline(state, { type: 'reversePlay' })
  state = transitionTimeline(state, { type: 'tick' })
  expect(state).toMatchObject({ cursor: 1, playing: true, direction: 'reverse' })
  state = transitionTimeline(state, { type: 'tick' })
  expect(state).toMatchObject({ cursor: 0, playing: false })
  expect(transitionTimeline(state, { type: 'playPause' })).toMatchObject({ cursor: 0, playing: true, direction: 'forward' })
})

it('live publication grows N while HISTORY holds c, then Return to Live follows accepted N', () => {
  let state = transitionTimeline(createTimelineState('recording', 3), { type: 'returnLive' })
  state = transitionTimeline(state, { type: 'head', liveHead: 5 })
  expect(state).toMatchObject({ cursor: 5, liveHead: 5, lens: 'LIVE' })
  state = transitionTimeline(state, { type: 'seek', cursor: 0 })
  state = transitionTimeline(state, { type: 'head', liveHead: 7, partial: true })
  expect(state).toMatchObject({ cursor: 0, liveHead: 7, lens: 'HISTORY', boundary: 7 })
  state = transitionTimeline(state, { type: 'returnLive' })
  expect(state).toMatchObject({ cursor: 7, liveHead: 7, lens: 'LIVE', boundary: 7 })
})

it('zero/multiple/deferred normalization emissions update only their published semantic head', () => {
  let state = createTimelineState('recording')
  // The same raw boundary can cause zero emissions, several emissions, then real finish control Events.
  for (const head of [0, 0, 2, 2, 4]) state = transitionTimeline(state, { type: 'head', liveHead: head, partial: true })
  expect(state).toMatchObject({ cursor: 0, liveHead: 4, boundary: 4 })
  expect(transitionTimeline(state, { type: 'returnLive' }).cursor).toBe(4)
  expect(acceptedNormalizedHead(4, 1000)).toBe(4)
  expect(acceptedNormalizedHead(4, 2)).toBe(2)
  expect(acceptedNormalizedHead(4, NaN)).toBe(0)
})

it('all empty-recording user actions and slider activation keys are no-ops', () => {
  const state = createTimelineState('empty')
  const actions: TimelineAction[] = ['playPause', 'reversePlay', 'stepForward', 'stepBack', 'replay', 'returnLive', 'beginScrub', 'endScrub', 'tick'].map((type) => ({ type } as TimelineAction))
  actions.push({ type: 'seek', cursor: 10 }, { type: 'speed', speed: 4 })
  for (const action of actions) expect(transitionTimeline(state, action)).toBe(state)
  for (const key of [' ', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) expect(timelineKeyAction(key, state)).toBeNull()
  expect(timelineControls(state)).toEqual({ empty: true, canPlayPause: false, canStepBack: false, canStepForward: false, canReverse: false, canReplay: false, canReturnLive: false })
})

it('scrubbing stops playback, exposes semantic cursor immediately, and releases without replaying crossed Events', () => {
  let state = transitionTimeline(createTimelineState('recording', 8), { type: 'replay' })
  state = transitionTimeline(state, { type: 'beginScrub' })
  state = transitionTimeline(state, { type: 'seek', cursor: 6 })
  expect(state).toMatchObject({ cursor: 6, scrubbing: true, playing: false, lens: 'HISTORY' })
  expect(transitionTimeline(state, { type: 'tick' })).toBe(state)
  expect(transitionTimeline(state, { type: 'endScrub' })).toMatchObject({ cursor: 6, playing: false, scrubbing: false })
})

it('debug commands never seek or change lens; new recordings reset zero and retain speed', () => {
  const state = { ...createTimelineState('old', 20, 2), cursor: 12 }
  expect(transitionTimeline(state, { type: 'debugCommand' })).toBe(state)
  expect(transitionTimeline(state, { type: 'reset', recordingId: 'new', liveHead: 3 })).toEqual(createTimelineState('new', 3, 2))
})

it('stale host LIVE props cannot undo a synchronous manual HISTORY handoff', () => {
  let host = reconcileTimelineHost({ state: createTimelineState('r', 4), observedHostLens: null }, { recordingId: 'r', liveHead: 4, partial: false, hostLens: 'LIVE' })
  expect(host.state.cursor).toBe(4)
  host = { ...host, state: transitionTimeline(host.state, { type: 'seek', cursor: 1 }) }
  host = reconcileTimelineHost(host, { recordingId: 'r', liveHead: 6, partial: false, hostLens: 'LIVE' })
  expect(host.state).toMatchObject({ cursor: 1, lens: 'HISTORY', liveHead: 6 })
  host = reconcileTimelineHost(host, { recordingId: 'r', liveHead: 6, partial: false, hostLens: 'HISTORY' })
  expect(host.state.cursor).toBe(1)
  host = { ...host, state: transitionTimeline(host.state, { type: 'returnLive' }) }
  host = reconcileTimelineHost(host, { recordingId: 'r', liveHead: 7, partial: false, hostLens: 'HISTORY' })
  expect(host.state).toMatchObject({ cursor: 7, lens: 'LIVE' })
  expect(reconcileTimelineHost(host, { recordingId: 'viewer', liveHead: 20, partial: false }).state.cursor).toBe(0)
})

it('caption uses Events[c−1] and hides normalized seq at zero', () => {
  const events = [{ eventId: 'not-a-number', seq: 0, label: 'Recorded label only' }] as TraceEvent[]
  expect(timelineCaption(events, { cursor: 0, liveHead: 1 })).toEqual({ caption: '0 / 1', summary: 'Before execution', seq: null })
  expect(timelineCaption(events, { cursor: 1, liveHead: 1 })).toEqual({ caption: '1 / 1', summary: 'Recorded label only', seq: 0 })
  expect(timelineKeyAction('End', createTimelineState('r', 1))).toEqual({ type: 'returnLive' })
})
