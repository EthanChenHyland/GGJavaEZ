import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CirclePlay, Code2, Files, FolderOpen, Hammer, Maximize2, Minimize2, PanelBottom, Plus, Save, ScanEye, Search, Settings2, Square, Upload, X } from 'lucide-react'
import { App, type RuntimeNavigation } from '../app/App'
import type { RuntimeState, SourceLocation as RuntimeSourceLocation, TraceDocument } from '../contracts/runtime'
import type { Selection } from '../contracts/interaction'
import { normalizeTrace } from '../instrumentation/normalize'
import { validateTrace } from '../runtime/trace'
import type { DebugCommand, DebugSession, ResolvedBreakpoint, SourceBreakpoint } from '../debugger/contracts'
import { DebugPanel } from '../debugger/DebugPanel'
import { ErrorExplorer } from '../debugger/ErrorExplorer'
import type { RawRuntimeEvent, VisualizationCapabilityReport } from '../instrumentation/contracts'
import { bridge } from './client'
import type { ExecutionSession, TimelineLens } from '../execution/contracts'
import { EditableJavaEditor } from './EditableJavaEditor'
import { ProblemsPanel } from './ProblemsPanel'
import { LaunchDialog } from './LaunchDialog'
import { SymbolSearch } from './SymbolSearch'
import { defaultLaunch, type JavaProject, type LaunchConfiguration } from './javaProject'
import { LanguageClient } from '../language/client'
import { documentPath, type LanguageSnapshot, type LspWorkspaceEdit } from '../language/protocol'
import { registerJavaIntelligence } from '../language/monaco'
import { applyWorkspaceEdit, type WorkspaceEditHost } from '../language/workspaceEdit'
import { mergeProblems } from './problems'
import { ProjectExplorer, type TreeAction } from './ProjectExplorer'
import { currentPlatform, formatShortcut, ideShortcuts, matchesShortcut } from './shortcuts'
import * as monacoApi from 'monaco-editor/editor/editor.api.js'
import type { BuildResult, CompileDiagnostic, JdkStatus, ProjectEntry, ProjectFile, ProjectSummary, SourceLocation } from './contracts'
import './ide.css'

type Tab = ProjectFile & { draft: string }
type Tool = 'console' | 'problems' | 'debugger' | 'errors'
type WorkspaceMode = 'code' | 'visualize' | 'debug'
type PendingDecision = { label: string; paths: string[]; action: () => void | Promise<void> } | null
type ProjectDialog = { kind: 'class' | 'file' | 'folder' | 'rename' | 'delete' | 'project'; path: string; value: string } | null
const draftKey = (id: string, path: string) => `ggjavaez:draft:${id}:${path}`
const sessionKey = (id: string) => `ggjavaez:session:${id}`
const breakpointKey = (id: string) => `ggjavaez:breakpoints:${id}`
const launchKey = (id: string) => `ggjavaez:launch:${id}`
const widthKey = 'ggjavaez:m8:editor-widths'
const defaultEditorWidths: Record<WorkspaceMode, number> = { code: 64, visualize: 30, debug: 35 }
const idleTrace: TraceDocument = { schemaVersion: 2, demoId: 'ide:ready', sourceFiles: [], events: [] }
function savedEditorWidths(): Record<WorkspaceMode, number> {
  try {
    const saved = JSON.parse(localStorage.getItem(widthKey) ?? '{}')
    return Object.fromEntries(Object.entries(defaultEditorWidths).map(([mode, fallback]) => [mode, typeof saved[mode] === 'number' && saved[mode] >= 24 && saved[mode] <= 80 ? saved[mode] : fallback])) as Record<WorkspaceMode, number>
  } catch { return { ...defaultEditorWidths } }
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
const filename = (path: string) => path.split('/').at(-1) || path
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

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
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('code')
  const [explorerOpen, setExplorerOpen] = useState(() => !window.matchMedia('(max-width: 900px)').matches && localStorage.getItem('ggjavaez:m8:explorer') !== 'closed')
  const [inspectorHidden, setInspectorHidden] = useState(false)
  const [bottomOpen, setBottomOpen] = useState(false)
  const [focusSourceOpen, setFocusSourceOpen] = useState(false)
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
  const [visualization, setVisualization] = useState<{ trace: TraceDocument; capability: VisualizationCapabilityReport; rawEvents: RawRuntimeEvent[]; status: string; stdout: string; stderr: string; diagnostic: string | null } | null>(null)
  const [runtimeExpanded, setRuntimeExpanded] = useState(false)
  const [executingSource, setExecutingSource] = useState<RuntimeSourceLocation | null>(null)
  const [breakpoints, setBreakpoints] = useState<ResolvedBreakpoint[]>([])
  const [runtime, setRuntime] = useState<RuntimeState | null>(null)
  const [runtimeSelection, setRuntimeSelection] = useState<Selection>(null)
  const [runtimeNavigation, setRuntimeNavigation] = useState<RuntimeNavigation | null>(null)
  const executionRevision = useRef(-1)
  const activeExecutionId = useRef<string | null>(null)
  const shownFailure = useRef(false)
  const normalizedSignature = useRef('')
  const userLayoutOverride = useRef(false)
  const [projectWidth, setProjectWidth] = useState(14)
  const [initialEditorWidths] = useState(savedEditorWidths)
  const modeEditorWidths = useRef(initialEditorWidths)
  const [editorWidth, setEditorWidth] = useState(modeEditorWidths.current.code)
  const [bottomHeight, setBottomHeight] = useState(29)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [platform] = useState(currentPlatform)
  const shellRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const upperRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
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

  const activeTab = tabs.find((tab) => tab.path === active)
  const dirty = tabs.some((tab) => tab.draft !== tab.content)
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
  const traceStale = !!visualization && tabs.some((tab) => visualization.trace.sourceFiles.find((file) => file.fileId === tab.path)?.content !== tab.draft)

  const fail = (error: unknown) => setNotice(errorText(error))
  const enterMode = (mode: WorkspaceMode) => {
    modeEditorWidths.current[workspaceMode] = editorWidth
    setWorkspaceMode(mode)
    setEditorWidth(modeEditorWidths.current[mode])
    if (mode === 'code') setBottomOpen(false)
    if (mode === 'visualize') { setBottomOpen(false); setExplorerOpen(false) }
    if (mode === 'debug') { setBottomOpen(false); setExplorerOpen(false) }
    setRuntimeExpanded(false)
    setFocusSourceOpen(false)
  }
  const toggleExplorer = () => {
    userLayoutOverride.current = true
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
  useEffect(() => { modeEditorWidths.current[workspaceMode] = editorWidth; localStorage.setItem(widthKey, JSON.stringify(modeEditorWidths.current)) }, [workspaceMode, editorWidth])
  const refreshTree = useCallback(async (id: string) => setTree(await bridge.tree(id)), [])

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
    return () => previous?.focus()
  }, [projectDialog?.kind])

  const openFile = useCallback(async (id: string, path: string, location?: SourceLocation) => {
    if (!path) return
    if (!tabsRef.current.some((tab) => tab.path === path)) {
      const file = await bridge.file(id, path)
      setTabs((current) => current.some((tab) => tab.path === path) ? current : [...current, hydratedTab(id, file)])
    }
    setActive(path)
    if (location) setNav({ ...location })
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
        setTabs((current) => {
          const updated = current.map((tab) => byPath.has(tab.path) ? { ...tab, draft: byPath.get(tab.path)!.content } : tab)
          for (const change of changes) if (!current.some((tab) => tab.path === change.path)) {
            updated.push({ ...loaded.get(change.path)!, draft: change.content })
          }
          return updated
        })
      },
    }
    const registered = registerJavaIntelligence(monacoApi, {
      client: languageClient,
      onOpen: (location) => openFile(projectIdRef.current, location.path, location),
      applyEdit: (edit: LspWorkspaceEdit) => applyWorkspaceEdit(monacoApi, languageClient, edit, host),
      onError: setNotice,
    })
    return () => registered.dispose()
  }, [languageClient, openFile])

  const switchProject = useCallback(async (nextId: string, stopExisting = true) => {
    if (stopExisting) {
      const current = await bridge.executionCurrent()
      if (current && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(current.phase)) await bridge.executionStop(current.id)
    }
    setProjectId(nextId)
    setTabs([])
    setActive('')
    setBuild(null)
    setExecution(null); setTimelineLens('LIVE'); activeExecutionId.current = null
    setVisualization(null)
    setWorkspaceMode('code')
    setEditorWidth(modeEditorWidths.current.code)
    setBottomOpen(false); setFocusSourceOpen(false)
    setRuntimeExpanded(false)
    setExecutingSource(null)
    setRuntime(null); setRuntimeSelection(null); setRuntimeNavigation(null)
    executionRevision.current = -1; shownFailure.current = false; normalizedSignature.current = ''; userLayoutOverride.current = false
    try {
      const stored = JSON.parse(localStorage.getItem(breakpointKey(nextId)) ?? '[]')
      setBreakpoints(Array.isArray(stored) ? stored.filter((point) => typeof point.fileId === 'string' && Number.isInteger(point.line) && point.line > 0).map((point) => ({ fileId: point.fileId, line: point.line, status: 'pending', reason: null })) : [])
    } catch { setBreakpoints([]) }
    let savedLaunch = defaultLaunch
    try {
      const saved = JSON.parse(localStorage.getItem(launchKey(nextId)) ?? 'null')
      if (saved && typeof saved.mainClass === 'string' && typeof saved.workingDirectory === 'string' && Array.isArray(saved.programArgs) && Array.isArray(saved.jvmArgs) && [...saved.programArgs, ...saved.jvmArgs].every((arg) => typeof arg === 'string')) savedLaunch = saved
    } catch { /* Invalid settings use the beginner defaults. */ }
    setLaunch(savedLaunch); setMainClass(savedLaunch.mainClass); setShowLaunch(false); setShowSymbols(false)
    setJavaProject(null); setProjectStatus('Resolving Java project…')
    void bridge.javaProject(nextId).then((model) => {
      if (projectIdRef.current !== nextId) return
      setJavaProject(model); setProjectStatus(model.status === 'ready' ? model.buildSystem === 'plain' ? 'Plain Java' : model.buildSystem === 'maven' ? 'Maven' : 'Gradle' : model.diagnostic ?? 'Project unavailable')
    }).catch((error) => { if (projectIdRef.current === nextId) setProjectStatus(errorText(error)) })
    setNav(null)
    setHydrated(false)
    localStorage.setItem('ggjavaez:project', nextId)
    const nextTree = await bridge.tree(nextId)
    setTree(nextTree)
    const files = flatten(nextTree).filter((item) => item.kind === 'file')
    let previous: { paths?: string[]; active?: string } = {}
    try { previous = JSON.parse(localStorage.getItem(sessionKey(nextId)) || '{}') } catch { /* malformed session */ }
    const savedPaths = (previous.paths ?? []).filter((path) => files.some((file) => file.path === path))
    const paths = savedPaths.length ? savedPaths : [files.find((file) => file.path === 'Main.java')?.path ?? files.find((file) => file.path.endsWith('.java'))?.path].filter((path): path is string => !!path)
    const opened = await Promise.all(paths.map(async (path) => hydratedTab(nextId, await bridge.file(nextId, path))))
    setTabs(opened)
    setActive(paths.includes(previous.active ?? '') ? previous.active! : paths[0] ?? '')
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated && projectId) localStorage.setItem(sessionKey(projectId), JSON.stringify({ paths: tabs.map((tab) => tab.path), active }))
  }, [hydrated, projectId, tabs, active])
  useEffect(() => {
    if (hydrated && projectId) localStorage.setItem(launchKey(projectId), JSON.stringify({ ...launch, mainClass }))
  }, [hydrated, projectId, launch, mainClass])

  useEffect(() => {
    let alive = true
    Promise.all([bridge.projects(), bridge.health(), bridge.executionCurrent()]).then(async ([items, health, current]) => {
      if (!alive) return
      setProjects(items)
      setJdk(health.jdk)
      setJdkInput(health.jdk.home ?? '')
      const chosen = items.find((item) => item.id === localStorage.getItem('ggjavaez:project')) ?? items[0]
      if (chosen) await switchProject(chosen.id, false)
      if (current && current.projectId === chosen?.id) { activeExecutionId.current = current.id; acceptExecution(current) }
      else if (current && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(current.phase)) await bridge.executionStop(current.id)
    }).catch(fail)
    return () => { alive = false }
    // Initial hydration deliberately runs once.
  }, [])

  useEffect(() => {
    eventSourceRef.current?.close()
    if (!execution?.id) return
    const source = bridge.executionEvents(execution.id, acceptExecution)
    eventSourceRef.current = source
    return () => source.close()
  }, [execution?.id])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (tabsRef.current.some((tab) => tab.draft !== tab.content)) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  const edit = (path: string, draft: string) => {
    setTabs((current) => current.map((tab) => tab.path === path ? { ...tab, draft } : tab))
    if (projectId) {
      try { localStorage.setItem(draftKey(projectId, path), JSON.stringify({ draft, revision: tabsRef.current.find((tab) => tab.path === path)?.revision })) }
      catch { setNotice('Browser draft storage is full. Save your changes before leaving this page.') }
    }
  }

  const saveTab = async (tab: Tab) => {
    if (!projectId || tab.draft === tab.content) return
    const saved = await bridge.save(projectId, tab.path, tab.draft, tab.revision)
    void languageClient.saveDocument(tab.path, saved.content).catch(() => {})
    setTabs((current) => current.map((item) => item.path === tab.path ? { ...item, content: saved.content, revision: saved.revision } : item))
    const latestDraft = tabsRef.current.find((item) => item.path === tab.path)?.draft
    if (latestDraft === saved.content) localStorage.removeItem(draftKey(projectId, tab.path))
    else if (latestDraft !== undefined) localStorage.setItem(draftKey(projectId, tab.path), JSON.stringify({ draft: latestDraft, revision: saved.revision }))
  }
  const saveAll = async () => {
    for (const tab of tabsRef.current) await saveTab(tab)
  }
  const requestDecision = (label: string, paths: string[], continuation: () => void | Promise<void>) => {
    const changed = tabsRef.current.filter((tab) => paths.includes(tab.path) && tab.draft !== tab.content).map((tab) => tab.path)
    if (changed.length) setPending({ label, paths: changed, action: continuation })
    else void Promise.resolve(continuation()).catch(fail)
  }
  const resolveDecision = async (choice: 'save' | 'discard' | 'cancel') => {
    if (!pending) return
    if (choice === 'cancel') { setPending(null); return }
    setBusy(true)
    try {
      if (choice === 'save') for (const tab of tabsRef.current.filter((item) => pending.paths.includes(item.path))) await saveTab(tab)
      else pending.paths.forEach((path) => localStorage.removeItem(draftKey(projectId, path)))
      const next = pending.action
      setPending(null)
      await next()
    } catch (error) { fail(error) } finally { setBusy(false) }
  }
  const closeTab = (path: string) => requestDecision(`closing ${filename(path)}`, [path], () => {
    const rest = tabsRef.current.filter((item) => item.path !== path)
    setTabs(rest)
    if (active === path) setActive(rest.at(-1)?.path ?? '')
  })
  const action = async (work: () => Promise<void>) => {
    setBusy(true)
    setNotice('')
    try { await work() } catch (error) { fail(error) } finally { setBusy(false) }
  }
  const buildProject = () => action(async () => {
    enterMode('code')
    await saveAll()
    const result = await bridge.build(projectId)
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
  const acceptExecution = useCallback((session: ExecutionSession) => {
    if (activeExecutionId.current && activeExecutionId.current !== session.id) return
    if (session.projectId !== projectIdRef.current || session.revision <= executionRevision.current) return
    executionRevision.current = session.revision
    setExecution(session)
    if (session.build) {
      setBuild(session.build)
      if (session.build.javaProject) setJavaProject(session.build.javaProject)
      setMainClass(session.mainClass ?? session.build.mainClasses[0] ?? '')
    }
    if (session.kind === 'debug' && session.phase !== 'BUILDING') setBreakpoints(session.breakpoints)
    const signature = `${session.id}:${session.rawEvents.length}:${session.terminalStatus ?? 'live'}`
    if (session.rawEvents.length && session.build?.success && signature !== normalizedSignature.current) {
      normalizedSignature.current = signature
      const normalized = normalizeTrace(session.rawEvents, session.sourceManifest, {
        status: session.terminalStatus ?? 'live', exitCode: session.exitCode, diagnostic: session.diagnostic,
        ...(session.capability ? { capability: session.capability } : {}),
      }, `execution:${session.id}`)
      const trace = validateTrace(normalized.trace, { allowLive: session.terminalStatus === null })
      trace.capture = { origin: 'jvm', sourceHashes: Object.fromEntries(session.sourceManifest.sources.map((file) => [file.fileId, file.sha256])), recordedAt: session.startedAt }
      setVisualization({ trace, capability: normalized.capability, rawEvents: session.rawEvents,
        status: session.terminalStatus ?? session.phase, stdout: session.stdout, stderr: session.stderr, diagnostic: session.diagnostic })
      if (!userLayoutOverride.current) {
        const emphasis = session.kind === 'debug' ? 'debug' : 'visualize'
        setWorkspaceMode(emphasis)
        setEditorWidth(modeEditorWidths.current[emphasis])
        setExplorerOpen(false)
      }
      if (session.phase === 'PAUSED' && session.pause?.reason === 'exception') { setTool('errors'); setBottomOpen(true); setBottomHeight(35) }
      if (session.phase === 'FAILED' && trace.events.some((event) => event.type === 'THROW_EXCEPTION') && !shownFailure.current) {
        shownFailure.current = true; setTool('errors'); setBottomOpen(true); setBottomHeight(35)
      }
    } else if (session.phase === 'FAILED' && session.failureKind === 'build') {
      setTool('problems'); setBottomOpen(true); setNotice(session.diagnostic ?? 'Compilation failed')
    } else if (session.support === 'RUN_ONLY' && ['RUNNING', 'WAITING_FOR_INPUT', 'COMPLETED'].includes(session.phase)) {
      setTool('console'); setBottomOpen(true)
    }
    if (session.phase === 'WAITING_FOR_INPUT') { setTool('console'); setBottomOpen(true) }
  }, [])
  const startExecution = (kind: 'run' | 'debug', withoutVisualization = false) => action(async () => {
    await saveAll()
    eventSourceRef.current?.close(); activeExecutionId.current = 'pending'
    setTimelineLens('LIVE'); setExecutingSource(null); setNotice('')
    executionRevision.current = -1; shownFailure.current = false; normalizedSignature.current = ''
    if (!userLayoutOverride.current) { setWorkspaceMode('code'); setEditorWidth(modeEditorWidths.current.code) }
    const session = await bridge.executionStart(projectId, { ...launch, kind, mainClass, breakpoints, withoutVisualization })
    activeExecutionId.current = session.id
    acceptExecution(session)
  })
  const runProject = () => startExecution('run')
  const debugProject = () => startExecution('debug')
  const debugCommand = (command: DebugCommand) => action(async () => {
    if (execution?.kind === 'debug') acceptExecution(await bridge.executionCommand(execution.id, command))
  })
  const toggleBreakpoint = (fileId: string, line: number) => {
    const next: ResolvedBreakpoint[] = breakpoints.some((point) => point.fileId === fileId && point.line === line)
      ? breakpoints.filter((point) => point.fileId !== fileId || point.line !== line)
      : [...breakpoints, { fileId, line, status: 'pending', reason: null }]
    setBreakpoints(next); localStorage.setItem(breakpointKey(projectId), JSON.stringify(next.map(({ fileId, line }) => ({ fileId, line }))))
    if (execution?.kind === 'debug' && ['STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(execution.phase)) void bridge.executionBreakpoints(execution.id, next).then(acceptExecution).catch(fail)
  }
  const removeBreakpoint = (point: SourceBreakpoint) => toggleBreakpoint(point.fileId, point.line)
  const handleExecutingSource = useCallback((location: RuntimeSourceLocation | null) => {
    setExecutingSource(location)
    if (!location || location.fileId === activeRef.current || requestedSourceRef.current === location.fileId) return
    const id = projectIdRef.current
    requestedSourceRef.current = location.fileId
    void openFile(id, location.fileId).catch(fail).finally(() => { requestedSourceRef.current = '' })
  }, [openFile])
  const stopRun = () => action(async () => { if (execution) acceptExecution(await bridge.executionStop(execution.id)) })
  const sendInput = () => action(async () => {
    if (!execution) return
    await bridge.executionInput(execution.id, input + '\n')
    setInput('')
  })
  const newEntry = (kind: 'file' | 'folder' | 'class', parent = '') => {
    const directory = parent === '.' ? '' : parent.replace(/\/$/, '')
    const sourceRoot = javaProject?.sourceRoots[0] ?? 'src'
    const suggestion = directory ? `${directory}/${kind === 'class' ? 'NewClass.java' : kind === 'file' ? 'new-file.txt' : 'new-folder'}` : kind === 'class' ? `${sourceRoot === '.' ? '' : `${sourceRoot}/`}NewClass.java` : kind === 'file' ? 'src/Main.java' : 'src/new-folder'
    setProjectDialog({ kind, path: '', value: suggestion })
  }
  const renameEntry = (path: string) => setProjectDialog({ kind: 'rename', path, value: path })
  const deleteEntry = (path: string) => setProjectDialog({ kind: 'delete', path, value: path })
  const submitProjectDialog = () => action(async () => {
    if (!projectDialog) return
    const { kind, path } = projectDialog
    const value = projectDialog.value.trim()
    if (!value && kind !== 'delete') throw new Error('Enter a name or path.')
    if (kind === 'project') {
      const next = await bridge.createProject(value)
      setProjects(await bridge.projects())
      requestDecision('opening the new project', tabsRef.current.map((tab) => tab.path), () => switchProject(next.id))
    } else if (kind === 'class') {
      const name = filename(value).replace(/\.java$/, '')
      if (!value.endsWith('.java') || !/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error('A Java class needs a valid name ending in .java')
      const roots = (javaProject?.sourceRoots ?? []).filter((root) => root === '.' || value.startsWith(`${root}/`)).sort((a, b) => b.length - a.length)
      const relative = roots.length === 1 ? roots[0] === '.' ? value : value.slice(roots[0].length + 1) : ''
      const packageParts = relative.split('/').slice(0, -1)
      const packageName = packageParts.length && packageParts.every((part) => /^[A-Za-z_$][\w$]*$/.test(part)) ? `package ${packageParts.join('.')};\n\n` : ''
      await bridge.createFile(projectId, value, `${packageName}public class ${name} {\n}\n`)
      await openFile(projectId, value)
      await refreshTree(projectId)
    } else if (kind === 'file' || kind === 'folder') {
      if (kind === 'file') { await bridge.createFile(projectId, value); await openFile(projectId, value) }
      else await bridge.createFolder(projectId, value)
      await refreshTree(projectId)
    } else if (kind === 'rename') {
      if (value !== path) {
        const affected = tabsRef.current.filter((tab) => tab.path === path || tab.path.startsWith(`${path}/`))
        for (const tab of affected) await saveTab(tab)
        await bridge.rename(projectId, path, value)
        const mapPath = (item: string) => item === path || item.startsWith(`${path}/`) ? value + item.slice(path.length) : item
        setTabs((current) => current.map((tab) => ({ ...tab, path: mapPath(tab.path) })))
        setActive((current) => mapPath(current))
        affected.forEach((tab) => localStorage.removeItem(draftKey(projectId, tab.path)))
        await refreshTree(projectId)
      }
    } else if (kind === 'delete') {
      await bridge.delete(projectId, path)
      tabsRef.current.filter((tab) => tab.path === path || tab.path.startsWith(`${path}/`)).forEach((tab) => localStorage.removeItem(draftKey(projectId, tab.path)))
      setTabs((current) => current.filter((tab) => tab.path !== path && !tab.path.startsWith(`${path}/`)))
      if (active === path || active.startsWith(`${path}/`)) setActive('')
      await refreshTree(projectId)
    }
    setProjectDialog(null)
  })
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
  const openDiagnostic = (item: CompileDiagnostic) => action(async () => { await openFile(projectId, item.location.path, item.location) })
  const setDivider = (kind: 'project' | 'runtime' | 'bottom', clientX: number, clientY: number) => {
    userLayoutOverride.current = true
    if (kind === 'bottom') {
      const bounds = contentRef.current?.getBoundingClientRect()
      if (bounds) setBottomHeight(Math.max(16, Math.min(55, (bounds.bottom - clientY) / bounds.height * 100)))
    } else {
      const bounds = kind === 'project' ? shellRef.current?.getBoundingClientRect() : upperRef.current?.getBoundingClientRect()
      if (bounds) {
        const pct = (clientX - bounds.left) / bounds.width * 100
        if (kind === 'project') setProjectWidth(Math.max(13, Math.min(28, pct)))
        else setEditorWidth(Math.max(24, Math.min(80, pct)))
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
      else if (kind === 'runtime') setEditorWidth((value) => Math.max(24, Math.min(80, value + amount)))
      else setBottomHeight((value) => Math.max(16, Math.min(55, value - amount)))
    },
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => event.currentTarget.setPointerCapture(event.pointerId),
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setDivider(kind, event.clientX, event.clientY) },
  })
  const toggleTreeEntry = (path: string) => setCollapsed((previous) => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next })
  const revealEntry = (path: string) => {
    setExplorerOpen(true)
    setCollapsed((previous) => { const next = new Set(previous); const parts = path.split('/'); for (let i = 1; i < parts.length; i++) next.delete(parts.slice(0, i).join('/')); return next })
    window.setTimeout(() => Array.from(document.querySelectorAll<HTMLButtonElement>('.ide-tree-name')).find((button) => button.title === path)?.focus(), 0)
  }
  const treeAction = (kind: TreeAction, entry: ProjectEntry | null) => {
    const parent = entry?.kind === 'directory' ? entry.path : entry?.path.split('/').slice(0, -1).join('/') ?? ''
    if (kind === 'class' || kind === 'file' || kind === 'folder') void newEntry(kind, parent)
    else if (kind === 'rename' && entry) void renameEntry(entry.path)
    else if (kind === 'delete' && entry) void deleteEntry(entry.path)
    else if (kind === 'reveal' && entry) { revealEntry(entry.path); if (entry.kind === 'file') void action(() => openFile(projectId, entry.path)) }
    else if (kind === 'refresh') void action(() => refreshTree(projectId))
  }

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (projectDialog) return
      if (event.key === 'Escape' && runtimeExpanded && !pending && !(event.target instanceof HTMLElement && event.target.closest('.monaco-editor'))) { setRuntimeExpanded(false); setFocusSourceOpen(false); return }
      const legacySaveAll = { code: 'KeyS', primary: true, shift: true } as const
      if (!pending && !busy && (matchesShortcut(event, ideShortcuts.saveAll, platform) || matchesShortcut(event, legacySaveAll, platform))) {
        event.preventDefault(); action(saveAll); return
      }
      if (pending) return
      const key = (Object.entries(ideShortcuts) as [keyof typeof ideShortcuts, (typeof ideShortcuts)[keyof typeof ideShortcuts]][]).find(([name, shortcut]) => name !== 'save' && name !== 'saveAll' && matchesShortcut(event, shortcut, platform))?.[0]
      if (!key) return
      event.preventDefault()
      if (key === 'explorer') toggleExplorer()
      if (key === 'tools') setBottomOpen((value) => !value)
      if (key === 'console') { setTool('console'); setBottomOpen(true) }
      if (key === 'problems') { setTool('problems'); setBottomOpen(true) }
      if (key === 'symbols') setShowSymbols(true)
      if (key === 'inspector') setInspectorHidden((value) => !value)
      if (key === 'returnLive' && visualization) setTimelineLens('LIVE')
      if (key === 'stop' && execution && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(execution.phase)) void stopRun()
      if (key === 'focus' && visualization) { setRuntimeExpanded((value) => !value); setFocusSourceOpen(false) }
      if (key === 'debug' && projectId && jdk?.available && !busy && !['starting', 'running', 'paused'].includes(debugSession?.status ?? '')) void debugProject()
      if (key === 'run' && projectId && jdk?.available && !busy) void runProject()
    }
    window.addEventListener('keydown', shortcuts)
    return () => window.removeEventListener('keydown', shortcuts)
  })

  const activeExecution = !!execution && ['BUILDING', 'STARTING', 'RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(execution.phase)
  const acceptsInput = !!execution && ['RUNNING', 'WAITING_FOR_INPUT', 'PAUSED'].includes(execution.phase)
  const availableTools: Tool[] = ['console', ...(problems.length || tool === 'problems' ? ['problems'] as Tool[] : []), ...(debugSession || breakpoints.length ? ['debugger'] as Tool[] : []), ...(visualization?.trace.events.some((event) => event.type === 'THROW_EXCEPTION') || exception ? ['errors'] as Tool[] : [])]
  const targets = build?.mainClasses ?? javaProject?.runnableTargets ?? []
  return <div className={`ide-shell ide-shell--${workspaceMode} ${explorerOpen ? 'ide-shell--explorer-open' : ''} ${bottomOpen ? 'ide-shell--bottom-open' : ''} ${focusSourceOpen ? 'ide-shell--focus-source-open' : ''} ${runtimeExpanded ? 'ide-shell--runtime-expanded' : ''} ${debugSession && ['running', 'paused'].includes(debugSession.status) ? 'ide-shell--debug-active' : ''} ${tool === 'errors' || tool === 'debugger' ? 'ide-shell--debug-inspection' : ''}`} ref={shellRef} style={{ '--ide-project-width': `${projectWidth}%`, '--ide-editor-width': `${editorWidth}%`, '--ide-bottom-height': `${bottomHeight}%` } as React.CSSProperties}>
    <header className="ide-topbar">
      <div className="ide-brand"><span className="ide-mark">VJ</span><span><strong>Visual Java</strong></span></div>
      <button className="ide-chrome-toggle" onClick={toggleExplorer} aria-label={explorerOpen ? 'Hide project explorer' : 'Show project explorer'} aria-pressed={explorerOpen} title={`Toggle project explorer (${formatShortcut(ideShortcuts.explorer, platform)})`}><Files size={16}/></button>
      <div className="ide-topbar-center"><span className="ide-breadcrumb">{projects.find((item) => item.id === projectId)?.name ?? 'Loading project'} <span>/</span> {active || 'Project'}</span></div>

      {runtimeExpanded && <button className="ide-focus-tool-toggle" onClick={() => setBottomOpen((value) => !value)} aria-label={bottomOpen ? 'Hide tools in runtime focus' : 'Show tools in runtime focus'} title="Reveal Console / Problems / Debugger"><PanelBottom size={16}/></button>}
      <div className="ide-top-actions">
        {targets.length > 1 && <select aria-label="Main class" value={mainClass} onChange={(event) => setMainClass(event.target.value)}><option value="">First runnable main</option>{targets.map((name) => <option key={name}>{name}</option>)}</select>}
        {!activeExecution && <><button className="ide-primary" onClick={runProject} disabled={!projectId || busy || !jdk?.available}><CirclePlay size={16}/> Run</button><button className="ide-debug-action" onClick={debugProject} disabled={!projectId || busy || !jdk?.available}><CirclePlay size={16}/> Debug</button></>}
        {activeExecution && <button className="ide-stop-action" onClick={stopRun} disabled={busy}><Square size={14}/> Stop</button>}
        <details className="ide-more-actions"><summary aria-label="More actions" title="More actions"><Settings2 size={16}/></summary><div>
          <button onClick={() => activeTab && action(() => saveTab(activeTab))} disabled={!activeTab || activeTab.draft === activeTab.content || busy}><Save size={15}/> Save</button>
          <button onClick={() => action(saveAll)} disabled={!dirty || busy}><Save size={15}/> Save All</button>
          <button onClick={buildProject} disabled={!projectId || busy}><Hammer size={15}/> Build</button>
          <button onClick={() => setShowLaunch(true)} disabled={!projectId || busy}>Launch settings</button>
          <button onClick={() => setShowSymbols(true)} disabled={languageSnapshot.status !== 'ready'}><Search size={15}/> Find symbol</button>
          <button onClick={() => startExecution('run', true)} disabled={!projectId || busy || !jdk?.available}>Run without visualization</button>
          <button onClick={() => setShowJdk((value) => !value)}>Configure JDK</button>
        </div></details>
      </div>
    </header>
    <div className="ide-status-line">
      {!jdk?.available && <span className="is-error">JDK unavailable</span>}
      {(projectStatus.startsWith('Resolving') || javaProject?.status !== 'ready') && <span className="ide-project-status" title={javaProject?.diagnostic ?? projectStatus}>{projectStatus}</span>}
      {(["failed", "unavailable"].includes(languageSnapshot.status) || languageSnapshot.metrics.classpathMismatch === 1) && <span className={languageSnapshot.metrics.classpathMismatch === 1 ? 'is-warning' : 'is-error'} title={languageSnapshot.message ?? 'Java language service'}>Java {languageSnapshot.metrics.classpathMismatch === 1 ? 'classpath differs' : languageSnapshot.status}</span>}
      {["failed", "unavailable"].includes(languageSnapshot.status) && <button className="ide-language-restart" onClick={() => void languageClient.restart()}>Retry Java</button>}
      {execution && <span className="ide-execution-status" aria-live="polite">{execution.phase === 'FAILED' && execution.failureKind === 'build' ? 'BUILD FAILED' : execution.phase.replaceAll('_', ' ')}{execution.support === 'RUN_ONLY' && (execution.supportReason !== 'No verified runtime events yet' || ['COMPLETED', 'FAILED'].includes(execution.phase)) && execution.phase !== 'BUILDING' ? ' · console only' : ''}</span>}
      {traceStale && <span className="is-warning">Source changed since Run</span>}
      {execution?.supportReason && (execution.support === 'RUN_ONLY' && execution.supportReason !== 'No verified runtime events yet' || execution.support === 'PARTIAL' && ['COMPLETED', 'FAILED', 'STOPPED'].includes(execution.phase)) && <details className="ide-support-detail"><summary>Visualization {execution.support.toLowerCase().replace('_', ' ')}</summary><p>{execution.supportReason}</p></details>}
      <span className="ide-status-spacer"/><span>{notice}</span>
      <details className="ide-shortcuts"><summary>Shortcuts</summary><div><p>{formatShortcut(ideShortcuts.run, platform)} Run · {formatShortcut(ideShortcuts.debug, platform)} Debug · {formatShortcut(ideShortcuts.stop, platform)} Stop<br/>{formatShortcut(ideShortcuts.focus, platform)} Focus · {formatShortcut(ideShortcuts.explorer, platform)} Explorer · {formatShortcut(ideShortcuts.tools, platform)} Tools<br/>{formatShortcut(ideShortcuts.console, platform)} Console · {formatShortcut(ideShortcuts.problems, platform)} Problems · {formatShortcut(ideShortcuts.returnLive, platform)} Live<br/>{formatShortcut(ideShortcuts.save, platform)} Save · {formatShortcut(ideShortcuts.saveAll, platform)} Save All</p></div></details>
    </div>
    {showJdk && <div className="ide-jdk"><label>JDK home <input value={jdkInput} placeholder="Auto-detect from PATH" onChange={(event) => setJdkInput(event.target.value)} /></label><button onClick={() => action(async () => setJdk(await bridge.detectJdk(jdkInput || null)))}>Use JDK</button><span>{jdk?.error}</span></div>}
    {debugSession && activeExecution && <div className="debug-toolbar" aria-label="JVM debugger controls">
      <span className="debug-live-state">{execution?.phase === 'PAUSED' ? `Paused · ${debugSession.pause?.reason ?? 'checkpoint'}` : 'Debugging'}</span>
      {execution?.phase === 'PAUSED' ? <><button onClick={() => debugCommand('continue')} disabled={busy}>Continue</button><button onClick={() => debugCommand('stepOver')} disabled={busy}>Over</button><button onClick={() => debugCommand('stepInto')} disabled={busy}>Into</button><button onClick={() => debugCommand('stepOut')} disabled={busy}>Out</button></>
        : <button onClick={() => debugCommand('pause')} disabled={busy || execution?.phase !== 'RUNNING'} title="Pause at next project source boundary">Pause</button>}
      <button onClick={() => { setTool('debugger'); setBottomOpen(true); setBottomHeight(35) }}>Inspect</button>
    </div>}
    <div className="ide-main" ref={contentRef}>
      <aside className="ide-project-panel">
        <div className="ide-panel-heading"><span>PROJECT</span><span className="ide-panel-actions"><button title="New file" aria-label="Create File" onClick={() => newEntry('file')}><Plus size={15}/></button><button title="New folder" aria-label="Create Folder" onClick={() => newEntry('folder')}><FolderOpen size={15}/></button><button title="Refresh project" aria-label="Refresh Project" onClick={() => void action(() => refreshTree(projectId))}>↻</button></span></div>
        <select className="ide-project-select" aria-label="Project" disabled={busy} value={projectId} onChange={(event) => requestDecision('switching projects', tabs.map((tab) => tab.path), () => action(() => switchProject(event.target.value)))}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
        <input ref={importRef} type="file" hidden multiple {...{ webkitdirectory: '' }} onChange={(event) => { void importFiles(event.target.files); event.target.value = '' }} />
        <button className="ide-open-project" onClick={() => importRef.current?.click()}><Upload size={13}/> Open Project / Folder</button>
        <button className="ide-new-project" onClick={() => setProjectDialog({ kind: 'project', path: '', value: 'New Java Project' })}><Plus size={13}/> New project</button>
        <button className="ide-reveal-active" disabled={!active} onClick={() => revealEntry(active)}>Reveal active file</button>
        <ProjectExplorer tree={tree} active={active} collapsed={collapsed} onToggle={toggleTreeEntry} onOpen={(path) => void action(() => openFile(projectId, path))} onAction={treeAction}/>
        <div className="ide-project-foot">{entries.filter((item) => item.kind === 'file').length} files · Managed local workspace</div>
      </aside>
      <div className="ide-divider ide-divider--vertical" role="separator" aria-label="Resize project pane" tabIndex={0} {...divider('project')}/>
      <section className="ide-code-workspace">
        <div className="ide-upper" ref={upperRef}>
          <div className="ide-editor-panel">
            {runtimeExpanded && <div className="ide-focus-source-heading"><span>Source · {active || 'Java'}</span><button onClick={() => setFocusSourceOpen(false)} aria-label="Close source drawer"><X size={15}/></button></div>}
            <div className="ide-tabs" role="tablist">{tabs.map((tab) => <div key={tab.path} className={`ide-tab ${active === tab.path ? 'is-active' : ''}`} role="tab" aria-selected={active === tab.path}><button onClick={() => setActive(tab.path)} title={tab.path}><span className="ide-java-icon">J</span>{filename(tab.path)}{tab.draft !== tab.content && <span className="ide-dirty"/>}</button><button aria-label={`Close ${tab.path}`} onClick={() => closeTab(tab.path)}><X size={13}/></button></div>)}</div>
            <div className="ide-editor-body">{activeTab ? <EditableJavaEditor key={`${projectId}:${activeTab.path}`} projectId={projectId} path={activeTab.path} value={activeTab.draft} onChange={(value) => edit(activeTab.path, value)} diagnostics={diagnostics} navigate={nav} executingLine={!traceStale && activeTab.path === executingSource?.fileId ? executingSource.line : null} pausedLine={!traceStale && debugSession?.status === 'paused' && runtime?.cursor === visualization?.trace.events.length && activeTab.path === executingSource?.fileId ? executingSource.line : null} breakpoints={breakpoints} onToggleBreakpoint={(line) => toggleBreakpoint(activeTab.path, line)} onSave={() => action(() => saveTab(tabsRef.current.find((item) => item.path === activeTab.path)!))}/> : <div className="ide-editor-empty"><span>JAVA SOURCE</span><h2>Choose a file to edit</h2><p>Open a Java file from the project explorer, or create a new one.</p></div>}</div>
            <div className="ide-editor-foot"><span>{active || 'No file selected'}</span><span>Java · UTF-8 · {activeTab?.draft.split('\n').length ?? 0} lines</span></div>
          </div>
          <div className="ide-divider ide-divider--vertical" role="separator" aria-label="Resize runtime pane" tabIndex={0} {...divider('runtime')}/>
          <section className="ide-runtime-panel" aria-label="Runtime visualization area">
            <div className="ide-panel-heading"><span>RUNTIME</span><div className="ide-runtime-heading-actions">
              {runtimeSelection && visualization && <button type="button" onClick={() => setInspectorHidden((value) => !value)} aria-label="Toggle inspector" aria-pressed={!inspectorHidden} title={`Toggle inspector (${formatShortcut(ideShortcuts.inspector, platform)})`}><ScanEye size={14}/></button>}
              {runtimeExpanded && <button type="button" onClick={() => setFocusSourceOpen((value) => !value)} aria-label={focusSourceOpen ? 'Hide source drawer' : 'Show source drawer'} title="Toggle source drawer"><Code2 size={14}/><span>Source</span></button>}
              {visualization && <button type="button" onClick={() => { setRuntimeExpanded((value) => !value); setFocusSourceOpen(false) }} aria-label={runtimeExpanded ? 'Restore IDE layout' : 'Expand runtime'} title={`${runtimeExpanded ? 'Restore IDE layout' : 'Focus runtime'} (${formatShortcut(ideShortcuts.focus, platform)})`}>{runtimeExpanded ? <><Minimize2 size={14}/><span>Exit Focus</span></> : <Maximize2 size={14}/>}</button>}
            </div></div>
            <div className={`ide-runtime-live${visualization ? '' : ' ide-runtime-live--idle'}`}>
              <App trace={visualization?.trace ?? idleTrace} embedded onSourceChange={handleExecutingSource} onRuntimeChange={handleRuntimeChange} navigation={runtimeNavigation} suppressInspector={tool === 'errors' && bottomOpen || inspectorHidden} execution={visualization ? { phase: execution?.phase ?? 'COMPLETED', lens: timelineLens, liveCursor: visualization.trace.events.length, onLensChange: (lens) => setTimelineLens(lens) } : undefined}/>
              {!visualization && <div className="ide-runtime-ready" aria-label="Runtime ready"><span>RUNTIME</span><strong>{execution?.phase === 'BUILDING' ? 'Building Java…' : execution?.phase === 'STARTING' ? 'Starting Java…' : 'Ready'}</strong><p>{execution?.support === 'RUN_ONLY' ? execution.supportReason ?? 'Console execution' : 'Run your Java program to enter the world.'}</p></div>}
            </div>
          </section>
        </div>
        <div className="ide-divider ide-divider--horizontal" role="separator" aria-label="Resize bottom panel" tabIndex={0} {...divider('bottom')}/>
        <section className="ide-bottom-panel">
          <div className="ide-tool-tabs"><button className="ide-bottom-toggle" onClick={() => setBottomOpen((value) => !value)} aria-label={bottomOpen ? 'Collapse bottom panel' : 'Expand bottom panel'} title={`Toggle bottom panel (${formatShortcut(ideShortcuts.tools, platform)})`}><PanelBottom size={15}/></button>
            {availableTools.map((item) => <button key={item} className={tool === item && bottomOpen ? 'is-active' : ''} onClick={() => { setBottomOpen(true); setTool(item); if (item === 'errors' || item === 'debugger') setBottomHeight(35) }}>{item === 'errors' ? 'ERROR EXPLORER' : item.toUpperCase()}{item === 'problems' && problems.length > 0 && <span className="ide-badge">{problems.length}</span>}</button>)}
            <span className="ide-status-spacer"/>
          </div>
          {tool === 'debugger' ? <DebugPanel session={debugSession} runtime={runtime} breakpoints={breakpoints} onInspect={(selection) => navigateRuntime(runtime?.cursor ?? 0, selection)} onRemove={removeBreakpoint}/>
          : tool === 'errors' ? visualization ? <ErrorExplorer key={visualization.trace.demoId} trace={visualization.trace} runtime={runtime} selection={runtimeSelection} stderr={execution?.stderr ?? ''} onNavigate={navigateRuntime}/> : <div className="debug-empty">{exception ? <><strong>{exception.type}: {exception.message}</strong><pre>{exception.rawStackTrace}</pre></> : <p>No recorded exception.</p>}</div>
          : tool === 'problems' ? <ProblemsPanel build={build} language={languageProblems} onOpen={openDiagnostic}/>
          : <div className="ide-console">
            <div className="ide-console-output" ref={consoleRef} aria-label="Program console">
              {build?.rawOutput && !build.success && <pre className="ide-console-stderr">{build.rawOutput}</pre>}
              {visualization && <>{runtime?.console.map((entry) => <pre key={entry.eventId} className={entry.kind === 'input' ? 'ide-console-stdin' : entry.channel === 'stderr' ? 'ide-console-stderr' : 'ide-console-stdout'}>{entry.kind === 'input' ? `› ${entry.text}` : entry.text}</pre>)}
                <details className="ide-console-terminal"><summary title="Process-pipe output is complete; its order relative to recorder events cannot be proven">Full process output</summary><pre className="ide-console-full-stdout">{execution?.stdout}</pre><pre className="ide-console-full-stderr">{execution?.stderr}</pre></details></>}
              {!visualization && allEvents.map((event) => <pre key={event.id} className={`ide-console-${event.kind}`}>{event.kind === 'exit' ? event.signal ? `Process stopped (${event.signal})` : `Process finished with exit code ${event.exitCode ?? '—'}` : event.kind === 'stdin' ? `› ${event.text}` : event.text}</pre>)}
              {!visualization && execution?.stdout && !allEvents.length && <pre className="ide-console-stdout">{execution.stdout}</pre>}
              {!visualization && execution?.stderr && !allEvents.length && <pre className="ide-console-stderr">{execution.stderr}</pre>}
              {exception && <div className="ide-stack"><strong>{exception.type}: {exception.message}</strong><details><summary>Raw JVM stack trace</summary><pre>{exception.rawStackTrace}</pre></details>{exception.frames.map((frame, index) => <button key={index} disabled={!frame.location} onClick={() => frame.location && action(() => openFile(projectId, frame.location!.path, frame.location!))}>{frame.raw}</button>)}</div>}
              {!execution && !build?.rawOutput && <p className="ide-empty">Program output appears here when you run Java.</p>}
            </div>
            <form className="ide-console-input" onSubmit={(event) => { event.preventDefault(); sendInput() }}><span>›</span><input aria-label="Console input" placeholder={acceptsInput ? 'Send input to program…' : 'Run a program to send input'} value={input} disabled={!acceptsInput} onChange={(event) => setInput(event.target.value)}/><button disabled={!acceptsInput}>Send ↵</button></form>
          </div>}
        </section>
      </section>
    </div>
    {showLaunch && <LaunchDialog value={{ ...launch, mainClass }} targets={targets} onClose={() => setShowLaunch(false)} onSave={(configuration) => { setLaunch(configuration); setMainClass(configuration.mainClass); setShowLaunch(false) }}/>}
    {showSymbols && <SymbolSearch client={languageClient} onClose={() => setShowSymbols(false)} onOpen={(location) => openFile(projectIdRef.current, location.path, location)}/>}
    {projectDialog && <div className="ide-confirm-backdrop"><form className="ide-confirm ide-project-dialog" ref={projectDialogRef} role="dialog" aria-modal="true" aria-labelledby="ide-project-dialog-title" onSubmit={(event) => { event.preventDefault(); void submitProjectDialog() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setProjectDialog(null) } }}>
      <h2 id="ide-project-dialog-title">{projectDialog.kind === 'class' ? 'New Java Class' : projectDialog.kind === 'file' ? 'New File' : projectDialog.kind === 'folder' ? 'New Folder' : projectDialog.kind === 'rename' ? 'Rename' : projectDialog.kind === 'delete' ? 'Delete' : 'New Project'}</h2>
      {projectDialog.kind === 'delete' ? <p>Delete <strong>{projectDialog.path}</strong> from this project?</p> : <label>{projectDialog.kind === 'project' ? 'Project name' : 'Path relative to project root'}<input value={projectDialog.value} onChange={(event) => setProjectDialog({ ...projectDialog, value: event.target.value })} spellCheck={false} required /></label>}
      <div><button type="button" onClick={() => setProjectDialog(null)}>Cancel</button><button type="submit" className="ide-primary" disabled={busy}>{projectDialog.kind === 'delete' ? 'Delete' : projectDialog.kind === 'rename' ? 'Rename' : 'Create'}</button></div>
    </form></div>}
    {pending && <div className="ide-confirm-backdrop"><div className="ide-confirm" ref={confirmRef} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); void resolveDecision('cancel') }
      if (event.key === 'Tab') {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        const first = buttons[0], last = buttons.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }} role="dialog" aria-modal="true" aria-labelledby="ide-confirm-title"><h2 id="ide-confirm-title">Unsaved changes</h2><p>Save {pending.paths.length} changed {pending.paths.length === 1 ? 'file' : 'files'} before {pending.label}?</p><div><button disabled={busy} onClick={() => void resolveDecision('cancel')}>Cancel</button><button disabled={busy} onClick={() => void resolveDecision('discard')}>Discard</button><button disabled={busy} className="ide-primary" onClick={() => void resolveDecision('save')}>Save and continue</button></div></div></div>}
  </div>
}
