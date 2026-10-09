import { useEffect, useMemo, useRef, useState } from 'react'
import type { RuntimeState, SourceLocation, TraceDocument, TraceEvent } from '../contracts/runtime'
import type { Selection } from '../contracts/interaction'
import type { EmbeddedExecution, RuntimeNavigation } from '../shell/runtimeContracts'
import { renderQuality } from '../theme/tokens'
import { RuntimeCanvas } from '../scene/RuntimeCanvas'
import { Inspector } from '../ui/Inspector'
import { Timeline, resolveTimelinePosition } from '../ui/timeline/Timeline'
import { navigationActions, useNavigationStore } from '../navigation'
import { usePlayback } from '../playback'
import { seek } from '../runtime'
import { layoutForTrace } from '../app/layoutForTrace'
import { buildSceneModel } from '../world/sceneModel'
import { deriveSemanticTransition, recentFlowTransitions, type SemanticTransition } from '../motion/semanticTransition'
import { transitionIsFlow } from '../motion/flowPresentation'
function eventDescribesSelection(event: TraceEvent, selection: NonNullable<Selection>): boolean {
  const id = selection.kind === 'reference' ? selection.id.replace(/^ref:/, '') : selection.id
  if (selection.kind === 'class') return 'classId' in event && event.classId === id
  if (selection.kind === 'frame') return 'frameId' in event && event.frameId === id
  // Passive boundary snapshots have the caller's source, not the object's
  // defining/writing source. Keep selection navigation on actual operations.
  if (selection.kind === 'object') return event.type !== 'OBJECT_OBSERVE' && 'objectId' in event && event.objectId === id
  if (selection.kind === 'slot' || selection.kind === 'reference') {
    if (event.type === 'DECLARE_LOCAL') return event.slot.id === id
    if (event.type === 'ENTER_METHOD') return event.locals.some((slot) => slot.id === id)
    if (event.type === 'ASSIGN_LOCAL' || event.type === 'SET_FIELD') return event.slotId === id
    if (event.type === 'CREATE_REFERENCE' || event.type === 'CLEAR_REFERENCE') return event.sourceSlot.slotId === id
    if (event.type === 'ALLOCATE_OBJECT') return event.fields.some((slot) => slot.id === id)
  }
  return false
}

export function WorldSurface({ trace, onSourceChange, onRuntimeChange, navigation, suppressInspector = false, execution }: {
  trace: TraceDocument
  onSourceChange?: (location: SourceLocation | null) => void
  onRuntimeChange?: (runtime: RuntimeState, selection: Selection) => void
  navigation?: RuntimeNavigation | null
  suppressInspector?: boolean
  execution?: EmbeddedExecution
}) {
  const eventCount = trace.events.length
  const layout = useMemo(() => layoutForTrace(trace), [trace, eventCount])
  const presentation = 'spatial' as const
  const [flowDisplay, setFlowDisplay] = useState<'relevant' | 'current' | 'all'>('relevant')
  const [activeMotion, setActiveMotion] = useState<SemanticTransition | null>(null)
  const motionIntent = useRef<'step' | 'scrub' | null>(null)
  const guided = true
  const playback = usePlayback(trace)
  const { cursor, liveCursor } = resolveTimelinePosition(trace.events.length, playback.state.cursor, execution)
  const playing = execution?.lens === 'LIVE' ? execution.phase === 'RUNNING' : playback.state.playing
  const lastReportedHistoryCursor = useRef<number | null>(null)
  const seekHistory = (next: number, intent: 'step' | 'scrub' = 'scrub') => {
    motionIntent.current = intent
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
    stepForward: () => seekHistory(cursor + 1, 'step'),
    stepBack: () => seekHistory(cursor - 1),
    seekTo: seekHistory,
    reset: () => seekHistory(0),
  } : { ...playback,
    stepForward: () => { motionIntent.current = 'step'; playback.stepForward() },
    stepBack: () => { motionIntent.current = 'scrub'; playback.stepBack() },
    seekTo: (next: number) => { motionIntent.current = 'scrub'; playback.seekTo(next) },
  }
  const runtime = useMemo(() => seek(trace, cursor), [trace, cursor])
  const previousMotionCursor = useRef({ demoId: trace.demoId, cursor, playing })
  useEffect(() => {
    const previous = previousMotionCursor.current
    previousMotionCursor.current = { demoId: trace.demoId, cursor, playing }
    const intent = motionIntent.current
    motionIntent.current = null
    if (previous.demoId !== trace.demoId || cursor !== previous.cursor + 1 || (!playing && !previous.playing && intent !== 'step')) {
      setActiveMotion(null)
      return
    }
    const current = trace.events[cursor - 1]
    if (!current || current.importance === 'quiet') { setActiveMotion(null); return }
    setActiveMotion(deriveSemanticTransition(seek(trace, cursor - 1), current, runtime))
  }, [trace, cursor, playing, runtime])
  useEffect(() => {
    if (!activeMotion) return
    const timer = window.setTimeout(() => setActiveMotion(null), 650)
    return () => window.clearTimeout(timer)
  }, [activeMotion])
  useEffect(() => { onSourceChange?.(runtime.currentSource) }, [runtime.currentSource, onSourceChange])
  const event = trace.events[cursor - 1] ?? null
  const detailLevel = useNavigationStore((state) => state.detailLevel)
  const [quality, setQuality] = useState<keyof typeof renderQuality>(() => 'balanced')
  const [selection, setSelection] = useState<Selection>(null)
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null)
  const lastNavigation = useRef(-1)
  useEffect(() => {
    if (!navigation || navigation.revision === lastNavigation.current) return
    lastNavigation.current = navigation.revision
    seekHistory(navigation.cursor)
    if (navigation.selection !== undefined) setSelection(navigation.selection)
  }, [navigation, playback])
  useEffect(() => { onRuntimeChange?.(runtime, selection) }, [runtime, selection, onRuntimeChange])
  const scene = useMemo(() => buildSceneModel(runtime, layout, detailLevel, presentation), [runtime, layout, detailLevel, presentation])
  const transitions = useMemo(() => {
    const ids = new Set<string>(selection ? [selection.id] : [])
    if (selection?.kind === 'object') {
      const node = scene.objects.find(item => item.id === selection.id)
      for (const item of [...(node?.fields ?? []).slice(0, 6), ...(node?.array?.cells ?? []).slice(0, 32)]) ids.add(item.id)
    }
    if (selection?.kind === 'frame') scene.frames.find(item => item.id === selection.id)?.slots.forEach(item => ids.add(item.id))
    if (selection?.kind === 'class') scene.classes?.find(item => item.id === selection.id)?.fields.forEach(item => ids.add(item.id))
    return recentFlowTransitions(trace, runtime, flowDisplay === 'all' ? new Set() : ids, flowDisplay === 'all' ? 24 : 6)
  }, [trace, runtime, selection, flowDisplay, scene])
  const flowHistory = flowDisplay === 'current' || runtime.status === 'running' && !selection && flowDisplay === 'relevant'
    ? [] : transitions.filter(transitionIsFlow)
  const selectEntity = (next: Selection) => {
    setActiveMotion(null)
    setSelectedFlowId(null)
    setSelection(next)
    if (!next || !onSourceChange) return
    for (let index = cursor - 1; index >= 0; index--) {
      const item = trace.events[index]
      if (item.source && eventDescribesSelection(item, next)) { onSourceChange(item.source); break }
    }
  }
  const selectFlow = (id: string) => {
    const flow = transitions.find((item) => item.id === id)
    if (!flow) return
    const endpoint = flow.to?.kind !== 'io' ? flow.to : flow.from?.kind !== 'io' ? flow.from : undefined
    if (endpoint) selectEntity({ kind: endpoint.kind, id: endpoint.id })
    setSelectedFlowId(id)
    if (flow.source) onSourceChange?.(flow.source)
  }

  useEffect(() => {
    setSelection(null)
    setActiveMotion(null)
    navigationActions.resetView()
  }, [trace.demoId])


  const selectionLive = !!selection && (scene.frames.some(node => node.id === selection.id || node.slots.some(slot => slot.id === selection.id)) || scene.objects.some(node => node.id === selection.id || node.fields.some(slot => slot.id === selection.id) || node.array?.cells.some(slot => slot.id === selection.id)) || scene.classes?.some(node => node.id === selection.id || node.fields.some(slot => slot.id === selection.id)) || scene.references.some(edge => edge.id === selection.id))
  const focusSelection = () => { if (selection && selectionLive) navigationActions.focus(selection) }
  const traceSelection = (referenceId?: string) => {
    const reference = scene.references.find(edge => edge.id === referenceId || edge.targetObjectId === selection?.id || edge.source.slotId === selection?.id)
    if (reference) navigationActions.tracePath(reference.id)
  }
  return <section className="world-panel" aria-label="Runtime world">
    <RuntimeCanvas visible fitShallow={trace.capture?.origin === 'jvm'} guided={guided} playing={playing} quality={quality} scene={scene} layout={layout} event={event} transition={activeMotion} flowHistory={flowHistory} flowDisplay={flowDisplay} selection={selection} selectedFlowId={selectedFlowId} onSelectFlow={selectFlow} inspectorVisible={selectionLive && !suppressInspector} onSelect={selectEntity} onFocusSelected={navigationActions.focus}/>
    {!suppressInspector && <Inspector selection={selection} flow={transitions.find(item => item.id === selectedFlowId && item.seq < cursor)} runtime={runtime} scene={scene} onClose={() => { setSelection(null); setSelectedFlowId(null) }} onReturn={navigationActions.returnToPrevious} onFocus={focusSelection} onTrace={traceSelection}/>}
    <div className="world-timeline"><Timeline trace={trace} playback={timelinePlayback} execution={execution ? { phase: execution.phase, lens: execution.lens, liveCursor, onReturnToLive: returnToLive } : undefined}/></div>
    <div className="world-settings glass">
      <label>Trace <select aria-label="Flow history" value={flowDisplay} onChange={event => setFlowDisplay(event.target.value as typeof flowDisplay)}><option value="relevant">Relevant</option><option value="current">Current</option><option value="all">All</option></select></label>
      <label>Motion <select aria-label="Rendering quality" value={quality} onChange={event => setQuality(event.target.value as keyof typeof renderQuality)}><option value="high">High</option><option value="balanced">Balanced</option><option value="low">Low</option></select></label>
    </div>
  </section>
}
