import {createContext,useContext,useLayoutEffect,useRef,useSyncExternalStore,type RefObject} from 'react'
import {createSurfaceStack} from './surfaceStack'
import {shellLayers} from '../../theme/tokens'
export const ShellSurfaceParent=createContext<symbol|null>(null)
const surfaces=createSurfaceStack()
const displayed=(node:HTMLElement)=>!node.closest('[hidden],[inert],[aria-hidden=true]')&&!['hidden','collapse'].includes(getComputedStyle(node).visibility)&&Array.from(node.getClientRects()).some(rect=>rect.width>0&&rect.height>0)
export const focusableControls=(node:HTMLElement)=>Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled):not([aria-disabled=true]),a[href],summary,input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')).filter(control=>!control.matches(':disabled,[aria-disabled=true]')&&displayed(control))
const focusFirst=(node:HTMLElement)=>{(focusableControls(node)[0]??node).focus({preventScroll:true})}
const editorFallback=()=>document.querySelector<HTMLElement>('.shell .monaco-editor textarea')??document.querySelector<HTMLElement>('.shell .world-canvas')
export function useShellSurface(ref:RefObject<HTMLElement|null>,onClose:()=>void,trap:boolean){
 const id=useRef(Symbol('shell-surface')).current,parent=useContext(ShellSurfaceParent),close=useRef(onClose),opener=useRef(typeof document==='undefined'?null:document.activeElement as HTMLElement|null)
 const restore=useRef(true)
 close.current=onClose
 useSyncExternalStore(surfaces.subscribe,surfaces.version,()=>0)
 useLayoutEffect(()=>{
  const node=ref.current;if(!node)return
  const unregister=surfaces.register(id,parent,node)
  if(surfaces.top()?.id===id)focusFirst(node)
  return()=>{
   const owned=surfaces.top()?.id===id;unregister()
   if(!owned||!restore.current)return
   // DOM removal must finish before testing whether an opener survived.
   queueMicrotask(()=>{
    if(surfaces.rank(id)!==-1)return
    const top=surfaces.top(),previous=opener.current
    if(previous?.isConnected&&previous!==document.body&&displayed(previous)&&(!top||top.node.contains(previous)))previous.focus({preventScroll:true})
    else if(top)focusFirst(top.node)
    else editorFallback()?.focus({preventScroll:true})
   })
  }
 },[id,parent,ref])
 useLayoutEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if(surfaces.top()?.id!==id||!ref.current)return
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();return}
   if(event.key!=='Tab')return
   if(!trap){event.preventDefault();event.stopPropagation();close.current();return}
   const node=ref.current,controls=focusableControls(node),first=controls[0],last=controls.at(-1)
   if(!first||!last){event.preventDefault();node.focus();return}
   if(!node.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first).focus()}
   else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
  const focus=(event:FocusEvent)=>{const top=surfaces.top();if(trap&&top?.id===id&&!top.node.contains(event.target as Node))focusFirst(top.node)}
  document.addEventListener('keydown',key,true);document.addEventListener('focusin',focus)
  return()=>{document.removeEventListener('keydown',key,true);document.removeEventListener('focusin',focus)}
 },[id,ref,trap])
 return{id,zIndex:shellLayers.dialog+Math.max(0,surfaces.rank(id)),isTop:()=>surfaces.top()?.id===id,dismissFromPointer:()=>{if(surfaces.top()?.id===id){restore.current=false;close.current()}}}
}
