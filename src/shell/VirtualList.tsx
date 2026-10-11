import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { virtualPageRows, virtualRange } from './virtualRange'

/** Bounded physical scroll pages preserve reachability even for a JVM-sized
 * logical array. Rows are fetched lazily; no count-sized values are allocated. */
export function VirtualList({count,rowHeight,label,initialIndex=0,children,className=''}:{
  count:number;rowHeight:number;label:string;initialIndex?:number;className?:string;
  children(index:number):ReactNode;
}) {
  const host=useRef<HTMLDivElement>(null),[scroll,setScroll]=useState(0),[height,setHeight]=useState(260);
  const [pageIndex,setPageIndex]=useState(initialIndex),[jump,setJump]=useState(String(initialIndex));
  const [revealRevision,setRevealRevision]=useState(0);
  const range=virtualRange(count,rowHeight,pageIndex,scroll,height);
  useLayoutEffect(()=>{
    const node=host.current;if(!node)return;
    const observer=new ResizeObserver(()=>setHeight(node.clientHeight));observer.observe(node);
    return()=>observer.disconnect();
  },[]);
  useLayoutEffect(()=>{
    const node=host.current;if(!node)return;
    const index=Math.max(0,Math.min(count-1,pageIndex));node.scrollTop=(index-range.pageStart)*rowHeight;setScroll(node.scrollTop);
  },[pageIndex,range.pageStart,rowHeight,count,revealRevision]);
  const reveal=(index:number)=>{if(Number.isSafeInteger(index)&&index>=0&&index<count){setPageIndex(index);setJump(String(index));setRevealRevision(revision=>revision+1)}};
  return <div className={`virtual-list ${className}`}>
    {count>virtualPageRows&&<div className="virtual-list-paging" role="group" aria-label={`${label} index navigation`}>
      <button aria-label={`Previous ${label} page`} aria-disabled={range.pageStart===0} onClick={()=>{if(range.pageStart)reveal(Math.max(0,range.pageStart-virtualPageRows))}}>‹</button>
      <label>Index <input type="number" min={0} max={count-1} value={jump} aria-label={`${label} index`} onChange={event=>setJump(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();reveal(Number(jump))}}}/></label>
      <button onClick={()=>reveal(Number(jump))}>Go</button>
      <button aria-label={`Next ${label} page`} aria-disabled={range.pageStart+range.pageCount>=count} onClick={()=>{if(range.pageStart+range.pageCount<count)reveal(range.pageStart+range.pageCount)}}>›</button>
      <small>{range.pageStart}–{range.pageStart+range.pageCount-1} of {count}</small>
    </div>}
    <div ref={host} className="virtual-list-scroll" role="list" aria-label={label} onScroll={event=>setScroll(event.currentTarget.scrollTop)}>
      <div style={{height:range.height,position:'relative'}}>{Array.from({length:range.count},(_,offset)=>{
        const index=range.start+offset;return <div key={index} role="listitem" aria-setsize={count} aria-posinset={index+1} style={{position:'absolute',top:(index-range.pageStart)*rowHeight,left:0,right:0,height:rowHeight}}>{children(index)}</div>;
      })}</div>
    </div>
  </div>;
}
