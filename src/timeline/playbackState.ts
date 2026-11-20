export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4] as const
export type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number]
export type PlaybackDirection = 'forward' | 'reverse'
export interface TimelinePlaybackState {
  cursor: number
  playing: boolean
  speed: PlaybackSpeed
  direction: PlaybackDirection
  scrubbing: boolean
}

/** All positions are normalized applied-prefix lengths. Raw recorder seq is never an input. */
export function boundedPrefix(cursor: number, liveHead: number): number {
  const head = Number.isFinite(liveHead) ? Math.max(0, Math.trunc(liveHead)) : 0
  return Number.isFinite(cursor) ? Math.min(head, Math.max(0, Math.round(cursor))) : 0
}
export function acceptedNormalizedHead(eventCount: number, publishedHead = eventCount): number {
  return boundedPrefix(Math.floor(publishedHead), eventCount)
}
