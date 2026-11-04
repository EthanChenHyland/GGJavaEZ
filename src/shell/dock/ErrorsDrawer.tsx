import type {SourceLocation,TraceDocument} from '../../contracts/runtime'
import type {useWorkspace} from '../../workspace/useWorkspace'
import {ErrorExplorer} from '../../debugger/ErrorExplorer'
import {interactionStore} from '../../interaction/interactionStore'
export function ErrorsDrawer({workspace,recording,onRevealSource}:{workspace:ReturnType<typeof useWorkspace>;recording?:TraceDocument;onRevealSource:(location:SourceLocation)=>void}){
 const {visualization,runtime,runtimeRecordingId,runtimeSelection,execution,exception,recordingIsCurrent,navigateRuntime}=workspace
 const trace=recording??(recordingIsCurrent?visualization?.trace:undefined)
 const currentRuntime=trace?.demoId===runtimeRecordingId?runtime:null
 return trace?<ErrorExplorer key={trace.demoId} trace={trace} runtime={currentRuntime} selection={runtimeSelection} stderr={recording?'':execution?.stderr??''} onNavigate={navigateRuntime} onRevealSource={onRevealSource} onSelectFrame={id=>{if(currentRuntime?.frames[id])interactionStore.getState().select({kind:'frame',id})}}/>:<div className="debug-empty">{exception?<><strong>{exception.type}: {exception.message}</strong><pre>{exception.rawStackTrace}</pre></>:<p>No recorded exception.</p>}</div>
}
