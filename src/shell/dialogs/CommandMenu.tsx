import {useId,useLayoutEffect,useRef,useState} from 'react'
import {SurfacePortal} from './SurfacePortal'
import {menuTargetIndex} from '../../ide/contextMenus'
import {focusableControls,ShellSurfaceParent,useShellSurface} from './useShellSurface'
export interface CommandMenuItem {id:string;label:string;enabled:boolean;reason?:string;shortcut?:string}
/** One registry-fed menu for project/resource/tab actions. Disabled availability
 * is enforced at activation as well as exposed to accessibility tools. */
export function CommandMenu({label,x,y,items,onChoose,onClose}:{label:string;x:number;y:number;items:readonly CommandMenuItem[];onChoose(id:string):void;onClose():void}){
 const reasons=useId(),ref=useRef<HTMLDivElement>(null),chosen=useRef(false),surface=useShellSurface(ref,onClose,false)
 const [position,setPosition]=useState({left:x,top:y})
 useLayoutEffect(()=>{
  const rect=ref.current?.getBoundingClientRect();if(!rect)return
  setPosition({left:Math.max(8,Math.min(x,innerWidth-rect.width-8)),top:Math.max(8,Math.min(y,innerHeight-rect.height-8))})
 },[x,y,items.length])
 useLayoutEffect(()=>{
  const pointer=(event:PointerEvent)=>{if(surface.isTop()&&!ref.current?.contains(event.target as Node))surface.dismissFromPointer()}
  const resize=()=>{if(surface.isTop())onClose()}
  document.addEventListener('pointerdown',pointer);window.addEventListener('resize',resize)
  return()=>{document.removeEventListener('pointerdown',pointer);window.removeEventListener('resize',resize)}
 },[onClose,surface])
 return <SurfacePortal><ShellSurfaceParent.Provider value={surface.id}><div ref={ref} tabIndex={-1} data-shell-menu className="shell-command-menu glass" role="menu" aria-label={label} style={{...position,zIndex:surface.zIndex}} onKeyDown={event=>{
  if(event.key==='Enter'&&document.activeElement?.getAttribute('aria-disabled')==='true'){event.preventDefault();return}
  const controls=focusableControls(event.currentTarget),index=menuTargetIndex(event.key,controls.indexOf(document.activeElement as HTMLElement),controls.length)
  if(index!==null){event.preventDefault();event.stopPropagation();controls[index]?.focus()}
 }}>
  {items.map((item,index)=><button type="button" role="menuitem" aria-label={item.label} aria-describedby={item.reason?`${reasons}-${index}`:undefined} aria-disabled={!item.enabled} title={item.reason} key={item.id} onClick={()=>{if(!item.enabled||chosen.current)return;chosen.current=true;onChoose(item.id)}}>
   <span>{item.label}{!item.enabled&&item.reason&&<small id={`${reasons}-${index}`}>{item.reason}</small>}</span>{item.shortcut&&<kbd>{item.shortcut}</kbd>}
  </button>)}
 </div></ShellSurfaceParent.Provider></SurfacePortal>
}
