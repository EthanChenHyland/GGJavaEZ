import type {RefObject} from 'react'
import {CommandMenu,type CommandMenuItem} from './dialogs/CommandMenu'
import {ideCommandDefinitions,type IdeCommandId} from '../ide/commands'
import {formatShortcut} from '../ide/shortcuts'
import type {useWorkspace} from '../workspace/useWorkspace'
export interface RecordingChoices {value:string;options:readonly {id:string;label:string}[];onSelect(id:string):void}
type Workspace=ReturnType<typeof useWorkspace>
const actions:readonly IdeCommandId[]=['workbench.newProject','workbench.importProject','workbench.quickOpen','workbench.commandPalette','workbench.launch','workbench.explorer','explorer.reveal','workbench.jdk','workbench.restartJava']
export function HeaderProjectMenu({workspace,recordings,position,anchor,onClose}:{workspace:Workspace;recordings?:RecordingChoices;position:{x:number;y:number};anchor:RefObject<HTMLElement|null>;onClose():void}){
 const context=(id:IdeCommandId)=>workspace.commandContext(id==='explorer.reveal'?workspace.active:undefined)
 const items:CommandMenuItem[]=recordings?[
  ...recordings.options.map(option=>({id:'recording:'+option.id,label:option.label,enabled:option.id!==recordings.value,...(option.id===recordings.value?{reason:'Current recording'}:{})})),
  {id:'workspace',label:'Open Java workspace',enabled:true},
 ]:[
  ...actions.map(id=>{const definition=ideCommandDefinitions[id];return{id,label:definition.title,description:id==='workbench.importProject'?'Creates a managed copy; originals stay in place.':undefined,shortcut:definition.bindings[0]?formatShortcut(definition.bindings[0],workspace.platform):undefined,...(workspace.busy?{enabled:false,reason:'Wait for the current operation'}:workspace.commands.availability(id,context(id)))}}),
  ...workspace.projects.map(project=>({id:'project:'+project.id,label:'Open '+project.name,enabled:!workspace.busy&&project.id!==workspace.projectId,reason:workspace.busy?'Wait for the current operation':project.id===workspace.projectId?'Current project':undefined})),
 ]
 return <CommandMenu label={recordings?'Recordings':'Project actions'} {...position} anchor={anchor} items={items} onClose={onClose} onChoose={id=>{
  onClose()
  requestAnimationFrame(()=>{
   if(id.startsWith('recording:')){const value=id.slice('recording:'.length);if(recordings?.options.some(option=>option.id===value))recordings.onSelect(value);return}
   if(id==='workspace'){window.location.assign('/');return}
   if(id.startsWith('project:')){
    const next=id.slice('project:'.length)
    if(workspace.projects.some(project=>project.id===next))workspace.requestDecision('switching projects',workspace.tabs.map(tab=>tab.path),()=>workspace.action(()=>workspace.switchProject(next)))
    return
   }
   const command=id as IdeCommandId
   void workspace.commands.execute(command,context(command),{}).catch(workspace.fail)
  })
 }}/>
}
