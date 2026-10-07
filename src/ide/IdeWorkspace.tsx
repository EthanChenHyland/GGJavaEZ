import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bug, CircleAlert, CirclePlay, Code2, Files, FolderOpen, Maximize2, Minimize2, PanelBottom, Plus, ScanEye, Search, Square, Terminal, Upload, X, Save, ChevronLeft, ChevronRight } from 'lucide-react'
import { App, type RuntimeNavigation } from '../app/App'
import type { RuntimeState, SourceLocation as RuntimeSourceLocation, TraceDocument } from '../contracts/runtime'
import type { Selection } from '../contracts/interaction'
import { ExecutionIngest } from '../execution/ingest'
import { yieldTraceWork } from '../execution/schedule'
import type { DebugCommand, DebugSession, ResolvedBreakpoint, SourceBreakpoint } from '../debugger/contracts'
import { DebugPanel } from '../debugger/DebugPanel'
import { ErrorExplorer } from '../debugger/ErrorExplorer'
import type { VisualizationCapabilityReport } from '../instrumentation/contracts'
import { bridge, draftStorageKey, readProjectDrafts, persistProjectPathChange, withStorageTransaction, renameIntentKey, type RenameReceipt } from './bridge'
import type { ExecutionStream } from './client'
import { createIdeCommandService, ideCommandDefinitions, type CommandContext, type DirtyDecision, type IdeCommandHost, type IdeCommandId, type CommandArguments } from './commands'
import { pathIsWithin, transitionWorkspacePaths, type WorkspacePathChange } from './pathChanges'
import { restoreSourceBindings, bindRenamedSources, unbindDeletedSources, verifiedWorkspaceSource, recordedBreakpointPath, projectSessionBreakpoints, type SourceBindings } from './sourceBindings'
import SourceEditor from '../ui/SourceEditor'
import type { ExecutionSession, RawTraceDelta, TimelineLens } from '../execution/contracts'
import { EditableJavaEditor } from './EditableJavaEditor'
import { ProblemsPanel } from './ProblemsPanel'
import { LaunchDialog } from './LaunchDialog'
import { SymbolSearch } from './SymbolSearch'
import { defaultLaunch, type JavaProject, type LaunchConfiguration } from './javaProject'
import { LanguageClient } from '../language/client'
import { documentPath, documentUri, type LanguageSnapshot, type LspWorkspaceEdit } from '../language/protocol'
import { registerJavaIntelligence } from '../language/monaco'
import { applyWorkspaceEdit, type WorkspaceEditHost } from '../language/workspaceEdit'
import { mergeProblems } from './problems'
import { ProjectExplorer, type TreeAction } from './ProjectExplorer'
import { currentPlatform, formatShortcut, ideShortcuts, matchesShortcut } from './shortcuts'
import * as monacoApi from 'monaco-editor/editor/editor.api.js'
import type { BuildResult, CompileDiagnostic, JdkStatus, ProjectEntry, ProjectFile, ProjectSummary, SourceLocation } from './contracts'
import { WorkspaceMenu } from './WorkspaceMenu'
import { WorkspacePicker, type WorkspacePickerItem } from './WorkspacePicker'
import { tabMenuCommands } from './contextMenus'
import { defaultClassFolder, javaClassContent, javaClassPath } from './classCreation'
import type { ShellCommandId } from './commands'
import './ide.css'

type Tab = ProjectFile & { draft: string }
type BreakpointProjection = {
  projectId: string; sessionId: string; generation: number; bindings: SourceBindings
  desired: readonly ResolvedBreakpoint[]; tabs: readonly Tab[]; acknowledgments: readonly ResolvedBreakpoint[]
  points: ResolvedBreakpoint[]
}
type Tool = 'console' | 'problems' | 'debugger' | 'errors'
type WorkspaceMode = 'code' | 'visualize' | 'debug'
type PendingDecision = { label: string; paths: string[]; action?: () => void | Promise<void>; resolve?: (choice: DirtyDecision) => void } | null
type ProjectDialog = { kind: 'class' | 'file' | 'folder' | 'rename' | 'delete' | 'project' | 'open'; path: string; value: string; resolve?: (value: string | null) => void; resolveDelete?: (value: DirtyDecision) => void; dirtyPaths?: readonly string[] } | null
const draftKey = draftStorageKey
const sessionKey = (id: string) => `ggjavaez:session:${id}`
const breakpointKey = (id: string) => `ggjavaez:breakpoints:${id}`
const launchKey = (id: string) => `ggjavaez:launch:${id}`
const widthKey = 'ggjavaez:p5:source-width'
const idleTrace: TraceDocument = { schemaVersion: 2, demoId: 'ide:ready', sourceFiles: [], events: [] }
function savedEditorWidth(): number {
  const width = Number(localStorage.getItem(widthKey))
  return width >= 24 && width <= 80 ? width : 38
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
const filename = (path: string) => path.split('/').at(-1) || path
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
function trapDialogTab(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab') return
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled)'))
  const first = controls[0], last = controls.at(-1)
  if (!first || !last) return
  if (!event.currentTarget.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

export function IdeWorkspace() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectId, setProjectId] = useState('')
  const [tree, setTree] = useState<ProjectEntry[]>([])
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState('')
  const [jdk, setJdk] = useState<JdkStatus | null>(null)
  const [jdkInput, setJdkInput] = useState('')
  const [showJdk, setShowJdk] = useState(false)
  const [build, setBuild] = useState<BuildResult | null>(null)
  const [execution, setExecution] = useState<ExecutionSession | null>(null)
  const [timelineLens, setTimelineLens] = useState<TimelineLens>('LIVE')
  const [tool, setTool] = useState<Tool>('console')
  const toolRef = useRef<Tool>('console'); toolRef.current = tool
  const bottomPinned = useRef(false)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('code')
  const [explorerOpen, setExplorerOpen] = useState(() => !window.matchMedia('(max-width: 900px)').matches && localStorage.getItem('ggjavaez:m8:explorer') !== 'closed')
  const [inspectorHidden, setInspectorHidden] = useState(false)
  const [bottomOpen, setBottomOpen] = useState(false)
  const [focusSourceOpen, setFocusSourceOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(true)
  const [picker, setPicker] = useState<{ mode: 'files' | 'commands'; context: CommandContext } | null>(null)
  const [tabMenu, setTabMenu] = useState<{ context: CommandContext; x: number; y: number } | null>(null)
  const [input, setInput] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingDecision>(null)
  const [projectDialog, setProjectDialog] = useState<ProjectDialog>(null)
  const [hydrated, setHydrated] = useState(false)
  const [nav, setNav] = useState<SourceLocation | null>(null)
  const [mainClass, setMainClass] = useState('')
  const [javaProject, setJavaProject] = useState<JavaProject | null>(null)
  const [projectStatus, setProjectStatus] = useState('')
  const [launch, setLaunch] = useState<LaunchConfiguration>(defaultLaunch)
  const [showLaunch, setShowLaunch] = useState(false)
  const [showSymbols, setShowSymbols] = useState(false)
  const [languageClient] = useState(() => new LanguageClient())
  const [languageSnapshot, setLanguageSnapshot] = useState<LanguageSnapshot>(() => languageClient.getSnapshot())
  const [visualization, setVisualization] = useState<{ sessionId: string; trace: TraceDocument; capability: VisualizationCapabilityReport } | null>(null)
  const [runtimeExpanded, setRuntimeExpanded] = useState(false)
  const executingSourceRef = useRef<RuntimeSourceLocation | null>(null)
  const visualizationRef = useRef(visualization)
  visualizationRef.current = visualization
  const [breakpoints, setBreakpoints] = useState<ResolvedBreakpoint[]>([])
  const [breakpointProjection, setBreakpointProjection] = useState<BreakpointProjection | null>(null)
  const [runtime, setRuntime] = useState<RuntimeState | null>(null)
  const [runtimeSelection, setRuntimeSelection] = useState<Selection>(null)
  const [runtimeNavigation, setRuntimeNavigation] = useState<RuntimeNavigation | null>(null)
  const [recordedView, setRecordedView] = useState<{ file: TraceDocument['sourceFiles'][number]; location: RuntimeSourceLocation } | null>(null)
  const [mappedExecutingSource, setMappedExecutingSource] = useState<SourceLocation | null>(null)
  const [cwdInvalid, setCwdInvalid] = useState(false)
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
  const latestExecutionRef = useRef<ExecutionSession | null>(null)
  const ingestPublication = useRef<{ at: number; timer?: ReturnType<typeof setTimeout> }>({ at: -Infinity })
  const userLayoutOverride = useRef(false)
  const explorerOverride = useRef(false)
  const [projectWidth, setProjectWidth] = useState(14)
  const [editorWidth, setEditorWidth] = useState(savedEditorWidth)
  const [bottomHeight, setBottomHeight] = useState(29)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [platform] = useState(currentPlatform)
  const shellRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const upperRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const eventSourceRef = useRef<ExecutionStream | null>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
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
  useEffect(() => { localStorage.setItem('ggjavaez:m8:explorer', explorerOpen ? 'open' : 'closed') }, [explorerOpen])
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 900px)')
    const collapse = () => { if (narrow.matches) setExplorerOpen(false) }
    narrow.addEventListener('change', collapse)
    return () => narrow.removeEventListener('change', collapse)
  }, [])
  useEffect(() => { localStorage.setItem(widthKey, String(editorWidth)) }, [editorWidth])
  const refreshTree = useCallback(async (id: string) => {
    const generation = workspaceGeneration.current
    const next = await bridge.tree(id)
    if (projectIdRef.current === id && workspaceGeneration.current === generation) { treeRef.current = next; setTree(next) }
  }, [])

  useEffect(() => languageClient.subscribe(setLanguageSnapshot), [languageClient])
  useEffect(() => {
    if (!projectId) return
    languagePaths.current.clear()
    void languageClient.open(projectId)
  }, [languageClient, projectId])
  useEffect(() => {
    if (!projectId || languageClient.projectId !== projectId) return
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
    const element = consoleRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [execution?.stdout, execution?.stderr, execution?.runEvents.length, tool])
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

  const openFile = useCallback(async (id: string, path: string, location?: SourceLocation) => {
    if (!path) return
    const generation = workspaceGeneration.current
    if (!tabsRef.current.some((tab) => tab.path === path)) {
      const file = await bridge.file(id, path)
      if (id !== projectIdRef.current || generation !== workspaceGeneration.current) throw new Error('Open belongs to an older workspace')
      const next = tabsRef.current.some((tab) => tab.path === path) ? tabsRef.current : [...tabsRef.current, hydratedTab(id, file)]
      tabsRef.current = next; setTabs(next)
    }
    if (id !== projectIdRef.current || generation !== workspaceGeneration.current) throw new Error('Open belongs to an older workspace')
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
    const registered = registerJavaIntelligence(monacoApi, {
      client: languageClient,
      onOpen: (location) => commands.execute('file.open', commandContext(location.path), { location }).then(() => {}),
      applyEdit: (edit: LspWorkspaceEdit) => applyWorkspaceEdit(monacoApi, languageClient, edit, host),
      onError: setNotice,
    })
    return () => { registered.dispose(); if (languageEditHost.current === host) languageEditHost.current = null }
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
    setProjectId(nextId); setTabs([]); setActive(''); setRecordedView(null); setMappedExecutingSource(null); setCwdInvalid(false)
    setBuild(null)
    setExecution(null); setTimelineLens('LIVE'); activeExecutionId.current = null
    setVisualization(null)
    ingestRef.current?.dispose(); ingestRef.current = null; latestExecutionRef.current = null
    clearTimeout(ingestPublication.current.timer); ingestPublication.current = { at: -Infinity }
    setWorkspaceMode('code')
    setEditorWidth(savedEditorWidth()); setSourceOpen(true); setPicker(null); setTabMenu(null)
    bottomPinned.current = false; setBottomOpen(false); setFocusSourceOpen(false)
    setRuntimeExpanded(false)
    executingSourceRef.current = null
    setRuntime(null); setRuntimeSelection(null); setRuntimeNavigation(null)
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
    ingestRef.current?.dispose(); ingestRef.current = null
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
    for (const tab of [...tabsRef.current]) await saveTab({ ...tab }, context)
    for (const [path, draft] of Object.entries(readProjectDrafts(localStorage, context.projectId))) {
      if (tabsRef.current.some((tab) => tab.path === path)) continue
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
    }
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
  const handleRuntimeChange = useCallback((next: RuntimeState, selection: Selection) => { setRuntime(next); setRuntimeSelection(selection) }, [])
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
    if (ingest.nextSequence < recordedHead) return
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
    if (runtimeSessionId.current !== session.id) { setRuntime(null); setRuntimeSelection(null); runtimeSessionId.current = session.id }
    setVisualization({ sessionId: session.id, trace: ingest.publishTrace(), capability: normalized.capability })
    if (!userLayoutOverride.current) {
      const emphasis = session.kind === 'debug' ? 'debug' : 'visualize'
      setWorkspaceMode(emphasis); setEditorWidth(runtimeEditorWidth())
      if (!explorerOverride.current) setExplorerOpen(false)
    }
    if (session.phase === 'PAUSED' && session.pause?.reason === 'exception') { setTool('errors'); setBottomOpen(true); setBottomHeight(35) }
    if (session.phase === 'FAILED' && normalized.trace.events.some(event => event.type === 'THROW_EXCEPTION') && !shownFailure.current) {
      shownFailure.current = true; setTool('errors'); setBottomOpen(true); setBottomHeight(35)
    }
  }, [])
  const acceptExecution = useCallback((session: ExecutionSession) => {
    if (activeExecutionId.current && activeExecutionId.current !== session.id) return
    if (session.projectId !== projectIdRef.current || session.revision <= executionRevision.current) return
    executionRevision.current = session.revision
    latestExecutionRef.current = session
    executionRef.current = session; setExecution(session)
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
        ingestRef.current?.dispose(); ingestRef.current = new ExecutionIngest(session)
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
      ingestRef.current?.dispose(); ingestRef.current = new ExecutionIngest(session)
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
    if (cwdInvalidRef.current) throw new Error('The working directory was deleted. Choose a directory in Launch settings before Run.')
    await recoverRename(context.projectId)
    if (context.projectId !== projectIdRef.current) throw new Error('Run belongs to an older workspace')
    context = commandContext()
    await saveAll(context)
    checkContext(context)
    eventSourceRef.current?.close(); activeExecutionId.current = 'pending'
    setTimelineLens('LIVE'); executingSourceRef.current = null; setBuild(null); toolRef.current = 'console'; setTool('console'); setNotice('')
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
    if (!location) { setMappedExecutingSource(null); setRecordedView(null); return }
    const captured = visualizationRef.current
    if (!captured) return
    const bindings = sourceBindings.current.get(captured.sessionId)
    const id = projectIdRef.current, generation = workspaceGeneration.current
    requestedSourceRef.current = location.fileId
    void (async () => {
      const path = bindings ? await verifiedWorkspaceSource(bindings, location.fileId, (path) => effectiveSource(id, path)) : null
      if (request !== sourceRequest.current || id !== projectIdRef.current || generation !== workspaceGeneration.current) return
      if (path) {
        setMappedExecutingSource({ path, line: location.line, column: null }); setRecordedView(null)
        if (path !== activeRef.current) await openFile(id, path, { path, line: location.line, column: null })
      } else {
        setMappedExecutingSource(null)
        const file = captured.trace.sourceFiles.find((source) => source.fileId === location.fileId)
        if (file) setRecordedView({ file, location })
      }
    })().catch(fail).finally(() => { requestedSourceRef.current = '' })
  }, [openFile])
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
  function retireModels(id: string, path: string) {
    for (const model of monacoApi.editor.getModels()) {
      const relative = documentPath(model.uri.toString(), id)
      if (!relative || !pathIsWithin(relative, path)) continue
      monacoApi.editor.setModelMarkers(model, 'javac', [])
      monacoApi.editor.setModelMarkers(model, 'language', [])
      for (const editor of monacoApi.editor.getEditors()) if (editor.getModel() === model) editor.setModel(null)
      model.dispose()
    }
  }
  function invalidateWorkspaceModel() {
    modelRef.current = null; setJavaProject(null); setBuild(null)
    setProjectStatus('Project files changed. Build or Run refreshes the project.')
    sourceRequest.current++; requestedSourceRef.current = ''; setMappedExecutingSource(null)
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
    retireModels(id, source)
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
      const locked = monacoApi.editor.getEditors().filter((editor) => {
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
        for (const { editor, readOnly } of locked) if (monacoApi.editor.getEditors().includes(editor)) editor.updateOptions({ readOnly })
      }
    }),
    reveal: async (target, context) => { checkContext(context); revealEntry(target.path) },
    copyText: async (text, context) => { checkContext(context); await navigator.clipboard.writeText(text) },
    renameSymbol: async (target, newName, context) => {
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
      if (id === 'execution.run' || id === 'execution.runWithoutVisualization') await commandIO(() => performExecution('run', id === 'execution.runWithoutVisualization', context))
      else if (id === 'execution.build') await buildProject()
      else if (id === 'execution.stop') await commandIO(async () => { const session = executionRef.current; if (session) { const next = await bridge.executionStop(session.id); checkContext(context); acceptExecution(next) } })
      else if (id === 'workbench.explorer') toggleExplorer()
      else if (id === 'workbench.source') { userLayoutOverride.current = true; if (runtimeExpanded) setFocusSourceOpen((value) => !value); else setSourceOpen((value) => !value) }
      else if (id === 'workbench.edit') { userLayoutOverride.current = true; enterMode('code') }
      else if (id === 'workbench.tools') { bottomPinned.current = !bottomOpen; setBottomOpen(!bottomOpen) }
      else if (id === 'workbench.console' || id === 'workbench.problems' || id === 'workbench.debugger') { bottomPinned.current = true; setTool(id === 'workbench.console' ? 'console' : id === 'workbench.problems' ? 'problems' : 'debugger'); setBottomOpen(true) }
      else if (id === 'workbench.inspector') setInspectorHidden((value) => !value)
      else if (id === 'workbench.runtimeFocus') toggleRuntimeFocus()
      else if (id === 'workbench.returnLive') setTimelineLens('LIVE')
      else if (id === 'workbench.launch') setShowLaunch(true)
      else if (id === 'workbench.symbols') setShowSymbols(true)
      else if (id === 'workbench.jdk') setShowJdk((value) => !value)
      else if (id === 'workbench.restartJava') await languageClient.restart()
      else if (id === 'workbench.importProject') importRef.current?.click()
      else if (id === 'workbench.newProject') setProjectDialog({ kind: 'project', path: '', value: 'New Java Project' })
    },
  }
  const shellAvailability = (id: ShellCommandId) => {
    const activeSession = executionRef.current && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(executionRef.current.phase)
    if (id.startsWith('execution.') && busy) return { enabled: false as const, reason: 'Wait for the current operation' }
    if (['execution.run', 'execution.runWithoutVisualization'].includes(id) && !jdk?.available) return { enabled: false as const, reason: 'Configure a JDK first' }
    if (id === 'execution.stop' && !activeSession) return { enabled: false as const, reason: 'No active execution' }
    if (['workbench.inspector', 'workbench.runtimeFocus', 'workbench.returnLive'].includes(id) && !visualization) return { enabled: false as const, reason: 'Run Java to record a runtime world' }
    if (id === 'workbench.inspector' && !runtimeSelection) return { enabled: false as const, reason: 'Select a runtime entity first' }
    if (id === 'workbench.symbols' && languageSnapshot.status !== 'ready') return { enabled: false as const, reason: 'Java language service is not ready' }
    return { enabled: true as const }
  }
  const commandSnapshot = commandHost.current.snapshot
  const shellAvailabilitySnapshot = Object.fromEntries(Object.keys(ideCommandDefinitions).filter((id) => id.startsWith('execution.') || id.startsWith('workbench.') && !['workbench.quickOpen', 'workbench.commandPalette'].includes(id)).map((id) => [id, shellAvailability(id as ShellCommandId)]))
  commandHost.current.snapshot = () => ({ ...commandSnapshot(), shellAvailability: shellAvailabilitySnapshot })
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
  const toggleRuntimeFocus = () => {
    setRuntimeExpanded(!runtimeExpanded)
    setFocusSourceOpen(false)
    // Immersive inspection reserves the viewport for geometry. Pending input
    // and failure/debug inspection stay reachable; Console can always reopen.
    if (!runtimeExpanded && tool === 'console' && execution?.phase !== 'WAITING_FOR_INPUT') setBottomOpen(false)
  }
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
      if (projectDialog || picker || tabMenu || showLaunch || showSymbols || event.target instanceof HTMLElement && event.target.closest('.ide-workspace-menu')) return
      if (event.key === 'Escape' && runtimeExpanded && !pending && !(event.target instanceof HTMLElement && event.target.closest('.monaco-editor'))) { setRuntimeExpanded(false); setFocusSourceOpen(false); return }
      if (pending) return
      if (!event.defaultPrevented) {
        const editorFocused = event.target instanceof HTMLElement && !!event.target.closest('.monaco-editor')
        const canonical = Object.values(ideCommandDefinitions).find((definition) => (definition.scope !== 'editor' || editorFocused) && definition.bindings.some((binding) => matchesShortcut(event, binding, platform)))
        if (canonical) {
          event.preventDefault(); event.stopPropagation()
          if ((!busy || canonical.id === 'workbench.quickOpen' || canonical.id === 'workbench.commandPalette') && commands.availability(canonical.id, commandContext()).enabled) invoke(canonical.id, {})
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
  return <div className={`ide-shell ide-shell--spatial ide-shell--${workspaceMode} ${sourceOpen ? '' : 'ide-shell--source-collapsed'} ${explorerOpen ? 'ide-shell--explorer-open' : ''} ${bottomOpen ? 'ide-shell--bottom-open' : ''} ${focusSourceOpen ? 'ide-shell--focus-source-open' : ''} ${runtimeExpanded ? 'ide-shell--runtime-expanded' : ''} ${debugSession && ['running', 'paused'].includes(debugSession.status) ? 'ide-shell--debug-active' : ''} ${tool === 'errors' || tool === 'debugger' ? 'ide-shell--debug-inspection' : ''}`} ref={shellRef} style={{ '--ide-project-width': `${projectWidth}%`, '--ide-editor-width': `${editorWidth}%`, '--ide-bottom-height': `${bottomHeight}%` } as React.CSSProperties}>
    <header className="ide-topbar">
      <div className="ide-brand"><span className="ide-mark"><Code2 size={18}/></span><strong>Visual Java</strong></div>
      <button className="ide-command-search" onClick={() => invoke('workbench.commandPalette', {})} disabled={!projectId} title="Search commands"><Search size={14}/><span>{projectId ? projects.find((item) => item.id === projectId)?.name ?? 'Java workspace' : 'Open Project'}</span><kbd>{formatShortcut(ideCommandDefinitions['workbench.commandPalette'].bindings[0], platform)}</kbd></button>
      <button className="ide-jdk-badge" onClick={() => invoke('workbench.jdk', {})} aria-label="Configure JDK" title={jdk?.version ? `JDK ${jdk.version}` : jdk?.error ?? 'Detecting JDK'}>{jdk?.available ? `Java ${jdk.version ?? ''}`.trim() : 'JDK unavailable'}</button>
      <div className="ide-top-actions">
        {targets.length > 1 && <select aria-label="Main class" value={mainClass} onChange={(event) => { mainClassRef.current = event.target.value; setMainClass(event.target.value) }}><option value="">First runnable main</option>{targets.map((name) => <option key={name}>{name}</option>)}</select>}
        <button className="ide-primary" onClick={runProject} disabled={!projectId || busy || !jdk?.available || activeExecution} title={`Run (${formatShortcut(ideCommandDefinitions['execution.run'].bindings[0], platform)})`}><CirclePlay size={15}/> Run</button>
        <button className="ide-debug-action" onClick={debugProject} disabled={!projectId || busy || !jdk?.available || activeExecution} title="Start Debug (F5)"><Bug size={15}/> Debug</button>
        <button className="ide-stop-action" onClick={stopRun} disabled={busy || !activeExecution} title={`Stop (${formatShortcut(ideCommandDefinitions['execution.stop'].bindings[0], platform)})`}><Square size={13}/> Stop</button>
        <button className="ide-launch-action" onClick={() => invoke('workbench.launch', {})} disabled={!projectId || busy} title="Launch settings" aria-label="Launch settings"><ChevronRight size={14}/></button>
      </div>
    </header>
    {showJdk && <div className="ide-jdk"><label>JDK home <input value={jdkInput} placeholder="Auto-detect from PATH" onChange={(event) => setJdkInput(event.target.value)} /></label><button onClick={() => action(async () => setJdk(await bridge.detectJdk(jdkInput || null)))}>Use JDK</button><span>{jdk?.error}</span></div>}
    {debugSession && activeExecution && <div className="debug-toolbar" aria-label="JVM debugger controls">
      <span className="debug-live-state">{execution?.phase === 'PAUSED' ? `Paused · ${debugSession.pause?.reason ?? 'checkpoint'}` : 'Debugging'}</span>
      {execution?.phase === 'PAUSED' ? <><button onClick={() => debugCommand('continue')} disabled={busy} title="Continue (F5)">Continue</button><button onClick={() => debugCommand('stepOver')} disabled={busy} title="Step Over (F10)">Step Over</button><button onClick={() => debugCommand('stepInto')} disabled={busy} title="Step Into (F11)">Step Into</button><button onClick={() => debugCommand('stepOut')} disabled={busy} title="Step Out (Shift+F11)">Step Out</button></>
        : <button onClick={() => debugCommand('pause')} disabled={busy || execution?.phase !== 'RUNNING'} title="Pause at next project source boundary">Pause</button>}
      <button onClick={() => invoke('workbench.debugger', {})}>Inspect</button>
    </div>}
    <div className="ide-main" ref={contentRef}>
      <nav className="ide-activity-rail" aria-label="Workspace views">
        <button onClick={() => invoke('workbench.explorer', {})} aria-label={explorerOpen ? 'Hide project explorer' : 'Show project explorer'} aria-pressed={explorerOpen} title="Explorer"><Files size={19}/></button>
        <button onClick={() => invoke('workbench.quickOpen', {})} disabled={!projectId} aria-label="Quick Open" title={`Quick Open (${formatShortcut(ideCommandDefinitions['workbench.quickOpen'].bindings[0], platform)})`}><Search size={19}/></button>
        <button onClick={() => invoke('workbench.debugger', {})} disabled={!projectId} aria-label="Run and Debug" aria-pressed={tool === 'debugger' && bottomOpen} title="Run & Debug"><Bug size={19}/></button>
        <button onClick={() => invoke('workbench.problems', {})} disabled={!projectId} aria-label="Show Problems" aria-pressed={tool === 'problems' && bottomOpen} title={`Problems · ${problems.length}`}><CircleAlert size={19}/>{problems.length > 0 && <span className="ide-activity-count">{problems.length}</span>}</button>
        <span className="ide-activity-spacer"/>
        <button onClick={() => invoke('workbench.source', {})} disabled={!projectId} aria-label={runtimeExpanded ? focusSourceOpen ? 'Hide source drawer' : 'Show source drawer' : sourceOpen ? 'Hide source' : 'Show source'} aria-pressed={runtimeExpanded ? focusSourceOpen : sourceOpen} title="Source"><Code2 size={19}/></button>
        <button onClick={() => invoke('workbench.console', {})} disabled={!projectId} aria-label="Show Console" aria-pressed={tool === 'console' && bottomOpen} title="Console"><Terminal size={19}/></button>
      </nav>
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
      {!projectId ? <section className="ide-first-use" aria-labelledby="ide-first-use-title"><div className="ide-first-use-content">
        <span>VISUAL JAVA</span><h1 id="ide-first-use-title">Open Project</h1>
        <p>Choose a managed project, import a folder copy, or create a new Java project.</p>
        {projects.length > 0 && <label>Managed projects<select aria-label="Open existing project" value="" disabled={busy} onChange={(event) => void action(() => switchProject(event.target.value))}><option value="" disabled>Choose a project</option>{projectOptions}</select></label>}
        <div className="ide-first-use-actions"><button type="button" onClick={() => invoke('workbench.importProject', {})}><Upload size={15}/> Import folder (copy)</button><button type="button" className="ide-primary" onClick={() => invoke('workbench.newProject', {})}><Plus size={15}/> New Project</button></div>
        <small>Imported folders become managed copies; originals stay in place.</small>
      </div></section> : <section className="ide-code-workspace">
        <div className="ide-upper" ref={upperRef}>
          <div className="ide-editor-panel">
            <div className="ide-source-heading"><span>SOURCE</span><span className="ide-panel-actions"><button onClick={() => invoke('file.save', {})} disabled={!activeTab || activeTab.draft === activeTab.content || busy} title="Save active file" aria-label="Save active file"><Save size={13}/></button><button onClick={() => invoke('workbench.edit', {})} aria-label="Expand source for editing" title="Expand source for editing"><Maximize2 size={13}/></button><button onClick={() => invoke('workbench.source', {})} aria-label={runtimeExpanded ? 'Close source drawer' : 'Collapse source'} title="Collapse source"><ChevronLeft size={15}/></button></span></div>
            <div className="ide-tabs" role="tablist">{tabs.map((tab) => <div key={tab.path} className={`ide-tab ${active === tab.path ? 'is-active' : ''}`} onContextMenu={(event) => { event.preventDefault(); const button = event.currentTarget.querySelector<HTMLButtonElement>('button'); button?.focus(); showTabMenu(tab.path, event.clientX, event.clientY) }} onKeyDown={(event) => { if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); showTabMenu(tab.path, rect.left, rect.bottom) } }} role="tab" aria-selected={active === tab.path}><button onClick={() => { activeRef.current = tab.path; setActive(tab.path); setRecordedView(null) }} title={tab.path}><span className="ide-java-icon">J</span>{filename(tab.path)}{tab.draft !== tab.content && <span className="ide-dirty"/>}</button><button aria-label={`Close ${tab.path}`} onClick={() => closeTab(tab.path)}><X size={13}/></button></div>)}</div>
            <div className="ide-editor-body">{recordedView ? <SourceEditor file={recordedView.file} location={recordedView.location} onChooseLine={() => {}}/> : activeTab ? <EditableJavaEditor key={`${projectId}:${activeTab.path}`} projectId={projectId} path={activeTab.path} value={activeTab.draft} onChange={(value) => edit(activeTab.path, value)} diagnostics={diagnostics} navigate={nav} executingLine={activeTab.path === mappedExecutingSource?.path ? mappedExecutingSource.line : null} pausedLine={debugSession?.status === 'paused' && runtime?.cursor === visualization?.trace.events.length && activeTab.path === mappedExecutingSource?.path ? mappedExecutingSource.line : null} breakpoints={displayedBreakpoints} onToggleBreakpoint={(line) => toggleBreakpoint(activeTab.path, line)} onSave={() => invoke('file.save', {}, activeTab.path)}/> : <div className="ide-editor-empty"><span>JAVA SOURCE</span><h2>Choose a file to edit</h2><p>Open a Java file from the project explorer, or create a new one.</p></div>}</div>
            <div className="ide-editor-foot"><span>{recordedView ? `Recorded source · ${recordedView.file.fileId}` : active || 'No file selected'}</span><span>Java · UTF-8 · {activeTab?.draft.split('\n').length ?? 0} lines</span></div>
          </div>
          <div className="ide-divider ide-divider--vertical" role="separator" aria-label="Resize runtime pane" tabIndex={0} {...divider('runtime')}/>
          <section className="ide-runtime-panel" aria-label="Runtime visualization area">
            <div className="ide-panel-heading"><span>RUNTIME</span>{previousRecording && <small role="status" aria-label="Previous recording" title="The current session has no verified runtime trace yet">Previous recording</small>}<div className="ide-runtime-heading-actions">
              {runtimeSelection && visualization && <button type="button" onClick={() => invoke('workbench.inspector', {})} aria-label="Toggle inspector" aria-pressed={!inspectorHidden} title={`Toggle inspector (${formatShortcut(ideShortcuts.inspector, platform)})`}><ScanEye size={14}/></button>}
              {(runtimeExpanded || !sourceOpen) && <button type="button" onClick={() => invoke('workbench.source', {})} aria-label={runtimeExpanded ? focusSourceOpen ? 'Hide source drawer' : 'Show source drawer' : 'Show source'} title="Toggle source"><Code2 size={14}/><span>Source</span></button>}
              {visualization && <button type="button" onClick={() => invoke('workbench.runtimeFocus', {})} aria-label={runtimeExpanded ? 'Restore IDE layout' : 'Expand runtime'} title={`${runtimeExpanded ? 'Restore IDE layout' : 'Focus runtime'} (${formatShortcut(ideShortcuts.focus, platform)})`}>{runtimeExpanded ? <><Minimize2 size={14}/><span>Exit Focus</span></> : <Maximize2 size={14}/>}</button>}
            </div></div>
            <div className={`ide-runtime-live${visualization ? '' : ' ide-runtime-live--idle'}`}>
              <App trace={visualization?.trace ?? idleTrace} embedded onSourceChange={recordingIsCurrent ? handleExecutingSource : undefined} onRuntimeChange={handleRuntimeChange} navigation={runtimeNavigation} suppressInspector={tool === 'errors' && bottomOpen || inspectorHidden} execution={visualization ? { phase: recordingIsCurrent ? execution!.phase : recordedPhase, lens: timelineLens, liveCursor: visualization.trace.events.length, onLensChange: (lens) => setTimelineLens(lens) } : undefined}/>
              {!visualization && <div className="ide-runtime-ready" aria-label="Runtime ready"><span>RUNTIME</span><strong>{execution?.phase === 'BUILDING' ? 'Building Java…' : execution?.phase === 'STARTING' ? 'Starting Java…' : 'Ready'}</strong><p>{execution?.support === 'RUN_ONLY' ? execution.supportReason ?? 'Console execution' : 'Run your Java program to enter the world.'}</p></div>}
            </div>
          </section>
        </div>
        <div className="ide-divider ide-divider--horizontal" role="separator" aria-label="Resize bottom panel" tabIndex={0} {...divider('bottom')}/>
        <section className="ide-bottom-panel">
          <div className="ide-tool-tabs"><button className="ide-bottom-toggle" onClick={() => invoke('workbench.tools', {})} aria-label={bottomOpen ? 'Collapse bottom panel' : 'Expand bottom panel'} title={`Toggle bottom panel (${formatShortcut(ideShortcuts.tools, platform)})`}><PanelBottom size={15}/></button>
            {availableTools.map((item) => <button key={item} className={tool === item && bottomOpen ? 'is-active' : ''} onClick={() => { bottomPinned.current = true; setBottomOpen(true); setTool(item); if (item === 'errors' || item === 'debugger') setBottomHeight(35) }}>{item === 'errors' ? 'ERROR EXPLORER' : item.toUpperCase()}{item === 'problems' && problems.length > 0 && <span className="ide-badge">{problems.length}</span>}</button>)}
            <span className="ide-status-spacer"/>
          </div>
          {tool === 'debugger' ? <DebugPanel session={debugSession} runtime={runtime} breakpoints={displayedBreakpoints} onInspect={(selection) => navigateRuntime(runtime?.cursor ?? 0, selection)} onRemove={removeBreakpoint}/>
          : tool === 'errors' ? recordingIsCurrent ? <ErrorExplorer key={visualization.trace.demoId} trace={visualization.trace} runtime={runtime} selection={runtimeSelection} stderr={execution?.stderr ?? ''} onNavigate={navigateRuntime}/> : <div className="debug-empty">{exception ? <><strong>{exception.type}: {exception.message}</strong><pre>{exception.rawStackTrace}</pre></> : <p>No recorded exception.</p>}</div>
          : tool === 'problems' ? <ProblemsPanel build={build} language={languageProblems} onOpen={openDiagnostic}/>
          : <div className="ide-console">
            <div className="ide-console-output" ref={consoleRef} aria-label="Program console">
              {build?.rawOutput && !build.success && <pre className="ide-console-stderr">{build.rawOutput}</pre>}
              {recordingIsCurrent && execution?.recording && execution.recording.state !== 'FULL' ? <><p className="ide-empty">{execution.outputTruncated ? 'Retained process output' : 'Full process output'} · visualization partial{execution.exitCode !== null ? ` · Java exit code ${execution.exitCode}` : ''}</p><pre className="ide-console-full-stdout">{execution.stdout}</pre><pre className="ide-console-full-stderr">{execution.stderr}</pre></> : recordingIsCurrent && <>{runtime?.console.map((entry) => <pre key={entry.eventId} className={entry.kind === 'input' ? 'ide-console-stdin' : entry.channel === 'stderr' ? 'ide-console-stderr' : 'ide-console-stdout'}>{entry.kind === 'input' ? `› ${entry.text}` : entry.text}</pre>)}
                <details className="ide-console-terminal"><summary title={execution?.outputTruncated ? execution.outputArchiveAvailable ? 'Inline console retention limit reached; Java continued. Complete process output is available as files' : 'Inline console retention limit reached; Java continued. Complete archive unavailable' : 'Process-pipe output is complete; its order relative to recorder events cannot be proven'}>{execution?.outputTruncated ? 'Retained process output' : 'Full process output'}</summary><pre className="ide-console-full-stdout">{execution?.stdout}</pre><pre className="ide-console-full-stderr">{execution?.stderr}</pre></details></>}
              {!recordingIsCurrent && allEvents.map((event) => <pre key={event.id} className={`ide-console-${event.kind}`}>{event.kind === 'exit' ? event.signal ? `Process stopped (${event.signal})` : `Process finished with exit code ${event.exitCode ?? '—'}` : event.kind === 'stdin' ? `› ${event.text}` : event.text}</pre>)}
              {!recordingIsCurrent && execution?.stdout && !allEvents.length && <pre className="ide-console-stdout">{execution.stdout}</pre>}
              {!recordingIsCurrent && execution?.stderr && !allEvents.length && <pre className="ide-console-stderr">{execution.stderr}</pre>}
              {exception && <div className="ide-stack"><strong>{exception.type}: {exception.message}</strong><details><summary>Raw JVM stack trace</summary><pre>{exception.rawStackTrace}</pre></details>{exception.frames.map((frame, index) => <button key={index} disabled={!frame.location} onClick={() => frame.location && handleExecutingSource({ fileId: frame.location.path, line: frame.location.line })}>{frame.raw}</button>)}</div>}
              {execution?.outputTruncated && <p className="ide-empty">Inline console retention limit reached; Java continued. {execution.outputArchiveAvailable ? <><a href={`/api/execution/${execution.id}/output/stdout`} download>Download complete stdout</a> · <a href={`/api/execution/${execution.id}/output/stderr`} download>Download complete stderr</a></> : 'Complete output archive unavailable.'}</p>}
              {execution?.outputArchiveError && <p className="ide-empty">Process output archive failed: {execution.outputArchiveError}. Java execution continued.</p>}
              {!execution && !build?.rawOutput && <p className="ide-empty">Program output appears here when you run Java.</p>}
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
      {recordingIsCurrent && <details className="ide-support-detail"><summary>Capture limits</summary><p>Recording stops at 20,000 raw events, 8 MiB, 256 identities or 128 live frames; Java continues. The 30-second active watchdog excludes input waits and Debug pauses; a 10-minute hard safety deadline applies in all states. Project code is recorded. Primitive and reference arrays have bounded summaries; class statics are available in the inspector. Library internals are collapsed. — means unavailable. Values and effects are last observed; changes outside recorded code may be absent.{visualization.capability.diagnostics.length > 0 && <><br/>{visualization.capability.diagnostics.slice(0, 3).join(' · ')}</>}</p></details>}
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
