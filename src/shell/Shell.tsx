import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { exposeQaBridge } from '../qa/qaBridge'
import { ChevronLeft,FolderOpen,Maximize2,Plus,Save,Upload,X } from 'lucide-react'
import type { SourceLocation, TraceDocument } from '../contracts/runtime'
import {DebugDrawer} from './dock/DebugDrawer'
import {Dock} from './dock/Dock'
import {JdkDialog} from './dock/JdkDialog'
import {ErrorsDrawer} from './dock/ErrorsDrawer'
import { bridge } from '../ide/bridge'
import { ideCommandDefinitions,type IdeCommandId } from '../ide/commands'
import { tabMenuCommands } from '../ide/contextMenus'
import { LaunchConfigDialog } from './dialogs/LaunchConfigDialog'
import {PathInputDialog} from './dialogs/PathInputDialog'
import {DeleteConfirmDialog} from './dialogs/DeleteConfirmDialog'
import {UnsavedChangesDialog} from './dialogs/UnsavedChangesDialog'
import { ProblemsDrawer } from './dock/ProblemsDrawer'
import { ProjectExplorer } from '../ide/ProjectExplorer'
import { CommandMenu } from './dialogs/CommandMenu'
import { Picker } from './picker/Picker'
import {DirtyRunDialog} from './dialogs/DirtyRunDialog'
import { useInteractionStore } from '../interaction/interactionStore'
import { useAppState } from '../state/useAppState'
import { RecordedSourceView } from './source/RecordedSourceView'
import { recordedFileFor, pauseSourceLocation,sourcePauseFor,exceptionSourceLocation,exceptionLineForFile,sourceProofFile } from './source/sourceSync'
import { loadJavaEditorRuntime } from '../language/editorRuntime'
import { Header } from './Header'
import type {RecordingChoices} from './HeaderProjectMenu'
import { DebugBar } from './DebugBar'
import {ConsoleDrawer} from './dock/ConsoleDrawer'
import { computeShellLayout } from './shellLayout'
import { useViewport } from './useViewport'
import { WorldSurface } from './WorldSurface'
import {capturedSourceReveal,currentSourceReveal,type SourceReveal,type SourceRevealRequest} from './source/sourceReveal'
import {shellStore} from '../workspace/shellStore'
const idleTrace: TraceDocument = { schemaVersion: 2, demoId: 'ide:ready', sourceFiles: [], events: [] }
const EditableJavaEditor=lazy(async()=>{await loadJavaEditorRuntime();const module=await import('../ide/EditableJavaEditor');return{default:module.EditableJavaEditor}})


import { filename,useWorkspace } from '../workspace/useWorkspace'
import './shell.css'
import './explorer.css'
export interface ShellProps { recording?: TraceDocument; recordingChoices?: RecordingChoices }
export function Shell({ recording, recordingChoices }: ShellProps) {
  const workspace = useWorkspace(!!recording)
  const [recordedSource,setRecordedSource]=useState<{demoId:string;fileId:string|undefined;location:SourceLocation|null}|null>(null)
  const recordedLocation=recordedSource?.demoId===recording?.demoId?recordedSource?.location??null:null
  const recordedFile=recording?recordedFileFor(recording,recordedLocation,recordedSource?.demoId===recording.demoId?recordedSource.fileId:recording.sourceFiles[0]?.fileId):workspace.recordedView?.file
  const setRecordedLocation=useCallback((location:SourceLocation|null)=>{if(recording)setRecordedSource(previous=>({demoId:recording.demoId,location,fileId:location&&recording.sourceFiles.some(file=>file.fileId===location.fileId)?location.fileId:previous?.demoId===recording.demoId?previous.fileId:recording.sourceFiles[0]?.fileId}))},[recording])
  const viewport = useViewport()
  const focusTargetId = useInteractionStore(state => state.focus?.targetId ?? null)
  const worldSelection = useInteractionStore(state => state.selection)
  const currentTrace=recording??workspace.visualization?.trace??idleTrace
  const [sourceReveal,setSourceReveal]=useState<SourceReveal|null>(null),sourceRevealRevision=useRef(0)
  const activeReveal=currentSourceReveal(sourceReveal,currentTrace.demoId,workspace.runtime?.cursor??0,worldSelection?.id??focusTargetId)
  const revealSource=useCallback((request:SourceRevealRequest)=>{
    const next=capturedSourceReveal(currentTrace,request,++sourceRevealRevision.current)
    if(!next)return
    setSourceReveal(next)
    // Reveal the captured line without an Inspector covering the Source panel.
    // Selection, Focus, runtime source binding, drafts and camera are untouched.
    shellStore.setState({sourceOpen:true,focusSourceOpen:true,inspectorHidden:true})
  },[currentTrace])
  useEffect(()=>{if(sourceReveal&&!activeReveal)setSourceReveal(null)},[sourceReveal,activeReveal])
  useEffect(()=>setSourceReveal(null),[workspace.projectId,workspace.active])
  const appState = useAppState(workspace, focusTargetId, recording)
  const layout = computeShellLayout({ viewport, appState, hasRuntimeWorld: !!recording || !!workspace.visualization, sourceExpanded: !recording && workspace.workspaceMode === 'code', narrowDrawerOpen: workspace.focusSourceOpen, explorerOpen: workspace.explorerOpen, inspector: { open: !!(worldSelection||focusTargetId) && !workspace.inspectorHidden, side: workspace.inspectorSide }, dockDrawer: { open: workspace.bottomOpen, heightRatio: workspace.bottomHeight / 100 }, debugActive: workspace.execution?.kind === 'debug' && workspace.activeExecution })
  const editorVisible=layout.source.size!=='DRAWER_COLLAPSED'&&!!(activeReveal??(recording?recordedFile:workspace.recordedView??workspace.activeTab))
  const [sourceEditorOpened,setSourceEditorOpened]=useState(editorVisible)
  const mountSourceEditor=sourceEditorOpened||layout.source.size!=='DRAWER_COLLAPSED'
  // First display owns the lazy load. Later collapse preserves models/view state.
  useLayoutEffect(()=>{if(editorVisible)setSourceEditorOpened(true)},[editorVisible])
  useLayoutEffect(() => exposeQaBridge({ appState, layout, cursor: workspace.runtime?.cursor ?? 0, liveHead: recording?.events.length ?? workspace.visualization?.trace.events.length ?? 0 }))
  const rectangle = (prefix: string, rect: { x: number; y: number; width: number; height: number } | null) => rect ? Object.fromEntries(Object.entries(rect).filter(([key]) => ['x','y','width','height'].includes(key)).map(([key, value]) => ['--'+prefix+'-'+key, value+'px'])) : {}
  const readyLeft=Math.max(layout.safeFrame.x,layout.source.x+layout.source.width+12,layout.explorer?layout.explorer.x+layout.explorer.width+12:0)
  const readyRight=layout.safeFrame.x+layout.safeFrame.width-12,readyWidth=Math.min(260,Math.max(0,readyRight-readyLeft))
  const readyTop=Math.max(layout.safeFrame.y+viewport.height*.08,layout.debugBar?layout.debugBar.y+layout.debugBar.height+12:layout.header.height+12)
  const geometry = { ...rectangle('header', layout.header), ...rectangle('source', layout.source), ...rectangle('timeline', layout.timeDock), ...rectangle('drawer', layout.dockDrawer), ...rectangle('dock',layout.dockStrip), ...rectangle('inspector', layout.inspector), ...rectangle('explorer', layout.explorer), ...rectangle('debug', layout.debugBar), '--source-heading-inset':layout.sourceHeadingInset+'px', '--ready-x':(readyLeft+(readyRight-readyLeft-readyWidth)/2)+'px','--ready-y':readyTop+'px','--ready-width':readyWidth+'px' }

const { projects, projectId, tree, tabs, active, setActive, jdk, setJdk, jdkInput, setJdkInput, showJdk, build, execution, timelineLens, setTimelineLens, tool, inspectorHidden, bottomOpen, picker, setPicker, tabMenu, setTabMenu, notice, setNotice, busy, pending, projectDialog, setProjectDialog, nav, mainClass, setMainClass, launch, setLaunch, showLaunch, setShowLaunch, showSymbols, setShowSymbols, languageClient, visualization, runtimeExpanded, runtime, runtimeNavigation, recordedView, setRecordedView, mappedExecutingSource, setCwdInvalid, commands, collapsed, shellRef, contentRef, upperRef, importRef, activeRef, launchRef, mainClassRef, cwdInvalidRef, displayedBreakpoints, activeTab, entries, diagnostics, languageProblems, debugSession, recordingIsCurrent, recordedPhase, fail, refreshTree, switchProject, edit, commandContext, resolveDecision, invoke, closeTab, action, navigateRuntime, handleRuntimeChange, toggleBreakpoint, removeBreakpoint, handleExecutingSource, newEntry, cancelProjectDialog, submitProjectDialog, importFiles, openDiagnostic, divider, toggleTreeEntry, treeAction, projectOptions, pickerItems, choosePicker, showTabMenu, activeExecution, targets } = workspace
const pause=recording?null:sourcePauseFor(debugSession,visualization?.sessionId??null)
const pausedAtHead=!!pause&&(!visualization||runtime?.cursor===visualization.trace.events.length)
const sourceMark=focusTargetId?'focus':pausedAtHead?'paused':recording||runtime&&visualization&&runtime.cursor<visualization.trace.events.length?'history':'running'
const pausedLocation=pause&&debugSession?pauseSourceLocation(pause,debugSession.sourceManifest):null
const pauseId=pause?`${debugSession!.sessionId}:${pause.threadId}:${pause.frameId}:${pause.rawEventCount}:${pause.line}`:null
const sourceKey=`${recording?.demoId??visualization?.trace.demoId??'workspace'}:${sourceMark}:${focusTargetId??runtime?.cursor??0}`
const throwLocation=exceptionSourceLocation(runtime,recording??visualization?.trace,workspace.runtimeRecordingId)
const verifiedFile=sourceProofFile(workspace.sourceFileProof,visualization?.sessionId,activeTab)
const exceptionLine=exceptionLineForFile(throwLocation,activeReveal?.file??recordedFile??verifiedFile)
const sourcePeekLabel=`${activeReveal?.file.name || recordedFile?.name || filename(mappedExecutingSource?.path??active) || 'Source'} · ${activeReveal?.location.line??recordedLocation?.line??recordedView?.location?.line??mappedExecutingSource?.line??'—'}`
return <div className={`shell ide-shell ${debugSession&&activeExecution?'shell--debug-active':''} ${layout.sourceHeadingInset>0?'shell--source-controls-inset':''} ${workspace.explorerOpen ? 'shell--explorer-open' : ''} ${workspace.bottomOpen ? 'shell--drawer-open' : ''} ${layout.viewportClass === 'NARROW' ? 'shell--narrow' : ''} ${layout.source.size === 'DRAWER_COLLAPSED' ? 'shell--source-peek' : ''}`} data-viewport={layout.viewportClass} ref={shellRef} style={geometry as React.CSSProperties}>
    <section className="ide-runtime-panel" aria-label="Runtime visualization area">
            <div className={`ide-runtime-live${recording||visualization ? '' : ' ide-runtime-live--idle'}`}>
              <WorldSurface viewport={viewport} safeFrame={layout.safeFrame} inspectorRect={layout.inspector} trace={currentTrace} onRevealSource={revealSource} pausedSource={pause?{location:pausedLocation}:undefined} onSourceChange={recording ? setRecordedLocation : recordingIsCurrent||!visualization&&pause ? handleExecutingSource : undefined} onRuntimeChange={handleRuntimeChange} navigation={runtimeNavigation} suppressInspector={tool === 'errors' && bottomOpen || inspectorHidden} execution={visualization ? { phase: recordingIsCurrent ? execution!.phase : recordedPhase, lens: timelineLens, liveCursor: visualization.trace.events.length, onLensChange: (lens) => setTimelineLens(lens) } : undefined}/>
              {workspace.previousRecording && <div className="shell-prior-world glass" role="status">Previous run · {workspace.traceStale ? 'source changed' : 'retained recording'}</div>}
{!recording && !visualization && <div className="ide-runtime-ready" aria-label={execution?.phase === 'WAITING_FOR_INPUT' ? 'Runtime waiting for input' : 'Runtime ready'}><span>RUNTIME</span><strong>{execution?.phase === 'BUILDING' ? 'Building Java…' : execution?.phase === 'STARTING' ? 'Starting Java…' : execution?.phase === 'WAITING_FOR_INPUT' ? 'Waiting for input' : 'Ready'}</strong><p>{execution?.phase === 'WAITING_FOR_INPUT' ? 'Continue your program in Console.' : execution?.support === 'RUN_ONLY' ? execution.supportReason ?? 'Console execution' : 'Run your Java program to enter the world.'}</p></div>}
            </div>
          </section>
<Header workspace={workspace} appState={appState} recordingChoices={recordingChoices}/>
    {showJdk && <JdkDialog value={jdkInput} error={jdk?.error??null} busy={busy} onChange={setJdkInput} onClose={()=>invoke('workbench.jdk',{})} onSubmit={()=>action(async()=>setJdk(await bridge.detectJdk(jdkInput||null)))}/>}
    {debugSession && activeExecution && <DebugBar workspace={workspace}/>}
    <button className="shell-source-peek glass" onClick={() => invoke('workbench.source', {})} aria-label="Show source drawer" title={sourcePeekLabel}>{sourcePeekLabel}</button>
    <div className="ide-main" ref={contentRef}>
      
      <aside className="ide-project-panel">
        <div className="ide-panel-heading"><span>PROJECT</span><span className="ide-panel-actions"><button title="New file" aria-label="Create File" disabled={!projectId} onClick={() => newEntry('file')}><Plus size={15}/></button><button title="New folder" aria-label="Create Folder" disabled={!projectId} onClick={() => newEntry('folder')}><FolderOpen size={15}/></button><button title="Refresh project" aria-label="Refresh Project" disabled={!projectId} onClick={() => void action(() => refreshTree(projectId))}>↻</button></span></div>
        <input ref={importRef} type="file" hidden multiple {...{ webkitdirectory: '' }} onChange={(event) => { void importFiles(event.target.files); event.target.value = '' }} />
        <ProjectExplorer tree={tree} active={active} collapsed={collapsed} onToggle={toggleTreeEntry} onOpen={(path) => invoke('file.open', {}, path)} onAction={treeAction} getCommandContext={(entry) => commandContext(entry?.path)} onCommand={(id, context) => { setNotice(''); void commands.execute(id, context, {}).catch(fail) }} availability={(id, entry, context) => busy ? { enabled: false, reason: 'Wait for the current operation' } : commands.availability(id, context ?? commandContext(entry?.path))}/>
        <div className="ide-project-foot">{entries.filter((item) => item.kind === 'file').length} files · Managed local workspace</div>
      </aside>
      <div className="ide-divider ide-divider--vertical" role="separator" aria-label="Resize project pane" tabIndex={0} {...divider('project')}/>
      {!recording && !projectId ? <section className="ide-first-use" aria-labelledby="ide-first-use-title"><div className="ide-first-use-content">
        <span>VISUAL JAVA</span><h1 id="ide-first-use-title">Open Project</h1>
        <p>Choose a managed project, import a folder copy, or create a new Java project.</p>
        {projects.length > 0 && <label>Managed projects<select aria-label="Open existing project" value="" disabled={busy} onChange={(event) => void action(() => switchProject(event.target.value))}><option value="" disabled>Choose a project</option>{projectOptions}</select></label>}
        <div className="ide-first-use-actions"><button type="button" onClick={() => invoke('workbench.importProject', {})}><Upload size={15}/> Import folder (copy)</button><button type="button" className="ide-primary" onClick={() => invoke('workbench.newProject', {})}><Plus size={15}/> New Project</button></div>
        <small>Imported folders become managed copies; originals stay in place.</small>
      </div></section> : <section className="ide-code-workspace">
        <div className="ide-upper" ref={upperRef}>
          <div className="ide-editor-panel" onKeyDown={event=>{
            const target=event.target instanceof HTMLElement?event.target:null
            if(event.code!=='Escape'||event.defaultPrevented||event.nativeEvent.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey
              ||workspace.workspaceMode!=='code'||!workspace.visualization
              ||target?.closest('.monaco-editor,input,textarea,select,[contenteditable],[role="textbox"],[role="dialog"],[role="menu"]'))return
            event.preventDefault();event.stopPropagation();invoke('workbench.source',{})
          }}>
            <div className="ide-source-heading"><button className="shell-source-files" aria-label="Show project explorer" title="Explorer" onClick={() => invoke('workbench.explorer', {})}>Files</button><span>SOURCE</span><span className="ide-panel-actions">{activeReveal&&<button aria-label="Close recorded source preview" title="Close recorded source preview" onClick={()=>setSourceReveal(null)}><X size={13}/></button>}<button onClick={() => invoke('file.save', {})} disabled={!!activeReveal || !activeTab || activeTab.draft === activeTab.content || busy} title="Save active file" aria-label="Save active file"><Save size={13}/></button><button onClick={() => {setSourceReveal(null);invoke('workbench.edit', {})}} aria-label="Expand source for editing" title="Expand source for editing"><Maximize2 size={13}/></button><button onClick={() => invoke('workbench.source', {})} aria-label={runtimeExpanded ? 'Close source drawer' : 'Collapse source'} title="Collapse source"><ChevronLeft size={15}/></button></span></div>
            <div className="ide-tabs" role="tablist">{activeReveal&&<div className="ide-tab is-active" role="tab" aria-selected="true"><span>{activeReveal.file.name} · Recorded source</span></div>}{!activeReveal&&recording&&recordedFile&&<div className="ide-tab is-active" role="tab" aria-selected="true"><span>{recordedFile.name} · Recorded source</span></div>}{tabs.map((tab) => <div key={tab.path} className={`ide-tab ${!activeReveal&&active === tab.path ? 'is-active' : ''}`} onContextMenu={(event) => { event.preventDefault(); const button = event.currentTarget.querySelector<HTMLButtonElement>('button'); button?.focus(); showTabMenu(tab.path, event.clientX, event.clientY) }} onKeyDown={(event) => { if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); showTabMenu(tab.path, rect.left, rect.bottom) } }} role="tab" aria-selected={!activeReveal&&active === tab.path}><button onClick={() => { setSourceReveal(null); activeRef.current = tab.path; setActive(tab.path); setRecordedView(null) }} title={tab.path}><span className="ide-java-icon">J</span>{filename(tab.path)}{tab.draft !== tab.content && <span className="ide-dirty"/>}</button><button aria-label={`Close ${tab.path}`} onClick={() => closeTab(tab.path)}><X size={13}/></button></div>)}</div>
            <div className="ide-editor-body">{mountSourceEditor && (activeReveal?<RecordedSourceView file={activeReveal.file} location={activeReveal.location} mark="reveal" sourceKey={`reveal:${activeReveal.recordingId}:${activeReveal.targetId}:${activeReveal.cursor}:${activeReveal.revision}`} exceptionLine={exceptionLine} viewportHeight={viewport.height}/>:recording ? <RecordedSourceView file={recordedFile} location={recordedLocation} mark={sourceMark} sourceKey={sourceKey} exceptionLine={exceptionLine} pauseId={pauseId} viewportHeight={viewport.height}/> : recordedView ? <RecordedSourceView file={recordedView.file} location={recordedView.location} mark={sourceMark} sourceKey={sourceKey} exceptionLine={exceptionLine} pauseId={sourceMark==='paused'&&(recordedView.location?.line!==pausedLocation?.line||recordedView.location?.fileId!==pausedLocation?.fileId)?null:pauseId} viewportHeight={viewport.height}/> : activeTab ? <Suspense fallback={<div role="status">Loading Java editor…</div>}><EditableJavaEditor key={projectId} projectId={projectId} sourceMark={sourceMark} sourceKey={sourceKey} exceptionLine={exceptionLine} pauseId={sourceMark==='paused'&&(mappedExecutingSource?.line!==pausedLocation?.line||mappedExecutingSource?.recordedFileId!==pausedLocation?.fileId)?null:pauseId} viewportHeight={viewport.height} path={activeTab.path} value={activeTab.draft} onChange={(value) => edit(activeTab.path, value)} diagnostics={diagnostics} navigate={nav} executingLine={activeTab.path === mappedExecutingSource?.path ? mappedExecutingSource.line : null} pausedLine={debugSession?.status === 'paused' && runtime?.cursor === visualization?.trace.events.length && activeTab.path === mappedExecutingSource?.path ? mappedExecutingSource.line : null} breakpoints={displayedBreakpoints} onToggleBreakpoint={(line) => toggleBreakpoint(activeTab.path, line)} onSave={() => invoke('file.save', {}, activeTab.path)}/></Suspense> : <div className="ide-editor-empty"><span>JAVA SOURCE</span><h2>Choose a file to edit</h2><p>Open a Java file from the project explorer, or create a new one.</p></div>)}</div>
            <div className="ide-editor-foot"><span>{activeReveal?`Recorded source · ${activeReveal.file.name}`:(recording?!recordedLocation||!recording.sourceFiles.some(file=>file.fileId===recordedLocation.fileId):workspace.sourceUnavailable) ? 'No project source at this point' : recordedFile ? `Recorded source · ${recordedFile.name}` : recording ? 'No recorded project source' : active || 'No file selected'}</span><span>Java · UTF-8 · {(activeReveal?.file.content ?? recordedFile?.content ?? activeTab?.draft)?.split('\n').length ?? 0} lines</span></div>
          </div>
          <div className="ide-divider ide-divider--vertical" role="separator" aria-label="Resize runtime pane" tabIndex={0} {...divider('runtime')}/>
          
        </div>
        <Dock workspace={workspace} recording={recording} drawerBottom={layout.timeDock.y} viewportHeight={viewport.height}>
          {tool === 'debugger' ? <DebugDrawer session={debugSession} inspection={workspace.debugInspection} worldSessionId={visualization?.sessionId??null} breakpoints={displayedBreakpoints} onInspect={navigateRuntime} onRemove={removeBreakpoint}/>
          : tool === 'errors' ? <ErrorsDrawer workspace={workspace} recording={recording} onRevealSource={location=>revealSource({recordingId:currentTrace.demoId,cursor:workspace.runtime?.cursor??0,targetId:worldSelection?.id??focusTargetId,location})}/>
          : tool === 'problems' ? <ProblemsDrawer build={build} language={languageProblems} onOpen={openDiagnostic}/>
          : <ConsoleDrawer workspace={workspace} recording={recording}/>}
        </Dock>
      </section>}
    </div>
    {tabMenu && <CommandMenu label={`Tab actions for ${tabMenu.context.target?.path}`} x={tabMenu.x} y={tabMenu.y}
      items={tabMenuCommands.map((id) => ({ id, label: id === 'resource.rename' ? 'Rename' : ideCommandDefinitions[id].title, ...(busy ? { enabled: false as const, reason: 'Wait for the current operation' } : commands.availability(id, tabMenu.context)) }))}
      onClose={() => setTabMenu(null)} onChoose={(id) => { const context = tabMenu.context; setTabMenu(null); setNotice(''); requestAnimationFrame(() => { void commands.execute(id as IdeCommandId, context, {}).catch(fail) }) }}/>}
    {picker && <Picker key={picker.mode} mode={picker.mode} items={pickerItems} onClose={() => setPicker(null)} onChoose={choosePicker}/>}
    {showLaunch && <LaunchConfigDialog value={{ ...launch, mainClass }} targets={targets} onClose={() => setShowLaunch(false)} onSave={(configuration) => { launchRef.current = configuration; setLaunch(configuration); mainClassRef.current = configuration.mainClass; setMainClass(configuration.mainClass); cwdInvalidRef.current = false; setCwdInvalid(false); setShowLaunch(false) }}/>}
    {showSymbols && <Picker mode="symbols" client={languageClient} onClose={() => setShowSymbols(false)} onOpen={(location) => commands.execute('file.open', commandContext(location.path), { location }).then(() => {})}/>}
    {projectDialog && (projectDialog.kind==='delete'
      ? <DeleteConfirmDialog path={projectDialog.path} dirtyPaths={projectDialog.dirtyPaths??[]} busy={busy} error={notice} onClose={cancelProjectDialog} onDelete={()=>void submitProjectDialog()} onSaveAndDelete={()=>{const resolve=projectDialog.resolveDelete;setProjectDialog(null);resolve?.('save')}}/>
      : <PathInputDialog key={projectDialog.kind} kind={projectDialog.kind} value={projectDialog.value} busy={busy} error={notice} onChange={value=>{setNotice('');setProjectDialog({...projectDialog,value})}} onClose={cancelProjectDialog} onSubmit={()=>void submitProjectDialog()}/>)}
    {pending && (pending.kind === 'run'
      ? <DirtyRunDialog paths={pending.paths} busy={busy} error={notice} onSave={()=>void resolveDecision('save')} onCancel={()=>void resolveDecision('cancel')}/>
      : <UnsavedChangesDialog label={pending.label} paths={pending.paths} busy={busy} error={notice} onDecision={choice=>void resolveDecision(choice)}/>)}

  </div>
}
