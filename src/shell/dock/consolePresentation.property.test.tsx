import fc from 'fast-check'
import {expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {ConsoleLineIndex,type ConsoleChunk} from '../consoleLineIndex'
import {ConsoleOutput} from '../ConsoleOutput'
import {ConsoleRowCounter,useConsoleRowCount,type ConsolePresentationInput} from '../consolePresentation'
import type {ExecutionSession} from '../../execution/contracts'
const chunk=fc.record({key:fc.string({maxLength:8}),channel:fc.constantFrom('stdout','stderr','stdin','exit') as fc.Arbitrary<ConsoleChunk['channel']>,text:fc.array(fc.constantFrom('a','\n','\r','😀',' ',''),{maxLength:40}).map(parts=>parts.join(''))})
it('Console badge matches canonical line indexing through append, rewind, replacement and channel boundaries',()=>{
 fc.assert(fc.property(fc.array(chunk,{maxLength:20}),fc.array(chunk,{maxLength:10}),(chunks,replacement)=>{
  const count=new ConsoleRowCounter(),index=new ConsoleLineIndex()
  const prefixes=Array.from({length:chunks.length+1},(_,i)=>chunks.slice(0,i))
  for(const value of [...prefixes,...prefixes.slice().reverse(),replacement,[],chunks])expect(count.update(value)).toBe(index.update(value))
 }),{numRuns:200})
})
it('counts a million rows and scans only the growing pipe suffix',()=>{
 const count=new ConsoleRowCounter(),text='row\n'.repeat(1000000)
 expect(count.update([{key:'pipe',channel:'stdout',text}])).toBe(1000000)
 expect(count.update([{key:'pipe',channel:'stdout',text:text+'tail'}])).toBe(1000001);expect(count.scannedCharacters).toBe(4)
 expect(count.update([{key:'pipe',channel:'stdout',text:text+'tail'}])).toBe(1000001);expect(count.scannedCharacters).toBe(0)
 expect(count.update([])).toBe(0)
})
const session=(changes:Partial<ExecutionSession>={}):ExecutionSession=>({id:'session',revision:1,projectId:'project',mainClass:'Main',kind:'run',phase:'COMPLETED',support:'FULL',supportReason:null,build:null,rawEvents:[],sourceManifest:{sources:[],classes:[]},capability:null,stdout:'same\n',stderr:'same\n',runEvents:[],pause:null,breakpoints:[],terminalStatus:'complete',exitCode:0,diagnostic:null,failureKind:null,startedAt:'2026-10-20T00:00:00Z',...changes})
function Count(props:ConsolePresentationInput){return <output>{useConsoleRowCount(props)}</output>}
it('counts exactly the renderer’s output groups across recorded, partial, ordered, build and empty states',()=>{
 const entries:ConsolePresentationInput['entries']=[{eventId:'e1',frameId:null,source:null,kind:'output',channel:'stdout',text:'recorded\nsecond',value:{kind:'stringSummary',javaType:'String',value:'recorded\nsecond'}}]
 for(const hasRecording of [false,true])for(const execution of [null,session(),session({runEvents:[{id:1,kind:'stdout',text:'ordered\n'}]}),session({failureKind:'build'}),session({recording:{state:'STOPPED_LIMIT',reason:'limit',budget:'events',lastRecordedSeq:7,executionContinued:true}})])for(const build of [null,{success:false,rawOutput:'actual compiler\nsecond line',diagnostics:[],elapsedMs:1,jdk:{available:true,version:'actual',home:null,javaPath:null,javacPath:null,error:null},mainClasses:[]}]){
  const props={hasRecording,execution,build,entries},html=renderToStaticMarkup(<ConsoleOutput {...props}/>),counts=Array.from(html.matchAll(/<span>([\d,]+) rows<\/span>/g),match=>Number(match[1].replaceAll(',','')))
  const expected=counts.reduce((sum,value)=>sum+value,0)
  expect(renderToStaticMarkup(<Count {...props}/>)).toBe(`<output>${expected}</output>`)
 }
})
