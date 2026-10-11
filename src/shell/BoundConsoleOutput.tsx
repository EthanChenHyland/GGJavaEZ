import type { BuildResult } from '../ide/contracts'
import { bindConsole, type ConsoleBindingInput } from './consoleBinding'
import { ConsoleOutput } from './ConsoleOutput'
import { ConsoleSubmissions } from './ConsoleInput'
import type { ConsoleSubmission } from '../workspace/consoleInput'

export function BoundConsoleOutput({build,submissions=[],...input}:ConsoleBindingInput & {build:BuildResult|null;submissions?:readonly ConsoleSubmission[]}) {
  const binding = bindConsole(input)
  return <>
    <section data-console-recording={binding.recordingId ?? undefined} data-console-session={binding.session?.id} aria-label={binding.historical?'Previous run console':'Current console'}>
      {binding.historical && <p className="console-order-note">Previous run console · recorded output follows the timeline</p>}
      <ConsoleOutput key={binding.recordingId ?? binding.session?.id} build={binding.pending||input.recording?null:build}
        execution={binding.session} hasRecording={binding.recorded} entries={binding.entries}/>
      {binding.session&&<ConsoleSubmissions submissions={submissions} sessionId={binding.session.id}/>}
    </section>
    {binding.pending && <section data-console-session={binding.pending.id} aria-label="Current attempt console">
      <p className="console-order-note">Current attempt · {binding.pending.phase.toLowerCase().replaceAll('_',' ')}</p>
      <ConsoleOutput key={binding.pending.id} build={build} execution={binding.pending} hasRecording={false} entries={[]}/>
      <ConsoleSubmissions submissions={submissions} sessionId={binding.pending.id}/>
    </section>}
  </>
}
