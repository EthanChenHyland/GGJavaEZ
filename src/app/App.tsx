import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Crosshair, Home, MousePointer2, Route, ScanEye, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { ClassicRuntime } from '../classic/ClassicRuntime'
import { visualizationModes, type VisualizationMode } from '../contracts/visualization'
import type { TraceDocument } from '../contracts/runtime'
import type { Selection } from '../contracts/interaction'
import { renderQuality } from '../theme/tokens'
import { RuntimeCanvas } from '../scene/RuntimeCanvas'
import { SourcePane } from '../ui/SourcePane'
import { Inspector } from '../ui/Inspector'
import { Timeline } from '../ui/timeline/Timeline'
import { navigationActions, useNavigationStore } from '../navigation'
import { usePlayback } from '../playback'
import { loadPersonTrace, loadRecursionTrace, seek } from '../runtime'
import { createLayout } from '../world/layout'
import { buildSceneModel } from '../world/sceneModel'

const examples = { person: loadPersonTrace(), recursion: loadRecursionTrace() }
type ExampleId = keyof typeof examples

export function App({ trace: suppliedTrace }: { trace?: TraceDocument }) {
  const [example, setExample] = useState<ExampleId>('person')
  const trace = suppliedTrace ?? examples[example]
  return <ExecutionWorkspace key={trace.demoId} trace={trace} example={example} onChooseExample={setExample} />
}

function ExecutionWorkspace({ trace, example, onChooseExample }: { trace: TraceDocument; example: ExampleId; onChooseExample: (example: ExampleId) => void }) {
  const layout = useMemo(() => createLayout(trace), [trace])
  const [view, setView] = useState<VisualizationMode>('spatial')
  const [guided, setGuided] = useState(true)
  const playback = usePlayback(trace)
  const { cursor, playing } = playback.state
  const runtime = useMemo(() => seek(trace, cursor), [trace, cursor])
  const event = trace.events[cursor - 1] ?? null
  const finalTransfer = runtime.returns.at(-1)
  const finalSlot = finalTransfer?.destination ? runtime.frames[finalTransfer.destination.frameId]?.locals[finalTransfer.destination.slotId] : undefined
  const detailLevel = useNavigationStore((state) => state.detailLevel)
  const mode = useNavigationStore((state) => state.mode)
  const followEnabled = useNavigationStore((state) => state.followEnabled)
  const [quality, setQuality] = useState<keyof typeof renderQuality>('balanced')
  const [runtimeFocus, setRuntimeFocus] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [sourceWidth, setSourceWidth] = useState(34)
  const workbenchRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const scene = useMemo(() => buildSceneModel(runtime, layout, detailLevel), [runtime, layout, detailLevel])

  useEffect(() => { navigationActions.resetView(); navigationActions.followExecution() }, [])

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
      else if (event.key.toLowerCase() === 'h' || event.key === 'Home') navigationActions.home()
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
        <label className="example-picker">Example <select aria-label="Runtime example" value={example} onChange={(event) => onChooseExample(event.target.value as ExampleId)}><option value="person">Person</option><option value="recursion">Recursion · factorial(5)</option></select></label>
        <button className="toolbar-button is-subtle" aria-label="Runtime focus mode" aria-pressed={runtimeFocus} onClick={() => setRuntimeFocus((value) => !value)}>{runtimeFocus ? <Minimize2 size={15} /> : <Maximize2 size={15} />}<span className="button-text">{runtimeFocus ? 'Restore source' : 'Runtime view'}</span></button>
        <button className="toolbar-button is-subtle" onClick={() => navigationActions.home()} aria-label="Home"><Home size={15} /><span className="button-text">Home</span></button>
      </div>
    </header>
    <div ref={workbenchRef} className={`workbench ${runtimeFocus ? 'workbench--focus' : ''}`} style={{ '--source-width': `${sourceWidth}%` } as React.CSSProperties}>
      <SourcePane trace={trace} location={runtime.currentSource} onChooseLine={chooseLine} compact={runtimeFocus} />
      {!runtimeFocus && <div className="source-divider" role="separator" aria-label="Resize source pane" aria-orientation="vertical" aria-valuenow={sourceWidth} aria-valuemin={24} aria-valuemax={46} tabIndex={0}
        onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); setSourceWidth((width) => Math.max(24, Math.min(46, width + (event.key === 'ArrowRight' ? 2 : -2)))) } }}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { const bounds = workbenchRef.current!.getBoundingClientRect(); setSourceWidth(Math.max(24, Math.min(46, (event.clientX - bounds.left) / bounds.width * 100))) } }} /> }
      <section className={`world-panel ${selection ? 'world-panel--inspecting' : ''}`} aria-label="Runtime world">
        <div className={`spatial-view ${view !== 'spatial' ? 'is-hidden' : ''}`} aria-hidden={view !== 'spatial'}><RuntimeCanvas visible={view === 'spatial'} guided={guided} playing={playing} quality={quality} scene={scene} event={event} selection={selection} onSelect={setSelection} onFocusSelected={navigationActions.focus} /></div>
        <ClassicRuntime visible={view === 'classic'} playing={playing} scene={scene} event={event} guided={guided} selection={selection} onSelect={setSelection} onFocusSelected={navigationActions.focus} />
        <div className="representation-bar">
          <div role="group" aria-label="Visualization mode" className="view-selector">{visualizationModes.map((item) => <button key={item.id} className={`toolbar-button ${view === item.id ? 'is-active' : ''}`} aria-pressed={view === item.id} disabled={!item.available} title={'reason' in item ? item.reason : `${item.label} representation`} onClick={() => setView(item.id)}>{item.label}</button>)}</div>
          <button className={`toolbar-button ${guided ? 'is-active' : ''}`} aria-label="Guided execution" aria-pressed={guided} onClick={() => { setGuided((value) => !value); if (guided) navigationActions.freeExplore() }}>Guided Execution: {guided ? 'On' : 'Off'}</button>
        </div>
        <p className="theater-reason">{trace.demoId === 'person' ? 'Theater: unavailable for Person; standard stack and heap views show this program.' : 'Theater: Spatial already exposes this call stack and its return path.'}</p>
        <div className="world-overlay-top">
          <span className="mode-pill">{playing ? 'EXECUTING' : runtime.status === 'ready' ? 'READY' : 'PAUSED'}</span>
          <span className={`world-label ${mode === 'FOCUS_ENTITY' || mode === 'TRACE_PATH' ? 'world-label--navigating' : ''}`}><strong>RUNTIME WORLD</strong><span>{mode.replaceAll('_', ' ')} · {detailLevel.toUpperCase()}</span></span>
        </div>
        <div className="world-controls">
          <button className="toolbar-button" onClick={navigationActions.zoomIn} aria-label="Zoom in"><ZoomIn size={15}/><span className="button-text">Zoom In</span></button>
          <button className="toolbar-button" onClick={navigationActions.zoomOut} aria-label="Zoom out"><ZoomOut size={15}/><span className="button-text">Zoom Out</span></button>
          <button className="toolbar-button" onClick={navigationActions.resetView} aria-label="Reset view"><RotateCcw size={15}/><span className="button-text">Reset View</span></button>
          <button className="toolbar-button" onClick={navigationActions.home} aria-label="Overview"><Home size={15}/><span className="button-text">Overview</span></button>
          <button className={`toolbar-button ${mode === 'FREE_EXPLORE' ? 'is-active' : ''}`} onClick={() => navigationActions.freeExplore()} title="Orbit, pan and dolly in the runtime world" aria-label="Explore runtime"><MousePointer2 size={15} /><span className="button-text">Explore</span></button>
          <button className="toolbar-button" onClick={focusSelection} disabled={!selection} title="Focus selected entity" aria-label="Focus selected entity"><Crosshair size={15} /><span className="button-text">Focus</span></button>
          <button className="toolbar-button" onClick={() => traceSelection()} disabled={!scene.references.length} title="Trace selected relationship" aria-label="Trace selected relationship"><Route size={15} /><span className="button-text">Trace Path</span></button>
          <button className={`toolbar-button ${followEnabled ? 'is-active' : ''}`} onClick={() => { if (followEnabled) navigationActions.freeExplore(); else { setGuided(true); navigationActions.followExecution() } }} title="Follow execution" aria-label="Follow execution" aria-pressed={followEnabled}><ScanEye size={15} /><span className="button-text">Follow</span></button>
        </div>
        {scene.stackDepth !== undefined && scene.stackDepth > 1 && <section className="call-status" aria-label="Call and return state">
          <span className="eyebrow">{runtime.status === 'ended' ? 'COMPLETE' : `${runtime.activeFrameIds.length} LIVE FRAMES`}</span>
          {runtime.returns.length > 0 && <div className="return-history"><span>Returns</span>{runtime.returns.map((item) => <span key={item.eventId} title={item.expression}>{item.value.kind === 'primitive' ? String(item.value.value) : ''}</span>)}</div>}
          {runtime.status === 'ended' && <strong className="final-result">{finalSlot?.name ?? 'Return'} = {finalTransfer?.value.kind === 'primitive' ? String(finalTransfer.value.value) : ''}</strong>}
          {guided && scene.returnFlow && runtime.status !== 'ended' && <span className="return-explanation">{scene.returnFlow.expression ?? `${scene.returnFlow.fromLabel} returns`}: {scene.returnFlow.value.kind === 'primitive' ? String(scene.returnFlow.value.value) : ''} → {scene.returnFlow.toLabel}</span>}
        </section>}
        {cursor === 0 && <div className="event-chip">Press <strong>Play</strong> to enter the runtime</div>}
        {guided && event?.type === 'SET_FIELD' && <div className="event-chip"><strong>Mutation</strong> · {event.label}</div>}
        <div className="world-access">
          <select disabled={view !== 'spatial'} aria-label="Rendering quality" value={quality} onChange={(event) => setQuality(event.target.value as keyof typeof renderQuality)}><option value="high">High</option><option value="balanced">Balanced</option><option value="low">Low effects</option></select>
          {mode === 'FREE_EXPLORE' && <button className="toolbar-button" onClick={() => { setGuided(true); navigationActions.followExecution() }}>Return to execution</button>}
          <select aria-label="Select runtime entity" value={selection && (selection.kind === 'frame' || selection.kind === 'object') ? selection.id : ''} onChange={(event) => { const id = event.target.value; setSelection(id ? { kind: scene.objects.some((node) => node.id === id) ? 'object' : 'frame', id } : null) }}>
            <option value="">Inspect an entity…</option>
            {scene.frames.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
            {scene.objects.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
          </select>
        </div>
        <div className="world-hint"><kbd>Drag</kbd> {view === 'classic' ? 'pan' : 'orbit'} · {view === 'spatial' && <><kbd>Right drag</kbd> pan · </>}<kbd>Scroll</kbd> {view === 'classic' ? 'zoom' : 'dolly'} · <kbd>Home</kbd> reset</div>
        <Inspector selection={selection} runtime={runtime} scene={scene} onClose={() => setSelection(null)} onReturn={() => { navigationActions.returnToPrevious(); setSelection(null) }} onFocus={focusSelection} onTrace={traceSelection} />
      </section>
    </div>
    <Timeline trace={trace} playback={playback} />
  </div>
}
