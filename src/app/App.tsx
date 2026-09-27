import { useEffect, useMemo, useState } from 'react'
import { Box, Crosshair, Home, MousePointer2, Route, ScanEye } from 'lucide-react'
import type { Selection } from '../contracts/interaction'
import { RuntimeCanvas } from '../scene/RuntimeCanvas'
import { SourcePane } from '../ui/SourcePane'
import { Inspector } from '../ui/Inspector'
import { Timeline } from '../ui/timeline/Timeline'
import { navigationActions, useNavigationStore } from '../navigation'
import { usePlayback } from '../playback'
import { loadPersonTrace, seek } from '../runtime'
import { createLayout } from '../world/layout'
import { buildSceneModel } from '../world/sceneModel'

const trace = loadPersonTrace()
const layout = createLayout(trace)

export function App() {
  const playback = usePlayback(trace)
  const { cursor, playing } = playback.state
  const runtime = useMemo(() => seek(trace, cursor), [cursor])
  const event = trace.events[cursor - 1] ?? null
  const detailLevel = useNavigationStore((state) => state.detailLevel)
  const mode = useNavigationStore((state) => state.mode)
  const followEnabled = useNavigationStore((state) => state.followEnabled)
  const [selection, setSelection] = useState<Selection>(null)
  const scene = useMemo(() => buildSceneModel(runtime, layout, detailLevel), [runtime, detailLevel])

  useEffect(() => { navigationActions.followExecution() }, [])

  const focusSelection = () => {
    if (selection) navigationActions.focus(selection)
  }
  const traceSelection = (referenceId?: string) => {
    const id = referenceId ?? (selection?.kind === 'reference' ? selection.id
      : scene.references.find((edge) => selection?.kind === 'object' && edge.targetObjectId === selection.id)?.id
        ?? scene.references.find((edge) => edge.source.slotId.endsWith(':p'))?.id)
    if (id) {
      setSelection({ kind: 'reference', id })
      navigationActions.tracePath(id)
    }
  }
  const chooseLine = (line: number) => {
    const index = trace.events.findIndex((item) => item.source?.line === line && item.type !== 'LINE_EXECUTE')
    if (index >= 0) playback.seekTo(index + 1)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return
      if (event.code === 'Space') { event.preventDefault(); playback.playPause() }
      else if (event.code === 'ArrowRight') { event.preventDefault(); playback.stepForward() }
      else if (event.code === 'ArrowLeft') { event.preventDefault(); playback.stepBack() }
      else if (event.key.toLowerCase() === 'h') navigationActions.home()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [playback])

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><Box size={22} strokeWidth={1.5} /></span>
        <span className="brand-copy"><span className="brand-name">Visual Java</span><span className="brand-subtitle">Explore execution from the inside</span></span>
      </div>
      <div className="top-actions">
        <span className="mode-pill">PERSON / DEMO 01</span>
        <button className="toolbar-button is-subtle" onClick={() => navigationActions.home()}><Home size={15} /><span className="button-text">Home</span></button>
      </div>
    </header>
    <div className="workbench">
      <SourcePane trace={trace} location={runtime.currentSource} onChooseLine={chooseLine} />
      <section className="world-panel" aria-label="Runtime world">
        <RuntimeCanvas scene={scene} event={event} selection={selection} onSelect={setSelection} />
        <div className="world-overlay-top">
          <span className="mode-pill">{playing ? 'EXECUTING' : runtime.status === 'ready' ? 'READY' : 'PAUSED'}</span>
          <span className="world-label"><strong>RUNTIME WORLD</strong><span>{mode.replaceAll('_', ' ')} · {detailLevel.toUpperCase()}</span></span>
        </div>
        <div className="world-controls">
          <button className={`toolbar-button ${mode === 'FREE_EXPLORE' ? 'is-active' : ''}`} onClick={() => navigationActions.freeExplore()} title="Orbit, pan and dolly in the runtime world"><MousePointer2 size={15} /><span className="button-text">Explore</span></button>
          <button className="toolbar-button" onClick={focusSelection} disabled={!selection} title="Focus selected entity"><Crosshair size={15} /><span className="button-text">Focus</span></button>
          <button className="toolbar-button" onClick={() => traceSelection()} disabled={!scene.references.length} title="Trace selected relationship"><Route size={15} /><span className="button-text">Trace Path</span></button>
          <button className={`toolbar-button ${followEnabled ? 'is-active' : ''}`} onClick={() => navigationActions.followExecution()} title="Follow execution"><ScanEye size={15} /><span className="button-text">Follow</span></button>
        </div>
        {cursor === 0 && <div className="event-chip">Press <strong>Play</strong> to enter the runtime</div>}
        {event?.type === 'SET_FIELD' && event.slotId.endsWith(':age') && <div className="event-chip"><strong>Mutation</strong> · age: 0 → 18</div>}
        <div className="world-hint"><kbd>Drag</kbd> orbit · <kbd>Right drag</kbd> pan · <kbd>Scroll</kbd> dolly · <kbd>Home</kbd> reset</div>
        <Inspector selection={selection} runtime={runtime} scene={scene} onClose={() => setSelection(null)} onFocus={focusSelection} onTrace={traceSelection} />
      </section>
    </div>
    <Timeline trace={trace} playback={playback} />
  </div>
}
