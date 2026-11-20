import {useId,useLayoutEffect,useRef,type ReactNode} from 'react'
import {SurfacePortal} from './SurfacePortal'
import {ShellSurfaceParent,useShellSurface} from './useShellSurface'
export function DialogFrame({title,children,actions,onClose,onSubmit,className='',selectInput=false}:{title:string;children:ReactNode;actions:ReactNode;onClose():void;onSubmit?():void;className?:string;selectInput?:boolean}){
 const ref=useRef<HTMLFormElement>(null),heading=useId(),surface=useShellSurface(ref,onClose,true)
 useLayoutEffect(()=>{if(selectInput)ref.current?.querySelector('input')?.select()},[selectInput])
 return <SurfacePortal><ShellSurfaceParent.Provider value={surface.id}><div className="shell-dialog-backdrop" style={{zIndex:surface.zIndex}}>
  <form ref={ref} tabIndex={-1} className={`shell-dialog glass ${className}`} role="dialog" aria-modal="true" aria-labelledby={heading} onSubmit={event=>{event.preventDefault();if(surface.isTop())onSubmit?.()}}>
   <h2 id={heading}>{title}</h2>{children}<div className="shell-dialog-actions">{actions}</div>
  </form>
 </div></ShellSurfaceParent.Provider></SurfacePortal>
}
