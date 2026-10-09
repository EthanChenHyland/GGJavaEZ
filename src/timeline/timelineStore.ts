import type { TimelineLens } from '../execution/contracts'
import { boundedPrefix, PLAYBACK_SPEEDS, type PlaybackSpeed, type TimelinePlaybackState } from './playbackState'

export interface TimelineState extends TimelinePlaybackState {
  recordingId: string
  liveHead: number
  lens: TimelineLens
  /** Accepted semantic boundary; never lastRecordedSeq. */
  boundary: number | null
}
export type TimelineAction =
  | { type: 'head'; liveHead: number; partial?: boolean }
  | { type: 'lens'; lens: TimelineLens }
  | { type: 'reset'; recordingId: string; liveHead: number }
  | { type: 'seek'; cursor: number }
  | { type: 'speed'; speed: PlaybackSpeed }
  | { type: 'playPause' | 'reversePlay' | 'stepForward' | 'stepBack' | 'tick' | 'replay' | 'returnLive' | 'beginScrub' | 'endScrub' | 'debugCommand' }

export function createTimelineState(recordingId: string, liveHead = 0, speed: PlaybackSpeed = 1): TimelineState {
  return { recordingId, liveHead: boundedPrefix(liveHead, liveHead), cursor: 0, playing: false,
    speed, direction: 'forward', scrubbing: false, lens: 'HISTORY', boundary: null }
}

/** Pure semantic cursor reducer; animation, debugger and runtime reduction are separate consumers. */
export function transitionTimeline(state: TimelineState, action: TimelineAction): TimelineState {
  if (action.type === 'reset') return createTimelineState(action.recordingId, action.liveHead, state.speed)
  if (action.type === 'debugCommand') return state
  if (action.type === 'head') {
    const liveHead = boundedPrefix(action.liveHead, action.liveHead)
    const cursor = state.lens === 'LIVE' ? liveHead : boundedPrefix(state.cursor, liveHead)
    const boundary = action.partial ? liveHead : null
    const playing = state.playing && liveHead > 0 && (state.direction === 'forward' ? cursor < liveHead : cursor > 0)
    if (liveHead === state.liveHead && cursor === state.cursor && boundary === state.boundary && playing === state.playing) return state
    return { ...state, liveHead, cursor, boundary, playing, scrubbing: liveHead === 0 ? false : state.scrubbing }
  }
  if (action.type === 'lens') {
    const cursor = action.lens === 'LIVE' ? state.liveHead : state.cursor
    return action.lens === state.lens && cursor === state.cursor ? state : { ...state, lens: action.lens, cursor, playing: false, scrubbing: false }
  }
  // Empty recordings disable every user action, including speed and keyboard actions.
  if (state.liveHead === 0) return state
  switch (action.type) {
    case 'speed': return PLAYBACK_SPEEDS.includes(action.speed) && action.speed !== state.speed ? { ...state, speed: action.speed } : state
    case 'seek': return { ...state, cursor: boundedPrefix(action.cursor, state.liveHead), playing: false, lens: 'HISTORY' }
    case 'stepForward': return state.cursor >= state.liveHead ? state : { ...state, cursor: state.cursor + 1, playing: false, direction: 'forward', lens: 'HISTORY' }
    case 'stepBack': return state.cursor <= 0 ? state : { ...state, cursor: state.cursor - 1, playing: false, direction: 'reverse', lens: 'HISTORY' }
    case 'playPause':
      if (state.playing) return { ...state, playing: false }
      if (state.scrubbing || state.cursor >= state.liveHead) return state
      return { ...state, playing: true, direction: 'forward', lens: 'HISTORY' }
    case 'reversePlay': return state.cursor <= 0 || state.scrubbing ? state : { ...state, playing: true, direction: 'reverse', lens: 'HISTORY' }
    case 'tick': {
      if (!state.playing || state.scrubbing) return state
      const cursor = boundedPrefix(state.cursor + (state.direction === 'forward' ? 1 : -1), state.liveHead)
      return { ...state, cursor, playing: state.direction === 'forward' ? cursor < state.liveHead : cursor > 0 }
    }
    case 'replay': return { ...state, cursor: 0, playing: true, direction: 'forward', scrubbing: false, lens: 'HISTORY' }
    case 'returnLive': return { ...state, cursor: state.liveHead, playing: false, scrubbing: false, lens: 'LIVE' }
    case 'beginScrub': return { ...state, playing: false, scrubbing: true, lens: 'HISTORY' }
    case 'endScrub': return state.scrubbing ? { ...state, scrubbing: false } : state
  }
}

export interface TimelineHostSnapshot { state: TimelineState; observedHostLens: TimelineLens | null }
/** A stale host LIVE prop cannot undo the user's synchronous switch to HISTORY. */
export function reconcileTimelineHost(snapshot: TimelineHostSnapshot, input: {
  recordingId: string; liveHead: number; partial: boolean; hostLens?: TimelineLens
}): TimelineHostSnapshot {
  const changedRecording = snapshot.state.recordingId !== input.recordingId
  let state = changedRecording ? createTimelineState(input.recordingId, input.liveHead, snapshot.state.speed) : snapshot.state
  state = transitionTimeline(state, { type: 'head', liveHead: input.liveHead, partial: input.partial })
  const hostLens = input.hostLens ?? null
  if (hostLens !== null && (changedRecording || hostLens !== snapshot.observedHostLens)) state = transitionTimeline(state, { type: 'lens', lens: hostLens })
  return state === snapshot.state && hostLens === snapshot.observedHostLens ? snapshot : { state, observedHostLens: hostLens }
}

export type TimelineHostInput=Parameters<typeof reconcileTimelineHost>[1]
/** One external cursor owner for the world, source, Inspector and transport. */
export function createTimelineStore(input:TimelineHostInput) {
 let snapshot=reconcileTimelineHost({state:createTimelineState(input.recordingId),observedHostLens:null},input)
 const listeners=new Set<()=>void>()
 const actions=new Set<(before:TimelineState,after:TimelineState,action:TimelineAction)=>void>()
 const publish=(next:TimelineHostSnapshot)=>{if(next===snapshot)return false;snapshot=next;for(const listener of listeners)listener();return true}
 return {
  getSnapshot:()=>snapshot,
  subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}},
  subscribeAction:(listener:(before:TimelineState,after:TimelineState,action:TimelineAction)=>void)=>{actions.add(listener);return()=>{actions.delete(listener)}},
  reconcile:(input:TimelineHostInput)=>{const before=snapshot.state,changed=publish(reconcileTimelineHost(snapshot,input));if(changed&&snapshot.state!==before)for(const listener of actions)listener(before,snapshot.state,{type:'head',liveHead:input.liveHead,partial:input.partial});return changed},
  dispatch:(action:TimelineAction)=>{const before=snapshot.state,state=transitionTimeline(before,action);if(state===before)return false;publish({...snapshot,state});for(const listener of actions)listener(before,state,action);return true},
 }
}
export type TimelineStore=ReturnType<typeof createTimelineStore>
