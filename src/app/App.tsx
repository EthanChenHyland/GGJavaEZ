import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Crosshair, Home, MousePointer2, Route, ScanEye, Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react'
import { ClassicRuntime } from '../classic/ClassicRuntime'
import { visualizationModes, type VisualizationMode } from '../contracts/visualization'
import type { RuntimeState, SourceLocation, TraceDocument, TraceEvent } from '../contracts/runtime'
import type { Selection } from '../contracts/interaction'
import type { ExecutionPhase, TimelineLens } from '../execution/contracts'
import { renderQuality } from '../theme/tokens'
import { RuntimeCanvas } from '../scene/RuntimeCanvas'
import { SourcePane } from '../ui/SourcePane'
import { ConsolePane } from '../ui/ConsolePane'
import { ControlFlowStatus } from '../ui/ControlFlowStatus'
import { Inspector } from '../ui/Inspector'
import { Timeline, resolveTimelinePosition } from '../ui/timeline/Timeline'
import { navigationActions, useNavigationStore } from '../navigation'
import { usePlayback } from '../playback'
import { loadPersonTrace, loadRecursionTrace, loadArrayTrace, loadControlTrace, seek } from '../runtime'
import { createLayout } from '../world/layout'
import { buildSceneModel } from '../world/sceneModel'

const examples = { person: loadPersonTrace(), recursion: loadRecursionTrace(), arrays: loadArrayTrace(), control: loadControlTrace() }
type ExampleId = keyof typeof examples

function eventDescribesSelection(event: TraceEvent, selection: NonNullable<Selection>): boolean {
  const id = selection.kind === 'reference' ? selection.id.replace(/^ref:/, '') : selection.id
  if (selection.kind === 'frame') return 'frameId' in event && event.frameId === id
  if (selection.kind === 'object') return 'objectId' in event && event.objectId === id
  if (selection.kind === 'slot' || selection.kind === 'reference') {
    if (event.type === 'DECLARE_LOCAL') return event.slot.id === id
    if (event.type === 'ENTER_METHOD') return event.locals.some((slot) => slot.id === id)
    if (event.type === 'ASSIGN_LOCAL' || event.type === 'SET_FIELD') return event.slotId === id
    if (event.type === 'CREATE_REFERENCE' || event.type === 'CLEAR_REFERENCE') return event.sourceSlot.slotId === id
    if (event.type === 'ALLOCATE_OBJECT') return event.fields.some((slot) => slot.id === id)
  }
  return false
}

export interface RuntimeNavigation { revision: number; cursor: number; selection?: Selection }
export interface EmbeddedExecution {
  phase: ExecutionPhase
  lens: TimelineLens
  liveCursor: number
  onLensChange: (lens: TimelineLens, cursor: number) => void
}

export function App({ trace: suppliedTrace, embedded = false, onSourceChange, onRuntimeChange, navigation, suppressInspector = false, execution }: {
  trace?: TraceDocument
  embedded?: boolean
  onSourceChange?: (location: SourceLocation | null) => void
  onRuntimeChange?: (runtime: RuntimeState, selection: Selection) => void
  navigation?: RuntimeNavigation | null
  suppressInspector?: boolean
  execution?: EmbeddedExecution
}) {
  const [example, setExample] = useState<ExampleId>('person')
  const trace = suppliedTrace ?? examples[example]
  // The bridge keeps demoId fixed for every prefix of one session. Growing traces update in place.
  return <ExecutionWorkspace key={trace.demoId} trace={trace} example={example} onChooseExample={setExample} embedded={embedded} onSourceChange={onSourceChange} onRuntimeChange={onRuntimeChange} navigation={navigation} suppressInspector={suppressInspector} execution={execution}/>
}

function ExecutionWorkspace({ trace, example, onChooseExample, embedded, onSourceChange, onRuntimeChange, navigation, suppressInspector, execution }: {
  trace: TraceDocument; example: ExampleId; onChooseExample: (example: ExampleId) => void
  embedded: boolean; onSourceChange?: (location: SourceLocation | null) => void
  onRuntimeChange?: (runtime: RuntimeState, selection: Selection) => void
  navigation?: RuntimeNavigation | null
  suppressInspector: boolean
  execution?: EmbeddedExecution
}) {
  const hasConsole = trace.events.some((event) => event.type === 'INPUT_READ' || event.type === 'OUTPUT_WRITE')
  const hasScopes = trace.events.some((event) => event.type === 'ENTER_SCOPE')
  const layout = useMemo(() => createLayout(trace), [trace])
  const [view, setView] = useState<VisualizationMode>('spatial')
  const [presentation, setPresentation] = useState<'spatial' | 'theater'>('spatial')
  const chooseView = (next: VisualizationMode) => {
    if (next !== 'classic' && next !== presentation) { setPresentation(next); navigationActions.setRepresentation(next) }
    setView(next)
  }
  const [guided, setGuided] = useState(true)
  const playback = usePlayback(trace)
  const { cursor, liveCursor } = resolveTimelinePosition(trace.events.length, playback.state.cursor, execution)
  const playing = execution?.lens === 'LIVE' ? execution.phase === 'RUNNING' : playback.state.playing
  const lastReportedHistoryCursor = useRef<number | null>(null)
  const seekHistory = (next: number) => {
    const target = Math.min(Math.max(0, Math.round(next)), liveCursor)
    playback.seekTo(target)
    if (execution) {
      lastReportedHistoryCursor.current = target
      execution.onLensChange('HISTORY', target)
    }
  }
  const replayHistory = () => {
    if (!execution) { playback.playPause(); return }
    if (execution.lens === 'LIVE' || (!playback.state.playing && cursor === liveCursor)) seekHistory(0)
    playback.playPause()
  }
  const returnToLive = () => {
    if (!execution) return
    playback.seekTo(liveCursor)
    lastReportedHistoryCursor.current = liveCursor
    execution.onLensChange('LIVE', liveCursor)
  }
  useEffect(() => {
    if (execution?.lens !== 'HISTORY' || lastReportedHistoryCursor.current === playback.state.cursor) return
    lastReportedHistoryCursor.current = playback.state.cursor
    execution.onLensChange('HISTORY', playback.state.cursor)
  }, [execution, playback.state.cursor])
  const timelinePlayback = execution ? {
    ...playback,
    state: { ...playback.state, cursor, playing: execution.lens === 'HISTORY' && playback.state.playing },
    playPause: replayHistory,
    stepForward: () => seekHistory(cursor + 1),
    stepBack: () => seekHistory(cursor - 1),
    seekTo: seekHistory,
    reset: () => seekHistory(0),
  } : playback
  const runtime = useMemo(() => seek(trace, cursor), [trace, cursor])
  useEffect(() => { onSourceChange?.(runtime.currentSource) }, [runtime.currentSource, onSourceChange])
  const event = trace.events[cursor - 1] ?? null
  const finalTransfer = runtime.returns.at(-1)
  const finalSlot = finalTransfer?.destination ? runtime.frames[finalTransfer.destination.frameId]?.locals[finalTransfer.destination.slotId] : undefined
  const detailLevel = useNavigationStore((state) => state.detailLevel)
  const mode = useNavigationStore((state) => state.mode)
  const followEnabled = useNavigationStore((state) => state.followEnabled)
  const [quality, setQuality] = useState<keyof typeof renderQuality>('balanced')
  const [runtimeFocus, setRuntimeFocus] = useState(() => !embedded && window.matchMedia('(max-width: 760px)').matches)
  const [sourceWidth, setSourceWidth] = useState(34)
  const workbenchRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const lastNavigation = useRef(-1)
  useEffect(() => {
    if (!navigation || navigation.revision === lastNavigation.current) return
    lastNavigation.current = navigation.revision
    seekHistory(navigation.cursor)
    if (navigation.selection !== undefined) setSelection(navigation.selection)
  }, [navigation, playback])
  useEffect(() => { onRuntimeChange?.(runtime, selection) }, [runtime, selection, onRuntimeChange])
  const scene = useMemo(() => buildSceneModel(runtime, layout, detailLevel, presentation), [runtime, layout, detailLevel, presentation])
  const selectEntity = (next: Selection) => {
    setSelection(next)
    if (!next || !onSourceChange) return
    for (let index = cursor - 1; index >= 0; index--) {
      const item = trace.events[index]
      if (item.source && eventDescribesSelection(item, next)) { onSourceChange(item.source); break }
    }
  }

  useEffect(() => { navigationActions.resetView(); navigationActions.followExecution() }, [])

  const array = Object.values(runtime.objects).find((object) => object.array)
  const latestException = runtime.exceptions.at(-1)
  const arrayName = array?.className ?? 'int[]'
  const curatedArray = trace.schemaVersion === 1 && trace.demoId === 'arrays'
  const activity = runtime.arrayActivity
  const scalar = (value: { kind: string; value?: number | boolean | string }) => value.kind === 'primitive' ? String(value.value) : '—'
  const selectionLive = !!selection && (scene.frames.some((node) => node.id === selection.id || node.slots.some((slot) => slot.id === selection.id)) || scene.objects.some((node) => node.id === selection.id || node.fields.some((slot) => slot.id === selection.id) || node.array?.cells.some((slot) => slot.id === selection.id)) || scene.references.some((edge) => edge.id === selection.id))
  const selectedLifetime = selection?.kind === 'slot' ? runtime.variableLifetimes.slice().reverse().find((life) => life.slot.id === selection.id) : undefined
  const focusSelection = () => {
    if (selection && selectionLive) navigationActions.focus(selection)
  }
  const selectedObject = selection?.kind === 'slot' ? scene.objects.find((node) => [...node.fields, ...(node.array?.cells ?? [])].some((slot) => slot.id === selection.id)) : undefined
  const selectedReference = selection?.kind === 'reference' ? scene.references.find((edge) => edge.id === selection.id)
    : selection?.kind === 'object' ? scene.references.find((edge) => edge.targetObjectId === selection.id)
      : selection?.kind === 'frame' ? scene.references.find((edge) => edge.source.kind === 'frame' && edge.source.frameId === selection.id)
        : selection?.kind === 'slot' ? scene.references.find((edge) => edge.source.slotId === selection.id || edge.targetObjectId === selectedObject?.id)
          : scene.references.find((edge) => edge.source.slotId.endsWith(':p')) ?? scene.references[0]
  const traceSelection = (referenceId = selectedReference?.id) => {
    if (referenceId) {
      selectEntity({ kind: 'reference', id: referenceId })
      navigationActions.tracePath(referenceId)
    }
  }
  const chooseLine = (line: number) => {
    const index = trace.events.findIndex((item) => item.source?.line === line && item.type !== 'LINE_EXECUTE')
    if (index >= 0) seekHistory(index + 1)
  }

  useEffect(() => {
    if (embedded) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (/INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || event.target.closest('.monaco-editor'))) return
      if (event.code === 'Space') { event.preventDefault(); timelinePlayback.playPause() }
      else if (event.code === 'ArrowRight') { event.preventDefault(); timelinePlayback.stepForward() }
      else if (event.code === 'ArrowLeft') { event.preventDefault(); timelinePlayback.stepBack() }
      else if (event.key.toLowerCase() === 'h' || event.key === 'Home') navigationActions.home()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [timelinePlayback, embedded])

  return <div className={`app-shell ${embedded ? 'app-shell--embedded' : ''} ${!embedded && hasConsole && runtimeFocus ? 'app-shell--console' : ''}`}>
    {!embedded && <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><Box size={22} strokeWidth={1.5} /></span>
        <span className="brand-copy"><span className="brand-name">Visual Java</span><span className="brand-subtitle">Explore execution from the inside</span></span>
      </div>
      <div className="top-actions">
        <button className="toolbar-button is-subtle" onClick={navigationActions.home} title="Frame the runtime world" aria-label="Home"><Home size={15}/><span className="button-text">Home</span></button>
        <a className="toolbar-button is-subtle" href="/ide" aria-label="Open IDE workspace">IDE Workspace</a>
        <label className="example-picker">Example <select aria-label="Runtime example" value={example} onChange={(event) => onChooseExample(event.target.value as ExampleId)}><option value="person">Person</option><option value="recursion">Recursion · factorial(5)</option><option value="arrays">Arrays · bubble sort</option><option value="control">Control flow · scores</option></select></label>
        <button className="toolbar-button is-subtle" aria-label="Runtime focus mode" aria-pressed={runtimeFocus} onClick={() => setRuntimeFocus((value) => !value)}>{runtimeFocus ? <Minimize2 size={15} /> : <Maximize2 size={15} />}<span className="button-text">{runtimeFocus ? 'Restore source' : 'Runtime view'}</span></button>
      </div>
    </header>}
    <div ref={workbenchRef} className={`workbench ${!embedded && runtimeFocus ? 'workbench--focus' : ''}`} style={{ '--source-width': `${sourceWidth}%` } as React.CSSProperties}>
      {!embedded && (hasConsole && !runtimeFocus ? <div className="source-column">
        <SourcePane trace={trace} location={runtime.currentSource} onChooseLine={chooseLine} />
        <ConsolePane entries={runtime.console} activeEventId={runtime.lastEventId} status={runtime.status} />
      </div> : <SourcePane trace={trace} location={runtime.currentSource} onChooseLine={chooseLine} compact={runtimeFocus} />)}
      {!embedded && !runtimeFocus && <div className="source-divider" role="separator" aria-label="Resize source pane" aria-orientation="vertical" aria-valuenow={sourceWidth} aria-valuemin={24} aria-valuemax={46} tabIndex={0}
        onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); setSourceWidth((width) => Math.max(24, Math.min(46, width + (event.key === 'ArrowRight' ? 2 : -2)))) } }}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { const bounds = workbenchRef.current!.getBoundingClientRect(); setSourceWidth(Math.max(24, Math.min(46, (event.clientX - bounds.left) / bounds.width * 100))) } }} /> }
      <section className={`world-panel ${selection && !suppressInspector ? 'world-panel--inspecting' : ''} ${hasScopes ? 'world-panel--scoped' : ''}`} aria-label="Runtime world">
        <div className={`spatial-view ${view === 'classic' ? 'is-hidden' : ''}`} aria-hidden={view === 'classic'}><RuntimeCanvas visible={view !== 'classic'} fitShallow={trace.demoId.startsWith('debug:') || trace.demoId.startsWith('execution:')} guided={guided} playing={playing} quality={quality} scene={scene} event={event} selection={selection} onSelect={selectEntity} onFocusSelected={navigationActions.focus} /></div>
        <ClassicRuntime visible={view === 'classic'} playing={playing} scene={scene} event={event} guided={guided} selection={selection} onSelect={selectEntity} onFocusSelected={navigationActions.focus} />
        <div className="representation-bar">
          <div role="group" aria-label="Visualization mode" className="view-selector">{visualizationModes.filter((item) => item.available || item.id === 'theater' && !!layout.theater).map((item) => <button key={item.id} className={`toolbar-button ${view === item.id ? 'is-active' : ''}`} aria-pressed={view === item.id} title={item.id === 'theater' ? 'Expand the same array to examine comparisons and writes' : `${item.label} representation`} onClick={() => chooseView(item.id)}>{item.label}</button>)}</div>
          <button className={`toolbar-button guided-toggle ${guided ? 'is-active' : ''}`} title="Toggle explanatory motion and cues" aria-label="Guided execution" aria-pressed={guided} onClick={() => { setGuided((value) => !value); if (guided) navigationActions.freeExplore() }}>Guided <span className="guided-toggle__state">{guided ? 'On' : 'Off'}</span></button>
        </div>
        <div className="world-controls" role="group" aria-label="Runtime camera controls">
          <div className="world-controls__group">
            <button className="toolbar-button" onClick={navigationActions.home} title="Home · frame the runtime world" aria-label="Overview"><Home size={16}/></button>
            <button className="toolbar-button" onClick={focusSelection} disabled={!selectionLive} title="Focus selected entity" aria-label="Focus selected entity"><Crosshair size={16}/></button>
            <button className="toolbar-button" onClick={() => traceSelection()} disabled={!selectedReference} title="Trace selected relationship" aria-label="Trace selected relationship"><Route size={16}/></button>
          </div>
          <div className="world-controls__group">
            <button className={`toolbar-button ${mode === 'FREE_EXPLORE' ? 'is-active' : ''}`} onClick={() => navigationActions.freeExplore()} title="Explore · drag to orbit, right drag to pan, scroll to dolly" aria-label="Explore runtime"><MousePointer2 size={16}/></button>
            <button className={`toolbar-button ${followEnabled ? 'is-active' : ''}`} onClick={() => { if (followEnabled) navigationActions.freeExplore(); else { setGuided(true); navigationActions.followExecution() } }} title="Follow execution" aria-label="Follow execution" aria-pressed={followEnabled}><ScanEye size={16}/></button>
            <button className="toolbar-button" onClick={navigationActions.zoomIn} title="Zoom in" aria-label="Zoom in"><ZoomIn size={16}/></button>
            <button className="toolbar-button" onClick={navigationActions.zoomOut} title="Zoom out" aria-label="Zoom out"><ZoomOut size={16}/></button>
          </div>
        </div>
        <span className="world-label world-label--compact" aria-live="polite">{mode.replaceAll('_', ' ')}</span>
        {scene.stackDepth !== undefined && scene.stackDepth > 1 && <section className="call-status" aria-label="Call and return state">
          <span className="eyebrow">{runtime.status === 'ended' ? 'COMPLETE' : `${runtime.activeFrameIds.length} LIVE FRAMES`}</span>
          {runtime.returns.length > 0 && <div className="return-history"><span>Returns</span>{runtime.returns.map((item) => <span key={item.eventId} title={item.expression}>{item.value.kind === 'primitive' ? String(item.value.value) : ''}</span>)}</div>}
          {runtime.status === 'ended' && <strong className="final-result">{finalSlot?.name ?? 'Return'} = {finalTransfer?.value.kind === 'primitive' ? String(finalTransfer.value.value) : ''}</strong>}
          {guided && scene.returnFlow && runtime.status !== 'ended' && <span className="return-explanation">{scene.returnFlow.expression ?? `${scene.returnFlow.fromLabel} returns`}: {scene.returnFlow.value.kind === 'primitive' ? String(scene.returnFlow.value.value) : ''} → {scene.returnFlow.toLabel}</span>}
        </section>}
        {array?.array && <section className="call-status array-status" aria-label="Array execution state">
          <span className="eyebrow">{runtime.status === 'ended' ? curatedArray ? 'SORT COMPLETE' : 'EXECUTION COMPLETE' : curatedArray ? 'BUBBLE SORT' : 'ARRAY EXECUTION'} · {runtime.arrayMutations.length} INDEXED WRITES</span>
          {runtime.status === 'ended' ? <strong className="final-result">[{array.array.elements.map((cell) => scalar(cell.value)).join(', ')}]</strong>
            : activity?.kind === 'compare' ? <strong>{scalar(activity.values[0])} &gt; {scalar(activity.values[1])} · {activity.result ? 'true → swap' : 'false → keep'}</strong>
            : activity?.kind === 'write' ? <strong>[{activity.index}]: {scalar(activity.before)} → {scalar(activity.after)}</strong>
            : activity?.kind === 'read' ? <strong>Read [{activity.index}] = {scalar(activity.value)}</strong> : <strong>{arrayName} · {array.array.length} elements</strong>}
          {activity && runtime.status !== 'ended' && <span className="return-explanation">{activity.kind === 'compare' ? `Compare indices ${activity.indices.join(' and ')}` : activity.kind === 'write' ? `Value from ${activity.from?.kind === 'element' ? `[${activity.from.index}]` : activity.from?.kind === 'slot' ? 'local slot' : 'observed JVM store'} · cells stay at their indices` : activity.destinationSlotId ? 'Value assigned to a local slot' : 'Observed indexed read'}</span>}
        </section>}
        {hasScopes && <ControlFlowStatus runtime={runtime} event={event} guided={guided} />}
        {runtime.status === 'aborted' && <div className="event-chip event-chip--failure" title={latestException?.message ?? runtime.abortReason ?? undefined}><strong>{latestException ? latestException.className.split('.').at(-1) : 'Recording stopped'}</strong> · {latestException?.message ?? runtime.abortReason}</div>}
        {guided && event?.type === 'SET_FIELD' && <div className="event-chip"><strong>Mutation</strong> · {event.label}</div>}
        <div className="world-access">
          <select disabled={view === 'classic'} aria-label="Rendering quality" value={quality} onChange={(event) => setQuality(event.target.value as keyof typeof renderQuality)}><option value="high">High</option><option value="balanced">Balanced</option><option value="low">Low effects</option></select>
          {mode === 'FREE_EXPLORE' && <button className="toolbar-button" onClick={() => { setGuided(true); navigationActions.followExecution() }}>Return to execution</button>}
          <select aria-label="Select runtime entity" value={selection && selection.kind !== 'reference' ? selection.id : ''} onChange={(event) => { const id = event.target.value; selectEntity(id ? { kind: scene.objects.some((node) => node.id === id) ? 'object' : scene.frames.some((node) => node.id === id) ? 'frame' : 'slot', id } : null) }}>
            <option value="">Inspect an entity…</option>
            {selection && !selectionLive && selectedLifetime && <option value={selection.id}>{selectedLifetime.slot.name} · scope closed</option>}
            {scene.frames.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
            {scene.objects.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
            {scene.frames.flatMap((node) => node.slots.filter((slot) => slot.role !== 'return').map((slot) => <option key={slot.id} value={slot.id}>{node.label} · {slot.name}</option>))}
            {scene.objects.flatMap((node) => node.array?.cells.map((cell) => <option key={cell.id} value={cell.id}>{node.label} · {cell.name}</option>) ?? [])}
          </select>
        </div>
        <div className="world-hint"><kbd>Drag</kbd> {view === 'classic' ? 'pan' : 'orbit'} · {view !== 'classic' && <><kbd>Right drag</kbd> pan · </>}<kbd>Scroll</kbd> {view === 'classic' ? 'zoom' : 'dolly'} · <kbd>Home</kbd> reset</div>
        {!suppressInspector && <Inspector selection={selection} runtime={runtime} scene={scene} onClose={() => setSelection(null)} onReturn={() => { navigationActions.returnToPrevious(); setSelection(null) }} onFocus={focusSelection} onTrace={traceSelection} />}
        {embedded && <div className="world-timeline"><Timeline trace={trace} playback={timelinePlayback} execution={execution ? { phase: execution.phase, lens: execution.lens, liveCursor, onReturnToLive: returnToLive } : undefined} /></div>}
      </section>
    </div>
    {!embedded && hasConsole && runtimeFocus && <ConsolePane entries={runtime.console} activeEventId={runtime.lastEventId} status={runtime.status} compact />}
    {!embedded && <Timeline trace={trace} playback={timelinePlayback} execution={execution ? { phase: execution.phase, lens: execution.lens, liveCursor, onReturnToLive: returnToLive } : undefined} />}
  </div>
}
