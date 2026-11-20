import {useEffect,useId,useMemo,useRef,useState} from 'react'
import {Search,X} from 'lucide-react'
import {SurfacePortal} from '../dialogs/SurfacePortal'
import {ShellSurfaceParent,useShellSurface} from '../dialogs/useShellSurface'
import {rankPickerItems} from '../../ide/fuzzy'
import {rankFileItems} from './fileLookup'
import {PickerResults} from './PickerResults'
import {menuTargetIndex} from '../../ide/contextMenus'
import type {LanguageClient} from '../../language/client'
import type {SourceLocation} from '../../ide/contracts'
import {createWorkspaceSymbolSearch,type PickerItem,type SymbolSnapshot} from './workspaceSymbols'
export type {PickerItem} from './workspaceSymbols'
type PickerProps={onClose():void}&({mode:'files'|'commands';items:readonly PickerItem[];onChoose(id:string):void}|{mode:'symbols';client:LanguageClient;onOpen(location:SourceLocation):void|Promise<void>})
export function Picker(props:PickerProps){
 const {mode,onClose}=props,[query,setQuery]=useState(''),[selected,setSelected]=useState(0),[opening,setOpening]=useState(false),[failure,setFailure]=useState('')
 const [symbols,setSymbols]=useState<SymbolSnapshot>({query:'',projectId:null,items:[],status:'Search project symbols'})
 const client=mode==='symbols'?props.client:null,projectId=client?.projectId??null
 const search=useMemo(()=>client?createWorkspaceSymbolSearch({projectId:()=>client.projectId,request:query=>client.request('workspace/symbol',{query}),publish:setSymbols}):null,[client])
 useEffect(()=>{
  if(!search)return
  const timer=window.setTimeout(()=>void search.search(query),query.trim()?200:0)
  return()=>{window.clearTimeout(timer);search.invalidate()}
 },[search,query,projectId])
 const symbolItems=symbols.query===query&&symbols.projectId===projectId?symbols.items:[]
 const items=mode==='symbols'?symbolItems:props.items
 const results=useMemo(()=>mode==='symbols'?items:mode==='files'?rankFileItems(items,query):rankPickerItems(items,query.replace(/^>/,'')),[mode,items,query])
 const index=Math.min(selected,Math.max(0,results.length-1)),id=useId(),ref=useRef<HTMLDivElement>(null),chosen=useRef(false),mounted=useRef(true)
 const surface=useShellSurface(ref,onClose,true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 const title=mode==='files'?'Quick Open':mode==='commands'?'Command Palette':'Find workspace symbol'
 const noun=mode==='files'?'file':mode==='commands'?'command':'symbol'
 const status=mode==='symbols'?(symbols.query===query&&symbols.projectId===projectId?symbols.status:query.trim()?'Searching…':'Search project symbols'):''
 const choose=(item:PickerItem|undefined)=>{
  if(!item?.enabled||chosen.current)return
  if(mode!=='symbols'){chosen.current=true;props.onChoose(item.id);return}
  const location=symbolItems.find(choice=>choice.id===item.id)?.location;if(!location)return
  chosen.current=true;setOpening(true);setFailure('')
  // Retain the actual command-service promise. A failed/stale open stays
  // inspectable here, without inventing a location or reporting success.
  void Promise.resolve().then(()=>props.onOpen(location)).then(()=>{if(mounted.current)onClose()},error=>{if(mounted.current){chosen.current=false;setOpening(false);setFailure(error instanceof Error?error.message:String(error))}})
 }
 return <SurfacePortal><ShellSurfaceParent.Provider value={surface.id}><div className="shell-picker-backdrop" style={{zIndex:surface.zIndex}} onPointerDown={event=>{if(event.target===event.currentTarget&&surface.isTop()){event.preventDefault();onClose()}}}>
  <div ref={ref} tabIndex={-1} className="shell-picker glass" role="dialog" aria-modal="true" aria-label={title} onKeyDown={event=>{
   event.stopPropagation();const next=menuTargetIndex(event.key,index,results.length)
   if(next!==null){event.preventDefault();setSelected(next)}
   if(event.key==='Enter'){event.preventDefault();choose(results[index])}
  }}>
   <div className="shell-picker-query"><Search size={16}/><input role="combobox" aria-label={mode==='files'?'Search project files':mode==='commands'?'Search commands':'Symbol query'} aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={results.length?`${id}-${index}`:undefined} placeholder={mode==='files'?'Search project files…':mode==='commands'?'Type a command…':'Class, method or field…'} value={query} onChange={event=>{setQuery(event.target.value);setSelected(0);setFailure('')}}/><button type="button" aria-label={`Close ${title}`} onClick={onClose}><X size={15}/></button></div>
   <PickerResults id={id} label={title} items={results} selected={index} opening={opening} onSelect={setSelected} onChoose={choose}/>
   {failure&&<p className="shell-picker-empty" role="alert">{failure}</p>}
   {mode==='symbols'?(opening||!results.length)&&<p className="shell-picker-empty" role="status">{opening?'Opening source…':status}</p>:!results.length&&<p className="shell-picker-empty">{mode==='files'?'No matching project files':'No matching commands'}</p>}
   <div className="shell-picker-foot"><span role={mode==='symbols'&&results.length?'status':undefined}>{results.length} {noun}{results.length===1?'':'s'}{mode==='symbols'&&results.length===80?' shown':''}</span><span>↑ ↓ Navigate · ↵ {mode==='commands'?'Run':'Open'} · Esc Close</span></div>
  </div>
 </div></ShellSurfaceParent.Provider></SurfacePortal>
}
