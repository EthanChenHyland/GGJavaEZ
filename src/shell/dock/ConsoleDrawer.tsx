import type {TraceDocument} from '../../contracts/runtime'
import type {useWorkspace} from '../../workspace/useWorkspace'
import {BoundConsoleOutput} from '../BoundConsoleOutput'
import {ConsoleInput} from '../ConsoleInput'
import {emptyConsoleInput} from '../../workspace/consoleInput'
export function ConsoleDrawer({workspace,recording}:{workspace:ReturnType<typeof useWorkspace>;recording?:TraceDocument}){
 const {visualization,runtime,execution,build,exception,handleExecutingSource,bottomOpen,tool,input,setInput,sendInput}=workspace
 return <div className="ide-console">
            <div className="ide-console-output" aria-label="Program console">
              <BoundConsoleOutput recording={recording} visualization={visualization} runtimeRecordingId={workspace.runtimeRecordingId}
                entries={runtime?.console ?? []} worldExecution={workspace.worldExecution} execution={execution} build={build} submissions={workspace.consoleInputState.submissions}/>
              {exception && <div className="ide-stack"><strong>{exception.type}: {exception.message}</strong><details><summary>Raw JVM stack trace</summary><pre>{exception.rawStackTrace}</pre></details>{exception.frames.map((frame, index) => <button key={index} disabled={!frame.location} onClick={() => frame.location && handleExecutingSource({ fileId: frame.location.path, line: frame.location.line })}>{frame.raw}</button>)}</div>}
            </div>
            <ConsoleInput execution={recording?null:execution} active={bottomOpen&&tool==='console'} value={recording?'':input} onChange={setInput} onSubmit={sendInput} state={recording?emptyConsoleInput:workspace.consoleInputState}/>
          </div>
}
