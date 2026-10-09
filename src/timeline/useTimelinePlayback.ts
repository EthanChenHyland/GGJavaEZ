import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { TraceDocument } from '../contracts/runtime'
import type { EmbeddedExecution } from '../shell/runtimeContracts'
import { acceptedNormalizedHead, type PlaybackSpeed } from './playbackState'
import { createMilestoneIndex } from './milestones'
import { createTimelineStore, type TimelineAction, type TimelineState, type TimelineStore } from './timelineStore'

export interface TimelinePlaybackApi {
  state: TimelineState
  store: TimelineStore
  playPause(): void
  reversePlay(): void
  stepForward(): void
  stepBack(): void
  seekTo(cursor: number): void
  setSpeed(speed: PlaybackSpeed): void
  replay(): void
  returnToLive(): void
  beginScrub(): void
  endScrub(): void
}
export function timelineRecordingId(trace: TraceDocument): string {
  return JSON.stringify([trace.demoId, trace.capture?.recordedAt ?? null])
}
export const BASE_EVENT_MS = 680

/** Own above World/source/Inspector. Host onLensChange owns only the host lens, never this cursor. */
export function useTimelinePlayback(trace: TraceDocument, execution?: EmbeddedExecution): TimelinePlaybackApi {
  const recordingId = timelineRecordingId(trace)
  const liveHead = acceptedNormalizedHead(trace.events.length, execution?.liveCursor)
  const index = useRef({ recordingId, milestones: createMilestoneIndex() })
  if (index.current.recordingId !== recordingId || liveHead < index.current.milestones.count) index.current = { recordingId, milestones: createMilestoneIndex() }
  index.current.milestones.extend(trace.events, index.current.milestones.count, liveHead)
  const partial = index.current.milestones.recordingStop() !== null
  const store=useMemo(()=>createTimelineStore({recordingId,liveHead,partial,hostLens:execution?.lens}),[recordingId])
  const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot)
  // A live prefix is committed before paint; a new Recording starts with its own store.
  useLayoutEffect(()=>{store.reconcile({recordingId,liveHead,partial,hostLens:execution?.lens})},[store,recordingId,liveHead,partial,execution?.lens])
  const host = useRef(execution)
  host.current = execution

  const commit = useCallback((action: TimelineAction) => {
    if(!store.dispatch(action))return
    const state=store.getSnapshot().state
    if (action.type !== 'speed' && action.type !== 'tick' && action.type !== 'endScrub') host.current?.onLensChange(state.lens, state.cursor)
  }, [store])

  const state = snapshot.state
  useEffect(() => {
    if (!state.playing || state.scrubbing) return
    const expectedRecording = state.recordingId
    const timer = globalThis.setTimeout(() => {
      if (store.getSnapshot().state.recordingId === expectedRecording) commit({ type: 'tick' })
    }, BASE_EVENT_MS / state.speed)
    return () => globalThis.clearTimeout(timer)
  }, [commit, state.cursor, state.direction, state.playing, state.recordingId, state.scrubbing, state.speed, state.liveHead])

  return { state, store,
    playPause: useCallback(() => commit({ type: 'playPause' }), [commit]),
    reversePlay: useCallback(() => commit({ type: 'reversePlay' }), [commit]),
    stepForward: useCallback(() => commit({ type: 'stepForward' }), [commit]),
    stepBack: useCallback(() => commit({ type: 'stepBack' }), [commit]),
    seekTo: useCallback((cursor: number) => commit({ type: 'seek', cursor }), [commit]),
    setSpeed: useCallback((speed: PlaybackSpeed) => commit({ type: 'speed', speed }), [commit]),
    replay: useCallback(() => commit({ type: 'replay' }), [commit]),
    returnToLive: useCallback(() => commit({ type: 'returnLive' }), [commit]),
    beginScrub: useCallback(() => commit({ type: 'beginScrub' }), [commit]),
    endScrub: useCallback(() => commit({ type: 'endScrub' }), [commit]),
  }
}
