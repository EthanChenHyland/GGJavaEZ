import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Settings, Rewind } from 'lucide-react'
import type { TraceDocument } from '../../contracts/runtime'
import type { EmbeddedExecution } from '../runtimeContracts'
import { createMilestoneIndex } from '../../timeline/milestones'
import { eventCaption } from '../../timeline/milestonesCaption'
import { PLAYBACK_SPEEDS } from '../../timeline/playbackState'
import { timelineCaption, timelineControls } from '../../timeline/timelineControls'
import { timelineRecordingId, type TimelinePlaybackApi } from '../../timeline/useTimelinePlayback'
import { MilestoneTrack } from './MilestoneTrack'
import './timeDock.css'

export interface TimeDockSettings {
  reducedMotion: boolean
  onReducedMotionChange(value: boolean): void
  quality: 'INTERACTIVE' | 'CINEMATIC'
  onQualityChange(value: 'INTERACTIVE' | 'CINEMATIC'): void
  cinematicAvailable?: boolean
  cinematicReason?: string
}
export interface TimeDockProps { trace: TraceDocument; playback: TimelinePlaybackApi; execution?: EmbeddedExecution; settings?: TimeDockSettings }
function Control({ label, disabled, reason, action, children, className = '' }: {
  label: string; disabled: boolean; reason?: string; action(): void; children: ReactNode; className?: string
}) {
  return <button type="button" className={`gg-time-control ${className}`} aria-label={label} aria-disabled={disabled}
    title={disabled ? `${label} · ${reason ?? 'Unavailable at this recorded boundary'}` : label}
    onClick={() => { if (!disabled) action() }}>{children}</button>
}
function Speed({ playback, empty }: { playback: TimelinePlaybackApi; empty: boolean }) {
  return <select className="gg-time-speed" aria-label="Playback speed" aria-disabled={empty} value={playback.state.speed}
    title={empty ? 'Playback speed · The recording contains no Events' : 'Playback speed'}
    onPointerDown={(event) => { if (empty) event.preventDefault() }}
    onKeyDown={(event) => { if (empty && event.key !== 'Tab') event.preventDefault() }}
    onChange={(event) => { if (!empty) playback.setSpeed(Number(event.currentTarget.value) as typeof PLAYBACK_SPEEDS[number]) }}>
    {PLAYBACK_SPEEDS.map((speed) => <option key={speed} value={speed}>{speed.toFixed(2).replace(/0$/, '').replace(/\.0$/, '.0')}x</option>)}
  </select>
}

/** Fills the Shell's Time_Dock rectangle; this component never positions or resizes the World. */
export function TimeDock({ trace, playback, execution, settings }: TimeDockProps) {
  const recordingId = timelineRecordingId(trace), { state } = playback
  const index = useRef({ recordingId, milestones: createMilestoneIndex() })
  if (index.current.recordingId !== recordingId || state.liveHead < index.current.milestones.count) index.current = { recordingId, milestones: createMilestoneIndex() }
  index.current.milestones.extend(trace.events, index.current.milestones.count, state.liveHead)
  const caption = timelineCaption(trace.events, state), controls = timelineControls(state)
  const event = caption.seq === null ? undefined : trace.events[state.cursor - 1]
  const { headline, context } = event ? eventCaption(event) : { headline: caption.summary }
  const spokenCaption = context ? `${headline} · ${context}` : headline
  const summary = spokenCaption === caption.summary ? spokenCaption : `${spokenCaption}. Recorded label: ${caption.summary}`
  const eventDetails = event ? `Event seq ${event.seq} · ${summary}` : summary
  const [short, setShort] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024 && window.innerHeight < 760)
  const menu = useRef<HTMLDetailsElement>(null), menuButton = useRef<HTMLElement>(null)
  useEffect(() => {
    const update = () => setShort(window.innerWidth >= 1024 && window.innerHeight < 760)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const stopped = index.current.milestones.recordingStop()
  const emptyReason = 'The recording contains no Events'
  const noRenderer = 'Rendering settings are not connected'
  return <section className="gg-time-dock" aria-label="Execution timeline" data-cursor={state.cursor} data-live-head={state.liveHead}
    data-lens={state.lens} data-direction={state.direction} data-scrubbing={state.scrubbing}>
    <div className="gg-time-transport">
      <Control className="gg-time-play" label={state.playing ? 'Pause playback' : 'Play recorded execution'} disabled={!controls.canPlayPause}
        reason={controls.empty ? emptyReason : 'Forward playback is at the recorded boundary'} action={playback.playPause}>
        {state.playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
      </Control>
      <Control label="Previous Event" disabled={!controls.canStepBack} reason={controls.empty ? emptyReason : 'Before execution'} action={playback.stepBack}><SkipBack size={19} /></Control>
      <Control label="Next Event" disabled={!controls.canStepForward} reason={controls.empty ? emptyReason : 'At the accepted recording boundary'} action={playback.stepForward}><SkipForward size={19} /></Control>
    </div>
    <div className="gg-time-main">
      <div className="gg-time-caption">
        <strong className="gg-time-count">{caption.caption}</strong>
        <span className="gg-time-event" title={eventDetails}>
          {event && <span className="shell-visually-hidden">Executing: </span>}
          {headline}{context && <span className="gg-time-context"> · {context}</span>}
        </span>
        <span className="gg-time-lens">{state.lens}</span>
        {state.lens === 'HISTORY' && <Control className="gg-time-return" label="Return to Live" disabled={!controls.canReturnLive} reason={emptyReason} action={playback.returnToLive}>Return to Live</Control>}
        {execution?.phase === 'PAUSED' && <span className="gg-time-after">{state.liveHead - state.cursor} Events after Cursor</span>}
      </div>
      <MilestoneTrack index={index.current.milestones} playback={playback} summary={summary} maxLabels={short ? 6 : 12} execution={execution} />
      {stopped && <span className="gg-time-partial" title={`${stopped.state} · raw lastRecordedSeq: ${stopped.lastRecordedSeq ?? 'unavailable'}`}>
        Partial recording · {stopped.reason ?? stopped.state}</span>}
    </div>
    <div className="gg-time-options">
      <span className="gg-time-seq" title="Normalized Event sequence" aria-hidden={caption.seq===null} data-empty={caption.seq===null}
        style={{'--sequence-width':`${Math.max(8,String(Math.max(0,state.liveHead-1)).length+4)}ch`} as CSSProperties}>
        {caption.seq!==null&&<>t = {caption.seq}<span className="gg-time-seq-label">Event seq</span></>}
      </span>
      <span className="gg-time-inline-speed"><Speed playback={playback} empty={controls.empty} /></span>
      <details ref={menu} className="gg-time-settings" onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); if (menu.current) menu.current.open = false; menuButton.current?.focus() }
      }}>
        <summary ref={menuButton} aria-label="Timeline settings" aria-disabled={controls.empty} title={controls.empty ? `Timeline settings · ${emptyReason}` : 'Timeline settings'}
          onClick={(event) => { if (controls.empty) event.preventDefault() }}
          onKeyDown={(event) => { if (controls.empty && (event.key === 'Enter' || event.key === ' ')) event.preventDefault() }}><Settings size={19} /></summary>
        <div className="gg-time-settings-menu">
          <span className="gg-time-menu-speed"><Speed playback={playback} empty={controls.empty} /></span>
          <Control label="Replay from before execution" disabled={!controls.canReplay} reason={emptyReason} action={() => { playback.replay(); if (menu.current) menu.current.open = false }}><RotateCcw size={16} />Replay</Control>
          <Control label="Reverse play" disabled={!controls.canReverse} reason={controls.empty ? emptyReason : 'Before execution'} action={() => { playback.reversePlay(); if (menu.current) menu.current.open = false }}><Rewind size={16} />Reverse play</Control>
          <Control label={`Reduced motion: ${settings?.reducedMotion ? 'on' : 'off'}`} disabled={controls.empty || !settings} reason={controls.empty ? emptyReason : noRenderer}
            action={() => settings?.onReducedMotionChange(!settings.reducedMotion)}>Reduced motion: {settings?.reducedMotion ? 'on' : 'off'}</Control>
          <Control label={`Rendering quality: ${settings?.quality ?? 'unavailable'}`} disabled={controls.empty || !settings || settings.quality === 'INTERACTIVE' && settings.cinematicAvailable === false}
            reason={controls.empty ? emptyReason : settings?.cinematicReason ?? noRenderer}
            action={() => settings?.onQualityChange(settings.quality === 'INTERACTIVE' ? 'CINEMATIC' : 'INTERACTIVE')}>Quality: {settings?.quality ?? 'unavailable'}</Control>
        </div>
      </details>
    </div>
  </section>
}
