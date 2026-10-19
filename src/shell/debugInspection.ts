import type {RuntimeFrame,RuntimeSlot,RuntimeState,SourceLocation} from '../contracts/runtime'
import type {ExecutionIngest} from '../execution/ingest'
import type {DebugSession} from '../debugger/contracts'
import {pauseSourceLocation} from './source/sourceSync'
export interface DebugInspection {
 sessionId:string;cursor:number;state:RuntimeState|null;reason:string|null
 stack:{frame:RuntimeFrame;source:SourceLocation|null}[];variables:RuntimeSlot[]
}
/** Read the existing ingestion head, independently of the World cursor. Never
 * replay raw data here or lend a prior session's variables to a new pause. */
export function pausedDebugInspection(session:Pick<DebugSession,'sessionId'|'status'|'pause'|'sourceManifest'>|null,ingest:ExecutionIngest|null):DebugInspection|null {
 if(session?.status!=='paused'||!session.pause)return null
 const absent=(reason:string):DebugInspection=>({sessionId:session.sessionId,cursor:0,state:null,stack:[],variables:[],reason})
 if(!ingest||ingest.sessionId!==session.sessionId||ingest.history.isDisposed)return absent('Waiting for this session’s recorded pause')
 const pause=session.pause
 const state=ingest.history.state,events=ingest.normalizer.trace.events
 if(ingest.nextSequence!==pause.rawEventCount)return absent(state.recordingStop&&state.recordingStop.state!=='FULL'?`Paused prefix unavailable · ${state.recordingStop.reason??'Recording stopped'}`:'Waiting for the paused recording prefix')
 // This is the normalizer's existing stable raw-frame identity encoding, not a
 // parsed Java name or a join by method spelling (which aliases recursion).
 const id=`jvm:frame:${pause.frameId}`,frame=state.frames[id]
 if(!frame||frame.status!=='active')return absent('Invocation not recorded yet')
 if(frame.className!==pause.className||frame.methodName!==pause.methodName)return absent('Paused invocation metadata does not match the recording')
 const entered=new Map<string,string|undefined>(),sources=new Map<string,SourceLocation>()
 for(let index=0;index<state.cursor;index++){
  const event=events[index]
  if(event.type==='ENTER_METHOD')entered.set(event.frameId,event.threadId)
  const owner='frameId' in event?event.frameId:event.type==='EXECUTION_FACT'?event.fact.context.frameId:null
  if(owner&&event.source)sources.set(owner,event.source)
 }
 if(entered.get(id)!==pause.threadId)return absent('Paused thread is outside the recorded project stack')
 const stack:DebugInspection['stack']=[],visited=new Set<string>()
 let next:RuntimeFrame|undefined=frame
 while(next&&next.status==='active'&&!visited.has(next.id)&&entered.get(next.id)===pause.threadId){
  visited.add(next.id)
  stack.push({frame:next,source:next.id===id?pauseSourceLocation(pause,session.sourceManifest):sources.get(next.id)??null})
  next=next.callerFrameId?state.frames[next.callerFrameId]:undefined
 }
 return{sessionId:session.sessionId,cursor:state.cursor,state,stack,variables:Object.values(frame.locals).filter(slot=>!slot.scopeId||state.scopes[slot.scopeId]?.status==='active'),reason:null}
}
