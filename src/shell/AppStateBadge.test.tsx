import {renderToStaticMarkup} from 'react-dom/server'
import {expect,it} from 'vitest'
import {deriveAppState,type AppStateInputs,type ExecutionState} from '../state/appState'
import {AppStateBadge} from './AppStateBadge'
function inputs():AppStateInputs{
 const recording={state:'FULL',reason:null,budget:null,lastRecordedSeq:null,executionContinued:false} as const
 return{session:{id:'attempt',kind:'run',phase:'RUNNING',support:'FULL',supportReason:null,failureKind:null,exitCode:null,terminalStatus:null,recording,build:null,diagnostic:null,startedAt:'2026-10-19T12:00:00Z'},sessionEventCount:8,dimensions:{attemptId:'attempt',build:'ready',instrumentation:'recording',process:'alive',recording,debugger:'inactive',input:{available:true,wait:'not-waiting'},view:{recordingId:'recording',cursor:8,liveHead:8,lens:'LIVE'}},endedAt:null,debug:null,world:{origin:'session',eventCount:8,cursor:8,lens:'LIVE'},focusTargetId:null,recordingViewer:null}
}
it('renders eight distinct glyphs from derived AppState and an indeterminate progress role only for Building',()=>{
 const states:ExecutionState[]=['EDIT','BUILDING','RUNNING','WAITING_INPUT','DEBUG_PAUSED','COMPLETED','FAILED','PARTIAL_RECORDING'],glyphs:string[]=[]
 for(const execution of states){
  const value=inputs()
  if(execution==='EDIT'){value.session=null;value.world={origin:'none',eventCount:0,cursor:0,lens:'LIVE'}}
  if(execution==='BUILDING'){value.session!.phase='BUILDING';value.dimensions.build='building'}
  if(execution==='WAITING_INPUT'){value.session!.phase='WAITING_FOR_INPUT';value.dimensions.input.wait='waiting'}
  if(execution==='DEBUG_PAUSED'){value.session!.kind='debug';value.session!.phase='PAUSED';value.dimensions.debugger='paused'}
  if(execution==='COMPLETED'){value.session!.phase='COMPLETED';value.session!.terminalStatus='complete';value.session!.exitCode=0;value.dimensions.process='ended';value.endedAt='2026-10-19T12:00:01Z'}
  if(execution==='FAILED'){value.session!.phase='FAILED';value.session!.failureKind='build';value.dimensions.build='failed'}
  if(execution==='PARTIAL_RECORDING'){value.dimensions.recording={state:'STOPPED_LIMIT',reason:'Event budget reached',budget:'events',lastRecordedSeq:8,executionContinued:true};value.session!.recording=value.dimensions.recording}
  const state=deriveAppState(value);expect(state.execution).toBe(execution)
  const html=renderToStaticMarkup(<AppStateBadge state={state} sourceChanged={false}/>);expect(html).toContain(state.label);expect(html).toContain(`data-icon="${state.icon}"`)
  expect(html.includes('role="progressbar"')).toBe(execution==='BUILDING')
  glyphs.push(html.match(/<svg\b[\s\S]*?<\/svg>/)![0].replace(/ class="[^"]*"/g,''))
 }
 expect(new Set(glyphs).size).toBe(8)
})
it('keeps the derived History/Focus label intact and shows source change separately without mutating state',()=>{
 const value=inputs();value.dimensions.view.lens='HISTORY';value.dimensions.view.cursor=3;value.world.lens='HISTORY';value.world.cursor=3;value.focusTargetId='captured-entity'
 const state=deriveAppState(value),before=JSON.stringify(state);expect(state.label).toBe('Running · History · Focus')
 const html=renderToStaticMarkup(<AppStateBadge state={state} sourceChanged={true}/>);expect(html).toContain(state.label);expect(html).toContain('<small class="shell-source-changed">Source changed since this run</small>')
 expect(renderToStaticMarkup(<AppStateBadge state={state} sourceChanged={false}/>)).not.toContain('shell-source-changed');expect(JSON.stringify(state)).toBe(before)
})
