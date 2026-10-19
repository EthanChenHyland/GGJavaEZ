import {expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import type {ExecutionSession} from '../execution/contracts'
import type {DebugSession} from '../debugger/contracts'
import type {RawRuntimeEvent} from '../instrumentation/contracts'
import {ExecutionIngest} from '../execution/ingest'
import {pausedDebugInspection} from './debugInspection'
import {DebugDrawer} from './DebugDrawer'
const content=Array.from({length:12},(_,i)=>`// line ${i+1}`).join('\n'),sha='6d034b5c1b5234946d763510f5b16096532ff3db17857451b790107a2fae54b9'
const manifest={sources:[{fileId:'Main.java',name:'Main.java',content,sha256:sha}],classes:[{className:'Main',sourceFile:'Main.java',fileId:'Main.java',sourceSha256:sha,status:'resolved',candidates:['Main.java']}]}
const context={v:1 as const,threadId:'thread-actual',className:'Main',methodName:'main',descriptor:'()V',line:2,site:null}
const int=(value:number)=>({kind:'int' as const,value})
const raw:RawRuntimeEvent[]=[
 {...context,seq:0,type:'enter',frameId:'outer',callerFrameId:null,receiver:null,parameters:[]},
 {...context,seq:1,type:'local',frameId:'outer',slot:1,name:'quantity',descriptor:'I',liveRange:'outer-value',value:int(7)},
 {...context,seq:2,type:'line',frameId:'outer',line:4},
 {...context,seq:3,type:'enter',frameId:'inner',callerFrameId:'outer',methodName:'compute',descriptor:'(I)J',line:6,receiver:null,parameters:[{slot:0,name:'value',descriptor:'I',liveRange:'argument',value:int(7)}]},
 {...context,seq:4,type:'local',frameId:'inner',methodName:'compute',slot:1,name:'result',descriptor:'J',liveRange:'result-range',value:{kind:'long',value:'9223372036854775807'}},
 {...context,seq:5,type:'local',frameId:'inner',methodName:'compute',slot:3,name:'temporary',descriptor:'I',liveRange:'temporary-range',value:int(99)},
 {...context,seq:6,type:'local_end',frameId:'inner',methodName:'compute',slot:3,liveRange:'temporary-range'},
 {...context,seq:7,type:'line',frameId:'inner',methodName:'compute',line:8},
]
function fixture(count=raw.length,events=raw){
 const session:ExecutionSession={id:'pause-unit',revision:1,projectId:'unit-project',mainClass:'Main',kind:'debug',phase:'PAUSED',support:'FULL',supportReason:null,build:null,rawEvents:[],transportVersion:1,rawEventCount:count,sourceManifest:manifest,capability:null,recording:{state:'FULL',reason:null,budget:null,lastRecordedSeq:count-1,executionContinued:true},stdout:'',stderr:'',runEvents:[],pause:{reason:'breakpoint',threadId:'thread-actual',frameId:'inner',className:'Main',methodName:'compute',line:8,rawEventCount:count},breakpoints:[],terminalStatus:null,exitCode:null,diagnostic:null,failureKind:null,startedAt:'1970-01-01T00:00:00.000Z'}
 const ingest=new ExecutionIngest(session)
 if(count)ingest.append({version:1,sessionId:session.id,fromSequence:0,toSequence:count,events:events.slice(0,count),recording:session.recording!})
 const debug={sessionId:session.id,status:'paused' as const,pause:session.pause,sourceManifest:manifest}
 return{session,debug,ingest}
}
it('uses the one existing ingested head and exact innermost-first caller chain regardless of historical materializations',()=>{
 const {debug,ingest}=fixture(),before=JSON.stringify(ingest.history.state),first=pausedDebugInspection(debug,ingest)!
 expect(first.state).toBe(ingest.history.state);expect(first.cursor).toBe(ingest.history.length)
 expect(first.stack.map(item=>item.frame.id)).toEqual(['jvm:frame:inner','jvm:frame:outer'])
 expect(first.stack.map(item=>item.source)).toEqual([{fileId:'Main.java',line:8},{fileId:'Main.java',line:4}])
 for(const cursor of[0,1,ingest.history.length,2,0]){ingest.history.materialize(cursor);expect(pausedDebugInspection(debug,ingest)).toEqual(first)}
 expect(JSON.stringify(ingest.history.state)).toBe(before)
 expect(first.variables.map(slot=>[slot.name,slot.value])).toEqual([['value',{kind:'primitive',javaType:'int',value:7}],['result',{kind:'primitive',javaType:'long',value:'9223372036854775807'}]])
 ingest.dispose()
})
it('never substitutes another session, missing capture or a disposed history for paused facts',()=>{
 const {debug,ingest}=fixture()
 expect(pausedDebugInspection(debug,null)).toMatchObject({state:null,stack:[],variables:[]})
 expect(pausedDebugInspection({...debug,sessionId:'other'},ingest)).toMatchObject({state:null})
 ingest.dispose();expect(pausedDebugInspection(debug,ingest)).toMatchObject({state:null})
})
it('waits for the exact raw pause prefix without comparing raw count to normalized cursor',()=>{
 const {debug,ingest}=fixture(4)
 expect(ingest.history.length).not.toBe(4)
 expect(pausedDebugInspection({...debug,pause:{...debug.pause!,rawEventCount:8}},ingest)).toMatchObject({reason:'Waiting for the paused recording prefix',state:null})
 expect(pausedDebugInspection({...debug,pause:{...debug.pause!,rawEventCount:3}},ingest)).toMatchObject({state:null})
 expect(pausedDebugInspection(debug,ingest)?.stack[0].frame.methodName).toBe('compute');ingest.dispose()
})
it('keeps an uncaptured invocation and a mismatched thread or method explicit, without borrowing names',()=>{
 const {debug,ingest}=fixture()
 for(const changed of[{frameId:'not-recorded'},{threadId:'other-thread'},{methodName:'anotherMethod'}]){
  const result=pausedDebugInspection({...debug,pause:{...debug.pause!,...changed}},ingest)!
  expect(result.state).toBeNull();expect(result.stack).toEqual([]);expect(result.variables).toEqual([]);expect(result.reason).toBeTruthy()
 }
 ingest.dispose()
})
it('returns no paused snapshot when the same session resumes or ends',()=>{
 const {debug,ingest}=fixture()
 for(const status of['running','exited','stopped','failed']as const)expect(pausedDebugInspection({...debug,status},ingest)).toBeNull()
 expect(pausedDebugInspection({...debug,pause:null},ingest)).toBeNull();ingest.dispose()
})
it('uses missing-source text when the pause has no uniquely verified captured file',()=>{
 const {debug,ingest}=fixture(),result=pausedDebugInspection({...debug,sourceManifest:{...manifest,classes:[]}},ingest)!
 expect(result.stack[0].source).toBeNull();expect(result.stack[1].source).toEqual({fileId:'Main.java',line:4});ingest.dispose()
})
it('renders exact captured variables, paused source and all breakpoint statuses through bounded lists',()=>{
 const {debug,ingest}=fixture(),inspection=pausedDebugInspection(debug,ingest),session={...debug,diagnostic:null} as DebugSession
 const breakpoints=Array.from({length:1000},(_,index)=>({fileId:'Main.java',line:index+1,status:index%2?'verified' as const:'non_executable' as const,reason:'Captured resolution'}))
 const html=renderToStaticMarkup(<DebugDrawer session={session} inspection={inspection} breakpoints={breakpoints} onInspect={()=>{}} onRemove={()=>{}}/>)
 expect(html).toContain('paused thread');expect(html).toContain('Main.compute()');expect(html).toContain('Main.java:8');expect(html).toContain('9223372036854775807');expect(html).not.toContain('temporary')
 expect(html).toContain('aria-setsize="1000"');expect((html.match(/role="listitem"/g)??[]).length).toBeLessThan(40)
 expect(html).toContain('non executable');expect(html).toContain('verified');ingest.dispose()
})
it('running or prior-session rendering cannot show retained paused variables',()=>{
 const {debug,ingest}=fixture(),inspection=pausedDebugInspection(debug,ingest)
 for(const session of[{...debug,status:'running' as const},{...debug,sessionId:'other'}]){
  const html=renderToStaticMarkup(<DebugDrawer session={session as DebugSession} inspection={inspection} breakpoints={[]} onInspect={()=>{}} onRemove={()=>{}}/>)
  expect(html).not.toContain('9223372036854775807');expect(html).not.toContain('aria-label="Paused call stack"');expect(html).not.toContain('Inspect paused result')
 }
 ingest.dispose()
})

it('keeps recursive invocations distinct even when their class and method names match',()=>{
 const recursive=raw.map(event=>({...event,methodName:'compute'})),{debug,ingest}=fixture(raw.length,recursive)
 const snapshot=pausedDebugInspection(debug,ingest)!
 expect(snapshot.stack.map(item=>item.frame.methodName)).toEqual(['compute','compute'])
 expect(snapshot.stack.map(item=>item.frame.id)).toEqual(['jvm:frame:inner','jvm:frame:outer']);ingest.dispose()
})
it('reports an entry pause before any invocation capture without inventing an empty frame',()=>{
 const {debug,ingest}=fixture(0)
 expect(pausedDebugInspection(debug,ingest)).toMatchObject({reason:'Invocation not recorded yet',state:null,stack:[],variables:[]});ingest.dispose()
})

it('reports stopped capture instead of promising that an unavailable pause prefix will arrive',()=>{
 const {debug,session,ingest}=fixture()
 ingest.update({...session,recording:{state:'STOPPED_UNSUPPORTED',reason:'Capture boundary rejected',budget:null,lastRecordedSeq:raw.length-1,executionContinued:true}})
 expect(pausedDebugInspection({...debug,pause:{...debug.pause!,rawEventCount:raw.length+1}},ingest)).toMatchObject({state:null,stack:[],variables:[],reason:'Paused prefix unavailable · Capture boundary rejected'})
 ingest.dispose()
})

it('keeps another World recording from receiving paused-frame navigation while exact captured values stay inspectable',()=>{
 const {debug,ingest}=fixture(),inspection=pausedDebugInspection(debug,ingest)
 const html=renderToStaticMarkup(<DebugDrawer session={debug as DebugSession} inspection={inspection} worldSessionId="previous-session" breakpoints={[]} onInspect={()=>{throw new Error('Foreign World navigation')}} onRemove={()=>{}}/>)
 expect(html).toContain('aria-disabled="true" title="The World is displaying another recording"')
 expect(html).toContain('Inspect paused result');expect(html).toContain('9223372036854775807');ingest.dispose()
})
