import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ConsoleInput } from '../../../src/shell/ConsoleInput'
import { emptyConsoleInput } from '../../../src/workspace/consoleInput'
import type { ExecutionSession } from '../../../src/execution/contracts'
import '../../../src/app/base.css'
import '../../../src/shell/shell.css'
declare global {interface Window {inputFixture:{set(phase:ExecutionSession['phase'],active?:boolean):void}}}
const root=createRoot(document.getElementById('input-test')!)
let revision=0
window.inputFixture={set(phase,active=true){
  const execution:ExecutionSession={id:'isolated-session',projectId:'fixture',revision:++revision,mainClass:null,kind:'run',phase,support:'PARTIAL',supportReason:null,
    build:null,rawEvents:[],rawEventCount:0,sourceManifest:{sources:[],classes:[]},capability:null,
    recording:{state:'STOPPED_LIMIT',reason:'fixture only',budget:'events',lastRecordedSeq:null,executionContinued:true},
    stdout:'',stderr:'',runEvents:[],pause:null,breakpoints:[],terminalStatus:null,exitCode:null,diagnostic:null,failureKind:null,startedAt:''}
  flushSync(()=>root.render(<div className="shell" style={{padding:24}}><button>Manual focus probe</button>
    <div className="ide-console" style={{marginTop:24}}><ConsoleInput execution={execution} active={active} value="" onChange={()=>{}} onSubmit={()=>{}} state={emptyConsoleInput}/></div>
  </div>))
}}
window.inputFixture.set('RUNNING')
