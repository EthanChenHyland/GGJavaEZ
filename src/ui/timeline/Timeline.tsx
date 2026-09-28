import { useMemo, type CSSProperties } from 'react'
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'
import type { TraceDocument, TraceEvent } from '../../contracts/runtime'
import type { PlaybackApi } from '../../playback'
import { colors, radiusPx, typography } from '../../theme/tokens'
import './Timeline.css'

export interface TimelineProps {
  trace: TraceDocument
  playback: PlaybackApi
}

const SPEEDS = [0.5, 1, 2, 4] as const
const MAX_MARKERS = 240

/** Keep large real traces seekable without mounting one button per JVM probe. */
export function markerIndices(events: readonly TraceEvent[], limit = MAX_MARKERS): number[] {
  if (events.length <= limit) return events.map((_, index) => index)
  const important = events.flatMap((event, index) => event.importance === 'major' ? [index] : [])
  const selected = new Set<number>()
  const addSpread = (indices: readonly number[], count: number) => {
    if (count <= 0 || indices.length === 0) return
    for (let i = 0; i < count; i++) selected.add(indices[Math.floor(i * (indices.length - 1) / Math.max(count - 1, 1))])
  }
  addSpread(important, Math.min(Math.floor(limit / 2), important.length))
  addSpread(events.map((_, index) => index), limit - selected.size)
  return [...selected].sort((a, b) => a - b)
}

function markerColor(event: TraceEvent): string {
  if (event.type === 'ALLOCATE_OBJECT' || event.type === 'ALLOCATE_ARRAY') return colors.heap
  if (event.type === 'RETURN_VALUE') return colors.success
  if (event.type === 'ENTER_METHOD' || event.type === 'EXIT_METHOD') return colors.stack
  if (event.type === 'ARRAY_WRITE' || event.type === 'SET_FIELD' || event.type === 'ASSIGN_LOCAL') return colors.mutation
  if (event.type === 'ARRAY_COMPARE') return colors.execution
  return colors.textMuted
}

export function Timeline({ trace, playback }: TimelineProps) {
  const { state, playPause, stepForward, stepBack, seekTo, setSpeed, reset } = playback
  const eventCount = trace.events.length
  const progress = eventCount > 0 ? (state.cursor / eventCount) * 100 : 0
  const currentEvent = trace.events[state.cursor - 1]
  const markers = useMemo(() => markerIndices(trace.events), [trace])
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
    <section className={`vj-timeline${eventCount > 60 ? ' vj-timeline--dense' : ''}`} style={theme} aria-label="Execution timeline">
      <div className="vj-timeline__transport">
        <button className="vj-timeline__play" type="button" onClick={playPause} disabled={eventCount === 0}
          aria-label={state.playing ? 'Pause execution' : state.cursor === eventCount && eventCount > 0 ? 'Replay execution' : 'Play execution'}>
          {state.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <button className="vj-timeline__button" type="button" onClick={stepBack} disabled={state.cursor === 0} aria-label="Previous event">
          <SkipBack size={17} />
        </button>
        <button className="vj-timeline__button" type="button" onClick={stepForward} disabled={state.cursor >= eventCount} aria-label="Next event">
          <SkipForward size={17} />
        </button>
        <button className="vj-timeline__button" type="button" onClick={reset} disabled={state.cursor === 0 && !state.playing} aria-label="Reset execution">
          <RotateCcw size={16} />
        </button>
      </div>

      <div className="vj-timeline__main">
        <div className="vj-timeline__status">
          <span className="vj-timeline__count">{state.cursor} / {eventCount}</span>
          <span className="vj-timeline__event" aria-live="polite">{currentEvent?.label ?? 'Ready to run'}</span>
        </div>
        <div className="vj-timeline__rail">
          <input className="vj-timeline__range" type="range" min={0} max={eventCount} step={1} value={state.cursor}
            onChange={(event) => seekTo(Number(event.currentTarget.value))}
            disabled={eventCount === 0} aria-label="Scrub execution"
            aria-valuetext={`Event ${state.cursor} of ${eventCount}: ${currentEvent?.label ?? 'Ready to run'}`}
            style={{ background: `linear-gradient(to right, ${colors.execution} ${progress}%, ${colors.borderStrong} ${progress}%)` }} />
          <div className="vj-timeline__markers" aria-label="Events">
            {markers.map((index) => { const event = trace.events[index]; return (
              <button key={event.eventId} type="button"
                className={`vj-timeline__marker${state.cursor === index + 1 ? ' vj-timeline__marker--current' : ''}${event.importance === 'quiet' ? ' vj-timeline__marker--quiet' : ''}${event.importance === 'major' ? ' vj-timeline__marker--major' : ''}`}
                style={{ left: `${((index + 1) / eventCount) * 100}%`, '--marker-color': markerColor(event) } as CSSProperties}
                onClick={() => seekTo(index + 1)} aria-label={`Go to event ${index + 1}: ${event.label}`} title={event.label} />
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
