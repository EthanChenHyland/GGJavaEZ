import {ArrowDownToLine,ArrowUpFromLine,CornerDownRight,PanelBottom,Pause,Play,Square} from 'lucide-react'
import type {IdeCommandId} from '../ide/commands'
import type {useWorkspace} from '../workspace/useWorkspace'

/** All debugger controls share the shortcut command registry and one fixed row. */
export function DebugBar({workspace}:{workspace:ReturnType<typeof useWorkspace>}) {
 const {debugSession,execution,commands,commandContext,invoke,busy}=workspace
 const paused=debugSession?.status==='paused'
 const items:{id:IdeCommandId;label:string;shortcut?:string;icon:React.ReactNode}[]=[
  paused?{id:'debug.startOrContinue',label:'Continue',shortcut:'F5',icon:<Play size={17}/>}:{id:'debug.pause',label:'Pause',icon:<Pause size={17}/>},
  {id:'debug.stepOver',label:'Step Over',shortcut:'F10',icon:<CornerDownRight size={17}/>},
  {id:'debug.stepInto',label:'Step Into',shortcut:'F11',icon:<ArrowDownToLine size={17}/>},
  {id:'debug.stepOut',label:'Step Out',shortcut:'Shift+F11',icon:<ArrowUpFromLine size={17}/>},
  {id:'execution.stop',label:'Stop debugger',icon:<Square size={15}/>},
  {id:'workbench.debugger',label:'Inspect debugger',icon:<PanelBottom size={17}/>},
 ]
 return <div className="debug-toolbar" role="toolbar" aria-label="JVM debugger controls">
  <span className="shell-visually-hidden" role="status">{paused?`Paused · ${debugSession.pause?.reason??'checkpoint'}`:`Debugging · ${execution?.phase??'starting'}`}</span>
  {items.map(item=>{
   const availability=commands.availability(item.id,commandContext())
   const reason=busy?'Wait for the current operation':availability.enabled?null:availability.reason
   const reasonId=`debug-reason-${item.id}`
   return <button key={item.id} type="button" data-command={item.id} aria-label={item.label} aria-disabled={!!reason} aria-describedby={reason?reasonId:undefined} title={reason??`${item.label}${item.shortcut?` (${item.shortcut})`:''}`} onClick={()=>{if(!reason)invoke(item.id,{})}}>
    {item.icon}{reason&&<span id={reasonId} className="shell-visually-hidden">{reason}</span>}
   </button>
  })}
 </div>
}
