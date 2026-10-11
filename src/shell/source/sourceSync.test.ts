import {describe,expect,it} from 'vitest'
import {pauseSourceLocation,sourceLocationFor,recordedFileFor,sourcePauseFor,exceptionSourceLocation,exceptionLineForFile,sourceProofFile} from './sourceSync'
import type {DebugPause} from '../../debugger/contracts'
import type {InstrumentationSourceManifest} from '../../instrumentation/normalize'
import rawPersonTrace from '../../examples/demos/person/person.trace.json'
import type {TraceDocument,RuntimeExceptionFact} from '../../contracts/runtime'
const personTrace=rawPersonTrace as TraceDocument

const pause:DebugPause={reason:'step',threadId:'thread:1',frameId:'frame:2',className:'pkg.Outer$Inner',methodName:'run',line:2,rawEventCount:17}
const manifest:InstrumentationSourceManifest={sources:[{fileId:'src/pkg/Outer.java',name:'Outer.java',content:'class Outer {\n class Inner {}\n}',sha256:'recorded-hash'}],classes:[{className:'pkg.Outer$Inner',sourceFile:'Outer.java',fileId:'src/pkg/Outer.java',sourceSha256:'recorded-hash',status:'resolved',candidates:['src/pkg/Outer.java']}]}
describe('authoritative source presentation',()=>{
 it('keeps a recorded throw marker through unwind but never before its applied prefix or after catch',()=>{
  const source={fileId:'Throw.java',line:2},event={...personTrace.events[0],seq:1,eventId:'recorded-throw',type:'THROW_EXCEPTION' as const,frameId:'thrower',exceptionId:'failure',className:'Failure',message:'captured',explicit:true,source}
  const trace={...personTrace,events:[personTrace.events[0],event],sourceFiles:[{fileId:source.fileId,name:'Throw.java',content:'class Throw {\n void fail() {}\n}'}]}
  const fact:RuntimeExceptionFact={eventId:event.eventId,exceptionId:event.exceptionId,className:event.className,message:event.message,explicit:true,source,frameIds:['thrower'],unwoundFrameIds:['thrower']}
  expect(exceptionSourceLocation({cursor:2,exceptions:[fact]},trace,trace.demoId)).toEqual(source)
  expect(exceptionSourceLocation({cursor:2,exceptions:[fact]},trace,'prior-recording')).toBeNull()
  expect(exceptionSourceLocation({cursor:2,exceptions:[fact]},trace,null)).toBeNull()
  expect(exceptionSourceLocation({cursor:1,exceptions:[fact]},trace,trace.demoId)).toBeNull()
  expect(exceptionSourceLocation({cursor:2,exceptions:[{...fact,caughtBy:'caller'}]},trace,trace.demoId)).toBeNull()
  expect(exceptionSourceLocation({cursor:2,exceptions:[{...fact,eventId:'another-recording'}]},trace,trace.demoId)).toBeNull()
  expect(exceptionSourceLocation({cursor:2,exceptions:[fact]},{...trace,events:[{...event,source:null}]},trace.demoId)).toBeNull()
 })
 it('does not mark a wrong, missing or out-of-range displayed file',()=>{
  const file={fileId:'Throw.java',content:'one\ntwo'}
  expect(exceptionLineForFile({fileId:file.fileId,line:2},file)).toBe(2)
  expect(exceptionLineForFile({fileId:'Other.java',line:2},file)).toBeNull()
  for(const line of [0,3,1.5])expect(exceptionLineForFile({fileId:file.fileId,line},file)).toBeNull()
  expect(exceptionLineForFile({fileId:file.fileId,line:2},undefined)).toBeNull()
 })
 it('rejects stale sessions, different tabs and dirty drafts after a verified source mapping',()=>{
  const proof={sessionId:'recording',fileId:'captured/File.java',path:'renamed/File.java',content:'captured text'}
  const tab={path:proof.path,draft:proof.content}
  expect(sourceProofFile(proof,'recording',tab)).toBe(proof)
  expect(sourceProofFile(proof,'new-attempt',tab)).toBeUndefined()
  expect(sourceProofFile(proof,'recording',{...tab,path:'different/File.java'})).toBeUndefined()
  expect(sourceProofFile(proof,'recording',{...tab,draft:'unsaved changes'})).toBeUndefined()
  expect(sourceProofFile(null,'recording',tab)).toBeUndefined()
 })
 it('maps a zero-event pause by binary class identity and captured hash',()=>{
  expect(pauseSourceLocation(pause,manifest)).toEqual({fileId:'src/pkg/Outer.java',line:2})
 })
 it('does not apply a pending attempt pause to the previous retained recording',()=>{
  const debug={sessionId:'new-run',status:'paused' as const,pause}
  expect(sourcePauseFor(debug,'prior-run')).toBeNull()
  expect(sourcePauseFor(debug,'new-run')).toBe(pause)
  expect(sourcePauseFor(debug,null)).toBe(pause)
  expect(sourcePauseFor({...debug,status:'running'},'new-run')).toBeNull()
 })
 it('keeps ambiguous, absent, mismatched and out-of-bounds pause sources unavailable',()=>{
  expect(pauseSourceLocation(pause,{...manifest,classes:[...manifest.classes,...manifest.classes]})).toBeNull()
  expect(pauseSourceLocation(pause,{...manifest,classes:[{...manifest.classes[0],status:'ambiguous'}]})).toBeNull()
  expect(pauseSourceLocation(pause,{...manifest,sources:[{...manifest.sources[0],sha256:'edited-hash'}]})).toBeNull()
  expect(pauseSourceLocation({...pause,className:'pkg.Outer.Inner'},manifest)).toBeNull()
  for(const line of [0,-1,4,1.5])expect(pauseSourceLocation({...pause,line},manifest)).toBeNull()
 })
 it('keeps Focus above the pause, including unavailable Focus; pause above cursor source',()=>{
  const focusLocation={fileId:'Focus.java',line:12},pauseLocation={fileId:'Pause.java',line:100}
  const input={hasFocus:false,focusLocation,pausedAtHead:true,pauseLocation,cursorEvent:personTrace.events[0]}
  expect(sourceLocationFor(input)).toEqual(pauseLocation)
  expect(sourceLocationFor({...input,hasFocus:true})).toEqual(focusLocation)
  expect(sourceLocationFor({...input,hasFocus:true,focusLocation:null})).toBeNull()
  expect(sourceLocationFor({...input,pauseLocation:null})).toBeNull()
 })
 it('shows only the cursor event source, never an earlier reducer source or future event',()=>{
  const input={hasFocus:false,focusLocation:null,pausedAtHead:false,pauseLocation:null,cursorEvent:personTrace.events[0]}
  expect(sourceLocationFor(input)).toEqual(personTrace.events[0].source??null)
  expect(sourceLocationFor({...input,cursorEvent:{...personTrace.events[0],source:null}})).toBeNull()
  expect(sourceLocationFor({...input,cursorEvent:null})).toBeNull()
 })
 it('retains the displayed recorded file when a later cursor has no mapped project source',()=>{
  const first={fileId:'First.java',name:'First.java',content:'first'},second={fileId:'Second.java',name:'Second.java',content:'second'}
  const trace={...personTrace,sourceFiles:[first,second]}
  expect(recordedFileFor(trace,{fileId:'Second.java',line:1})).toBe(second)
  expect(recordedFileFor(trace,null,'Second.java')).toBe(second)
  expect(recordedFileFor(trace,{fileId:'java/lang/Library.java',line:1},'Second.java')).toBe(second)
  expect(recordedFileFor({...trace,sourceFiles:[]},null,'Second.java')).toBeUndefined()
 })
})
