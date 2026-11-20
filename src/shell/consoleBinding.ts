import type { ConsoleEntry, TraceDocument } from '../contracts/runtime'
import type { ExecutionSession } from '../execution/contracts'

export interface ConsoleBindingInput {
  recording?: TraceDocument
  visualization: {sessionId:string;trace:TraceDocument} | null
  runtimeRecordingId: string | null
  entries: readonly ConsoleEntry[]
  execution: ExecutionSession | null
  worldExecution: ExecutionSession | null
}
const empty: readonly ConsoleEntry[] = []

/** Compare captured identities directly. A new attempt never becomes the old
 * world's output owner; a curated recording never borrows workspace pipes. */
export function bindConsole(input: ConsoleBindingInput) {
  const trace = input.recording ?? input.visualization?.trace
  if (!trace) return {recordingId:null,recorded:false,historical:false,entries:empty,session:input.execution,pending:null}
  const sessionId = input.recording ? null : input.visualization!.sessionId
  const session = sessionId === input.execution?.id ? input.execution
    : sessionId === input.worldExecution?.id ? input.worldExecution : null
  const pending = !input.recording && input.execution && input.execution.id !== sessionId ? input.execution : null
  return {recordingId:trace.demoId,recorded:true,historical:!!pending,
    entries:input.runtimeRecordingId === trace.demoId ? input.entries : empty,session,pending}
}
