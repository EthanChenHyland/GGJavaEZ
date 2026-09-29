import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, CirclePlay, Code2, Files, FolderOpen, Hammer, Maximize2, Minimize2, PanelBottom, Plus, Save, ScanEye, Search, Settings2, Square, Upload, X } from 'lucide-react'
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
import { visualizeProject } from './visualize'
import { EditableJavaEditor } from './EditableJavaEditor'
import { TraceInspector } from './TraceInspector'
import { ProblemsPanel } from './ProblemsPanel'
import { LaunchDialog } from './LaunchDialog'
import { SymbolSearch } from './SymbolSearch'
import { defaultLaunch, type JavaProject, type LaunchConfiguration } from './javaProject'
import { LanguageClient } from '../language/client'
import { documentPath, type LanguageSnapshot, type LspWorkspaceEdit } from '../language/protocol'
import { registerJavaIntelligence } from '../language/monaco'
import { applyWorkspaceEdit, type WorkspaceEditHost } from '../language/workspaceEdit'
import { mergeProblems } from './problems'
import * as monacoApi from 'monaco-editor/editor/editor.api.js'
import type { BuildResult, CompileDiagnostic, JdkStatus, ProjectEntry, ProjectFile, ProjectSummary, RunEvent, RunSnapshot, SourceLocation } from './contracts'
import './ide.css'

type Tab = ProjectFile & { draft: string }
type Tool = 'console' | 'problems' | 'timeline' | 'debugger' | 'errors'
type WorkspaceMode = 'code' | 'visualize' | 'debug'
type PendingDecision = { label: string; paths: string[]; action: () => void | Promise<void> } | null
const draftKey = (id: string, path: string) => `ggjavaez:draft:${id}:${path}`
const sessionKey = (id: string) => `ggjavaez:session:${id}`
const breakpointKey = (id: string) => `ggjavaez:breakpoints:${id}`
const launchKey = (id: string) => `ggjavaez:launch:${id}`
const widthKey = 'ggjavaez:m8:editor-widths'
const defaultEditorWidths: Record<WorkspaceMode, number> = { code: 72, visualize: 30, debug: 35 }
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
  const [run, setRun] = useState<RunSnapshot | null>(null)
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
  const [visualizeStatus, setVisualizeStatus] = useState('')
  const [runtimeExpanded, setRuntimeExpanded] = useState(false)
  const [executingSource, setExecutingSource] = useState<RuntimeSourceLocation | null>(null)
  const [debugSession, setDebugSession] = useState<DebugSession | null>(null)
  const [breakpoints, setBreakpoints] = useState<ResolvedBreakpoint[]>([])
  const [runtime, setRuntime] = useState<RuntimeState | null>(null)
  const [runtimeSelection, setRuntimeSelection] = useState<Selection>(null)
  const [runtimeNavigation, setRuntimeNavigation] = useState<RuntimeNavigation | null>(null)
  const debugRevision = useRef(-1)
  const debugPauseCount = useRef(-1)
  const [projectWidth, setProjectWidth] = useState(14)
  const [initialEditorWidths] = useState(savedEditorWidths)
  const modeEditorWidths = useRef(initialEditorWidths)
  const [editorWidth, setEditorWidth] = useState(modeEditorWidths.current.code)
  const [bottomHeight, setBottomHeight] = useState(29)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const shellRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const upperRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLDivElement>(null)
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
  const allEvents = run?.events ?? []
  const exitEvent = run?.events.at(-1)?.kind === 'exit' ? run.events.at(-1) : undefined
  const exception = run?.exception ?? [...allEvents].reverse().find((event) => event.exception)?.exception
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
  }, [run?.events.length, tool])
  useEffect(() => {
    if (!pending) return
    const previous = document.activeElement as HTMLElement | null
    confirmRef.current?.querySelector('button')?.focus()
    return () => previous?.focus()
  }, [pending])

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
      const current = await bridge.currentRun()
      if (current?.status === 'running') await bridge.stop(current.runId)
      const debug = await bridge.debugCurrent()
      if (debug && ['starting', 'running', 'paused'].includes(debug.status)) await bridge.debugCommand(debug.sessionId, 'stop')
    }
    setProjectId(nextId)
    setTabs([])
    setActive('')
    setBuild(null)
    setRun(null)
    setVisualization(null)
    setVisualizeStatus('')
    setWorkspaceMode('code')
    setEditorWidth(modeEditorWidths.current.code)
    setBottomOpen(false); setFocusSourceOpen(false)
    setRuntimeExpanded(false)
    setExecutingSource(null)
    setDebugSession(null); setRuntime(null); setRuntimeSelection(null); setRuntimeNavigation(null)
    debugRevision.current = -1; debugPauseCount.current = -1
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
    Promise.all([bridge.projects(), bridge.health(), bridge.currentRun(), bridge.debugCurrent()]).then(async ([items, health, current, debug]) => {
      if (!alive) return
      setProjects(items)
      setJdk(health.jdk)
      setJdkInput(health.jdk.home ?? '')
      const chosen = items.find((item) => item.id === localStorage.getItem('ggjavaez:project')) ?? items[0]
      if (chosen) await switchProject(chosen.id, false)
      if (current && current.projectId === chosen?.id) setRun(current)
      else if (current?.status === 'running') await bridge.stop(current.runId)
      if (debug?.projectId === chosen?.id) { acceptDebug(debug); setWorkspaceMode('debug'); setEditorWidth(modeEditorWidths.current.debug); setExplorerOpen(false) }
    }).catch(fail)
    return () => { alive = false }
    // Initial hydration deliberately runs once.
  }, [])

  useEffect(() => {
    eventSourceRef.current?.close()
    if (!run?.runId || run.status !== 'running') return
    const after = run.events.at(-1)?.id ?? 0
    const source = bridge.events(run.runId, after, (event: RunEvent) => {
      setRun((current) => {
        if (!current || current.runId !== run.runId || current.events.some((item) => item.id === event.id)) return current
        const next = { ...current, events: [...current.events, event] }
        if (event.kind === 'exit') { next.status = 'exited'; next.exitCode = event.exitCode ?? null; next.exception = event.exception ?? null }
        return next
      })
    })
    eventSourceRef.current = source
    return () => source.close()
    // Reconnect only when the run changes or exits; event IDs are buffered server-side.
  }, [run?.runId, run?.status])

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
    setDebugSession(null)
    setMainClass((previous) => result.mainClasses.includes(previous) ? previous : result.mainClasses[0] ?? '')
    setTool(result.success ? 'console' : 'problems')
    setBottomOpen(!result.success)
    setNotice(result.success ? `Build succeeded in ${result.elapsedMs} ms` : `${result.diagnostics.length} compiler problem${result.diagnostics.length === 1 ? '' : 's'}`)
  })
  const runProject = () => action(async () => {
    enterMode('code')
    await saveAll()
    setVisualization(null)
    setDebugSession(null); setRuntime(null); setRuntimeNavigation(null)
    setRuntimeExpanded(false)
    setVisualizeStatus('')
    setExecutingSource(null)
    const result = await bridge.run(projectId, mainClass, launch)
    setBuild(result.build)
    if (result.build.javaProject) setJavaProject(result.build.javaProject)
    setMainClass(result.run?.mainClass ?? result.build.mainClasses[0] ?? '')
    setRun(result.run)
    setTool(result.run ? 'console' : 'problems'); setBottomOpen(true)
    if (!result.run) setNotice(result.build.success ? 'Build succeeded; no public static main(String[]) entry point found.' : 'Compilation failed. See Problems for the exact javac output.')
  })
  const visualizeCurrentProject = () => action(async () => {
    setVisualization(null)
    setRun(null)
    setDebugSession(null); setRuntime(null); setRuntimeNavigation(null)
    setVisualizeStatus('Checking support and saving…')
    await saveAll()
    setVisualizeStatus('Compiling and recording on the local JVM…')
    const result = await visualizeProject(projectId, mainClass, launch)
    setBuild(result.response.build)
    if (result.response.build.javaProject) setJavaProject(result.response.build.javaProject)
    setMainClass(result.response.build.mainClasses.includes(mainClass) ? mainClass : result.response.build.mainClasses[0] ?? '')
    if (!result.trace || !result.capability) {
      setTool('problems'); setBottomOpen(true)
      setVisualizeStatus(result.response.status === 'compile_failed' ? 'Compile failed' : 'Visualization unavailable')
      setNotice(result.response.diagnostic ?? 'See Problems for compiler details.')
      return
    }
    setVisualization({ trace: result.trace, capability: result.capability, rawEvents: result.response.rawEvents,
      status: result.response.status, stdout: result.response.stdout, stderr: result.response.stderr,
      diagnostic: result.response.diagnostic })
    enterMode('visualize')
    setVisualizeStatus(result.response.status === 'complete' ? 'Ready to explore' : `Trace captured · ${result.response.status.replaceAll('_', ' ')}`)
    setNotice(result.response.status === 'complete'
      ? `${result.response.rawEvents.length} observed JVM events · normalized in ${Math.round(result.normalizeMs)} ms`
      : result.response.diagnostic ?? `Execution ${result.response.status.replaceAll('_', ' ')}; inspect the available trace.`)
    if (result.trace.events.some((event) => event.type === 'THROW_EXCEPTION')) {
      setTool('errors'); setBottomOpen(true); setBottomHeight(35)
      const index = result.trace.events.map((event) => event.type === 'THROW_EXCEPTION').lastIndexOf(true)
      setRuntimeNavigation((previous) => ({ revision: (previous?.revision ?? 0) + 1, cursor: index + 1 }))
    }
  })
  const navigateRuntime = useCallback((cursor: number, selection?: Selection) => {
    setRuntimeNavigation((previous) => ({ revision: (previous?.revision ?? 0) + 1, cursor, ...(selection === undefined ? {} : { selection }) }))
  }, [])
  const handleRuntimeChange = useCallback((next: RuntimeState, selection: Selection) => { setRuntime(next); setRuntimeSelection(selection) }, [])
  useEffect(() => { setInspectorHidden(false) }, [runtimeSelection?.id])
  const acceptDebug = useCallback((session: DebugSession) => {
    if (session.projectId !== projectIdRef.current || session.revision === debugRevision.current) return
    debugRevision.current = session.revision
    setDebugSession(session); setBuild(session.build); setBreakpoints(session.breakpoints)
    if (!session.rawEvents.length || !session.build.success) {
      if (!session.build.success) { setTool('problems'); setNotice(session.diagnostic ?? 'Compilation failed') }
      return
    }
    const normalized = normalizeTrace(session.rawEvents, session.sourceManifest, {
      status: session.terminalStatus ?? 'live', exitCode: session.exitCode, diagnostic: session.diagnostic,
    }, `debug:${session.sessionId}`)
    const trace = validateTrace(normalized.trace, { allowLive: session.terminalStatus === null })
    trace.capture = { origin: 'jvm', sourceHashes: Object.fromEntries(session.sourceManifest.sources.map((file) => [file.fileId, file.sha256])), recordedAt: new Date().toISOString() }
    setVisualization({ trace, capability: normalized.capability, rawEvents: session.rawEvents,
      status: session.terminalStatus ?? session.status, stdout: session.stdout, stderr: session.stderr, diagnostic: session.diagnostic })
    setVisualizeStatus(`Debug · ${session.status}`)
    if (session.pause && session.pause.rawEventCount !== debugPauseCount.current) {
      debugPauseCount.current = session.pause.rawEventCount
      navigateRuntime(trace.events.length)
      setTool(session.pause.reason === 'exception' ? 'errors' : 'debugger')
      if (session.pause.reason === 'exception') { setBottomOpen(true); setBottomHeight(35) }
    }
    if (session.terminalStatus === 'program_crashed') { setTool('errors'); setBottomOpen(true) }
  }, [navigateRuntime])
  useEffect(() => {
    if (!debugSession || !['starting', 'running', 'paused'].includes(debugSession.status)) return
    let alive = true
    const timer = window.setInterval(() => {
      void bridge.debugSnapshot(debugSession.sessionId).then((session) => { if (alive) acceptDebug(session) }).catch((error) => { if (alive) fail(error) })
    }, 350)
    return () => { alive = false; window.clearInterval(timer) }
  }, [debugSession?.sessionId, debugSession?.status, acceptDebug])
  const debugProject = () => action(async () => {
    await saveAll(); setRun(null); setVisualization(null); setRuntime(null); setRuntimeNavigation(null)
    debugRevision.current = -1; debugPauseCount.current = -1
    setVisualizeStatus('Compiling for debugging…')
    const session = await bridge.debug(projectId, mainClass, breakpoints, launch)
    enterMode(session.build.success ? 'debug' : 'code')
    acceptDebug(session); setTool(session.build.success && session.pause?.reason === 'exception' ? 'errors' : session.build.success ? 'debugger' : 'problems')
    setBottomOpen(!session.build.success || session.pause?.reason === 'exception'); setBottomHeight(35)
  })
  const debugCommand = (command: DebugCommand) => action(async () => {
    if (debugSession) acceptDebug(await bridge.debugCommand(debugSession.sessionId, command))
  })
  const toggleBreakpoint = (fileId: string, line: number) => {
    const next: ResolvedBreakpoint[] = breakpoints.some((point) => point.fileId === fileId && point.line === line)
      ? breakpoints.filter((point) => point.fileId !== fileId || point.line !== line)
      : [...breakpoints, { fileId, line, status: 'pending', reason: null }]
    setBreakpoints(next); localStorage.setItem(breakpointKey(projectId), JSON.stringify(next.map(({ fileId, line }) => ({ fileId, line }))))
    if (debugSession && ['running', 'paused', 'starting'].includes(debugSession.status)) void bridge.debugBreakpoints(debugSession.sessionId, next).then(acceptDebug).catch(fail)
  }
  const removeBreakpoint = (point: SourceBreakpoint) => toggleBreakpoint(point.fileId, point.line)
  const handleExecutingSource = useCallback((location: RuntimeSourceLocation | null) => {
    setExecutingSource(location)
    if (!location || location.fileId === activeRef.current || requestedSourceRef.current === location.fileId) return
    const id = projectIdRef.current
    requestedSourceRef.current = location.fileId
    void openFile(id, location.fileId).catch(fail).finally(() => { requestedSourceRef.current = '' })
  }, [openFile])
  const stopRun = () => action(async () => { if (run) setRun(await bridge.stop(run.runId)) })
  const sendInput = () => action(async () => {
    if (debugSession && ['running', 'paused'].includes(debugSession.status)) await bridge.debugInput(debugSession.sessionId, input + '\n')
    else if (run) await bridge.input(run.runId, input + '\n')
    else return
    setInput('')
  })
  const newEntry = (kind: 'file' | 'folder') => action(async () => {
    const path = window.prompt(`New ${kind} path, relative to project root${kind === 'file' ? ' (for example src/Main.java)' : ''}:`)
    if (!path) return
    if (kind === 'file') { await bridge.createFile(projectId, path); await openFile(projectId, path) }
    else await bridge.createFolder(projectId, path)
    await refreshTree(projectId)
  })
  const renameEntry = (path: string) => action(async () => {
    const to = window.prompt('Rename path:', path)
    if (!to || to === path) return
    const affected = tabsRef.current.filter((tab) => tab.path === path || tab.path.startsWith(`${path}/`))
    for (const tab of affected) await saveTab(tab)
    await bridge.rename(projectId, path, to)
    const mapPath = (value: string) => value === path || value.startsWith(`${path}/`) ? to + value.slice(path.length) : value
    setTabs((current) => current.map((tab) => ({ ...tab, path: mapPath(tab.path) })))
    setActive((current) => mapPath(current))
    affected.forEach((tab) => localStorage.removeItem(draftKey(projectId, tab.path)))
    await refreshTree(projectId)
  })
  const deleteEntry = (path: string) => action(async () => {
    if (!window.confirm(`Delete ${path} from this project?`)) return
    await bridge.delete(projectId, path)
    tabsRef.current.filter((tab) => tab.path === path || tab.path.startsWith(`${path}/`)).forEach((tab) => localStorage.removeItem(draftKey(projectId, tab.path)))
    setTabs((current) => current.filter((tab) => tab.path !== path && !tab.path.startsWith(`${path}/`)))
    if (active === path || active.startsWith(`${path}/`)) setActive('')
    await refreshTree(projectId)
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
      if (kind === 'project') setProjectWidth((value) => Math.max(13, Math.min(28, value + amount)))
      else if (kind === 'runtime') setEditorWidth((value) => Math.max(24, Math.min(80, value + amount)))
      else setBottomHeight((value) => Math.max(16, Math.min(55, value - amount)))
    },
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => event.currentTarget.setPointerCapture(event.pointerId),
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setDivider(kind, event.clientX, event.clientY) },
  })
  const renderTree = (items: ProjectEntry[], depth = 0): React.ReactNode => items.map((item) => <div key={item.path}>
    <div className={`ide-tree-row ${active === item.path ? 'is-active' : ''}`} style={{ paddingLeft: 12 + depth * 15 }}>
      <button className="ide-tree-name" onClick={() => item.kind === 'file' ? action(() => openFile(projectId, item.path)) : setCollapsed((previous) => { const next = new Set(previous); if (next.has(item.path)) next.delete(item.path); else next.add(item.path); return next })} title={item.path}>
        {item.kind === 'directory' ? collapsed.has(item.path) ? <ChevronRight size={13} /> : <ChevronDown size={13} /> : <span className="ide-java-icon">{item.name.endsWith('.java') ? 'J' : item.name === 'pom.xml' ? 'M' : item.name.includes('gradle') ? 'G' : '·'}</span>}{item.name}
      </button>
      <button className="ide-entry-more" aria-label={`Rename ${item.path}`} title="Rename" onClick={() => renameEntry(item.path)}>✎</button>
      <button className="ide-entry-more" aria-label={`Delete ${item.path}`} title="Delete" onClick={() => deleteEntry(item.path)}>×</button>
    </div>
    {item.kind === 'directory' && !collapsed.has(item.path) && item.children && renderTree(item.children, depth + 1)}
  </div>)

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && runtimeExpanded && !pending && !(event.target instanceof HTMLElement && event.target.closest('.monaco-editor'))) { setRuntimeExpanded(false); setFocusSourceOpen(false); return }
      if (!pending && !busy && (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault(); action(saveAll); return
      }
      if (pending || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return
      // macOS Option changes event.key to a symbol; physical key codes keep
      // the documented Alt+Shift workspace shortcuts usable on this host.
      const key = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : event.key.toLowerCase()
      if (!['e', 'b', 'f', 'v', 'd', 'r', 'i', 'x'].includes(key)) return
      event.preventDefault()
      if (key === 'e') toggleExplorer()
      if (key === 'b') setBottomOpen((value) => !value)
      if (key === 'o') setShowSymbols(true)
      if (key === 'i') setInspectorHidden((value) => !value)
      if (key === 'x') { if (debugSession && ['starting', 'running', 'paused'].includes(debugSession.status)) void debugCommand('stop'); else if (run?.status === 'running') void stopRun() }
      if (key === 'f' && visualization) { setRuntimeExpanded((value) => !value); setFocusSourceOpen(false) }
      if (key === 'v' && projectId && jdk?.available && !busy) void visualizeCurrentProject()
      if (key === 'd' && projectId && jdk?.available && !busy && !['starting', 'running', 'paused'].includes(debugSession?.status ?? '')) void debugProject()
      if (key === 'r' && projectId && jdk?.available && !busy) void runProject()
    }
    window.addEventListener('keydown', shortcuts)
    return () => window.removeEventListener('keydown', shortcuts)
  })

  const acceptsInput = run?.status === 'running' || !!debugSession && ['running', 'paused'].includes(debugSession.status)
  const availableTools: Tool[] = ['console', 'problems', 'timeline', ...(debugSession || breakpoints.length ? ['debugger'] as Tool[] : []), ...(visualization || exception ? ['errors'] as Tool[] : [])]
  const targets = build?.mainClasses ?? javaProject?.runnableTargets ?? []
  return <div className={`ide-shell ide-shell--${workspaceMode} ${explorerOpen ? 'ide-shell--explorer-open' : ''} ${bottomOpen ? 'ide-shell--bottom-open' : ''} ${focusSourceOpen ? 'ide-shell--focus-source-open' : ''} ${runtimeExpanded ? 'ide-shell--runtime-expanded' : ''} ${debugSession && ['running', 'paused'].includes(debugSession.status) ? 'ide-shell--debug-active' : ''} ${tool === 'errors' || tool === 'debugger' ? 'ide-shell--debug-inspection' : ''}`} ref={shellRef} style={{ '--ide-project-width': `${projectWidth}%`, '--ide-editor-width': `${editorWidth}%`, '--ide-bottom-height': `${bottomHeight}%` } as React.CSSProperties}>
    <header className="ide-topbar">
      <div className="ide-brand"><span className="ide-mark">VJ</span><span><strong>Visual Java</strong></span></div>
      <button className="ide-chrome-toggle" onClick={toggleExplorer} aria-label={explorerOpen ? 'Hide project explorer' : 'Show project explorer'} aria-pressed={explorerOpen} title="Toggle project explorer (Alt+Shift+E)"><Files size={16}/></button>
      <div className="ide-topbar-center"><span className="ide-breadcrumb">{projects.find((item) => item.id === projectId)?.name ?? 'Loading project'} <span>/</span> {active || 'Project'}</span></div>
      <div className="ide-mode-switch" role="group" aria-label="Workspace emphasis"><button aria-pressed={workspaceMode === 'code'} onClick={() => enterMode('code')} title="Code workspace"><Code2 size={15}/> Code</button><button aria-pressed={workspaceMode === 'visualize'} disabled={!visualization} onClick={() => enterMode('visualize')} title="Spatial workspace"><ScanEye size={15}/> Runtime</button><button aria-label="Debug workspace" aria-pressed={workspaceMode === 'debug'} disabled={!debugSession} onClick={() => enterMode('debug')} title="Debug workspace">Debug</button></div>
      {runtimeExpanded && <button className="ide-focus-tool-toggle" onClick={() => setBottomOpen((value) => !value)} aria-label={bottomOpen ? 'Hide tools in runtime focus' : 'Show tools in runtime focus'} title="Reveal Console / Problems / Debugger"><PanelBottom size={16}/></button>}
      <div className="ide-top-actions">
        <button onClick={() => activeTab && action(() => saveTab(activeTab))} disabled={!activeTab || activeTab.draft === activeTab.content || busy} title="Save active file (⌘/Ctrl+S)"><Save size={15}/> Save</button>
        <button className="ide-secondary-action" onClick={() => action(saveAll)} disabled={!dirty || busy} title="Save all open files (Ctrl/Cmd+Shift+S)"><Save size={15}/> Save All{dirty ? ' •' : ''}</button>
        <button className="ide-secondary-action" onClick={buildProject} disabled={!projectId || busy} title="Build project"><Hammer size={15}/> Build</button>
        <select aria-label="Main class" value={mainClass} onChange={(event) => setMainClass(event.target.value)} disabled={!targets.length}>{targets.length ? <><option value="">First runnable main</option>{targets.map((name) => <option key={name}>{name}</option>)}</> : <option value="">Main class</option>}</select>
        <button className="ide-launch-toggle" aria-label="Configure launch" title="Configure launch target and arguments" onClick={() => setShowLaunch(true)} disabled={!projectId || busy}><Settings2 size={15}/></button>
        <button className="ide-symbol-toggle" aria-label="Find Java symbol" title="Find Java symbol (Alt+Shift+O)" onClick={() => setShowSymbols(true)} disabled={!projectId || languageSnapshot.status !== 'ready'}><Search size={15}/></button>
        <button className="ide-primary" onClick={runProject} disabled={!projectId || busy || !jdk?.available}><CirclePlay size={16}/> Run</button>
        <button className="ide-visualize-action" onClick={visualizeCurrentProject} disabled={!projectId || busy || !jdk?.available} title="Record a spatial runtime trace (Alt+Shift+V)"><ScanEye size={16}/> Visualize</button>
        <button className="ide-debug-action" onClick={debugProject} disabled={!projectId || busy || !jdk?.available || !!debugSession && ['starting', 'running', 'paused'].includes(debugSession.status)} title="Start debugger (Alt+Shift+D)"><CirclePlay size={16}/> Debug</button>
        <button onClick={stopRun} disabled={run?.status !== 'running' || busy}><Square size={14}/> Stop</button>
      </div>
    </header>
    <div className="ide-status-line"><span className={jdk?.available ? 'is-ready' : 'is-error'}>{jdk?.available ? `JDK ${jdk.version ?? 'ready'}` : 'JDK unavailable'}</span><button onClick={() => setShowJdk((value) => !value)}>Configure JDK</button><details className="ide-shortcuts"><summary>Shortcuts</summary><div><strong>Workspace shortcuts</strong><p>Alt + Shift + R · Run<br/>Alt + Shift + V · Visualize<br/>Alt + Shift + D · Debug<br/>Alt + Shift + X · Stop<br/>Alt + Shift + F · Runtime Focus<br/>Alt + Shift + E · Explorer<br/>Alt + Shift + I · Inspector<br/>Alt + Shift + B · Bottom tools<br/>Ctrl / Cmd + S · Save<br/>Ctrl / Cmd + Shift + S · Save All<br/>Escape · Exit Focus outside editor</p></div></details><span className="ide-project-status" title={javaProject?.diagnostic ?? projectStatus}>{projectStatus}</span><span className={`ide-language-status ${["failed", "unavailable"].includes(languageSnapshot.status) ? "is-error" : languageSnapshot.metrics.classpathMismatch === 1 ? "is-warning" : ""}`} title={languageSnapshot.message ?? "Java language service"}>Java {languageSnapshot.status}{languageSnapshot.metrics.classpathMismatch === 1 ? ' · classpath differs' : ''}</span>{["failed", "unavailable"].includes(languageSnapshot.status) && <button className="ide-language-restart" onClick={() => void languageClient.restart()} title="Restart Java language service">Retry</button>}<span className="ide-status-spacer"/>{visualizeStatus && <span className={`ide-visualize-status ${traceStale || visualization?.status !== 'complete' && visualization ? 'is-warning' : ''}`}>{traceStale ? 'Source changed · Visualize again' : visualizeStatus}</span>}<span>{notice || (busy ? 'Working…' : 'Ready')}</span></div>
    {showJdk && <div className="ide-jdk"><label>JDK home <input value={jdkInput} placeholder="Auto-detect from PATH" onChange={(event) => setJdkInput(event.target.value)} /></label><button onClick={() => action(async () => setJdk(await bridge.detectJdk(jdkInput || null)))}>Use JDK</button><span>{jdk?.error}</span></div>}
    {debugSession && workspaceMode === 'debug' && <div className="debug-toolbar" aria-label="JVM debugger controls">
      <span className="debug-live-state">{debugSession?.status === 'paused' ? `JVM PAUSED · ${debugSession.pause?.reason.toUpperCase()} · THREAD ${debugSession.pause?.threadId}` : debugSession ? `JVM ${debugSession.status.toUpperCase()}` : 'DEBUGGER'} · {breakpoints.length} breakpoint{breakpoints.length === 1 ? '' : 's'}</span>
      <button onClick={() => debugCommand('continue')} disabled={busy || debugSession?.status !== 'paused'}>Continue</button>
      <button onClick={() => debugCommand('pause')} disabled={busy || debugSession?.status !== 'running'} title="Pause at the next project source boundary">Pause JVM</button>
      <button onClick={() => debugCommand('stepOver')} disabled={busy || debugSession?.status !== 'paused'}>Step Over</button>
      <button onClick={() => debugCommand('stepInto')} disabled={busy || debugSession?.status !== 'paused'}>Step Into</button>
      <button onClick={() => debugCommand('stepOut')} disabled={busy || debugSession?.status !== 'paused'}>Step Out</button>
      <button onClick={() => debugCommand('stop')} disabled={busy || !debugSession || !['running', 'paused', 'starting'].includes(debugSession.status)}>Stop Debug</button>
      {debugSession?.pause && <button onClick={() => navigateRuntime(visualization?.trace.events.length ?? 0, { kind: 'frame', id: `jvm:frame:${debugSession.pause!.frameId}` })}>Show live pause</button>}
      <button onClick={() => { setTool('debugger'); setBottomOpen(true); setBottomHeight(35) }}>Inspect Debugger</button>
    </div>}
    <div className="ide-main" ref={contentRef}>
      <aside className="ide-project-panel">
        <div className="ide-panel-heading"><span>PROJECT</span><span className="ide-panel-actions"><button title="New file" aria-label="Create File" onClick={() => newEntry('file')}><Plus size={15}/></button><button title="New folder" aria-label="Create Folder" onClick={() => newEntry('folder')}><FolderOpen size={15}/></button><button title="Import project" aria-label="Import Project" onClick={() => importRef.current?.click()}><Upload size={15}/></button></span></div>
        <select className="ide-project-select" aria-label="Project" disabled={busy} value={projectId} onChange={(event) => requestDecision('switching projects', tabs.map((tab) => tab.path), () => action(() => switchProject(event.target.value)))}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
        <input ref={importRef} type="file" hidden multiple {...{ webkitdirectory: '' }} onChange={(event) => importFiles(event.target.files)} />
        <button className="ide-new-project" onClick={() => action(async () => { const name = window.prompt('Project name:'); if (!name) return; const next = await bridge.createProject(name); setProjects(await bridge.projects()); requestDecision('opening the new project', tabsRef.current.map((tab) => tab.path), () => switchProject(next.id)) })}><Plus size={13}/> New project</button>
        <div className="ide-tree" aria-label="Project explorer">{renderTree(tree)}{!tree.length && <p className="ide-empty">Create a Java file to get started.</p>}</div>
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
            <div className="ide-panel-heading"><span>RUNTIME {visualization ? <small>· REAL JVM</small> : null}</span><div className="ide-runtime-heading-actions">{visualization && <button type="button" onClick={() => setInspectorHidden((value) => !value)} aria-label="Toggle inspector" aria-pressed={!inspectorHidden} title="Toggle inspector (Alt+Shift+I)"><ScanEye size={14}/></button>}{runtimeExpanded && <button type="button" onClick={() => setFocusSourceOpen((value) => !value)} aria-label={focusSourceOpen ? 'Hide source drawer' : 'Show source drawer'} title="Toggle source drawer"><Code2 size={14}/><span>Source</span></button>}{visualization && <button type="button" onClick={() => { setRuntimeExpanded((value) => !value); setFocusSourceOpen(false) }} aria-label={runtimeExpanded ? 'Restore IDE layout' : 'Expand runtime'} title={runtimeExpanded ? 'Restore IDE layout (Alt+Shift+F)' : 'Focus runtime (Alt+Shift+F)'}>{runtimeExpanded ? <><Minimize2 size={14}/><span>Exit Focus</span></> : <Maximize2 size={14}/>}</button>}</div></div>
            {visualization ? <div className="ide-runtime-live"><App trace={visualization.trace} embedded onSourceChange={handleExecutingSource} onRuntimeChange={handleRuntimeChange} navigation={runtimeNavigation} suppressInspector={tool === 'errors' && bottomOpen || inspectorHidden}/></div>
              : <div className="ide-runtime-content"><span className="ide-kicker">VISUALIZE</span><h2>{visualizeStatus || 'Explore real Java execution'}</h2><p>Save and visualize supported Java on your configured local JDK. Replay the recorded runtime in Classic, Spatial, or Theater.</p><a href="/" aria-label="Open runtime visualizer">Explore curated examples <ArrowLeft size={16} className="ide-arrow"/></a><div className="ide-runtime-mode">PERSON&nbsp; · &nbsp;RECURSION&nbsp; · &nbsp;ARRAYS&nbsp; · &nbsp;CONTROL</div></div>}
          </section>
        </div>
        <div className="ide-divider ide-divider--horizontal" role="separator" aria-label="Resize bottom panel" tabIndex={0} {...divider('bottom')}/>
        <section className="ide-bottom-panel"><div className="ide-tool-tabs"><button className="ide-bottom-toggle" onClick={() => setBottomOpen((value) => !value)} aria-label={bottomOpen ? 'Collapse bottom panel' : 'Expand bottom panel'} title="Toggle bottom panel (Alt+Shift+B)"><PanelBottom size={15}/></button>{availableTools.map((item) => <button key={item} className={tool === item && bottomOpen ? 'is-active' : ''} onClick={() => { setBottomOpen(true); setTool(item); if (item === 'errors' || item === 'debugger') setBottomHeight(35) }}>{item === 'errors' ? 'ERROR EXPLORER' : item.toUpperCase()}{item === 'problems' && problems.length > 0 && <span className="ide-badge">{problems.length}</span>}</button>)}<span className="ide-status-spacer"/>{run && <span className={`ide-process-status ${run.status === 'exited' ? exitEvent?.signal ? 'is-stopped' : run.exitCode !== 0 ? 'is-error' : '' : ''}`}>{run.status === 'running' ? '● RUNNING' : exitEvent?.signal ? `STOPPED · ${exitEvent.signal}` : `EXIT ${run.exitCode ?? '—'}`}</span>}</div>
          {tool === 'debugger' ? <DebugPanel session={debugSession} runtime={runtime} breakpoints={breakpoints} onInspect={(selection) => navigateRuntime(runtime?.cursor ?? 0, selection)} onRemove={removeBreakpoint}/>
          : tool === 'errors' ? visualization ? <ErrorExplorer key={visualization.trace.demoId} trace={visualization.trace} runtime={runtime} selection={runtimeSelection} stderr={visualization.stderr} onNavigate={navigateRuntime}/>  : <div className="debug-empty">{exception ? <><strong>{exception.type}: {exception.message}</strong><p>Run captured the actual JVM stack trace. Visualize records a new execution with inspectable runtime history.</p><button className="debug-action" disabled={busy} onClick={visualizeCurrentProject}>Record execution history</button><pre>{exception.rawStackTrace}</pre></> : <p>Visualize or debug a program to inspect its observed runtime exceptions.</p>}</div>
          : <>
          {tool === 'problems' ? <ProblemsPanel build={build} language={languageProblems} onOpen={openDiagnostic}/> : tool === 'timeline' ? <div className="ide-timeline"><span>{visualization ? 'RECORDED JVM TRACE' : 'TRACE TIMELINE'}</span><p>{visualization ? `${visualization.trace.events.length} normalized steps · ${visualization.capability.status} support · ${visualization.status.replaceAll('_', ' ')}` : 'Click Visualize to record an editable Java program, or open the curated examples.'}</p>{visualization?.diagnostic && <p>{visualization.diagnostic}</p>}{visualization && <details><summary>Visualization support</summary>{Object.entries(visualization.capability.features).filter(([, value]) => value.observedEvents || value.status !== 'supported').map(([name, value]) => <p key={name}>{value.status === 'supported' ? '✓' : value.status === 'partial' ? '⚠' : '✕'} {name}: {value.reason}</p>)}</details>}{import.meta.env.DEV && visualization && <TraceInspector trace={visualization.trace} rawEvents={visualization.rawEvents}/>}</div> : <div className="ide-console"><div className="ide-console-output" ref={consoleRef} aria-label="Program console">{build?.rawOutput && !build.success && <pre className="ide-console-stderr">{build.rawOutput}</pre>}{visualization && <><p className="ide-console-capture-note">RECORDED OUTPUT THROUGH STEP {runtime?.cursor ?? 0}</p>{runtime?.console.map((entry) => <pre key={entry.eventId} className={entry.channel === 'stderr' ? 'ide-console-stderr' : 'ide-console-stdout'}>{entry.text}</pre>)}<details className="ide-console-terminal"><summary>Full process output · includes output without proven timing</summary><pre className="ide-console-full-stdout">{visualization.stdout}</pre><pre className="ide-console-full-stderr">{visualization.stderr}</pre></details></>}{allEvents.map((event) => <pre key={event.id} className={`ide-console-${event.kind}`}>{event.kind === 'exit' ? event.signal ? `Process stopped (${event.signal}) · ${event.elapsedMs ?? 0} ms` : `Process finished with exit code ${event.exitCode ?? '—'} · ${event.elapsedMs ?? 0} ms` : event.kind === 'stdin' ? `› ${event.text}` : event.text}</pre>)}{exception && <div className="ide-stack"><strong>{exception.type}: {exception.message}</strong><details><summary>Raw JVM stack trace</summary><pre>{exception.rawStackTrace}</pre></details>{exception.frames.map((frame, index) => <button key={index} disabled={!frame.location} onClick={() => frame.location && action(() => openFile(projectId, frame.location!.path, frame.location!))}>{frame.raw}</button>)}</div>}{!allEvents.length && !visualization && !build?.rawOutput && <p className="ide-empty">Run a Java program to see stdout, stderr, input, and exit status.</p>}</div><form className="ide-console-input" onSubmit={(event) => { event.preventDefault(); sendInput() }}><span>›</span><input aria-label="Console input" placeholder={acceptsInput ? 'Send input to program…' : 'Start a program to send input'} value={input} disabled={!acceptsInput} onChange={(event) => setInput(event.target.value)}/><button disabled={!acceptsInput}>Send ↵</button></form></div>}
          </>}
        </section>
      </section>
    </div>
    {showLaunch && <LaunchDialog value={{ ...launch, mainClass }} targets={targets} onClose={() => setShowLaunch(false)} onSave={(configuration) => { setLaunch(configuration); setMainClass(configuration.mainClass); setShowLaunch(false) }}/>}
    {showSymbols && <SymbolSearch client={languageClient} onClose={() => setShowSymbols(false)} onOpen={(location) => openFile(projectIdRef.current, location.path, location)}/>}
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
