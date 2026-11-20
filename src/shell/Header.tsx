import { Box, Bug, ChevronDown, Crosshair, Home, MousePointer2, Play, Route, Search, Square } from 'lucide-react'
import {Fragment,useId,useRef,useState} from 'react'
import { useCameraStore } from '../camera/cameraStore'
import { useInteractionStore } from '../interaction/interactionStore'
import {ideCommandDefinitions,type IdeCommandId} from '../ide/commands'
import {formatShortcut} from '../ide/shortcuts'
import type { AppState } from '../state/appState'
import type { useWorkspace } from '../workspace/useWorkspace'
import {HeaderProjectMenu,type RecordingChoices} from './HeaderProjectMenu'
import {AppStateBadge} from './AppStateBadge'
import {CommandTooltip} from './CommandTooltip'

type Workspace = ReturnType<typeof useWorkspace>
export function Header({ workspace, appState, recordingChoices }: { workspace: Workspace; appState: AppState; recordingChoices?: RecordingChoices }) {
  const { projectId, projects, busy, jdk, invoke, commands, commandContext } = workspace
  const [menu,setMenu]=useState<{x:number;y:number}|null>(null),projectButton=useRef<HTMLButtonElement>(null),header=useRef<HTMLElement>(null),descriptions=useId()
  const mode = useCameraStore(state => state.mode)
  const focus=useInteractionStore(state=>state.focus)
  useInteractionStore(state=>state.selection)
  const activeMode=focus?'FOCUS':mode
  const launchName=workspace.mainClass||'Automatic main'
  const button = (id: IdeCommandId, title: string, icon: React.ReactNode, options:{className?:string;pressed?:boolean;text?:string}={}) => {
    const availability = commands.availability(id, commandContext())
    const lifecycle=id==='execution.run'||id==='debug.startOrContinue'||id==='execution.stop'
    const reason = lifecycle&&busy ? 'Wait for the current operation' : lifecycle&&!jdk?.available&&id!=='execution.stop' ? 'Configure a JDK first' : availability.enabled ? null : availability.reason
    const definition=ideCommandDefinitions[id],shortcut=definition.bindings[0]?formatShortcut(definition.bindings[0],workspace.platform):'',description=`${descriptions}-${id}`
    const tooltip=[title,definition.title!==title?definition.title:'',shortcut,id==='workbench.launch'?launchName:'',reason].filter(Boolean).join(' · ')
    return <Fragment key={id}><button className={options.className} aria-label={title} aria-pressed={options.pressed} aria-disabled={!!reason} aria-describedby={reason?description:undefined} data-command-tooltip={tooltip} onClick={() => { if (!reason) invoke(id, {}) }}>{icon}<span className="shell-command-label">{options.text??title}</span></button>{reason&&<span id={description} className="shell-accessible-description">{reason}</span>}</Fragment>
  }
  const modes = [
    { title: 'Explore', icon: <MousePointer2 size={16}/>, active: activeMode === 'EXPLORE', id:'navigation.explore' },
    { title: 'Focus', icon: <Crosshair size={16}/>, active: activeMode==='FOCUS', id:focus?'navigation.exitFocus':'navigation.focusSelection' },
    { title: 'Trace', icon: <Route size={16}/>, active: activeMode === 'TRACE', id:'navigation.traceRelevant' },
    { title: 'Home', icon: <Home size={16}/>, active: activeMode === 'HOME', id:'navigation.home' },
  ]
  const projectLabel=recordingChoices?recordingChoices.options.find(option=>option.id===recordingChoices.value)?.label??'Recordings':projects.find(project=>project.id===projectId)?.name??'Open Project'
  return <header ref={header} className="shell-header">
    <div className="shell-brand"><span className="shell-brand-cube"><Box size={40} strokeWidth={1.15}/></span><div><strong>GGJavaEZ</strong><small>Explore Java execution in 3D</small></div></div>
    <button ref={projectButton} className="shell-project" data-command-tooltip={`Project menu · ${projectLabel} · ${recordingChoices?'Recordings':'Project actions'}${busy?' · Wait for the current operation':''}`} aria-label="Project menu" aria-haspopup="menu" aria-expanded={!!menu} aria-disabled={busy} aria-describedby={busy?`${descriptions}-project`:undefined} data-project-id={projectId} data-recording-id={recordingChoices?.value} onClick={event=>{if(!busy){const rect=event.currentTarget.getBoundingClientRect();setMenu(value=>value?null:{x:rect.left,y:rect.bottom+8})}}}><Search size={15}/><span>{projectLabel}</span><ChevronDown size={12}/></button>
    {busy&&<span id={`${descriptions}-project`} className="shell-accessible-description">Wait for the current operation</span>}
    {menu&&<HeaderProjectMenu workspace={workspace} recordings={recordingChoices} position={menu} anchor={projectButton} onClose={()=>setMenu(null)}/>}
    <AppStateBadge state={appState} sourceChanged={workspace.traceStale}/>
    <div className="shell-run-cluster" role="group" aria-label="Run and Debug">
      {button('execution.run', 'Run', <Play size={15}/>,{className:'shell-run'})}
      {button('debug.startOrContinue', 'Debug', <Bug size={15}/>,{className:'shell-run-icon'})}
      {button('execution.stop', 'Stop', <Square size={13}/>,{className:'shell-run-icon'})}
      {button('workbench.launch','Launch settings',<ChevronDown size={14}/>,{className:'shell-launch',text:launchName})}
    </div>
    <nav className="shell-modes" aria-label="World navigation">{modes.map(item=>button(item.id as IdeCommandId,item.title,item.icon,{pressed:item.active}))}</nav>
    <CommandTooltip root={header}/>
  </header>
}
