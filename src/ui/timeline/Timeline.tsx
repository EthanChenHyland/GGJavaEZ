import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'
import type { TraceDocument, TraceEvent } from '../../contracts/runtime'
import type { PlaybackApi } from '../../playback'
import type { ExecutionPhase, TimelineLens } from '../../execution/contracts'
import { colors, radiusPx, typography } from '../../theme/tokens'
import './Timeline.css'

export interface TimelineProps {
  trace: TraceDocument
  playback: PlaybackApi
  execution?: {
    phase: ExecutionPhase
    lens: TimelineLens
    liveCursor: number
    onReturnToLive: () => void
  }
}

/** A growing trace changes the live head, never a manually held history cursor. */
export function resolveTimelinePosition(eventCount: number, historyCursor: number, execution?: Pick<NonNullable<TimelineProps['execution']>, 'lens' | 'liveCursor'>) {
  const liveCursor = execution ? Math.min(Math.max(0, Number.isFinite(execution.liveCursor) ? Math.trunc(execution.liveCursor) : 0), eventCount) : eventCount
  return {
    liveCursor,
    cursor: execution?.lens === 'LIVE' ? liveCursor : Math.min(Math.max(0, Number.isFinite(historyCursor) ? Math.trunc(historyCursor) : 0), liveCursor),
  }
}

const SPEEDS = [0.25, 0.5, 1, 2, 4] as const
const MAX_MARKERS = 240

/** Keep large real traces seekable without mounting one button per JVM probe. */
export function markerIndices(events: readonly TraceEvent[], limit = MAX_MARKERS): number[] {
  limit = Math.max(2, Math.trunc(limit))
  if (events.length <= limit) return events.map((_, index) => index)
  const important = events.flatMap((event, index) => event.importance === 'major' ? [index] : [])
  const selected = new Set<number>()
  const addSpread = (indices: readonly number[], count: number) => {
    if (count <= 0 || indices.length === 0) return
    for (let i = 0; i < count; i++) selected.add(indices[Math.floor(i * (indices.length - 1) / Math.max(count - 1, 1))])
  }
  addSpread(important, Math.min(Math.floor(limit / 2), important.length))
  addSpread(events.map((_, index) => index), limit - selected.size)
  // Markers name actual events; keep their exact positions and omit crowded
  // neighbors rather than shifting dots away from their time coordinates.
  const gap = Math.ceil((events.length - 1) / (limit - 1))
  const spaced = [0]
  for (const index of [...selected].sort((a, b) => a - b)) {
    if (index - spaced.at(-1)! >= gap && events.length - 1 - index >= gap) spaced.push(index)
  }
  spaced.push(events.length - 1)
  return spaced
}

function markerColor(event: TraceEvent): string {
  if (event.type === 'ALLOCATE_OBJECT' || event.type === 'ALLOCATE_ARRAY') return colors.heap
  if (event.type === 'RETURN_VALUE') return colors.success
  if (event.type === 'ENTER_METHOD' || event.type === 'EXIT_METHOD') return colors.stack
  if (event.type === 'ARRAY_WRITE' || event.type === 'SET_FIELD' || event.type === 'ASSIGN_LOCAL') return colors.mutation
  if (event.type === 'ARRAY_COMPARE') return colors.execution
  return colors.textMuted
}

export function Timeline({ trace, playback, execution }: TimelineProps) {
  const rail = useRef<HTMLDivElement>(null)
  const [markerLimit, setMarkerLimit] = useState(120)
  useEffect(() => {
    const element = rail.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setMarkerLimit(Math.max(2, Math.min(MAX_MARKERS, Math.floor(entry.contentRect.width / 10)))))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const { state, playPause, stepForward, stepBack, seekTo, setSpeed, reset } = playback
  const { cursor, liveCursor } = resolveTimelinePosition(trace.events.length, state.cursor, execution)
  const hasExecution = !!execution
  const eventCount = hasExecution ? liveCursor : trace.events.length
  const progress = eventCount > 0 ? (cursor / eventCount) * 100 : 0
  const currentEvent = trace.events[cursor - 1]
  const recordingStopped = trace.events[eventCount - 1]?.type === 'CAPTURE_STOP'
  const currentLabel = currentEvent?.type === 'CAPTURE_STOP'
    ? `Last recorded event · ${currentEvent.recording.reason}` : currentEvent?.label ?? 'Before execution'
  const markers = useMemo(() => markerIndices(hasExecution ? trace.events.slice(0, eventCount) : trace.events, markerLimit), [trace.events, eventCount, hasExecution, markerLimit])
  const theme = {
    '--timeline-panel': colors.panel,
    '--timeline-panel-raised': colors.panelRaised,
    '--timeline-hover': colors.panelHover,
    '--timeline-border': colors.border,
    '--timeline-border-strong': colors.borderStrong,
    '--timeline-text': colors.text,
    '--timeline-text-secondary': colors.textSecondary,
    '--timeline-text-muted': colors.textMuted,
    '--timeline-active': colors.execution,
    '--timeline-radius': `${radiusPx.control}px`,
    '--timeline-font': typography.ui,
    '--timeline-code-font': typography.code,
  } as CSSProperties

  return (
    <section className={`vj-timeline${eventCount > 60 ? ' vj-timeline--dense' : ''}${execution ? ' vj-timeline--session' : ''}`} style={theme} aria-label="Execution timeline">
      <div className="vj-timeline__transport">
        <button className="vj-timeline__play" type="button" onClick={playPause} disabled={eventCount === 0}
          aria-label={execution ? state.playing ? 'Pause history replay' : 'Replay recorded history' : state.playing ? 'Pause execution' : cursor === eventCount && eventCount > 0 ? 'Replay execution' : 'Play execution'}>
          {state.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <button className="vj-timeline__button" type="button" onClick={stepBack} disabled={cursor === 0} aria-label="Previous event">
          <SkipBack size={17} />
        </button>
        <button className="vj-timeline__button" type="button" onClick={stepForward} disabled={cursor >= eventCount} aria-label="Next event">
          <SkipForward size={17} />
        </button>
        <button className="vj-timeline__button" type="button" onClick={reset} disabled={cursor === 0 && !state.playing} aria-label={execution ? 'Rewind history' : 'Reset execution'}>
          <RotateCcw size={16} />
        </button>
      </div>

      <div className="vj-timeline__main">
        <div className="vj-timeline__status">
          {execution && <span className={`vj-timeline__lens vj-timeline__lens--${execution.lens.toLowerCase()}`} title={`${execution.phase.toLowerCase().replaceAll('_', ' ')} · ${recordingStopped ? 'recording stopped' : execution.lens.toLowerCase()}`}>{recordingStopped && execution.lens === 'LIVE' ? 'LAST RECORDED' : execution.lens}</span>}
          <span className="vj-timeline__count">{cursor} / {eventCount}</span>
          <span className="vj-timeline__event" aria-live="polite">{currentLabel}</span>
          {execution?.lens === 'HISTORY' && <button className="vj-timeline__return" type="button" onClick={execution.onReturnToLive}>{recordingStopped ? 'Return to last recorded event' : 'Return to Live'} <span>{liveCursor}</span></button>}
        </div>
        <div className="vj-timeline__rail" ref={rail}>
          <input className="vj-timeline__range" type="range" min={0} max={eventCount} step={1} value={cursor}
            onChange={(event) => seekTo(Number(event.currentTarget.value))}
            disabled={eventCount === 0} aria-label="Scrub execution"
            aria-valuetext={cursor === 0 ? 'Before execution' : currentLabel}
            style={{ background: `linear-gradient(to right, ${colors.execution} ${progress}%, ${colors.borderStrong} ${progress}%)` }} />
          <div className="vj-timeline__markers" aria-label="Events">
            {markers.map((index) => { const event = trace.events[index]; return (
              <button key={event.eventId} type="button"
                className={`vj-timeline__marker${cursor === index + 1 ? ' vj-timeline__marker--current' : ''}${event.importance === 'quiet' ? ' vj-timeline__marker--quiet' : ''}${event.importance === 'major' ? ' vj-timeline__marker--major' : ''}${execution && index + 1 === liveCursor ? cursor === liveCursor ? ' vj-timeline__marker--at-live' : ' vj-timeline__marker--live-head' : ''}`}
                style={{ left: `${((index + 1) / eventCount) * 100}%`, '--marker-color': markerColor(event) } as CSSProperties}
                onClick={() => seekTo(index + 1)} aria-label={execution && index + 1 === liveCursor ? `${recordingStopped ? 'Last recorded event' : 'Live head'} at event ${liveCursor}: ${event.label}` : `Go to event ${index + 1}: ${event.label}`} title={event.label} />
            ) })}
          </div>
        </div>
      </div>

      <label className="vj-timeline__speed">
        <span>Speed</span>
        <select value={state.speed} onChange={(event) => setSpeed(Number(event.currentTarget.value) as typeof SPEEDS[number])} aria-label="Playback speed">
          {SPEEDS.map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
        </select>
      </label>
    </section>
  )
}
