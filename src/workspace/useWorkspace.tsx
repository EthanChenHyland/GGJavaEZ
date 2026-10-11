import { useCallback,useEffect,useMemo,useRef,useState } from 'react'
import { useStore } from 'zustand'
import type { Selection } from '../contracts/interaction'
import type { SourceLocation as RuntimeSourceLocation,RuntimeState } from '../contracts/runtime'
import type { DebugCommand,DebugSession,ResolvedBreakpoint,SourceBreakpoint } from '../debugger/contracts'
import type { ExecutionSession,RawTraceDelta } from '../execution/contracts'
import { ExecutionIngest } from '../execution/ingest'
import { yieldTraceWork } from '../execution/schedule'
import { bridge,draftStorageKey,persistProjectPathChange,readProjectDrafts,renameIntentKey,withStorageTransaction,type RenameReceipt } from '../ide/bridge'
import { defaultClassFolder,javaClassContent,javaClassPath } from '../ide/classCreation'
import type { ExecutionStream } from '../ide/client'
import type { ShellCommandId } from '../ide/commands'
import { createIdeCommandService,hasMountedRecording,hasPresentedCommandFlow,ideCommandDefinitions,isPresentationCommand,isShellCommand,worldCommandAvailability,type CommandArguments,type CommandContext,type IdeCommandHost,type IdeCommandId } from '../ide/commands'
import type { CompileDiagnostic,ProjectEntry,ProjectFile,SourceLocation } from '../ide/contracts'
import { defaultLaunch } from '../ide/javaProject'
import { pathIsWithin,transitionWorkspacePaths,type WorkspacePathChange } from '../ide/pathChanges'
import { mergeProblems } from '../ide/problems'
import { type TreeAction } from '../ide/ProjectExplorer'
import { commandForShortcut,currentPlatform,formatShortcut,worldEscapeCommand,type ShortcutFocus } from '../ide/shortcuts'
import { useCameraStore } from '../camera/cameraStore'
import { useInteractionStore as useWorldInteractionStore } from '../interaction/interactionStore'
import { useQualityStore } from '../render/quality/qualityStore'
import { bindRenamedSources,projectSessionBreakpoints,recordedBreakpointPath,restoreSourceBindings,unbindDeletedSources,verifiedWorkspaceSource,type SourceBindings } from '../ide/sourceBindings'
import { type WorkspacePickerItem } from '../ide/WorkspacePicker'
import { LanguageClient } from '../language/client'
import { getLoadedJavaEditorRuntime,loadJavaEditorRuntime,onJavaEditorRuntimeLoaded } from '../language/editorRuntime'
import {exceptionSourceLocation} from '../shell/source/sourceSync'
import type { JavaIntelligenceRegistration } from '../language/monaco'
import { documentPath,documentUri,type LanguageSnapshot,type LspWorkspaceEdit } from '../language/protocol'
import { applyWorkspaceEdit,type WorkspaceEditHost } from '../language/workspaceEdit'
import { runCommandAvailability } from '../state/appState'
import { executionDimensions } from '../state/useAppState'
import { debugStore } from './debugStore'
import { editorStore } from './editorStore'
import {createEditableModelOwner,retireEditableModels} from './editorModels'
import { executionStore } from './executionStore'
import { interactionStore } from './interactionStore'
import { saveAllOrThrow,type SaveAllTask } from './saveAll'
import { shellStore } from './shellStore'
import { timelineStore } from './timelineStore'
import { useStoreField } from './useStoreField'
import { workspaceStore } from './workspaceStore'


import type { Tab,Tool,WorkspaceMode } from './workspaceTypes'
const draftKey = draftStorageKey
const sessionKey = (id: string) => `ggjavaez:session:${id}`
const breakpointKey = (id: string) => `ggjavaez:breakpoints:${id}`
const launchKey = (id: string) => `ggjavaez:launch:${id}`
function savedEditorWidth(): number {
  return 38
}
const hydratedTab = (id: string, file: ProjectFile): Tab => {
  const raw = localStorage.getItem(draftKey(id, file.path))
  if (raw === null) return { ...file, draft: file.content }
  try {
    const saved = JSON.parse(raw)
    if (typeof saved.draft === 'string' && typeof saved.revision === 'string') return { ...file, draft: saved.draft, revision: saved.revision }
  } catch { /* Previous draft format was plain text. */ }
  return { ...file, draft: raw }
}
const flatten = (items: ProjectEntry[]): ProjectEntry[] => items.flatMap((item) => [item, ...flatten(item.children ?? [])])
const manualRuntimeWidthKey = 'ggjavaez:spatial2:manual-runtime-width'
function runtimeEditorWidth() {
  const stored = Number(localStorage.getItem(manualRuntimeWidthKey))
  return Number.isFinite(stored) && stored >= 24 && stored <= 80 ? stored : 30
}
export const filename = (path: string) => path.split('/').at(-1) || path
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
export function trapDialogTab(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab') return
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled)'))
  const first = controls[0], last = controls.at(-1)
  if (!first || !last) return
  if (!event.currentTarget.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

export function useWorkspace(recordingViewer = false) {
  const [projects, setProjects] = useStoreField(workspaceStore, 'projects')
  const [projectId, setProjectId] = useStoreField(workspaceStore, 'projectId')
  const [tree, setTree] = useStoreField(workspaceStore, 'tree')
  const [tabs, setTabs] = useStoreField(editorStore, 'tabs')
  const [active, setActive] = useStoreField(editorStore, 'active')
  const [jdk, setJdk] = useStoreField(workspaceStore, 'jdk')
  const [jdkInput, setJdkInput] = useStoreField(shellStore, 'jdkInput')
  const [showJdk, setShowJdk] = useStoreField(shellStore, 'showJdk')
  const [build, setBuild] = useStoreField(executionStore, 'build')
  const [endedAt, setEndedAt] = useStoreField(executionStore, 'endedAt')
  const [execution, setExecution] = useStoreField(executionStore, 'execution')
  const [timelineLens, setTimelineLens] = useStoreField(timelineStore, 'timelineLens')
  const [tool, setTool] = useStoreField(shellStore, 'tool')
  const toolRef = useRef<Tool>('console'); toolRef.current = tool
  const bottomPinned = useRef(false)
  const [workspaceMode, setWorkspaceMode] = useStoreField(shellStore, 'workspaceMode')
  const [explorerOpen, setExplorerOpen] = useStoreField(shellStore, 'explorerOpen')
  const [inspectorHidden, setInspectorHidden] = useStoreField(shellStore, 'inspectorHidden')
  const [bottomOpen, setBottomOpen] = useStoreField(shellStore, 'bottomOpen')
  const [focusSourceOpen, setFocusSourceOpen] = useStoreField(shellStore, 'focusSourceOpen')
  const [sourceOpen, setSourceOpen] = useStoreField(shellStore, 'sourceOpen')
  const [picker, setPicker] = useStoreField(shellStore, 'picker')
  const [tabMenu, setTabMenu] = useStoreField(shellStore, 'tabMenu')
  const [input, setInput] = useStoreField(shellStore, 'input')
  const [notice, setNotice] = useStoreField(shellStore, 'notice')
  const [busy, setBusy] = useStoreField(shellStore, 'busy')
  const [pending, setPending] = useStoreField(shellStore, 'pending')
  const [projectDialog, setProjectDialog] = useStoreField(shellStore, 'projectDialog')
  const [hydrated, setHydrated] = useStoreField(workspaceStore, 'hydrated')
  const [nav, setNav] = useStoreField(editorStore, 'nav')
  const [mainClass, setMainClass] = useStoreField(workspaceStore, 'mainClass')
  const [javaProject, setJavaProject] = useStoreField(workspaceStore, 'javaProject')
  const [projectStatus, setProjectStatus] = useStoreField(workspaceStore, 'projectStatus')
  const [launch, setLaunch] = useStoreField(workspaceStore, 'launch')
  const [showLaunch, setShowLaunch] = useStoreField(shellStore, 'showLaunch')
  const [showSymbols, setShowSymbols] = useStoreField(shellStore, 'showSymbols')
  const [languageClient] = useState(() => new LanguageClient())
  const [languageSnapshot, setLanguageSnapshot] = useState<LanguageSnapshot>(() => languageClient.getSnapshot())
  const [visualization, setVisualization] = useStoreField(executionStore, 'visualization')
  const [runtimeExpanded, setRuntimeExpanded] = useStoreField(shellStore, 'runtimeExpanded')
  const executingSourceRef = useRef<RuntimeSourceLocation | null>(null)
  const visualizationRef = useRef(visualization)
  visualizationRef.current = visualization
  const [breakpoints, setBreakpoints] = useStoreField(debugStore, 'breakpoints')
  const [breakpointProjection, setBreakpointProjection] = useStoreField(debugStore, 'breakpointProjection')
  const runtime=useStore(executionStore,state=>state.runtime)
  const runtimeRecordingId=useStore(executionStore,state=>state.runtimeRecordingId)
  const [runtimeSelection, setRuntimeSelection] = useStoreField(interactionStore, 'runtimeSelection')
  const [runtimeNavigation, setRuntimeNavigation] = useStoreField(interactionStore, 'runtimeNavigation')
  const [recordedView, setRecordedView] = useStoreField(editorStore, 'recordedView')
  const [mappedExecutingSource, setMappedExecutingSource] = useStoreField(editorStore, 'mappedExecutingSource')
  const [sourceUnavailable, setSourceUnavailable] = useStoreField(editorStore, 'sourceUnavailable')
  const [sourceFileProof,setSourceFileProof]=useStoreField(editorStore,'sourceFileProof')
  const [cwdInvalid, setCwdInvalid] = useStoreField(workspaceStore, 'cwdInvalid')
  const workspaceGeneration = useRef(0)
  const sourceBindings = useRef(new Map<string, SourceBindings>())
  const sessionWorkspaceGeneration = useRef(new Map<string, number>())
  const sourceRequest = useRef(0)
  const commandHost = useRef<IdeCommandHost>({ snapshot: () => { throw new Error('Workspace commands are not ready') }, operations: {}, prompts: {} })
  const [commands] = useState(() => createIdeCommandService(commandHost.current))
  const languageEditHost = useRef<WorkspaceEditHost | null>(null)
  const deletingPath = useRef<string | null>(null)
  const executionRevision = useRef(-1)
  const activeExecutionId = useRef<string | null>(null)
  const shownFailure = useRef(false)
  const normalizedSignature = useRef('')
  const runtimeSessionId = useRef<string | null>(null)
  const ingestRef = useRef<ExecutionIngest | null>(null)
  const committedIngest = useRef<ExecutionIngest | null>(null)
  const retiredIngests = useRef<ExecutionIngest[]>([])
  const latestExecutionRef = useRef<ExecutionSession | null>(null)
  const ingestPublication = useRef<{ at: number; timer?: ReturnType<typeof setTimeout> }>({ at: -Infinity })
  const userLayoutOverride = useRef(false)
  const explorerOverride = useRef(false)
  const [projectWidth, setProjectWidth] = useStoreField(shellStore, 'projectWidth')
  const [editorWidth, setEditorWidth] = useStoreField(shellStore, 'editorWidth')
  const [bottomHeight, setBottomHeight] = useStoreField(shellStore, 'bottomHeight')
  const [collapsed, setCollapsed] = useStoreField(shellStore, 'collapsed')
  const [platform] = useState(currentPlatform)
  const shellRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const upperRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const eventSourceRef = useRef<ExecutionStream | null>(null)
  const confirmRef = useRef<HTMLDivElement>(null)
  const projectDialogRef = useRef<HTMLFormElement>(null)
  const tabsRef = useRef<Tab[]>([])
  const languagePaths = useRef(new Set<string>())
  tabsRef.current = tabs
  const activeRef = useRef(active)
  activeRef.current = active
  const projectIdRef = useRef(projectId)
  projectIdRef.current = projectId
  const requestedSourceRef = useRef('')
  const treeRef = useRef(tree); treeRef.current = tree
  const navRef = useRef(nav); navRef.current = nav
  const launchRef = useRef(launch); launchRef.current = launch
  const breakpointsRef = useRef(breakpoints); breakpointsRef.current = breakpoints
  const modelRef = useRef(javaProject); modelRef.current = javaProject
  const executionRef = useRef(execution); executionRef.current = execution
  const mainClassRef = useRef(mainClass); mainClassRef.current = mainClass
  const cwdInvalidRef = useRef(cwdInvalid); cwdInvalidRef.current = cwdInvalid
  const breakpointBindings = execution ? sourceBindings.current.get(execution.id) : undefined
  const displayedBreakpoints = breakpointProjection && execution?.kind === 'debug' && breakpointProjection.projectId === projectId && breakpointProjection.sessionId === execution.id &&
    breakpointProjection.generation === workspaceGeneration.current && breakpointProjection.bindings === breakpointBindings &&
    breakpointProjection.desired === breakpoints && breakpointProjection.tabs === tabs && breakpointProjection.acknowledgments === execution.breakpoints
    ? breakpointProjection.points : breakpoints

  const activeTab = tabs.find((tab) => tab.path === active)
  const entries = useMemo(() => flatten(tree), [tree])
  const diagnostics = build?.diagnostics ?? []
  const languageProblems = useMemo<CompileDiagnostic[]>(() => languageSnapshot.projectId === projectId ? languageSnapshot.diagnostics.flatMap((group) => {
    const path = documentPath(group.uri, projectId)
    if (!path) return []
    return group.diagnostics.map((item, index) => ({ id: `language:${path}:${index}:${item.message}`, provider: 'language' as const,
      location: { path, line: item.range.start.line + 1, column: item.range.start.character + 1 },
      severity: (item.severity === 1 ? 'error' : item.severity === 2 ? 'warning' : 'note') as CompileDiagnostic['severity'],
      message: item.message, raw: item.message }))
  }) : [], [languageSnapshot, projectId])
  const problems = useMemo(() => mergeProblems(diagnostics, languageProblems), [diagnostics, languageProblems])
  const allEvents = execution?.runEvents ?? []
  const exception = [...allEvents].reverse().find((event) => event.exception)?.exception
  const debugSession: DebugSession | null = execution?.kind === 'debug' && execution.build ? {
    sessionId: execution.id, projectId: execution.projectId, revision: execution.revision,
    status: execution.phase === 'PAUSED' ? 'paused' : execution.phase === 'RUNNING' || execution.phase === 'WAITING_FOR_INPUT' ? 'running'
      : execution.phase === 'STARTING' || execution.phase === 'BUILDING' ? 'starting' : execution.phase === 'STOPPED' ? 'stopped'
        : execution.phase === 'FAILED' ? 'failed' : 'exited',
    pause: execution.pause, breakpoints: execution.breakpoints, rawEvents: execution.rawEvents,
    sourceManifest: execution.sourceManifest, build: execution.build, stdout: execution.stdout,
    stderr: execution.stderr, exitCode: execution.exitCode, terminalStatus: execution.terminalStatus,
    diagnostic: execution.diagnostic,
  } : null
  const recordingIsCurrent = !!visualization && visualization.sessionId === execution?.id
  const previousRecording = !!visualization && !!execution && !recordingIsCurrent
  // A retained trace keeps its own terminal head. The new session owns Console
  // and source truth, but must not reset the previous world's presentation.
  const recordedTerminal = visualization?.trace.events.at(-1)?.type
  const recordedPhase: ExecutionSession['phase'] = recordedTerminal === 'PROGRAM_END' ? 'COMPLETED'
    : recordedTerminal === 'PROGRAM_ABORT' ? 'FAILED' : 'STOPPED'
  const currentBindings = visualization ? sourceBindings.current.get(visualization.sessionId) : undefined
  const traceStale = recordingIsCurrent && visualization.trace.sourceFiles.some((file) => {
    const bound = currentBindings?.sources.find((source) => source.fileId === file.fileId)
    const path = bound ? bound.workspacePath : file.fileId
    return !entries.some((entry) => entry.kind === 'file' && entry.path === path) || tabs.some((tab) => tab.path === path && tab.draft !== file.content)
  })

  const fail = (error: unknown) => setNotice(errorText(error))
  const enterMode = (mode: WorkspaceMode) => {
    setWorkspaceMode(mode)
    setEditorWidth(mode === 'code' ? 64 : runtimeEditorWidth())
    setSourceOpen(true)
    if (mode === 'code') { bottomPinned.current = false; setBottomOpen(false) }
    if (mode === 'visualize') { setBottomOpen(false); setExplorerOpen(false) }
    if (mode === 'debug') { setBottomOpen(false); setExplorerOpen(false) }
    setRuntimeExpanded(false)
    setFocusSourceOpen(false)
  }
  const toggleExplorer = () => {
    explorerOverride.current = true
    if (runtimeExpanded) { setRuntimeExpanded(false); setFocusSourceOpen(false); setExplorerOpen(true) }
    else setExplorerOpen((value) => !value)
  }

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 900px)')
    const collapse = () => { if (narrow.matches) setExplorerOpen(false) }
    narrow.addEventListener('change', collapse)
    return () => narrow.removeEventListener('change', collapse)
  }, [])

  const refreshTree = useCallback(async (id: string) => {
    const generation = workspaceGeneration.current
    const next = await bridge.tree(id)
    if (projectIdRef.current === id && workspaceGeneration.current === generation) { treeRef.current = next; setTree(next) }
  }, [])

  useEffect(() => languageClient.subscribe(setLanguageSnapshot), [languageClient])
  const editableModels=useMemo(()=>createEditableModelOwner(),[])
  useEffect(()=>{editableModels.update(projectId,tabs.map(tab=>tab.path))},[editableModels,projectId,tabs])
  useEffect(()=>()=>editableModels.dispose(),[editableModels])
  useEffect(() => {
    if (!projectId) return
    languagePaths.current.clear()
    if (!recordingViewer) void languageClient.open(projectId)
  }, [languageClient, projectId])
  useEffect(() => {
    if (recordingViewer || !projectId || languageClient.projectId !== projectId) return
    const javaTabs = tabs.filter((tab) => tab.path.endsWith('.java'))
    const next = new Set(javaTabs.map((tab) => tab.path))
    for (const old of languagePaths.current) if (!next.has(old)) void languageClient.closeDocument(old).catch(() => {})
    for (const tab of javaTabs) {
      if (languagePaths.current.has(tab.path)) languageClient.changeDocument(tab.path, tab.draft)
      else languageClient.openDocument(tab.path, tab.draft)
    }
    languagePaths.current = next
  }, [languageClient, projectId, tabs])
  useEffect(() => () => languageClient.dispose(), [languageClient])

  useEffect(() => {
    if (!pending) return
    const previous = document.activeElement as HTMLElement | null
    confirmRef.current?.querySelector('button')?.focus()
    return () => previous?.focus()
  }, [pending])
  useEffect(() => {
    if (!projectDialog) return
    const previous = document.activeElement as HTMLElement | null
    const first = projectDialogRef.current?.querySelector<HTMLInputElement>('input')
      ?? projectDialogRef.current?.querySelector<HTMLButtonElement>('button')
    first?.focus()
    if (first instanceof HTMLInputElement) first.select()
    return () => previous?.focus()
  }, [projectDialog?.kind])

  const openFile = useCallback(async (id: string, path: string, location?: SourceLocation, isCurrent:()=>boolean=()=>true) => {
    if (!path) return
    const generation = workspaceGeneration.current
    if (!tabsRef.current.some((tab) => tab.path === path)) {
      const file = await bridge.file(id, path)
      if(!isCurrent())return
      if (id !== projectIdRef.current || generation !== workspaceGeneration.current) throw new Error('Open belongs to an older workspace')
      const next = tabsRef.current.some((tab) => tab.path === path) ? tabsRef.current : [...tabsRef.current, hydratedTab(id, file)]
      tabsRef.current = next; setTabs(next)
    }
    if (id !== projectIdRef.current || generation !== workspaceGeneration.current) throw new Error('Open belongs to an older workspace')
    if(!isCurrent())return
    activeRef.current = path; setActive(path); setRecordedView(null)
    if (location) { navRef.current = { ...location }; setNav(navRef.current) }
  }, [])

  useEffect(() => {
    const loaded = new Map<string, ProjectFile>()
    const host: WorkspaceEditHost = {
      getFileState: (path) => {
        const tab = tabsRef.current.find((item) => item.path === path)
        return tab ? { content: tab.draft, revision: tab.revision } : undefined
      },
      loadFile: async (path) => {
        const file = await bridge.file(projectIdRef.current, path)
        loaded.set(path, file)
        const draft = localStorage.getItem(draftKey(projectIdRef.current, path))
        if (!draft) return { content: file.content, revision: file.revision }
        try {
          const saved = JSON.parse(draft)
          if (saved && typeof saved.draft === 'string' && typeof saved.revision === 'string') {
            if (saved.revision !== file.revision) throw new Error(`Source changed since the saved draft: ${path}`)
            return { content: saved.draft, revision: file.revision }
          }
        } catch (error) { if (error instanceof Error && error.message.startsWith('Source changed')) throw error }
        return { content: draft, revision: file.revision }
      },
      commitDrafts: (changes) => {
        if (deletingPath.current && changes.some((change) => pathIsWithin(change.path, deletingPath.current!))) throw new Error('Wait for the pending delete before applying Java edits')
        const id = projectIdRef.current
        for (const change of changes) if (!tabsRef.current.some((tab) => tab.path === change.path)) {
          const file = loaded.get(change.path)
          if (!file || file.revision !== change.revision) throw new Error(`Source revision changed: ${change.path}`)
        }
        const before = changes.map(({ path }) => ({ key: draftKey(id, path), value: localStorage.getItem(draftKey(id, path)) }))
        try {
          for (const change of changes) localStorage.setItem(draftKey(id, change.path), JSON.stringify({ draft: change.content, revision: change.revision }))
        } catch (error) {
          before.forEach(({ key, value }) => { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) })
          throw error
        }
        const byPath = new Map(changes.map((change) => [change.path, change]))
        const current = tabsRef.current
        const updated = current.map((tab) => byPath.has(tab.path) ? { ...tab, draft: byPath.get(tab.path)!.content } : tab)
          for (const change of changes) if (!current.some((tab) => tab.path === change.path)) {
            updated.push({ ...loaded.get(change.path)!, draft: change.content })
          }
        tabsRef.current = updated; setTabs(updated)
      },
    }
    languageEditHost.current = host
    let registered: JavaIntelligenceRegistration | undefined
    const unsubscribe = onJavaEditorRuntimeLoaded(({ monaco, registerJavaIntelligence }) => {
      registered = registerJavaIntelligence(monaco, {
        client: languageClient,
        onOpen: (location) => commands.execute('file.open', commandContext(location.path), { location }).then(() => {}),
        applyEdit: (edit: LspWorkspaceEdit) => applyWorkspaceEdit(monaco, languageClient, edit, host),
        onError: setNotice,
      })
    })
    return () => { unsubscribe(); registered?.dispose(); if (languageEditHost.current === host) languageEditHost.current = null }
  }, [languageClient, openFile])

  const switchProject = useCallback(async (nextId: string, stopExisting = true) => {
    if (stopExisting) {
      const current = await bridge.executionCurrent()
      if (current && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(current.phase)) await bridge.executionStop(current.id)
    }
    workspaceGeneration.current++; sourceRequest.current++
    projectIdRef.current = nextId
    tabsRef.current = []; activeRef.current = ''; treeRef.current = []; navRef.current = null; executionRef.current = null
    cwdInvalidRef.current = false
    setProjectId(nextId); setTabs([]); setActive(''); setRecordedView(null); setMappedExecutingSource(null);setSourceUnavailable(false);setSourceFileProof(null); setCwdInvalid(false)
    setBuild(null)
    setExecution(null); setTimelineLens('LIVE'); activeExecutionId.current = null
    setVisualization(null)
    for (const ingest of new Set([ingestRef.current, committedIngest.current, ...retiredIngests.current])) ingest?.dispose()
    ingestRef.current = null; committedIngest.current = null; retiredIngests.current = []; latestExecutionRef.current = null
    clearTimeout(ingestPublication.current.timer); ingestPublication.current = { at: -Infinity }
    setWorkspaceMode('code')
    setEditorWidth(savedEditorWidth()); setSourceOpen(true); setPicker(null); setTabMenu(null)
    bottomPinned.current = false; setBottomOpen(false); setFocusSourceOpen(false)
    setRuntimeExpanded(false)
    executingSourceRef.current = null
    executionStore.setState({runtime:null,runtimeRecordingId:null}); setRuntimeSelection(null); setRuntimeNavigation(null)
    executionRevision.current = -1; shownFailure.current = false; normalizedSignature.current = ''; runtimeSessionId.current = null; userLayoutOverride.current = false; explorerOverride.current = false
    try {
      const stored = JSON.parse(localStorage.getItem(breakpointKey(nextId)) ?? '[]')
      breakpointsRef.current = Array.isArray(stored) ? stored.filter((point) => typeof point.fileId === 'string' && Number.isInteger(point.line) && point.line > 0).map((point) => ({ fileId: point.fileId, line: point.line, status: 'pending', reason: null })) : []
      setBreakpoints(breakpointsRef.current)
    } catch { breakpointsRef.current = []; setBreakpoints([]) }
    let savedLaunch = defaultLaunch
    try {
      const saved = JSON.parse(localStorage.getItem(launchKey(nextId)) ?? 'null')
      if (saved && typeof saved.mainClass === 'string' && typeof saved.workingDirectory === 'string' && Array.isArray(saved.programArgs) && Array.isArray(saved.jvmArgs) && [...saved.programArgs, ...saved.jvmArgs].every((arg) => typeof arg === 'string')) savedLaunch = saved
      cwdInvalidRef.current = saved?.cwdInvalid === true; setCwdInvalid(cwdInvalidRef.current)
    } catch { /* Invalid settings use the beginner defaults. */ }
    launchRef.current = savedLaunch; setLaunch(savedLaunch); mainClassRef.current = savedLaunch.mainClass; setMainClass(savedLaunch.mainClass); setShowLaunch(false); setShowSymbols(false)
    setJavaProject(null); setProjectStatus('Resolving Java project…')
    setNav(null)
    setHydrated(false)
    localStorage.setItem('ggjavaez:project', nextId)
    await recoverRename(nextId)
    const generation = workspaceGeneration.current
    void bridge.javaProject(nextId).then((model) => {
      if (projectIdRef.current !== nextId || workspaceGeneration.current !== generation) return
      modelRef.current = model; setJavaProject(model); setProjectStatus(model.status === 'ready' ? model.buildSystem === 'plain' ? 'Plain Java' : model.buildSystem === 'maven' ? 'Maven' : 'Gradle' : model.diagnostic ?? 'Project unavailable')
    }).catch((error) => { if (projectIdRef.current === nextId && workspaceGeneration.current === generation) setProjectStatus(errorText(error)) })
    const nextTree = await bridge.tree(nextId)
    if (projectIdRef.current !== nextId) return
    treeRef.current = nextTree; setTree(nextTree)
    const files = flatten(nextTree).filter((item) => item.kind === 'file')
    let previous: { paths?: string[]; active?: string } = {}
    try { previous = JSON.parse(localStorage.getItem(sessionKey(nextId)) || '{}') } catch { /* malformed session */ }
    const savedPaths = (previous.paths ?? []).filter((path) => files.some((file) => file.path === path))
    const paths = savedPaths.length ? savedPaths : [files.find((file) => file.path === 'Main.java')?.path ?? files.find((file) => file.path.endsWith('.java'))?.path].filter((path): path is string => !!path)
    const opened = await Promise.all(paths.map(async (path) => hydratedTab(nextId, await bridge.file(nextId, path))))
    if (projectIdRef.current !== nextId) return
    tabsRef.current = opened; setTabs(opened)
    activeRef.current = paths.includes(previous.active ?? '') ? previous.active! : paths[0] ?? ''; setActive(activeRef.current)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated && projectId) localStorage.setItem(sessionKey(projectId), JSON.stringify({ paths: tabs.map((tab) => tab.path), active }))
  }, [hydrated, projectId, tabs, active])
  useEffect(() => {
    if (hydrated && projectId) localStorage.setItem(launchKey(projectId), JSON.stringify({ ...launch, mainClass, cwdInvalid }))
  }, [hydrated, projectId, launch, mainClass, cwdInvalid])

  useEffect(() => {
    if (recordingViewer) return
    let alive = true
    Promise.all([bridge.projects(), bridge.health(), bridge.executionCurrent()]).then(async ([items, health, current]) => {
      if (!alive) return
      setProjects(items)
      setJdk(health.jdk)
      setJdkInput(health.jdk.home ?? '')
      const chosen = items.find((item) => item.id === localStorage.getItem('ggjavaez:project'))
      if (chosen) await switchProject(chosen.id, false)
      // A launch can begin as soon as hydrated source is visible. The snapshot
      // fetched before hydration must never replace that newer session.
      if (!alive || activeExecutionId.current) return
      if (current && current.projectId === chosen?.id) { activeExecutionId.current = current.id; acceptExecution(current) }
      else if (current && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(current.phase)) await bridge.executionStop(current.id)
    }).catch(fail)
    return () => { alive = false }
    // Initial hydration deliberately runs once.
  }, [])

  useEffect(() => {
    eventSourceRef.current?.close()
    if (!execution?.id) return
    const source = bridge.executionEvents(execution.id, acceptExecution, acceptRaw,
      () => ingestRef.current?.sessionId === execution.id ? ingestRef.current.nextSequence : 0, fail)
    eventSourceRef.current = source
    return () => source.close()
  }, [execution?.id])

  useEffect(() => () => {
    clearTimeout(ingestPublication.current.timer)
    for (const ingest of new Set([ingestRef.current, committedIngest.current, ...retiredIngests.current])) ingest?.dispose()
    ingestRef.current = null; committedIngest.current = null; retiredIngests.current = []
  }, [])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (tabsRef.current.some((tab) => tab.draft !== tab.content)) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  const edit = (path: string, draft: string) => {
    if (deletingPath.current && pathIsWithin(path, deletingPath.current)) return
    sourceRequest.current++; setMappedExecutingSource(null)
    const next = tabsRef.current.map((tab) => tab.path === path ? { ...tab, draft } : tab)
    tabsRef.current = next; setTabs(next)
    if (projectId) {
      try { localStorage.setItem(draftKey(projectId, path), JSON.stringify({ draft, revision: tabsRef.current.find((tab) => tab.path === path)?.revision })) }
      catch { setNotice('Browser draft storage is full. Save your changes before leaving this page.') }
    }
  }

  const checkContext = (context: CommandContext) => {
    if (context.projectId !== projectIdRef.current || context.workspaceGeneration !== workspaceGeneration.current) throw new Error('Command belongs to an older workspace')
  }
  const commandContext = (path?: string): CommandContext => ({ projectId: projectIdRef.current, workspaceGeneration: workspaceGeneration.current,
    ...(path ? { target: { projectId: projectIdRef.current, path, kind: flatten(treeRef.current).find((item) => item.path === path)?.kind ?? 'file' } } : {}),
  })
  const saveTab = async (tab: Tab, context = commandContext()) => {
    checkContext(context)
    if (tab.draft === tab.content) return
    const current = tabsRef.current.find((item) => item.path === tab.path)
    if (!current || current.draft !== tab.draft || current.revision !== tab.revision) throw new Error(`Source changed before Save: ${tab.path}`)
    const saved = await bridge.save(context.projectId, tab.path, tab.draft, tab.revision)
    checkContext(context)
    void languageClient.saveDocument(tab.path, saved.content).catch(() => {})
    const next = tabsRef.current.map((item) => item.path === tab.path ? { ...item, content: saved.content, revision: saved.revision } : item)
    tabsRef.current = next; setTabs(next)
    const latestDraft = next.find((item) => item.path === tab.path)?.draft
    if (latestDraft === saved.content) localStorage.removeItem(draftKey(context.projectId, tab.path))
    else if (latestDraft !== undefined) localStorage.setItem(draftKey(context.projectId, tab.path), JSON.stringify({ draft: latestDraft, revision: saved.revision }))
  }
  const saveAll = async (context = commandContext()) => {
    const open = [...tabsRef.current]
    const tasks: SaveAllTask[] = open.map(tab => ({ path: tab.path, save: () => saveTab({ ...tab }, context) }))
    for (const [path, draft] of Object.entries(readProjectDrafts(localStorage, context.projectId))) {
      if (open.some(tab => tab.path === path)) continue
      tasks.push({ path, save: async () => {
      checkContext(context)
      const file = await bridge.file(context.projectId, path)
      checkContext(context)
      if (draft.revision !== file.revision) throw new Error(`Source changed since the saved draft: ${path}`)
      const saved = draft.draft !== file.content ? await bridge.save(context.projectId, path, draft.draft, draft.revision) : file
      checkContext(context)
      const latest = readProjectDrafts(localStorage, context.projectId)[path]
      if (latest?.draft === draft.draft && latest.revision === draft.revision) localStorage.removeItem(draftKey(context.projectId, path))
      else {
        if (latest?.revision === draft.revision) localStorage.setItem(draftKey(context.projectId, path), JSON.stringify({ ...latest, revision: saved.revision }))
        throw new Error(`Closed draft changed while saving: ${path}`)
      }
      } })
    }
    await saveAllOrThrow(tasks)
    checkContext(context)
  }
  const requestDecision = (label: string, paths: string[], continuation: () => void | Promise<void>) => {
    const changed = tabsRef.current.filter((tab) => paths.includes(tab.path) && tab.draft !== tab.content).map((tab) => tab.path)
    if (changed.length) setPending({ label, paths: changed, action: continuation })
    else void Promise.resolve(continuation()).catch(fail)
  }
  const resolveDecision = async (choice: 'save' | 'discard' | 'cancel') => {
    if (!pending) return
    if (pending.resolve) { const resolve = pending.resolve; setPending(null); resolve(choice); return }
    if (choice === 'cancel') { setPending(null); return }
    setBusy(true)
    try {
      if (choice === 'save') for (const tab of tabsRef.current.filter((item) => pending.paths.includes(item.path))) await saveTab(tab)
      else pending.paths.forEach((path) => localStorage.removeItem(draftKey(projectId, path)))
      const next = pending.action
      setPending(null)
      await next?.()
    } catch (error) { fail(error) } finally { setBusy(false) }
  }
  const invoke = <K extends IdeCommandId>(id: K, args: CommandArguments[K], path?: string) => {
    setNotice('')
    void commands.execute(id, commandContext(path), args).catch(fail)
  }
  const closeTab = (path: string) => invoke('editor.close', {}, path)
  const action = async (work: () => Promise<void>) => {
    setBusy(true)
    setNotice('')
    try { await work() } catch (error) { fail(error) } finally { setBusy(false) }
  }
  const buildProject = () => action(async () => {
    enterMode('code')
    const id = projectIdRef.current
    await recoverRename(id)
    if (id !== projectIdRef.current) throw new Error('Build belongs to an older workspace')
    const context = commandContext()
    await saveAll(context); checkContext(context)
    const result = await bridge.build(id); checkContext(context)
    setBuild(result)
    if (result.javaProject) { setJavaProject(result.javaProject); setProjectStatus(result.javaProject.buildSystem === 'plain' ? 'Plain Java' : result.javaProject.buildSystem === 'maven' ? 'Maven' : 'Gradle') }
    // A build does not replace the last recorded execution world.
    setMainClass((previous) => result.mainClasses.includes(previous) ? previous : result.mainClasses[0] ?? '')
    setTool(result.success ? 'console' : 'problems')
    setBottomOpen(!result.success)
    setNotice(result.success ? `Build succeeded in ${result.elapsedMs} ms` : `${result.diagnostics.length} compiler problem${result.diagnostics.length === 1 ? '' : 's'}`)
  })
  const navigateRuntime = useCallback((cursor: number, selection?: Selection) => {
    setRuntimeNavigation((previous) => ({ revision: (previous?.revision ?? 0) + 1, cursor, ...(selection === undefined ? {} : { selection }) }))
  }, [])
  const handleRuntimeChange = useCallback((next: RuntimeState, selection: Selection,recordingId:string) => { executionStore.setState({runtime:next,runtimeRecordingId:recordingId}); setRuntimeSelection(selection) }, [])
  useEffect(() => { setInspectorHidden(false) }, [runtimeSelection?.id])
  const publishIngest = useCallback(function publish(session: ExecutionSession) {
    const ingest = ingestRef.current
    if (!ingest || ingest.sessionId !== session.id) return
    const normalized = ingest.update(session)
    // Metadata can precede the first raw page. Keep the ready placeholder until
    // actual observed facts exist instead of mounting an empty execution world.
    if (ingest.nextSequence === 0) return
    // Metadata can advertise a retained backlog before its raw pages arrive.
    // Coalesce that catch-up into one world publication at the advertised head;
    // repeatedly projecting large intermediate worlds can starve ingestion.
    // Actual process/Console metadata is already published independently.
    const recordedHead = session.rawEventCount ?? session.rawEvents.length
    if (ingest.nextSequence < recordedHead || normalized.trace.events.length === 0) return
    const signature = `${session.id}:${normalized.trace.events.length}:${session.terminalStatus ?? 'live'}:${session.recording?.state ?? 'FULL'}`
    if (signature === normalizedSignature.current) return
    // Ingestion keeps every fact; presentation coalesces catch-up batches to the
    // existing 100 ms live cadence, independently of immediate Console metadata.
    const publication = ingestPublication.current
    const remaining = 100 - (performance.now() - publication.at)
    if (remaining > 0) {
      if (!publication.timer) publication.timer = setTimeout(() => {
        publication.timer = undefined
        const latest = latestExecutionRef.current
        if (latest) publish(latest)
      }, remaining)
      return
    }
    clearTimeout(publication.timer); publication.timer = undefined; publication.at = performance.now()
    normalizedSignature.current = signature
    if (runtimeSessionId.current !== session.id) { setTimelineLens('LIVE'); executionStore.setState({runtime:null,runtimeRecordingId:null}); setRuntimeSelection(null); runtimeSessionId.current = session.id }
    if (committedIngest.current && committedIngest.current !== ingest) retiredIngests.current.push(committedIngest.current)
    committedIngest.current = ingest
    setVisualization({ sessionId: session.id, trace: ingest.publishTrace(), capability: normalized.capability })
    if (!userLayoutOverride.current) {
      const emphasis = session.kind === 'debug' ? 'debug' : 'visualize'
      setWorkspaceMode(emphasis); setEditorWidth(runtimeEditorWidth())
      if (!explorerOverride.current) setExplorerOpen(false)
    }
    if (session.phase === 'PAUSED' && session.pause?.reason === 'exception') { setTool('errors'); setBottomOpen(true); setBottomHeight(35) }
    if (session.phase === 'FAILED' && normalized.trace.events.some(event => event.type === 'THROW_EXCEPTION') && !shownFailure.current) {
      // The World owns the default forensic view. Keep Errors ready in the
      // Dock; preserve an explicitly pinned drawer instead of covering the
      // throwing frame and its evidence panel with automatic console output.
      shownFailure.current = true; setTool('errors'); setBottomOpen(bottomPinned.current); setBottomHeight(35)
    }
  }, [])
  useEffect(() => {
    for (const retired of retiredIngests.current.splice(0)) retired.dispose()
  }, [visualization?.sessionId])
  const acceptExecution = useCallback((session: ExecutionSession) => {
    if (activeExecutionId.current && activeExecutionId.current !== session.id) return
    if (session.projectId !== projectIdRef.current || session.revision <= executionRevision.current) return
    executionRevision.current = session.revision
    latestExecutionRef.current = session
    executionRef.current = session; setExecution(session)
    if (['COMPLETED', 'FAILED', 'STOPPED'].includes(session.phase)) setEndedAt(previous => previous ?? new Date().toISOString())
    if (!sessionWorkspaceGeneration.current.has(session.id)) sessionWorkspaceGeneration.current.set(session.id, workspaceGeneration.current)
    if (session.sourceManifest.sources.length && !sourceBindings.current.has(session.id)) {
      let stored: unknown
      try { stored = JSON.parse(localStorage.getItem(`ggjavaez:source-bindings:${session.projectId}:${session.id}`) ?? 'null') } catch { /* captured paths are the conservative default */ }
      sourceBindings.current.set(session.id, restoreSourceBindings(session.projectId, session.sourceManifest.sources, stored))
    }
    if (session.build && sessionWorkspaceGeneration.current.get(session.id) === workspaceGeneration.current) {
      setBuild(session.build)
      if (session.build.javaProject) setJavaProject(session.build.javaProject)
      setMainClass(session.mainClass ?? session.build.mainClasses[0] ?? '')
    }
    // Desired workspace breakpoints are independent of the session's captured identities.
    if ((session.rawEventCount ?? session.rawEvents.length) > 0 && session.build?.success) {
      if (ingestRef.current?.sessionId !== session.id) {
        if (ingestRef.current && ingestRef.current !== committedIngest.current) ingestRef.current.dispose()
        ingestRef.current = new ExecutionIngest(session)
        clearTimeout(ingestPublication.current.timer)
        ingestPublication.current = { at: performance.now() }
      }
      publishIngest(session)
    } else if (session.phase === 'FAILED' && session.failureKind === 'build') {
      setTool('problems'); setBottomOpen(true); setNotice(session.diagnostic ?? 'Compilation failed')
    } else if (session.support === 'RUN_ONLY' && ['RUNNING', 'WAITING_FOR_INPUT', 'COMPLETED'].includes(session.phase)) {
      toolRef.current = 'console'; setTool('console'); setBottomOpen(true)
    }
    if (session.phase === 'WAITING_FOR_INPUT') { toolRef.current = 'console'; setTool('console'); setBottomOpen(true) }
    // Only an actual finished process collapses automatically surfaced output.
    // Recording limits alone, input waits, Debug pauses and failures do not collapse it.
    if (session.phase === 'COMPLETED' && !bottomPinned.current && toolRef.current === 'console') setBottomOpen(false)
  }, [publishIngest])
  const acceptRaw = useCallback(async (delta: RawTraceDelta) => {
    const session = latestExecutionRef.current
    if (!session || session.id !== delta.sessionId || session.projectId !== projectIdRef.current) return
    if (ingestRef.current?.sessionId !== session.id) {
      if (ingestRef.current && ingestRef.current !== committedIngest.current) ingestRef.current.dispose()
      ingestRef.current = new ExecutionIngest(session)
      clearTimeout(ingestPublication.current.timer)
      ingestPublication.current = { at: performance.now() }
    }
    const ingest = ingestRef.current
    // A gap is repaired from the retained raw prefix before the later batch is applied.
    while (delta.fromSequence > ingest.nextSequence) {
      const missing = await bridge.executionRaw(session.id, ingest.nextSequence, Math.min(256, delta.fromSequence - ingest.nextSequence))
      if (ingestRef.current !== ingest) return
      if (!missing.events.length) throw new Error('Missing recorded trace range is unavailable')
      ingest.append(missing)
      await yieldTraceWork()
      if (ingestRef.current !== ingest) return
    }
    let publishedAt = performance.now(), sliceStarted = performance.now()
    for (let offset = 0; offset < delta.events.length; offset += 32) {
      if (ingestRef.current !== ingest) return
      const events = delta.events.slice(offset, offset + 32)
      ingest.append({ ...delta, fromSequence: delta.fromSequence + offset, toSequence: delta.fromSequence + offset + events.length, events })
      if (performance.now() - publishedAt >= 100) {
        const latest = latestExecutionRef.current
        if (latest?.id === session.id) publishIngest(latest)
        publishedAt = performance.now()
      }
      if (performance.now() - sliceStarted >= 4) { await yieldTraceWork(); sliceStarted = performance.now() }
    }
    const latest = latestExecutionRef.current
    if (latest?.id === session.id) publishIngest(latest)
  }, [publishIngest])
  const performExecution = async (kind: 'run' | 'debug', withoutVisualization = false, context = commandContext()) => {
    checkContext(context)
    const lifecycle = runCommandAvailability(executionDimensions({ execution: executionRef.current, visualization: visualizationRef.current, runtime, timelineLens }), debugSession)
    if (!lifecycle.run.enabled) throw new Error(lifecycle.run.reason)
    if (cwdInvalidRef.current) throw new Error('The working directory was deleted. Choose a directory in Launch settings before Run.')
    await recoverRename(context.projectId)
    if (context.projectId !== projectIdRef.current) throw new Error('Run belongs to an older workspace')
    context = commandContext()
    await saveAll(context)
    checkContext(context)
    eventSourceRef.current?.close(); activeExecutionId.current = 'pending'
    setEndedAt(null); executingSourceRef.current = null; setBuild(null); toolRef.current = 'console'; setTool('console'); setNotice('')
    executionRevision.current = -1; shownFailure.current = false; normalizedSignature.current = ''
    userLayoutOverride.current = false; explorerOverride.current = false
    setWorkspaceMode(kind === 'debug' ? 'debug' : 'visualize'); setEditorWidth(runtimeEditorWidth()); setSourceOpen(true); setFocusSourceOpen(false); setExplorerOpen(false); setBottomOpen(kind === 'run' || bottomPinned.current)
    const session = await bridge.executionStart(context.projectId, { ...launchRef.current, kind, mainClass: mainClassRef.current, breakpoints: breakpointsRef.current.map(({ fileId, line }) => ({ fileId, line })), withoutVisualization })
    checkContext(context)
    activeExecutionId.current = session.id
    acceptExecution(session)
  }
  const runProject = () => invoke('execution.run', {})
  const debugProject = () => invoke('debug.startOrContinue', {})
  const debugCommand = (command: DebugCommand) => invoke(command === 'continue' ? 'debug.startOrContinue' : `debug.${command}`, {})
  const toggleBreakpoint = (fileId: string, line: number) => {
    const next: ResolvedBreakpoint[] = breakpoints.some((point) => point.fileId === fileId && point.line === line)
      ? breakpoints.filter((point) => point.fileId !== fileId || point.line !== line)
      : [...breakpoints, { fileId, line, status: 'pending', reason: null }]
    breakpointsRef.current = next; setBreakpoints(next); localStorage.setItem(breakpointKey(projectId), JSON.stringify(next.map(({ fileId, line }) => ({ fileId, line }))))
    if (execution?.kind === 'debug' && ['STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(execution.phase)) void syncSessionBreakpoints(execution, next).catch(fail)
  }
  const removeBreakpoint = (point: SourceBreakpoint) => toggleBreakpoint(point.fileId, point.line)
  const handleExecutingSource = useCallback((location: RuntimeSourceLocation | null) => {
    executingSourceRef.current = location
    const request = ++sourceRequest.current
    if (!location) { setMappedExecutingSource(null);setSourceUnavailable(true);setRecordedView(view=>view?{...view,location:null}:null);return }
    const captured = visualizationRef.current
    const paused=executionRef.current?.kind==='debug'&&executionRef.current.phase==='PAUSED'?executionRef.current:null
    const sourceContext=captured??(paused?{sessionId:paused.id,trace:{sourceFiles:paused.sourceManifest.sources}}:null)
    if (!sourceContext) return
    const bindings = sourceBindings.current.get(sourceContext.sessionId)
    const id = projectIdRef.current, generation = workspaceGeneration.current
    requestedSourceRef.current = location.fileId
    void (async () => {
      const path = bindings ? await verifiedWorkspaceSource(bindings, location.fileId, (path) => effectiveSource(id, path)) : null
      if (request !== sourceRequest.current || id !== projectIdRef.current || generation !== workspaceGeneration.current) return
      if (path) {
        const file=sourceContext.trace.sourceFiles.find(file=>file.fileId===location.fileId)
        setSourceFileProof(file?{sessionId:sourceContext.sessionId,fileId:file.fileId,path,content:file.content}:null)
        setSourceUnavailable(false);setMappedExecutingSource({ path, line: location.line, column: null,recordedFileId:location.fileId }); setRecordedView(null)
        if (path !== activeRef.current) await openFile(id, path,undefined,()=>request===sourceRequest.current)
      } else {
        setMappedExecutingSource(null)
        const file = sourceContext.trace.sourceFiles.find((source) => source.fileId === location.fileId)
        setSourceUnavailable(!file)
        if (file) setRecordedView({ file, location })
        else setRecordedView(view=>view?{...view,location:null}:null)
      }
    })().catch(fail).finally(() => { requestedSourceRef.current = '' })
  }, [openFile])

  // Verify throw provenance independently of the cursor highlight. A short JVM
  // can publish its entire recording with an unavailable terminal source.
  useEffect(()=>{
    const captured=visualization,location=exceptionSourceLocation(runtime,captured?.trace,runtimeRecordingId)
    if(!captured||!location)return
    const bindings=sourceBindings.current.get(captured.sessionId),file=captured.trace.sourceFiles.find(file=>file.fileId===location.fileId)
    if(!bindings||!file)return
    const id=projectIdRef.current,generation=workspaceGeneration.current
    let cancelled=false
    void verifiedWorkspaceSource(bindings,location.fileId,path=>effectiveSource(id,path)).then(path=>{
      if(cancelled||!path||id!==projectIdRef.current||generation!==workspaceGeneration.current||captured.sessionId!==visualizationRef.current?.sessionId)return
      if(path===activeRef.current)setSourceFileProof({sessionId:captured.sessionId,fileId:file.fileId,path,content:file.content})
    }).catch(error=>{if(!cancelled&&id===projectIdRef.current&&generation===workspaceGeneration.current)fail(error)})
    return()=>{cancelled=true}
  },[visualization?.sessionId,runtimeRecordingId,runtime?.exceptions,runtime?.cursor,active,activeTab?.draft,javaProject])
  const stopRun = () => invoke('execution.stop', {})
  const sendInput = () => action(async () => {
    if (!execution) return
    await bridge.executionInput(execution.id, input + '\n')
    setInput('')
  })
  async function effectiveSource(id: string, path: string): Promise<string | null> {
    if (id !== projectIdRef.current) return null
    const open = tabsRef.current.find((tab) => tab.path === path)
    if (open) return open.draft
    const closed = readProjectDrafts(localStorage, id)[path]
    if (closed) return closed.draft
    try { return (await bridge.file(id, path)).content } catch { return null }
  }
  useEffect(() => {
    const session = execution
    if (session?.kind !== 'debug' || session.projectId !== projectId || !breakpointBindings || !breakpoints.length) { setBreakpointProjection(null); return }
    const bindings = breakpointBindings, desired = breakpoints, capturedTabs = tabs
    const generation = workspaceGeneration.current
    let cancelled = false
    const current = () => {
      const latest = executionRef.current
      return !cancelled && projectIdRef.current === session.projectId && workspaceGeneration.current === generation &&
        latest?.id === session.id && latest.breakpoints === session.breakpoints &&
        sourceBindings.current.get(session.id) === bindings && breakpointsRef.current === desired && tabsRef.current === capturedTabs
    }
    const observed = new Map<string, string | null>()
    void (async () => {
      const points = await projectSessionBreakpoints(bindings, desired, session, async (path) => {
        const content = await effectiveSource(session.projectId, path)
        observed.set(path, content)
        return content
      })
      if (!current()) return
      // Closed drafts can change without a tab render; do not publish a proof for older text.
      for (const [path, content] of observed) {
        if (await effectiveSource(session.projectId, path) !== content) return
        if (!current()) return
      }
      setBreakpointProjection({ projectId: session.projectId, sessionId: session.id, generation, bindings, desired, tabs: capturedTabs, acknowledgments: session.breakpoints, points })
    })().catch(() => { if (current()) setBreakpointProjection(null) })
    return () => { cancelled = true }
  }, [execution?.id, execution?.kind, execution?.breakpoints, projectId, breakpointBindings, breakpoints, tabs])
  async function syncSessionBreakpoints(session: ExecutionSession, desired: readonly SourceBreakpoint[]) {
    const bindings = sourceBindings.current.get(session.id)
    if (!bindings) return
    const generation = workspaceGeneration.current
    const translated: SourceBreakpoint[] = []
    for (const point of desired) {
      const fileId = await recordedBreakpointPath(bindings, point.fileId, (path) => effectiveSource(session.projectId, path))
      if (fileId) translated.push({ fileId, line: point.line })
    }
    if (executionRef.current?.id !== session.id || generation !== workspaceGeneration.current) return
    acceptExecution(await bridge.executionBreakpoints(session.id, translated))
  }
  function invalidateWorkspaceModel() {
    modelRef.current = null; setJavaProject(null); setBuild(null)
    setProjectStatus('Project files changed. Build or Run refreshes the project.')
    sourceRequest.current++; requestedSourceRef.current = ''; setMappedExecutingSource(null);setSourceFileProof(null)
  }
  async function reconcileFileChange(id: string, change: WorkspacePathChange, receipt?: RenameReceipt) {
    const source = change.kind === 'rename' ? change.from : change.path
    const current = id === projectIdRef.current
    const state = { tabs: current ? tabsRef.current : [], drafts: readProjectDrafts(localStorage, id), activePath: current ? activeRef.current || null : null,
      breakpoints: current ? breakpointsRef.current : [], workingDirectory: current ? cwdInvalidRef.current ? null : launchRef.current.workingDirectory : '.', navigation: current ? navRef.current : null }
    const result = transitionWorkspacePaths(state, change)
    // Keep the pending nonce and every original draft if migration fails after a committed move.
    // A subsequent retry/reload can recover the same receipt without another physical rename.
    const nextBindings = new Map<string, SourceBindings>()
    for (const [sessionId, bindings] of sourceBindings.current) if (bindings.projectId === id) {
      const next = receipt ? bindRenamedSources(bindings, receipt) : unbindDeletedSources(bindings, source)
      nextBindings.set(sessionId, next)
    }
    // Reload recovery may precede attachment of the server's current session.
    const bindingPrefix = `ggjavaez:source-bindings:${id}:`
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith(bindingPrefix) || nextBindings.has(key.slice(bindingPrefix.length))) continue
      try {
        const saved = JSON.parse(localStorage.getItem(key)!) as SourceBindings
        const captured = saved.sources.map(({ fileId, sha256 }) => ({ fileId, sha256, content: '' }))
        const bindings = restoreSourceBindings(id, captured, saved)
        nextBindings.set(key.slice(bindingPrefix.length), receipt ? bindRenamedSources(bindings, receipt) : unbindDeletedSources(bindings, source))
      } catch { /* Invalid stored mappings cannot authorize workspace source navigation. */ }
    }
    const mapPath = (path: string) => change.kind === 'rename' && pathIsWithin(path, source) ? change.to + path.slice(source.length) : path
    withStorageTransaction(localStorage, (transaction) => {
      persistProjectPathChange(transaction, id, change)
      for (const [sessionId, next] of nextBindings) transaction.setItem(`ggjavaez:source-bindings:${id}:${sessionId}`, JSON.stringify(next))
    })
    for (const [sessionId, next] of nextBindings) if (sourceBindings.current.has(sessionId)) sourceBindings.current.set(sessionId, next)
    if (!current) return
    workspaceGeneration.current++; setPicker(null); setTabMenu(null)
    const generation = workspaceGeneration.current
    tabsRef.current = result.state.tabs.map((tab) => ({ ...tab })); setTabs(tabsRef.current)
    activeRef.current = result.state.activePath ?? ''; setActive(activeRef.current)
    navRef.current = result.state.navigation; setNav(navRef.current)
    breakpointsRef.current = result.state.breakpoints.map((point) => ({ ...point, status: 'pending', reason: null }))
    setBreakpoints(breakpointsRef.current)
    if (result.workingDirectoryDeleted) { cwdInvalidRef.current = true; setCwdInvalid(true) }
    if (result.state.workingDirectory !== null) {
      launchRef.current = { ...launchRef.current, workingDirectory: result.state.workingDirectory }; setLaunch(launchRef.current)
    }
    setCollapsed((previous) => new Set([...previous].filter((path) => change.kind !== 'delete' || !pathIsWithin(path, source)).map(mapPath)))
    invalidateWorkspaceModel()
    retireEditableModels(id, source)
    const oldLanguagePaths = [...languagePaths.current].filter((path) => pathIsWithin(path, source))
    for (const path of oldLanguagePaths) { languagePaths.current.delete(path); await languageClient.closeDocument(path).catch(() => {}) }
    await refreshTree(id)
    if (id !== projectIdRef.current || generation !== workspaceGeneration.current) return
    // open() invalidates pending JDT responses; the server resolves the new model before connecting.
    languagePaths.current.clear()
    await languageClient.open(id)
    if (id !== projectIdRef.current || generation !== workspaceGeneration.current) return
    for (const tab of tabsRef.current.filter((tab) => tab.path.endsWith('.java'))) {
      languageClient.openDocument(tab.path, tab.draft); languagePaths.current.add(tab.path)
    }
    await languageClient.flush().catch(() => {})
    if (id === projectIdRef.current && generation === workspaceGeneration.current)
      handleExecutingSource(executingSourceRef.current)
  }
  async function recoverRename(id: string) {
    const raw = localStorage.getItem(renameIntentKey(id))
    if (!raw) return
    const intent = JSON.parse(raw) as { from: string; to: string; operationId: string }
    const receipt = await bridge.renameWithReceipt(id, intent.from, intent.to, intent.operationId)
    await reconcileFileChange(id, { kind: 'rename', from: receipt.from, to: receipt.to }, receipt)
    localStorage.removeItem(renameIntentKey(id))
  }
  const commandIO = async (work: () => Promise<void>) => {
    setBusy(true)
    try { await work() } finally { setBusy(false) }
  }
  commandHost.current.snapshot = () => {
    const id = projectIdRef.current, session = executionRef.current
    const activeDebug = session?.kind === 'debug' && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(session.phase)
    return { projectId: id, workspaceGeneration: workspaceGeneration.current, tabs: tabsRef.current, activePath: activeRef.current || null,
      resources: flatten(treeRef.current).map(({ path, kind }) => ({ projectId: id, path, kind })),
      closedDrafts: Object.entries(readProjectDrafts(localStorage, id)).filter(([path]) => !tabsRef.current.some((tab) => tab.path === path))
        .map(([path, draft]) => ({ path, ...draft, dirty: true })),
      debugState: activeDebug ? session.phase === 'PAUSED' ? 'paused' : session.phase === 'BUILDING' || session.phase === 'STARTING' ? 'starting' : 'running' : 'inactive',
      languageReady: languageClient.projectId === id && languageClient.getSnapshot().status === 'ready', editorPath: recordedView ? null : activeRef.current || null }
  }
  commandHost.current.prompts = {
    path: ({ command, context, initialPath }) => new Promise((resolve) => {
      checkContext(context)
      const kind = command === 'resource.rename' ? 'rename' : command === 'java.newClass' ? 'class' : command === 'folder.new' ? 'folder' : 'file'
      const folder = context.target?.path ?? defaultClassFolder(modelRef.current)
      setProjectDialog({ kind, path: kind === 'class' ? folder : context.target?.path ?? '', value: kind === 'class' ? 'NewClass' : initialPath,
        resolve: kind === 'class' ? (value) => {
          if (value === null) { resolve(null); return }
          try { resolve(javaClassPath(folder, value)) } catch (error) { fail(error); resolve(null) }
        } : resolve })
    }),
    dirty: ({ command, context, dirtyPaths }) => new Promise((resolve) => {
      checkContext(context); setPending({ label: ideCommandDefinitions[command].title.toLowerCase(), paths: [...dirtyPaths], resolve })
    }),
    delete: ({ context, target, dirtyPaths }) => new Promise((resolveDelete) => {
      checkContext(context); setProjectDialog({ kind: 'delete', path: target.path, value: target.path, dirtyPaths, resolveDelete })
    }),
  }
  commandHost.current.operations = {
    open: (target, location, context) => commandIO(async () => { checkContext(context); setSourceOpen(true); setFocusSourceOpen(true); await openFile(target.projectId, target.path, location) }),
    save: (_target, tab, context) => commandIO(() => saveTab(tab, context)),
    saveAll: (context) => commandIO(() => saveAll(context)),
    close: (plan) => {
      checkContext(plan.context)
      for (const expected of plan.expectedTabs) {
        const tab = tabsRef.current.find((item) => item.path === expected.path)
        if (!tab || tab.draft !== expected.draft || tab.content !== expected.content || tab.revision !== expected.revision) throw new Error(`Editor changed before Close: ${expected.path}`)
      }
      const previous = plan.discardPaths.map((path) => [path, localStorage.getItem(draftKey(plan.context.projectId, path))] as const)
      try { for (const path of plan.discardPaths) localStorage.removeItem(draftKey(plan.context.projectId, path)) }
      catch (error) { for (const [path, value] of previous) if (value !== null) localStorage.setItem(draftKey(plan.context.projectId, path), value); throw error }
      tabsRef.current = tabsRef.current.filter((tab) => !plan.paths.includes(tab.path)); setTabs(tabsRef.current)
      if (plan.paths.includes(activeRef.current)) { activeRef.current = tabsRef.current.at(-1)?.path ?? ''; setActive(activeRef.current) }
      if (navRef.current && plan.paths.includes(navRef.current.path)) { navRef.current = null; setNav(null) }
    },
    createFile: (id, path, content, context) => commandIO(async () => {
      checkContext(context); await bridge.createFile(id, path, content); checkContext(context)
      workspaceGeneration.current++; invalidateWorkspaceModel(); await refreshTree(id); setSourceOpen(true); setFocusSourceOpen(true); await openFile(id, path)
    }),
    createFolder: (id, path, context) => commandIO(async () => {
      checkContext(context); await bridge.createFolder(id, path); checkContext(context)
      workspaceGeneration.current++; invalidateWorkspaceModel(); await refreshTree(id)
    }),
    createJavaClass: (id, path, context) => commandIO(async () => {
      checkContext(context)
      await bridge.createFile(id, path, javaClassContent(path, modelRef.current)); checkContext(context)
      workspaceGeneration.current++; invalidateWorkspaceModel(); await refreshTree(id); setSourceOpen(true); setFocusSourceOpen(true); await openFile(id, path)
    }),
    rename: (target, to, context) => commandIO(async () => {
      checkContext(context)
      // Validate held tab/closed-draft collisions before the filesystem moves.
      transitionWorkspacePaths({ tabs: tabsRef.current, drafts: readProjectDrafts(localStorage, target.projectId), activePath: activeRef.current || null,
        breakpoints: breakpointsRef.current, workingDirectory: launchRef.current.workingDirectory, navigation: navRef.current }, { kind: 'rename', from: target.path, to })
      const raw = localStorage.getItem(renameIntentKey(target.projectId))
      const intent = raw ? JSON.parse(raw) as { from: string; to: string; operationId: string } : { from: target.path, to, operationId: crypto.randomUUID() }
      if (intent.from !== target.path || intent.to !== to) throw new Error('Recover the pending rename before starting another move.')
      localStorage.setItem(renameIntentKey(target.projectId), JSON.stringify(intent))
      const receipt = await bridge.renameWithReceipt(target.projectId, target.path, to, intent.operationId)
      await reconcileFileChange(target.projectId, { kind: 'rename', from: receipt.from, to: receipt.to }, receipt)
      localStorage.removeItem(renameIntentKey(target.projectId))
    }),
    delete: (plan) => commandIO(async () => {
      checkContext(plan.context)
      if (localStorage.getItem(renameIntentKey(plan.context.projectId))) throw new Error('Recover the pending rename before deleting files.')
      const expectedClosed = plan.expectedClosedDrafts.map((draft) => ({ ...draft }))
      if (plan.decision === 'save') {
        for (const tab of plan.expectedTabs) await saveTab(tab, plan.context)
        for (const draft of expectedClosed) {
          const current = readProjectDrafts(localStorage, plan.context.projectId)[draft.path]
          if (!current || current.draft !== draft.draft || current.revision !== draft.revision) throw new Error(`Closed draft changed: ${draft.path}`)
          const saved = await bridge.save(plan.context.projectId, draft.path, draft.draft, draft.revision)
          checkContext(plan.context)
          const latest = readProjectDrafts(localStorage, plan.context.projectId)[draft.path]
          if (!latest || latest.draft !== draft.draft || latest.revision !== draft.revision) throw new Error(`Closed draft changed while saving: ${draft.path}`)
          draft.revision = saved.revision
          localStorage.setItem(draftKey(plan.context.projectId, draft.path), JSON.stringify({ draft: draft.draft, revision: saved.revision }))
        }
      }
      checkContext(plan.context)
      const currentDrafts = readProjectDrafts(localStorage, plan.context.projectId)
      for (const expected of plan.expectedTabs) {
        const current = tabsRef.current.find((tab) => tab.path === expected.path)
        if (!current || current.draft !== expected.draft || plan.decision === 'discard' && current.revision !== expected.revision) throw new Error(`Editor changed before Delete: ${expected.path}`)
      }
      for (const expected of expectedClosed) if (currentDrafts[expected.path]?.draft !== expected.draft || currentDrafts[expected.path]?.revision !== expected.revision) throw new Error(`Closed draft changed before Delete: ${expected.path}`)
      const approved = new Map([...plan.expectedTabs.map((tab) => [tab.path, tab.draft] as const), ...expectedClosed.map((draft) => [draft.path, draft.draft] as const)])
      for (const tab of tabsRef.current) if (pathIsWithin(tab.path, plan.target.path) && tab.draft !== tab.content && approved.get(tab.path) !== tab.draft) throw new Error(`New dirty editor before Delete: ${tab.path}`)
      for (const [path, draft] of Object.entries(currentDrafts)) if (pathIsWithin(path, plan.target.path) && approved.get(path) !== draft.draft) throw new Error(`New closed draft before Delete: ${path}`)
      // Destructive commits protect editor input; retained text also covers closed drafts.
      const monacoApi = getLoadedJavaEditorRuntime()?.monaco
      const locked = (monacoApi?.editor.getEditors() ?? []).filter((editor) => {
        const model = editor.getModel(), path = model ? documentPath(model.uri.toString(), plan.context.projectId) : null
        return path !== null && pathIsWithin(path, plan.target.path)
      }).map((editor) => ({ editor, readOnly: editor.getRawOptions().readOnly ?? false }))
      const recoveryKey = `ggjavaez:deleted-drafts:${plan.context.projectId}:${crypto.randomUUID()}`
      if (plan.dirtyPaths.length) localStorage.setItem(recoveryKey, JSON.stringify({ path: plan.target.path, tabs: plan.expectedTabs, drafts: expectedClosed }))
      deletingPath.current = plan.target.path
      for (const { editor } of locked) editor.updateOptions({ readOnly: true })
      try {
        await bridge.delete(plan.context.projectId, plan.target.path)
        await reconcileFileChange(plan.context.projectId, { kind: 'delete', path: plan.target.path })
      } finally {
        deletingPath.current = null
        for (const { editor, readOnly } of locked) if (monacoApi?.editor.getEditors().includes(editor)) editor.updateOptions({ readOnly })
      }
    }),
    reveal: async (target, context) => { checkContext(context); revealEntry(target.path) },
    copyText: async (text, context) => { checkContext(context); await navigator.clipboard.writeText(text) },
    renameSymbol: async (target, newName, context) => {
      checkContext(context)
      const { monaco: monacoApi } = await loadJavaEditorRuntime()
      checkContext(context)
      const editor = monacoApi.editor.getEditors().find((editor) => { const model = editor.getModel(); return model && documentPath(model.uri.toString(), context.projectId) === target.path })
      if (!editor) throw new Error('The Java editor target changed')
      editor.focus()
      if (newName === undefined) { await editor.getAction('editor.action.rename')?.run(); return }
      const model = editor.getModel(), position = editor.getPosition(), host = languageEditHost.current
      if (!model || documentPath(model.uri.toString(), context.projectId) !== target.path || !position || !host) throw new Error('The Java editor target changed')
      const version = model.getVersionId()
      const edit = await languageClient.request<LspWorkspaceEdit | null>('textDocument/rename', { textDocument: { uri: documentUri(context.projectId, target.path) }, position: { line: position.lineNumber - 1, character: position.column - 1 }, newName }, { path: target.path })
      checkContext(context)
      if (model.isDisposed() || model.getVersionId() !== version) throw new Error('The Java document changed while renaming')
      if (edit) await applyWorkspaceEdit(monacoApi, languageClient, edit, host)
    },
    startDebug: (context) => commandIO(() => performExecution('debug', false, context)),
    debug: (command, context) => commandIO(async () => {
      checkContext(context); const session = executionRef.current
      if (session?.kind !== 'debug') throw new Error('There is no active debugger')
      const next = await bridge.executionCommand(session.id, command); checkContext(context); acceptExecution(next)
    }),
    quickOpen: async (context) => { checkContext(context); setPicker({ mode: 'files', context: { ...context } }) },
    commandPalette: async (context) => { checkContext(context); setPicker({ mode: 'commands', context: { ...context } }) },
    shell: async (id, context) => {
      checkContext(context)
      if (id === 'navigation.explore') useCameraStore.getState().explore()
      else if (id === 'navigation.follow') useCameraStore.getState().enableFollow()
      else if (id === 'navigation.home') useCameraStore.getState().home()
      else if (id === 'navigation.focusSelection') { const selection = useWorldInteractionStore.getState().selection; if (selection) useCameraStore.getState().focus(selection) }
      else if (id === 'navigation.exitFocus') useCameraStore.getState().exitFocus()
      else if (id === 'navigation.traceRelevant' || id === 'navigation.traceCurrent' || id === 'navigation.traceAll') {
        useCameraStore.getState().enterTrace()
        useWorldInteractionStore.getState().setTraceScope(id === 'navigation.traceCurrent' ? 'current' : id === 'navigation.traceAll' ? 'all' : 'relevant')
      }
      else if (id === 'navigation.followPath') { const selection = useWorldInteractionStore.getState().selection; if (selection?.kind === 'flow' && hasPresentedCommandFlow(selection.id)) useCameraStore.getState().followPath(selection.id) }
      else if (id === 'view.qualityInteractive' || id === 'view.qualityCinematic') await useQualityStore.getState().selectQuality(id === 'view.qualityInteractive' ? 'INTERACTIVE' : 'CINEMATIC')
      else if (id === 'view.reducedMotion') { const quality = useQualityStore.getState(); quality.setReducedMotion(!quality.reducedMotion.inApp) }
      else if (id === 'execution.run' || id === 'execution.runWithoutVisualization') await commandIO(() => performExecution('run', id === 'execution.runWithoutVisualization', context))
      else if (id === 'execution.build') await buildProject()
      else if (id === 'execution.stop') await commandIO(async () => { const session = executionRef.current; if (session) { const next = await bridge.executionStop(session.id); checkContext(context); acceptExecution(next) } })
      else if (id === 'workbench.explorer') toggleExplorer()
      else if (id === 'workbench.source') { userLayoutOverride.current = true; if (runtimeExpanded) setFocusSourceOpen((value) => !value); else { setSourceOpen((value) => !value); setFocusSourceOpen((value) => !value) } }
      else if (id === 'workbench.edit') { userLayoutOverride.current = true; enterMode('code');setFocusSourceOpen(true) }
      else if (id === 'workbench.tools') { bottomPinned.current = !bottomOpen; setBottomOpen(!bottomOpen) }
      else if (id === 'workbench.console' || id === 'workbench.problems' || id === 'workbench.debugger') { bottomPinned.current = true; setTool(id === 'workbench.console' ? 'console' : id === 'workbench.problems' ? 'problems' : 'debugger'); setBottomOpen(true) }
      else if (id === 'workbench.inspector') setInspectorHidden((value) => !value)
      else if (id === 'workbench.returnLive') setTimelineLens('LIVE')
      else if (id === 'workbench.launch') setShowLaunch(true)
      else if (id === 'workbench.symbols') setShowSymbols(true)
      else if (id === 'workbench.jdk') setShowJdk((value) => !value)
      else if (id === 'workbench.restartJava') await languageClient.restart()
      else if (id === 'workbench.importProject') importRef.current?.click()
      else if (id === 'workbench.newProject') setProjectDialog({ kind: 'project', path: '', value: 'New Java Project' })
    },
  }
  // Palette enablement follows the same canonical stores as Mode_Bar and Inspector.
  useWorldInteractionStore(state => state.selection)
  useWorldInteractionStore(state => state.focus)
  useQualityStore(state => state.cinematicAvailable)
  useQualityStore(state => state.contextLost)
  const shellAvailability = (id: ShellCommandId) => {
    const interaction = useWorldInteractionStore.getState(), quality = useQualityStore.getState()
    if (isPresentationCommand(id) || id === 'workbench.inspector') return worldCommandAvailability(id, {
      worldPresent: hasMountedRecording(), selection: interaction.selection, focusActive: !!interaction.focus,
      presentedFlow: interaction.selection?.kind === 'flow' && hasPresentedCommandFlow(interaction.selection.id),
      cinematic: quality.cinematicAvailable, contextLost: quality.contextLost,
    })
    const lifecycle = runCommandAvailability(executionDimensions({ execution: executionRef.current, visualization: visualizationRef.current, runtime, timelineLens }), debugSession)
    if (id.startsWith('execution.') && busy) return { enabled: false as const, reason: 'Wait for the current operation' }
    if (['execution.run', 'execution.runWithoutVisualization'].includes(id) && !jdk?.available) return { enabled: false as const, reason: 'Configure a JDK first' }
    if (['execution.run', 'execution.runWithoutVisualization'].includes(id) && !lifecycle.run.enabled) return lifecycle.run
    if (id === 'execution.stop' && !lifecycle.stop.enabled) return { enabled: false as const, reason: 'No active execution' }
    if (id === 'workbench.returnLive' && !visualization) return { enabled: false as const, reason: 'Run Java to record a runtime world' }
    if (id === 'workbench.symbols' && languageSnapshot.status !== 'ready') return { enabled: false as const, reason: 'Java language service is not ready' }
    return { enabled: true as const }
  }
  const commandSnapshot = commandHost.current.snapshot
  commandHost.current.snapshot = () => ({ ...commandSnapshot(), shellAvailability: Object.fromEntries(Object.values(ideCommandDefinitions).filter(definition => isShellCommand(definition.id)).map(definition => [definition.id, shellAvailability(definition.id as ShellCommandId)])) })
  if (!jdk?.available) delete commandHost.current.operations.startDebug
  const newEntry = (kind: 'file' | 'folder' | 'class', parent = '') => {
    const id = kind === 'class' ? 'java.newClass' : kind === 'folder' ? 'folder.new' : 'file.new'
    invoke(id, {}, parent && parent !== '.' ? parent : undefined)
  }
  const renameEntry = (path: string) => invoke('resource.rename', {}, path)
  const deleteEntry = (path: string) => invoke('resource.delete', {}, path)
  const cancelProjectDialog = () => {
    const dialog = projectDialog
    setProjectDialog(null)
    dialog?.resolve?.(null); dialog?.resolveDelete?.('cancel')
  }
  const submitProjectDialog = () => {
    if (!projectDialog) return
    if (projectDialog.resolve) {
      const dialog = projectDialog
      if (dialog.kind === 'class') {
        try { javaClassContent(javaClassPath(dialog.path || defaultClassFolder(modelRef.current), dialog.value), modelRef.current) }
        catch (error) { fail(error); return }
      }
      setProjectDialog(null); dialog.resolve!(dialog.value); return
    }
    if (projectDialog.resolveDelete) { const dialog = projectDialog; setProjectDialog(null); dialog.resolveDelete!('discard'); return }
    if (projectDialog.kind !== 'project') return
    return action(async () => {
      const next = await bridge.createProject(projectDialog.value.trim())
      setProjects(await bridge.projects())
      setProjectDialog(null)
      requestDecision('opening the new project', tabsRef.current.map((tab) => tab.path), () => switchProject(next.id))
    })
  }
  const importFiles = (files: FileList | null) => action(async () => {
    if (!files?.length) return
    const accepted = Array.from(files).filter((file) => !(file.webkitRelativePath || file.name).split('/').some((part) => ['.git', 'target', 'build', '.gradle', 'node_modules', '.idea'].includes(part)))
    if (!accepted.some((file) => file.name.endsWith('.java'))) throw new Error('Choose a folder containing .java files')
    if (accepted.reduce((size, file) => size + file.size, 0) > 5 * 1024 * 1024) throw new Error('Project import is limited to 5 MiB of sources, resources and build files.')
    const sources = await Promise.all(accepted.map(async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer())
      try { return { path: file.webkitRelativePath || file.name, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) } }
      catch {
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        return { path: file.webkitRelativePath || file.name, content: btoa(binary), encoding: 'base64' as const }
      }
    }))
    const root = sources[0].path.split('/')[0]
    const normalized = sources.map((file) => ({ ...file, path: file.path.startsWith(`${root}/`) ? file.path.slice(root.length + 1) : file.path }))
    const created = await bridge.importProject(root || 'Imported Java', normalized)
    setProjects(await bridge.projects())
    requestDecision('opening the imported project', tabsRef.current.map((tab) => tab.path), () => switchProject(created.id))
  })
  const openDiagnostic = (item: CompileDiagnostic) => invoke('file.open', { location: item.location }, item.location.path)
  const setDivider = (kind: 'project' | 'runtime' | 'bottom', clientX: number, clientY: number) => {
    userLayoutOverride.current = true
    if (kind === 'bottom') {
      bottomPinned.current = true
      const bounds = contentRef.current?.getBoundingClientRect()
      if (bounds) setBottomHeight(Math.max(16, Math.min(55, (bounds.bottom - clientY) / bounds.height * 100)))
    } else {
      const bounds = kind === 'project' ? shellRef.current?.getBoundingClientRect() : upperRef.current?.getBoundingClientRect()
      if (bounds) {
        const pct = (clientX - bounds.left) / bounds.width * 100
        if (kind === 'project') setProjectWidth(Math.max(13, Math.min(28, pct)))
        else { const width = Math.max(24, Math.min(80, pct)); if (workspaceMode !== 'code') localStorage.setItem(manualRuntimeWidthKey, String(width)); setEditorWidth(width) }
      }
    }
  }
  const divider = (kind: 'project' | 'runtime' | 'bottom') => ({
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      const amount = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 2 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -2 : 0
      if (!amount) return
      event.preventDefault()
      userLayoutOverride.current = true
      if (kind === 'project') setProjectWidth((value) => Math.max(13, Math.min(28, value + amount)))
      else if (kind === 'runtime') setEditorWidth((value) => { const width = Math.max(24, Math.min(80, value + amount)); if (workspaceMode !== 'code') localStorage.setItem(manualRuntimeWidthKey, String(width)); return width })
      else { bottomPinned.current = true; setBottomHeight((value) => Math.max(16, Math.min(55, value - amount))) }
    },
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => event.currentTarget.setPointerCapture(event.pointerId),
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setDivider(kind, event.clientX, event.clientY) },
  })
  const toggleTreeEntry = (path: string) => setCollapsed((previous) => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next })
  const revealEntry = (path: string) => {
    setRuntimeExpanded(false); setFocusSourceOpen(false); setExplorerOpen(true)
    setCollapsed((previous) => { const next = new Set(previous); const parts = path.split('/'); for (let i = 1; i < parts.length; i++) next.delete(parts.slice(0, i).join('/')); return next })
    window.setTimeout(() => Array.from(document.querySelectorAll<HTMLButtonElement>('.ide-tree-name')).find((button) => button.title === path)?.focus(), 0)
  }
  const treeAction = (kind: TreeAction, entry: ProjectEntry | null) => {
    const parent = entry?.kind === 'directory' ? entry.path : entry?.path.split('/').slice(0, -1).join('/') ?? ''
    if (kind === 'class' || kind === 'file' || kind === 'folder') void newEntry(kind, parent)
    else if (kind === 'rename' && entry) void renameEntry(entry.path)
    else if (kind === 'delete' && entry) void deleteEntry(entry.path)
    else if (kind === 'reveal' && entry) invoke('explorer.reveal', {}, entry.path)
    else if (kind === 'copy' && entry) invoke('resource.copyPath', {}, entry.path)
    else if (kind === 'open' && entry) invoke('file.open', {}, entry.path)
    else if (kind === 'refresh') void action(() => refreshTree(projectId))
  }

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (projectDialog || picker || tabMenu || showLaunch || showSymbols || pending || event.isComposing || event.target instanceof HTMLElement && event.target.closest('.ide-workspace-menu')) return
      if (!event.defaultPrevented) {
        const target = event.target instanceof HTMLElement ? event.target : null
        const focus: ShortcutFocus = {
          editor: !!target?.closest('.monaco-editor'),
          textInput: !!target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'),
          world: !!target?.closest('.world-canvas'),
          shellSurface: !!target?.closest('.shell-source, .ide-source-pane, .ide-editor-panel, .shell-source-peek, .ide-jdk, .gg-inspector, .world-timeline, .world-settings, [role="dialog"], [role="menu"]'),
        }
        const interaction = useWorldInteractionStore.getState()
        const escape = worldEscapeCommand(event, focus, { inspectorOpen: !shellStore.getState().inspectorHidden && !!(interaction.selection || interaction.focus), focusActive: !!interaction.focus, traceActive: interaction.trace.active })
        if (escape) { event.preventDefault(); event.stopPropagation(); invoke(escape, {}); return }
        const canonical = commandForShortcut(event, Object.values(ideCommandDefinitions), platform, focus)
        if (canonical) {
          event.preventDefault(); event.stopPropagation()
          if ((!busy || isPresentationCommand(canonical.id) || canonical.id === 'workbench.quickOpen' || canonical.id === 'workbench.commandPalette') && commands.availability(canonical.id, commandContext()).enabled) invoke(canonical.id, {})
          return
        }
      }

    }
    window.addEventListener('keydown', shortcuts, true)
    return () => window.removeEventListener('keydown', shortcuts, true)
  })

  const pickerContext = (id: IdeCommandId): CommandContext => {
    const context = picker?.context ?? commandContext()
    if (['file.open', 'resource.rename', 'resource.delete', 'resource.copyPath', 'explorer.reveal'].includes(id)) return { ...context, ...(active ? { target: { projectId: context.projectId, path: active, kind: 'file' as const } } : {}) }
    if (['file.new', 'java.newClass', 'folder.new'].includes(id)) {
      const parent = active.split('/').slice(0, -1).join('/')
      return { ...context, ...(parent ? { target: { projectId: context.projectId, path: parent, kind: 'directory' as const } } : {}) }
    }
    return context
  }
  // Project membership changes independently of trace publication. Reuse these
  // options while raw catch-up and historical navigation update the workspace.
  const projectOptions = useMemo(() => projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>), [projects])
  const pickerItems: WorkspacePickerItem[] = !picker ? [] : picker.mode === 'files'
    ? entries.filter((entry) => entry.kind === 'file').sort((a, b) => Number(b.path === active) - Number(a.path === active)).map((entry) => ({ id: entry.path, label: entry.name, detail: entry.path, enabled: true }))
    : Object.values(ideCommandDefinitions).map((definition) => ({ id: definition.id, label: `${definition.category}: ${definition.title}`, keywords: definition.id, shortcut: definition.bindings[0] ? formatShortcut(definition.bindings[0], platform) : undefined, ...commands.availability(definition.id, pickerContext(definition.id)) }))
  const choosePicker = (id: string) => {
    if (!picker) return
    const command = picker.mode === 'files' ? 'file.open' : id as IdeCommandId
    const context = picker.mode === 'files' ? { ...picker.context, target: { projectId: picker.context.projectId, path: id, kind: 'file' as const } } : pickerContext(command)
    setPicker(null); setNotice('')
    requestAnimationFrame(() => { void commands.execute(command, context, {}).catch(fail) })
  }
  const showTabMenu = (path: string, x: number, y: number) => setTabMenu({ context: commandContext(path), x, y })
  const activeExecution = !!execution && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(execution.phase)
  const acceptsInput = !!execution && ['RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(execution.phase)
  const availableTools: Tool[] = ['console', 'problems', 'debugger', ...(recordingIsCurrent && visualization.trace.events.some((event) => event.type === 'THROW_EXCEPTION') || exception ? ['errors'] as Tool[] : [])]
  const targets = build?.mainClasses ?? javaProject?.runnableTargets ?? []
  return { endedAt, projects, projectId, tree, tabs, active, setActive, jdk, setJdk, jdkInput, setJdkInput, showJdk, build, execution, timelineLens, setTimelineLens, tool, setTool, bottomPinned, workspaceMode, explorerOpen, inspectorHidden, bottomOpen, setBottomOpen, focusSourceOpen, sourceOpen, picker, setPicker, tabMenu, setTabMenu, input, setInput, notice, setNotice, busy, pending, projectDialog, setProjectDialog, nav, mainClass, setMainClass, javaProject, projectStatus, launch, setLaunch, showLaunch, setShowLaunch, showSymbols, setShowSymbols, languageClient, languageSnapshot, visualization, runtimeExpanded, breakpoints, runtime, runtimeRecordingId, runtimeSelection, runtimeNavigation, recordedView, setRecordedView, mappedExecutingSource, sourceUnavailable, sourceFileProof, setCwdInvalid, commands, projectWidth, editorWidth, bottomHeight, setBottomHeight, collapsed, platform, shellRef, contentRef, upperRef, importRef, confirmRef, projectDialogRef, activeRef, launchRef, mainClassRef, cwdInvalidRef, displayedBreakpoints, activeTab, entries, diagnostics, languageProblems, problems, allEvents, exception, debugSession, recordingIsCurrent, previousRecording, recordedPhase, traceStale, fail, refreshTree, switchProject, edit, commandContext, requestDecision, resolveDecision, invoke, closeTab, action, navigateRuntime, handleRuntimeChange, runProject, debugProject, debugCommand, toggleBreakpoint, removeBreakpoint, handleExecutingSource, stopRun, sendInput, newEntry, cancelProjectDialog, submitProjectDialog, importFiles, openDiagnostic, divider, toggleTreeEntry, treeAction, projectOptions, pickerItems, choosePicker, showTabMenu, activeExecution, acceptsInput, availableTools, targets }
}
