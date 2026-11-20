import {useMemo} from 'react'
import type {TraceDocument} from '../../contracts/runtime'
import type {useWorkspace} from '../../workspace/useWorkspace'
import {bindConsole} from '../consoleBinding'
import {useConsoleRowCount} from '../consolePresentation'
/** Counts are derived from the same recording/session bindings and list guards
 * as the drawers; opening a drawer is never necessary to update its badge. */
export function useDockCounts(workspace:ReturnType<typeof useWorkspace>,recording?:TraceDocument){
 const binding=bindConsole({recording,visualization:workspace.visualization,runtimeRecordingId:workspace.runtimeRecordingId,entries:workspace.runtime?.console??[],execution:workspace.execution,worldExecution:workspace.worldExecution})
 const main=useConsoleRowCount({build:binding.pending||recording?null:workspace.build,execution:binding.session,hasRecording:binding.recorded,entries:binding.entries})
 const pending=useConsoleRowCount({build:binding.pending?workspace.build:null,execution:binding.pending,hasRecording:false,entries:[]})
 const session=workspace.debugSession,inspection=session?.status==='paused'&&session.pause&&workspace.debugInspection?.sessionId===session.sessionId?workspace.debugInspection:null
 const trace=recording??(workspace.recordingIsCurrent?workspace.visualization?.trace:undefined)
 const events=trace?.events,eventCount=events?.length??0
 const recordedExceptions=useMemo(()=>events?.reduce((count,event)=>count+Number(event.type==='THROW_EXCEPTION'),0)??0,[events,eventCount])
 return{console:main+pending,problems:workspace.problems.length,debugger:workspace.displayedBreakpoints.length+(inspection?.stack.length??0)+(inspection?.variables.length??0),errors:trace?recordedExceptions:Number(!!workspace.exception)}
}
