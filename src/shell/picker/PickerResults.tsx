import {useLayoutEffect,useRef,useState} from 'react'
import type {PickerItem} from './workspaceSymbols'
const rowHeight=48,overscan=2
/** Every match remains reachable by scrolling or keyboard; only visible rows
 * mount. 5,000 rows occupy 240,000 CSS pixels, below browser scroll limits. */
export function PickerResults({id,label,items,selected,opening,onSelect,onChoose}:{id:string;label:string;items:readonly PickerItem[];selected:number;opening:boolean;onSelect(index:number):void;onChoose(item:PickerItem):void}){
 const host=useRef<HTMLDivElement>(null),[scroll,setScroll]=useState(0),[height,setHeight]=useState(440)
 useLayoutEffect(()=>{
  const node=host.current;if(!node)return
  const measure=()=>setHeight(node.clientHeight),observer=new ResizeObserver(measure);measure();observer.observe(node)
  return()=>observer.disconnect()
 },[])
 useLayoutEffect(()=>{
  const node=host.current;if(!node)return
  const top=selected*rowHeight,bottom=top+rowHeight
  if(top<node.scrollTop)node.scrollTop=top
  else if(bottom>node.scrollTop+node.clientHeight)node.scrollTop=bottom-node.clientHeight
  setScroll(node.scrollTop)
 },[selected,items,height])
 const start=Math.max(0,Math.floor(scroll/rowHeight)-overscan),end=Math.min(items.length,Math.ceil((scroll+height)/rowHeight)+overscan)
 const rows=Array.from({length:Math.max(0,end-start)},(_,offset)=>start+offset)
 if(items[selected]&&(selected<start||selected>=end))rows.push(selected)
 rows.sort((a,b)=>a-b)
 return <div ref={host} id={`${id}-list`} className="shell-picker-results" role="listbox" aria-label={label} aria-busy={opening} style={{height:`min(50dvh,440px,${items.length*rowHeight}px)`}} onScroll={event=>setScroll(event.currentTarget.scrollTop)}>
  <div role="presentation" style={{height:items.length*rowHeight,position:'relative'}}>
   {rows.map(row=>{const item=items[row];return <div key={item.id} id={`${id}-${row}`} role="option" aria-setsize={items.length} aria-posinset={row+1} aria-selected={row===selected} aria-disabled={!item.enabled||opening} className={`shell-picker-result ${row===selected?'is-selected':''}`} style={{position:'absolute',top:row*rowHeight,left:0,right:0,height:rowHeight}} title={item.reason} onMouseMove={()=>onSelect(row)} onPointerDown={event=>event.preventDefault()} onClick={()=>onChoose(item)}><span><strong>{item.label}</strong><small>{item.reason??item.detail}</small></span>{item.shortcut&&<kbd>{item.shortcut}</kbd>}</div>})}
  </div>
 </div>
}
