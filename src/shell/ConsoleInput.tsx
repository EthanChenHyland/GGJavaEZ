import { useLayoutEffect, useMemo, useRef } from 'react'
import type { ExecutionSession } from '../execution/contracts'
import { acceptsConsoleInput, type ConsoleInputState, type ConsoleSubmission } from '../workspace/consoleInput'
import { ConsoleLines } from './ConsoleLines'

export function ConsoleSubmissions({submissions,sessionId}:{submissions:readonly ConsoleSubmission[];sessionId:string}) {
  const chunks=useMemo(()=>submissions.filter(row=>row.sessionId===sessionId).map(row=>({key:row.key,channel:'stdin' as const,text:row.text})),[submissions,sessionId])
  return chunks.length ? <><p className="console-order-note">Submitted input · submission order; consumption is shown by recorded events</p>
    <ConsoleLines chunks={chunks} label="Submitted input"/></> : null
}

export function ConsoleInput({execution,active,value,onChange,onSubmit,state}:{
  execution:ExecutionSession|null;active:boolean;value:string;onChange(value:string):void;onSubmit():void;state:ConsoleInputState
}) {
  const input=useRef<HTMLInputElement>(null), available=acceptsConsoleInput(execution), waiting=available&&execution?.phase==='WAITING_FOR_INPUT'
  useLayoutEffect(()=>{if(active&&waiting)input.current?.focus({preventScroll:true})},[active,waiting,execution?.id])
  const message=waiting?'Program is waiting for input':available?'Input wait status unknown':execution?'Program is not accepting input':null
  return <>
    {(message||state.feedback||state.pending)&&<div className="console-input-status" role="status" aria-live="polite">
      {message&&<span>{message}</span>}{state.pending&&<span>Submitting input…</span>}{state.feedback&&state.feedback!==message&&<span>{state.feedback}</span>}
    </div>}
    <form className="ide-console-input" onSubmit={event=>{event.preventDefault();onSubmit()}}>
      <span>›</span><input ref={input} aria-label="Console input" placeholder={available?'Send input to program…':'Run a program to send input'}
        value={value} disabled={!available} onChange={event=>onChange(event.target.value)}/>
      <button disabled={!available||state.pending}>Send ↵</button>
    </form>
  </>
}
