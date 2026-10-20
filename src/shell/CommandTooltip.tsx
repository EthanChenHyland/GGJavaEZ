import {useEffect,useId,useLayoutEffect,useRef,useState,type RefObject} from 'react'
import {SurfacePortal} from './dialogs/SurfacePortal'

/** Registry text supplied by the control, with one tooltip per command region.
 * Tooltips never take focus or participate in the modal surface stack. */
export function CommandTooltip({root}:{root:RefObject<HTMLElement|null>}){
 const id=useId(),tip=useRef<HTMLDivElement>(null),[active,setActive]=useState<HTMLElement|null>(null),[position,setPosition]=useState({left:0,top:0})
 const current=useRef<HTMLElement|null>(null),dismissCurrent=useRef(()=>{})
 // Register priority before the workspace's passive global shortcut effect.
 // Region listeners wait for the parent host ref to attach after child layout.
 useLayoutEffect(()=>{
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&current.current){event.preventDefault();event.stopPropagation();dismissCurrent.current()}}
  window.addEventListener('keydown',escape,true)
  return()=>window.removeEventListener('keydown',escape,true)
 },[])
 useEffect(()=>{
  const region=root.current;if(!region)return
  let show:ReturnType<typeof setTimeout>|undefined,hide:ReturnType<typeof setTimeout>|undefined
  let overTooltip=false
  const clear=()=>{clearTimeout(show);clearTimeout(hide)}
  const control=(target:EventTarget|null)=>target instanceof Element?target.closest<HTMLElement>('[data-command-tooltip]'):null
  const reveal=(element:HTMLElement)=>{clear();overTooltip=false;current.current=element;setActive(element)}
  const leave=(cancelPending=true)=>{
   if(cancelPending)clearTimeout(show);clearTimeout(hide)
   hide=setTimeout(()=>{if(current.current!==document.activeElement&&!current.current?.matches(':hover')&&!overTooltip){current.current=null;setActive(null)}},100)
  }
  const pointer=(event:PointerEvent)=>{
   const element=control(event.target)
   if(!element||element===control(event.relatedTarget))return
   clear();show=setTimeout(()=>reveal(element),800)
  }
  const focus=(event:FocusEvent)=>{const element=control(event.target);if(element)reveal(element)}
  const pointerLeave=(event:PointerEvent)=>{if(control(event.target)!==control(event.relatedTarget))leave()}
  const dismiss=()=>{clear();overTooltip=false;current.current=null;setActive(null)}
  dismissCurrent.current=dismiss
  const focusLost=(event:FocusEvent)=>{if(event.relatedTarget instanceof Element&&event.relatedTarget.closest('[role="dialog"],[role="menu"]'))dismiss();else leave()}
  const activate=(event:MouseEvent)=>{if(control(event.target)?.getAttribute('aria-disabled')!=='true')dismiss()}
  region.addEventListener('pointerover',pointer);region.addEventListener('pointerout',pointerLeave);region.addEventListener('focusin',focus);region.addEventListener('focusout',focusLost);region.addEventListener('click',activate)
  window.addEventListener('resize',dismiss)
  // Descriptions are transparent to clicks. Track their visible rectangle so
  // hovering the text retains it without blocking a control underneath it.
  const tipMove=(event:PointerEvent)=>{
   const box=tip.current?.getBoundingClientRect(),inside=!!box&&event.clientX>=box.left&&event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom
   if(inside){overTooltip=true;clearTimeout(hide)}else if(overTooltip){overTooltip=false;leave(false)}
  }
  const outside=(event:PointerEvent)=>{if(current.current&&!current.current.contains(event.target as Node))dismiss()}
  document.addEventListener('pointermove',tipMove);document.addEventListener('pointerdown',outside)
  return()=>{clear();current.current=null;dismissCurrent.current=()=>{};region.removeEventListener('pointerover',pointer);region.removeEventListener('pointerout',pointerLeave);region.removeEventListener('focusin',focus);region.removeEventListener('focusout',focusLost);region.removeEventListener('click',activate);window.removeEventListener('resize',dismiss);document.removeEventListener('pointermove',tipMove);document.removeEventListener('pointerdown',outside)}
 },[root])
 useLayoutEffect(()=>{
  if(!active||!tip.current)return
  const anchor=active.getBoundingClientRect(),box=tip.current.getBoundingClientRect()
  setPosition({left:Math.max(8,Math.min(anchor.left+(anchor.width-box.width)/2,innerWidth-box.width-8)),top:Math.max(8,anchor.bottom+8+box.height>innerHeight-8?anchor.top-box.height-8:anchor.bottom+8)})
  const previous=active.getAttribute('aria-describedby'),descriptions=new Set((previous??'').split(/\s+/).filter(Boolean));descriptions.add(id);active.setAttribute('aria-describedby',[...descriptions].join(' '))
  return()=>{const remaining=(active.getAttribute('aria-describedby')??'').split(/\s+/).filter(value=>value&&value!==id);if(remaining.length)active.setAttribute('aria-describedby',remaining.join(' '));else active.removeAttribute('aria-describedby')}
 },[active,id])
 return active&&<SurfacePortal><div ref={tip} id={id} role="tooltip" className="shell-command-tooltip glass" style={position}>{active.dataset.commandTooltip}</div></SurfacePortal>
}
