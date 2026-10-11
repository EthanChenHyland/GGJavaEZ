import { lazy, Suspense, useCallback, useLayoutEffect, useState } from 'react'
import { exposeQaBridge } from '../qa/qaBridge'
import { ChevronLeft,FolderOpen,Maximize2,PanelBottom,Plus,Save,Upload,X } from 'lucide-react'
import type { SourceLocation, TraceDocument } from '../contracts/runtime'
import { DebugPanel } from '../debugger/DebugPanel'
import { ErrorExplorer } from '../debugger/ErrorExplorer'
import { bridge } from '../ide/bridge'
import { ideCommandDefinitions,type IdeCommandId } from '../ide/commands'
import { tabMenuCommands } from '../ide/contextMenus'
import { LaunchDialog } from '../ide/LaunchDialog'
import { ProblemsPanel } from '../ide/ProblemsPanel'
import { ProjectExplorer } from '../ide/ProjectExplorer'
import { formatShortcut,ideShortcuts } from '../ide/shortcuts'
import { SymbolSearch } from '../ide/SymbolSearch'
import { WorkspaceMenu } from '../ide/WorkspaceMenu'
import { WorkspacePicker } from '../ide/WorkspacePicker'
import { useInteractionStore } from '../interaction/interactionStore'
import { useAppState } from '../state/useAppState'
import { RecordedSourceView } from './source/RecordedSourceView'
import { recordedFileFor, pauseSourceLocation,sourcePauseFor,exceptionSourceLocation,exceptionLineForFile,sourceProofFile } from './source/sourceSync'
import { loadJavaEditorRuntime } from '../language/editorRuntime'
import { Header } from './Header'
import { DebugBar } from './DebugBar'
import { BoundConsoleOutput } from './BoundConsoleOutput'
import { computeShellLayout } from './shellLayout'
import { useViewport } from './useViewport'
import { WorldSurface } from './WorldSurface'
const idleTrace: TraceDocument = { schemaVersion: 2, demoId: 'ide:ready', sourceFiles: [], events: [] }
const EditableJavaEditor=lazy(async()=>{await loadJavaEditorRuntime();const module=await import('../ide/EditableJavaEditor');return{default:module.EditableJavaEditor}})


import { filename,trapDialogTab,useWorkspace } from '../workspace/useWorkspace'
import './shell.css'
export interface ShellProps { recording?: TraceDocument; recordingChoices?: React.ReactNode }
export function Shell({ recording, recordingChoices }: ShellProps) {
  const workspace = useWorkspace(!!recording)
  const [recordedSource,setRecordedSource]=useState<{demoId:string;fileId:string|undefined;location:SourceLocation|null}|null>(null)
  const recordedLocation=recordedSource?.demoId===recording?.demoId?recordedSource?.location??null:null
  const recordedFile=recording?recordedFileFor(recording,recordedLocation,recordedSource?.demoId===recording.demoId?recordedSource.fileId:recording.sourceFiles[0]?.fileId):workspace.recordedView?.file
  const setRecordedLocation=useCallback((location:SourceLocation|null)=>{if(recording)setRecordedSource(previous=>({demoId:recording.demoId,location,fileId:location&&recording.sourceFiles.some(file=>file.fileId===location.fileId)?location.fileId:previous?.demoId===recording.demoId?previous.fileId:recording.sourceFiles[0]?.fileId}))},[recording])
  const viewport = useViewport()
  const focusTargetId = useInteractionStore(state => state.focus?.targetId ?? null)
  const worldSelection = useInteractionStore(state => state.selection)
  const appState = useAppState(workspace, focusTargetId, recording)
  const layout = computeShellLayout({ viewport, appState, hasRuntimeWorld: !!recording || !!workspace.visualization, sourceExpanded: !recording && workspace.workspaceMode === 'code', narrowDrawerOpen: workspace.focusSourceOpen, explorerOpen: workspace.explorerOpen, inspector: { open: !!(worldSelection||focusTargetId) && !workspace.inspectorHidden, side: 'right' }, dockDrawer: { open: workspace.bottomOpen, heightRatio: workspace.bottomHeight / 100 }, debugActive: workspace.execution?.kind === 'debug' && workspace.activeExecution })
  const editorVisible=layout.source.size!=='DRAWER_COLLAPSED'&&!!(recording?recordedFile:workspace.recordedView??workspace.activeTab)
  const [sourceEditorOpened,setSourceEditorOpened]=useState(editorVisible)
  const mountSourceEditor=sourceEditorOpened||layout.source.size!=='DRAWER_COLLAPSED'
  // First display owns the lazy load. Later collapse preserves models/view state.
  useLayoutEffect(()=>{if(editorVisible)setSourceEditorOpened(true)},[editorVisible])
  useLayoutEffect(() => exposeQaBridge({ appState, layout, cursor: workspace.runtime?.cursor ?? 0, liveHead: recording?.events.length ?? workspace.visualization?.trace.events.length ?? 0 }))
  const rectangle = (prefix: string, rect: { x: number; y: number; width: number; height: number } | null) => rect ? Object.fromEntries(Object.entries(rect).filter(([key]) => ['x','y','width','height'].includes(key)).map(([key, value]) => ['--'+prefix+'-'+key, value+'px'])) : {}
  const readyLeft=Math.max(layout.safeFrame.x,layout.source.x+layout.source.width+12,layout.explorer?layout.explorer.x+layout.explorer.width+12:0)
  const readyRight=layout.safeFrame.x+layout.safeFrame.width-12,readyWidth=Math.min(260,Math.max(0,readyRight-readyLeft))
  const readyTop=Math.max(layout.safeFrame.y+viewport.height*.08,layout.debugBar?layout.debugBar.y+layout.debugBar.height+12:layout.header.height+12)
  const geometry = { ...rectangle('header', layout.header), ...rectangle('source', layout.source), ...rectangle('timeline', layout.timeDock), ...rectangle('drawer', layout.dockDrawer), ...rectangle('inspector', layout.inspector), ...rectangle('explorer', layout.explorer), ...rectangle('debug', layout.debugBar), '--source-heading-inset':layout.sourceHeadingInset+'px', '--ready-x':(readyLeft+(readyRight-readyLeft-readyWidth)/2)+'px','--ready-y':readyTop+'px','--ready-width':readyWidth+'px' }

const { projects, projectId, tree, tabs, active, setActive, jdk, setJdk, jdkInput, setJdkInput, showJdk, build, execution, timelineLens, setTimelineLens, tool, setTool, bottomPinned, inspectorHidden, bottomOpen, setBottomOpen, picker, setPicker, tabMenu, setTabMenu, input, setInput, notice, setNotice, busy, pending, projectDialog, setProjectDialog, nav, mainClass, setMainClass, javaProject, projectStatus, launch, setLaunch, showLaunch, setShowLaunch, showSymbols, setShowSymbols, languageClient, languageSnapshot, visualization, runtimeExpanded, runtime, runtimeSelection, runtimeNavigation, recordedView, setRecordedView, mappedExecutingSource, setCwdInvalid, commands, setBottomHeight, collapsed, platform, shellRef, contentRef, upperRef, importRef, confirmRef, projectDialogRef, activeRef, launchRef, mainClassRef, cwdInvalidRef, displayedBreakpoints, activeTab, entries, diagnostics, languageProblems, problems, exception, debugSession, recordingIsCurrent, recordedPhase, traceStale, fail, refreshTree, switchProject, edit, commandContext, requestDecision, resolveDecision, invoke, closeTab, action, navigateRuntime, handleRuntimeChange, toggleBreakpoint, removeBreakpoint, handleExecutingSource, sendInput, newEntry, cancelProjectDialog, submitProjectDialog, importFiles, openDiagnostic, divider, toggleTreeEntry, treeAction, projectOptions, pickerItems, choosePicker, showTabMenu, activeExecution, acceptsInput, availableTools, targets } = workspace
const pause=recording?null:sourcePauseFor(debugSession,visualization?.sessionId??null)
const pausedAtHead=!!pause&&(!visualization||runtime?.cursor===visualization.trace.events.length)
const sourceMark=focusTargetId?'focus':pausedAtHead?'paused':recording||runtime&&visualization&&runtime.cursor<visualization.trace.events.length?'history':'running'
const pausedLocation=pause&&debugSession?pauseSourceLocation(pause,debugSession.sourceManifest):null
const pauseId=pause?`${debugSession!.sessionId}:${pause.threadId}:${pause.frameId}:${pause.rawEventCount}:${pause.line}`:null
const sourceKey=`${recording?.demoId??visualization?.trace.demoId??'workspace'}:${sourceMark}:${focusTargetId??runtime?.cursor??0}`
const throwLocation=exceptionSourceLocation(runtime,recording??visualization?.trace,workspace.runtimeRecordingId)
const verifiedFile=sourceProofFile(workspace.sourceFileProof,visualization?.sessionId,activeTab)
const exceptionLine=exceptionLineForFile(throwLocation,recordedFile??verifiedFile)
return <div className={`shell ide-shell ${debugSession&&activeExecution?'shell--debug-active':''} ${layout.sourceHeadingInset>0?'shell--source-controls-inset':''} ${workspace.explorerOpen ? 'shell--explorer-open' : ''} ${workspace.bottomOpen ? 'shell--drawer-open' : ''} ${layout.viewportClass === 'NARROW' ? 'shell--narrow' : ''} ${layout.source.size === 'DRAWER_COLLAPSED' ? 'shell--source-peek' : ''}`} data-viewport={layout.viewportClass} ref={shellRef} style={geometry as React.CSSProperties}>
    <section className="ide-runtime-panel" aria-label="Runtime visualization area">
            <div className={`ide-runtime-live${recording||visualization ? '' : ' ide-runtime-live--idle'}`}>
              <WorldSurface safeFrame={layout.safeFrame} inspectorRect={layout.inspector} trace={recording ?? visualization?.trace ?? idleTrace} pausedSource={pause?{location:pausedLocation}:undefined} onSourceChange={recording ? setRecordedLocation : recordingIsCurrent||!visualization&&pause ? handleExecutingSource : undefined} onRuntimeChange={handleRuntimeChange} navigation={runtimeNavigation} suppressInspector={tool === 'errors' && bottomOpen || inspectorHidden} execution={visualization ? { phase: recordingIsCurrent ? execution!.phase : recordedPhase, lens: timelineLens, liveCursor: visualization.trace.events.length, onLensChange: (lens) => setTimelineLens(lens) } : undefined}/>
              {workspace.previousRecording && <div className="shell-prior-world glass" role="status">Previous run · {workspace.traceStale ? 'source changed' : 'retained recording'}</div>}
{!recording && !visualization && <div className="ide-runtime-ready" aria-label="Runtime ready"><span>RUNTIME</span><strong>{execution?.phase === 'BUILDING' ? 'Building Java…' : execution?.phase === 'STARTING' ? 'Starting Java…' : 'Ready'}</strong><p>{execution?.support === 'RUN_ONLY' ? execution.supportReason ?? 'Console execution' : 'Run your Java program to enter the world.'}</p></div>}
            </div>
          </section>
<Header workspace={workspace} appState={appState} recordingChoices={recordingChoices}/>
    {showJdk && <div className="ide-jdk"><label>JDK home <input value={jdkInput} placeholder="Auto-detect from PATH" onChange={(event) => setJdkInput(event.target.value)} /></label><button onClick={() => action(async () => setJdk(await bridge.detectJdk(jdkInput || null)))}>Use JDK</button><span>{jdk?.error}</span></div>}
    {debugSession && activeExecution && <DebugBar workspace={workspace}/>}
    <button className="shell-source-peek glass" onClick={() => invoke('workbench.source', {})} aria-label="Show source drawer">{recordedFile?.name || filename(mappedExecutingSource?.path??active) || 'Source'} · {recordedLocation?.line??recordedView?.location?.line??mappedExecutingSource?.line??'—'}</button>
    <div className="ide-main" ref={contentRef}>
      
      <aside className="ide-project-panel">
        <div className="ide-panel-heading"><span>PROJECT</span><span className="ide-panel-actions"><button title="New file" aria-label="Create File" disabled={!projectId} onClick={() => newEntry('file')}><Plus size={15}/></button><button title="New folder" aria-label="Create Folder" disabled={!projectId} onClick={() => newEntry('folder')}><FolderOpen size={15}/></button><button title="Refresh project" aria-label="Refresh Project" disabled={!projectId} onClick={() => void action(() => refreshTree(projectId))}>↻</button></span></div>
        <select className="ide-project-select" aria-label="Project" disabled={busy} value={projectId} onChange={(event) => requestDecision('switching projects', tabs.map((tab) => tab.path), () => action(() => switchProject(event.target.value)))}><option value="" disabled>Open Project</option>{projectOptions}</select>
        <input ref={importRef} type="file" hidden multiple {...{ webkitdirectory: '' }} onChange={(event) => { void importFiles(event.target.files); event.target.value = '' }} />
        <button className="ide-open-project" onClick={() => invoke('workbench.importProject', {})}><Upload size={13}/> Import folder (copy)</button>
        <span className="ide-import-note">Creates a managed copy; originals stay in place.</span>
        <button className="ide-new-project" onClick={() => invoke('workbench.newProject', {})}><Plus size={13}/> New project</button>
        <button className="ide-reveal-active" disabled={!active} onClick={() => invoke('explorer.reveal', {}, active)}>Reveal active file</button>
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
          <div className="ide-editor-panel">
            <div className="ide-source-heading"><button className="shell-source-files" aria-label="Show project explorer" title="Explorer" onClick={() => invoke('workbench.explorer', {})}>Files</button><span>SOURCE</span><span className="ide-panel-actions"><button onClick={() => invoke('file.save', {})} disabled={!activeTab || activeTab.draft === activeTab.content || busy} title="Save active file" aria-label="Save active file"><Save size={13}/></button><button onClick={() => invoke('workbench.edit', {})} aria-label="Expand source for editing" title="Expand source for editing"><Maximize2 size={13}/></button><button onClick={() => invoke('workbench.source', {})} aria-label={runtimeExpanded ? 'Close source drawer' : 'Collapse source'} title="Collapse source"><ChevronLeft size={15}/></button></span></div>
            <div className="ide-tabs" role="tablist">{recording&&recordedFile&&<div className="ide-tab is-active" role="tab" aria-selected="true"><span>{recordedFile.name} · Recorded source</span></div>}{tabs.map((tab) => <div key={tab.path} className={`ide-tab ${active === tab.path ? 'is-active' : ''}`} onContextMenu={(event) => { event.preventDefault(); const button = event.currentTarget.querySelector<HTMLButtonElement>('button'); button?.focus(); showTabMenu(tab.path, event.clientX, event.clientY) }} onKeyDown={(event) => { if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); showTabMenu(tab.path, rect.left, rect.bottom) } }} role="tab" aria-selected={active === tab.path}><button onClick={() => { activeRef.current = tab.path; setActive(tab.path); setRecordedView(null) }} title={tab.path}><span className="ide-java-icon">J</span>{filename(tab.path)}{tab.draft !== tab.content && <span className="ide-dirty"/>}</button><button aria-label={`Close ${tab.path}`} onClick={() => closeTab(tab.path)}><X size={13}/></button></div>)}</div>
            <div className="ide-editor-body">{mountSourceEditor && (recording ? <RecordedSourceView file={recordedFile} location={recordedLocation} mark={sourceMark} sourceKey={sourceKey} exceptionLine={exceptionLine} pauseId={pauseId} viewportHeight={viewport.height}/> : recordedView ? <RecordedSourceView file={recordedView.file} location={recordedView.location} mark={sourceMark} sourceKey={sourceKey} exceptionLine={exceptionLine} pauseId={sourceMark==='paused'&&(recordedView.location?.line!==pausedLocation?.line||recordedView.location?.fileId!==pausedLocation?.fileId)?null:pauseId} viewportHeight={viewport.height}/> : activeTab ? <Suspense fallback={<div role="status">Loading Java editor…</div>}><EditableJavaEditor key={projectId} projectId={projectId} sourceMark={sourceMark} sourceKey={sourceKey} exceptionLine={exceptionLine} pauseId={sourceMark==='paused'&&(mappedExecutingSource?.line!==pausedLocation?.line||mappedExecutingSource?.recordedFileId!==pausedLocation?.fileId)?null:pauseId} viewportHeight={viewport.height} path={activeTab.path} value={activeTab.draft} onChange={(value) => edit(activeTab.path, value)} diagnostics={diagnostics} navigate={nav} executingLine={activeTab.path === mappedExecutingSource?.path ? mappedExecutingSource.line : null} pausedLine={debugSession?.status === 'paused' && runtime?.cursor === visualization?.trace.events.length && activeTab.path === mappedExecutingSource?.path ? mappedExecutingSource.line : null} breakpoints={displayedBreakpoints} onToggleBreakpoint={(line) => toggleBreakpoint(activeTab.path, line)} onSave={() => invoke('file.save', {}, activeTab.path)}/></Suspense> : <div className="ide-editor-empty"><span>JAVA SOURCE</span><h2>Choose a file to edit</h2><p>Open a Java file from the project explorer, or create a new one.</p></div>)}</div>
            <div className="ide-editor-foot"><span>{(recording?!recordedLocation||!recording.sourceFiles.some(file=>file.fileId===recordedLocation.fileId):workspace.sourceUnavailable) ? 'No project source at this point' : recordedFile ? `Recorded source · ${recordedFile.name}` : recording ? 'No recorded project source' : active || 'No file selected'}</span><span>Java · UTF-8 · {(recordedFile?.content ?? activeTab?.draft)?.split('\n').length ?? 0} lines</span></div>
          </div>
          <div className="ide-divider ide-divider--vertical" role="separator" aria-label="Resize runtime pane" tabIndex={0} {...divider('runtime')}/>
          
        </div>
        <div className="ide-divider ide-divider--horizontal" role="separator" aria-label="Resize bottom panel" tabIndex={0} {...divider('bottom')}/>
        <section className="ide-bottom-panel">
          <div className="ide-tool-tabs"><button className="ide-bottom-toggle" onClick={() => invoke('workbench.tools', {})} aria-label={bottomOpen ? 'Collapse bottom panel' : 'Expand bottom panel'} title={`Toggle bottom panel (${formatShortcut(ideShortcuts.tools, platform)})`}><PanelBottom size={15}/></button>
            {availableTools.map((item) => <button key={item} className={tool === item && bottomOpen ? 'is-active' : ''} onClick={() => { bottomPinned.current = true; setBottomOpen(true); setTool(item); if (item === 'errors' || item === 'debugger') setBottomHeight(35) }}>{item === 'errors' ? 'ERROR EXPLORER' : item.toUpperCase()}{item === 'problems' && problems.length > 0 && <span className="ide-badge">{problems.length}</span>}</button>)}
            <span className="ide-status-spacer"/>
          </div>
          {tool === 'debugger' ? <DebugPanel session={debugSession} runtime={runtime} breakpoints={displayedBreakpoints} onInspect={(selection) => navigateRuntime(runtime?.cursor ?? 0, selection)} onRemove={removeBreakpoint}/>
          : tool === 'errors' ? recordingIsCurrent ? <ErrorExplorer key={visualization!.trace.demoId} trace={visualization!.trace} runtime={runtime} selection={runtimeSelection} stderr={execution?.stderr ?? ''} onNavigate={navigateRuntime}/> : <div className="debug-empty">{exception ? <><strong>{exception.type}: {exception.message}</strong><pre>{exception.rawStackTrace}</pre></> : <p>No recorded exception.</p>}</div>
          : tool === 'problems' ? <ProblemsPanel build={build} language={languageProblems} onOpen={openDiagnostic}/>
          : <div className="ide-console">
            <div className="ide-console-output" aria-label="Program console">
              <BoundConsoleOutput recording={recording} visualization={visualization} runtimeRecordingId={workspace.runtimeRecordingId}
                entries={runtime?.console ?? []} worldExecution={workspace.worldExecution} execution={execution} build={build}/>
              {exception && <div className="ide-stack"><strong>{exception.type}: {exception.message}</strong><details><summary>Raw JVM stack trace</summary><pre>{exception.rawStackTrace}</pre></details>{exception.frames.map((frame, index) => <button key={index} disabled={!frame.location} onClick={() => frame.location && handleExecutingSource({ fileId: frame.location.path, line: frame.location.line })}>{frame.raw}</button>)}</div>}
            </div>
            <form className="ide-console-input" onSubmit={(event) => { event.preventDefault(); sendInput() }}><span>›</span><input aria-label="Console input" placeholder={acceptsInput ? 'Send input to program…' : 'Run a program to send input'} value={input} disabled={!acceptsInput} onChange={(event) => setInput(event.target.value)}/><button disabled={!acceptsInput}>Send ↵</button></form>
          </div>}
        </section>
      </section>}
    </div>
    <footer className="ide-status-line" aria-label="Workspace status">
      {!jdk?.available && <span className="is-error">JDK unavailable</span>}
      {(projectStatus.startsWith('Resolving') || javaProject?.status !== 'ready') && <span className="ide-project-status" title={javaProject?.diagnostic ?? projectStatus}>{projectStatus}</span>}
      {(["failed", "unavailable"].includes(languageSnapshot.status) || languageSnapshot.metrics.classpathMismatch === 1) && <span className={languageSnapshot.metrics.classpathMismatch === 1 ? 'is-warning' : 'is-error'} title={languageSnapshot.message ?? 'Java language service'}>Java {languageSnapshot.metrics.classpathMismatch === 1 ? 'classpath differs' : languageSnapshot.status}</span>}
      {["failed", "unavailable"].includes(languageSnapshot.status) && <button className="ide-language-restart" onClick={() => invoke('workbench.restartJava', {})}>Retry Java</button>}
      {execution && <span className="ide-execution-status" aria-live="polite">{execution.phase === 'FAILED' && execution.failureKind === 'build' ? 'BUILD FAILED' : execution.phase.replaceAll('_', ' ')}{execution.support === 'RUN_ONLY' && (execution.supportReason !== 'No verified runtime events yet' || ['COMPLETED', 'FAILED'].includes(execution.phase)) && execution.phase !== 'BUILDING' ? ' · console only' : ''}</span>}
      {traceStale && <span className="is-warning">Source changed since Run</span>}
      {execution?.supportReason && (execution.support === 'RUN_ONLY' && execution.supportReason !== 'No verified runtime events yet' || execution.support === 'PARTIAL' && ['COMPLETED', 'FAILED', 'STOPPED'].includes(execution.phase)) && <details className="ide-support-detail"><summary>Visualization {execution.support.toLowerCase().replace('_', ' ')}</summary><p>{execution.supportReason}</p></details>}
      {recordingIsCurrent && <details className="ide-support-detail"><summary>Capture limits</summary><p>Recording stops at 20,000 raw events, 8 MiB, 256 identities or 128 live frames; Java continues. The 30-second active watchdog excludes input waits and Debug pauses; a 10-minute hard safety deadline applies in all states. Project code is recorded. Primitive and reference arrays have bounded summaries; class statics are available in the inspector. Library internals are collapsed. — means unavailable. Values and effects are last observed; changes outside recorded code may be absent.{visualization!.capability.diagnostics.length > 0 && <><br/>{visualization!.capability.diagnostics.slice(0, 3).join(' · ')}</>}</p></details>}
      <span className="ide-status-spacer"/><span>{notice}</span>
      <span className="ide-status-language" title={jdk?.version ?? 'JDK unavailable'}>{jdk?.available ? `Java ${jdk.version ?? ''}`.trim() : 'No JDK'} · {javaProject?.buildSystem ?? 'project'} · {languageSnapshot.status === 'ready' ? 'JDT ready' : `JDT ${languageSnapshot.status}`}</span>
      <details className="ide-shortcuts"><summary>Shortcuts</summary><div>{Object.values(ideCommandDefinitions).filter((definition) => definition.bindings.length).map((definition) => <p key={definition.id}><kbd>{formatShortcut(definition.bindings[0], platform)}</kbd> {definition.title}</p>)}<p>F9 Toggle breakpoint · F1 Editor commands</p></div></details>

    </footer>
    {tabMenu && <WorkspaceMenu label={`Tab actions for ${tabMenu.context.target?.path}`} x={tabMenu.x} y={tabMenu.y}
      items={tabMenuCommands.map((id) => ({ id, label: id === 'resource.rename' ? 'Rename' : ideCommandDefinitions[id].title, ...(busy ? { enabled: false as const, reason: 'Wait for the current operation' } : commands.availability(id, tabMenu.context)) }))}
      onClose={() => setTabMenu(null)} onChoose={(id) => { const context = tabMenu.context; setTabMenu(null); setNotice(''); requestAnimationFrame(() => { void commands.execute(id as IdeCommandId, context, {}).catch(fail) }) }}/>}
    {picker && <WorkspacePicker key={picker.mode} mode={picker.mode} items={pickerItems} onClose={() => setPicker(null)} onChoose={choosePicker}/>}
    {showLaunch && <LaunchDialog value={{ ...launch, mainClass }} targets={targets} onClose={() => setShowLaunch(false)} onSave={(configuration) => { launchRef.current = configuration; setLaunch(configuration); mainClassRef.current = configuration.mainClass; setMainClass(configuration.mainClass); cwdInvalidRef.current = false; setCwdInvalid(false); setShowLaunch(false) }}/>}
    {showSymbols && <SymbolSearch client={languageClient} onClose={() => setShowSymbols(false)} onOpen={(location) => commands.execute('file.open', commandContext(location.path), { location }).then(() => {})}/>}
    {projectDialog && <div className="ide-confirm-backdrop"><form className="ide-confirm ide-project-dialog" ref={projectDialogRef} role="dialog" aria-modal="true" aria-labelledby="ide-project-dialog-title" onSubmit={(event) => { event.preventDefault(); void submitProjectDialog() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancelProjectDialog() } else trapDialogTab(event) }}>
      <h2 id="ide-project-dialog-title">{projectDialog.kind === 'class' ? 'New Java Class' : projectDialog.kind === 'file' ? 'New File' : projectDialog.kind === 'folder' ? 'New Folder' : projectDialog.kind === 'rename' ? 'Rename' : projectDialog.kind === 'delete' ? 'Delete' : projectDialog.kind === 'open' ? 'Open File' : 'New Project'}</h2>
      {projectDialog.kind === 'delete' ? <p>Delete <strong>{projectDialog.path}</strong> from this project?{!!projectDialog.dirtyPaths?.length && <> {projectDialog.dirtyPaths.length} unsaved files will be discarded unless saved first.</>}</p> : <label>{projectDialog.kind === 'project' ? 'Project name' : projectDialog.kind === 'class' ? 'Class name' : 'Path relative to project root'}<input value={projectDialog.value} onChange={(event) => setProjectDialog({ ...projectDialog, value: event.target.value })} spellCheck={false} required /></label>}
      {notice && <p className="ide-dialog-notice" role="alert">{notice}</p>}
      <div><button type="button" onClick={cancelProjectDialog}>Cancel</button><>{projectDialog.kind === 'delete' && !!projectDialog.dirtyPaths?.length && <button type="button" disabled={busy} onClick={() => { const resolve = projectDialog.resolveDelete; setProjectDialog(null); resolve?.('save') }}>Save and delete</button>}</><button type="submit" className="ide-primary" disabled={busy}>{projectDialog.kind === 'delete' ? 'Delete' : projectDialog.kind === 'rename' ? 'Rename' : projectDialog.kind === 'open' ? 'Open' : 'Create'}</button></div>
    </form></div>}
    {pending && <div className="ide-confirm-backdrop"><div className="ide-confirm" ref={confirmRef} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); void resolveDecision('cancel') }
      else trapDialogTab(event)
    }} role="dialog" aria-modal="true" aria-labelledby="ide-confirm-title"><h2 id="ide-confirm-title">Unsaved changes</h2><p>Save {pending.paths.length} changed {pending.paths.length === 1 ? 'file' : 'files'} before {pending.label}?</p><div><button disabled={busy} onClick={() => void resolveDecision('cancel')}>Cancel</button><button disabled={busy} onClick={() => void resolveDecision('discard')}>Discard</button><button disabled={busy} className="ide-primary" onClick={() => void resolveDecision('save')}>Save and continue</button></div></div></div>}
  </div>
}
