import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, CirclePlay, FolderOpen, Hammer, Maximize2, Minimize2, Plus, Save, ScanEye, Square, Upload, X } from 'lucide-react'
import { App } from '../app/App'
import type { SourceLocation as RuntimeSourceLocation, TraceDocument } from '../contracts/runtime'
import type { RawRuntimeEvent, VisualizationCapabilityReport } from '../instrumentation/contracts'
import { bridge } from './client'
import { visualizeProject } from './visualize'
import { EditableJavaEditor } from './EditableJavaEditor'
import { TraceInspector } from './TraceInspector'
import { ProblemsPanel } from './ProblemsPanel'
import type { BuildResult, CompileDiagnostic, JdkStatus, ProjectEntry, ProjectFile, ProjectSummary, RunEvent, RunSnapshot, SourceLocation } from './contracts'
import './ide.css'

type Tab = ProjectFile & { draft: string }
type Tool = 'console' | 'problems' | 'timeline'
type PendingDecision = { label: string; paths: string[]; action: () => void | Promise<void> } | null
const draftKey = (id: string, path: string) => `ggjavaez:draft:${id}:${path}`
const sessionKey = (id: string) => `ggjavaez:session:${id}`
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
  const [input, setInput] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingDecision>(null)
  const [hydrated, setHydrated] = useState(false)
  const [nav, setNav] = useState<SourceLocation | null>(null)
  const [mainClass, setMainClass] = useState('')
  const [visualization, setVisualization] = useState<{ trace: TraceDocument; capability: VisualizationCapabilityReport; rawEvents: RawRuntimeEvent[]; status: string; stdout: string; stderr: string; diagnostic: string | null } | null>(null)
  const [visualizeStatus, setVisualizeStatus] = useState('')
  const [runtimeExpanded, setRuntimeExpanded] = useState(false)
  const [executingSource, setExecutingSource] = useState<RuntimeSourceLocation | null>(null)
  const [projectWidth, setProjectWidth] = useState(19)
  const [editorWidth, setEditorWidth] = useState(55)
  const [bottomHeight, setBottomHeight] = useState(28)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const shellRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const upperRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<Tab[]>([])
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
  const allEvents = run?.events ?? []
  const exitEvent = run?.events.at(-1)?.kind === 'exit' ? run.events.at(-1) : undefined
  const exception = run?.exception ?? [...allEvents].reverse().find((event) => event.exception)?.exception
  const traceStale = !!visualization && tabs.some((tab) => visualization.trace.sourceFiles.find((file) => file.fileId === tab.path)?.content !== tab.draft)

  const fail = (error: unknown) => setNotice(errorText(error))
  const refreshTree = useCallback(async (id: string) => setTree(await bridge.tree(id)), [])

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

  const switchProject = useCallback(async (nextId: string, stopExisting = true) => {
    if (stopExisting) {
      const current = await bridge.currentRun()
      if (current?.status === 'running') await bridge.stop(current.runId)
    }
    setProjectId(nextId)
    setTabs([])
    setActive('')
    setBuild(null)
    setRun(null)
    setVisualization(null)
    setVisualizeStatus('')
    setRuntimeExpanded(false)
    setExecutingSource(null)
    setMainClass('')
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
    let alive = true
    Promise.all([bridge.projects(), bridge.health(), bridge.currentRun()]).then(async ([items, health, current]) => {
      if (!alive) return
      setProjects(items)
      setJdk(health.jdk)
      setJdkInput(health.jdk.home ?? '')
      const chosen = items.find((item) => item.id === localStorage.getItem('ggjavaez:project')) ?? items[0]
      if (chosen) await switchProject(chosen.id, false)
      if (current && current.projectId === chosen?.id) setRun(current)
      else if (current?.status === 'running') await bridge.stop(current.runId)
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
    await saveAll()
    const result = await bridge.build(projectId)
    setBuild(result)
    setMainClass((previous) => result.mainClasses.includes(previous) ? previous : result.mainClasses[0] ?? '')
    setTool(result.success ? 'console' : 'problems')
    setNotice(result.success ? `Build succeeded in ${result.elapsedMs} ms` : `${result.diagnostics.length} compiler problem${result.diagnostics.length === 1 ? '' : 's'}`)
  })
  const runProject = () => action(async () => {
    await saveAll()
    setVisualization(null)
    setRuntimeExpanded(false)
    setVisualizeStatus('')
    setExecutingSource(null)
    const result = await bridge.run(projectId, mainClass)
    setBuild(result.build)
    setMainClass(result.run?.mainClass ?? result.build.mainClasses[0] ?? '')
    setRun(result.run)
    setTool(result.run ? 'console' : 'problems')
    if (!result.run) setNotice(result.build.success ? 'Build succeeded; no public static main(String[]) entry point found.' : 'Compilation failed. See Problems for the exact javac output.')
  })
  const visualizeCurrentProject = () => action(async () => {
    setVisualization(null)
    setRun(null)
    setVisualizeStatus('Checking support and saving…')
    await saveAll()
    setVisualizeStatus('Compiling and recording on the local JVM…')
    const result = await visualizeProject(projectId, mainClass)
    setBuild(result.response.build)
    setMainClass(result.response.build.mainClasses.includes(mainClass) ? mainClass : result.response.build.mainClasses[0] ?? '')
    if (!result.trace || !result.capability) {
      setTool('problems')
      setVisualizeStatus(result.response.status === 'compile_failed' ? 'Compile failed' : 'Visualization unavailable')
      setNotice(result.response.diagnostic ?? 'See Problems for compiler details.')
      return
    }
    setVisualization({ trace: result.trace, capability: result.capability, rawEvents: result.response.rawEvents,
      status: result.response.status, stdout: result.response.stdout, stderr: result.response.stderr,
      diagnostic: result.response.diagnostic })
    setProjectWidth((width) => Math.min(width, 15))
    setEditorWidth((width) => Math.min(width, 38))
    setBottomHeight((height) => Math.min(height, 18))
    setVisualizeStatus(result.response.status === 'complete' ? 'Ready to explore' : `Trace captured · ${result.response.status.replaceAll('_', ' ')}`)
    setNotice(result.response.status === 'complete'
      ? `${result.response.rawEvents.length} observed JVM events · normalized in ${Math.round(result.normalizeMs)} ms`
      : result.response.diagnostic ?? `Execution ${result.response.status.replaceAll('_', ' ')}; inspect the available trace.`)
  })
  const handleExecutingSource = useCallback((location: RuntimeSourceLocation | null) => {
    setExecutingSource(location)
    if (!location || location.fileId === activeRef.current || requestedSourceRef.current === location.fileId) return
    const id = projectIdRef.current
    requestedSourceRef.current = location.fileId
    void openFile(id, location.fileId).catch(fail).finally(() => { requestedSourceRef.current = '' })
  }, [openFile])
  const stopRun = () => action(async () => { if (run) setRun(await bridge.stop(run.runId)) })
  const sendInput = () => action(async () => { if (!run) return; await bridge.input(run.runId, input + '\n'); setInput('') })
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
    const sources = await Promise.all(Array.from(files).filter((file) => file.name.endsWith('.java')).map(async (file) => ({ path: file.webkitRelativePath || file.name, content: await file.text() })))
    if (!sources.length) throw new Error('Choose a folder containing .java files')
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
        else setEditorWidth(Math.max(37, Math.min(75, pct)))
      }
    }
  }
  const divider = (kind: 'project' | 'runtime' | 'bottom') => ({
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      const amount = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 2 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -2 : 0
      if (!amount) return
      event.preventDefault()
      if (kind === 'project') setProjectWidth((value) => Math.max(13, Math.min(28, value + amount)))
      else if (kind === 'runtime') setEditorWidth((value) => Math.max(37, Math.min(75, value + amount)))
      else setBottomHeight((value) => Math.max(16, Math.min(55, value - amount)))
    },
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => event.currentTarget.setPointerCapture(event.pointerId),
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setDivider(kind, event.clientX, event.clientY) },
  })
  const renderTree = (items: ProjectEntry[], depth = 0): React.ReactNode => items.map((item) => <div key={item.path}>
    <div className={`ide-tree-row ${active === item.path ? 'is-active' : ''}`} style={{ paddingLeft: 12 + depth * 15 }}>
      <button className="ide-tree-name" onClick={() => item.kind === 'file' ? action(() => openFile(projectId, item.path)) : setCollapsed((previous) => { const next = new Set(previous); if (next.has(item.path)) next.delete(item.path); else next.add(item.path); return next })} title={item.path}>
        {item.kind === 'directory' ? collapsed.has(item.path) ? <ChevronRight size={13} /> : <ChevronDown size={13} /> : <span className="ide-java-icon">J</span>}{item.name}
      </button>
      <button className="ide-entry-more" aria-label={`Rename ${item.path}`} title="Rename" onClick={() => renameEntry(item.path)}>✎</button>
      <button className="ide-entry-more" aria-label={`Delete ${item.path}`} title="Delete" onClick={() => deleteEntry(item.path)}>×</button>
    </div>
    {item.kind === 'directory' && !collapsed.has(item.path) && item.children && renderTree(item.children, depth + 1)}
  </div>)

  return <div className={`ide-shell ${runtimeExpanded ? 'ide-shell--runtime-expanded' : ''}`} ref={shellRef} style={{ '--ide-project-width': `${projectWidth}%`, '--ide-editor-width': `${editorWidth}%`, '--ide-bottom-height': `${bottomHeight}%` } as React.CSSProperties}>
    <header className="ide-topbar">
      <div className="ide-brand"><span className="ide-mark">VJ</span><span><strong>Visual Java</strong><small>IDE WORKSPACE</small></span></div>
      <div className="ide-topbar-center"><span className="ide-breadcrumb">{projects.find((item) => item.id === projectId)?.name ?? 'Loading project'} <span>/</span> {active || 'Project'}</span></div>
      <div className="ide-top-actions">
        <button onClick={() => activeTab && action(() => saveTab(activeTab))} disabled={!activeTab || activeTab.draft === activeTab.content || busy} title="Save active file (⌘/Ctrl+S)"><Save size={15}/> Save</button>
        <button onClick={() => action(saveAll)} disabled={!dirty || busy} title="Save all open files"><Save size={15}/> Save All{dirty ? ' •' : ''}</button>
        <button onClick={buildProject} disabled={!projectId || busy}><Hammer size={15}/> Build</button>
        <select aria-label="Main class" value={mainClass} onChange={(event) => setMainClass(event.target.value)} disabled={!build?.mainClasses.length}>{build?.mainClasses.length ? build.mainClasses.map((name) => <option key={name}>{name}</option>) : <option value="">Main class</option>}</select>
        <button className="ide-primary" onClick={runProject} disabled={!projectId || busy || !jdk?.available}><CirclePlay size={16}/> Run</button>
        <button className="ide-visualize-action" onClick={visualizeCurrentProject} disabled={!projectId || busy || !jdk?.available}><ScanEye size={16}/> Visualize</button>
        <button onClick={stopRun} disabled={run?.status !== 'running' || busy}><Square size={14}/> Stop</button>
      </div>
    </header>
    <div className="ide-status-line"><span className={jdk?.available ? 'is-ready' : 'is-error'}>{jdk?.available ? `JDK ${jdk.version ?? 'ready'}` : 'JDK unavailable'}</span><button onClick={() => setShowJdk((value) => !value)}>Configure JDK</button><span className="ide-status-spacer"/>{visualizeStatus && <span className={`ide-visualize-status ${traceStale || visualization?.status !== 'complete' && visualization ? 'is-warning' : ''}`}>{traceStale ? 'Source changed · Visualize again' : visualizeStatus}</span>}<span>{notice || (busy ? 'Working…' : 'Edit real Java · Run on your local JVM')}</span></div>
    {showJdk && <div className="ide-jdk"><label>JDK home <input value={jdkInput} placeholder="Auto-detect from PATH" onChange={(event) => setJdkInput(event.target.value)} /></label><button onClick={() => action(async () => setJdk(await bridge.detectJdk(jdkInput || null)))}>Use JDK</button><span>{jdk?.error}</span></div>}
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
            <div className="ide-tabs" role="tablist">{tabs.map((tab) => <div key={tab.path} className={`ide-tab ${active === tab.path ? 'is-active' : ''}`} role="tab" aria-selected={active === tab.path}><button onClick={() => setActive(tab.path)} title={tab.path}><span className="ide-java-icon">J</span>{filename(tab.path)}{tab.draft !== tab.content && <span className="ide-dirty"/>}</button><button aria-label={`Close ${tab.path}`} onClick={() => closeTab(tab.path)}><X size={13}/></button></div>)}</div>
            <div className="ide-editor-body">{activeTab ? <EditableJavaEditor key={`${projectId}:${activeTab.path}`} projectId={projectId} path={activeTab.path} value={activeTab.draft} onChange={(value) => edit(activeTab.path, value)} diagnostics={diagnostics} navigate={nav} executingLine={!traceStale && activeTab.path === executingSource?.fileId ? executingSource.line : null} onSave={() => action(() => saveTab(tabsRef.current.find((item) => item.path === activeTab.path)!))}/> : <div className="ide-editor-empty"><span>JAVA SOURCE</span><h2>Choose a file to edit</h2><p>Open a Java file from the project explorer, or create a new one.</p></div>}</div>
            <div className="ide-editor-foot"><span>{active || 'No file selected'}</span><span>Java · UTF-8 · {activeTab?.draft.split('\n').length ?? 0} lines</span></div>
          </div>
          <div className="ide-divider ide-divider--vertical" role="separator" aria-label="Resize runtime pane" tabIndex={0} {...divider('runtime')}/>
          <section className="ide-runtime-panel" aria-label="Runtime visualization area">
            <div className="ide-panel-heading"><span>RUNTIME</span><div className="ide-runtime-heading-actions"><span>{visualization ? `REAL JVM · ${visualization.capability.status.toUpperCase()}` : 'CLASSIC · SPATIAL · THEATER'}</span>{visualization && <button type="button" onClick={() => setRuntimeExpanded((value) => !value)} aria-label={runtimeExpanded ? 'Restore IDE layout' : 'Expand runtime'} title={runtimeExpanded ? 'Restore IDE layout' : 'Expand runtime'}>{runtimeExpanded ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</button>}</div></div>
            {visualization ? <div className="ide-runtime-live"><App trace={visualization.trace} embedded onSourceChange={handleExecutingSource} /></div>
              : <div className="ide-runtime-content"><span className="ide-kicker">VISUALIZE</span><h2>{visualizeStatus || 'Explore real Java execution'}</h2><p>Save and visualize supported Java on your configured local JDK. Replay the recorded runtime in Classic, Spatial, or Theater.</p><a href="/" aria-label="Open runtime visualizer">Explore curated examples <ArrowLeft size={16} className="ide-arrow"/></a><div className="ide-runtime-mode">PERSON&nbsp; · &nbsp;RECURSION&nbsp; · &nbsp;ARRAYS&nbsp; · &nbsp;CONTROL</div></div>}
          </section>
        </div>
        <div className="ide-divider ide-divider--horizontal" role="separator" aria-label="Resize bottom panel" tabIndex={0} {...divider('bottom')}/>
        <section className="ide-bottom-panel"><div className="ide-tool-tabs">{(['console', 'problems', 'timeline'] as Tool[]).map((item) => <button key={item} className={tool === item ? 'is-active' : ''} onClick={() => setTool(item)}>{item.toUpperCase()}{item === 'problems' && diagnostics.length > 0 && <span className="ide-badge">{diagnostics.length}</span>}</button>)}<span className="ide-status-spacer"/>{run && <span className={`ide-process-status ${run.status === 'exited' ? exitEvent?.signal ? 'is-stopped' : run.exitCode !== 0 ? 'is-error' : '' : ''}`}>{run.status === 'running' ? '● RUNNING' : exitEvent?.signal ? `STOPPED · ${exitEvent.signal}` : `EXIT ${run.exitCode ?? '—'}`}</span>}</div>
          {tool === 'problems' ? <ProblemsPanel build={build} onOpen={openDiagnostic}/> : tool === 'timeline' ? <div className="ide-timeline"><span>{visualization ? 'RECORDED JVM TRACE' : 'TRACE TIMELINE'}</span><p>{visualization ? `${visualization.trace.events.length} normalized steps · ${visualization.capability.status} support · ${visualization.status.replaceAll('_', ' ')}` : 'Click Visualize to record an editable Java program, or open the curated examples.'}</p>{visualization?.diagnostic && <p>{visualization.diagnostic}</p>}{visualization && <details><summary>Visualization support</summary>{Object.entries(visualization.capability.features).filter(([, value]) => value.observedEvents || value.status !== 'supported').map(([name, value]) => <p key={name}>{value.status === 'supported' ? '✓' : value.status === 'partial' ? '⚠' : '✕'} {name}: {value.reason}</p>)}</details>}{import.meta.env.DEV && visualization && <TraceInspector trace={visualization.trace} rawEvents={visualization.rawEvents}/>}</div> : <div className="ide-console"><div className="ide-console-output" ref={consoleRef} aria-label="Program console">{build?.rawOutput && !build.success && <pre className="ide-console-stderr">{build.rawOutput}</pre>}{visualization && <><p className="ide-console-capture-note">FULL RUN OUTPUT · SEPARATE FROM TIMELINE</p><pre className="ide-console-stdout">{visualization.stdout}</pre><pre className="ide-console-stderr">{visualization.stderr}</pre></>}{allEvents.map((event) => <pre key={event.id} className={`ide-console-${event.kind}`}>{event.kind === 'exit' ? event.signal ? `Process stopped (${event.signal}) · ${event.elapsedMs ?? 0} ms` : `Process finished with exit code ${event.exitCode ?? '—'} · ${event.elapsedMs ?? 0} ms` : event.kind === 'stdin' ? `› ${event.text}` : event.text}</pre>)}{exception && <div className="ide-stack"><strong>{exception.type}: {exception.message}</strong><details><summary>Raw JVM stack trace</summary><pre>{exception.rawStackTrace}</pre></details>{exception.frames.map((frame, index) => <button key={index} disabled={!frame.location} onClick={() => frame.location && action(() => openFile(projectId, frame.location!.path, frame.location!))}>{frame.raw}</button>)}</div>}{!allEvents.length && !visualization && !build?.rawOutput && <p className="ide-empty">Run a Java program to see stdout, stderr, input, and exit status.</p>}</div><form className="ide-console-input" onSubmit={(event) => { event.preventDefault(); sendInput() }}><span>›</span><input aria-label="Console input" placeholder={run?.status === 'running' ? 'Send input to program…' : 'Start a program to send input'} value={input} disabled={run?.status !== 'running'} onChange={(event) => setInput(event.target.value)}/><button disabled={run?.status !== 'running'}>Send ↵</button></form></div>}
        </section>
      </section>
    </div>
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
