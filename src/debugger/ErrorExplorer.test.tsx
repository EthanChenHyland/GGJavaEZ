import {expect,it,vi} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import type {RuntimeState,TraceDocument,TraceEvent,TraceEventBase} from '../contracts/runtime'
import {validateTrace} from '../runtime/trace'
import {seek} from '../runtime'
import {historyForTrace} from '../runtime/history'
import {normalizeTrace} from '../instrumentation/normalize'
import type {RawRuntimeEvent} from '../instrumentation/contracts'
import {ErrorExplorer} from './ErrorExplorer'
import {renderThreeLifetime as render} from '../testing/reactThreeLifetime'

type Payload=TraceEvent extends infer Event?Event extends TraceEvent?Omit<Event,keyof TraceEventBase>:never:never
function fixture():TraceDocument {
 const payloads:Payload[]=[
  {type:'PROGRAM_START'},
  {type:'ENTER_METHOD',frameId:'main',callerFrameId:null,className:'unit.Main',methodName:'main',locals:[]},
  {type:'ENTER_METHOD',frameId:'worker',callerFrameId:'main',className:'unit.Worker',methodName:'work',locals:[{id:'captured',name:'captured',javaType:'int',value:{kind:'primitive',javaType:'int',value:7},role:'parameter'}]},
  {type:'THROW_EXCEPTION',frameId:'worker',exceptionId:'first',className:'unit.FirstFailure',message:'',explicit:true},
  {type:'UNWIND_EXCEPTION',frameId:'worker',exceptionId:'first'},
  {type:'FINALLY_ENTER',frameId:'main',exceptionId:'first'},
  {type:'CATCH_EXCEPTION',frameId:'main',exceptionId:'first'},
  {type:'LINE_EXECUTE',frameId:'main'},
  {type:'ENTER_METHOD',frameId:'later',callerFrameId:'main',className:'unit.Later',methodName:'run',locals:[]},
  {type:'THROW_EXCEPTION',frameId:'later',exceptionId:'second',className:'unit.LaterFailure',message:'future message',explicit:true},
  {type:'UNWIND_EXCEPTION',frameId:'later',exceptionId:'second'},
  {type:'UNWIND_EXCEPTION',frameId:'main',exceptionId:'second'},
  {type:'PROGRAM_ABORT',reason:'program_crashed',message:'uncaught'},
 ]
 return validateTrace({schemaVersion:2,demoId:'exception-prefix-unit',sourceFiles:[{fileId:'Unit.java',name:'Unit.java',content:Array.from({length:16},(_,i)=>`// captured source ${i+1}`).join('\n')}],events:payloads.map((event,seq)=>({...event,seq,eventId:`opaque/event/${seq}`,source:{fileId:'Unit.java',line:seq+1},label:event.type,importance:'normal'}))})
}
function view(trace:TraceDocument,cursor:number,runtime:RuntimeState|null=seek(trace,cursor)){
 return renderToStaticMarkup(<ErrorExplorer trace={trace} runtime={runtime} selection={null} stderr="" onNavigate={()=>{}} onRevealSource={()=>{}} onSelectFrame={()=>{}}/>)
}
const pathLabels=(html:string)=>(html.match(/<div class="exception-path">(.*?)<\/div>/s)?.[1].match(/>(Throw|Unwind|Finally \/ cleanup handler|Catch)<small>/g)??[]).map(item=>item.slice(1,item.indexOf('<small>')))

it('withholds every future exception episode before its throw in either replay direction',()=>{
 const trace=fixture()
 for(const cursor of[trace.events.length,3,7,0,9,10,0,trace.events.length]){
  const html=view(trace,cursor)
  if(cursor<4){expect(html).not.toContain('FirstFailure');expect(html).not.toContain('LaterFailure');expect(html).not.toContain('future message');expect(html).not.toContain('Return to failure')}
  else if(cursor<10){expect(html).toContain('<h2>FirstFailure</h2>');expect(html).not.toContain('LaterFailure');expect(html).not.toContain('future message')}
  else expect(html).toContain('<h2>LaterFailure</h2>')
 }
})

it('reveals unwind, finally, catch and crash only at their applied-prefix boundaries',()=>{
 const trace=fixture()
 for(const[cursor,labels]of [[4,['Throw']],[5,['Throw','Unwind']],[6,['Throw','Unwind','Finally / cleanup handler']],[7,['Throw','Unwind','Finally / cleanup handler','Catch']],[10,['Throw']],[12,['Throw','Unwind','Unwind']]] as const){
  const html=view(trace,cursor);expect(pathLabels(html)).toEqual(labels)
  expect(html.includes('ERROR EXPLORER · CAUGHT')).toBe(cursor>=7&&cursor<10)
  expect(html).not.toContain('RUN CRASHED')
 }
 expect(view(trace,trace.events.length)).toContain('RUN CRASHED')
})

it('keeps the full captured class and distinguishes empty text from unavailable-or-null messages',()=>{
 const trace=fixture(),empty=view(trace,4)
 expect(empty).toContain('unit.FirstFailure');expect(empty).toContain('captured empty string')
 const changed={...trace,events:trace.events.map(event=>event.type==='THROW_EXCEPTION'&&event.exceptionId==='first'?{...event,message:null}:event)}
 const missing=view(validateTrace(changed),4)
 expect(missing).toContain('Message unavailable or null');expect(missing).not.toContain('captured empty string')
 expect(missing).toContain('No captured stack-text fact');expect(missing).toContain('No captured cause-chain fact')
})

it('does not read the paired graph fact beyond a raw throw prefix while preparing its snapshot',()=>{
 const records=[{type:'enter',callerFrameId:null,receiver:null,parameters:[]},{type:'throw',className:'java.lang.NullPointerException',objectId:'failure',message:null,explicit:false}].map((event,seq)=>({v:1,provenanceVersion:1,seq,threadId:'1',frameId:'f1',className:'Main',methodName:'main',descriptor:'()V',line:2,site:seq,...event})) as RawRuntimeEvent[]
 const {trace}=normalizeTrace(records,{sources:[{fileId:'Main.java',name:'Main.java',content:'// Main\n// throw\n',sha256:'source'}],classes:[{className:'Main',sourceFile:'Main.java',fileId:'Main.java',sourceSha256:'source',status:'resolved',candidates:['Main.java']}]},{status:'live',exitCode:null,diagnostic:null})
 const cursor=trace.events.findIndex(event=>event.type==='THROW_EXCEPTION')+1
 expect(cursor).toBeLessThan(trace.events.length)
 const runtime=seek(trace,cursor),history=historyForTrace(trace)!,read=vi.spyOn(history,'materialize')
 try{expect(view(trace,cursor,runtime)).toContain('NullPointerException');expect(read.mock.calls.every(([at])=>at<=cursor)).toBe(true)}finally{read.mockRestore()}
})

it('leaves snapshots unchanged and withholds evidence while recording-qualified runtime is unavailable',()=>{
 const trace=fixture(),before=JSON.stringify(trace)
 for(const cursor of[0,4,7,10,13,4]){const state=seek(trace,cursor),saved=JSON.stringify(state);view(trace,cursor,state);expect(JSON.stringify(state)).toBe(saved)}
 const absent=view(trace,0,null)
 expect(absent).not.toContain('FirstFailure');expect(absent).not.toContain('LaterFailure')
 expect(absent).toContain('Runtime evidence is unavailable at this Event')
 expect(JSON.stringify(trace)).toBe(before)
})

it('keeps frame selection disabled when current frame evidence is unavailable without hiding captured source',()=>{
 const trace=fixture(),runtime={...seek(trace,4),frames:{}},html=view(trace,4,runtime)
 expect(html).toContain('disabled="" aria-label="Select frame unit.Worker.work()"')
 expect(html).toContain('Frame is not present at the current Event')
 expect(html).toContain('class="debug-source" title="Reveal captured source without moving execution or Selection"')
 expect(html).toContain('Go to the recorded throw without changing Selection')
})

it('disables only the explicit throw seek when its Event is missing and never substitutes current values for a throw snapshot',()=>{
 const trace=fixture(),runtime=seek(trace,4),partial={...trace,events:trace.events.slice(0,3)},html=view(partial,3,runtime)
 expect(html).toContain('class="debug-action" disabled="" title="Recorded throw Event is unavailable at this prefix"')
 expect(html).toContain('class="debug-source" title="Reveal captured source without moving execution or Selection"')
 expect(html).toContain('title="Select this frame without moving execution or the camera"')
 expect(html).toContain('Throw snapshot unavailable')
 expect(html).not.toContain('>7</code>')
})

it('keeps cause-history hook state inside its exception episode across actual React rerenders',()=>{
 // Existing inert host runs real React hooks; this is a state/lifetime unit,
 // not a DOM, GPU or actual-JVM assertion.
 const trace=fixture(),navigate=vi.fn(),element=(cursor:number)=><ErrorExplorer trace={trace} runtime={seek(trace,cursor)} selection={null} stderr="" onNavigate={navigate} onRevealSource={()=>{}} onSelectFrame={()=>{}}/>
 const mounted=render(element(4))
 try{
  const value=mounted.nodes().find(node=>node.type==='button'&&node.props?.className==='debug-value ')!
  expect(value).toBeTruthy();(value.props!.onClick as ()=>void)();mounted.rerender(element(4))
  expect(navigate).toHaveBeenCalledWith(4,{kind:'slot',id:'captured'})
  const cause=mounted.nodes().find(node=>node.type==='button'&&node.props?.children==='Trace Cause')!
  expect(cause.props!.disabled).toBe(false);(cause.props!.onClick as ()=>void)();mounted.rerender(element(4))
  expect(mounted.nodes().filter(node=>node.type==='ol'&&node.props?.className==='cause-list')).toHaveLength(1)
  mounted.rerender(element(10))
  expect(mounted.nodes().filter(node=>node.type==='ol'&&node.props?.className==='cause-list')).toHaveLength(0)
  mounted.rerender(element(0))
  expect(mounted.nodes().filter(node=>node.type==='button')).toHaveLength(0)
 }finally{mounted.unmount()}
})

it('keeps explicit earlier value-history navigation prefix-filtered and offers its user-requested return bookmark',()=>{
 const trace=fixture(),navigate=vi.fn(),element=(cursor:number)=><ErrorExplorer trace={trace} runtime={seek(trace,cursor)} selection={null} stderr="" onNavigate={navigate} onRevealSource={()=>{}} onSelectFrame={()=>{}}/>
 const mounted=render(element(4))
 try{
  const value=mounted.nodes().find(node=>node.type==='button'&&node.props?.className==='debug-value ')!
  ;(value.props!.onClick as ()=>void)();mounted.rerender(element(4))
  const cause=mounted.nodes().find(node=>node.type==='button'&&node.props?.children==='Trace Cause')!
  ;(cause.props!.onClick as ()=>void)();mounted.rerender(element(4))
  const entry=mounted.nodes().find(node=>node.type==='ol'&&node.props?.className==='cause-list')!.children[0].children.find(node=>node.type==='button')!
  ;(entry.props!.onClick as ()=>void)();expect(navigate).toHaveBeenLastCalledWith(3,{kind:'slot',id:'captured'})
  mounted.rerender(element(3))
  expect(mounted.nodes().filter(node=>node.type==='h2')).toHaveLength(0)
  expect(mounted.nodes().filter(node=>node.props?.className==='error-stack')).toHaveLength(0)
  expect(mounted.nodes().filter(node=>node.type==='button'&&node.props?.['aria-current']==='step')).toHaveLength(1)
  const resume=mounted.nodes().find(node=>node.type==='button'&&node.props?.children==='Return to failure')!
  expect(resume).toBeTruthy();(resume.props!.onClick as ()=>void)();expect(navigate).toHaveBeenLastCalledWith(4)
  mounted.rerender(element(0))
  expect(mounted.nodes().filter(node=>node.type==='ol'&&node.props?.className==='cause-list')[0].children).toHaveLength(0)
 }finally{mounted.unmount()}
})

it('separates later accepted-recording navigation targets from the observed path',()=>{
 const trace=fixture(),html=view(trace,4)
 expect(pathLabels(html)).toEqual(['Throw'])
 expect(html).toContain('Later recorded Events')
 expect(html).toContain('These Events are not applied at the selected Event')
 expect(html).toContain('Go to recorded Unwind')
 const navigate=vi.fn(),mounted=render(<ErrorExplorer trace={trace} runtime={seek(trace,4)} selection={null} stderr="" onNavigate={navigate} onRevealSource={()=>{}} onSelectFrame={()=>{}}/>)
 try{
  const target=mounted.nodes().find(node=>node.type==='button'&&node.props?.title==='Go to this accepted recorded Event without changing Selection')!
  ;(target.props!.onClick as ()=>void)();expect(navigate).toHaveBeenCalledExactlyOnceWith(5)
 }finally{mounted.unmount()}
})

it('keeps separate episodes when the same captured Throwable is caught and thrown again',()=>{
 const trace=fixture(),rethrow=validateTrace({...trace,events:trace.events.map(event=>{
  if(event.type==='THROW_EXCEPTION'&&event.exceptionId==='second')return{...event,exceptionId:'first',className:'unit.FirstFailure',message:''}
  if(event.type==='UNWIND_EXCEPTION'&&event.exceptionId==='second')return{...event,exceptionId:'first'}
  return event
 })})
 expect(pathLabels(view(rethrow,7))).toEqual(['Throw','Unwind','Finally / cleanup handler','Catch'])
 expect(pathLabels(view(rethrow,10))).toEqual(['Throw'])
 expect(pathLabels(view(rethrow,12))).toEqual(['Throw','Unwind','Unwind'])
 const early=view(rethrow,4)
 expect(early).not.toContain('opaque/event/9')
 expect(early).not.toContain('opaque/event/10')
})

it('retains the explicit later failure bookmark when cause history reveals an earlier caught exception',()=>{
 const base=fixture(),trace=validateTrace({...base,events:base.events.map(event=>event.type==='ENTER_METHOD'&&event.frameId==='later'?{...event,locals:[{id:'later-value',name:'laterValue',javaType:'int',value:{kind:'primitive' as const,javaType:'int',value:19},role:'parameter' as const}]}:event)})
 const navigate=vi.fn(),element=(cursor:number)=><ErrorExplorer trace={trace} runtime={seek(trace,cursor)} selection={null} stderr="" onNavigate={navigate} onRevealSource={()=>{}} onSelectFrame={()=>{}}/>
 const mounted=render(element(10))
 try{
  const value=mounted.nodes().find(node=>node.type==='button'&&node.props?.className==='debug-value ')!
  ;(value.props!.onClick as ()=>void)();mounted.rerender(element(10))
  const cause=mounted.nodes().find(node=>node.type==='button'&&node.props?.children==='Trace Cause')!
  ;(cause.props!.onClick as ()=>void)();mounted.rerender(element(10))
  const entry=mounted.nodes().find(node=>node.type==='ol'&&node.props?.className==='cause-list')!.children[0].children.find(node=>node.type==='button')!
  ;(entry.props!.onClick as ()=>void)();expect(navigate).toHaveBeenLastCalledWith(9,{kind:'slot',id:'later-value'})
  mounted.rerender(element(9))
  expect(mounted.nodes().filter(node=>node.type==='h2').map(node=>node.props?.children)).toEqual(['FirstFailure'])
  expect(mounted.nodes().filter(node=>node.type==='button'&&node.props?.['aria-current']==='step')).toHaveLength(1)
  const earlierEntry=mounted.nodes().find(node=>node.type==='ol'&&node.props?.className==='cause-list')!.children[0].children.find(node=>node.type==='button')!
  ;(earlierEntry.props!.onClick as ()=>void)();mounted.rerender(element(9))
  const resume=mounted.nodes().find(node=>node.type==='button'&&node.props?.children==='Return to inspected failure')!
  expect(resume).toBeTruthy();(resume.props!.onClick as ()=>void)();expect(navigate).toHaveBeenLastCalledWith(10)
  const observed=mounted.nodes().find(node=>node.type==='button'&&node.props?.children==='Return to failure')!
  ;(observed.props!.onClick as ()=>void)();expect(navigate).toHaveBeenLastCalledWith(4)
 }finally{mounted.unmount()}
})
