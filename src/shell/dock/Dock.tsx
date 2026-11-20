import {useRef,useState,type ReactNode} from 'react'
import {Bug,Check,ChevronDown,Circle,CircleSlash,LoaderCircle,Terminal,TriangleAlert,X} from 'lucide-react'
import type {Tool} from '../../workspace/workspaceTypes'
import type {useWorkspace} from '../../workspace/useWorkspace'
import type {TraceDocument} from '../../contracts/runtime'
import {shell} from '../../theme/tokens'
import {CommandTooltip} from '../CommandTooltip'
import {StatusPopover} from './StatusPopover'
import {useDockCounts} from './useDockCounts'
const tools:{id:Tool;label:string;icon:ReactNode;description:string}[]=[
 {id:'console',label:'Console',icon:<Terminal size={14}/>,description:'Output rows, including retained process output'},
 {id:'problems',label:'Problems',icon:<TriangleAlert size={14}/>,description:'Compiler and language diagnostics'},
 {id:'debugger',label:'Debug',icon:<Bug size={14}/>,description:'Breakpoints, paused stack frames and recorded variables'},
 {id:'errors',label:'Errors',icon:<CircleSlash size={14}/>,description:'Recorded exceptions'},
]
export function Dock({workspace,recording,children,drawerBottom,viewportHeight}:{workspace:ReturnType<typeof useWorkspace>;recording?:TraceDocument;children:ReactNode;drawerBottom:number;viewportHeight:number}){
 const {tool,bottomOpen,bottomHeight,setBottomHeight,bottomPinned,setBottomOpen,setTool,languageSnapshot}=workspace
 const counts=useDockCounts(workspace,recording),[statusOpen,setStatusOpen]=useState(false),status=useRef<HTMLButtonElement>(null),strip=useRef<HTMLElement>(null)
 const current=tools.find(item=>item.id===tool)!,languageStatus=languageSnapshot.status
 const StatusIcon=languageStatus==='ready'?Check:languageStatus==='starting'?LoaderCircle:languageStatus==='failed'?TriangleAlert:languageStatus==='unavailable'?CircleSlash:Circle
 const resize=(height:number)=>{bottomPinned.current=true;setBottomHeight(Math.max(shell.dock.drawer.min*100,Math.min(shell.dock.drawer.max*100,height)))}
 return <>
  <section className="shell-dock-drawer glass" role="region" aria-label={`${current.label} drawer`} hidden={!bottomOpen}>
   <div className="shell-dock-resize" role="separator" aria-label="Resize Dock drawer" aria-orientation="horizontal" aria-valuemin={20} aria-valuemax={45} aria-valuenow={bottomHeight} tabIndex={0}
    onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId)}}
    onPointerMove={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))resize((drawerBottom-event.clientY)/viewportHeight*100)}}
    onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}
    onKeyDown={event=>{if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();resize(event.key==='Home'?20:event.key==='End'?45:bottomHeight+(event.key==='ArrowUp'?2:-2))}}}/>
   <div className="shell-dock-heading"><strong>{current.label} <span>{counts[tool]}</span></strong><button aria-label={`Close ${current.label} drawer`} onClick={()=>{bottomPinned.current=false;setBottomOpen(false)}}><X size={15}/></button></div>
   {children}
  </section>
  <nav ref={strip} className="shell-dock-strip" aria-label="Dock">
   <div className="shell-dock-toggles">{tools.map(item=><button key={item.id} aria-label={item.id==='debugger'?'Debug drawer':item.label} aria-expanded={bottomOpen&&tool===item.id} data-dock-tool={item.id} data-command-tooltip={`${item.label} · ${counts[item.id]} · ${item.description}`} onClick={()=>{const open=!(bottomOpen&&tool===item.id);bottomPinned.current=open;setTool(item.id);setBottomOpen(open)}}>{item.icon}<span>{item.label}</span><span className="shell-dock-count">{counts[item.id]}</span></button>)}</div>
   <button ref={status} className="shell-dock-status" data-status-problem={!workspace.jdk?.available||['failed','unavailable'].includes(languageStatus)||languageSnapshot.metrics.classpathMismatch===1} aria-label={`Java language service ${languageStatus}`} aria-haspopup="dialog" aria-expanded={statusOpen} data-command-tooltip={`Java language service ${languageStatus} · Show workspace status`} onClick={()=>setStatusOpen(value=>!value)}><StatusIcon size={14}/><span>Java tools {languageStatus}</span><ChevronDown size={12}/></button>
   {!statusOpen&&<CommandTooltip root={strip}/>}
  </nav>
  {statusOpen&&<StatusPopover workspace={workspace} anchor={status} onClose={()=>setStatusOpen(false)}/>}
 </>
}
