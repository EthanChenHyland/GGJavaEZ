import { describe,expect,it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ExecutionSession } from '../execution/contracts'
import { emptyConsoleInput } from '../workspace/consoleInput'
import { ConsoleInput,ConsoleSubmissions } from './ConsoleInput'
const session=(phase:ExecutionSession['phase']):ExecutionSession=>({
  id:'session',projectId:'project',revision:1,mainClass:'Main',kind:'run',phase,support:'PARTIAL',supportReason:null,
  rawEvents:[],rawEventCount:0,build:null,sourceManifest:{sources:[],classes:[]},capability:null,
  recording:{state:'STOPPED_LIMIT',reason:'events',budget:'events',lastRecordedSeq:null,executionContinued:true},
  stdout:'',stderr:'',runEvents:[],pause:null,breakpoints:[],terminalStatus:null,exitCode:null,diagnostic:null,failureKind:null,startedAt:'',
})
const render=(execution:ExecutionSession|null)=>renderToStaticMarkup(<ConsoleInput execution={execution} active value="kept" onChange={()=>{}} onSubmit={()=>{}} state={emptyConsoleInput}/>)
describe('Console input evidence presentation',()=>{
  it('shows actual wait independently of stopped recording and zero recorded events',()=>{
    const html=render(session('WAITING_FOR_INPUT'));expect(html).toContain('Program is waiting for input');expect(html).not.toContain('disabled')
  })
  it('declares unknown wait knowledge while preserving live stdin availability',()=>{
    const html=render(session('RUNNING'));expect(html).toContain('Input wait status unknown');expect(html).not.toContain('disabled')
    expect(html).not.toContain('Program is waiting for input')
  })
  it('keeps the draft and states known termination',()=>{
    const html=render(session('COMPLETED'));expect(html).toContain('Program is not accepting input');expect(html).toContain('value="kept"');expect(html).toContain('disabled')
  })
  it('renders only the actual session’s submission text with separately qualified ordering',()=>{
    const html=renderToStaticMarkup(<ConsoleSubmissions sessionId="session" submissions={[
      {key:'1',sessionId:'other',text:'foreign'}, {key:'2',sessionId:'session',text:' & <literal> \n'},
    ]}/>);expect(html).not.toContain('foreign');expect(html).toContain(' &amp; &lt;literal&gt; ')
    expect(html).toContain('submission order; consumption is shown by recorded events')
  })
})
