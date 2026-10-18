// The retired Timeline's eleven cases, using the production cursor owner and
// semantic milestone index. Dense ticks replace the obsolete 240-event-dot UI.
import {describe,expect,it} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import type {TraceDocument,TraceEvent} from '../../contracts/runtime'
import type {TimelineLens,ExecutionPhase} from '../../execution/contracts'
import {createTimelineStore} from '../../timeline/timelineStore'
import {createMilestoneIndex,labelBinCount} from '../../timeline/milestones'
import {timelineCaption} from '../../timeline/timelineControls'
import {timelineRecordingId,type TimelinePlaybackApi} from '../../timeline/useTimelinePlayback'
import {TimeDock} from './TimeDock'
import {normalizeTrace,type InstrumentationSourceManifest} from '../../instrumentation/normalize'
import type {RawRuntimeEvent,RecordingStatus} from '../../instrumentation/contracts'
import {seek,validateTrace} from '../../runtime'
const events=(count:number):TraceEvent[]=>Array.from({length:count},(_,seq)=>({type:'ALLOCATE_OBJECT',objectId:`object:${seq}`,className:'Example',displayId:seq+1,fields:[],eventId:`event:${seq}`,seq,source:null,label:`Event ${seq}`,importance:seq%13===0?'major':'quiet'}))
const payloads:object[]=[{type:'PROGRAM_START'},{type:'ENTER_METHOD',frameId:'main',callerFrameId:null,className:'Example',methodName:'main',locals:[]},
 {type:'DECLARE_LOCAL',frameId:'main',slot:{id:'value',name:'value',javaType:'int',value:{kind:'primitive',javaType:'int',value:7}}},
 {type:'ASSIGN_LOCAL',frameId:'main',slotId:'value',value:{kind:'primitive',javaType:'int',value:18}},
 {type:'EXIT_METHOD',frameId:'main'},{type:'PROGRAM_END'}]
const recorded=validateTrace({schemaVersion:2,demoId:'one-session',sourceFiles:[{fileId:'Example.java',name:'Example.java',content:'class Example { static void main() { int value = 7; value = 18; } }'}],events:payloads.map((payload,seq)=>({...payload,eventId:`recorded:${seq}`,seq,source:null,label:seq===5?'Program completed':`Event ${seq}`,importance:'normal'}as TraceEvent))})
function playback(trace:TraceDocument,cursor:number,lens:TimelineLens='HISTORY',head=trace.events.length):TimelinePlaybackApi{
 const store=createTimelineStore({recordingId:timelineRecordingId(trace),liveHead:head,hostLens:lens,partial:trace.events.some(event=>event.type==='CAPTURE_STOP')})
 if(lens==='HISTORY')store.dispatch({type:'seek',cursor})
 return{get state(){return store.getSnapshot().state},store,
  playPause:()=>{store.dispatch({type:'playPause'})},reversePlay:()=>{store.dispatch({type:'reversePlay'})},
  stepForward:()=>{store.dispatch({type:'stepForward'})},stepBack:()=>{store.dispatch({type:'stepBack'})},
  seekTo:cursor=>{store.dispatch({type:'seek',cursor})},setSpeed:speed=>{store.dispatch({type:'speed',speed})},
  replay:()=>{store.dispatch({type:'replay'})},returnToLive:()=>{store.dispatch({type:'returnLive'})},
  beginScrub:()=>{store.dispatch({type:'beginScrub'})},endScrub:()=>{store.dispatch({type:'endScrub'})}}
}
function render(trace:TraceDocument,api:TimelinePlaybackApi,phase?:ExecutionPhase){return renderToStaticMarkup(createElement(TimeDock,{trace,playback:api,...(phase?{execution:{phase,lens:api.state.lens,liveCursor:api.state.liveHead,onLensChange:()=>{}}}:{})}))}

describe('production large-trace rail successors',()=>{
 it('preserves every prefix in a short recording and bounds semantic labels for 20k probes',()=>{
  for(const count of[24,20000]){
   const values=events(count),index=createMilestoneIndex();index.extend(values,0)
   expect(index.count).toBe(count)
   const labelled=index.labelled(count,2000,12)
   expect(labelled.length).toBeLessThanOrEqual(12)
   expect(labelled[0].seq).toBe(0);expect(labelled.at(-1)!.seq).toBe(count-1)
   expect(new Set(labelled.map(item=>item.id)).size).toBe(labelled.length)
   expect(labelled.map(item=>item.seq)).toEqual(labelled.map(item=>item.seq).sort((a,b)=>a-b))
   expect([...index.density(240)].reduce((sum,n)=>sum+n,0)).toBe(count)
   if(count===24)for(let cursor=1;cursor<=count;cursor++)expect(timelineCaption(values,{cursor,liveHead:count}).seq).toBe(cursor-1)
  }
 })
 it('bounds narrow labels and dense ticks without moving any event or cursor coordinate',()=>{
  const values=events(20000),before=JSON.stringify(values),index=createMilestoneIndex();index.extend(values,0)
  expect(labelBinCount(440,12)).toBe(4);expect(index.labelled(20000,440,12).length).toBeLessThanOrEqual(4)
  expect(index.density(40)).toHaveLength(40);expect([...index.density(40)].reduce((sum,n)=>sum+n,0)).toBe(20000)
  expect(JSON.stringify(values)).toBe(before)
  const short=createMilestoneIndex();short.extend(events(2),0)
  expect([...short.density(1)]).toEqual([2]);expect(short.current(2)?.seq).toBe(1)
 })
})

const manifest:InstrumentationSourceManifest={sources:[{fileId:'Main.java',name:'Main.java',content:'class Main {}',sha256:'hash'}],classes:[{className:'Main',sourceFile:'Main.java',fileId:'Main.java',sourceSha256:'hash',status:'resolved',candidates:['Main.java']}]}
const raw:RawRuntimeEvent[]=[{v:1,seq:0,threadId:'1',type:'enter',frameId:'1',className:'Main',methodName:'main',descriptor:'()V',line:1,site:0,callerFrameId:null,receiver:null,parameters:[]},
 {v:1,seq:1,threadId:'1',type:'local',frameId:'1',className:'Main',methodName:'main',descriptor:'I',line:1,site:1,slot:1,name:'value',liveRange:'value',value:{kind:'int',value:7}}]
const recording:RecordingStatus={state:'STOPPED_LIMIT',reason:'Event budget reached',budget:'events',lastRecordedSeq:1,executionContinued:true}
const partial=validateTrace(normalizeTrace(raw,manifest,{status:'live',exitCode:null,diagnostic:null,recording}).trace)

describe('production partial recording terminal successors',()=>{
 it.each(['RUNNING','COMPLETED','FAILED']as const)('shows the same truthful closed prefix independently of Java phase %s',phase=>{
  const final=seek(partial,partial.events.length)
  expect(final).toMatchObject({status:'partial',activeFrameIds:['jvm:frame:1'],recordingStop:recording})
  expect(Object.values(final.frames['jvm:frame:1'].locals)[0].value).toMatchObject({value:7})
  const api=playback(partial,partial.events.length,'LIVE'),html=render(partial,api,phase)
  expect(html).toContain('Partial recording · Event budget reached')
  expect(html).toContain(`data-cursor="${partial.events.length}"`)
  expect(html).toContain(`raw lastRecordedSeq: ${recording.lastRecordedSeq}`)
  expect(api.state.boundary).toBe(partial.events.length)
  expect(html).toContain('aria-label="Replay from before execution" aria-disabled="false"')
  expect(html).toContain('aria-label="Play recorded execution" aria-disabled="true"')
  expect(html).not.toContain('Program completed');expect(html).not.toContain('Program failed')
 })
 it('scrubs backward through the partial state and returns to its last observed endpoint',()=>{
  const final=seek(partial,partial.events.length),previous=seek(partial,partial.events.length-1)
  expect(previous.status).toBe('running');expect(previous.frames).toEqual(final.frames)
  const api=playback(partial,partial.events.length,'LIVE')
  api.stepBack();expect(api.state.cursor).toBe(partial.events.length-1);expect(api.state.lens).toBe('HISTORY')
  expect(render(partial,api,'RUNNING')).toContain('Return to Live')
  api.returnToLive();expect(api.state.cursor).toBe(partial.events.length);expect(api.state.lens).toBe('LIVE')
  expect(render(partial,api,'RUNNING')).toContain('Partial recording · Event budget reached')
 })
 it('keeps the completion label only for an actually completed observed trace',()=>{
  const html=render(recorded,playback(recorded,6,'LIVE'),'COMPLETED')
  expect(seek(recorded,6).status).toBe('ended');expect(html).toContain('Program completed')
  expect(html).not.toContain('Partial recording');expect(html).not.toContain('Event budget reached')
 })
})

describe('production LIVE/HISTORY rail successors',()=>{
 it('advances LIVE with the accepted prefix while HISTORY holds its explicit cursor',()=>{
  const api=playback(recorded,1,'LIVE',3)
  expect(api.state.cursor).toBe(3)
  expect(render({...recorded,events:recorded.events.slice(0,3)},api,'RUNNING')).toContain('3 / 3')
  api.store.reconcile({recordingId:timelineRecordingId(recorded),liveHead:6,partial:false,hostLens:'LIVE'})
  expect(api.state.cursor).toBe(6);expect(render(recorded,api,'RUNNING')).toContain('6 / 6')
  api.seekTo(1);api.store.reconcile({recordingId:timelineRecordingId(recorded),liveHead:6,partial:false,hostLens:'LIVE'})
  expect(api.state.cursor).toBe(1);expect(api.state.lens).toBe('HISTORY')
  api.returnToLive();expect(api.state.cursor).toBe(6)
 })
 it('shows separate historical playhead/live head and Return to Live without debugger commands',()=>{
  const html=render(recorded,playback(recorded,2),'PAUSED')
  expect(html).toContain('HISTORY');expect(html).toContain('2 / 6');expect(html).toContain('Return to Live')
  expect(html).toContain('4 Events after Cursor');expect(html).toContain('aria-valuemax="6"');expect(html).toContain('aria-valuenow="2"')
  expect(html).not.toContain('Continue JVM')
 })
 it('keeps completed execution replayable and explicitly returns to its latest state',()=>{
  const api=playback(recorded,6,'LIVE')
  api.playPause();expect(api.state.cursor).toBe(6);expect(api.state.playing).toBe(false)
  api.replay();expect(api.state).toMatchObject({cursor:0,playing:true,lens:'HISTORY'})
  api.store.dispatch({type:'tick'});expect(api.state.cursor).toBe(1)
  api.returnToLive();expect(api.state).toMatchObject({cursor:6,playing:false,lens:'LIVE'})
  const html=render(recorded,api,'COMPLETED')
  expect(html).toContain('Replay from before execution');expect(html).toContain('LIVE');expect(html).not.toContain('Return to Live')
 })
 it('uses the same real transport and recording cursor when no JVM host is supplied',()=>{
  const html=render(recorded,playback(recorded,2))
  expect(html).toContain('Play recorded execution');expect(html).toContain('Replay from before execution')
  expect(html).toContain('Recorded execution position');expect(html).toContain('2 / 6');expect(html).toContain('HISTORY')
  expect(html).not.toContain('Continue JVM');expect(html).not.toContain('Reset execution')
 })
})
