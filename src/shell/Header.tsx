import { Box, Bug, ChevronDown, Crosshair, Home, MousePointer2, Play, Route, Search, Square } from 'lucide-react'
import { navigationActions, useNavigationStore } from '../navigation'
import type { AppState } from '../state/appState'
import type { useWorkspace } from '../workspace/useWorkspace'

type Workspace = ReturnType<typeof useWorkspace>
export function Header({ workspace, appState, recordingChoices }: { workspace: Workspace; appState: AppState; recordingChoices?: React.ReactNode }) {
  const { projectId, projects, busy, jdk, runtimeSelection, invoke, commands, commandContext } = workspace
  const mode = useNavigationStore(state => state.mode)
  const button = (id: 'execution.run' | 'debug.startOrContinue' | 'execution.stop', title: string, icon: React.ReactNode) => {
    const availability = commands.availability(id, commandContext())
    const reason = busy ? 'Wait for the current operation' : !jdk?.available && id !== 'execution.stop' ? 'Configure a JDK first' : availability.enabled ? null : availability.reason
    return <button className={id === 'execution.run' ? 'shell-run' : ''} aria-label={title} aria-disabled={!!reason} title={reason ?? title} onClick={() => { if (!reason) invoke(id, {}) }}>{icon}<span>{title}</span></button>
  }
  const modes = [
    { title: 'Explore', icon: <MousePointer2 size={16}/>, active: !['FOCUS_ENTITY','TRACE_PATH','HOME'].includes(mode), action: navigationActions.freeExplore },
    { title: 'Focus', icon: <Crosshair size={16}/>, active: mode === 'FOCUS_ENTITY', action: () => { if (runtimeSelection) navigationActions.focus(runtimeSelection) }, unavailable: !runtimeSelection ? 'Select an entity to Focus' : null },
    { title: 'Trace', icon: <Route size={16}/>, active: mode === 'TRACE_PATH', action: () => useNavigationStore.setState({mode: 'TRACE_PATH', followEnabled: false}) },
    { title: 'Home', icon: <Home size={16}/>, active: mode === 'HOME', action: navigationActions.home },
  ]
  return <header className="shell-header">
    <div className="shell-brand"><span className="shell-brand-cube"><Box size={40} strokeWidth={1.15}/></span><div><strong>GGJavaEZ</strong><small>Explore Java execution in 3D</small></div></div>
    <button className="shell-project" title="Open command palette" aria-label="Search commands" onClick={() => invoke(projectId ? 'workbench.explorer' : 'workbench.commandPalette', {})}><Search size={15}/><span>{projects.find(project => project.id === projectId)?.name ?? 'Open Project'}</span></button>
    {recordingChoices && <div className="shell-recording-choices">{recordingChoices}</div>}
    <span className="shell-state" data-state={appState.execution} role="status" title={[appState.label, ...appState.badges].join(' · ')}>{appState.label}</span>
    <div className="shell-run-cluster" role="group" aria-label="Run and Debug">
      {button('execution.run', 'Run', <Play size={15}/>)}
      {button('debug.startOrContinue', 'Debug', <Bug size={15}/>)}
      {button('execution.stop', 'Stop', <Square size={13}/>)}
      <button title="Launch settings" aria-label="Launch settings" onClick={() => invoke('workbench.launch', {})}><ChevronDown size={14}/></button>
    </div>
    <nav className="shell-modes" aria-label="World navigation">{modes.map(item => <button key={item.title} aria-label={item.title} aria-pressed={item.active} aria-disabled={!!item.unavailable} title={item.unavailable ?? item.title} onClick={() => { if (!item.unavailable) item.action() }}>{item.icon}<span>{item.title}</span></button>)}</nav>
  </header>
}
