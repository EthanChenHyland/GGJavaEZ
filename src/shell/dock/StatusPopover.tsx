import {useLayoutEffect,useRef,type RefObject} from 'react'
import {X} from 'lucide-react'
import type {useWorkspace} from '../../workspace/useWorkspace'
import {SurfacePortal} from '../dialogs/SurfacePortal'
import {ShellSurfaceParent,useShellSurface} from '../dialogs/useShellSurface'
export function StatusPopover({workspace,anchor,onClose}:{workspace:ReturnType<typeof useWorkspace>;anchor:RefObject<HTMLButtonElement|null>;onClose():void}){
 const ref=useRef<HTMLDivElement>(null),surface=useShellSurface(ref,onClose,true)
 const {jdk,languageSnapshot,javaProject,projectStatus,notice,execution,recordingIsCurrent,visualization,invoke}=workspace
 useLayoutEffect(()=>{
  const outside=(event:PointerEvent)=>{if(surface.isTop()&&!ref.current?.contains(event.target as Node)&&!anchor.current?.contains(event.target as Node)){event.preventDefault();onClose()}}
  document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)
 },[onClose,surface,anchor])
 return <SurfacePortal><ShellSurfaceParent.Provider value={surface.id}><div ref={ref} tabIndex={-1} data-shell-menu role="dialog" aria-label="Workspace status" className="shell-status-popover glass" style={{zIndex:surface.zIndex}}>
  <div className="shell-dock-heading"><strong>Workspace status</strong><button aria-label="Close workspace status" onClick={onClose}><X size={16}/></button></div>
  <dl><dt>JDK</dt><dd>{jdk?.available?jdk.version??'Version not reported':'Unavailable'}{jdk?.error&&<p>{jdk.error}</p>}</dd>
   <dt>Language service</dt><dd>{languageSnapshot.status}<p>{languageSnapshot.message??'No reason reported.'}</p>{languageSnapshot.metrics.classpathMismatch===1&&<p>Classpath differs</p>}</dd>
   <dt>Build system</dt><dd>{javaProject?.buildSystem??'Not resolved'}<p>{javaProject?.diagnostic??projectStatus}</p></dd>
   <dt>Recording limits</dt><dd>20,000 raw events · 8 MiB · 256 object identities · 128 live frames<p>Recording stops at a limit; Java continues. The 30-second active watchdog excludes input waits and Debug pauses. A 10-minute hard safety deadline applies in all states.</p><p>Project code is recorded. Primitive and reference arrays have bounded summaries; class statics are available in the inspector. Library internals are collapsed. — means unavailable. Values and effects are last observed; changes outside recorded code may be absent.</p></dd>
  </dl>
  {recordingIsCurrent&&!!visualization?.capability.diagnostics.length&&<p>{visualization.capability.diagnostics.slice(0,3).join(' · ')}</p>}
  {execution?.supportReason&&<p>Visualization {execution.support.toLowerCase().replace('_',' ')} · {execution.supportReason}</p>}
  {notice&&<p role="status">{notice}</p>}
  <div className="shell-status-actions"><button onClick={()=>{onClose();invoke('workbench.jdk',{})}}>Configure JDK</button>{['failed','unavailable'].includes(languageSnapshot.status)&&<button onClick={()=>invoke('workbench.restartJava',{})}>Retry Java</button>}</div>
 </div></ShellSurfaceParent.Provider></SurfacePortal>
}
