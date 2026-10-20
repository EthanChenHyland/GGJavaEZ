import type {TraceDocument} from '../../contracts/runtime'
import type {useWorkspace} from '../../workspace/useWorkspace'
import {ErrorExplorer} from '../../debugger/ErrorExplorer'
export function ErrorsDrawer({workspace,recording}:{workspace:ReturnType<typeof useWorkspace>;recording?:TraceDocument}){
 const {visualization,runtime,runtimeSelection,execution,exception,recordingIsCurrent,navigateRuntime}=workspace
 const trace=recording??(recordingIsCurrent?visualization?.trace:undefined)
 return trace?<ErrorExplorer key={trace.demoId} trace={trace} runtime={runtime} selection={runtimeSelection} stderr={recording?'':execution?.stderr??''} onNavigate={navigateRuntime}/>:<div className="debug-empty">{exception?<><strong>{exception.type}: {exception.message}</strong><pre>{exception.rawStackTrace}</pre></>:<p>No recorded exception.</p>}</div>
}
