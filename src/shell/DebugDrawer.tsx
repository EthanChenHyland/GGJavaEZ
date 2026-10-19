import {useState} from 'react'
import type {Selection} from '../contracts/interaction'
import type {DebugSession,ResolvedBreakpoint,SourceBreakpoint} from '../debugger/contracts'
import type {DebugInspection} from './debugInspection'
import {VirtualList} from './VirtualList'
import {valueText} from '../world/valueText'
export function DebugDrawer({session,inspection,worldSessionId=null,breakpoints,onInspect,onRemove}:{
 session:DebugSession|null;inspection:DebugInspection|null;worldSessionId?:string|null;breakpoints:ResolvedBreakpoint[]
 onInspect(cursor:number,selection:Selection):void;onRemove(point:SourceBreakpoint):void
}){
 const [detail,setDetail]=useState<string|null>(null),paused=session?.status==='paused'&&!!session.pause
 const current=paused&&inspection?.sessionId===session.sessionId?inspection:null
 const canInspect=!!current&&current.sessionId===worldSessionId
 const state=current?.state,frame=current?.stack[0]?.frame,locals=current?.variables??[]
 const exact=(index:number)=>valueText(locals[index].value,{context:'exact',objects:state?.objects??{}})
 const selected=locals.find(slot=>slot.id===detail),expanded=selected?valueText(selected.value,{context:'exact',objects:state?.objects??{}}):null
 return <section className="shell-debug-drawer" aria-label="Debugger inspection">
  <div className="shell-debug-status"><h3>{paused?`Paused · ${session.pause!.reason}`:session?`JVM ${session.status}`:'Source breakpoints'}</h3>
   {paused&&<p>Thread {session.pause!.threadId} · {session.pause!.className}.{session.pause!.methodName}() · line {session.pause!.line}</p>}
   {session?.diagnostic&&<p>{session.diagnostic}</p>}
   <p>{paused?'Paused recording · independent of World history':'Pause the JVM to inspect its captured stack and variables.'}</p>
   <details><summary>Capture limits</summary><p>Only recorded project invocations and observed variables are available. Library/native frames and unobserved values are unavailable.</p></details>
  </div>
  <div className="shell-debug-stack"><h3>Call stack <span>· paused thread</span></h3>
   {current?.stack.length?<VirtualList count={current.stack.length} rowHeight={52} label="Paused call stack">{index=>{
    const item=current.stack[index];return <button className="shell-debug-row" aria-disabled={!canInspect} title={canInspect?'Inspect recorded invocation':'The World is displaying another recording'} onClick={()=>{if(canInspect)onInspect(current.cursor,{kind:'frame',id:item.frame.id})}}><span>{item.frame.className}.{item.frame.methodName}()<small>{item.source?`${item.source.fileId}:${item.source.line}`:'Source line not recorded'}</small></span></button>
   }}</VirtualList>:<p>{current?.reason??(paused?'Waiting for this session’s recorded pause':'No paused project stack.')}</p>}
  </div>
  <div className="shell-debug-values"><h3>Locals / parameters <span>· {locals.length} recorded</span></h3>
   {!!locals.length&&<VirtualList count={locals.length} rowHeight={52} label="Paused variables">{index=>{
    const slot=locals[index],text=exact(index);return <button className="shell-debug-row" title={`${slot.name} · ${text.observation} · ${text.exact}`} aria-label={`Inspect paused ${slot.name}`} onClick={()=>{setDetail(slot.id);if(canInspect)onInspect(current!.cursor,{kind:'slot',id:slot.id})}}><span>{slot.name}<small>{slot.javaType}</small></span><code>{text.exact}</code></button>
   }}</VirtualList>}
   {frame&&!locals.length&&<p>No variables were recorded for this invocation.</p>}
   {selected&&expanded&&<section className="shell-debug-exact" aria-label={`Captured paused ${selected.name}`}><strong>{selected.name} · {expanded.observation}</strong><pre>{expanded.exact}</pre>{expanded.reason&&<p>{expanded.reason}</p>}{expanded.recordedLength!==undefined&&<p>Recorded length: {expanded.recordedLength}</p>}<button onClick={()=>setDetail(null)}>Close value</button></section>}
  </div>
  <div className="shell-debug-breakpoints"><h3>Breakpoints <span>· {breakpoints.length}</span></h3>
   <VirtualList count={breakpoints.length} rowHeight={52} label="Source breakpoints">{index=>{
    const point=breakpoints[index];return <button className="shell-debug-row" aria-label={`Remove breakpoint ${point.fileId}:${point.line}`} title={point.reason??'Remove breakpoint'} onClick={()=>onRemove(point)}><span>{point.status==='verified'?'●':'○'} {point.fileId}:{point.line}<small>{point.status.replaceAll('_',' ')} · remove ×</small></span></button>
   }}</VirtualList>
  </div>
 </section>
}
