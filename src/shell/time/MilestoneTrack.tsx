import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { EmbeddedExecution } from '../runtimeContracts'
import type { TimelinePlaybackApi } from '../../timeline/useTimelinePlayback'
import {labelBinCount,type Milestone,type MilestoneIndex} from '../../timeline/milestones'
import { timelineKeyAction } from '../../timeline/timelineControls'
import { color } from '../../theme/tokens'

export interface MilestoneTrackProps {
  index: MilestoneIndex
  playback: TimelinePlaybackApi
  summary: string
  maxLabels: 12 | 6
  execution?: EmbeddedExecution
}
const colour: Record<Milestone['kind'], string> = {
  entry: 'var(--color-semantic-execution)', return: 'var(--color-semantic-return)', allocation: 'var(--color-heap-edge)',
  mutation: 'var(--color-semantic-mutation)', exception: 'var(--color-semantic-exception)',
  input: 'var(--color-semantic-stdin)', output: 'var(--color-semantic-stdout)',
}

export function MilestoneTrack({ index, playback, summary, maxLabels, execution }: MilestoneTrackProps) {
  const rail = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null)
  const activePointer = useRef<number | null>(null)
  const [width, setWidth] = useState(0)
  const { cursor, liveHead } = playback.state
  const empty = liveHead === 0
  const labelled = index.labelled(cursor, width, maxLabels)
  const bins = labelBinCount(width, maxLabels)
  const stopped = index.recordingStop()
  useLayoutEffect(() => {
    const element = rail.current
    if (!element) return
    setWidth(element.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const element = canvas.current, pixels = Math.floor(width)
    if (!element || pixels < 1) return
    const dpr = window.devicePixelRatio || 1
    element.width = Math.ceil(width * dpr); element.height = Math.ceil(18 * dpr)
    const context = element.getContext('2d')
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, width, 18)
    const density = index.density(pixels)
    for (const milestone of labelled) {
      const column = Math.min(pixels - 1, Math.floor(milestone.cursor / liveHead * pixels))
      density[column] = Math.max(0, density[column] - 1)
    }
    for (let column = 0; column < pixels; column++) {
      if (!density[column]) continue
      // Mixed past/future columns use future opacity so no future evidence gets full emphasis.
      context.globalAlpha = Math.ceil((column + 1) * liveHead / pixels) > cursor ? 0.21 : 0.42
      context.fillStyle = color.ui.textSecondary
      const height = Math.min(10, 2 + Math.log2(density[column]) * 2)
      context.fillRect(column, 9 - height / 2, 1, height)
    }
    context.globalAlpha = 1
  }, [cursor, liveHead, index, width, maxLabels])

  const finish = (event: PointerEvent<HTMLInputElement>, cancelled = false) => {
    if (activePointer.current !== event.pointerId) return
    if (!cancelled) playback.seekTo(Number(event.currentTarget.value))
    activePointer.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    playback.endScrub()
  }
  return <div ref={rail} className="gg-time-track">
    <input className="gg-time-track__input" type="range" role="slider" min={0} max={liveHead} step={1} value={cursor}
    aria-label="Recorded execution position"
    aria-valuemin={0} aria-valuemax={liveHead} aria-valuenow={cursor} aria-valuetext={summary} aria-disabled={empty}
    title={empty ? 'The recording contains no Events' : 'Space plays or pauses; arrows step; Home rewinds; End returns to Live'}
    onKeyDown={(event) => {
      if (![' ', 'Spacebar', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const action = timelineKeyAction(event.key, playback.state)
      if (!action) return
      switch (action.type) {
        case 'playPause': playback.playPause(); break
        case 'stepBack': playback.stepBack(); break
        case 'stepForward': playback.stepForward(); break
        case 'seek': playback.seekTo(action.cursor); break
        case 'returnLive': playback.returnToLive(); break
      }
    }}
    onPointerDown={(event) => {
      if (empty || event.button !== 0) {event.preventDefault();return}
      event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId)
      activePointer.current = event.pointerId; playback.beginScrub()
    }}
    onChange={(event)=>{if(!empty)playback.seekTo(Number(event.currentTarget.value))}}
    onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)}
    onLostPointerCapture={() => { if (activePointer.current !== null) { activePointer.current = null; playback.endScrub() } }}/>
    <div className="gg-time-track__line" aria-hidden="true"><span style={{ width: `${empty ? 0 : cursor / liveHead * 100}%` }} /></div>
    <canvas ref={canvas} className="gg-time-track__density" aria-hidden="true" />
    {labelled.map((milestone) => {
      const fraction = milestone.cursor / liveHead
      const bin = Math.min(bins - 1, Math.floor(fraction * bins))
      const labelOffset = ((bin + 0.5) / bins - fraction) * width
      return <span key={milestone.id} aria-hidden="true"
        className={`gg-time-milestone${milestone.cursor === cursor ? ' gg-time-milestone--current' : ''}`}
        style={{ left: `${fraction * 100}%`, opacity: milestone.cursor > cursor ? 0.5 : 1, '--milestone-colour': colour[milestone.kind] } as CSSProperties}
        title={`Event seq ${milestone.seq} · ${milestone.label}`}>
        <span className="gg-time-milestone__node" />
        <span className="gg-time-milestone__label" style={{ width: width / bins - 12, transform: `translateX(${labelOffset}px)` }}>{milestone.caption}</span>
      </span>
    })}
    {!empty&&<span aria-hidden="true" className="gg-time-cursor" style={{left:`${cursor/liveHead*100}%`}}/>}
    {stopped && <span className="gg-time-track__boundary" aria-label={`Partial recording boundary at applied prefix ${liveHead}: ${stopped.state}; ${stopped.reason ?? 'Reason not recorded'}`}
      title={`${stopped.state} · ${stopped.reason ?? 'Reason not recorded'} · raw lastRecordedSeq: ${stopped.lastRecordedSeq ?? 'unavailable'} · semantic boundary: ${liveHead}`} />}
    {execution?.phase === 'PAUSED' && <span className="gg-time-track__paused" style={{ left: empty ? '0%' : '100%' }}
      aria-label={`Debugger paused at applied prefix ${liveHead}`} title={`Debugger paused at applied prefix ${liveHead}`}>Ⅱ</span>}
  </div>
}
