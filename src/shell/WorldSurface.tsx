import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { RuntimeState, SourceLocation, TraceDocument } from '../contracts/runtime';
import type { Selection } from '../contracts/interaction';
import type { EmbeddedExecution, RuntimeNavigation } from './runtimeContracts';
import type { Rect } from './shellLayout';
import type { SceneModel, PresentationPlan } from '../contracts/worldV2';
import type { ArrayWindow } from '../world/arrayWindow';
import { RuntimeCanvas } from '../render/RuntimeCanvas';
import { Inspector } from '../render/Inspector';
import {inspectorSideForTarget} from '../render/inspectorPlacement';
import { TimeDock } from './time/TimeDock';
import { useTimelinePlayback } from '../timeline/useTimelinePlayback';
import { createFlowCatalog } from '../world/flowCatalog';
import { useCameraStore } from '../camera/cameraStore';
import { useInteractionStore } from '../interaction/interactionStore';
import { seek } from '../runtime';
import { createLayoutEngine } from '../world/layoutEngine';
import { createSceneProjector } from '../world/sceneProjector';
import { planPresentation } from '../world/presentationPlanner';
import {createConnectorRouter} from '../world/connectorRouter';
import { focusSourceLocation, sourceLocationFor } from './source/sourceSync';
import {useQualityStore} from '../render/quality/qualityStore';
import { shellStore } from '../workspace/shellStore';
import { registerWorldCommandSurface } from '../ide/commands';
import {canFocusWorldSelection} from '../interaction/focusTarget';
import type {Size} from '../camera/projection';
const fullRecording = { state: 'FULL', reason: null, budget: null, lastRecordedSeq: null, executionContinued: false } as const;
export function WorldSurface({ trace, onSourceChange, onRuntimeChange, navigation, suppressInspector = false, execution, safeFrame,inspectorRect,pausedSource,viewport }: {
    trace: TraceDocument;
    onSourceChange?: (location: SourceLocation | null) => void;
    onRuntimeChange?: (runtime: RuntimeState, selection: Selection,recordingId:string) => void;
    navigation?: RuntimeNavigation | null;
    suppressInspector?: boolean;
    execution?: EmbeddedExecution;
    safeFrame: Rect;
    viewport:Size;
    inspectorRect?:Rect|null;
    pausedSource?:{location:SourceLocation|null};
}) {
    const playback = useTimelinePlayback(trace, execution);
    const { cursor, liveHead: liveCursor } = playback.state;
    const seekHistory = playback.seekTo;
    const runtime = useMemo(() => seek(trace, cursor), [trace, cursor]);
    const selection = useInteractionStore(state=>state.selection), setSelection=useInteractionStore(state=>state.select);
    const traceState=useInteractionStore(state=>state.trace), focus=useInteractionStore(state=>state.focus);
    const scope=traceState.scope, setScope=useInteractionStore(state=>state.setTraceScope);
    const inspectorSelection=selection??(focus?{kind:focus.kind==='arrayCell'?'slot':focus.kind==='cluster'?'cluster':focus.kind,id:focus.targetId} as NonNullable<Selection>:null);
    useEffect(()=>{if(inspectorSelection)shellStore.setState({inspectorHidden:false})},[inspectorSelection?.id]);
    const detail = useCameraStore(state => state.detailLevel);
    const viewTile=useCameraStore(state=>state.viewTile);
    const cameraIntent = useCameraStore(state => state.intent?.kind==='cluster'?state.intent:undefined);
    const heroRequested=useCameraStore(state=>state.intent?.kind==='hero'||state.intent?.kind==='recording');
    const heroViewport=useMemo(()=>heroRequested?{safeFrame,viewport}:undefined,[heroRequested,safeFrame.x,safeFrame.y,safeFrame.width,safeFrame.height,viewport.width,viewport.height]);
    const motionPreference=useQualityStore(state=>state.reducedMotion),quality=useQualityStore(state=>state.setting),cinematic=useQualityStore(state=>state.cinematicAvailable),qualityNotice=useQualityStore(state=>state.notice);
    const reducedMotion=motionPreference.os||motionPreference.inApp;
    useEffect(()=>{useCameraStore.getState().setReducedMotion(reducedMotion)},[reducedMotion]);
    useEffect(()=>{useQualityStore.getState().setActivity({scrubbing:playback.state.scrubbing,liveTrailing:playback.state.lens==='LIVE'&&execution?.phase==='RUNNING'})},[playback.state.scrubbing,playback.state.lens,execution?.phase]);
    const compiler = useMemo(() => ({ layout: createLayoutEngine(), projector: createSceneProjector(trace), flows: createFlowCatalog(), router:createConnectorRouter(), previous: null as SceneModel | null, previousPlan: null as PresentationPlan | null, windows: new Map<string,ArrayWindow>() }), [trace.demoId]);
    const layout = useMemo(() => { compiler.layout.append(trace.events); return compiler.layout.state; }, [compiler, trace.events, trace.events.length]);
    const flows = useMemo(() => { const graph = seek(trace, liveCursor).executionGraph; if (graph) compiler.flows.extend(graph, trace); return graph ? compiler.flows : undefined; }, [compiler, trace, liveCursor]);
    const ended = execution ? ['COMPLETED', 'FAILED', 'STOPPED'].includes(execution.phase) : trace.events.length > 0;
    const recording = useMemo(() => {
        for (let i = trace.events.length - 1; i >= 0; i--) {
            const event = trace.events[i];
            if (event.type === 'CAPTURE_STOP')
                return event.recording;
        }
        return fullRecording;
    }, [trace.events, trace.events.length]);
    const scene = useMemo(() => {
        const context = { sessionEnded: ended, pausedAtLiveHead: execution?.phase === 'PAUSED' && execution.lens === 'LIVE', liveHead: liveCursor, recording };
        const projected = compiler.projector.advance(runtime, layout, trace.events, compiler.previous?.cursor ?? 0, cursor, context);
        compiler.previous = projected;
        return projected;
    }, [compiler, runtime, layout, trace.events, cursor, liveCursor, ended, execution?.phase, execution?.lens, recording]);
    const plan = useMemo(() => {
        const previous=compiler.previousPlan?{...compiler.previousPlan,cellWindows:compiler.windows}:undefined;
        const clusterTravelMemberId=cameraIntent?.kind==='cluster'&&cameraIntent.recordingId===scene.recordingId&&cameraIntent.cursor===scene.cursor?cameraIntent.memberId:undefined;
        const next=planPresentation({ scene, flows, router:compiler.router, layout, detailLevel: detail, selection, focusTargetId: focus?.targetId ?? null, clusterTravelMemberId, viewTile:viewTile.split(':').map(Number) as [number,number,number], trace: traceState,hero:heroViewport },previous);
        compiler.previousPlan=next;
        for(const[id,window]of next.cellWindows)compiler.windows.set(id,window);
        return next;
    }, [compiler,scene, flows, layout, detail, selection, focus, traceState,cameraIntent,viewTile,heroViewport]);
    const placedInspector=useRef<string|null>(null);
    useLayoutEffect(()=>{
      if(suppressInspector||!inspectorSelection){placedInspector.current=null;return}
      const key=JSON.stringify([scene.recordingId,inspectorSelection.kind,inspectorSelection.id]);
      if(placedInspector.current===key)return;
      const side=inspectorSideForTarget(scene,plan,inspectorSelection,useCameraStore.getState().pose,viewport);
      if(side){placedInspector.current=key;shellStore.setState({inspectorSide:side})}
      // Wait for a missing prefix target to exist. Once placed, pose, LOD,
      // scrubbing and viewport changes cannot move the current item's card.
    },[scene,plan,inspectorSelection,suppressInspector,viewport]);
    const commandWorld=useRef({scene,plan,recorded:trace.events.length>0});commandWorld.current={scene,plan,recorded:trace.events.length>0};
    useEffect(()=>registerWorldCommandSurface({hasRecording:()=>commandWorld.current.recorded,canFocusSelection:selection=>canFocusWorldSelection(commandWorld.current.scene,commandWorld.current.plan,selection),hasPresentedFlow:id=>commandWorld.current.plan.curves.some(curve=>curve.id===id&&['flow','return','exception','binding-history'].includes(curve.kind))}),[]);
    const lastNavigation = useRef(-1);
    useEffect(() => {
        if (!navigation || navigation.revision === lastNavigation.current)
            return;
        lastNavigation.current = navigation.revision;
        seekHistory(navigation.cursor);
        if (navigation.selection !== undefined)
            setSelection(navigation.selection);
    }, [navigation]);
    useEffect(() => { onRuntimeChange?.(runtime, selection,trace.demoId); }, [runtime, selection, onRuntimeChange,trace.demoId]);
    const sourceLocation=sourceLocationFor({hasFocus:!!focus,focusLocation:focus?focusSourceLocation(scene,focus.targetId,trace):null,pausedAtHead:!!pausedSource&&cursor===liveCursor,pauseLocation:pausedSource?.location??null,cursorEvent:cursor>0?trace.events[cursor-1]??null:null});
    const sourceFileId=sourceLocation?.fileId,sourceLine=sourceLocation?.line;
    useEffect(() => { onSourceChange?.(sourceFileId&&sourceLine?{fileId:sourceFileId,line:sourceLine}:null); }, [sourceFileId,sourceLine,onSourceChange,trace.demoId]);
    useEffect(() => { useCameraStore.getState().resetRecording(!!execution&&trace.events.length>0); }, [trace.demoId]);
    const select = (next: Selection) => {
        setSelection(next);
    };
    const focusSelection = (target=inspectorSelection) => { if (canFocusWorldSelection(scene,plan,target))useCameraStore.getState().focus(target); };
    return <section className="world-panel" aria-label="Runtime world">
    <RuntimeCanvas trace={trace} timeline={playback.store} scene={scene} plan={plan} layout={layout} safeFrame={safeFrame} inspectorRect={suppressInspector?null:inspectorRect} selection={selection} onSelect={select} onFocus={focusSelection}/>
    {!suppressInspector && <Inspector selection={inspectorSelection} scene={scene} runtime={runtime} flows={flows} plan={plan} onClose={() => shellStore.setState({inspectorHidden:true})} onFocus={focusSelection} onSelectRow={id=>setSelection({kind:'slot',id})} onSelectEntity={select} onReturn={()=>useCameraStore.getState().exitFocus()}/>}
    <div className="world-timeline"><TimeDock trace={trace} playback={playback} execution={execution} settings={{reducedMotion,onReducedMotionChange:useQualityStore.getState().setReducedMotion,quality,onQualityChange:tier=>{void useQualityStore.getState().selectQuality(tier)},cinematicAvailable:cinematic.enabled,cinematicReason:cinematic.enabled?undefined:cinematic.reason}}/></div>
    {qualityNotice&&<div className="world-quality-notice glass" role="status">{qualityNotice}<button onClick={()=>useQualityStore.getState().clearNotice()} aria-label="Dismiss rendering notice">×</button></div>}
    {traceState.active && <div className="world-settings glass" role="group" aria-label="Trace scope">{(['relevant', 'current', 'all'] as const).map(item => <button key={item} aria-pressed={scope === item} onClick={() => setScope(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>}
  </section>;
}
